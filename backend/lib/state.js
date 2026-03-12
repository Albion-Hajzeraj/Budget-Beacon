const fs = require("fs/promises");
const path = require("path");
const { normalizeSettings } = require("./settings");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_USER_STATE = {
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

const DEFAULT_STATE = {
  users: [],
  nextUserId: 1,
  sessions: [],
};

const state = { ...DEFAULT_STATE };

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function loadState() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state.users = Array.isArray(parsed.users) ? parsed.users : [];
    state.nextUserId = Number.isInteger(parsed.nextUserId) ? parsed.nextUserId : 1;
    state.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
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

function buildUserState(existing = {}) {
  return {
    transactions: Array.isArray(existing.transactions) ? existing.transactions : [],
    goals: Array.isArray(existing.goals) ? existing.goals : [],
    nextTransactionId: Number.isInteger(existing.nextTransactionId) ? existing.nextTransactionId : 1,
    nextGoalId: Number.isInteger(existing.nextGoalId) ? existing.nextGoalId : 1,
    settings: normalizeSettings(existing.settings || DEFAULT_USER_STATE.settings),
  };
}

function ensureUserState(user) {
  if (!user.data) {
    user.data = buildUserState();
    return;
  }
  user.data = buildUserState(user.data);
}

function getUserState(user) {
  ensureUserState(user);
  return user.data;
}

module.exports = {
  DATA_DIR,
  STORE_FILE,
  state,
  loadState,
  persistState,
  buildUserState,
  ensureUserState,
  getUserState,
};
