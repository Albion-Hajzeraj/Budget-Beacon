const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const MONTHLY_BUDGET = 3000;
const OPENING_BALANCE = 4500;

const nodes = {
  todayLabel: document.getElementById("todayLabel"),
  availableBalance: document.getElementById("availableBalance"),
  healthBadge: document.getElementById("healthBadge"),
  monthlyIncome: document.getElementById("monthlyIncome"),
  monthlySpend: document.getElementById("monthlySpend"),
  savingsRate: document.getElementById("savingsRate"),
  budgetRemaining: document.getElementById("budgetRemaining"),
  checkingBalance: document.getElementById("checkingBalance"),
  savingsBalance: document.getElementById("savingsBalance"),
  creditUsed: document.getElementById("creditUsed"),
  insightsList: document.getElementById("insightsList"),
  categoriesChart: document.getElementById("categoriesChart"),
  txTableBody: document.getElementById("txTableBody"),
  activityCount: document.getElementById("activityCount"),
  goalsList: document.getElementById("goalsList"),
  transactionForm: document.getElementById("transactionForm"),
  goalForm: document.getElementById("goalForm"),
  goalRowTpl: document.getElementById("goalRowTpl"),
};

function setGreetingDate() {
  const now = new Date();
  const pretty = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  nodes.todayLabel.textContent = `Your overview for ${pretty}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function buildHealthMessage(available, savingsRate) {
  if (available < 0) return "Balance alert: spending exceeded your cushion";
  if (savingsRate >= 20) return "Great shape: savings habits look strong";
  if (savingsRate >= 10) return "Healthy pace: one small trim can boost savings";
  return "Early momentum: focus on one category this week";
}

function renderDashboard(summary, goals) {
  const totals = summary.totals || { income: 0, expenses: 0, net: 0, savingsRatePct: 0 };
  const available = OPENING_BALANCE + totals.net;
  const savingsTotal = goals.reduce((sum, g) => sum + Number(g.currentAmount || 0), 0);
  const credit = Math.max(0, totals.expenses * 0.35);
  const budgetLeft = MONTHLY_BUDGET - totals.expenses;

  nodes.availableBalance.textContent = currency.format(available);
  nodes.healthBadge.textContent = buildHealthMessage(available, totals.savingsRatePct || 0);
  nodes.monthlyIncome.textContent = currency.format(totals.income || 0);
  nodes.monthlySpend.textContent = currency.format(totals.expenses || 0);
  nodes.savingsRate.textContent = `${Number(totals.savingsRatePct || 0).toFixed(1)}%`;
  nodes.budgetRemaining.textContent = currency.format(budgetLeft);
  nodes.budgetRemaining.style.color = budgetLeft < 0 ? "#c63d3d" : "#0fa77b";

  nodes.checkingBalance.textContent = currency.format(available - savingsTotal);
  nodes.savingsBalance.textContent = currency.format(savingsTotal);
  nodes.creditUsed.textContent = currency.format(credit);
}

function renderInsights(items) {
  nodes.insightsList.innerHTML = "";
  const details = items.length
    ? items
    : ["Your dashboard is ready. Add a few transactions to unlock personal coaching notes."];
  for (const text of details) {
    const li = document.createElement("li");
    li.textContent = text;
    nodes.insightsList.appendChild(li);
  }
}

function renderCategories(topCategories) {
  nodes.categoriesChart.innerHTML = "";
  if (!topCategories.length) {
    nodes.categoriesChart.textContent = "No spending categories yet.";
    return;
  }
  const max = Math.max(...topCategories.map((x) => x.total), 1);
  for (const item of topCategories) {
    const width = (item.total / max) * 100;
    const row = document.createElement("div");
    row.className = "bar";
    row.innerHTML = `
      <div class="bar-meta"><span>${item.category}</span><strong>${currency.format(item.total)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${width.toFixed(1)}%"></div></div>
    `;
    nodes.categoriesChart.appendChild(row);
  }
}

function renderTransactions(transactions) {
  nodes.txTableBody.innerHTML = "";
  nodes.activityCount.textContent = `${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`;
  if (!transactions.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">No activity yet. Add your first transaction above.</td>`;
    nodes.txTableBody.appendChild(tr);
    return;
  }
  for (const tx of transactions) {
    const tr = document.createElement("tr");
    const cls = tx.amount < 0 ? "negative" : "positive";
    tr.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.description}</td>
      <td>${tx.category}</td>
      <td class="${cls}">${currency.format(tx.amount)}</td>
    `;
    nodes.txTableBody.appendChild(tr);
  }
}

function renderGoals(goals) {
  nodes.goalsList.innerHTML = "";
  if (!goals.length) {
    const empty = document.createElement("li");
    empty.className = "goal-item";
    empty.textContent = "No goals yet. Add one to start building your savings plan.";
    nodes.goalsList.appendChild(empty);
    return;
  }
  for (const goal of goals) {
    const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
    const item = nodes.goalRowTpl.content.firstElementChild.cloneNode(true);
    item.querySelector(".goal-name").textContent = goal.name;
    item.querySelector(".goal-percent").textContent = `${pct.toFixed(1)}%`;
    item.querySelector(".goal-meta").textContent =
      `${currency.format(goal.currentAmount)} saved of ${currency.format(goal.targetAmount)}`;
    item.querySelector(".goal-progress-fill").style.width = `${pct}%`;
    nodes.goalsList.appendChild(item);
  }
}

async function refresh() {
  const [dashboard, insights, transactionsResponse, goalsResponse] = await Promise.all([
    api("/dashboard"),
    api("/insights"),
    api("/transactions"),
    api("/goals"),
  ]);
  const goals = goalsResponse.goals || [];
  renderDashboard(dashboard, goals);
  renderInsights(insights.insights || []);
  renderCategories(dashboard.topCategories || []);
  renderTransactions(transactionsResponse.transactions || []);
  renderGoals(goals);
}

nodes.transactionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(nodes.transactionForm);
  const payload = {
    description: String(form.get("description") || "").trim(),
    amount: Number(form.get("amount")),
    date: form.get("date") || undefined,
  };
  await api("/transactions", { method: "POST", body: JSON.stringify(payload) });
  nodes.transactionForm.reset();
  await refresh();
});

nodes.goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(nodes.goalForm);
  const payload = {
    name: String(form.get("name") || "").trim(),
    targetAmount: Number(form.get("targetAmount")),
    currentAmount: Number(form.get("currentAmount") || 0),
  };
  await api("/goals", { method: "POST", body: JSON.stringify(payload) });
  nodes.goalForm.reset();
  await refresh();
});

setGreetingDate();
refresh().catch((err) => {
  console.error(err);
  alert(err.message);
});
