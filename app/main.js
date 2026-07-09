const APP_VERSION = "1.0.1";
const APP_BUILD_ID = "20260709-1512";
const APP_BASE_URL = new URL("../", import.meta.url);
const APP_VERSION_MANIFEST_URL = new URL("app-version.json", APP_BASE_URL).href;
const PACKAGE_URL = new URL("data/english-5a-demo.json", APP_BASE_URL).href;
const BOOTSTRAP_PACKAGE_URL = new URL("data/app-bootstrap-package.json", APP_BASE_URL).href;
const LATEST_PACKAGE_URL = new URL("data/latest-learning-package.json", APP_BASE_URL).href;
const TOTAL_REVIEW_MANIFEST_URL = new URL("data/learning-packages/latest-total-review-package.json", APP_BASE_URL).href;
const TOTAL_PREVIEW_MANIFEST_URL = new URL("data/learning-packages/latest-total-preview-package.json", APP_BASE_URL).href;
const TOTAL_STRENGTH_MANIFEST_URL = new URL("data/learning-packages/latest-total-5a-strength-package.json", APP_BASE_URL).href;
const STORAGE_KEY = "smart-study-state-v1";
const SPEECH_PROFILE_VERSION = "female-en-gb-slow-v1";
const DEFAULT_SPEECH_RATE = 0.54;
const NORMAL_SPEECH_MIN_RATE = 0.42;
const NORMAL_SPEECH_MAX_RATE = 0.9;
const SLOW_SPEECH_FACTOR = 0.78;
const SLOW_SPEECH_MIN_RATE = 0.34;
const SLOW_SPEECH_MAX_RATE = 0.72;
const QWERTY_KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) => row.split(""));
const SPELL_SYMBOL_KEYS = ["'", "/", "-", ".", ",", "?", "!"];
const KEYBOARD_INPUT_QUESTION_TYPES = new Set([
  "listen_spell_word",
  "zh_spell_word",
  "preview_vocab_zh_fill_blank",
  "preview_vocab_zh_full_spell"
]);
const FILL_BLANK_CHOICE_QUESTION_TYPES = new Set([
  "phrase_fill_blank",
  "sentence_fill_blank",
  "dialogue_fill_blank",
  "preview_sentence_fill_blank",
  "preview_dialogue_fill_blank"
]);
const FEMALE_BRITISH_VOICES = /serena|susan|martha|kate|shelley|stephanie|sarah|victoria|emma|amy|ava|samantha|karen|moira|zira|aria|jenny|sonia|libby|maisie|female/i;
const MALE_VOICES = /daniel|arthur|oliver|george|tom|male/i;

const routes = {
  home: { title: "小宝今天的英语课堂", eyebrow: "今日课堂" },
  english: { title: "英语学习路线", eyebrow: "先学会，再练稳" },
  mistakes: { title: "小漏洞回收站", eyebrow: "温和复习" },
  speaking: { title: "英音跟读", eyebrow: "听标准音，再开口" },
  parent: { title: "家长与 Mini", eyebrow: "备课、同步、核验" },
  lesson: { title: "五上学习课", eyebrow: "像学校一样先学后练" },
  practice: { title: "练习中", eyebrow: "轻练习" }
};

const defaultState = {
  activeRoute: "home",
  packageVersion: "1.0.0",
  learningPackageVersion: "",
  contentHash: "",
  cachedLearningPackage: null,
  updateLog: [],
  lastLogExportAt: "",
  studentName: "",
  completed: 0,
  streak: 0,
  records: [],
  mistakes: [],
  itemStats: {},
  sessionSummaries: [],
  resetLog: [],
  importedPackages: [],
  learnedItems: {},
  lessonProgress: {
    "5A-U1": { chunkIndex: 0 }
  },
  fiveAStage: "preview",
  nextTaskCursor: {
    fiveAPreviewChunkIndex: 0,
    fiveAStrengthIndex: 0
  },
  lastCompletedTaskId: "",
  activeLearningPackageId: "",
  activeLearningPackageVersion: "",
  testMode: true,
  testModeResetVersion: "",
  roundRecords: [],
  currentReviewRound: null,
  reviewRoundCursor: 0,
  reviewResume: null,
  previewItemStatus: {},
  lightWeakFaces: {},
  selectedMistakeCategory: "all",
  selectedReview: null,
  selectedScope: null,
  selectedSpeakingScopeId: "",
  unitProgress: {
    "5A-U1": "previewing"
  },
  settings: {
    grade: "五年级",
    term: "上册",
    mode: "daily",
    speechProvider: "demo",
    speechRate: DEFAULT_SPEECH_RATE,
    speechVoiceURI: "",
    speechAccent: "en-GB",
    speechProfileVersion: SPEECH_PROFILE_VERSION
  }
};

let data = null;
let state = loadState();
let currentPractice = null;
let mediaRecorder = null;
let recordedChunks = [];
let currentSpeakingItem = null;
let deferredInstallPrompt = null;
let availableVoices = [];
let currentLesson = null;
let speechRunId = 0;
let playbackSequenceId = 0;
let totalPackages = {
  review: null,
  preview: null,
  strength: null
};
let totalPackagesLoading = false;
let totalPackagesReady = false;
let fullLearningPackageLoading = null;

const appViews = {
  home: document.querySelector("#view-home"),
  english: document.querySelector("#view-english"),
  lesson: document.querySelector("#view-lesson"),
  practice: document.querySelector("#view-practice"),
  mistakes: document.querySelector("#view-mistakes"),
  speaking: document.querySelector("#view-speaking"),
  parent: document.querySelector("#view-parent")
};

const navItems = [...document.querySelectorAll(".nav-item")];
const pageTitle = document.querySelector("#pageTitle");
const eyebrow = document.querySelector("#eyebrow");
const toast = document.querySelector("#toast");
const appBuildBadge = document.querySelector("#appBuildBadge");
const appBuildText = document.querySelector("#appBuildText");
const manualUpdateButton = document.querySelector("#manualUpdateButton");

init();

async function init() {
  await checkForAppBuildUpdate();
  data = await loadLearningPackage();
  ensureTestModeReset();
  syncReviewResumeWithCurrentPackage();
  const firstVerifiedUnit = getFirstVerifiedUnit();
  currentSpeakingItem = firstVerifiedUnit?.words?.[0] || {
    id: "material-pending",
    en: "Materials are being verified.",
    zh: "资料正在核验中。"
  };
  setupEvents();
  setupPwa();
  setupSpeechVoices();
  renderAll();
  navigate("home");
  updateAppBuildBadge();
  loadTotalLearningPackagesInBackground();
}

async function checkForAppBuildUpdate() {
  try {
    const manifest = await fetchJson(`${APP_VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
    const onlineBuildId = manifest?.buildId || "";
    if (!onlineBuildId) return;
    if (onlineBuildId === APP_BUILD_ID) {
      appendUpdateLog({
        checkedAt: new Date().toISOString(),
        updateType: "app",
        onlineVersion: onlineBuildId,
        localVersion: APP_BUILD_ID,
        success: true,
        reason: "APP 已是最新构建"
      });
      saveState();
      return;
    }
    appendUpdateLog({
      checkedAt: new Date().toISOString(),
      updateType: "app",
      onlineVersion: onlineBuildId,
      localVersion: APP_BUILD_ID,
      success: false,
      reason: "检测到新 APP 构建，重新打开后生效"
    });
    saveState();
    await refreshAppShellCaches();
    showToast("检测到新版本，完全退出后重开会更新");
  } catch (error) {
    appendUpdateLog({
      checkedAt: new Date().toISOString(),
      updateType: "app",
      onlineVersion: "",
      localVersion: APP_BUILD_ID,
      success: false,
      reason: `APP 版本检查失败：${error.message || "网络不可用"}`
    });
    saveState();
  }
}

async function refreshAppShellCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("smart-study-")).map((key) => caches.delete(key)));
  } catch {
    // 缓存清理失败不影响继续学习。
  }
}

async function manualUpdateApp(triggerButton = manualUpdateButton) {
  const updateButtons = [...new Set([manualUpdateButton, triggerButton].filter(Boolean))];
  updateButtons.forEach((button) => {
    button.disabled = true;
  });
  showToast("正在检查并更新 APP...");
  try {
    await checkForAppBuildUpdate();
    await refreshAppShellCaches();
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    showToast("更新完成，正在重新打开");
    setTimeout(() => window.location.replace(`./?manual-update=${Date.now()}`), 500);
  } catch (error) {
    showToast(`手动更新失败：${error.message || "请稍后再试"}`);
    updateButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function ensureTestModeReset() {
  if (!state.testMode) return;
  if (state.testModeResetVersion === APP_VERSION) return;
  const keep = {
    cachedLearningPackage: state.cachedLearningPackage,
    learningPackageVersion: state.learningPackageVersion,
    contentHash: state.contentHash,
    updateLog: state.updateLog || [],
    studentName: state.studentName || "",
    importedPackages: state.importedPackages || [],
    settings: state.settings || defaultState.settings,
    activeLearningPackageId: state.activeLearningPackageId || "",
    activeLearningPackageVersion: state.activeLearningPackageVersion || "",
    selectedSpeakingScopeId: state.selectedSpeakingScopeId || ""
  };
  const resetAt = new Date().toISOString();
  state = {
    ...defaultState,
    ...keep,
    testMode: true,
    testModeResetVersion: APP_VERSION,
    resetLog: [
      ...(state.resetLog || []),
      {
        resetAt,
        resetKind: "test_mode_auto_reset",
        reason: "进入测试阶段，清除旧试用学习记录，保留学习包和设置"
      }
    ]
  };
  currentPractice = null;
  saveState();
}

async function loadLearningPackage() {
  const bootstrapPackage = await fetchJson(BOOTSTRAP_PACKAGE_URL).catch(() => fetchJson(PACKAGE_URL));
  const cachedPackage = validateLearningPackage(state.cachedLearningPackage).ok ? state.cachedLearningPackage : null;
  let activePackage = cachedPackage || bootstrapPackage;

  syncActivePackageMeta(activePackage);

  checkForLearningPackageUpdate(activePackage).then((updateResult) => {
    if (!updateResult.package) return;
    data = updateResult.package;
    syncActivePackageMeta(data);
    renderAll();
    navigate(state.activeRoute);
  });
  saveState();
  return activePackage;
}

function isFullLearningPackageLoaded() {
  return !data?.bootstrapOnly && Boolean(data?.studyPackage?.totalLibraryTasks || data?.scopedCatalog?.questions?.length);
}

async function ensureFullLearningPackage() {
  if (isFullLearningPackageLoaded()) return data;
  if (fullLearningPackageLoading) return fullLearningPackageLoading;
  showToast("正在准备题库...");
  fullLearningPackageLoading = (async () => {
    const manifest = await fetchJson(LATEST_PACKAGE_URL, { cache: "no-store" });
    const manifestValidation = validateLatestManifest(manifest);
    if (!manifestValidation.ok) throw new Error(manifestValidation.reason);
    const latest = manifestValidation.normalized;
    const fullPackage = await fetchJson(new URL(latest.packageUrl, APP_BASE_URL).href, { cache: "no-store" });
    const packageValidation = await validateDownloadedPackage(fullPackage, latest);
    if (!packageValidation.ok) throw new Error(packageValidation.reason);
    data = fullPackage;
    state.cachedLearningPackage = null;
    state.learningPackageVersion = latest.learningPackageVersion;
    state.contentHash = latest.contentHash;
    syncActivePackageMeta(data);
    saveState();
    renderAll();
    navigate(state.activeRoute);
    return data;
  })()
    .catch((error) => {
      showToast(`题库准备失败：${error.message || "网络不可用"}`);
      throw error;
    })
    .finally(() => {
      fullLearningPackageLoading = null;
    });
  return fullLearningPackageLoading;
}

async function checkForLearningPackageUpdate(localPackage) {
  const checkedAt = new Date().toISOString();
  const localVersion = getPackageVersion(localPackage);
  const localHash = state.contentHash || (await safeContentHash(localPackage));
  if (localHash) state.contentHash = localHash;
  try {
    const manifest = await fetchJson(LATEST_PACKAGE_URL, { cache: "no-store" });
    const manifestValidation = validateLatestManifest(manifest);
    if (!manifestValidation.ok) {
      appendUpdateLog({
        checkedAt,
        onlineVersion: manifestValidation.normalized?.learningPackageVersion || manifest?.learningPackageVersion || manifest?.version || "",
        localVersion,
        success: false,
        reason: manifestValidation.reason
      });
      return { package: null };
    }
    const latest = manifestValidation.normalized;

    if (localPackage?.bootstrapOnly && latest.learningPackageVersion === localVersion) {
      state.contentHash = latest.contentHash;
      appendUpdateLog({
        checkedAt,
        onlineVersion: latest.learningPackageVersion,
        localVersion,
        success: true,
        reason: "启动包已是最新，完整题库按需加载"
      });
      saveState();
      return { package: null };
    }

    if (latest.learningPackageVersion === localVersion && hashesEqual(latest.contentHash, localHash)) {
      appendUpdateLog({
        checkedAt,
        onlineVersion: latest.learningPackageVersion,
        localVersion,
        success: true,
        reason: "已是最新学习包"
      });
      return { package: null };
    }

    const nextPackage = await fetchJson(new URL(latest.packageUrl, APP_BASE_URL).href, { cache: "no-store" });
    const packageValidation = await validateDownloadedPackage(nextPackage, latest);
    if (!packageValidation.ok) {
      appendUpdateLog({
        checkedAt,
        onlineVersion: latest.learningPackageVersion,
        localVersion,
        success: false,
        reason: packageValidation.reason
      });
      return { package: null };
    }

    state.cachedLearningPackage = null;
    state.learningPackageVersion = latest.learningPackageVersion;
    state.contentHash = latest.contentHash;
    appendUpdateLog({
      checkedAt,
      onlineVersion: latest.learningPackageVersion,
      localVersion,
      success: true,
      reason: "更新成功"
    });
    return { package: nextPackage };
  } catch (error) {
    appendUpdateLog({
      checkedAt,
      onlineVersion: "",
      localVersion,
      success: false,
      reason: `检查失败：${error.message || "网络不可用"}`
    });
    return { package: null };
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadTotalLearningPackages() {
  const entries = [
    ["review", TOTAL_REVIEW_MANIFEST_URL],
    ["preview", TOTAL_PREVIEW_MANIFEST_URL],
    ["strength", TOTAL_STRENGTH_MANIFEST_URL]
  ];
  const results = await Promise.allSettled(entries.map(([kind, manifestUrl]) => loadTotalLearningPackage(kind, manifestUrl)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      appendUpdateLog({
        checkedAt: new Date().toISOString(),
        onlineVersion: entries[index][0],
        localVersion: getPackageVersion(data),
        success: false,
        reason: `总题库加载失败：${result.reason?.message || "网络不可用"}`
      });
    }
  });
}

function loadTotalLearningPackagesInBackground() {
  if (totalPackagesLoading || totalPackagesReady) return;
  totalPackagesLoading = true;
  loadTotalLearningPackages()
    .then(() => {
      totalPackagesReady = true;
      syncReviewResumeWithCurrentPackage();
      renderAll();
      navigate(state.activeRoute);
    })
    .catch((error) => {
      appendUpdateLog({
        checkedAt: new Date().toISOString(),
        onlineVersion: "total-packages",
        localVersion: getPackageVersion(data),
        success: false,
        reason: `总题库后台加载失败：${error.message || "网络不可用"}`
      });
      saveState();
    })
    .finally(() => {
      totalPackagesLoading = false;
    });
}

async function loadTotalLearningPackage(kind, manifestUrl) {
  const manifest = await fetchJson(manifestUrl, { cache: "no-store" });
  const packageUrl = new URL(manifest.packageFile || manifest.file, APP_BASE_URL).href;
  const packageData = await fetchJson(packageUrl, { cache: "no-store" });
  totalPackages[kind] = {
    manifest,
    package: packageData
  };
}

async function ensureTotalPackagesReadyFor(kind = "all") {
  const requiredKinds =
    kind === "today" ? ["review", getFiveAStage() === "reinforcement" ? "strength" : "preview"] : kind === "all" ? ["review", "preview", "strength"] : [kind];
  const missingKinds = requiredKinds.filter((item) => !totalPackages[item]?.package);
  if (!missingKinds.length) return totalPackages;
  showToast("正在准备对应题库...");
  await Promise.all(
    missingKinds.map((item) => {
      const manifestUrl = {
        review: TOTAL_REVIEW_MANIFEST_URL,
        preview: TOTAL_PREVIEW_MANIFEST_URL,
        strength: TOTAL_STRENGTH_MANIFEST_URL
      }[item];
      return manifestUrl ? loadTotalLearningPackage(item, manifestUrl) : Promise.resolve();
    })
  );
  totalPackagesReady = Boolean(totalPackages.review?.package && totalPackages.preview?.package && totalPackages.strength?.package);
  renderAll();
  navigate(state.activeRoute);
  return totalPackages;
}

function syncActivePackageMeta(packageData) {
  state.learningPackageVersion = getPackageVersion(packageData);
  if (packageData?.contentHash) state.contentHash = packageData.contentHash;
}

function appendUpdateLog(entry) {
  state.updateLog = [entry, ...(state.updateLog || [])].slice(0, 30);
}

function setupEvents() {
  navItems.forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.route));
  });

  document.querySelector("#soundButton").addEventListener("click", () => {
    speakLikeTeacher("Good habits are important.", { repeat: 1 });
  });

  document.querySelector("#installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      showToast("Safari 可通过分享按钮添加到主屏幕");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });

  if (manualUpdateButton) {
    manualUpdateButton.addEventListener("click", (event) => manualUpdateApp(event.currentTarget));
  }
}

function setupPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {
        showToast("离线缓存清理暂未完成");
      });
  }
}

function renderAll() {
  renderHome();
  renderEnglish();
  renderMistakes();
  renderSpeaking();
  renderParent();
  updatePackageMeta();
  updateAppBuildBadge();
}

function getVerifiedUnits() {
  return (data?.units || []).filter((unit) => unit.verified === true);
}

function getFirstVerifiedUnit() {
  return getVerifiedUnits()[0] || null;
}

function getVerifiedReviewUnits() {
  return (data?.reviewUnits || []).filter((unit) => unit.verified === true && unit.verification?.fullBookVerified === true);
}

function getAllPracticeUnits() {
  return [...getVerifiedReviewUnits(), ...getVerifiedUnits()];
}

function getNextPreviewUnit() {
  return getVerifiedUnits().find((unit) => state.unitProgress[unit.id] !== "mastered") || null;
}

function getCurrentStudyUnit() {
  return getNextPreviewUnit() || getFirstVerifiedUnit();
}

function getScopedCatalog() {
  return data?.scopedCatalog || { scopes: [], items: [], questions: [] };
}

function getScopeById(scopeId) {
  return getScopedCatalog().scopes?.find((scope) => scope.scopeId === scopeId) || null;
}

function getBookReviewScopes() {
  const scopes = getScopedCatalog().scopes || [];
  return ["book-3A", "book-3B", "book-4A", "book-4B"]
    .map((scopeId) => scopes.find((scope) => scope.scopeId === scopeId))
    .filter(Boolean);
}

function getFiveAUnitScopes() {
  return (getScopedCatalog().scopes || [])
    .filter((scope) => scope.scopeType === "fiveAUnit" && scope.appVisible !== false)
    .sort((a, b) => String(a.unitId || a.scopeId).localeCompare(String(b.unitId || b.scopeId), "en", { numeric: true }));
}

function scopeFromUnit(unit) {
  if (!unit) return null;
  const catalogScope = getScopeById(unit.id);
  return {
    type: "unitLearning",
    scopeId: catalogScope?.scopeId || unit.id,
    scopeType: catalogScope?.scopeType || "fiveAUnit",
    bookId: unit.bookId || "5A",
    unitId: unit.id,
    sourceLabel: catalogScope?.title || unit.title,
    sourceMode: "unit_learning"
  };
}

function scopeFromCatalog(scope) {
  if (!scope) return null;
  const sourceMode = {
    bookReview: "book_review",
    mixedReview: "mixed_review",
    fiveAUnit: "unit_learning",
    weaknessSpecial: "weakness_practice"
  }[scope.scopeType] || "scope_practice";
  return {
    type: scope.scopeType === "fiveAUnit" ? "unitLearning" : scope.scopeType,
    scopeId: scope.scopeId,
    scopeType: scope.scopeType,
    bookId: scope.bookId || null,
    unitId: scope.unitId || null,
    sourceLabel: scope.title,
    sourceMode
  };
}

function setSelectedScope(scope) {
  state.selectedScope = scope;
  saveState();
}

function getUnitById(unitId) {
  return getAllPracticeUnits().find((unit) => unit.id === unitId) || null;
}

function getLessonProgress(unitId) {
  if (!state.lessonProgress[unitId]) state.lessonProgress[unitId] = { chunkIndex: 0 };
  return state.lessonProgress[unitId];
}

function getCurrentLearningChunk(unit) {
  const chunks = getLearningChunks(unit);
  const progress = getLessonProgress(unit.id);
  return chunks[Math.min(progress.chunkIndex || 0, chunks.length - 1)] || chunks[0];
}

function getLearningChunks(unit) {
  if (!unit) return [];
  if (unit.id === "5A-U1") return buildUnit1Chunks(unit);
  return buildGenericChunks(unit);
}

function buildUnit1Chunks(unit) {
  return [
    {
      id: "5A-U1-C1",
      title: "好习惯主题和 Yang Ling 开头",
      focus: "先听懂好习惯主题，学 6 个重点词和开头故事句。",
      wordIds: ["5A-U1-W01", "5A-U1-W03", "5A-U1-W04", "5A-U1-W10", "5A-U1-W11", "5A-U1-W12"],
      phraseIds: ["5A-U1-P01", "5A-U1-P02"],
      sentenceIds: ["5A-U1-S01", "5A-U1-S02", "5A-U1-S03", "5A-U1-S04"],
      storyIds: ["5A-U1-ST01", "5A-U1-ST02", "5A-U1-ST03", "5A-U1-ST04"]
    },
    {
      id: "5A-U1-C2",
      title: "Yang Ling 的阅读习惯",
      focus: "把读书、睡前阅读、保护眼睛这些句子读顺。",
      wordIds: ["5A-U1-W13", "5A-U1-W14", "5A-U1-W15", "5A-U1-W16", "5A-U1-W17"],
      phraseIds: ["5A-U1-P06", "5A-U1-P08"],
      sentenceIds: ["5A-U1-S05", "5A-U1-S06", "5A-U1-S07", "5A-U1-S08"],
      storyIds: ["5A-U1-ST05", "5A-U1-ST06"]
    },
    {
      id: "5A-U1-C3",
      title: "Wang Bing 的好习惯",
      focus: "学习记笔记、整理物品、按时完成作业等表达。",
      wordIds: ["5A-U1-W02", "5A-U1-W05", "5A-U1-W06", "5A-U1-W18", "5A-U1-W19"],
      phraseIds: ["5A-U1-P03", "5A-U1-P04", "5A-U1-P05", "5A-U1-P07"],
      sentenceIds: ["5A-U1-S09", "5A-U1-S10", "5A-U1-S11", "5A-U1-S12", "5A-U1-S13", "5A-U1-S14", "5A-U1-S15", "5A-U1-S16", "5A-U1-S17"],
      storyIds: ["5A-U1-ST07", "5A-U1-ST08", "5A-U1-ST09", "5A-U1-ST10", "5A-U1-ST11", "5A-U1-ST12"]
    },
    {
      id: "5A-U1-C4",
      title: "频率副词和句型替换",
      focus: "练 always / usually / often / never，以及第三人称句型。",
      wordIds: ["5A-U1-W09", "5A-U1-W14", "5A-U1-W20", "5A-U1-W21"],
      phraseIds: ["5A-U1-P01", "5A-U1-P03", "5A-U1-P04", "5A-U1-P07"],
      sentenceIds: ["5A-U1-S02", "5A-U1-S03", "5A-U1-S09", "5A-U1-S15", "5A-U1-S18"],
      storyIds: []
    },
    {
      id: "5A-U1-C5",
      title: "Unit 1 综合复盘",
      focus: "只复盘本单元已经学过的词句和课文。",
      reviewOnly: true,
      wordIds: unit.words.map((item) => item.id),
      phraseIds: (unit.phrases || []).map((item) => item.id),
      sentenceIds: unit.sentences.map((item) => item.id),
      storyIds: (unit.story || []).map((item) => item.id)
    }
  ].map((chunk) => hydrateChunk(unit, chunk));
}

function buildGenericChunks(unit) {
  const chunks = [];
  const wordGroups = chunkArray(unit.words || [], 8);
  wordGroups.forEach((words, index) => {
    const story = (unit.story || []).slice(index * 4, index * 4 + 5);
    const sentences = (unit.sentences || []).slice(index * 3, index * 3 + 4);
    chunks.push(
      hydrateChunk(unit, {
        id: `${unit.id}-C${index + 1}`,
        title: `${unit.title} 第 ${index + 1} 小课`,
        focus: "按少量单词、相关句子、课文片段推进。",
        wordIds: words.map((item) => item.id),
        phraseIds: (unit.phrases || []).slice(index * 2, index * 2 + 3).map((item) => item.id),
        sentenceIds: sentences.map((item) => item.id),
        storyIds: story.map((item) => item.id)
      })
    );
  });
  chunks.push(
    hydrateChunk(unit, {
      id: `${unit.id}-Review`,
      title: `${unit.title} 综合复盘`,
      focus: "复盘本单元已经开放学习的内容。",
      reviewOnly: true,
      wordIds: (unit.words || []).map((item) => item.id),
      phraseIds: (unit.phrases || []).map((item) => item.id),
      sentenceIds: (unit.sentences || []).map((item) => item.id),
      storyIds: (unit.story || []).map((item) => item.id)
    })
  );
  return chunks;
}

function hydrateChunk(unit, chunk) {
  return {
    ...chunk,
    words: findItemsByIds(unit.words || [], chunk.wordIds),
    phrases: findItemsByIds(unit.phrases || [], chunk.phraseIds),
    sentences: findItemsByIds(unit.sentences || [], chunk.sentenceIds),
    story: findItemsByIds(unit.story || [], chunk.storyIds)
  };
}

function findItemsByIds(items, ids = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function getChunkLearningItems(chunk) {
  if (!chunk) return [];
  return [
    ...chunk.words.map((item) => ({ ...item, itemKind: "word" })),
    ...chunk.phrases.map((item) => ({ ...item, itemKind: "phrase" })),
    ...chunk.sentences.map((item) => ({ ...item, itemKind: "sentence" })),
    ...chunk.story.map((item) => ({ ...item, itemKind: "story" }))
  ];
}

function markChunkLearned(unit, chunk) {
  getChunkLearningItems(chunk).forEach((item) => {
    if (!state.learnedItems[item.id]) {
      state.learnedItems[item.id] = {
        itemId: item.id,
        itemKind: item.itemKind,
        unitId: unit.id,
        chunkId: chunk.id,
        stage: "new",
        learningStatus: "newLearned",
        testStatus: "untested",
        masteryStatus: "notStable",
        gate: {
          heardStandardAudio: true,
          readMeaningOrScene: true,
          followedOrRead: true,
          lightPractice: true
        },
        learnedAt: new Date().toISOString(),
        lastPracticedAt: null
      };
    }
    const stat = getItemStat(item.id, item.itemKind);
    stat.stage = getChildStageLabel(stat);
    stat.learningStatus = "newLearned";
    stat.testStatus ||= "untested";
    stat.masteryStatus = "notStable";
    stat.learnedAt ||= state.learnedItems[item.id].learnedAt;
  });
}

function getLearnedEntry(itemId) {
  return state.learnedItems[itemId] || null;
}

function isItemLearned(itemId) {
  return Boolean(getLearnedEntry(itemId));
}

function getCatalogItem(itemId) {
  return (getScopedCatalog().items || []).find((item) => item.itemId === itemId) || null;
}

function decoratePracticeItem(item, unit, extra = {}) {
  const catalogItem = getCatalogItem(item.id);
  return {
    ...item,
    bookId: unit.bookId || catalogItem?.bookId || inferBookId({ itemId: item.id, unitId: unit.id }),
    unitId: unit.id,
    scopeIds: catalogItem?.scopeIds || [],
    sourceMode: extra.sourceMode,
    ...extra
  };
}

function isItemInScope(item, scope) {
  if (!scope) return true;
  if (scope.scopeId === "weakness-special") return true;
  if (scope.itemIds?.length && !scope.itemIds.includes(item.id)) return false;
  if (scope.bookId && item.bookId && scope.bookId !== item.bookId) return false;
  if (scope.unitId && item.unitId && scope.unitId !== item.unitId) return false;
  return true;
}

function getLearnedQuestionItems(filter = {}) {
  const items = [];
  getVerifiedUnits().forEach((unit) => {
    const all = [
      ...(unit.words || []).map((item) => ({ ...item, itemKind: "word" })),
      ...(unit.phrases || []).map((item) => ({ ...item, itemKind: "phrase" })),
      ...(unit.sentences || []).map((item) => ({ ...item, itemKind: "sentence" }))
    ];
    all.forEach((item) => {
      const entry = getLearnedEntry(item.id);
      if (!entry) return;
      if (filter.unitId && filter.unitId !== unit.id) return;
      if (filter.chunkId && filter.chunkId !== entry.chunkId) return;
      items.push(decoratePracticeItem(item, unit, { chunkId: entry.chunkId }));
    });
  });
  return items;
}

function getReviewQuestionItems(filter = {}) {
  const items = [];
  getVerifiedReviewUnits().forEach((unit) => {
    if (filter.catalogId && filter.catalogId !== unit.catalogId) return;
    if (filter.unitId && filter.unitId !== unit.id) return;
    const all = [
      ...(unit.words || []).map((item) => ({ ...item, itemKind: "word" })),
      ...(unit.phrases || []).map((item) => ({ ...item, itemKind: "phrase" })),
      ...(unit.sentences || []).map((item) => ({ ...item, itemKind: "sentence" }))
    ];
    all.forEach((item) => items.push(decoratePracticeItem(item, unit, { catalogId: unit.catalogId, reviewUnit: true })));
  });
  return items;
}

function getQuestionItemsForScope(scopeId) {
  const scope = getScopeById(scopeId);
  if (!scope) return [];
  if (scope.scopeType === "fiveAUnit") return getLearnedQuestionItems({ unitId: scope.unitId || scope.scopeId });
  const reviewItems = getReviewQuestionItems();
  return reviewItems.filter((item) => isItemInScope(item, scope));
}

function getFiveAStage() {
  if (state.fiveAStage === "reinforcement") return "reinforcement";
  if (state.fiveAStage === "sentence_learning") return "sentence_learning";
  return "preview";
}

function getTotalPackage(kind) {
  return totalPackages[kind]?.package || null;
}

function getCurrentPreviewChunk() {
  const previewPackage = getTotalPackage("preview");
  const chunks = (previewPackage?.chunks || []).filter((chunk) => chunk.stage === "vocabulary");
  const index = Math.min(state.nextTaskCursor?.fiveAPreviewChunkIndex || 0, Math.max(0, chunks.length - 1));
  return chunks[index] || null;
}

function getPreviewItem(itemId) {
  return (getTotalPackage("preview")?.items || []).find((item) => item.itemId === itemId) || null;
}

function getPreviewChunkItems(chunk = getCurrentPreviewChunk()) {
  if (!chunk) return [];
  return (chunk.itemIds || []).map(getPreviewItem).filter(Boolean);
}

function markPreviewChunkGate(chunk, gatePatch = {}) {
  getPreviewChunkItems(chunk).forEach((item) => {
    const existing = state.previewItemStatus[item.itemId] || {};
    state.previewItemStatus[item.itemId] = {
      itemId: item.itemId,
      wordListItemId: item.itemId,
      itemKind: item.itemKind,
      wordListOrder: item.orderKey || item.itemId,
      unitId: item.unitId,
      gateStatus: {
        heardStandardAudio: true,
        meaningViewed: true,
        readOrRepeatDone: true,
        lightPracticeDone: false,
        miniQuizDone: false,
        ...(existing.gateStatus || {}),
        ...gatePatch
      },
      previewStatus: "learning",
      lightQuizStatus: existing.lightQuizStatus || "pending",
      miniQuizStatus: existing.miniQuizStatus || "pending",
      updatedAt: new Date().toISOString()
    };
  });
}

function isFiveAReinforcementAllowed() {
  if (getFiveAStage() !== "reinforcement") return false;
  const statuses = Object.values(state.previewItemStatus || {});
  return statuses.length > 0 && statuses.every((item) => item.gateStatus?.miniQuizDone === true);
}

function getSpeakingScopes() {
  return [...getBookReviewScopes(), ...getFiveAUnitScopes()];
}

function getDefaultSpeakingScopeId() {
  const available = getSpeakingScopes();
  if (!available.length) return "";
  if (available.some((scope) => scope.scopeId === state.selectedSpeakingScopeId)) return state.selectedSpeakingScopeId;
  if (state.selectedScope?.scopeId && available.some((scope) => scope.scopeId === state.selectedScope.scopeId)) {
    return state.selectedScope.scopeId;
  }
  const previewScope = getFiveAUnitScopes().find((scope) => scope.unitId === getCurrentStudyUnit()?.id);
  return previewScope?.scopeId || available[0].scopeId;
}

function getAllQuestionItemsForScope(scopeId) {
  const scope = getScopeById(scopeId);
  if (!scope) return [];
  const units = scope.scopeType === "fiveAUnit" ? getVerifiedUnits() : getVerifiedReviewUnits();
  const items = [];
  units.forEach((unit) => {
    const all = [
      ...(unit.words || []).map((item) => ({ ...item, itemKind: "word" })),
      ...(unit.phrases || []).map((item) => ({ ...item, itemKind: "phrase" })),
      ...(unit.sentences || []).map((item) => ({ ...item, itemKind: "sentence" }))
    ];
    all.forEach((item) => {
      const decorated = decoratePracticeItem(item, unit, {
        catalogId: unit.catalogId,
        reviewUnit: scope.scopeType !== "fiveAUnit",
        scopeId: scope.scopeId,
        scopeType: scope.scopeType,
        sourceLabel: scope.title,
        sourceMode: "speaking"
      });
      if (isItemInScope(decorated, scope)) items.push(decorated);
    });
  });
  return items;
}

function getSpeakingItems(scopeId) {
  return getAllQuestionItemsForScope(scopeId)
    .filter((item) => ["word", "phrase", "sentence"].includes(item.itemKind))
    .slice(0, 80);
}

function speakingScopeOptions(selectedScopeId) {
  return getSpeakingScopes()
    .map((scope) => `<option value="${escapeAttr(scope.scopeId)}" ${scope.scopeId === selectedScopeId ? "selected" : ""}>${scope.title}</option>`)
    .join("");
}

const oldKnowledgeReviewPlan = {
  total: 60,
  targets: {
    word: 24,
    phrase: 7,
    sentence: 22,
    textDialogue: 7
  }
};

const oldKnowledgeReviewTypePlan = {
  word: [
    ["listen_choose_word", 4],
    ["en_to_zh", 4],
    ["zh_to_en", 3],
    ["listen_spell_word", 5],
    ["zh_spell_word", 5],
    ["context_choose_word", 1],
    ["phonics_shape_confusion_word", 1],
    ["semantic_confusion_word", 1]
  ],
  phrase: [
    ["phrase_fill_blank", 3],
    ["phrase_in_sentence", 2],
    ["context_choose_phrase", 1],
    ["confusion_phrase", 1]
  ],
  sentence: [
    ["sentence_fill_blank", 7],
    ["reorder_words", 4],
    ["zh_key_expression", 5],
    ["context_choose_sentence", 3],
    ["grammar_punctuation_confusion", 3]
  ],
  textDialogue: [
    ["text_dialogue_listen_read", 1],
    ["text_dialogue_order", 1],
    ["story_detail_choice", 1],
    ["dialogue_fill_blank", 2],
    ["role_scene_transfer", 2]
  ]
};

function getWarmupQuestions() {
  const packageReviewQuestions = getPackagedOldKnowledgeReviewPracticeQuestions();
  if (packageReviewQuestions.length) {
    return packageReviewQuestions.slice(0, oldKnowledgeReviewPlan.total);
  }

  const targets = { ...oldKnowledgeReviewPlan.targets };
  const reviewItems = getReviewQuestionItems()
    .sort((a, b) => getItemMasteryScore(a.id, a.itemKind) - getItemMasteryScore(b.id, b.itemKind));
  const selectedItems = [];
  const selectedIds = new Set();

  Object.entries(targets).forEach(([kind, limit]) => {
    pickReviewItems(reviewItems, kind, limit, selectedIds).forEach((item) => {
      selectedIds.add(item.id);
      selectedItems.push(item);
    });
  });

  const plannedCount = oldKnowledgeReviewPlan.total;
  if (selectedItems.length < plannedCount) {
    reviewItems
      .filter((item) => !selectedIds.has(item.id))
      .slice(0, plannedCount - selectedItems.length)
      .forEach((item) => {
        selectedIds.add(item.id);
        selectedItems.push(item);
      });
  }

  const reviewQuestions = selectedItems
    .slice(0, plannedCount)
    .map((item) => questionForLearnedItem(item, { badge: "旧知复习", scopeId: "review-mixed-3-4" }));
  return uniqueQuestions(reviewQuestions).slice(0, oldKnowledgeReviewPlan.total);
}

function getPackagedOldKnowledgeReviewPracticeQuestions() {
  const { questions: taskQuestions, roundNo, roundId } = getCurrentOldKnowledgeReviewRound();
  if (!taskQuestions.length) return [];
  return taskQuestions
    .slice(0, oldKnowledgeReviewPlan.total)
    .map((question) =>
      packageQuestionToPractice(
        {
          ...question,
          roundNo: question.roundNo || roundNo,
          roundId: question.roundId || roundId
        },
        "旧知复习",
        "review"
      )
    );
}

function getCurrentOldKnowledgeReviewRound() {
  const oldKnowledgeReview = data?.studyPackage?.totalLibraryTasks?.oldKnowledgeReview || {};
  const rounds = Array.isArray(oldKnowledgeReview.rounds) ? oldKnowledgeReview.rounds : [];
  const cursor = Math.max(0, state.reviewRoundCursor || 0);
  if (rounds.length) {
    const index = Math.min(cursor, rounds.length - 1);
    const round = rounds[index] || {};
    const questions = (round.questions || []).filter((question) => !isStandaloneAlphabetDrill(question));
    return {
      questions,
      roundNo: round.roundNo || index + 1,
      roundId: round.roundId || `old-review-round-${index + 1}`,
      totalRounds: rounds.length,
      complete: cursor >= rounds.length
    };
  }
  return {
    questions: getPackagedOldKnowledgeReviewQuestions(),
    roundNo: cursor + 1,
    roundId: `old-review-round-${cursor + 1}`,
    totalRounds: 1,
    complete: false
  };
}

function buildOldKnowledgeReviewQuestionsFromPackage(targets) {
  const taskQuestions = getPackagedOldKnowledgeReviewQuestions();
  if (!taskQuestions.length) return [];
  const selected = [];
  const used = new Set();
  Object.entries(targets).forEach(([kind, target]) => {
    const plan = scaleQuestionTypePlan(oldKnowledgeReviewTypePlan[kind] || [], target);
    plan.forEach(([questionType, count]) => {
      pickReviewPackageQuestions(taskQuestions, kind, questionType, count, used).forEach((question) => {
        used.add(question.questionId);
        selected.push(question);
      });
    });
    const remaining = target - selected.filter((question) => reviewPackageQuestionCategory(question) === kind).length;
    if (remaining > 0) {
      pickReviewPackageQuestions(taskQuestions, kind, null, remaining, used).forEach((question) => {
        used.add(question.questionId);
        selected.push(question);
      });
    }
  });
  return interleaveReviewPackageQuestions(selected)
    .slice(0, Object.values(targets).reduce((sum, count) => sum + count, 0))
    .map((question) => packageQuestionToPractice(question, "旧知复习", "review"));
}

function getPackagedOldKnowledgeReviewQuestions() {
  const taskQuestions = data?.studyPackage?.totalLibraryTasks?.oldKnowledgeReview?.questions || [];
  if (taskQuestions.length) return sortPackageQuestions(taskQuestions).filter((question) => !isStandaloneAlphabetDrill(question));
  const questionIds =
    data?.studyPackage?.current?.steps?.find((step) => step.id === "old-knowledge-review")?.questionIds || [];
  const reviewPackage = getTotalPackage("review");
  const questions = (reviewPackage?.questions || []).filter((question) => !isStandaloneAlphabetDrill(question));
  if (!questionIds.length || !questions.length) return [];
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  return questionIds.map((questionId) => byId.get(questionId)).filter(Boolean);
}

function scaleQuestionTypePlan(basePlan, target) {
  const baseTotal = basePlan.reduce((sum, [, count]) => sum + count, 0);
  if (!baseTotal || target <= 0) return [];
  const scaled = basePlan.map(([questionType, count]) => ({
    questionType,
    exact: (count * target) / baseTotal,
    count: Math.floor((count * target) / baseTotal)
  }));
  let remaining = target - scaled.reduce((sum, item) => sum + item.count, 0);
  scaled
    .sort((a, b) => b.exact - b.count - (a.exact - a.count))
    .forEach((item) => {
      if (remaining <= 0) return;
      item.count += 1;
      remaining -= 1;
    });
  return scaled.map((item) => [item.questionType, item.count]).filter(([, count]) => count > 0);
}

function pickReviewPackageQuestions(questions, kind, questionType, count, used) {
  return questions
    .filter((question) => !used.has(question.questionId))
    .filter((question) => reviewPackageQuestionCategory(question) === kind)
    .filter((question) => !questionType || question.questionType === questionType)
    .slice(0, count);
}

function reviewPackageQuestionCategory(question) {
  if (question.questionCategory === "text-dialogue") return "textDialogue";
  if (question.questionCategory === "word" || question.itemKind === "word") return "word";
  if (question.questionCategory === "phrase" || question.itemKind === "phrase") return "phrase";
  return "sentence";
}

function isStandaloneAlphabetDrill(question) {
  const target = question.targetText || question.answer || "";
  const compact = String(target).replace(/[\s,;；、-]/g, "");
  const alphabetPairs = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";
  if (compact.length >= 4 && compact.length % 2 === 0) {
    const pairs = compact.match(/[A-Z][a-z]/g) || [];
    if (pairs.join("") === compact && pairs.every((pair) => alphabetPairs.includes(pair))) return true;
  }
  return /letters?\s+in\s+focus/i.test(`${question.section || ""} ${question.sourceText || ""}`) && /字母|letter/i.test(`${question.targetMeaning || ""} ${question.prompt || ""}`);
}

function interleaveReviewPackageQuestions(questions) {
  const categories = ["word", "sentence", "phrase", "textDialogue"];
  const buckets = Object.fromEntries(categories.map((category) => [category, questions.filter((question) => reviewPackageQuestionCategory(question) === category)]));
  const mixed = [];
  while (categories.some((category) => buckets[category].length)) {
    categories.forEach((category) => {
      const next = buckets[category].shift();
      if (next) mixed.push(next);
    });
  }
  return mixed;
}

function sortPackageQuestions(questions) {
  return [...questions].sort((a, b) => String(a.sortKey || a.questionId).localeCompare(String(b.sortKey || b.questionId), "en", { numeric: true }));
}

function pickReviewItems(items, kind, limit, selectedIds) {
  return items
    .filter((item) => !selectedIds.has(item.id))
    .filter((item) => reviewItemCategory(item) === kind)
    .slice(0, limit);
}

function reviewItemCategory(item) {
  if (isTextDialogueReviewItem(item)) return "textDialogue";
  if (item.itemKind === "word") return "word";
  if (item.itemKind === "phrase") return "phrase";
  return "sentence";
}

function isTextDialogueReviewItem(item) {
  const marker = `${item.section || ""} ${item.sourceLayer || ""} ${item.type || ""} ${item.source || ""}`.toLowerCase();
  return /story|cartoon|dialog|dialogue|rhyme|song/.test(marker);
}

function isMaterialVerified() {
  return ["verified", "partial-verified"].includes(data?.status) && getVerifiedUnits().length > 0;
}

function isUnitVerified(unitId) {
  return getVerifiedUnits().some((unit) => unit.id === unitId);
}

function materialStatusText() {
  if (data?.status === "verified") return "全部已验证";
  if (data?.status === "partial-verified") return "部分已验证";
  return "校对中";
}

function navigate(route) {
  stopAudioPlayback();
  const target = routes[route] ? route : "home";
  state.activeRoute = target;
  saveState();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  Object.values(appViews).forEach((view) => view.classList.remove("active"));
  appViews[target]?.classList.add("active");

  navItems.forEach((item) => item.classList.toggle("active", item.dataset.route === target));
  pageTitle.textContent = routes[target]?.title ?? "学习";
  eyebrow.textContent = routes[target]?.eyebrow ?? "智能学习助手";
  updateAppBuildBadge(target);
}

function renderHome() {
  const weakCount = getActiveMistakes().length;
  const accuracy = calcAccuracy();
  const materialReady = isMaterialVerified();
  const fiveAStage = getFiveAStage();
  const hasStrength = fiveAStage === "reinforcement" && materialReady;
  const previewChunk = getCurrentPreviewChunk();
  const hasPreview = fiveAStage !== "reinforcement" && Boolean(previewChunk) && materialReady;
  const previewUnit = getNextPreviewUnit();
  const mastery = previewUnit ? getUnitMastery(previewUnit) : getUnitMastery(getFirstVerifiedUnit());
  const todayTasks = hasStrength
    ? [
        taskItem(1, "旧知复习", "三四年级固定总复习", "60 题"),
        taskItem(2, "小漏洞回收", weakCount ? `${weakCount} 个小点优先` : "暂无则跳过", "动态追加"),
        taskItem(3, "五上加强测试", "只测已完成 gate 的内容", "30 题"),
        taskItem(4, "提交学习日志", "生成 JSON，手动发到飞书群", "完成后")
      ].join("")
    : hasPreview
    ? [
        taskItem(1, "旧知复习", "三四年级固定总复习", "60 题"),
        taskItem(2, "小漏洞回收", weakCount ? `${weakCount} 个小点优先` : "暂无则跳过", "动态追加"),
        taskItem(3, "五上预习学习", `${previewChunk.title || "五上词表项预习"}：听懂读`, "10 项"),
        taskItem(4, "轻测", "英中互认 / 听音选词 / 看中文补英文", "30 题"),
        taskItem(5, "小测", "看中文默写完整英文", "10 题"),
        taskItem(6, "提交学习日志", "生成 JSON，手动发到飞书群", "完成后")
      ].join("")
    : [
        taskItem(1, "旧知复习", "只从已学池抽题，错开覆盖", "60 题"),
        taskItem(2, "小漏洞回收", weakCount ? `${weakCount} 个小点优先` : "薄弱点专项", "滚动复现"),
        taskItem(3, "提交学习日志", "生成 JSON，手动发到飞书群", "完成后")
      ].join("");
  appViews.home.innerHTML = `
    <div class="hero-band">
      <section class="today-plan">
        <p class="eyebrow">今日学习</p>
        <h2>${hasStrength ? "先复习，再做五上加强测试" : hasPreview ? "先旧知复习，再学五上新内容" : "今天做一轮已学总复习"}</h2>
        <p class="hero-copy">目标是每个核心点最终 100% 掌握。不会的先记下来，后面会换一种方式再见它。</p>
        <div class="task-list">
          ${todayTasks}
        </div>
        <div class="button-row">
          <button class="primary-button" data-action="start-learning" ${materialReady ? "" : "disabled"}>${materialReady ? "开始学习" : "资料校对中"}</button>
          <button class="secondary-button" data-action="start-daily" ${materialReady ? "" : "disabled"}>每日总练习</button>
          <button class="secondary-button" data-route-link="speaking">口语跟读</button>
        </div>
        ${
          state.reviewResume
            ? `<div class="resume-banner">
                <strong>发现未完成的复习测试</strong>
                <span>第 ${state.reviewResume.roundNo || 1} 轮，已答 ${state.reviewResume.results?.length || 0}/${state.reviewResume.total || 0} 题</span>
                <button class="secondary-button" data-action="resume-review">继续上次测试</button>
                <button class="ghost-button" data-action="abandon-review">结束并生成学习日志</button>
              </div>`
            : ""
        }
      </section>
      <section class="panel">
        <h2>今日状态</h2>
        <div class="grid two">
          ${statCard("完成", `${state.completed} 组`, "今日练习记录")}
          ${statCard("最近稳定度", `${accuracy}%`, "家长参考数据")}
          ${statCard("小漏洞", `${weakCount} 个`, "旧知复习后独立回收")}
          ${statCard("掌握进度", `${mastery.percent}%`, `${mastery.mastered}/${mastery.total} 个核心点`)}
        </div>
      </section>
    </div>
    <div class="grid three">
      <button class="card subject-tile primary" data-route-link="english">
        <span class="badge">重点</span>
        <div>
          <h3>英语</h3>
          <p class="muted">按今天的任务开始学习</p>
        </div>
      </button>
      <button class="card subject-tile disabled" disabled>
        <span class="badge amber">后续开启</span>
        <div>
          <h3>语文</h3>
          <p class="muted">阅读、默写、巩固整理后续接入</p>
        </div>
      </button>
      <button class="card subject-tile disabled" disabled>
        <span class="badge amber">后续开启</span>
        <div>
          <h3>数学</h3>
          <p class="muted">计算、应用题、巩固复盘后续接入</p>
        </div>
      </button>
    </div>
    <section class="panel" style="margin-top:16px">
      <h2>学习分类</h2>
      <div class="grid two">
        ${trackCard("已学总复习", "三年级、四年级", "单元训练 / 学期总训练 / 年级总复习 / 期中期末 / 小漏洞专项", "review")}
        ${trackCard("即将学习预习", "五年级上册", "单词预习 / 课文听读 / 核心句型 / 听力场景 / 拼写听写 / 单元小测", "preview")}
      </div>
    </section>
  `;

  appViews.home.querySelector("[data-action='start-learning']").addEventListener("click", () => {
    startTodayLearning();
  });
  appViews.home.querySelector("[data-action='start-daily']").addEventListener("click", () => {
    startPractice("daily");
  });
  const resumeButton = appViews.home.querySelector("[data-action='resume-review']");
  if (resumeButton) resumeButton.addEventListener("click", () => startPractice("warmup", { resume: true }));
  const abandonButton = appViews.home.querySelector("[data-action='abandon-review']");
  if (abandonButton) {
    abandonButton.addEventListener("click", () => {
      if (state.reviewResume) {
        state.roundRecords = [...(state.roundRecords || []), buildRoundRecord(state.reviewResume, "abandoned")].slice(-120);
        clearReviewResume();
        saveState();
      }
      exportRecords({ includeAllToday: true });
    });
  }
  bindRouteLinks(appViews.home);
}

function buildVersionBadgeText() {
  const pack = getPackageVersion(data);
  const packShort = formatPackageVersionShort(pack);
  const latest = state.updateLog?.find((item) => item.updateType === "app") || state.updateLog?.[0];
  const status = latest?.success === false ? "更新待确认" : "已检查";
  return `APP v${APP_VERSION} · ${APP_BUILD_ID} · 包 ${packShort} · ${status}`;
}

function updateAppBuildBadge(route = state.activeRoute) {
  if (!appBuildBadge || !appBuildText) return;
  appBuildText.textContent = buildVersionBadgeText();
  appBuildBadge.hidden = route !== "home";
}

function formatPackageVersionShort(version) {
  const text = String(version || "");
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[1]}${match[2]}${match[3]}-${match[4]}`;
  return text ? text.replace(/^xiaobao-english-learning-pack-/, "").slice(-13) : "no-pack";
}

function renderEnglish() {
  const materialReady = isMaterialVerified();
  const verifiedUnits = getVerifiedUnits();
  const bookScopes = getBookReviewScopes();
  const fiveAUnitScopes = getFiveAUnitScopes();
  const reviewReady = getVerifiedReviewUnits().length > 0;
  const nextPreviewUnit = getNextPreviewUnit() || getFirstVerifiedUnit();
  const nextChunk = nextPreviewUnit ? getCurrentLearningChunk(nextPreviewUnit) : null;
  appViews.english.innerHTML = `
    <div class="grid two" style="margin-bottom:16px">
      <section class="panel">
        <h2>三四年级总复习</h2>
        <div class="report-list">
          ${bookScopes.length ? bookScopes.map((scope) => reviewScopeRow(scope)).join("") : data.reviewCatalog.map((item) => reviewCatalogRow(item)).join("")}
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="secondary-button" data-scope="review-mixed-3-4" ${reviewReady ? "" : "disabled"}>${reviewReady ? "开始三四年级总复习" : "待开放"}</button>
          <button class="secondary-button" data-start="mistakes" ${materialReady ? "" : "disabled"}>小漏洞专项</button>
        </div>
      </section>
      <section class="panel">
        <h2>五上新课学习</h2>
        <div class="chip-row">
          ${data.learningTracks[1].sections.map((item) => `<span class="chip">${item}</span>`).join("")}
        </div>
        ${
          nextChunk
            ? `<div class="card" style="margin-top:14px"><span class="badge blue">今天小课</span><h3>${nextChunk.title}</h3><p class="muted">${nextChunk.focus}</p><p class="muted">新词/短语约 ${nextChunk.words.length + nextChunk.phrases.length} 个，课文句 ${nextChunk.story.length || nextChunk.sentences.length} 句。</p></div>`
            : ""
        }
        <div class="button-row" style="margin-top:14px">
          <button class="primary-button" data-lesson="${nextPreviewUnit?.id || ""}" ${nextPreviewUnit ? "" : "disabled"}>${nextPreviewUnit ? `开始 ${nextPreviewUnit.title.replace(/^Unit\\s+/i, "Unit ")} 学习` : "学习包生成中"}</button>
          <button class="secondary-button" data-start="daily" ${materialReady ? "" : "disabled"}>每日总练习</button>
        </div>
        <div class="unit-list compact-list" style="margin-top:14px">
          ${fiveAUnitScopes.length ? fiveAUnitScopes.map((scope) => unitScopeRow(scope)).join("") : verifiedUnits.map(unitRow).join("")}
        </div>
      </section>
    </div>
    <div class="grid">
      <section class="panel">
        <h2>测试</h2>
        <div class="grid">
          ${testRow("日测", "只测已学内容：小漏洞、到期复习、今日新学混合出现", "daily")}
          ${testRow("周测", "只测已学内容：本周核心、小漏洞变式、旧知滚动", "weekly")}
          ${testRow("单元测", "只测已开放内容：词、句、课文理解、听力、拼写综合检查", "unit")}
        </div>
      </section>
    </div>
  `;

  appViews.english.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
  appViews.english.querySelectorAll("[data-review]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedReview = button.dataset.review;
      saveState();
      startPractice("self-review");
    });
  });
  appViews.english.querySelectorAll("[data-scope]").forEach((button) => {
    button.addEventListener("click", () => startScopedPractice(button.dataset.scope));
  });
  appViews.english.querySelectorAll("[data-lesson]").forEach((button) => {
    button.addEventListener("click", () => startLesson(button.dataset.lesson));
  });
}

function renderMistakes() {
  const items = state.mistakes;
  const activeItems = getActiveMistakes();
  const categories = getMistakeCategories(activeItems);
  appViews.mistakes.innerHTML = `
    <div class="grid two">
      <section class="panel">
        <h2>小漏洞清单</h2>
        <p class="muted">这里不是惩罚区，只是把暂时没稳的内容收起来，后面换个方式再练。</p>
        <div class="mistake-category-grid">
          ${categories.map(mistakeCategoryCard).join("")}
        </div>
        <div class="mistake-list">
          ${
            items.length
              ? items.map(mistakeItem).join("")
              : `<div class="card"><h3>现在很清爽</h3><p class="muted">练习中暂时没稳的词句会自动进入这里。</p></div>`
          }
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="primary-button" data-action="review-mistakes" ${activeItems.length ? "" : "disabled"}>轻轻再练一轮</button>
          <button class="secondary-button" data-action="clear-mastered">整理已稳定</button>
        </div>
      </section>
      <section class="panel">
        <h2>需要照顾的地方</h2>
        ${reasonMeters()}
      </section>
    </div>
  `;
  appViews.mistakes.querySelector("[data-action='review-mistakes']").addEventListener("click", () => {
    state.selectedMistakeCategory = "all";
    saveState();
    startPractice("mistakes");
  });
  appViews.mistakes.querySelectorAll("[data-mistake-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedMistakeCategory = button.dataset.mistakeCategory;
      saveState();
      startPractice("mistakes");
    });
  });
  appViews.mistakes.querySelector("[data-action='clear-mastered']").addEventListener("click", () => {
    state.mistakes = state.mistakes.filter((item) => item.status !== "mastered");
    saveState();
    renderAll();
    showToast("已把稳定内容放到低优先级");
  });
  appViews.mistakes.querySelectorAll("[data-speak]").forEach((button) => {
    button.addEventListener("click", () => speak(button.dataset.speak));
  });
}

function renderSpeaking() {
  const selectedScopeId = getDefaultSpeakingScopeId();
  const selectedScope = getScopeById(selectedScopeId);
  const speakingItems = getSpeakingItems(selectedScopeId);
  if (!speakingItems.some((item) => item.id === currentSpeakingItem?.id)) {
    currentSpeakingItem = speakingItems[0] || currentSpeakingItem || {
      id: "material-pending",
      en: "Materials are being verified.",
      zh: "资料正在核验中。"
    };
  }
  state.selectedSpeakingScopeId = selectedScopeId;
  saveState();
  appViews.speaking.innerHTML = `
    <div class="grid two">
      <section class="panel recording-panel">
        <div>
          <h2>${currentSpeakingItem.en}</h2>
          <p class="question-zh">${currentSpeakingItem.zh}</p>
          <p class="muted">学校要求英音：先听标准音，再跟读；读完可以回放自己声音。</p>
        </div>
        <button class="secondary-button" data-action="play-reference">播放标准音</button>
        <button class="mic-button" data-action="record">
          <strong>开始读</strong>
        </button>
        <audio id="recordPlayback" controls hidden></audio>
        <div id="scoreResult"></div>
      </section>
      <section class="panel">
        <div class="metric-row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h2 style="margin-bottom:6px">可跟读内容</h2>
            <p class="muted">当前跟读：${selectedScope?.title || "今日学习范围"}</p>
          </div>
          <span class="badge blue">${speakingItems.length} 项</span>
        </div>
        <label class="field-label speaking-scope">
          <span>选择跟读范围</span>
          <select id="speakingScope">${speakingScopeOptions(selectedScopeId)}</select>
        </label>
        <div class="mistake-list">
          ${
            speakingItems.length
              ? speakingItems
                  .map(
                    (item) => `
                <button class="mistake-item" data-speaking="${item.id}">
                  <span><strong>${item.en}</strong><br><span class="muted">${item.zh}</span></span>
                  <span class="badge blue">跟读</span>
                </button>
              `
                  )
                  .join("")
              : `<div class="card"><h3>这个范围还没开放</h3><p class="muted">等 Mini 下发已核验学习包后再练。</p></div>`
          }
        </div>
      </section>
    </div>
  `;

  appViews.speaking.querySelector("[data-action='play-reference']").addEventListener("click", () => speakLikeTeacher(currentSpeakingItem.en));
  appViews.speaking.querySelector("[data-action='record']").addEventListener("click", toggleRecording);
  appViews.speaking.querySelector("#speakingScope")?.addEventListener("change", (event) => {
    state.selectedSpeakingScopeId = event.target.value;
    currentSpeakingItem = getSpeakingItems(event.target.value)[0] || currentSpeakingItem;
    saveState();
    renderSpeaking();
  });
  appViews.speaking.querySelectorAll("[data-speaking]").forEach((button) => {
    button.addEventListener("click", () => {
      currentSpeakingItem = speakingItems.find((item) => item.id === button.dataset.speaking);
      renderSpeaking();
    });
  });
}

function renderParent() {
  const statusText = materialStatusText();
  const delivery = data.deliveryPolicy || {};
  const studyPackage = data.studyPackage || {};
  const studentName = state.studentName || "";
  const dailyReports = buildDailyCompletionReports();
  const todayReport = dailyReports[0];
  appViews.parent.innerHTML = `
    <div class="grid two">
      <section class="panel">
        <h2>平板学习包</h2>
        <div class="report-list">
          ${reportActionItem("APP 版本", `v${APP_VERSION} · 构建 ${APP_BUILD_ID}`, "手动更新", "manual-update")}
          ${reportItem("当前学习包", `${data.title} v${data.version}`, "badge blue")}
          ${reportItem("包类型", data.packageKind === "tablet-learning-package" ? "Mini 生成，平板执行" : "本地资料包", "badge blue")}
          ${reportItem("校验状态", isMaterialVerified() ? `${statusText}，只开放已核验内容` : "Mini 资料校对中，学习入口已锁定", isMaterialVerified() ? "badge" : "badge amber")}
          ${reportItem("自动更新", updateStatusText(), latestUpdateSucceeded() ? "badge" : "badge amber", latestUpdateSucceeded() ? "正常" : "关注")}
          ${reportItem("缓存范围", (delivery.offlineCache || []).join(" / ") || "今日学习包", "badge")}
          ${reportItem("音频状态", "暂无官方音频，英音慢速领读兜底；正式启用前需逐条试听", "badge amber")}
          ${reportItem("朗读口音", "学校要求英音，默认 en-GB 女声优先", "badge blue")}
          ${reportItem("发音评分", state.settings.speechProvider === "demo" ? "模拟接口，待接云服务" : "云服务已配置", "badge amber")}
          ${reportItem("平板运行", "iPad 不安装 Codex，只运行学习 APP；Codex/Mini 负责备课和生成包", "badge blue")}
        </div>
        <div class="setting-stack student-settings">
          <h3>孩子信息</h3>
          <label class="field-label" for="studentName">
            <span>姓名</span>
            <input class="text-input" id="studentName" value="${escapeAttr(studentName)}" placeholder="输入孩子姓名" autocomplete="name" />
          </label>
          <p class="support-note">姓名只保存在本机，用于家长辨认设备；导出给飞书的 JSON 不写孩子真实姓名。</p>
        </div>
        <div class="export-callout">
          <div>
            <strong>导出学习日志</strong>
            <span>学习结束后点这里下载 JSON，再回传给 Mini 生成下一轮学习包。</span>
          </div>
          <button class="primary-button" data-action="export">下载学习日志</button>
        </div>
        <div class="button-row" style="margin-top:14px">
          <label class="secondary-button file-label">
            导入学习包
            <input id="packageInput" type="file" accept="application/json" hidden />
          </label>
          <button class="danger-button" data-action="reset-test-records">清空测试记录并重新开始</button>
          <button class="danger-button" data-action="clear-cache">清理缓存</button>
        </div>
      </section>
      <section class="panel">
        <h2>快速录错词</h2>
        <div class="grid">
          <input class="text-input" id="wrongWord" placeholder="正确单词" />
          <input class="text-input" id="wrongTyped" placeholder="小宝写法，可不填" />
          <div class="field-row">
            <select id="wrongSource">
              <option>APP练习</option>
              <option>日测</option>
              <option>周测</option>
              <option>学校考试</option>
              <option>听写</option>
            </select>
            <select id="wrongReason">
              <option>拼不出来</option>
              <option>听不出来</option>
              <option>认不准</option>
              <option>粗心</option>
              <option>大小写错</option>
            </select>
          </div>
          <button class="primary-button" data-action="add-manual-mistake">加入下次日测</button>
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <div class="metric-row" style="justify-content:space-between;align-items:center">
        <h2 style="margin-bottom:0">每日完成情况</h2>
        <span class="${todayReport.complete ? "badge" : todayReport.started ? "badge amber" : "badge red"}">${todayReport.statusLabel}</span>
      </div>
      <div class="daily-summary-grid">
        ${standardItem("今日完成", `${todayReport.completedSteps}/${todayReport.totalSteps}`, "旧知、新学、轻练、小测、小漏洞")}
        ${standardItem("今日错误率", `${todayReport.errorRate}%`, `${todayReport.wrongCount}/${todayReport.answerCount || 0} 题错误`)}
        ${standardItem("学习情况", todayReport.qualityLabel, todayReport.qualityDetail)}
        ${standardItem("导出范围", exportRangeLabel(), "从上次导出后累计，避免漏传")}
      </div>
      <div class="report-list" style="margin-top:14px">
        ${dailyReports.map(dailyReportItem).join("")}
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>学习包状态</h2>
      <div class="report-list">
        ${reportItem("当前内容", studyPackage.current?.unitId || "今日学习包", studyPackage.current?.unitId ? "badge blue" : "badge")}
        ${reportItem("目标时长", studyPackage.current?.targetMinutes ? `${studyPackage.current.targetMinutes} 分钟以内` : "按题量控制", "badge")}
        ${reportItem("导出学习日志", "用上方按钮下载 JSON，用于生成下一轮学习包", "badge blue")}
      </div>
    </section>
    <div class="grid two" style="margin-top:16px">
      <section class="panel">
        <h2>英音朗读设置</h2>
        <div class="setting-stack">
          <label class="setting-line">
            <span><strong>语速</strong><br><span class="muted">按老师音频：慢速、清楚、留停顿</span></span>
            <strong id="rateLabel">${getNormalSpeechRate().toFixed(2)}x</strong>
          </label>
          <input id="speechRate" type="range" min="${NORMAL_SPEECH_MIN_RATE}" max="${NORMAL_SPEECH_MAX_RATE}" step="0.01" value="${getNormalSpeechRate()}" />
          <label class="setting-line">
            <span><strong>语音</strong><br><span class="muted">优先选择英国英语，平板可在这里切换</span></span>
          </label>
          <select id="speechVoice">${voiceOptions()}</select>
          <div class="button-row">
            <button class="secondary-button" data-action="test-voice">试听当前语速</button>
            <button class="secondary-button" data-action="test-slow-voice">试听慢速再听</button>
          </div>
        </div>
      </section>
      <section class="panel">
        <h2>小漏洞概览</h2>
        <div class="standards-grid">
          ${standardItem("当前小漏洞", `${getActiveMistakes().length}`, "所有入口统一汇总")}
          ${standardItem("最近稳定度", `${calcAccuracy()}%`, "最近练习参考")}
          ${standardItem("今日错误率", `${todayReport.errorRate}%`, `${todayReport.wrongCount}/${todayReport.answerCount || 0} 题错误`)}
        </div>
        <p class="support-line">导出范围：${exportRangeLabel()}，从上次导出后累计。</p>
      </section>
    </div>
  `;

  appViews.parent.querySelector("[data-action='export']").addEventListener("click", exportRecords);
  appViews.parent.querySelector("[data-action='reset-test-records']").addEventListener("click", resetTestRecords);
  appViews.parent.querySelector("[data-action='clear-cache']").addEventListener("click", clearAppCache);
  appViews.parent.querySelector("[data-action='manual-update']").addEventListener("click", (event) => {
    manualUpdateApp(event.currentTarget);
  });
  appViews.parent.querySelector("[data-action='add-manual-mistake']").addEventListener("click", addManualMistake);
  appViews.parent.querySelector("#packageInput").addEventListener("change", importPackage);
  appViews.parent.querySelector("#studentName").addEventListener("input", (event) => {
    state.studentName = event.target.value.trim();
    saveState();
  });
  appViews.parent.querySelector("#speechRate").addEventListener("input", (event) => {
    state.settings.speechRate = getNormalSpeechRate(Number(event.target.value));
    appViews.parent.querySelector("#rateLabel").textContent = `${state.settings.speechRate.toFixed(2)}x`;
    saveState();
  });
  appViews.parent.querySelector("#speechVoice").addEventListener("change", (event) => {
    state.settings.speechVoiceURI = event.target.value;
    saveState();
    showToast("英音语音已更新");
  });
  appViews.parent.querySelector("[data-action='test-voice']").addEventListener("click", () => {
    speakLikeTeacher("Good habits are important. Listen carefully.", { rate: getNormalSpeechRate(), playingMessage: "正在试听当前语速" });
  });
  appViews.parent.querySelector("[data-action='test-slow-voice']").addEventListener("click", () => {
    speakLikeTeacher("Good habits are important. Listen carefully.", {
      rate: getSlowSpeechRate(),
      playingMessage: "正在试听慢速再听"
    });
  });
}

async function startTodayLearning() {
  try {
    await ensureTotalPackagesReadyFor("today");
    await ensureFullLearningPackage();
  } catch {
    navigate("home");
    return;
  }
  const hasWeakness = getActiveMistakes().length > 0;
  if (getFiveAStage() === "reinforcement") {
    if (!isFiveAReinforcementAllowed()) {
      showToast("五上加强要等 gate 完成后开放");
      startPractice("warmup", { nextAfter: hasWeakness ? "weakness-only" : "" });
      return;
    }
    startPractice("warmup", { nextAfter: hasWeakness ? "weakness-then-fiveA-strength" : "fiveA-strength" });
    return;
  }
  if (getCurrentPreviewChunk()) {
    startPractice("warmup", { nextAfter: hasWeakness ? "weakness-then-fiveA-preview" : "fiveA-preview" });
    return;
  }
  startPractice("warmup", { nextAfter: hasWeakness ? "weakness-only" : "" });
}

async function startFiveAPreviewLesson() {
  try {
    await ensureTotalPackagesReadyFor("preview");
  } catch {
    navigate("home");
    return;
  }
  const chunk = getCurrentPreviewChunk();
  if (!chunk) {
    showToast("五上预习题库还在准备中");
    navigate("home");
    return;
  }
  state.activeLearningPackageId = getTotalPackage("preview")?.id || "xiaobao-english-total-preview-package";
  state.activeLearningPackageVersion = getTotalPackage("preview")?.version || "";
  currentLesson = {
    lessonType: "fiveA-preview",
    unitId: chunk.unitId,
    chunkId: chunk.chunkId,
    step: 0
  };
  saveState();
  navigate("lesson");
  renderLesson();
}

async function startLesson(unitId) {
  try {
    await ensureFullLearningPackage();
  } catch {
    navigate("english");
    return;
  }
  if (!isUnitVerified(unitId)) {
    showToast("这个单元还没核验完成，暂不进入学习");
    navigate("english");
    return;
  }
  const unit = data.units.find((item) => item.id === unitId);
  setSelectedScope(scopeFromUnit(unit));
  const chunk = unit ? getCurrentLearningChunk(unit) : null;
  currentLesson = {
    unitId,
    chunkId: chunk?.id,
    step: 0
  };
  navigate("lesson");
  renderLesson();
}

async function startScopedPractice(scopeId) {
  try {
    await ensureFullLearningPackage();
    await ensureTotalPackagesReadyFor("review");
  } catch {
    navigate("english");
    return;
  }
  const scope = getScopeById(scopeId);
  if (!scope) {
    showToast("这个学习范围还没准备好");
    navigate("english");
    return;
  }
  if (scope.scopeType === "fiveAUnit") {
    startLesson(scope.unitId || scope.scopeId);
    return;
  }
  setSelectedScope(scopeFromCatalog(scope));
  startPractice(scope.scopeType === "mixedReview" ? "review-total" : "scope-review");
}

function renderLesson() {
  const isTotalPreviewLesson = currentLesson?.lessonType === "fiveA-preview";
  const unit = isTotalPreviewLesson ? null : data.units.find((item) => item.id === currentLesson?.unitId) || data.units[0];
  const chunk = isTotalPreviewLesson
    ? getCurrentPreviewChunk()
    : getLearningChunks(unit).find((item) => item.id === currentLesson?.chunkId) || getCurrentLearningChunk(unit);
  const steps = isTotalPreviewLesson ? buildFiveAPreviewLessonSteps(chunk) : buildLessonSteps(unit, chunk);
  const step = steps[currentLesson.step];
  const progress = Math.round(((currentLesson.step + 1) / steps.length) * 100);

  pageTitle.textContent = isTotalPreviewLesson ? `五上预习 · ${chunk.title}` : `${unit.title} · ${chunk.title}`;
  eyebrow.textContent = "先学后练";

  appViews.lesson.innerHTML = `
    <div class="practice-stage">
      <section class="panel">
        <div class="metric-row">
          <span class="badge">${currentLesson.step + 1} / ${steps.length}</span>
          <span class="badge blue">${step.badge}</span>
          <span class="badge amber">目标 ${step.goal}</span>
        </div>
        <div class="meter" style="margin-top:12px"><span style="--value:${progress}%"></span></div>
      </section>
      <section class="question-card lesson-card">
        ${lessonStepTemplate(step)}
      </section>
      <section class="panel">
        <div class="button-row">
          <button class="secondary-button" data-lesson-action="prev" ${currentLesson.step === 0 ? "disabled" : ""}>上一步</button>
          <button class="secondary-button" data-lesson-action="play">播放领读</button>
          <button class="primary-button" data-lesson-action="next">${lessonNextLabel(step, currentLesson.step, steps.length)}</button>
        </div>
      </section>
    </div>
  `;

  appViews.lesson.querySelector("[data-lesson-action='prev']").addEventListener("click", () => {
    currentLesson.step = Math.max(0, currentLesson.step - 1);
    renderLesson();
  });
  appViews.lesson.querySelector("[data-lesson-action='next']").addEventListener("click", () => {
    if (isTotalPreviewLesson) {
      if (step.kind === "listen-read") {
        markPreviewChunkGate(chunk);
      }
      if (step.kind === "light") {
        startPractice("fiveA-preview-light", { nextAfter: "fiveA-preview-quiz" });
        return;
      }
      if (step.kind === "quiz") {
        startPractice("fiveA-preview-quiz");
        return;
      }
    }
    if (currentLesson.step >= steps.length - 1) {
      markChunkLearned(unit, chunk);
      state.unitProgress[unit.id] = "practicing";
      saveState();
      startPractice("preview-quiz");
      return;
    }
    currentLesson.step += 1;
    renderLesson();
  });
  appViews.lesson.querySelector("[data-lesson-action='play']").addEventListener("click", async (event) => {
    await withPlaybackButton(event.currentTarget, () => playLessonStep(step));
  });
  appViews.lesson.querySelectorAll("[data-read]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      await withPlaybackLabel(event.currentTarget, event.currentTarget.querySelector("[data-playback-label]"), () =>
        speakLikeTeacher(button.dataset.read, { repeat: 2 })
      );
    });
  });
  appViews.lesson.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
}

function lessonNextLabel(step, index, total) {
  if (step.kind === "light") return "开始轻测";
  if (step.kind === "quiz") return "开始小测";
  return index === total - 1 ? "开始小测" : "下一步";
}

function buildFiveAPreviewLessonSteps(chunk) {
  const items = getPreviewChunkItems(chunk);
  return [
    {
      kind: "listen-read",
      badge: "听懂读",
      title: "先听标准音，看懂意思，再跟读认读",
      goal: "会听会读",
      body: `${chunk.focus || "按 Word lists 顺序学习 10 个词表项。"} 这里不计分，可以多听几遍、多停留一会儿再进入轻测。`,
      items: items.map((item) => ({ id: item.itemId, en: item.en, zh: item.zh, itemKind: item.itemKind }))
    },
    {
      kind: "light",
      badge: "轻测",
      title: "轻测 30 题",
      goal: "发现薄弱面",
      body: "每个词表项 3 题：英中互认、听音选词、看中文补英文。错了先记录薄弱面，不在这里硬卡。",
      practiceMode: "fiveA-preview-light"
    },
    {
      kind: "quiz",
      badge: "小测",
      title: "小测 10 题",
      goal: "初步过关",
      body: "每个词表项 1 题：看中文默写完整英文。小测错词会进入小漏洞池，并占用后续预习回收名额。",
      practiceMode: "fiveA-preview-quiz"
    }
  ];
}

function buildLessonSteps(unit, chunk) {
  const previewLesson = unit.previewLesson || {
    theme: unit.title,
    scene: "先熟悉本单元核心词句，再进入轻练习和小测。",
    teacherSteps: ["主题导入", "单词领读", "短语句型领读", "课文听读", "轻练习", "预习小测"]
  };
  const phrases = chunk.phrases || [];
  const story = chunk.story?.length ? chunk.story : chunk.sentences || [];
  const warmupQuestions = getWarmupQuestions();
  return [
    ...(warmupQuestions.length
      ? [
          {
            kind: "warmup",
            badge: "旧知复习",
            title: "先完成今天的旧知复习",
            goal: "三四年级总复习",
            body: "这里固定使用三四年级总复习内容，不混入小漏洞，也不会混入还没完成 gate 的五上内容。答错会记入小漏洞，后面单独回收。",
            items: [],
            questionCount: warmupQuestions.length
          }
        ]
      : []),
    {
      kind: "intro",
      badge: "课程导入",
      title: chunk.title || previewLesson.theme,
      goal: "知道主题",
      body: `${chunk.focus || previewLesson.scene} 这一页只帮孩子知道今天要学什么，不做题。`,
      items: [{ en: unit.title.replace(/^Unit\s+\d+\s+/i, ""), zh: chunk.title || previewLesson.theme }]
    },
    {
      kind: "words",
      badge: "英音领读",
      title: "先听清楚，再跟读单词",
      goal: "会听会读",
      body: "按英音慢速读两遍，换下一个词前留停顿。这里不计分，先把声音听准。",
      items: chunk.words
    },
    {
      kind: "phrases",
      badge: "短语理解",
      title: "把单词放进短语里",
      goal: "会听会说",
      body: "短语先听懂意思，再跟着读，避免只背孤立单词。",
      items: phrases
    },
    {
      kind: "sentences",
      badge: "句型替换",
      title: "核心句型先理解，再会替换",
      goal: "会听会用",
      body: "句型第一遍正常读，第二遍稍慢，注意频率副词和第三人称。",
      items: chunk.sentences
    },
    {
      kind: "story",
      badge: "课文听读",
      title: "课文像上课一样逐句听",
      goal: "听懂重点句",
      body: "先逐句听，再跟读。后续 Mini 会把已核验教材音频或高质量自制英音放进学习包。",
      items: story
    },
    {
      kind: "practice",
      badge: "轻练习",
      title: "先练熟，不急着考试",
      goal: "巩固",
      body: "做少量认词、听音、句义配对，用来检查刚学内容是否听懂。错了会先记下来，不在这里卡住。",
      items: []
    },
    {
      kind: "quiz",
      badge: "预习小测",
      title: "小测收尾",
      goal: "目标 100%",
      body: "只测今天已经听读理解过的内容。基础题目标 100%，暂时没稳的点会进入后续滚动复习。",
      items: []
    }
  ];
}

function lessonStepTemplate(step) {
  if (["warmup", "practice", "light", "quiz"].includes(step.kind)) {
    return `
      <div>
        <span class="badge ${step.kind === "quiz" ? "amber" : "blue"}">${step.badge}</span>
        <h2 style="margin-top:12px">${step.title}</h2>
        <p class="question-zh">${step.body}</p>
        <div class="button-row" style="justify-content:center;margin-top:18px">
          <button class="primary-button" data-start="${step.practiceMode || (step.kind === "warmup" ? "warmup" : step.kind === "quiz" ? "preview-quiz" : "preview-practice")}">
            ${step.kind === "warmup" ? `开始复习 ${step.questionCount || ""}` : step.kind === "quiz" ? "开始小测" : "开始轻测"}
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div>
      <span class="badge blue">${step.badge}</span>
      <h2 style="margin-top:12px">${step.title}</h2>
      <p class="question-zh">${step.body}</p>
      <div class="lesson-list">
        ${step.items
          .map(
            (item) => `
              <button class="lesson-row" data-read="${escapeAttr(item.en)}">
                <span><strong>${item.en}</strong>${item.zh ? `<br><span class="muted">${item.zh}</span>` : ""}</span>
                <span class="badge" data-playback-label>领读</span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

async function playLessonStep(step) {
  if (!step.items.length) {
    showToast("这一环节先点击开始练习");
    return;
  }
  await speakLessonList(step.items.map((item) => item.en));
}

async function startPractice(mode, options = {}) {
  try {
    if (["warmup", "review-total", "scope-review", "self-review"].includes(mode)) {
      await ensureTotalPackagesReadyFor("review");
    }
    if (["fiveA-preview-light", "fiveA-preview-quiz"].includes(mode)) {
      await ensureTotalPackagesReadyFor("preview");
    }
    if (mode === "fiveA-strength") {
      await ensureTotalPackagesReadyFor("strength");
    }
    if (!["mistakes", "fiveA-preview-light", "fiveA-preview-quiz", "fiveA-strength"].includes(mode)) {
      await ensureFullLearningPackage();
    }
  } catch {
    navigate("english");
    return;
  }
  if (!isMaterialVerified()) {
    showToast("资料还在校对中，暂不进入练习");
    navigate("english");
    return;
  }
  if (!getCurrentStudyUnit()) {
    showToast("还没有可练习的已核验单元");
    navigate("english");
    return;
  }
  if (mode === "warmup" && options.resume && state.reviewResume) {
    if (!isReviewResumeCompatibleWithCurrentPackage(state.reviewResume)) {
      archiveIncompatibleReviewResume("learning-package-updated");
      showToast("学习包已更新，已切换到新题");
    }
  }
  if (mode === "warmup" && options.resume && state.reviewResume) {
    currentPractice = {
      ...state.reviewResume,
      questions: (state.reviewResume.questions || []).map(normalizePracticeQuestionInteraction),
      paused: false,
      pauseStartedAt: null,
      questionStartedAt: Date.now(),
      currentQuestionActiveMs: state.reviewResume.currentQuestionActiveMs || 0
    };
    renderPractice();
    navigate("practice");
    pageTitle.textContent = "旧知复习";
    eyebrow.textContent = "继续测试";
    return;
  }
  const pool = buildQuestionPool(mode);
  if (!pool.length) {
    showToast("这个环节的资料还不够，先做每日总练习");
    navigate("english");
    return;
  }
  const now = new Date().toISOString();
  const isReviewRound = mode === "warmup";
  const roundNo = isReviewRound ? pool[0]?.roundNo || (state.reviewRoundCursor || 0) + 1 : null;
  const roundId = isReviewRound ? pool[0]?.roundId || `old-review-round-${roundNo}` : "";
  currentPractice = {
    mode,
    nextAfter: options.nextAfter || "",
    scope: isScopedPracticeMode(mode) && state.selectedScope ? { ...state.selectedScope } : null,
    index: 0,
    correct: 0,
    total: pool.length,
    questions: pool.map(normalizePracticeQuestionInteraction),
    results: [],
    answered: false,
    roundId,
    roundNo,
    roundStartedAt: now,
    roundStatus: isReviewRound ? "in_progress" : "",
    activeTimeMs: 0,
    pauseCount: 0,
    pauseDurationMs: 0,
    paused: false,
    pauseStartedAt: null,
    questionStartedAt: Date.now(),
    currentQuestionActiveMs: 0
  };
  saveReviewResume();
  renderPractice();
  navigate("practice");
  pageTitle.textContent = modeTitle(mode);
  eyebrow.textContent = "练习中";
}

function renderPractice() {
  stopAudioPlayback();
  const q = currentPractice.questions[currentPractice.index];
  currentPractice.answered = false;
  currentPractice.questionStartedAt = Date.now();
  currentPractice.currentQuestionActiveMs = currentPractice.currentQuestionActiveMs || 0;
  saveReviewResume();
  const progress = Math.round((currentPractice.index / currentPractice.total) * 100);
  const paused = Boolean(currentPractice.paused);
  appViews.practice.innerHTML = `
    <div class="practice-stage">
      <section class="panel">
        <div class="metric-row">
          <span class="badge">${currentPractice.index + 1} / ${currentPractice.total}</span>
          <span class="badge blue">${q.badge || questionTypeLabel(q.type)}</span>
          <span class="badge amber">已稳 ${currentPractice.correct}</span>
          ${currentPractice.roundNo ? `<span class="badge">第 ${currentPractice.roundNo} 轮</span>` : ""}
          ${state.testMode ? `<span class="badge amber">测试阶段</span>` : ""}
        </div>
        <div class="meter" style="margin-top:12px"><span style="--value:${progress}%"></span></div>
      </section>
      ${questionTemplate(q)}
      <section class="panel">
        <div class="button-row">
          <button class="secondary-button" data-action="play-question">再听一遍</button>
          <button class="secondary-button" data-action="play-slow">慢速再听</button>
          <button class="secondary-button" data-action="help-question">看提示</button>
          ${isReviewPractice() ? `<button class="secondary-button" data-action="${paused ? "resume-practice" : "pause-practice"}">${paused ? "继续" : "暂停"}</button>` : ""}
          <button class="ghost-button" data-action="exit-practice">回到英语</button>
        </div>
        ${paused ? `<p class="muted" style="margin-top:12px">已暂停，暂停时间不计入答题耗时。</p>` : ""}
      </section>
    </div>
  `;

  appViews.practice.querySelector("[data-action='play-question']").addEventListener("click", async (event) => {
    await withPlaybackButton(event.currentTarget, () => speakLikeTeacher(q.audioText, { rate: getNormalSpeechRate() }));
  });
  appViews.practice.querySelector("[data-action='play-slow']").addEventListener("click", async (event) => {
    await withPlaybackButton(event.currentTarget, () =>
      speakLikeTeacher(q.audioText, { rate: getSlowSpeechRate(), playingMessage: "正在慢速播放标准音" })
    );
  });
  appViews.practice.querySelector("[data-action='help-question']").addEventListener("click", handleHelpRequest);
  const pauseButton = appViews.practice.querySelector("[data-action='pause-practice']");
  if (pauseButton) pauseButton.addEventListener("click", pausePractice);
  const resumeButton = appViews.practice.querySelector("[data-action='resume-practice']");
  if (resumeButton) resumeButton.addEventListener("click", resumePractice);
  appViews.practice.querySelector("[data-action='exit-practice']").addEventListener("click", () => {
    if (isReviewPractice()) {
      markReviewInterrupted();
      saveReviewResume();
    }
    navigate("english");
  });
  appViews.practice.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => handleAnswer(button.dataset.answer, button));
  });
  setupLetterKeyboard();
  if (paused) lockCurrentQuestionControls();
}

function questionTemplate(q) {
  const useKeyboardInput = shouldUseKeyboardInput(q);
  const choices = Array.isArray(q.choices) ? q.choices : [];
  const isFillBlankChoice = FILL_BLANK_CHOICE_QUESTION_TYPES.has(q.questionType);
  const promptClass = isFillBlankChoice ? "question-word fill-blank-prompt" : "question-word";

  if (q.type === "listen-choice" && !useKeyboardInput) {
    scheduleQuestionAudio(q);
    return `
      <section class="question-card">
        <div>
          <span class="badge blue">${q.level || "听单词"}</span>
          <h2 style="margin-top:12px">${q.title || "听音选词"}</h2>
          <div class="choice-grid">
            ${choices.map((choice) => `<button class="choice-button" data-answer="${escapeAttr(choice)}">${choice}</button>`).join("")}
          </div>
          <div class="answer-feedback" id="answerFeedback" aria-live="polite"></div>
        </div>
      </section>
    `;
  }

  if (useKeyboardInput) {
    if (q.autoPlay) scheduleQuestionAudio(q);
    return `
      <section class="question-card">
        <div>
          <span class="badge blue">${q.level || "拼写"}</span>
          <h2 style="margin-top:12px">${q.title || "看中文写英文"}</h2>
          <p class="question-zh">${q.prompt}</p>
          <div id="spellAnswer" class="letter-answer" data-value="" aria-live="polite"></div>
          ${letterKeyboardTemplate(q)}
          <div class="answer-feedback" id="answerFeedback" aria-live="polite"></div>
        </div>
      </section>
    `;
  }

  return `
    <section class="question-card">
      <div>
        <span class="badge blue">${q.level || "理解"}</span>
        <h2 style="margin-top:12px">${q.title || "句义选择"}</h2>
        <div class="${promptClass}">${formatQuestionPromptHtml(q.prompt)}</div>
        <div class="choice-grid">
          ${choices.map((choice) => `<button class="choice-button" data-answer="${escapeAttr(choice)}">${choice}</button>`).join("")}
        </div>
        <div class="answer-feedback" id="answerFeedback" aria-live="polite"></div>
      </div>
    </section>
  `;
}

function shouldUseKeyboardInput(question = {}) {
  const questionType = String(question.questionType || "");
  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (isFillBlankChoiceQuestion(question)) return false;
  if (question.requiresKeyboardInput === false || question.interactionMode === "choice") return false;
  if (choices.length && question.requiresKeyboardInput !== true) return false;
  if (question.requiresKeyboardInput === true) return true;
  if (KEYBOARD_INPUT_QUESTION_TYPES.has(questionType)) return true;
  return question.type === "spell" && choices.length === 0 && question.itemKind === "word";
}

function letterKeyboardTemplate(question) {
  const allowedKeys = getAllowedKeyboardKeys(question);
  const keyButton = (key, label = key, extraClass = "") =>
    `<button class="letter-key ${extraClass}" data-key="${escapeAttr(key)}" type="button" ${allowedKeys.has(key) ? "" : "disabled"}>${label}</button>`;
  return `
    <div class="letter-keyboard" aria-label="APP 内置字母键盘">
      ${QWERTY_KEY_ROWS.map(
        (row, index) => `
          <div class="keyboard-row keyboard-row-${index + 1}">
            ${row.map((letter) => keyButton(letter)).join("")}
          </div>
        `
      ).join("")}
      <div class="keyboard-row keyboard-symbol-row">
        ${SPELL_SYMBOL_KEYS.map((key) => keyButton(key, key, "symbol")).join("")}
      </div>
      <div class="keyboard-row keyboard-action-row">
        <button class="letter-key utility" data-key="backspace" type="button">删除</button>
        ${keyButton("space", "空格", "utility wide")}
        <button class="letter-key confirm" data-key="confirm" type="button">确认</button>
      </div>
    </div>
  `;
}

function getAllowedKeyboardKeys(question) {
  const keys = new Set("abcdefghijklmnopqrstuvwxyz".split(""));
  const expected = String(question.answer || question.audioText || "");
  if (/\s|\.{3}/.test(expected) || question.itemKind === "phrase" || question.itemKind === "sentence") keys.add("space");
  const symbolVariants = {
    "'": /['’‘`´＇]/,
    "-": /[-—–－]/,
    ".": /[.。]/,
    ",": /[,，]/,
    "?": /[?？]/,
    "!": /[!！]/
  };
  SPELL_SYMBOL_KEYS.forEach((key) => {
    if (symbolVariants[key]?.test(expected)) keys.add(key);
  });
  return keys;
}

function setupLetterKeyboard() {
  const answer = appViews.practice.querySelector("#spellAnswer");
  if (!answer) return;
  appViews.practice.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!currentPractice || currentPractice.answered) return;
      if (currentPractice.paused) {
        showToast("已暂停，点继续后再答题");
        return;
      }
      const key = button.dataset.key;
      let value = answer.dataset.value || "";
      if (key === "confirm") {
        handleAnswer(value);
        return;
      }
      if (key === "backspace") {
        value = value.slice(0, -1);
      } else if (key === "space") {
        value = `${value} `;
      } else {
        value += key;
      }
      answer.dataset.value = value;
      answer.textContent = value;
    });
  });
}

function scheduleQuestionAudio(question) {
  const scheduledSequence = playbackSequenceId;
  setTimeout(() => {
    if (!currentPractice || currentPractice.answered) return;
    if (currentPractice.paused) return;
    if (playbackSequenceId !== scheduledSequence) return;
    if (currentPractice.questions[currentPractice.index] !== question) return;
    speakLikeTeacher(question.audioText, { repeat: 1, silentToast: true });
  }, 250);
}

function isReviewPractice(practice = currentPractice) {
  return practice?.mode === "warmup";
}

function getActivePackageSignature() {
  return {
    learningPackageVersion: getPackageVersion(data) || state.learningPackageVersion || "",
    contentHash: data?.contentHash || state.contentHash || "",
    packageId: data?.id || state.activeLearningPackageId || ""
  };
}

function normalizePracticeQuestionInteraction(question = {}) {
  question = hydrateFillBlankChoiceQuestion(question);
  if (shouldUseKeyboardInput(question)) {
    return {
      ...question,
      type: "spell",
      interactionMode: "keyboard-input",
      expectedInputType: question.expectedInputType || "english",
      requiresKeyboardInput: true,
      keyboardLayout: question.keyboardLayout || "qwerty-english-with-symbols",
      choices: []
    };
  }
  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length && question.type === "spell") {
    const isListening = /listen|听音|听句/.test(`${question.questionType || ""} ${question.prompt || ""}`);
    return {
      ...question,
      type: isListening ? "listen-choice" : "meaning-choice",
      interactionMode: "choice",
      expectedInputType: "choice",
      requiresKeyboardInput: false
    };
  }
  return {
    ...question,
    requiresKeyboardInput: shouldUseKeyboardInput(question)
  };
}

function isReviewResumeCompatibleWithCurrentPackage(resume) {
  if (!resume) return true;
  const signature = getActivePackageSignature();
  if (resume.learningPackageVersion && signature.learningPackageVersion && resume.learningPackageVersion !== signature.learningPackageVersion) return false;
  if (resume.contentHash && signature.contentHash && !hashesEqual(resume.contentHash, signature.contentHash)) return false;
  return !(resume.questions || []).some((question) => question.type === "spell" && !shouldUseKeyboardInput(question));
}

function archiveIncompatibleReviewResume(reason) {
  if (!state.reviewResume) return;
  if (state.reviewResume.results?.length) {
    const record = {
      ...buildRoundRecord(state.reviewResume, "abandoned-package-updated"),
      abandonReason: reason
    };
    state.roundRecords = [...(state.roundRecords || []), record].slice(-120);
  }
  clearReviewResume();
  saveState();
}

function syncReviewResumeWithCurrentPackage() {
  if (!state.reviewResume) return;
  if (isReviewResumeCompatibleWithCurrentPackage(state.reviewResume)) return;
  archiveIncompatibleReviewResume("learning-package-updated");
}

function saveReviewResume(status = "interrupted") {
  if (!isReviewPractice()) return;
  const packageSignature = getActivePackageSignature();
  state.reviewResume = {
    ...currentPractice,
    roundStatus: currentPractice.paused ? "paused" : status,
    learningPackageVersion: packageSignature.learningPackageVersion,
    contentHash: packageSignature.contentHash,
    packageId: packageSignature.packageId,
    lastSavedAt: new Date().toISOString(),
    interruptedAt: status === "interrupted" ? new Date().toISOString() : currentPractice.interruptedAt || null
  };
  saveState();
}

function clearReviewResume() {
  state.reviewResume = null;
}

function markReviewInterrupted() {
  if (!isReviewPractice()) return;
  currentPractice.roundStatus = "interrupted";
  currentPractice.interruptedAt = new Date().toISOString();
}

function pausePractice() {
  if (!isReviewPractice() || currentPractice.paused || currentPractice.answered) return;
  stopAudioPlayback();
  const now = Date.now();
  currentPractice.currentQuestionActiveMs += Math.max(0, now - (currentPractice.questionStartedAt || now));
  currentPractice.paused = true;
  currentPractice.pauseStartedAt = now;
  currentPractice.pauseCount += 1;
  currentPractice.roundStatus = "paused";
  saveReviewResume("paused");
  renderPractice();
}

function resumePractice() {
  if (!isReviewPractice() || !currentPractice.paused) return;
  const now = Date.now();
  currentPractice.pauseDurationMs += Math.max(0, now - (currentPractice.pauseStartedAt || now));
  currentPractice.paused = false;
  currentPractice.pauseStartedAt = null;
  currentPractice.questionStartedAt = now;
  currentPractice.roundStatus = "in_progress";
  saveReviewResume("interrupted");
  renderPractice();
}

function lockCurrentQuestionControls() {
  appViews.practice.querySelectorAll("[data-answer], [data-key], [data-action='help-question']").forEach((button) => {
    button.disabled = true;
  });
}

function unlockCurrentQuestionControls() {
  appViews.practice.querySelectorAll("[data-answer], [data-key], [data-action='help-question']").forEach((button) => {
    button.disabled = false;
  });
}

function getCurrentQuestionTimeSpentMs() {
  if (!currentPractice) return 0;
  const now = Date.now();
  const activeSinceLastStart = currentPractice.paused ? 0 : Math.max(0, now - (currentPractice.questionStartedAt || now));
  return Math.max(0, Math.round((currentPractice.currentQuestionActiveMs || 0) + activeSinceLastStart));
}

function handleHelpRequest() {
  if (!currentPractice || currentPractice.answered) return;
  if (currentPractice.paused) {
    showToast("已暂停，点继续后再看提示");
    return;
  }
  stopAudioPlayback();
  currentPractice.answered = true;
  const q = currentPractice.questions[currentPractice.index];
  const timeSpentMs = getCurrentQuestionTimeSpentMs();
  lockCurrentQuestionControls();
  handleWrongAnswer({ ...q, helpUsed: true, wrongReason: "unfamiliar", result: "skipped" });
  const feedback = appViews.practice.querySelector("#answerFeedback");
  if (feedback) {
    feedback.className = "answer-feedback warn";
    feedback.textContent = `先记下来，正确答案是：${q.answer}`;
  }
  state.records.push({
    id: `r-${Date.now()}`,
    mode: currentPractice.mode,
    exportKind: state.testMode ? "test" : "formal",
    isTestRecord: Boolean(state.testMode),
    scopeType: currentPractice.scope?.scopeType || q.scopeType || null,
    sourceMode: currentPractice.scope?.sourceMode || q.sourceMode || currentPractice.mode,
    sourceLabel: currentPractice.scope?.sourceLabel || "",
    question: q.prompt,
    answer: "",
    expected: q.answer,
    correct: false,
    questionId: q.questionId || "",
    itemId: q.itemId,
    itemKind: q.itemKind,
    bookId: q.bookId || currentPractice.scope?.bookId || inferBookId(q),
    unitId: q.unitId || currentPractice.scope?.unitId || inferUnitId(q.itemId),
    scopeId: currentPractice.scope?.scopeId || q.scopeId || null,
    skill: q.skill,
    questionType: q.questionType || q.type,
    testKey: q.testKey || "",
    abilityFace: q.abilityFace || q.practiceFace || "",
    result: "skipped",
    wrongReason: "unfamiliar",
    timeSpentMs,
    answeredAt: new Date().toISOString(),
    roundId: currentPractice.roundId || q.roundId || "",
    roundNo: currentPractice.roundNo || q.roundNo || null,
    helpUsed: true,
    enteredWeaknessPool: true,
    isTestRecord: Boolean(state.testMode),
    practiceFace: q.practiceFace || "",
    attemptIndex: q.attemptIndex || 1,
    gateStatus: q.gateStatus || null,
    chunkId: q.chunkId || currentLesson?.chunkId,
    at: new Date().toISOString()
  });
  currentPractice.results.push({ question: q, correct: false, result: "skipped", timeSpentMs, helpUsed: true });
  currentPractice.activeTimeMs += timeSpentMs;
  currentPractice.currentQuestionActiveMs = 0;
  saveReviewResume("interrupted");
  saveState();
  showToast("先记下来，后面换方式再见它");
  setTimeout(() => {
    currentPractice.index += 1;
    if (currentPractice.index >= currentPractice.total) finishPractice();
    else renderPractice();
  }, 1400);
}

function handleAnswer(answer, button) {
  if (!currentPractice || currentPractice.answered) return;
  if (currentPractice.paused) {
    showToast("已暂停，点继续后再答题");
    return;
  }
  stopAudioPlayback();
  currentPractice.answered = true;
  const q = currentPractice.questions[currentPractice.index];
  const timeSpentMs = getCurrentQuestionTimeSpentMs();
  const normalized = normalizeForAnswer(answer, q);
  const expected = normalizeForAnswer(q.answer, q);
  const ok = normalized === expected;
  const buttons = [...appViews.practice.querySelectorAll("[data-answer]")];
  buttons.forEach((choiceButton) => {
    choiceButton.disabled = true;
    if (normalizeForAnswer(choiceButton.dataset.answer, q) === expected) choiceButton.classList.add("correct");
  });
  const spellInput = appViews.practice.querySelector("#spellAnswer");
  const spellSubmit = appViews.practice.querySelector("[data-action='submit-spell']");
  if (spellInput) spellInput.classList.add("locked");
  if (spellInput && "disabled" in spellInput) spellInput.disabled = true;
  if (spellSubmit) spellSubmit.disabled = true;
  appViews.practice.querySelectorAll("[data-key]").forEach((keyButton) => {
    keyButton.disabled = true;
  });

  if (button) button.classList.add(ok ? "correct" : "wrong");
  updateItemStats(q, ok);
  updateMistakeProgress(q, ok);
  if (ok) {
    currentPractice.correct += 1;
    showToast("很稳，继续");
  } else {
    handleWrongAnswer(q);
  }
  const feedback = appViews.practice.querySelector("#answerFeedback");
  if (feedback) {
    feedback.className = `answer-feedback ${ok ? "ok" : "warn"}`;
    feedback.textContent = ok ? "很稳，下一题。" : `正确答案是：${q.answer}`;
  }

  state.records.push({
    id: `r-${Date.now()}`,
    mode: currentPractice.mode,
    exportKind: state.testMode ? "test" : "formal",
    scopeType: currentPractice.scope?.scopeType || q.scopeType || null,
    sourceMode: currentPractice.scope?.sourceMode || q.sourceMode || currentPractice.mode,
    sourceLabel: currentPractice.scope?.sourceLabel || "",
    question: q.prompt,
    answer,
    expected: q.answer,
    correct: ok,
    questionId: q.questionId || "",
    itemId: q.itemId,
    itemKind: q.itemKind,
    bookId: q.bookId || currentPractice.scope?.bookId || inferBookId(q),
    unitId: q.unitId || currentPractice.scope?.unitId || inferUnitId(q.itemId),
    scopeId: currentPractice.scope?.scopeId || q.scopeId || null,
    skill: q.skill,
    questionType: q.questionType || q.type,
    testKey: q.testKey || "",
    abilityFace: q.abilityFace || q.practiceFace || "",
    result: ok ? "correct" : "wrong",
    timeSpentMs,
    answeredAt: new Date().toISOString(),
    roundId: currentPractice.roundId || q.roundId || "",
    roundNo: currentPractice.roundNo || q.roundNo || null,
    helpUsed: false,
    enteredWeaknessPool: !ok,
    practiceFace: q.practiceFace || "",
    attemptIndex: q.attemptIndex || 1,
    gateStatus: q.gateStatus || null,
    chunkId: q.chunkId || currentLesson?.chunkId,
    learningStatus: state.itemStats[getStatKey(q.itemId, q.itemKind)]?.learningStatus,
    testStatus: state.itemStats[getStatKey(q.itemId, q.itemKind)]?.testStatus,
    masteryStatus: state.itemStats[getStatKey(q.itemId, q.itemKind)]?.masteryStatus,
    at: new Date().toISOString()
  });
  currentPractice.results.push({ question: q, correct: ok, result: ok ? "correct" : "wrong", timeSpentMs });
  currentPractice.activeTimeMs += timeSpentMs;
  currentPractice.currentQuestionActiveMs = 0;
  saveReviewResume("interrupted");
  saveState();

  setTimeout(() => {
    currentPractice.index += 1;
    if (currentPractice.index >= currentPractice.total) finishPractice();
    else renderPractice();
  }, ok ? 900 : 1400);
}

function finishPractice() {
  const score = Math.round((currentPractice.correct / currentPractice.total) * 100);
  const sessionSummary = buildSessionSummary(currentPractice, score);
  const nextAfter = currentPractice.nextAfter || "";
  const showSubmitLog = !nextAfter;
  const finishedReviewPractice = isReviewPractice();
  if (finishedReviewPractice) {
    completeReviewRound();
  }
  state.completed += 1;
  state.streak = Math.max(1, state.streak + 1);
  state.sessionSummaries.push(sessionSummary);
  state.sessionSummaries = state.sessionSummaries.slice(-20);
  updateUnitProgressAfterPractice(currentPractice, score);
  saveState();
  renderAll();
  appViews.practice.innerHTML = finishedReviewPractice
    ? reviewRoundFinishedTemplate(score, sessionSummary)
    : `
    <section class="question-card">
      <div>
        <span class="badge ${score === 100 ? "" : "amber"}">${score === 100 ? "这一组很稳" : "已生成后续复现"}</span>
        <h2 style="margin-top:12px">本组完成</h2>
        <p class="question-zh">${sessionSummary.message}</p>
        <div class="report-list" style="margin-top:16px;text-align:left">
          ${reportItem("本组稳定", `${currentPractice.correct}/${currentPractice.total}，${score}%`, score === 100 ? "badge" : "badge amber")}
          ${reportItem("后续复现", `${sessionSummary.wrongCount} 个小点进入滚动复习`, sessionSummary.wrongCount ? "badge amber" : "badge")}
          ${reportItem("掌握进度", `${sessionSummary.masteredCount} 个核心点已达标`, sessionSummary.masteredCount ? "badge blue" : "badge")}
        </div>
        <div class="button-row" style="justify-content:center;margin-top:16px">
          ${
            nextAfter
              ? `<button class="primary-button" data-action="continue-today-flow">${continueTodayFlowLabel(nextAfter)}</button>`
              : ""
          }
          ${showSubmitLog ? `<button class="primary-button" data-action="submit-learning-log">提交学习日志</button>` : ""}
          <button class="primary-button" data-route-link="home">回到今日</button>
          <button class="secondary-button" data-route-link="mistakes">看小漏洞</button>
        </div>
      </div>
    </section>
  `;
  bindRouteLinks(appViews.practice);
  const continueReviewButton = appViews.practice.querySelector("[data-action='continue-review-round']");
  if (continueReviewButton) {
    continueReviewButton.addEventListener("click", () => startPractice("warmup"));
  }
  const enterPreviewButton = appViews.practice.querySelector("[data-action='enter-preview']");
  if (enterPreviewButton) {
    enterPreviewButton.addEventListener("click", () => continueTodayFlow(nextAfter || "fiveA-preview"));
  }
  const continueButton = appViews.practice.querySelector("[data-action='continue-today-flow']");
  if (continueButton) {
    continueButton.addEventListener("click", () => continueTodayFlow(nextAfter));
  }
  const submitButton = appViews.practice.querySelector("[data-action='submit-learning-log']");
  if (submitButton) {
    submitButton.addEventListener("click", exportRecords);
  }
}

function completeReviewRound() {
  const endedAt = new Date().toISOString();
  const roundRecord = buildRoundRecord(currentPractice, "completed", endedAt);
  state.roundRecords = [...(state.roundRecords || []), roundRecord].slice(-120);
  state.reviewRoundCursor = Math.min((state.reviewRoundCursor || 0) + 1, getOldKnowledgeReviewRoundCount());
  currentPractice.roundStatus = "completed";
  clearReviewResume();
}

function getOldKnowledgeReviewRoundCount() {
  return data?.studyPackage?.totalLibraryTasks?.oldKnowledgeReview?.rounds?.length || 1;
}

function buildRoundRecord(practice, status, endedAt = new Date().toISOString()) {
  const answeredCount = practice.results?.length || 0;
  return {
    roundId: practice.roundId || `old-review-round-${practice.roundNo || 1}`,
    roundNo: practice.roundNo || 1,
    roundStartedAt: practice.roundStartedAt,
    roundEndedAt: endedAt,
    roundStatus: status,
    activeTimeMs: practice.activeTimeMs || 0,
    pauseCount: practice.pauseCount || 0,
    pauseDurationMs: practice.pauseDurationMs || 0,
    answeredCount,
    remainingCount: Math.max(0, (practice.total || 0) - answeredCount),
    resumeAvailable: status !== "completed",
    lastSavedAt: new Date().toISOString(),
    interruptedAt: practice.interruptedAt || null
  };
}

function reviewRoundFinishedTemplate(score, sessionSummary) {
  const roundCount = getOldKnowledgeReviewRoundCount();
  const nextRoundNo = Math.min((state.reviewRoundCursor || 0) + 1, roundCount);
  const firstRoundDone = (state.reviewRoundCursor || 0) >= roundCount;
  return `
    <section class="question-card">
      <div>
        <span class="badge ${score === 100 ? "" : "amber"}">第 ${currentPractice.roundNo || ""} 轮完成</span>
        <h2 style="margin-top:12px">旧知复习本轮完成</h2>
        <p class="question-zh">${sessionSummary.message}</p>
        <div class="report-list" style="margin-top:16px;text-align:left">
          ${reportItem("本轮结果", `${currentPractice.correct}/${currentPractice.total}，${score}%`, score === 100 ? "badge" : "badge amber")}
          ${reportItem("下一轮", firstRoundDone ? "第一轮摸底已到末尾，后续进入加强" : `第 ${nextRoundNo} / ${roundCount} 轮`, "badge blue")}
          ${reportItem("测试日志", state.testMode ? "当前会导出 test 测试日志" : "当前会导出正式日志", state.testMode ? "badge amber" : "badge")}
        </div>
        <div class="button-row" style="justify-content:center;margin-top:16px">
          <button class="primary-button" data-action="continue-review-round">${firstRoundDone ? "进入第二轮加强" : "继续复习一轮"}</button>
          <button class="secondary-button" data-action="enter-preview">进入五上预习</button>
          <button class="secondary-button" data-action="submit-learning-log">生成学习日志</button>
          <button class="ghost-button" data-route-link="home">回到今日</button>
        </div>
      </div>
    </section>
  `;
}

function continueTodayFlowLabel(nextAfter) {
  if (nextAfter === "weakness-only" || nextAfter === "weakness-then-fiveA-strength" || nextAfter === "weakness-then-fiveA-preview") {
    return "继续小漏洞回收";
  }
  if (nextAfter === "fiveA-strength") return "继续五上加强测试";
  if (nextAfter === "fiveA-preview-quiz") return "继续五上小测";
  return "继续五上预习";
}

function continueTodayFlow(nextAfter) {
  if (nextAfter === "weakness-only") {
    startPractice("mistakes");
    return;
  }
  if (nextAfter === "weakness-then-fiveA-strength") {
    startPractice("mistakes", { nextAfter: "fiveA-strength" });
    return;
  }
  if (nextAfter === "weakness-then-fiveA-preview") {
    startPractice("mistakes", { nextAfter: "fiveA-preview" });
    return;
  }
  if (nextAfter === "fiveA-strength") {
    startPractice("fiveA-strength");
    return;
  }
  if (nextAfter === "fiveA-preview-quiz") {
    startPractice("fiveA-preview-quiz");
    return;
  }
  if (nextAfter === "fiveA-preview") {
    startFiveAPreviewLesson();
    return;
  }
  navigate("home");
}

function buildQuestionPool(mode) {
  const unit = getCurrentStudyUnit();
  const chunk = unit ? getLearningChunks(unit).find((item) => item.id === currentLesson?.chunkId) || getCurrentLearningChunk(unit) : null;
  const reviewItems = getReviewQuestionItems();
  const learnedItems = [...reviewItems, ...getLearnedQuestionItems()];
  const learnedForUnit = unit ? getLearnedQuestionItems({ unitId: unit.id }) : learnedItems;
  const mistakeQuestions = getActiveMistakes().slice(0, 5).map(mistakeToQuestion);
  const selectedScope = isScopedPracticeMode(mode) && state.selectedScope?.scopeId ? getScopeById(state.selectedScope.scopeId) : null;
  const scopedItems = selectedScope ? getQuestionItemsForScope(selectedScope.scopeId) : [];

  if (mode === "warmup") return getWarmupQuestions();
  if (mode === "mistakes") return getMistakeQuestionsForSelectedCategory();
  if (mode === "fiveA-preview-light") return buildFiveAPreviewQuestions("light_practice");
  if (mode === "fiveA-preview-quiz") return buildFiveAPreviewQuestions("gate_quiz");
  if (mode === "fiveA-strength") return buildFiveAStrengthQuestions();
  if (mode === "preview-practice") {
    return buildChunkPracticeQuestions(unit, chunk, "轻练习").slice(0, 5);
  }
  if (mode === "preview-quiz") {
    markChunkLearned(unit, chunk);
    return buildChunkPracticeQuestions(unit, chunk, "小测").slice(0, 7);
  }
  if (mode === "self-review") {
    if (state.selectedReview !== "5a-learned") {
      return buildQuestionsFromLearned(getReviewQuestionItems({ catalogId: state.selectedReview }), 14);
    }
    return buildQuestionsFromLearned(learnedForUnit, 12);
  }
  if (mode === "scope-review") return buildQuestionsFromLearned(scopedItems, 24);
  if (mode === "start-listening") return buildQuestionsFromLearned(learnedItems.filter((item) => ["word", "phrase", "sentence"].includes(item.itemKind)), 6, "listen");
  if (mode === "start-recognition") return buildQuestionsFromLearned(learnedItems, 6, "recognition");
  if (mode === "start-spelling") return buildQuestionsFromLearned(learnedItems.filter((item) => item.itemKind === "word"), 6, "spelling");
  if (mode === "start-sentence") return buildQuestionsFromLearned(learnedItems.filter((item) => item.itemKind === "sentence"), 8, "use");
  if (mode === "review-total") return buildQuestionsFromLearned(scopedItems.length ? scopedItems : learnedItems, 20);
  if (mode === "weekly") return uniqueQuestions([...mistakeQuestions, ...buildQuestionsFromLearned(learnedItems, 8)]).slice(0, 10);
  if (mode === "unit") return buildQuestionsFromLearned(learnedForUnit, 12);
  return buildDailyQuestions(learnedItems, mistakeQuestions);
}

function buildFiveAPreviewQuestions(gatePhase) {
  const previewPackage = getTotalPackage("preview");
  const chunk = getCurrentPreviewChunk();
  if (!previewPackage || !chunk) return [];
  const itemIds = new Set(chunk.itemIds || []);
  const preferredOrder =
    gatePhase === "light_practice"
      ? ["preview_vocab_en_zh_match", "preview_vocab_listen_choose", "preview_vocab_zh_fill_blank"]
      : ["preview_vocab_zh_full_spell"];
  const questions = preferredOrder.flatMap((questionType) =>
    (previewPackage.questions || [])
      .filter((question) => question.gatePhase === gatePhase)
      .filter((question) => question.questionType === questionType)
      .filter((question) => itemIds.has(question.mainItemId))
      .sort((a, b) => String(a.sortKey || a.questionId).localeCompare(String(b.sortKey || b.questionId), "en", { numeric: true }))
  );
  const limit = gatePhase === "light_practice" ? 30 : 10;
  return questions.slice(0, limit).map((question) => packageQuestionToPractice(question, gatePhase === "light_practice" ? "轻测" : "小测", "preview"));
}

function buildFiveAStrengthQuestions() {
  if (!isFiveAReinforcementAllowed()) return [];
  const strengthPackage = getTotalPackage("strength");
  const allowedIds = new Set(
    Object.values(state.previewItemStatus || [])
      .filter((item) => item.gateStatus?.miniQuizDone === true)
      .map((item) => item.itemId)
  );
  return (strengthPackage?.questions || [])
    .filter((question) => question.requiresGateComplete !== false)
    .filter((question) => allowedIds.has(question.mainItemId))
    .sort((a, b) => String(a.sortKey || a.questionId).localeCompare(String(b.sortKey || b.questionId), "en", { numeric: true }))
    .slice(state.nextTaskCursor?.fiveAStrengthIndex || 0, (state.nextTaskCursor?.fiveAStrengthIndex || 0) + 30)
    .map((question) => packageQuestionToPractice(question, "五上加强", "strength"));
}

function packageQuestionToPractice(question, badge, packageKind = "preview") {
  question = hydrateFillBlankChoiceQuestion(question, packageKind);
  const itemId = question.mainItemId || question.itemId;
  const item = getPackageItem(packageKind, itemId) || {};
  const hasChoices = Array.isArray(question.choices) && question.choices.length > 0;
  const isListening = /listen|听音|听句/.test(`${question.questionType} ${question.prompt}`);
  const requiresKeyboardInput = shouldUsePackageKeyboardInput(question, hasChoices);
  const answer = question.answer || question.targetText || item.en || "";
  return {
    type: requiresKeyboardInput ? "spell" : isListening ? "listen-choice" : "meaning-choice",
    title: reviewQuestionTitle(question) || question.prompt || question.questionType,
    badge,
    level: question.difficulty || question.masteryFace || "练习",
    prompt: isListening && hasChoices && !requiresKeyboardInput ? "听录音，选择正确答案" : question.prompt || question.targetMeaning || item.zh || "",
    answer,
    audioText: question.audioText || question.targetText || item.en || answer,
    choices: requiresKeyboardInput ? [] : shuffle(uniqueValues(question.choices || [])),
    itemId,
    questionId: question.questionId,
    itemKind: question.itemKind || item.itemKind || "word",
    bookId: question.bookId || item.bookId,
    unitId: question.unitId || item.unitId,
    scopeId: question.scopeId || item.scopeId,
    scopeType: question.scopeType || item.scopeType || (packageKind === "review" ? "bookReview" : "fiveAUnit"),
    track: item.track || question.track || (packageKind === "review" ? "review" : "preview"),
    gateStatus: packageKind === "preview" ? state.previewItemStatus?.[itemId]?.gateStatus || {} : question.gateStatus || null,
    practiceFace: question.practiceFace || question.masteryFace || "",
    questionType: question.questionType,
    testKey: question.testKey || "",
    abilityFace: question.abilityFace || question.practiceFace || question.masteryFace || "",
    requiredTestType: question.requiredTestType || "",
    roundNo: question.roundNo || null,
    roundId: question.roundId || "",
    attemptIndex: question.attemptIndex || 1,
    sourceMode: question.sourceMode,
    skill: mapQuestionSkill(question),
    interactionMode: requiresKeyboardInput ? "keyboard-input" : "choice",
    expectedInputType: question.expectedInputType || (requiresKeyboardInput ? "english" : "choice"),
    requiresKeyboardInput,
    keyboardLayout: requiresKeyboardInput ? question.keyboardLayout || "qwerty-english-with-symbols" : "",
    autoPlay: isListening || /listen/.test(question.questionType)
  };
}

function shouldUsePackageKeyboardInput(question, hasChoices) {
  const questionType = String(question.questionType || "");
  if (isFillBlankChoiceQuestion(question)) return false;
  if (question.requiresKeyboardInput === true) return true;
  if (question.requiresKeyboardInput === false || question.interactionMode === "choice") return false;
  if (hasChoices) return false;
  return KEYBOARD_INPUT_QUESTION_TYPES.has(questionType);
}

function isFillBlankChoiceQuestion(question = {}) {
  return FILL_BLANK_CHOICE_QUESTION_TYPES.has(String(question.questionType || ""));
}

function hydrateFillBlankChoiceQuestion(question = {}, preferredPackageKind = "") {
  if (!isFillBlankChoiceQuestion(question)) return question;
  const existingChoices = Array.isArray(question.choices) ? question.choices.filter(Boolean) : [];
  if (existingChoices.length > 0 && question.requiresKeyboardInput !== true) return question;
  const sourceQuestion = findFillBlankChoiceSource(question, preferredPackageKind);
  const sourceChoices = Array.isArray(sourceQuestion?.choices) ? sourceQuestion.choices.filter(Boolean) : [];
  if (!sourceChoices.length) return question;
  const answer = sourceQuestion.answer || question.answer || question.targetText || "";
  return {
    ...question,
    prompt: sourceQuestion.prompt || question.prompt,
    answer,
    targetText: question.targetText || sourceQuestion.targetText,
    targetMeaning: question.targetMeaning || sourceQuestion.targetMeaning,
    choices: shuffle(uniqueValues([answer, ...sourceChoices])),
    interactionMode: "choice",
    expectedInputType: "choice",
    requiresKeyboardInput: false,
    keyboardLayout: ""
  };
}

function findFillBlankChoiceSource(question = {}, preferredPackageKind = "") {
  const kinds = uniqueValues([preferredPackageKind, "review", "preview", "strength"].filter(Boolean));
  for (const kind of kinds) {
    const packageData = getTotalPackage(kind);
    const source = findMatchingFillBlankQuestion(packageData?.questions || [], question);
    if (source) return source;
  }
  return null;
}

function findMatchingFillBlankQuestion(questions, target) {
  if (!questions.length) return null;
  const exactId = String(target.questionId || "");
  const mainItemId = String(target.mainItemId || target.itemId || "");
  const questionType = String(target.questionType || "");
  if (exactId) {
    const exact = questions.find((question) => question.questionId === exactId && Array.isArray(question.choices) && question.choices.length);
    if (exact) return exact;
  }
  return questions.find(
    (question) =>
      String(question.questionType || "") === questionType &&
      String(question.mainItemId || question.itemId || "") === mainItemId &&
      Array.isArray(question.choices) &&
      question.choices.length
  );
}

function getPackageItem(packageKind, itemId) {
  if (!itemId) return null;
  const packageData = getTotalPackage(packageKind);
  return (packageData?.items || []).find((item) => item.itemId === itemId || item.id === itemId) || null;
}

function reviewQuestionTitle(question) {
  const labels = {
    listen_choose_word: "听音选词",
    en_to_zh: "看英文选中文",
    zh_to_en: "看中文选英文",
    listen_spell_word: "听音写英文",
    zh_spell_word: "看中文写英文",
    context_choose_word: "场景选词",
    phonics_shape_confusion_word: "易混辨析",
    semantic_confusion_word: "易混辨析",
    listen_choose_phrase: "听音选短语",
    zh_to_phrase: "看中文选短语",
    phrase_fill_blank: "短语补全",
    phrase_in_sentence: "短语放入句子",
    context_choose_phrase: "场景短语",
    confusion_phrase: "易混短语",
    listen_sentence_meaning: "听句选意思",
    sentence_en_to_zh: "看英文选中文",
    sentence_fill_blank: "句子补空",
    reorder_words: "连词成句",
    zh_key_expression: "看中文写核心表达",
    context_choose_sentence: "场景选句",
    grammar_punctuation_confusion: "句型易混",
    text_dialogue_listen_read: "课文听读理解",
    text_dialogue_order: "课文排序",
    story_true_false: "课文判断",
    story_detail_choice: "细节理解",
    dialogue_fill_blank: "对话补全",
    role_scene_transfer: "角色场景迁移"
  };
  return labels[question.questionType] || "";
}

function mapQuestionSkill(question) {
  const text = `${question.masteryFace || ""} ${question.practiceFace || ""} ${question.questionType || ""}`.toLowerCase();
  if (/spell|fill|structure|reorder/.test(text)) return "spelling";
  if (/listen/.test(text)) return "listen";
  if (/recognition|meaning|en_zh|choose/.test(text)) return "recognition";
  return "use";
}

function isScopedPracticeMode(mode) {
  return ["scope-review", "unit-scope", "review-total"].includes(mode) && Boolean(state.selectedScope?.scopeId);
}

function buildChunkPracticeQuestions(unit, chunk, badge) {
  if (!unit || !chunk) return [];
  return [
    listenQuestion(chunk.words[0], chunk.words, { unitId: unit.id, chunkId: chunk.id, badge, level: "听单词" }),
    listenQuestion(chunk.words[1], chunk.words, { unitId: unit.id, chunkId: chunk.id, badge, level: "听单词" }),
    phraseChoiceQuestion(chunk.phrases[0], chunk.phrases, { unitId: unit.id, chunkId: chunk.id, badge }),
    spellQuestion(chunk.words[2] || chunk.words[0], { unitId: unit.id, chunkId: chunk.id, title: "听后拼写", badge, autoPlay: true }),
    spellQuestion(chunk.words[3] || chunk.words[1], { unitId: unit.id, chunkId: chunk.id, title: "看中文写英文", badge }),
    sentenceListenQuestion(chunk.sentences[0], chunk.sentences, { unitId: unit.id, chunkId: chunk.id, badge }),
    meaningQuestion(chunk.sentences[1] || chunk.sentences[0], chunk.sentences, { unitId: unit.id, chunkId: chunk.id, title: "句义理解", badge })
  ].filter(Boolean);
}

function buildQuestionsFromLearned(items, limit, forcedSkill) {
  const sorted = [...items].sort((a, b) => getItemMasteryScore(a.id, a.itemKind) - getItemMasteryScore(b.id, b.itemKind));
  return uniqueQuestions(sorted.map((item) => questionForLearnedItem(item, { forcedSkill })).filter(Boolean)).slice(0, limit);
}

function listenQuestion(word, words, overrides = {}) {
  if (!word) return null;
  const isExpression = String(word.en || "").split(/\s+/).length > 1 || /[.!?]/.test(word.en || "");
  return {
    type: "listen-choice",
    title: isExpression ? "听音选表达" : "听音选词",
    badge: isExpression ? "听表达" : "听音选词",
    level: isExpression ? "听表达" : "听单词",
    prompt: isExpression ? "听录音，选择听到的表达" : "听录音，选择听到的单词",
    answer: word.en,
    audioText: word.en,
    itemId: word.id,
    itemKind: "word",
    unitId: overrides.unitId || "5A-U1",
    skill: "listen",
    core: Boolean(word.core),
    choices: shuffle(uniqueValues([word.en, ...words.filter((item) => item.id !== word.id).slice(0, 3).map((item) => item.en)])),
    ...overrides
  };
}

function spellQuestion(word, overrides = {}) {
  if (!word) return null;
  return {
    type: "spell",
    title: "看中文写英文",
    badge: "拼写",
    level: "拼写",
    prompt: word.zh,
    answer: word.en,
    audioText: word.en,
    word,
    itemId: word.id,
    itemKind: "word",
    unitId: overrides.unitId || "5A-U1",
    skill: "spelling",
    core: Boolean(word.core),
    ...overrides
  };
}

function meaningQuestion(sentence, sentences, overrides = {}) {
  if (!sentence) return null;
  return {
    type: "meaning-choice",
    title: "句义选择",
    badge: "句型",
    level: "理解",
    prompt: sentence.en,
    answer: sentence.zh,
    audioText: sentence.en,
    itemId: sentence.id,
    itemKind: "sentence",
    unitId: overrides.unitId || "5A-U1",
    skill: "use",
    core: true,
    choices: shuffle(uniqueValues([sentence.zh, ...sentences.filter((item) => item.id !== sentence.id).slice(0, 2).map((item) => item.zh)])),
    ...overrides
  };
}

function phraseChoiceQuestion(phrase, phrases, overrides = {}) {
  if (!phrase || !phrases?.length) return null;
  return {
    type: "listen-choice",
    title: "听音选短语",
    badge: "听短语",
    level: "听短语",
    prompt: "听录音，选择听到的短语",
    answer: phrase.en,
    audioText: phrase.en,
    itemId: phrase.id,
    itemKind: "phrase",
    unitId: overrides.unitId || "5A-U1",
    skill: "listen",
    core: true,
    choices: shuffle(uniqueValues([phrase.en, ...phrases.filter((item) => item.id !== phrase.id).slice(0, 3).map((item) => item.en)])),
    ...overrides
  };
}

function sentenceListenQuestion(sentence, sentences, overrides = {}) {
  if (!sentence || !sentences?.length) return null;
  return {
    type: "meaning-choice",
    title: "听句子选意思",
    badge: "听句子",
    level: "听句子",
    prompt: "听录音，选择正确意思",
    answer: sentence.zh,
    audioText: sentence.en,
    itemId: sentence.id,
    itemKind: "sentence",
    unitId: overrides.unitId || "5A-U1",
    skill: "listen",
    core: true,
    choices: shuffle(uniqueValues([sentence.zh, ...sentences.filter((item) => item.id !== sentence.id).slice(0, 2).map((item) => item.zh)])),
    ...overrides
  };
}

function getActiveMistakes() {
  return state.mistakes
    .filter((item) => item.status !== "mastered")
    .sort((a, b) => (b.priority || 1) - (a.priority || 1) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function getMistakeQuestionsForSelectedCategory() {
  const category = state.selectedMistakeCategory || "all";
  return getActiveMistakes()
    .filter((item) => category === "all" || getMistakeCategory(item).id === category)
    .slice(0, 8)
    .map(mistakeToQuestion);
}

function getMistakeCategories(items = getActiveMistakes()) {
  const base = [
    { id: "listen", title: "听力", hint: "听音选词、听音默写、听音辨义" },
    { id: "spelling", title: "单词拼写", hint: "看中文写英文、补字母、完整拼写" },
    { id: "phrase", title: "短句", hint: "短语、固定搭配、句型替换、句子填空" },
    { id: "text", title: "对话/课文", hint: "对话理解、课文句子、场景问答" }
  ];
  return base.map((category) => {
    const categoryItems = items.filter((item) => getMistakeCategory(item).id === category.id);
    const attempts = categoryItems.reduce((sum, item) => sum + (item.times || 1), 0);
    return {
      ...category,
      count: categoryItems.length,
      activeCount: categoryItems.filter((item) => item.status !== "mastered").length,
      masteredCount: categoryItems.filter((item) => item.status === "mastered").length,
      recentErrorRate: attempts ? Math.min(100, Math.round((categoryItems.length / attempts) * 100)) : 0
    };
  });
}

function getMistakeCategory(item) {
  const text = `${item.reason || ""} ${item.skill || ""} ${item.questionType || ""} ${item.itemKind || ""} ${item.sourceMode || ""}`.toLowerCase();
  if (/听|listen|audio/.test(text)) return { id: "listen", title: "听力" };
  if (/dialogue|story|text|课文|对话/.test(text) || item.itemKind === "textDialogue") return { id: "text", title: "对话/课文" };
  if (/sentence|phrase|use|句|短语|搭配|语法/.test(text) || ["phrase", "sentence"].includes(item.itemKind)) {
    return { id: "phrase", title: "短句" };
  }
  return { id: "spelling", title: "单词拼写" };
}

function mistakeToQuestion(item) {
  const isListening = item.reason === "听不出来";
  if (["phrase", "sentence"].includes(item.itemKind)) {
    return mistakeShortChoiceQuestion(item, isListening);
  }
  return {
    type: "spell",
    title: isListening ? "听音默写" : item.itemKind === "sentence" ? "句子默写" : "默写单词",
    badge: "小漏洞回收",
    level: isListening ? "听写" : "复现",
    prompt: isListening ? "听录音，写出内容" : item.zh || item.prompt || "写出正确内容",
    answer: item.en || item.answer,
    audioText: item.en || item.answer,
    itemId: item.itemId || item.en || item.answer,
    itemKind: item.itemKind || "word",
    bookId: item.bookId,
    unitId: item.unitId,
    chunkId: item.chunkId,
    scopeId: item.scopeId,
    scopeType: item.scopeType,
    sourceMode: item.sourceMode,
    skill: isListening ? "listen" : item.skill || "spelling",
    autoPlay: isListening,
    source: item
  };
}

function mistakeShortChoiceQuestion(item, isListening = false) {
  const english = getMistakeEnglishText(item);
  const chinese = getMistakeChineseText(item);
  const answerSide = english ? "en" : "zh";
  const answer = english || chinese || item.answer || item.en || "";
  const prompt = isListening
    ? item.itemKind === "phrase"
      ? "听录音，选择听到的短语"
      : "听录音，选择听到的短句"
    : chinese || (english ? "选择对应的中文意思" : item.prompt || "选择正确答案");
  const choices = buildMistakeShortChoices(item, answerSide, answer);
  return {
    type: isListening ? "listen-choice" : "meaning-choice",
    title: isListening ? (item.itemKind === "phrase" ? "听音选短语" : "听音选短句") : item.itemKind === "phrase" ? "短语选择" : "短句选择",
    badge: "小漏洞回收",
    level: item.itemKind === "phrase" ? "短语" : "短句",
    prompt,
    answer,
    audioText: english || answer,
    choices,
    itemId: item.itemId || item.en || item.answer,
    itemKind: item.itemKind || "phrase",
    bookId: item.bookId,
    unitId: item.unitId,
    chunkId: item.chunkId,
    scopeId: item.scopeId,
    scopeType: item.scopeType,
    sourceMode: item.sourceMode,
    skill: isListening ? "listen" : item.skill || "recognition",
    autoPlay: isListening,
    interactionMode: "choice",
    requiresKeyboardInput: false,
    source: item
  };
}

function getMistakeEnglishText(item) {
  return [item.answer, item.en, item.zh, item.prompt].find((value) => looksEnglishText(value)) || "";
}

function getMistakeChineseText(item) {
  return [item.zh, item.prompt, item.answer, item.en].find((value) => containsCjk(value)) || "";
}

function buildMistakeShortChoices(item, side, answer) {
  const candidates = [
    ...getReviewQuestionItems(),
    ...getLearnedQuestionItems(),
    ...getActiveMistakes()
  ];
  const values = candidates
    .filter((candidate) => candidate.itemKind === item.itemKind)
    .filter((candidate) => candidate.itemId !== item.itemId && candidate.id !== item.itemId)
    .map((candidate) => (side === "en" ? getCandidateEnglishText(candidate) : getCandidateChineseText(candidate)))
    .filter((value) => value && normalizeForChoice(value) !== normalizeForChoice(answer));
  const distractors = uniqueValues(values).slice(0, 3);
  return shuffle(uniqueValues([answer, ...distractors]));
}

function getCandidateEnglishText(item) {
  return [item.en, item.answer, item.zh, item.prompt].find((value) => looksEnglishText(value)) || "";
}

function getCandidateChineseText(item) {
  return [item.zh, item.prompt, item.answer, item.en].find((value) => containsCjk(value)) || "";
}

function looksEnglishText(value) {
  const text = String(value || "").trim();
  return /[A-Za-z]/.test(text) && !containsCjk(text);
}

function containsCjk(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function normalizeForChoice(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function questionForLearnedItem(item, options = {}) {
  const unit = getUnitById(item.unitId) || getFirstVerifiedUnit();
  const learnedInUnit = item.reviewUnit ? getReviewQuestionItems({ unitId: item.unitId }) : getLearnedQuestionItems({ unitId: item.unitId });
  const words = learnedInUnit.filter((candidate) => candidate.itemKind === "word");
  const phrases = learnedInUnit.filter((candidate) => candidate.itemKind === "phrase");
  const sentences = learnedInUnit.filter((candidate) => candidate.itemKind === "sentence");
  const skill = options.forcedSkill || pickNextSkill(item.id, item.itemKind);
  const meta = {
    bookId: item.bookId,
    unitId: item.unitId || unit?.id,
    chunkId: item.chunkId,
    badge: options.badge || "已学复习",
    reviewUnit: Boolean(item.reviewUnit),
    scopeIds: item.scopeIds || [],
    scopeId: options.scopeId || state.selectedScope?.scopeId,
    scopeType: state.selectedScope?.scopeType,
    sourceMode: state.selectedScope?.sourceMode
  };

  if (item.itemKind === "word") {
    if (skill === "spelling") return spellQuestion(item, { ...meta, title: "默写单词" });
    return listenQuestion(item, words.length >= 2 ? words : [item], { ...meta, skill: skill === "recognition" ? "recognition" : "listen" });
  }
  if (item.itemKind === "phrase") return phraseChoiceQuestion(item, phrases.length >= 2 ? phrases : [item], { ...meta, skill: "recognition" });
  if (item.itemKind === "sentence") {
    if (skill === "listen") return sentenceListenQuestion(item, sentences.length >= 2 ? sentences : [item], meta);
    return meaningQuestion(item, sentences.length >= 2 ? sentences : [item], { ...meta, title: "句义理解" });
  }
  return null;
}

function pickNextSkill(itemId, itemKind) {
  const stat = state.itemStats[getStatKey(itemId, itemKind)];
  const required = getRequiredSkills(itemKind);
  if (!stat) return required[0];
  return [...required].sort((a, b) => (stat.skills?.[a]?.streak || 0) - (stat.skills?.[b]?.streak || 0))[0];
}

function buildDailyQuestions(learnedItems, mistakeQuestions) {
  const dueQuestions = buildDueReviewQuestions(learnedItems, 5);
  return uniqueQuestions([...mistakeQuestions.slice(0, 2), ...dueQuestions]).slice(0, 7);
}

function buildDueReviewQuestions(items, limit) {
  const due = items
    .map((item) => ({ item, score: getItemMasteryScore(item.id, item.itemKind) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
  const questions = [];
  due.forEach(({ item }, index) => {
    questions.push(questionForLearnedItem(item, { badge: index ? "到期复习" : "核心复习" }));
  });
  return questions;
}

function uniqueQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = question.questionId || `${question.itemId}-${question.questionType || question.type}-${question.skill}-${question.answer}-${question.attemptIndex || 1}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getStatKey(itemId, itemKind = "word") {
  return `${itemKind}:${itemId}`;
}

function getItemStat(itemId, itemKind = "word") {
  const key = getStatKey(itemId, itemKind);
  if (!state.itemStats[key]) {
    state.itemStats[key] = {
      itemId,
      itemKind,
      attempts: 0,
      correct: 0,
      streak: 0,
      skills: {},
      questionTypes: {},
      firstSeenAt: null,
      lastPracticedAt: null,
      learnedAt: null,
      stage: "刚学会",
      learningStatus: "unseen",
      testStatus: "untested",
      masteryStatus: "notStable",
      updatedAt: null
    };
  }
  return state.itemStats[key];
}

function updateItemStats(question, ok) {
  if (!question.itemId || !question.skill) return;
  const stat = getItemStat(question.itemId, question.itemKind);
  const now = new Date().toISOString();
  stat.attempts += 1;
  stat.correct += ok ? 1 : 0;
  stat.streak = ok ? stat.streak + 1 : 0;
  stat.firstSeenAt ||= now;
  stat.lastPracticedAt = now;
  stat.updatedAt = now;
  stat.exportKind = state.testMode ? "test" : "formal";
  stat.isTestRecord = Boolean(state.testMode);
  stat.questionTypes[question.type] = (stat.questionTypes[question.type] || 0) + 1;
  const current = stat.skills[question.skill] || { streak: 0, attempts: 0, correct: 0 };
  current.attempts += 1;
  current.correct += ok ? 1 : 0;
  current.streak = ok ? Math.min(3, current.streak + 1) : 0;
  stat.skills[question.skill] = current;
  stat.stage = getChildStageLabel(stat);
  stat.learningStatus = (state.learnedItems[question.itemId] || question.reviewUnit) ? "newLearned" : "learning";
  stat.testStatus = "tested";
  stat.masteryStatus = getMasteryStatus(stat);
  if (state.learnedItems[question.itemId]) {
    state.learnedItems[question.itemId].stage = stat.stage;
    state.learnedItems[question.itemId].lastPracticedAt = now;
    state.learnedItems[question.itemId].testStatus = stat.testStatus;
    state.learnedItems[question.itemId].masteryStatus = stat.masteryStatus;
  }
}

function getRequiredSkills(itemKind) {
  if (itemKind === "word") return ["listen", "recognition", "spelling"];
  if (itemKind === "sentence") return ["listen", "use"];
  if (itemKind === "phrase") return ["listen", "recognition"];
  return ["listen"];
}

function getItemMasteryScore(itemId, itemKind = "word") {
  const stat = state.itemStats[getStatKey(itemId, itemKind)];
  if (!stat) return 0;
  const required = getRequiredSkills(itemKind);
  const points = required.reduce((sum, skill) => sum + Math.min(3, stat.skills?.[skill]?.streak || 0), 0);
  return points / (required.length * 3);
}

function isItemMastered(itemId, itemKind = "word") {
  return getItemMasteryScore(itemId, itemKind) >= 1;
}

function getMasteryStatus(stat) {
  const required = getRequiredSkills(stat.itemKind);
  const testedSkills = Object.keys(stat.skills || {}).filter((skill) => (stat.skills[skill]?.attempts || 0) > 0);
  const allSkillsStable = required.every((skill) => (stat.skills?.[skill]?.streak || 0) >= 3);
  if (allSkillsStable && stat.streak >= 3) return "stableMastered";
  if (stat.streak >= 3 && testedSkills.length >= Math.max(1, required.length - 1)) return "temporaryMastered";
  if ((stat.correct || 0) > 0 || testedSkills.length) return "practicing";
  return "notStable";
}

function getChildStageLabel(stat) {
  if (!stat?.attempts) return "刚学会";
  if (getMasteryStatus(stat) === "stableMastered") return "已经很稳";
  if (stat.streak >= 3) return "越来越熟";
  if (stat.correct > 0) return "练稳中";
  return "刚学会";
}

function getUnitMastery(unit) {
  if (!unit) return { mastered: 0, total: 0, pending: 0, percent: 0 };
  const items = [
    ...unit.words.filter((word) => word.core).map((word) => ({ id: word.id, kind: "word" })),
    ...(unit.phrases || []).map((phrase) => ({ id: phrase.id, kind: "phrase" })),
    ...unit.sentences.map((sentence) => ({ id: sentence.id, kind: "sentence" }))
  ];
  const mastered = items.filter((item) => isItemMastered(item.id, item.kind)).length;
  const total = items.length || 1;
  return {
    mastered,
    total,
    pending: total - mastered,
    percent: Math.round((mastered / total) * 100)
  };
}

function updateMistakeProgress(question, ok) {
  const key = question.answer || question.itemId;
  const existing = state.mistakes.find((item) => item.en === key || item.answer === key || item.itemId === question.itemId);
  if (!existing || !ok) return;
  existing.correctStreak = (existing.correctStreak || 0) + 1;
  existing.updatedAt = new Date().toISOString();
  existing.retestRecords ||= [];
  existing.retestRecords.push({
    at: existing.updatedAt,
    mode: currentPractice?.mode,
    scopeId: currentPractice?.scope?.scopeId || question.scopeId || existing.scopeId || null,
    scopeType: currentPractice?.scope?.scopeType || question.scopeType || existing.scopeType || null,
    skill: question.skill,
    questionType: question.type,
    correct: true
  });
  if (existing.correctStreak >= 3) {
    existing.status = "mastered";
    existing.priority = 0;
  }
}

function buildSessionSummary(practice, score) {
  const wrongCount = practice.results.filter((item) => !item.correct).length;
  const masteredCount = practice.results.filter((item) => item.question.itemId && isItemMastered(item.question.itemId, item.question.itemKind)).length;
  return {
    id: `summary-${Date.now()}`,
    mode: practice.mode,
    score,
    wrongCount,
    masteredCount,
    at: new Date().toISOString(),
    message:
      score === 100
        ? "这一组很稳，系统会把已掌握内容往后排，把时间留给未掌握点。"
        : "有几个小点先收进后面复习，接下来会换听、认、拼、用的方式再出现。"
  };
}

function updateUnitProgressAfterPractice(practice, score) {
  if (practice.mode === "fiveA-preview-light") {
    markFiveAPreviewLightDone(practice);
    return;
  }
  if (practice.mode === "fiveA-preview-quiz") {
    markFiveAPreviewMiniQuizDone(practice, score);
    return;
  }
  const unit = getCurrentStudyUnit();
  if (!unit) return;
  if (practice.mode === "preview-practice") {
    state.unitProgress[unit.id] = "quiz-ready";
  }
  if (practice.mode === "preview-quiz") {
    const chunks = getLearningChunks(unit);
    const progress = getLessonProgress(unit.id);
    progress.chunkIndex = Math.min((progress.chunkIndex || 0) + 1, chunks.length - 1);
    state.unitProgress[unit.id] = progress.chunkIndex >= chunks.length - 1 ? "consolidating" : "previewing";
  }
  if (["preview-quiz", "unit", "daily", "self-review"].includes(practice.mode)) {
    const mastery = getUnitMastery(unit);
    if (mastery.percent >= 100 && score === 100 && getActiveMistakes().every((item) => item.unitId !== unit.id)) {
      state.unitProgress[unit.id] = "mastered";
    } else if (state.unitProgress[unit.id] !== "previewing") {
      state.unitProgress[unit.id] = "consolidating";
    }
  }
}

function markFiveAPreviewLightDone(practice) {
  const chunk = getCurrentPreviewChunk();
  getPreviewChunkItems(chunk).forEach((item) => {
    const status = state.previewItemStatus[item.itemId] || {
      itemId: item.itemId,
      wordListItemId: item.itemId,
      itemKind: item.itemKind,
      wordListOrder: item.orderKey || item.itemId,
      unitId: item.unitId,
      gateStatus: {}
    };
    status.gateStatus = {
      heardStandardAudio: true,
      meaningViewed: true,
      readOrRepeatDone: true,
      ...(status.gateStatus || {}),
      lightPracticeDone: true
    };
    status.lightQuizStatus = practice.results.some((result) => result.question.itemId === item.itemId && !result.correct)
      ? "hasWeakFace"
      : "passed";
    status.previewStatus = "lightDone";
    status.updatedAt = new Date().toISOString();
    state.previewItemStatus[item.itemId] = status;
  });
}

function markFiveAPreviewMiniQuizDone(practice, score) {
  const chunk = getCurrentPreviewChunk();
  const wrongIds = new Set(practice.results.filter((result) => !result.correct).map((result) => result.question.itemId));
  getPreviewChunkItems(chunk).forEach((item) => {
    const status = state.previewItemStatus[item.itemId] || {
      itemId: item.itemId,
      wordListItemId: item.itemId,
      itemKind: item.itemKind,
      wordListOrder: item.orderKey || item.itemId,
      unitId: item.unitId,
      gateStatus: {}
    };
    status.gateStatus = {
      heardStandardAudio: true,
      meaningViewed: true,
      readOrRepeatDone: true,
      lightPracticeDone: true,
      ...(status.gateStatus || {}),
      miniQuizDone: !wrongIds.has(item.itemId)
    };
    status.miniQuizStatus = wrongIds.has(item.itemId) ? "needsRecycle" : "passed";
    status.previewStatus = wrongIds.has(item.itemId) ? "recycleNeeded" : "initialPassed";
    status.updatedAt = new Date().toISOString();
    state.previewItemStatus[item.itemId] = status;
  });

  state.lastCompletedTaskId = chunk?.chunkId || "";
  if (score === 100 && chunk) {
    state.nextTaskCursor.fiveAPreviewChunkIndex = (state.nextTaskCursor.fiveAPreviewChunkIndex || 0) + 1;
  }
}

async function toggleRecording() {
  const button = appViews.speaking.querySelector("[data-action='record']");

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    button.classList.remove("recording");
    button.querySelector("strong").textContent = "开始读";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      handleRecordingComplete();
    });
    mediaRecorder.start();
    button.classList.add("recording");
    button.querySelector("strong").textContent = "读好了";
  } catch (error) {
    showToast("麦克风权限没有打开");
  }
}

function handleRecordingComplete() {
  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  const playback = appViews.speaking.querySelector("#recordPlayback");
  playback.src = URL.createObjectURL(blob);
  playback.hidden = false;

  const result = simulatePronunciationScore(currentSpeakingItem.en, blob.size);
  const speakingScope = getScopeById(state.selectedSpeakingScopeId);
  appViews.speaking.querySelector("#scoreResult").innerHTML = scoreTemplate(result);
  state.records.push({
    id: `speech-${Date.now()}`,
    mode: "speaking",
    question: currentSpeakingItem.en,
    correct: result.total >= 82,
    itemId: currentSpeakingItem.id,
    itemKind: currentSpeakingItem.en?.includes(" ") ? "sentence" : "word",
    bookId: currentSpeakingItem.bookId || speakingScope?.bookId || inferBookId(currentSpeakingItem),
    unitId: currentSpeakingItem.unitId || speakingScope?.unitId || inferUnitId(currentSpeakingItem.id),
    scopeId: speakingScope?.scopeId || state.selectedSpeakingScopeId || "",
    scopeType: speakingScope?.scopeType || currentSpeakingItem.scopeType || "",
    sourceLabel: speakingScope?.title || currentSpeakingItem.sourceLabel || "",
    sourceMode: "speaking",
    skill: "speaking",
    scoringStatus: state.settings.speechProvider === "demo" ? "simulated" : "scored",
    score: result,
    at: new Date().toISOString()
  });
  saveState();
}

function simulatePronunciationScore(text, size) {
  const base = Math.min(96, Math.max(68, 72 + (text.length % 12) + Math.floor(size / 12000)));
  return {
    total: base,
    accuracy: Math.max(65, base - 4),
    fluency: Math.min(98, base + 2),
    completeness: Math.min(100, base + 5),
    feedback: base >= 85 ? "读得很清楚" : "这个词再读一遍会更稳"
  };
}

function scoreTemplate(score) {
  return `
    <div class="card">
      <span class="badge amber">模拟评分</span>
      <h3 style="margin-top:10px">${score.feedback}</h3>
      <div class="score-grid">
        ${scoreBox("总分", score.total)}
        ${scoreBox("准确", score.accuracy)}
        ${scoreBox("流利", score.fluency)}
        ${scoreBox("完整", score.completeness)}
      </div>
    </div>
  `;
}

function addManualMistake() {
  const en = document.querySelector("#wrongWord").value.trim();
  if (!en) {
    showToast("先填正确单词");
    return;
  }
  const typed = document.querySelector("#wrongTyped").value.trim();
  const reason = document.querySelector("#wrongReason").value;
  addMistake({ prompt: typed || en, answer: en, audioText: en }, reason);
  document.querySelector("#wrongWord").value = "";
  document.querySelector("#wrongTyped").value = "";
  renderAll();
  showToast("已加入下次日测");
}

function addMistake(question, reason) {
  const key = question.answer || question.word?.en || question.prompt;
  const existing = state.mistakes.find((item) => item.en === key || item.answer === key || item.itemId === question.itemId);
  if (existing) {
    const now = new Date().toISOString();
    existing.times += 1;
    existing.exportKind = state.testMode ? "test" : existing.exportKind || "formal";
    existing.isTestRecord = Boolean(state.testMode);
    existing.reason = reason;
    existing.helpUsed = Boolean(existing.helpUsed || question.helpUsed);
    existing.wrongReason = question.wrongReason || reason;
    existing.status = "active";
    existing.priority = Math.min(5, (existing.priority || 1) + 1);
    existing.correctStreak = 0;
    existing.lastWrongAt = now;
    existing.updatedAt = now;
    existing.retestRecords ||= [];
    existing.retestRecords.push({
      at: now,
      mode: currentPractice?.mode || existing.sourceMode || "manual",
      scopeId: currentPractice?.scope?.scopeId || question.scopeId || existing.scopeId || null,
      scopeType: currentPractice?.scope?.scopeType || question.scopeType || existing.scopeType || null,
      skill: question.skill,
      questionType: question.questionType || question.type,
      correct: false
    });
    existing.sourceMode = currentPractice?.mode || existing.sourceMode || "manual";
    existing.bookId ||= question.bookId || currentPractice?.scope?.bookId || inferBookId(question);
    existing.unitId ||= question.unitId || currentPractice?.scope?.unitId || inferUnitId(question.itemId);
    existing.scopeId ||= currentPractice?.scope?.scopeId || question.scopeId || null;
    existing.scopeType ||= currentPractice?.scope?.scopeType || question.scopeType || null;
  } else {
    const now = new Date().toISOString();
    state.mistakes.push({
      id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      en: key,
      zh: question.word?.zh || question.prompt,
      answer: question.answer,
      itemId: question.itemId,
      itemKind: question.itemKind,
      bookId: question.bookId || currentPractice?.scope?.bookId || inferBookId(question),
      unitId: question.unitId || currentPractice?.scope?.unitId || inferUnitId(question.itemId),
      chunkId: question.chunkId || currentLesson?.chunkId,
      scopeId: currentPractice?.scope?.scopeId || question.scopeId || null,
      scopeType: currentPractice?.scope?.scopeType || question.scopeType || null,
      skill: question.skill,
      sourceMode: currentPractice?.mode || "manual",
      questionType: question.questionType || question.type,
      reason,
      wrongReason: question.wrongReason || reason,
      helpUsed: Boolean(question.helpUsed),
      exportKind: state.testMode ? "test" : "formal",
      isTestRecord: Boolean(state.testMode),
      result: question.result || "wrong",
      times: 1,
      retestRecords: [],
      correctStreak: 0,
      priority: 2,
      status: "active",
      firstWrongAt: now,
      lastWrongAt: now,
      updatedAt: now
    });
  }
  saveState();
}

function handleWrongAnswer(question) {
  if (currentPractice?.mode === "fiveA-preview-light") {
    const entered = recordLightWeakFace(question);
    showToast(entered ? "先记下来，后面换个方式再见它" : "先记下薄弱面，再遇到会回收");
    return;
  }
  if (currentPractice?.mode === "fiveA-preview-quiz") {
    addMiniQuizMistake(question);
    showToast("先记下来，后面换个方式再见它");
    return;
  }
  addMistake(question, question.wrongReason || inferReason(question));
  showToast("先记下来，后面换个方式再见它");
}

function recordLightWeakFace(question) {
  const weakAspect = mapLightWeakAspect(question);
  const key = `${question.itemId || question.answer}:${weakAspect}`;
  const existing = state.lightWeakFaces?.[key] || {
    itemId: question.itemId,
    weakAspect,
    consecutiveWrongCount: 0,
    enteredWeaknessPool: false
  };
  existing.consecutiveWrongCount += 1;
  existing.lastWrongAt = new Date().toISOString();
  state.lightWeakFaces[key] = existing;
  if (existing.consecutiveWrongCount >= 2 && !existing.enteredWeaknessPool) {
    existing.enteredWeaknessPool = true;
    addMistake(question, `轻测薄弱面：${weakAspectLabel(weakAspect)}`);
    return true;
  }
  saveState();
  return false;
}

function mapLightWeakAspect(question) {
  const text = `${question.questionType || ""} ${question.practiceFace || ""} ${question.skill || ""}`.toLowerCase();
  if (/listen/.test(text) || question.type === "listen-choice") return "listen_choose";
  if (/fill|spell/.test(text) || question.type === "spell") return "zh_fill_en";
  return "en_zh_recognition";
}

function weakAspectLabel(weakAspect) {
  return {
    en_zh_recognition: "英中互认",
    listen_choose: "听音选词",
    zh_fill_en: "看中文补英文"
  }[weakAspect] || weakAspect;
}

function addMiniQuizMistake(question) {
  addMistake(question, "五上小测错词");
  const key = question.answer || question.itemId;
  const existing = state.mistakes.find((item) => item.en === key || item.answer === key || item.itemId === question.itemId);
  if (existing) {
    existing.miniQuizWrongAt = new Date().toISOString();
    existing.reserveNextDaySlot = true;
    existing.recycleWindowDays = Math.min(3, Math.max(1, existing.times || 1));
    existing.updatedAt = existing.miniQuizWrongAt;
    saveState();
  }
}

function buildExportSummary(records = state.records || []) {
  const stats = Object.values(state.itemStats || {});
  const countBy = (field, fallback = "unknown") =>
    stats.reduce((result, stat) => {
      const key = stat[field] || fallback;
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  const recent = records.filter((record) => typeof record.correct === "boolean").slice(-30);
  const correct = recent.filter((record) => record.correct).length;
  return {
    records: records.length,
    practiceRecords: records.filter((record) => record.mode !== "speaking").length,
    speakingRecords: records.filter((record) => record.mode === "speaking").length,
    learnedItems: Object.keys(state.learnedItems || {}).length,
    trackedItems: stats.length,
    activeWeaknesses: (state.mistakes || []).filter((item) => item.status !== "mastered").length,
    masteredWeaknesses: (state.mistakes || []).filter((item) => item.status === "mastered").length,
    recentAccuracy: recent.length ? Math.round((correct / recent.length) * 100) : null,
    completedSessions: (state.sessions || []).length,
    learningStatus: countBy("learningStatus", "unseen"),
    testStatus: countBy("testStatus", "untested"),
    masteryStatus: countBy("masteryStatus", "notStable"),
    skillCoverage: stats.reduce((result, stat) => {
      Object.keys(stat.skills || {}).forEach((skill) => {
        result[skill] = (result[skill] || 0) + 1;
      });
      return result;
    }, {})
  };
}

function buildDailyCompletionReports(limit = 7) {
  const dates = new Set([formatLocalDate(new Date())]);
  (state.records || []).forEach((record) => addLocalDate(dates, record.at));
  (state.sessionSummaries || []).forEach((summary) => addLocalDate(dates, summary.at));
  Object.values(state.learnedItems || {}).forEach((item) => addLocalDate(dates, item.learnedAt));
  (state.mistakes || []).forEach((mistake) => addLocalDate(dates, mistake.lastWrongAt || mistake.updatedAt));
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map(buildDailyCompletionReport);
}

function buildDailyCompletionReport(date) {
  const records = (state.records || []).filter((record) => isSameLocalDate(record.at, date));
  const sessions = (state.sessionSummaries || []).filter((summary) => isSameLocalDate(summary.at, date));
  const learnedCount = Object.values(state.learnedItems || {}).filter((item) => isSameLocalDate(item.learnedAt, date)).length;
  const mistakes = (state.mistakes || []).filter((mistake) => isSameLocalDate(mistake.lastWrongAt || mistake.updatedAt, date));
  const modes = new Set([...records.map((record) => record.mode), ...sessions.map((summary) => summary.mode)]);
  const answerRecords = records.filter((record) => typeof record.correct === "boolean" && record.mode !== "speaking");
  const wrongCount = answerRecords.filter((record) => !record.correct).length;
  const errorRate = answerRecords.length ? Math.round((wrongCount / answerRecords.length) * 100) : 0;
  const steps = [
    { label: "旧知复习", done: modes.has("warmup") },
    { label: "五上新学", done: learnedCount > 0 || modes.has("lesson") || modes.has("preview-practice") || modes.has("preview-quiz") },
    { label: "轻练习", done: modes.has("preview-practice") },
    { label: "小测收尾", done: modes.has("preview-quiz") || modes.has("daily") },
    { label: "小漏洞记录", done: answerRecords.length > 0 || mistakes.length > 0 }
  ];
  const completedSteps = steps.filter((step) => step.done).length;
  const started = records.length > 0 || sessions.length > 0 || learnedCount > 0 || mistakes.length > 0;
  const complete = completedSteps === steps.length;
  const quality = qualityFromErrorRate(answerRecords.length, errorRate);
  return {
    date,
    records,
    sessions,
    answerCount: answerRecords.length,
    wrongCount,
    errorRate,
    learnedCount,
    completedSteps,
    totalSteps: steps.length,
    started,
    complete,
    statusLabel: complete ? "全部完成" : started ? `未完成 ${completedSteps}/${steps.length}` : "未开始",
    stepText: steps.map((step) => `${step.label}${step.done ? "已完成" : "未完成"}`).join(" / "),
    modeText: buildDailyModeText(modes, learnedCount, records),
    qualityLabel: quality.label,
    qualityDetail: quality.detail
  };
}

function addLocalDate(dateSet, value) {
  if (!value) return;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) dateSet.add(formatLocalDate(date));
}

function isSameLocalDate(value, expectedDate) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && formatLocalDate(date) === expectedDate;
}

function qualityFromErrorRate(answerCount, errorRate) {
  if (!answerCount) return { label: "暂无答题", detail: "今天还没有正式答题记录" };
  if (errorRate === 0) return { label: "稳定", detail: "正式答题暂未出错" };
  if (errorRate <= 15) return { label: "基本稳定", detail: "少量小点进入后续复现" };
  if (errorRate <= 35) return { label: "有小漏洞", detail: "需要安排滚动复习" };
  return { label: "需复盘", detail: "错误率偏高，下一包需降低新学量" };
}

function buildDailyModeText(modes, learnedCount, records) {
  const labels = [...modes].filter(Boolean).map(modeTitle);
  if (learnedCount) labels.push(`新学 ${learnedCount} 项`);
  if (records.some((record) => record.mode === "speaking")) labels.push("口语跟读");
  return uniqueValues(labels).join(" / ") || "暂无学习记录";
}

function exportRangeLabel() {
  if (!state.lastLogExportAt) return "首次导出：包含全部本机记录";
  const date = new Date(state.lastLogExportAt);
  if (Number.isNaN(date.getTime())) return "上次导出时间异常，按全部记录导出";
  return `上次导出后：${formatLocalDate(date)} ${formatLocalTimeCompact(date)}`;
}

function inferReason(question) {
  if (question.type === "listen-choice" || question.title?.includes("听")) return "听不出来";
  if (question.type === "meaning-choice") return "认不准";
  return "拼不出来";
}

function exportRecords(options = {}) {
  const exportedAt = new Date();
  const exportDate = formatLocalDate(exportedAt);
  const exportRecords = getTodayRecords(exportDate);
  const roundRecords = getTodayRoundRecords(exportDate);
  if (!exportRecords.length && !roundRecords.length) {
    showToast("暂无新学习记录可导出");
    return;
  }
  const payload = buildLearningLogV2(exportedAt, exportDate, exportRecords, roundRecords);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `xiaobao-english-log-${state.testMode ? "test-" : ""}${exportDate}-${formatLocalTimeCompact(exportedAt)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.lastLogExportAt = exportedAt.toISOString();
  saveState();
  showToast("学习日志已导出");
  if (state.activeRoute === "parent") renderParent();
}

function getTodayRecords(exportDate) {
  return (state.records || []).filter((record) => isSameLocalDate(record.at || record.answeredAt, exportDate));
}

function getTodayRoundRecords(exportDate) {
  return (state.roundRecords || []).filter((record) =>
    isSameLocalDate(record.roundStartedAt || record.lastSavedAt || record.roundEndedAt, exportDate)
  );
}

function buildLearningLogV2(exportedAt, exportDate, records, roundRecords) {
  const reviewRecords = records.filter((record) => record.mode === "warmup");
  const effectiveReviewRecords = reviewRecords.filter((record) => (record.result || "") !== "skipped");
  const normalizedRoundRecords = roundRecords.map((record) => ({
    roundId: record.roundId || "",
    roundNo: record.roundNo || 0,
    roundStartedAt: record.roundStartedAt || "",
    roundEndedAt: record.roundEndedAt || "",
    roundStatus: record.roundStatus || "completed",
    activeTimeMs: record.activeTimeMs || 0,
    pauseCount: record.pauseCount || 0,
    pauseDurationMs: record.pauseDurationMs || 0,
    answeredCount: record.answeredCount || 0,
    remainingCount: record.remainingCount || 0,
    resumeAvailable: Boolean(record.resumeAvailable),
    lastSavedAt: record.lastSavedAt || "",
    interruptedAt: record.interruptedAt || null
  }));
  return {
    kind: "xiaobao-english-learning-log",
    schemaVersion: "2.0.0",
    fieldVersion: "learning-log-v2",
    planId: getCurrentPlanId(exportDate),
    sessionDate: exportDate,
    studentId: state.studentName || "xiaobao",
    studentName: state.studentName || "小宝",
    exportKind: state.testMode ? "test" : "formal",
    timeZone: "Asia/Shanghai",
    exportedAt: toShanghaiIso(exportedAt),
    totalReviewRounds: normalizedRoundRecords.length,
    totalReviewQuestions: effectiveReviewRecords.length,
    totalReviewAnswered: reviewRecords.length,
    hasPreview5A: records.some((record) => String(record.mode || "").startsWith("fiveA") || String(record.mode || "").includes("preview")),
    app: {
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      platform: "web/pwa/tablet",
      testMode: Boolean(state.testMode)
    },
    learningPackage: {
      packageId: data.id || getPackageVersion(data),
      packageVersion: getPackageVersion(data),
      contentHash: state.contentHash || data.contentHash || ""
    },
    roundRecords: normalizedRoundRecords,
    records: records.map(recordToLearningLogV2),
    mistakes: buildFeishuMistakes(
      records[0]?.at || exportedAt,
      records[records.length - 1]?.at || exportedAt
    ),
    updateLog: state.updateLog || []
  };
}

function getCurrentPlanId(exportDate) {
  return (
    data.studyPackage?.current?.planId ||
    data.generatedBy?.planId ||
    data.studyPackage?.totalLibraryTasks?.oldKnowledgeReview?.coverageLedgerTemplate?.planId ||
    `xiaobao-english-plan-${exportDate}`
  );
}

function recordToLearningLogV2(record, index) {
  const result = record.result || (record.correct === true ? "correct" : record.correct === false ? "wrong" : "skipped");
  return {
    recordId: record.id || `record-${index + 1}`,
    questionId: record.questionId || "",
    itemId: record.itemId || "",
    testKey: record.testKey || "",
    itemKind: record.itemKind || "",
    bookId: record.bookId || inferBookId(record),
    scopeId: record.scopeId || "",
    unitId: record.unitId || inferUnitId(record.itemId),
    questionType: record.questionType || mapQuestionType(record),
    abilityFace: record.abilityFace || record.practiceFace || mapSkill(record.skill),
    result,
    correct: record.correct === true,
    timeSpentMs: record.timeSpentMs || Math.round((record.durationSeconds || 0) * 1000),
    answeredAt: toShanghaiIso(new Date(record.answeredAt || record.at || Date.now())),
    wrongReason: record.wrongReason || (result === "wrong" ? mapWrongReason(inferRecordWrongReason(record)) : ""),
    roundId: record.roundId || "",
    roundNo: record.roundNo || null,
    helpUsed: Boolean(record.helpUsed),
    enteredWeaknessPool: Boolean(record.enteredWeaknessPool),
    exportKind: record.exportKind || (state.testMode ? "test" : "formal")
  };
}

function buildFeishuLearningLog(exportedAt, exportDate, records, previousExportedAt) {
  const session = buildExportSession(records, exportedAt);
  const exportRange = buildExportRange(records, exportedAt, previousExportedAt);
  return {
    kind: "xiaobao-english-learning-log",
    schemaVersion: "1.0.0",
    fieldVersion: "feishu-log-v1",
    studentId: "xiaobao",
    logDate: exportDate,
    timeZone: "Asia/Shanghai",
    exportedAt: toShanghaiIso(exportedAt),
    exportKind: exportRange.isCatchUp ? "catch_up" : "normal",
    source: "app_export",
    exportRange,
    app: {
      appVersion: APP_VERSION,
      buildId: APP_BUILD_ID,
      platform: "web/pwa/tablet"
    },
    learningPackage: {
      packageId: data.id || `xiaobao-english-learning-pack-${exportDate}`,
      packageVersion: getPackageVersion(data),
      contentHash: state.contentHash || data.contentHash || "",
      planId: data.generatedBy?.planId || data.studyPackage?.current?.planId || `global-learning-plan-${exportDate}`
    },
    session,
    events: records.map(recordToFeishuEvent),
    learningGates: buildLearningGateExport(),
    itemStats: buildFeishuItemStats(),
    mistakes: buildFeishuMistakes(exportRange.startedAt, exportRange.endedAt),
    updateLog: state.updateLog || [],
    summary: buildExportSummary(records),
    feishuMessageText: buildFeishuMessageText(exportDate, session)
  };
}

function getRecordsSinceLastExport(previousExportedAt) {
  if (!previousExportedAt) return [...(state.records || [])];
  const boundary = new Date(previousExportedAt).getTime();
  return (state.records || []).filter((record) => {
    const at = new Date(record.at || 0).getTime();
    return Number.isFinite(at) && at > boundary;
  });
}

function buildExportRange(records, exportedAt, previousExportedAt) {
  const dates = records.map((record) => new Date(record.at)).filter((date) => !Number.isNaN(date.getTime()));
  const startedAt = previousExportedAt
    ? new Date(previousExportedAt)
    : dates.length
      ? new Date(Math.min(...dates.map((date) => date.getTime())))
      : exportedAt;
  const coveredDates = [...new Set(dates.map(formatLocalDate))].sort();
  const isCatchUp = Boolean(previousExportedAt && formatLocalDate(new Date(previousExportedAt)) !== formatLocalDate(exportedAt)) || coveredDates.length > 1;
  return {
    previousExportedAt: previousExportedAt ? toShanghaiIso(new Date(previousExportedAt)) : "",
    startedAt: toShanghaiIso(startedAt),
    endedAt: toShanghaiIso(exportedAt),
    coveredDates: coveredDates.length ? coveredDates : [formatLocalDate(exportedAt)],
    recordCount: records.length,
    isCatchUp
  };
}

function buildExportSession(records, exportedAt) {
  const times = records.map((record) => new Date(record.at)).filter((date) => !Number.isNaN(date.getTime()));
  const startedAt = times.length ? new Date(Math.min(...times.map((date) => date.getTime()))) : exportedAt;
  const endedAt = exportedAt;
  return {
    sessionId: `session-${formatLocalDate(startedAt)}-${formatLocalTimeCompact(startedAt)}`,
    startedAt: toShanghaiIso(startedAt),
    endedAt: toShanghaiIso(endedAt),
    durationSeconds: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
    finishedEarly: true,
    completed: true
  };
}

function recordToFeishuEvent(record, index) {
  const stat = findStatByRecord(record);
  const mode = mapFeishuMode(record.mode);
  const result = record.mode === "lesson" ? "learned" : record.correct === true ? "correct" : record.correct === false ? "wrong" : "learned";
  return {
    eventId: record.id || `event-${index + 1}`,
    timestamp: toShanghaiIso(new Date(record.at || Date.now())),
    itemId: record.itemId || "",
    bookId: inferBookId(record),
    unitId: record.unitId || inferUnitId(record.itemId),
    scopeId: record.scopeId || "",
    scopeType: record.scopeType || "",
    sourceMode: record.sourceMode || record.mode || "",
    mode,
    questionType: mapQuestionType(record),
    skill: mapSkill(record.skill),
    result,
    attempts: 1,
    durationSeconds: record.durationSeconds || 0,
    wrongReason: result === "wrong" ? mapWrongReason(record.wrongReason || inferRecordWrongReason(record)) : "",
    isNewLearning: Boolean(record.learningStatus === "newLearned" || state.learnedItems?.[record.itemId]),
    isReview: ["review", "warmup", "review-total", "self-review", "scope-review"].includes(record.mode),
    isWeaknessReturn: ["mistakes", "weakness"].includes(record.mode),
    chunkId: record.chunkId || "",
    masteryStatus: record.masteryStatus || stat?.masteryStatus || "",
    testStatus: record.testStatus || stat?.testStatus || ""
  };
}

function buildLearningGateExport() {
  return Object.values(state.learnedItems || {}).reduce((result, item) => {
    result[item.itemId] = {
      itemId: item.itemId,
      learningGate: {
        standardAudioListened: true,
        meaningViewed: true,
        contextViewed: true,
        readOrRepeatDone: true,
        lightPracticeDone: Boolean(item.lastPracticedAt || item.testStatus),
        completedAt: item.learnedAt || item.lastPracticedAt || null
      }
    };
    return result;
  }, {});
}

function buildFeishuItemStats() {
  return Object.values(state.itemStats || {}).reduce((result, stat) => {
    result[stat.itemId] = {
      itemId: stat.itemId,
      attempts: stat.attempts || 0,
      correct: stat.correct || 0,
      wrong: Math.max(0, (stat.attempts || 0) - (stat.correct || 0)),
      streak: stat.streak || 0,
      lastSeenAt: stat.lastPracticedAt || stat.updatedAt || null,
      skills: Object.fromEntries(
        Object.entries(stat.skills || {}).map(([skill, value]) => [
          mapSkill(skill),
          {
            attempts: value.attempts || 0,
            correct: value.correct || 0,
            streak: value.streak || 0
          }
        ])
      )
    };
    return result;
  }, {});
}

function buildFeishuMistakes(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return (state.mistakes || [])
    .filter((mistake) => {
      const at = new Date(mistake.lastWrongAt || mistake.updatedAt || Date.now()).getTime();
      return !Number.isFinite(start) || (at >= start && at <= end);
    })
    .map((mistake) => ({
      mistakeId: mistake.id,
      itemId: mistake.itemId || "",
      bookId: mistake.bookId || inferBookId(mistake),
      unitId: mistake.unitId || inferUnitId(mistake.itemId),
      scopeId: mistake.scopeId || "",
      scopeType: mistake.scopeType || "",
      sourceMode: mistake.sourceMode || "",
      timestamp: toShanghaiIso(new Date(mistake.lastWrongAt || mistake.updatedAt || Date.now())),
      questionType: mapQuestionType(mistake),
      skill: mapSkill(mistake.skill),
      wrongReason: mapWrongReason(mistake.reason),
      attempts: mistake.times || 1,
      status: mistake.status || "active"
    }));
}

function buildFeishuMessageText(exportDate, session) {
  const minutes = Math.round((session.durationSeconds || 0) / 60);
  return [
    "【小宝英语学习日志】",
    `日期：${exportDate}`,
    `计划ID：${data.generatedBy?.planId || data.studyPackage?.current?.planId || `global-learning-plan-${exportDate}`}`,
    `学习包：${data.id || ""}`,
    `学习时长：${minutes}分钟`,
    `是否提前完成：${session.finishedEarly ? "是" : "否"}`,
    `日志文件：xiaobao-english-log-${exportDate}-${formatLocalTimeCompact(new Date(session.endedAt))}.json`,
    "",
    "完整学习记录见 JSON 附件。"
  ].join("\n");
}

function findStatByRecord(record) {
  return state.itemStats?.[getStatKey(record.itemId, record.itemKind)] || Object.values(state.itemStats || {}).find((stat) => stat.itemId === record.itemId);
}

async function importPackage(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    state.importedPackages.push({
      id: imported.id || file.name,
      title: imported.title || file.name,
      version: imported.version || "unknown",
      importedAt: new Date().toISOString()
    });
    saveState();
    renderAll();
    showToast("学习包记录已导入");
  } catch {
    showToast("学习包格式不对");
  }
}

async function clearAppCache() {
  if (!confirm("清理缓存不会删除学习记录。会移除旧离线页面并重新打开 APP，确定继续？")) return;
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  showToast("缓存已清理，正在重新打开");
  setTimeout(() => window.location.replace(`./?cache-cleared=${Date.now()}`), 500);
}

function resetTestRecords() {
  const confirmed = confirm(
    "确定清空测试记录并重新开始吗？\n\n会清空本机学习记录、错题、小漏洞、进度和导出状态，用于重新开始测试。\n\n不会清空当前学习包、APP 设置、英音设置和孩子姓名。"
  );
  if (!confirmed) return;

  const keptFields = {
    activeRoute: state.activeRoute,
    packageVersion: state.packageVersion,
    learningPackageVersion: state.learningPackageVersion,
    contentHash: state.contentHash,
    cachedLearningPackage: state.cachedLearningPackage,
    updateLog: state.updateLog,
    studentName: state.studentName,
    importedPackages: state.importedPackages,
    settings: state.settings
  };
  const resetAt = new Date().toISOString();
  const resetLog = [
    ...(state.resetLog || []),
    {
      resetAt,
      resetKind: "test_records_reset",
      clearedFields: [
        "records",
        "mistakes",
        "itemStats",
        "sessionSummaries",
        "learnedItems",
        "lessonProgress",
        "unitProgress",
        "completed",
        "streak",
        "lastLogExportAt",
        "nextTaskCursor",
        "fiveAStage",
        "previewItemStatus",
        "lightWeakFaces"
      ],
      keptFields: ["currentLearningPackage", "appSettings", "speechSettings", "studentName", "cachedLearningPackageResources"],
      operator: "parent"
    }
  ].slice(-20);

  state = {
    ...defaultState,
    ...keptFields,
    activeRoute: "home",
    resetLog
  };
  currentPractice = null;
  currentLesson = null;
  saveState();
  renderAll();
  navigate("home");
  showToast("测试记录已清空，可以重新开始");
}

function setupSpeechVoices() {
  if (!("speechSynthesis" in window)) return;
  const refresh = () => {
    availableVoices = window.speechSynthesis.getVoices();
    if (!state.settings.speechVoiceURI) {
      const preferred = pickEnglishVoice();
      if (preferred?.voiceURI) {
        state.settings.speechVoiceURI = preferred.voiceURI;
        saveState();
      }
    }
    if (state.activeRoute === "parent") renderParent();
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
  window.speechSynthesis.onvoiceschanged = refresh;
}

function pickEnglishVoice() {
  if (!availableVoices.length || !state?.settings) return null;
  const saved = availableVoices.find((voice) => voice.voiceURI === state.settings.speechVoiceURI);
  const hasBritishVoice = availableVoices.some((voice) => voice.lang?.toLowerCase().startsWith("en-gb"));
  if (saved && (saved.lang?.toLowerCase().startsWith("en-gb") || !hasBritishVoice)) return saved;

  const lower = (voice) => `${voice.name} ${voice.lang}`.toLowerCase();
  return (
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb") && FEMALE_BRITISH_VOICES.test(lower(voice))) ||
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb") && !MALE_VOICES.test(lower(voice))) ||
    availableVoices.find((voice) => FEMALE_BRITISH_VOICES.test(lower(voice))) ||
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb")) ||
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-")) ||
    null
  );
}

function voiceOptions() {
  const englishVoices = availableVoices.filter((voice) => voice.lang?.toLowerCase().startsWith("en"));
  const options = [`<option value="">自动选择英音</option>`].concat(
    englishVoices.map((voice) => {
      const selected = voice.voiceURI === state.settings.speechVoiceURI ? "selected" : "";
      const gb = voice.lang?.toLowerCase().startsWith("en-gb") ? " · 英音" : "";
      return `<option value="${escapeAttr(voice.voiceURI)}" ${selected}>${voice.name} (${voice.lang})${gb}</option>`;
    })
  );
  return options.join("");
}

function speak(text, options = {}) {
  speakLikeTeacher(text, { repeat: 1, ...options });
}

function getNormalSpeechRate(value = state.settings.speechRate) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SPEECH_RATE;
  return Math.min(NORMAL_SPEECH_MAX_RATE, Math.max(NORMAL_SPEECH_MIN_RATE, numeric));
}

function getSlowSpeechRate(value = getNormalSpeechRate()) {
  const baseRate = getNormalSpeechRate(value);
  return Math.min(SLOW_SPEECH_MAX_RATE, Math.max(SLOW_SPEECH_MIN_RATE, baseRate * SLOW_SPEECH_FACTOR));
}

function getPlaybackSpeechRate(value = state.settings.speechRate) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SPEECH_RATE;
  return Math.min(1, Math.max(SLOW_SPEECH_MIN_RATE, numeric));
}

async function ensureSpeechReady() {
  if (!("speechSynthesis" in window)) {
    showToast("当前浏览器没有系统朗读");
    return false;
  }
  window.speechSynthesis.resume?.();
  availableVoices = window.speechSynthesis.getVoices();
  for (let index = 0; index < 6 && !availableVoices.length; index += 1) {
    await sleep(120);
    availableVoices = window.speechSynthesis.getVoices();
  }
  return true;
}

async function speakText(text, options = {}) {
  const ready = await ensureSpeechReady();
  if (!ready) return;

  const sequenceId = options.sequenceId || playbackSequenceId;
  if (sequenceId !== playbackSequenceId) return;
  const runId = ++speechRunId;
  if (!options.continueQueue) window.speechSynthesis.cancel();
  window.speechSynthesis.resume?.();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickEnglishVoice();
  utterance.lang = voice?.lang || "en-GB";
  utterance.voice = voice || null;
  utterance.rate = getPlaybackSpeechRate(options.rate ?? state.settings.speechRate ?? DEFAULT_SPEECH_RATE);
  utterance.pitch = options.pitch ?? 1.18;
  utterance.volume = options.volume ?? 0.96;
  return new Promise((resolve) => {
    let settled = false;
    let started = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(noStartTimer);
      clearTimeout(maxTimer);
      resolve();
    };
    const noStartTimer = setTimeout(() => {
      if (!started && runId === speechRunId) showToast("系统语音没有响应，请再点一次播放");
      finish();
    }, 5000);
    const maxTimer = setTimeout(finish, 15000);
    utterance.onstart = () => {
      started = true;
      if (runId === speechRunId) showToast(options.playingMessage || "正在播放标准音");
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (runId === speechRunId) showToast(`系统语音播放没有成功：${event.error || "请重试"}`);
      finish();
    };
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume?.();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function speakLikeTeacher(text, options = {}) {
  stopAudioPlayback();
  const sequenceId = playbackSequenceId;
  const rate =
    options.rate === undefined
      ? getNormalSpeechRate(state.settings.speechRate ?? DEFAULT_SPEECH_RATE)
      : getPlaybackSpeechRate(options.rate);
  const repeat = options.repeat ?? 1;
  if (!options.silentToast) showToast("正在准备播放...");
  const parts = splitSpeechText(text);
  for (let round = 0; round < repeat; round += 1) {
    for (let index = 0; index < parts.length; index += 1) {
      if (sequenceId !== playbackSequenceId) return;
      await speakText(parts[index], {
        rate: round === 0 ? rate : getSlowSpeechRate(rate),
        sequenceId,
        continueQueue: round > 0 || index > 0
      });
      if (index < parts.length - 1) await sleep(280);
    }
    if (round < repeat - 1) await sleep(650);
  }
}

async function speakLessonList(texts) {
  showToast("英音领读：每项读两遍，中间留停顿");
  for (let index = 0; index < texts.length; index += 1) {
    if (!appViews.lesson.classList.contains("active")) return;
    await speakLikeTeacher(texts[index], { repeat: 2, silentToast: true });
    if (!appViews.lesson.classList.contains("active")) return;
    if (index < texts.length - 1) await sleep(2600);
  }
}

function splitSpeechText(text) {
  const value = String(text || "").trim();
  if (!value) return [""];
  if (value.includes("...")) return value.split(/\s*\.\.\.\s*/).filter(Boolean);
  if (value.length > 26) return value.split(/(?<=[.!?])\s+|,\s+/).filter(Boolean);
  return [value];
}

function stopAudioPlayback() {
  playbackSequenceId += 1;
  speechRunId += 1;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

async function withPlaybackButton(button, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "播放中...";
  try {
    await action();
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function withPlaybackLabel(button, label, action) {
  const indicator = label || button;
  const originalText = indicator.textContent;
  button.disabled = true;
  button.classList.add("is-playing");
  indicator.textContent = "播放中";
  try {
    await action();
  } finally {
    button.disabled = false;
    button.classList.remove("is-playing");
    indicator.textContent = originalText;
  }
}

function taskItem(index, title, meta, time) {
  return `
    <div class="task-item">
      <span class="task-index">${index}</span>
      <span><strong>${title}</strong><br><span class="muted">${meta}</span></span>
      <span class="task-time">${time}</span>
    </div>
  `;
}

function statCard(label, value, meta) {
  return `
    <div class="card stat-card">
      <span class="muted">${label}</span>
      <strong class="stat-value">${value}</strong>
      <span class="muted">${meta}</span>
    </div>
  `;
}

function pathCard(title, meta, action) {
  return `
    <button class="card subject-tile" data-start="${action}">
      <span class="badge">${title}</span>
      <p class="muted">${meta}</p>
    </button>
  `;
}

function testRow(title, meta, mode) {
  return `
    <div class="unit-row">
      <div>
        <strong>${title}</strong>
        <p class="muted" style="margin-bottom:0">${meta}</p>
      </div>
      <button class="secondary-button" data-start="${mode}">开始</button>
    </div>
  `;
}

function unitRow(unit) {
  const chunks = getLearningChunks(unit);
  const progress = getLessonProgress(unit.id);
  const current = chunks[Math.min(progress.chunkIndex || 0, chunks.length - 1)];
  return `
    <div class="unit-row">
      <div>
        <strong>${unit.title}</strong>
        <p class="muted" style="margin-bottom:8px">${current ? `当前小课：${current.title}` : unit.focus.join(" / ")}</p>
        <div class="chip-row">${(current?.words || unit.words).slice(0, 5).map((word) => `<span class="chip">${word.en}</span>`).join("")}</div>
      </div>
      <button class="secondary-button" data-lesson="${unit.id}">开始学习</button>
    </div>
  `;
}

function trackCard(title, grade, meta, type) {
  return `
    <button class="card subject-tile" data-route-link="english">
      <span class="badge ${type === "preview" ? "blue" : ""}">${grade}</span>
      <div>
        <h3>${title}</h3>
        <p class="muted">${meta}</p>
      </div>
    </button>
  `;
}

function flowStep(index, title, meta) {
  return `
    <div class="flow-step">
      <span>${index}</span>
      <strong>${title}</strong>
      <small>${meta}</small>
    </div>
  `;
}

function reviewCatalogRow(item) {
  const ready = item.id === "G5A" || getVerifiedReviewUnits().some((unit) => unit.catalogId === item.id || unit.bookId === item.id);
  return `
    <div class="report-item">
      <span>
        <strong>${item.title}</strong>
        <br><span class="muted">${item.focus.join(" / ")}</span>
      </span>
      ${ready ? `<button class="secondary-button compact-button" data-review="${item.id}">开始复习</button>` : `<span class="badge amber">待开放</span>`}
    </div>
  `;
}

function reviewScopeRow(scope) {
  const ready = getVerifiedReviewUnits().some((unit) => unit.bookId === scope.bookId);
  return `
    <div class="report-item">
      <span>
        <strong>${scope.title}</strong>
        <br><span class="muted">${scope.itemCount || scope.itemIds?.length || 0} 个学习点</span>
      </span>
      <button class="secondary-button compact-button" data-scope="${scope.scopeId}" ${ready ? "" : "disabled"}>${ready ? "开始复习" : "待开放"}</button>
    </div>
  `;
}

function unitScopeRow(scope) {
  const unit = getUnitById(scope.unitId || scope.scopeId);
  const focus = unit?.focus?.slice(0, 3).join(" / ") || `${scope.itemCount || 0} 个学习点`;
  return `
    <div class="unit-row">
      <div>
        <strong>${scope.title}</strong>
        <p class="muted" style="margin-bottom:0">${focus}</p>
      </div>
      <button class="secondary-button compact-button" data-scope="${scope.scopeId}">开始学习</button>
    </div>
  `;
}

function freeReviewCard(item, ready) {
  return `
    <div class="card">
      <h3>${item.title}</h3>
      <p class="muted">${item.focus.join(" / ")}</p>
      <button class="secondary-button" data-review="${item.id}" ${ready ? "" : "disabled"}>${ready ? "开始复习" : "待开放"}</button>
    </div>
  `;
}

function mistakeItem(item) {
  const text = item.en || item.answer;
  const mastered = item.status === "mastered";
  const category = getMistakeCategory(item);
  return `
    <div class="mistake-item">
      <span>
        <strong>${text}</strong>
        <br><span class="muted">${item.zh || ""} · ${category.title} · ${item.reason} · 见过 ${item.times} 次 · 已稳 ${item.correctStreak || 0}/3</span>
      </span>
      <span class="badge ${mastered ? "" : "amber"}">${mastered ? "已稳定" : "后面再见"}</span>
    </div>
  `;
}

function mistakeCategoryCard(category) {
  return `
    <div class="mistake-category-card">
      <div>
        <span class="badge blue">${category.title}</span>
        <h3>${category.activeCount} 个待回收</h3>
        <p class="muted">${category.hint}</p>
        <p class="muted">最近错误率参考 ${category.recentErrorRate}% · 已清掉 ${category.masteredCount}</p>
      </div>
      <button class="secondary-button" data-mistake-category="${category.id}" ${category.activeCount ? "" : "disabled"}>开始回收</button>
    </div>
  `;
}

function reasonMeters() {
  const reasons = ["听不出来", "拼不出来", "认不准", "句型/语法用错", "粗心"];
  const total = Math.max(1, state.mistakes.length);
  return reasons
    .map((reason) => {
      const count = state.mistakes.filter((item) => item.reason === reason).length;
      return `
        <div style="margin-bottom:14px">
          <div class="metric-row" style="justify-content:space-between">
            <strong>${reason}</strong>
            <span class="muted">${count}</span>
          </div>
          <div class="meter"><span style="--value:${Math.round((count / total) * 100)}%"></span></div>
        </div>
      `;
    })
    .join("");
}

function reportItem(label, value, badgeClass, statusLabel) {
  const status = statusLabel || (badgeClass.includes("amber") ? "关注" : badgeClass.includes("blue") ? "记录" : "正常");
  return `
    <div class="report-item">
      <span><strong>${label}</strong><br><span class="muted">${value}</span></span>
      <span class="${badgeClass}">${status}</span>
    </div>
  `;
}

function reportActionItem(label, value, buttonText, action) {
  return `
    <div class="report-item">
      <span><strong>${label}</strong><br><span class="muted">${value}</span></span>
      <button class="secondary-button compact-button" data-action="${action}" type="button">${buttonText}</button>
    </div>
  `;
}

function dailyReportItem(report) {
  const badgeClass = report.complete ? "badge" : report.started ? "badge amber" : "badge red";
  return `
    <div class="report-item">
      <span>
        <strong>${report.date} · ${report.statusLabel}</strong>
        <br><span class="muted">${report.stepText}；${report.answerCount} 题，错 ${report.wrongCount}，错误率 ${report.errorRate}%；${report.modeText}</span>
      </span>
      <span class="${badgeClass}">${report.qualityLabel}</span>
    </div>
  `;
}

function standardItem(label, value, meta) {
  return `
    <div class="standard-item">
      <span class="muted">${label}</span>
      <strong>${value}</strong>
      <span class="muted">${meta}</span>
    </div>
  `;
}

function scoreBox(label, value) {
  return `<div class="score-box"><span class="muted">${label}</span><strong>${value}</strong></div>`;
}

function modeTitle(mode) {
  return {
    daily: "日测",
    weekly: "周测",
    unit: "单元测",
    mistakes: "小漏洞回收",
    "start-listening": "听力训练",
    "start-recognition": "认词训练",
    "start-spelling": "拼词训练",
    "start-sentence": "句型训练",
    "preview-practice": "预习轻练习",
    "preview-quiz": "小测收尾",
    "fiveA-preview-light": "五上预习轻测",
    "fiveA-preview-quiz": "五上预习小测",
    "fiveA-strength": "五上加强测试",
    "review-total": "总复习",
    "self-review": "范围复习",
    warmup: "旧知复习"
  }[mode] || "练习";
}

function questionTypeLabel(type) {
  return {
    "listen-choice": "听音选词",
    spell: "默写单词",
    "meaning-choice": "句义选择"
  }[type] || "练习";
}

function calcAccuracy() {
  const recent = state.records.filter((item) => item.mode !== "speaking").slice(-20);
  if (!recent.length) return 100;
  const correct = recent.filter((item) => item.correct).length;
  return Math.round((correct / recent.length) * 100);
}

function bindRouteLinks(root) {
  root.querySelectorAll("[data-route-link]").forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.routeLink));
  });
}

function updatePackageMeta() {
  const syncTitle = document.querySelector("#syncTitle");
  const syncMeta = document.querySelector("#syncMeta");
  if (!syncTitle || !syncMeta) return;
  syncTitle.textContent = "今日学习包";
  const statusLabel = materialStatusText();
  syncMeta.textContent = statusLabel;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const nextState = {
      ...defaultState,
      ...stored,
      learningPackageVersion: stored?.learningPackageVersion || "",
      contentHash: stored?.contentHash || "",
      cachedLearningPackage: stored?.cachedLearningPackage || null,
      updateLog: stored?.updateLog || [],
      lastLogExportAt: stored?.lastLogExportAt || "",
      studentName: stored?.studentName || "",
      resetLog: stored?.resetLog || [],
      settings: { ...defaultState.settings, ...(stored?.settings || {}) },
      unitProgress: { ...defaultState.unitProgress, ...(stored?.unitProgress || {}) },
      lessonProgress: { ...defaultState.lessonProgress, ...(stored?.lessonProgress || {}) },
      fiveAStage: stored?.fiveAStage || defaultState.fiveAStage,
      nextTaskCursor: { ...defaultState.nextTaskCursor, ...(stored?.nextTaskCursor || {}) },
      lastCompletedTaskId: stored?.lastCompletedTaskId || "",
      activeLearningPackageId: stored?.activeLearningPackageId || "",
      activeLearningPackageVersion: stored?.activeLearningPackageVersion || "",
      testMode: stored?.testMode !== false,
      testModeResetVersion: stored?.testModeResetVersion || "",
      roundRecords: stored?.roundRecords || [],
      currentReviewRound: stored?.currentReviewRound || null,
      reviewRoundCursor: stored?.reviewRoundCursor || 0,
      reviewResume: stored?.reviewResume || null,
      previewItemStatus: stored?.previewItemStatus || {},
      lightWeakFaces: stored?.lightWeakFaces || {},
      learnedItems: stored?.learnedItems || {},
      selectedReview: stored?.selectedReview || null,
      selectedScope: stored?.selectedScope || null,
      selectedMistakeCategory: stored?.selectedMistakeCategory || "all",
      selectedSpeakingScopeId: stored?.selectedSpeakingScopeId || "",
      itemStats: stored?.itemStats || {},
      sessionSummaries: stored?.sessionSummaries || []
    };
    if (nextState.settings.speechProfileVersion !== SPEECH_PROFILE_VERSION) {
      nextState.settings.speechRate = DEFAULT_SPEECH_RATE;
      nextState.settings.speechVoiceURI = "";
      nextState.settings.speechAccent = "en-GB";
      nextState.settings.speechProfileVersion = SPEECH_PROFILE_VERSION;
    }
    return nextState;
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  const persistedState = {
    ...state,
    cachedLearningPackage: null
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedState));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function uniqueValues(items) {
  return [...new Set(items.filter(Boolean))];
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalTimeCompact(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}${minutes}${seconds}`;
}

function toShanghaiIso(date) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  return `${local.toISOString().slice(0, 19)}+08:00`;
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 32);
}

function validateLatestManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return { ok: false, reason: "latest-learning-package.json 格式错误" };
  const normalized = normalizeLatestManifest(manifest);
  const required = ["schemaVersion", "learningPackageVersion", "contentHash", "packageUrl"];
  const missing = required.filter((key) => !normalized[key]);
  if (missing.length) return { ok: false, reason: `latest 缺少字段：${missing.join(", ")}`, normalized };
  const schema = String(normalized.schemaVersion);
  const supportedSchema = schema.startsWith("1.") || schema === "latest-learning-package-manifest-v1";
  if (!supportedSchema) return { ok: false, reason: `不支持的 schemaVersion：${schema}`, normalized };
  if (!isValidContentHash(normalized.contentHash)) return { ok: false, reason: "contentHash 格式错误", normalized };
  return { ok: true, normalized };
}

async function validateDownloadedPackage(packageData, manifest) {
  const baseValidation = validateLearningPackage(packageData);
  if (!baseValidation.ok) return baseValidation;
  const version = getPackageVersion(packageData);
  if (version !== manifest.learningPackageVersion) {
    return { ok: false, reason: `学习包版本不一致：${version || "空"} / ${manifest.learningPackageVersion}` };
  }
  const actualHash = await computeContentHash(packageData);
  if (!hashesEqual(actualHash, manifest.contentHash) && !hashesEqual(packageData.contentHash, manifest.contentHash)) {
    return { ok: false, reason: "contentHash 校验失败" };
  }
  return { ok: true };
}

function validateLearningPackage(packageData) {
  if (!packageData || typeof packageData !== "object") return { ok: false, reason: "学习包为空或格式错误" };
  const required = ["id", "version", "title", "packageKind", "status", "studyPackage", "units"];
  const missing = required.filter((key) => packageData[key] === undefined || packageData[key] === null || packageData[key] === "");
  if (missing.length) return { ok: false, reason: `学习包缺少字段：${missing.join(", ")}` };
  if (packageData.packageKind !== "tablet-learning-package") return { ok: false, reason: "学习包类型错误" };
  if (!Array.isArray(packageData.units)) return { ok: false, reason: "学习包 units 不是数组" };
  const schema = String(packageData.schemaVersion || "");
  const supportedSchema = !schema || schema.startsWith("1.") || schema === "xiaobao-learning-package-v1" || schema === "xiaobao-learning-package-v2";
  if (!supportedSchema) {
    return { ok: false, reason: `不支持的学习包 schemaVersion：${packageData.schemaVersion}` };
  }
  return { ok: true };
}

function getPackageVersion(packageData) {
  return packageData?.learningPackageVersion || packageData?.version || "";
}

function normalizeLatestManifest(manifest) {
  if (manifest?.package && typeof manifest.package === "object") {
    return {
      schemaVersion: manifest.schemaVersion,
      learningPackageVersion: manifest.package.version || manifest.package.id || "",
      contentHash: manifest.package.contentHash || "",
      packageUrl: manifest.package.file || manifest.package.activeFile || "",
      status: manifest.package.status || "",
      generatedAt: manifest.package.generatedAt || manifest.generatedAt || ""
    };
  }
  return {
    schemaVersion: manifest?.schemaVersion || "",
    learningPackageVersion: manifest?.learningPackageVersion || manifest?.version || "",
    contentHash: manifest?.contentHash || "",
    packageUrl: manifest?.packageUrl || manifest?.file || "",
    status: manifest?.status || "",
    generatedAt: manifest?.generatedAt || ""
  };
}

function normalizeContentHash(hash) {
  return String(hash || "").replace(/^sha256-/i, "").toLowerCase();
}

function isValidContentHash(hash) {
  return /^[a-f0-9]{64}$/i.test(normalizeContentHash(hash));
}

function hashesEqual(left, right) {
  const normalizedLeft = normalizeContentHash(left);
  const normalizedRight = normalizeContentHash(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

async function safeContentHash(packageData) {
  try {
    return await computeContentHash(packageData);
  } catch {
    return packageData?.contentHash || "";
  }
}

async function computeContentHash(packageData) {
  if (!globalThis.crypto?.subtle) throw new Error("当前浏览器不支持 hash 校验");
  const encoded = new TextEncoder().encode(stableStringify(withoutHashFields(packageData)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256-${hex}`;
}

function withoutHashFields(value) {
  if (Array.isArray(value)) return value.map(withoutHashFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "contentHash")
      .map(([key, item]) => [key, withoutHashFields(item)])
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function latestUpdateSucceeded() {
  const latest = state.updateLog?.[0];
  return !latest || latest.success;
}

function updateStatusText() {
  const latest = state.updateLog?.[0];
  if (!latest) return "启动时自动检查 latest-learning-package.json";
  const version = latest.onlineVersion ? `线上 ${latest.onlineVersion}` : "线上未取得";
  return `${version}；本地 ${latest.localVersion || "未知"}；${latest.success ? latest.reason : `未更新，${latest.reason}`}`;
}

function mapFeishuMode(mode) {
  if (["preview-practice", "start-listening", "start-recognition", "start-spelling", "start-sentence"].includes(mode)) return "practice";
  if (["preview-quiz", "daily", "weekly", "unit", "review-total"].includes(mode)) return "quiz";
  if (["warmup", "self-review", "scope-review"].includes(mode)) return "review";
  if (mode === "mistakes") return "weakness";
  if (mode === "speaking") return "practice";
  return mode || "practice";
}

function mapQuestionType(record) {
  const type = record.questionType || record.type;
  if (type === "listen-choice") return record.itemKind === "phrase" ? "listen_choose_word" : "listen_choose_word";
  if (type === "meaning-choice") return record.skill === "listen" ? "scene_match" : "en_choose_zh";
  if (type === "spell") return record.skill === "listen" ? "listen_spell" : "zh_prompt_spell";
  if (record.mode === "mistakes" || record.sourceMode === "mistakes") return "weakness_return";
  if (record.mode === "speaking") return "cross_day_review";
  return "mixed_quiz";
}

function mapSkill(skill) {
  return {
    listen: "listening",
    recognition: "recognition",
    spelling: "spelling",
    use: "use",
    understand: "meaning",
    read: "reading",
    speaking: "speaking",
    punctuation: "punctuation",
    context: "context"
  }[skill] || skill || "recognition";
}

function mapWrongReason(reason) {
  return {
    "不熟": "unfamiliar",
    "认不准": "confused",
    "拼不出来": "spelling",
    "听不出来": "listening",
    "标点错误": "punctuation",
    "粗心": "careless",
    "大小写错": "spelling",
    timeout: "timeout"
  }[reason] || "unknown";
}

function inferRecordWrongReason(record) {
  if (record.skill === "spelling") return "拼不出来";
  if (record.skill === "listen") return "听不出来";
  return "认不准";
}

function inferBookId(record) {
  return record.bookId || inferUnitId(record.itemId).split("-")[0] || "";
}

function inferUnitId(itemId = "") {
  const match = String(itemId).match(/^([A-Z0-9]+-U\d+)/i);
  return match ? match[1] : "";
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"’‘“”`´]/g, "")
    .replace(/[-—–_/\\]/g, " ")
    .replace(/[.,!?;:()[\]{}…·•]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeForAnswer(value, question = {}) {
  const expected = String(question.answer || "");
  const shouldKeepSymbols = question.type === "spell" && /['’‘`´＇.,，!?？！。-]/.test(expected);
  if (!shouldKeepSymbols) return normalize(value);
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`´＇]/g, "'")
    .replace(/[—–－]/g, "-")
    .replace(/，/g, ",")
    .replace(/。/g, ".")
    .replace(/？/g, "?")
    .replace(/！/g, "!")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ");
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function formatQuestionPromptHtml(value) {
  return escapeAttr(value).replace(/_{3,}/g, '<span class="inline-blank" aria-label="空格"></span>');
}
