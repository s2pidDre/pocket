(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-student-tracker-v1';
  const RECOVERY_STORAGE_KEY = `${STORAGE_KEY}-recovery`;
  const SCHEMA_VERSION = 2;
  const APP_VERSION = '1.2.0';
  const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
  const MAX_MONEY = 1_000_000_000_000;
  const TRANSACTION_TYPES = new Set(['income', 'expense', 'saving', 'transfer']);
  const EXPENSE_CATEGORIES = new Set(['Food', 'Transport', 'School', 'Load', 'Personal', 'Other']);
  const ACCOUNT_TYPES = new Set(['cash', 'ewallet', 'bank']);
  const PLAN_STATUSES = new Set(['active', 'completed', 'deleted']);
  const SAVING_DECISIONS = new Set(['accepted', 'skipped', 'not_applicable', 'pending']);
  const CURRENCY = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  const WHOLE_CURRENCY = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  const DATE_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const LONG_DATE = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  const categoryMeta = {
    Food: { icon: 'i-food', tone: 'amber-soft' },
    Transport: { icon: 'i-transport', tone: 'accent-soft' },
    School: { icon: 'i-school', tone: 'purple-soft' },
    Load: { icon: 'i-phone', tone: 'green-soft' },
    Personal: { icon: 'i-user', tone: 'red-soft' },
    Other: { icon: 'i-more', tone: 'neutral-soft' },
    Allowance: { icon: 'i-arrow-down', tone: 'green-soft' },
    Savings: { icon: 'i-savings', tone: 'purple-soft' }
  };

  const els = {};
  let state;
  let toastTimer = 0;
  let pendingConfirm = null;
  let currentView = 'home';
  let serviceWorkerRegistration = null;
  let waitingServiceWorker = null;
  let refreshAfterUpdate = false;
  let lastUpdateCheck = 0;
  let renderedDateKey = '';
  let dateRefreshTimer = 0;
  let stateLoadFailed = false;
  let loadWarning = '';

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function fromDateKey(key) {
    return new Date(`${key}T12:00:00`);
  }

  function addDays(key, days) {
    const date = fromDateKey(key);
    date.setDate(date.getDate() + days);
    return localDateKey(date);
  }

  function endOfMonthKey(key) {
    const date = fromDateKey(key);
    return localDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  }

  function daysInclusive(startKey, endKey) {
    const diff = fromDateKey(endKey) - fromDateKey(startKey);
    return Math.max(1, Math.floor(diff / 86400000) + 1);
  }

  function uid(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function currency(value, whole = false) {
    const number = Number(value) || 0;
    return whole ? WHOLE_CURRENCY.format(number) : CURRENCY.format(number);
  }

  function escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function icon(id) {
    return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  function emptyState(settings = {}) {
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: settings.theme === 'dark' ? 'dark' : 'light',
        privacy: Boolean(settings.privacy)
      },
      accounts: [{ id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0 }],
      goals: [],
      allowancePlans: [],
      transactions: [],
      checkins: {}
    };
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function validDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = fromDateKey(value);
    return !Number.isNaN(parsed.getTime()) && localDateKey(parsed) === value;
  }

  function normalizeText(value, maxLength, fallback = '') {
    if (typeof value !== 'string') return fallback;
    return value.trim().slice(0, maxLength);
  }

  function normalizeNumber(value, min = -MAX_MONEY, max = MAX_MONEY) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  function normalizeCreatedAt(value, fallbackDate) {
    if (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value))) return value;
    return `${fallbackDate}T12:00:00`;
  }

  function removeLegacyDemoData(candidate) {
    const transactionBySpec = (spec) => candidate.transactions.find((tx) => (
      tx.type === spec.type
      && tx.amount === spec.amount
      && tx.category === spec.category
      && tx.accountId === spec.accountId
      && tx.date === spec.date
      && tx.note === spec.note
      && tx.createdAt === spec.createdAt
      && (!spec.allowanceId || tx.allowanceId === spec.allowanceId)
      && (!spec.goalId || tx.goalId === spec.goalId)
    ));

    const demoPlan = candidate.allowancePlans.find((plan) => (
      plan.amount === 1800
      && plan.savingsAmount === 180
      && plan.endDate === addDays(plan.startDate, 6)
      && plan.createdAt === `${plan.startDate}T08:00:00`
    ));
    if (!demoPlan) return false;

    const demoIncome = candidate.transactions.find((tx) => (
      tx.type === 'income'
      && tx.amount === 1800
      && tx.category === 'Allowance'
      && tx.date === demoPlan.startDate
      && tx.note === 'Weekly allowance'
      && tx.allowanceId === demoPlan.id
      && tx.createdAt === `${demoPlan.startDate}T08:00:00`
    ));
    const cashAccount = candidate.accounts.find((account) => (
      account.name === 'Cash'
      && account.type === 'cash'
      && account.openingBalance === 240
    ));
    const demoGoal = candidate.goals.find((goal) => (
      goal.name === 'Emergency fund'
      && goal.target === 3000
      && goal.current >= 0
      && goal.createdAt === addDays(demoPlan.startDate, -19)
    ));
    const gcashAccount = candidate.accounts.find((account) => (
      account.name === 'GCash'
      && account.type === 'ewallet'
      && account.openingBalance === 160
    ));
    if (!cashAccount || !demoGoal || !gcashAccount) return false;

    const specs = [
      { type: 'saving', amount: 180, category: 'Savings', accountId: cashAccount.id, date: demoPlan.startDate, note: 'Emergency fund', allowanceId: demoPlan.id, goalId: demoGoal.id, createdAt: `${demoPlan.startDate}T08:02:00` },
      { type: 'expense', amount: 80, category: 'Food', accountId: cashAccount.id, date: demoPlan.startDate, note: 'Lunch', createdAt: `${demoPlan.startDate}T12:30:00` },
      { type: 'expense', amount: 60, category: 'Transport', accountId: cashAccount.id, date: demoPlan.startDate, note: 'Jeep fare', createdAt: `${demoPlan.startDate}T17:20:00` },
      { type: 'expense', amount: 35, category: 'School', accountId: cashAccount.id, date: addDays(demoPlan.startDate, 1), note: 'Printing', createdAt: `${addDays(demoPlan.startDate, 1)}T10:15:00` },
      { type: 'expense', amount: 95, category: 'Food', accountId: cashAccount.id, date: addDays(demoPlan.startDate, 1), note: 'Meal', createdAt: `${addDays(demoPlan.startDate, 1)}T13:05:00` },
      { type: 'expense', amount: 50, category: 'Load', accountId: gcashAccount.id, date: addDays(demoPlan.startDate, 2), note: 'Mobile data', createdAt: `${addDays(demoPlan.startDate, 2)}T09:10:00` }
    ];
    const matchedTransactions = specs.map(transactionBySpec);
    const demoSaving = matchedTransactions[0];
    const matchedIncome = demoIncome?.accountId === cashAccount.id ? demoIncome : null;
    const demoTransactions = [matchedIncome, ...matchedTransactions].filter(Boolean);

    const demoTransactionIds = new Set(demoTransactions.map((tx) => tx.id));
    candidate.transactions = candidate.transactions.filter((tx) => !demoTransactionIds.has(tx.id));
    candidate.allowancePlans = candidate.allowancePlans.filter((plan) => plan.id !== demoPlan.id);
    cashAccount.openingBalance = 0;
    gcashAccount.openingBalance = 0;
    const remainingDemoSavings = 170 + (demoSaving ? 180 : 0);
    demoGoal.current = Math.max(0, demoGoal.current - remainingDemoSavings);

    const goalStillUsed = candidate.transactions.some((tx) => tx.type === 'saving' && tx.goalId === demoGoal.id);
    if (!goalStillUsed && demoGoal.current === 0) {
      candidate.goals = candidate.goals.filter((goal) => goal.id !== demoGoal.id);
    }

    const gcashStillUsed = candidate.transactions.some((tx) => (
      tx.accountId === gcashAccount.id || tx.fromAccountId === gcashAccount.id || tx.toAccountId === gcashAccount.id
    ));
    if (!gcashStillUsed) candidate.accounts = candidate.accounts.filter((account) => account.id !== gcashAccount.id);
    return true;
  }

  function syncSavingsState(candidate) {
    const goalTotals = new Map(candidate.goals.map((goal) => [goal.id, 0]));
    const planTotals = new Map(candidate.allowancePlans.map((plan) => [plan.id, 0]));
    candidate.transactions.forEach((tx) => {
      if (tx.type !== 'saving') return;
      if (goalTotals.has(tx.goalId)) goalTotals.set(tx.goalId, goalTotals.get(tx.goalId) + tx.amount);
      if (planTotals.has(tx.allowanceId)) planTotals.set(tx.allowanceId, planTotals.get(tx.allowanceId) + tx.amount);
    });
    candidate.goals.forEach((goal) => { goal.current = goalTotals.get(goal.id) || 0; });
    candidate.allowancePlans.forEach((plan) => { plan.savingsAmount = planTotals.get(plan.id) || 0; });
  }

  function migrateSavingsState(candidate, sourceVersion) {
    if (sourceVersion < 2) {
      candidate.transactions.forEach((tx) => {
        if (tx.type !== 'saving' || tx.goalId) return;
        const matchingGoals = candidate.goals.filter((goal) => goal.name === tx.note);
        if (matchingGoals.length === 1) tx.goalId = matchingGoals[0].id;
      });

      candidate.goals.forEach((goal) => {
        const recorded = candidate.transactions
          .filter((tx) => tx.type === 'saving' && tx.goalId === goal.id)
          .reduce((sum, tx) => sum + tx.amount, 0);
        const difference = Math.max(0, goal.current - recorded);
        if (!difference) return;
        const date = validDateKey(goal.createdAt) ? goal.createdAt : localDateKey();
        candidate.transactions.push({
          id: uid('tx'),
          type: 'saving',
          amount: difference,
          category: 'Savings',
          accountId: candidate.accounts[0].id,
          date,
          note: goal.name,
          goalId: goal.id,
          createdAt: `${date}T12:00:00`
        });
      });
    }

    syncSavingsState(candidate);
    candidate.allowancePlans.forEach((plan) => {
      if (!SAVING_DECISIONS.has(plan.savingDecision)) {
        plan.savingDecision = plan.savingsAmount > 0 ? 'accepted' : 'skipped';
      }
      if (!Number.isFinite(plan.suggestedSavings)) plan.suggestedSavings = plan.savingsAmount;
    });
  }

  function normalizeState(candidate, { strict = false } = {}) {
    const invalid = (message) => {
      if (strict) throw new Error(message);
      return null;
    };
    if (!isRecord(candidate)) throw new Error('Backup root must be an object.');

    const sourceVersion = Number.isInteger(candidate.version) ? candidate.version : 1;
    if (strict && (!Number.isInteger(candidate.version) || sourceVersion < 1 || sourceVersion > SCHEMA_VERSION)) {
      throw new Error('Unsupported backup version.');
    }
    if (sourceVersion > SCHEMA_VERSION) throw new Error('This backup was created by a newer Pocket version.');

    const settingsSource = isRecord(candidate.settings) ? candidate.settings : {};
    if (strict && (!isRecord(candidate.settings) || !['light', 'dark'].includes(settingsSource.theme) || typeof settingsSource.privacy !== 'boolean')) {
      throw new Error('Invalid settings data.');
    }

    const sourceAccounts = Array.isArray(candidate.accounts) ? candidate.accounts : [];
    if (strict && !Array.isArray(candidate.accounts)) throw new Error('Accounts must be an array.');
    const accounts = [];
    const accountIds = new Set();
    sourceAccounts.forEach((item) => {
      const id = isRecord(item) ? normalizeText(item.id, 100) : '';
      const name = isRecord(item) ? normalizeText(item.name, 50) : '';
      const openingBalance = isRecord(item) ? normalizeNumber(item.openingBalance) : null;
      if (!id || !name || openingBalance === null || accountIds.has(id) || !ACCOUNT_TYPES.has(item.type)) {
        invalid('Invalid account entry.');
        return;
      }
      accountIds.add(id);
      accounts.push({ id, name, type: item.type, openingBalance });
    });
    if (!accounts.length) {
      if (strict) throw new Error('At least one valid account is required.');
      accounts.push({ id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0 });
      accountIds.add(accounts[0].id);
    }

    const sourceGoals = Array.isArray(candidate.goals) ? candidate.goals : [];
    if (strict && !Array.isArray(candidate.goals)) throw new Error('Goals must be an array.');
    const goals = [];
    const goalIds = new Set();
    sourceGoals.forEach((item) => {
      const id = isRecord(item) ? normalizeText(item.id, 100) : '';
      const name = isRecord(item) ? normalizeText(item.name, 40) : '';
      const target = isRecord(item) ? normalizeNumber(item.target, 1) : null;
      const current = isRecord(item) ? normalizeNumber(item.current, 0) : null;
      const createdAt = isRecord(item) && (validDateKey(item.createdAt) || (typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)))) ? item.createdAt : localDateKey();
      if (!id || !name || target === null || current === null || goalIds.has(id)) {
        invalid('Invalid savings goal entry.');
        return;
      }
      goalIds.add(id);
      goals.push({ id, name, target, current, createdAt });
    });

    const sourcePlans = Array.isArray(candidate.allowancePlans) ? candidate.allowancePlans : [];
    if (strict && !Array.isArray(candidate.allowancePlans)) throw new Error('Allowance plans must be an array.');
    const allowancePlans = [];
    const planIds = new Set();
    sourcePlans.forEach((item) => {
      const id = isRecord(item) ? normalizeText(item.id, 100) : '';
      const amount = isRecord(item) ? normalizeNumber(item.amount, 0) : null;
      const savingsAmount = isRecord(item) ? normalizeNumber(item.savingsAmount, 0) : null;
      const suggestedSavings = isRecord(item) ? normalizeNumber(item.suggestedSavings, 0) : null;
      if (!id || amount === null || savingsAmount === null || !validDateKey(item.startDate) || !validDateKey(item.endDate) || item.endDate < item.startDate || planIds.has(id) || !PLAN_STATUSES.has(item.status)) {
        invalid('Invalid allowance plan entry.');
        return;
      }
      planIds.add(id);
      allowancePlans.push({
        id,
        amount,
        startDate: item.startDate,
        endDate: item.endDate,
        savingsAmount,
        suggestedSavings: suggestedSavings ?? savingsAmount,
        savingDecision: SAVING_DECISIONS.has(item.savingDecision) ? item.savingDecision : '',
        status: item.status,
        createdAt: normalizeCreatedAt(item.createdAt, item.startDate)
      });
    });

    const sourceTransactions = Array.isArray(candidate.transactions) ? candidate.transactions : [];
    if (strict && !Array.isArray(candidate.transactions)) throw new Error('Transactions must be an array.');
    const transactions = [];
    const transactionIds = new Set();
    sourceTransactions.forEach((item) => {
      const id = isRecord(item) ? normalizeText(item.id, 100) : '';
      const type = isRecord(item) ? item.type : '';
      const amount = isRecord(item) ? normalizeNumber(item.amount, 0.01) : null;
      const note = isRecord(item) ? normalizeText(item.note, 80) : '';
      const accountId = isRecord(item) ? normalizeText(item.accountId, 100) : '';
      const fromAccountId = isRecord(item) ? normalizeText(item.fromAccountId, 100) : '';
      const toAccountId = isRecord(item) ? normalizeText(item.toAccountId, 100) : '';
      const validAccounts = type === 'transfer'
        ? accountIds.has(fromAccountId) && accountIds.has(toAccountId) && fromAccountId !== toAccountId
        : accountIds.has(accountId);
      let category = isRecord(item) ? normalizeText(item.category, 30) : '';
      if (type === 'expense' && !EXPENSE_CATEGORIES.has(category)) category = strict ? '' : 'Other';
      if (type === 'income') category = 'Allowance';
      if (type === 'saving') category = 'Savings';
      if (type === 'transfer') category = 'Other';
      if (!id || transactionIds.has(id) || !TRANSACTION_TYPES.has(type) || amount === null || !validDateKey(item.date) || !validAccounts || !category) {
        invalid('Invalid transaction entry.');
        return;
      }

      const goalId = normalizeText(item.goalId, 100);
      const allowanceId = normalizeText(item.allowanceId, 100);
      if ((goalId && !goalIds.has(goalId)) || (allowanceId && !planIds.has(allowanceId)) || (strict && sourceVersion >= 2 && type === 'saving' && !goalId)) {
        invalid('Transaction references missing data.');
        return;
      }

      transactionIds.add(id);
      transactions.push({
        id,
        type,
        amount,
        category,
        ...(type === 'transfer' ? { fromAccountId, toAccountId } : { accountId }),
        date: item.date,
        note,
        ...(goalId ? { goalId } : {}),
        ...(allowanceId ? { allowanceId } : {}),
        createdAt: normalizeCreatedAt(item.createdAt, item.date)
      });
    });

    const checkins = {};
    if (strict && !isRecord(candidate.checkins)) throw new Error('Check-ins must be an object.');
    if (isRecord(candidate.checkins)) {
      Object.entries(candidate.checkins).forEach(([date, item]) => {
        if (!validDateKey(date) || !isRecord(item) || !['yes', 'no', 'later'].includes(item.status)) {
          invalid('Invalid check-in entry.');
          return;
        }
        checkins[date] = { status: item.status, updatedAt: normalizeCreatedAt(item.updatedAt, date) };
      });
    }

    const normalized = {
      version: SCHEMA_VERSION,
      settings: {
        theme: settingsSource.theme === 'dark' ? 'dark' : 'light',
        privacy: Boolean(settingsSource.privacy)
      },
      accounts,
      goals,
      allowancePlans,
      transactions,
      checkins
    };
    removeLegacyDemoData(normalized);
    migrateSavingsState(normalized, sourceVersion);
    return normalized;
  }

  function loadState() {
    stateLoadFailed = false;
    loadWarning = '';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? normalizeState(JSON.parse(stored)) : emptyState();
    } catch (error) {
      console.warn('Unable to load saved data.', error);
      stateLoadFailed = true;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { localStorage.setItem(RECOVERY_STORAGE_KEY, stored); } catch (storageError) { console.warn('Unable to preserve recovery data.', storageError); }
      }
      loadWarning = 'Saved data could not be loaded. Pocket kept a recovery copy and started with an empty tracker.';
      return emptyState();
    }
  }

  function saveState() {
    syncSavingsState(state);
    state.version = SCHEMA_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function accountBalance(accountId) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return 0;
    return state.transactions.reduce((balance, tx) => {
      if (tx.type === 'income' && tx.accountId === accountId) return balance + Number(tx.amount || 0);
      if (tx.type === 'expense' && tx.accountId === accountId) return balance - Number(tx.amount || 0);
      if (tx.type === 'transfer') {
        if (tx.fromAccountId === accountId) return balance - Number(tx.amount || 0);
        if (tx.toAccountId === accountId) return balance + Number(tx.amount || 0);
      }
      return balance;
    }, Number(account.openingBalance || 0));
  }

  function totalBalance() {
    return state.accounts.reduce((total, account) => total + accountBalance(account.id), 0);
  }

  function totalSavings() {
    return state.goals.reduce((total, goal) => total + Number(goal.current || 0), 0);
  }

  function safeToSpend() {
    return Math.max(0, totalBalance() - totalSavings());
  }

  function activeAllowancePlan() {
    const today = localDateKey();
    return [...state.allowancePlans]
      .filter((plan) => plan.status !== 'deleted' && plan.startDate <= today && plan.endDate >= today)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  }

  function expensesBetween(startDate, endDate) {
    return state.transactions
      .filter((tx) => tx.type === 'expense' && tx.date >= startDate && tx.date <= endDate)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }

  function transactionsForDate(dateKey) {
    return state.transactions.filter((tx) => tx.date === dateKey);
  }

  function sumTransactions(type, startDate, endDate) {
    return state.transactions
      .filter((tx) => tx.type === type && tx.date >= startDate && tx.date <= endDate)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
  }

  function monthRange() {
    const now = new Date();
    return {
      start: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
      end: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12))
    };
  }

  function averageEssentialDaily() {
    const end = localDateKey();
    const start = addDays(end, -13);
    const essentials = state.transactions.filter((tx) => tx.type === 'expense' && tx.date >= start && tx.date <= end && ['Food', 'Transport', 'School', 'Load'].includes(tx.category));
    if (!essentials.length) return 150;
    const total = essentials.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const activeDays = new Set(essentials.map((tx) => tx.date)).size;
    return Math.max(50, total / Math.max(1, activeDays));
  }

  function savingRecommendation(amount, coverageDays = 7, incomingPending = true) {
    const received = Number(amount) || 0;
    if (received <= 0) return { amount: 0, percent: 0, message: 'Enter an amount for a saving suggestion.' };

    const expectedEssentials = averageEssentialDaily() * Math.min(Math.max(coverageDays, 1), 31);
    const availableAfterReceiving = safeToSpend() + (incomingPending ? received : 0);
    const coverageRatio = availableAfterReceiving / Math.max(expectedEssentials, 1);
    let percent = 0;

    if (coverageRatio >= 2.1) percent = 20;
    else if (coverageRatio >= 1.45) percent = 15;
    else if (coverageRatio >= 1.05) percent = 10;
    else if (coverageRatio >= 0.85) percent = 5;

    if (received < 200) percent = Math.min(percent, 5);
    const suggested = Math.floor((received * percent / 100) / 5) * 5;

    let message;
    if (percent === 0) message = 'Your recent spending suggests keeping this allowance available for essentials.';
    else if (percent <= 5) message = 'A small amount looks safest while your current balance stays flexible.';
    else if (percent <= 10) message = 'This keeps most of the allowance available for everyday school expenses.';
    else if (percent <= 15) message = 'Your current balance appears able to cover your usual essentials.';
    else message = 'Your current balance gives you enough room to protect a larger share.';

    return { amount: suggested, percent, message };
  }

  function coverageEndDate(coverage, customDate) {
    const today = localDateKey();
    if (coverage === 'today') return today;
    if (coverage === 'month') return endOfMonthKey(today);
    if (coverage === 'custom' && customDate && customDate >= today) return customDate;
    return addDays(today, 6);
  }

  function dailyGuide() {
    const plan = activeAllowancePlan();
    if (!plan) return { value: 0, days: 0 };
    const days = daysInclusive(localDateKey(), plan.endDate);
    return { value: safeToSpend() / Math.max(1, days), days };
  }

  function transactionTitle(tx) {
    if (tx.type === 'income') return tx.note || 'Allowance received';
    if (tx.type === 'saving') return tx.note || 'Savings protected';
    return tx.note || tx.category || 'Expense';
  }

  function transactionSubtitle(tx) {
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Account';
    const label = DATE_LABEL.format(fromDateKey(tx.date));
    return `${tx.category || 'Transaction'} · ${account} · ${label}`;
  }

  function renderTransactionRows(transactions, full = false) {
    if (!transactions.length) {
      return `<div class="empty-state"><span class="round-icon neutral-soft">${icon('i-activity')}</span><strong>No transactions found</strong><span>Your activity will appear here.</span></div>`;
    }

    return transactions.map((tx) => {
      const meta = categoryMeta[tx.category] || categoryMeta.Other;
      const sign = tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : '';
      const amountLabel = `${sign}${currency(tx.amount, true)}`;
      return `
        <div class="transaction-row ${escapeHtml(tx.type)}" data-transaction-id="${escapeHtml(tx.id)}">
          <span class="round-icon ${meta.tone}">${icon(meta.icon)}</span>
          <div class="transaction-copy">
            <strong>${escapeHtml(transactionTitle(tx))}</strong>
            <small>${escapeHtml(transactionSubtitle(tx))}</small>
          </div>
          <div class="transaction-amount">
            <strong class="money-value">${amountLabel}</strong>
            <small>${escapeHtml(tx.type === 'saving' ? 'protected' : tx.type)}</small>
          </div>
          ${full ? `<div class="transaction-actions"><button class="row-delete" type="button" data-action="delete-transaction" data-id="${escapeHtml(tx.id)}" aria-label="Delete transaction">${icon('i-trash')}</button></div>` : ''}
        </div>`;
    }).join('');
  }

  function renderAllowancePrompt() {
    const today = localDateKey();
    const checkin = state.checkins[today];
    const holder = els.allowancePrompt;

    const laterExpired = checkin?.status === 'later' && Date.now() - new Date(checkin.updatedAt || 0).getTime() >= 2 * 60 * 60 * 1000;
    if (!checkin || laterExpired) {
      holder.innerHTML = `
        <article class="daily-prompt">
          <div class="daily-prompt-copy">
            <span class="round-icon accent-soft">${icon('i-wallet')}</span>
            <div><p class="eyebrow">Daily check-in</p><h2>Did you receive allowance today?</h2><p>Your balance stays unchanged when you answer no.</p></div>
          </div>
          <div class="daily-prompt-actions">
            <button class="button-secondary" type="button" data-action="allowance-no">No</button>
            <button class="button-secondary" type="button" data-action="allowance-later">Not yet</button>
            <button class="button-primary" type="button" data-action="open-allowance">Yes, add it</button>
          </div>
        </article>`;
      return;
    }

    const messages = {
      yes: `<strong>Allowance recorded today.</strong> Your balance and daily guide are updated.`,
      no: `<strong>No allowance today.</strong> Your current balance carried forward.`,
      later: `<strong>Waiting for your answer.</strong> We will ask again when you reopen the question.`
    };
    holder.innerHTML = `
      <div class="prompt-compact">
        ${icon(checkin.status === 'yes' ? 'i-check' : 'i-wallet')}
        <span>${messages[checkin.status] || messages.later}</span>
        ${checkin.status === 'later' ? '<button class="text-button" type="button" data-action="reset-checkin">Answer now</button>' : ''}
      </div>`;
  }

  function renderAllowancePlan() {
    const plan = activeAllowancePlan();
    if (!plan) {
      els.allowancePlanCard.innerHTML = `
        <div class="empty-plan">
          <div><p class="eyebrow">Allowance period</p><h2>No active allowance plan</h2><p>Add an allowance and choose whether it should last for today, a week, a month, or a custom period.</p></div>
          <button class="button-primary" type="button" data-action="open-allowance">Add allowance</button>
        </div>`;
      return;
    }

    const spent = expensesBetween(plan.startDate, plan.endDate);
    const committed = spent + Number(plan.savingsAmount || 0);
    const remaining = Math.max(0, Number(plan.amount) - committed);
    const usedPercent = Math.min(100, (committed / Math.max(Number(plan.amount), 1)) * 100);
    const daysLeft = daysInclusive(localDateKey(), plan.endDate);

    els.allowancePlanCard.innerHTML = `
      <div class="plan-header">
        <div><p class="eyebrow">Active allowance period</p><h2>${escapeHtml(DATE_LABEL.format(fromDateKey(plan.startDate)))} – ${escapeHtml(DATE_LABEL.format(fromDateKey(plan.endDate)))}</h2><p>${currency(plan.amount, true)} was set to cover ${daysInclusive(plan.startDate, plan.endDate)} day${daysInclusive(plan.startDate, plan.endDate) === 1 ? '' : 's'}.</p></div>
        <span class="status-pill success">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span>
      </div>
      <div class="plan-progress" aria-label="Allowance used"><span style="width:${usedPercent.toFixed(1)}%"></span></div>
      <div class="plan-stats">
        <div class="plan-stat"><span>Remaining from plan</span><strong class="money-value">${currency(remaining, true)}</strong></div>
        <div class="plan-stat"><span>Spent in period</span><strong class="money-value">${currency(spent, true)}</strong></div>
        <div class="plan-stat"><span>Protected savings</span><strong class="money-value">${currency(plan.savingsAmount || 0, true)}</strong></div>
      </div>`;
  }

  function sortGoalsByProgress(goals) {
    return [...goals].sort((a, b) => {
      const aProgress = Number(a.current || 0) / Math.max(Number(a.target || 1), 1);
      const bProgress = Number(b.current || 0) / Math.max(Number(b.target || 1), 1);
      return bProgress - aProgress || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function preferredGoal() {
    return sortGoalsByProgress(state.goals.filter((goal) => Number(goal.current || 0) < Number(goal.target || 0)))[0] || null;
  }

  function featuredGoal() {
    return preferredGoal() || sortGoalsByProgress(state.goals)[0] || null;
  }

  function goalForPlan(plan) {
    if (!plan) return null;
    const saving = state.transactions.find((tx) => tx.type === 'saving' && tx.allowanceId === plan.id && tx.goalId);
    return saving ? state.goals.find((goal) => goal.id === saving.goalId) || null : null;
  }

  function renderRecommendation() {
    const latestIncome = [...state.transactions]
      .filter((tx) => tx.type === 'income')
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))[0];
    const plan = state.allowancePlans.find((item) => item.id === latestIncome?.allowanceId) || activeAllowancePlan();
    const goal = preferredGoal();

    if (!latestIncome) {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">Start small</p>
        <p class="recommendation-copy">Add your first allowance and Pocket will suggest a flexible amount based on how long it needs to last.</p>
        <button class="button-primary" type="button" data-action="open-allowance">Add allowance</button>`;
      return;
    }

    const planSaved = Number(plan?.savingsAmount || 0);
    const coverage = plan ? daysInclusive(plan.startDate, plan.endDate) : 7;
    const recommendation = savingRecommendation(latestIncome.amount, coverage, false);
    const suggestedAmount = Number(plan?.suggestedSavings ?? recommendation.amount);
    const goalRemaining = goal ? Math.max(0, Number(goal.target) - Number(goal.current)) : 0;
    const remainingSuggestion = Math.min(Math.max(0, suggestedAmount - planSaved), goalRemaining, safeToSpend());
    const savedGoal = goalForPlan(plan);

    if (planSaved > 0 || plan?.savingDecision === 'accepted') {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">${currency(planSaved, true)} protected</p>
        <p class="recommendation-copy">You saved part of your latest allowance${savedGoal ? ` toward ${escapeHtml(savedGoal.name)}` : ''}. Your daily guide already excludes protected money.</p>
        <button class="button-secondary" type="button" data-view="savings">View savings</button>`;
    } else if (plan?.savingDecision === 'skipped' || plan?.savingDecision === 'not_applicable') {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon amber-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount">Keep it flexible</p>
        <p class="recommendation-copy">You kept this allowance available for essentials. Pocket will make a fresh suggestion the next time you add an allowance.</p>`;
    } else if (remainingSuggestion > 0 && goal && plan) {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">Save ${currency(remainingSuggestion, true)}</p>
        <p class="recommendation-copy">About ${recommendation.percent}% of your latest allowance looks comfortable based on your recent essential spending.</p>
        <div class="recommendation-actions"><button class="button-primary" type="button" data-action="quick-save" data-goal-id="${escapeHtml(goal.id)}" data-allowance-id="${escapeHtml(plan.id)}" data-amount="${remainingSuggestion}">Save it</button><button class="button-secondary" type="button" data-action="dismiss-saving" data-allowance-id="${escapeHtml(plan.id)}">Skip</button></div>`;
    } else if (!goal && plan?.savingDecision === 'pending') {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount">Choose a goal</p>
        <p class="recommendation-copy">Create a savings goal before protecting part of this allowance.</p>
        <button class="button-primary" type="button" data-action="open-goal">Create goal</button>`;
    } else {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon amber-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount">Keep it flexible</p>
        <p class="recommendation-copy">Your recent spending suggests keeping the current allowance available for essentials. Skipping savings can be the smarter choice.</p>`;
    }
  }

  function frequentExpenses() {
    const recent = state.transactions
      .filter((tx) => tx.type === 'expense')
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    const groups = new Map();

    recent.forEach((tx) => {
      const amount = Math.round(Number(tx.amount || 0));
      const key = `${tx.category}|${amount}|${tx.note || ''}|${tx.accountId}`;
      const current = groups.get(key) || { ...tx, count: 0 };
      current.count += 1;
      groups.set(key, current);
    });

    const favorites = [...groups.values()].sort((a, b) => b.count - a.count || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 4);
    const defaults = [
      { category: 'Transport', amount: 30, note: 'Jeep fare', accountId: state.accounts[0]?.id },
      { category: 'Food', amount: 80, note: 'Lunch', accountId: state.accounts[0]?.id },
      { category: 'School', amount: 20, note: 'Printing', accountId: state.accounts[0]?.id },
      { category: 'Load', amount: 50, note: 'Mobile data', accountId: state.accounts[1]?.id || state.accounts[0]?.id }
    ];

    while (favorites.length < 4) favorites.push(defaults[favorites.length]);
    return favorites.slice(0, 4);
  }

  function renderQuickExpenses() {
    els.quickExpenses.innerHTML = frequentExpenses().map((item) => {
      const meta = categoryMeta[item.category] || categoryMeta.Other;
      return `
        <button class="quick-expense" type="button" data-action="quick-expense" data-category="${escapeHtml(item.category)}" data-amount="${Number(item.amount)}" data-note="${escapeHtml(item.note || item.category)}" data-account-id="${escapeHtml(item.accountId || state.accounts[0]?.id || '')}">
          <span class="round-icon ${meta.tone}">${icon(meta.icon)}</span>
          <span><strong>${escapeHtml(item.note || item.category)}</strong><small class="money-value">${currency(item.amount, true)}</small></span>
        </button>`;
    }).join('');
  }

  function renderSavingsMini() {
    const goal = featuredGoal();
    if (!goal) {
      els.savingsMini.innerHTML = `<div class="empty-plan"><div><p class="eyebrow">Savings</p><h2>Create your first goal</h2><p>Protected money stays inside your balance but out of safe-to-spend.</p></div><button class="button-primary" type="button" data-action="open-goal">Add</button></div>`;
      return;
    }
    const percent = Math.min(100, Number(goal.current || 0) / Math.max(Number(goal.target || 1), 1) * 100);
    els.savingsMini.innerHTML = `
      <div class="mini-goal-head"><strong>${escapeHtml(goal.name)}</strong><span class="money-value">${currency(goal.current, true)} / ${currency(goal.target, true)}</span></div>
      <div class="mini-goal-bar"><span style="width:${percent.toFixed(1)}%"></span></div>
      <p>${Math.round(percent)}% complete · <button class="text-button" type="button" data-view="savings">View goal</button></p>`;
  }

  function renderHome() {
    const today = localDateKey();
    const todayTransactions = transactionsForDate(today);
    const received = todayTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const spent = todayTransactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const guide = dailyGuide();

    els.currentBalance.textContent = currency(totalBalance());
    els.todayReceived.textContent = currency(received, true);
    els.todaySpent.textContent = currency(spent, true);
    els.safeToSpend.textContent = currency(safeToSpend());
    els.safeToSpendHint.textContent = totalSavings() > 0 ? `${currency(totalSavings(), true)} is currently protected in savings.` : 'No money is protected in savings yet.';
    els.dailyGuide.textContent = guide.days ? currency(guide.value) : currency(0);
    els.dailyGuideHint.textContent = guide.days ? `Suggested average for the next ${guide.days} day${guide.days === 1 ? '' : 's'}.` : 'Add an allowance period to calculate a guide.';

    renderAllowancePrompt();
    renderAllowancePlan();
    renderRecommendation();
    renderQuickExpenses();
    renderSavingsMini();

    const recent = [...state.transactions].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date))).slice(0, 5);
    els.recentTransactions.innerHTML = renderTransactionRows(recent);
  }

  function filteredActivity() {
    const search = els.activitySearch.value.trim().toLowerCase();
    const type = els.activityType.value;
    return [...state.transactions]
      .filter((tx) => type === 'all' || tx.type === type)
      .filter((tx) => {
        if (!search) return true;
        const haystack = `${tx.category || ''} ${tx.note || ''} ${transactionSubtitle(tx)} ${tx.amount}`.toLowerCase();
        return haystack.includes(search);
      })
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  }

  function renderActivity() {
    const range = monthRange();
    els.monthSpent.textContent = currency(sumTransactions('expense', range.start, range.end), true);
    els.monthReceived.textContent = currency(sumTransactions('income', range.start, range.end), true);
    els.monthSaved.textContent = currency(sumTransactions('saving', range.start, range.end), true);
    const filtered = filteredActivity();
    els.activityCount.textContent = `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`;
    els.allTransactions.innerHTML = renderTransactionRows(filtered, true);
  }

  function renderSavings() {
    els.totalSavings.textContent = currency(totalSavings());
    if (!state.goals.length) {
      els.goalsGrid.innerHTML = `<article class="card goal-card"><div class="empty-state"><span class="round-icon purple-soft">${icon('i-target')}</span><strong>No savings goals yet</strong><span>Create a goal to protect part of your allowance.</span><br><button class="button-primary" type="button" data-action="open-goal">Create goal</button></div></article>`;
    } else {
      els.goalsGrid.innerHTML = state.goals.map((goal) => {
        const current = Number(goal.current || 0);
        const target = Math.max(Number(goal.target || 1), 1);
        const percent = Math.min(100, current / target * 100);
        const complete = current >= target;
        return `
          <article class="card goal-card">
            <div class="goal-card-head">
              <div><p class="eyebrow">Savings goal</p><h3>${escapeHtml(goal.name)}</h3><p class="goal-amount money-value">${currency(current, true)} of ${currency(target, true)}</p></div>
              <span class="round-icon green-soft">${icon('i-target')}</span>
            </div>
            <div class="goal-progress"><span style="width:${percent.toFixed(1)}%"></span></div>
            <div class="goal-footer"><small>${Math.round(percent)}% complete</small><button class="button-secondary" type="button" data-action="open-contribution" data-goal-id="${escapeHtml(goal.id)}"${complete ? ' disabled' : ''}>${complete ? 'Completed' : 'Add savings'}</button></div>
          </article>`;
      }).join('');
    }

    const goal = preferredGoal() || featuredGoal();
    const essential = averageEssentialDaily();
    if (goal) {
      const remaining = Math.max(0, Number(goal.target) - Number(goal.current));
      const sample = savingRecommendation(Math.max(200, essential * 2), 7);
      els.savingsInsight.textContent = remaining > 0
        ? `Based on your recent essential spending, a flexible target of around ${currency(sample.amount || 20, true)} whenever you receive a moderate allowance could move “${goal.name}” forward without forcing a fixed contribution.`
        : `You completed “${goal.name}.” Create another goal only when you have something specific you want to protect money for.`;
    } else {
      els.savingsInsight.textContent = 'Create a goal first. Pocket will then direct accepted saving suggestions to that goal automatically.';
    }
  }

  function renderSettings() {
    els.themeLabel.textContent = state.settings.theme === 'dark' ? 'Dark' : 'Light';
    els.themeIcon.innerHTML = `<use href="#${state.settings.theme === 'dark' ? 'i-sun' : 'i-moon'}"></use>`;
    els.privacyLabel.textContent = state.settings.privacy ? 'Amounts hidden' : 'Amounts visible';
    els.privacySwitch.classList.toggle('is-on', state.settings.privacy);
    document.querySelectorAll('[data-action="toggle-privacy"]').forEach((button) => {
      button.setAttribute('aria-pressed', String(state.settings.privacy));
    });
  }

  function renderHeader() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const titles = {
      home: greeting,
      activity: 'Your activity',
      savings: 'Savings goals',
      more: 'Settings'
    };
    els.viewTitle.textContent = titles[currentView];
    els.todayLabel.textContent = LONG_DATE.format(now);
  }

  function renderPrivacy() {
    document.body.classList.toggle('is-private', state.settings.privacy);
    document.querySelectorAll('.privacy-icon use').forEach((use) => use.setAttribute('href', `#${state.settings.privacy ? 'i-eye-off' : 'i-eye'}`));
    document.querySelectorAll('[data-action="toggle-privacy"]').forEach((button) => {
      button.setAttribute('aria-label', state.settings.privacy ? 'Show amounts' : 'Hide amounts');
    });
    const sidebarLabel = document.querySelector('.privacy-toggle span');
    if (sidebarLabel) sidebarLabel.textContent = state.settings.privacy ? 'Show amounts' : 'Hide amounts';
  }

  function renderAll() {
    syncSavingsState(state);
    renderedDateKey = localDateKey();
    document.documentElement.dataset.theme = state.settings.theme;
    renderHeader();
    renderPrivacy();
    renderHome();
    renderActivity();
    renderSavings();
    renderSettings();
    populateAccounts();
  }

  function refreshDateInputs() {
    const today = localDateKey();
    els.allowanceEndDate.min = today;
    if (!els.expenseDialog.open) els.expenseDate.value = today;
    if (!els.allowanceDialog.open) els.allowanceEndDate.value = addDays(today, 6);
  }

  function scheduleDateRefresh() {
    clearTimeout(dateRefreshTimer);
    const nextMidnight = new Date();
    nextMidnight.setHours(24, 0, 1, 0);
    dateRefreshTimer = window.setTimeout(() => {
      refreshForDateChange();
      scheduleDateRefresh();
    }, Math.max(1000, nextMidnight.getTime() - Date.now()));
  }

  function refreshForDateChange() {
    if (renderedDateKey === localDateKey()) {
      renderHeader();
      return false;
    }
    refreshDateInputs();
    renderAll();
    return true;
  }

  function populateAccounts() {
    const current = els.expenseAccount.value;
    els.expenseAccount.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${currency(accountBalance(account.id), true)}</option>`).join('');
    if (state.accounts.some((account) => account.id === current)) els.expenseAccount.value = current;
  }

  function setView(view, updateHash = true) {
    if (!['home', 'activity', 'savings', 'more'].includes(view)) view = 'home';
    currentView = view;
    document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    renderHeader();
    if (view === 'activity') renderActivity();
    if (view === 'savings') renderSavings();
    if (updateHash) history.replaceState(null, '', `#${view}`);
    els.contentScroll.scrollTop = 0;
  }

  function showToast(message, actionLabel = '', action = null) {
    clearTimeout(toastTimer);
    els.toastMessage.textContent = message;
    els.toastAction.textContent = actionLabel;
    els.toastAction.onclick = action ? () => {
      action();
      hideToast();
    } : null;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(hideToast, action ? 6000 : 3500);
  }

  function hideToast() {
    els.toast.classList.remove('is-visible');
    clearTimeout(toastTimer);
  }

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  function openExpense(prefill = {}) {
    els.expenseForm.reset();
    els.expenseDate.value = prefill.date || localDateKey();
    els.expenseAmount.value = prefill.amount || '';
    if (prefill.category) {
      const radio = els.expenseForm.querySelector(`input[name="expenseCategory"][value="${CSS.escape(prefill.category)}"]`);
      if (radio) radio.checked = true;
    }
    els.expenseNote.value = prefill.note || '';
    populateAccounts();
    if (prefill.accountId && state.accounts.some((account) => account.id === prefill.accountId)) els.expenseAccount.value = prefill.accountId;
    openDialog(els.expenseDialog);
    requestAnimationFrame(() => els.expenseAmount.focus());
  }

  function coverageDaysFromForm() {
    const coverage = els.allowanceForm.elements.coverage.value;
    const endDate = coverageEndDate(coverage, els.allowanceEndDate.value);
    return daysInclusive(localDateKey(), endDate);
  }

  function updateAllowanceSuggestion() {
    const amount = Number(els.allowanceAmount.value || 0);
    const suggestion = savingRecommendation(amount, coverageDaysFromForm());
    if (amount <= 0) {
      els.allowanceSuggestion.innerHTML = `<span class="round-icon purple-soft">${icon('i-sparkle')}</span><div><strong>Enter an amount for a saving suggestion.</strong><p>We’ll protect only what looks comfortable.</p></div>`;
      return;
    }
    const title = suggestion.amount > 0 ? `Suggested saving: ${currency(suggestion.amount, true)} (${suggestion.percent}%)` : 'No saving suggested this time';
    els.allowanceSuggestion.innerHTML = `<span class="round-icon purple-soft">${icon('i-sparkle')}</span><div><strong>${title}</strong><p>${escapeHtml(suggestion.message)}</p></div>`;
  }

  function addAllowance() {
    const amount = Number(els.allowanceAmount.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY) return;
    const today = localDateKey();
    const coverage = els.allowanceForm.elements.coverage.value;
    const endDate = coverageEndDate(coverage, els.allowanceEndDate.value);
    const days = daysInclusive(today, endDate);
    const suggestion = savingRecommendation(amount, days);
    const accountId = state.accounts[0]?.id;
    const planId = uid('allowance');
    const useSaving = els.applySuggestedSaving.checked && suggestion.amount > 0;
    let goal = useSaving ? preferredGoal() : null;

    if (useSaving && !goal) {
      const hasEmergencyFund = state.goals.some((item) => item.name.toLowerCase() === 'emergency fund');
      goal = { id: uid('goal'), name: hasEmergencyFund ? 'Next savings goal' : 'Emergency fund', target: 3000, current: 0, createdAt: today };
      state.goals.push(goal);
    }

    const goalRemaining = goal ? Math.max(0, Number(goal.target) - Number(goal.current)) : 0;
    const savingAmount = useSaving ? Math.min(suggestion.amount, goalRemaining) : 0;
    const savingDecision = suggestion.amount <= 0 ? 'not_applicable' : savingAmount > 0 ? 'accepted' : 'skipped';

    state.allowancePlans.forEach((plan) => {
      if (plan.status === 'active' && plan.endDate < today) plan.status = 'completed';
    });

    const plan = {
      id: planId,
      amount,
      startDate: today,
      endDate,
      savingsAmount: savingAmount,
      suggestedSavings: suggestion.amount,
      savingDecision,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    state.allowancePlans.push(plan);
    state.transactions.push({
      id: uid('tx'),
      type: 'income',
      amount,
      category: 'Allowance',
      accountId,
      date: today,
      note: coverage === 'today' ? 'Daily allowance' : coverage === 'month' ? 'Monthly allowance' : coverage === 'custom' ? 'Flexible allowance' : 'Weekly allowance',
      allowanceId: planId,
      createdAt: new Date().toISOString()
    });

    if (savingAmount > 0 && goal) {
      state.transactions.push({
        id: uid('tx'),
        type: 'saving',
        amount: savingAmount,
        category: 'Savings',
        accountId,
        date: today,
        note: goal.name,
        goalId: goal.id,
        allowanceId: planId,
        createdAt: new Date(Date.now() + 10).toISOString()
      });
    }

    state.checkins[today] = { status: 'yes', updatedAt: new Date().toISOString() };
    saveState();
    closeDialog(els.allowanceDialog);
    renderAll();
    showToast(savingAmount > 0 ? `${currency(amount, true)} added and ${currency(savingAmount, true)} protected.` : `${currency(amount, true)} allowance added.`);
  }

  function addExpense() {
    const amount = Number(els.expenseAmount.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY) return;
    const category = els.expenseForm.elements.expenseCategory.value;
    const accountId = els.expenseAccount.value || state.accounts[0]?.id;
    const date = els.expenseDate.value || localDateKey();
    const note = els.expenseNote.value.trim().slice(0, 80);
    if (!EXPENSE_CATEGORIES.has(category) || !state.accounts.some((account) => account.id === accountId) || !validDateKey(date)) return;

    state.transactions.push({
      id: uid('tx'),
      type: 'expense',
      amount,
      category,
      accountId,
      date,
      note,
      createdAt: new Date().toISOString()
    });
    saveState();
    closeDialog(els.expenseDialog);
    renderAll();
    const remaining = accountBalance(accountId);
    showToast(remaining < 0 ? `Expense saved. ${state.accounts.find((a) => a.id === accountId)?.name || 'Account'} is now below zero.` : `${currency(amount, true)} expense saved.`);
  }

  function quickExpense(button) {
    const amount = Number(button.dataset.amount || 0);
    const category = button.dataset.category || 'Other';
    const accountId = button.dataset.accountId || state.accounts[0]?.id;
    const note = button.dataset.note || category;
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY || !state.accounts.some((account) => account.id === accountId) || !EXPENSE_CATEGORIES.has(category)) return;

    const transaction = {
      id: uid('tx'),
      type: 'expense',
      amount,
      category,
      accountId,
      date: localDateKey(),
      note,
      createdAt: new Date().toISOString()
    };
    state.transactions.push(transaction);
    saveState();
    renderAll();
    showToast(`${note} added for ${currency(amount, true)}.`, 'Undo', () => {
      state.transactions = state.transactions.filter((tx) => tx.id !== transaction.id);
      saveState();
      renderAll();
    });
  }

  function addGoal() {
    const name = els.goalName.value.trim().slice(0, 40);
    const target = Number(els.goalTarget.value);
    const current = Math.max(0, Number(els.goalCurrent.value || 0));
    if (!name || !Number.isFinite(target) || target <= 0 || target > MAX_MONEY || !Number.isFinite(current)) return;
    const maximumInitialSaving = Math.min(target, safeToSpend());
    if (current > maximumInitialSaving) {
      els.goalCurrent.setCustomValidity(`Enter no more than ${currency(maximumInitialSaving, true)}, based on your available balance and goal target.`);
      els.goalCurrent.reportValidity();
      return;
    }

    els.goalCurrent.setCustomValidity('');
    const goalId = uid('goal');
    state.goals.push({ id: goalId, name, target, current: 0, createdAt: localDateKey() });
    if (current > 0) {
      state.transactions.push({ id: uid('tx'), type: 'saving', amount: current, category: 'Savings', accountId: state.accounts[0]?.id, date: localDateKey(), note: name, goalId, createdAt: new Date().toISOString() });
    }
    saveState();
    closeDialog(els.goalDialog);
    renderAll();
    setView('savings');
    showToast(`“${name}” goal created.`);
  }

  function contributionLimit(goal) {
    return Math.max(0, Math.min(safeToSpend(), Number(goal.target) - Number(goal.current)));
  }

  function openContribution(goalId, suggestedAmount = '', allowanceId = '') {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    const limit = contributionLimit(goal);
    if (limit <= 0) {
      showToast(Number(goal.current) >= Number(goal.target) ? 'This savings goal is already complete.' : 'No unprotected balance is available for savings right now.');
      return;
    }
    els.contributeGoalId.value = goal.id;
    els.contributeAllowanceId.value = state.allowancePlans.some((plan) => plan.id === allowanceId) ? allowanceId : '';
    els.contributeTitle.textContent = goal.name;
    els.contributeAmount.max = String(limit);
    els.contributeAmount.setCustomValidity('');
    els.contributeAmount.value = suggestedAmount ? String(Math.min(Number(suggestedAmount), limit)) : '';
    els.contributeLimitHint.textContent = `You can protect up to ${currency(limit, true)} without exceeding your available balance or this goal’s target.`;
    openDialog(els.contributeDialog);
    requestAnimationFrame(() => els.contributeAmount.focus());
  }

  function addContribution() {
    const goal = state.goals.find((item) => item.id === els.contributeGoalId.value);
    const amount = Number(els.contributeAmount.value);
    if (!goal || !Number.isFinite(amount) || amount <= 0) return;
    const limit = contributionLimit(goal);
    if (amount > limit) {
      els.contributeAmount.setCustomValidity(`Enter no more than ${currency(limit, true)}.`);
      els.contributeAmount.reportValidity();
      return;
    }

    els.contributeAmount.setCustomValidity('');
    const allowanceId = els.contributeAllowanceId.value;
    const plan = state.allowancePlans.find((item) => item.id === allowanceId);
    state.transactions.push({
      id: uid('tx'), type: 'saving', amount, category: 'Savings', accountId: state.accounts[0]?.id,
      date: localDateKey(), note: goal.name, goalId: goal.id, ...(plan ? { allowanceId: plan.id } : {}), createdAt: new Date().toISOString()
    });
    if (plan) plan.savingDecision = 'accepted';
    saveState();
    closeDialog(els.contributeDialog);
    renderAll();
    showToast(`${currency(amount, true)} protected for ${goal.name}.`);
  }

  function deleteTransaction(id) {
    const index = state.transactions.findIndex((tx) => tx.id === id);
    if (index < 0) return;
    const deleted = state.transactions[index];
    const removalIds = new Set([deleted.id]);
    if (deleted.type === 'income' && deleted.allowanceId) {
      state.transactions.forEach((tx) => {
        if (tx.type === 'saving' && tx.allowanceId === deleted.allowanceId) removalIds.add(tx.id);
      });
    }

    const removedRecords = state.transactions
      .map((transaction, originalIndex) => ({ transaction, originalIndex }))
      .filter(({ transaction }) => removalIds.has(transaction.id));
    const affectedPlanIds = new Set(removedRecords.map(({ transaction }) => transaction.allowanceId).filter(Boolean));
    const planSnapshots = [...affectedPlanIds].map((planId) => {
      const plan = state.allowancePlans.find((item) => item.id === planId);
      return plan ? { plan, status: plan.status, savingDecision: plan.savingDecision } : null;
    }).filter(Boolean);
    const hadCheckin = Object.hasOwn(state.checkins, deleted.date);
    const checkinSnapshot = hadCheckin ? { ...state.checkins[deleted.date] } : null;

    state.transactions = state.transactions.filter((tx) => !removalIds.has(tx.id));
    planSnapshots.forEach(({ plan }) => {
      if (deleted.type === 'income' && deleted.allowanceId === plan.id) plan.status = 'deleted';
      else plan.savingDecision = 'skipped';
    });
    if (deleted.type === 'income' && !state.transactions.some((tx) => tx.type === 'income' && tx.date === deleted.date)) {
      delete state.checkins[deleted.date];
    }
    saveState();
    renderAll();
    const message = removedRecords.length > 1 ? 'Allowance and its linked savings removed.' : 'Transaction removed.';
    showToast(message, 'Undo', () => {
      removedRecords.sort((a, b) => a.originalIndex - b.originalIndex).forEach(({ transaction, originalIndex }) => {
        if (!state.transactions.some((tx) => tx.id === transaction.id)) {
          state.transactions.splice(Math.min(originalIndex, state.transactions.length), 0, transaction);
        }
      });
      planSnapshots.forEach(({ plan, status, savingDecision }) => {
        plan.status = status;
        plan.savingDecision = savingDecision;
      });
      if (hadCheckin) state.checkins[deleted.date] = checkinSnapshot;
      else delete state.checkins[deleted.date];
      saveState();
      renderAll();
    });
  }

  function confirmAction(title, message, actionLabel, callback) {
    els.confirmTitle.textContent = title;
    els.confirmMessage.textContent = message;
    els.confirmAction.textContent = actionLabel;
    pendingConfirm = callback;
    openDialog(els.confirmDialog);
  }

  function resetAllData() {
    state = emptyState({ theme: state.settings.theme, privacy: false });
    localStorage.removeItem(RECOVERY_STORAGE_KEY);
    saveState();
    renderAll();
    setView('home');
    showToast('All tracker data cleared.');
  }

  function exportData() {
    const file = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pocket-backup-${localDateKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Backup downloaded.');
  }

  async function importData(file) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Backup file is too large.');
      const text = await file.text();
      const imported = normalizeState(JSON.parse(text), { strict: true });
      confirmAction('Restore this backup?', 'Your current locally stored tracker data will be replaced by the selected backup.', 'Restore data', () => {
        state = imported;
        localStorage.removeItem(RECOVERY_STORAGE_KEY);
        saveState();
        renderAll();
        setView('home');
        showToast('Backup restored successfully.');
      });
    } catch (error) {
      console.warn(error);
      showToast('That file is not a valid Pocket backup.');
    } finally {
      els.importFile.value = '';
    }
  }

  function showUpdateAvailable(worker) {
    if (!worker) return;
    waitingServiceWorker = worker;
    els.updateBanner.removeAttribute('inert');
    els.updateBanner.classList.add('is-visible');
    els.updateStatus.textContent = 'Available';
    els.updateStatus.classList.remove('success');
  }

  function hideUpdateAvailable() {
    els.updateBanner.classList.remove('is-visible');
    els.updateBanner.setAttribute('inert', '');
  }

  function applyAvailableUpdate() {
    const worker = waitingServiceWorker || serviceWorkerRegistration?.waiting;
    if (!worker) {
      showToast('No downloaded update is waiting.');
      return;
    }
    refreshAfterUpdate = true;
    els.updateStatus.textContent = 'Installing';
    worker.postMessage({ type: 'SKIP_WAITING' });
  }

  async function checkForUpdates({ announce = false, force = false } = {}) {
    if (!serviceWorkerRegistration) {
      if (announce) showToast('Update checks are available when the app is hosted.');
      return;
    }
    const now = Date.now();
    if (!force && now - lastUpdateCheck < UPDATE_CHECK_INTERVAL) return;
    lastUpdateCheck = now;
    if (announce) {
      els.updateStatus.textContent = 'Checking';
      showToast('Checking for updates…');
    }
    try {
      await serviceWorkerRegistration.update();
      window.setTimeout(() => {
        const worker = waitingServiceWorker || serviceWorkerRegistration.waiting;
        if (worker) {
          showUpdateAvailable(worker);
          if (announce) showToast('A new version is ready.');
        } else if (announce) {
          els.updateStatus.textContent = 'Current';
          els.updateStatus.classList.add('success');
          showToast('Pocket is up to date.');
        }
      }, 900);
    } catch (error) {
      console.warn('Unable to check for updates.', error);
      els.updateStatus.textContent = 'Unavailable';
      if (announce) showToast('Could not check for updates right now.');
    }
  }

  function handleAction(button) {
    const action = button.dataset.action;
    if (!action) return;

    if (action === 'open-expense') openExpense();
    if (action === 'open-allowance') {
      els.allowanceForm.reset();
      els.allowanceForm.elements.coverage.value = 'week';
      els.allowanceEndDate.value = addDays(localDateKey(), 6);
      els.customDateWrap.classList.add('is-hidden');
      updateAllowanceSuggestion();
      openDialog(els.allowanceDialog);
      requestAnimationFrame(() => els.allowanceAmount.focus());
    }
    if (action === 'allowance-no') {
      state.checkins[localDateKey()] = { status: 'no', updatedAt: new Date().toISOString() };
      saveState(); renderAll(); showToast('Balance carried forward.');
    }
    if (action === 'allowance-later') {
      state.checkins[localDateKey()] = { status: 'later', updatedAt: new Date().toISOString() };
      saveState(); renderAll();
    }
    if (action === 'apply-update') applyAvailableUpdate();
    if (action === 'dismiss-update') hideUpdateAvailable();
    if (action === 'check-update') checkForUpdates({ announce: true, force: true });
    if (action === 'reset-checkin') {
      delete state.checkins[localDateKey()];
      saveState(); renderAll(); setView('home');
    }
    if (action === 'quick-expense') quickExpense(button);
    if (action === 'open-goal') {
      els.goalForm.reset();
      els.goalCurrent.value = '0';
      els.goalCurrent.max = String(Math.max(0, safeToSpend()));
      els.goalCurrent.setCustomValidity('');
      openDialog(els.goalDialog);
      requestAnimationFrame(() => els.goalName.focus());
    }
    if (action === 'open-contribution') openContribution(button.dataset.goalId);
    if (action === 'quick-save') openContribution(button.dataset.goalId, button.dataset.amount, button.dataset.allowanceId);
    if (action === 'dismiss-saving') {
      const plan = state.allowancePlans.find((item) => item.id === button.dataset.allowanceId);
      if (plan) {
        plan.savingDecision = 'skipped';
        saveState();
        renderAll();
      }
      showToast('Saving suggestion skipped.');
    }
    if (action === 'delete-transaction') deleteTransaction(button.dataset.id);
    if (action === 'toggle-theme') {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      saveState(); renderAll();
    }
    if (action === 'toggle-privacy') {
      state.settings.privacy = !state.settings.privacy;
      saveState(); renderAll();
    }
    if (action === 'export-data') exportData();
    if (action === 'import-data') els.importFile.click();
    if (action === 'reset-data') confirmAction('Clear all data?', 'This removes transactions, allowance history, and savings goals stored on this device. This cannot be undone after you continue.', 'Clear data', resetAllData);
  }

  function cacheElements() {
    [
      'todayLabel', 'viewTitle', 'contentScroll', 'allowancePrompt', 'currentBalance', 'todayReceived', 'todaySpent',
      'safeToSpend', 'safeToSpendHint', 'dailyGuide', 'dailyGuideHint', 'allowancePlanCard', 'recommendationCard',
      'recentTransactions', 'quickExpenses', 'savingsMini', 'activitySearch', 'activityType', 'monthSpent', 'monthReceived',
      'monthSaved', 'activityCount', 'allTransactions', 'totalSavings', 'goalsGrid', 'savingsInsight', 'themeIcon',
      'themeLabel', 'privacyLabel', 'privacySwitch', 'importFile', 'allowanceDialog', 'allowanceForm', 'allowanceAmount',
      'allowanceEndDate', 'customDateWrap', 'allowanceSuggestion', 'applySuggestedSaving', 'expenseDialog', 'expenseForm',
      'expenseAmount', 'expenseAccount', 'expenseDate', 'expenseNote', 'goalDialog', 'goalForm', 'goalName', 'goalTarget',
      'goalCurrent', 'contributeDialog', 'contributeForm', 'contributeTitle', 'contributeGoalId', 'contributeAllowanceId',
      'contributeAmount', 'contributeLimitHint',
      'confirmDialog', 'confirmTitle', 'confirmMessage', 'confirmAction', 'toast', 'toastMessage', 'toastAction',
      'updateBanner', 'appVersion', 'updateStatus'
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) {
        closeDialog(closeButton.closest('dialog'));
        return;
      }
      const viewButton = event.target.closest('[data-view]');
      if (viewButton && !event.target.closest('[data-action]')) {
        setView(viewButton.dataset.view);
        return;
      }
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) handleAction(actionButton);
    });

    els.activitySearch.addEventListener('input', renderActivity);
    els.activityType.addEventListener('change', renderActivity);

    els.allowanceAmount.addEventListener('input', updateAllowanceSuggestion);
    els.allowanceForm.addEventListener('change', (event) => {
      if (event.target.name === 'coverage') {
        const custom = event.target.value === 'custom';
        els.customDateWrap.classList.toggle('is-hidden', !custom);
        if (custom && !els.allowanceEndDate.value) els.allowanceEndDate.value = addDays(localDateKey(), 6);
        updateAllowanceSuggestion();
      }
    });
    document.getElementById('allowanceAmountChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-amount]');
      if (!button) return;
      els.allowanceAmount.value = button.dataset.amount;
      updateAllowanceSuggestion();
    });

    els.allowanceForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addAllowance();
    });
    els.expenseForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addExpense();
    });
    els.goalForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addGoal();
    });
    els.contributeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addContribution();
    });
    els.confirmDialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const action = pendingConfirm;
      pendingConfirm = null;
      closeDialog(els.confirmDialog);
      if (action) action();
    });

    [els.goalTarget, els.goalCurrent].forEach((input) => input.addEventListener('input', () => {
      els.goalCurrent.setCustomValidity('');
      const target = Number(els.goalTarget.value);
      els.goalCurrent.max = String(Math.max(0, Math.min(Number.isFinite(target) && target > 0 ? target : MAX_MONEY, safeToSpend())));
    }));
    els.contributeAmount.addEventListener('input', () => els.contributeAmount.setCustomValidity(''));

    els.importFile.addEventListener('change', () => {
      const file = els.importFile.files?.[0];
      if (file) importData(file);
    });

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) closeDialog(dialog);
      });
      dialog.addEventListener('close', () => {
        if (dialog === els.confirmDialog) pendingConfirm = null;
      });
    });

    window.addEventListener('hashchange', () => setView(location.hash.slice(1), false));
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        state = loadState();
        if (!stateLoadFailed) saveState();
        renderAll();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshForDateChange();
        checkForUpdates();
      }
    });
    window.addEventListener('online', () => checkForUpdates({ force: true }));
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
      els.updateStatus.textContent = 'Hosted only';
      return;
    }

    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');

      if (serviceWorkerRegistration.waiting && navigator.serviceWorker.controller) {
        showUpdateAvailable(serviceWorkerRegistration.waiting);
      }

      serviceWorkerRegistration.addEventListener('updatefound', () => {
        const installingWorker = serviceWorkerRegistration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateAvailable(installingWorker);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshAfterUpdate) return;
        refreshAfterUpdate = false;
        window.location.reload();
      });

      window.setTimeout(() => checkForUpdates({ force: true }), 1500);
    } catch (error) {
      els.updateStatus.textContent = 'Unavailable';
      console.warn('Service worker registration failed.', error);
    }
  }

  function init() {
    cacheElements();
    els.appVersion.textContent = `Version ${APP_VERSION}`;
    state = loadState();
    if (!stateLoadFailed) saveState();
    bindEvents();
    renderAll();
    setView(location.hash.slice(1) || 'home', false);
    refreshDateInputs();
    scheduleDateRefresh();
    registerServiceWorker();
    if (loadWarning) showToast(loadWarning);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
