const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 4000;

const state = {
  transactions: [],
  goals: [],
  nextTransactionId: 1,
  nextGoalId: 1,
};

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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
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

  const built = {
    id: state.nextTransactionId++,
    date: date.toISOString().slice(0, 10),
    description,
    amount,
    direction,
    category,
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
    sendJson(res, 201, { transaction: built });
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

  sendJson(res, 404, { error: "Route not found" });
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((err) => {
    sendJson(res, 500, { error: err.message || "Internal server error" });
  });
});

server.listen(PORT, () => {
  console.log(`BudgetBeacon API listening on http://localhost:${PORT}`);
});
