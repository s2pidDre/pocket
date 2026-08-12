(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-student-tracker-v1';
  const SCHEMA_VERSION = 1;
  const APP_VERSION = '1.5.0';
  const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
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
  let pendingUndo = null;
  let pendingConfirm = null;
  let currentView = 'home';
  let serviceWorkerRegistration = null;
  let waitingServiceWorker = null;
  let refreshAfterUpdate = false;
  let lastUpdateCheck = 0;
  let currentExpenseEditId = null;
  let lastReceiptTransactionId = '';

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

  function addMonths(key, months) {
    const date = fromDateKey(key);
    const day = date.getDate();
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
    target.setDate(Math.min(day, lastDay));
    return localDateKey(target);
  }

  function daysUntil(fromKey, toKey) {
    if (!fromKey || !toKey) return 0;
    return Math.max(0, Math.ceil((fromDateKey(toKey) - fromDateKey(fromKey)) / 86400000));
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

  function cloneStateSnapshot(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function transactionTimestampMs(tx) {
    const raw = tx?.createdAt || (tx?.date ? `${tx.date}T12:00:00` : '');
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  function canModifyTransaction(tx) {
    return (Date.now() - transactionTimestampMs(tx)) < 24 * 60 * 60 * 1000;
  }

  function canEditTransaction(tx) {
    return tx?.type === 'expense' && canModifyTransaction(tx);
  }

  function transactionWindowLabel(tx) {
    if (!canModifyTransaction(tx)) return 'Locked after 24h';
    const leftMs = Math.max(0, (24 * 60 * 60 * 1000) - (Date.now() - transactionTimestampMs(tx)));
    const hours = Math.max(1, Math.ceil(leftMs / (60 * 60 * 1000)));
    return `${hours}h left`;
  }

  function spendableAvailableForEntry(accountId, editingTransactionId = null) {
    let available = Math.max(0, accountBalance(accountId));
    if (!editingTransactionId) return available;
    const original = state.transactions.find((tx) => tx.id === editingTransactionId && tx.type === 'expense');
    if (original && original.accountId === accountId) available += Number(original.amount || 0);
    return available;
  }

  function applyAmountKey(currentValue, key, { allowDecimal = true, maxWholeDigits = 7 } = {}) {
    let value = String(currentValue || '');

    if (key === 'backspace') return value.slice(0, -1);
    if (key === 'clear') return '';
    if (key === '.') {
      if (!allowDecimal || value.includes('.')) return value;
      return value ? `${value}.` : '0.';
    }
    if (key === '00') {
      if (!value || value === '0') return '0';
      const next = `${value}00`;
      const [whole = '', decimals] = next.split('.');
      if (decimals !== undefined && decimals.length > 2) return value;
      if (whole.replace(/^0+/, '').length > maxWholeDigits) return value;
      return next;
    }
    if (!/^\d$/.test(key)) return value;

    const [whole = '', decimals] = value.split('.');
    if (decimals !== undefined && decimals.length >= 2) return value;
    if (decimals === undefined && whole.replace(/^0+/, '').length >= maxWholeDigits) return value;
    if (value === '0') return key;
    return `${value}${key}`;
  }

  function parseAmountKeyboardKey(event, allowDecimal = true) {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    if (event.target.matches('input:not([readonly]), select, textarea, [contenteditable="true"]')) return null;
    if (event.key === 'Backspace') return 'backspace';
    if (allowDecimal && (event.key === '.' || event.key === 'Decimal')) return '.';
    if (/^\d$/.test(event.key)) return event.key;
    return null;
  }

  function seedState() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: 'light',
        privacy: false,
        demoData: false
      },
      accounts: [
        { id: uid('account'), name: 'Wallet', type: 'cash', openingBalance: 0 }
      ],
      goals: [],
      allowanceRoutine: null,
      allowancePlans: [],
      transactions: [],
      checkins: {}
    };
  }

  function frequencyLabel(frequency) {
    return ({ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', irregular: 'Irregular' })[frequency] || 'Weekly';
  }

  function nextDueDateForFrequency(frequency, fromKey = localDateKey()) {
    if (frequency === 'daily') return addDays(fromKey, 1);
    if (frequency === 'weekly') return addDays(fromKey, 7);
    if (frequency === 'monthly') return addMonths(fromKey, 1);
    return null;
  }

  function coverageEndForFrequency(frequency, startKey = localDateKey(), expectedNextDate = null) {
    if (frequency === 'daily') return startKey;
    if (frequency === 'weekly') return addDays(startKey, 6);
    if (frequency === 'monthly') return addDays(addMonths(startKey, 1), -1);
    if (frequency === 'irregular' && expectedNextDate && expectedNextDate > startKey) return addDays(expectedNextDate, -1);
    if (frequency === 'irregular') return '9999-12-31';
    return startKey;
  }

  function inferLegacyFrequency(plan) {
    if (!plan?.startDate || !plan?.endDate) return 'weekly';
    if (plan.endDate === '9999-12-31') return 'irregular';
    const days = daysInclusive(plan.startDate, plan.endDate);
    if (days <= 1) return 'daily';
    if (days >= 27) return 'monthly';
    if (days >= 6 && days <= 8) return 'weekly';
    return 'irregular';
  }

  function normalizeAllowanceRoutine(routine, candidate = {}) {
    const allowed = new Set(['daily', 'weekly', 'monthly', 'irregular']);
    if (routine && typeof routine === 'object' && Number(routine.amount) > 0) {
      const frequency = allowed.has(routine.frequency) ? routine.frequency : 'weekly';
      const amount = Number(routine.amount);
      return {
        amount,
        frequency,
        autoSaveAmount: Math.min(amount, Math.max(0, Number(routine.autoSaveAmount) || 0)),
        lastReceivedDate: /^\d{4}-\d{2}-\d{2}$/.test(routine.lastReceivedDate || '') ? routine.lastReceivedDate : null,
        nextDueDate: /^\d{4}-\d{2}-\d{2}$/.test(routine.nextDueDate || '') ? routine.nextDueDate : null
      };
    }

    const incomes = Array.isArray(candidate.transactions)
      ? candidate.transactions.filter((tx) => tx?.type === 'income' && Number(tx.amount) > 0)
      : [];
    const latest = [...incomes].sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))[0];
    if (!latest) return null;

    const plans = Array.isArray(candidate.allowancePlans) ? candidate.allowancePlans : [];
    const plan = plans.find((item) => item?.id === latest.allowanceId) || [...plans].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    const frequency = inferLegacyFrequency(plan);
    const receivedDate = /^\d{4}-\d{2}-\d{2}$/.test(latest.date || '') ? latest.date : localDateKey();
    let nextDueDate = frequency === 'irregular' ? null : nextDueDateForFrequency(frequency, receivedDate);
    if (plan?.endDate && plan.endDate >= receivedDate) nextDueDate = addDays(plan.endDate, 1);

    return {
      amount: Number(latest.amount),
      frequency,
      autoSaveAmount: 0,
      lastReceivedDate: receivedDate,
      nextDueDate
    };
  }

  function normalizeState(candidate) {
    if (!candidate || typeof candidate !== 'object') return seedState();
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: candidate.settings?.theme === 'dark' ? 'dark' : 'light',
        privacy: Boolean(candidate.settings?.privacy),
        demoData: Boolean(candidate.settings?.demoData)
      },
      accounts: Array.isArray(candidate.accounts) && candidate.accounts.length ? candidate.accounts : [{ id: uid('account'), name: 'Wallet', type: 'cash', openingBalance: 0 }],
      goals: Array.isArray(candidate.goals) ? candidate.goals : [],
      allowanceRoutine: normalizeAllowanceRoutine(candidate.allowanceRoutine, candidate),
      allowancePlans: Array.isArray(candidate.allowancePlans) ? candidate.allowancePlans : [],
      transactions: Array.isArray(candidate.transactions) ? candidate.transactions : [],
      checkins: candidate.checkins && typeof candidate.checkins === 'object' ? candidate.checkins : {}
    };
  }

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return seedState();
      const normalized = normalizeState(JSON.parse(stored));
      if (normalized.settings.demoData) {
        const clean = seedState();
        clean.settings.theme = normalized.settings.theme;
        clean.settings.privacy = normalized.settings.privacy;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        return clean;
      }
      return normalized;
    } catch (error) {
      console.warn('Unable to load saved data.', error);
      return seedState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function accountBalance(accountId) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account) return 0;
    return state.transactions.reduce((balance, tx) => {
      if (tx.type === 'income' && tx.accountId === accountId) return balance + Number(tx.amount || 0);
      if (tx.type === 'expense' && tx.accountId === accountId) return balance - Number(tx.amount || 0);
      if (tx.type === 'saving' && tx.accountId === accountId) return balance - Number(tx.amount || 0);
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

  function allowancePlanRemaining(plan) {
    if (!plan) return 0;
    const spent = expensesBetween(plan.startDate, plan.endDate);
    return Math.max(0, Number(plan.amount || 0) - spent - Number(plan.savingsAmount || 0));
  }

  function transactionTitle(tx) {
    if (tx.type === 'income') return tx.note || 'Allowance received';
    if (tx.type === 'saving') return tx.note || 'Moved to savings';
    return tx.note || tx.category || 'Expense';
  }

  function transactionSubtitle(tx) {
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Account';
    const label = DATE_LABEL.format(fromDateKey(tx.date));
    if (tx.type === 'saving') return `Saved from ${account} · ${label}`;
    return `${tx.category || 'Transaction'} · ${account} · ${label}`;
  }

  function renderTransactionActions(tx) {
    if (!canModifyTransaction(tx)) {
      return `<div class="transaction-actions"><span class="transaction-lock">${icon('i-lock')} Locked</span><small class="transaction-window">Older than 24 hours</small></div>`;
    }
    const actions = [];
    if (canEditTransaction(tx)) actions.push(`<button class="transaction-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')} Edit</button>`);
    actions.push(`<button class="transaction-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')} Undo</button>`);
    return `<div class="transaction-actions"><div class="transaction-actions-row">${actions.join('')}</div><small class="transaction-window">${escapeHtml(transactionWindowLabel(tx))}</small></div>`;
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
            <small>${tx.type === 'saving' ? 'saved' : tx.type}</small>
          </div>
          ${full ? renderTransactionActions(tx) : ''}
        </div>`;
    }).join('');
  }

  function renderAllowancePrompt() {
    const today = localDateKey();
    const routine = state.allowanceRoutine;
    const holder = els.allowancePrompt;

    if (!routine) {
      holder.innerHTML = `
        <article class="daily-prompt allowance-setup-prompt">
          <div class="daily-prompt-copy">
            <span class="round-icon accent-soft">${icon('i-wallet')}</span>
            <div><p class="eyebrow">Allowance</p><h2>Set your usual allowance</h2><p>Set the amount and schedule once. After that, receiving it takes one tap.</p></div>
          </div>
          <div class="daily-prompt-actions">
            <button class="button-primary" type="button" data-action="open-allowance-routine">Set it up</button>
          </div>
        </article>`;
      return;
    }

    const amount = state.settings.privacy ? '₱••••' : currency(routine.amount, true);
    const nextDate = routine.nextDueDate;
    const receivedToday = routine.lastReceivedDate === today;
    const nextText = nextDate && nextDate > today ? DATE_LABEL.format(fromDateKey(nextDate)) : '';

    if (receivedToday) {
      holder.innerHTML = `
        <div class="prompt-compact allowance-status">
          ${icon('i-check')}
          <span><strong>${amount} received today.</strong> ${nextText ? `Next allowance: ${escapeHtml(nextText)}.` : 'Pocket is ready whenever the next one arrives.'}</span>
        </div>`;
      return;
    }

    if (nextDate && nextDate > today) {
      const days = daysUntil(today, nextDate);
      holder.innerHTML = `
        <div class="prompt-compact allowance-status">
          ${icon('i-calendar')}
          <span><strong>Next allowance ${days === 1 ? 'tomorrow' : `in ${days} days`}.</strong> ${amount} usual · ${escapeHtml(frequencyLabel(routine.frequency))}</span>
          <button class="text-button" type="button" data-action="receive-usual-allowance">Received early</button>
        </div>`;
      return;
    }

    const autoSave = Number(routine.autoSaveAmount || 0);
    const helper = routine.frequency === 'irregular'
      ? 'Tap once when it arrives.'
      : autoSave > 0
        ? (state.settings.privacy ? 'Automatic saving is on.' : `${currency(Math.max(0, routine.amount - autoSave), true)} to spend · ${currency(autoSave, true)} to savings.`)
        : `Your ${frequencyLabel(routine.frequency).toLowerCase()} allowance is due.`;

    holder.innerHTML = `
      <article class="daily-prompt allowance-due-prompt">
        <div class="daily-prompt-copy">
          <span class="round-icon accent-soft">${icon('i-sparkle')}</span>
          <div><p class="eyebrow">${routine.frequency === 'irregular' ? 'Allowance' : 'Allowance day 🎉'}</p><h2>${amount} usual allowance</h2><p>${escapeHtml(helper)}</p></div>
        </div>
        <div class="daily-prompt-actions">
          <button class="button-secondary" type="button" data-action="open-allowance">Different amount</button>
          <button class="button-primary" type="button" data-action="receive-usual-allowance">Received ${amount}</button>
        </div>
      </article>`;
  }

  function renderAllowancePlan() {
    const plan = activeAllowancePlan();
    const routine = state.allowanceRoutine;
    if (!plan) {
      if (!routine) {
        els.allowancePlanCard.innerHTML = `
          <div class="empty-plan">
            <div><p class="eyebrow">Allowance</p><h2>No allowance routine yet</h2><p>Set your usual amount once and Pocket will handle the repeating schedule.</p></div>
            <button class="button-primary" type="button" data-action="open-allowance-routine">Set allowance</button>
          </div>`;
      } else {
        const next = routine.nextDueDate && routine.nextDueDate > localDateKey() ? DATE_LABEL.format(fromDateKey(routine.nextDueDate)) : 'when it arrives';
        els.allowancePlanCard.innerHTML = `
          <div class="empty-plan">
            <div><p class="eyebrow">Usual allowance</p><h2 class="money-value">${currency(routine.amount, true)}</h2><p>${escapeHtml(frequencyLabel(routine.frequency))} · Next ${escapeHtml(next)}</p></div>
            <button class="button-secondary" type="button" data-action="open-allowance-routine">Edit</button>
          </div>`;
      }
      return;
    }

    const spent = expensesBetween(plan.startDate, plan.endDate);
    const remaining = allowancePlanRemaining(plan);
    const availableFromPlan = Math.max(0, Number(plan.amount || 0) - Number(plan.savingsAmount || 0));
    const usedPercent = Math.min(100, (spent / Math.max(availableFromPlan, 1)) * 100);
    const today = localDateKey();
    const hasIrregularDate = !(routine?.frequency === 'irregular' && !routine?.nextDueDate);
    const nextDate = hasIrregularDate ? (routine?.nextDueDate && routine.nextDueDate > today ? routine.nextDueDate : addDays(plan.endDate, 1)) : null;
    const untilNext = nextDate ? daysUntil(today, nextDate) : 0;
    const perDay = untilNext > 0 ? remaining / untilNext : 0;
    const nextLabel = !hasIrregularDate
      ? 'No next date set'
      : untilNext === 1 ? '1 day until next allowance' : `${untilNext} days until next allowance`;

    const activitySummary = state.settings.privacy
      ? 'Spending details hidden'
      : `${currency(spent, true)} spent${Number(plan.savingsAmount || 0) > 0 ? ` · ${currency(plan.savingsAmount, true)} saved` : ''}`;

    els.allowancePlanCard.innerHTML = `
      <div class="plan-header allowance-simple-head">
        <div><p class="eyebrow">Current allowance</p><h2 class="allowance-left money-value">${currency(remaining, true)} left</h2><p>${escapeHtml(nextLabel)}</p></div>
        <button class="text-button" type="button" data-action="open-allowance-routine">Edit routine</button>
      </div>
      <div class="plan-progress" aria-label="Allowance spent"><span style="width:${usedPercent.toFixed(1)}%"></span></div>
      <div class="allowance-simple-footer">
        <strong class="money-value">${untilNext > 0 ? `About ${currency(perDay, true)}/day` : 'Spend at your own pace'}</strong>
        <span>${escapeHtml(activitySummary)}</span>
      </div>`;
  }

  function topGoal() {
    return [...state.goals].sort((a, b) => {
      const aProgress = Number(a.current || 0) / Math.max(Number(a.target || 1), 1);
      const bProgress = Number(b.current || 0) / Math.max(Number(b.target || 1), 1);
      return bProgress - aProgress;
    })[0] || null;
  }

  function renderSavingsMini() {
    const goal = topGoal();
    if (!goal) {
      els.savingsMini.innerHTML = `<div class="empty-plan"><div><p class="eyebrow">Savings</p><h2>Create your first goal</h2><p>Saved money stays separate from what you can spend.</p></div><button class="button-primary" type="button" data-action="open-goal">Add</button></div>`;
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
    const todayExpenses = todayTransactions.filter((tx) => tx.type === 'expense');
    const received = todayTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const spent = todayExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const plan = activeAllowancePlan();
    const totalAvailable = totalBalance();
    const routine = state.allowanceRoutine;
    const nextDate = routine?.nextDueDate || (plan ? addDays(plan.endDate, 1) : null);
    const untilNext = nextDate && nextDate > today ? daysUntil(today, nextDate) : 0;
    const perDay = untilNext > 0 ? Math.max(0, allowancePlanRemaining(plan)) / untilNext : 0;
    const topCategoryEntry = Object.entries(todayExpenses.reduce((map, tx) => {
      map[tx.category] = (map[tx.category] || 0) + Number(tx.amount || 0);
      return map;
    }, {})).sort((a, b) => b[1] - a[1])[0];
    const topCategory = topCategoryEntry ? `${topCategoryEntry[0]} · ${currency(topCategoryEntry[1], true)}` : 'No spending yet';

    els.currentBalance.textContent = currency(totalAvailable);
    els.todayReceived.textContent = currency(received, true);
    els.todaySpent.textContent = currency(spent, true);
    els.homeDailyPace.textContent = perDay > 0 ? currency(perDay, true) : currency(totalAvailable, true);
    els.homeDailyPaceHint.textContent = perDay > 0
      ? `About ${currency(perDay, true)} a day until your next allowance.`
      : routine ? 'This shows what you can freely spend right now.' : 'Set a usual allowance to unlock daily pacing.';
    replayAnimation(els.currentBalance, 'amount-pop');
    replayAnimation(els.homeDailyPace, 'amount-pop');

    renderAllowancePrompt();
    renderAllowancePlan();

    const leftForToday = perDay > 0 ? Math.max(0, perDay - spent) : totalAvailable;
    els.homeOverview.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Today</p><h2>Quick look</h2></div>
        <span class="round-icon accent-soft">${icon('i-activity')}</span>
      </div>
      <p class="home-overview-copy">Simple at-a-glance info so Home stays clean.</p>
      <div class="home-insight-grid">
        <div class="home-insight-tile"><small>Spent today</small><strong class="money-value">${currency(spent, true)}</strong></div>
        <div class="home-insight-tile"><small>Entries today</small><strong>${todayExpenses.length}</strong></div>
        <div class="home-insight-tile"><small>Top category</small><strong>${escapeHtml(topCategory)}</strong></div>
      </div>`;

    const guideItems = [];
    guideItems.push({ iconTone: 'accent-soft', iconId: 'i-wallet', title: 'Available now', copy: `${currency(totalAvailable, true)} is ready for spending.` });
    if (plan && untilNext > 0) guideItems.push({ iconTone: 'purple-soft', iconId: 'i-calendar', title: 'Daily pace', copy: `${currency(leftForToday, true)} left for today from your suggested pace.` });
    else guideItems.push({ iconTone: 'purple-soft', iconId: 'i-calendar', title: 'Allowance rhythm', copy: routine ? 'Record your next allowance when it arrives.' : 'Set your usual allowance so Pocket can guide your pace.' });
    guideItems.push({ iconTone: 'amber-soft', iconId: 'i-food', title: 'Spending focus', copy: topCategoryEntry ? `${topCategoryEntry[0]} is the biggest spend today.` : 'No spending yet today. Nice and clean.' });

    const secondaryAction = routine ? '<button class="button-secondary" type="button" data-view="activity">View activity</button>' : '<button class="button-secondary" type="button" data-action="open-allowance-routine">Set allowance</button>';
    els.homeRhythm.innerHTML = `
      <div class="section-heading">
        <div><p class="eyebrow">Pocket guide</p><h2>Keep it easy</h2></div>
        <span class="round-icon green-soft">${icon('i-sparkle')}</span>
      </div>
      <p class="home-rhythm-copy">A lighter home screen that keeps your most useful reminders front and center.</p>
      <ul class="home-rhythm-list">${guideItems.map((item) => `<li><span class="round-icon ${item.iconTone}">${icon(item.iconId)}</span><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.copy)}</span></div></li>`).join('')}</ul>
      <div class="home-rhythm-actions">
        <button class="button-primary" type="button" data-action="open-expense">Add expense</button>
        ${secondaryAction}
      </div>`;
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
    replayAnimation(els.totalSavings, 'amount-pop');
    if (!state.goals.length) {
      els.goalsGrid.innerHTML = `<article class="card goal-card"><div class="empty-state"><span class="round-icon purple-soft">${icon('i-target')}</span><strong>No savings goals yet</strong><span>Create a goal and move money out of your spendable wallet.</span><br><button class="button-primary" type="button" data-action="open-goal">Create goal</button></div></article>`;
    } else {
      els.goalsGrid.innerHTML = state.goals.map((goal) => {
        const current = Number(goal.current || 0);
        const target = Math.max(Number(goal.target || 1), 1);
        const percent = Math.min(100, current / target * 100);
        return `
          <article class="card goal-card">
            <div class="goal-card-head">
              <div><p class="eyebrow">Savings goal</p><h3>${escapeHtml(goal.name)}</h3><p class="goal-amount money-value">${currency(current, true)} of ${currency(target, true)}</p></div>
              <span class="round-icon green-soft">${icon('i-target')}</span>
            </div>
            <div class="goal-progress"><span style="width:${percent.toFixed(1)}%"></span></div>
            <div class="goal-footer"><small>${Math.round(percent)}% complete</small><button class="button-secondary" type="button" data-action="open-contribution" data-goal-id="${escapeHtml(goal.id)}">Add savings</button></div>
          </article>`;
      }).join('');
    }

    const goal = topGoal();
    const autoSave = Number(state.allowanceRoutine?.autoSaveAmount || 0);
    if (goal) {
      const remaining = Math.max(0, Number(goal.target) - Number(goal.current));
      if (remaining <= 0) {
        els.savingsInsight.textContent = `You completed “${goal.name}.” Create another goal when you have something specific you want to save for.`;
      } else if (autoSave > 0) {
        els.savingsInsight.textContent = state.settings.privacy
          ? `Automatic saving is on and will move part of each allowance to “${goal.name}”.`
          : `${currency(autoSave, true)} from each allowance will move to “${goal.name}” automatically.`;
      } else {
        els.savingsInsight.textContent = `You can add money to “${goal.name}” manually, or turn on automatic saving in your usual allowance settings.`;
      }
    } else {
      els.savingsInsight.textContent = autoSave > 0
        ? 'Automatic saving is on. Pocket will create an Emergency fund the next time allowance is received.'
        : 'Create a savings goal whenever you have something specific you want to set money aside for.';
    }
  }

  function renderSettings() {
    els.themeLabel.textContent = state.settings.theme === 'dark' ? 'Dark' : 'Light';
    els.themeIcon.innerHTML = `<use href="#${state.settings.theme === 'dark' ? 'i-sun' : 'i-moon'}"></use>`;
    els.privacyLabel.textContent = state.settings.privacy ? 'Amounts hidden' : 'Amounts visible';
    els.privacySwitch.classList.toggle('is-on', state.settings.privacy);

    const routine = state.allowanceRoutine;
    if (!routine) {
      els.allowanceRoutineAmount.classList.remove('money-value');
      els.allowanceRoutineAmount.textContent = 'Not set';
      els.allowanceRoutineSummary.textContent = 'Set it once, then record allowance in one tap.';
    } else {
      els.allowanceRoutineAmount.textContent = state.settings.privacy ? '₱•••• usual allowance' : `${currency(routine.amount, true)} usual allowance`;
      els.allowanceRoutineAmount.classList.toggle('money-value', !state.settings.privacy);
      const saving = Number(routine.autoSaveAmount || 0);
      els.allowanceRoutineSummary.textContent = `${frequencyLabel(routine.frequency)}${saving > 0 ? (state.settings.privacy ? ' · Automatic saving on' : ` · Saves ${currency(saving, true)} automatically`) : ' · No automatic saving'}`;
    }
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
    document.documentElement.dataset.theme = state.settings.theme;
    renderHeader();
    renderPrivacy();
    renderHome();
    renderActivity();
    renderSavings();
    renderSettings();
    populateAccounts();
  }

  function populateAccounts() {
    const current = els.expenseAccount.value;
    els.expenseAccount.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${state.settings.privacy ? '₱••••' : currency(accountBalance(account.id), true)}</option>`).join('');
    if (state.accounts.some((account) => account.id === current)) els.expenseAccount.value = current;
  }

  function updateExpenseDetailsSummary() {
    const account = state.accounts.find((item) => item.id === els.expenseAccount.value) || state.accounts[0];
    const date = els.expenseDate.value || localDateKey();
    const dateLabel = date === localDateKey() ? 'Today' : DATE_LABEL.format(fromDateKey(date));
    els.expenseDetailsSummary.textContent = `${account?.name || 'Wallet'} · ${dateLabel}`;
  }

  function updateExpenseEntry() {
    const amount = Number(els.expenseAmount.value || 0);
    const accountId = els.expenseAccount.value || state.accounts[0]?.id;
    const account = state.accounts.find((item) => item.id === accountId);
    const available = spendableAvailableForEntry(accountId, currentExpenseEditId);
    const isValid = Number.isFinite(amount) && amount > 0;
    const isOver = isValid && amount > available;

    els.expenseAvailable.textContent = state.settings.privacy ? 'Available ₱••••' : `Available ${currency(available, true)}`;
    els.expenseAmountCard.classList.toggle('is-over-limit', isOver);

    if (available <= 0) {
      els.expenseAmountHint.textContent = `${account?.name || 'Wallet'} has no spendable money right now.`;
    } else if (isOver) {
      els.expenseAmountHint.textContent = state.settings.privacy ? `Over your available ${account?.name || 'wallet'} balance.` : `${currency(amount - available, true)} over your available ${account?.name || 'wallet'} balance.`;
    } else if (isValid) {
      els.expenseAmountHint.textContent = state.settings.privacy ? 'This fits your available balance.' : `${currency(available - amount, true)} will remain available.`;
    } else {
      els.expenseAmountHint.textContent = 'Use the keypad below or your keyboard.';
    }

    els.expenseSaveButton.disabled = !isValid || isOver;
    els.expenseSaveButton.textContent = isValid ? `${currentExpenseEditId ? 'Update' : 'Save'} ${currency(amount, true)}` : (currentExpenseEditId ? 'Update expense' : 'Save expense');
  }

  function setExpenseAmountValue(value) {
    els.expenseAmount.value = value;
    updateExpenseEntry();
    replayAnimation(els.expenseAmountCard, 'is-keyed');
  }

  function handleExpenseKey(key) {
    setExpenseAmountValue(applyAmountKey(els.expenseAmount.value || '', key, { allowDecimal: true, maxWholeDigits: 7 }));
  }

  function setAllowanceRoutineAmountValue(value) {
    els.allowanceRoutineAmountInput.value = value;
    const amount = Number(value || 0);
    if (amount > 0) {
      els.allowanceAutoSaveAmount.max = String(amount);
      if (Number(els.allowanceAutoSaveAmount.value || 0) > amount) els.allowanceAutoSaveAmount.value = String(amount);
    }
  }

  function handleRoutineAmountKey(key) {
    setAllowanceRoutineAmountValue(applyAmountKey(els.allowanceRoutineAmountInput.value || '', key, { allowDecimal: false, maxWholeDigits: 7 }));
  }

  function setAllowanceAmountValue(value) {
    els.allowanceAmount.value = value;
    updateAllowanceAutoSaveHint(Number(value || 0));
  }

  function handleAllowanceAmountKey(key) {
    setAllowanceAmountValue(applyAmountKey(els.allowanceAmount.value || '', key, { allowDecimal: false, maxWholeDigits: 7 }));
  }

  function setView(view, updateHash = true) {
    if (!['home', 'activity', 'savings', 'more'].includes(view)) view = 'home';
    currentView = view;
    document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    renderHeader();
    if (view === 'activity') renderActivity();
    if (view === 'savings') renderSavings();
    if (updateHash) history.replaceState(null, '', `#${view}`);
    els.contentScroll.scrollTop = 0;
  }

  function replayAnimation(element, className) {
    if (!element) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  function celebrateSavings() {
    const burst = document.createElement('div');
    burst.className = 'savings-celebration';
    burst.setAttribute('aria-hidden', 'true');
    const points = [
      [-54, -32], [-26, -58], [8, -66], [42, -48], [58, -10], [34, 34], [-5, 48], [-42, 28]
    ];
    burst.innerHTML = points.map(([x, y], index) => `<span style="--x:${x}px;--y:${y}px;--delay:${index * 22}ms">${icon('i-sparkle')}</span>`).join('');
    document.body.appendChild(burst);
    window.setTimeout(() => burst.remove(), 900);
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
    currentExpenseEditId = prefill.id || null;
    els.expenseForm.reset();
    els.expenseDetails.open = false;
    els.expenseDialogTitle.textContent = currentExpenseEditId ? 'Edit expense' : 'Add expense';
    els.expenseDate.value = prefill.date || localDateKey();
    els.expenseAmount.value = prefill.amount || '';
    if (prefill.category) {
      const radio = els.expenseForm.querySelector(`input[name="expenseCategory"][value="${CSS.escape(prefill.category)}"]`);
      if (radio) radio.checked = true;
    }
    els.expenseNote.value = prefill.note || '';
    populateAccounts();
    if (prefill.accountId && state.accounts.some((account) => account.id === prefill.accountId)) els.expenseAccount.value = prefill.accountId;
    updateExpenseDetailsSummary();
    updateExpenseEntry();
    openDialog(els.expenseDialog);
    requestAnimationFrame(() => els.expenseDialog.focus());
  }

  function updateAllowanceAutoSaveUI() {
    const enabled = els.allowanceAutoSaveEnabled.checked;
    els.allowanceAutoSaveWrap.classList.toggle('is-hidden', !enabled);
    if (enabled && !els.allowanceAutoSaveAmount.value) {
      const usual = Math.max(1, Number(els.allowanceRoutineAmountInput.value || 50));
      els.allowanceAutoSaveAmount.value = String(Math.min(50, usual));
    }
  }

  function openAllowanceRoutine() {
    const routine = state.allowanceRoutine;
    els.allowanceRoutineForm.reset();
    els.allowanceRoutineTitle.textContent = routine ? 'Edit your usual allowance' : 'Set your usual allowance';
    setAllowanceRoutineAmountValue(routine?.amount || '');
    const frequency = routine?.frequency || 'weekly';
    const radio = els.allowanceRoutineForm.querySelector(`input[name="allowanceFrequency"][value="${CSS.escape(frequency)}"]`);
    if (radio) radio.checked = true;
    const autoSave = Number(routine?.autoSaveAmount || 0);
    els.allowanceAutoSaveEnabled.checked = autoSave > 0;
    els.allowanceAutoSaveAmount.value = autoSave > 0 ? String(autoSave) : '';
    if (routine?.amount) els.allowanceAutoSaveAmount.max = String(routine.amount);
    updateAllowanceAutoSaveUI();
    openDialog(els.allowanceRoutineDialog);
    requestAnimationFrame(() => els.allowanceRoutineDialog.focus());
  }

  function saveAllowanceRoutine() {
    const amount = Number(els.allowanceRoutineAmountInput.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const frequency = els.allowanceRoutineForm.elements.allowanceFrequency.value;
    const autoSaveAmount = els.allowanceAutoSaveEnabled.checked ? Number(els.allowanceAutoSaveAmount.value || 0) : 0;
    if (!Number.isFinite(autoSaveAmount) || autoSaveAmount < 0) return;
    if (els.allowanceAutoSaveEnabled.checked && autoSaveAmount <= 0) {
      showToast('Enter how much you want to save automatically.');
      return;
    }
    if (autoSaveAmount > amount) {
      showToast('Automatic savings cannot be more than your usual allowance.');
      return;
    }

    const today = localDateKey();
    const previous = state.allowanceRoutine;
    let lastReceivedDate = previous?.lastReceivedDate || null;
    let nextDueDate = previous?.nextDueDate || null;

    if (!previous) {
      nextDueDate = today;
    } else if (frequency !== previous.frequency) {
      nextDueDate = frequency === 'irregular' ? null : (lastReceivedDate ? nextDueDateForFrequency(frequency, lastReceivedDate) : today);
      if (nextDueDate && nextDueDate < today) nextDueDate = today;
    } else if (frequency !== 'irregular' && !nextDueDate) {
      nextDueDate = lastReceivedDate ? nextDueDateForFrequency(frequency, lastReceivedDate) : today;
    }

    if (previous && frequency !== previous.frequency && lastReceivedDate) {
      const currentPlan = [...state.allowancePlans]
        .filter((plan) => plan.status === 'active' && plan.startDate === lastReceivedDate)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
      if (currentPlan) currentPlan.endDate = coverageEndForFrequency(frequency, currentPlan.startDate, nextDueDate);
    }

    state.allowanceRoutine = { amount, frequency, autoSaveAmount, lastReceivedDate, nextDueDate };
    state.settings.demoData = false;
    saveState();
    closeDialog(els.allowanceRoutineDialog);
    renderAll();
    showToast(previous ? 'Usual allowance updated.' : 'Usual allowance saved.');
  }

  function updateAllowanceAutoSaveHint(amount = Number(els.allowanceAmount.value || 0)) {
    const routine = state.allowanceRoutine;
    const autoSave = Math.min(Math.max(0, Number(routine?.autoSaveAmount || 0)), Math.max(0, Number(amount) || 0));
    els.allowanceAutoSaveHint.classList.toggle('is-hidden', autoSave <= 0);
    if (autoSave <= 0) return;
    els.allowanceAutoSaveHintTitle.textContent = state.settings.privacy ? 'Automatic saving is on' : `${currency(autoSave, true)} will go to Savings`;
    els.allowanceAutoSaveHintText.textContent = state.settings.privacy
      ? 'Part of this allowance will move to Savings automatically.'
      : `${currency(Math.max(0, Number(amount || 0) - autoSave), true)} from this allowance will stay available to spend.`;
  }

  function openDifferentAllowance() {
    const routine = state.allowanceRoutine;
    if (!routine) {
      openAllowanceRoutine();
      return;
    }
    els.allowanceForm.reset();
    setAllowanceAmountValue(routine.amount || '');
    const irregular = routine.frequency === 'irregular';
    els.allowanceNextDateWrap.classList.toggle('is-hidden', !irregular);
    els.allowanceNextDate.min = addDays(localDateKey(), 1);
    els.allowanceNextDate.value = irregular && routine.nextDueDate && routine.nextDueDate > localDateKey() ? routine.nextDueDate : '';
    updateAllowanceAutoSaveHint();
    openDialog(els.allowanceDialog);
    requestAnimationFrame(() => els.allowanceDialog.focus());
  }

  function receiveAllowance(amount, expectedNextDate = null) {
    const routine = state.allowanceRoutine;
    const received = Number(amount);
    if (!routine || !Number.isFinite(received) || received <= 0) return;

    const today = localDateKey();
    const accountId = state.accounts[0]?.id;
    if (!accountId) return;
    const frequency = routine.frequency;
    const nextDueDate = frequency === 'irregular'
      ? (expectedNextDate && expectedNextDate > today ? expectedNextDate : null)
      : nextDueDateForFrequency(frequency, today);
    const endDate = coverageEndForFrequency(frequency, today, nextDueDate);
    const savingAmount = Math.min(received, Math.max(0, Number(routine.autoSaveAmount || 0)));
    const planId = uid('allowance');

    state.allowancePlans.forEach((plan) => {
      if (plan.status === 'active') plan.status = 'completed';
    });

    state.allowancePlans.push({
      id: planId,
      amount: received,
      startDate: today,
      endDate,
      savingsAmount: savingAmount,
      status: 'active',
      createdAt: new Date().toISOString()
    });
    state.transactions.push({
      id: uid('tx'),
      type: 'income',
      amount: received,
      category: 'Allowance',
      accountId,
      date: today,
      note: frequency === 'irregular' ? 'Allowance received' : `${frequencyLabel(frequency)} allowance`,
      allowanceId: planId,
      createdAt: new Date().toISOString()
    });

    if (savingAmount > 0) {
      let goal = topGoal();
      if (!goal) {
        goal = { id: uid('goal'), name: 'Emergency fund', target: 3000, current: 0, createdAt: today };
        state.goals.push(goal);
      }
      goal.current = Number(goal.current || 0) + savingAmount;
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

    state.allowanceRoutine.lastReceivedDate = today;
    state.allowanceRoutine.nextDueDate = nextDueDate;
    state.settings.demoData = false;
    saveState();
    closeDialog(els.allowanceDialog);
    renderAll();
    if (savingAmount > 0) celebrateSavings();
    else replayAnimation(els.allowancePrompt, 'allowance-received-pop');

    const spendablePart = received - savingAmount;
    if (state.settings.privacy) {
      showToast(savingAmount > 0 ? 'Allowance received and automatic savings moved.' : 'Allowance received.');
    } else {
      showToast(savingAmount > 0
        ? `${currency(received, true)} received · ${currency(spendablePart, true)} available · ${currency(savingAmount, true)} saved.`
        : `${currency(received, true)} allowance received.`);
    }
  }

  function addAllowance() {
    const amount = Number(els.allowanceAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const expectedNextDate = state.allowanceRoutine?.frequency === 'irregular' ? els.allowanceNextDate.value : null;
    receiveAllowance(amount, expectedNextDate);
  }

  function renderExpenseReceipt(tx, edited = false) {
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Wallet';
    const savedLabel = edited ? 'Updated' : 'Saved';
    els.expenseReceiptDialog.dataset.transactionId = tx.id;
    lastReceiptTransactionId = tx.id;
    els.expenseReceiptContent.innerHTML = `
      <div class="receipt-head">
        <div><small class="eyebrow">Pocket receipt</small><strong>${escapeHtml(tx.category || 'Expense')}</strong></div>
        <span class="receipt-stamp">${savedLabel}</span>
      </div>
      <div class="receipt-amount money-value">${currency(tx.amount, true)}</div>
      <div class="receipt-divider"></div>
      <div class="receipt-lines">
        <div class="receipt-line"><span>Paid from</span><strong>${escapeHtml(account)}</strong></div>
        <div class="receipt-line"><span>Date</span><strong>${escapeHtml(DATE_LABEL.format(fromDateKey(tx.date)))}</strong></div>
        <div class="receipt-line"><span>Editable</span><strong>${escapeHtml(transactionWindowLabel(tx))}</strong></div>
      </div>
      ${tx.note ? `<div class="receipt-note">${escapeHtml(tx.note)}</div>` : ''}`;
    openDialog(els.expenseReceiptDialog);
  }

  function addExpense() {
    const amount = Number(els.expenseAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const category = els.expenseForm.elements.expenseCategory.value;
    const accountId = els.expenseAccount.value || state.accounts[0]?.id;
    const date = els.expenseDate.value || localDateKey();
    const note = els.expenseNote.value.trim();
    const available = spendableAvailableForEntry(accountId, currentExpenseEditId);
    if (amount > available) {
      const accountName = state.accounts.find((account) => account.id === accountId)?.name || 'this account';
      showToast(`Only ${currency(Math.max(0, available), true)} is available in ${accountName}. Savings stays separate.`);
      return;
    }

    let savedTransaction;
    const editing = Boolean(currentExpenseEditId);
    if (editing) {
      const tx = state.transactions.find((item) => item.id === currentExpenseEditId && item.type === 'expense');
      if (!tx) return;
      if (!canModifyTransaction(tx)) {
        showToast('This transaction is already locked after 24 hours.');
        currentExpenseEditId = null;
        closeDialog(els.expenseDialog);
        return;
      }
      Object.assign(tx, { amount, category, accountId, date, note, updatedAt: new Date().toISOString() });
      savedTransaction = tx;
    } else {
      savedTransaction = {
        id: uid('tx'),
        type: 'expense',
        amount,
        category,
        accountId,
        date,
        note,
        createdAt: new Date().toISOString()
      };
      state.transactions.push(savedTransaction);
    }

    state.settings.demoData = false;
    saveState();
    closeDialog(els.expenseDialog);
    renderAll();
    renderExpenseReceipt(savedTransaction, editing);
    currentExpenseEditId = null;
  }

  function addGoal() {
    const name = els.goalName.value.trim();
    const target = Number(els.goalTarget.value);
    const current = Math.max(0, Number(els.goalCurrent.value || 0));
    if (!name || !Number.isFinite(target) || target <= 0) return;
    const startingAmount = Math.min(current, target);
    const accountId = state.accounts[0]?.id;
    const available = accountBalance(accountId);
    if (startingAmount > available) {
      showToast(`You only have ${currency(Math.max(0, available), true)} available to move into savings.`);
      return;
    }
    state.goals.push({ id: uid('goal'), name, target, current: startingAmount, createdAt: localDateKey() });
    if (startingAmount > 0) {
      state.transactions.push({ id: uid('tx'), type: 'saving', amount: startingAmount, category: 'Savings', accountId, date: localDateKey(), note: name, createdAt: new Date().toISOString() });
    }
    state.settings.demoData = false;
    saveState();
    closeDialog(els.goalDialog);
    renderAll();
    setView('savings');
    if (startingAmount > 0) celebrateSavings();
    showToast(`“${name}” goal created.`);
  }

  function openContribution(goalId, suggestedAmount = '') {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    els.contributeGoalId.value = goal.id;
    els.contributeTitle.textContent = goal.name;
    els.contributeAmount.value = suggestedAmount || '';
    openDialog(els.contributeDialog);
    requestAnimationFrame(() => els.contributeAmount.focus());
  }

  function addContribution() {
    const goal = state.goals.find((item) => item.id === els.contributeGoalId.value);
    const amount = Number(els.contributeAmount.value);
    if (!goal || !Number.isFinite(amount) || amount <= 0) return;
    const accountId = state.accounts[0]?.id;
    const available = accountBalance(accountId);
    if (amount > available) {
      showToast(`You only have ${currency(Math.max(0, available), true)} available to move into savings.`);
      return;
    }
    goal.current = Number(goal.current || 0) + amount;
    state.transactions.push({
      id: uid('tx'), type: 'saving', amount, category: 'Savings', accountId,
      date: localDateKey(), note: goal.name, goalId: goal.id, createdAt: new Date().toISOString()
    });
    state.settings.demoData = false;
    saveState();
    closeDialog(els.contributeDialog);
    renderAll();
    celebrateSavings();
    showToast(`${currency(amount, true)} saved for ${goal.name}.`);
  }

  function syncAllowanceRoutineFromHistory() {
    const routine = state.allowanceRoutine;
    if (!routine) return;
    const latest = [...state.transactions]
      .filter((tx) => tx.type === 'income' && Number(tx.amount) > 0)
      .sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))[0];
    if (!latest) {
      routine.lastReceivedDate = null;
      routine.nextDueDate = routine.frequency === 'irregular' ? null : localDateKey();
      return;
    }
    routine.lastReceivedDate = latest.date || localDateKey();
    if (routine.frequency === 'irregular') {
      const plan = state.allowancePlans.find((item) => item.id === latest.allowanceId && item.status !== 'deleted');
      routine.nextDueDate = plan?.endDate && plan.endDate !== '9999-12-31' && plan.endDate > plan.startDate ? addDays(plan.endDate, 1) : null;
    } else {
      routine.nextDueDate = nextDueDateForFrequency(routine.frequency, routine.lastReceivedDate);
    }
  }

  function editTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) {
      showToast('This transaction is locked after 24 hours.');
      return;
    }
    if (tx.type !== 'expense') {
      showToast('Only expense entries can be edited. Allowance and savings can still be undone within 24 hours.');
      return;
    }
    closeDialog(els.expenseReceiptDialog);
    openExpense({ id: tx.id, amount: String(tx.amount), category: tx.category, accountId: tx.accountId, date: tx.date, note: tx.note || '' });
  }

  function undoTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) {
      showToast('This transaction is locked after 24 hours.');
      return;
    }

    confirmAction('Undo this transaction?', 'You can undo or edit entries for 24 hours only. This action will remove the selected transaction now.', 'Undo transaction', () => {
      const snapshot = cloneStateSnapshot(state);
      const groupId = tx.allowanceId || null;
      const removed = groupId ? state.transactions.filter((item) => item.allowanceId === groupId) : state.transactions.filter((item) => item.id === id);

      removed.forEach((item) => {
        if (item.type === 'saving' && item.goalId) {
          const goal = state.goals.find((goalItem) => goalItem.id === item.goalId);
          if (goal) goal.current = Math.max(0, Number(goal.current || 0) - Number(item.amount || 0));
        }
      });

      state.transactions = state.transactions.filter((item) => groupId ? item.allowanceId !== groupId : item.id !== id);
      if (groupId) {
        const plan = state.allowancePlans.find((item) => item.id === groupId);
        if (plan) plan.status = 'deleted';
        syncAllowanceRoutineFromHistory();
      }

      state.settings.demoData = false;
      saveState();
      closeDialog(els.expenseReceiptDialog);
      renderAll();
      showToast('Transaction undone.', 'Restore', () => {
        state = cloneStateSnapshot(snapshot);
        saveState();
        renderAll();
      });
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
    state = {
      version: SCHEMA_VERSION,
      settings: { theme: state.settings.theme, privacy: false, demoData: false },
      accounts: [{ id: uid('account'), name: 'Wallet', type: 'cash', openingBalance: 0 }],
      goals: [],
      allowanceRoutine: null,
      allowancePlans: [],
      transactions: [],
      checkins: {}
    };
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
      const text = await file.text();
      const imported = normalizeState(JSON.parse(text));
      confirmAction('Restore this backup?', 'Your current locally stored tracker data will be replaced by the selected backup.', 'Restore data', () => {
        state = imported;
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
    els.updateBanner.classList.add('is-visible');
    els.updateBanner.setAttribute('aria-hidden', 'false');
    els.updateStatus.textContent = 'Available';
    els.updateStatus.classList.remove('success');
  }

  function hideUpdateAvailable() {
    els.updateBanner.classList.remove('is-visible');
    els.updateBanner.setAttribute('aria-hidden', 'true');
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
    if (action === 'open-allowance') openDifferentAllowance();
    if (action === 'open-allowance-routine') openAllowanceRoutine();
    if (action === 'receive-usual-allowance') {
      if (state.allowanceRoutine) receiveAllowance(state.allowanceRoutine.amount);
      else openAllowanceRoutine();
    }
    if (action === 'apply-update') applyAvailableUpdate();
    if (action === 'dismiss-update') hideUpdateAvailable();
    if (action === 'check-update') checkForUpdates({ announce: true, force: true });
    if (action === 'open-goal') {
      els.goalForm.reset();
      els.goalCurrent.value = '0';
      openDialog(els.goalDialog);
      requestAnimationFrame(() => els.goalName.focus());
    }
    if (action === 'open-contribution') openContribution(button.dataset.goalId);
    if (action === 'edit-transaction') editTransaction(button.dataset.id);
    if (action === 'undo-transaction' || action === 'delete-transaction') undoTransaction(button.dataset.id);
    if (action === 'edit-receipt-transaction') editTransaction(els.expenseReceiptDialog.dataset.transactionId || lastReceiptTransactionId);
    if (action === 'undo-receipt-transaction') undoTransaction(els.expenseReceiptDialog.dataset.transactionId || lastReceiptTransactionId);
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
      'homeDailyPace', 'homeDailyPaceHint', 'allowancePlanCard', 'homeOverview', 'homeRhythm',
      'activitySearch', 'activityType', 'monthSpent', 'monthReceived',
      'monthSaved', 'activityCount', 'allTransactions', 'totalSavings', 'goalsGrid', 'savingsInsight', 'themeIcon',
      'themeLabel', 'privacyLabel', 'privacySwitch', 'allowanceRoutineAmount', 'allowanceRoutineSummary', 'importFile',
      'allowanceRoutineDialog', 'allowanceRoutineForm', 'allowanceRoutineTitle', 'allowanceRoutineAmountInput', 'allowanceRoutineKeypad',
      'allowanceAutoSaveEnabled', 'allowanceAutoSaveWrap', 'allowanceAutoSaveAmount', 'allowanceDialog', 'allowanceForm', 'allowanceAmount', 'allowanceKeypad',
      'allowanceNextDateWrap', 'allowanceNextDate', 'allowanceAutoSaveHint', 'allowanceAutoSaveHintTitle', 'allowanceAutoSaveHintText',
      'expenseDialog', 'expenseForm', 'expenseDialogTitle', 'expenseReceiptDialog', 'expenseReceiptContent',
      'expenseAmount', 'expenseAmountCard', 'expenseAvailable', 'expenseAmountHint', 'expenseKeypad', 'expenseAccount',
      'expenseDate', 'expenseNote', 'expenseDetails', 'expenseDetailsSummary', 'expenseSaveButton', 'goalDialog', 'goalForm', 'goalName', 'goalTarget',
      'goalCurrent', 'contributeDialog', 'contributeForm', 'contributeTitle', 'contributeGoalId', 'contributeAmount',
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

    document.getElementById('allowanceRoutineAmountChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-routine-amount]');
      if (!button) return;
      setAllowanceRoutineAmountValue(button.dataset.routineAmount);
    });
    els.allowanceAutoSaveEnabled.addEventListener('change', updateAllowanceAutoSaveUI);
    els.allowanceRoutineForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveAllowanceRoutine();
    });

    els.allowanceAmount.addEventListener('input', () => updateAllowanceAutoSaveHint());
    document.getElementById('allowanceAmountChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-amount]');
      if (!button) return;
      setAllowanceAmountValue(button.dataset.amount);
    });
    els.allowanceForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addAllowance();
    });
    els.allowanceRoutineKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-routine-key]');
      if (!button) return;
      handleRoutineAmountKey(button.dataset.routineKey);
    });
    els.allowanceKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-allowance-key]');
      if (!button) return;
      handleAllowanceAmountKey(button.dataset.allowanceKey);
    });
    els.allowanceRoutineDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, false);
      if (!key) return;
      event.preventDefault();
      handleRoutineAmountKey(key);
    });
    els.allowanceDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, false);
      if (!key) return;
      event.preventDefault();
      handleAllowanceAmountKey(key);
    });
    document.querySelector('.expense-quick-chips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-expense-quick]');
      if (!button) return;
      const current = Number(els.expenseAmount.value || 0);
      const next = current + Number(button.dataset.expenseQuick || 0);
      setExpenseAmountValue(String(next));
    });
    els.expenseKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-expense-key]');
      if (!button) return;
      handleExpenseKey(button.dataset.expenseKey);
    });
    els.expenseAccount.addEventListener('change', () => {
      updateExpenseDetailsSummary();
      updateExpenseEntry();
    });
    els.expenseDate.addEventListener('change', updateExpenseDetailsSummary);
    els.expenseDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, true);
      if (!key) return;
      event.preventDefault();
      handleExpenseKey(key);
    });

    els.expenseForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addExpense();
    });
    els.goalForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addGoal();
    });
    els.contributeForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addContribution();
    });
    els.confirmDialog.querySelector('form').addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') { pendingConfirm = null; return; }
      event.preventDefault();
      const action = pendingConfirm;
      pendingConfirm = null;
      closeDialog(els.confirmDialog);
      if (action) action();
    });

    els.expenseDialog.addEventListener('close', () => {
      currentExpenseEditId = null;
    });

    els.importFile.addEventListener('change', () => {
      const file = els.importFile.files?.[0];
      if (file) importData(file);
    });

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        if (!inside) dialog.close();
      });
    });

    window.addEventListener('hashchange', () => setView(location.hash.slice(1), false));
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        state = loadState();
        renderAll();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdates();
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
    bindEvents();
    renderAll();
    setView(location.hash.slice(1) || 'home', false);
    els.expenseDate.value = localDateKey();
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
