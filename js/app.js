(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-student-tracker-v1';
  const SCHEMA_VERSION = 1;
  const APP_VERSION = '1.2.0';
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
      allowancePlans: [],
      transactions: [],
      checkins: {}
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

  function averageEssentialDaily() {
    const end = localDateKey();
    const start = addDays(end, -13);
    const essentials = state.transactions.filter((tx) => tx.type === 'expense' && tx.date >= start && tx.date <= end && ['Food', 'Transport', 'School', 'Load'].includes(tx.category));
    if (!essentials.length) return 150;
    const total = essentials.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const activeDays = new Set(essentials.map((tx) => tx.date)).size;
    return Math.max(50, total / Math.max(1, activeDays));
  }

  function savingRecommendation(amount, coverageDays = 7) {
    const received = Number(amount) || 0;
    if (received <= 0) return { amount: 0, percent: 0, message: 'Enter an amount for a saving suggestion.' };

    const expectedEssentials = averageEssentialDaily() * Math.min(Math.max(coverageDays, 1), 31);
    const availableAfterReceiving = Math.max(0, totalBalance()) + received;
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
    else if (percent <= 5) message = 'A small amount looks safest while keeping enough money available for daily needs.';
    else if (percent <= 10) message = 'This keeps most of the allowance available for everyday school expenses.';
    else if (percent <= 15) message = 'Your available money appears able to cover your usual essentials.';
    else message = 'Your available money gives you enough room to save a larger share.';

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
    return { value: Math.max(0, totalBalance()) / Math.max(1, days), days };
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
      no: `<strong>No allowance today.</strong> Your available money carried forward.`,
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
        <div class="plan-stat"><span>Saved from plan</span><strong class="money-value">${currency(plan.savingsAmount || 0, true)}</strong></div>
      </div>`;
  }

  function topGoal() {
    return [...state.goals].sort((a, b) => {
      const aProgress = Number(a.current || 0) / Math.max(Number(a.target || 1), 1);
      const bProgress = Number(b.current || 0) / Math.max(Number(b.target || 1), 1);
      return bProgress - aProgress;
    })[0] || null;
  }

  function renderRecommendation() {
    const latestIncome = [...state.transactions]
      .filter((tx) => tx.type === 'income')
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))[0];
    const active = activeAllowancePlan();
    const goal = topGoal();

    if (!latestIncome) {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">Start small</p>
        <p class="recommendation-copy">Add your first allowance and Pocket will suggest a flexible amount based on how long it needs to last.</p>
        <button class="button-primary" type="button" data-action="open-allowance">Add allowance</button>`;
      return;
    }

    const planSaved = Number(active?.savingsAmount || 0);
    const coverage = active ? daysInclusive(active.startDate, active.endDate) : 7;
    const recommendation = savingRecommendation(latestIncome.amount, coverage);
    const remainingSuggestion = Math.max(0, recommendation.amount - planSaved);

    if (planSaved > 0) {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">${currency(planSaved, true)} saved</p>
        <p class="recommendation-copy">You saved part of your latest allowance${goal ? ` toward ${escapeHtml(goal.name)}` : ''}. Your daily guide already excludes that saved money.</p>
        <button class="button-secondary" type="button" data-view="savings">View savings</button>`;
    } else if (remainingSuggestion > 0 && goal) {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon purple-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount money-value">Save ${currency(remainingSuggestion, true)}</p>
        <p class="recommendation-copy">About ${recommendation.percent}% of your latest allowance looks comfortable based on your recent essential spending.</p>
        <div class="recommendation-actions"><button class="button-primary" type="button" data-action="quick-save" data-goal-id="${escapeHtml(goal.id)}" data-amount="${remainingSuggestion}">Save it</button><button class="button-secondary" type="button" data-action="dismiss-saving">Skip</button></div>`;
    } else {
      els.recommendationCard.innerHTML = `
        <div class="recommendation-top"><span class="round-icon amber-soft">${icon('i-sparkle')}</span><strong>Smart saving</strong></div>
        <p class="recommendation-amount">Keep it flexible</p>
        <p class="recommendation-copy">Your recent spending suggests keeping the current allowance available for essentials. Skipping savings can be the smarter choice.</p>`;
    }
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
    const received = todayTransactions.filter((tx) => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const spent = todayTransactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const guide = dailyGuide();

    els.currentBalance.textContent = currency(totalBalance());
    els.todayReceived.textContent = currency(received, true);
    els.todaySpent.textContent = currency(spent, true);
    els.homeSavings.textContent = currency(totalSavings());
    els.homeSavingsHint.textContent = totalSavings() > 0 ? 'Separate from your spending money.' : 'Nothing saved yet.';
    els.dailyGuide.textContent = guide.days ? currency(guide.value) : currency(0);
    els.dailyGuideHint.textContent = guide.days ? `Suggested average for the next ${guide.days} day${guide.days === 1 ? '' : 's'}.` : 'Add an allowance period to calculate a guide.';
    replayAnimation(els.currentBalance, 'amount-pop');
    replayAnimation(els.homeSavings, 'amount-pop');

    renderAllowancePrompt();
    renderAllowancePlan();
    renderRecommendation();
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
    const essential = averageEssentialDaily();
    if (goal) {
      const remaining = Math.max(0, Number(goal.target) - Number(goal.current));
      const sample = savingRecommendation(Math.max(200, essential * 2), 7);
      els.savingsInsight.textContent = remaining > 0
        ? `Based on your recent essential spending, saving around ${currency(sample.amount || 20, true)} when you receive a moderate allowance could move “${goal.name}” forward without squeezing daily spending.`
        : `You completed “${goal.name}.” Create another goal when you have something specific you want to save for.`;
    } else {
      els.savingsInsight.textContent = 'Create a goal first. Pocket will then direct accepted saving suggestions to that goal automatically.';
    }
  }

  function renderSettings() {
    els.themeLabel.textContent = state.settings.theme === 'dark' ? 'Dark' : 'Light';
    els.themeIcon.innerHTML = `<use href="#${state.settings.theme === 'dark' ? 'i-sun' : 'i-moon'}"></use>`;
    els.privacyLabel.textContent = state.settings.privacy ? 'Amounts hidden' : 'Amounts visible';
    els.privacySwitch.classList.toggle('is-on', state.settings.privacy);
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
    els.expenseAccount.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${currency(accountBalance(account.id), true)}</option>`).join('');
    if (state.accounts.some((account) => account.id === current)) els.expenseAccount.value = current;
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
      els.allowanceSuggestion.innerHTML = `<span class="round-icon purple-soft">${icon('i-sparkle')}</span><div><strong>Enter an amount for a saving suggestion.</strong><p>We’ll suggest an amount you can move out of spending.</p></div>`;
      return;
    }
    const title = suggestion.amount > 0 ? `Suggested saving: ${currency(suggestion.amount, true)} (${suggestion.percent}%)` : 'No saving suggested this time';
    els.allowanceSuggestion.innerHTML = `<span class="round-icon purple-soft">${icon('i-sparkle')}</span><div><strong>${title}</strong><p>${escapeHtml(suggestion.message)}</p></div>`;
  }

  function addAllowance() {
    const amount = Number(els.allowanceAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const today = localDateKey();
    const coverage = els.allowanceForm.elements.coverage.value;
    const endDate = coverageEndDate(coverage, els.allowanceEndDate.value);
    const days = daysInclusive(today, endDate);
    const suggestion = savingRecommendation(amount, days);
    const accountId = state.accounts[0]?.id;
    const planId = uid('allowance');
    const useSaving = els.applySuggestedSaving.checked && suggestion.amount > 0;
    let savingAmount = useSaving ? suggestion.amount : 0;

    state.allowancePlans.forEach((plan) => {
      if (plan.status === 'active' && plan.endDate < today) plan.status = 'completed';
    });

    const plan = {
      id: planId,
      amount,
      startDate: today,
      endDate,
      savingsAmount: savingAmount,
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

    state.checkins[today] = { status: 'yes', updatedAt: new Date().toISOString() };
    state.settings.demoData = false;
    saveState();
    closeDialog(els.allowanceDialog);
    renderAll();
    if (savingAmount > 0) celebrateSavings();
    showToast(savingAmount > 0 ? `${currency(amount, true)} added and ${currency(savingAmount, true)} moved to savings.` : `${currency(amount, true)} allowance added.`);
  }

  function addExpense() {
    const amount = Number(els.expenseAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const category = els.expenseForm.elements.expenseCategory.value;
    const accountId = els.expenseAccount.value || state.accounts[0]?.id;
    const date = els.expenseDate.value || localDateKey();
    const note = els.expenseNote.value.trim();
    const available = accountBalance(accountId);
    if (amount > available) {
      const accountName = state.accounts.find((account) => account.id === accountId)?.name || 'this account';
      showToast(`Only ${currency(Math.max(0, available), true)} is available in ${accountName}. Savings stays separate.`);
      return;
    }

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
    state.settings.demoData = false;
    saveState();
    closeDialog(els.expenseDialog);
    renderAll();
    showToast(`${currency(amount, true)} expense saved.`);
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

  function deleteTransaction(id) {
    const index = state.transactions.findIndex((tx) => tx.id === id);
    if (index < 0) return;
    const deleted = state.transactions[index];
    state.transactions.splice(index, 1);

    if (deleted.type === 'saving' && deleted.goalId) {
      const goal = state.goals.find((item) => item.id === deleted.goalId);
      if (goal) goal.current = Math.max(0, Number(goal.current || 0) - Number(deleted.amount || 0));
      if (deleted.allowanceId) {
        const plan = state.allowancePlans.find((item) => item.id === deleted.allowanceId);
        if (plan) plan.savingsAmount = Math.max(0, Number(plan.savingsAmount || 0) - Number(deleted.amount || 0));
      }
    }
    if (deleted.type === 'income' && deleted.allowanceId) {
      const plan = state.allowancePlans.find((item) => item.id === deleted.allowanceId);
      if (plan) plan.status = 'deleted';
    }

    pendingUndo = { deleted, index };
    saveState();
    renderAll();
    showToast('Transaction removed.', 'Undo', () => {
      if (!pendingUndo) return;
      state.transactions.splice(pendingUndo.index, 0, pendingUndo.deleted);
      if (pendingUndo.deleted.type === 'saving' && pendingUndo.deleted.goalId) {
        const goal = state.goals.find((item) => item.id === pendingUndo.deleted.goalId);
        if (goal) goal.current = Number(goal.current || 0) + Number(pendingUndo.deleted.amount || 0);
        if (pendingUndo.deleted.allowanceId) {
          const plan = state.allowancePlans.find((item) => item.id === pendingUndo.deleted.allowanceId);
          if (plan) plan.savingsAmount = Number(plan.savingsAmount || 0) + Number(pendingUndo.deleted.amount || 0);
        }
      }
      if (pendingUndo.deleted.type === 'income' && pendingUndo.deleted.allowanceId) {
        const plan = state.allowancePlans.find((item) => item.id === pendingUndo.deleted.allowanceId);
        if (plan) plan.status = 'active';
      }
      pendingUndo = null;
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
    state = {
      version: SCHEMA_VERSION,
      settings: { theme: state.settings.theme, privacy: false, demoData: false },
      accounts: [{ id: uid('account'), name: 'Wallet', type: 'cash', openingBalance: 0 }],
      goals: [],
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
      saveState(); renderAll(); showToast('Available money carried forward.');
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
    if (action === 'open-goal') {
      els.goalForm.reset();
      els.goalCurrent.value = '0';
      openDialog(els.goalDialog);
      requestAnimationFrame(() => els.goalName.focus());
    }
    if (action === 'open-contribution') openContribution(button.dataset.goalId);
    if (action === 'quick-save') openContribution(button.dataset.goalId, button.dataset.amount);
    if (action === 'dismiss-saving') showToast('Saving suggestion skipped.');
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
      'homeSavings', 'homeSavingsHint', 'dailyGuide', 'dailyGuideHint', 'allowancePlanCard', 'recommendationCard',
      'recentTransactions', 'savingsMini', 'activitySearch', 'activityType', 'monthSpent', 'monthReceived',
      'monthSaved', 'activityCount', 'allTransactions', 'totalSavings', 'goalsGrid', 'savingsInsight', 'themeIcon',
      'themeLabel', 'privacyLabel', 'privacySwitch', 'importFile', 'allowanceDialog', 'allowanceForm', 'allowanceAmount',
      'allowanceEndDate', 'customDateWrap', 'allowanceSuggestion', 'applySuggestedSaving', 'expenseDialog', 'expenseForm',
      'expenseAmount', 'expenseAccount', 'expenseDate', 'expenseNote', 'goalDialog', 'goalForm', 'goalName', 'goalTarget',
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
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addAllowance();
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
    els.allowanceEndDate.min = localDateKey();
    els.allowanceEndDate.value = addDays(localDateKey(), 6);
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
