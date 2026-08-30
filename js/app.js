(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-student-tracker-v1';
  const SCHEMA_VERSION = 1;
  const APP_VERSION = '3.2.0';
  const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;
  const DEFAULT_SECRET_PIN = '0322';
  const SECRET_POCKET_KEY = 'pocket-secret-pocket-v1';
  const SECRET_SESSION_KEY = 'pocket-secret-pocket-unlocked';
  const SECRET_TRUST_KEY = 'pocket-secret-pocket-trusted';
  const LEGACY_LIGHT_SESSION_KEY = 'pocket-light-theme-unlocked';
  const SECRET_TRIGGER_TAPS = 5;
  const SECRET_TRIGGER_WINDOW = 2200;
  const SECRET_RESET_HOLD = 8000;
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
  const TIME_LABEL = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });

  const categoryMeta = {
    Food: { icon: 'i-food', tone: 'cat-food-soft', className: 'expense-cat-food' },
    Transport: { icon: 'i-transport', tone: 'cat-transport-soft', className: 'expense-cat-transport' },
    School: { icon: 'i-school', tone: 'cat-school-soft', className: 'expense-cat-school' },
    Load: { icon: 'i-phone', tone: 'cat-load-soft', className: 'expense-cat-load' },
    Personal: { icon: 'i-user', tone: 'cat-personal-soft', className: 'expense-cat-personal' },
    Other: { icon: 'i-more', tone: 'cat-other-soft', className: 'expense-cat-other' },
    Allowance: { icon: 'i-arrow-down', tone: 'green-soft', className: 'activity-cat-allowance' },
    Savings: { icon: 'i-savings', tone: 'purple-soft', className: 'activity-cat-savings' },
    'Savings return': { icon: 'i-savings', tone: 'green-soft', className: 'activity-cat-savings-return' },
    Transfer: { icon: 'i-transfer', tone: 'accent-soft', className: 'activity-cat-transfer' }
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
  let currentAllowanceEditId = null;
  let currentTransferEditId = null;
  let walletModeIndex = 0;
  let walletCarouselFrame = 0;
  let walletCarouselResizeObserver = null;
  let savingsMode = 'total';
  let savingsWalletIndex = 0;
  let activityDate = localDateKey();
  let manageGoalsMode = false;
  let activitySwipeStartX = null;
  let lastReceiptTransactionId = '';
  let activeWalletPickerTarget = '';
  let currentGoalEditId = null;
  let currentGoalHistoryId = '';
  let companionActionTimer = 0;
  let companionAffirmationTimer = 0;
  let companionIdleTimer = 0;
  let companionBubbleTimer = 0;
  let companionPoseTimer = 0;
  let companionFocusTimer = 0;
  let companionBlinkTimer = 0;
  let companionTravelAnimation = null;
  let companionPointerState = null;
  let companionPetTimer = 0;
  let companionSingleTapTimer = 0;
  let companionLastTapAt = 0;
  let companionPointerLookFrame = 0;
  let companionGazeFrame = 0;
  let companionGazeTarget = { x: 0, y: 0 };
  let companionGazeCurrent = { x: 0, y: 0 };
  let companionPerchTarget = null;
  let companionPerchedUntil = 0;
  let companionPerchSide = 'center';
  let companionStoryGeneration = 0;
  let companionReturnGap = 0;
  let companionSessionBaseline = null;
  let secretLightAmbientTimer = 0;
  let secretLightViewToken = '';
  let companionTravelToken = 0;
  let companionFocusedElement = null;
  let companionPosition = { x: null, y: null };
  let pendingCompanionReaction = null;
  let companionLastMessageAt = 0;
  let companionQueue = [];
  let companionQueueRunning = false;
  let companionQueueGeneration = 0;
  let companionPhase = 'idle';
  let companionMood = 'relaxed';
  let secretConfig = null;
  let secretTapCount = 0;
  let secretTapTimer = 0;
  let secretResetTimer = 0;
  let secretResetTriggered = false;
  const companionEffectNodes = new Set();
  const SECRET_LIGHT_VIEW_EFFECTS = { home: 'heart', activity: 'sparkle', savings: 'confetti', more: 'soft' };
  const COMPANION_PERCH_SELECTOR = '.wallet-mode-card, .home-wallet-overview, .activity-summary-strip, .activity-day-card, .savings-balance-hero, .goal-card:not(.empty-goal-card), .settings-card';
  const COMPANION_DATA_SPEECH_LEVELS = {
    quiet: { scheduledChance: .30, viewSpeechChance: .28, viewDataChance: .72, scheduledMin: 48000, scheduledJitter: 26000, messageCooldown: 24000 },
    balanced: { scheduledChance: .56, viewSpeechChance: .50, viewDataChance: .80, scheduledMin: 30000, scheduledJitter: 20000, messageCooldown: 16000 },
    chatty: { scheduledChance: .82, viewSpeechChance: .80, viewDataChance: .91, scheduledMin: 16000, scheduledJitter: 12000, messageCooldown: 9000 },
    'very-chatty': { scheduledChance: .94, viewSpeechChance: .92, viewDataChance: .97, scheduledMin: 9000, scheduledJitter: 7000, messageCooldown: 6000 }
  };
  const companionRecentDataLines = [];
  const companionMemory = {
    savings: 0,
    expenses: 0,
    allowance: 0,
    transfers: 0,
    goals: 0,
    completed: 0,
    interactions: 0,
    lastKind: '',
    lastView: 'home'
  };
  const companionReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const COMPANION_AFFIRMATIONS = [
    'Small steps still count ♡',
    'You’re building good habits ✨',
    'Future you will thank you ♡',
    'A little saved is still progress.',
    'You’re doing better than you think ♡',
    'Steady choices, softer worries.',
    'Your goals deserve patience.',
    'Be proud of today’s progress ♡',
    'Save gently, spend mindfully.',
    'One peso at a time—you’ve got this ♡'
  ];
  const COMPANION_HEART_COMPLIMENTS = [
    'There’s something beautiful about the way you keep showing up for yourself ♡',
    'You deserve credit for the quiet effort nobody else gets to see ♡',
    'The care you give your future self is a kind of love.',
    'You don’t need a perfect day to be someone worth being proud of ♡',
    'Your discipline is growing quietly, and it looks lovely on you ✨',
    'You’re allowed to feel proud of how far you’ve come, even if you’re still growing.',
    'You have a gentle kind of strength—the kind that keeps trying ♡',
    'The fact that you keep coming back says something wonderful about you.',
    'You’re doing more than managing money—you’re building trust with yourself ♡',
    'I hope you give yourself the same kindness you give your goals.',
    'Your progress may look small today, but your effort is never small ♡',
    'You’re becoming more thoughtful with every little choice, and that matters.',
    'Even on imperfect days, there is still so much about you to be proud of ♡',
    'You’re worth cheering for, not only when you succeed, but while you’re trying too.',
    'The way you keep choosing your future is genuinely something special ♡'
  ];
  const COMPANION_VIEW_LINES = {
    home: ['Ready for a fresh little money day? ♡', 'Your pocket, your pace ✨', 'I’ll watch the numbers with you ♡'],
    activity: ['Little check-ins make habits easier ♡', 'Look at you keeping track ✨', 'Knowing where it went is already progress ♡'],
    savings: ['Tiny savings can grow into big dreams ♡', 'Your future self is cheering too ✨', 'This goal is growing with you ♡'],
    more: ['Everything is tucked neatly here ♡', 'A quick check, then back to your day ✨', 'Little routines can make money feel lighter ♡']
  };
  const COMPANION_VIEW_COMPLIMENTS = {
    home: [
      'Taking a moment to check in with yourself like this is a quiet form of self-care ♡',
      'I like how you keep making space for the future you want.',
      'You make these little check-ins mean something bigger than numbers ♡'
    ],
    activity: [
      'Facing the numbers instead of avoiding them takes more courage than people realize ♡',
      'You’re being honest with yourself, and that is such a strong habit to build.',
      'Keeping track—even after an imperfect day—is something to be proud of ♡'
    ],
    savings: [
      'The way you keep choosing your future is genuinely beautiful ♡',
      'Every little amount you save says, “my future matters too.”',
      'You’re turning patience into something real. That’s pretty amazing ♡'
    ],
    more: [
      'Taking time to organize things is a quiet kind of self-respect ♡',
      'You’re creating a little more calm for yourself, one setting at a time.',
      'I hope you notice how much care you put into making things work for you ♡'
    ]
  };

  function defaultCompanionProfile() {
    return {
      name: 'Bunny',
      affection: 18,
      energy: 72,
      mood: 'calm',
      personality: 'gentle',
      accessory: 'none',
      unlockedAccessories: ['none', 'glasses', 'scarf', 'star'],
      taps: 0,
      pets: 0,
      drags: 0,
      roomVisits: 0,
      roomActions: 0,
      financeMoments: 0,
      savingsWins: 0,
      visitStreak: 1,
      lastVisitDay: '',
      lastSeenAt: 0,
      lastInteractionAt: 0,
      dataSnapshot: { capturedAt: 0, savingsTotal: 0, totalBalance: 0, goals: {}, wallets: {} }
    };
  }

  function normalizeCompanionDataSnapshot(input) {
    const source = input && typeof input === 'object' ? input : {};
    const goals = source.goals && typeof source.goals === 'object' ? source.goals : {};
    const wallets = source.wallets && typeof source.wallets === 'object' ? source.wallets : {};
    return {
      capturedAt: Math.max(0, Number(source.capturedAt || 0)),
      savingsTotal: Math.max(0, Number(source.savingsTotal || 0)),
      totalBalance: Number.isFinite(Number(source.totalBalance)) ? Number(source.totalBalance) : 0,
      goals: Object.fromEntries(Object.entries(goals).map(([id, value]) => [id, {
        percent: Math.max(0, Math.min(100, Number(value?.percent || 0))),
        current: Math.max(0, Number(value?.current || 0)),
        target: Math.max(0, Number(value?.target || 0))
      }])),
      wallets: Object.fromEntries(Object.entries(wallets).map(([id, value]) => [id, Number.isFinite(Number(value)) ? Number(value) : 0]))
    };
  }

  function normalizeCompanionProfile(input) {
    const base = defaultCompanionProfile();
    const source = input && typeof input === 'object' ? input : {};
    const accessories = Array.isArray(source.unlockedAccessories) ? source.unlockedAccessories.filter((item) => ['none','glasses','scarf','star'].includes(item)) : base.unlockedAccessories;
    return {
      ...base,
      name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 14) : base.name,
      affection: Math.max(0, Math.min(100, Number(source.affection ?? base.affection))),
      energy: Math.max(0, Math.min(100, Number(source.energy ?? base.energy))),
      mood: ['calm','happy','curious','sleepy','proud','gentle','excited'].includes(source.mood) ? source.mood : base.mood,
      personality: ['gentle','playful','curious'].includes(source.personality) ? source.personality : base.personality,
      accessory: ['none','glasses','scarf','star'].includes(source.accessory) ? source.accessory : base.accessory,
      unlockedAccessories: accessories.length ? [...new Set(['none', ...accessories])] : base.unlockedAccessories,
      taps: Math.max(0, Number(source.taps || 0)),
      pets: Math.max(0, Number(source.pets || 0)),
      drags: Math.max(0, Number(source.drags || 0)),
      roomVisits: Math.max(0, Number(source.roomVisits || 0)),
      roomActions: Math.max(0, Number(source.roomActions || 0)),
      financeMoments: Math.max(0, Number(source.financeMoments || 0)),
      savingsWins: Math.max(0, Number(source.savingsWins || 0)),
      visitStreak: Math.max(1, Number(source.visitStreak || 1)),
      lastVisitDay: typeof source.lastVisitDay === 'string' ? source.lastVisitDay : '',
      lastSeenAt: Math.max(0, Number(source.lastSeenAt || 0)),
      lastInteractionAt: Math.max(0, Number(source.lastInteractionAt || 0)),
      dataSnapshot: normalizeCompanionDataSnapshot(source.dataSnapshot)
    };
  }

  function defaultSecretConfig() {
    return { pinSalt: '', pinHash: '', remember: false, companionEnabled: true, companionSpeech: 'normal', companionMovement: 'normal', companionDataSpeech: 'chatty', discovered: false, firstRevealSeen: false, companionProfile: defaultCompanionProfile() };
  }

  function loadSecretConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SECRET_POCKET_KEY) || 'null');
      const base = defaultSecretConfig();
      if (!parsed || typeof parsed !== 'object') return base;
      return { ...base, pinSalt: typeof parsed.pinSalt === 'string' ? parsed.pinSalt : '', pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : '', remember: Boolean(parsed.remember), companionEnabled: parsed.companionEnabled !== false, companionSpeech: ['normal','quiet','off'].includes(parsed.companionSpeech) ? parsed.companionSpeech : 'normal', companionMovement: parsed.companionMovement === 'calm' ? 'calm' : 'normal', companionDataSpeech: ['quiet','balanced','chatty','very-chatty'].includes(parsed.companionDataSpeech) ? parsed.companionDataSpeech : 'chatty', discovered: Boolean(parsed.discovered), firstRevealSeen: Boolean(parsed.firstRevealSeen), companionProfile: normalizeCompanionProfile(parsed.companionProfile) };
    } catch (error) { return defaultSecretConfig(); }
  }

  function saveSecretConfig() { try { localStorage.setItem(SECRET_POCKET_KEY, JSON.stringify(secretConfig || defaultSecretConfig())); } catch (error) {} }
  function isSecretPocketUnlocked() {
    try {
      if (sessionStorage.getItem(SECRET_SESSION_KEY) === '1') return true;
      const config = secretConfig || loadSecretConfig();
      return Boolean(config.remember && localStorage.getItem(SECRET_TRUST_KEY) === '1');
    } catch (error) { return false; }
  }
  function setSecretPocketUnlocked(unlocked, remember = false) {
    secretConfig ||= loadSecretConfig();
    try { if (unlocked) sessionStorage.setItem(SECRET_SESSION_KEY,'1'); else sessionStorage.removeItem(SECRET_SESSION_KEY); } catch (error) {}
    try { if (unlocked && remember) localStorage.setItem(SECRET_TRUST_KEY,'1'); else localStorage.removeItem(SECRET_TRUST_KEY); } catch (error) {}
    secretConfig.remember = Boolean(unlocked && remember); saveSecretConfig();
  }
  function secretRandomSalt() {
    try { const bytes=new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''); }
    catch (error) { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
  }
  async function hashSecretPin(pin, salt) {
    const input=`${salt}:${pin}:PocketSecret`; const seeds=[2166136261,2246822507,3266489909,668265263];
    return seeds.map((seed,lane)=>{ let hash=seed>>>0; for(let round=0;round<2048;round+=1){ for(let i=0;i<input.length;i+=1){ hash ^= input.charCodeAt(i)+lane+round; hash=Math.imul(hash,16777619); hash ^= hash>>>13; } } return (hash>>>0).toString(16).padStart(8,'0'); }).join('');
  }
  async function verifySecretPin(pin) { secretConfig ||= loadSecretConfig(); if(!secretConfig.pinHash || !secretConfig.pinSalt) return pin===DEFAULT_SECRET_PIN; return (await hashSecretPin(pin,secretConfig.pinSalt))===secretConfig.pinHash; }
  async function storeSecretPin(pin) { secretConfig ||= loadSecretConfig(); secretConfig.pinSalt=secretRandomSalt(); secretConfig.pinHash=await hashSecretPin(pin,secretConfig.pinSalt); secretConfig.discovered=true; saveSecretConfig(); }
  function companionSpeechMode() { return secretConfig?.companionSpeech || 'normal'; }
  function companionMovementMode() { return secretConfig?.companionMovement || 'normal'; }
  function companionDataSpeechLevel() { return ['quiet','balanced','chatty','very-chatty'].includes(secretConfig?.companionDataSpeech) ? secretConfig.companionDataSpeech : 'chatty'; }
  function companionDataSpeechSettings() { return COMPANION_DATA_SPEECH_LEVELS[companionDataSpeechLevel()] || COMPANION_DATA_SPEECH_LEVELS.chatty; }
  function companionProfileState() {
    secretConfig ||= loadSecretConfig();
    if (!secretConfig.companionProfile || typeof secretConfig.companionProfile !== 'object') secretConfig.companionProfile = defaultCompanionProfile();
    return secretConfig.companionProfile;
  }

  function companionName() {
    return companionProfileState().name || 'Bunny';
  }

  function companionPersonality() {
    return companionProfileState().personality || 'gentle';
  }

  function companionBondLevel(affection = companionProfileState().affection) {
    if (affection >= 85) return 'Best friends';
    if (affection >= 65) return 'Very close';
    if (affection >= 42) return 'Good friends';
    if (affection >= 24) return 'Getting close';
    return 'New friend';
  }

  function companionMoodFromState() {
    const profile = companionProfileState();
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 6 || profile.energy <= 24) return 'sleepy';
    if (profile.energy <= 42) return 'gentle';
    if (profile.personality === 'playful' && profile.energy >= 70) return 'happy';
    if (profile.personality === 'curious' && profile.energy >= 50) return 'curious';
    if (profile.affection >= 75) return 'proud';
    return 'relaxed';
  }

  function companionMoodText(mood = companionMoodFromState()) {
    const labels = { relaxed: 'Calm & cozy', calm: 'Calm & cozy', happy: 'Bright & happy', curious: 'Curious', sleepy: 'Sleepy', proud: 'Proud of you', gentle: 'Soft & relaxed', excited: 'Very excited' };
    return labels[mood] || 'Calm & cozy';
  }

  function companionAdjustProfile(changes = {}, options = {}) {
    const profile = companionProfileState();
    if (Number.isFinite(changes.affection)) profile.affection = Math.max(0, Math.min(100, profile.affection + changes.affection));
    if (Number.isFinite(changes.energy)) profile.energy = Math.max(0, Math.min(100, profile.energy + changes.energy));
    if (changes.mood) profile.mood = changes.mood;
    if (changes.tap) profile.taps += changes.tap;
    if (changes.pet) profile.pets += changes.pet;
    if (changes.drag) profile.drags += changes.drag;
    if (changes.roomVisit) profile.roomVisits += changes.roomVisit;
    if (changes.roomAction) profile.roomActions += changes.roomAction;
    if (changes.financeMoment) profile.financeMoments += changes.financeMoment;
    if (changes.savingsWin) profile.savingsWins += changes.savingsWin;
    if (changes.interaction !== false) profile.lastInteractionAt = Date.now();
    if (!changes.mood) profile.mood = companionMoodFromState();
    if (options.save !== false) saveSecretConfig();
    if (options.render !== false) {
      renderCompanionRoom();
      syncCompanionAccessory();
    }
    return profile;
  }

  function previousLocalDateKey(key) {
    if (!key) return '';
    const date = fromDateKey(key);
    date.setDate(date.getDate() + 1);
    return localDateKey(date);
  }

  function captureCompanionDataSnapshot() {
    if (!state) return normalizeCompanionDataSnapshot(null);
    const goals = {};
    state.goals.filter((goal) => !goal.removedAt).forEach((goal) => {
      const target = Math.max(0, Number(goal.target || 0));
      const current = Math.max(0, Number(goal.current || 0));
      goals[goal.id] = { current, target, percent: target > 0 ? Math.min(100, Math.round(current / target * 100)) : 0 };
    });
    const wallets = {};
    state.accounts.forEach((account) => { wallets[account.id] = accountBalance(account.id); });
    return {
      capturedAt: Date.now(),
      savingsTotal: Math.max(0, totalSavings()),
      totalBalance: totalBalance(),
      goals,
      wallets
    };
  }

  function prepareCompanionProfile() {
    const profile = companionProfileState();
    if (!companionSessionBaseline) companionSessionBaseline = normalizeCompanionDataSnapshot(profile.dataSnapshot);
    const now = Date.now();
    companionReturnGap = profile.lastSeenAt ? Math.max(0, now - profile.lastSeenAt) : 0;
    if (profile.lastSeenAt) {
      const hoursAway = companionReturnGap / 3600000;
      profile.energy = Math.min(100, profile.energy + Math.min(34, hoursAway * 5.5));
    }
    const today = localDateKey();
    if (profile.lastVisitDay !== today) {
      profile.visitStreak = profile.lastVisitDay && previousLocalDateKey(profile.lastVisitDay) === today ? profile.visitStreak + 1 : 1;
      profile.lastVisitDay = today;
    }
    profile.lastSeenAt = now;
    profile.mood = companionMoodFromState();
    profile.dataSnapshot = captureCompanionDataSnapshot();
    saveSecretConfig();
  }

  function persistCompanionPresence() {
    if (!secretConfig?.companionProfile) return;
    const profile = companionProfileState();
    profile.lastSeenAt = Date.now();
    profile.dataSnapshot = captureCompanionDataSnapshot();
    saveSecretConfig();
  }

  function companionGreetingLine() {
    const name = companionName();
    const hour = new Date().getHours();
    if (companionReturnGap > 1000 * 60 * 60 * 18) return `${name} missed you ♡`;
    if (companionReturnGap > 1000 * 60 * 60 * 3) return `${name} is happy you're back ♡`;
    if (hour >= 23 || hour < 6) return `${name} is sleepy, but still here ♡`;
    if (hour < 12) return `Good morning from ${name} ♡`;
    if (hour >= 18) return `${name} is winding down with you ♡`;
    return `Hi! ${name} will keep you company ♡`;
  }

  function syncCompanionAccessory() {
    if (!els.pocketCompanion) return;
    const profile = companionProfileState();
    els.pocketCompanion.dataset.accessory = profile.accessory || 'none';
    if (els.companionRoomBunny) els.companionRoomBunny.dataset.accessory = profile.accessory || 'none';
  }

  function renderCompanionRoomBunny() {
    if (!els.companionRoomBunny || !els.companionBunny) return;
    if (!els.companionRoomBunny.querySelector('svg')) {
      const source = els.companionBunny.querySelector('svg');
      if (source) els.companionRoomBunny.appendChild(source.cloneNode(true));
      const wearable = document.createElement('span');
      wearable.className = 'companion-wearable';
      wearable.setAttribute('aria-hidden', 'true');
      els.companionRoomBunny.appendChild(wearable);
    }
    els.companionRoomBunny.dataset.accessory = companionProfileState().accessory || 'none';
  }

  function renderCompanionRoom() {
    if (!els.companionRoomDialog) return;
    const profile = companionProfileState();
    renderCompanionRoomBunny();
    if (els.companionRoomTitle) els.companionRoomTitle.textContent = `${profile.name || 'Bunny'}'s room ♡`;
    if (els.companionMoodLabel) els.companionMoodLabel.textContent = companionMoodText(profile.mood || companionMoodFromState());
    if (els.companionBondLevel) els.companionBondLevel.textContent = companionBondLevel(profile.affection);
    if (els.companionBondValue) els.companionBondValue.textContent = `${Math.round(profile.affection)}%`;
    if (els.companionEnergyValue) els.companionEnergyValue.textContent = `${Math.round(profile.energy)}%`;
    if (els.companionBondFill) els.companionBondFill.style.width = `${profile.affection}%`;
    if (els.companionEnergyFill) els.companionEnergyFill.style.width = `${profile.energy}%`;
    if (els.companionVisitStreak) els.companionVisitStreak.textContent = `${profile.visitStreak} day${profile.visitStreak === 1 ? '' : 's'} together`;
    if (els.companionInteractionCount) {
      const total = profile.taps + profile.pets + profile.drags + profile.roomVisits + profile.roomActions + profile.financeMoments;
      els.companionInteractionCount.textContent = `${total} interaction${total === 1 ? '' : 's'}`;
    }
    if (els.companionNameInput && document.activeElement !== els.companionNameInput) els.companionNameInput.value = profile.name || 'Bunny';
    if (els.companionPersonality) els.companionPersonality.value = profile.personality || 'gentle';
    if (els.companionDataSpeech) els.companionDataSpeech.value = companionDataSpeechLevel();
    if (els.companionAccessoryGrid) {
      els.companionAccessoryGrid.querySelectorAll('[data-accessory]').forEach((button) => {
        const active = button.dataset.accessory === profile.accessory;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    if (els.companionStudioSummary) els.companionStudioSummary.textContent = `${profile.name} · ${companionBondLevel(profile.affection)} · ${companionMoodText(profile.mood)}`;
  }

  function openCompanionRoom() {
    if (!isSecretPocketUnlocked()) return openThemeUnlock();
    closeDialog(els.secretPocketDialog);
    const profile = companionProfileState();
    profile.roomVisits += 1;
    profile.lastInteractionAt = Date.now();
    saveSecretConfig();
    renderCompanionRoom();
    if (els.companionRoomMessage) els.companionRoomMessage.textContent = `${profile.name} is home ♡`;
    openDialog(els.companionRoomDialog);
  }

  function animateRoomCompanion(kind, message) {
    if (!els.companionRoomBunny) return;
    const classes = ['is-room-petted','is-room-playing','is-room-sleeping'];
    els.companionRoomBunny.classList.remove(...classes);
    void els.companionRoomBunny.offsetWidth;
    const className = kind === 'pet' ? 'is-room-petted' : kind === 'play' ? 'is-room-playing' : 'is-room-sleeping';
    els.companionRoomBunny.classList.add(className);
    if (els.companionRoomMessage) els.companionRoomMessage.textContent = message;
    window.setTimeout(() => els.companionRoomBunny?.classList.remove(className), kind === 'nap' ? 2200 : 1100);
  }

  function companionRoomPet() {
    const profile = companionAdjustProfile({ affection: 3, energy: 1, pet: 1, roomAction: 1, mood: 'happy' });
    animateRoomCompanion('pet', `${profile.name} melts into the head pats ♡`);
  }

  function companionRoomPlay() {
    const profile = companionAdjustProfile({ affection: 2, energy: -6, roomAction: 1, mood: 'excited' });
    animateRoomCompanion('play', `${profile.name} does a tiny victory hop ✨`);
  }

  function companionRoomNap() {
    const profile = companionAdjustProfile({ energy: 12, mood: 'sleepy', roomAction: 1 });
    animateRoomCompanion('nap', `${profile.name} curls up for a cozy nap… zZ`);
  }

  function selectCompanionAccessory(accessory) {
    const profile = companionProfileState();
    if (!profile.unlockedAccessories.includes(accessory)) return;
    profile.accessory = accessory;
    profile.lastInteractionAt = Date.now();
    saveSecretConfig();
    syncCompanionAccessory();
    renderCompanionRoom();
    if (els.companionRoomMessage) {
      const labels = { none: 'Classic look selected ♡', glasses: 'Smart little glasses! ✨', scarf: 'Cozy scarf equipped ♡', star: 'Star crown equipped ✨' };
      els.companionRoomMessage.textContent = labels[accessory] || 'Accessory equipped.';
    }
  }

  function secretPocketLightActive() { return Boolean(state?.settings?.theme === 'light' && isSecretPocketUnlocked()); }

  function clearSecretLightEffects() {
    window.clearTimeout(secretLightAmbientTimer);
    secretLightAmbientTimer = 0;
    if (els.secretLightFx) els.secretLightFx.innerHTML = '';
  }

  function emitSecretLightFx(kind = 'soft', options = {}) {
    if (!els.secretLightFx || !secretPocketLightActive()) return;
    const area = options.area || 'top';
    const count = Math.max(1, Math.min(14, options.count || (kind === 'confetti' ? 8 : kind === 'heart' ? 6 : 5)));
    const width = window.innerWidth || 390;
    const height = window.innerHeight || 844;
    const duration = companionReducedMotion ? Math.min(900, options.duration || 900) : (options.duration || 2200);
    const centerX = width / 2;
    const centerY = Math.min(height * .5, 310);

    for (let index = 0; index < count; index += 1) {
      const node = document.createElement('i');
      node.className = `secret-light-particle particle-${kind}`;
      const size = kind === 'soft' ? 12 + Math.random() * 22 : kind === 'confetti' ? 10 + Math.random() * 14 : 12 + Math.random() * 10;
      let startX = 36 + Math.random() * Math.max(80, width - 72);
      let startY = 80 + Math.random() * Math.min(240, Math.max(120, height * .45));

      if (area === 'center') {
        startX = centerX + (Math.random() - .5) * Math.min(width * .42, 240);
        startY = centerY + (Math.random() - .5) * Math.min(height * .28, 120);
      } else if (area === 'edges') {
        startX = Math.random() < .5 ? 26 + Math.random() * 62 : width - 26 - Math.random() * 62;
        startY = 90 + Math.random() * Math.max(120, height - 250);
      } else if (area === 'bottom') {
        startX = 40 + Math.random() * Math.max(90, width - 80);
        startY = height - 170 - Math.random() * 70;
      }

      const driftX = (Math.random() - .5) * (kind === 'soft' ? 80 : 140);
      const driftY = kind === 'confetti' ? -(85 + Math.random() * 120) : -(55 + Math.random() * 120);
      node.style.setProperty('--x', `${Math.round(startX)}px`);
      node.style.setProperty('--y', `${Math.round(startY)}px`);
      node.style.setProperty('--drift-x', `${Math.round(driftX)}px`);
      node.style.setProperty('--drift-y', `${Math.round(driftY)}px`);
      node.style.setProperty('--particle-size', `${Math.round(size)}px`);
      node.style.setProperty('--particle-duration', `${Math.round(duration + Math.random() * 500)}ms`);
      node.style.setProperty('--particle-delay', `${Math.round(index * 38)}ms`);
      node.style.setProperty('--particle-rotate', `${Math.round((Math.random() - .5) * 56)}deg`);
      els.secretLightFx.appendChild(node);
      window.setTimeout(() => node.remove(), duration + 1200);
    }
  }

  function scheduleSecretLightAmbient() {
    window.clearTimeout(secretLightAmbientTimer);
    if (!secretPocketLightActive() || document.querySelector('dialog[open]')) return;
    const delay = companionReducedMotion ? 9200 : 5200 + Math.random() * 3600;
    secretLightAmbientTimer = window.setTimeout(() => {
      if (!secretPocketLightActive()) return;
      const optionsByView = {
        home: ['heart', 'soft'],
        activity: ['sparkle', 'soft'],
        savings: ['confetti', 'heart'],
        more: ['sparkle', 'soft']
      };
      const list = optionsByView[currentView] || ['soft'];
      emitSecretLightFx(list[Math.floor(Math.random() * list.length)], { count: companionReducedMotion ? 2 : 4, area: 'edges', duration: companionReducedMotion ? 850 : 2400 });
      scheduleSecretLightAmbient();
    }, delay);
  }

  function syncSecretLightWorld(options = {}) {
    const active = secretPocketLightActive();
    document.body.classList.toggle('secret-pocket-world-active', active);
    if (active) document.body.dataset.secretView = currentView;
    else delete document.body.dataset.secretView;
    if (els.secretLightScene) els.secretLightScene.classList.toggle('is-active', active);
    if (!active) {
      secretLightViewToken = '';
      clearSecretLightEffects();
      return;
    }

    const token = `${currentView}|${state.settings.theme}`;
    if (options.force || token !== secretLightViewToken) {
      secretLightViewToken = token;
      emitSecretLightFx(SECRET_LIGHT_VIEW_EFFECTS[currentView] || 'soft', {
        count: companionReducedMotion ? 2 : currentView === 'savings' ? 7 : 5,
        area: currentView === 'more' ? 'center' : 'top',
        duration: companionReducedMotion ? 850 : 2500
      });
    }

    scheduleSecretLightAmbient();
  }

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
    return (tx?.type === 'expense' || tx?.type === 'income' || tx?.type === 'transfer') && canModifyTransaction(tx);
  }

  function transactionWindowLabel(tx) {
    return canModifyTransaction(tx) ? 'Editable' : 'Locked';
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
        theme: 'dark',
        privacy: false,
        demoData: false
      },
      accounts: [
        { id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0, isPrimary: true }
      ],
      goals: [],
      goalTransfers: [],
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

  function normalizeAccounts(accounts) {
    const source = Array.isArray(accounts) ? accounts : [];
    const normalized = source
      .filter((account) => account && typeof account === 'object')
      .map((account, index) => ({
        id: account.id || uid('account'),
        name: String(account.name || (index === 0 ? 'Cash' : 'Wallet')).trim().slice(0, 30) || (index === 0 ? 'Cash' : 'Wallet'),
        type: account.type || (index === 0 ? 'cash' : 'other'),
        openingBalance: Math.max(0, Number(account.openingBalance || 0)),
        isPrimary: index === 0
      }));

    if (!normalized.length) return [{ id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0, isPrimary: true }];
    if (normalized[0].name.toLowerCase() === 'wallet' && normalized[0].type === 'cash') normalized[0].name = 'Cash';
    normalized[0].type = normalized[0].type || 'cash';
    normalized[0].isPrimary = true;
    normalized.slice(1).forEach((account) => { account.isPrimary = false; });
    return normalized;
  }

  function normalizeState(candidate) {
    if (!candidate || typeof candidate !== 'object') return seedState();
    return {
      version: SCHEMA_VERSION,
      settings: {
        theme: candidate.settings?.theme === 'light' && isSecretPocketUnlocked() ? 'light' : 'dark',
        privacy: Boolean(candidate.settings?.privacy),
        demoData: Boolean(candidate.settings?.demoData)
      },
      accounts: normalizeAccounts(candidate.accounts),
      goals: Array.isArray(candidate.goals) ? candidate.goals : [],
      goalTransfers: Array.isArray(candidate.goalTransfers) ? candidate.goalTransfers : [],
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
      if (tx.type === 'saving_return' && tx.accountId === accountId) return balance + Number(tx.amount || 0);
      if (tx.type === 'transfer') {
        if (tx.fromAccountId === accountId) return balance - Number(tx.amount || 0);
        if (tx.toAccountId === accountId) return balance + Number(tx.amount || 0);
      }
      return balance;
    }, Number(account.openingBalance || 0));
  }

  function walletSavingsBalance(accountId) {
    const saved = state.transactions
      .filter((tx) => tx.type === 'saving' && tx.accountId === accountId)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const returned = state.transactions
      .filter((tx) => tx.type === 'saving_return' && tx.accountId === accountId)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const attributedTotal = state.transactions
      .filter((tx) => tx.type === 'saving')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const returnedTotal = state.transactions
      .filter((tx) => tx.type === 'saving_return')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const legacyUnattributed = Math.max(0, totalSavings() - Math.max(0, attributedTotal - returnedTotal));
    const account = state.accounts.find((item) => item.id === accountId);
    return Math.max(0, saved - returned + (account?.isPrimary ? legacyUnattributed : 0));
  }

  function goalWalletSavings(goal, accountId) {
    if (!goal || !accountId) return 0;
    const attributed = state.transactions
      .filter((tx) => tx.type === 'saving' && tx.goalId === goal.id && tx.accountId === accountId)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const returned = state.transactions
      .filter((tx) => tx.type === 'saving_return' && tx.goalId === goal.id && tx.accountId === accountId)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const attributedGoalTotal = state.transactions
      .filter((tx) => tx.type === 'saving' && tx.goalId === goal.id)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const returnedGoalTotal = state.transactions
      .filter((tx) => tx.type === 'saving_return' && tx.goalId === goal.id)
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const transferIn = state.goalTransfers
      .filter((item) => item.toGoalId === goal.id)
      .flatMap((item) => Array.isArray(item.allocations) ? item.allocations : [])
      .filter((item) => item.accountId === accountId)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const transferOut = state.goalTransfers
      .filter((item) => item.fromGoalId === goal.id)
      .flatMap((item) => Array.isArray(item.allocations) ? item.allocations : [])
      .filter((item) => item.accountId === accountId)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const transferredInTotal = state.goalTransfers
      .filter((item) => item.toGoalId === goal.id)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const transferredOutTotal = state.goalTransfers
      .filter((item) => item.fromGoalId === goal.id)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const baseNet = Math.max(0, attributedGoalTotal - returnedGoalTotal + transferredInTotal - transferredOutTotal);
    const legacyUnattributed = Math.max(0, Number(goal.current || 0) - baseNet);
    const account = state.accounts.find((item) => item.id === accountId);
    return Math.max(0, attributed - returned + transferIn - transferOut + (account?.isPrimary ? legacyUnattributed : 0));
  }

  function goalWalletBreakdown(goal) {
    return state.accounts
      .map((account) => ({ account, amount: goalWalletSavings(goal, account.id) }))
      .filter((item) => item.amount > 0.0001);
  }

  function totalBalance() {
    return state.accounts.reduce((total, account) => total + accountBalance(account.id), 0);
  }

  function totalSavings() {
    return state.goals.reduce((total, goal) => total + Number(goal.current || 0), 0);
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


  function transactionTitle(tx) {
    if (tx.type === 'income') return tx.note || 'Allowance received';
    if (tx.type === 'saving') return tx.note || 'Moved to savings';
    if (tx.type === 'saving_return') return tx.note || 'Savings returned';
    if (tx.type === 'transfer') {
      const destination = state.accounts.find((item) => item.id === tx.toAccountId)?.name || 'wallet';
      return tx.note || `Transfer to ${destination}`;
    }
    return tx.note || tx.category || 'Expense';
  }

  function transactionTimeLabel(tx) {
    const parsed = Date.parse(tx.createdAt || '');
    if (!Number.isFinite(parsed)) return '';
    return TIME_LABEL.format(new Date(parsed));
  }

  function transactionSubtitle(tx, includeDate = false) {
    const time = transactionTimeLabel(tx);
    const date = includeDate && tx.date ? DATE_LABEL.format(fromDateKey(tx.date)) : '';
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Account';
    const withTiming = (base) => [base, date, time].filter(Boolean).join(' · ');
    if (tx.type === 'saving') return withTiming(`Saved from ${account}`);
    if (tx.type === 'saving_return') return withTiming(`Returned to ${account}`);
    if (tx.type === 'transfer') {
      const from = state.accounts.find((item) => item.id === tx.fromAccountId)?.name || 'Wallet';
      const to = state.accounts.find((item) => item.id === tx.toAccountId)?.name || 'Wallet';
      return withTiming(`${from} → ${to}`);
    }
    if (tx.type === 'income') return withTiming(`Allowance · ${account}`);
    return withTiming(`${tx.category || 'Other'} · ${account}`);
  }

  function renderTransactionActions(tx) {
    if (tx.type === 'saving_return') return '';
    if (tx.type === 'saving' && tx.goalId) {
      const goal = state.goals.find((item) => item.id === tx.goalId);
      const allocationChanged = Boolean(goal?.removedAt) || state.goalTransfers.some((item) => item.fromGoalId === tx.goalId || item.toGoalId === tx.goalId);
      if (allocationChanged) return `<div class="transaction-actions is-locked"><span class="transaction-lock-icon" aria-label="Locked">${icon('i-lock')}</span></div>`;
    }
    if (!canModifyTransaction(tx)) {
      return `<div class="transaction-actions is-locked"><span class="transaction-lock-icon" aria-label="Locked">${icon('i-lock')}</span></div>`;
    }
    const actions = [];
    if (canEditTransaction(tx)) actions.push(`<button class="transaction-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')} Edit</button>`);
    actions.push(`<button class="transaction-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')} Undo</button>`);
    return `<div class="transaction-actions"><div class="transaction-actions-row">${actions.join('')}</div></div>`;
  }

  function renderTransactionRows(transactions, full = false, options = {}) {
    const { includeDate = false, emptyTitle = 'No transactions found', emptyCopy = 'Your activity will appear here.', emptyIcon = 'i-activity', emptyTone = 'neutral-soft' } = options;
    if (!transactions.length) {
      return `<div class="empty-state"><span class="round-icon ${escapeHtml(emptyTone)}">${icon(emptyIcon)}</span><strong>${escapeHtml(emptyTitle)}</strong><span>${escapeHtml(emptyCopy)}</span></div>`;
    }

    return transactions.map((tx) => {
      const categoryKey = tx.type === 'income' ? 'Allowance' : tx.type === 'saving_return' ? 'Savings return' : tx.type === 'saving' ? 'Savings' : tx.type === 'transfer' ? 'Transfer' : (tx.category || 'Other');
      const meta = categoryMeta[categoryKey] || categoryMeta.Other;
      const sign = tx.type === 'expense' ? '−' : tx.type === 'income' || tx.type === 'saving_return' ? '+' : '';
      const amountLabel = `${sign}${currency(tx.amount, true)}`;
      const amountKind = tx.type === 'saving_return' ? 'returned' : tx.type === 'saving' ? 'saved' : tx.type;
      const actionMarkup = full ? renderTransactionActions(tx) : '';
      const actionClass = actionMarkup ? ' has-actions' : '';
      return `
        <div class="transaction-row ${escapeHtml(tx.type)}${actionClass}" data-transaction-id="${escapeHtml(tx.id)}">
          <span class="round-icon ${meta.tone}">${icon(meta.icon)}</span>
          <div class="transaction-copy">
            <strong>${escapeHtml(transactionTitle(tx))}</strong>
            <small>${escapeHtml(transactionSubtitle(tx, includeDate))}</small>
          </div>
          <div class="transaction-amount">
            <strong class="money-value">${amountLabel}</strong>
            <small>${escapeHtml(amountKind)}</small>
          </div>
          ${actionMarkup}
        </div>`;
    }).join('');
  }

  function walletModeTone(account) {
    if (account.type === 'cash') return 'is-cash';
    if (account.type === 'ewallet') return 'is-ewallet';
    return 'is-other';
  }

  function walletModeTypeLabel(account) {
    if (account.type === 'cash') return 'Cash wallet';
    if (account.type === 'ewallet') return 'E-wallet';
    return 'Wallet';
  }

  function selectedWalletAccount() {
    return state.accounts[walletModeIndex] || state.accounts[0] || null;
  }

  function walletExpenseSummary(accountId, startDate, endDate) {
    const expenses = state.transactions.filter((tx) => tx.type === 'expense' && tx.accountId === accountId && tx.date >= startDate && tx.date <= endDate);
    const spent = expenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const categories = expenses.reduce((map, tx) => {
      const name = tx.category || 'Other';
      map[name] = (map[name] || 0) + Number(tx.amount || 0);
      return map;
    }, {});
    const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || null;
    return { expenses, spent, top };
  }

  function expenseCategoryClass(category) {
    const key = String(category || 'Other').toLowerCase();
    if (key === 'food') return 'expense-cat-food';
    if (key === 'transport') return 'expense-cat-transport';
    if (key === 'school') return 'expense-cat-school';
    if (key === 'load') return 'expense-cat-load';
    if (key === 'personal') return 'expense-cat-personal';
    return 'expense-cat-other';
  }

  function expenseCategoryBreakdown(summary) {
    if (!summary?.spent) return [];
    const totals = summary.expenses.reduce((map, tx) => {
      const name = tx.category || 'Other';
      map[name] = (map[name] || 0) + Number(tx.amount || 0);
      return map;
    }, {});
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount, percent: (amount / summary.spent) * 100 }));
  }

  function renderExpenseCategoryBar(summary) {
    const breakdown = expenseCategoryBreakdown(summary);
    if (!breakdown.length) return '<span class="expense-category-empty"></span>';
    return breakdown.map(({ category, percent }) => {
      const share = Math.max(1.5, percent);
      return `<span class="expense-category-segment ${expenseCategoryClass(category)}" style="width:${share.toFixed(2)}%" title="${escapeHtml(category)} ${Math.round(percent)}%"></span>`;
    }).join('');
  }

  function renderExpenseCategoryLegend(summary) {
    const breakdown = expenseCategoryBreakdown(summary);
    if (!breakdown.length) return '<span class="category-legend-empty">No categories yet</span>';
    const shown = breakdown.slice(0, 3);
    const remaining = breakdown.length - shown.length;
    return shown.map(({ category, percent }) => `<span class="category-legend-item"><i class="${expenseCategoryClass(category)}"></i><b>${escapeHtml(category)}</b><small>${Math.round(percent)}%</small></span>`).join('')
      + (remaining > 0 ? `<span class="category-legend-more">+${remaining}</span>` : '');
  }

  function renderHomeWalletDetails(index = walletModeIndex) {
    const account = state.accounts[index];
    if (!account || !els.homeWalletTodaySpent) return;
    const today = localDateKey();
    const month = monthRange();
    const todaySummary = walletExpenseSummary(account.id, today, today);
    const monthSummary = walletExpenseSummary(account.id, month.start, month.end);
    const monthName = new Intl.DateTimeFormat('en-PH', { month: 'long' }).format(new Date());

    els.homeWalletTodaySpent.textContent = state.settings.privacy ? '₱•••• spent' : `${currency(todaySummary.spent, true)} spent`;
    els.homeWalletTodayEntries.textContent = `${todaySummary.expenses.length} ${todaySummary.expenses.length === 1 ? 'entry' : 'entries'}`;
    els.homeWalletTodayBar.innerHTML = renderExpenseCategoryBar(todaySummary);
    els.homeWalletTodayLegend.innerHTML = renderExpenseCategoryLegend(todaySummary);
    els.homeWalletMonthLabel.textContent = monthName;
    els.homeWalletMonthSpent.textContent = state.settings.privacy ? '₱•••• spent' : `${currency(monthSummary.spent, true)} spent`;
    els.homeWalletTopCategory.textContent = monthSummary.top ? `${monthSummary.top[0]} · biggest category` : 'No spending yet';
    els.homeWalletMonthBar.innerHTML = renderExpenseCategoryBar(monthSummary);
    els.homeWalletMonthLegend.innerHTML = renderExpenseCategoryLegend(monthSummary);
  }

  function updateWalletModeHeader(index) {
    const count = state.accounts.length;
    if (!count) return;
    walletModeIndex = Math.max(0, Math.min(index, count - 1));
    els.walletModeCounter.textContent = `${walletModeIndex + 1} / ${count}`;
    els.walletCarouselPrev.disabled = walletModeIndex <= 0;
    els.walletCarouselNext.disabled = walletModeIndex >= count - 1;
    els.walletModeIndicators.querySelectorAll('button').forEach((button, buttonIndex) => {
      const active = buttonIndex === walletModeIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });
    renderHomeWalletDetails(walletModeIndex);
  }

  function updateWalletCarouselTransforms() {
    walletCarouselFrame = 0;
    const carousel = els.walletCarousel;
    const cards = [...carousel.querySelectorAll('.wallet-mode-card')];
    if (!cards.length || !carousel.clientWidth) return;

    const center = carousel.scrollLeft + carousel.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;

    cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const rawDistance = (cardCenter - center) / Math.max(carousel.clientWidth, 1);
      const distance = Math.max(-1.25, Math.min(1.25, rawDistance));
      const magnitude = Math.min(1, Math.abs(distance));
      const absolutePixels = Math.abs(cardCenter - center);
      if (absolutePixels < closestDistance) {
        closestDistance = absolutePixels;
        closestIndex = index;
      }

      card.style.setProperty('--wallet-rotate', `${(-distance * 20).toFixed(2)}deg`);
      card.style.setProperty('--wallet-scale', (1 - magnitude * 0.085).toFixed(3));
      card.style.setProperty('--wallet-lift', `${(magnitude * 8).toFixed(1)}px`);
      card.style.setProperty('--wallet-opacity', (1 - magnitude * 0.34).toFixed(3));
      card.style.setProperty('--wallet-glow-shift', `${(distance * 34).toFixed(1)}px`);
      card.classList.toggle('is-current', index === closestIndex);
    });

    updateWalletModeHeader(closestIndex);
  }

  function queueWalletCarouselTransforms() {
    if (walletCarouselFrame) return;
    walletCarouselFrame = requestAnimationFrame(updateWalletCarouselTransforms);
  }

  function scrollToWalletMode(index, behavior = 'smooth') {
    const cards = [...els.walletCarousel.querySelectorAll('.wallet-mode-card')];
    if (!cards.length) return;
    const targetIndex = Math.max(0, Math.min(index, cards.length - 1));
    const card = cards[targetIndex];
    const left = card.offsetLeft - (els.walletCarousel.clientWidth - card.offsetWidth) / 2;
    walletModeIndex = targetIndex;
    els.walletCarousel.scrollTo({ left: Math.max(0, left), behavior });
    updateWalletModeHeader(targetIndex);
    queueWalletCarouselTransforms();
  }

  function stabilizeWalletCarousel(index = walletModeIndex) {
    if (!els.walletCarousel) return;
    els.walletCarousel.classList.remove('is-ready');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToWalletMode(index, 'auto');
        updateWalletCarouselTransforms();
        els.walletCarousel.classList.add('is-ready');
      });
    });
  }

  function renderHome() {
    const accounts = state.accounts;
    walletModeIndex = Math.max(0, Math.min(walletModeIndex, Math.max(0, accounts.length - 1)));
    const today = localDateKey();

    els.walletCarousel.innerHTML = accounts.map((account, index) => {
      const balance = state.settings.privacy ? '₱••••' : currency(accountBalance(account.id));
      const savings = state.settings.privacy ? '₱••••' : currency(walletSavingsBalance(account.id));
      const todaySpent = state.transactions
        .filter((tx) => tx.type === 'expense' && tx.accountId === account.id && tx.date === today)
        .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
      const todayLabel = state.settings.privacy ? '₱••••' : (todaySpent > 0 ? `−${currency(todaySpent, true)}` : currency(0, true));
      const iconId = account.type === 'cash' ? 'i-wallet' : 'i-phone';
      return `
        <article class="wallet-mode-card ${walletModeTone(account)}" data-wallet-index="${index}" data-wallet-id="${escapeHtml(account.id)}" aria-label="${escapeHtml(account.name)} wallet">
          <span class="wallet-mode-card-glow" aria-hidden="true"></span>
          <div class="wallet-mode-card-top">
            <div>
              <p class="wallet-mode-card-kicker">${escapeHtml(walletModeTypeLabel(account))}</p>
              <h3>${escapeHtml(account.name)}</h3>
            </div>
            <span class="wallet-mode-card-icon">${icon(iconId)}</span>
          </div>
          <div class="wallet-mode-main-balance">
            <span>Current balance</span>
            <strong class="money-value">${balance}</strong>
          </div>
          <div class="wallet-mode-savings-inline">
            <span>${icon('i-savings')} Savings</span>
            <strong class="money-value">${savings}</strong>
          </div>
          <div class="wallet-mode-card-footer">
            <span>Today <b class="money-value">${todayLabel}</b></span>
            <span>${account.isPrimary ? 'Main wallet' : 'Wallet'}</span>
          </div>
        </article>`;
    }).join('');

    els.walletModeIndicators.innerHTML = accounts.map((account, index) => `
      <button type="button" data-wallet-mode-index="${index}" aria-label="Show ${escapeHtml(account.name)}"${index === walletModeIndex ? ' class="is-active" aria-current="true"' : ''}></button>`).join('');

    renderHomeWalletDetails(walletModeIndex);
    stabilizeWalletCarousel(walletModeIndex);
  }

  function activityDayName(dateKey) {
    const today = localDateKey();
    if (dateKey === today) return 'Today';
    if (dateKey === addDays(today, -1)) return 'Yesterday';
    return new Intl.DateTimeFormat('en-PH', { weekday: 'long' }).format(fromDateKey(dateKey));
  }

  function filteredActivity() {
    const type = els.activityType.value;
    return [...state.transactions]
      .filter((tx) => tx.date === activityDate && (tx.type === 'expense' || tx.type === 'transfer'))
      .filter((tx) => type === 'all' || tx.type === type)
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  }

  function moveActivityDay(days) {
    const today = localDateKey();
    const next = addDays(activityDate, days);
    if (next > today) return;
    activityDate = next;
    renderActivity();
  }

  function renderActivity() {
    const today = localDateKey();
    if (activityDate > today) activityDate = today;
    els.activityDatePicker.max = today;
    els.activityDatePicker.value = activityDate;
    els.activityDayName.textContent = activityDayName(activityDate);
    els.activityDayDate.textContent = DATE_LABEL.format(fromDateKey(activityDate));
    els.activityHistoryTitle.textContent = activityDate === today ? 'Today’s transactions' : `${activityDayName(activityDate)} transactions`;
    els.activityNextDay.disabled = activityDate >= today;

    els.monthSpent.textContent = currency(sumTransactions('expense', activityDate, activityDate), true);
    els.monthTransferred.textContent = currency(sumTransactions('transfer', activityDate, activityDate), true);
    const filtered = filteredActivity();
    els.activityCount.textContent = `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`;
    els.allTransactions.innerHTML = renderTransactionRows(filtered, true, {
      emptyTitle: 'No spending activity',
      emptyCopy: 'Expenses and wallet transfers for this day will appear here.'
    });
    const hasActivity = state.transactions.some((tx) => tx.type === 'expense' || tx.type === 'transfer');
    els.activitySwipeHint.classList.toggle('is-hidden', !hasActivity);
  }

  function renderSavings() {
    const accounts = state.accounts;
    savingsWalletIndex = Math.max(0, Math.min(savingsWalletIndex, Math.max(0, accounts.length - 1)));
    const selectedAccount = accounts[savingsWalletIndex] || accounts[0];
    const isWalletMode = savingsMode === 'wallet' && selectedAccount;
    const shownBalance = isWalletMode ? walletSavingsBalance(selectedAccount.id) : totalSavings();

    els.savingsModeToggle.querySelectorAll('[data-savings-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.savingsMode === savingsMode);
      button.setAttribute('aria-pressed', button.dataset.savingsMode === savingsMode ? 'true' : 'false');
    });
    els.savingsWalletTabs.classList.toggle('is-hidden', !isWalletMode);
    els.savingsWalletTabs.innerHTML = accounts.map((account, index) => `<button type="button" data-savings-wallet-index="${index}" class="${index === savingsWalletIndex ? 'is-active' : ''}">${escapeHtml(account.name)}</button>`).join('');

    els.savingsViewTitle.textContent = isWalletMode ? `${selectedAccount.name} savings` : 'All savings';
    els.savingsViewSubtitle.textContent = isWalletMode
      ? `Only money saved from ${selectedAccount.name} is shown.`
      : 'Everything you have set aside across all wallets.';
    els.savingsBalanceLabel.textContent = isWalletMode ? `Saved from ${selectedAccount.name}` : 'Total savings';
    els.totalSavings.textContent = currency(shownBalance);
    replayAnimation(els.totalSavings, 'amount-pop');

    const visibleGoals = state.goals.filter((goal) => !goal.removedAt);
    const goalLayout = visibleGoals.length <= 1 ? 'single' : visibleGoals.length === 2 ? 'pair' : 'multi';
    els.goalsGrid.dataset.goalLayout = goalLayout;
    els.goalsGrid.dataset.goalCount = String(visibleGoals.length);
    els.manageGoalsButton.disabled = visibleGoals.length === 0;
    els.manageGoalsButton.textContent = manageGoalsMode ? 'Done' : 'Manage goals';
    els.goalsGrid.classList.toggle('is-managing', manageGoalsMode);
    document.getElementById('view-savings')?.classList.toggle('is-managing-goals', manageGoalsMode && visibleGoals.length > 0);

    if (!visibleGoals.length) {
      manageGoalsMode = false;
      els.manageGoalsButton.textContent = 'Manage goals';
      els.goalsGrid.classList.remove('is-managing');
      document.getElementById('view-savings')?.classList.remove('is-managing-goals');
      els.goalsGrid.innerHTML = `<article class="card goal-card empty-goal-card"><div class="empty-state"><span class="round-icon purple-soft">${icon('i-target')}</span><strong>No savings goals yet</strong><span>Create a goal and choose which wallet the money comes from.</span><br><button class="button-primary" type="button" data-action="open-goal">Create goal</button></div></article>`;
    } else {
      els.goalsGrid.innerHTML = visibleGoals.map((goal) => {
        const totalCurrent = Number(goal.current || 0);
        const target = Math.max(Number(goal.target || 1), 1);
        const percent = Math.min(100, totalCurrent / target * 100);
        const walletCurrent = isWalletMode ? goalWalletSavings(goal, selectedAccount.id) : totalCurrent;
        const amountCopy = isWalletMode
          ? `${currency(walletCurrent, true)} from ${selectedAccount.name}`
          : `${currency(totalCurrent, true)} of ${currency(target, true)}`;
        const secondaryCopy = isWalletMode
          ? `${currency(totalCurrent, true)} total · ${Math.round(percent)}% of goal`
          : `${Math.round(percent)}% complete`;
        const accountAttribute = isWalletMode ? ` data-account-id="${escapeHtml(selectedAccount.id)}"` : '';
        const remaining = Math.max(0, target - totalCurrent);
        const manageButtons = manageGoalsMode
          ? `<div class="goal-manage-actions">
              <button type="button" data-action="edit-goal" data-goal-id="${escapeHtml(goal.id)}">${icon('i-edit')}<span>Edit</span></button>
              <button type="button" data-action="transfer-goal" data-goal-id="${escapeHtml(goal.id)}">${icon('i-transfer')}<span>Transfer</span></button>
              <button class="goal-remove" type="button" data-action="remove-goal" data-goal-id="${escapeHtml(goal.id)}" aria-label="Remove ${escapeHtml(goal.name)} savings goal">${icon('i-trash')}<span>Remove</span></button>
            </div>`
          : '';
        const primarySaved = isWalletMode ? walletCurrent : totalCurrent;
        const primarySavedLabel = isWalletMode ? `From ${selectedAccount.name}` : 'Saved';
        return `
          <article class="card goal-card" data-goal-id="${escapeHtml(goal.id)}">
            <div class="goal-card-head">
              <div><p class="eyebrow">Savings goal</p><h3>${escapeHtml(goal.name)}</h3><p class="goal-amount money-value">${escapeHtml(amountCopy)}</p></div>
              <div class="goal-card-actions">
                <button class="goal-history-button" type="button" data-action="open-goal-history" data-goal-id="${escapeHtml(goal.id)}" aria-label="View history for ${escapeHtml(goal.name)}">${icon('i-activity')}<span>History</span></button>
                <span class="round-icon green-soft">${icon('i-target')}</span>
              </div>
            </div>
            <div class="goal-card-metrics" aria-label="Goal progress details">
              <div><small>${escapeHtml(primarySavedLabel)}</small><strong class="money-value">${currency(primarySaved, true)}</strong></div>
              <div><small>Remaining</small><strong class="money-value">${currency(remaining, true)}</strong></div>
              <div><small>Target</small><strong class="money-value">${currency(target, true)}</strong></div>
            </div>
            <div class="goal-progress-block">
              <div class="goal-progress-copy"><span>${escapeHtml(secondaryCopy)}</span><strong>${Math.round(percent)}%</strong></div>
              <div class="goal-progress"><span style="width:${percent.toFixed(1)}%"></span></div>
            </div>
            ${manageButtons}
            <div class="goal-footer"><button class="button-secondary" type="button" data-action="open-contribution" data-goal-id="${escapeHtml(goal.id)}"${accountAttribute}>Add savings</button></div>
          </article>`;
      }).join('');
    }
    if (currentGoalHistoryId && els.goalHistoryDialog?.open) renderGoalHistory();
  }

  function goalHistoryEntries(goalId) {
    const transactions = state.transactions
      .filter((tx) => (tx.type === 'saving' || tx.type === 'saving_return') && tx.goalId === goalId)
      .map((tx) => ({ kind: 'transaction', createdAt: tx.createdAt || `${tx.date || ''}T12:00:00`, tx }));
    const transfers = state.goalTransfers
      .filter((item) => item.fromGoalId === goalId || item.toGoalId === goalId)
      .map((item) => ({ kind: 'goal_transfer', createdAt: item.createdAt || '', transfer: item }));
    return [...transactions, ...transfers].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function goalTransferHistoryRow(entry, goal) {
    const transfer = entry.transfer;
    const incoming = transfer.toGoalId === goal.id;
    const otherGoalId = incoming ? transfer.fromGoalId : transfer.toGoalId;
    const otherGoal = state.goals.find((item) => item.id === otherGoalId);
    const otherName = otherGoal?.name || 'another goal';
    const parsed = Date.parse(transfer.createdAt || '');
    const timing = Number.isFinite(parsed)
      ? `${DATE_LABEL.format(new Date(parsed))} · ${TIME_LABEL.format(new Date(parsed))}`
      : '';
    const amount = `${incoming ? '+' : '−'}${currency(transfer.amount, true)}`;
    return `
      <div class="goal-history-row goal-transfer-history-row">
        <span class="round-icon accent-soft">${icon('i-transfer')}</span>
        <div class="goal-history-copy">
          <strong>${incoming ? 'Transferred in' : 'Transferred out'}</strong>
          <small>${escapeHtml(incoming ? `From ${otherName}` : `To ${otherName}`)}${timing ? ` · ${escapeHtml(timing)}` : ''}</small>
        </div>
        <div class="goal-history-amount"><strong class="money-value">${amount}</strong><span class="inline-lock" aria-label="Transfer record">${icon('i-lock')}</span></div>
      </div>`;
  }

  function goalTransactionHistoryRow(entry, goal) {
    const tx = entry.tx;
    const isReturn = tx.type === 'saving_return';
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Wallet';
    const time = transactionTimeLabel(tx);
    const date = tx.date ? DATE_LABEL.format(fromDateKey(tx.date)) : '';
    const timing = [account, date, time].filter(Boolean).join(' · ');
    const amount = `${isReturn ? '−' : '+'}${currency(tx.amount, true)}`;
    const canUndo = !isReturn && canModifyTransaction(tx) && !state.goalTransfers.some((item) => item.fromGoalId === goal.id || item.toGoalId === goal.id);
    const status = canUndo
      ? `<button class="compact-history-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')}<span>Undo</span></button>`
      : `<span class="inline-lock" aria-label="Locked">${icon('i-lock')}</span>`;
    return `
      <div class="goal-history-row ${escapeHtml(tx.type)}">
        <span class="round-icon ${isReturn ? 'green-soft' : 'purple-soft'}">${icon('i-savings')}</span>
        <div class="goal-history-copy">
          <strong>${isReturn ? 'Savings returned' : 'Savings added'}</strong>
          <small>${escapeHtml(timing)}</small>
        </div>
        <div class="goal-history-amount"><strong class="money-value">${amount}</strong>${status}</div>
      </div>`;
  }

  function renderGoalHistory() {
    if (!els.goalHistoryList) return;
    const goal = state.goals.find((item) => item.id === currentGoalHistoryId);
    if (!goal) {
      if (els.goalHistoryDialog?.open) closeDialog(els.goalHistoryDialog);
      currentGoalHistoryId = '';
      return;
    }
    const entries = goalHistoryEntries(goal.id);
    els.goalHistoryTitle.textContent = goal.name;
    els.goalHistorySubtitle.textContent = 'Savings added, returned, or moved for this goal.';
    els.goalHistoryCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
    els.goalHistoryList.innerHTML = entries.length
      ? entries.map((entry) => entry.kind === 'goal_transfer' ? goalTransferHistoryRow(entry, goal) : goalTransactionHistoryRow(entry, goal)).join('')
      : `<div class="empty-state"><span class="round-icon purple-soft">${icon('i-savings')}</span><strong>No history yet</strong><span>Savings activity for this goal will appear here.</span></div>`;
  }

  function allowanceHistoryTransactions() {
    return [...state.transactions]
      .filter((tx) => tx.type === 'income')
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  }

  function renderAllowanceHistoryRows(history) {
    if (!history.length) {
      return `<div class="empty-state"><span class="round-icon green-soft">${icon('i-arrow-down')}</span><strong>No allowance history yet</strong><span>Recorded allowance entries will appear here.</span></div>`;
    }
    return history.map((tx) => {
      const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Wallet';
      const date = tx.date ? DATE_LABEL.format(fromDateKey(tx.date)) : '';
      const time = transactionTimeLabel(tx);
      const timing = [account, date, time].filter(Boolean).join(' · ');
      const modifiable = canModifyTransaction(tx);
      const actions = modifiable
        ? `<div class="allowance-history-actions">${canEditTransaction(tx) ? `<button class="compact-history-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')}<span>Edit</span></button>` : ''}<button class="compact-history-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')}<span>Undo</span></button></div>`
        : `<span class="inline-lock allowance-inline-lock" aria-label="Locked">${icon('i-lock')}<span>Locked</span></span>`;
      return `
        <div class="allowance-history-row">
          <span class="round-icon green-soft">${icon('i-arrow-down')}</span>
          <div class="allowance-history-copy"><strong>Allowance received</strong><small>${escapeHtml(timing)}</small>${modifiable ? actions : ''}</div>
          <div class="allowance-history-amount"><strong class="money-value">+${currency(tx.amount, true)}</strong>${modifiable ? '' : actions}</div>
        </div>`;
    }).join('');
  }

  function renderAllowanceHistory() {
    if (!els.allowanceHistoryList) return;
    const history = allowanceHistoryTransactions();
    els.allowanceHistoryCount.textContent = `${history.length} entr${history.length === 1 ? 'y' : 'ies'}`;
    els.allowanceHistoryList.innerHTML = renderAllowanceHistoryRows(history);
    if (els.allowanceHistorySummary) {
      const latest = history[0];
      const latestDate = latest?.date ? DATE_LABEL.format(fromDateKey(latest.date)) : '';
      els.allowanceHistorySummary.textContent = latest
        ? `${history.length} entr${history.length === 1 ? 'y' : 'ies'}${latestDate ? ` · Latest ${latestDate}` : ''}`
        : 'No allowance entries yet.';
    }
  }

  function openGoalHistory(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !item.removedAt);
    if (!goal) return;
    currentGoalHistoryId = goal.id;
    renderGoalHistory();
    openDialog(els.goalHistoryDialog);
    requestAnimationFrame(() => {
      if (els.goalHistoryList) els.goalHistoryList.scrollTop = 0;
      els.goalHistoryDialog.focus();
    });
  }

  function openAllowanceHistory() {
    renderAllowanceHistory();
    openDialog(els.allowanceHistoryDialog);
    requestAnimationFrame(() => {
      if (els.allowanceHistoryList) els.allowanceHistoryList.scrollTop = 0;
      els.allowanceHistoryDialog.focus();
    });
  }

  function renderWallets() {
    if (!els.walletsList) return;
    const accounts = state.accounts || [];
    if (!accounts.length) {
      els.walletsList.innerHTML = '<div class="wallet-list-empty">No wallets found. Cash will be restored after refresh.</div>';
      return;
    }
    els.walletsList.innerHTML = accounts.map((account, index) => {
      const balance = state.settings.privacy ? '₱••••' : currency(accountBalance(account.id), true);
      const savings = state.settings.privacy ? '₱••••' : currency(walletSavingsBalance(account.id), true);
      const used = state.transactions.some((tx) => tx.accountId === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id);
      const remove = index === 0
        ? '<span class="status-pill neutral">Main</span>'
        : used
          ? '<span class="wallet-used-label">In use</span>'
          : `<button class="wallet-remove" type="button" data-action="remove-wallet" data-id="${escapeHtml(account.id)}">Remove</button>`;
      return `<div class="wallet-row"><span class="round-icon ${index === 0 ? 'accent-soft' : 'neutral-soft'}">${icon(index === 0 ? 'i-wallet' : 'i-phone')}</span><div><strong>${escapeHtml(account.name)}</strong><small><span class="money-value">${balance}</span> available · <span class="money-value">${savings}</span> saved</small></div>${remove}</div>`;
    }).join('');
  }

  function companionIsAvailable() {
    return Boolean(els.pocketCompanion && state?.settings?.theme === 'light' && isSecretPocketUnlocked() && secretConfig?.companionEnabled !== false);
  }

  function companionWait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, companionReducedMotion ? Math.min(ms, 80) : ms));
  }

  function companionSetPhase(phase = 'idle') {
    companionPhase = phase;
    if (els.pocketCompanion) els.pocketCompanion.dataset.phase = phase;
  }

  function companionSetMood(mood = 'relaxed') {
    companionMood = mood;
    if (els.pocketCompanion) els.pocketCompanion.dataset.mood = mood;
  }

  function companionClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function companionApplyGaze() {
    if (!els.pocketCompanion) return;
    const x = companionGazeCurrent.x;
    const y = companionGazeCurrent.y;
    els.pocketCompanion.style.setProperty('--gaze-x', `${(x * 2.15).toFixed(2)}px`);
    els.pocketCompanion.style.setProperty('--gaze-y', `${(y * 1.7).toFixed(2)}px`);
    els.pocketCompanion.style.setProperty('--head-look-x', `${(x * 1.15).toFixed(2)}px`);
    els.pocketCompanion.style.setProperty('--head-look-y', `${(y * .85).toFixed(2)}px`);
    els.pocketCompanion.style.setProperty('--head-look-rotate', `${(x * 2.4).toFixed(2)}deg`);
  }

  function companionRunGazeFrame() {
    companionGazeFrame = 0;
    if (!els.pocketCompanion) return;
    const ease = companionReducedMotion ? 1 : .18;
    companionGazeCurrent.x += (companionGazeTarget.x - companionGazeCurrent.x) * ease;
    companionGazeCurrent.y += (companionGazeTarget.y - companionGazeCurrent.y) * ease;
    if (Math.abs(companionGazeTarget.x - companionGazeCurrent.x) < .008) companionGazeCurrent.x = companionGazeTarget.x;
    if (Math.abs(companionGazeTarget.y - companionGazeCurrent.y) < .008) companionGazeCurrent.y = companionGazeTarget.y;
    companionApplyGaze();
    if (Math.abs(companionGazeTarget.x - companionGazeCurrent.x) > .008 || Math.abs(companionGazeTarget.y - companionGazeCurrent.y) > .008) {
      companionGazeFrame = requestAnimationFrame(companionRunGazeFrame);
    }
  }

  function companionSetGazeNormalized(x = 0, y = 0, immediate = false) {
    companionGazeTarget = { x: companionClamp(Number(x) || 0, -1, 1), y: companionClamp(Number(y) || 0, -1, 1) };
    if (immediate || companionReducedMotion) {
      companionGazeCurrent = { ...companionGazeTarget };
      companionApplyGaze();
      return;
    }
    if (!companionGazeFrame) companionGazeFrame = requestAnimationFrame(companionRunGazeFrame);
  }

  function companionSetLook(direction = 'center') {
    if (!els.pocketCompanion) return;
    els.pocketCompanion.dataset.look = direction;
    const map = { left: [-.78, 0], right: [.78, 0], up: [0, -.76], down: [0, .68], center: [0, 0] };
    companionSetGazeNormalized(...(map[direction] || map.center));
  }

  function companionSetMotionVector(dx = 0, dy = 0, intensity = 1) {
    if (!els.pocketCompanion) return;
    const direction = dx === 0 ? 0 : Math.sign(dx);
    const lean = companionClamp(dx / 70, -1, 1) * 5 * intensity;
    const vertical = companionClamp(dy / 90, -1, 1);
    els.pocketCompanion.style.setProperty('--motion-lean', `${lean.toFixed(2)}deg`);
    els.pocketCompanion.style.setProperty('--ear-trail', `${(-direction * (5 + Math.abs(lean) * .7) * intensity).toFixed(2)}deg`);
    els.pocketCompanion.style.setProperty('--tail-swing', `${(direction * (7 + Math.abs(lean)) * intensity).toFixed(2)}deg`);
    els.pocketCompanion.style.setProperty('--motion-y', `${(vertical * 1.5).toFixed(2)}px`);
  }

  function companionResetMotionVector() {
    if (!els.pocketCompanion) return;
    els.pocketCompanion.style.setProperty('--motion-lean', '0deg');
    els.pocketCompanion.style.setProperty('--ear-trail', '0deg');
    els.pocketCompanion.style.setProperty('--tail-swing', '0deg');
    els.pocketCompanion.style.setProperty('--motion-y', '0px');
  }

  function companionLookAtPoint(clientX, clientY) {
    if (!companionIsAvailable() || !Number.isFinite(clientX) || !Number.isFinite(clientY) || companionPointerState?.dragging) return;
    const bounds = companionBounds();
    const x = (Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX) + bounds.boxWidth / 2;
    const y = (Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY) + bounds.boxHeight * .42;
    const dx = clientX - x;
    const dy = clientY - y;
    const distance = Math.hypot(dx, dy);
    if (distance > 390 || companionPhase === 'travel' || companionPhase === 'interact') {
      els.pocketCompanion?.classList.remove('is-pointer-aware', 'is-gaze-active');
      if (companionPhase === 'idle') companionSetLook('center');
      return;
    }
    companionSetFacing(dx);
    companionSetGazeNormalized(companionClamp(dx / 125, -1, 1), companionClamp(dy / 105, -1, 1));
    const direction = Math.abs(dx) > Math.abs(dy) * .72 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    els.pocketCompanion.dataset.look = direction;
    els.pocketCompanion?.classList.add('is-pointer-aware', 'is-gaze-active');
  }

  function companionPetZoneFromPoint(clientX, clientY) {
    const rect = els.companionBunny?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return 'head';
    const x = companionClamp((clientX - rect.left) / rect.width, 0, 1);
    const y = companionClamp((clientY - rect.top) / rect.height, 0, 1);
    if (y < .34 && x < .46) return 'left-ear';
    if (y < .34 && x > .54) return 'right-ear';
    if (y < .64) return 'head';
    return 'chest';
  }

  function companionDragTo(clientX, clientY) {
    if (!companionPointerState || !els.pocketCompanion) return;
    const bounds = companionBounds();
    const dx = clientX - companionPointerState.startX;
    const dy = clientY - companionPointerState.startY;
    const x = Math.max(bounds.minX, Math.min(bounds.maxX, companionPointerState.originX + dx));
    const y = Math.max(bounds.minY, Math.min(bounds.maxY, companionPointerState.originY + dy));
    const now = performance.now();
    const elapsed = Math.max(8, now - (companionPointerState.lastAt || now));
    const vx = (clientX - companionPointerState.lastX) / elapsed * 16;
    const vy = (clientY - companionPointerState.lastY) / elapsed * 16;
    companionPointerState.velocityX = vx;
    companionPointerState.velocityY = vy;
    companionPointerState.lastX = clientX;
    companionPointerState.lastY = clientY;
    companionPointerState.lastAt = now;
    els.pocketCompanion.style.setProperty('--companion-x', `${Math.round(x)}px`);
    els.pocketCompanion.style.setProperty('--companion-y', `${Math.round(y)}px`);
    els.pocketCompanion.style.setProperty('--drag-lean', `${companionClamp(vx * 1.7, -8, 8).toFixed(2)}deg`);
    const dragLag = companionClamp(-vx * 2.2, -12, 12);
    els.pocketCompanion.style.setProperty('--drag-lag', `${dragLag.toFixed(2)}deg`);
    els.pocketCompanion.style.setProperty('--drag-lag-reverse', `${(-dragLag).toFixed(2)}deg`);
    companionSetMotionVector(vx * 24, vy * 24, .9);
    companionPosition = { x: Math.round(x), y: Math.round(y) };
    companionUpdateBubbleSide(x, y);
  }

  function companionPetMain() {
    if (!companionPointerState || companionPointerState.dragging || companionPointerState.petting) return;
    companionPointerState.petting = true;
    companionPointerState.petRewardSteps = 0;
    companionPointerState.strokeDistance = 0;
    companionPointerState.petZone ||= companionPetZoneFromPoint(companionPointerState.startX, companionPointerState.startY);
    companionClearQueue();
    companionCancelTravel();
    companionClearPose();
    companionClearPerch();
    companionSetMood('happy');
    companionSetGazeNormalized(0, -.18);
    els.pocketCompanion?.classList.add('is-petting');
    els.pocketCompanion.dataset.petZone = companionPointerState.petZone;
    companionAdjustProfile({ affection: 2, energy: 1, pet: 1, mood: 'happy' }, { render: false });
    if (els.companionBunny) companionEmitEffect(els.companionBunny, 'heart', 3, false);
  }

  function companionPetStroke(event) {
    const pointer = companionPointerState;
    if (!pointer?.petting || !els.pocketCompanion) return;
    const now = performance.now();
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    const distance = Math.hypot(dx, dy);
    pointer.strokeDistance += distance;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.lastAt = now;
    const tilt = companionClamp(dx * .42, -7, 7);
    const lift = companionClamp(dy * .16, -2.5, 2.5);
    els.pocketCompanion.style.setProperty('--pet-stroke-tilt', `${tilt.toFixed(2)}deg`);
    els.pocketCompanion.style.setProperty('--pet-stroke-y', `${lift.toFixed(2)}px`);
    els.pocketCompanion.classList.add('is-pet-stroking');
    const earnedSteps = Math.min(3, Math.floor(pointer.strokeDistance / 52));
    if (earnedSteps > pointer.petRewardSteps) {
      const delta = earnedSteps - pointer.petRewardSteps;
      pointer.petRewardSteps = earnedSteps;
      companionAdjustProfile({ affection: delta, energy: delta * .5, interaction: false }, { render: false });
    }
  }

  function companionPerchElementAt(clientX, clientY) {
    if (!document.elementsFromPoint) return null;
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const node of elements) {
      if (!node || node === els.pocketCompanion || els.pocketCompanion?.contains(node) || node.closest?.('dialog')) continue;
      const candidate = node.matches?.(COMPANION_PERCH_SELECTOR) ? node : node.closest?.(COMPANION_PERCH_SELECTOR);
      if (candidate && companionVisibleElement(candidate)) return candidate;
    }
    return null;
  }

  function companionClearPerch() {
    companionPerchedUntil = 0;
    companionPerchTarget = null;
    companionPerchSide = 'center';
    if (els.pocketCompanion) {
      els.pocketCompanion.classList.remove('is-perched', 'is-perch-settling');
      delete els.pocketCompanion.dataset.perchSide;
    }
  }

  async function companionPerchOnElement(element, duration = 7000, immediate = false) {
    if (!companionIsAvailable() || !element?.isConnected || !companionVisibleElement(element)) return false;
    const target = companionTargetPosition(element, { forcePerch: true });
    if (target.placement !== 'perch') return false;
    if (immediate) await companionPlace(target.x, target.y, true);
    else await companionMoveTo(target.x, target.y, { mode: 'hop' });
    if (!companionIsAvailable() || !element.isConnected) return false;
    companionPerchTarget = element;
    companionPerchedUntil = Date.now() + duration;
    companionPerchSide = target.perchSide || 'center';
    els.pocketCompanion.dataset.perchSide = companionPerchSide;
    els.pocketCompanion.classList.add('is-perched', 'is-perch-settling');
    window.setTimeout(() => els.pocketCompanion?.classList.remove('is-perch-settling'), 620);
    companionSetMood('relaxed');
    companionLookAtElement(element);
    return true;
  }

  function companionSingleTap() {
    companionAdjustProfile({ affection: 1, energy: -1, tap: 1, mood: 'curious' }, { render: false });
    companionQueueAction('direct-tap', async () => {
      companionClearPerch();
      companionSetMood('curious');
      companionSetPhase('react');
      await companionPose(Math.random() < .55 ? 'waving' : 'curious', 950);
      if (Date.now() - companionLastMessageAt > 6000) companionSay(`${companionName()} noticed you ♡`, 2800);
      return true;
    }, { priority: true });
  }

  function companionDoubleTap() {
    companionAdjustProfile({ affection: 2, energy: -3, tap: 2, mood: 'excited' }, { render: false });
    if (els.companionBunny) companionEmitEffect(els.companionBunny, 'heart', 4, false);
    companionQueueAction('direct-double-tap', async () => {
      companionClearPerch();
      companionSetMood('excited');
      companionSetPhase('react');
      await companionPose(Math.random() < .5 ? 'hopping' : 'spinning', 1050);
      companionSay('Again! Again! ♡', 2500, { essential: true });
      return true;
    }, { priority: true });
  }

  function companionHandleTap() {
    const now = Date.now();
    if (now - companionLastTapAt < 330) {
      window.clearTimeout(companionSingleTapTimer);
      companionSingleTapTimer = 0;
      companionLastTapAt = 0;
      companionDoubleTap();
      return;
    }
    companionLastTapAt = now;
    window.clearTimeout(companionSingleTapTimer);
    companionSingleTapTimer = window.setTimeout(() => {
      companionSingleTapTimer = 0;
      companionSingleTap();
    }, 310);
  }

  function companionPointerDown(event) {
    if (!companionIsAvailable() || document.querySelector('dialog[open]')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    resetCompanionIdleTimer();
    companionClearQueue();
    companionCancelTravel();
    companionClearPerch();
    const bounds = companionBounds();
    const now = performance.now();
    companionPointerState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: now,
      velocityX: 0,
      velocityY: 0,
      originX: Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX,
      originY: Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY,
      startAt: Date.now(),
      dragging: false,
      petting: false,
      strokeDistance: 0,
      petRewardSteps: 0,
      petZone: companionPetZoneFromPoint(event.clientX, event.clientY)
    };
    try { els.companionBunny?.setPointerCapture?.(event.pointerId); } catch (error) { /* Some browsers only allow capture for native active pointers. */ }
    els.pocketCompanion?.classList.add('is-held');
    window.clearTimeout(companionPetTimer);
    companionPetTimer = window.setTimeout(companionPetMain, 500);
  }

  function companionPointerMove(event) {
    if (!companionPointerState || event.pointerId !== companionPointerState.id) return;
    event.preventDefault();
    if (companionPointerState.petting) {
      companionPetStroke(event);
      return;
    }
    const dx = event.clientX - companionPointerState.startX;
    const dy = event.clientY - companionPointerState.startY;
    const distance = Math.hypot(dx, dy);
    if (!companionPointerState.dragging && distance > 11) {
      window.clearTimeout(companionPetTimer);
      companionPointerState.dragging = true;
      els.pocketCompanion?.classList.add('is-dragging');
      companionSetMood('curious');
    }
    if (companionPointerState.dragging) companionDragTo(event.clientX, event.clientY);
  }

  function companionPointerEnd(event, cancelled = false) {
    if (!companionPointerState || event.pointerId !== companionPointerState.id) return;
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(companionPetTimer);
    const pointer = companionPointerState;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    const duration = Date.now() - pointer.startAt;
    companionPointerState = null;
    try { els.companionBunny?.releasePointerCapture?.(event.pointerId); } catch (error) { /* already released */ }
    els.pocketCompanion?.classList.remove('is-held', 'is-dragging', 'is-pet-stroking');
    els.pocketCompanion?.style.setProperty('--pet-stroke-tilt', '0deg');
    els.pocketCompanion?.style.setProperty('--pet-stroke-y', '0px');
    els.pocketCompanion?.style.setProperty('--drag-lean', '0deg');
    els.pocketCompanion?.style.setProperty('--drag-lag', '0deg');
    els.pocketCompanion?.style.setProperty('--drag-lag-reverse', '0deg');
    companionResetMotionVector();

    if (cancelled) {
      els.pocketCompanion?.classList.remove('is-petting');
      if (els.pocketCompanion) delete els.pocketCompanion.dataset.petZone;
      return;
    }
    if (pointer.petting) {
      const zoneLines = {
        'left-ear': 'That ear twitch means yes ♡',
        'right-ear': 'Ear scritches accepted ♡',
        head: 'That was a very good head pat ♡',
        chest: `${companionName()} looks extra cozy now ♡`
      };
      if (Date.now() - companionLastMessageAt > 4200) companionSay(zoneLines[pointer.petZone] || 'Head pats accepted ♡', 2800, { essential: true });
      window.setTimeout(() => {
        els.pocketCompanion?.classList.remove('is-petting');
        if (els.pocketCompanion) delete els.pocketCompanion.dataset.petZone;
      }, 420);
      scheduleCompanionAction(7000);
      return;
    }
    if (dy < -55 && Math.abs(dx) < 70 && duration < 650) {
      companionPlace(pointer.originX, pointer.originY, true);
      companionAdjustProfile({ affection: 1, energy: -3, mood: 'excited' }, { render: false });
      companionQueueAction('direct-swipe-jump', async () => {
        companionSetMood('excited');
        await companionPose('hopping', 950);
        return true;
      }, { priority: true });
      return;
    }
    if (pointer.dragging) {
      const dropTarget = companionPerchElementAt(event.clientX, event.clientY);
      const profile = companionAdjustProfile({ affection: 1, energy: -2, drag: 1, mood: 'curious' }, { render: false });
      companionSetMood('curious');
      if (dropTarget) {
        companionPerchOnElement(dropTarget, 9000, false).then((perched) => {
          if (perched && Date.now() - companionLastMessageAt > 6500) companionSay('Oh! This spot is nice ♡', 2800);
        });
      } else {
        const speed = Math.hypot(pointer.velocityX || 0, pointer.velocityY || 0);
        els.pocketCompanion?.classList.add(speed > 5 ? 'is-bouncy-drop' : 'is-soft-drop');
        window.setTimeout(() => els.pocketCompanion?.classList.remove('is-bouncy-drop', 'is-soft-drop'), 420);
        if (profile.drags % 4 === 0) companionSay('New favorite spot? ✨', 2600);
      }
      scheduleCompanionAction(8000);
      return;
    }
    companionHandleTap();
  }

  function companionPointerWatch(event) {
    if (!companionIsAvailable() || companionPointerState || event.pointerType === 'touch') return;
    if (companionPointerLookFrame) return;
    companionPointerLookFrame = requestAnimationFrame(() => {
      companionPointerLookFrame = 0;
      companionLookAtPoint(event.clientX, event.clientY);
    });
  }

  function companionSetProp(prop = '') {
    if (!els.pocketCompanion) return;
    els.pocketCompanion.dataset.prop = prop;
  }

  function companionResetExpression() {
    companionSetLook('center');
    companionSetProp('');
    els.pocketCompanion?.classList.remove('is-gaze-active');
    if (!els.pocketCompanion?.classList.contains('is-sleeping')) companionSetMood(companionMoodFromState());
  }

  function companionScheduleBlink() {
    window.clearTimeout(companionBlinkTimer);
    if (!companionIsAvailable()) return;
    companionBlinkTimer = window.setTimeout(() => {
      if (!companionIsAvailable()) return;
      if (!els.pocketCompanion.classList.contains('is-sleeping') && !els.pocketCompanion.classList.contains('is-traveling')) {
        els.pocketCompanion.classList.add('is-blinking');
        window.setTimeout(() => els.pocketCompanion?.classList.remove('is-blinking'), 145);
      }
      companionScheduleBlink();
    }, 2600 + Math.random() * 4200);
  }

  function companionClearFocus() {
    window.clearTimeout(companionFocusTimer);
    companionFocusTimer = 0;
    if (companionFocusedElement) {
      companionFocusedElement.classList.remove('companion-is-being-noticed', 'companion-is-being-tapped');
    }
    companionFocusedElement = null;
  }

  function companionFocusElement(element, duration = 2200, tapped = false) {
    companionClearFocus();
    if (!element || !element.isConnected) return;
    companionFocusedElement = element;
    element.classList.add('companion-is-being-noticed');
    if (tapped) element.classList.add('companion-is-being-tapped');
    companionFocusTimer = window.setTimeout(companionClearFocus, duration);
  }

  function companionCancelTravel() {
    companionTravelToken += 1;
    if (companionTravelAnimation) {
      try { companionTravelAnimation.cancel(); } catch (error) { /* already finished */ }
      companionTravelAnimation = null;
    }
    els.pocketCompanion?.classList.remove('is-traveling');
  }

  function companionClearEffects() {
    companionEffectNodes.forEach((node) => node.remove());
    companionEffectNodes.clear();
  }

  function companionClearQueue() {
    companionQueueGeneration += 1;
    companionQueue.splice(0).forEach((item) => item.resolve?.(false));
  }

  function clearCompanionTimers() {
    window.clearTimeout(companionActionTimer);
    window.clearTimeout(companionAffirmationTimer);
    window.clearTimeout(companionIdleTimer);
    window.clearTimeout(companionBubbleTimer);
    window.clearTimeout(companionPoseTimer);
    window.clearTimeout(companionFocusTimer);
    window.clearTimeout(companionBlinkTimer);
    window.clearTimeout(companionPetTimer);
    window.clearTimeout(companionSingleTapTimer);
    if (companionPointerLookFrame) cancelAnimationFrame(companionPointerLookFrame);
    if (companionGazeFrame) cancelAnimationFrame(companionGazeFrame);
    companionActionTimer = companionAffirmationTimer = companionIdleTimer = companionBubbleTimer = companionPoseTimer = companionFocusTimer = companionBlinkTimer = companionPetTimer = companionSingleTapTimer = 0;
    companionPointerLookFrame = 0;
    companionGazeFrame = 0;
    companionStoryGeneration += 1;
    companionPointerState = null;
    companionClearQueue();
    companionCancelTravel();
    companionClearFocus();
    companionClearEffects();
    companionClearPerch();
    companionSetGazeNormalized(0, 0, true);
    companionResetMotionVector();
    els.pocketCompanion?.classList.remove('is-held','is-dragging','is-petting','is-pet-stroking','is-pointer-aware','is-gaze-active','is-anticipating','is-landing','is-soft-drop','is-bouncy-drop','is-grooming','is-shy','is-trip','is-startled','is-dozing-sit');
  }

  function companionQueueAction(name, runner, options = {}) {
    if (!companionIsAvailable()) return Promise.resolve(false);
    if (options.spontaneous && (companionQueueRunning || companionQueue.length)) return Promise.resolve(false);
    return new Promise((resolve) => {
      const item = { name, runner, resolve };
      if (options.priority) companionQueue.unshift(item);
      else companionQueue.push(item);
      companionProcessQueue();
    });
  }

  async function companionProcessQueue() {
    if (companionQueueRunning) return;
    companionQueueRunning = true;
    const generation = companionQueueGeneration;
    while (companionQueue.length && companionIsAvailable() && generation === companionQueueGeneration) {
      const item = companionQueue.shift();
      let completed = false;
      try {
        completed = await item.runner() !== false;
      } catch (error) {
        console.warn('Companion action skipped.', error);
      }
      item.resolve?.(completed);
      if (completed && !item.name.includes('sleep') && !item.name.includes('wake')) companionAdjustProfile({ energy: -1, interaction: false }, { render: false });
      if (!els.pocketCompanion?.classList.contains('is-sleeping')) {
        companionSetPhase('rest');
        await companionWait(180);
        companionClearPose({ preservePerch: true });
        companionResetExpression();
        companionSetPhase('idle');
      }
    }
    companionQueueRunning = false;
    if (companionQueue.length && companionIsAvailable()) companionProcessQueue();
  }

  function companionBounds() {
    const boxWidth = window.innerWidth <= 560 ? 88 : 98;
    const boxHeight = window.innerWidth <= 560 ? 100 : 110;
    const width = Math.max(320, window.innerWidth || 390);
    const height = Math.max(480, window.innerHeight || 844);
    const desktopReserve = width > 1024 ? 250 : width > 820 ? 104 : 8;
    const minX = desktopReserve + 8;
    const maxX = Math.max(minX, width - boxWidth - 10);
    const minY = 106;
    const bottomReserve = width <= 820 ? 145 : 24;
    const maxY = Math.max(minY, height - boxHeight - bottomReserve);
    return { boxWidth, boxHeight, width, height, minX, maxX, minY, maxY };
  }

  function companionSafePosition(preferEdge = false) {
    const bounds = companionBounds();
    let x;
    let y;
    if (preferEdge || Math.random() < .64) {
      x = Math.random() < .5 ? bounds.minX : bounds.maxX;
      y = Math.round(bounds.minY + Math.random() * Math.max(0, bounds.maxY - bounds.minY));
    } else {
      x = Math.round(bounds.minX + Math.random() * Math.max(0, bounds.maxX - bounds.minX));
      y = Math.round(bounds.minY + Math.random() * Math.max(0, bounds.maxY - bounds.minY));
    }
    return { x, y, ...bounds };
  }

  function companionUpdateBubbleSide(x, y) {
    if (!els.pocketCompanion) return;
    const width = window.innerWidth || 390;
    els.pocketCompanion.classList.toggle('bubble-left', x > width * .55);
    els.pocketCompanion.classList.toggle('bubble-below', y < 170);
  }

  function companionSetFacing(deltaX) {
    if (!els.pocketCompanion || Math.abs(deltaX) < 5) return;
    els.pocketCompanion.style.setProperty('--bunny-facing', deltaX < 0 ? '-1' : '1');
  }

  function companionPlace(x, y, immediate = false) {
    if (!els.pocketCompanion) return Promise.resolve();
    const bounds = companionBounds();
    const nextX = Math.max(bounds.minX, Math.min(bounds.maxX, Math.round(x)));
    const nextY = Math.max(bounds.minY, Math.min(bounds.maxY, Math.round(y)));
    if (!immediate && !companionReducedMotion) return companionMoveTo(nextX, nextY, { mode: 'hop' });
    companionCancelTravel();
    els.pocketCompanion.style.setProperty('--companion-x', `${nextX}px`);
    els.pocketCompanion.style.setProperty('--companion-y', `${nextY}px`);
    companionPosition = { x: nextX, y: nextY };
    companionUpdateBubbleSide(nextX, nextY);
    return Promise.resolve();
  }

  async function companionMoveTo(x, y, options = {}) {
    if (!els.pocketCompanion) return;
    companionClearPerch();
    const bounds = companionBounds();
    const allowOffscreen = Boolean(options.allowOffscreen);
    const targetX = allowOffscreen ? Math.round(x) : Math.max(bounds.minX, Math.min(bounds.maxX, Math.round(x)));
    const targetY = allowOffscreen ? Math.round(y) : Math.max(bounds.minY, Math.min(bounds.maxY, Math.round(y)));
    const startX = Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX;
    const startY = Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.hypot(dx, dy);

    companionUpdateBubbleSide(targetX, targetY);
    companionSetFacing(dx);
    companionSetMotionVector(dx, dy, 1);
    if (companionReducedMotion || !els.pocketCompanion.animate || distance < 3) {
      companionCancelTravel();
      els.pocketCompanion.style.setProperty('--companion-x', `${targetX}px`);
      els.pocketCompanion.style.setProperty('--companion-y', `${targetY}px`);
      companionPosition = { x: targetX, y: targetY };
      companionResetMotionVector();
      return;
    }

    companionCancelTravel();
    const token = ++companionTravelToken;
    companionSetPhase('anticipate');
    els.pocketCompanion.classList.add('is-anticipating');
    await companionWait(options.mode === 'slide' ? 80 : 135);
    els.pocketCompanion.classList.remove('is-anticipating');
    if (!companionIsAvailable() || token !== companionTravelToken) return;

    companionSetPhase('travel');
    const mode = options.mode || 'hop';
    const frames = [];
    let duration;

    if (mode === 'slide') {
      frames.push({ transform: `translate3d(${startX}px, ${startY}px, 0)`, offset: 0 });
      frames.push({ transform: `translate3d(${targetX}px, ${targetY}px, 0)`, offset: 1 });
      duration = options.duration || Math.max(420, Math.min(880, distance * 2.8));
    } else {
      const hops = Math.max(1, Math.min(6, Math.ceil(distance / 92)));
      const hopHeight = Math.max(18, Math.min(32, 18 + distance / 30));
      for (let hop = 0; hop < hops; hop += 1) {
        const start = hop / hops;
        const end = (hop + 1) / hops;
        const span = end - start;
        const crouch = start + span * .11;
        const apex = start + span * .46;
        const land = start + span * .87;
        const sx = startX + dx * start;
        const sy = startY + dy * start;
        const cx = startX + dx * crouch;
        const cy = startY + dy * crouch + 2;
        const ax = startX + dx * apex;
        const ay = startY + dy * apex - hopHeight * (hop === hops - 1 ? .94 : 1);
        const lx = startX + dx * land;
        const ly = startY + dy * land + 2;
        const ex = startX + dx * end;
        const ey = startY + dy * end;
        if (hop === 0) frames.push({ transform: `translate3d(${sx}px, ${sy}px, 0)`, offset: 0 });
        frames.push({ transform: `translate3d(${cx}px, ${cy}px, 0)`, offset: crouch, easing: 'cubic-bezier(.35,0,.7,.35)' });
        frames.push({ transform: `translate3d(${ax}px, ${ay}px, 0)`, offset: apex, easing: 'cubic-bezier(.18,.72,.28,1)' });
        frames.push({ transform: `translate3d(${lx}px, ${ly}px, 0)`, offset: land, easing: 'cubic-bezier(.48,.02,.72,.42)' });
        frames.push({ transform: `translate3d(${ex}px, ${ey}px, 0)`, offset: end, easing: 'cubic-bezier(.18,.85,.3,1)' });
      }
      duration = options.duration || hops * 390;
      els.pocketCompanion.classList.add('is-traveling');
    }

    const animation = els.pocketCompanion.animate(frames, {
      duration,
      fill: 'none',
      easing: mode === 'slide' ? 'cubic-bezier(.2,.86,.24,1)' : 'linear'
    });
    companionTravelAnimation = animation;
    els.pocketCompanion.style.setProperty('--companion-x', `${targetX}px`);
    els.pocketCompanion.style.setProperty('--companion-y', `${targetY}px`);
    companionPosition = { x: targetX, y: targetY };

    await new Promise((resolve) => {
      const finish = () => {
        if (token === companionTravelToken) {
          els.pocketCompanion?.classList.remove('is-traveling', 'is-anticipating');
          companionTravelAnimation = null;
        }
        resolve();
      };
      animation.addEventListener('finish', finish, { once: true });
      animation.addEventListener('cancel', finish, { once: true });
    });

    if (token !== companionTravelToken || !companionIsAvailable()) return;
    companionSetPhase('land');
    els.pocketCompanion.classList.add('is-landing');
    await companionWait(245);
    els.pocketCompanion?.classList.remove('is-landing');
    companionResetMotionVector();
  }

  const COMPANION_POSE_CLASSES = [
    'is-hopping', 'is-spinning', 'is-waving', 'is-peeking', 'is-celebrating', 'is-expense',
    'is-allowance', 'is-savings', 'is-curious', 'is-tapping', 'is-sitting', 'is-perched',
    'is-listening', 'is-catching', 'is-presenting', 'is-stretching', 'is-grooming', 'is-shy',
    'is-trip', 'is-startled', 'is-dozing-sit'
  ];

  function companionClearPose(options = {}) {
    if (!els.pocketCompanion) return;
    window.clearTimeout(companionPoseTimer);
    companionPoseTimer = 0;
    const keepPerch = Boolean(options.preservePerch && companionPerchTarget?.isConnected && Date.now() < companionPerchedUntil);
    els.pocketCompanion.classList.remove(...COMPANION_POSE_CLASSES);
    if (keepPerch) {
      els.pocketCompanion.classList.add('is-perched');
      els.pocketCompanion.dataset.perchSide = companionPerchSide;
    } else if (options.preservePerch) {
      companionClearPerch();
    }
  }

  function companionClearAction() {
    if (!els.pocketCompanion) return;
    companionClearPose();
    els.pocketCompanion.classList.remove('is-sleeping', 'is-blinking');
  }

  function companionSay(message, duration = 5200, options = {}) {
    if (!companionIsAvailable() || !message) return;
    const speech = companionSpeechMode();
    if (speech === 'off' || (speech === 'quiet' && !options.essential)) return;
    companionLastMessageAt = Date.now();
    els.companionMessage.textContent = message;
    els.companionBubble.classList.add('is-showing');
    window.clearTimeout(companionBubbleTimer);
    companionBubbleTimer = window.setTimeout(() => els.companionBubble?.classList.remove('is-showing'), duration);
  }

  function companionAnimate(action = 'hop', duration = 1500) {
    if (!companionIsAvailable()) return;
    const keepPerched = els.pocketCompanion.classList.contains('is-perched');
    companionClearPose();
    if (keepPerched) els.pocketCompanion.classList.add('is-perched');
    if (action === 'sleep') {
      els.pocketCompanion.classList.add('is-sleeping');
      return;
    }
    const className = `is-${action === 'hop' ? 'hopping' : action}`;
    els.pocketCompanion.classList.add(className);
    companionPoseTimer = window.setTimeout(() => els.pocketCompanion?.classList.remove(className), duration);
  }

  async function companionPose(action = 'curious', duration = 1200) {
    companionAnimate(action, duration);
    await companionWait(duration);
  }

  function companionVisibleElement(element) {
    if (!element || !element.isConnected || element.closest('dialog')) return false;
    const rect = element.getBoundingClientRect();
    const bounds = companionBounds();
    return rect.width > 30 && rect.height > 24 && rect.bottom > bounds.minY + 8 && rect.top < bounds.height - (bounds.height - bounds.maxY) + 14 && rect.right > bounds.minX && rect.left < bounds.width;
  }

  function companionContextTargets(view = currentView) {
    const selectors = {
      home: ['.wallet-carousel .wallet-mode-card', '.home-wallet-overview', '[data-action="home-add-savings"]', '[data-action="home-add-expense"]', '[data-action="open-transfer"]'],
      activity: ['.activity-summary-strip', '#activityDayCard', '.activity-day-toolbar'],
      savings: ['.savings-balance-hero', '#goalsGrid .goal-card', '#goalsGrid .goal-progress-block', '[data-action="open-goal"]', '[data-action="open-contribution"]'],
      more: ['#secretPocketSettingButton', '.allowance-settings-card', '.settings-card']
    };
    const seen = new Set();
    return (selectors[view] || []).flatMap((selector) => [...document.querySelectorAll(selector)]).filter((element) => {
      if (seen.has(element) || !companionVisibleElement(element)) return false;
      seen.add(element);
      return true;
    });
  }

  function companionTargetPosition(element, options = {}) {
    const bounds = companionBounds();
    const rect = element.getBoundingClientRect();
    const bunnyW = bounds.boxWidth;
    const bunnyH = bounds.boxHeight;
    let x;
    let y;
    let placement = 'side-right';
    let perchSide = 'center';
    const isControl = element.matches('button, [role="button"], .segmented button, .small-icon-button, .primary-action');
    const forcePerch = Boolean(options.forcePerch);
    const canPerch = !options.avoidPerch && !isControl && rect.width >= 118 && rect.top - bunnyH + 30 >= bounds.minY;

    if ((canPerch && Math.random() < .82) || (forcePerch && canPerch)) {
      placement = 'perch';
      const preferred = options.perchSide || (Math.random() < .5 ? 'left' : 'right');
      perchSide = preferred;
      const ratio = preferred === 'left' ? .24 : preferred === 'right' ? .76 : .5;
      const bias = rect.left + rect.width * ratio;
      x = bias - bunnyW / 2;
      y = rect.top - bunnyH + Math.min(34, Math.max(24, rect.height * .12));
    } else {
      const rightSpace = bounds.width - rect.right;
      const leftSpace = rect.left - bounds.minX;
      const useRight = rightSpace >= bunnyW + 10 || rightSpace >= leftSpace;
      placement = useRight ? 'side-right' : 'side-left';
      x = useRight ? rect.right + 5 : rect.left - bunnyW - 5;
      y = rect.top + rect.height / 2 - bunnyH * .58;
    }

    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, Math.round(x))),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, Math.round(y))),
      placement,
      perchSide
    };
  }

  function companionLookAtElement(element) {
    if (!element || !companionPosition) return;
    const rect = element.getBoundingClientRect();
    const bounds = companionBounds();
    const bunnyCenterX = (Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX) + bounds.boxWidth / 2;
    const bunnyCenterY = (Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY) + bounds.boxHeight * .42;
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const dx = targetX - bunnyCenterX;
    const dy = targetY - bunnyCenterY;
    companionSetFacing(dx);
    companionSetGazeNormalized(companionClamp(dx / 130, -1, 1), companionClamp(dy / 110, -1, 1));
    const direction = Math.abs(dx) > Math.abs(dy) * .7 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    els.pocketCompanion.dataset.look = direction;
    els.pocketCompanion.classList.add('is-gaze-active');
  }

  function companionInteractionLine(element) {
    if (!element) return '';
    if (element.matches('[data-action="home-add-savings"], [data-action="open-contribution"]')) return 'That little save button has big-dream energy ♡';
    if (element.matches('.goal-card, .goal-progress-block')) return 'Look at your goal growing ✨';
    if (element.matches('.savings-balance-hero')) return 'Every bit tucked away counts ♡';
    if (element.matches('.wallet-mode-card, .home-wallet-overview')) return 'Keeping an eye on your pocket with you ♡';
    if (element.matches('.activity-summary-strip, #activityDayCard')) return 'You’re keeping track—that matters ✨';
    if (element.matches('#secretPocketSettingButton')) return 'This cozy little world is our secret ♡';
    if (element.matches('.allowance-settings-card')) return 'A little plan makes allowance feel lighter ✨';
    return '';
  }

  function companionPropForElement(element) {
    if (!element) return '';
    if (element.matches('.goal-card, .goal-progress-block, .savings-balance-hero, [data-action="home-add-savings"], [data-action="open-contribution"]')) return 'savings';
    if (element.matches('.activity-summary-strip, #activityDayCard, .activity-day-toolbar')) return 'activity';
    if (element.matches('.allowance-settings-card, .wallet-mode-card, .home-wallet-overview')) return 'pouch';
    if (element.matches('#secretPocketSettingButton, .settings-card')) return 'flower';
    return '';
  }

  function companionEmitEffect(element, type = 'sparkle', count = 6, towardCompanion = false) {
    if (!companionIsAvailable() || companionReducedMotion || !element?.isConnected) return;
    const rect = element.getBoundingClientRect();
    const bounds = companionBounds();
    const bunnyX = (Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX) + bounds.boxWidth * .5;
    const bunnyY = (Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY) + bounds.boxHeight * .48;
    const layer = document.createElement('span');
    layer.className = `companion-world-fx fx-${type}`;
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    companionEffectNodes.add(layer);
    const isBunnyEffect = element === els.companionBunny || element === els.pocketCompanion;
    const bunnyAnchors = [
      [.36,.18], [.62,.16], [.24,.38], [.76,.36], [.30,.57], [.70,.58], [.42,.72], [.59,.73]
    ];
    const total = Math.max(isBunnyEffect ? 2 : 3, Math.min(isBunnyEffect ? 8 : 14, count));
    for (let i = 0; i < total; i += 1) {
      const particle = document.createElement('i');
      let startX;
      let startY;
      if (isBunnyEffect) {
        const anchor = bunnyAnchors[(i + Math.floor(Math.random() * bunnyAnchors.length)) % bunnyAnchors.length];
        startX = rect.left + rect.width * anchor[0] + (Math.random() - .5) * 6;
        startY = rect.top + rect.height * anchor[1] + (Math.random() - .5) * 5;
      } else {
        startX = rect.left + rect.width * (.28 + Math.random() * .44);
        startY = rect.top + rect.height * (.28 + Math.random() * .44);
      }
      particle.style.left = `${startX}px`;
      particle.style.top = `${startY}px`;
      particle.style.animationDelay = `${i * 38}ms`;
      layer.appendChild(particle);
      if (particle.animate) {
        let endX;
        let endY;
        let midX;
        let midY;
        if (isBunnyEffect) {
          const centerX = rect.left + rect.width * .5;
          const centerY = rect.top + rect.height * .48;
          const vx = startX - centerX;
          const vy = startY - centerY;
          const length = Math.max(1, Math.hypot(vx, vy));
          const radialX = vx / length;
          const radialY = vy / length;
          const outward = type === 'heart' ? 24 + Math.random() * 18 : 18 + Math.random() * 22;
          endX = startX + radialX * outward + (Math.random() - .5) * 12;
          endY = startY + radialY * outward - 28 - Math.random() * (type === 'heart' ? 26 : 18);
          midX = startX + (endX - startX) * .46 + (Math.random() - .5) * 14;
          midY = startY - 18 - Math.random() * 14;
        } else {
          endX = towardCompanion ? bunnyX + (Math.random() - .5) * 14 : startX + (Math.random() - .5) * 58;
          endY = towardCompanion ? bunnyY + (Math.random() - .5) * 12 : startY - 34 - Math.random() * 42;
          midX = (startX + endX) / 2 + (Math.random() - .5) * 18;
          midY = Math.min(startY, endY) - 22 - Math.random() * 18;
        }
        particle.animate([
          { transform: 'translate3d(0,4px,0) scale(.45) rotate(-8deg)', opacity: 0 },
          { transform: `translate3d(${midX - startX}px,${midY - startY}px,0) scale(1) rotate(4deg)`, opacity: .96, offset: .34 },
          { transform: `translate3d(${endX - startX}px,${endY - startY}px,0) scale(.72) rotate(18deg)`, opacity: 0 }
        ], { duration: (isBunnyEffect ? 980 : 820) + Math.random() * 360, delay: i * 38, easing: 'cubic-bezier(.18,.76,.24,1)', fill: 'forwards' });
      }
    }
    window.setTimeout(() => {
      companionEffectNodes.delete(layer);
      layer.remove();
    }, 1500);
  }

  function companionEmitFromBunnyToElement(element, type = 'coin', count = 6) {
    if (!companionIsAvailable() || companionReducedMotion || !element?.isConnected) return;
    const rect = element.getBoundingClientRect();
    const bounds = companionBounds();
    const startX = (Number.isFinite(companionPosition.x) ? companionPosition.x : bounds.maxX) + bounds.boxWidth * .58;
    const startY = (Number.isFinite(companionPosition.y) ? companionPosition.y : bounds.maxY) + bounds.boxHeight * .52;
    const endX = rect.left + rect.width * .5;
    const endY = rect.top + rect.height * .5;
    const layer = document.createElement('span');
    layer.className = `companion-world-fx fx-${type}`;
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);
    companionEffectNodes.add(layer);
    const total = Math.max(3, Math.min(12, count));
    for (let i = 0; i < total; i += 1) {
      const particle = document.createElement('i');
      particle.style.left = `${startX + (Math.random() - .5) * 12}px`;
      particle.style.top = `${startY + (Math.random() - .5) * 10}px`;
      layer.appendChild(particle);
      if (particle.animate) {
        const dx = endX - startX + (Math.random() - .5) * 28;
        const dy = endY - startY + (Math.random() - .5) * 22;
        particle.animate([
          { transform: 'translate3d(0,0,0) scale(.55)', opacity: 0 },
          { transform: `translate3d(${dx * .42}px,${dy * .42 - 28}px,0) scale(1.12)`, opacity: 1, offset: .46 },
          { transform: `translate3d(${dx}px,${dy}px,0) scale(.72)`, opacity: 0 }
        ], { duration: 920 + Math.random() * 240, delay: i * 42, easing: 'cubic-bezier(.18,.8,.28,1)', fill: 'forwards' });
      }
    }
    window.setTimeout(() => { companionEffectNodes.delete(layer); layer.remove(); }, 1700);
  }

  async function companionVisitElement(element, options = {}) {
    if (!companionIsAvailable() || !companionVisibleElement(element) || document.querySelector('dialog[open]')) return false;
    companionClearPose();
    companionClearPerch();
    companionSetPhase('notice');
    companionSetMood(options.mood || 'curious');
    companionLookAtElement(element);
    await companionWait(options.noticeDuration || 260);

    const target = companionTargetPosition(element, { forcePerch: options.forcePerch, perchSide: options.perchSide, avoidPerch: options.avoidPerch });
    companionSetPhase('travel');
    await companionMoveTo(target.x, target.y, { mode: 'hop' });
    if (!companionIsAvailable() || document.querySelector('dialog[open]')) return false;

    companionSetPhase('interact');
    companionLookAtElement(element);
    const isTap = options.action === 'tapping' || element.matches('button, [role="button"], [data-action]');
    companionFocusElement(element, options.focusDuration || 2100, isTap);
    if (target.placement === 'perch') {
      companionPerchTarget = element;
      companionPerchedUntil = Date.now() + (options.perchDuration || 6200);
      companionPerchSide = target.perchSide || 'center';
      els.pocketCompanion.dataset.perchSide = companionPerchSide;
      els.pocketCompanion.classList.add('is-perched', 'is-perch-settling');
      window.setTimeout(() => els.pocketCompanion?.classList.remove('is-perch-settling'), 620);
    }
    companionSetProp(options.prop ?? companionPropForElement(element));
    const action = options.action || (target.placement === 'perch' ? 'sitting' : (Math.random() < .58 ? 'tapping' : 'curious'));
    if (options.effect) companionEmitEffect(element, options.effect, Math.min(options.effectCount || 4, 5), Boolean(options.effectToward));
    await companionPose(action, options.duration || (action === 'tapping' ? 1150 : 1350));

    companionSetPhase('react');
    companionSetMood(options.reactMood || options.mood || 'proud');
    if (!options.silent) {
      const line = options.message || companionInteractionLine(element);
      if (line && Date.now() - companionLastMessageAt > 8500) companionSay(line, 4300);
    }
    await companionWait(options.reactHold || 360);
    companionSetPhase('rest');
    if (!options.keepFocus) companionClearFocus();
    if (!options.keepProp) companionSetProp('');
    if (target.placement !== 'perch') {
      companionSetLook('center');
      els.pocketCompanion.classList.remove('is-gaze-active');
    }
    return true;
  }

  async function companionVisitContextElement(options = {}) {
    const targets = companionContextTargets(options.view || currentView);
    if (!targets.length) return false;
    const target = targets[Math.floor(Math.random() * targets.length)];
    return companionVisitElement(target, options);
  }

  async function companionPeekFromEdge() {
    if (!companionIsAvailable() || companionReducedMotion) return false;
    const bounds = companionBounds();
    const fromLeft = Math.random() < .5;
    const y = Math.round(bounds.minY + Math.random() * Math.max(0, bounds.maxY - bounds.minY));
    const hiddenX = fromLeft ? bounds.minX - bounds.boxWidth * .74 : bounds.maxX + bounds.boxWidth * .74;
    const edgeX = fromLeft ? bounds.minX : bounds.maxX;
    companionCancelTravel();
    companionPosition = { x: hiddenX, y };
    els.pocketCompanion.style.setProperty('--companion-x', `${hiddenX}px`);
    els.pocketCompanion.style.setProperty('--companion-y', `${y}px`);
    companionUpdateBubbleSide(edgeX, y);
    companionSetFacing(fromLeft ? 1 : -1);
    companionSetMood('curious');
    companionAnimate('peeking', 2000);
    await companionWait(70);
    await companionMoveTo(edgeX, y, { mode: 'slide', duration: 480, allowOffscreen: true });
    companionSetLook(fromLeft ? 'right' : 'left');
    await companionWait(900);
    await companionMoveTo(hiddenX, y, { mode: 'slide', duration: 470, allowOffscreen: true });
    await companionWait(90);
    return companionPlace(edgeX, y, true).then(() => true);
  }

  async function companionSurpriseSequence() {
    if (!companionIsAvailable() || companionReducedMotion) return false;
    const pos = companionSafePosition(false);
    await companionMoveTo(pos.x, pos.y, { mode: 'hop' });
    companionSetPhase('interact');
    companionSetMood('excited');
    companionSetProp(Math.random() < .5 ? 'flower' : 'pouch');
    const fakeTarget = document.elementFromPoint(
      Math.min(window.innerWidth - 8, Math.max(8, pos.x + pos.boxWidth / 2)),
      Math.min(window.innerHeight - 8, Math.max(8, pos.y + pos.boxHeight / 2))
    );
    if (fakeTarget && fakeTarget !== els.pocketCompanion) companionEmitEffect(fakeTarget, Math.random() < .5 ? 'heart' : 'sparkle', 4, false);
    await companionPose(Math.random() < .55 ? 'catching' : 'spinning', 1250);
    if (Date.now() - companionLastMessageAt > 18000 && Math.random() < .42) companionSay('Tiny happy moment! ♡', 3600);
    companionSetProp('');
    return true;
  }

  function companionMemoryLine() {
    const profile = companionProfileState();
    if (profile.visitStreak >= 7) return `${profile.visitStreak} days together. ${profile.name} notices that kind of consistency ♡`;
    if (profile.affection >= 78) return `${profile.name} trusts you a lot now ♡`;
    if (profile.savingsWins >= 5) return `${profile.name} remembers all those little saves adding up ✨`;
    if (profile.financeMoments >= 12) return 'You’ve built a real habit of checking in with your money ♡';
    if (companionMemory.savings >= 3) return 'You’ve saved a few times this session—look at that consistency ♡';
    if (companionMemory.completed >= 1) return 'That completed goal still makes me proud of you ✨';
    if (companionMemory.expenses >= 4) return 'Lots logged today. Knowing where it went is already a win ♡';
    if (companionMemory.allowance >= 2) return 'You’re giving your allowance a plan—that’s a strong habit ♡';
    if (companionMemory.transfers >= 2) return 'You’re moving money with intention. Nice and tidy ✨';
    if (companionMemory.interactions >= 8) return 'You’ve been checking in with your money. That awareness matters ♡';
    return '';
  }

  function companionVisibleTarget(selectors = []) {
    for (const selector of selectors) {
      const elements = [...document.querySelectorAll(selector)].filter(companionVisibleElement);
      if (elements.length) return elements[0];
    }
    return null;
  }

  function companionWalletTarget(accountId) {
    const card = [...document.querySelectorAll('.wallet-mode-card[data-wallet-id]')].find((element) => element.dataset.walletId === accountId && companionVisibleElement(element));
    return card || companionVisibleTarget(['.home-wallet-overview']);
  }

  function companionGoalTarget(goalId) {
    return [...document.querySelectorAll('#goalsGrid .goal-card[data-goal-id]')].find((element) => element.dataset.goalId === goalId && companionVisibleElement(element)) || null;
  }

  function companionRealDataObservation(view = currentView) {
    if (!state) return null;
    const privacy = Boolean(state.settings?.privacy);
    const today = localDateKey();
    const yesterday = addDays(today, -1);
    const month = monthRange();
    const activeGoals = state.goals.filter((goal) => !goal.removedAt);
    const todayExpenses = state.transactions.filter((tx) => tx.type === 'expense' && tx.date === today);
    const yesterdayExpenses = state.transactions.filter((tx) => tx.type === 'expense' && tx.date === yesterday);
    const todaySpent = todayExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const yesterdaySpent = yesterdayExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const monthExpenses = state.transactions.filter((tx) => tx.type === 'expense' && tx.date >= month.start && tx.date <= month.end);
    const monthSpent = monthExpenses.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const baseline = companionSessionBaseline?.capturedAt ? companionSessionBaseline : null;
    const candidates = [];

    const add = (condition, text, target = null, options = {}) => {
      if (!condition || !text) return;
      candidates.push({ text, target: target && companionVisibleElement(target) ? target : null, prop: options.prop || '', compare: Boolean(options.compare) });
    };

    if (view === 'home') {
      const account = selectedWalletAccount();
      const homeTarget = companionVisibleTarget(['.home-wallet-overview']);
      if (todayExpenses.length) {
        add(true, privacy
          ? `You’ve logged ${todayExpenses.length} expense${todayExpenses.length === 1 ? '' : 's'} today ♡`
          : `Today you’ve logged ${todayExpenses.length} expense${todayExpenses.length === 1 ? '' : 's'} totaling ${currency(todaySpent, true)}.`, homeTarget, { prop: 'receipt' });
      }
      if (yesterdayExpenses.length || todayExpenses.length) {
        const delta = todaySpent - yesterdaySpent;
        if (Math.abs(delta) >= .01) {
          const direction = delta < 0 ? 'lower' : 'higher';
          add(true, privacy
            ? `Today’s spending is ${direction} than yesterday.`
            : `Today’s spending is ${currency(Math.abs(delta), true)} ${direction} than yesterday.`, homeTarget, { prop: 'receipt', compare: true });
        } else if (todayExpenses.length && yesterdayExpenses.length) {
          add(true, `Today’s spending is almost exactly the same as yesterday.`, homeTarget, { prop: 'receipt', compare: true });
        }
      }
      if (account) {
        const walletTarget = companionWalletTarget(account.id);
        const balance = Math.max(0, accountBalance(account.id));
        add(!privacy && balance >= 0, `${account.name} has ${currency(balance, true)} available right now ♡`, walletTarget, { prop: 'pouch' });
        const saved = walletSavingsBalance(account.id);
        add(!privacy && saved > 0, `${account.name} has already helped you set aside ${currency(saved, true)}.`, walletTarget, { prop: 'savings' });
        const previousBalance = baseline?.wallets?.[account.id];
        if (Number.isFinite(previousBalance) && Math.abs(balance - previousBalance) >= .01) {
          const direction = balance > previousBalance ? 'up' : 'down';
          add(!privacy, `${account.name} is ${direction} ${currency(Math.abs(balance - previousBalance), true)} since your last Pocket visit.`, walletTarget, { prop: 'pouch', compare: true });
        }
      }
      const balance = Math.max(0, totalBalance());
      add(!privacy && state.accounts.length > 1, `Across your wallets, you have ${currency(balance, true)} available.`, homeTarget, { prop: 'pouch' });
    }

    if (view === 'activity') {
      const activityTarget = companionVisibleTarget(['.activity-summary-strip', '#activityDayCard']);
      if (todayExpenses.length) {
        const summary = walletExpenseSummaryForTransactions(todayExpenses);
        if (summary.top) {
          add(true, privacy
            ? `${summary.top[0]} is your biggest expense category today.`
            : `${summary.top[0]} is your biggest category today at ${currency(summary.top[1], true)}.`, activityTarget, { prop: 'activity' });
        }
        add(true, privacy
          ? `There ${todayExpenses.length === 1 ? 'is' : 'are'} ${todayExpenses.length} expense entr${todayExpenses.length === 1 ? 'y' : 'ies'} today.`
          : `Your expenses today add up to ${currency(todaySpent, true)} across ${todayExpenses.length} entr${todayExpenses.length === 1 ? 'y' : 'ies'}.`, activityTarget, { prop: 'receipt' });
      }
      if (yesterdayExpenses.length || todayExpenses.length) {
        const delta = todaySpent - yesterdaySpent;
        if (Math.abs(delta) >= .01) {
          const direction = delta < 0 ? 'lower' : 'higher';
          add(true, privacy
            ? `Compared with yesterday, today’s spending is ${direction}.`
            : `Compared with yesterday, today’s spending is ${currency(Math.abs(delta), true)} ${direction}.`, activityTarget, { prop: 'activity', compare: true });
        }
        const countDelta = todayExpenses.length - yesterdayExpenses.length;
        if (countDelta !== 0) add(true, `You’ve logged ${Math.abs(countDelta)} ${countDelta > 0 ? 'more' : 'fewer'} expense entr${Math.abs(countDelta) === 1 ? 'y' : 'ies'} today than yesterday.`, activityTarget, { prop: 'activity', compare: true });
      }
      add(monthExpenses.length > 0, privacy
        ? `You’ve recorded ${monthExpenses.length} expense entr${monthExpenses.length === 1 ? 'y' : 'ies'} this month.`
        : `You’ve recorded ${currency(monthSpent, true)} in expenses this month so far.`, activityTarget, { prop: 'activity' });
    }

    if (view === 'savings') {
      const savingsTarget = companionVisibleTarget(['.savings-balance-hero']);
      const savedTotal = totalSavings();
      add(savedTotal > 0, privacy
        ? `You currently have ${activeGoals.length} active savings goal${activeGoals.length === 1 ? '' : 's'} growing ♡`
        : `Your savings goals currently hold ${currency(savedTotal, true)} altogether ♡`, savingsTarget, { prop: 'savings' });

      if (baseline && savedTotal > baseline.savingsTotal + .01) {
        const delta = savedTotal - baseline.savingsTotal;
        add(true, privacy
          ? `Your savings are higher than when you last opened Pocket ♡`
          : `Your savings grew by ${currency(delta, true)} since your last Pocket visit ♡`, savingsTarget, { prop: 'savings', compare: true });
      }

      const incomplete = activeGoals
        .filter((goal) => Number(goal.target || 0) > 0 && Number(goal.current || 0) < Number(goal.target || 0))
        .map((goal) => {
          const target = Math.max(Number(goal.target || 0), 1);
          const current = Math.max(0, Number(goal.current || 0));
          return { goal, current, target, percent: Math.min(100, Math.round(current / target * 100)), remaining: Math.max(0, target - current) };
        })
        .sort((a, b) => b.percent - a.percent);
      if (incomplete.length) {
        const nearest = incomplete[0];
        const goalTarget = companionGoalTarget(nearest.goal.id) || savingsTarget;
        add(true, privacy
          ? `${nearest.goal.name} is already ${nearest.percent}% complete ✨`
          : `${nearest.goal.name} is ${nearest.percent}% complete — ${currency(nearest.remaining, true)} to go.`, goalTarget, { prop: 'savings' });
      }

      for (const goal of activeGoals) {
        const target = Math.max(0, Number(goal.target || 0));
        if (!target) continue;
        const currentPercent = Math.min(100, Math.round(Math.max(0, Number(goal.current || 0)) / target * 100));
        const previousPercent = baseline?.goals?.[goal.id]?.percent;
        if (Number.isFinite(previousPercent) && currentPercent > previousPercent) {
          const goalTarget = companionGoalTarget(goal.id) || savingsTarget;
          add(true, `${goal.name} moved from ${Math.round(previousPercent)}% to ${currentPercent}% since your last visit ✨`, goalTarget, { prop: 'savings', compare: true });
        }
      }

      const completed = activeGoals.filter((goal) => Number(goal.target || 0) > 0 && Number(goal.current || 0) >= Number(goal.target || 0));
      add(completed.length > 0, `You’ve completed ${completed.length} savings goal${completed.length === 1 ? '' : 's'} here. That’s real progress ♡`, completed.length === 1 ? companionGoalTarget(completed[0].id) || savingsTarget : savingsTarget, { prop: 'flower' });
    }

    if (view === 'more') {
      const settingsTarget = companionVisibleTarget(['.settings-card']);
      const allowanceTarget = companionVisibleTarget(['.allowance-settings-card']) || settingsTarget;
      add(state.accounts.length > 1, `You’re keeping ${state.accounts.length} wallets organized in Pocket.`, settingsTarget, { prop: 'pouch' });
      const latestAllowance = state.transactions
        .filter((tx) => tx.type === 'income')
        .sort((a, b) => Date.parse(b.createdAt || b.date || '') - Date.parse(a.createdAt || a.date || ''))[0];
      if (latestAllowance) {
        const account = state.accounts.find((item) => item.id === latestAllowance.accountId);
        add(true, privacy
          ? 'Your latest allowance record is safely tucked into your history.'
          : `Your latest allowance was ${currency(latestAllowance.amount, true)}${account ? ` into ${account.name}` : ''}.`, allowanceTarget, { prop: 'pouch' });
      }
      add(state.transactions.length > 0, `Pocket is currently keeping ${state.transactions.length} transaction${state.transactions.length === 1 ? '' : 's'} in your local history.`, settingsTarget, { prop: 'activity' });
    }

    if (!candidates.length) return null;
    const fresh = candidates.filter((item) => !companionRecentDataLines.includes(item.text));
    const pool = fresh.length ? fresh : candidates;
    const comparisonPool = pool.filter((item) => item.compare);
    const chosenPool = comparisonPool.length && Math.random() < .46 ? comparisonPool : pool;
    const chosen = chosenPool[Math.floor(Math.random() * chosenPool.length)];
    companionRecentDataLines.push(chosen.text);
    while (companionRecentDataLines.length > 4) companionRecentDataLines.shift();
    return chosen;
  }

  function companionRealDataLine(view = currentView) {
    return companionRealDataObservation(view)?.text || '';
  }

  function walletExpenseSummaryForTransactions(expenses) {
    const categories = expenses.reduce((map, tx) => {
      const name = tx.category || 'Other';
      map[name] = (map[name] || 0) + Number(tx.amount || 0);
      return map;
    }, {});
    const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || null;
    return { top };
  }

  function companionPickHeartCompliment() {
    const viewPool = COMPANION_VIEW_COMPLIMENTS[currentView] || [];
    const pool = viewPool.length && Math.random() < .48
      ? [...viewPool, ...COMPANION_HEART_COMPLIMENTS]
      : COMPANION_HEART_COMPLIMENTS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function companionPickAffirmation(options = {}) {
    if (options.allowRealData !== false) {
      const observation = companionRealDataObservation(currentView);
      if (observation && Math.random() < companionDataSpeechSettings().scheduledChance) return observation.text;
    }
    const memoryLine = companionMemoryLine();
    if (memoryLine && Math.random() < .46) return memoryLine;
    const hour = new Date().getHours();
    if (hour >= 21 && Math.random() < .35) return 'You did enough for today. Your goals can rest with you ♡';
    if (hour < 10 && Math.random() < .35) return 'Good morning ♡ One gentle choice at a time.';
    const viewPool = COMPANION_VIEW_LINES[currentView] || [];
    const pool = Math.random() < .42 && viewPool.length ? viewPool : COMPANION_AFFIRMATIONS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function companionPickScheduledMessage() {
    const observation = companionRealDataObservation(currentView);
    if (observation && Math.random() < companionDataSpeechSettings().scheduledChance) {
      return { heartfelt: false, text: observation.text, realData: true, observation };
    }
    const heartfelt = Math.random() < .36;
    return {
      heartfelt,
      realData: false,
      observation: null,
      text: heartfelt ? companionPickHeartCompliment() : companionPickAffirmation({ allowRealData: false })
    };
  }

  async function companionRareCharacterMoment() {
    if (!companionIsAvailable() || companionReducedMotion) return false;
    const roll = Math.random();
    companionClearPerch();
    companionSetPhase('interact');
    if (roll < .28) {
      companionSetMood('curious');
      await companionPose('grooming', 1800);
      return true;
    }
    if (roll < .50) {
      companionSetMood('curious');
      await companionPose('trip', 1050);
      companionSetMood('shy');
      await companionPose('shy', 1250);
      if (Date.now() - companionLastMessageAt > 24000) companionSay('...you saw nothing ♡', 3000);
      return true;
    }
    if (roll < .72) {
      companionSetMood('curious');
      await companionPose('startled', 800);
      companionSetLook(Math.random() < .5 ? 'left' : 'right');
      await companionWait(600);
      companionSetLook('center');
      return true;
    }
    companionSetMood('sleepy');
    await companionPose('dozing-sit', 2200);
    return true;
  }

  async function companionIdleStory() {
    if (!companionIsAvailable() || document.querySelector('dialog[open]')) return false;
    const generation = ++companionStoryGeneration;
    const stillValid = () => generation === companionStoryGeneration && companionIsAvailable() && !document.querySelector('dialog[open]');
    const personality = companionPersonality();
    const targets = companionContextTargets(currentView);
    const target = targets.length ? targets[Math.floor(Math.random() * targets.length)] : null;
    const roll = Math.random();

    companionClearPerch();
    if (target && roll < .50) {
      companionSetMood('curious');
      companionLookAtElement(target);
      await companionWait(280);
      if (!stillValid()) return false;
      const visited = await companionVisitElement(target, { silent: true, mood: 'curious', duration: 900, perchDuration: 7200 });
      if (!visited || !stillValid()) return visited;
      await companionWait(650);
      if (!stillValid()) return false;
      if (companionPerchTarget === target) {
        companionSetMood('relaxed');
        await companionPose(Math.random() < .6 ? 'grooming' : 'listening', 1550);
      }
      return true;
    }

    if (personality === 'playful' && roll < .76) {
      const first = companionSafePosition(false);
      await companionMoveTo(first.x, first.y, { mode: 'hop' });
      if (!stillValid()) return false;
      companionSetMood('excited');
      await companionPose('stretching', 850);
      if (!stillValid()) return false;
      const second = companionSafePosition(true);
      await companionMoveTo(second.x, second.y, { mode: 'hop' });
      if (!stillValid()) return false;
      await companionPose(Math.random() < .5 ? 'waving' : 'curious', 1000);
      return true;
    }

    if (personality === 'curious' && roll < .82) {
      await companionPeekFromEdge();
      if (!stillValid()) return false;
      companionSetMood('curious');
      await companionPose('listening', 1050);
      return true;
    }

    companionSetMood('relaxed');
    await companionPose('stretching', 900);
    if (!stillValid()) return false;
    await companionPose(Math.random() < .5 ? 'grooming' : 'sitting', 1500);
    return true;
  }

  function scheduleCompanionAction(delay) {
    window.clearTimeout(companionActionTimer);
    if (!companionIsAvailable()) return;
    const calm = companionMovementMode() === 'calm';
    const personality = companionPersonality();
    const energy = companionProfileState().energy;
    if (!Number.isFinite(delay)) {
      const base = calm ? 19000 + Math.random() * 16000 : 8200 + Math.random() * 8800;
      delay = energy < 35 ? base * 1.7 : personality === 'playful' ? base * .82 : base;
    } else if (calm) delay = Math.max(12000, delay * 1.55);
    companionActionTimer = window.setTimeout(() => {
      if (!companionIsAvailable()) return;
      if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) {
        scheduleCompanionAction(3200);
        return;
      }
      if (els.pocketCompanion?.classList.contains('is-sleeping')) {
        scheduleCompanionAction(7000);
        return;
      }
      if (companionPerchTarget && Date.now() < companionPerchedUntil) {
        companionQueueAction('perch-life', async () => {
          if (!companionPerchTarget?.isConnected) { companionClearPerch(); return false; }
          companionSetMood(companionProfileState().energy < 42 ? 'gentle' : 'relaxed');
          companionLookAtElement(companionPerchTarget);
          await companionPose(Math.random() < .58 ? 'grooming' : 'listening', 1350);
          return true;
        }, { spontaneous: true });
        scheduleCompanionAction(6500 + Math.random() * 5000);
        return;
      }
      companionQueueAction('ambient-story', async () => {
        const tired = companionProfileState().energy < 30;
        if (tired) {
          companionClearPerch();
          companionSetMood('gentle');
          await companionPose(Math.random() < .65 ? 'dozing-sit' : 'stretching', 1500);
          return true;
        }
        if (Math.random() < .10 && companionProfileState().affection >= 35) return companionRareCharacterMoment();
        return companionIdleStory();
      }, { spontaneous: true });
      scheduleCompanionAction();
    }, delay);
  }

  function scheduleCompanionAffirmation(delay) {
    window.clearTimeout(companionAffirmationTimer);
    if (!companionIsAvailable() || companionSpeechMode() !== 'normal') return;
    const speechSettings = companionDataSpeechSettings();
    if (!Number.isFinite(delay)) delay = speechSettings.scheduledMin + Math.random() * speechSettings.scheduledJitter;
    companionAffirmationTimer = window.setTimeout(() => {
      if (!companionIsAvailable()) return;
      const currentSettings = companionDataSpeechSettings();
      if (!document.querySelector('dialog[open]') && Date.now() - companionLastMessageAt > currentSettings.messageCooldown) {
        companionQueueAction('affirmation', async () => {
          const message = companionPickScheduledMessage();
          if (message.realData && message.observation?.target && companionVisibleElement(message.observation.target)) {
            await companionVisitElement(message.observation.target, {
              silent: true,
              mood: 'curious',
              reactMood: 'proud',
              action: 'tapping',
              duration: 1050,
              focusDuration: 6500,
              avoidPerch: true,
              keepFocus: true,
              keepProp: true,
              prop: message.observation.prop || companionPropForElement(message.observation.target)
            });
            companionLookAtElement(message.observation.target);
            companionSetProp(message.observation.prop || companionPropForElement(message.observation.target));
            companionSetPhase('react');
            companionSetMood('proud');
            companionSay(message.text, 6200);
            await companionPose('listening', 1450);
            await companionWait(520);
            companionClearFocus();
            companionSetProp('');
            return true;
          }
          companionSetPhase('react');
          companionSetMood(message.heartfelt ? (Math.random() < .48 ? 'proud' : 'gentle') : 'gentle');
          companionSetProp(message.heartfelt ? 'flower' : (Math.random() < .26 ? 'flower' : ''));
          if (message.heartfelt && els.pocketCompanion) companionEmitEffect(els.pocketCompanion, 'heart', 3, false);
          companionSay(message.text, message.heartfelt ? 6800 : 5200);
          await companionPose(message.heartfelt ? (Math.random() < .5 ? 'listening' : 'waving') : (Math.random() < .58 ? 'waving' : 'listening'), message.heartfelt ? 1900 : 1550);
          companionSetProp('');
          return true;
        }, { spontaneous: true });
      }
      scheduleCompanionAffirmation();
    }, delay);
  }

  function resetCompanionIdleTimer() {
    window.clearTimeout(companionIdleTimer);
    if (!companionIsAvailable()) return;
    if (els.pocketCompanion?.classList.contains('is-sleeping')) {
      companionClearAction();
      companionAdjustProfile({ energy: 4, interaction: false }, { render: false });
      companionSetMood(companionMoodFromState());
      companionSetPhase('idle');
      companionQueueAction('wake', async () => {
        companionSetMood('happy');
        await companionPose('waving', 900);
        return true;
      }, { priority: true });
    }
    const hour = new Date().getHours();
    const night = hour >= 22 || hour < 7;
    const baseDelay = companionMovementMode() === 'calm' ? 105000 : 70000;
    const idleDelay = night ? Math.min(baseDelay, 52000) : baseDelay;
    companionIdleTimer = window.setTimeout(() => {
      if (!companionIsAvailable() || document.querySelector('dialog[open]')) return;
      companionQueueAction('sleep', async () => {
        const targets = companionContextTargets(currentView).filter((element) => element.matches('.card, .goal-card, .savings-balance-hero, .home-wallet-overview'));
        if (targets.length && !companionReducedMotion) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          await companionVisitElement(target, { silent: true, action: 'dozing-sit', duration: 1200, focusDuration: 650, mood: 'sleepy', perchDuration: 12000 });
        }
        companionAdjustProfile({ energy: 3, mood: 'sleepy', interaction: false }, { render: false });
        companionSetPhase('rest');
        companionSetMood('sleepy');
        companionSetProp('');
        companionAnimate('sleep');
        if (Date.now() - companionLastMessageAt > 22000) companionSay(`${companionName()} is taking a tiny rest… zZ`, 6000);
        return true;
      }, { spontaneous: true });
    }, idleDelay);
  }

  function syncCompanion(options = {}) {
    if (!els.pocketCompanion) return;
    const active = companionIsAvailable();
    els.pocketCompanion.classList.toggle('is-visible', active);
    els.pocketCompanion.dataset.context = currentView;
    companionMemory.lastView = currentView;
    syncCompanionAccessory();
    if (!active) {
      clearCompanionTimers();
      companionClearAction();
      companionResetExpression();
      els.companionBubble?.classList.remove('is-showing');
      pendingCompanionReaction = null;
      delete els.pocketCompanion.dataset.placed;
      companionPosition = { x: null, y: null };
      companionSetPhase('idle');
      return;
    }
    if (!els.pocketCompanion.dataset.placed) {
      const pos = companionSafePosition(true);
      companionPlace(pos.maxX, pos.maxY, true);
      els.pocketCompanion.dataset.placed = '1';
      companionSetMood(companionMoodFromState());
      companionSetPhase('idle');
    } else if (companionPhase === 'idle') {
      companionSetMood(companionMoodFromState());
    }
    companionScheduleBlink();
    scheduleCompanionAction(options.fast ? 3300 : undefined);
    const fastSpeechDelay = options.fast ? Math.max(7000, Math.round(companionDataSpeechSettings().scheduledMin * .72)) : undefined;
    scheduleCompanionAffirmation(fastSpeechDelay);
    resetCompanionIdleTimer();
    if (options.welcome) {
      companionQueueAction('welcome', async () => {
        companionSetMood('happy');
        companionSetPhase('react');
        companionSay(companionGreetingLine(), 5600, { essential: true });
        await companionPose('waving', 1500);
        await companionVisitContextElement({ silent: true, mood: 'curious', duration: 1050 });
        return true;
      }, { priority: true });
    }
  }

  function companionReactionElement(kind) {
    const candidates = {
      expense: currentView === 'activity' ? ['.activity-summary-strip', '#activityDayCard'] : ['.home-wallet-overview', '.wallet-carousel .wallet-mode-card'],
      allowance: currentView === 'more' ? ['.allowance-settings-card'] : ['.wallet-carousel .wallet-mode-card', '.home-wallet-overview'],
      savings: ['.savings-balance-hero', '#goalsGrid .goal-card'],
      transfer: ['.wallet-carousel .wallet-mode-card', '.home-wallet-overview', '.activity-summary-strip'],
      goal: ['#goalsGrid .goal-card', '.savings-goals-heading'],
      complete: ['#goalsGrid .goal-card', '.savings-balance-hero']
    };
    for (const selector of candidates[kind] || []) {
      const elements = [...document.querySelectorAll(selector)].filter(companionVisibleElement);
      if (elements.length) return elements[Math.floor(Math.random() * elements.length)];
    }
    return null;
  }

  function companionReactionMessage(kind, supplied = '') {
    if (supplied) return supplied;
    if (kind === 'savings' && companionMemory.savings >= 3) return 'Again! That consistency is getting cute and powerful ♡';
    if (kind === 'expense' && companionMemory.expenses >= 4) return 'Another one tracked. Awareness first—no guilt needed ♡';
    if (kind === 'allowance' && companionMemory.allowance >= 2) return 'Allowance in! You’re getting really good at giving it direction ✨';
    if (kind === 'transfer' && companionMemory.transfers >= 2) return 'Moved with intention. Everything has a place ✨';
    const lines = {
      expense: 'Logged and done. Spend mindfully, not perfectly ♡',
      allowance: 'Yay! Give every peso a little purpose ✨',
      savings: 'Nice save! Small amounts can grow big dreams ♡',
      transfer: 'Money moved safely from one pocket to another ✨',
      goal: 'New goal unlocked—one tiny step at a time ✨',
      complete: 'YOU DID IT! Goal complete! ♡ ✨'
    };
    return lines[kind] || COMPANION_AFFIRMATIONS[0];
  }

  async function companionReact(kind, message = '') {
    if (!companionIsAvailable()) return false;
    if (document.querySelector('dialog[open]')) {
      pendingCompanionReaction = { kind, message };
      return false;
    }
    if (kind === 'expense') companionMemory.expenses += 1;
    else if (kind === 'allowance') companionMemory.allowance += 1;
    else if (kind === 'savings') companionMemory.savings += 1;
    else if (kind === 'transfer') companionMemory.transfers += 1;
    else if (kind === 'goal') companionMemory.goals += 1;
    else if (kind === 'complete') companionMemory.completed += 1;
    companionMemory.lastKind = kind;
    companionMemory.interactions += 1;
    companionAdjustProfile({ affection: kind === 'complete' ? 4 : kind === 'savings' || kind === 'goal' ? 2 : 1, energy: kind === 'complete' ? -4 : -2, financeMoment: 1, savingsWin: kind === 'savings' || kind === 'complete' ? 1 : 0 }, { render: false });

    const mood = kind === 'expense' ? 'gentle' : kind === 'complete' ? 'excited' : kind === 'goal' ? 'proud' : kind === 'transfer' ? 'curious' : 'happy';
    const prop = kind === 'expense' ? 'receipt' : kind === 'allowance' || kind === 'transfer' ? 'pouch' : kind === 'complete' ? 'wand' : kind === 'goal' ? 'flower' : 'savings';
    const effect = kind === 'expense' ? 'soft' : kind === 'allowance' || kind === 'transfer' ? 'coin' : kind === 'complete' ? 'confetti' : kind === 'goal' ? 'heart' : 'coin';
    const action = kind === 'complete' ? 'celebrating' : kind === 'expense' ? 'listening' : kind === 'allowance' ? 'catching' : kind === 'savings' ? 'savings' : kind === 'transfer' ? 'presenting' : 'presenting';

    return companionQueueAction(`reaction-${kind}`, async () => {
      const target = companionReactionElement(kind);
      companionSetMood('curious');
      companionSetPhase('notice');
      if (target) {
        companionLookAtElement(target);
        await companionWait(180);
        const position = companionTargetPosition(target);
        await companionMoveTo(position.x, position.y, { mode: 'hop' });
        companionLookAtElement(target);
        companionFocusElement(target, kind === 'complete' ? 3200 : 2350, true);
      } else {
        const pos = companionSafePosition(true);
        await companionMoveTo(pos.maxX, pos.maxY, { mode: 'hop' });
      }

      companionSetPhase('interact');
      companionSetMood(mood);
      companionSetProp(prop);
      if (target) {
        if (kind === 'savings' || kind === 'transfer') companionEmitFromBunnyToElement(target, effect, kind === 'savings' ? 5 : 4);
        else companionEmitEffect(target, effect, kind === 'complete' ? 6 : 4, kind === 'allowance');
      }
      await companionPose(action, kind === 'complete' ? 2600 : 1700);

      companionSetPhase('react');
      companionSay(companionReactionMessage(kind, message), kind === 'complete' ? 6800 : 5200, { essential: true });
      if (kind === 'complete') await companionPose('waving', 1150);
      else await companionWait(480);
      companionClearFocus();
      companionSetProp('');
      companionSetLook('center');
      scheduleCompanionAction(7600);
      scheduleCompanionAffirmation();
      resetCompanionIdleTimer();
      return true;
    }, { priority: true });
  }

  function flushPendingCompanionReaction() {
    if (!pendingCompanionReaction || document.querySelector('dialog[open]')) return;
    const pending = pendingCompanionReaction;
    pendingCompanionReaction = null;
    window.setTimeout(() => companionReact(pending.kind, pending.message), 280);
  }

  function companionSetContext(view) {
    if (!els.pocketCompanion) return;
    els.pocketCompanion.dataset.context = view;
    companionMemory.lastView = view;
    if (!companionIsAvailable()) return;
    window.setTimeout(() => {
      if (!companionIsAvailable() || document.querySelector('dialog[open]')) return;
      companionQueueAction(`view-${view}`, async () => {
        const speechSettings = companionDataSpeechSettings();
        const useData = Math.random() < speechSettings.viewDataChance;
        const observation = useData ? companionRealDataObservation(view) : null;
        let visited = false;
        if (observation?.target && companionVisibleElement(observation.target)) {
          visited = await companionVisitElement(observation.target, {
            silent: true,
            mood: 'curious',
            reactMood: 'proud',
            duration: 980,
            action: 'tapping',
            focusDuration: 6100,
            avoidPerch: true,
            keepFocus: true,
            keepProp: true,
            prop: observation.prop || companionPropForElement(observation.target)
          });
        } else {
          visited = await companionVisitContextElement({ view, silent: true, mood: 'curious', duration: 1050 });
        }
        if (visited && Date.now() - companionLastMessageAt > speechSettings.messageCooldown && Math.random() < speechSettings.viewSpeechChance) {
          const lines = COMPANION_VIEW_LINES[view] || [];
          const line = observation?.text || (lines.length ? lines[Math.floor(Math.random() * lines.length)] : '');
          if (line) {
            if (observation?.target) {
              companionLookAtElement(observation.target);
              companionSetProp(observation.prop || companionPropForElement(observation.target));
            }
            companionSay(line, observation ? 6200 : 4600);
            if (observation?.target) {
              await companionPose('listening', 1150);
              companionClearFocus();
              companionSetProp('');
            }
          }
        } else if (observation?.target) {
          companionClearFocus();
          companionSetProp('');
        }
        return visited;
      }, { spontaneous: true });
    }, 520);
  }

  function companionRespondToUiClick(target) {
    if (!companionIsAvailable() || !target) return;
    const control = target.closest('[data-savings-mode], [data-savings-wallet-index], #activityPrevDay, #activityNextDay, .wallet-mode-indicators button, #walletCarouselPrev, #walletCarouselNext, #manageGoalsButton');
    if (!control) return;
    companionMemory.interactions += 1;
    window.setTimeout(() => {
      if (!companionIsAvailable() || document.querySelector('dialog[open]')) return;
      let destination = null;
      if (control.matches('[data-savings-mode], [data-savings-wallet-index]')) destination = document.querySelector('.savings-balance-hero');
      else if (control.matches('#activityPrevDay, #activityNextDay')) destination = document.getElementById('activityDayCard');
      else if (control.matches('#manageGoalsButton')) destination = document.querySelector('#goalsGrid .goal-card');
      else destination = document.querySelector(`.wallet-mode-card[data-wallet-index="${walletModeIndex}"]`) || document.querySelector('.wallet-mode-card');
      if (!destination) return;
      companionQueueAction('ui-follow', () => companionVisitElement(destination, {
        silent: true,
        action: 'tapping',
        duration: 1050,
        mood: 'curious',
        effect: control.matches('[data-savings-mode], [data-savings-wallet-index]') ? 'heart' : 'sparkle',
        effectCount: 4
      }), { spontaneous: true });
    }, control.matches('.wallet-mode-indicators button, #walletCarouselPrev, #walletCarouselNext') ? 520 : 260);
  }

  function renderSettings() {
    const secretUnlocked = isSecretPocketUnlocked();
    const lightMode = state.settings.theme === 'light';
    els.secretPocketSettingButton.hidden = !secretUnlocked;
    els.secretPocketSummary.textContent = lightMode ? 'Light Pocket active · hidden settings' : 'Unlocked · currently using Dark Pocket';
    els.appVersion.textContent = `Version ${APP_VERSION}${secretConfig?.discovered ? ' ♡' : ''}`;
    els.versionSecretTrigger.setAttribute('aria-label', secretConfig?.discovered ? 'Installed Pocket version. Secret Pocket entrance.' : 'Installed Pocket version');
    els.privacyLabel.textContent = state.settings.privacy ? 'On · amounts hidden' : 'Off · amounts visible';
    els.privacySwitch.classList.toggle('is-on', state.settings.privacy);
    els.privacySettingButton.setAttribute('aria-checked', state.settings.privacy ? 'true' : 'false');
    els.allowanceRecordSummary.textContent = 'Enter the amount, received date, and destination wallet. No routine or schedule required.';
    renderSecretPocketSettings();
    renderAllowanceHistory();
    renderWallets();
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
    if (els.privacySettingButton) els.privacySettingButton.setAttribute('aria-checked', state.settings.privacy ? 'true' : 'false');
    const sidebarLabel = document.querySelector('.privacy-toggle span');
    if (sidebarLabel) sidebarLabel.textContent = state.settings.privacy ? 'Show amounts' : 'Hide amounts';
  }

  function renderAll() {
    document.documentElement.dataset.theme = state.settings.theme;
    if (els.themeColorMeta) els.themeColorMeta.setAttribute('content', state.settings.theme === 'light' ? '#f1b5cc' : '#0d0e10');
    renderHeader();
    renderPrivacy();
    renderHome();
    renderActivity();
    renderSettings();
    populateAccounts();
    renderSavings();
    syncCompanion();
    syncSecretLightWorld();
  }

  function populateAccounts() {
    const expenseCurrent = els.expenseAccount.value;
    const allowanceCurrent = els.allowanceAccount.value;
    const goalCurrent = els.goalAccount.value;
    const contributionCurrent = els.contributeAccount.value;
    const options = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${state.settings.privacy ? '₱••••' : currency(accountBalance(account.id), true)}</option>`).join('');
    els.expenseAccount.innerHTML = options;
    els.allowanceAccount.innerHTML = options;
    els.goalAccount.innerHTML = options;
    els.contributeAccount.innerHTML = options;
    if (state.accounts.some((account) => account.id === expenseCurrent)) els.expenseAccount.value = expenseCurrent;
    if (state.accounts.some((account) => account.id === allowanceCurrent)) els.allowanceAccount.value = allowanceCurrent;
    if (state.accounts.some((account) => account.id === goalCurrent)) els.goalAccount.value = goalCurrent;
    if (state.accounts.some((account) => account.id === contributionCurrent)) els.contributeAccount.value = contributionCurrent;
    syncWalletPickerTriggers();
  }

  function walletPickerContext(targetId) {
    const contexts = {
      expenseAccount: ['Pay from', 'Choose the wallet this expense came from.'],
      allowanceAccount: ['Receive into', 'Choose where the allowance was actually received.'],
      goalAccount: ['Save from', 'Choose which wallet will fund this savings goal.'],
      contributeAccount: ['Save from', 'Choose which wallet this savings contribution comes from.'],
      transferFromAccount: ['Transfer from', 'Choose the wallet sending the money.'],
      transferToAccount: ['Transfer to', 'Choose the wallet receiving the money.']
    };
    return contexts[targetId] || ['Choose wallet', 'Pick a wallet for this transaction.'];
  }

  function walletPickerAccounts(targetId) {
    if (targetId === 'transferToAccount') {
      const fromId = els.transferFromAccount?.value || '';
      return state.accounts.filter((account) => account.id !== fromId);
    }
    return state.accounts;
  }

  function walletPickerBalanceCopy(account) {
    if (!account) return 'Select a wallet';
    if (state.settings.privacy) return 'Available ₱•••• · Savings ₱••••';
    return `Available ${currency(Math.max(0, accountBalance(account.id)), true)} · Savings ${currency(walletSavingsBalance(account.id), true)}`;
  }

  function walletPickerIdentity(account) {
    const name = String(account?.name || '').trim();
    const normalized = name.toLowerCase();
    if (account?.type === 'cash' || normalized === 'cash') return { className: 'is-cash', content: icon('i-wallet') };
    if (normalized.includes('gcash')) return { className: 'is-gcash', content: '<span aria-hidden="true">G</span>' };
    if (normalized.includes('maya')) return { className: 'is-maya', content: '<span aria-hidden="true">M</span>' };
    if (account?.type === 'ewallet') return { className: 'is-ewallet', content: icon('i-phone') };
    const initial = escapeHtml(name.charAt(0).toUpperCase() || 'W');
    return { className: 'is-custom', content: `<span aria-hidden="true">${initial}</span>` };
  }

  function syncWalletPickerTriggers() {
    document.querySelectorAll('[data-wallet-select]').forEach((button) => {
      const select = document.getElementById(button.dataset.walletSelect);
      if (!select) return;
      const account = state.accounts.find((item) => item.id === select.value) || state.accounts[0];
      const copy = button.querySelector('.wallet-picker-trigger-copy');
      const iconHolder = button.querySelector('.wallet-picker-trigger-icon');
      if (copy) {
        copy.innerHTML = account
          ? `<strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(walletPickerBalanceCopy(account))}</small>`
          : '<strong>No wallet</strong><small>Add a wallet in Settings</small>';
      }
      if (iconHolder) {
        const identity = walletPickerIdentity(account);
        iconHolder.className = `wallet-picker-trigger-icon ${identity.className}`;
        iconHolder.innerHTML = identity.content;
      }
      button.disabled = !account;
    });
  }

  function renderWalletPickerList() {
    const target = document.getElementById(activeWalletPickerTarget);
    const accounts = walletPickerAccounts(activeWalletPickerTarget);
    if (!accounts.length) {
      els.walletPickerList.innerHTML = '<div class="wallet-picker-empty">No other wallet is available for this choice.</div>';
      return;
    }
    els.walletPickerList.innerHTML = accounts.map((account) => {
      const selected = target?.value === account.id;
      const identity = walletPickerIdentity(account);
      return `<button class="wallet-picker-option${selected ? ' is-selected' : ''}" type="button" data-wallet-picker-account="${escapeHtml(account.id)}" aria-pressed="${selected ? 'true' : 'false'}">
        <span class="wallet-picker-option-icon ${identity.className}">${identity.content}</span>
        <span class="wallet-picker-option-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(walletPickerBalanceCopy(account))}</small></span>
        <span class="wallet-picker-option-check" aria-hidden="true">${icon('i-check')}</span>
      </button>`;
    }).join('');
  }

  function openWalletPicker(targetId) {
    const select = document.getElementById(targetId);
    if (!select || !state.accounts.length) return;
    activeWalletPickerTarget = targetId;
    const [title, subtitle] = walletPickerContext(targetId);
    els.walletPickerTitle.textContent = title;
    els.walletPickerSubtitle.textContent = subtitle;
    renderWalletPickerList();
    openDialog(els.walletPickerDialog);
    requestAnimationFrame(() => {
      els.walletPickerList.querySelector('.wallet-picker-option.is-selected, .wallet-picker-option')?.focus({ preventScroll: true });
    });
  }

  function chooseWalletFromPicker(accountId) {
    const select = document.getElementById(activeWalletPickerTarget);
    if (!select || !state.accounts.some((account) => account.id === accountId)) return;
    select.value = accountId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncWalletPickerTriggers();
    closeDialog(els.walletPickerDialog);
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

    els.expenseNextButton.disabled = !isValid || isOver;
    els.expenseSaveButton.disabled = !isValid || isOver;
    els.expenseSaveButton.textContent = isValid ? `${currentExpenseEditId ? 'Update' : 'Save'} ${currency(amount, true)}` : (currentExpenseEditId ? 'Update expense' : 'Save expense');
  }

  function showExpenseStep(step) {
    const details = step === 'details';
    els.expenseStepAmount.classList.toggle('is-hidden', details);
    els.expenseStepDetails.classList.toggle('is-hidden', !details);
    els.expenseCancelButton.classList.toggle('is-hidden', details);
    els.expenseNextButton.classList.toggle('is-hidden', details);
    els.expenseBackButton.classList.toggle('is-hidden', !details);
    els.expenseSaveButton.classList.toggle('is-hidden', !details);
    const subtitle = els.expenseDialog.querySelector('.dialog-subtitle');
    if (subtitle) subtitle.textContent = details ? 'Choose a category, date, and optional note.' : 'Enter the amount first.';
    els.expenseDialog.querySelector('.dialog-body')?.scrollTo({ top: 0, behavior: 'auto' });
  }

  function setExpenseAmountValue(value) {
    els.expenseAmount.value = value;
    updateExpenseEntry();
    replayAnimation(els.expenseAmountCard, 'is-keyed');
  }

  function handleExpenseKey(key) {
    setExpenseAmountValue(applyAmountKey(els.expenseAmount.value || '', key, { allowDecimal: true, maxWholeDigits: 7 }));
  }

  function setAllowanceAmountValue(value) {
    els.allowanceAmount.value = value;
    if (els.allowanceSaveButton) els.allowanceSaveButton.disabled = !(Number(value || 0) > 0);
  }

  function handleAllowanceAmountKey(key) {
    setAllowanceAmountValue(applyAmountKey(els.allowanceAmount.value || '', key, { allowDecimal: false, maxWholeDigits: 7 }));
  }

  function setView(view, updateHash = true) {
    if (!['home', 'activity', 'savings', 'more'].includes(view)) view = 'home';
    currentView = view;
    companionClearPerch();
    companionStoryGeneration += 1;
    els.contentScroll.classList.toggle('home-active', view === 'home');
    els.contentScroll.classList.toggle('activity-active', view === 'activity');
    els.contentScroll.classList.toggle('savings-active', view === 'savings');
    els.contentScroll.classList.toggle('fixed-view-active', ['home', 'activity', 'savings'].includes(view));
    document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    renderHeader();
    if (view === 'home') stabilizeWalletCarousel(walletModeIndex);
    if (view === 'activity') renderActivity();
    if (view === 'savings') renderSavings();
    if (view === 'more') renderSettings();
    companionSetContext(view);
    syncSecretLightWorld({ force: true });
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

  function renderSecretPinDots() {
    const length=String(els.themePassword?.value||'').length;
    [...els.secretPinDots.querySelectorAll('span')].forEach((dot,index)=>dot.classList.toggle('is-filled',index<length));
    els.secretUnlockButton.disabled=length!==4;
  }
  function setSecretPinEntry(value) { els.themePassword.value=String(value||'').replace(/\D/g,'').slice(0,4); els.themePassword.classList.remove('is-invalid'); els.themePassword.setAttribute('aria-invalid','false'); els.themePasswordError.textContent=''; renderSecretPinDots(); }
  function handleSecretKey(key) { const current=els.themePassword.value||''; if(key==='backspace') setSecretPinEntry(current.slice(0,-1)); else if(/^\d$/.test(key)&&current.length<4) setSecretPinEntry(`${current}${key}`); }
  function openThemeUnlock() { if(isSecretPocketUnlocked()){ openSecretPocketSettings(); return; } els.themeUnlockForm.reset(); els.secretRememberUnlock.checked=Boolean(secretConfig?.remember); setSecretPinEntry(''); openDialog(els.themeUnlockDialog); requestAnimationFrame(()=>els.secretPinDots.focus({preventScroll:true})); }
  function playSecretReveal(firstReveal=false) {
    if(firstReveal&&els.secretPocketReveal){ els.secretPocketReveal.classList.add('is-showing'); window.setTimeout(()=>els.secretPocketReveal?.classList.remove('is-showing'),1550); }
    syncCompanion({welcome:!firstReveal,fast:true});
    window.setTimeout(() => { if (secretPocketLightActive()) emitSecretLightFx(firstReveal ? 'confetti' : 'heart', { count: companionReducedMotion ? 3 : firstReveal ? 10 : 6, area: 'center', duration: companionReducedMotion ? 900 : 2700 }); }, 120);
    if(firstReveal) window.setTimeout(()=>{ if(!companionIsAvailable()) return; companionSay('You found me ♡',5600,{essential:true}); companionQueueAction('secret-reveal',async()=>{ companionSetMood('happy'); await companionPose('waving',1500); return true; },{priority:true}); },520);
  }
  async function unlockLightTheme() {
    const pin=els.themePassword.value;
    if(pin.length!==4 || !(await verifySecretPin(pin))){ els.themePasswordError.textContent='That code did not unlock Secret Pocket.'; els.themePassword.classList.add('is-invalid'); els.themePassword.setAttribute('aria-invalid','true'); setSecretPinEntry(''); return; }
    const firstReveal=!secretConfig.firstRevealSeen; secretConfig.discovered=true; secretConfig.firstRevealSeen=true; setSecretPocketUnlocked(true,els.secretRememberUnlock.checked); saveSecretConfig(); state.settings.theme='light'; saveState(); closeDialog(els.themeUnlockDialog); renderAll(); playSecretReveal(firstReveal); showToast(firstReveal?'Secret Pocket unlocked ♡':'Secret Pocket unlocked.');
  }
  function renderSecretPocketSettings() {
    if(!els.secretPocketDialog) return; const unlocked=isSecretPocketUnlocked(); const lightMode=state.settings.theme==='light';
    els.secretThemeDark.classList.toggle('is-active',!lightMode); els.secretThemeLight.classList.toggle('is-active',lightMode); els.secretThemeDark.setAttribute('aria-pressed',lightMode?'false':'true'); els.secretThemeLight.setAttribute('aria-pressed',lightMode?'true':'false');
    els.secretCompanionSwitch.classList.toggle('is-on',secretConfig?.companionEnabled!==false); els.secretCompanionToggle.setAttribute('aria-checked',secretConfig?.companionEnabled!==false?'true':'false'); els.secretCompanionLabel.textContent=secretConfig?.companionEnabled!==false?'On · bunny is active':'Off · light theme stays available';
    els.secretCompanionSpeech.value=secretConfig?.companionSpeech||'normal'; els.secretCompanionMovement.value=secretConfig?.companionMovement||'normal'; els.secretCompanionSpeech.disabled=secretConfig?.companionEnabled===false; els.secretCompanionMovement.disabled=secretConfig?.companionEnabled===false;
    if (els.secretWorldHeroTitle && els.secretWorldHeroSubtitle) {
      const companionOn = secretConfig?.companionEnabled !== false;
      els.secretWorldHeroTitle.textContent = lightMode ? 'Light Pocket is glowing ♡' : 'Secret Pocket is waiting ♡';
      els.secretWorldHeroSubtitle.textContent = lightMode
        ? (companionOn ? 'Dreamy glass cards, floating sparkles, and your cozy bunny companion are all active.' : 'Dreamy glass cards and floating sparkles stay active even while the bunny rests.')
        : 'Switch back to Light Pocket anytime you want the hidden dreamy world again.';
    }
    renderCompanionRoom();
    syncCompanionAccessory();
    els.secretRememberSwitch.classList.toggle('is-on',Boolean(secretConfig?.remember)); els.secretRememberToggle.setAttribute('aria-checked',secretConfig?.remember?'true':'false'); els.secretRememberLabel.textContent=secretConfig?.remember?'On · stays unlocked on this device':'Off · locks after this browser session'; if(!unlocked&&els.secretPocketDialog.open) closeDialog(els.secretPocketDialog);
  }
  function openSecretPocketSettings() { if(!isSecretPocketUnlocked()){ openThemeUnlock(); return; } renderSecretPocketSettings(); openDialog(els.secretPocketDialog); }
  function setSecretTheme(theme) {
    if(!isSecretPocketUnlocked()) return openThemeUnlock();
    const nextTheme=theme==='light'?'light':'dark';
    state.settings.theme=nextTheme;
    saveState();
    closeDialog(els.secretPocketDialog);
    renderAll();
    syncSecretLightWorld({ force: true });
    if (nextTheme === 'light') window.setTimeout(() => emitSecretLightFx('confetti', { count: companionReducedMotion ? 3 : 8, area: 'center', duration: companionReducedMotion ? 900 : 2500 }), 90);
    showToast(nextTheme==='light'?'Light Pocket enabled. Welcome back ♡':'Dark Pocket enabled. Secret Pocket stays unlocked.');
  }
  function toggleSecretCompanion() { secretConfig.companionEnabled=!secretConfig.companionEnabled; saveSecretConfig(); renderSecretPocketSettings(); syncCompanion({fast:true}); if (secretPocketLightActive()) emitSecretLightFx(secretConfig.companionEnabled ? 'heart' : 'soft', { count: companionReducedMotion ? 2 : 5, area: 'bottom', duration: companionReducedMotion ? 820 : 2000 }); showToast(secretConfig.companionEnabled?'Pocket companion enabled.':'Pocket companion tucked away.'); }
  function toggleSecretRemember() { const remember=!secretConfig.remember; setSecretPocketUnlocked(true,remember); renderSecretPocketSettings(); renderSettings(); showToast(remember?'Secret Pocket will stay unlocked on this device.':'Secret Pocket will lock after this browser session.'); }
  function resetCompanionPosition() { if(!els.pocketCompanion) return; companionCancelTravel(); delete els.pocketCompanion.dataset.placed; companionPosition={x:null,y:null}; syncCompanion({fast:true}); showToast('Companion position reset.'); }
  function openChangeSecretPin() { els.changeSecretPinForm.reset(); els.changeSecretPinError.textContent=''; openDialog(els.changeSecretPinDialog); requestAnimationFrame(()=>els.newSecretPin.focus({preventScroll:true})); }
  async function changeSecretPin() { const pin=els.newSecretPin.value.replace(/\D/g,'').slice(0,4); const confirmPin=els.confirmSecretPin.value.replace(/\D/g,'').slice(0,4); if(pin.length!==4){ els.changeSecretPinError.textContent='Enter exactly four digits.'; return; } if(pin!==confirmPin){ els.changeSecretPinError.textContent='The two PINs do not match.'; return; } await storeSecretPin(pin); closeDialog(els.changeSecretPinDialog); showToast('Secret PIN changed.'); }
  function lockSecretPocket() { setSecretPocketUnlocked(false,false); state.settings.theme='dark'; saveState(); closeDialog(els.secretPocketDialog); renderAll(); syncSecretLightWorld({ force: true }); showToast('Secret Pocket locked.'); }
  function resetSecretPocketAccess() { const companionProfile=companionProfileState(); secretConfig=defaultSecretConfig(); secretConfig.companionProfile=companionProfile; saveSecretConfig(); try{sessionStorage.removeItem(SECRET_SESSION_KEY);localStorage.removeItem(SECRET_TRUST_KEY);}catch(error){} state.settings.theme='dark'; saveState(); closeDialog(els.secretPocketDialog); closeDialog(els.companionRoomDialog); renderAll(); syncSecretLightWorld({ force: true }); showToast('Secret Pocket access reset to the default code.'); }
  function openSecretPocketRecovery() { confirmAction('Reset Secret Pocket access?','This resets only the secret PIN and hidden appearance preferences. Wallets, transactions, savings, and allowance history are not changed.','Reset access',resetSecretPocketAccess); }
  function handleSecretVersionTap() { if(secretResetTriggered){secretResetTriggered=false;return;} if(secretConfig?.discovered){ if(isSecretPocketUnlocked()) openSecretPocketSettings(); else openThemeUnlock(); return; } secretTapCount+=1; window.clearTimeout(secretTapTimer); secretTapTimer=window.setTimeout(()=>{secretTapCount=0;},SECRET_TRIGGER_WINDOW); if(secretTapCount>=SECRET_TRIGGER_TAPS){window.clearTimeout(secretTapTimer);secretTapCount=0;openThemeUnlock();} }
  function startSecretRecoveryHold() { secretResetTriggered=false; window.clearTimeout(secretResetTimer); secretResetTimer=window.setTimeout(()=>{secretResetTriggered=true;openSecretPocketRecovery();},SECRET_RESET_HOLD); }
  function cancelSecretRecoveryHold() { window.clearTimeout(secretResetTimer); secretResetTimer=0; }

  function openExpense(prefill = {}) {
    currentExpenseEditId = prefill.id || null;
    els.expenseForm.reset();
    els.expenseDialogTitle.textContent = currentExpenseEditId ? 'Edit expense' : 'Add expense';
    els.expenseAmount.value = prefill.amount || '';
    if (prefill.category) {
      const radio = els.expenseForm.querySelector(`input[name="expenseCategory"][value="${CSS.escape(prefill.category)}"]`);
      if (radio) radio.checked = true;
    }
    els.expenseNote.value = prefill.note || '';
    populateAccounts();
    if (prefill.accountId && state.accounts.some((account) => account.id === prefill.accountId)) els.expenseAccount.value = prefill.accountId;
    syncWalletPickerTriggers();
    updateExpenseEntry();
    showExpenseStep('amount');
    openDialog(els.expenseDialog);
    requestAnimationFrame(() => els.expenseDialog.focus());
  }

  function openDifferentAllowance(prefill = {}) {
    currentAllowanceEditId = prefill.id || null;
    els.allowanceForm.reset();
    els.allowanceDialogTitle.textContent = currentAllowanceEditId ? 'Edit allowance' : 'Add allowance';
    setAllowanceAmountValue(prefill.amount || '');
    populateAccounts();
    els.allowanceReceivedDate.max = localDateKey();
    els.allowanceReceivedDate.value = prefill.date || localDateKey();
    const targetAccount = prefill.accountId || state.accounts[0]?.id;
    if (targetAccount && state.accounts.some((account) => account.id === targetAccount)) els.allowanceAccount.value = targetAccount;
    syncWalletPickerTriggers();
    els.allowanceKeypad.classList.add('is-hidden');
    els.allowanceCustomAmountButton.textContent = 'Custom amount';
    els.allowanceSaveButton.textContent = currentAllowanceEditId ? 'Update allowance' : 'Add allowance';
    els.allowanceSaveButton.disabled = !(Number(els.allowanceAmount.value || 0) > 0);
    openDialog(els.allowanceDialog);
    requestAnimationFrame(() => els.allowanceDialog.focus());
  }

  function receiveAllowance(amount, receivedDate = localDateKey(), accountId = state.accounts[0]?.id) {
    const received = Number(amount);
    const today = localDateKey();
    if (!Number.isFinite(received) || received <= 0 || !accountId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || receivedDate > today) {
      showToast('Choose today or a past date for the allowance.');
      return;
    }

    state.transactions.push({
      id: uid('tx'),
      type: 'income',
      amount: received,
      category: 'Allowance',
      accountId,
      date: receivedDate,
      note: 'Allowance received',
      createdAt: new Date().toISOString()
    });

    state.settings.demoData = false;
    saveState();
    closeDialog(els.allowanceDialog);
    renderAll();

    const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
    const dateText = receivedDate === today ? 'today' : DATE_LABEL.format(fromDateKey(receivedDate));
    showToast(state.settings.privacy ? `Allowance added to ${walletName}.` : `${currency(received, true)} added to ${walletName} for ${dateText}.`);
    companionReact('allowance');
  }

  function updateAllowanceTransaction(id, amount, receivedDate, accountId) {
    const income = state.transactions.find((tx) => tx.id === id && tx.type === 'income');
    if (!income || !canModifyTransaction(income)) {
      showToast('This allowance entry is locked.');
      return false;
    }
    const today = localDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || receivedDate > today) {
      showToast('Choose today or a past date for the allowance.');
      return false;
    }

    income.amount = Number(amount);
    income.accountId = accountId;
    income.date = receivedDate;
    income.note = 'Allowance received';
    income.updatedAt = new Date().toISOString();

    const linkedSavings = state.transactions.filter((tx) => tx.allowanceId && tx.allowanceId === income.allowanceId && tx.type === 'saving');
    linkedSavings.forEach((saving) => {
      saving.accountId = accountId;
      saving.date = receivedDate;
      saving.updatedAt = new Date().toISOString();
    });
    const legacyPlan = income.allowanceId ? state.allowancePlans.find((item) => item.id === income.allowanceId) : null;
    if (legacyPlan) {
      legacyPlan.amount = Number(amount);
      legacyPlan.startDate = receivedDate;
    }
    state.settings.demoData = false;
    saveState();
    return true;
  }

  function addAllowance() {
    const amount = Number(els.allowanceAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const date = els.allowanceReceivedDate.value || localDateKey();
    const accountId = els.allowanceAccount.value || state.accounts[0]?.id;
    if (currentAllowanceEditId) {
      if (!updateAllowanceTransaction(currentAllowanceEditId, amount, date, accountId)) return;
      closeDialog(els.allowanceDialog);
      currentAllowanceEditId = null;
      renderAll();
      showToast('Allowance updated.');
      return;
    }
    receiveAllowance(amount, date, accountId);
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
      </div>
      ${tx.note ? `<div class="receipt-note">${escapeHtml(tx.note)}</div>` : ''}`;
    openDialog(els.expenseReceiptDialog);
  }

  function addExpense() {
    const amount = Number(els.expenseAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const category = els.expenseForm.elements.expenseCategory.value;
    const accountId = els.expenseAccount.value || state.accounts[0]?.id;
    const existingExpense = currentExpenseEditId ? state.transactions.find((tx) => tx.id === currentExpenseEditId && tx.type === 'expense') : null;
    const date = existingExpense?.date || localDateKey();
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
        showToast('This transaction is locked.');
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
    pendingCompanionReaction = { kind: 'expense', message: editing ? 'Updated and tidy again ♡' : '' };
    currentExpenseEditId = null;
  }

  function transferAvailableBalance(accountId, editingTransferId = null) {
    let available = Math.max(0, accountBalance(accountId));
    if (!editingTransferId) return available;
    const original = state.transactions.find((tx) => tx.id === editingTransferId && tx.type === 'transfer');
    if (original && original.fromAccountId === accountId) available += Number(original.amount || 0);
    return available;
  }

  function populateTransferAccounts(preferredFrom = '', preferredTo = '') {
    const accounts = state.accounts || [];
    const fromCurrent = preferredFrom || els.transferFromAccount.value || accounts[0]?.id || '';
    const toCurrent = preferredTo || els.transferToAccount.value || '';
    const optionHtml = accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
    els.transferFromAccount.innerHTML = optionHtml;
    els.transferToAccount.innerHTML = optionHtml;
    if (accounts.some((account) => account.id === fromCurrent)) els.transferFromAccount.value = fromCurrent;
    const firstDifferent = accounts.find((account) => account.id !== els.transferFromAccount.value)?.id || '';
    const validTo = accounts.some((account) => account.id === toCurrent && account.id !== els.transferFromAccount.value) ? toCurrent : firstDifferent;
    if (validTo) els.transferToAccount.value = validTo;
    syncWalletPickerTriggers();
  }

  function setTransferAmountValue(value) {
    els.transferAmount.value = value;
    updateTransferEntry();
    replayAnimation(els.transferAmountCard, 'is-keyed');
  }

  function handleTransferKey(key) {
    setTransferAmountValue(applyAmountKey(els.transferAmount.value || '', key, { allowDecimal: true, maxWholeDigits: 8 }));
  }

  function updateTransferEntry() {
    if (!els.transferFromAccount) return;
    const fromId = els.transferFromAccount.value;
    const toId = els.transferToAccount.value;
    const amount = Number(els.transferAmount.value || 0);
    const from = state.accounts.find((account) => account.id === fromId);
    const to = state.accounts.find((account) => account.id === toId);
    const available = transferAvailableBalance(fromId, currentTransferEditId);
    const sameWallet = !fromId || !toId || fromId === toId;
    const valid = Number.isFinite(amount) && amount > 0 && !sameWallet;
    const over = valid && amount > available;

    els.transferAvailable.textContent = state.settings.privacy ? 'Available ₱••••' : `Available ${currency(available, true)}`;
    els.transferAmountCard.classList.toggle('is-over-limit', over || sameWallet);
    if (sameWallet) {
      els.transferAmountHint.textContent = 'Choose two different wallets.';
    } else if (available <= 0) {
      els.transferAmountHint.textContent = `${from?.name || 'This wallet'} has no spendable money to transfer.`;
    } else if (over) {
      els.transferAmountHint.textContent = state.settings.privacy ? 'This is more than the source wallet has available.' : `${currency(amount - available, true)} over the available ${from?.name || 'wallet'} balance.`;
    } else if (valid) {
      els.transferAmountHint.textContent = state.settings.privacy ? `Money will move from ${from?.name || 'source'} to ${to?.name || 'destination'}.` : `${currency(available - amount, true)} will remain in ${from?.name || 'the source wallet'}.`;
    } else {
      els.transferAmountHint.textContent = `Move money from ${from?.name || 'one wallet'} to ${to?.name || 'another wallet'}.`;
    }
    els.transferSaveButton.disabled = !valid || over;
    els.transferSaveButton.textContent = valid ? `${currentTransferEditId ? 'Update' : 'Transfer'} ${currency(amount, true)}` : (currentTransferEditId ? 'Update transfer' : 'Transfer');
  }

  function openTransfer(prefill = {}) {
    if (state.accounts.length < 2) {
      setView('more');
      showToast('Add another wallet first, then you can transfer between wallets.');
      openWallet();
      return;
    }
    currentTransferEditId = prefill.id || null;
    els.transferForm.reset();
    els.transferDialogTitle.textContent = currentTransferEditId ? 'Edit transfer' : 'Move money';
    populateTransferAccounts(prefill.fromAccountId || selectedWalletAccount()?.id || '', prefill.toAccountId || '');
    els.transferNote.value = prefill.note || '';
    els.transferAmount.value = prefill.amount || '';
    updateTransferEntry();
    openDialog(els.transferDialog);
    requestAnimationFrame(() => els.transferDialog.focus());
  }

  function saveTransfer() {
    const amount = Number(els.transferAmount.value || 0);
    const fromAccountId = els.transferFromAccount.value;
    const toAccountId = els.transferToAccount.value;
    const existingTransfer = currentTransferEditId ? state.transactions.find((tx) => tx.id === currentTransferEditId && tx.type === 'transfer') : null;
    const date = existingTransfer?.date || localDateKey();
    const note = els.transferNote.value.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !fromAccountId || !toAccountId || fromAccountId === toAccountId) return;
    const available = transferAvailableBalance(fromAccountId, currentTransferEditId);
    if (amount > available) {
      const name = state.accounts.find((account) => account.id === fromAccountId)?.name || 'source wallet';
      showToast(`Only ${currency(Math.max(0, available), true)} is available in ${name}.`);
      return;
    }

    const editing = Boolean(currentTransferEditId);
    let tx;
    if (editing) {
      tx = state.transactions.find((item) => item.id === currentTransferEditId && item.type === 'transfer');
      if (!tx || !canModifyTransaction(tx)) {
        showToast('This transfer is locked.');
        closeDialog(els.transferDialog);
        currentTransferEditId = null;
        return;
      }
      Object.assign(tx, { amount, fromAccountId, toAccountId, date, note, category: 'Transfer', updatedAt: new Date().toISOString() });
    } else {
      tx = {
        id: uid('tx'), type: 'transfer', category: 'Transfer', amount, fromAccountId, toAccountId,
        date, note, createdAt: new Date().toISOString()
      };
      state.transactions.push(tx);
    }
    state.settings.demoData = false;
    saveState();
    closeDialog(els.transferDialog);
    currentTransferEditId = null;
    renderAll();
    const from = state.accounts.find((account) => account.id === fromAccountId)?.name || 'wallet';
    const to = state.accounts.find((account) => account.id === toAccountId)?.name || 'wallet';
    showToast(state.settings.privacy ? (editing ? 'Transfer updated.' : 'Transfer completed.') : `${currency(amount, true)} ${editing ? 'updated' : 'moved'} from ${from} to ${to}.`);
    window.setTimeout(() => companionReact('transfer', editing ? 'Transfer updated and tidy again ♡' : ''), 240);
  }

  function setGoalDialogMode(mode, goal = null) {
    const editing = mode === 'edit' && goal;
    currentGoalEditId = editing ? goal.id : null;
    els.goalDialogTitle.textContent = editing ? 'Edit goal' : 'Create a goal';
    els.goalSubmitButton.textContent = editing ? 'Save changes' : 'Create goal';
    els.goalDialog.querySelectorAll('.goal-create-only').forEach((element) => element.classList.toggle('is-hidden', Boolean(editing)));
  }

  function openGoal(preferredAccountId = '') {
    els.goalForm.reset();
    els.goalCurrent.value = '0';
    setGoalDialogMode('create');
    populateAccounts();
    const preferredGoalAccount = preferredAccountId || (savingsMode === 'wallet' ? state.accounts[savingsWalletIndex]?.id : state.accounts[0]?.id);
    if (preferredGoalAccount && state.accounts.some((account) => account.id === preferredGoalAccount)) els.goalAccount.value = preferredGoalAccount;
    syncWalletPickerTriggers();
    openDialog(els.goalDialog);
  }

  function openGoalEditor(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !item.removedAt);
    if (!goal) return;
    els.goalForm.reset();
    populateAccounts();
    setGoalDialogMode('edit', goal);
    els.goalName.value = goal.name || '';
    els.goalTarget.value = String(Math.max(1, Number(goal.target || 1)));
    els.goalCurrent.value = '0';
    syncWalletPickerTriggers();
    openDialog(els.goalDialog);
  }

  function applyGoalEdit(goal, name, target) {
    goal.name = name;
    goal.target = target;
    goal.updatedAt = new Date().toISOString();
    state.settings.demoData = false;
    saveState();
    renderAll();
    setView('savings');
    showToast(`“${name}” updated.`);
  }

  function saveGoalForm() {
    const name = els.goalName.value.trim();
    const target = Number(els.goalTarget.value);
    if (!name || !Number.isFinite(target) || target <= 0) return;

    if (currentGoalEditId) {
      const goal = state.goals.find((item) => item.id === currentGoalEditId && !item.removedAt);
      if (!goal) return;
      const saved = Math.max(0, Number(goal.current || 0));
      closeDialog(els.goalDialog);
      currentGoalEditId = null;
      if (target < saved) {
        const message = state.settings.privacy
          ? 'The new target is below the amount already saved. Your saved money will stay untouched and the goal will show as completed.'
          : `The new ${currency(target, true)} target is below ${currency(saved, true)} already saved. Your savings will stay untouched and the goal will show as completed.`;
        confirmAction('Lower this goal target?', message, 'Save lower target', () => applyGoalEdit(goal, name, target));
      } else {
        applyGoalEdit(goal, name, target);
      }
      return;
    }

    const current = Math.max(0, Number(els.goalCurrent.value || 0));
    const accountId = els.goalAccount.value || state.accounts[0]?.id;
    if (!accountId) return;
    const startingAmount = Math.min(current, target);
    const available = accountBalance(accountId);
    if (startingAmount > available) {
      const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
      showToast(`You only have ${currency(Math.max(0, available), true)} available in ${walletName}.`);
      return;
    }
    const goal = { id: uid('goal'), name, target, current: startingAmount, createdAt: localDateKey() };
    state.goals.push(goal);
    if (startingAmount > 0) {
      state.transactions.push({ id: uid('tx'), type: 'saving', amount: startingAmount, category: 'Savings', accountId, date: localDateKey(), note: name, goalId: goal.id, createdAt: new Date().toISOString() });
    }
    state.settings.demoData = false;
    saveState();
    closeDialog(els.goalDialog);
    renderAll();
    setView('savings');
    if (startingAmount > 0) celebrateSavings();
    companionReact(startingAmount >= target && target > 0 ? 'complete' : 'goal');
    showToast(`“${name}” goal created.`);
  }

  function removeGoal(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !item.removedAt);
    if (!goal) return;
    const saved = Math.max(0, Number(goal.current || 0));
    const breakdown = goalWalletBreakdown(goal);
    const returnCopy = breakdown.map(({ account, amount }) => `${currency(amount, true)} → ${account.name}`).join(' · ');
    const message = saved > 0
      ? state.settings.privacy
        ? 'All money in this goal will return to the wallets it originally came from before the goal is removed.'
        : `${currency(saved, true)} will return to its original wallet${breakdown.length === 1 ? '' : 's'}: ${returnCopy}.`
      : 'This goal has no saved money. Only the goal will be removed.';

    confirmAction(`Delete “${goal.name}”?`, message, 'Return money & delete', () => {
      const now = Date.now();
      breakdown.forEach(({ account, amount }, index) => {
        if (amount <= 0) return;
        state.transactions.push({
          id: uid('tx'), type: 'saving_return', amount, category: 'Savings return', accountId: account.id,
          goalId: goal.id, date: localDateKey(), note: `Returned from ${goal.name}`,
          createdAt: new Date(now + index).toISOString()
        });
      });
      goal.current = 0;
      goal.removedAt = new Date().toISOString();
      goal.returnedToWallets = true;
      if (!state.goals.some((item) => !item.removedAt)) manageGoalsMode = false;
      state.settings.demoData = false;
      saveState();
      renderAll();
      showToast(saved > 0 ? 'Goal deleted and savings returned to the original wallet.' : 'Savings goal deleted.');
    });
  }

  function allocateGoalTransferByWallet(goal, amount) {
    const pools = goalWalletBreakdown(goal).map(({ account, amount: walletAmount }) => ({
      accountId: account.id,
      cents: Math.max(0, Math.round(walletAmount * 100))
    })).filter((item) => item.cents > 0);
    const totalCents = pools.reduce((sum, item) => sum + item.cents, 0);
    const requestedCents = Math.max(0, Math.round(Number(amount || 0) * 100));
    if (!requestedCents || requestedCents > totalCents) return [];

    let remaining = requestedCents;
    const allocations = pools.map((pool, index) => {
      if (index === pools.length - 1) {
        const cents = Math.min(pool.cents, remaining);
        remaining -= cents;
        return { accountId: pool.accountId, cents };
      }
      const proportional = Math.floor(requestedCents * (pool.cents / totalCents));
      const cents = Math.min(pool.cents, proportional, remaining);
      remaining -= cents;
      return { accountId: pool.accountId, cents };
    });

    while (remaining > 0) {
      let moved = false;
      for (const allocation of allocations) {
        if (remaining <= 0) break;
        const pool = pools.find((item) => item.accountId === allocation.accountId);
        if (!pool || allocation.cents >= pool.cents) continue;
        allocation.cents += 1;
        remaining -= 1;
        moved = true;
      }
      if (!moved) break;
    }
    return allocations.filter((item) => item.cents > 0).map((item) => ({ accountId: item.accountId, amount: item.cents / 100 }));
  }

  function updateGoalTransferEntry() {
    const source = state.goals.find((item) => item.id === els.goalTransferFromGoalId.value && !item.removedAt);
    const amount = Number(els.goalTransferAmount.value || 0);
    const available = Math.max(0, Number(source?.current || 0));
    const destination = els.goalTransferDestinations.querySelector('input[name="goalTransferDestination"]:checked')?.value || '';
    const valid = Boolean(source && destination && amount > 0 && amount <= available);
    els.goalTransferAvailable.textContent = state.settings.privacy ? 'Available ₱••••' : `Available ${currency(available, true)}`;
    els.goalTransferAmountCard.classList.toggle('is-over-limit', amount > available && amount > 0);
    if (!amount) els.goalTransferHint.textContent = 'Wallet origin stays attached to the savings.';
    else if (amount > available) els.goalTransferHint.textContent = state.settings.privacy ? 'That is more than this goal contains.' : `${currency(amount - available, true)} over this goal’s savings.`;
    else els.goalTransferHint.textContent = 'This stays in Savings and keeps its original wallet source.';
    els.goalTransferSaveButton.disabled = !valid;
    els.goalTransferSaveButton.textContent = amount > 0 ? `Transfer ${currency(amount, true)}` : 'Transfer savings';
  }

  function handleGoalTransferKey(key) {
    els.goalTransferAmount.value = applyAmountKey(els.goalTransferAmount.value || '', key, { allowDecimal: true, maxWholeDigits: 8 });
    updateGoalTransferEntry();
  }

  function openGoalTransfer(goalId) {
    const source = state.goals.find((item) => item.id === goalId && !item.removedAt);
    if (!source) return;
    const destinations = state.goals.filter((item) => !item.removedAt && item.id !== source.id);
    if (!destinations.length) {
      showToast('Create another savings goal before transferring savings.');
      return;
    }
    els.goalTransferForm.reset();
    els.goalTransferFromGoalId.value = source.id;
    els.goalTransferAmount.value = '';
    const sourceBreakdown = goalWalletBreakdown(source);
    const sourceDetail = sourceBreakdown.map(({ account, amount }) => `${account.name} ${state.settings.privacy ? '₱••••' : currency(amount, true)}`).join(' · ');
    els.goalTransferSource.innerHTML = `<span class="round-icon purple-soft">${icon('i-savings')}</span><div><small>From</small><strong>${escapeHtml(source.name)}</strong><p>${escapeHtml(sourceDetail || 'No savings available')}</p></div>`;
    els.goalTransferDestinations.innerHTML = `<legend>Move to</legend>${destinations.map((goal, index) => `<label><input type="radio" name="goalTransferDestination" value="${escapeHtml(goal.id)}"${index === 0 ? ' checked' : ''}><span>${icon('i-target')}<b>${escapeHtml(goal.name)}</b><small>${state.settings.privacy ? '₱•••• saved' : `${currency(goal.current, true)} saved`}</small></span></label>`).join('')}`;
    updateGoalTransferEntry();
    openDialog(els.goalTransferDialog);
    requestAnimationFrame(() => els.goalTransferDialog.focus());
  }

  function transferGoalSavings() {
    const source = state.goals.find((item) => item.id === els.goalTransferFromGoalId.value && !item.removedAt);
    const destinationId = els.goalTransferDestinations.querySelector('input[name="goalTransferDestination"]:checked')?.value || '';
    const destination = state.goals.find((item) => item.id === destinationId && !item.removedAt);
    const amount = Number(els.goalTransferAmount.value || 0);
    if (!source || !destination || source.id === destination.id || !Number.isFinite(amount) || amount <= 0 || amount > Number(source.current || 0)) return;
    const allocations = allocateGoalTransferByWallet(source, amount);
    const allocated = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (Math.abs(allocated - amount) > 0.011) {
      showToast('Pocket could not preserve the wallet source for that transfer.');
      return;
    }
    source.current = Math.max(0, Number(source.current || 0) - amount);
    destination.current = Number(destination.current || 0) + amount;
    state.goalTransfers.push({
      id: uid('goal-transfer'), fromGoalId: source.id, toGoalId: destination.id, amount, allocations,
      createdAt: new Date().toISOString()
    });
    state.settings.demoData = false;
    saveState();
    closeDialog(els.goalTransferDialog);
    renderAll();
    setView('savings');
    showToast(state.settings.privacy ? 'Savings transferred between goals.' : `${currency(amount, true)} moved from “${source.name}” to “${destination.name}”.`);
  }

  function openContribution(goalId, suggestedAmount = '', accountId = '') {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    els.contributeGoalId.value = goal.id;
    els.contributeTitle.textContent = goal.name;
    els.contributeAmount.value = suggestedAmount || '';
    populateAccounts();
    const preferredAccount = accountId || (savingsMode === 'wallet' ? state.accounts[savingsWalletIndex]?.id : '') || state.accounts[0]?.id;
    if (preferredAccount && state.accounts.some((account) => account.id === preferredAccount)) els.contributeAccount.value = preferredAccount;
    syncWalletPickerTriggers();
    updateContributionWalletHint();
    openDialog(els.contributeDialog);
    requestAnimationFrame(() => els.contributeAmount.focus());
  }

  function updateContributionWalletHint() {
    const account = state.accounts.find((item) => item.id === els.contributeAccount.value) || state.accounts[0];
    const balance = account ? accountBalance(account.id) : 0;
    els.contributeWalletHint.textContent = state.settings.privacy
      ? `Savings will move out of ${account?.name || 'the selected wallet'}.`
      : `${currency(Math.max(0, balance), true)} is currently available in ${account?.name || 'the selected wallet'}.`;
  }

  function addContribution() {
    const goal = state.goals.find((item) => item.id === els.contributeGoalId.value);
    const amount = Number(els.contributeAmount.value);
    const accountId = els.contributeAccount.value || state.accounts[0]?.id;
    if (!goal || !Number.isFinite(amount) || amount <= 0 || !accountId) return;
    const available = accountBalance(accountId);
    if (amount > available) {
      const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
      showToast(`You only have ${currency(Math.max(0, available), true)} available in ${walletName}.`);
      return;
    }
    const previousGoalAmount = Number(goal.current || 0);
    goal.current = previousGoalAmount + amount;
    const completedNow = previousGoalAmount < Number(goal.target || 0) && goal.current >= Number(goal.target || 0);
    state.transactions.push({
      id: uid('tx'), type: 'saving', amount, category: 'Savings', accountId,
      date: localDateKey(), note: goal.name, goalId: goal.id, createdAt: new Date().toISOString()
    });
    state.settings.demoData = false;
    saveState();
    closeDialog(els.contributeDialog);
    renderAll();
    celebrateSavings();
    companionReact(completedNow ? 'complete' : 'savings');
    const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
    showToast(`${currency(amount, true)} saved from ${walletName} for ${goal.name}.`);
  }

  function syncAllowanceRoutineFromHistory() {
    const routine = state.allowanceRoutine;
    if (!routine) return;
    const latest = [...state.transactions]
      .filter((tx) => tx.type === 'income' && Number(tx.amount) > 0)
      .sort((a, b) => `${b.date || ''}|${b.createdAt || ''}`.localeCompare(`${a.date || ''}|${a.createdAt || ''}`))[0];
    if (!latest) {
      routine.lastReceivedDate = null;
      routine.nextDueDate = null;
      return;
    }
    routine.lastReceivedDate = latest.date || localDateKey();
    routine.nextDueDate = routine.frequency === 'irregular' ? null : nextDueDateForFrequency(routine.frequency, routine.lastReceivedDate);
  }

  function editTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) {
      showToast('This transaction is locked.');
      return;
    }
    closeDialog(els.expenseReceiptDialog);
    if (tx.type === 'expense') {
      openExpense({ id: tx.id, amount: String(tx.amount), category: tx.category, accountId: tx.accountId, date: tx.date, note: tx.note || '' });
      return;
    }
    if (tx.type === 'income') {
      closeDialog(els.allowanceHistoryDialog);
      setView('more');
      openDifferentAllowance({ id: tx.id, amount: String(tx.amount), accountId: tx.accountId, date: tx.date });
      return;
    }
    if (tx.type === 'transfer') {
      openTransfer({ id: tx.id, amount: String(tx.amount), fromAccountId: tx.fromAccountId, toAccountId: tx.toAccountId, date: tx.date, note: tx.note || '' });
      return;
    }
    showToast('Savings entries can be undone while they are still editable, but are not edited separately.');
  }

  function undoTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) {
      showToast('This transaction is locked.');
      return;
    }

    confirmAction('Undo this transaction?', 'This will remove the selected transaction now.', 'Undo transaction', () => {
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

  function setWalletOpeningBalanceValue(value) {
    els.walletOpeningBalance.value = value;
  }

  function updateWalletPresetUI() {
    const preset = els.walletForm.elements.walletPreset.value;
    els.walletCustomNameWrap.classList.toggle('is-hidden', preset !== 'Other');
  }

  function openWallet() {
    els.walletForm.reset();
    els.walletOpeningBalance.value = '';
    updateWalletPresetUI();
    openDialog(els.walletDialog);
    requestAnimationFrame(() => els.walletDialog.focus());
  }

  function addWallet() {
    const preset = els.walletForm.elements.walletPreset.value;
    const name = preset === 'Other' ? els.walletCustomName.value.trim() : preset;
    const openingBalance = Math.max(0, Number(els.walletOpeningBalance.value || 0));
    if (!name) { showToast('Give this wallet a name.'); return; }
    if (state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already in your wallets.`);
      return;
    }
    state.accounts.push({ id: uid('account'), name, type: preset === 'Other' ? 'other' : 'ewallet', openingBalance, isPrimary: false });
    state.settings.demoData = false;
    saveState();
    closeDialog(els.walletDialog);
    renderAll();
    showToast(`${name} added.`);
  }

  function removeWallet(id) {
    const index = state.accounts.findIndex((account) => account.id === id);
    if (index <= 0) return;
    const account = state.accounts[index];
    const used = state.transactions.some((tx) => tx.accountId === id || tx.fromAccountId === id || tx.toAccountId === id);
    if (used) { showToast('This wallet has transaction history and cannot be removed.'); return; }
    confirmAction(`Remove ${account.name}?`, `${state.settings.privacy ? 'This wallet' : currency(accountBalance(id), true)} will be removed from your available total. This wallet has no transaction history.`, 'Remove wallet', () => {
      state.accounts.splice(index, 1);
      saveState();
      renderAll();
      showToast(`${account.name} removed.`);
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
      accounts: [{ id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0, isPrimary: true }],
      goals: [],
      goalTransfers: [],
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
    if (action === 'home-add-expense') openExpense({ accountId: selectedWalletAccount()?.id || '' });
    if (action === 'open-transfer') openTransfer({ fromAccountId: selectedWalletAccount()?.id || '' });
    if (action === 'home-add-savings') {
      const account = selectedWalletAccount();
      const goals = state.goals.filter((goal) => !goal.removedAt);
      if (!goals.length) {
        openGoal(account?.id || '');
      } else if (goals.length === 1) {
        openContribution(goals[0].id, '', account?.id || '');
      } else {
        savingsMode = 'wallet';
        savingsWalletIndex = Math.max(0, state.accounts.findIndex((item) => item.id === account?.id));
        setView('savings');
        showToast('Choose a savings goal to add money to.');
      }
    }
    if (action === 'open-allowance') openDifferentAllowance();
    if (action === 'open-allowance-history') openAllowanceHistory();
    if (action === 'open-goal-history') openGoalHistory(button.dataset.goalId);
    if (action === 'apply-update') applyAvailableUpdate();
    if (action === 'dismiss-update') hideUpdateAvailable();
    if (action === 'check-update') checkForUpdates({ announce: true, force: true });
    if (action === 'open-goal') openGoal();
    if (action === 'open-contribution') openContribution(button.dataset.goalId, '', button.dataset.accountId || '');
    if (action === 'edit-goal') openGoalEditor(button.dataset.goalId);
    if (action === 'transfer-goal') openGoalTransfer(button.dataset.goalId);
    if (action === 'remove-goal') removeGoal(button.dataset.goalId);
    if (action === 'toggle-manage-goals') { manageGoalsMode = !manageGoalsMode; renderSavings(); }
    if (action === 'open-wallet') openWallet();
    if (action === 'remove-wallet') removeWallet(button.dataset.id);
    if (action === 'edit-transaction') editTransaction(button.dataset.id);
    if (action === 'undo-transaction' || action === 'delete-transaction') undoTransaction(button.dataset.id);
    if (action === 'edit-receipt-transaction') editTransaction(els.expenseReceiptDialog.dataset.transactionId || lastReceiptTransactionId);
    if (action === 'undo-receipt-transaction') undoTransaction(els.expenseReceiptDialog.dataset.transactionId || lastReceiptTransactionId);
    if (action === 'open-secret-pocket') openSecretPocketSettings();
    if (action === 'secret-theme-dark') setSecretTheme('dark');
    if (action === 'secret-theme-light') setSecretTheme('light');
    if (action === 'toggle-secret-companion') toggleSecretCompanion();
    if (action === 'toggle-secret-remember') toggleSecretRemember();
    if (action === 'open-companion-room') openCompanionRoom();
    if (action === 'select-companion-accessory') selectCompanionAccessory(button.dataset.accessory || 'none');
    if (action === 'room-pet') companionRoomPet();
    if (action === 'room-play') companionRoomPlay();
    if (action === 'room-nap') companionRoomNap();
    if (action === 'reset-companion-position') resetCompanionPosition();
    if (action === 'change-secret-pin') openChangeSecretPin();
    if (action === 'lock-secret-pocket') lockSecretPocket();
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
      'todayLabel', 'viewTitle', 'contentScroll', 'walletModeCounter', 'walletCarousel',
      'walletCarouselPrev', 'walletCarouselNext', 'walletModeIndicators', 'homeWalletTodaySpent', 'homeWalletTodayEntries', 'homeWalletTodayBar', 'homeWalletTodayLegend', 'homeWalletMonthLabel', 'homeWalletMonthSpent', 'homeWalletTopCategory', 'homeWalletMonthBar', 'homeWalletMonthLegend',
      'activityType', 'activityDatePicker', 'activityPrevDay', 'activityNextDay', 'activityDayName', 'activityDayDate', 'activityHistoryTitle', 'activityDayCard', 'activitySwipeHint', 'monthSpent', 'monthTransferred',
      'activityCount', 'allTransactions', 'totalSavings', 'goalsGrid', 'manageGoalsButton', 'savingsViewTitle', 'savingsViewSubtitle', 'savingsBalanceLabel', 'savingsModeToggle', 'savingsWalletTabs', 'goalHistoryDialog', 'goalHistoryTitle', 'goalHistorySubtitle', 'goalHistoryCount', 'goalHistoryList',
      'themeColorMeta', 'themeUnlockDialog', 'themeUnlockForm', 'themePassword', 'themePasswordError', 'secretPinDots', 'secretKeypad', 'secretRememberUnlock', 'secretUnlockButton', 'secretPocketDialog', 'secretPocketSettingButton', 'secretPocketSummary', 'secretThemeDark', 'secretThemeLight', 'secretCompanionToggle', 'secretCompanionLabel', 'secretCompanionSwitch', 'secretCompanionSpeech', 'secretCompanionMovement', 'secretRememberToggle', 'secretRememberLabel', 'secretRememberSwitch', 'secretWorldHeroTitle', 'secretWorldHeroSubtitle', 'companionStudioSummary', 'companionRoomDialog', 'companionRoomTitle', 'companionRoomScene', 'companionRoomBunny', 'companionRoomMessage', 'companionMoodLabel', 'companionBondLevel', 'companionBondValue', 'companionBondFill', 'companionEnergyValue', 'companionEnergyFill', 'companionVisitStreak', 'companionInteractionCount', 'companionNameInput', 'companionPersonality', 'companionDataSpeech', 'companionAccessoryGrid', 'secretLightScene', 'secretLightFx', 'changeSecretPinDialog', 'changeSecretPinForm', 'newSecretPin', 'confirmSecretPin', 'changeSecretPinError', 'secretPocketReveal', 'versionSecretTrigger', 'privacyLabel', 'privacySwitch', 'privacySettingButton', 'allowanceRecordSummary', 'allowanceHistorySummary', 'allowanceHistoryDialog', 'allowanceHistoryCount', 'allowanceHistoryList', 'walletsList', 'importFile',
      'allowanceDialog', 'allowanceForm', 'allowanceDialogTitle', 'allowanceAmount', 'allowanceAmountEntry', 'allowanceCustomAmountButton', 'allowanceKeypad', 'allowanceSaveButton',
      'allowanceReceivedDate', 'allowanceAccount',
      'expenseDialog', 'expenseForm', 'expenseDialogTitle', 'expenseReceiptDialog', 'expenseReceiptContent',
      'walletDialog', 'walletForm', 'walletCustomNameWrap', 'walletCustomName', 'walletOpeningBalance', 'walletKeypad',
      'transferDialog', 'transferForm', 'transferDialogTitle', 'transferFromAccount', 'transferToAccount', 'transferAmountCard', 'transferAvailable', 'transferAmount', 'transferAmountHint', 'transferKeypad', 'transferNote', 'transferSaveButton',
      'expenseAmount', 'expenseAmountCard', 'expenseAvailable', 'expenseAmountHint', 'expenseKeypad', 'expenseAccount',
      'expenseNote', 'expenseStepAmount', 'expenseStepDetails', 'expenseCancelButton', 'expenseBackButton', 'expenseNextButton', 'expenseSaveButton', 'goalDialog', 'goalForm', 'goalDialogTitle', 'goalSubmitButton', 'goalName', 'goalTarget',
      'goalCurrent', 'goalAccount', 'goalTransferDialog', 'goalTransferForm', 'goalTransferFromGoalId', 'goalTransferSource', 'goalTransferDestinations', 'goalTransferAmountCard', 'goalTransferAvailable', 'goalTransferAmount', 'goalTransferHint', 'goalTransferKeypad', 'goalTransferSaveButton', 'contributeDialog', 'contributeForm', 'contributeTitle', 'contributeGoalId', 'contributeAmount', 'contributeAccount', 'contributeWalletHint',
      'walletPickerDialog', 'walletPickerTitle', 'walletPickerSubtitle', 'walletPickerList',
      'confirmDialog', 'confirmTitle', 'confirmMessage', 'confirmAction', 'pocketCompanion', 'companionBubble', 'companionMessage', 'companionBunny', 'toast', 'toastMessage', 'toastAction',
      'updateBanner', 'appVersion', 'updateStatus'
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      companionRespondToUiClick(event.target);
      const closeButton = event.target.closest('[data-close-dialog]');
      if (closeButton) {
        closeDialog(closeButton.closest('dialog'));
        return;
      }
      const walletTrigger = event.target.closest('[data-wallet-select]');
      if (walletTrigger) {
        openWalletPicker(walletTrigger.dataset.walletSelect);
        return;
      }
      const walletOption = event.target.closest('[data-wallet-picker-account]');
      if (walletOption) {
        chooseWalletFromPicker(walletOption.dataset.walletPickerAccount);
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

    els.activityType.addEventListener('change', renderActivity);
    els.activityPrevDay.addEventListener('click', () => moveActivityDay(-1));
    els.activityNextDay.addEventListener('click', () => moveActivityDay(1));
    els.activityDatePicker.addEventListener('change', () => {
      if (!els.activityDatePicker.value) return;
      activityDate = els.activityDatePicker.value > localDateKey() ? localDateKey() : els.activityDatePicker.value;
      renderActivity();
    });
    els.activityDayCard.addEventListener('touchstart', (event) => {
      activitySwipeStartX = event.changedTouches?.[0]?.clientX ?? null;
    }, { passive: true });
    els.activityDayCard.addEventListener('touchend', (event) => {
      if (activitySwipeStartX == null) return;
      const endX = event.changedTouches?.[0]?.clientX ?? activitySwipeStartX;
      const delta = endX - activitySwipeStartX;
      activitySwipeStartX = null;
      if (Math.abs(delta) < 55) return;
      if (delta > 0) moveActivityDay(-1);
      else moveActivityDay(1);
    }, { passive: true });
    els.savingsModeToggle.addEventListener('click', (event) => {
      const button = event.target.closest('[data-savings-mode]');
      if (!button) return;
      savingsMode = button.dataset.savingsMode === 'wallet' ? 'wallet' : 'total';
      renderSavings();
      els.contentScroll.scrollTop = 0;
    });
    els.savingsWalletTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-savings-wallet-index]');
      if (!button) return;
      savingsWalletIndex = Number(button.dataset.savingsWalletIndex || 0);
      savingsMode = 'wallet';
      renderSavings();
      els.contentScroll.scrollTop = 0;
    });

    els.walletCarousel.addEventListener('scroll', queueWalletCarouselTransforms, { passive: true });
    els.walletCarousel.addEventListener('wheel', (event) => {
      if (state.accounts.length <= 1) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      els.walletCarousel.scrollBy({ left: event.deltaY, behavior: 'auto' });
    }, { passive: false });
    els.walletCarousel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollToWalletMode(walletModeIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollToWalletMode(walletModeIndex + 1);
      }
    });
    els.walletCarouselPrev.addEventListener('click', () => scrollToWalletMode(walletModeIndex - 1));
    els.walletCarouselNext.addEventListener('click', () => scrollToWalletMode(walletModeIndex + 1));
    els.walletModeIndicators.addEventListener('click', (event) => {
      const button = event.target.closest('[data-wallet-mode-index]');
      if (!button) return;
      scrollToWalletMode(Number(button.dataset.walletModeIndex));
    });


    document.getElementById('allowanceAmountChips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-amount]');
      if (!button) return;
      setAllowanceAmountValue(button.dataset.amount);
      els.allowanceKeypad.classList.add('is-hidden');
      els.allowanceCustomAmountButton.textContent = 'Custom amount';
    });
    els.allowanceAccount.addEventListener('change', syncWalletPickerTriggers);
    els.allowanceForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addAllowance();
    });
    const toggleAllowanceKeypad = () => {
      const opening = els.allowanceKeypad.classList.contains('is-hidden');
      els.allowanceKeypad.classList.toggle('is-hidden', !opening);
      els.allowanceCustomAmountButton.textContent = opening ? 'Hide keypad' : 'Custom amount';
      if (opening) els.allowanceDialog.querySelector('.dialog-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    };
    els.allowanceCustomAmountButton.addEventListener('click', (event) => { event.stopPropagation(); toggleAllowanceKeypad(); });
    els.allowanceAmountEntry.addEventListener('click', (event) => { if (!event.target.closest('button')) toggleAllowanceKeypad(); });
    els.allowanceAmountEntry.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleAllowanceKeypad(); } });
    els.allowanceKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-allowance-key]');
      if (!button) return;
      handleAllowanceAmountKey(button.dataset.allowanceKey);
    });
    els.allowanceDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, false);
      if (!key) return;
      event.preventDefault();
      handleAllowanceAmountKey(key);
    });
    els.walletForm.addEventListener('change', (event) => {
      if (event.target.name === 'walletPreset') updateWalletPresetUI();
    });
    els.walletKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-wallet-key]');
      if (!button) return;
      setWalletOpeningBalanceValue(applyAmountKey(els.walletOpeningBalance.value || '', button.dataset.walletKey, { allowDecimal: true, maxWholeDigits: 8 }));
    });
    els.walletDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, true);
      if (!key) return;
      event.preventDefault();
      setWalletOpeningBalanceValue(applyAmountKey(els.walletOpeningBalance.value || '', key, { allowDecimal: true, maxWholeDigits: 8 }));
    });
    els.walletForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addWallet();
    });
    els.transferFromAccount.addEventListener('change', () => {
      if (els.transferToAccount.value === els.transferFromAccount.value) {
        const fallback = state.accounts.find((account) => account.id !== els.transferFromAccount.value)?.id || '';
        if (fallback) els.transferToAccount.value = fallback;
      }
      syncWalletPickerTriggers();
      updateTransferEntry();
    });
    els.transferToAccount.addEventListener('change', () => { syncWalletPickerTriggers(); updateTransferEntry(); });
    els.transferKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-transfer-key]');
      if (!button) return;
      handleTransferKey(button.dataset.transferKey);
    });
    els.transferDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, true);
      if (!key) return;
      event.preventDefault();
      handleTransferKey(key);
    });
    els.transferForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveTransfer();
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
    els.expenseAccount.addEventListener('change', () => { syncWalletPickerTriggers(); updateExpenseEntry(); });
    els.expenseNextButton.addEventListener('click', () => {
      if (els.expenseNextButton.disabled) return;
      showExpenseStep('details');
    });
    els.expenseBackButton.addEventListener('click', () => showExpenseStep('amount'));
    els.expenseDialog.addEventListener('keydown', (event) => {
      if (els.expenseStepAmount.classList.contains('is-hidden')) return;
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
    els.goalAccount.addEventListener('change', syncWalletPickerTriggers);
    els.goalForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveGoalForm();
    });
    els.goalTransferDestinations.addEventListener('change', updateGoalTransferEntry);
    els.goalTransferKeypad.addEventListener('click', (event) => {
      const button = event.target.closest('[data-goal-transfer-key]');
      if (!button) return;
      handleGoalTransferKey(button.dataset.goalTransferKey);
    });
    els.goalTransferDialog.addEventListener('keydown', (event) => {
      const key = parseAmountKeyboardKey(event, true);
      if (!key) return;
      event.preventDefault();
      handleGoalTransferKey(key);
    });
    els.goalTransferForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      transferGoalSavings();
    });
    els.contributeAccount.addEventListener('change', () => { syncWalletPickerTriggers(); updateContributionWalletHint(); });
    els.contributeForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      addContribution();
    });
    els.themeUnlockForm.addEventListener('submit', (event) => { event.preventDefault(); unlockLightTheme(); });
    els.secretKeypad.addEventListener('click', (event) => { const button=event.target.closest('[data-secret-key]'); if(button) handleSecretKey(button.dataset.secretKey); });
    els.secretPinDots.addEventListener('click',()=>els.themePassword.focus({preventScroll:true}));
    els.themeUnlockDialog.addEventListener('keydown',(event)=>{ if(/^\d$/.test(event.key)){event.preventDefault();handleSecretKey(event.key);} else if(event.key==='Backspace'){event.preventDefault();handleSecretKey('backspace');} });
    els.themePassword.addEventListener('input',()=>setSecretPinEntry(els.themePassword.value));
    [els.newSecretPin,els.confirmSecretPin].forEach((input)=>input.addEventListener('input',()=>{input.value=input.value.replace(/\D/g,'').slice(0,4);els.changeSecretPinError.textContent='';}));
    els.changeSecretPinForm.addEventListener('submit',(event)=>{event.preventDefault();changeSecretPin();});
    els.secretCompanionSpeech.addEventListener('change',()=>{secretConfig.companionSpeech=els.secretCompanionSpeech.value;saveSecretConfig();renderSecretPocketSettings();syncCompanion({fast:true});});
    els.secretCompanionMovement.addEventListener('change',()=>{secretConfig.companionMovement=els.secretCompanionMovement.value;saveSecretConfig();clearCompanionTimers();syncCompanion({fast:true});});
    els.companionNameInput.addEventListener('change',()=>{ const profile=companionProfileState(); profile.name=els.companionNameInput.value.trim().slice(0,14)||'Bunny'; profile.lastInteractionAt=Date.now(); saveSecretConfig(); renderCompanionRoom(); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`${profile.name} likes the new name ♡`; });
    els.companionPersonality.addEventListener('change',()=>{ const profile=companionProfileState(); profile.personality=['gentle','playful','curious'].includes(els.companionPersonality.value)?els.companionPersonality.value:'gentle'; profile.mood=companionMoodFromState(); profile.lastInteractionAt=Date.now(); saveSecretConfig(); renderCompanionRoom(); clearCompanionTimers(); syncCompanion({fast:true}); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`${profile.name} feels a little more ${profile.personality} now ✨`; });
    els.companionDataSpeech.addEventListener('change',()=>{ secretConfig.companionDataSpeech=['quiet','balanced','chatty','very-chatty'].includes(els.companionDataSpeech.value)?els.companionDataSpeech.value:'chatty'; saveSecretConfig(); renderCompanionRoom(); clearCompanionTimers(); syncCompanion({fast:true}); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`Real-data talk set to ${els.companionDataSpeech.options[els.companionDataSpeech.selectedIndex].text.toLowerCase()} ♡`; });
    els.companionBunny.addEventListener('pointerdown', companionPointerDown);
    els.companionBunny.addEventListener('pointermove', companionPointerMove);
    els.companionBunny.addEventListener('pointerup', (event)=>companionPointerEnd(event,false));
    els.companionBunny.addEventListener('pointercancel', (event)=>companionPointerEnd(event,true));
    document.addEventListener('pointermove', companionPointerWatch, { passive: true });
    document.addEventListener('pointerover', (event)=>{ if(!companionIsAvailable()||companionPointerState||companionPhase!=='idle') return; const target=event.target.closest('button,[role=button],.card,.goal-card,.wallet-mode-card'); if(target&&companionVisibleElement(target)) companionLookAtElement(target); }, { passive: true });
    els.contentScroll.addEventListener('scroll', ()=>{ if(companionPerchTarget){ companionClearPerch(); companionStoryGeneration += 1; } }, { passive: true });
    window.addEventListener('resize', ()=>{ companionClearPerch(); companionSetGazeNormalized(0,0,true); }, { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && els.secretPocketDialog?.open) {
        closeDialog(els.secretPocketDialog);
      }
    });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
      document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
    });
    els.versionSecretTrigger.addEventListener('click',handleSecretVersionTap);
    els.versionSecretTrigger.addEventListener('pointerdown',startSecretRecoveryHold);
    ['pointerup','pointercancel','pointerleave'].forEach((eventName)=>els.versionSecretTrigger.addEventListener(eventName,cancelSecretRecoveryHold));

    els.confirmDialog.querySelector('form').addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') { pendingConfirm = null; return; }
      event.preventDefault();
      const action = pendingConfirm;
      pendingConfirm = null;
      closeDialog(els.confirmDialog);
      if (action) action();
    });

    els.walletPickerDialog.addEventListener('close', () => {
      const targetId = activeWalletPickerTarget;
      activeWalletPickerTarget = '';
      if (!targetId) return;
      requestAnimationFrame(() => {
        document.querySelector(`[data-wallet-select="${CSS.escape(targetId)}"]`)?.focus({ preventScroll: true });
      });
    });

    els.expenseDialog.addEventListener('close', () => {
      currentExpenseEditId = null;
    });
    els.goalDialog.addEventListener('close', () => {
      currentGoalEditId = null;
    });
    els.allowanceDialog.addEventListener('close', () => {
      currentAllowanceEditId = null;
      els.allowanceKeypad.classList.add('is-hidden');
    });
    els.transferDialog.addEventListener('close', () => {
      currentTransferEditId = null;
    });

    els.importFile.addEventListener('change', () => {
      const file = els.importFile.files?.[0];
      if (file) importData(file);
    });

    document.querySelectorAll('dialog').forEach((dialog) => {
      dialog.addEventListener('close', flushPendingCompanionReaction);
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
      if (document.visibilityState === 'visible') { prepareCompanionProfile(); checkForUpdates(); syncCompanion({ welcome: companionReturnGap > 1000 * 60 * 45 }); }
      else { persistCompanionPresence(); clearCompanionTimers(); }
    });
    window.addEventListener('pagehide', persistCompanionPresence);
    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, resetCompanionIdleTimer, { passive: true }));
    window.addEventListener('online', () => checkForUpdates({ force: true }));
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
      els.updateStatus.textContent = 'Hosted only';
      return;
    }

    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js?v=3.2.0');

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
    secretConfig = loadSecretConfig();
    try {
      if (sessionStorage.getItem(LEGACY_LIGHT_SESSION_KEY) === '1') {
        secretConfig.discovered = true;
        secretConfig.firstRevealSeen = true;
        saveSecretConfig();
        sessionStorage.setItem(SECRET_SESSION_KEY, '1');
        sessionStorage.removeItem(LEGACY_LIGHT_SESSION_KEY);
      }
    } catch (error) { /* Legacy session migration is best-effort. */ }
    state = loadState();
    prepareCompanionProfile();
    bindEvents();
    renderAll();
    setView(location.hash.slice(1) || 'home', false);
    if ('ResizeObserver' in window) {
      walletCarouselResizeObserver = new ResizeObserver(() => { if (currentView === 'home') stabilizeWalletCarousel(walletModeIndex); });
      walletCarouselResizeObserver.observe(els.walletCarousel);
    }
    window.addEventListener('resize', () => {
      if (currentView === 'home') stabilizeWalletCarousel(walletModeIndex);
      if (companionIsAvailable()) { const pos = companionSafePosition(true); companionPlace(pos.maxX, pos.maxY, true); }
    });
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
