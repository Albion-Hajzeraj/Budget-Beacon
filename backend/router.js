const { URL } = require("url");
const path = require("path");
const { state, persistState, getUserState, buildUserState } = require("./lib/state");
const { sendJson, serveStatic, isStaticRequest, parseBody } = require("./lib/http");
const {
  normalizeEmail,
  normalizeName,
  hashPassword,
  verifyPassword,
  issueSession,
  getAuthToken,
  requireAuth,
} = require("./lib/auth");
const {
  normalizeSettings,
  normalizeAmount,
  addTransaction,
  getDashboardSummary,
  buildInsights,
  buildForecast,
  buildAnomalies,
  buildAutoInsights,
  buildTimeline,
} = require("./lib/finance");
const { parseTransactionText } = require("./lib/nlp");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

async function handler(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "budget-beacon-api" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/signup") {
    const body = await parseBody(req);
    const email = normalizeEmail(body.email);
    const name = normalizeName(body.name);
    const password = String(body.password || "");
    if (!email || !password || password.length < 6) {
      sendJson(res, 400, { error: "Signup requires a valid email and password (6+ chars)." });
      return;
    }
    if (state.users.some((u) => u.email === email)) {
      sendJson(res, 409, { error: "Email already registered." });
      return;
    }
    const { hash, salt } = hashPassword(password);
    const user = {
      id: state.nextUserId++,
      email,
      name: name || email.split("@")[0],
      passwordHash: hash,
      passwordSalt: salt,
      data: buildUserState(),
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
    const token = issueSession(user.id);
    await persistState();
    sendJson(res, 201, { token, user: { id: user.id, email: user.email, name: user.name } });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/login") {
    const body = await parseBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    if (!email || !password) {
      sendJson(res, 400, { error: "Login requires email and password." });
      return;
    }
    const user = state.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }
    const token = issueSession(user.id);
    await persistState();
    sendJson(res, 200, { token, user: { id: user.id, email: user.email, name: user.name } });
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const token = getAuthToken(req);
    if (token) {
      state.sessions = state.sessions.filter((s) => s.token !== token);
      await persistState();
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/auth/me") {
    const user = requireAuth(req, res, sendJson);
    if (!user) return;
    sendJson(res, 200, { user: { id: user.id, email: user.email, name: user.name } });
    return;
  }

  const authFree = url.pathname === "/health" || url.pathname.startsWith("/auth/") || isStaticRequest(req, url);
  let currentUser = null;
  if (!authFree) {
    currentUser = requireAuth(req, res, sendJson);
    if (!currentUser) return;
  }

  if (req.method === "GET" && url.pathname === "/settings") {
    const userState = getUserState(currentUser);
    sendJson(res, 200, { settings: userState.settings });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/settings") {
    const body = await parseBody(req);
    const userState = getUserState(currentUser);
    const nextSettings = {
      ...userState.settings,
      ...body,
    };
    userState.settings = normalizeSettings(nextSettings);
    await persistState();
    sendJson(res, 200, { settings: userState.settings });
    return;
  }

  if (req.method === "GET" && url.pathname === "/transactions") {
    const userState = getUserState(currentUser);
    const transactions = [...userState.transactions].sort((a, b) => b.date.localeCompare(a.date));
    sendJson(res, 200, { transactions });
    return;
  }

  if (req.method === "POST" && url.pathname === "/transactions/import") {
    const body = await parseBody(req);
    const userState = getUserState(currentUser);
    const source = String(body.source || "import");
    const incoming = Array.isArray(body.transactions) ? body.transactions : [];
    const imported = [];
    const rejected = [];

    for (const tx of incoming) {
      const built = addTransaction(userState, { ...tx, source });
      if (built) imported.push(built);
      else rejected.push(tx);
    }
    if (imported.length > 0) {
      await persistState();
    }

    sendJson(res, 200, {
      importedCount: imported.length,
      rejectedCount: rejected.length,
      imported,
      rejected,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/transactions") {
    const body = await parseBody(req);
    const userState = getUserState(currentUser);
    const built = addTransaction(userState, { ...body, source: body.source || "manual" });
    if (!built) {
      sendJson(res, 400, {
        error: "Invalid transaction. Required: description, amount, and valid date (if provided).",
      });
      return;
    }
    await persistState();
    sendJson(res, 201, { transaction: built });
    return;
  }

  if (req.method === "POST" && url.pathname === "/transactions/nlp") {
    const body = await parseBody(req);
    const userState = getUserState(currentUser);
    const text = String(body.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Text is required." });
      return;
    }
    const parsed = parseTransactionText(text);
    if (!parsed) {
      sendJson(res, 400, { error: "Could not parse transaction text." });
      return;
    }
    const built = addTransaction(userState, { ...parsed, source: "nlp" });
    await persistState();
    sendJson(res, 201, { transaction: built, parsed });
    return;
  }

  const goalFundMatch = url.pathname.match(/^\/goals\/(\d+)\/fund$/);
  if (req.method === "PATCH" && goalFundMatch) {
    const goalId = Number(goalFundMatch[1]);
    const body = await parseBody(req);
    const userState = getUserState(currentUser);
    const amount = normalizeAmount(body.amount);
    if (amount === null || amount <= 0) {
      sendJson(res, 400, { error: "Fund amount must be a positive number." });
      return;
    }
    const goal = userState.goals.find((g) => g.id === goalId);
    if (!goal) {
      sendJson(res, 404, { error: "Goal not found." });
      return;
    }
    goal.currentAmount = Number((goal.currentAmount + amount).toFixed(2));
    await persistState();
    sendJson(res, 200, { goal });
    return;
  }

  if (req.method === "GET" && url.pathname === "/goals") {
    const userState = getUserState(currentUser);
    sendJson(res, 200, { goals: userState.goals });
    return;
  }

  if (req.method === "POST" && url.pathname === "/goals") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const targetAmount = Number(body.targetAmount);
    const currentAmount = Number(body.currentAmount || 0);
    const userState = getUserState(currentUser);

    if (!name || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) {
      sendJson(res, 400, {
        error: "Invalid goal. Required: name, targetAmount > 0, currentAmount >= 0.",
      });
      return;
    }

    const goal = {
      id: userState.nextGoalId++,
      name,
      targetAmount: Number(targetAmount.toFixed(2)),
      currentAmount: Number(currentAmount.toFixed(2)),
      deadline: body.deadline || null,
      createdAt: new Date().toISOString(),
    };

    userState.goals.push(goal);
    await persistState();
    sendJson(res, 201, { goal });
    return;
  }

  if (req.method === "GET" && url.pathname === "/dashboard") {
    const userState = getUserState(currentUser);
    const summary = getDashboardSummary(userState);
    sendJson(res, 200, summary);
    return;
  }

  if (req.method === "GET" && url.pathname === "/insights") {
    const userState = getUserState(currentUser);
    const summary = getDashboardSummary(userState);
    const insights = buildInsights(summary);
    const autoInsights = buildAutoInsights(userState);
    sendJson(res, 200, { generatedAt: new Date().toISOString(), insights, autoInsights, summary });
    return;
  }

  if (req.method === "GET" && url.pathname === "/forecast") {
    const userState = getUserState(currentUser);
    const forecast = buildForecast(userState);
    sendJson(res, 200, forecast);
    return;
  }

  if (req.method === "GET" && url.pathname === "/anomalies") {
    const userState = getUserState(currentUser);
    const payload = buildAnomalies(userState);
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/timeline") {
    const userState = getUserState(currentUser);
    const months = Number(url.searchParams.get("months") || 12);
    const timeline = buildTimeline(userState, months);
    sendJson(res, 200, { months: timeline });
    return;
  }

  if (req.method === "GET") {
    const served = await serveStatic(url.pathname, res, FRONTEND_DIR);
    if (served) return;
  }

  sendJson(res, 404, { error: "Route not found" });
}

module.exports = { handler };
