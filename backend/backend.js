const http = require("http");
const { URL } = require("url");
const fs = require("fs/promises");
const path = require("path");

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DEFAULT_STATE = {
  transactions: [],
  goals: [],
  nextTransactionId: 1,
  nextGoalId: 1,
  settings: {
    baseCheckingBalance: 4500,
    baseSavingsBalance: 0,
    monthlyBudget: 3000,
  },
};

const state = { ...DEFAULT_STATE };

const categoryRules = [
  { keywords: ["uber", "lyft", "taxi", "metro", "bus", "train", "fuel", "gas"], category: "Transport" },
  { keywords: ["walmart", "target", "aldi", "whole foods", "grocery", "supermarket"], category: "Groceries" },
  { keywords: ["netflix", "spotify", "hulu", "prime video", "disney+"], category: "Entertainment" },
  { keywords: ["rent", "mortgage", "landlord", "hoa"], category: "Housing" },
  { keywords: ["electric", "water bill", "internet", "phone bill", "utility"], category: "Utilities" },
  { keywords: ["salary", "payroll", "invoice paid", "freelance", "bonus"], category: "Income" },
  { keywords: ["pharmacy", "hospital", "clinic", "doctor"], category: "Health" },
  { keywords: ["coffee", "restaurant", "mcdonald", "starbucks", "doordash", "uber eats"], category: "Dining" },
];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, statusCode, body, contentType) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

async function serveStatic(urlPath, res) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const target = path.normalize(path.join(FRONTEND_DIR, cleanPath));
  if (!target.startsWith(FRONTEND_DIR)) {
    sendFile(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return true;
  }

  try {
    const file = await fs.readFile(target);
    const ext = path.extname(target).toLowerCase();
    const mimeByExt = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".ico": "image/x-icon",
    };
    sendFile(res, 200, file, mimeByExt[ext] || "application/octet-stream");
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function normalizeSettings(input = {}) {
  const baseCheckingBalance = normalizeAmount(input.baseCheckingBalance);
  const baseSavingsBalance = normalizeAmount(input.baseSavingsBalance);
  const monthlyBudget = normalizeAmount(input.monthlyBudget);
  return {
    baseCheckingBalance: baseCheckingBalance === null ? 4500 : baseCheckingBalance,
    baseSavingsBalance: baseSavingsBalance === null ? 0 : Math.max(0, baseSavingsBalance),
    monthlyBudget: monthlyBudget === null ? 3000 : Math.max(0, monthlyBudget),
  };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadState() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    state.goals = Array.isArray(parsed.goals) ? parsed.goals : [];
    state.nextTransactionId = Number.isInteger(parsed.nextTransactionId) ? parsed.nextTransactionId : 1;
    state.nextGoalId = Number.isInteger(parsed.nextGoalId) ? parsed.nextGoalId : 1;
    state.settings = normalizeSettings(parsed.settings);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    await persistState();
  }
}

let writeChain = Promise.resolve();
function persistState() {
  writeChain = writeChain.then(async () => {
    await ensureDataDir();
    const payload = JSON.stringify(state, null, 2);
    await fs.writeFile(STORE_FILE, payload, "utf8");
  });
  return writeChain;
}

function categorize(description, amount) {
  const text = String(description || "").toLowerCase();
  for (const rule of categoryRules) {
    if (rule.keywords.some((word) => text.includes(word))) {
      return rule.category;
    }
  }
  if (amount >= 0) return "Income";
  return "Other";
}

function addTransaction(tx) {
  const amount = normalizeAmount(tx.amount);
  if (amount === null) return null;

  const date = tx.date ? new Date(tx.date) : new Date();
  if (Number.isNaN(date.getTime())) return null;

  const description = String(tx.description || "").trim();
  if (!description) return null;

  const category = tx.category || categorize(description, amount);
  const direction = amount >= 0 ? "income" : "expense";
  const account = ["checking", "savings", "credit"].includes(tx.account) ? tx.account : "checking";

  const built = {
    id: state.nextTransactionId++,
    date: date.toISOString().slice(0, 10),
    description,
    amount,
    direction,
    category,
    account,
    source: tx.source || "manual",
    createdAt: new Date().toISOString(),
  };

  state.transactions.push(built);
  return built;
}

function getDashboardSummary() {
  const income = state.transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = state.transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  const goalAllocated = state.goals.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);

  let checkingDelta = 0;
  let savingsDelta = 0;
  let creditUsed = 0;

  for (const tx of state.transactions) {
    const account = tx.account || "checking";
    if (account === "checking") checkingDelta += tx.amount;
    if (account === "savings") savingsDelta += tx.amount;
    if (account === "credit") creditUsed += -tx.amount;
  }
  creditUsed = Math.max(0, creditUsed);

  const checkingBalance = state.settings.baseCheckingBalance + checkingDelta - goalAllocated;
  const savingsBalance = state.settings.baseSavingsBalance + savingsDelta + goalAllocated;
  const availableBalance = checkingBalance;
  const netWorth = checkingBalance + savingsBalance - creditUsed;
  const budgetRemaining = state.settings.monthlyBudget - expenses;

  const byCategory = {};
  for (const tx of state.transactions) {
    if (tx.amount >= 0) continue;
    byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount);
  }

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));

  const goals = state.goals.map((g) => {
    const progress = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progressPct: Number(Math.min(progress, 100).toFixed(1)),
    };
  });

  return {
    totals: {
      income: Number(income.toFixed(2)),
      expenses: Number(expenses.toFixed(2)),
      net: Number(net.toFixed(2)),
      savingsRatePct: Number(savingsRate.toFixed(1)),
    },
    balances: {
      available: Number(availableBalance.toFixed(2)),
      checking: Number(checkingBalance.toFixed(2)),
      savings: Number(savingsBalance.toFixed(2)),
      creditUsed: Number(creditUsed.toFixed(2)),
      netWorth: Number(netWorth.toFixed(2)),
    },
    budget: {
      monthlyBudget: Number(state.settings.monthlyBudget.toFixed(2)),
      remaining: Number(budgetRemaining.toFixed(2)),
    },
    settings: state.settings,
    topCategories,
    goals,
    transactionCount: state.transactions.length,
  };
}

function buildInsights(summary) {
  const insights = [];
  const { totals, topCategories, goals } = summary;

  if (totals.expenses > totals.income && totals.income > 0) {
    insights.push("You spent more than you earned. Reduce variable spending this week.");
  }
  if (totals.savingsRatePct >= 20) {
    insights.push("Strong month so far: your savings rate is above 20%.");
  } else if (totals.income > 0) {
    insights.push("Aim for at least a 20% savings rate by trimming one recurring expense.");
  }
  if (topCategories.length > 0) {
    const first = topCategories[0];
    insights.push(`Your highest expense category is ${first.category} at $${first.total.toFixed(2)}.`);
  }
  for (const goal of goals) {
    if (goal.progressPct >= 100) {
      insights.push(`Goal complete: "${goal.name}". Time to set your next target.`);
    } else if (goal.progressPct >= 70) {
      insights.push(`Goal "${goal.name}" is ${goal.progressPct}% complete. Keep the same pace.`);
    }
  }
  if (insights.length === 0) {
    insights.push("Add more transactions to unlock personalized insights.");
  }
  return insights;
}

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

  if (req.method === "GET" && url.pathname === "/settings") {
    sendJson(res, 200, { settings: state.settings });
    return;
  }

  if (req.method === "PATCH" && url.pathname === "/settings") {
    const body = await parseBody(req);
    const nextSettings = {
      ...state.settings,
      ...body,
    };
    state.settings = normalizeSettings(nextSettings);
    await persistState();
    sendJson(res, 200, { settings: state.settings });
    return;
  }

  if (req.method === "GET" && url.pathname === "/transactions") {
    const transactions = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
    sendJson(res, 200, { transactions });
    return;
  }

  if (req.method === "POST" && url.pathname === "/transactions/import") {
    const body = await parseBody(req);
    const source = String(body.source || "import");
    const incoming = Array.isArray(body.transactions) ? body.transactions : [];
    const imported = [];
    const rejected = [];

    for (const tx of incoming) {
      const built = addTransaction({ ...tx, source });
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
    const built = addTransaction({ ...body, source: body.source || "manual" });
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

  const goalFundMatch = url.pathname.match(/^\/goals\/(\d+)\/fund$/);
  if (req.method === "PATCH" && goalFundMatch) {
    const goalId = Number(goalFundMatch[1]);
    const body = await parseBody(req);
    const amount = normalizeAmount(body.amount);
    if (amount === null || amount <= 0) {
      sendJson(res, 400, { error: "Fund amount must be a positive number." });
      return;
    }
    const goal = state.goals.find((g) => g.id === goalId);
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
    sendJson(res, 200, { goals: state.goals });
    return;
  }

  if (req.method === "POST" && url.pathname === "/goals") {
    const body = await parseBody(req);
    const name = String(body.name || "").trim();
    const targetAmount = normalizeAmount(body.targetAmount);
    const currentAmount = normalizeAmount(body.currentAmount || 0);

    if (!name || targetAmount === null || targetAmount <= 0 || currentAmount === null || currentAmount < 0) {
      sendJson(res, 400, {
        error: "Invalid goal. Required: name, targetAmount > 0, currentAmount >= 0.",
      });
      return;
    }

    const goal = {
      id: state.nextGoalId++,
      name,
      targetAmount,
      currentAmount,
      deadline: body.deadline || null,
      createdAt: new Date().toISOString(),
    };

    state.goals.push(goal);
    await persistState();
    sendJson(res, 201, { goal });
    return;
  }

  if (req.method === "GET" && url.pathname === "/dashboard") {
    const summary = getDashboardSummary();
    sendJson(res, 200, summary);
    return;
  }

  if (req.method === "GET" && url.pathname === "/insights") {
    const summary = getDashboardSummary();
    const insights = buildInsights(summary);
    sendJson(res, 200, { generatedAt: new Date().toISOString(), insights, summary });
    return;
  }

  if (req.method === "GET") {
    const served = await serveStatic(url.pathname, res);
    if (served) return;
  }

  sendJson(res, 404, { error: "Route not found" });
}

async function start() {
  await loadState();

  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => {
      sendJson(res, 500, { error: err.message || "Internal server error" });
    });
  });

  server.listen(PORT, () => {
    console.log(`BudgetBeacon API listening on http://localhost:${PORT}`);
    console.log(`Data file: ${STORE_FILE}`);
  });
}

start().catch((err) => {
  console.error("Failed to start BudgetBeacon API:", err);
  process.exit(1);
});
