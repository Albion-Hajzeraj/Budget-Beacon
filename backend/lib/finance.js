const { normalizeSettings } = require("./settings");

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

function addTransaction(userState, tx) {
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
    id: userState.nextTransactionId++,
    date: date.toISOString().slice(0, 10),
    description,
    amount,
    direction,
    category,
    account,
    source: tx.source || "manual",
    createdAt: new Date().toISOString(),
  };

  userState.transactions.push(built);
  return built;
}

function getDashboardSummary(userState) {
  const income = userState.transactions
    .filter((t) => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = userState.transactions
    .filter((t) => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;
  const goalAllocated = userState.goals.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);

  let checkingDelta = 0;
  let savingsDelta = 0;
  let creditUsed = 0;

  for (const tx of userState.transactions) {
    const account = tx.account || "checking";
    if (account === "checking") checkingDelta += tx.amount;
    if (account === "savings") savingsDelta += tx.amount;
    if (account === "credit") creditUsed += -tx.amount;
  }
  creditUsed = Math.max(0, creditUsed);

  const checkingBalance = userState.settings.baseCheckingBalance + checkingDelta - goalAllocated;
  const savingsBalance = userState.settings.baseSavingsBalance + savingsDelta + goalAllocated;
  const availableBalance = checkingBalance;
  const netWorth = checkingBalance + savingsBalance - creditUsed;
  const budgetRemaining = userState.settings.monthlyBudget - expenses;

  const byCategory = {};
  for (const tx of userState.transactions) {
    if (tx.amount >= 0) continue;
    byCategory[tx.category] = (byCategory[tx.category] || 0) + Math.abs(tx.amount);
  }

  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));

  const goals = userState.goals.map((g) => {
    const progress = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0;
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progressPct: Number(Math.min(progress, 100).toFixed(1)),
    };
  });

  const summary = {
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
      monthlyBudget: Number(userState.settings.monthlyBudget.toFixed(2)),
      remaining: Number(budgetRemaining.toFixed(2)),
    },
    settings: userState.settings,
    topCategories,
    goals,
    transactionCount: userState.transactions.length,
  };
  summary.healthScore = buildHealthScore(summary);
  return summary;
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

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}

function buildHealthScore(summary) {
  const income = Number(summary.totals?.income || 0);
  const expenses = Number(summary.totals?.expenses || 0);
  const net = Number(summary.totals?.net || 0);
  const budget = Number(summary.budget?.monthlyBudget || 0);
  const remaining = Number(summary.budget?.remaining || 0);

  const savingsRate = income > 0 ? net / income : 0;
  const expenseRatio = income > 0 ? expenses / income : 1;

  const savingsScore = clampScore((savingsRate / 0.2) * 100);
  const budgetScore = budget > 0 ? clampScore((remaining / budget) * 100) : 50;
  const expenseScore = clampScore((1 - expenseRatio) * 100);

  const weighted = savingsScore * 0.4 + budgetScore * 0.3 + expenseScore * 0.3;
  const score = Math.round(clampScore(weighted));

  return {
    score,
    breakdown: [
      {
        label: "Savings rate",
        weight: 40,
        value: Number((savingsRate * 100).toFixed(1)),
        score: Number(savingsScore.toFixed(1)),
        note:
          income > 0
            ? "Net income as a share of total income (target 20%+)."
            : "No income yet, savings rate not available.",
      },
      {
        label: "Budget adherence",
        weight: 30,
        value: budget > 0 ? Number(((remaining / budget) * 100).toFixed(1)) : 0,
        score: Number(budgetScore.toFixed(1)),
        note: budget > 0 ? "How much of your monthly budget remains." : "No budget set yet.",
      },
      {
        label: "Expense-to-income",
        weight: 30,
        value: income > 0 ? Number((expenseRatio * 100).toFixed(1)) : 100,
        score: Number(expenseScore.toFixed(1)),
        note: income > 0 ? "Lower expense ratio improves score." : "No income yet, using default.",
      },
    ],
  };
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function normalizeForecastItems(items) {
  return items
    .filter((item) => item.total > 0)
    .sort((a, b) => b.projected - a.projected)
    .map((item) => ({
      category: item.category,
      spentToDate: Number(item.total.toFixed(2)),
      projected: Number(item.projected.toFixed(2)),
      dailyAverage: Number(item.dailyAverage.toFixed(2)),
    }));
}

function buildForecast(userState) {
  const now = new Date();
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const daysElapsed = Math.max(1, now.getDate());
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  const monthExpenses = userState.transactions.filter((t) => {
    if (t.amount >= 0) return false;
    return String(t.date || "").startsWith(monthKey);
  });

  let basis = "month_to_date";
  let windowDays = daysElapsed;
  let expenses = monthExpenses;

  if (!expenses.length) {
    basis = "last_30_days";
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    expenses = userState.transactions.filter((t) => t.amount < 0 && new Date(t.date) >= cutoff);
    windowDays = 30;
  }

  const totalsByCategory = new Map();
  for (const tx of expenses) {
    const category = tx.category || "Other";
    const current = totalsByCategory.get(category) || 0;
    totalsByCategory.set(category, current + Math.abs(Number(tx.amount || 0)));
  }

  const items = [];
  let spentToDate = 0;
  for (const [category, total] of totalsByCategory.entries()) {
    const dailyAverage = total / windowDays;
    const projected = dailyAverage * daysInMonth;
    items.push({ category, total, projected, dailyAverage });
    spentToDate += total;
  }

  const projectedTotal = items.reduce((sum, item) => sum + item.projected, 0);
  const budget = Number(userState.settings.monthlyBudget || 0);
  const warning = budget > 0 && projectedTotal > budget;

  return {
    month: { year, month: monthIndex + 1, daysInMonth, daysElapsed },
    basis,
    spentToDate: Number(spentToDate.toFixed(2)),
    projectedTotal: Number(projectedTotal.toFixed(2)),
    budget,
    warning,
    categories: normalizeForecastItems(items),
  };
}

function buildAnomalies(userState) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);

  const expenses = userState.transactions.filter((t) => t.amount < 0);
  const byCategory = new Map();
  for (const tx of expenses) {
    const category = tx.category || "Other";
    const list = byCategory.get(category) || [];
    list.push(Math.abs(Number(tx.amount || 0)));
    byCategory.set(category, list);
  }

  const statsByCategory = new Map();
  for (const [category, values] of byCategory.entries()) {
    if (values.length < 5) continue;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(values.length - 1, 1);
    const stdDev = Math.sqrt(variance);
    statsByCategory.set(category, { mean, stdDev, count: values.length });
  }

  const anomalies = [];
  for (const tx of expenses) {
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime()) || date < cutoff) continue;
    const category = tx.category || "Other";
    const stats = statsByCategory.get(category);
    if (!stats || stats.stdDev === 0) continue;
    const amount = Math.abs(Number(tx.amount || 0));
    const threshold = stats.mean + stats.stdDev * 2;
    if (amount > threshold && amount >= 20) {
      anomalies.push({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        category,
        amount: Number(amount.toFixed(2)),
        average: Number(stats.mean.toFixed(2)),
        stdDev: Number(stats.stdDev.toFixed(2)),
        threshold: Number(threshold.toFixed(2)),
      });
    }
  }

  anomalies.sort((a, b) => b.amount - a.amount);
  return {
    generatedAt: new Date().toISOString(),
    anomalies,
  };
}

function buildAutoInsights(userState) {
  const insights = [];
  const txs = userState.transactions || [];
  if (!txs.length) {
    return ["Add transactions to unlock spending trend insights."];
  }

  const now = new Date();
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = monthKey(now);
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = monthKey(prevMonthDate);

  const byMonth = { [currentMonth]: [], [prevMonth]: [] };
  for (const tx of txs) {
    if (tx.amount >= 0) continue;
    const date = new Date(tx.date);
    if (Number.isNaN(date.getTime())) continue;
    const key = monthKey(date);
    if (key === currentMonth) byMonth[currentMonth].push(tx);
    if (key === prevMonth) byMonth[prevMonth].push(tx);
  }

  const sum = (list) => list.reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
  const currentSpend = sum(byMonth[currentMonth]);
  const prevSpend = sum(byMonth[prevMonth]);
  if (prevSpend > 0) {
    const change = ((currentSpend - prevSpend) / prevSpend) * 100;
    const direction = change >= 0 ? "up" : "down";
    insights.push(`Total spending is ${Math.abs(change).toFixed(1)}% ${direction} versus last month.`);
  }

  const categoryTotals = (list) => {
    const map = new Map();
    for (const tx of list) {
      const cat = tx.category || "Other";
      map.set(cat, (map.get(cat) || 0) + Math.abs(Number(tx.amount || 0)));
    }
    return map;
  };

  const currentByCat = categoryTotals(byMonth[currentMonth]);
  const prevByCat = categoryTotals(byMonth[prevMonth]);
  if (currentByCat.size) {
    const top = [...currentByCat.entries()].sort((a, b) => b[1] - a[1])[0];
    insights.push(`Your top spending category this month is ${top[0]} at $${top[1].toFixed(2)}.`);
  }
  if (currentByCat.size && prevByCat.size) {
    let biggestShift = null;
    for (const [cat, total] of currentByCat.entries()) {
      const prevTotal = prevByCat.get(cat) || 0;
      if (prevTotal === 0) continue;
      const change = ((total - prevTotal) / prevTotal) * 100;
      if (!biggestShift || Math.abs(change) > Math.abs(biggestShift.change)) {
        biggestShift = { cat, change };
      }
    }
    if (biggestShift) {
      const dir = biggestShift.change >= 0 ? "increase" : "decrease";
      insights.push(
        `${biggestShift.cat} shows the biggest ${dir} at ${Math.abs(biggestShift.change).toFixed(1)}% versus last month.`
      );
    }
  }

  const last7 = new Date(now);
  last7.setDate(last7.getDate() - 7);
  const prev7 = new Date(now);
  prev7.setDate(prev7.getDate() - 14);
  const last7Spend = sum(txs.filter((t) => t.amount < 0 && new Date(t.date) >= last7));
  const prev7Spend = sum(
    txs.filter((t) => t.amount < 0 && new Date(t.date) >= prev7 && new Date(t.date) < last7)
  );
  if (prev7Spend > 0) {
    const change = ((last7Spend - prev7Spend) / prev7Spend) * 100;
    const dir = change >= 0 ? "higher" : "lower";
    insights.push(`Spending in the last 7 days is ${Math.abs(change).toFixed(1)}% ${dir} than the week before.`);
  }

  if (!insights.length) {
    insights.push("Keep logging activity to unlock more detailed spending trend insights.");
  }
  return insights;
}

function buildTimeline(userState, months = 12) {
  const now = new Date();
  const clampMonths = Math.max(1, Math.min(24, Number(months) || 12));
  const result = [];

  const makeKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  for (let i = 0; i < clampMonths; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = makeKey(date);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    const items = userState.transactions.filter((tx) => {
      const txDate = new Date(tx.date);
      if (Number.isNaN(txDate.getTime())) return false;
      return txDate >= monthStart && txDate <= monthEnd;
    });

    const expenses = items.filter((t) => t.amount < 0);
    const income = items.filter((t) => t.amount > 0);
    const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const byCategory = {};
    for (const tx of expenses) {
      const cat = tx.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(tx.amount);
    }
    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));

    const majorTransactions = [...items]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
      .slice(0, 6)
      .map((tx) => ({
        id: tx.id,
        date: tx.date,
        description: tx.description,
        category: tx.category,
        amount: Number(tx.amount.toFixed(2)),
      }));

    result.push({
      key,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      totals: {
        income: Number(totalIncome.toFixed(2)),
        expenses: Number(totalExpenses.toFixed(2)),
        net: Number((totalIncome - totalExpenses).toFixed(2)),
      },
      categories,
      majorTransactions,
      transactionCount: items.length,
    });
  }

  return result;
}

module.exports = {
  normalizeAmount,
  normalizeSettings,
  categorize,
  addTransaction,
  getDashboardSummary,
  buildInsights,
  buildForecast,
  buildAnomalies,
  buildAutoInsights,
  buildTimeline,
};
