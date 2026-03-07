const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const nodes = {
  sideLinks: [...document.querySelectorAll(".side-link")],
  pages: [...document.querySelectorAll(".page")],
  accountSelect: document.getElementById("accountSelect"),
  quickExpenseBtn: document.getElementById("quickExpenseBtn"),
  quickIncomeBtn: document.getElementById("quickIncomeBtn"),
  quickGoalBtn: document.getElementById("quickGoalBtn"),
  topChecking: document.getElementById("topChecking"),
  topSavings: document.getElementById("topSavings"),
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
  insightsListSecondary: document.getElementById("insightsListSecondary"),
  categoriesChart: document.getElementById("categoriesChart"),
  txTableBody: document.getElementById("txTableBody"),
  activityCount: document.getElementById("activityCount"),
  goalsList: document.getElementById("goalsList"),
  transactionForm: document.getElementById("transactionForm"),
  goalForm: document.getElementById("goalForm"),
  settingsForm: document.getElementById("settingsForm"),
  goalRowTpl: document.getElementById("goalRowTpl"),
};

function setGreetingDate() {
  const now = new Date();
  const pretty = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  nodes.todayLabel.textContent = `Your overview for ${pretty}`;
}

function setPage(page) {
  for (const link of nodes.sideLinks) {
    link.classList.toggle("active", link.dataset.page === page);
  }
  for (const panel of nodes.pages) {
    panel.classList.toggle("active", panel.dataset.page === page);
  }
}

for (const link of nodes.sideLinks) {
  link.addEventListener("click", () => setPage(link.dataset.page));
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

function renderDashboard(summary) {
  const totals = summary.totals || { income: 0, expenses: 0, net: 0, savingsRatePct: 0 };
  const balances = summary.balances || { available: 0, checking: 0, savings: 0, creditUsed: 0 };
  const budget = summary.budget || { monthlyBudget: 0, remaining: 0 };

  nodes.availableBalance.textContent = currency.format(balances.available);
  nodes.healthBadge.textContent = buildHealthMessage(balances.available || 0, totals.savingsRatePct || 0);
  nodes.monthlyIncome.textContent = currency.format(totals.income || 0);
  nodes.monthlySpend.textContent = currency.format(totals.expenses || 0);
  nodes.savingsRate.textContent = `${Number(totals.savingsRatePct || 0).toFixed(1)}%`;
  nodes.budgetRemaining.textContent = currency.format(budget.remaining || 0);
  nodes.budgetRemaining.style.color = budget.remaining < 0 ? "#c63d3d" : "#8f6d12";
  nodes.checkingBalance.textContent = currency.format(balances.checking || 0);
  nodes.savingsBalance.textContent = currency.format(balances.savings || 0);
  nodes.creditUsed.textContent = currency.format(balances.creditUsed || 0);
  nodes.topChecking.textContent = currency.format(balances.checking || 0);
  nodes.topSavings.textContent = currency.format(balances.savings || 0);
}

function renderSettings(settings = {}) {
  if (!nodes.settingsForm) return;
  nodes.settingsForm.elements.baseCheckingBalance.value = Number(settings.baseCheckingBalance || 0).toFixed(2);
  nodes.settingsForm.elements.baseSavingsBalance.value = Number(settings.baseSavingsBalance || 0).toFixed(2);
  nodes.settingsForm.elements.monthlyBudget.value = Number(settings.monthlyBudget || 0).toFixed(2);
}

function renderInsights(items) {
  const data = items.length
    ? items
    : ["Your dashboard is ready. Add transactions to unlock coaching notes."];
  for (const list of [nodes.insightsList, nodes.insightsListSecondary]) {
    list.innerHTML = "";
    for (const text of data) {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    }
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
    empty.textContent = "No goals yet. Add one to start your savings plan.";
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
    item.querySelector(".goal-fund-btn").dataset.goalId = String(goal.id);
    nodes.goalsList.appendChild(item);
  }

  for (const btn of nodes.goalsList.querySelectorAll(".goal-fund-btn")) {
    btn.addEventListener("click", async () => {
      const goalId = Number(btn.dataset.goalId);
      await api(`/goals/${goalId}/fund`, {
        method: "PATCH",
        body: JSON.stringify({ amount: 100 }),
      });
      await refresh();
    });
  }
}

async function refresh() {
  const [dashboard, insights, transactionsResponse, goalsResponse] = await Promise.all([
    api("/dashboard"),
    api("/insights"),
    api("/transactions"),
    api("/goals"),
  ]);
  const goals = dashboard.goals || goalsResponse.goals || [];
  renderDashboard(dashboard);
  renderSettings(dashboard.settings || {});
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
    account: String(form.get("account") || "checking"),
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

nodes.quickExpenseBtn.addEventListener("click", () => {
  setPage("transactions");
  nodes.transactionForm.elements.description.value = "New expense";
  nodes.transactionForm.elements.amount.value = "-1";
  nodes.transactionForm.elements.account.value = nodes.accountSelect.value === "all" ? "checking" : nodes.accountSelect.value;
  nodes.transactionForm.elements.description.focus();
});

nodes.quickIncomeBtn.addEventListener("click", () => {
  setPage("transactions");
  nodes.transactionForm.elements.description.value = "New income";
  nodes.transactionForm.elements.amount.value = "";
  nodes.transactionForm.elements.account.value = nodes.accountSelect.value === "all" ? "checking" : nodes.accountSelect.value;
  nodes.transactionForm.elements.description.focus();
});

nodes.quickGoalBtn.addEventListener("click", () => {
  setPage("goals");
  nodes.goalForm.elements.name.focus();
});

nodes.accountSelect.addEventListener("change", () => {
  const value = nodes.accountSelect.value;
  if (value === "all") setPage("dashboard");
  else if (value === "savings") setPage("goals");
  else setPage("transactions");
  if (value !== "all") {
    nodes.transactionForm.elements.account.value = value;
  }
});

nodes.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(nodes.settingsForm);
  const payload = {
    baseCheckingBalance: Number(form.get("baseCheckingBalance")),
    baseSavingsBalance: Number(form.get("baseSavingsBalance")),
    monthlyBudget: Number(form.get("monthlyBudget")),
  };
  await api("/settings", { method: "PATCH", body: JSON.stringify(payload) });
  await refresh();
});

setGreetingDate();
setPage("dashboard");
refresh().catch((err) => {
  console.error(err);
  alert(err.message);
});
