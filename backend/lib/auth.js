const crypto = require("crypto");
const { state, ensureUserState } = require("./state");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

function normalizeName(value) {
  const name = String(value || "").trim();
  return name.length ? name : null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const computed = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== computed.length) return false;
  return crypto.timingSafeEqual(expected, computed);
}

function issueSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
  };
  state.sessions.push(session);
  return token;
}

function getAuthToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getSessionByToken(token) {
  if (!token) return null;
  return state.sessions.find((s) => s.token === token) || null;
}

function requireAuth(req, res, sendJson) {
  const token = getAuthToken(req);
  const session = getSessionByToken(token);
  if (!session) {
    sendJson(res, 401, { error: "Authentication required." });
    return null;
  }
  const user = state.users.find((u) => u.id === session.userId) || null;
  if (!user) {
    sendJson(res, 401, { error: "Invalid session." });
    return null;
  }
  ensureUserState(user);
  return user;
}

module.exports = {
  normalizeEmail,
  normalizeName,
  hashPassword,
  verifyPassword,
  issueSession,
  getAuthToken,
  requireAuth,
};
