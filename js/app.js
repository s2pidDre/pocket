(() => {
  'use strict';

  const STORAGE_KEY = 'pocket-student-tracker-v1';
  const UI_PREFS_KEY = 'pocket-ui-preferences-v1';
  const STORAGE_SYNC_KEY = 'pocket-storage-sync-v1';
  const EMERGENCY_STORAGE_KEY = 'pocket-emergency-recovery-v1';
  const DB_NAME = 'pocket-student-tracker-db';
  const DB_VERSION = 1;
  const DB_STORE = 'records';
  const DB_TRACKER_KEY = 'tracker';
  const DB_SECRET_KEY = 'secret';
  const DB_RECOVERY_KEY = 'recovery';
  const SCHEMA_VERSION = 5;
  const APP_VERSION = '3.5.9';
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
    minimumFractionDigits: 2,
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
    Transfer: { icon: 'i-transfer', tone: 'accent-soft', className: 'activity-cat-transfer' },
    Correction: { icon: 'i-refresh', tone: 'neutral-soft', className: 'activity-cat-correction' },
    Reconciliation: { icon: 'i-wallet', tone: 'neutral-soft', className: 'activity-cat-reconciliation' }
  };

  const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'cat-food', name: 'Food', icon: 'i-food', tone: 'cat-food-soft', order: 0, archivedAt: null },
    { id: 'cat-transport', name: 'Transport', icon: 'i-transport', tone: 'cat-transport-soft', order: 1, archivedAt: null },
    { id: 'cat-school', name: 'School', icon: 'i-school', tone: 'cat-school-soft', order: 2, archivedAt: null },
    { id: 'cat-load', name: 'Load', icon: 'i-phone', tone: 'cat-load-soft', order: 3, archivedAt: null },
    { id: 'cat-personal', name: 'Personal', icon: 'i-user', tone: 'cat-personal-soft', order: 4, archivedAt: null },
    { id: 'cat-other', name: 'Other', icon: 'i-more', tone: 'cat-other-soft', order: 5, archivedAt: null }
  ];
  const CATEGORY_ICONS = new Set(['i-food','i-transport','i-school','i-phone','i-user','i-savings','i-target','i-sparkle','i-more']);
  const CATEGORY_TONES = ['cat-food-soft','cat-transport-soft','cat-school-soft','cat-load-soft','cat-personal-soft','cat-other-soft'];

  const els = {};
  let state;
  let storageDb = null;
  let storageBackend = 'initializing';
  let storageDurability = 'checking';
  let storageTrackerRevision = 0;
  let storageSecretRevision = 0;
  let storageWriteChain = Promise.resolve();
  let secretWriteChain = Promise.resolve();
  let storagePendingTrackerWrites = 0;
  let storageHealth = { healthy: true, message: 'Checking data…', checkedAt: 0 };
  let storageUsageBytes = 0;
  let lastRecoveryAt = 0;
  let lastCommittedStateSnapshot = null;
  let storageReady = false;
  let bootStorageMessage = '';
  let backupReminderShown = false;
  let storageChannel = null;
  const STORAGE_TAB_ID = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let uiPreferences = { theme: 'dark', textSize: 'default', lastExportAt: 0, lastBackupReminderAt: 0 };
  let toastTimer = 0;
    let pendingConfirm = null;
  let currentView = 'home';
  let serviceWorkerRegistration = null;
  let waitingServiceWorker = null;
  let refreshAfterUpdate = false;
  let lastUpdateCheck = 0;
  let currentExpenseEditId = null;
  let currentAllowanceEditId = null;
  let currentTransferEditId = null;
  let currentCorrectionSourceId = null;
  let currentWalletManageId = null;
  let currentWalletDetailId = null;
  let currentGoalTransferEditId = null;
  let currentGoalTransferCorrectionId = null;
  let currentSavingEditId = null;
  let currentSavingsWithdrawalEditId = null;
  let currentSavingsWithdrawalCorrectionId = null;
  let currentReconciliationCorrectionId = null;
  let companionLastUserActivityAt = Date.now();
  let secretFailedAttempts = 0;
  let secretLockoutUntil = 0;
  let walletModeIndex = 0;
  let walletCarouselFrame = 0;
  let walletCarouselResizeObserver = null;
  let savingsMode = 'total';
  let savingsWalletIndex = 0;
  let savingsGoalPage = 0;
  let allowanceHistoryPage = 0;
  let globalHistoryPage = 0;
  let activityDate = localDateKey();
  let manageGoalsMode = false;
  let activitySwipeStartX = null;
  let lastReceiptTransactionId = '';
  let activeWalletPickerTarget = '';
  let currentGoalEditId = null;
  let currentGoalHistoryId = '';
  let milestoneEffectiveDateHint = '';
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
    return { pinSalt: '', pinHash: '', pinScheme: '', remember: false, companionEnabled: true, companionSpeech: 'normal', companionMovement: 'normal', companionPerformance: 'auto', companionDataSpeech: 'chatty', discovered: false, firstRevealSeen: false, companionProfile: defaultCompanionProfile() };
  }

  function normalizeSecretConfig(input) {
    const parsed = input && typeof input === 'object' ? input : {};
    const base = defaultSecretConfig();
    return { ...base, pinSalt: typeof parsed.pinSalt === 'string' ? parsed.pinSalt : '', pinHash: typeof parsed.pinHash === 'string' ? parsed.pinHash : '', pinScheme: ['pbkdf2-sha256','legacy'].includes(parsed.pinScheme) ? parsed.pinScheme : (parsed.pinHash ? 'legacy' : ''), remember: Boolean(parsed.remember), companionEnabled: parsed.companionEnabled !== false, companionSpeech: ['normal','quiet','off'].includes(parsed.companionSpeech) ? parsed.companionSpeech : 'normal', companionMovement: parsed.companionMovement === 'calm' ? 'calm' : 'normal', companionPerformance: ['auto','full','battery'].includes(parsed.companionPerformance) ? parsed.companionPerformance : 'auto', companionDataSpeech: ['quiet','balanced','chatty','very-chatty'].includes(parsed.companionDataSpeech) ? parsed.companionDataSpeech : 'chatty', discovered: Boolean(parsed.discovered), firstRevealSeen: Boolean(parsed.firstRevealSeen), companionProfile: normalizeCompanionProfile(parsed.companionProfile) };
  }

  class PocketStorageConflictError extends Error {
    constructor(message = 'Pocket data changed in another open tab.') {
      super(message);
      this.name = 'PocketStorageConflictError';
    }
  }

  function cloneStorageValue(value) {
    if (typeof structuredClone === 'function') {
      try { return structuredClone(value); } catch (error) { /* JSON fallback below. */ }
    }
    return JSON.parse(JSON.stringify(value));
  }

  function loadUiPreferences() {
    try {
      const raw = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || 'null');
      const stored = raw && typeof raw === 'object';
      return {
        stored,
        value: {
          theme: raw?.theme === 'light' ? 'light' : 'dark',
          textSize: ['compact','default','large'].includes(raw?.textSize) ? raw.textSize : 'default',
          lastExportAt: Math.max(0, Number(raw?.lastExportAt || 0)),
          lastBackupReminderAt: Math.max(0, Number(raw?.lastBackupReminderAt || 0))
        }
      };
    } catch (error) {
      return { stored: false, value: { theme: 'dark', textSize: 'default', lastExportAt: 0, lastBackupReminderAt: 0 } };
    }
  }

  function saveUiPreferences() {
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
        theme: uiPreferences.theme === 'light' ? 'light' : 'dark',
        textSize: ['compact','default','large'].includes(uiPreferences.textSize) ? uiPreferences.textSize : 'default',
        lastExportAt: Math.max(0, Number(uiPreferences.lastExportAt || 0)),
        lastBackupReminderAt: Math.max(0, Number(uiPreferences.lastBackupReminderAt || 0))
      }));
    } catch (error) {
      console.warn('Unable to save Pocket UI preferences.', error);
    }
  }

  function persistCurrentTheme() {
    uiPreferences.theme = state?.settings?.theme === 'light' ? 'light' : 'dark';
    saveUiPreferences();
  }

  function trackerSnapshotForStorage(source = state) {
    const snapshot = cloneStorageValue(source || seedState());
    snapshot.version = SCHEMA_VERSION;
    snapshot.settings ||= {};
    delete snapshot.settings.theme;
    delete snapshot.settings.demoData;
    delete snapshot.checkins;
    return snapshot;
  }

  function openPocketDatabase() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is unavailable.'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (storageDb === db) storageDb = null;
          storageDurability = 'error';
          renderStorageStatus();
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Unable to open Pocket storage.'));
      request.onblocked = () => reject(new Error('Pocket storage upgrade is blocked by another open tab.'));
    });
  }

  function idbGetRecord(key) {
    return new Promise((resolve, reject) => {
      if (!storageDb) return resolve(null);
      const tx = storageDb.transaction(DB_STORE, 'readonly');
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error(`Unable to read ${key}.`));
    });
  }

  function idbPutRecord(record) {
    return new Promise((resolve, reject) => {
      if (!storageDb) return reject(new Error('Pocket storage is not open.'));
      const tx = storageDb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error || new Error('Unable to write Pocket storage.'));
      tx.onabort = () => reject(tx.error || new Error('Pocket storage write was aborted.'));
    });
  }

  async function withPocketStorageLock(callback) {
    if (navigator.locks?.request) return navigator.locks.request('pocket-storage-write-v1', { mode: 'exclusive' }, callback);
    return callback();
  }

  function idbCommitAppData({ tracker = null, secret = null, expectedTrackerRevision = null, expectedSecretRevision = null, force = false } = {}) {
    return withPocketStorageLock(() => new Promise((resolve, reject) => {
      if (!storageDb) return reject(new Error('Pocket storage is not open.'));
      const tx = storageDb.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      let trackerRecord = null;
      let secretRecord = null;
      let trackerLoaded = tracker === null;
      let secretLoaded = secret === null;
      let planned = null;
      let settled = false;

      const failConflict = (message) => {
        planned = { conflict: true, message };
        try { tx.abort(); } catch (error) { /* handled below */ }
      };

      const planWrites = () => {
        if (!trackerLoaded || !secretLoaded || planned) return;
        const currentTrackerRevision = Number(trackerRecord?.revision || 0);
        const currentSecretRevision = Number(secretRecord?.revision || 0);
        if (!force && tracker !== null && expectedTrackerRevision !== null && currentTrackerRevision !== expectedTrackerRevision) {
          return failConflict('Tracker data changed in another open Pocket tab.');
        }
        if (!force && secret !== null && expectedSecretRevision !== null && currentSecretRevision !== expectedSecretRevision) {
          return failConflict('Secret Pocket settings changed in another open Pocket tab.');
        }
        const now = new Date().toISOString();
        planned = {
          trackerRevision: currentTrackerRevision,
          secretRevision: currentSecretRevision
        };
        if (tracker !== null) {
          planned.trackerRevision = currentTrackerRevision + 1;
          store.put({ key: DB_TRACKER_KEY, revision: planned.trackerRevision, schemaVersion: SCHEMA_VERSION, updatedAt: now, data: tracker });
        }
        if (secret !== null) {
          planned.secretRevision = currentSecretRevision + 1;
          store.put({ key: DB_SECRET_KEY, revision: planned.secretRevision, updatedAt: now, data: secret });
        }
      };

      if (tracker !== null) {
        const request = store.get(DB_TRACKER_KEY);
        request.onsuccess = () => { trackerRecord = request.result || null; trackerLoaded = true; planWrites(); };
        request.onerror = () => { planned = { error: request.error || new Error('Unable to read current tracker revision.') }; try { tx.abort(); } catch (error) {} };
      }
      if (secret !== null) {
        const request = store.get(DB_SECRET_KEY);
        request.onsuccess = () => { secretRecord = request.result || null; secretLoaded = true; planWrites(); };
        request.onerror = () => { planned = { error: request.error || new Error('Unable to read current Secret Pocket revision.') }; try { tx.abort(); } catch (error) {} };
      }
      planWrites();

      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(planned || { trackerRevision: storageTrackerRevision, secretRevision: storageSecretRevision });
      };
      tx.onabort = () => {
        if (settled) return;
        settled = true;
        if (planned?.conflict) reject(new PocketStorageConflictError(planned.message));
        else reject(planned?.error || tx.error || new Error('Pocket storage write was aborted.'));
      };
      tx.onerror = () => { /* onabort/oncomplete handles final settlement. */ };
    }));
  }

  async function getRecoverySnapshots() {
    if (storageBackend !== 'indexeddb' || !storageDb) return [];
    const record = await idbGetRecord(DB_RECOVERY_KEY);
    return Array.isArray(record?.snapshots) ? record.snapshots : [];
  }

  async function storeRecoverySnapshot(snapshot) {
    if (storageBackend !== 'indexeddb' || !storageDb) return false;
    return withPocketStorageLock(() => new Promise((resolve, reject) => {
      const tx = storageDb.transaction(DB_STORE, 'readwrite');
      const store = tx.objectStore(DB_STORE);
      const request = store.get(DB_RECOVERY_KEY);
      request.onsuccess = () => {
        const current = Array.isArray(request.result?.snapshots) ? request.result.snapshots : [];
        const snapshots = [snapshot, ...current.filter((item) => item?.id !== snapshot.id)].slice(0, 5);
        store.put({ key: DB_RECOVERY_KEY, updatedAt: snapshot.createdAt, snapshots });
      };
      request.onerror = () => { try { tx.abort(); } catch (error) {} };
      tx.oncomplete = () => { if (snapshot.restorable !== false) lastRecoveryAt = Math.max(lastRecoveryAt, Date.parse(snapshot.createdAt) || Date.now()); resolve(true); };
      tx.onerror = () => reject(tx.error || new Error('Unable to save recovery point.'));
      tx.onabort = () => reject(tx.error || new Error('Recovery point write was aborted.'));
    }));
  }

  async function createRecoverySnapshot(reason = 'Automatic recovery point', options = {}) {
    const tracker = cloneStorageValue(options.tracker || state || lastCommittedStateSnapshot || seedState());
    const secretPocket = normalizeSecretConfig(cloneStorageValue(options.secretPocket || secretConfig || defaultSecretConfig()));
    const snapshot = {
      id: `recovery-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      reason: String(reason || 'Recovery point').slice(0, 80),
      schemaVersion: Number(tracker?.version || SCHEMA_VERSION),
      restorable: true,
      tracker,
      secretPocket
    };
    if (storageBackend === 'indexeddb') {
      await storeRecoverySnapshot(snapshot);
      renderStorageStatus();
      return snapshot;
    }
    try {
      localStorage.setItem(EMERGENCY_STORAGE_KEY, JSON.stringify(snapshot));
      lastRecoveryAt = Date.now();
      renderStorageStatus();
      return snapshot;
    } catch (error) {
      console.warn('Unable to save recovery point.', error);
      return null;
    }
  }

  async function maybeCreateAutomaticRecoveryPoint() {
    if (storageBackend !== 'indexeddb' || !lastCommittedStateSnapshot) return;
    if (!(lastCommittedStateSnapshot.transactions?.length || lastCommittedStateSnapshot.goals?.length || lastCommittedStateSnapshot.accounts?.length > 1)) return;
    if (Date.now() - lastRecoveryAt < 24 * 60 * 60 * 1000) return;
    try { await createRecoverySnapshot('Automatic daily recovery point', { tracker: lastCommittedStateSnapshot }); }
    catch (error) { console.warn('Automatic recovery point could not be created.', error); }
  }

  function announceStorageChange(kind, revision) {
    const message = { source: STORAGE_TAB_ID, kind, revision, at: Date.now() };
    try { storageChannel?.postMessage(message); } catch (error) { /* fallback below */ }
    try { localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(message)); } catch (error) { /* best effort */ }
  }

  function ensureStorageChannel() {
    if (!('BroadcastChannel' in window) || storageChannel) return;
    try {
      storageChannel = new BroadcastChannel('pocket-storage-sync-v1');
      storageChannel.addEventListener('message', (event) => handleStorageSignal(event.data));
    } catch (error) { storageChannel = null; }
  }

  async function reloadTrackerFromIndexedDb({ announce = true } = {}) {
    if (storageBackend !== 'indexeddb' || !storageDb) return false;
    try {
      const record = await idbGetRecord(DB_TRACKER_KEY);
      if (!record?.data || Number(record.revision || 0) <= storageTrackerRevision) return false;
      const next = migrateStateSchema(record.data);
      next.settings.theme = uiPreferences.theme;
      validateNormalizedBackupIntegrity(next);
      state = next;
      storageTrackerRevision = Number(record.revision || 0);
      lastCommittedStateSnapshot = cloneStorageValue(state);
      storageHealth = { healthy: true, message: 'Healthy', checkedAt: Date.now() };
      renderAll();
      if (announce) showToast('Pocket refreshed changes from another open tab.');
      return true;
    } catch (error) {
      console.warn('Unable to refresh Pocket data from storage.', error);
      storageHealth = { healthy: false, message: 'Stored data needs attention', checkedAt: Date.now() };
      renderStorageStatus();
      return false;
    }
  }

  async function reloadSecretFromIndexedDb() {
    if (storageBackend !== 'indexeddb' || !storageDb) return false;
    try {
      const record = await idbGetRecord(DB_SECRET_KEY);
      if (!record?.data || Number(record.revision || 0) <= storageSecretRevision) return false;
      secretConfig = normalizeSecretConfig(record.data);
      storageSecretRevision = Number(record.revision || 0);
      renderSettings();
      syncCompanion({ fast: true });
      return true;
    } catch (error) {
      console.warn('Unable to refresh Secret Pocket settings.', error);
      return false;
    }
  }

  function handleStorageSignal(message) {
    if (!message || message.source === STORAGE_TAB_ID || storageBackend !== 'indexeddb') return;
    if (message.kind === 'tracker' && Number(message.revision || 0) > storageTrackerRevision) {
      if (!storagePendingTrackerWrites) reloadTrackerFromIndexedDb({ announce: true });
    }
    if (message.kind === 'secret' && Number(message.revision || 0) > storageSecretRevision) reloadSecretFromIndexedDb();
  }

  function evaluateDataHealth(candidate = state) {
    try {
      validateNormalizedBackupIntegrity(candidate);
      return { healthy: true, message: 'Healthy', checkedAt: Date.now() };
    } catch (error) {
      return { healthy: false, message: error?.message || 'Data integrity check failed.', checkedAt: Date.now() };
    }
  }

  async function refreshStorageEstimate() {
    if (!navigator.storage?.estimate) return;
    try {
      const estimate = await navigator.storage.estimate();
      storageUsageBytes = Math.max(0, Number(estimate.usage || 0));
    } catch (error) { storageUsageBytes = 0; }
  }

  async function requestStoragePersistence({ announce = false } = {}) {
    if (storageBackend !== 'indexeddb') {
      storageDurability = 'fallback';
      renderStorageStatus();
      if (announce) showToast('Pocket is using compatibility storage in this browser.');
      return false;
    }
    if (!navigator.storage?.persisted) {
      storageDurability = 'best-effort';
      renderStorageStatus();
      if (announce) showToast('This browser does not expose storage-protection status.');
      return false;
    }
    try {
      let persisted = await navigator.storage.persisted();
      if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
      storageDurability = persisted ? 'persistent' : 'best-effort';
      await refreshStorageEstimate();
      renderStorageStatus();
      if (announce) showToast(persisted ? 'Pocket storage is protected from routine browser cleanup.' : 'Pocket requested protected storage, but this browser kept best-effort storage. Keep backups too.');
      return persisted;
    } catch (error) {
      storageDurability = 'best-effort';
      renderStorageStatus();
      if (announce) showToast('Storage protection could not be changed in this browser.');
      return false;
    }
  }

  function emergencySave(snapshot, reason = 'Storage write failure') {
    try {
      localStorage.setItem(EMERGENCY_STORAGE_KEY, JSON.stringify({
        id: `emergency-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        reason,
        schemaVersion: SCHEMA_VERSION,
        tracker: snapshot,
        secretPocket: secretConfig || defaultSecretConfig()
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function handleTrackerWriteConflict(attemptedSnapshot) {
    try { await createRecoverySnapshot('Unsaved change from cross-tab conflict', { tracker: attemptedSnapshot }); } catch (error) {}
    await reloadTrackerFromIndexedDb({ announce: false });
    showToast('Another Pocket tab changed your data first. This tab reloaded the saved version; your unsaved version was kept as a recovery point.');
  }

  function saveState() {
    if (!state) return Promise.resolve(false);
    persistCurrentTheme();
    const milestoneDate = milestoneEffectiveDateHint && validDateKey(milestoneEffectiveDateHint) ? milestoneEffectiveDateHint : localDateKey();
    milestoneEffectiveDateHint = '';
    syncGoalMilestones(milestoneDate);
    const fullSnapshot = cloneStorageValue(state);
    const health = evaluateDataHealth(fullSnapshot);
    storageHealth = health;
    renderStorageStatus();
    if (!health.healthy) {
      console.error('Pocket blocked an unsafe state write:', health.message);
      if (lastCommittedStateSnapshot) {
        const safe = cloneStorageValue(lastCommittedStateSnapshot);
        safe.settings.theme = uiPreferences.theme;
        queueMicrotask(() => { state = safe; renderAll(); showToast('Pocket blocked an unsafe data change and restored the last healthy state.'); });
      }
      return Promise.resolve(false);
    }

    const trackerSnapshot = trackerSnapshotForStorage(fullSnapshot);
    if (!storageReady || storageBackend === 'localstorage') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerSnapshot));
        lastCommittedStateSnapshot = fullSnapshot;
        storageHealth = { healthy: true, message: 'Healthy', checkedAt: Date.now() };
        return Promise.resolve(true);
      } catch (error) {
        storageHealth = { healthy: false, message: 'Storage write failed', checkedAt: Date.now() };
        storageDurability = 'error';
        emergencySave(fullSnapshot, 'Compatibility storage write failure');
        renderStorageStatus();
        showToast('Pocket could not save this change. Export a backup before closing the app.');
        return Promise.resolve(false);
      }
    }

    storagePendingTrackerWrites += 1;
    storageWriteChain = storageWriteChain.then(async () => {
      await maybeCreateAutomaticRecoveryPoint();
      const result = await idbCommitAppData({ tracker: trackerSnapshot, expectedTrackerRevision: storageTrackerRevision });
      storageTrackerRevision = Number(result.trackerRevision || storageTrackerRevision);
      lastCommittedStateSnapshot = fullSnapshot;
      storageHealth = { healthy: true, message: 'Healthy', checkedAt: Date.now() };
      announceStorageChange('tracker', storageTrackerRevision);
      try { localStorage.removeItem(EMERGENCY_STORAGE_KEY); } catch (error) {}
      await refreshStorageEstimate();
      renderStorageStatus();
      return true;
    }).catch(async (error) => {
      if (error instanceof PocketStorageConflictError) {
        await handleTrackerWriteConflict(fullSnapshot);
        return false;
      }
      console.error('Pocket storage write failed.', error);
      storageHealth = { healthy: false, message: 'Storage write failed', checkedAt: Date.now() };
      storageDurability = 'error';
      emergencySave(fullSnapshot, 'IndexedDB write failure');
      renderStorageStatus();
      showToast('Pocket could not save this change. A best-effort emergency copy was attempted; export a backup before closing.');
      return false;
    }).finally(() => { storagePendingTrackerWrites = Math.max(0, storagePendingTrackerWrites - 1); });
    return storageWriteChain;
  }

  function loadSecretConfig() {
    if (secretConfig) return normalizeSecretConfig(secretConfig);
    try { return normalizeSecretConfig(JSON.parse(localStorage.getItem(SECRET_POCKET_KEY) || 'null')); }
    catch (error) { return defaultSecretConfig(); }
  }

  function saveSecretConfig() {
    const snapshot = normalizeSecretConfig(secretConfig || defaultSecretConfig());
    secretConfig = snapshot;
    if (!storageReady || storageBackend === 'localstorage') {
      try { localStorage.setItem(SECRET_POCKET_KEY, JSON.stringify(snapshot)); } catch (error) { console.warn('Unable to save Secret Pocket settings.', error); }
      return Promise.resolve(true);
    }
    secretWriteChain = secretWriteChain.then(async () => {
      const result = await idbCommitAppData({ secret: cloneStorageValue(snapshot), expectedSecretRevision: storageSecretRevision });
      storageSecretRevision = Number(result.secretRevision || storageSecretRevision);
      announceStorageChange('secret', storageSecretRevision);
      return true;
    }).catch(async (error) => {
      if (error instanceof PocketStorageConflictError) {
        await reloadSecretFromIndexedDb();
        return false;
      }
      console.warn('Unable to save Secret Pocket settings.', error);
      storageDurability = 'error';
      emergencySave(cloneStorageValue(state || seedState()), 'Secret Pocket write failure');
      try { localStorage.setItem(SECRET_POCKET_KEY, JSON.stringify(snapshot)); } catch (fallbackError) {}
      renderStorageStatus();
      return false;
    });
    return secretWriteChain;
  }

  function formatStorageBytes(bytes) {
    const value = Math.max(0, Number(bytes || 0));
    if (value < 1024) return `${Math.round(value)} B`;
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function renderStorageStatus() {
    if (!els.storageProtectionSummary) return;
    const indexed = storageBackend === 'indexeddb';
    const usage = storageUsageBytes ? ` · ${formatStorageBytes(storageUsageBytes)} used` : '';
    if (indexed && storageDurability === 'persistent') {
      els.storageProtectionStatus.textContent = 'Protected';
      els.storageProtectionStatus.className = 'status-pill success';
      els.storageProtectionSummary.textContent = `IndexedDB · protected from routine browser cleanup${usage}`;
    } else if (indexed && storageDurability === 'best-effort') {
      els.storageProtectionStatus.textContent = 'Best effort';
      els.storageProtectionStatus.className = 'status-pill warning';
      els.storageProtectionSummary.textContent = `IndexedDB · browser-managed durability${usage}. Keep regular backups.`;
    } else if (storageBackend === 'localstorage') {
      els.storageProtectionStatus.textContent = 'Fallback';
      els.storageProtectionStatus.className = 'status-pill warning';
      els.storageProtectionSummary.textContent = 'Compatibility storage is active. Export backups regularly.';
    } else if (storageDurability === 'error') {
      els.storageProtectionStatus.textContent = 'Attention';
      els.storageProtectionStatus.className = 'status-pill error';
      els.storageProtectionSummary.textContent = 'A storage error occurred. Export a backup before closing Pocket.';
    } else {
      els.storageProtectionStatus.textContent = 'Checking';
      els.storageProtectionStatus.className = 'status-pill neutral';
      els.storageProtectionSummary.textContent = 'Checking browser storage protection…';
    }

    if (storageHealth.healthy) {
      els.dataHealthStatus.textContent = 'Healthy';
      els.dataHealthStatus.className = 'status-pill success';
      els.dataHealthSummary.textContent = 'Wallets, ledger, goals, corrections, and allocations reconcile.';
    } else {
      els.dataHealthStatus.textContent = 'Attention';
      els.dataHealthStatus.className = 'status-pill error';
      els.dataHealthSummary.textContent = storageHealth.message || 'Pocket detected a data-integrity problem.';
    }

    if (els.exportBackupSummary) {
      if (uiPreferences.lastExportAt) {
        const exportDate = new Date(uiPreferences.lastExportAt);
        els.exportBackupSummary.textContent = `Last external backup: ${DATE_LABEL.format(exportDate)} · ${TIME_LABEL.format(exportDate)}.`;
      } else {
        els.exportBackupSummary.textContent = 'No external backup recorded yet. Download one for protection outside this browser.';
      }
    }

    if (lastRecoveryAt) {
      const date = new Date(lastRecoveryAt);
      els.recoveryPointSummary.textContent = `Latest protected snapshot: ${DATE_LABEL.format(date)} · ${TIME_LABEL.format(date)}`;
      els.restoreRecoveryButton.hidden = false;
      els.restoreRecoverySummary.textContent = `Restore the snapshot from ${DATE_LABEL.format(date)} at ${TIME_LABEL.format(date)}.`;
    } else {
      els.recoveryPointSummary.textContent = 'No recovery point yet. Pocket creates them before risky changes and at least daily while data changes.';
      els.restoreRecoveryButton.hidden = true;
    }
  }

  function runDataHealthCheck({ announce = true } = {}) {
    storageHealth = evaluateDataHealth(state);
    renderStorageStatus();
    if (announce) showToast(storageHealth.healthy ? 'Data health check passed. Pocket is internally consistent.' : `Data health needs attention: ${storageHealth.message}`);
    return storageHealth;
  }

  async function createManualRecoveryPoint() {
    try {
      const health = runDataHealthCheck({ announce: false });
      if (!health.healthy) return showToast('Pocket will not create a normal recovery point until Data Health is healthy.');
      await waitForStorageQueues();
      const snapshot = await createRecoverySnapshot('Manual recovery point');
      if (!snapshot) throw new Error('Recovery point could not be stored.');
      showToast('Recovery point created.');
    } catch (error) {
      console.warn(error);
      showToast('Pocket could not create a recovery point in this browser.');
    }
  }

  async function waitForStorageQueues() {
    try { await storageWriteChain; } catch (error) {}
    try { await secretWriteChain; } catch (error) {}
  }

  async function commitAtomicReplacement(nextTracker, nextSecret, { force = false } = {}) {
    const tracker = migrateStateSchema(nextTracker);
    tracker.settings.theme = uiPreferences.theme;
    validateNormalizedBackupIntegrity(tracker);
    const secret = normalizeSecretConfig(nextSecret || secretConfig || defaultSecretConfig());

    if (storageBackend !== 'indexeddb') {
      const previousTracker = localStorage.getItem(STORAGE_KEY);
      const previousSecret = localStorage.getItem(SECRET_POCKET_KEY);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trackerSnapshotForStorage(tracker)));
        localStorage.setItem(SECRET_POCKET_KEY, JSON.stringify(secret));
      } catch (error) {
        try {
          if (previousTracker === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, previousTracker);
          if (previousSecret === null) localStorage.removeItem(SECRET_POCKET_KEY); else localStorage.setItem(SECRET_POCKET_KEY, previousSecret);
        } catch (rollbackError) {}
        throw error;
      }
      state = tracker;
      secretConfig = secret;
      lastCommittedStateSnapshot = cloneStorageValue(state);
      storageHealth = evaluateDataHealth(state);
      return true;
    }

    await waitForStorageQueues();
    const result = await idbCommitAppData({
      tracker: trackerSnapshotForStorage(tracker),
      secret: cloneStorageValue(secret),
      expectedTrackerRevision: storageTrackerRevision,
      expectedSecretRevision: storageSecretRevision,
      force
    });
    storageTrackerRevision = Number(result.trackerRevision || storageTrackerRevision);
    storageSecretRevision = Number(result.secretRevision || storageSecretRevision);
    state = tracker;
    secretConfig = secret;
    lastCommittedStateSnapshot = cloneStorageValue(state);
    storageHealth = evaluateDataHealth(state);
    announceStorageChange('tracker', storageTrackerRevision);
    announceStorageChange('secret', storageSecretRevision);
    try { localStorage.removeItem(EMERGENCY_STORAGE_KEY); } catch (error) {}
    await refreshStorageEstimate();
    return true;
  }

  async function restoreLatestRecoveryPoint() {
    let snapshots = [];
    try {
      snapshots = storageBackend === 'indexeddb' ? await getRecoverySnapshots() : [JSON.parse(localStorage.getItem(EMERGENCY_STORAGE_KEY) || 'null')].filter(Boolean);
    } catch (error) {}
    let latest = null;
    let preview = null;
    for (const candidate of snapshots) {
      if (!candidate?.tracker || candidate.restorable === false) continue;
      try {
        const migrated = migrateStateSchema(candidate.tracker);
        validateNormalizedBackupIntegrity(migrated);
        latest = candidate;
        preview = migrated;
        break;
      } catch (error) { /* Try the next recovery point. */ }
    }
    if (!latest || !preview) return showToast('No healthy recovery point is available yet.');
    const when = new Date(latest.createdAt || Date.now());
    confirmAction('Restore latest recovery point?', `Return Pocket to ${DATE_LABEL.format(when)} at ${TIME_LABEL.format(when)} (${latest.reason || 'recovery point'}). Your current state will be protected first.`, 'Restore recovery', async () => {
      try {
        await waitForStorageQueues();
        await createRecoverySnapshot('Before recovery-point restore');
        uiPreferences.theme = 'dark';
        saveUiPreferences();
        const nextSecret = normalizeSecretConfig(latest.secretPocket || secretConfig);
        nextSecret.remember = false;
        await commitAtomicReplacement(preview, nextSecret);
        try { sessionStorage.removeItem(SECRET_SESSION_KEY); localStorage.removeItem(SECRET_TRUST_KEY); } catch (error) {}
        resetCompanionDataBaseline();
        renderAll();
        setView('home');
        showToast('Recovery point restored. Secret Pocket was locked for safety.');
      } catch (error) {
        console.warn('Recovery restore failed.', error);
        showToast(error instanceof PocketStorageConflictError ? 'Another Pocket tab changed data first. Recovery restore was cancelled safely.' : 'Pocket could not restore that recovery point. Current saved data was kept.');
      }
    });
  }


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
  function hexToBytes(hex) {
    const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
    const bytes = new Uint8Array(Math.ceil(clean.length / 2));
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = parseInt(clean.slice(index * 2, index * 2 + 2).padEnd(2, '0'), 16) || 0;
    return bytes;
  }
  function bytesToHex(bytes) { return Array.from(bytes || [], (value) => value.toString(16).padStart(2, '0')).join(''); }
  async function legacyHashSecretPin(pin, salt) {
    const input=`${salt}:${pin}:PocketSecret`; const seeds=[2166136261,2246822507,3266489909,668265263];
    return seeds.map((seed,lane)=>{ let hash=seed>>>0; for(let round=0;round<2048;round+=1){ for(let i=0;i<input.length;i+=1){ hash ^= input.charCodeAt(i)+lane+round; hash=Math.imul(hash,16777619); hash ^= hash>>>13; } } return (hash>>>0).toString(16).padStart(8,'0'); }).join('');
  }
  async function hashSecretPin(pin, salt) {
    if (!globalThis.crypto?.subtle) return legacyHashSecretPin(pin, salt);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
    return bytesToHex(new Uint8Array(bits));
  }
  async function verifySecretPin(pin) {
    secretConfig ||= loadSecretConfig();
    if (!secretConfig.pinHash || !secretConfig.pinSalt) return pin===DEFAULT_SECRET_PIN;
    if (secretConfig.pinScheme === 'pbkdf2-sha256') return (await hashSecretPin(pin,secretConfig.pinSalt))===secretConfig.pinHash;
    const legacy = await legacyHashSecretPin(pin, secretConfig.pinSalt);
    if (legacy !== secretConfig.pinHash) return false;
    await storeSecretPin(pin);
    return true;
  }
  async function storeSecretPin(pin) {
    secretConfig ||= loadSecretConfig();
    secretConfig.pinSalt=secretRandomSalt();
    secretConfig.pinHash=await hashSecretPin(pin,secretConfig.pinSalt);
    secretConfig.pinScheme=globalThis.crypto?.subtle ? 'pbkdf2-sha256' : 'legacy';
    secretConfig.discovered=true;
    await saveSecretConfig();
  }
  function secretAttemptDelay(attempts) {
    if (attempts >= 7) return 30000;
    if (attempts >= 5) return 15000;
    if (attempts >= 3) return 5000;
    return 0;
  }

  function loadSecretThrottleState() {
    try {
      const raw = JSON.parse(sessionStorage.getItem('pocket-secret-throttle-v1') || 'null');
      if (!raw || typeof raw !== 'object') return;
      secretFailedAttempts = Math.max(secretFailedAttempts, Math.max(0, Number(raw.attempts || 0)));
      secretLockoutUntil = Math.max(secretLockoutUntil, Math.max(0, Number(raw.lockoutUntil || 0)));
    } catch (error) { /* Session throttling is best-effort. */ }
  }

  function saveSecretThrottleState() {
    try {
      if (!secretFailedAttempts && !secretLockoutUntil) sessionStorage.removeItem('pocket-secret-throttle-v1');
      else sessionStorage.setItem('pocket-secret-throttle-v1', JSON.stringify({ attempts: secretFailedAttempts, lockoutUntil: secretLockoutUntil }));
    } catch (error) { /* Session throttling is best-effort. */ }
  }

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
    state.goals.filter((goal) => !goalIsWithdrawn(goal)).forEach((goal) => {
      const target = Math.max(0, Number(goal.target || 0));
      const current = goalCurrent(goal);
      goals[goal.id] = { current, target, percent: target > 0 ? Math.min(100, Math.round(current / target * 100)) : 0 };
    });
    const wallets = {};
    activeAccounts().forEach((account) => { wallets[account.id] = accountBalance(account.id); });
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

  function companionPerformanceMode() {
    return ['auto','full','battery'].includes(secretConfig?.companionPerformance) ? secretConfig.companionPerformance : 'auto';
  }

  function companionPerformanceReduced() {
    const mode = companionPerformanceMode();
    if (mode === 'full') return false;
    if (mode === 'battery') return true;
    return document.visibilityState !== 'visible' || Date.now() - companionLastUserActivityAt > 45000;
  }

  function syncCompanionPerformanceClass() {
    document.body.classList.toggle('companion-low-power', companionIsAvailable() && companionPerformanceReduced());
  }

  function scheduleSecretLightAmbient() {
    window.clearTimeout(secretLightAmbientTimer);
    if (!secretPocketLightActive() || document.querySelector('dialog[open]')) return;
    const reduced = companionPerformanceReduced();
    const delay = companionReducedMotion ? 12000 : reduced ? 15000 + Math.random() * 9000 : 6500 + Math.random() * 4500;
    secretLightAmbientTimer = window.setTimeout(() => {
      if (!secretPocketLightActive()) return;
      syncCompanionPerformanceClass();
      const optionsByView = {
        home: ['heart', 'soft'],
        activity: ['sparkle', 'soft'],
        savings: ['soft', 'heart'],
        more: ['sparkle', 'soft']
      };
      const list = optionsByView[currentView] || ['soft'];
      if (companionPerformanceMode() !== 'battery' || !reduced) {
        emitSecretLightFx(list[Math.floor(Math.random() * list.length)], { count: companionReducedMotion ? 1 : reduced ? 2 : 3, area: 'edges', duration: companionReducedMotion ? 850 : reduced ? 1800 : 2300 });
      }
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

  function toCents(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) : 0;
  }

  function fromCents(cents) {
    return Number(cents || 0) / 100;
  }

  function moneyRound(value) {
    return fromCents(toCents(value));
  }

  function currency(value) {
    const cents = toCents(value);
    return cents % 100 === 0 ? WHOLE_CURRENCY.format(fromCents(cents)) : CURRENCY.format(fromCents(cents));
  }

  function privateCurrency(value) {
    return state?.settings?.privacy ? '₱••••' : currency(value);
  }

  function validDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function activeAccounts(candidate = state) {
    return (candidate?.accounts || []).filter((account) => !account.archivedAt);
  }

  function primaryAccount(candidate = state) {
    return activeAccounts(candidate)[0] || candidate?.accounts?.[0] || null;
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

  function transactionAmount(tx) {
    return moneyRound(tx?.amount || 0);
  }

  function transactionEffectCents(tx, accountId) {
    const amount = toCents(tx?.amount || 0);
    if (!amount && tx?.type !== 'reconciliation') return 0;
    if (tx.type === 'income' && tx.accountId === accountId) return amount;
    if (tx.type === 'expense' && tx.accountId === accountId) return -amount;
    if (tx.type === 'saving' && tx.accountId === accountId) return -amount;
    if (tx.type === 'saving_return' && tx.accountId === accountId) return amount;
    if (tx.type === 'reconciliation' && tx.accountId === accountId) return toCents(tx.amount || 0);
    if (tx.type === 'transfer') {
      if (tx.fromAccountId === accountId) return -amount;
      if (tx.toAccountId === accountId) return amount;
      return 0;
    }
    if (tx.type === 'correction_reversal') {
      if (tx.originalType === 'income' && tx.accountId === accountId) return -amount;
      if (tx.originalType === 'expense' && tx.accountId === accountId) return amount;
      if (tx.originalType === 'saving' && tx.accountId === accountId) return amount;
      if (tx.originalType === 'saving_return' && tx.accountId === accountId) return -amount;
      if (tx.originalType === 'transfer') {
        if (tx.fromAccountId === accountId) return amount;
        if (tx.toAccountId === accountId) return -amount;
      }
      if (tx.originalType === 'reconciliation' && tx.accountId === accountId) return toCents(tx.amount || 0);
    }
    return 0;
  }

  function accountBalanceCentsForState(candidate, accountId) {
    const account = (candidate?.accounts || []).find((item) => item.id === accountId);
    if (!account) return 0;
    return (candidate.transactions || []).reduce((balance, tx) => balance + transactionEffectCents(tx, accountId), toCents(account.openingBalance || 0));
  }

  function stateBalanceProblem(candidate) {
    for (const account of candidate?.accounts || []) {
      if (accountBalanceCentsForState(candidate, account.id) < 0) return account;
    }
    return null;
  }

  function validateCandidateBalances(candidate, message = 'That change would make a wallet balance negative.') {
    const problem = stateBalanceProblem(candidate);
    if (!problem) return true;
    showToast(state.settings.privacy ? message : `${problem.name} does not have enough available money for that change.`);
    return false;
  }

  function isSupersededTransaction(tx) {
    return Boolean(tx?.correctedByGroupId);
  }

  function effectiveTransactions(candidate = state) {
    return (candidate?.transactions || []).filter((tx) => tx.type !== 'correction_reversal' && !isSupersededTransaction(tx));
  }

  function goalLedgerBalanceCents(goalId, candidate = state) {
    const txNet = (candidate?.transactions || []).reduce((sum, tx) => {
      if (tx.goalId !== goalId) return sum;
      if (tx.type === 'saving') return sum + toCents(tx.amount || 0);
      if (tx.type === 'saving_return') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving_return') return sum + toCents(tx.amount || 0);
      return sum;
    }, 0);
    const transferNet = (candidate?.goalTransfers || []).reduce((sum, item) => {
      const amount = toCents(item.amount || 0);
      if (item.toGoalId === goalId) return sum + amount;
      if (item.fromGoalId === goalId) return sum - amount;
      return sum;
    }, 0);
    return txNet + transferNet;
  }

  function goalCurrentCents(goal, candidate = state) {
    if (!goal) return 0;
    return Math.max(0, toCents(goal.openingSaved || 0) + goalLedgerBalanceCents(goal.id, candidate));
  }

  function goalCurrent(goal, candidate = state) {
    return fromCents(goalCurrentCents(goal, candidate));
  }

  function goalIsWithdrawn(goal) { return Boolean(goal?.withdrawnAt || goal?.removedAt); }
  function goalIsArchived(goal) { return Boolean(goal?.archivedAt) && !goalIsWithdrawn(goal); }
  function goalIsActive(goal) { return Boolean(goal) && !goalIsWithdrawn(goal) && !goalIsArchived(goal); }
  function rawGoalCurrentCents(goal, candidate = state) {
    if (!goal) return 0;
    return toCents(goal.openingSaved || 0) + goalLedgerBalanceCents(goal.id, candidate);
  }
  function goalIsComplete(goal, candidate = state) { return rawGoalCurrentCents(goal, candidate) >= toCents(goal?.target || 0); }

  function goalBalanceProblem(candidate) {
    return (candidate?.goals || []).find((goal) => !goalIsWithdrawn(goal) && rawGoalCurrentCents(goal, candidate) < 0) || null;
  }

  function validateCandidateGoals(candidate, message = 'That change would make a savings goal negative.') {
    const problem = goalBalanceProblem(candidate);
    if (!problem) return true;
    showToast(`${problem.name || 'A savings goal'} cannot support that change.`);
    return false;
  }

  function goalMilestoneThresholdsForCurrent(goal, candidate = state) {
    const target = Math.max(1, toCents(goal?.target || 0));
    const current = Math.max(0, rawGoalCurrentCents(goal, candidate));
    const percent = Math.floor((current / target) * 100);
    return [25, 50, 75, 90].filter((threshold) => percent >= threshold);
  }

  function resetGoalMilestoneCycle(goal, newTarget, { recordEvent = true } = {}) {
    if (!goal) return;
    goal.milestoneVersion = Math.max(1, Number(goal.milestoneVersion || 1)) + 1;
    goal.milestoneTarget = moneyRound(newTarget);
    goal.milestones = goalMilestoneThresholdsForCurrent({ ...goal, target: newTarget });
    if (recordEvent) addGoalEvent(goal.id, 'milestone_cycle_reset', { toValue: String(goal.milestoneVersion), note: 'Milestone thresholds recalibrated for the new target' });
  }

  function syncGoalMilestones(eventDate = localDateKey()) {
    if (!state?.goals) return;
    state.goalEvents ||= [];
    const now = new Date().toISOString();
    const thresholds = [25, 50, 75, 90];
    state.goals.forEach((goal) => {
      if (goalIsWithdrawn(goal)) return;
      goal.milestoneVersion = Math.max(1, Number(goal.milestoneVersion || 1));
      goal.milestoneTarget = Math.max(.01, moneyRound(goal.milestoneTarget || goal.target || .01));
      if (toCents(goal.milestoneTarget) !== toCents(goal.target)) {
        resetGoalMilestoneCycle(goal, goal.target, { recordEvent: false });
      }
      goal.milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
      const target = Math.max(1, toCents(goal.target || 0));
      const current = Math.max(0, rawGoalCurrentCents(goal, state));
      const percent = Math.floor((current / target) * 100);
      thresholds.forEach((threshold) => {
        if (percent >= threshold && !goal.milestones.includes(threshold)) {
          goal.milestones.push(threshold);
          state.goalEvents.push(normalizeGoalEvent({ id: uid('goal-event'), goalId: goal.id, type: 'milestone', date: eventDate, toValue: `${threshold}%`, note: `Reached ${threshold}%`, milestoneVersion: goal.milestoneVersion, createdAt: now }));
        }
      });
      const complete = current >= target;
      if (complete && !goal.completedAt) {
        goal.completedAt = now;
        state.goalEvents.push(normalizeGoalEvent({ id: uid('goal-event'), goalId: goal.id, type: 'completed', date: eventDate, note: 'Goal completed through savings progress', milestoneVersion: goal.milestoneVersion, createdAt: now }));
      } else if (!complete && goal.completedAt && !goal.archivedAt) {
        goal.completedAt = undefined;
        state.goalEvents.push(normalizeGoalEvent({ id: uid('goal-event'), goalId: goal.id, type: 'reopened', date: eventDate, note: 'Goal reopened after savings balance changed', milestoneVersion: goal.milestoneVersion, createdAt: now }));
      }
    });
  }

  function goalTransferTimestampMs(item) {
    const parsed = Date.parse(item?.createdAt || '');
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  function canModifyGoalTransfer(item) { return Boolean(item) && !item.correctedByGroupId && (Date.now() - goalTransferTimestampMs(item)) < 24 * 60 * 60 * 1000; }
  function canCorrectGoalTransfer(item) { return Boolean(item) && !item.isReversal && !item.correctedByGroupId && !canModifyGoalTransfer(item); }
  function goalTransferCorrectionMembers(item, candidate = state) {
    if (!item?.correctionGroupId) return [item];
    return (candidate.goalTransfers || []).filter((entry) => entry.correctionGroupId === item.correctionGroupId);
  }

  function effectiveGoalTransfers(candidate = state) {
    return (candidate?.goalTransfers || []).filter((item) => !item.isReversal && !item.correctedByGroupId);
  }

  function goalTransferReversalFor(original, groupId) {
    return { id: uid('goal-transfer'), fromGoalId: original.toGoalId, toGoalId: original.fromGoalId, amount: original.amount, allocations: cloneStateSnapshot(original.allocations || []), date: original.date || localDateKey(), createdAt: new Date().toISOString(), correctionGroupId: groupId, correctsGoalTransferId: original.id, isReversal: true };
  }


  function resetCompanionDataBaseline() {
    secretConfig ||= loadSecretConfig();
    const profile = companionProfileState();
    profile.dataSnapshot = captureCompanionDataSnapshot();
    saveSecretConfig();
    companionSessionBaseline = cloneStateSnapshot(profile.dataSnapshot);
    companionRecentDataLines.length = 0;
    pendingCompanionReaction = null;
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
    return Boolean(tx) && canModifyTransaction(tx) && (['expense','income','transfer','saving'].includes(tx.type) || (tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal'));
  }

  function transactionWindowLabel(tx) {
    return canModifyTransaction(tx) ? 'Editable' : 'Locked';
  }

  function spendableAvailableForEntry(accountId, editingTransactionId = null) {
    let cents = Math.max(0, accountBalanceCentsForState(state, accountId));
    if (editingTransactionId) {
      const original = state.transactions.find((tx) => tx.id === editingTransactionId && tx.type === 'expense');
      if (original && original.accountId === accountId) cents += toCents(original.amount || 0);
    }
    return fromCents(cents);
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
        privacy: false
      },
      accounts: [
        { id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0, isPrimary: true, archivedAt: null }
      ],
      categories: defaultExpenseCategories(),
      goals: [],
      goalEvents: [],
      goalTransfers: [],
      transactions: []
    };
  }

  function defaultExpenseCategories() {
    return DEFAULT_EXPENSE_CATEGORIES.map((item) => ({ ...item }));
  }

  function normalizeCategories(categories) {
    const source = Array.isArray(categories) && categories.length ? categories : defaultExpenseCategories();
    const usedIds = new Set();
    const normalized = source.filter((item) => item && typeof item === 'object').map((item, index) => {
      let id = typeof item.id === 'string' && item.id ? item.id : `cat-${String(item.name || 'category').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || index}`;
      while (usedIds.has(id)) id = `${id}-${index}`;
      usedIds.add(id);
      const fallback = DEFAULT_EXPENSE_CATEGORIES.find((entry) => entry.name.toLowerCase() === String(item.name || '').trim().toLowerCase());
      return {
        id,
        name: String(item.name || fallback?.name || `Category ${index + 1}`).trim().slice(0, 30) || `Category ${index + 1}`,
        icon: CATEGORY_ICONS.has(item.icon) ? item.icon : (fallback?.icon || 'i-more'),
        tone: typeof item.tone === 'string' && item.tone ? item.tone : (fallback?.tone || CATEGORY_TONES[index % CATEGORY_TONES.length]),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        archivedAt: typeof item.archivedAt === 'string' && item.archivedAt ? item.archivedAt : null
      };
    });
    if (!normalized.some((item) => !item.archivedAt)) {
      const fallback = DEFAULT_EXPENSE_CATEGORIES.find((item) => item.id === 'cat-other');
      normalized.push({ ...fallback, order: normalized.length });
    }
    return normalized.sort((a,b) => a.order - b.order).map((item,index) => ({ ...item, order:index }));
  }

  function expenseCategories(candidate = state, includeArchived = false) {
    const list = candidate?.categories || [];
    return list.filter((item) => includeArchived || !item.archivedAt).sort((a,b) => a.order - b.order);
  }

  function categoryRecord(id, name = '', candidate = state) {
    const categories = candidate?.categories || [];
    return categories.find((item) => item.id === id) || categories.find((item) => item.name.toLowerCase() === String(name || '').toLowerCase()) || null;
  }

  function categoryForTransaction(tx, candidate = state) {
    const record = categoryRecord(tx?.categoryId, tx?.category, candidate);
    return record || { id: tx?.categoryId || '', name: tx?.category || 'Other', icon: categoryMeta[tx?.category || 'Other']?.icon || 'i-more', tone: categoryMeta[tx?.category || 'Other']?.tone || 'cat-other-soft' };
  }

  function normalizeGoalEvent(item) {
    if (!item || typeof item !== 'object' || !item.goalId || !item.type) return null;
    const createdAt = Number.isFinite(Date.parse(item.createdAt || '')) ? item.createdAt : new Date().toISOString();
    return {
      id: typeof item.id === 'string' && item.id ? item.id : uid('goal-event'),
      goalId: String(item.goalId),
      type: String(item.type).slice(0, 40),
      date: validDateKey(item.date) ? item.date : localDateKey(new Date(createdAt)),
      fromValue: item.fromValue === undefined ? undefined : String(item.fromValue).slice(0, 80),
      toValue: item.toValue === undefined ? undefined : String(item.toValue).slice(0, 80),
      note: typeof item.note === 'string' ? item.note.slice(0, 120) : '',
      milestoneVersion: Math.max(0, Number(item.milestoneVersion || 0)) || undefined,
      createdAt
    };
  }

  function addGoalEvent(goalId, type, details = {}) {
    state.goalEvents ||= [];
    state.goalEvents.push(normalizeGoalEvent({ id: uid('goal-event'), goalId, type, date: details.date || localDateKey(), fromValue: details.fromValue, toValue: details.toValue, note: details.note || '', milestoneVersion: details.milestoneVersion, createdAt: new Date().toISOString() }));
  }

  function normalizeAccounts(accounts) {
    const source = Array.isArray(accounts) ? accounts : [];
    const normalized = source
      .filter((account) => account && typeof account === 'object')
      .map((account, index) => ({
        id: typeof account.id === 'string' && account.id ? account.id : uid('account'),
        name: String(account.name || (index === 0 ? 'Cash' : 'Wallet')).trim().slice(0, 30) || (index === 0 ? 'Cash' : 'Wallet'),
        type: account.type || (index === 0 ? 'cash' : 'other'),
        openingBalance: Math.max(0, moneyRound(account.openingBalance || 0)),
        isPrimary: index === 0,
        archivedAt: index === 0 ? null : (typeof account.archivedAt === 'string' && account.archivedAt ? account.archivedAt : null)
      }));

    if (!normalized.length) return [{ id: uid('account'), name: 'Cash', type: 'cash', openingBalance: 0, isPrimary: true, archivedAt: null }];
    if (normalized[0].name.toLowerCase() === 'wallet' && normalized[0].type === 'cash') normalized[0].name = 'Cash';
    normalized[0].type = normalized[0].type || 'cash';
    normalized[0].isPrimary = true;
    normalized[0].archivedAt = null;
    normalized.slice(1).forEach((account) => { account.isPrimary = false; });
    return normalized;
  }

  function normalizeTransaction(tx, categories = null) {
    if (!tx || typeof tx !== 'object') return null;
    const knownTypes = new Set(['income', 'expense', 'saving', 'saving_return', 'transfer', 'reconciliation', 'correction_reversal']);
    if (!knownTypes.has(tx.type)) return null;
    const originalType = ['income', 'expense', 'transfer', 'saving', 'saving_return', 'reconciliation'].includes(tx.originalType) ? tx.originalType : undefined;
    const signedAllowed = tx.type === 'reconciliation' || (tx.type === 'correction_reversal' && originalType === 'reconciliation');
    const rawAmount = moneyRound(tx.amount || 0);
    const amount = signedAllowed ? rawAmount : Math.abs(rawAmount);
    if (!signedAllowed && amount <= 0) return null;
    if (signedAllowed && toCents(amount) === 0) return null;
    const date = validDateKey(tx.date) ? tx.date : localDateKey(Number.isFinite(Date.parse(tx.createdAt || '')) ? new Date(tx.createdAt) : new Date());
    let categoryId = typeof tx.categoryId === 'string' ? tx.categoryId : '';
    const categoryName = typeof tx.category === 'string' ? tx.category.slice(0, 40) : '';
    if (tx.type === 'expense' && !categoryId && Array.isArray(categories)) {
      categoryId = categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase())?.id || '';
    }
    return {
      ...tx,
      id: typeof tx.id === 'string' && tx.id ? tx.id : uid('tx'),
      type: tx.type, amount,
      category: categoryName, categoryId,
      accountId: typeof tx.accountId === 'string' ? tx.accountId : '',
      fromAccountId: typeof tx.fromAccountId === 'string' ? tx.fromAccountId : '',
      toAccountId: typeof tx.toAccountId === 'string' ? tx.toAccountId : '',
      goalId: typeof tx.goalId === 'string' ? tx.goalId : '',
      date, note: typeof tx.note === 'string' ? tx.note.slice(0, 120) : '',
      reconciliationReason: typeof tx.reconciliationReason === 'string' ? tx.reconciliationReason.slice(0, 50) : '',
      reconciliationNote: typeof tx.reconciliationNote === 'string' ? tx.reconciliationNote.slice(0, 100) : '',
      createdAt: Number.isFinite(Date.parse(tx.createdAt || '')) ? tx.createdAt : `${date}T12:00:00`,
      updatedAt: Number.isFinite(Date.parse(tx.updatedAt || '')) ? tx.updatedAt : undefined,
      originalType,
      correctionGroupId: typeof tx.correctionGroupId === 'string' ? tx.correctionGroupId : undefined,
      correctsTransactionId: typeof tx.correctsTransactionId === 'string' ? tx.correctsTransactionId : undefined,
      correctedByGroupId: typeof tx.correctedByGroupId === 'string' ? tx.correctedByGroupId : undefined,
      allowanceId: typeof tx.allowanceId === 'string' ? tx.allowanceId : undefined,
      goalLifecycleGroupId: typeof tx.goalLifecycleGroupId === 'string' ? tx.goalLifecycleGroupId : undefined,
      savingsAction: typeof tx.savingsAction === 'string' ? tx.savingsAction.slice(0, 40) : undefined,
      savingsNote: typeof tx.savingsNote === 'string' ? tx.savingsNote.slice(0, 100) : '',
      withdrawalReason: typeof tx.withdrawalReason === 'string' ? tx.withdrawalReason.slice(0, 50) : ''
    };
  }

  function normalizeGoalTransfer(item) {
    if (!item || typeof item !== 'object') return null;
    const amount = Math.max(0, moneyRound(item.amount || 0));
    if (!amount || !item.fromGoalId || !item.toGoalId || item.fromGoalId === item.toGoalId) return null;
    const createdAt = Number.isFinite(Date.parse(item.createdAt || '')) ? item.createdAt : new Date().toISOString();
    const allocations = Array.isArray(item.allocations)
      ? item.allocations.map((allocation) => ({ accountId: String(allocation?.accountId || ''), amount: Math.max(0, moneyRound(allocation?.amount || 0)) })).filter((allocation) => allocation.accountId && allocation.amount > 0)
      : [];
    return {
      ...item, id: typeof item.id === 'string' && item.id ? item.id : uid('goal-transfer'),
      fromGoalId: String(item.fromGoalId), toGoalId: String(item.toGoalId), amount, allocations,
      date: validDateKey(item.date) ? item.date : localDateKey(new Date(createdAt)), createdAt,
      updatedAt: Number.isFinite(Date.parse(item.updatedAt || '')) ? item.updatedAt : undefined,
      correctionGroupId: typeof item.correctionGroupId === 'string' ? item.correctionGroupId : undefined,
      correctsGoalTransferId: typeof item.correctsGoalTransferId === 'string' ? item.correctsGoalTransferId : undefined,
      correctedByGroupId: typeof item.correctedByGroupId === 'string' ? item.correctedByGroupId : undefined,
      isReversal: Boolean(item.isReversal)
    };
  }

  function normalizeGoals(goals, transactions, goalTransfers, accounts = []) {
    const source = Array.isArray(goals) ? goals : [];
    const tempState = { transactions, goalTransfers };
    const primaryId = (accounts.find((account) => account.isPrimary) || accounts[0])?.id || '';
    return source.filter((goal) => goal && typeof goal === 'object').map((goal) => {
      const id = typeof goal.id === 'string' && goal.id ? goal.id : uid('goal');
      const target = Math.max(0.01, moneyRound(goal.target || 0));
      const legacyCurrent = Math.max(0, moneyRound(goal.current || 0));
      const migratedOpening = goal.openingSaved !== undefined
        ? Math.max(0, moneyRound(goal.openingSaved || 0))
        : Math.max(0, fromCents(toCents(legacyCurrent) - goalLedgerBalanceCents(id, tempState)));
      const sourceAllocations = Array.isArray(goal.openingAllocations) ? goal.openingAllocations : [];
      let openingAllocations = sourceAllocations
        .map((item) => ({ accountId: String(item?.accountId || ''), amount: Math.max(0, moneyRound(item?.amount || 0)) }))
        .filter((item) => item.accountId && accounts.some((account) => account.id === item.accountId) && toCents(item.amount) > 0);
      const allocationCents = openingAllocations.reduce((sum, item) => sum + toCents(item.amount || 0), 0);
      if (toCents(migratedOpening) > 0 && allocationCents !== toCents(migratedOpening)) {
        openingAllocations = primaryId ? [{ accountId: primaryId, amount: migratedOpening }] : [];
      }
      const withdrawnAt = Number.isFinite(Date.parse(goal.withdrawnAt || goal.removedAt || '')) ? (goal.withdrawnAt || goal.removedAt) : undefined;
      const currentCentsForMilestones = Math.max(0, toCents(migratedOpening) + goalLedgerBalanceCents(id, tempState));
      const targetCentsForMilestones = Math.max(1, toCents(target));
      const currentPercentForMilestones = Math.floor((currentCentsForMilestones / targetCentsForMilestones) * 100);
      const normalizedMilestones = goal.recalibrateMilestones
        ? [25,50,75,90].filter((threshold) => currentPercentForMilestones >= threshold)
        : (Array.isArray(goal.milestones) ? [...new Set(goal.milestones.map(Number).filter((value) => [25,50,75,90].includes(value)))] : []);
      return {
        id, name: String(goal.name || 'Savings goal').trim().slice(0, 40) || 'Savings goal', target, openingSaved: migratedOpening,
        openingAllocations,
        legacyAttributionPending: Boolean(goal.legacyAttributionPending ?? (toCents(migratedOpening) > 0 && !sourceAllocations.length)),
        createdAt: validDateKey(goal.createdAt) ? goal.createdAt : (Number.isFinite(Date.parse(goal.createdAt || '')) ? localDateKey(new Date(goal.createdAt)) : localDateKey()),
        updatedAt: Number.isFinite(Date.parse(goal.updatedAt || '')) ? goal.updatedAt : undefined,
        completedAt: Number.isFinite(Date.parse(goal.completedAt || '')) ? goal.completedAt : undefined,
        archivedAt: Number.isFinite(Date.parse(goal.archivedAt || '')) ? goal.archivedAt : undefined,
        withdrawnAt, removedAt: withdrawnAt, returnedToWallets: Boolean(goal.returnedToWallets),
        withdrawalGroupId: typeof goal.withdrawalGroupId === 'string' ? goal.withdrawalGroupId : undefined,
        milestoneVersion: Math.max(1, Number(goal.milestoneVersion || 1)),
        milestoneTarget: Math.max(0.01, moneyRound(goal.milestoneTarget || target)),
        milestones: normalizedMilestones
      };
    });
  }

  function migrateSchema1To2(candidate) {
    const next = cloneStorageValue(candidate && typeof candidate === 'object' ? candidate : {});
    next.version = 2;
    next.settings ||= {};
    delete next.allowanceRoutine;
    delete next.allowancePlans;
    return next;
  }

  function migrateSchema2To3(candidate) {
    const next = cloneStorageValue(candidate && typeof candidate === 'object' ? candidate : {});
    next.version = 3;
    next.settings ||= {};
    delete next.settings.demoData;
    delete next.checkins;
    delete next.allowanceRoutine;
    delete next.allowancePlans;
    return next;
  }

  function migrateSchema3To4(candidate) {
    const next = cloneStorageValue(candidate && typeof candidate === 'object' ? candidate : {});
    next.version = 4;
    next.categories = normalizeCategories(next.categories);
    next.goalEvents = Array.isArray(next.goalEvents) ? next.goalEvents : [];
    next.goals = (next.goals || []).map((goal) => ({ ...goal, withdrawnAt: goal.withdrawnAt || goal.removedAt || undefined }));
    next.transactions = (next.transactions || []).map((tx) => {
      if (tx.type !== 'expense' || tx.categoryId) return tx;
      const cat = next.categories.find((item) => item.name.toLowerCase() === String(tx.category || '').toLowerCase());
      return { ...tx, categoryId: cat?.id || 'cat-other' };
    });
    return next;
  }

  function migrateSchema4To5(candidate) {
    const next = cloneStorageValue(candidate && typeof candidate === 'object' ? candidate : {});
    next.version = 5;
    const accounts = Array.isArray(next.accounts) ? next.accounts : [];
    const primaryId = (accounts.find((account) => account?.isPrimary) || accounts[0])?.id || '';
    next.goals = (next.goals || []).map((goal) => {
      const opening = Math.max(0, moneyRound(goal?.openingSaved || 0));
      const hadAllocations = Array.isArray(goal?.openingAllocations) && goal.openingAllocations.length > 0;
      return {
        ...goal,
        openingAllocations: hadAllocations ? goal.openingAllocations : (opening > 0 && primaryId ? [{ accountId: primaryId, amount: opening }] : []),
        legacyAttributionPending: Boolean(goal?.legacyAttributionPending ?? (opening > 0 && !hadAllocations)),
        milestoneVersion: Math.max(1, Number(goal?.milestoneVersion || 1)),
        milestoneTarget: Math.max(.01, moneyRound(goal?.milestoneTarget || goal?.target || .01)),
        recalibrateMilestones: true
      };
    });
    next.transactions = (next.transactions || []).map((tx) => ({ ...tx, savingsNote: typeof tx?.savingsNote === 'string' ? tx.savingsNote : '' }));
    return next;
  }

  function normalizeState(candidate) {
    if (!candidate || typeof candidate !== 'object') return seedState();
    const accounts = normalizeAccounts(candidate.accounts);
    const categories = normalizeCategories(candidate.categories);
    const transactions = (Array.isArray(candidate.transactions) ? candidate.transactions : []).map((tx) => normalizeTransaction(tx, categories)).filter(Boolean);
    const goalTransfers = (Array.isArray(candidate.goalTransfers) ? candidate.goalTransfers : []).map(normalizeGoalTransfer).filter(Boolean);
    const goals = normalizeGoals(candidate.goals, transactions, goalTransfers, accounts);
    const goalEvents = (Array.isArray(candidate.goalEvents) ? candidate.goalEvents : []).map(normalizeGoalEvent).filter(Boolean);
    return {
      version: SCHEMA_VERSION,
      settings: { theme: candidate.settings?.theme === 'light' ? 'light' : 'dark', privacy: Boolean(candidate.settings?.privacy) },
      accounts, categories, goals, goalEvents, goalTransfers, transactions
    };
  }

  function migrateStateSchema(candidate) {
    if (!candidate || typeof candidate !== 'object') return seedState();
    let working = cloneStorageValue(candidate);
    let version = Math.max(1, Number(working.version || 1));
    if (version > SCHEMA_VERSION) throw new Error('This Pocket data was created by a newer schema.');
    while (version < SCHEMA_VERSION) {
      if (version === 1) working = migrateSchema1To2(working);
      else if (version === 2) working = migrateSchema2To3(working);
      else if (version === 3) working = migrateSchema3To4(working);
      else if (version === 4) working = migrateSchema4To5(working);
      else throw new Error(`No migration path exists from Pocket schema ${version}.`);
      version = Number(working.version || version + 1);
    }
    return normalizeState(working);
  }

  function legacyLocalTracker() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function legacyLocalSecret() {
    try {
      const raw = localStorage.getItem(SECRET_POCKET_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  async function initializeIndexedDbRecords(tracker, secret, { force = true } = {}) {
    const result = await idbCommitAppData({
      tracker: trackerSnapshotForStorage(tracker),
      secret: normalizeSecretConfig(secret),
      expectedTrackerRevision: storageTrackerRevision,
      expectedSecretRevision: storageSecretRevision,
      force
    });
    storageTrackerRevision = Number(result.trackerRevision || 0);
    storageSecretRevision = Number(result.secretRevision || 0);
  }

  async function recoverHealthySnapshot(snapshots, fallbackSecret) {
    for (const snapshot of snapshots || []) {
      try {
        const tracker = migrateStateSchema(snapshot?.tracker);
        tracker.settings.theme = uiPreferences.theme;
        validateNormalizedBackupIntegrity(tracker);
        return { tracker, secretPocket: normalizeSecretConfig(snapshot?.secretPocket || fallbackSecret), snapshot };
      } catch (error) { /* Try the next recovery point. */ }
    }
    return null;
  }

  async function bootstrapPocketStorage() {
    const prefs = loadUiPreferences();
    uiPreferences = prefs.value;
    ensureStorageChannel();

    if (!('indexedDB' in window)) {
      storageBackend = 'localstorage';
      storageDurability = 'fallback';
      secretConfig = normalizeSecretConfig(legacyLocalSecret());
      const raw = legacyLocalTracker();
      let tracker;
      try { tracker = migrateStateSchema(raw || seedState()); validateNormalizedBackupIntegrity(tracker); }
      catch (error) { tracker = seedState(); bootStorageMessage = 'Pocket started with fresh data because compatibility storage could not be validated.'; }
      if (!prefs.stored) {
        uiPreferences.theme = raw?.settings?.theme === 'light' && isSecretPocketUnlocked() ? 'light' : 'dark';
        saveUiPreferences();
      }
      tracker.settings.theme = uiPreferences.theme;
      state = tracker;
      lastCommittedStateSnapshot = cloneStorageValue(state);
      storageHealth = evaluateDataHealth(state);
      storageReady = true;
      return state;
    }

    try {
      storageDb = await openPocketDatabase();
      storageBackend = 'indexeddb';
      const [trackerRecord, secretRecord, recoveryRecord] = await Promise.all([
        idbGetRecord(DB_TRACKER_KEY), idbGetRecord(DB_SECRET_KEY), idbGetRecord(DB_RECOVERY_KEY)
      ]);
      storageTrackerRevision = Number(trackerRecord?.revision || 0);
      storageSecretRevision = Number(secretRecord?.revision || 0);
      const recoverySnapshots = Array.isArray(recoveryRecord?.snapshots) ? recoveryRecord.snapshots : [];
      lastRecoveryAt = recoverySnapshots.filter((item) => item?.restorable !== false).reduce((max, item) => Math.max(max, Date.parse(item?.createdAt || '') || 0), 0);

      let rawTracker = trackerRecord?.data || null;
      let rawSecret = secretRecord?.data || null;
      let migratedLegacy = false;
      let recoveredEmergency = false;
      const legacyTracker = legacyLocalTracker();
      const legacySecret = legacyLocalSecret();

      if (!rawTracker && legacyTracker) { rawTracker = legacyTracker; migratedLegacy = true; }
      if (!rawSecret && legacySecret) { rawSecret = legacySecret; migratedLegacy = true; }

      try {
        const emergency = JSON.parse(localStorage.getItem(EMERGENCY_STORAGE_KEY) || 'null');
        const emergencyAt = Date.parse(emergency?.createdAt || '') || 0;
        const storedAt = Date.parse(trackerRecord?.updatedAt || '') || 0;
        if (emergency?.tracker && (!trackerRecord || emergencyAt > storedAt)) {
          const candidate = migrateStateSchema(emergency.tracker);
          validateNormalizedBackupIntegrity(candidate);
          rawTracker = emergency.tracker;
          rawSecret = emergency.secretPocket || rawSecret;
          bootStorageMessage = 'Pocket recovered a newer emergency copy after an earlier storage write problem.';
          recoveredEmergency = true;
        }
      } catch (error) { /* Ignore an invalid or stale emergency copy. */ }

      rawTracker ||= seedState();
      rawSecret ||= defaultSecretConfig();
      secretConfig = normalizeSecretConfig(rawSecret);

      if (!prefs.stored) {
        uiPreferences.theme = rawTracker?.settings?.theme === 'light' && isSecretPocketUnlocked() ? 'light' : 'dark';
        saveUiPreferences();
      }

      let tracker = null;
      let needsCommit = !trackerRecord || !secretRecord || migratedLegacy || recoveredEmergency || Number(rawTracker?.version || 1) !== SCHEMA_VERSION;
      try {
        tracker = migrateStateSchema(rawTracker);
        tracker.settings.theme = uiPreferences.theme;
        validateNormalizedBackupIntegrity(tracker);
      } catch (error) {
        console.warn('Stored Pocket data failed integrity validation.', error);
        try {
          await storeRecoverySnapshot({
            id: `recovery-corrupt-${Date.now().toString(36)}`,
            createdAt: new Date().toISOString(),
            reason: 'Stored data before automatic integrity recovery',
            schemaVersion: Number(rawTracker?.version || 1),
            restorable: false,
            tracker: cloneStorageValue(rawTracker),
            secretPocket: cloneStorageValue(rawSecret)
          });
        } catch (snapshotError) {}
        const recovered = await recoverHealthySnapshot(recoverySnapshots, rawSecret);
        if (recovered) {
          tracker = recovered.tracker;
          secretConfig = recovered.secretPocket;
          bootStorageMessage = `Pocket restored a healthy recovery point from ${DATE_LABEL.format(new Date(recovered.snapshot.createdAt))}.`;
          needsCommit = true;
        } else {
          tracker = seedState();
          tracker.settings.theme = uiPreferences.theme;
          bootStorageMessage = 'Pocket isolated invalid stored data and opened a fresh tracker. The previous raw copy was kept as a recovery point.';
          needsCommit = true;
        }
      }

      if (needsCommit) {
        if (migratedLegacy || recoveredEmergency || Number(rawTracker?.version || 1) !== SCHEMA_VERSION) {
          try {
            await storeRecoverySnapshot({
              id: `recovery-migration-${Date.now().toString(36)}`,
              createdAt: new Date().toISOString(),
              reason: migratedLegacy ? 'Before IndexedDB migration' : recoveredEmergency ? 'Emergency copy before recovery commit' : `Before schema ${SCHEMA_VERSION} migration`,
              schemaVersion: Number(rawTracker?.version || 1),
              tracker: cloneStorageValue(rawTracker),
              secretPocket: cloneStorageValue(rawSecret)
            });
          } catch (error) { console.warn('Migration recovery point could not be saved.', error); }
        }
        await initializeIndexedDbRecords(tracker, secretConfig, { force: true });
      }

      state = tracker;
      lastCommittedStateSnapshot = cloneStorageValue(state);
      storageHealth = evaluateDataHealth(state);
      storageReady = true;

      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SECRET_POCKET_KEY);
        if (recoveredEmergency) localStorage.removeItem(EMERGENCY_STORAGE_KEY);
      } catch (error) { /* Legacy cleanup is best-effort. */ }

      await refreshStorageEstimate();
      return state;
    } catch (error) {
      console.error('IndexedDB initialization failed; using compatibility storage.', error);
      storageDb = null;
      storageBackend = 'localstorage';
      storageDurability = 'fallback';
      secretConfig = normalizeSecretConfig(legacyLocalSecret());
      let tracker;
      const raw = legacyLocalTracker();
      try { tracker = migrateStateSchema(raw || seedState()); validateNormalizedBackupIntegrity(tracker); }
      catch (loadError) { tracker = seedState(); }
      tracker.settings.theme = uiPreferences.theme;
      state = tracker;
      lastCommittedStateSnapshot = cloneStorageValue(state);
      storageHealth = evaluateDataHealth(state);
      storageReady = true;
      bootStorageMessage = 'IndexedDB was unavailable, so Pocket is using compatibility storage. Keep regular backups.';
      return state;
    }
  }


  function accountBalance(accountId) {
    return fromCents(accountBalanceCentsForState(state, accountId));
  }

  function walletSavingsCentsForState(candidate, accountId) {
    const primaryId = primaryAccount(candidate)?.id || '';
    let cents = (candidate?.transactions || []).reduce((sum, tx) => {
      if (tx.accountId !== accountId) return sum;
      if (tx.type === 'saving') return sum + toCents(tx.amount || 0);
      if (tx.type === 'saving_return') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving_return') return sum + toCents(tx.amount || 0);
      return sum;
    }, 0);
    cents += (candidate?.goals || []).reduce((sum, goal) => sum + goalOpeningAllocationCents(goal, accountId, candidate), 0);
    return Math.max(0, cents);
  }

  function walletSavingsBalance(accountId) {
    return fromCents(walletSavingsCentsForState(state, accountId));
  }

  function goalOpeningAllocationCents(goal, accountId, candidate = state) {
    if (!goal || !accountId) return 0;
    const allocations = Array.isArray(goal.openingAllocations) ? goal.openingAllocations : [];
    if (allocations.length) return allocations.filter((item) => item.accountId === accountId).reduce((sum, item) => sum + toCents(item.amount || 0), 0);
    const primaryId = primaryAccount(candidate)?.id || '';
    return accountId === primaryId ? toCents(goal.openingSaved || 0) : 0;
  }

  function rawGoalWalletSavingsCents(goalId, accountId, candidate = state) {
    const goal = (candidate?.goals || []).find((item) => item.id === goalId);
    if (!goal || !accountId) return 0;
    let cents = (candidate.transactions || []).reduce((sum, tx) => {
      if (tx.goalId !== goal.id || tx.accountId !== accountId) return sum;
      if (tx.type === 'saving') return sum + toCents(tx.amount || 0);
      if (tx.type === 'saving_return') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving') return sum - toCents(tx.amount || 0);
      if (tx.type === 'correction_reversal' && tx.originalType === 'saving_return') return sum + toCents(tx.amount || 0);
      return sum;
    }, 0);
    cents += (candidate.goalTransfers || []).reduce((sum, item) => {
      const allocation = (Array.isArray(item.allocations) ? item.allocations : []).filter((entry) => entry.accountId === accountId).reduce((value, entry) => value + toCents(entry.amount || 0), 0);
      if (item.toGoalId === goal.id) return sum + allocation;
      if (item.fromGoalId === goal.id) return sum - allocation;
      return sum;
    }, 0);
    return cents + goalOpeningAllocationCents(goal, accountId, candidate);
  }

  function savingsProvenanceProblem(candidate) {
    const accounts = candidate?.accounts || [];
    for (const goal of candidate?.goals || []) {
      if (goalIsWithdrawn(goal)) continue;
      let attributed = 0;
      for (const account of accounts) {
        const cents = rawGoalWalletSavingsCents(goal.id, account.id, candidate);
        if (cents < 0) return { goal, account, cents, kind: 'negative' };
        attributed += cents;
      }
      const actual = rawGoalCurrentCents(goal, candidate);
      if (attributed !== actual) return { goal, account: null, cents: attributed - actual, kind: 'mismatch' };
    }
    return null;
  }

  function validateCandidateSavingsProvenance(candidate, message = 'That change would break the wallet source of this savings.') {
    const problem = savingsProvenanceProblem(candidate);
    if (!problem) return true;
    if (problem.kind === 'negative' && problem.account) showToast(`${problem.goal.name} no longer has enough savings attributed to ${problem.account.name} for that change.`);
    else showToast(message);
    return false;
  }

  function goalWalletSavings(goal, accountId, candidate = state) {
    return fromCents(Math.max(0, rawGoalWalletSavingsCents(goal?.id, accountId, candidate)));
  }

  function goalWalletBreakdown(goal) {
    return state.accounts
      .map((account) => ({ account, amount: goalWalletSavings(goal, account.id) }))
      .filter((item) => toCents(item.amount) > 0);
  }

  function totalBalance() {
    return fromCents(activeAccounts().reduce((total, account) => total + accountBalanceCentsForState(state, account.id), 0));
  }

  function totalSavings() {
    return fromCents(state.goals.filter((goal) => !goalIsWithdrawn(goal)).reduce((total, goal) => total + goalCurrentCents(goal), 0));
  }

  function transactionsForDate(dateKey) {
    return state.transactions.filter((tx) => tx.date === dateKey);
  }

  function sumTransactions(type, startDate, endDate) {
    const cents = effectiveTransactions()
      .filter((tx) => tx.type === type && tx.date >= startDate && tx.date <= endDate)
      .reduce((sum, tx) => sum + toCents(tx.amount || 0), 0);
    return fromCents(cents);
  }

  function monthRange() {
    const now = new Date();
    return {
      start: localDateKey(new Date(now.getFullYear(), now.getMonth(), 1, 12)),
      end: localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0, 12))
    };
  }


  function canCorrectTransaction(tx) {
    if (!tx || canModifyTransaction(tx) || tx.correctedByGroupId) return false;
    if (['expense', 'income', 'transfer', 'reconciliation'].includes(tx.type)) return true;
    if (tx.type === 'saving' && tx.goalId) return Boolean(state.goals.find((item) => item.id === tx.goalId && goalIsActive(item)));
    if (tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal' && tx.goalId) return Boolean(state.goals.find((item) => item.id === tx.goalId && goalIsActive(item)));
    return false;
  }

  function transactionTitle(tx) {
    if (tx.correctsTransactionId && tx.type !== 'correction_reversal') {
      if (tx.type === 'income') return 'Corrected allowance';
      if (tx.type === 'transfer') return 'Corrected wallet transfer';
      if (tx.type === 'saving') return `Corrected savings · ${tx.note || 'Savings goal'}`;
      if (tx.type === 'saving_return') return `Corrected savings withdrawal · ${tx.note || 'Savings goal'}`;
      if (tx.type === 'expense') return `Corrected · ${tx.note || tx.category || 'Expense'}`;
    }
    if (tx.type === 'goal_transfer') {
      const destination = state.goals.find((goal) => goal.id === tx.toGoalId)?.name || 'goal';
      if (tx.isReversal) return 'Savings transfer correction reversal';
      if (tx.correctsGoalTransferId) return `Corrected savings transfer to ${destination}`;
      return `Savings transfer to ${destination}`;
    }
    if (tx.type === 'correction_reversal') return `Correction reversal · ${tx.originalType || 'transaction'}`;
    if (tx.type === 'reconciliation') return tx.reconciliationReason || tx.note || 'Wallet balance reconciliation';
    if (tx.type === 'income') return tx.note || 'Allowance received';
    if (tx.type === 'saving') return tx.note || 'Moved to savings';
    if (tx.type === 'saving_return') return tx.savingsAction === 'partial_withdrawal' ? (tx.note || 'Savings withdrawn') : (tx.note || 'Savings returned');
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
    if (tx.type === 'goal_transfer') {
      const from = state.goals.find((goal) => goal.id === tx.fromGoalId)?.name || 'Goal';
      const to = state.goals.find((goal) => goal.id === tx.toGoalId)?.name || 'Goal';
      return withTiming(`${from} → ${to}`);
    }
    if (tx.type === 'correction_reversal') return withTiming(`Audit reversal of ${tx.originalType || 'transaction'}`);
    if (tx.type === 'reconciliation') return withTiming(`${tx.reconciliationReason || 'Balance adjustment'} · ${account}${tx.reconciliationNote ? ` · ${tx.reconciliationNote}` : ''}`);
    if (tx.type === 'saving') return withTiming(`Saved from ${account}${tx.savingsNote ? ` · ${tx.savingsNote}` : ''}`);
    if (tx.type === 'saving_return') return withTiming(`${tx.savingsAction === 'partial_withdrawal' ? 'Withdrawn to' : 'Returned to'} ${account}${tx.withdrawalReason ? ` · ${tx.withdrawalReason}` : ''}${tx.savingsNote ? ` · ${tx.savingsNote}` : ''}`);
    if (tx.type === 'transfer') {
      const from = state.accounts.find((item) => item.id === tx.fromAccountId)?.name || 'Wallet';
      const to = state.accounts.find((item) => item.id === tx.toAccountId)?.name || 'Wallet';
      return withTiming(`${from} → ${to}`);
    }
    if (tx.type === 'income') return withTiming(`Allowance · ${account}`);
    return withTiming(`${tx.category || 'Other'} · ${account}`);
  }

  function renderTransactionActions(tx) {
    if (tx.type === 'goal_transfer') {
      const source = state.goalTransfers.find((item) => item.id === (tx.sourceGoalTransferId || tx.id.replace(/^activity-/, '')));
      if (!source || source.isReversal) return `<div class="transaction-actions is-locked"><span class="transaction-lock-icon" aria-label="Audit record">${icon('i-lock')}</span></div>`;
      if (source.correctedByGroupId) return `<div class="transaction-actions is-locked"><span class="status-pill neutral">Corrected</span></div>`;
      if (canModifyGoalTransfer(source)) return `<div class="transaction-actions"><div class="transaction-actions-row"><button class="transaction-action" type="button" data-action="edit-goal-transfer" data-id="${escapeHtml(source.id)}">${icon('i-edit')} Edit</button><button class="transaction-action undo" type="button" data-action="undo-goal-transfer" data-id="${escapeHtml(source.id)}">${icon('i-refresh')} Undo</button></div></div>`;
      if (canCorrectGoalTransfer(source)) return `<div class="transaction-actions"><button class="transaction-action" type="button" data-action="correct-goal-transfer" data-id="${escapeHtml(source.id)}">${icon('i-edit')} Correct</button></div>`;
      return `<div class="transaction-actions is-locked"><span class="transaction-lock-icon" aria-label="Locked">${icon('i-lock')}</span></div>`;
    }
    if (tx.type === 'correction_reversal' || (tx.type === 'saving_return' && tx.savingsAction !== 'partial_withdrawal')) {
      return `<div class="transaction-actions is-locked"><span class="transaction-lock-icon" aria-label="Audit record">${icon('i-lock')}</span></div>`;
    }
    if (tx.correctedByGroupId) {
      return `<div class="transaction-actions is-locked"><span class="status-pill neutral">Corrected</span></div>`;
    }
    if (!canModifyTransaction(tx)) {
      if (canCorrectTransaction(tx)) {
        return `<div class="transaction-actions"><div class="transaction-actions-row"><button class="transaction-action" type="button" data-action="correct-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')} Correct</button></div></div>`;
      }
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
      let categoryKey = tx.type === 'income' ? 'Allowance' : tx.type === 'saving_return' ? 'Savings return' : tx.type === 'saving' || tx.type === 'goal_transfer' ? 'Savings' : tx.type === 'transfer' ? 'Transfer' : tx.type === 'reconciliation' ? 'Reconciliation' : tx.type === 'correction_reversal' ? 'Correction' : (tx.category || 'Other');
      const expenseMeta = tx.type === 'expense' ? categoryForTransaction(tx) : null;
      const meta = expenseMeta ? { icon: expenseMeta.icon || 'i-more', tone: expenseMeta.tone || 'cat-other-soft' } : (categoryMeta[categoryKey] || categoryMeta.Other);
      let shownAmount = Math.abs(transactionAmount(tx));
      let sign = '';
      if (tx.type === 'expense') sign = '−';
      else if (tx.type === 'income' || tx.type === 'saving_return') sign = '+';
      else if (tx.type === 'reconciliation') sign = Number(tx.amount || 0) >= 0 ? '+' : '−';
      else if (tx.type === 'correction_reversal') sign = tx.originalType === 'income' ? '−' : ['expense', 'saving'].includes(tx.originalType) ? '+' : '↺ ';
      const amountLabel = state.settings.privacy ? '₱••••' : `${sign}${currency(shownAmount)}`;
      const amountKind = tx.type === 'goal_transfer' ? 'goal transfer' : tx.type === 'correction_reversal' ? 'audit' : tx.type === 'reconciliation' ? 'adjustment' : tx.type === 'saving_return' ? 'returned' : tx.type === 'saving' ? 'saved' : tx.type;
      const actionMarkup = full ? renderTransactionActions(tx) : '';
      const actionClass = actionMarkup ? ' has-actions' : '';
      const correctedClass = tx.correctedByGroupId ? ' is-corrected' : '';
      return `
        <div class="transaction-row ${escapeHtml(tx.type)}${actionClass}${correctedClass}" data-transaction-id="${escapeHtml(tx.id)}">
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
    const accounts = activeAccounts();
    return accounts[walletModeIndex] || accounts[0] || null;
  }

  function walletExpenseSummary(accountId, startDate, endDate) {
    const expenses = effectiveTransactions().filter((tx) => tx.type === 'expense' && tx.accountId === accountId && tx.date >= startDate && tx.date <= endDate);
    const spentCents = expenses.reduce((sum, tx) => sum + toCents(tx.amount || 0), 0);
    const categories = expenses.reduce((map, tx) => {
      const name = tx.category || 'Other';
      map[name] = (map[name] || 0) + toCents(tx.amount || 0);
      return map;
    }, {});
    const topCents = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || null;
    const top = topCents ? [topCents[0], fromCents(topCents[1])] : null;
    return { expenses, spent: fromCents(spentCents), top };
  }

  function expenseCategoryClass(category) {
    const key = String(category || 'Other').toLowerCase();
    if (key === 'food') return 'expense-cat-food';
    if (key === 'transport') return 'expense-cat-transport';
    if (key === 'school') return 'expense-cat-school';
    if (key === 'load') return 'expense-cat-load';
    if (key === 'personal') return 'expense-cat-personal';
    if (key === 'other') return 'expense-cat-other';
    const record = categoryRecord('', category);
    const palette = ['expense-cat-food','expense-cat-transport','expense-cat-school','expense-cat-load','expense-cat-personal','expense-cat-other'];
    return record ? palette[Math.max(0, Number(record.order || 0)) % palette.length] : 'expense-cat-other';
  }

  function expenseCategoryBreakdown(summary) {
    if (!summary?.spent) return [];
    const spentCents = Math.max(1, toCents(summary.spent));
    const totals = summary.expenses.reduce((map, tx) => {
      const name = tx.category || 'Other';
      map[name] = (map[name] || 0) + toCents(tx.amount || 0);
      return map;
    }, {});
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([category, cents]) => ({ category, amount: fromCents(cents), percent: (cents / spentCents) * 100 }));
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
    const account = activeAccounts()[index];
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
    const count = activeAccounts().length;
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
    const accounts = activeAccounts();
    walletModeIndex = Math.max(0, Math.min(walletModeIndex, Math.max(0, accounts.length - 1)));
    const today = localDateKey();

    els.walletCarousel.innerHTML = accounts.map((account, index) => {
      const balance = state.settings.privacy ? '₱••••' : currency(accountBalance(account.id));
      const savings = state.settings.privacy ? '₱••••' : currency(walletSavingsBalance(account.id));
      const todaySpent = fromCents(effectiveTransactions()
        .filter((tx) => tx.type === 'expense' && tx.accountId === account.id && tx.date === today)
        .reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
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

  function activityLedgerEntriesForDate(dateKey) {
    const transactions = state.transactions
      .filter((tx) => tx.date === dateKey)
      .map((tx) => ({ ...tx }));
    const goalTransfers = state.goalTransfers
      .filter((item) => (item.date || localDateKey(new Date(item.createdAt || Date.now()))) === dateKey)
      .map((item) => ({ ...item, id: `activity-${item.id}`, sourceGoalTransferId: item.id, type: 'goal_transfer', date: item.date || dateKey }));
    return [...transactions, ...goalTransfers].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  }

  function activityFilterMatches(tx, type) {
    if (type === 'all') return true;
    if (type === 'income') return tx.type === 'income';
    if (type === 'expense') return tx.type === 'expense';
    if (type === 'transfer') return tx.type === 'transfer';
    if (type === 'savings') return ['saving', 'saving_return', 'goal_transfer'].includes(tx.type);
    if (type === 'correction') return ['correction_reversal', 'reconciliation'].includes(tx.type) || Boolean(tx.correctsTransactionId) || Boolean(tx.correctedByGroupId) || (tx.type === 'goal_transfer' && (tx.isReversal || tx.correctsGoalTransferId));
    return tx.type === type;
  }

  function filteredActivity() {
    const type = els.activityType.value;
    return activityLedgerEntriesForDate(activityDate).filter((tx) => activityFilterMatches(tx, type));
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

    els.monthSpent.textContent = privateCurrency(sumTransactions('expense', activityDate, activityDate));
    els.monthTransferred.textContent = privateCurrency(sumTransactions('transfer', activityDate, activityDate));
    const filtered = filteredActivity();
    els.activityCount.textContent = `${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}`;
    els.allTransactions.innerHTML = renderTransactionRows(filtered, true, {
      emptyTitle: 'No activity for this day',
      emptyCopy: 'Income, expenses, savings, transfers, and corrections will appear here.'
    });
    const hasActivity = state.transactions.length > 0 || state.goalTransfers.length > 0;
    els.activitySwipeHint.classList.toggle('is-hidden', !hasActivity);
  }

  function savingsMonthStats() {
    const range = monthRange();
    const effective = effectiveTransactions().filter((tx) => tx.date >= range.start && tx.date <= range.end);
    const newSavedCents = effective.filter((tx) => tx.type === 'saving' && tx.savingsAction !== 'lifecycle_restore').reduce((sum, tx) => sum + toCents(tx.amount || 0), 0);
    return { newSaved: fromCents(newSavedCents) };
  }

  function savingsGoalsPerPage() {
    if (window.innerWidth <= 820) return 1;
    if (window.innerWidth <= 1180) return 2;
    return 3;
  }

  function changeSavingsGoalPage(delta) {
    const goals = state.goals.filter((goal) => goalIsActive(goal));
    const pageSize = savingsGoalsPerPage();
    const pages = Math.max(1, Math.ceil(goals.length / pageSize));
    savingsGoalPage = Math.max(0, Math.min(pages - 1, savingsGoalPage + delta));
    renderSavings();
  }

  function recentSavingsActivityItems() {
    const accountId = savingsMode === 'wallet' ? (activeAccounts()[savingsWalletIndex]?.id || '') : '';
    const txItems = effectiveTransactions()
      .filter((tx) => {
        if (!['saving', 'saving_return'].includes(tx.type)) return false;
        if (!accountId) return true;
        return tx.accountId === accountId;
      })
      .map((tx) => ({
        kind: tx.type,
        date: tx.date || localDateKey(),
        createdAt: tx.createdAt || `${tx.date || localDateKey()}T12:00:00`,
        amount: Number(tx.amount || 0),
        goalId: tx.goalId,
        accountId: tx.accountId,
        note: tx.savingsNote || tx.note || ''
      }));
    const transferItems = effectiveGoalTransfers()
      .filter((transfer) => {
        if (!accountId) return true;
        return (transfer.allocations || []).some((item) => item.accountId === accountId && toCents(item.amount || 0) > 0);
      })
      .map((transfer) => ({
        kind: 'goal_transfer',
        date: transfer.date || localDateKey(),
        createdAt: transfer.createdAt || `${transfer.date || localDateKey()}T12:00:00`,
        amount: Number(transfer.amount || 0),
        fromGoalId: transfer.fromGoalId,
        toGoalId: transfer.toGoalId
      }));
    return [...txItems, ...transferItems].sort((a, b) => {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
      return dateCompare || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function renderSavingsRecentActivity() {
    if (!els.savingsRecentPanel || !els.savingsRecentActivity) return;
    const items = recentSavingsActivityItems();
    const limit = window.innerWidth <= 820 ? 2 : 3;
    const visible = items.slice(0, limit);
    els.savingsRecentPanel.classList.toggle('is-empty', visible.length === 0);
    if (!visible.length) {
      els.savingsRecentActivity.innerHTML = '<div class="savings-recent-empty">Your latest contributions, withdrawals, and goal transfers will appear here.</div>';
      return;
    }
    els.savingsRecentActivity.innerHTML = visible.map((item) => {
      const dateLabel = validDateKey(item.date) ? DATE_LABEL.format(fromDateKey(item.date)) : 'Recent';
      let title = 'Savings activity';
      let meta = dateLabel;
      let amount = '';
      let tone = 'green-soft';
      if (item.kind === 'saving') {
        const goal = state.goals.find((goal) => goal.id === item.goalId);
        const account = state.accounts.find((account) => account.id === item.accountId);
        title = goal ? `Saved to ${goal.name}` : 'Added to savings';
        meta = [account?.name, dateLabel].filter(Boolean).join(' · ');
        amount = `+${privateCurrency(item.amount)}`;
      } else if (item.kind === 'saving_return') {
        const goal = state.goals.find((goal) => goal.id === item.goalId);
        const account = state.accounts.find((account) => account.id === item.accountId);
        title = goal ? `From ${goal.name}` : 'Savings withdrawn';
        meta = [account?.name, dateLabel].filter(Boolean).join(' · ');
        amount = `−${privateCurrency(item.amount)}`;
        tone = 'neutral-soft';
      } else {
        const fromGoal = state.goals.find((goal) => goal.id === item.fromGoalId)?.name || 'Goal';
        const toGoal = state.goals.find((goal) => goal.id === item.toGoalId)?.name || 'Goal';
        title = `${fromGoal} → ${toGoal}`;
        meta = `Goal transfer · ${dateLabel}`;
        amount = privateCurrency(item.amount);
        tone = 'accent-soft';
      }
      return `<div class="savings-recent-row"><span class="round-icon ${tone}">${icon(item.kind === 'goal_transfer' ? 'i-transfer' : item.kind === 'saving_return' ? 'i-arrow-up' : 'i-download')}</span><div class="savings-recent-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></div><strong class="savings-recent-amount money-value">${escapeHtml(amount)}</strong></div>`;
    }).join('');
  }

  function renderSavings() {
    const accounts = activeAccounts();
    savingsWalletIndex = Math.max(0, Math.min(savingsWalletIndex, Math.max(0, accounts.length - 1)));
    const selectedAccount = accounts[savingsWalletIndex] || accounts[0];
    const isWalletMode = savingsMode === 'wallet' && selectedAccount;
    const shownBalance = isWalletMode ? walletSavingsBalance(selectedAccount.id) : totalSavings();
    const activeSaved = fromCents(state.goals.filter((goal) => goalIsActive(goal)).reduce((sum, goal) => sum + goalCurrentCents(goal), 0));
    const archivedSaved = fromCents(state.goals.filter((goal) => goalIsArchived(goal)).reduce((sum, goal) => sum + goalCurrentCents(goal), 0));
    const monthStats = savingsMonthStats();

    els.savingsModeToggle.querySelectorAll('[data-savings-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.savingsMode === savingsMode);
      button.setAttribute('aria-pressed', button.dataset.savingsMode === savingsMode ? 'true' : 'false');
    });
    els.savingsWalletTabs.classList.toggle('is-hidden', !isWalletMode);
    els.savingsWalletTabs.innerHTML = accounts.map((account, index) => `<button type="button" data-savings-wallet-index="${index}" class="${index === savingsWalletIndex ? 'is-active' : ''}">${escapeHtml(account.name)}</button>`).join('');

    els.savingsViewTitle.textContent = isWalletMode ? `${selectedAccount.name} savings` : 'All savings';
    els.savingsViewSubtitle.textContent = isWalletMode ? `Only money saved from ${selectedAccount.name} is shown.` : 'Everything you have set aside across all wallets.';
    els.savingsBalanceLabel.textContent = isWalletMode ? `Saved from ${selectedAccount.name}` : 'Total savings';
    els.totalSavings.textContent = privateCurrency(shownBalance);
    replayAnimation(els.totalSavings, 'amount-pop');
    if (els.savingsInsights) {
      els.savingsInsights.innerHTML = isWalletMode
        ? `<div><small>From wallet</small><strong class="money-value">${privateCurrency(shownBalance)}</strong></div><div><small>All savings</small><strong class="money-value">${privateCurrency(totalSavings())}</strong></div><div><small>New this month</small><strong class="money-value">${privateCurrency(monthStats.newSaved)}</strong></div>`
        : `<div><small>Active</small><strong class="money-value">${privateCurrency(activeSaved)}</strong></div><div><small>Archived</small><strong class="money-value">${privateCurrency(archivedSaved)}</strong></div><div><small>New this month</small><strong class="money-value">${privateCurrency(monthStats.newSaved)}</strong></div>`;
    }

    const visibleGoals = state.goals.filter((goal) => goalIsActive(goal));
    const archivedGoals = state.goals.filter((goal) => goalIsArchived(goal));
    const goalPageSize = savingsGoalsPerPage();
    const goalPages = Math.max(1, Math.ceil(visibleGoals.length / goalPageSize));
    savingsGoalPage = Math.max(0, Math.min(savingsGoalPage, goalPages - 1));
    const pageGoals = visibleGoals.slice(savingsGoalPage * goalPageSize, savingsGoalPage * goalPageSize + goalPageSize);
    els.goalsGrid.dataset.pageSize = String(Math.max(1, Math.min(goalPageSize, pageGoals.length || 1)));
    els.goalsGrid.dataset.goalCount = String(visibleGoals.length);
    if (els.savingsGoalPager) {
      const showPager = visibleGoals.length > goalPageSize;
      els.savingsGoalPager.classList.toggle('is-hidden', !showPager);
      els.savingsGoalPrev.disabled = savingsGoalPage <= 0;
      els.savingsGoalNext.disabled = savingsGoalPage >= goalPages - 1;
      els.savingsGoalPageLabel.textContent = `${Math.min(savingsGoalPage + 1, goalPages)} of ${goalPages}`;
    }
    els.manageGoalsButton.disabled = visibleGoals.length === 0;
    els.manageGoalsButton.textContent = manageGoalsMode ? 'Done' : 'Manage goals';
    els.goalsGrid.classList.toggle('is-managing', manageGoalsMode);
    document.getElementById('view-savings')?.classList.toggle('is-managing-goals', manageGoalsMode && visibleGoals.length > 0);

    if (!visibleGoals.length) {
      manageGoalsMode = false;
      els.manageGoalsButton.textContent = 'Manage goals';
      els.goalsGrid.classList.remove('is-managing');
      document.getElementById('view-savings')?.classList.remove('is-managing-goals');
      els.goalsGrid.innerHTML = `<article class="card goal-card empty-goal-card"><div class="empty-state"><span class="round-icon purple-soft">${icon('i-target')}</span><strong>No active savings goals</strong><span>Create a new goal or restore an archived one from Past goals.</span><br><button class="button-primary" type="button" data-action="open-goal">Create goal</button></div></article>`;
    } else {
      els.goalsGrid.innerHTML = pageGoals.map((goal) => {
        const totalCurrent = goalCurrent(goal);
        const target = Math.max(Number(goal.target || 1), 1);
        const percent = Math.min(100, totalCurrent / target * 100);
        const complete = goalIsComplete(goal);
        const walletCurrent = isWalletMode ? goalWalletSavings(goal, selectedAccount.id) : totalCurrent;
        const amountCopy = isWalletMode
          ? `${privateCurrency(walletCurrent)} from ${selectedAccount.name}`
          : `${privateCurrency(totalCurrent)} of ${privateCurrency(target)}`;
        const secondaryCopy = isWalletMode
          ? `${privateCurrency(totalCurrent)} total · ${Math.round(percent)}% of goal`
          : complete ? 'Completed · ready to archive when you want' : `${Math.round(percent)}% complete`;
        const accountAttribute = isWalletMode ? ` data-account-id="${escapeHtml(selectedAccount.id)}"` : '';
        const remaining = Math.max(0, target - totalCurrent);
        const manageButtons = manageGoalsMode
          ? `<div class="goal-manage-actions">
              <button type="button" data-action="edit-goal" data-goal-id="${escapeHtml(goal.id)}">${icon('i-edit')}<span>Edit</span></button>
              <button type="button" data-action="transfer-goal" data-goal-id="${escapeHtml(goal.id)}">${icon('i-transfer')}<span>Transfer</span></button>
              <button type="button" data-action="archive-goal" data-goal-id="${escapeHtml(goal.id)}">${icon('i-download')}<span>Archive</span></button>
              ${goal.legacyAttributionPending && toCents(goal.openingSaved || 0) > 0 ? `<button type="button" data-action="review-legacy-savings" data-goal-id="${escapeHtml(goal.id)}">${icon('i-wallet')}<span>Review source</span></button>` : ''}
              <button class="goal-remove" type="button" data-action="delete-goal" data-goal-id="${escapeHtml(goal.id)}" aria-label="Delete ${escapeHtml(goal.name)} savings goal">${icon('i-trash')}<span>Delete</span></button>
            </div>` : '';
        const primarySaved = isWalletMode ? walletCurrent : totalCurrent;
        const primarySavedLabel = isWalletMode ? `From ${selectedAccount.name}` : 'Saved';
        return `
          <article class="card goal-card${complete ? ' is-complete' : ''}" data-goal-id="${escapeHtml(goal.id)}">
            <div class="goal-card-head">
              <div><p class="eyebrow">${complete ? 'Completed goal' : 'Savings goal'}</p><h3>${escapeHtml(goal.name)}</h3><p class="goal-amount money-value">${escapeHtml(amountCopy)}</p></div>
              <div class="goal-card-actions">
                ${complete ? '<span class="status-pill success">Completed</span>' : ''}
                <button class="goal-history-button" type="button" data-action="open-goal-history" data-goal-id="${escapeHtml(goal.id)}" aria-label="View history for ${escapeHtml(goal.name)}">${icon('i-activity')}<span>History</span></button>
                <span class="round-icon green-soft">${icon('i-target')}</span>
              </div>
            </div>
            <div class="goal-card-metrics" aria-label="Goal progress details">
              <div><small>${escapeHtml(primarySavedLabel)}</small><strong class="money-value">${privateCurrency(primarySaved)}</strong></div>
              <div><small>Remaining</small><strong class="money-value">${privateCurrency(remaining)}</strong></div>
              <div><small>Target</small><strong class="money-value">${privateCurrency(target)}</strong></div>
            </div>
            <div class="goal-progress-block">
              <div class="goal-progress-copy"><span>${escapeHtml(secondaryCopy)}</span><strong>${Math.round(percent)}%</strong></div>
              <div class="goal-progress"><span style="width:${percent.toFixed(1)}%"></span></div>
            </div>
            ${manageButtons}
            <div class="goal-footer">${complete
              ? `<button class="button-primary" type="button" data-action="archive-goal" data-goal-id="${escapeHtml(goal.id)}">Archive</button><button class="button-secondary" type="button" data-action="withdraw-savings" data-goal-id="${escapeHtml(goal.id)}">Withdraw</button><button class="button-secondary" type="button" data-action="open-contribution" data-goal-id="${escapeHtml(goal.id)}"${accountAttribute}>Add more</button>`
              : `<button class="button-secondary" type="button" data-action="withdraw-savings" data-goal-id="${escapeHtml(goal.id)}">Withdraw</button><button class="button-primary" type="button" data-action="open-contribution" data-goal-id="${escapeHtml(goal.id)}"${accountAttribute}>Add savings</button>`}</div>
          </article>`;
      }).join('');
    }

    if (els.archivedGoalsButton && els.archivedGoalsList && els.archivedGoalsCount) {
      const hasPastGoals = archivedGoals.length > 0;
      els.archivedGoalsButton.classList.toggle('is-hidden', !hasPastGoals);
      if (els.archivedGoalsButtonCount) els.archivedGoalsButtonCount.textContent = String(archivedGoals.length);
      els.archivedGoalsCount.textContent = `${archivedGoals.length} archived goal${archivedGoals.length === 1 ? '' : 's'}`;
      els.archivedGoalsList.innerHTML = archivedGoals.map((goal) => {
        const saved = goalCurrent(goal);
        const status = goalIsComplete(goal) ? 'completed · archived' : `${Math.round(Math.min(100, saved / Math.max(goal.target, .01) * 100))}% · archived`;
        return `<article class="archived-goal-row">
          <span class="round-icon neutral-soft">${icon('i-target')}</span>
          <div><strong>${escapeHtml(goal.name)}</strong><small><span class="money-value">${privateCurrency(saved)}</span> saved · ${escapeHtml(status)}</small></div>
          <div class="archived-goal-actions"><button type="button" data-action="open-goal-history" data-goal-id="${escapeHtml(goal.id)}">History</button><button type="button" data-action="restore-goal" data-goal-id="${escapeHtml(goal.id)}">Restore</button><button class="danger-link" type="button" data-action="delete-goal" data-goal-id="${escapeHtml(goal.id)}">Delete</button></div>
        </article>`;
      }).join('');
      if (!hasPastGoals && els.archivedGoalsDialog?.open) closeDialog(els.archivedGoalsDialog);
    }
    renderSavingsRecentActivity();
    if (currentGoalHistoryId && els.goalHistoryDialog?.open) renderGoalHistory();
  }

  function goalHistoryEntries(goalId) {
    const entries = [];
    state.transactions
      .filter((tx) => (tx.type === 'saving' || tx.type === 'saving_return' || (tx.type === 'correction_reversal' && ['saving','saving_return'].includes(tx.originalType))) && tx.goalId === goalId)
      .forEach((tx) => entries.push({ kind: 'transaction', effectiveDate: tx.date || localDateKey(), createdAt: tx.createdAt || `${tx.date || ''}T12:00:00`, tx }));
    state.goalTransfers
      .filter((item) => item.fromGoalId === goalId || item.toGoalId === goalId)
      .forEach((item) => entries.push({ kind: 'goal_transfer', effectiveDate: item.date || localDateKey(), createdAt: item.createdAt || '', transfer: item }));
    (state.goalEvents || []).filter((item) => item.goalId === goalId).forEach((item) => entries.push({ kind: 'goal_event', effectiveDate: item.date || localDateKey(), createdAt: item.createdAt || `${item.date || ''}T12:00:00`, event: item }));
    return entries.sort((a, b) => {
      const dateCompare = String(b.effectiveDate || '').localeCompare(String(a.effectiveDate || ''));
      return dateCompare || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }

  function goalTransferHistoryRow(entry, goal) {
    const transfer = entry.transfer;
    const incoming = transfer.toGoalId === goal.id;
    const otherGoalId = incoming ? transfer.fromGoalId : transfer.toGoalId;
    const otherGoal = state.goals.find((item) => item.id === otherGoalId);
    const otherName = otherGoal?.name || 'another goal';
    const parsed = Date.parse(transfer.createdAt || '');
    const transferDate = transfer.date && validDateKey(transfer.date) ? DATE_LABEL.format(fromDateKey(transfer.date)) : (Number.isFinite(parsed) ? DATE_LABEL.format(new Date(parsed)) : '');
    const transferTime = Number.isFinite(parsed) ? TIME_LABEL.format(new Date(parsed)) : '';
    const timing = [transferDate, transferTime].filter(Boolean).join(' · ');
    const amount = state.settings.privacy ? '₱••••' : `${incoming ? '+' : '−'}${currency(transfer.amount)}`;
    let status = `<span class="inline-lock" aria-label="Transfer record">${icon('i-lock')}</span>`;
    if (transfer.correctedByGroupId) status = '<span class="status-pill neutral">Corrected</span>';
    else if (transfer.isReversal) status = '<span class="status-pill neutral">Audit reversal</span>';
    else if (canModifyGoalTransfer(transfer)) status = `<div class="allowance-history-actions"><button class="compact-history-action" type="button" data-action="edit-goal-transfer" data-id="${escapeHtml(transfer.id)}">${icon('i-edit')}<span>Edit</span></button><button class="compact-history-action undo" type="button" data-action="undo-goal-transfer" data-id="${escapeHtml(transfer.id)}">${icon('i-refresh')}<span>Undo</span></button></div>`;
    else if (canCorrectGoalTransfer(transfer)) status = `<button class="compact-history-action correction" type="button" data-action="correct-goal-transfer" data-id="${escapeHtml(transfer.id)}">${icon('i-edit')}<span>Correct</span></button>`;
    const title = transfer.isReversal ? 'Transfer correction reversal' : transfer.correctsGoalTransferId ? (incoming ? 'Corrected transfer in' : 'Corrected transfer out') : incoming ? 'Transferred in' : 'Transferred out';
    return `
      <div class="goal-history-row goal-transfer-history-row${transfer.correctedByGroupId ? ' is-corrected' : ''}">
        <span class="round-icon accent-soft">${icon('i-transfer')}</span>
        <div class="goal-history-copy">
          <strong>${title}</strong>
          <small>${escapeHtml(incoming ? `From ${otherName}` : `To ${otherName}`)}${timing ? ` · ${escapeHtml(timing)}` : ''}</small>
        </div>
        <div class="goal-history-amount"><strong class="money-value">${amount}</strong>${status}</div>
      </div>`;
  }

  function goalTransactionHistoryRow(entry, goal) {
    const tx = entry.tx;
    const isReturn = tx.type === 'saving_return';
    const isAuditReversal = tx.type === 'correction_reversal';
    const account = state.accounts.find((item) => item.id === tx.accountId)?.name || 'Wallet';
    const time = transactionTimeLabel(tx);
    const date = tx.date ? DATE_LABEL.format(fromDateKey(tx.date)) : '';
    const extra = tx.savingsNote || tx.withdrawalReason || '';
    const timing = [account, date, time, extra].filter(Boolean).join(' · ');
    const sign = isAuditReversal ? (tx.originalType === 'saving' ? '−' : '+') : isReturn ? '−' : '+';
    const amount = state.settings.privacy ? '₱••••' : `${sign}${currency(tx.amount)}`;
    const editableSaving = tx.type === 'saving' && !tx.correctedByGroupId && canModifyTransaction(tx);
    const editableWithdrawal = tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal' && !tx.correctedByGroupId && canModifyTransaction(tx);
    let status = `<span class="inline-lock" aria-label="Locked">${icon('i-lock')}</span>`;
    if (tx.correctedByGroupId) status = `<span class="status-pill neutral">Corrected</span>`;
    else if (isAuditReversal) status = '<span class="status-pill neutral">Audit reversal</span>';
    else if (editableSaving || editableWithdrawal) status = `<div class="allowance-history-actions"><button class="compact-history-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')}<span>Edit</span></button><button class="compact-history-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')}<span>Undo</span></button></div>`;
    else if (!isAuditReversal && canCorrectTransaction(tx)) status = `<button class="compact-history-action correction" type="button" data-action="correct-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')}<span>Correct</span></button>`;
    const title = isAuditReversal ? `Correction reversal · ${tx.originalType === 'saving_return' ? 'withdrawal' : 'savings'}` : isReturn ? (tx.correctsTransactionId ? 'Savings withdrawal correction' : tx.savingsAction === 'partial_withdrawal' ? 'Savings withdrawn' : 'Savings returned') : tx.correctsTransactionId ? 'Savings correction' : tx.savingsAction === 'lifecycle_restore' ? 'Goal savings restored' : 'Savings added';
    return `
      <div class="goal-history-row ${escapeHtml(tx.type)}${tx.correctedByGroupId ? ' is-corrected' : ''}">
        <span class="round-icon ${isReturn ? 'green-soft' : isAuditReversal ? 'neutral-soft' : 'purple-soft'}">${icon(isReturn ? 'i-arrow-up' : isAuditReversal ? 'i-refresh' : 'i-savings')}</span>
        <div class="goal-history-copy">
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(timing)}</small>
        </div>
        <div class="goal-history-amount"><strong class="money-value">${amount}</strong>${status}</div>
      </div>`;
  }

  function goalEventHistoryRow(entry) {
    const event = entry.event;
    const labels = { created: 'Goal created', renamed: 'Goal renamed', target_changed: 'Target changed', milestone_cycle_reset: 'Milestones recalibrated', milestone: event.note || 'Milestone reached', completed: 'Goal completed', completed_by_target_change: 'Goal completed after target change', reopened: 'Goal reopened', reopened_by_target_change: 'Goal reopened after target change', archived: 'Goal archived', restored: 'Goal restored', withdrawn: 'Goal deleted', restored_after_withdrawal: 'Goal restored from legacy deleted state', legacy_source_assigned: 'Opening savings source reviewed' };
    let detail = event.note || '';
    if (event.type === 'target_changed' && event.fromValue !== undefined && event.toValue !== undefined) detail = state.settings.privacy ? 'Target amount changed' : `${currency(Number(event.fromValue || 0))} → ${currency(Number(event.toValue || 0))}`;
    if (event.type === 'renamed' && event.fromValue !== undefined && event.toValue !== undefined) detail = `${event.fromValue} → ${event.toValue}`;
    if (event.type === 'created' && event.toValue !== undefined) detail = state.settings.privacy ? 'Goal created with a target amount' : `Target ${currency(Number(event.toValue || 0))}`;
    const date = event.date ? DATE_LABEL.format(fromDateKey(event.date)) : '';
    const goal = state.goals.find((item) => item.id === event.goalId);
    const canRevertTarget = event.type === 'target_changed' && goal && !goalIsWithdrawn(goal) && event.fromValue !== undefined && event.toValue !== undefined && toCents(goal.target) === toCents(event.toValue);
    const status = canRevertTarget ? `<button class="compact-history-action correction" type="button" data-action="revert-goal-target" data-id="${escapeHtml(event.id)}">${icon('i-refresh')}<span>Revert</span></button>` : '<span class="status-pill neutral">History</span>';
    return `<div class="goal-history-row goal-event-history-row"><span class="round-icon neutral-soft">${icon(event.type === 'milestone' || event.type === 'completed' ? 'i-sparkle' : event.type === 'archived' ? 'i-download' : 'i-target')}</span><div class="goal-history-copy"><strong>${escapeHtml(labels[event.type] || 'Goal updated')}</strong><small>${escapeHtml([detail,date].filter(Boolean).join(' · '))}</small></div><div class="goal-history-amount">${status}</div></div>`;
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
    els.goalHistorySubtitle.textContent = 'Savings, transfers, milestones, target changes, and lifecycle events for this goal.';
    els.goalHistoryCount.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
    els.goalHistoryList.innerHTML = entries.length
      ? entries.map((entry) => entry.kind === 'goal_transfer' ? goalTransferHistoryRow(entry, goal) : entry.kind === 'goal_event' ? goalEventHistoryRow(entry) : goalTransactionHistoryRow(entry, goal)).join('')
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
      const modifiable = canModifyTransaction(tx) && !tx.correctedByGroupId;
      const correctable = canCorrectTransaction(tx);
      let actions = '';
      if (tx.correctedByGroupId) {
        actions = `<span class="inline-lock allowance-inline-lock corrected-status" aria-label="Corrected"><span>Corrected</span></span>`;
      } else if (modifiable) {
        actions = `<div class="allowance-history-actions">${canEditTransaction(tx) ? `<button class="compact-history-action" type="button" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')}<span>Edit</span></button>` : ''}<button class="compact-history-action undo" type="button" data-action="undo-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-refresh')}<span>Undo</span></button></div>`;
      } else if (correctable) {
        actions = `<button class="compact-history-action correction" type="button" data-action="correct-transaction" data-id="${escapeHtml(tx.id)}">${icon('i-edit')}<span>Correct</span></button>`;
      } else {
        actions = `<span class="inline-lock allowance-inline-lock" aria-label="Locked">${icon('i-lock')}<span>Locked</span></span>`;
      }
      const title = tx.correctsTransactionId ? 'Allowance correction' : 'Allowance received';
      return `
        <div class="allowance-history-row${tx.correctedByGroupId ? ' is-corrected' : ''}">
          <span class="round-icon green-soft">${icon('i-arrow-down')}</span>
          <div class="allowance-history-copy"><strong>${title}</strong><small>${escapeHtml(timing)}</small>${modifiable ? actions : ''}</div>
          <div class="allowance-history-amount"><strong class="money-value">${state.settings.privacy ? '₱••••' : `+${currency(tx.amount)}`}</strong>${modifiable ? '' : actions}</div>
        </div>`;
    }).join('');
  }

  function allowanceHistoryPageSize() {
    return window.innerWidth <= 560 ? 5 : 8;
  }

  function renderAllowanceHistory() {
    if (!els.allowanceHistoryList) return;
    const history = allowanceHistoryTransactions();
    const pageSize = allowanceHistoryPageSize();
    const pages = Math.max(1, Math.ceil(history.length / pageSize));
    allowanceHistoryPage = Math.max(0, Math.min(allowanceHistoryPage, pages - 1));
    const start = allowanceHistoryPage * pageSize;
    const pageEntries = history.slice(start, start + pageSize);
    els.allowanceHistoryCount.textContent = `${history.length} entr${history.length === 1 ? 'y' : 'ies'}`;
    els.allowanceHistoryList.innerHTML = renderAllowanceHistoryRows(pageEntries);
    if (els.allowanceHistoryPager) {
      const showPager = history.length > pageSize;
      els.allowanceHistoryPager.classList.toggle('is-hidden', !showPager);
      els.allowanceHistoryPrev.disabled = allowanceHistoryPage <= 0;
      els.allowanceHistoryNext.disabled = allowanceHistoryPage >= pages - 1;
      const end = Math.min(history.length, start + pageEntries.length);
      els.allowanceHistoryPageLabel.textContent = history.length ? `${start + 1}–${end} of ${history.length}` : '0 entries';
    }
    if (els.allowanceHistorySummary) {
      const latest = effectiveTransactions().filter((tx) => tx.type === 'income').sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))[0];
      const latestDate = latest?.date ? DATE_LABEL.format(fromDateKey(latest.date)) : '';
      els.allowanceHistorySummary.textContent = latest
        ? `${history.length} entr${history.length === 1 ? 'y' : 'ies'}${latestDate ? ` · Latest ${latestDate}` : ''}`
        : 'No allowance entries yet.';
    }
  }

  function openGoalHistory(goalId) {
    const goal = state.goals.find((item) => item.id === goalId);
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
    allowanceHistoryPage = 0;
    renderAllowanceHistory();
    openDialog(els.allowanceHistoryDialog);
    requestAnimationFrame(() => {
      if (els.allowanceHistoryList) els.allowanceHistoryList.scrollTop = 0;
      els.allowanceHistoryDialog.focus();
    });
  }

  function renderWallets() {
    if (!els.walletsList) return;
    const accounts = [...(state.accounts || [])].sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)));
    if (!accounts.length) {
      els.walletsList.innerHTML = '<div class="wallet-list-empty">No wallets found. Cash will be restored after refresh.</div>';
      return;
    }
    els.walletsList.innerHTML = accounts.map((account) => {
      const balance = privateCurrency(accountBalance(account.id));
      const savings = privateCurrency(walletSavingsBalance(account.id));
      const used = state.transactions.some((tx) => tx.accountId === account.id || tx.fromAccountId === account.id || tx.toAccountId === account.id);
      let actions = '';
      if (account.archivedAt) {
        actions = `<div class="wallet-row-actions"><span class="status-pill neutral">Archived</span><button class="wallet-manage" type="button" data-action="wallet-detail" data-id="${escapeHtml(account.id)}">Details</button><button class="wallet-manage" type="button" data-action="restore-wallet" data-id="${escapeHtml(account.id)}">Restore</button></div>`;
      } else {
        const remove = !account.isPrimary && !used ? `<button class="wallet-remove" type="button" data-action="remove-wallet" data-id="${escapeHtml(account.id)}">Remove</button>` : '';
        actions = `<div class="wallet-row-actions"><button class="wallet-manage" type="button" data-action="wallet-detail" data-id="${escapeHtml(account.id)}">Details</button><button class="wallet-manage" type="button" data-action="manage-wallet" data-id="${escapeHtml(account.id)}">Manage</button>${remove}</div>`;
      }
      const archiveCopy = account.archivedAt ? 'Archived · ' : '';
      return `<div class="wallet-row${account.archivedAt ? ' is-archived' : ''}"><span class="round-icon ${account.isPrimary ? 'accent-soft' : 'neutral-soft'}">${icon(account.isPrimary ? 'i-wallet' : 'i-phone')}</span><div><strong>${escapeHtml(account.name)}</strong><small>${archiveCopy}<span class="money-value">${escapeHtml(balance)}</span> available · <span class="money-value">${escapeHtml(savings)}</span> saved</small></div>${actions}</div>`;
    }).join('');
  }

  function allLedgerEntries() {
    const transactions = (state.transactions || []).map((tx) => ({ ...tx }));
    const goalTransfers = (state.goalTransfers || []).map((item) => ({
      ...item,
      id: `history-${item.id}`,
      sourceGoalTransferId: item.id,
      type: 'goal_transfer',
      date: item.date || localDateKey(new Date(item.createdAt || Date.now()))
    }));
    return [...transactions, ...goalTransfers].sort((a, b) => String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')));
  }

  function ledgerEntryWalletIds(entry) {
    const ids = new Set();
    if (entry.accountId) ids.add(entry.accountId);
    if (entry.fromAccountId) ids.add(entry.fromAccountId);
    if (entry.toAccountId) ids.add(entry.toAccountId);
    if (entry.type === 'goal_transfer') (entry.allocations || []).forEach((item) => { if (item.accountId) ids.add(item.accountId); });
    return ids;
  }

  function ledgerEntryGoalIds(entry) {
    const ids = new Set();
    if (entry.goalId) ids.add(entry.goalId);
    if (entry.fromGoalId) ids.add(entry.fromGoalId);
    if (entry.toGoalId) ids.add(entry.toGoalId);
    return ids;
  }

  function globalHistoryTypeMatches(entry, type) {
    if (type === 'all') return true;
    if (type === 'expense') return entry.type === 'expense';
    if (type === 'income') return entry.type === 'income';
    if (type === 'savings') return ['saving', 'saving_return', 'goal_transfer'].includes(entry.type);
    if (type === 'transfer') return entry.type === 'transfer';
    if (type === 'reconciliation') return entry.type === 'reconciliation' || (entry.type === 'correction_reversal' && entry.originalType === 'reconciliation');
    if (type === 'correction') return entry.type === 'correction_reversal' || Boolean(entry.correctsTransactionId) || Boolean(entry.correctedByGroupId) || (entry.type === 'goal_transfer' && (entry.isReversal || entry.correctsGoalTransferId || entry.correctedByGroupId));
    return entry.type === type;
  }

  function populateGlobalHistoryFilters(preset = {}) {
    if (!els.globalHistoryWallet) return;
    const walletValue = preset.walletId ?? els.globalHistoryWallet.value ?? 'all';
    const categoryValue = preset.categoryId ?? els.globalHistoryCategory.value ?? 'all';
    const goalValue = preset.goalId ?? els.globalHistoryGoal.value ?? 'all';
    els.globalHistoryWallet.innerHTML = `<option value="all">All wallets</option>${(state.accounts || []).map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}${account.archivedAt ? ' · Archived' : ''}</option>`).join('')}`;
    els.globalHistoryCategory.innerHTML = `<option value="all">All categories</option>${expenseCategories(state, true).map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.archivedAt ? ' · Archived' : ''}</option>`).join('')}`;
    els.globalHistoryGoal.innerHTML = `<option value="all">All goals</option>${(state.goals || []).filter((goal) => !goalIsWithdrawn(goal)).map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.name)}${goalIsArchived(goal) ? ' · Archived' : ''}</option>`).join('')}`;
    if ([...els.globalHistoryWallet.options].some((option) => option.value === walletValue)) els.globalHistoryWallet.value = walletValue;
    if ([...els.globalHistoryCategory.options].some((option) => option.value === categoryValue)) els.globalHistoryCategory.value = categoryValue;
    if ([...els.globalHistoryGoal.options].some((option) => option.value === goalValue)) els.globalHistoryGoal.value = goalValue;
  }

  function globalHistorySearchText(entry) {
    const wallets = [...ledgerEntryWalletIds(entry)].map((id) => state.accounts.find((account) => account.id === id)?.name || '').join(' ');
    const goals = [...ledgerEntryGoalIds(entry)].map((id) => state.goals.find((goal) => goal.id === id)?.name || '').join(' ');
    const category = entry.type === 'expense' ? categoryForTransaction(entry)?.name || entry.category || '' : entry.category || '';
    const amountText = String(Math.abs(Number(entry.amount || 0)));
    return [transactionTitle(entry), transactionSubtitle(entry, true), entry.note, entry.savingsNote, entry.withdrawalReason, entry.reconciliationReason, entry.reconciliationNote, wallets, goals, category, amountText].filter(Boolean).join(' ').toLowerCase();
  }

  function globalHistoryPageSize() {
    return window.innerWidth <= 560 ? 5 : 8;
  }

  function renderGlobalHistory() {
    if (!els.globalHistoryResults) return;
    let entries = allLedgerEntries();
    const query = String(els.globalHistorySearch.value || '').trim().toLowerCase();
    const type = els.globalHistoryType.value || 'all';
    const walletId = els.globalHistoryWallet.value || 'all';
    const categoryId = els.globalHistoryCategory.value || 'all';
    const goalId = els.globalHistoryGoal.value || 'all';
    const from = validDateKey(els.globalHistoryFrom.value) ? els.globalHistoryFrom.value : '';
    const to = validDateKey(els.globalHistoryTo.value) ? els.globalHistoryTo.value : '';
    const minCents = els.globalHistoryMin.value === '' ? null : Math.max(0, toCents(els.globalHistoryMin.value));
    const maxCents = els.globalHistoryMax.value === '' ? null : Math.max(0, toCents(els.globalHistoryMax.value));

    entries = entries.filter((entry) => {
      if (!globalHistoryTypeMatches(entry, type)) return false;
      if (walletId !== 'all' && !ledgerEntryWalletIds(entry).has(walletId)) return false;
      if (categoryId !== 'all') {
        if (entry.type !== 'expense' || categoryForTransaction(entry)?.id !== categoryId) return false;
      }
      if (goalId !== 'all' && !ledgerEntryGoalIds(entry).has(goalId)) return false;
      const date = entry.date || localDateKey(new Date(entry.createdAt || Date.now()));
      if (from && date < from) return false;
      if (to && date > to) return false;
      const cents = Math.abs(toCents(entry.amount || 0));
      if (minCents !== null && cents < minCents) return false;
      if (maxCents !== null && cents > maxCents) return false;
      if (query && !globalHistorySearchText(entry).includes(query)) return false;
      return true;
    });

    const pageSize = globalHistoryPageSize();
    const pages = Math.max(1, Math.ceil(entries.length / pageSize));
    globalHistoryPage = Math.max(0, Math.min(globalHistoryPage, pages - 1));
    const start = globalHistoryPage * pageSize;
    const pageEntries = entries.slice(start, start + pageSize);
    const end = Math.min(entries.length, start + pageEntries.length);

    els.globalHistoryCount.textContent = `${entries.length} record${entries.length === 1 ? '' : 's'}`;
    els.globalHistoryResults.innerHTML = renderTransactionRows(pageEntries, true, {
      includeDate: true,
      emptyTitle: 'No matching history',
      emptyCopy: 'Try clearing a filter or using a different search.'
    });

    if (els.globalHistoryPager) {
      const showPager = entries.length > pageSize;
      els.globalHistoryPager.classList.toggle('is-hidden', !showPager);
      els.globalHistoryPrev.disabled = globalHistoryPage <= 0;
      els.globalHistoryNext.disabled = globalHistoryPage >= pages - 1;
      els.globalHistoryPageLabel.textContent = entries.length ? `${start + 1}–${end} of ${entries.length}` : '0 records';
    }
  }

  function clearGlobalHistoryFilters() {
    globalHistoryPage = 0;
    els.globalHistorySearch.value = '';
    els.globalHistoryType.value = 'all';
    els.globalHistoryWallet.value = 'all';
    els.globalHistoryCategory.value = 'all';
    els.globalHistoryGoal.value = 'all';
    els.globalHistoryFrom.value = '';
    els.globalHistoryTo.value = '';
    els.globalHistoryMin.value = '';
    els.globalHistoryMax.value = '';
    renderGlobalHistory();
  }

  function openGlobalHistory(preset = {}) {
    globalHistoryPage = 0;
    const today = localDateKey();
    els.globalHistoryFrom.max = today;
    els.globalHistoryTo.max = today;
    populateGlobalHistoryFilters(preset);
    if (preset.reset !== false) {
      els.globalHistorySearch.value = preset.query || '';
      els.globalHistoryType.value = preset.type || 'all';
      els.globalHistoryFrom.value = preset.from || '';
      els.globalHistoryTo.value = preset.to || '';
      els.globalHistoryMin.value = preset.min || '';
      els.globalHistoryMax.value = preset.max || '';
      if (preset.walletId && [...els.globalHistoryWallet.options].some((o) => o.value === preset.walletId)) els.globalHistoryWallet.value = preset.walletId;
      if (preset.categoryId && [...els.globalHistoryCategory.options].some((o) => o.value === preset.categoryId)) els.globalHistoryCategory.value = preset.categoryId;
      if (preset.goalId && [...els.globalHistoryGoal.options].some((o) => o.value === preset.goalId)) els.globalHistoryGoal.value = preset.goalId;
    }
    renderGlobalHistory();
    openDialog(els.globalHistoryDialog);
    requestAnimationFrame(() => els.globalHistorySearch?.focus({ preventScroll: true }));
  }

  function walletDetailMonthStats(accountId) {
    const range = monthRange();
    const effective = effectiveTransactions().filter((tx) => tx.date >= range.start && tx.date <= range.end);
    const income = fromCents(effective.filter((tx) => tx.type === 'income' && tx.accountId === accountId).reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    const expenses = fromCents(effective.filter((tx) => tx.type === 'expense' && tx.accountId === accountId).reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    const newSaved = fromCents(effective.filter((tx) => tx.type === 'saving' && tx.accountId === accountId && tx.savingsAction !== 'lifecycle_restore').reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    const withdrawn = fromCents(effective.filter((tx) => tx.type === 'saving_return' && tx.accountId === accountId).reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    return { income, expenses, newSaved, withdrawn };
  }

  function renderWalletDetail(accountId) {
    const account = state.accounts.find((item) => item.id === accountId);
    if (!account || !els.walletDetailTitle) return false;
    const stats = walletDetailMonthStats(account.id);
    els.walletDetailTitle.textContent = account.name;
    els.walletDetailSummary.innerHTML = `
      <div><small>Available</small><strong class="money-value">${privateCurrency(accountBalance(account.id))}</strong></div>
      <div><small>In savings</small><strong class="money-value">${privateCurrency(walletSavingsBalance(account.id))}</strong></div>
      <div><small>This month income</small><strong class="money-value">${privateCurrency(stats.income)}</strong></div>
      <div><small>This month spent</small><strong class="money-value">${privateCurrency(stats.expenses)}</strong></div>
      <div><small>New savings</small><strong class="money-value">${privateCurrency(stats.newSaved)}</strong></div>
      <div><small>Withdrawn</small><strong class="money-value">${privateCurrency(stats.withdrawn)}</strong></div>
      <div><small>Status</small><strong>${account.archivedAt ? 'Archived' : account.isPrimary ? 'Main wallet' : 'Active'}</strong></div>`;
    const entries = allLedgerEntries().filter((entry) => ledgerEntryWalletIds(entry).has(account.id)).slice(0, 30);
    els.walletDetailTransactions.innerHTML = renderTransactionRows(entries, true, { includeDate: true, emptyTitle: 'No wallet activity yet', emptyCopy: 'Transactions linked to this wallet will appear here.' });
    return true;
  }

  function openWalletDetail(accountId) {
    if (!renderWalletDetail(accountId)) return;
    currentWalletDetailId = accountId;
    openDialog(els.walletDetailDialog);
  }

  function dataHealthDetailChecks() {
    const checks = [];
    const effective = effectiveTransactions();
    const negativeWallets = (state.accounts || []).filter((account) => accountBalanceCentsForState(state, account.id) < 0);
    const negativeGoals = (state.goals || []).filter((goal) => rawGoalCurrentCents(goal, state) < 0);
    const duplicateTx = new Set((state.transactions || []).map((tx) => tx.id)).size !== (state.transactions || []).length;
    const incompleteCorrections = (state.transactions || []).filter((tx) => tx.correctedByGroupId).filter((source) => {
      const members = (state.transactions || []).filter((tx) => tx.correctionGroupId === source.correctedByGroupId);
      return members.length !== 2 || !members.some((tx) => tx.type === 'correction_reversal' && tx.correctsTransactionId === source.id) || !members.some((tx) => tx.type !== 'correction_reversal' && tx.correctsTransactionId === source.id);
    });
    const archivedMoney = (state.accounts || []).filter((account) => account.archivedAt && (accountBalanceCentsForState(state, account.id) !== 0 || walletSavingsCentsForState(state, account.id) !== 0));
    const invalidGoalTransfers = (state.goalTransfers || []).filter((transfer) => !state.goals.some((goal) => goal.id === transfer.fromGoalId) || !state.goals.some((goal) => goal.id === transfer.toGoalId) || transfer.fromGoalId === transfer.toGoalId);
    const categoryIds = (state.categories || []).map((category) => category.id);
    const duplicateCategories = new Set(categoryIds).size !== categoryIds.length;
    const provenanceIssue = savingsProvenanceProblem(state);
    const pendingLegacyAttribution = (state.goals || []).filter((goal) => goal.legacyAttributionPending && toCents(goal.openingSaved || 0) > 0);

    checks.push({ ok: !negativeWallets.length, title: 'Wallet balances', copy: negativeWallets.length ? `${negativeWallets.length} wallet${negativeWallets.length === 1 ? '' : 's'} would be negative.` : `${state.accounts.length} wallet${state.accounts.length === 1 ? '' : 's'} reconcile without negative balances.` });
    checks.push({ ok: !negativeGoals.length, title: 'Savings ledger', copy: negativeGoals.length ? `${negativeGoals.length} goal${negativeGoals.length === 1 ? '' : 's'} has an invalid negative ledger.` : `${state.goals.length} savings goal${state.goals.length === 1 ? '' : 's'} reconcile to the ledger.` });
    checks.push({ ok: !provenanceIssue, title: 'Savings wallet provenance', copy: provenanceIssue ? 'At least one goal does not reconcile cleanly across its source wallets.' : 'Every goal balance matches the sum of its wallet-level savings sources.' });
    checks.push({ ok: true, title: 'Legacy savings attribution', copy: pendingLegacyAttribution.length ? `${pendingLegacyAttribution.length} older goal${pendingLegacyAttribution.length === 1 ? '' : 's'} still use a provisional wallet source. Review them from Manage goals when convenient.` : 'Opening savings from older Pocket versions have reviewed wallet attribution.' });
    checks.push({ ok: !duplicateTx, title: 'Ledger IDs', copy: duplicateTx ? 'Duplicate transaction IDs were detected.' : `${state.transactions.length} transaction record${state.transactions.length === 1 ? '' : 's'} have unique IDs.` });
    checks.push({ ok: !incompleteCorrections.length, title: 'Correction audit trails', copy: incompleteCorrections.length ? `${incompleteCorrections.length} correction trail${incompleteCorrections.length === 1 ? '' : 's'} is incomplete.` : 'Originals, reversals, and replacements are paired correctly.' });
    checks.push({ ok: !invalidGoalTransfers.length, title: 'Goal transfers', copy: invalidGoalTransfers.length ? `${invalidGoalTransfers.length} savings transfer${invalidGoalTransfers.length === 1 ? '' : 's'} references an invalid goal.` : `${state.goalTransfers.length} goal transfer record${state.goalTransfers.length === 1 ? '' : 's'} references valid goals.` });
    checks.push({ ok: !archivedMoney.length, title: 'Archived wallets', copy: archivedMoney.length ? `${archivedMoney.length} archived wallet${archivedMoney.length === 1 ? '' : 's'} still contains money.` : 'Archived wallets do not hide available money or attributed savings.' });
    checks.push({ ok: !duplicateCategories, title: 'Categories', copy: duplicateCategories ? 'Duplicate category IDs were detected.' : `${expenseCategories(state, false).length} active expense categor${expenseCategories(state, false).length === 1 ? 'y' : 'ies'} available.` });
    checks.push({ ok: storageHealth.healthy, title: 'Full integrity validator', copy: storageHealth.healthy ? `Schema ${SCHEMA_VERSION} passed the complete integrity validator.` : storageHealth.message });
    return checks;
  }

  function renderDataHealthDetails() {
    if (!els.dataHealthHero) return;
    const checks = dataHealthDetailChecks();
    const failed = checks.filter((check) => !check.ok);
    els.dataHealthHero.innerHTML = failed.length
      ? `<span class="round-icon red-soft">${icon('i-bell')}</span><div><strong>${failed.length} issue${failed.length === 1 ? '' : 's'} need attention</strong><small>Pocket will continue blocking unsafe ledger writes. A recovery point may be safer than manual edits.</small></div>`
      : `<span class="round-icon green-soft">${icon('i-check')}</span><div><strong>Data Health: Healthy</strong><small>Your wallets, ledger, savings, corrections, categories, and archive rules are internally consistent.</small></div>`;
    els.dataHealthDetailsList.innerHTML = checks.map((check) => `<div class="data-health-check ${check.ok ? 'is-ok' : 'is-warning'}"><span>${icon(check.ok ? 'i-check' : 'i-bell')}</span><div><strong>${escapeHtml(check.title)}</strong><small>${escapeHtml(check.copy)}</small></div></div>`).join('');
  }

  function openDataHealthDetails() {
    runDataHealthCheck({ announce: false });
    renderDataHealthDetails();
    openDialog(els.dataHealthDialog);
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
    if (!companionIsAvailable() || companionPointerState || event.pointerType === 'touch' || companionPerformanceReduced()) return;
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
    const activeGoals = state.goals.filter((goal) => goalIsActive(goal));
    const dataTransactions = effectiveTransactions();
    const todayExpenses = dataTransactions.filter((tx) => tx.type === 'expense' && tx.date === today);
    const yesterdayExpenses = dataTransactions.filter((tx) => tx.type === 'expense' && tx.date === yesterday);
    const todaySpent = fromCents(todayExpenses.reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    const yesterdaySpent = fromCents(yesterdayExpenses.reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
    const monthExpenses = dataTransactions.filter((tx) => tx.type === 'expense' && tx.date >= month.start && tx.date <= month.end);
    const monthSpent = fromCents(monthExpenses.reduce((sum, tx) => sum + toCents(tx.amount || 0), 0));
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
      add(!privacy && activeAccounts().length > 1, `Across your wallets, you have ${currency(balance)} available.`, homeTarget, { prop: 'pouch' });
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
        .filter((goal) => Number(goal.target || 0) > 0 && goalCurrent(goal) < Number(goal.target || 0))
        .map((goal) => {
          const target = Math.max(Number(goal.target || 0), 1);
          const current = goalCurrent(goal);
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
        const currentPercent = Math.min(100, Math.round(goalCurrent(goal) / target * 100));
        const previousPercent = baseline?.goals?.[goal.id]?.percent;
        if (Number.isFinite(previousPercent) && currentPercent > previousPercent) {
          const goalTarget = companionGoalTarget(goal.id) || savingsTarget;
          add(true, `${goal.name} moved from ${Math.round(previousPercent)}% to ${currentPercent}% since your last visit ✨`, goalTarget, { prop: 'savings', compare: true });
        }
      }

      const completed = activeGoals.filter((goal) => Number(goal.target || 0) > 0 && goalCurrent(goal) >= Number(goal.target || 0));
      add(completed.length > 0, `You’ve completed ${completed.length} savings goal${completed.length === 1 ? '' : 's'} here. That’s real progress ♡`, completed.length === 1 ? companionGoalTarget(completed[0].id) || savingsTarget : savingsTarget, { prop: 'flower' });
    }

    if (view === 'more') {
      const settingsTarget = companionVisibleTarget(['.settings-card']);
      const allowanceTarget = companionVisibleTarget(['.allowance-settings-card']) || settingsTarget;
      add(activeAccounts().length > 1, `You’re keeping ${activeAccounts().length} active wallets organized in Pocket.`, settingsTarget, { prop: 'pouch' });
      const latestAllowance = effectiveTransactions()
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
      map[name] = (map[name] || 0) + toCents(tx.amount || 0);
      return map;
    }, {});
    const topCents = Object.entries(categories).sort((a, b) => b[1] - a[1])[0] || null;
    return { top: topCents ? [topCents[0], fromCents(topCents[1])] : null };
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
    const performanceReduced = companionPerformanceReduced();
    if (!Number.isFinite(delay)) {
      const base = calm ? 19000 + Math.random() * 16000 : 8200 + Math.random() * 8800;
      delay = energy < 35 ? base * 1.7 : personality === 'playful' ? base * .82 : base;
    } else if (calm) delay = Math.max(12000, delay * 1.55);
    if (companionPerformanceMode() === 'battery') delay *= 2.35;
    else if (performanceReduced) delay *= 1.75;
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
    if (companionPerformanceMode() === 'battery') delay *= 1.35;
    else if (companionPerformanceReduced()) delay *= 1.18;
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
    syncCompanionPerformanceClass();
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
    if (els.textSizeSetting) els.textSizeSetting.value = ['compact','default','large'].includes(uiPreferences.textSize) ? uiPreferences.textSize : 'default';
    if (els.categorySettingsSummary) {
      const activeCategoryCount = expenseCategories(state, false).length;
      const archivedCategoryCount = expenseCategories(state, true).filter((category) => category.archivedAt).length;
      els.categorySettingsSummary.textContent = `${activeCategoryCount} active categor${activeCategoryCount === 1 ? 'y' : 'ies'}${archivedCategoryCount ? ` · ${archivedCategoryCount} archived` : ''}. Add, rename, reorder, or archive.`;
    }
    els.allowanceRecordSummary.textContent = 'Enter the amount, received date, and destination wallet. No routine or schedule required.';
    renderSecretPocketSettings();
    renderAllowanceHistory();
    renderWallets();
    renderStorageStatus();
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
    document.documentElement.dataset.textSize = ['compact','default','large'].includes(uiPreferences.textSize) ? uiPreferences.textSize : 'default';
    if (els.themeColorMeta) els.themeColorMeta.setAttribute('content', state.settings.theme === 'light' ? '#f1b5cc' : '#0d0e10');
    renderHeader();
    renderPrivacy();
    renderHome();
    renderActivity();
    renderSettings();
    populateAccounts();
    renderSavings();
    if (els.globalHistoryDialog?.open) {
      populateGlobalHistoryFilters({ reset: false });
      renderGlobalHistory();
    }
    if (els.walletDetailDialog?.open && currentWalletDetailId) {
      renderWalletDetail(currentWalletDetailId);
    }
    if (els.dataHealthDialog?.open) renderDataHealthDetails();
    syncCompanion();
    syncSecretLightWorld();
  }

  function populateAccounts() {
    const accounts = activeAccounts();
    const expenseCurrent = els.expenseAccount.value;
    const allowanceCurrent = els.allowanceAccount.value;
    const goalAccountCurrent = els.goalAccount.value;
    const contributionCurrent = els.contributeAccount.value;
    const options = accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} · ${privateCurrency(accountBalance(account.id))}</option>`).join('');
    els.expenseAccount.innerHTML = options;
    els.allowanceAccount.innerHTML = options;
    els.goalAccount.innerHTML = options;
    els.contributeAccount.innerHTML = options;
    if (accounts.some((account) => account.id === expenseCurrent)) els.expenseAccount.value = expenseCurrent;
    if (accounts.some((account) => account.id === allowanceCurrent)) els.allowanceAccount.value = allowanceCurrent;
    if (accounts.some((account) => account.id === goalAccountCurrent)) els.goalAccount.value = goalAccountCurrent;
    if (accounts.some((account) => account.id === contributionCurrent)) els.contributeAccount.value = contributionCurrent;
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
      return activeAccounts().filter((account) => account.id !== fromId);
    }
    return activeAccounts();
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
      const account = activeAccounts().find((item) => item.id === select.value) || activeAccounts()[0];
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
    if (!select || !activeAccounts().length) return;
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
    if (!select || !activeAccounts().some((account) => account.id === accountId)) return;
    select.value = accountId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncWalletPickerTriggers();
    closeDialog(els.walletPickerDialog);
  }


  function updateExpenseEntry() {
    const amount = Number(els.expenseAmount.value || 0);
    const accountId = els.expenseAccount.value || activeAccounts()[0]?.id;
    const account = state.accounts.find((item) => item.id === accountId);
    const available = spendableAvailableForEntry(accountId, currentExpenseEditId || currentCorrectionSourceId);
    const isValid = Number.isFinite(amount) && amount > 0;
    const isOver = isValid && toCents(amount) > toCents(available);

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
    els.expenseSaveButton.textContent = isValid ? `${currentCorrectionSourceId ? 'Correct' : currentExpenseEditId ? 'Update' : 'Save'} ${state.settings.privacy ? '₱••••' : currency(amount)}` : (currentCorrectionSourceId ? 'Save correction' : currentExpenseEditId ? 'Update expense' : 'Save expense');
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

  function maybeRemindExternalBackup() {
    if (backupReminderShown || !state) return;
    const meaningful = state.transactions.length >= 10 || state.goals.some((goal) => !goalIsWithdrawn(goal)) || state.accounts.length > 1;
    if (!meaningful) return;
    const now = Date.now();
    const lastExport = Math.max(0, Number(uiPreferences.lastExportAt || 0));
    const lastReminder = Math.max(0, Number(uiPreferences.lastBackupReminderAt || 0));
    if (lastExport && now - lastExport < 14 * 24 * 60 * 60 * 1000) return;
    if (lastReminder && now - lastReminder < 3 * 24 * 60 * 60 * 1000) return;
    backupReminderShown = true;
    uiPreferences.lastBackupReminderAt = now;
    saveUiPreferences();
    window.setTimeout(() => showToast('Your Pocket data has grown. Consider exporting an external backup for protection outside this browser.'), 450);
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
    if (view === 'more') { renderSettings(); maybeRemindExternalBackup(); }
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
    loadSecretThrottleState();
    const now = Date.now();
    if (now < secretLockoutUntil) {
      const seconds = Math.max(1, Math.ceil((secretLockoutUntil - now) / 1000));
      els.themePasswordError.textContent = `Too many attempts. Try again in ${seconds}s.`;
      setSecretPinEntry('');
      return;
    }
    const pin=els.themePassword.value;
    if(pin.length!==4 || !(await verifySecretPin(pin))){
      secretFailedAttempts += 1;
      const delay = secretAttemptDelay(secretFailedAttempts);
      if (delay) secretLockoutUntil = Date.now() + delay;
      saveSecretThrottleState();
      els.themePasswordError.textContent=delay ? `That code did not unlock Secret Pocket. Wait ${Math.ceil(delay/1000)}s before trying again.` : 'That code did not unlock Secret Pocket.';
      els.themePassword.classList.add('is-invalid'); els.themePassword.setAttribute('aria-invalid','true');
      els.themePassword.value=''; renderSecretPinDots(); return;
    }
    secretFailedAttempts = 0; secretLockoutUntil = 0; saveSecretThrottleState();
    const firstReveal=!secretConfig.firstRevealSeen; secretConfig.discovered=true; secretConfig.firstRevealSeen=true; setSecretPocketUnlocked(true,els.secretRememberUnlock.checked); saveSecretConfig(); state.settings.theme='light'; persistCurrentTheme(); closeDialog(els.themeUnlockDialog); renderAll(); playSecretReveal(firstReveal); showToast(firstReveal?'Secret Pocket unlocked ♡':'Secret Pocket unlocked.');
  }
  function renderSecretPocketSettings() {
    if(!els.secretPocketDialog) return; const unlocked=isSecretPocketUnlocked(); const lightMode=state.settings.theme==='light';
    els.secretThemeDark.classList.toggle('is-active',!lightMode); els.secretThemeLight.classList.toggle('is-active',lightMode); els.secretThemeDark.setAttribute('aria-pressed',lightMode?'false':'true'); els.secretThemeLight.setAttribute('aria-pressed',lightMode?'true':'false');
    els.secretCompanionSwitch.classList.toggle('is-on',secretConfig?.companionEnabled!==false); els.secretCompanionToggle.setAttribute('aria-checked',secretConfig?.companionEnabled!==false?'true':'false'); els.secretCompanionLabel.textContent=secretConfig?.companionEnabled!==false?'On · bunny is active':'Off · light theme stays available';
    els.secretCompanionSpeech.value=secretConfig?.companionSpeech||'normal'; els.secretCompanionMovement.value=secretConfig?.companionMovement||'normal'; if(els.secretCompanionPerformance) els.secretCompanionPerformance.value=secretConfig?.companionPerformance||'auto'; els.secretCompanionSpeech.disabled=secretConfig?.companionEnabled===false; els.secretCompanionMovement.disabled=secretConfig?.companionEnabled===false; if(els.secretCompanionPerformance) els.secretCompanionPerformance.disabled=secretConfig?.companionEnabled===false;
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
    persistCurrentTheme();
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
  function lockSecretPocket() { setSecretPocketUnlocked(false,false); state.settings.theme='dark'; persistCurrentTheme(); closeDialog(els.secretPocketDialog); renderAll(); syncSecretLightWorld({ force: true }); showToast('Secret Pocket locked.'); }
  function resetSecretPocketAccess() { const companionProfile=companionProfileState(); secretConfig=defaultSecretConfig(); secretConfig.companionProfile=companionProfile; secretFailedAttempts=0; secretLockoutUntil=0; saveSecretThrottleState(); saveSecretConfig(); try{sessionStorage.removeItem(SECRET_SESSION_KEY);localStorage.removeItem(SECRET_TRUST_KEY);}catch(error){} state.settings.theme='dark'; persistCurrentTheme(); closeDialog(els.secretPocketDialog); closeDialog(els.companionRoomDialog); renderAll(); syncSecretLightWorld({ force: true }); showToast('Secret Pocket access reset to the default code.'); }
  function openSecretPocketRecovery() { confirmAction('Reset Secret Pocket access?','This resets only the secret PIN and hidden appearance preferences. Wallets, transactions, savings, and allowance history are not changed.','Reset access',resetSecretPocketAccess); }
  function handleSecretVersionTap() { if(secretResetTriggered){secretResetTriggered=false;return;} if(secretConfig?.discovered){ if(isSecretPocketUnlocked()) openSecretPocketSettings(); else openThemeUnlock(); return; } secretTapCount+=1; window.clearTimeout(secretTapTimer); secretTapTimer=window.setTimeout(()=>{secretTapCount=0;},SECRET_TRIGGER_WINDOW); if(secretTapCount>=SECRET_TRIGGER_TAPS){window.clearTimeout(secretTapTimer);secretTapCount=0;openThemeUnlock();} }
  function startSecretRecoveryHold() { secretResetTriggered=false; window.clearTimeout(secretResetTimer); secretResetTimer=window.setTimeout(()=>{secretResetTriggered=true;openSecretPocketRecovery();},SECRET_RESET_HOLD); }
  function cancelSecretRecoveryHold() { window.clearTimeout(secretResetTimer); secretResetTimer=0; }

  function entryDateIsValid(date) {
    return validDateKey(date) && date <= localDateKey();
  }

  function archivedAccountUsedByTransaction(tx) {
    const ids = [tx?.accountId, tx?.fromAccountId, tx?.toAccountId].filter(Boolean);
    return ids.some((id) => state.accounts.find((account) => account.id === id)?.archivedAt);
  }

  function renderExpenseCategoryPicker(selected = '') {
    const picker = document.getElementById('categoryPicker');
    if (!picker) return;
    const all = expenseCategories(state, true);
    let selectedRecord = categoryRecord(selected, selected);
    let list = expenseCategories();
    if (selectedRecord?.archivedAt && !list.some((item) => item.id === selectedRecord.id)) list = [...list, selectedRecord];
    if (!list.length) list = defaultExpenseCategories();
    const selectedId = selectedRecord?.id || list[0]?.id || '';
    picker.innerHTML = `<legend>Category</legend>${list.map((category, index) => `<label${category.archivedAt ? ' class="is-archived"' : ''}><input type="radio" name="expenseCategory" value="${escapeHtml(category.id)}"${category.id === selectedId || (!selected && index === 0) ? ' checked' : ''}><span>${icon(category.icon || 'i-more')}${escapeHtml(category.name)}${category.archivedAt ? ' · archived' : ''}</span></label>`).join('')}`;
  }

  function renderCategoryManager() {
    if (!els.categoryManagerList) return;
    const categories = expenseCategories(state, true);
    const activeCount = categories.filter((item) => !item.archivedAt).length;
    if (els.categorySettingsSummary) els.categorySettingsSummary.textContent = `${activeCount} active categor${activeCount === 1 ? 'y' : 'ies'} · customize expense entry.`;
    els.categoryManagerList.innerHTML = categories.map((category, index) => `
      <div class="category-manager-row${category.archivedAt ? ' is-archived' : ''}">
        <span class="round-icon ${escapeHtml(category.tone || 'neutral-soft')}">${icon(category.icon || 'i-more')}</span>
        <div><strong>${escapeHtml(category.name)}</strong><small>${category.archivedAt ? 'Archived · old transactions stay intact' : 'Active for new expenses'}</small></div>
        <div class="category-manager-actions">
          ${!category.archivedAt ? `<button type="button" data-action="move-category-up" data-id="${escapeHtml(category.id)}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-action="move-category-down" data-id="${escapeHtml(category.id)}" ${index === categories.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-action="edit-category" data-id="${escapeHtml(category.id)}">Edit</button><button type="button" data-action="archive-category" data-id="${escapeHtml(category.id)}">Archive</button>` : `<button type="button" data-action="restore-category" data-id="${escapeHtml(category.id)}">Restore</button>`}
        </div>
      </div>`).join('');
  }

  function openCategoryManager() {
    els.categoryManagerForm.reset();
    els.categoryEditId.value = '';
    els.categorySaveButton.textContent = 'Add category';
    renderCategoryManager();
    openDialog(els.categoryManagerDialog);
  }

  function saveCategoryManagerForm() {
    const name = els.categoryName.value.trim().slice(0, 30);
    const iconId = CATEGORY_ICONS.has(els.categoryIcon.value) ? els.categoryIcon.value : 'i-more';
    if (!name) return;
    const editId = els.categoryEditId.value;
    const duplicate = state.categories.find((item) => item.id !== editId && item.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return showToast('That category name already exists.');
    if (editId) {
      const category = state.categories.find((item) => item.id === editId);
      if (!category) return;
      category.name = name;
      category.icon = iconId;
      showToast('Category updated. Existing transactions keep their original category label.');
    } else {
      state.categories.push({ id: uid('category'), name, icon: iconId, tone: CATEGORY_TONES[state.categories.length % CATEGORY_TONES.length], order: state.categories.length, archivedAt: null });
      showToast(`${name} added.`);
    }
    state.categories = normalizeCategories(state.categories);
    saveState();
    els.categoryManagerForm.reset();
    els.categoryEditId.value = '';
    els.categorySaveButton.textContent = 'Add category';
    renderCategoryManager();
    renderSettings();
  }

  function editCategory(id) {
    const category = state.categories.find((item) => item.id === id);
    if (!category) return;
    els.categoryEditId.value = category.id;
    els.categoryName.value = category.name;
    els.categoryIcon.value = CATEGORY_ICONS.has(category.icon) ? category.icon : 'i-more';
    els.categorySaveButton.textContent = 'Save category';
    els.categoryName.focus({ preventScroll: true });
  }

  function archiveCategory(id) {
    const category = state.categories.find((item) => item.id === id && !item.archivedAt);
    if (!category) return;
    if (expenseCategories().length <= 1) return showToast('Keep at least one active expense category.');
    category.archivedAt = new Date().toISOString();
    saveState(); renderCategoryManager(); renderSettings();
    showToast(`${category.name} archived. Old transactions remain unchanged.`);
  }

  function restoreCategory(id) {
    const category = state.categories.find((item) => item.id === id && item.archivedAt);
    if (!category) return;
    category.archivedAt = null;
    saveState(); renderCategoryManager(); renderSettings();
    showToast(`${category.name} restored.`);
  }

  function moveCategory(id, direction) {
    const ordered = expenseCategories(state, true);
    const index = ordered.findIndex((item) => item.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    ordered.forEach((item, order) => { const target = state.categories.find((category) => category.id === item.id); if (target) target.order = order; });
    state.categories = normalizeCategories(state.categories);
    saveState(); renderCategoryManager();
  }

  function openExpense(prefill = {}) {
    currentExpenseEditId = prefill.id || null;
    currentCorrectionSourceId = prefill.correctionOf || null;
    els.expenseForm.reset();
    els.expenseDialogTitle.textContent = currentCorrectionSourceId ? 'Correct expense' : currentExpenseEditId ? 'Edit expense' : 'Add expense';
    els.expenseAmount.value = prefill.amount || '';
    renderExpenseCategoryPicker(prefill.categoryId || prefill.category || '');
    els.expenseNote.value = prefill.note || '';
    els.expenseDate.max = localDateKey();
    els.expenseDate.value = prefill.date || localDateKey();
    populateAccounts();
    if (prefill.accountId && activeAccounts().some((account) => account.id === prefill.accountId)) els.expenseAccount.value = prefill.accountId;
    syncWalletPickerTriggers();
    updateExpenseEntry();
    showExpenseStep('amount');
    openDialog(els.expenseDialog);
    requestAnimationFrame(() => els.expenseDialog.focus());
  }

  function openDifferentAllowance(prefill = {}) {
    currentAllowanceEditId = prefill.id || null;
    currentCorrectionSourceId = prefill.correctionOf || null;
    els.allowanceForm.reset();
    els.allowanceDialogTitle.textContent = currentCorrectionSourceId ? 'Correct allowance' : currentAllowanceEditId ? 'Edit allowance' : 'Add allowance';
    setAllowanceAmountValue(prefill.amount || '');
    populateAccounts();
    els.allowanceReceivedDate.max = localDateKey();
    els.allowanceReceivedDate.value = prefill.date || localDateKey();
    const targetAccount = prefill.accountId || activeAccounts()[0]?.id;
    if (targetAccount && activeAccounts().some((account) => account.id === targetAccount)) els.allowanceAccount.value = targetAccount;
    syncWalletPickerTriggers();
    els.allowanceKeypad.classList.add('is-hidden');
    els.allowanceCustomAmountButton.textContent = 'Custom amount';
    els.allowanceSaveButton.textContent = currentCorrectionSourceId ? 'Save correction' : currentAllowanceEditId ? 'Update allowance' : 'Add allowance';
    els.allowanceSaveButton.disabled = !(Number(els.allowanceAmount.value || 0) > 0);
    openDialog(els.allowanceDialog);
    requestAnimationFrame(() => els.allowanceDialog.focus());
  }

  function correctionReversalFor(original, groupId) {
    return {
      id: uid('tx'),
      type: 'correction_reversal',
      originalType: original.type,
      amount: original.type === 'reconciliation' ? moneyRound(-Number(original.amount || 0)) : Math.abs(transactionAmount(original)),
      category: 'Correction',
      accountId: original.accountId || '',
      goalId: original.goalId || '',
      fromAccountId: original.fromAccountId || '',
      toAccountId: original.toAccountId || '',
      date: original.date || localDateKey(),
      note: `Audit reversal of ${transactionTitle(original)}`,
      reconciliationReason: original.reconciliationReason || '',
      reconciliationNote: original.reconciliationNote || '',
      savingsAction: original.savingsAction || undefined,
      savingsNote: original.savingsNote || '',
      withdrawalReason: original.withdrawalReason || '',
      correctionGroupId: groupId,
      correctsTransactionId: original.id,
      createdAt: new Date().toISOString()
    };
  }

  function createCorrectionPair(originalId, replacement) {
    const original = state.transactions.find((tx) => tx.id === originalId);
    if (!original || !canCorrectTransaction(original) || original.correctedByGroupId) {
      showToast('This entry cannot be corrected from its current state.');
      return null;
    }
    const groupId = uid('correction');
    const candidate = cloneStateSnapshot(state);
    const source = candidate.transactions.find((tx) => tx.id === originalId);
    source.correctedByGroupId = groupId;
    const reversal = correctionReversalFor(source, groupId);
    const corrected = {
      ...replacement,
      id: uid('tx'),
      type: original.type,
      category: replacement.category || original.category || '',
      correctionGroupId: groupId,
      correctsTransactionId: original.id,
      createdAt: new Date(Date.now() + 1).toISOString()
    };
    candidate.transactions.push(reversal, corrected);
    if (!validateCandidateBalances(candidate, 'That correction would make a wallet balance negative.')) return null;
    if (!validateCandidateGoals(candidate, 'That correction would make a savings goal negative.')) return null;
    if (!validateCandidateSavingsProvenance(candidate, 'That correction would break the wallet source of a savings goal.')) return null;
    state = candidate;

    saveState();
    return corrected;
  }

  function receiveAllowance(amount, receivedDate = localDateKey(), accountId = activeAccounts()[0]?.id) {
    const received = moneyRound(amount);
    if (!received || !accountId) return;
    if (!entryDateIsValid(receivedDate)) {
      showToast('Choose today or a past date for the allowance.');
      return;
    }
    state.transactions.push({
      id: uid('tx'), type: 'income', amount: received, category: 'Allowance', accountId,
      date: receivedDate, note: 'Allowance received', createdAt: new Date().toISOString()
    });

    saveState();
    closeDialog(els.allowanceDialog);
    renderAll();
    const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
    const dateText = receivedDate === localDateKey() ? 'today' : DATE_LABEL.format(fromDateKey(receivedDate));
    showToast(state.settings.privacy ? `Allowance added to ${walletName}.` : `${currency(received)} added to ${walletName} for ${dateText}.`);
    companionReact('allowance');
  }

  function updateAllowanceTransaction(id, amount, receivedDate, accountId) {
    const income = state.transactions.find((tx) => tx.id === id && tx.type === 'income');
    if (!income || !canModifyTransaction(income)) {
      showToast('This allowance entry is locked. Use Correct for an auditable adjustment.');
      return false;
    }
    if (!entryDateIsValid(receivedDate)) {
      showToast('Choose today or a past date for the allowance.');
      return false;
    }
    const candidate = cloneStateSnapshot(state);
    const next = candidate.transactions.find((tx) => tx.id === id);
    Object.assign(next, { amount: moneyRound(amount), accountId, date: receivedDate, note: 'Allowance received', updatedAt: new Date().toISOString() });
    if (!validateCandidateBalances(candidate, 'That edit would make a wallet balance negative.')) return false;
    state = candidate;

    saveState();
    return true;
  }

  function addAllowance() {
    const amount = moneyRound(els.allowanceAmount.value);
    if (amount <= 0) return;
    const date = els.allowanceReceivedDate.value || localDateKey();
    const accountId = els.allowanceAccount.value || activeAccounts()[0]?.id;
    if (!entryDateIsValid(date) || !accountId) return showToast('Choose a valid received date and wallet.');
    if (currentCorrectionSourceId) {
      const corrected = createCorrectionPair(currentCorrectionSourceId, { amount, accountId, date, note: 'Allowance received' });
      if (!corrected) return;
      closeDialog(els.allowanceDialog);
      currentCorrectionSourceId = null;
      renderAll();
      showToast('Allowance correction recorded without changing the original history.');
      companionReact('allowance');
      return;
    }
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
    const savedLabel = edited ? 'Updated' : tx.correctsTransactionId ? 'Corrected' : 'Saved';
    els.expenseReceiptDialog.dataset.transactionId = tx.id;
    lastReceiptTransactionId = tx.id;
    els.expenseReceiptContent.innerHTML = `
      <div class="receipt-head">
        <div><small class="eyebrow">Pocket receipt</small><strong>${escapeHtml(tx.category || 'Expense')}</strong></div>
        <span class="receipt-stamp">${savedLabel}</span>
      </div>
      <div class="receipt-amount money-value">${privateCurrency(tx.amount)}</div>
      <div class="receipt-divider"></div>
      <div class="receipt-lines">
        <div class="receipt-line"><span>Paid from</span><strong>${escapeHtml(account)}</strong></div>
        <div class="receipt-line"><span>Date</span><strong>${escapeHtml(DATE_LABEL.format(fromDateKey(tx.date)))}</strong></div>
      </div>
      ${tx.note ? `<div class="receipt-note">${escapeHtml(tx.note)}</div>` : ''}`;
    openDialog(els.expenseReceiptDialog);
  }

  function addExpense() {
    const amount = moneyRound(els.expenseAmount.value);
    if (amount <= 0) return;
    const categoryId = els.expenseForm.elements.expenseCategory.value;
    const categoryRecordValue = categoryRecord(categoryId) || expenseCategories()[0];
    const category = categoryRecordValue?.name || 'Other';
    const accountId = els.expenseAccount.value || activeAccounts()[0]?.id;
    const date = els.expenseDate.value || localDateKey();
    const note = els.expenseNote.value.trim();
    if (!entryDateIsValid(date) || !accountId) return showToast('Choose a valid expense date and wallet.');
    const sourceId = currentExpenseEditId || currentCorrectionSourceId;
    const available = spendableAvailableForEntry(accountId, sourceId);
    if (toCents(amount) > toCents(available)) {
      const accountName = state.accounts.find((account) => account.id === accountId)?.name || 'this wallet';
      showToast(state.settings.privacy ? `${accountName} does not have enough available money.` : `Only ${currency(Math.max(0, available))} is available in ${accountName}. Savings stays separate.`);
      return;
    }

    let savedTransaction;
    let edited = false;
    if (currentCorrectionSourceId) {
      savedTransaction = createCorrectionPair(currentCorrectionSourceId, { amount, category, categoryId, accountId, date, note });
      if (!savedTransaction) return;
    } else if (currentExpenseEditId) {
      const tx = state.transactions.find((item) => item.id === currentExpenseEditId && item.type === 'expense');
      if (!tx || !canModifyTransaction(tx)) return showToast('This transaction is locked. Use Correct instead.');
      const candidate = cloneStateSnapshot(state);
      const next = candidate.transactions.find((item) => item.id === currentExpenseEditId);
      Object.assign(next, { amount, category, categoryId, accountId, date, note, updatedAt: new Date().toISOString() });
      if (!validateCandidateBalances(candidate, 'That expense edit would make a wallet balance negative.')) return;
      state = candidate;
      savedTransaction = state.transactions.find((item) => item.id === currentExpenseEditId);
      edited = true;
    } else {
      savedTransaction = { id: uid('tx'), type: 'expense', amount, category, categoryId, accountId, date, note, createdAt: new Date().toISOString() };
      state.transactions.push(savedTransaction);
    }


    saveState();
    closeDialog(els.expenseDialog);
    renderAll();
    renderExpenseReceipt(savedTransaction, edited);
    pendingCompanionReaction = { kind: 'expense', message: edited ? 'Updated and tidy again ♡' : savedTransaction.correctsTransactionId ? 'Correction saved and history kept tidy ♡' : '' };
    currentExpenseEditId = null;
    currentCorrectionSourceId = null;
  }

  function transferAvailableBalance(accountId, editingTransferId = null) {
    let cents = accountBalanceCentsForState(state, accountId);
    if (!editingTransferId) return fromCents(Math.max(0, cents));
    const original = state.transactions.find((tx) => tx.id === editingTransferId && tx.type === 'transfer');
    if (original) {
      const amountCents = toCents(original.amount || 0);
      // Calculate the balance as if the original transfer were removed first.
      if (original.fromAccountId === accountId) cents += amountCents;
      if (original.toAccountId === accountId) cents -= amountCents;
    }
    return fromCents(Math.max(0, cents));
  }

  function populateTransferAccounts(preferredFrom = '', preferredTo = '') {
    const accounts = activeAccounts();
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
    const amount = moneyRound(els.transferAmount.value || 0);
    const from = state.accounts.find((account) => account.id === fromId);
    const to = state.accounts.find((account) => account.id === toId);
    const sourceId = currentTransferEditId || currentCorrectionSourceId;
    const available = transferAvailableBalance(fromId, sourceId);
    const sameWallet = !fromId || !toId || fromId === toId;
    const valid = amount > 0 && !sameWallet;
    const over = valid && toCents(amount) > toCents(available);
    els.transferAvailable.textContent = state.settings.privacy ? 'Available ₱••••' : `Available ${currency(available)}`;
    els.transferAmountCard.classList.toggle('is-over-limit', over || sameWallet);
    if (sameWallet) els.transferAmountHint.textContent = 'Choose two different wallets.';
    else if (available <= 0) els.transferAmountHint.textContent = `${from?.name || 'This wallet'} has no spendable money to transfer.`;
    else if (over) els.transferAmountHint.textContent = state.settings.privacy ? 'This is more than the source wallet has available.' : `${currency(amount - available)} over the available ${from?.name || 'wallet'} balance.`;
    else if (valid) els.transferAmountHint.textContent = state.settings.privacy ? `Money will move from ${from?.name || 'source'} to ${to?.name || 'destination'}.` : `${currency(available - amount)} will remain in ${from?.name || 'the source wallet'}.`;
    else els.transferAmountHint.textContent = `Move money from ${from?.name || 'one wallet'} to ${to?.name || 'another wallet'}.`;
    els.transferSaveButton.disabled = !valid || over;
    els.transferSaveButton.textContent = valid ? `${currentCorrectionSourceId ? 'Correct' : currentTransferEditId ? 'Update' : 'Transfer'} ${state.settings.privacy ? '₱••••' : currency(amount)}` : (currentCorrectionSourceId ? 'Save correction' : currentTransferEditId ? 'Update transfer' : 'Transfer');
  }

  function openTransfer(prefill = {}) {
    if (activeAccounts().length < 2) {
      setView('more');
      showToast('Add another active wallet first, then you can transfer between wallets.');
      openWallet();
      return;
    }
    currentTransferEditId = prefill.id || null;
    currentCorrectionSourceId = prefill.correctionOf || null;
    els.transferForm.reset();
    els.transferDialogTitle.textContent = currentCorrectionSourceId ? 'Correct transfer' : currentTransferEditId ? 'Edit transfer' : 'Move money';
    populateTransferAccounts(prefill.fromAccountId || selectedWalletAccount()?.id || '', prefill.toAccountId || '');
    els.transferNote.value = prefill.note || '';
    els.transferAmount.value = prefill.amount || '';
    els.transferDate.max = localDateKey();
    els.transferDate.value = prefill.date || localDateKey();
    updateTransferEntry();
    openDialog(els.transferDialog);
    requestAnimationFrame(() => els.transferDialog.focus());
  }

  function saveTransfer() {
    const amount = moneyRound(els.transferAmount.value || 0);
    const fromAccountId = els.transferFromAccount.value;
    const toAccountId = els.transferToAccount.value;
    const date = els.transferDate.value || localDateKey();
    const note = els.transferNote.value.trim();
    if (amount <= 0 || !fromAccountId || !toAccountId || fromAccountId === toAccountId || !entryDateIsValid(date)) return;
    const sourceId = currentTransferEditId || currentCorrectionSourceId;
    const available = transferAvailableBalance(fromAccountId, sourceId);
    if (toCents(amount) > toCents(available)) {
      const name = state.accounts.find((account) => account.id === fromAccountId)?.name || 'source wallet';
      showToast(state.settings.privacy ? `${name} does not have enough available money.` : `Only ${currency(Math.max(0, available))} is available in ${name}.`);
      return;
    }

    let tx;
    let edited = false;
    if (currentCorrectionSourceId) {
      tx = createCorrectionPair(currentCorrectionSourceId, { amount, fromAccountId, toAccountId, date, note, category: 'Transfer' });
      if (!tx) return;
    } else if (currentTransferEditId) {
      const original = state.transactions.find((item) => item.id === currentTransferEditId && item.type === 'transfer');
      if (!original || !canModifyTransaction(original)) return showToast('This transfer is locked. Use Correct instead.');
      const candidate = cloneStateSnapshot(state);
      const next = candidate.transactions.find((item) => item.id === currentTransferEditId);
      Object.assign(next, { amount, fromAccountId, toAccountId, date, note, category: 'Transfer', updatedAt: new Date().toISOString() });
      if (!validateCandidateBalances(candidate, 'That transfer edit would make a wallet balance negative.')) return;
      state = candidate;
      tx = state.transactions.find((item) => item.id === currentTransferEditId);
      edited = true;
    } else {
      tx = { id: uid('tx'), type: 'transfer', category: 'Transfer', amount, fromAccountId, toAccountId, date, note, createdAt: new Date().toISOString() };
      state.transactions.push(tx);
    }

    saveState();
    closeDialog(els.transferDialog);
    renderAll();
    const from = state.accounts.find((account) => account.id === fromAccountId)?.name || 'wallet';
    const to = state.accounts.find((account) => account.id === toAccountId)?.name || 'wallet';
    showToast(state.settings.privacy ? (currentCorrectionSourceId ? 'Transfer correction recorded.' : edited ? 'Transfer updated.' : 'Transfer completed.') : `${currency(amount)} ${currentCorrectionSourceId ? 'corrected' : edited ? 'updated' : 'moved'} from ${from} to ${to}.`);
    currentTransferEditId = null;
    currentCorrectionSourceId = null;
    companionReact('transfer');
  }

  function setGoalDialogMode(mode, goal = null) {
    const editing = Boolean(mode === 'edit' && goal);
    currentGoalEditId = editing ? goal.id : null;
    els.goalDialogTitle.textContent = editing ? 'Edit goal' : 'Create a goal';
    els.goalSubmitButton.textContent = editing ? 'Save changes' : 'Create goal';
    els.goalDialog.querySelectorAll('.goal-create-only').forEach((element) => {
      element.classList.toggle('is-hidden', editing);
      element.querySelectorAll('input, select, button').forEach((control) => { control.disabled = editing; });
    });
  }

  function openGoal(preferredAccountId = '') {
    els.goalForm.reset();
    els.goalCurrent.value = '0';
    els.goalSaveDate.max = localDateKey();
    els.goalSaveDate.value = localDateKey();
    setGoalDialogMode('create');
    populateAccounts();
    const preferredGoalAccount = preferredAccountId || (savingsMode === 'wallet' ? activeAccounts()[savingsWalletIndex]?.id : activeAccounts()[0]?.id);
    if (preferredGoalAccount && activeAccounts().some((account) => account.id === preferredGoalAccount)) els.goalAccount.value = preferredGoalAccount;
    syncWalletPickerTriggers();
    openDialog(els.goalDialog);
  }

  function openGoalEditor(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !goalIsWithdrawn(item));
    if (!goal) return;
    els.goalForm.reset();
    populateAccounts();
    setGoalDialogMode('edit', goal);
    els.goalName.value = goal.name || '';
    els.goalTarget.value = String(Math.max(0.01, Number(goal.target || 0.01)));
    els.goalCurrent.value = '0';
    syncWalletPickerTriggers();
    openDialog(els.goalDialog);
  }

  function applyGoalTargetChange(goal, nextTarget, note = 'Target amount changed') {
    if (!goal) return;
    const previousTarget = moneyRound(goal.target || 0);
    const target = Math.max(.01, moneyRound(nextTarget));
    if (toCents(previousTarget) === toCents(target)) return;
    const wasComplete = Boolean(goal.completedAt) || rawGoalCurrentCents(goal, state) >= toCents(previousTarget);
    const now = new Date().toISOString();
    goal.target = target;
    goal.updatedAt = now;
    resetGoalMilestoneCycle(goal, target);
    addGoalEvent(goal.id, 'target_changed', { fromValue: String(previousTarget), toValue: String(target), note });
    const isComplete = rawGoalCurrentCents(goal, state) >= toCents(target);
    if (isComplete && !wasComplete) {
      goal.completedAt = now;
      addGoalEvent(goal.id, 'completed_by_target_change', { note: 'Goal became complete because its target changed' });
    } else if (!isComplete && wasComplete) {
      goal.completedAt = undefined;
      addGoalEvent(goal.id, 'reopened_by_target_change', { note: 'Goal reopened because its target increased' });
    }
  }

  function revertGoalTargetEvent(eventId) {
    const event = (state.goalEvents || []).find((item) => item.id === eventId && item.type === 'target_changed');
    const goal = event ? state.goals.find((item) => item.id === event.goalId && !goalIsWithdrawn(item)) : null;
    if (!event || !goal || event.fromValue === undefined || event.toValue === undefined) return;
    if (toCents(goal.target) !== toCents(event.toValue)) return showToast('This target changed again later, so that older history entry cannot be reverted directly.');
    const previous = moneyRound(goal.target);
    const restored = Math.max(.01, moneyRound(event.fromValue));
    confirmAction('Revert this goal target?', state.settings.privacy ? 'Pocket will restore the previous target and start a fresh milestone cycle for that target.' : `Restore the target from ${currency(previous)} to ${currency(restored)}? Savings stay untouched and milestone tracking recalibrates to the restored target.`, 'Revert target', () => {
      applyGoalTargetChange(goal, restored, 'Target change reverted');
      saveState(); renderAll(); renderGoalHistory(); showToast('Goal target restored.');
    });
  }

  function applyGoalEdit(goal, name, target) {
    const previousName = goal.name;
    goal.name = name;
    goal.updatedAt = new Date().toISOString();
    if (previousName !== name) addGoalEvent(goal.id, 'renamed', { fromValue: previousName, toValue: name, note: `Renamed from ${previousName} to ${name}` });
    applyGoalTargetChange(goal, target);

    saveState();
    renderAll();
    setView('savings');
    showToast(`“${name}” updated.`);
  }

  function saveGoalForm() {
    const name = els.goalName.value.trim();
    const target = moneyRound(els.goalTarget.value);
    if (!name || target <= 0) return;
    if (currentGoalEditId) {
      const goal = state.goals.find((item) => item.id === currentGoalEditId && goalIsActive(item));
      if (!goal) return;
      const saved = goalCurrent(goal);
      closeDialog(els.goalDialog);
      currentGoalEditId = null;
      if (toCents(target) < toCents(saved)) {
        const message = state.settings.privacy
          ? 'The new target is below the amount already saved. Your saved money will stay untouched and the goal will show as completed.'
          : `The new ${currency(target)} target is below ${currency(saved)} already saved. Your savings will stay untouched and the goal will show as completed.`;
        confirmAction('Lower this goal target?', message, 'Save lower target', () => applyGoalEdit(goal, name, target));
      } else applyGoalEdit(goal, name, target);
      return;
    }

    const requested = Math.max(0, moneyRound(els.goalCurrent.value || 0));
    const accountId = els.goalAccount.value || activeAccounts()[0]?.id;
    const saveDate = els.goalSaveDate.value || localDateKey();
    if (!accountId || !entryDateIsValid(saveDate)) return showToast('Choose a valid savings date and wallet.');
    const startingAmount = requested;
    const available = accountBalance(accountId);
    if (toCents(startingAmount) > toCents(available)) {
      const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
      showToast(state.settings.privacy ? `${walletName} does not have enough available money.` : `You only have ${currency(Math.max(0, available))} available in ${walletName}.`);
      return;
    }
    const goal = { id: uid('goal'), name, target, openingSaved: 0, openingAllocations: [], legacyAttributionPending: false, createdAt: saveDate, milestoneVersion: 1, milestoneTarget: target, milestones: [] };
    state.goals.push(goal);
    addGoalEvent(goal.id, 'created', { toValue: String(target), note: 'Savings goal created', date: saveDate });
    if (startingAmount > 0) state.transactions.push({ id: uid('tx'), type: 'saving', amount: startingAmount, category: 'Savings', accountId, date: saveDate, note: name, goalId: goal.id, savingsAction: 'contribution', createdAt: new Date().toISOString() });

    milestoneEffectiveDateHint = saveDate;
    savingsGoalPage = Math.max(0, Math.ceil(state.goals.filter((item) => goalIsActive(item)).length / savingsGoalsPerPage()) - 1);
    saveState();
    closeDialog(els.goalDialog);
    renderAll();
    setView('savings');
    if (startingAmount > 0) celebrateSavings();
    companionReact(toCents(startingAmount) >= toCents(target) ? 'complete' : 'goal');
    showToast(`“${name}” goal created.`);
  }

  function archiveGoal(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && goalIsActive(item));
    if (!goal) return;
    confirmAction(`Archive “${goal.name}”?`, 'The goal and its savings stay in Pocket, but it moves out of your active goal carousel. You can restore it anytime.', 'Archive goal', () => {
      goal.archivedAt = new Date().toISOString();
      addGoalEvent(goal.id, 'archived', { note: 'Goal archived' });
      manageGoalsMode = false;
      saveState(); renderAll(); showToast(`“${goal.name}” archived.`, 'Restore', () => restoreArchivedGoal(goal.id));
    });
  }

  function restoreArchivedGoal(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && goalIsArchived(item));
    if (!goal) return;
    goal.archivedAt = undefined;
    addGoalEvent(goal.id, 'restored', { note: 'Goal restored from archive' });
    savingsGoalPage = Math.max(0, Math.ceil(state.goals.filter((item) => goalIsActive(item)).length / savingsGoalsPerPage()) - 1);
    saveState(); renderAll(); showToast(`“${goal.name}” restored to active goals.`);
  }

  function deleteGoal(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !goalIsWithdrawn(item));
    if (!goal) return;
    if (!ensureGoalProvenanceReviewed(goal)) return;
    const saved = goalCurrent(goal);
    const breakdown = goalWalletBreakdown(goal);
    const returnCopy = breakdown.map(({ account, amount }) => `${privateCurrency(amount)} → ${account.name}`).join(' · ');
    const message = saved > 0
      ? `This permanently deletes the selected goal from Savings. Pocket will first return ${state.settings.privacy ? 'its saved money' : privateCurrency(saved)} to the wallet${breakdown.length === 1 ? '' : 's'} it came from${returnCopy ? ` (${returnCopy})` : ''}. The goal will not appear in Past goals and cannot be restored.`
      : 'This permanently deletes the selected goal from Savings. It will not appear in Past goals and cannot be restored.';
    confirmAction(`Delete “${goal.name}”?`, message, 'Delete goal', () => {
      const now = Date.now();
      const groupId = uid('goal-delete');
      breakdown.forEach(({ account, amount }, index) => {
        if (toCents(amount) <= 0) return;
        state.transactions.push({
          id: uid('tx'),
          type: 'saving_return',
          amount: moneyRound(amount),
          category: 'Savings return',
          accountId: account.id,
          goalId: goal.id,
          date: localDateKey(),
          note: `Returned from deleted goal ${goal.name}`,
          savingsAction: 'goal_delete_return',
          withdrawalReason: 'Goal deleted',
          goalLifecycleGroupId: groupId,
          createdAt: new Date(now + index).toISOString()
        });
      });

      // Keep a hidden tombstone internally so historical ledger references remain valid,
      // but the goal is permanently removed from every user-facing Savings list.
      goal.withdrawnAt = new Date().toISOString();
      goal.removedAt = goal.withdrawnAt;
      goal.withdrawalGroupId = groupId;
      goal.returnedToWallets = true;
      goal.archivedAt = undefined;
      addGoalEvent(goal.id, 'withdrawn', { note: saved > 0 ? 'Goal deleted and savings returned to source wallets' : 'Goal deleted' });
      if (!state.goals.some((item) => goalIsActive(item))) manageGoalsMode = false;
      saveState();
      renderAll();
      showToast(saved > 0 ? 'Goal deleted. Savings were returned to the source wallet(s).' : 'Goal deleted.');
    });
  }

  function removeGoal(goalId) { deleteGoal(goalId); }

  function allocateGoalTransferByWallet(goal, amount) {
    const pools = goalWalletBreakdown(goal).map(({ account, amount: walletAmount }) => ({ accountId: account.id, cents: Math.max(0, toCents(walletAmount)) })).filter((item) => item.cents > 0);
    const totalCents = pools.reduce((sum, item) => sum + item.cents, 0);
    const requestedCents = Math.max(0, toCents(amount));
    if (!requestedCents || requestedCents > totalCents) return [];
    let remaining = requestedCents;
    const allocations = pools.map((pool, index) => {
      if (index === pools.length - 1) {
        const cents = Math.min(pool.cents, remaining); remaining -= cents; return { accountId: pool.accountId, cents };
      }
      const proportional = Math.floor(requestedCents * (pool.cents / totalCents));
      const cents = Math.min(pool.cents, proportional, remaining); remaining -= cents; return { accountId: pool.accountId, cents };
    });
    while (remaining > 0) {
      let moved = false;
      for (const allocation of allocations) {
        if (remaining <= 0) break;
        const pool = pools.find((item) => item.accountId === allocation.accountId);
        if (!pool || allocation.cents >= pool.cents) continue;
        allocation.cents += 1; remaining -= 1; moved = true;
      }
      if (!moved) break;
    }
    return allocations.filter((item) => item.cents > 0).map((item) => ({ accountId: item.accountId, amount: fromCents(item.cents) }));
  }

  function allocateGoalTransferForEdit(goal, amount, original = null) {
    if (!original || original.fromGoalId !== goal?.id) return allocateGoalTransferByWallet(goal, amount);
    const pools = new Map(goalWalletBreakdown(goal).map(({ account, amount: walletAmount }) => [account.id, Math.max(0, toCents(walletAmount))]));
    (original.allocations || []).forEach((item) => pools.set(item.accountId, (pools.get(item.accountId) || 0) + Math.max(0, toCents(item.amount || 0))));
    const available = [...pools.entries()].filter(([, cents]) => cents > 0).map(([accountId, cents]) => ({ accountId, cents }));
    const totalCents = available.reduce((sum, item) => sum + item.cents, 0);
    const requestedCents = Math.max(0, toCents(amount));
    if (!requestedCents || requestedCents > totalCents) return [];
    let remaining = requestedCents;
    const allocations = available.map((pool, index) => {
      if (index === available.length - 1) {
        const cents = Math.min(pool.cents, remaining); remaining -= cents; return { accountId: pool.accountId, cents };
      }
      const proportional = Math.floor(requestedCents * (pool.cents / totalCents));
      const cents = Math.min(pool.cents, proportional, remaining); remaining -= cents; return { accountId: pool.accountId, cents };
    });
    while (remaining > 0) {
      let moved = false;
      for (const allocation of allocations) {
        if (remaining <= 0) break;
        const pool = available.find((item) => item.accountId === allocation.accountId);
        if (!pool || allocation.cents >= pool.cents) continue;
        allocation.cents += 1; remaining -= 1; moved = true;
      }
      if (!moved) break;
    }
    return allocations.filter((item) => item.cents > 0).map((item) => ({ accountId: item.accountId, amount: fromCents(item.cents) }));
  }

  function currentGoalTransferSourceRecord() {
    const id = currentGoalTransferEditId || currentGoalTransferCorrectionId;
    return id ? state.goalTransfers.find((item) => item.id === id) : null;
  }

  function updateGoalTransferEntry() {
    const source = state.goals.find((item) => item.id === els.goalTransferFromGoalId.value && goalIsActive(item));
    const original = currentGoalTransferSourceRecord();
    const amount = moneyRound(els.goalTransferAmount.value || 0);
    let availableCents = source ? goalCurrentCents(source) : 0;
    if (original && original.fromGoalId === source?.id) availableCents += toCents(original.amount || 0);
    const available = fromCents(Math.max(0, availableCents));
    const destination = els.goalTransferDestinations.querySelector('input[name="goalTransferDestination"]:checked')?.value || '';
    const valid = Boolean(source && destination && source.id !== destination && amount > 0 && toCents(amount) <= availableCents && entryDateIsValid(els.goalTransferDate.value || localDateKey()));
    els.goalTransferAvailable.textContent = state.settings.privacy ? 'Available ₱••••' : `Available ${currency(available)}`;
    els.goalTransferAmountCard.classList.toggle('is-over-limit', toCents(amount) > availableCents && amount > 0);
    if (!amount) els.goalTransferHint.textContent = currentGoalTransferCorrectionId ? 'The original transfer stays in history; this creates an auditable correction.' : currentGoalTransferEditId ? 'Edit the transfer while it is still within the 24-hour window.' : 'Wallet origin stays attached to the savings.';
    else if (toCents(amount) > availableCents) els.goalTransferHint.textContent = state.settings.privacy ? 'That is more than this goal can support.' : `${currency(amount - available)} over this goal’s available savings.`;
    else els.goalTransferHint.textContent = 'This stays in Savings and keeps its original wallet source.';
    els.goalTransferSaveButton.disabled = !valid;
    const verb = currentGoalTransferCorrectionId ? 'Correct' : currentGoalTransferEditId ? 'Update' : 'Transfer';
    els.goalTransferSaveButton.textContent = amount > 0 ? `${verb} ${state.settings.privacy ? '₱••••' : currency(amount)}` : (currentGoalTransferCorrectionId ? 'Save correction' : currentGoalTransferEditId ? 'Update transfer' : 'Transfer savings');
  }

  function handleGoalTransferKey(key) {
    els.goalTransferAmount.value = applyAmountKey(els.goalTransferAmount.value || '', key, { allowDecimal: true, maxWholeDigits: 8 });
    updateGoalTransferEntry();
  }

  function openGoalTransfer(goalId, options = {}) {
    const original = options.transferId ? state.goalTransfers.find((item) => item.id === options.transferId) : null;
    const sourceId = original?.fromGoalId || goalId;
    const source = state.goals.find((item) => item.id === sourceId && goalIsActive(item));
    if (!source) return;
    if (!ensureGoalProvenanceReviewed(source)) return;
    const destinations = state.goals.filter((item) => goalIsActive(item) && item.id !== source.id);
    if (!destinations.length) return showToast('Create or restore another active savings goal before transferring savings.');
    currentGoalTransferEditId = options.mode === 'edit' ? original?.id || null : null;
    currentGoalTransferCorrectionId = options.mode === 'correct' ? original?.id || null : null;
    els.goalTransferForm.reset();
    els.goalTransferFromGoalId.value = source.id;
    els.goalTransferAmount.value = original ? String(original.amount) : '';
    els.goalTransferDate.max = localDateKey();
    els.goalTransferDate.value = original?.date || localDateKey();
    const sourceBreakdown = goalWalletBreakdown(source);
    const sourceDetail = sourceBreakdown.map(({ account, amount }) => `${account.name} ${privateCurrency(amount)}`).join(' · ');
    els.goalTransferSource.innerHTML = `<span class="round-icon purple-soft">${icon('i-savings')}</span><div><small>${original ? (options.mode === 'correct' ? 'Correct transfer from' : 'Edit transfer from') : 'From'}</small><strong>${escapeHtml(source.name)}</strong><p>${escapeHtml(sourceDetail || 'No savings available')}</p></div>`;
    els.goalTransferDestinations.innerHTML = `<legend>Move to</legend>${destinations.map((goal, index) => `<label><input type="radio" name="goalTransferDestination" value="${escapeHtml(goal.id)}"${(original?.toGoalId ? goal.id === original.toGoalId : index === 0) ? ' checked' : ''}><span>${icon('i-target')}<b>${escapeHtml(goal.name)}</b><small>${state.settings.privacy ? '₱•••• saved' : `${currency(goalCurrent(goal))} saved`}</small></span></label>`).join('')}`;
    updateGoalTransferEntry();
    openDialog(els.goalTransferDialog);
    requestAnimationFrame(() => els.goalTransferDialog.focus());
  }

  function createGoalTransferCorrection(original, replacement) {
    if (!original || !canCorrectGoalTransfer(original)) return null;
    const candidate = cloneStateSnapshot(state);
    const source = candidate.goalTransfers.find((item) => item.id === original.id);
    const groupId = uid('goal-transfer-correction');
    source.correctedByGroupId = groupId;
    const reversal = goalTransferReversalFor(source, groupId);
    const corrected = normalizeGoalTransfer({ ...replacement, id: uid('goal-transfer'), correctionGroupId: groupId, correctsGoalTransferId: source.id, createdAt: new Date(Date.now() + 1).toISOString() });
    candidate.goalTransfers.push(reversal, corrected);
    if (!validateCandidateGoals(candidate, 'That correction would make a savings goal negative.')) return null;
    if (!validateCandidateSavingsProvenance(candidate, 'That correction would break wallet-level savings provenance.')) return null;
    state = candidate;
    return corrected;
  }

  function transferGoalSavings() {
    const source = state.goals.find((item) => item.id === els.goalTransferFromGoalId.value && goalIsActive(item));
    const destinationId = els.goalTransferDestinations.querySelector('input[name="goalTransferDestination"]:checked')?.value || '';
    const destination = state.goals.find((item) => item.id === destinationId && goalIsActive(item));
    const amount = moneyRound(els.goalTransferAmount.value || 0);
    const date = els.goalTransferDate.value || localDateKey();
    const original = currentGoalTransferSourceRecord();
    let availableCents = source ? goalCurrentCents(source) : 0;
    if (original && original.fromGoalId === source?.id) availableCents += toCents(original.amount || 0);
    if (!source || !destination || source.id === destination.id || amount <= 0 || toCents(amount) > availableCents || !entryDateIsValid(date)) return;
    const allocations = allocateGoalTransferForEdit(source, amount, original);
    const allocatedCents = allocations.reduce((sum, item) => sum + toCents(item.amount || 0), 0);
    if (allocatedCents !== toCents(amount)) return showToast('Pocket could not preserve the wallet source for that transfer.');
    const replacement = { fromGoalId: source.id, toGoalId: destination.id, amount, allocations, date };

    if (currentGoalTransferEditId) {
      const candidate = cloneStateSnapshot(state);
      const item = candidate.goalTransfers.find((entry) => entry.id === currentGoalTransferEditId);
      if (!item || !canModifyGoalTransfer(item)) return showToast('That goal transfer is locked. Use Correct instead.');
      Object.assign(item, replacement, { updatedAt: new Date().toISOString() });
      if (!validateCandidateGoals(candidate, 'That edit would make a savings goal negative.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'That edit would break wallet-level savings provenance.')) return;
      state = candidate;
      showToast('Savings transfer updated.');
    } else if (currentGoalTransferCorrectionId) {
      const corrected = createGoalTransferCorrection(original, replacement);
      if (!corrected) return;
      showToast('Savings transfer correction recorded. The original remains in history.');
    } else {
      state.goalTransfers.push(normalizeGoalTransfer({ id: uid('goal-transfer'), ...replacement, createdAt: new Date().toISOString() }));
      showToast(state.settings.privacy ? 'Savings transferred between goals.' : `${currency(amount)} moved from “${source.name}” to “${destination.name}”.`);
    }
    currentGoalTransferEditId = null;
    currentGoalTransferCorrectionId = null;
    milestoneEffectiveDateHint = date;
    saveState(); closeDialog(els.goalTransferDialog); renderAll(); setView('savings');
  }

  function undoGoalTransfer(id) {
    const transfer = state.goalTransfers.find((item) => item.id === id);
    if (!transfer || !canModifyGoalTransfer(transfer)) return showToast('This savings transfer is locked. Use Correct for historical changes.');
    confirmAction('Undo this savings transfer?', 'Pocket will reverse only this transfer if later savings activity does not depend on it.', 'Undo transfer', () => {
      const candidate = cloneStateSnapshot(state);
      const item = candidate.goalTransfers.find((entry) => entry.id === id);
      let removed = [item];
      let sourceMarker = null;
      if (item.correctionGroupId) {
        removed = candidate.goalTransfers.filter((entry) => entry.correctionGroupId === item.correctionGroupId);
        const sourceId = removed.find((entry) => entry.correctsGoalTransferId)?.correctsGoalTransferId;
        const source = candidate.goalTransfers.find((entry) => entry.id === sourceId);
        if (source) { sourceMarker = { id: source.id, correctedByGroupId: source.correctedByGroupId || '' }; delete source.correctedByGroupId; }
      }
      const ids = new Set(removed.map((entry) => entry.id));
      candidate.goalTransfers = candidate.goalTransfers.filter((entry) => !ids.has(entry.id));
      if (!validateCandidateGoals(candidate, 'This transfer cannot be undone because later goal activity depends on it.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'This transfer cannot be undone because later wallet-level savings activity depends on it.')) return;
      state = candidate; milestoneEffectiveDateHint = item?.date || localDateKey(); saveState(); renderAll();
      showToast('Savings transfer undone.', 'Restore', () => {
        const restore = cloneStateSnapshot(state);
        restore.goalTransfers.push(...cloneStateSnapshot(removed));
        if (sourceMarker) { const source = restore.goalTransfers.find((entry) => entry.id === sourceMarker.id); if (source) source.correctedByGroupId = sourceMarker.correctedByGroupId; }
        if (!validateCandidateGoals(restore, 'Restore is no longer safe because later goal activity depends on that savings.')) return;
        if (!validateCandidateSavingsProvenance(restore, 'Restore is no longer safe because wallet-level savings provenance changed.')) return;
        state = restore; milestoneEffectiveDateHint = transfer?.date || localDateKey(); saveState(); renderAll(); showToast('Savings transfer restored.');
      });
    });
  }

  function correctGoalTransfer(id) {
    const transfer = state.goalTransfers.find((item) => item.id === id);
    if (!transfer || !canCorrectGoalTransfer(transfer)) return showToast('This savings transfer is not available for correction.');
    openGoalTransfer(transfer.fromGoalId, { transferId: transfer.id, mode: 'correct' });
  }

  function editGoalTransfer(id) {
    const transfer = state.goalTransfers.find((item) => item.id === id);
    if (!transfer || !canModifyGoalTransfer(transfer)) return showToast('This savings transfer is locked. Use Correct instead.');
    openGoalTransfer(transfer.fromGoalId, { transferId: transfer.id, mode: 'edit' });
  }

  function openContribution(goalId, suggestedAmount = '', accountId = '', options = {}) {
    const goal = state.goals.find((item) => item.id === goalId && goalIsActive(item));
    if (!goal) return;
    currentSavingEditId = options.editId || null;
    currentCorrectionSourceId = options.correctionOf || null;
    els.contributeForm.reset();
    els.contributeGoalId.value = goal.id;
    els.contributeTitle.textContent = currentCorrectionSourceId ? `Correct · ${goal.name}` : currentSavingEditId ? `Edit · ${goal.name}` : goal.name;
    els.contributeAmount.value = suggestedAmount || '';
    els.contributeDate.max = localDateKey();
    els.contributeDate.value = options.date || localDateKey();
    els.contributeNote.value = options.savingsNote || '';
    populateAccounts();
    const preferredAccount = accountId || (savingsMode === 'wallet' ? activeAccounts()[savingsWalletIndex]?.id : '') || activeAccounts()[0]?.id;
    if (preferredAccount && activeAccounts().some((account) => account.id === preferredAccount)) els.contributeAccount.value = preferredAccount;
    const submit = els.contributeForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = currentCorrectionSourceId ? 'Save correction' : currentSavingEditId ? 'Update savings' : 'Add savings';
    syncWalletPickerTriggers();
    updateContributionWalletHint();
    openDialog(els.contributeDialog);
    requestAnimationFrame(() => els.contributeAmount.focus());
  }

  function updateContributionWalletHint() {
    const account = state.accounts.find((item) => item.id === els.contributeAccount.value) || activeAccounts()[0];
    let availableCents = account ? accountBalanceCentsForState(state, account.id) : 0;
    const sourceId = currentSavingEditId || currentCorrectionSourceId;
    if (sourceId) {
      const original = state.transactions.find((tx) => tx.id === sourceId && tx.type === 'saving');
      if (original?.accountId === account?.id) availableCents += toCents(original.amount || 0);
    }
    const available = fromCents(Math.max(0, availableCents));
    els.contributeWalletHint.textContent = state.settings.privacy
      ? `Savings will move out of ${account?.name || 'the selected wallet'}.`
      : `${currency(available)} can be used from ${account?.name || 'the selected wallet'} for this entry.`;
  }

  function addContribution() {
    const goal = state.goals.find((item) => item.id === els.contributeGoalId.value && goalIsActive(item));
    const amount = moneyRound(els.contributeAmount.value);
    const accountId = els.contributeAccount.value || activeAccounts()[0]?.id;
    const date = els.contributeDate.value || localDateKey();
    const savingsNote = els.contributeNote.value.trim().slice(0, 100);
    if (!goal || amount <= 0 || !accountId || !entryDateIsValid(date)) return;
    let availableCents = accountBalanceCentsForState(state, accountId);
    const sourceId = currentSavingEditId || currentCorrectionSourceId;
    if (sourceId) {
      const original = state.transactions.find((tx) => tx.id === sourceId && tx.type === 'saving');
      if (original?.accountId === accountId) availableCents += toCents(original.amount || 0);
    }
    const available = fromCents(Math.max(0, availableCents));
    if (toCents(amount) > toCents(available)) {
      const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
      showToast(state.settings.privacy ? `${walletName} does not have enough available money.` : `You only have ${currency(Math.max(0, available))} available in ${walletName}.`);
      return;
    }
    const previousGoalAmount = goalCurrent(goal);
    const completedNow = toCents(previousGoalAmount) < toCents(goal.target || 0) && toCents(previousGoalAmount) + toCents(amount) >= toCents(goal.target || 0);
    const replacement = { amount, category: 'Savings', accountId, date, note: goal.name, savingsNote, goalId: goal.id, savingsAction: 'contribution' };

    if (currentCorrectionSourceId) {
      milestoneEffectiveDateHint = date;
      const corrected = createCorrectionPair(currentCorrectionSourceId, replacement);
      if (!corrected) return;
      closeDialog(els.contributeDialog);
      currentCorrectionSourceId = null;
      currentSavingEditId = null;
      renderAll();
      resetCompanionDataBaseline();
      showToast('Savings correction recorded. The original entry remains in the audit history.');
      companionReact('savings');
      return;
    }

    if (currentSavingEditId) {
      const candidate = cloneStateSnapshot(state);
      const original = candidate.transactions.find((tx) => tx.id === currentSavingEditId && tx.type === 'saving');
      if (!original || !canModifyTransaction(original)) return showToast('This savings entry is locked. Use Correct instead.');
      Object.assign(original, replacement, { updatedAt: new Date().toISOString() });
      if (!validateCandidateBalances(candidate, 'That savings edit would make a wallet balance negative.')) return;
      if (!validateCandidateGoals(candidate, 'That savings edit would make a goal negative.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'That savings edit conflicts with later goal transfers or withdrawals.')) return;
      state = candidate;
      milestoneEffectiveDateHint = date;
      saveState(); closeDialog(els.contributeDialog); renderAll();
      const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
      showToast(state.settings.privacy ? 'Savings entry updated.' : `${currency(amount)} savings entry updated for ${goal.name} from ${walletName}.`);
      currentSavingEditId = null;
      companionReact('savings');
      return;
    }

    state.transactions.push({ id: uid('tx'), type: 'saving', ...replacement, createdAt: new Date().toISOString() });
    milestoneEffectiveDateHint = date;
    saveState();
    closeDialog(els.contributeDialog);
    renderAll();
    celebrateSavings();
    companionReact(completedNow ? 'complete' : 'savings');
    const walletName = state.accounts.find((account) => account.id === accountId)?.name || 'wallet';
    showToast(state.settings.privacy ? `Savings added from ${walletName}.` : `${currency(amount)} saved from ${walletName} for ${goal.name}.`);
  }


  function currentSavingsWithdrawalSource() {
    const id = currentSavingsWithdrawalEditId || currentSavingsWithdrawalCorrectionId;
    return id ? state.transactions.find((tx) => tx.id === id && tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal') : null;
  }

  function updateSavingsWithdrawalAvailability() {
    const goal = state.goals.find((item) => item.id === els.savingsWithdrawGoalId.value && goalIsActive(item));
    const accountId = els.savingsWithdrawAccount.value;
    if (!goal || !accountId) return;
    let cents = rawGoalWalletSavingsCents(goal.id, accountId, state);
    const source = currentSavingsWithdrawalSource();
    if (source?.accountId === accountId) cents += toCents(source.amount || 0);
    const available = fromCents(Math.max(0, cents));
    const account = state.accounts.find((item) => item.id === accountId);
    els.savingsWithdrawAmount.max = String(available);
    els.savingsWithdrawAvailable.textContent = state.settings.privacy ? `Available to return to ${account?.name || 'this wallet'} is hidden.` : `${currency(available)} of this goal is currently attributed to ${account?.name || 'this wallet'}.`;
  }

  function ensureGoalProvenanceReviewed(goal) {
    if (!goal?.legacyAttributionPending || toCents(goal.openingSaved || 0) <= 0) return true;
    showToast('Review this older goal’s opening wallet source before moving savings out of it.');
    openLegacySavingsSource(goal.id);
    return false;
  }

  function openSavingsWithdrawal(goalId, options = {}) {
    const goal = state.goals.find((item) => item.id === goalId && goalIsActive(item));
    if (!goal || goalCurrentCents(goal) <= 0) return showToast('This goal has no savings available to withdraw.');
    if (!ensureGoalProvenanceReviewed(goal)) return;
    currentSavingsWithdrawalEditId = options.editId || null;
    currentSavingsWithdrawalCorrectionId = options.correctionOf || null;
    const source = currentSavingsWithdrawalSource();
    els.savingsWithdrawForm.reset();
    els.savingsWithdrawGoalId.value = goal.id;
    els.savingsWithdrawTitle.textContent = currentSavingsWithdrawalCorrectionId ? `Correct withdrawal · ${goal.name}` : currentSavingsWithdrawalEditId ? `Edit withdrawal · ${goal.name}` : `Withdraw from ${goal.name}`;
    els.savingsWithdrawDate.max = localDateKey();
    els.savingsWithdrawDate.value = source?.date || localDateKey();
    els.savingsWithdrawAmount.value = source ? String(source.amount) : '';
    els.savingsWithdrawReason.value = source?.withdrawalReason || 'Needed for spending';
    els.savingsWithdrawNote.value = source?.savingsNote || '';
    let breakdown = goalWalletBreakdown(goal);
    if (source && !breakdown.some((item) => item.account.id === source.accountId)) {
      const account = state.accounts.find((item) => item.id === source.accountId);
      if (account) breakdown = [...breakdown, { account, amount: 0 }];
    }
    els.savingsWithdrawAccount.innerHTML = breakdown.map(({ account, amount }) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}${state.settings.privacy ? '' : ` · ${escapeHtml(currency(amount + (source?.accountId === account.id ? Number(source.amount || 0) : 0)))}`}</option>`).join('');
    if (source?.accountId && [...els.savingsWithdrawAccount.options].some((option) => option.value === source.accountId)) els.savingsWithdrawAccount.value = source.accountId;
    els.savingsWithdrawSummary.innerHTML = `<span class="round-icon green-soft">${icon('i-arrow-up')}</span><div><small>Current goal savings</small><strong>${escapeHtml(goal.name)}</strong><p class="money-value">${privateCurrency(goalCurrent(goal))}</p></div>`;
    els.savingsWithdrawSaveButton.textContent = currentSavingsWithdrawalCorrectionId ? 'Save correction' : currentSavingsWithdrawalEditId ? 'Update withdrawal' : 'Withdraw savings';
    updateSavingsWithdrawalAvailability();
    openDialog(els.savingsWithdrawDialog);
    requestAnimationFrame(() => els.savingsWithdrawAmount.focus());
  }

  function saveSavingsWithdrawal() {
    const goal = state.goals.find((item) => item.id === els.savingsWithdrawGoalId.value && goalIsActive(item));
    const accountId = els.savingsWithdrawAccount.value;
    const amount = moneyRound(els.savingsWithdrawAmount.value || 0);
    const date = els.savingsWithdrawDate.value || localDateKey();
    const withdrawalReason = els.savingsWithdrawReason.value || 'Other';
    const savingsNote = els.savingsWithdrawNote.value.trim().slice(0, 100);
    const source = currentSavingsWithdrawalSource();
    if (!goal || !accountId || amount <= 0 || !entryDateIsValid(date)) return;
    let availableCents = rawGoalWalletSavingsCents(goal.id, accountId, state);
    if (source?.accountId === accountId) availableCents += toCents(source.amount || 0);
    if (toCents(amount) > Math.max(0, availableCents)) {
      const account = state.accounts.find((item) => item.id === accountId);
      return showToast(state.settings.privacy ? `That wallet source does not have enough savings in this goal.` : `Only ${currency(fromCents(Math.max(0, availableCents)))} of ${goal.name} is attributed to ${account?.name || 'that wallet'}.`);
    }
    const replacement = { amount, category: 'Savings return', accountId, date, note: `Withdrawn from ${goal.name}`, goalId: goal.id, savingsAction: 'partial_withdrawal', withdrawalReason, savingsNote };
    if (currentSavingsWithdrawalCorrectionId) {
      milestoneEffectiveDateHint = date;
      const corrected = createCorrectionPair(currentSavingsWithdrawalCorrectionId, replacement);
      if (!corrected) return;
      showToast('Savings withdrawal correction recorded.');
    } else if (currentSavingsWithdrawalEditId) {
      const candidate = cloneStateSnapshot(state);
      const tx = candidate.transactions.find((item) => item.id === currentSavingsWithdrawalEditId && item.type === 'saving_return' && item.savingsAction === 'partial_withdrawal');
      if (!tx || !canModifyTransaction(tx)) return showToast('This withdrawal is locked. Use Correct instead.');
      Object.assign(tx, replacement, { updatedAt: new Date().toISOString() });
      if (!validateCandidateBalances(candidate, 'That withdrawal edit would make a wallet balance negative.')) return;
      if (!validateCandidateGoals(candidate, 'That withdrawal edit would make the savings goal negative.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'That withdrawal edit conflicts with later wallet-level savings activity.')) return;
      state = candidate;
      showToast('Savings withdrawal updated.');
    } else {
      const candidate = cloneStateSnapshot(state);
      candidate.transactions.push({ id: uid('tx'), type: 'saving_return', ...replacement, createdAt: new Date().toISOString() });
      if (!validateCandidateGoals(candidate, 'That withdrawal is larger than the savings available in this goal.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'That withdrawal is larger than this wallet’s share of the goal.')) return;
      state = candidate;
      showToast(state.settings.privacy ? 'Savings returned to the selected wallet.' : `${currency(amount)} returned from ${goal.name} to ${state.accounts.find((item) => item.id === accountId)?.name || 'wallet'}.`);
    }
    currentSavingsWithdrawalEditId = null;
    currentSavingsWithdrawalCorrectionId = null;
    milestoneEffectiveDateHint = date;
    saveState(); closeDialog(els.savingsWithdrawDialog); renderAll(); setView('savings'); resetCompanionDataBaseline();
  }

  function openLegacySavingsSource(goalId) {
    const goal = state.goals.find((item) => item.id === goalId && !goalIsWithdrawn(item) && toCents(item.openingSaved || 0) > 0);
    if (!goal) return;
    els.legacySavingsSourceForm.reset();
    els.legacySavingsGoalId.value = goal.id;
    els.legacySavingsSourceTitle.textContent = `Review · ${goal.name}`;
    els.legacySavingsSourceSummary.innerHTML = `<span class="round-icon purple-soft">${icon('i-savings')}</span><div><small>Opening savings from an older Pocket version</small><strong class="money-value">${privateCurrency(goal.openingSaved || 0)}</strong><p>Choose the wallet this opening amount originally came from.</p></div>`;
    els.legacySavingsAccount.innerHTML = activeAccounts().map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`).join('');
    const currentAccountId = goal.openingAllocations?.[0]?.accountId;
    if (currentAccountId && [...els.legacySavingsAccount.options].some((option) => option.value === currentAccountId)) els.legacySavingsAccount.value = currentAccountId;
    openDialog(els.legacySavingsSourceDialog);
  }

  function saveLegacySavingsSource() {
    const goal = state.goals.find((item) => item.id === els.legacySavingsGoalId.value && !goalIsWithdrawn(item));
    const accountId = els.legacySavingsAccount.value;
    if (!goal || !accountId || !state.accounts.some((account) => account.id === accountId && !account.archivedAt)) return;
    const candidate = cloneStateSnapshot(state);
    const candidateGoal = candidate.goals.find((item) => item.id === goal.id);
    candidateGoal.openingAllocations = toCents(candidateGoal.openingSaved || 0) > 0 ? [{ accountId, amount: moneyRound(candidateGoal.openingSaved || 0) }] : [];
    candidateGoal.legacyAttributionPending = false;
    if (!validateCandidateSavingsProvenance(candidate, 'Pocket could not assign that legacy savings source safely.')) return;
    state = candidate;
    addGoalEvent(goal.id, 'legacy_source_assigned', { note: `Opening savings source assigned to ${state.accounts.find((account) => account.id === accountId)?.name || 'wallet'}` });
    saveState(); closeDialog(els.legacySavingsSourceDialog); renderAll(); showToast('Opening savings wallet source updated.');
  }

  function editTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) return showToast('This transaction is locked. Use Correct to create an auditable adjustment.');
    if (archivedAccountUsedByTransaction(tx)) return showToast('Restore the archived wallet before editing this transaction.');
    closeDialog(els.expenseReceiptDialog);
    currentCorrectionSourceId = null;
    if (tx.type === 'expense') return openExpense({ id: tx.id, amount: String(tx.amount), category: tx.category, categoryId: tx.categoryId, accountId: tx.accountId, date: tx.date, note: tx.note || '' });
    if (tx.type === 'income') { closeDialog(els.allowanceHistoryDialog); setView('more'); return openDifferentAllowance({ id: tx.id, amount: String(tx.amount), accountId: tx.accountId, date: tx.date }); }
    if (tx.type === 'transfer') return openTransfer({ id: tx.id, amount: String(tx.amount), fromAccountId: tx.fromAccountId, toAccountId: tx.toAccountId, date: tx.date, note: tx.note || '' });
    if (tx.type === 'saving') { if (els.goalHistoryDialog?.open) closeDialog(els.goalHistoryDialog); return openContribution(tx.goalId, String(tx.amount), tx.accountId, { editId: tx.id, date: tx.date, savingsNote: tx.savingsNote || '' }); }
    if (tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal') { if (els.goalHistoryDialog?.open) closeDialog(els.goalHistoryDialog); return openSavingsWithdrawal(tx.goalId, { editId: tx.id }); }
    showToast('This entry cannot be edited directly.');
  }

  function correctTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx || !canCorrectTransaction(tx)) return showToast('This transaction is not available for correction.');
    if (archivedAccountUsedByTransaction(tx)) return showToast('Restore the archived wallet before correcting this transaction.');
    closeDialog(els.expenseReceiptDialog);
    if (tx.type === 'expense') return openExpense({ correctionOf: tx.id, amount: String(tx.amount), category: tx.category, categoryId: tx.categoryId, accountId: tx.accountId, date: tx.date, note: tx.note || '' });
    if (tx.type === 'income') { closeDialog(els.allowanceHistoryDialog); setView('more'); return openDifferentAllowance({ correctionOf: tx.id, amount: String(tx.amount), accountId: tx.accountId, date: tx.date }); }
    if (tx.type === 'transfer') return openTransfer({ correctionOf: tx.id, amount: String(tx.amount), fromAccountId: tx.fromAccountId, toAccountId: tx.toAccountId, date: tx.date, note: tx.note || '' });
    if (tx.type === 'saving') { if (els.goalHistoryDialog?.open) closeDialog(els.goalHistoryDialog); return openContribution(tx.goalId, String(tx.amount), tx.accountId, { correctionOf: tx.id, date: tx.date, savingsNote: tx.savingsNote || '' }); }
    if (tx.type === 'saving_return' && tx.savingsAction === 'partial_withdrawal') { if (els.goalHistoryDialog?.open) closeDialog(els.goalHistoryDialog); return openSavingsWithdrawal(tx.goalId, { correctionOf: tx.id }); }
    if (tx.type === 'reconciliation') return openReconciliationCorrection(tx.id);
  }

  function transactionUndoGroup(tx, candidate = state) {
    if (tx.correctionGroupId) return candidate.transactions.filter((item) => item.correctionGroupId === tx.correctionGroupId);
    if (tx.type === 'income' && tx.allowanceId) return candidate.transactions.filter((item) => item.allowanceId === tx.allowanceId);
    return candidate.transactions.filter((item) => item.id === tx.id);
  }

  function restoreUndoPacket(packet) {
    if (!packet?.transactions?.length) return;
    const candidate = cloneStateSnapshot(state);
    const existing = new Set(candidate.transactions.map((tx) => tx.id));
    if (packet.transactions.some((tx) => existing.has(tx.id))) return showToast('That transaction is already present.');
    candidate.transactions.push(...cloneStateSnapshot(packet.transactions));
    (packet.markers || []).forEach((marker) => {
      const tx = candidate.transactions.find((item) => item.id === marker.id);
      if (!tx) return;
      if (marker.correctedByGroupId) tx.correctedByGroupId = marker.correctedByGroupId;
      else delete tx.correctedByGroupId;
    });
    if (!validateCandidateBalances(candidate, 'Restore is no longer safe because some of that wallet money has been used.')) return;
    if (!validateCandidateGoals(candidate, 'Restore is no longer safe because later savings activity depends on that entry.')) return;
    if (!validateCandidateSavingsProvenance(candidate, 'Restore is no longer safe because wallet-level savings allocation changed.')) return;
    state = candidate;
    milestoneEffectiveDateHint = packet.transactions.find((item) => validDateKey(item.date))?.date || localDateKey();
    saveState();
    renderAll();
    resetCompanionDataBaseline();
    showToast('Transaction restored.');
  }

  function undoTransaction(id) {
    const tx = state.transactions.find((item) => item.id === id);
    if (!tx) return;
    if (!canModifyTransaction(tx)) return showToast('This transaction is locked. Use Correct for historical changes.');
    confirmAction('Undo this transaction?', 'Pocket will remove only this transaction (or its linked correction group) and keep any newer changes intact.', 'Undo transaction', () => {
      const candidate = cloneStateSnapshot(state);
      const candidateTx = candidate.transactions.find((item) => item.id === id);
      const removed = transactionUndoGroup(candidateTx, candidate);
      const removeIds = new Set(removed.map((item) => item.id));
      const markers = [];
      if (candidateTx.correctionGroupId) {
        const sourceId = removed.find((item) => item.correctsTransactionId)?.correctsTransactionId;
        const source = candidate.transactions.find((item) => item.id === sourceId);
        if (source) {
          const before = state.transactions.find((item) => item.id === source.id);
          markers.push({ id: source.id, correctedByGroupId: before?.correctedByGroupId || '' });
          delete source.correctedByGroupId;
        }
      }
      candidate.transactions = candidate.transactions.filter((item) => !removeIds.has(item.id));
      if (!validateCandidateBalances(candidate, 'This transaction cannot be undone because later activity depends on that money.')) return;
      if (!validateCandidateGoals(candidate, 'This transaction cannot be undone because later savings activity depends on it.')) return;
      if (!validateCandidateSavingsProvenance(candidate, 'This transaction cannot be undone because later wallet-level savings activity depends on it.')) return;
      state = candidate;
      milestoneEffectiveDateHint = candidateTx?.date || localDateKey();

      saveState();
      closeDialog(els.expenseReceiptDialog);
      renderAll();
      const packet = { transactions: cloneStateSnapshot(removed), markers };
      showToast('Transaction undone.', 'Restore', () => restoreUndoPacket(packet));
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
    const openingBalance = Math.max(0, moneyRound(els.walletOpeningBalance.value || 0));
    if (!name) return showToast('Give this wallet a name.');
    if (state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) return showToast(`${name} is already in your wallets.`);
    state.accounts.push({ id: uid('account'), name, type: preset === 'Other' ? 'other' : 'ewallet', openingBalance, isPrimary: false, archivedAt: null });

    saveState();
    closeDialog(els.walletDialog);
    renderAll();
    showToast(`${name} added.`);
  }

  function openWalletManage(id) {
    const account = state.accounts.find((item) => item.id === id && !item.archivedAt);
    if (!account) return;
    currentWalletManageId = account.id;
    els.walletManageForm.reset();
    els.walletManageTitle.textContent = account.name;
    els.walletManageName.value = account.name;
    els.walletManageBalance.value = state.settings.privacy ? '' : String(Math.max(0, moneyRound(accountBalance(account.id))));
    els.walletManageBalance.placeholder = state.settings.privacy ? 'Hidden · enter only if reconciling' : 'Enter actual balance to reconcile';
    els.walletReconcileDate.max = localDateKey();
    els.walletReconcileDate.value = localDateKey();
    els.walletReconcileReason.value = 'Cash count correction';
    els.walletReconcileNote.value = '';
    els.walletArchiveButton.hidden = Boolean(account.isPrimary);
    openDialog(els.walletManageDialog);
    requestAnimationFrame(() => els.walletManageName.focus({ preventScroll: true }));
  }

  function saveWalletManagement() {
    const account = state.accounts.find((item) => item.id === currentWalletManageId && !item.archivedAt);
    if (!account) return;
    const name = els.walletManageName.value.trim().slice(0, 30);
    const balanceInput = String(els.walletManageBalance.value || '').trim();
    const reconcileDate = els.walletReconcileDate.value || localDateKey();
    const reconcileReason = els.walletReconcileReason.value || 'Other';
    const reconcileNote = els.walletReconcileNote.value.trim();
    if (!entryDateIsValid(reconcileDate)) return showToast('Choose today or a past date for the reconciliation.');
    if (!name) return showToast('Give this wallet a name.');
    if (state.accounts.some((item) => item.id !== account.id && item.name.toLowerCase() === name.toLowerCase())) return showToast(`${name} is already in your wallets.`);

    const candidate = cloneStateSnapshot(state);
    const nextAccount = candidate.accounts.find((item) => item.id === account.id);
    nextAccount.name = name;
    const currentBalanceCents = accountBalanceCentsForState(candidate, account.id);
    const actualBalance = balanceInput === '' ? fromCents(currentBalanceCents) : Math.max(0, moneyRound(balanceInput));
    const targetCents = balanceInput === '' ? currentBalanceCents : toCents(actualBalance);
    const differenceCents = targetCents - currentBalanceCents;
    if (differenceCents !== 0) {
      candidate.transactions.push({
        id: uid('tx'), type: 'reconciliation', category: 'Reconciliation', accountId: account.id,
        amount: fromCents(differenceCents), date: reconcileDate, note: reconcileNote || `Balance reconciled for ${name}`,
        reconciliationReason: reconcileReason, reconciliationNote: reconcileNote, createdAt: new Date().toISOString()
      });
    }
    if (!validateCandidateBalances(candidate, 'That reconciliation would make a wallet balance negative.')) return;
    state = candidate;

    saveState();
    closeDialog(els.walletManageDialog);
    currentWalletManageId = null;
    renderAll();
    showToast(differenceCents === 0 ? `${name} updated.` : state.settings.privacy ? `${name} balance reconciled.` : `${name} reconciled to ${currency(actualBalance)}.`);
  }

  function openReconciliationCorrection(id) {
    const tx = state.transactions.find((item) => item.id === id && item.type === 'reconciliation');
    if (!tx || !canCorrectTransaction(tx)) return showToast('This reconciliation is not available for correction.');
    currentReconciliationCorrectionId = tx.id;
    els.reconciliationCorrectionForm.reset();
    els.reconciliationCorrectionAmount.value = String(moneyRound(tx.amount));
    els.reconciliationCorrectionDate.max = localDateKey();
    els.reconciliationCorrectionDate.value = tx.date || localDateKey();
    els.reconciliationCorrectionReason.value = tx.reconciliationReason || 'Cash count correction';
    els.reconciliationCorrectionNote.value = tx.reconciliationNote || tx.note || '';
    openDialog(els.reconciliationCorrectionDialog);
  }

  function saveReconciliationCorrection() {
    const original = state.transactions.find((item) => item.id === currentReconciliationCorrectionId && item.type === 'reconciliation');
    if (!original) return;
    const amount = moneyRound(els.reconciliationCorrectionAmount.value || 0);
    const date = els.reconciliationCorrectionDate.value || localDateKey();
    if (toCents(amount) === 0) return showToast('A reconciliation adjustment cannot be zero.');
    if (!entryDateIsValid(date)) return showToast('Choose today or a past reconciliation date.');
    const corrected = createCorrectionPair(original.id, { amount, accountId: original.accountId, category: 'Reconciliation', date, note: els.reconciliationCorrectionNote.value.trim() || 'Balance reconciliation correction', reconciliationReason: els.reconciliationCorrectionReason.value || 'Other', reconciliationNote: els.reconciliationCorrectionNote.value.trim() });
    if (!corrected) return;
    currentReconciliationCorrectionId = null;
    closeDialog(els.reconciliationCorrectionDialog);
    renderAll();
    showToast('Reconciliation correction recorded with the original audit trail preserved.');
  }

  function archiveWallet(id = currentWalletManageId) {
    const account = state.accounts.find((item) => item.id === id && !item.archivedAt);
    if (!account || account.isPrimary) return;
    const balanceCents = accountBalanceCentsForState(state, account.id);
    const savingsCents = toCents(walletSavingsBalance(account.id));
    if (balanceCents !== 0) return showToast('Reconcile this wallet to ₱0 before archiving it.');
    if (savingsCents !== 0) return showToast('This wallet still has money attributed to Savings. Return that savings before archiving it.');
    confirmAction(`Archive ${account.name}?`, 'The wallet will disappear from normal transaction pickers but its historical records will remain.', 'Archive wallet', () => {
      account.archivedAt = new Date().toISOString();
      saveState();
      closeDialog(els.walletManageDialog);
      currentWalletManageId = null;
      walletModeIndex = 0;
      savingsWalletIndex = 0;
      renderAll();
      showToast(`${account.name} archived.`);
    });
  }

  function restoreWallet(id) {
    const account = state.accounts.find((item) => item.id === id && item.archivedAt);
    if (!account) return;
    account.archivedAt = null;
    saveState();
    renderAll();
    showToast(`${account.name} restored.`);
  }

  function removeWallet(id) {
    const index = state.accounts.findIndex((account) => account.id === id);
    if (index <= 0) return;
    const account = state.accounts[index];
    if (!account || account.archivedAt) return;
    const used = state.transactions.some((tx) => tx.accountId === id || tx.fromAccountId === id || tx.toAccountId === id);
    if (used) return showToast('This wallet has transaction history. Archive it after reconciling instead.');
    confirmAction(`Remove ${account.name}?`, `${state.settings.privacy ? 'This wallet' : currency(accountBalance(id))} will be removed from your available total. This wallet has no transaction history.`, 'Remove wallet', () => {
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

  async function resetAllData() {
    const previousTheme = uiPreferences.theme;
    try {
      await waitForStorageQueues();
      await createRecoverySnapshot('Before clearing all tracker data');
      const next = seedState();
      next.settings.theme = previousTheme;
      await commitAtomicReplacement(next, secretConfig);
      resetCompanionDataBaseline();
      renderAll();
      setView('home');
      showToast('All tracker data cleared. A recovery point was kept, and companion comparisons were reset.');
    } catch (error) {
      console.warn('Unable to clear Pocket data safely.', error);
      showToast(error instanceof PocketStorageConflictError ? 'Another Pocket tab changed data first. Clear data was cancelled safely.' : 'Pocket could not clear the tracker safely. No saved data was replaced.');
    }
  }

  function secretConfigForBackup() {
    const safe = cloneStateSnapshot(secretConfig || loadSecretConfig());
    safe.pinSalt = '';
    safe.pinHash = '';
    safe.pinScheme = '';
    safe.remember = false;
    safe.credentialsExcluded = true;
    return safe;
  }

  function pocketBackupPayload() {
    return {
      format: 'pocket-full-backup',
      backupVersion: 5,
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tracker: cloneStateSnapshot(state),
      secretPocket: secretConfigForBackup(),
      storageArchitecture: storageBackend === 'indexeddb' ? 'indexeddb-v1' : 'compatibility-storage'
    };
  }

  function exportData() {
    const payload = pocketBackupPayload();
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pocket-full-backup-${localDateKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    uiPreferences.lastExportAt = Date.now();
    saveUiPreferences();
    renderStorageStatus();
    showToast('Full Pocket backup downloaded. Companion and Secret Pocket preferences are included; the secret PIN verifier is intentionally excluded.');
  }

  function validateBackupTrackerShape(value) {
    if (!value || typeof value !== 'object') return false;
    if (!Array.isArray(value.accounts) || !Array.isArray(value.transactions) || !Array.isArray(value.goals || [])) return false;
    if (!value.accounts.length || value.accounts.length > 100) return false;
    if (value.transactions.length > 100000 || (value.goals || []).length > 1000 || (value.goalTransfers || []).length > 100000) return false;
    if (!value.accounts.every((account) => account && typeof account === 'object' && typeof account.name === 'string' && account.name.trim())) return false;
    if (value.categories !== undefined && !Array.isArray(value.categories)) return false;
    if (value.goalEvents !== undefined && !Array.isArray(value.goalEvents)) return false;
    if ((value.categories || []).length > 500 || (value.goalEvents || []).length > 200000) return false;
    const knownTypes = new Set(['income', 'expense', 'saving', 'saving_return', 'transfer', 'reconciliation', 'correction_reversal']);
    if (!value.transactions.every((tx) => {
      if (!tx || typeof tx !== 'object' || !knownTypes.has(tx.type) || !Number.isFinite(Number(tx.amount))) return false;
      const cents = toCents(tx.amount);
      if (tx.type === 'reconciliation') return cents !== 0;
      if (tx.type === 'correction_reversal' && tx.originalType === 'reconciliation') return cents !== 0;
      return cents > 0;
    })) return false;
    if (!(value.goals || []).every((goal) => goal && typeof goal === 'object' && typeof goal.name === 'string' && toCents(goal.target) > 0)) return false;
    if (value.goalTransfers !== undefined && !Array.isArray(value.goalTransfers)) return false;
    if ((value.goalTransfers || []).some((transfer) => !transfer || typeof transfer !== 'object' || toCents(transfer.amount) <= 0)) return false;
    return true;
  }

  function validateNormalizedBackupIntegrity(tracker) {
    if (!tracker || !activeAccounts(tracker).length) throw new Error('Backup has no active wallet.');
    const accountIds = new Set(tracker.accounts.map((account) => account.id));
    const goalIds = new Set(tracker.goals.map((goal) => goal.id));
    if (accountIds.size !== tracker.accounts.length || goalIds.size !== tracker.goals.length) throw new Error('Backup contains duplicate IDs.');
    const categoryIds = new Set((tracker.categories || []).map((category) => category.id));
    const goalEventIds = new Set((tracker.goalEvents || []).map((event) => event.id));
    if (categoryIds.size !== (tracker.categories || []).length || goalEventIds.size !== (tracker.goalEvents || []).length) throw new Error('Backup contains duplicate category or goal-event IDs.');
    for (const event of tracker.goalEvents || []) if (!goalIds.has(event.goalId)) throw new Error('Backup goal history references a missing savings goal.');
    for (const tx of tracker.transactions) {
      if (['income', 'expense', 'saving', 'saving_return', 'reconciliation'].includes(tx.type) && (!tx.accountId || !accountIds.has(tx.accountId))) throw new Error('Backup references a missing wallet.');
      if (tx.type === 'transfer' && (!accountIds.has(tx.fromAccountId) || !accountIds.has(tx.toAccountId) || tx.fromAccountId === tx.toAccountId)) throw new Error('Backup contains an invalid wallet transfer.');
      if (['saving','saving_return'].includes(tx.type) && tx.goalId && !goalIds.has(tx.goalId)) throw new Error('Backup references a missing savings goal.');
      if (tx.type === 'correction_reversal') {
        if (!['income', 'expense', 'transfer', 'saving', 'saving_return', 'reconciliation'].includes(tx.originalType)) throw new Error('Backup contains an invalid correction record.');
        if (['income', 'expense', 'saving', 'saving_return', 'reconciliation'].includes(tx.originalType) && (!tx.accountId || !accountIds.has(tx.accountId))) throw new Error('Backup correction references a missing wallet.');
        if (tx.originalType === 'transfer' && (!accountIds.has(tx.fromAccountId) || !accountIds.has(tx.toAccountId) || tx.fromAccountId === tx.toAccountId)) throw new Error('Backup correction references an invalid transfer.');
      }
    }
    const transactionsById = new Map(tracker.transactions.map((tx) => [tx.id, tx]));
    const correctionGroups = new Map();
    tracker.transactions.forEach((tx) => {
      if (!tx.correctionGroupId) return;
      if (!correctionGroups.has(tx.correctionGroupId)) correctionGroups.set(tx.correctionGroupId, []);
      correctionGroups.get(tx.correctionGroupId).push(tx);
    });
    for (const source of tracker.transactions.filter((tx) => tx.correctedByGroupId)) {
      const members = correctionGroups.get(source.correctedByGroupId) || [];
      const reversal = members.find((tx) => tx.type === 'correction_reversal' && tx.correctsTransactionId === source.id);
      const replacement = members.find((tx) => tx.type !== 'correction_reversal' && tx.correctsTransactionId === source.id);
      if (!reversal || !replacement || members.length !== 2 || reversal.originalType !== source.type || replacement.type !== source.type) {
        throw new Error('Backup contains an incomplete correction audit trail.');
      }
    }
    for (const [groupId, members] of correctionGroups) {
      const sourceId = members.find((tx) => tx.correctsTransactionId)?.correctsTransactionId;
      const source = sourceId ? transactionsById.get(sourceId) : null;
      if (!source || source.correctedByGroupId !== groupId) throw new Error('Backup contains an orphaned correction record.');
    }

    for (const transfer of tracker.goalTransfers) {
      if (!goalIds.has(transfer.fromGoalId) || !goalIds.has(transfer.toGoalId) || transfer.fromGoalId === transfer.toGoalId) throw new Error('Backup contains an invalid savings transfer.');
      if ((transfer.allocations || []).some((item) => !accountIds.has(item.accountId))) throw new Error('Backup savings transfer references a missing wallet.');
      const allocated = (transfer.allocations || []).reduce((sum, item) => sum + toCents(item.amount || 0), 0);
      if (transfer.allocations?.length && allocated !== toCents(transfer.amount || 0)) throw new Error('Backup contains an inconsistent savings allocation.');
    }
    const goalTransfersById = new Map(tracker.goalTransfers.map((item) => [item.id, item]));
    const goalTransferGroups = new Map();
    tracker.goalTransfers.forEach((item) => {
      if (!item.correctionGroupId) return;
      if (!goalTransferGroups.has(item.correctionGroupId)) goalTransferGroups.set(item.correctionGroupId, []);
      goalTransferGroups.get(item.correctionGroupId).push(item);
    });
    for (const source of tracker.goalTransfers.filter((item) => item.correctedByGroupId)) {
      const members = goalTransferGroups.get(source.correctedByGroupId) || [];
      const reversal = members.find((item) => item.isReversal && item.correctsGoalTransferId === source.id);
      const replacement = members.find((item) => !item.isReversal && item.correctsGoalTransferId === source.id);
      if (!reversal || !replacement || members.length !== 2) throw new Error('Backup contains an incomplete savings-transfer correction trail.');
    }
    for (const [groupId, members] of goalTransferGroups) {
      const sourceId = members.find((item) => item.correctsGoalTransferId)?.correctsGoalTransferId;
      const source = sourceId ? goalTransfersById.get(sourceId) : null;
      if (!source || source.correctedByGroupId !== groupId) throw new Error('Backup contains an orphaned savings-transfer correction record.');
    }
    for (const goal of tracker.goals) {
      const rawGoalCents = toCents(goal.openingSaved || 0) + goalLedgerBalanceCents(goal.id, tracker);
      if (rawGoalCents < 0) throw new Error('Backup would make a savings goal negative.');
      if (goalIsWithdrawn(goal) && rawGoalCents !== 0) throw new Error('Backup contains a deleted goal that still holds savings.');
      const openingAllocations = Array.isArray(goal.openingAllocations) ? goal.openingAllocations : [];
      if (openingAllocations.some((item) => !accountIds.has(item.accountId))) throw new Error('Backup opening savings references a missing wallet.');
      const openingAllocatedCents = openingAllocations.reduce((sum, item) => sum + toCents(item.amount || 0), 0);
      if (openingAllocatedCents !== toCents(goal.openingSaved || 0)) throw new Error('Backup opening savings attribution does not match the opening savings balance.');
    }
    const provenanceProblem = savingsProvenanceProblem(tracker);
    if (provenanceProblem) throw new Error(provenanceProblem.kind === 'negative' ? 'Backup would make a wallet-level savings allocation negative.' : 'Backup wallet-level savings allocations do not reconcile with goal balances.');
    const balanceProblem = stateBalanceProblem(tracker);
    if (balanceProblem) throw new Error(`Backup would make ${balanceProblem.name} negative.`);
    for (const account of tracker.accounts) {
      if (!account.archivedAt) continue;
      if (accountBalanceCentsForState(tracker, account.id) !== 0 || walletSavingsCentsForState(tracker, account.id) !== 0) {
        throw new Error('Backup contains an archived wallet that still holds money.');
      }
    }
    return tracker;
  }

  function parsePocketBackup(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Backup must be a JSON object.');
    if (raw.format === 'pocket-full-backup') {
      if (![1, 2, 3, 4, 5].includes(Number(raw.backupVersion))) throw new Error('Unsupported Pocket backup version.');
      if (Number(raw.schemaVersion || 1) > SCHEMA_VERSION) throw new Error('This backup was created by a newer Pocket data schema.');
      if (!validateBackupTrackerShape(raw.tracker)) throw new Error('Pocket tracker data is incomplete.');
      const tracker = validateNormalizedBackupIntegrity(migrateStateSchema(raw.tracker));
      return { tracker, secretPocket: raw.secretPocket ? normalizeSecretConfig(raw.secretPocket) : null, full: true, credentialsExcluded: Number(raw.backupVersion) >= 4 || Boolean(raw.secretPocket?.credentialsExcluded) };
    }
    if (Number(raw.version || 1) > SCHEMA_VERSION) throw new Error('This legacy backup uses a newer Pocket data schema.');
    if (validateBackupTrackerShape(raw)) return { tracker: validateNormalizedBackupIntegrity(migrateStateSchema(raw)), secretPocket: null, full: false };
    throw new Error('Not a recognized Pocket backup.');
  }

  async function importData(file) {
    try {
      if (!file || file.size > 5 * 1024 * 1024) throw new Error('Backup file is too large.');
      const text = await file.text();
      const parsed = parsePocketBackup(JSON.parse(text));
      const tracker = parsed.tracker;
      const activeWalletCount = activeAccounts(tracker).length;
      const goalCount = tracker.goals.filter((goal) => !goalIsWithdrawn(goal)).length;
      const transactionCount = tracker.transactions.length;
      const companionCopy = parsed.full ? ' Companion profile and Secret Pocket preferences are included; your current secret PIN credential stays on this device.' : ' This is a legacy tracker-only backup; your current Secret Pocket profile will be kept.';
      confirmAction('Restore this Pocket backup?', `${activeWalletCount} active wallet${activeWalletCount === 1 ? '' : 's'}, ${goalCount} active goal${goalCount === 1 ? '' : 's'}, and ${transactionCount} transaction${transactionCount === 1 ? '' : 's'} will replace the current tracker.${companionCopy}`, 'Restore data', async () => {
        const previousTheme = uiPreferences.theme;
        try {
          await waitForStorageQueues();
          await createRecoverySnapshot('Before backup restore');
          const currentSecret = normalizeSecretConfig(secretConfig);
          const importedSecret = parsed.secretPocket ? normalizeSecretConfig(parsed.secretPocket) : currentSecret;
          const nextSecret = parsed.full ? {
            ...importedSecret,
            pinSalt: currentSecret.pinSalt,
            pinHash: currentSecret.pinHash,
            pinScheme: currentSecret.pinScheme,
            remember: false
          } : currentSecret;
          if (parsed.full) uiPreferences.theme = 'dark';
          saveUiPreferences();
          tracker.settings.theme = uiPreferences.theme;
          await commitAtomicReplacement(tracker, nextSecret);
          if (parsed.full) {
            try { sessionStorage.removeItem(SECRET_SESSION_KEY); localStorage.removeItem(SECRET_TRUST_KEY); } catch (error) {}
          }
          resetCompanionDataBaseline();
          renderAll();
          setView('home');
          showToast(parsed.full ? 'Full Pocket backup restored atomically. Secret Pocket is locked; your current secret PIN credential was kept.' : 'Legacy Pocket backup restored atomically.');
        } catch (error) {
          uiPreferences.theme = previousTheme;
          saveUiPreferences();
          console.warn('Pocket backup restore failed.', error);
          showToast(error instanceof PocketStorageConflictError ? 'Another Pocket tab changed data first. Restore was cancelled safely.' : 'Pocket could not commit that restore. Your previous saved data was kept.');
        }
      });
    } catch (error) {
      console.warn(error);
      showToast('That file is not a valid Pocket backup. No data was changed.');
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

  async function applyAvailableUpdate() {
    await waitForStorageQueues();
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
      const goals = state.goals.filter((goal) => goalIsActive(goal));
      if (!goals.length) {
        openGoal(account?.id || '');
      } else if (goals.length === 1) {
        openContribution(goals[0].id, '', account?.id || '');
      } else {
        savingsMode = 'wallet';
        savingsWalletIndex = Math.max(0, activeAccounts().findIndex((item) => item.id === account?.id));
        setView('savings');
        showToast('Choose a savings goal to add money to.');
      }
    }
    if (action === 'open-allowance') openDifferentAllowance();
    if (action === 'open-allowance-history') openAllowanceHistory();
    if (action === 'allowance-history-prev') { allowanceHistoryPage = Math.max(0, allowanceHistoryPage - 1); renderAllowanceHistory(); }
    if (action === 'allowance-history-next') { allowanceHistoryPage += 1; renderAllowanceHistory(); }
    if (action === 'global-history-prev') { globalHistoryPage = Math.max(0, globalHistoryPage - 1); renderGlobalHistory(); }
    if (action === 'global-history-next') { globalHistoryPage += 1; renderGlobalHistory(); }
    if (action === 'savings-goal-prev') changeSavingsGoalPage(-1);
    if (action === 'savings-goal-next') changeSavingsGoalPage(1);
    if (action === 'open-goal-history') openGoalHistory(button.dataset.goalId);
    if (action === 'open-archived-goals') { renderSavings(); if (!els.archivedGoalsButton?.classList.contains('is-hidden')) openDialog(els.archivedGoalsDialog); }
    if (action === 'revert-goal-target') revertGoalTargetEvent(button.dataset.id);
    if (action === 'apply-update') applyAvailableUpdate();
    if (action === 'dismiss-update') hideUpdateAvailable();
    if (action === 'check-update') checkForUpdates({ announce: true, force: true });
    if (action === 'open-goal') openGoal();
    if (action === 'open-contribution') openContribution(button.dataset.goalId, '', button.dataset.accountId || '');
    if (action === 'withdraw-savings') openSavingsWithdrawal(button.dataset.goalId);
    if (action === 'review-legacy-savings') openLegacySavingsSource(button.dataset.goalId);
    if (action === 'edit-goal') openGoalEditor(button.dataset.goalId);
    if (action === 'transfer-goal') openGoalTransfer(button.dataset.goalId);
    if (action === 'archive-goal') archiveGoal(button.dataset.goalId);
    if (action === 'restore-goal') restoreArchivedGoal(button.dataset.goalId);
    if (action === 'delete-goal') deleteGoal(button.dataset.goalId);
    if (action === 'remove-goal') removeGoal(button.dataset.goalId);
    if (action === 'edit-goal-transfer') editGoalTransfer(button.dataset.id);
    if (action === 'undo-goal-transfer') undoGoalTransfer(button.dataset.id);
    if (action === 'correct-goal-transfer') correctGoalTransfer(button.dataset.id);
    if (action === 'toggle-manage-goals') { manageGoalsMode = !manageGoalsMode; renderSavings(); }
    if (action === 'open-wallet') openWallet();
    if (action === 'manage-wallet') openWalletManage(button.dataset.id);
    if (action === 'wallet-detail') openWalletDetail(button.dataset.id);
    if (action === 'wallet-detail-search') { closeDialog(els.walletDetailDialog); openGlobalHistory({ walletId: currentWalletDetailId || 'all' }); }
    if (action === 'archive-wallet') archiveWallet();
    if (action === 'restore-wallet') restoreWallet(button.dataset.id);
    if (action === 'remove-wallet') removeWallet(button.dataset.id);
    if (action === 'edit-transaction') editTransaction(button.dataset.id);
    if (action === 'correct-transaction') correctTransaction(button.dataset.id);
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
    if (action === 'open-global-history') openGlobalHistory();
    if (action === 'open-category-manager') openCategoryManager();
    if (action === 'edit-category') editCategory(button.dataset.id);
    if (action === 'archive-category') archiveCategory(button.dataset.id);
    if (action === 'restore-category') restoreCategory(button.dataset.id);
    if (action === 'move-category-up') moveCategory(button.dataset.id, -1);
    if (action === 'move-category-down') moveCategory(button.dataset.id, 1);
    if (action === 'toggle-privacy') {
      state.settings.privacy = !state.settings.privacy;
      saveState(); renderAll();
    }
    if (action === 'export-data') exportData();
    if (action === 'import-data') els.importFile.click();
    if (action === 'request-storage-persistence') requestStoragePersistence({ announce: true });
    if (action === 'run-data-health') openDataHealthDetails();
    if (action === 'run-data-health-detail') { runDataHealthCheck({ announce: false }); renderDataHealthDetails(); showToast(storageHealth.healthy ? 'Data Health check passed.' : `Data Health needs attention: ${storageHealth.message}`); }
    if (action === 'create-recovery-point') createManualRecoveryPoint();
    if (action === 'restore-recovery-point') restoreLatestRecoveryPoint();
    if (action === 'reset-data') confirmAction('Clear all data?', 'This removes transactions, allowance history, and savings goals stored on this device. This cannot be undone after you continue.', 'Clear data', resetAllData);
  }

  function cacheElements() {
    [
      'todayLabel', 'viewTitle', 'contentScroll', 'walletModeCounter', 'walletCarousel',
      'walletCarouselPrev', 'walletCarouselNext', 'walletModeIndicators', 'homeWalletTodaySpent', 'homeWalletTodayEntries', 'homeWalletTodayBar', 'homeWalletTodayLegend', 'homeWalletMonthLabel', 'homeWalletMonthSpent', 'homeWalletTopCategory', 'homeWalletMonthBar', 'homeWalletMonthLegend',
      'activityType', 'activityDatePicker', 'activityPrevDay', 'activityNextDay', 'activityDayName', 'activityDayDate', 'activityHistoryTitle', 'activityDayCard', 'activitySwipeHint', 'monthSpent', 'monthTransferred',
      'activityCount', 'allTransactions', 'totalSavings', 'savingsInsights', 'goalsGrid', 'savingsRecentPanel', 'savingsRecentActivity', 'manageGoalsButton', 'savingsViewTitle', 'savingsViewSubtitle', 'savingsBalanceLabel', 'savingsModeToggle', 'savingsWalletTabs', 'archivedGoalsButton', 'archivedGoalsButtonCount', 'archivedGoalsDialog', 'archivedGoalsCount', 'archivedGoalsList', 'savingsGoalPager', 'savingsGoalPrev', 'savingsGoalNext', 'savingsGoalPageLabel', 'goalHistoryDialog', 'goalHistoryTitle', 'goalHistorySubtitle', 'goalHistoryCount', 'goalHistoryList',
      'themeColorMeta', 'themeUnlockDialog', 'themeUnlockForm', 'themePassword', 'themePasswordError', 'secretPinDots', 'secretKeypad', 'secretRememberUnlock', 'secretUnlockButton', 'secretPocketDialog', 'secretPocketSettingButton', 'secretPocketSummary', 'secretThemeDark', 'secretThemeLight', 'secretCompanionToggle', 'secretCompanionLabel', 'secretCompanionSwitch', 'secretCompanionSpeech', 'secretCompanionMovement', 'secretCompanionPerformance', 'secretRememberToggle', 'secretRememberLabel', 'secretRememberSwitch', 'secretWorldHeroTitle', 'secretWorldHeroSubtitle', 'companionStudioSummary', 'companionRoomDialog', 'companionRoomTitle', 'companionRoomScene', 'companionRoomBunny', 'companionRoomMessage', 'companionMoodLabel', 'companionBondLevel', 'companionBondValue', 'companionBondFill', 'companionEnergyValue', 'companionEnergyFill', 'companionVisitStreak', 'companionInteractionCount', 'companionNameInput', 'companionPersonality', 'companionDataSpeech', 'companionAccessoryGrid', 'secretLightScene', 'secretLightFx', 'changeSecretPinDialog', 'changeSecretPinForm', 'newSecretPin', 'confirmSecretPin', 'changeSecretPinError', 'secretPocketReveal', 'versionSecretTrigger', 'privacyLabel', 'privacySwitch', 'privacySettingButton', 'textSizeSetting', 'allowanceRecordSummary', 'allowanceHistorySummary', 'allowanceHistoryDialog', 'allowanceHistoryCount', 'allowanceHistoryList', 'allowanceHistoryPager', 'allowanceHistoryPrev', 'allowanceHistoryNext', 'allowanceHistoryPageLabel', 'walletsList', 'importFile', 'storageProtectionSummary', 'storageProtectionStatus', 'dataHealthSummary', 'dataHealthStatus', 'recoveryPointSummary', 'restoreRecoveryButton', 'restoreRecoverySummary', 'exportBackupSummary',
      'allowanceDialog', 'allowanceForm', 'allowanceDialogTitle', 'allowanceAmount', 'allowanceAmountEntry', 'allowanceCustomAmountButton', 'allowanceKeypad', 'allowanceSaveButton',
      'allowanceReceivedDate', 'allowanceAccount',
      'expenseDate', 'transferDate', 'goalSaveDate', 'goalTransferDate', 'contributeDate',
      'expenseDialog', 'expenseForm', 'expenseDialogTitle', 'expenseReceiptDialog', 'expenseReceiptContent',
      'walletDialog', 'walletForm', 'walletCustomNameWrap', 'walletCustomName', 'walletOpeningBalance', 'walletKeypad',
      'walletManageDialog', 'walletManageForm', 'walletManageTitle', 'walletManageName', 'walletManageBalance', 'walletArchiveButton',
      'transferDialog', 'transferForm', 'transferDialogTitle', 'transferFromAccount', 'transferToAccount', 'transferAmountCard', 'transferAvailable', 'transferAmount', 'transferAmountHint', 'transferKeypad', 'transferNote', 'transferSaveButton',
      'expenseAmount', 'expenseAmountCard', 'expenseAvailable', 'expenseAmountHint', 'expenseKeypad', 'expenseAccount',
      'expenseNote', 'expenseStepAmount', 'expenseStepDetails', 'expenseCancelButton', 'expenseBackButton', 'expenseNextButton', 'expenseSaveButton', 'goalDialog', 'goalForm', 'goalDialogTitle', 'goalSubmitButton', 'goalName', 'goalTarget',
      'goalCurrent', 'goalAccount', 'goalTransferDialog', 'goalTransferForm', 'goalTransferFromGoalId', 'goalTransferSource', 'goalTransferDestinations', 'goalTransferAmountCard', 'goalTransferAvailable', 'goalTransferAmount', 'goalTransferHint', 'goalTransferKeypad', 'goalTransferSaveButton', 'contributeDialog', 'contributeForm', 'contributeTitle', 'contributeGoalId', 'contributeAmount', 'contributeAccount', 'contributeNote', 'contributeWalletHint',
      'savingsWithdrawDialog', 'savingsWithdrawForm', 'savingsWithdrawTitle', 'savingsWithdrawGoalId', 'savingsWithdrawSummary', 'savingsWithdrawAccount', 'savingsWithdrawAvailable', 'savingsWithdrawAmount', 'savingsWithdrawDate', 'savingsWithdrawReason', 'savingsWithdrawNote', 'savingsWithdrawSaveButton',
      'legacySavingsSourceDialog', 'legacySavingsSourceForm', 'legacySavingsGoalId', 'legacySavingsSourceTitle', 'legacySavingsSourceSummary', 'legacySavingsAccount',
      'walletPickerDialog', 'walletPickerTitle', 'walletPickerSubtitle', 'walletPickerList',
      'globalHistoryDialog', 'globalHistorySearch', 'globalHistoryType', 'globalHistoryWallet', 'globalHistoryCategory', 'globalHistoryGoal', 'globalHistoryFrom', 'globalHistoryTo', 'globalHistoryMin', 'globalHistoryMax', 'globalHistoryCount', 'globalHistoryClear', 'globalHistoryResults', 'globalHistoryPager', 'globalHistoryPrev', 'globalHistoryNext', 'globalHistoryPageLabel',
      'categoryManagerDialog', 'categoryManagerForm', 'categoryEditId', 'categoryName', 'categoryIcon', 'categorySaveButton', 'categoryManagerList',
      'walletDetailDialog', 'walletDetailTitle', 'walletDetailSummary', 'walletDetailTransactions', 'dataHealthDialog', 'dataHealthHero', 'dataHealthDetailsList',
      'reconciliationCorrectionDialog', 'reconciliationCorrectionForm', 'reconciliationCorrectionAmount', 'reconciliationCorrectionDate', 'reconciliationCorrectionReason', 'reconciliationCorrectionNote',
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
      savingsGoalPage = 0;
      renderSavings();
      els.contentScroll.scrollTop = 0;
    });
    els.savingsWalletTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-savings-wallet-index]');
      if (!button) return;
      savingsWalletIndex = Number(button.dataset.savingsWalletIndex || 0);
      savingsMode = 'wallet';
      savingsGoalPage = 0;
      renderSavings();
      els.contentScroll.scrollTop = 0;
    });

    els.walletCarousel.addEventListener('scroll', queueWalletCarouselTransforms, { passive: true });
    els.walletCarousel.addEventListener('wheel', (event) => {
      if (activeAccounts().length <= 1) return;
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
    els.walletManageForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveWalletManagement();
    });
    els.transferFromAccount.addEventListener('change', () => {
      if (els.transferToAccount.value === els.transferFromAccount.value) {
        const fallback = activeAccounts().find((account) => account.id !== els.transferFromAccount.value)?.id || '';
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
    els.savingsWithdrawAccount.addEventListener('change', updateSavingsWithdrawalAvailability);
    els.savingsWithdrawForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveSavingsWithdrawal();
    });
    els.legacySavingsSourceForm.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'cancel') return;
      event.preventDefault();
      saveLegacySavingsSource();
    });
    els.categoryManagerForm.addEventListener('submit', (event) => { event.preventDefault(); saveCategoryManagerForm(); });
    [els.globalHistorySearch, els.globalHistoryType, els.globalHistoryWallet, els.globalHistoryCategory, els.globalHistoryGoal, els.globalHistoryFrom, els.globalHistoryTo, els.globalHistoryMin, els.globalHistoryMax].forEach((control) => {
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', () => { globalHistoryPage = 0; renderGlobalHistory(); });
    });
    els.globalHistoryClear.addEventListener('click', clearGlobalHistoryFilters);
    els.reconciliationCorrectionForm.addEventListener('submit', (event) => { event.preventDefault(); saveReconciliationCorrection(); });
    els.textSizeSetting.addEventListener('change', () => {
      uiPreferences.textSize = ['compact','default','large'].includes(els.textSizeSetting.value) ? els.textSizeSetting.value : 'default';
      saveUiPreferences(); renderAll();
      showToast(`Text size set to ${uiPreferences.textSize}.`);
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
    els.secretCompanionPerformance.addEventListener('change',()=>{secretConfig.companionPerformance=['auto','full','battery'].includes(els.secretCompanionPerformance.value)?els.secretCompanionPerformance.value:'auto';saveSecretConfig();renderSecretPocketSettings();clearCompanionTimers();syncSecretLightWorld({force:true});syncCompanion({fast:true});showToast(`Companion performance set to ${els.secretCompanionPerformance.options[els.secretCompanionPerformance.selectedIndex].text.toLowerCase()}.`);});
    els.companionNameInput.addEventListener('change',()=>{ const profile=companionProfileState(); profile.name=els.companionNameInput.value.trim().slice(0,14)||'Bunny'; profile.lastInteractionAt=Date.now(); saveSecretConfig(); renderCompanionRoom(); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`${profile.name} likes the new name ♡`; });
    els.companionPersonality.addEventListener('change',()=>{ const profile=companionProfileState(); profile.personality=['gentle','playful','curious'].includes(els.companionPersonality.value)?els.companionPersonality.value:'gentle'; profile.mood=companionMoodFromState(); profile.lastInteractionAt=Date.now(); saveSecretConfig(); renderCompanionRoom(); clearCompanionTimers(); syncCompanion({fast:true}); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`${profile.name} feels a little more ${profile.personality} now ✨`; });
    els.companionDataSpeech.addEventListener('change',()=>{ secretConfig.companionDataSpeech=['quiet','balanced','chatty','very-chatty'].includes(els.companionDataSpeech.value)?els.companionDataSpeech.value:'chatty'; saveSecretConfig(); renderCompanionRoom(); clearCompanionTimers(); syncCompanion({fast:true}); if(els.companionRoomMessage) els.companionRoomMessage.textContent=`Real-data talk set to ${els.companionDataSpeech.options[els.companionDataSpeech.selectedIndex].text.toLowerCase()} ♡`; });
    els.companionBunny.addEventListener('pointerdown', companionPointerDown);
    els.companionBunny.addEventListener('pointermove', companionPointerMove);
    els.companionBunny.addEventListener('pointerup', (event)=>companionPointerEnd(event,false));
    els.companionBunny.addEventListener('pointercancel', (event)=>companionPointerEnd(event,true));
    document.addEventListener('pointermove', companionPointerWatch, { passive: true });
    document.addEventListener('pointerover', (event)=>{ if(!companionIsAvailable()||companionPointerState||companionPhase!=='idle'||companionPerformanceReduced()) return; const target=event.target.closest('button,[role=button],.card,.goal-card,.wallet-mode-card'); if(target&&companionVisibleElement(target)) companionLookAtElement(target); }, { passive: true });
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
      currentCorrectionSourceId = null;
    });
    els.goalDialog.addEventListener('close', () => {
      currentGoalEditId = null;
    });
    els.allowanceDialog.addEventListener('close', () => {
      currentAllowanceEditId = null;
      currentCorrectionSourceId = null;
      els.allowanceKeypad.classList.add('is-hidden');
    });
    els.transferDialog.addEventListener('close', () => {
      currentTransferEditId = null;
      currentCorrectionSourceId = null;
    });
    els.walletManageDialog.addEventListener('close', () => {
      currentWalletManageId = null;
    });
    els.goalTransferDialog.addEventListener('close', () => {
      currentGoalTransferEditId = null;
      currentGoalTransferCorrectionId = null;
    });
    els.reconciliationCorrectionDialog.addEventListener('close', () => {
      currentReconciliationCorrectionId = null;
    });
    els.walletDetailDialog.addEventListener('close', () => {
      currentWalletDetailId = null;
    });
    els.contributeDialog.addEventListener('close', () => {
      currentCorrectionSourceId = null;
      currentSavingEditId = null;
      const submit = els.contributeForm.querySelector('button[type="submit"]');
      if (submit) submit.textContent = 'Add savings';
    });
    els.savingsWithdrawDialog.addEventListener('close', () => {
      currentSavingsWithdrawalEditId = null;
      currentSavingsWithdrawalCorrectionId = null;
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
      if (event.key === STORAGE_SYNC_KEY && event.newValue) {
        try { handleStorageSignal(JSON.parse(event.newValue)); } catch (error) {}
        return;
      }
      if (event.key === UI_PREFS_KEY && event.newValue) {
        const prefs = loadUiPreferences();
        if (prefs.value.theme !== uiPreferences.theme) {
          uiPreferences = prefs.value;
          if (state) { state.settings.theme = uiPreferences.theme; renderAll(); }
        } else uiPreferences = prefs.value;
        return;
      }
      if (storageBackend === 'localstorage' && event.key === STORAGE_KEY && event.newValue) {
        try {
          const next = migrateStateSchema(JSON.parse(event.newValue));
          next.settings.theme = uiPreferences.theme;
          validateNormalizedBackupIntegrity(next);
          state = next;
          lastCommittedStateSnapshot = cloneStorageValue(state);
          storageHealth = evaluateDataHealth(state);
          renderAll();
        } catch (error) { console.warn('Ignored an invalid cross-tab compatibility-storage update.', error); }
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { reloadTrackerFromIndexedDb({ announce: false }); prepareCompanionProfile(); checkForUpdates(); syncCompanion({ welcome: companionReturnGap > 1000 * 60 * 45 }); }
      else { persistCompanionPresence(); clearCompanionTimers(); }
    });
    window.addEventListener('pagehide', persistCompanionPresence);
    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, () => { companionLastUserActivityAt = Date.now(); document.body.classList.remove('companion-low-power'); resetCompanionIdleTimer(); }, { passive: true }));
    window.addEventListener('online', () => checkForUpdates({ force: true }));
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
      els.updateStatus.textContent = 'Hosted only';
      return;
    }

    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js?v=3.5.9');

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

  async function init() {
    cacheElements();
    await bootstrapPocketStorage();
    try {
      if (sessionStorage.getItem(LEGACY_LIGHT_SESSION_KEY) === '1') {
        secretConfig.discovered = true;
        secretConfig.firstRevealSeen = true;
        sessionStorage.setItem(SECRET_SESSION_KEY, '1');
        sessionStorage.removeItem(LEGACY_LIGHT_SESSION_KEY);
        await saveSecretConfig();
      }
    } catch (error) { /* Legacy session migration is best-effort. */ }
    prepareCompanionProfile();
    bindEvents();
    renderAll();
    setView(location.hash.slice(1) || 'home', false);
    runDataHealthCheck({ announce: false });
    if ('ResizeObserver' in window) {
      walletCarouselResizeObserver = new ResizeObserver(() => { if (currentView === 'home') stabilizeWalletCarousel(walletModeIndex); });
      walletCarouselResizeObserver.observe(els.walletCarousel);
    }
    window.addEventListener('resize', () => {
      if (currentView === 'home') stabilizeWalletCarousel(walletModeIndex);
      if (currentView === 'savings') renderSavings();
      if (els.allowanceHistoryDialog?.open) renderAllowanceHistory();
      if (els.globalHistoryDialog?.open) renderGlobalHistory();
      if (companionIsAvailable()) { const pos = companionSafePosition(true); companionPlace(pos.maxX, pos.maxY, true); }
    });
    registerServiceWorker();
    requestStoragePersistence({ announce: false });
    if (bootStorageMessage) window.setTimeout(() => showToast(bootStorageMessage), 650);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
