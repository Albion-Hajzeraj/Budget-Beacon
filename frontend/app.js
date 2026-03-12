const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const THEME_KEY = "budgetbeacon_theme";
const AUTH_TOKEN_KEY = "budgetbeacon_token";
const AUTH_USER_KEY = "budgetbeacon_user";

const nodes = {
  sideLinks: [...document.querySelectorAll(".side-link")],
  pages: [...document.querySelectorAll(".page")],
  quickExpenseBtn: document.getElementById("quickExpenseBtn"),
  quickIncomeBtn: document.getElementById("quickIncomeBtn"),
  quickGoalBtn: document.getElementById("quickGoalBtn"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  themeToggle: document.getElementById("themeToggle"),
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
  autoInsightsList: document.getElementById("autoInsightsList"),
  forecastSummary: document.getElementById("forecastSummary"),
  forecastWarning: document.getElementById("forecastWarning"),
  forecastList: document.getElementById("forecastList"),
  timelineMonths: document.getElementById("timelineMonths"),
  timelineTitle: document.getElementById("timelineTitle"),
  timelineCount: document.getElementById("timelineCount"),
  timelineIncome: document.getElementById("timelineIncome"),
  timelineExpenses: document.getElementById("timelineExpenses"),
  timelineNet: document.getElementById("timelineNet"),
  timelineCategories: document.getElementById("timelineCategories"),
  timelineMajor: document.getElementById("timelineMajor"),
  healthScoreValue: document.getElementById("healthScoreValue"),
  healthScoreSummary: document.getElementById("healthScoreSummary"),
  healthScoreBreakdown: document.getElementById("healthScoreBreakdown"),
  anomalySummary: document.getElementById("anomalySummary"),
  anomalyList: document.getElementById("anomalyList"),
  txTableBody: document.getElementById("txTableBody"),
  activityCount: document.getElementById("activityCount"),
  goalsList: document.getElementById("goalsList"),
  transactionForm: document.getElementById("transactionForm"),
  nlpForm: document.getElementById("nlpForm"),
  nlpStatus: document.getElementById("nlpStatus"),
  goalForm: document.getElementById("goalForm"),
  settingsForm: document.getElementById("settingsForm"),
  settingsStatus: document.getElementById("settingsStatus"),
  goalRowTpl: document.getElementById("goalRowTpl"),
  authModal: document.getElementById("authModal"),
  authTitle: document.getElementById("authTitle"),
  authSubtitle: document.getElementById("authSubtitle"),
  authSubmitBtn: document.getElementById("authSubmitBtn"),
  authCloseBtn: document.getElementById("authCloseBtn"),
  authForm: document.getElementById("authForm"),
  authName: document.getElementById("authName"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
};

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  nodes.themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }
  applyTheme("light");
}

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
  requestAnimationFrame(() => {
    applyRevealTargets();
    const activePage = document.querySelector(`.page[data-page="${page}"]`);
    replayPageAnimations(activePage);
  });
}

for (const link of nodes.sideLinks) {
  link.addEventListener("click", () => setPage(link.dataset.page));
}

async function api(path, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(path, {
    headers,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearAuth();
    openAuth("login");
  }
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

let revealObserver = null;
function applyRevealTargets() {
  const targets = document.querySelectorAll(".hero, .stat-card, .panel, .sidebar");
  targets.forEach((element, index) => {
    if (!element.classList.contains("reveal")) {
      element.classList.add("reveal");
      element.style.setProperty("--reveal-delay", `${Math.min(index * 40, 360)}ms`);
    }
    revealObserver?.observe(element);
  });
}

function initScrollAnimations() {
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.16 }
  );
  applyRevealTargets();
}

function replayPageAnimations(pageElement) {
  if (!pageElement) return;
  const targets = pageElement.querySelectorAll(".hero, .stat-card, .panel");
  targets.forEach((element, index) => {
    if (revealObserver) revealObserver.unobserve(element);
    element.classList.remove("in-view");
    element.classList.add("reveal");
    element.style.setProperty("--reveal-delay", `${Math.min(index * 45, 320)}ms`);
    void element.offsetWidth;
    setTimeout(() => {
      element.classList.add("in-view");
    }, index * 45);
  });
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

function renderAutoInsights(items) {
  if (!nodes.autoInsightsList) return;
  const data = items.length
    ? items
    : ["Keep logging transactions to unlock deeper spending trends."];
  nodes.autoInsightsList.innerHTML = "";
  for (const text of data) {
    const li = document.createElement("li");
    li.textContent = text;
    nodes.autoInsightsList.appendChild(li);
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

function renderForecast(forecast) {
  if (!nodes.forecastSummary || !nodes.forecastList) return;
  nodes.forecastList.innerHTML = "";
  const items = forecast?.categories || [];
  if (!items.length) {
    nodes.forecastSummary.textContent = "Forecast will appear once you add spending activity.";
    nodes.forecastWarning.classList.add("hidden");
    return;
  }

  const monthLabel = new Date(forecast.month.year, forecast.month.month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const basisLabel = forecast.basis === "last_30_days" ? "last 30 days" : "month-to-date";
  nodes.forecastSummary.textContent = `Projected ${monthLabel} spend: ${currency.format(
    forecast.projectedTotal
  )} based on ${basisLabel} activity.`;

  if (forecast.warning) {
    nodes.forecastWarning.textContent = `Warning: projected spend exceeds your budget of ${currency.format(
      forecast.budget
    )}.`;
    nodes.forecastWarning.classList.remove("hidden");
  } else {
    nodes.forecastWarning.classList.add("hidden");
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "forecast-item";
    row.innerHTML = `
      <div class="forecast-meta">
        <span>${item.category}</span>
        <strong>${currency.format(item.projected)}</strong>
      </div>
      <div class="forecast-sub">
        <span>Daily avg ${currency.format(item.dailyAverage)}</span>
        <span>${currency.format(item.spentToDate)} spent so far</span>
      </div>
    `;
    nodes.forecastList.appendChild(row);
  }
}

function renderHealthScore(healthScore) {
  if (!nodes.healthScoreValue || !nodes.healthScoreBreakdown || !nodes.healthScoreSummary) return;
  if (!healthScore) {
    nodes.healthScoreValue.textContent = "0";
    nodes.healthScoreSummary.textContent = "Add income and expenses to calculate your score.";
    nodes.healthScoreBreakdown.innerHTML = "";
    return;
  }
  nodes.healthScoreValue.textContent = String(healthScore.score ?? 0);
  nodes.healthScoreSummary.textContent =
    healthScore.score >= 80
      ? "Strong position. Maintain your current habits."
      : healthScore.score >= 60
      ? "Solid progress. A few tweaks can boost your score."
      : "Needs attention. Focus on trimming expenses and building savings.";

  nodes.healthScoreBreakdown.innerHTML = "";
  for (const item of healthScore.breakdown || []) {
    const li = document.createElement("li");
    li.className = "health-breakdown-item";
    li.innerHTML = `
      <div>
        <strong>${item.label}</strong>
        <span>${item.note}</span>
      </div>
      <div class="health-metrics">
        <span>${Number(item.value).toFixed(1)}%</span>
        <small>${Number(item.score).toFixed(1)} / 100</small>
      </div>
    `;
    nodes.healthScoreBreakdown.appendChild(li);
  }
}

let timelineSelection = null;
function renderTimeline(timeline) {
  if (!nodes.timelineMonths) return;
  const months = timeline?.months || [];
  nodes.timelineMonths.innerHTML = "";
  if (!months.length) {
    nodes.timelineMonths.textContent = "No historical data yet.";
    if (nodes.timelineTitle) nodes.timelineTitle.textContent = "Month Overview";
    if (nodes.timelineCount) nodes.timelineCount.textContent = "0 transactions";
    if (nodes.timelineIncome) nodes.timelineIncome.textContent = currency.format(0);
    if (nodes.timelineExpenses) nodes.timelineExpenses.textContent = currency.format(0);
    if (nodes.timelineNet) nodes.timelineNet.textContent = currency.format(0);
    if (nodes.timelineCategories) nodes.timelineCategories.innerHTML = "";
    if (nodes.timelineMajor) nodes.timelineMajor.innerHTML = "";
    return;
  }

  if (!timelineSelection || !months.find((m) => m.key === timelineSelection)) {
    timelineSelection = months[0].key;
  }

  for (const month of months) {
    const btn = document.createElement("button");
    btn.className = "timeline-chip";
    btn.type = "button";
    btn.textContent = month.label;
    if (month.key === timelineSelection) btn.classList.add("active");
    btn.addEventListener("click", () => {
      timelineSelection = month.key;
      renderTimeline(timeline);
    });
    nodes.timelineMonths.appendChild(btn);
  }

  const selected = months.find((m) => m.key === timelineSelection) || months[0];
  if (nodes.timelineTitle) nodes.timelineTitle.textContent = selected.label;
  if (nodes.timelineCount) {
    nodes.timelineCount.textContent = `${selected.transactionCount} transaction${
      selected.transactionCount === 1 ? "" : "s"
    }`;
  }
  if (nodes.timelineIncome) nodes.timelineIncome.textContent = currency.format(selected.totals.income);
  if (nodes.timelineExpenses) nodes.timelineExpenses.textContent = currency.format(selected.totals.expenses);
  if (nodes.timelineNet) nodes.timelineNet.textContent = currency.format(selected.totals.net);

  if (nodes.timelineCategories) {
    nodes.timelineCategories.innerHTML = "";
    if (!selected.categories.length) {
      nodes.timelineCategories.textContent = "No expenses recorded.";
    } else {
      const max = Math.max(...selected.categories.map((x) => x.total), 1);
      for (const item of selected.categories) {
        const width = (item.total / max) * 100;
        const row = document.createElement("div");
        row.className = "bar";
        row.innerHTML = `
          <div class="bar-meta"><span>${item.category}</span><strong>${currency.format(item.total)}</strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${width.toFixed(1)}%"></div></div>
        `;
        nodes.timelineCategories.appendChild(row);
      }
    }
  }

  if (nodes.timelineMajor) {
    nodes.timelineMajor.innerHTML = "";
    if (!selected.majorTransactions.length) {
      const li = document.createElement("li");
      li.textContent = "No major transactions yet.";
      nodes.timelineMajor.appendChild(li);
    } else {
      for (const tx of selected.majorTransactions) {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <strong>${tx.description}</strong>
            <span>${tx.category || "Other"} • ${tx.date}</span>
          </div>
          <div class="timeline-amount">${currency.format(tx.amount)}</div>
        `;
        nodes.timelineMajor.appendChild(li);
      }
    }
  }
}

let anomalyIdSet = new Set();
function renderAnomalies(payload) {
  if (!nodes.anomalyList || !nodes.anomalySummary) return;
  const anomalies = payload?.anomalies || [];
  nodes.anomalyList.innerHTML = "";
  anomalyIdSet = new Set(anomalies.map((item) => item.id));
  if (!anomalies.length) {
    nodes.anomalySummary.textContent = "No unusual spending detected.";
    return;
  }
  nodes.anomalySummary.textContent = `${anomalies.length} unusual charge${
    anomalies.length === 1 ? "" : "s"
  } detected in the last 30 days.`;
  for (const item of anomalies) {
    const li = document.createElement("li");
    li.className = "anomaly-item";
    li.innerHTML = `
      <div>
        <strong>${item.category}</strong>
        <span>${item.description}</span>
        <small>${item.date}</small>
      </div>
      <div class="anomaly-amount">${currency.format(-item.amount)}</div>
    `;
    nodes.anomalyList.appendChild(li);
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
    if (anomalyIdSet.has(tx.id)) tr.classList.add("anomaly-row");
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
  const [dashboard, insights, transactionsResponse, goalsResponse, forecast, anomalies, timeline] = await Promise.all([
    api("/dashboard"),
    api("/insights"),
    api("/transactions"),
    api("/goals"),
    api("/forecast"),
    api("/anomalies"),
    api("/timeline?months=12"),
  ]);
  const goals = dashboard.goals || goalsResponse.goals || [];
  renderDashboard(dashboard);
  renderSettings(dashboard.settings || {});
  renderInsights(insights.insights || []);
  renderAutoInsights(insights.autoInsights || []);
  renderCategories(dashboard.topCategories || []);
  renderForecast(forecast || {});
  renderTimeline(timeline || { months: [] });
  renderHealthScore(dashboard.healthScore || null);
  renderAnomalies(anomalies || {});
  renderTransactions(transactionsResponse.transactions || []);
  renderGoals(goals);
}

function setProfileChip(user) {
  const chip = document.querySelector(".profile-chip");
  if (!chip) return;
  if (!user) {
    chip.textContent = "—";
    return;
  }
  const name = user.name || user.email || "User";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  chip.textContent = initials || "U";
}

function setAuthUI(isAuthed, user) {
  nodes.loginBtn.classList.toggle("hidden", isAuthed);
  nodes.signupBtn.classList.toggle("hidden", isAuthed);
  nodes.logoutBtn.classList.toggle("hidden", !isAuthed);
  setProfileChip(user);
}

function storeAuth(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  setAuthUI(true, user);
}

function resetUI() {
  renderDashboard({
    totals: { income: 0, expenses: 0, net: 0, savingsRatePct: 0 },
    balances: { available: 0, checking: 0, savings: 0, creditUsed: 0 },
    budget: { monthlyBudget: 0, remaining: 0 },
    settings: { baseCheckingBalance: 0, baseSavingsBalance: 0, monthlyBudget: 0 },
    topCategories: [],
    goals: [],
    transactionCount: 0,
  });
  renderSettings({ baseCheckingBalance: 0, baseSavingsBalance: 0, monthlyBudget: 0 });
  renderInsights([]);
  renderAutoInsights([]);
  renderCategories([]);
  renderForecast({ categories: [] });
  renderTimeline({ months: [] });
  renderHealthScore(null);
  renderAnomalies({ anomalies: [] });
  renderTransactions([]);
  renderGoals([]);
}

function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  setAuthUI(false, null);
  resetUI();
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

nodes.nlpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(nodes.nlpForm);
  const text = String(form.get("nlpText") || "").trim();
  if (!text) return;
  nodes.nlpStatus.textContent = "Parsing...";
  nodes.nlpStatus.className = "form-status";
  try {
    await api("/transactions/nlp", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    nodes.nlpForm.reset();
    nodes.nlpStatus.textContent = "Transaction added from sentence.";
    nodes.nlpStatus.className = "form-status success";
    await refresh();
  } catch (err) {
    nodes.nlpStatus.textContent = err.message || "Could not parse that sentence.";
    nodes.nlpStatus.className = "form-status error";
  }
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
  nodes.transactionForm.elements.account.value = "checking";
  nodes.transactionForm.elements.description.focus();
});

nodes.quickIncomeBtn.addEventListener("click", () => {
  setPage("transactions");
  nodes.transactionForm.elements.description.value = "New income";
  nodes.transactionForm.elements.amount.value = "";
  nodes.transactionForm.elements.account.value = "checking";
  nodes.transactionForm.elements.description.focus();
});

nodes.quickGoalBtn.addEventListener("click", () => {
  setPage("goals");
  nodes.goalForm.elements.name.focus();
});

nodes.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(nodes.settingsForm);
  const toNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const currentChecking = Number(nodes.settingsForm.elements.baseCheckingBalance.value);
  const currentSavings = Number(nodes.settingsForm.elements.baseSavingsBalance.value);
  const currentBudget = Number(nodes.settingsForm.elements.monthlyBudget.value);
  const payload = {
    baseCheckingBalance: toNumber(form.get("baseCheckingBalance"), currentChecking),
    baseSavingsBalance: toNumber(form.get("baseSavingsBalance"), currentSavings),
    monthlyBudget: toNumber(form.get("monthlyBudget"), currentBudget),
  };
  try {
    await api("/settings", { method: "PATCH", body: JSON.stringify(payload) });
    nodes.settingsStatus.textContent = "Setup updated successfully.";
    nodes.settingsStatus.className = "form-status success";
    await refresh();
  } catch (err) {
    nodes.settingsStatus.textContent = err.message || "Update failed.";
    nodes.settingsStatus.className = "form-status error";
  }
});

nodes.themeToggle.addEventListener("click", () => {
  const current = document.body.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

function openAuth(mode) {
  const isLogin = mode === "login";
  nodes.authTitle.textContent = isLogin ? "Welcome Back" : "Create Your Account";
  nodes.authSubmitBtn.textContent = isLogin ? "Log in" : "Sign up";
  nodes.authSubtitle.textContent = isLogin
    ? "Sign in to access your BudgetBeacon workspace."
    : "Create an account to save and secure your data.";
  nodes.authForm.dataset.mode = mode;
  nodes.authName.classList.toggle("hidden", isLogin);
  nodes.authName.required = !isLogin;
  nodes.authModal.classList.remove("hidden");
  nodes.authModal.setAttribute("aria-hidden", "false");
}

function closeAuth() {
  nodes.authModal.classList.add("hidden");
  nodes.authModal.setAttribute("aria-hidden", "true");
}

nodes.loginBtn.addEventListener("click", () => openAuth("login"));
nodes.signupBtn.addEventListener("click", () => openAuth("signup"));
nodes.authCloseBtn.addEventListener("click", closeAuth);
nodes.authModal.addEventListener("click", (event) => {
  if (event.target === nodes.authModal) closeAuth();
});
nodes.logoutBtn.addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (_err) {
    // Best effort logout
  }
  clearAuth();
  openAuth("login");
});

nodes.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const mode = nodes.authForm.dataset.mode || "login";
  const payload = {
    email: String(nodes.authEmail.value || "").trim(),
    password: String(nodes.authPassword.value || ""),
  };
  if (mode === "signup") {
    payload.name = String(nodes.authName.value || "").trim();
  }
  try {
    const endpoint = mode === "signup" ? "/auth/signup" : "/auth/login";
    const data = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
    if (data.token && data.user) {
      storeAuth(data.token, data.user);
      closeAuth();
      await refresh();
    }
  } catch (err) {
    alert(err.message || "Authentication failed.");
  }
});

initTheme();
setGreetingDate();
setPage("dashboard");
initScrollAnimations();
const cachedUser = (() => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch (_err) {
    return null;
  }
})();
setAuthUI(Boolean(localStorage.getItem(AUTH_TOKEN_KEY)), cachedUser);
if (localStorage.getItem(AUTH_TOKEN_KEY)) {
  api("/auth/me")
    .then((data) => {
      if (data.user) storeAuth(localStorage.getItem(AUTH_TOKEN_KEY), data.user);
      return refresh();
    })
    .catch((err) => {
      console.error(err);
    });
} else {
  resetUI();
  openAuth("login");
}
