const APP_VERSION = "0.7.0";
const APP_BASE_URL = new URL("../", import.meta.url);
const PACKAGE_URL = new URL("data/english-5a-demo.json", APP_BASE_URL).href;
const STORAGE_KEY = "smart-study-state-v1";

const routes = {
  home: { title: "小宝今天的英语课堂", eyebrow: "今日课堂" },
  english: { title: "英语学习路线", eyebrow: "先学会，再练稳" },
  mistakes: { title: "小漏洞回收站", eyebrow: "温和复习" },
  speaking: { title: "英音跟读", eyebrow: "听标准音，再开口" },
  parent: { title: "家长与 Mini", eyebrow: "备课、同步、核验" },
  lesson: { title: "五上预习课", eyebrow: "像学校一样先学后练" },
  practice: { title: "练习中", eyebrow: "轻练习" }
};

const defaultState = {
  activeRoute: "home",
  packageVersion: "0.7.0",
  completed: 0,
  streak: 0,
  records: [],
  mistakes: [],
  itemStats: {},
  sessionSummaries: [],
  importedPackages: [],
  unitProgress: {
    "5A-U1": "previewing"
  },
  settings: {
    grade: "五年级",
    term: "上册",
    mode: "daily",
    speechProvider: "demo",
    speechRate: 0.64,
    speechVoiceURI: "",
    speechAccent: "en-GB"
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

init();

async function init() {
  data = await fetch(PACKAGE_URL).then((response) => response.json());
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
}

function setupEvents() {
  navItems.forEach((item) => {
    item.addEventListener("click", () => navigate(item.dataset.route));
  });

  document.querySelector("#soundButton").addEventListener("click", () => {
    speakLikeTeacher("Good habits are important.");
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
}

function setupPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(new URL("sw.js", APP_BASE_URL), { scope: APP_BASE_URL.pathname })
      .catch(() => {
        showToast("离线缓存暂未启用");
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
}

function getVerifiedUnits() {
  return (data?.units || []).filter((unit) => unit.verified === true);
}

function getFirstVerifiedUnit() {
  return getVerifiedUnits()[0] || null;
}

function getVerifiedReviewUnits() {
  return (data?.reviewUnits || []).filter((unit) => unit.verified === true);
}

function getNextPreviewUnit() {
  return getVerifiedUnits().find((unit) => state.unitProgress[unit.id] !== "mastered") || null;
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
  const target = routes[route] ? route : "home";
  state.activeRoute = target;
  saveState();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });

  Object.values(appViews).forEach((view) => view.classList.remove("active"));
  appViews[target]?.classList.add("active");

  navItems.forEach((item) => item.classList.toggle("active", item.dataset.route === target));
  pageTitle.textContent = routes[target]?.title ?? "学习";
  eyebrow.textContent = routes[target]?.eyebrow ?? "智能学习助手";
}

function renderHome() {
  const weakCount = getActiveMistakes().length;
  const accuracy = calcAccuracy();
  const materialReady = isMaterialVerified();
  const previewUnit = getNextPreviewUnit();
  const hasPreview = Boolean(previewUnit) && materialReady;
  const mastery = previewUnit ? getUnitMastery(previewUnit) : getUnitMastery(getFirstVerifiedUnit());
  appViews.home.innerHTML = `
    <div class="hero-band">
      <section class="today-plan">
        <p class="eyebrow">Mini 今日下发计划</p>
        <h2>${hasPreview ? "先预习，再轻练，最后小测收尾" : "今天做一轮轻量总复习"}</h2>
        <p class="hero-copy">目标是每个核心点最终 100% 掌握。不会的先记下来，后面会换一种方式再见它。</p>
        <div class="task-list">
          ${
            hasPreview
              ? [
                  taskItem(1, "旧知热身", "三四年级滚动复习 + 小漏洞回收", "约 8 分钟"),
                  taskItem(2, "五上预习课", `${previewUnit.title} 先领读再理解`, "约 20 分钟"),
                  taskItem(3, "轻练习", "认词、听音、句型配对", "约 10 分钟"),
                  taskItem(4, "小测收尾", "核心基础目标 100%", "约 7 分钟")
                ].join("")
              : [
                  taskItem(1, "旧知滚动", "三四年级知识点错开覆盖", "约 6 分钟"),
                  taskItem(2, "小漏洞回收", weakCount ? `${weakCount} 个小点优先` : "薄弱点专项", "约 7 分钟"),
                  taskItem(3, "综合小测", "已学内容混合复测", "约 7 分钟")
                ].join("")
          }
        </div>
        <div class="button-row">
          <button class="primary-button" data-action="start-preview" ${materialReady ? "" : "disabled"}>${materialReady ? (hasPreview ? "开始预习课" : "开始总练习") : "资料校对中"}</button>
          <button class="secondary-button" data-action="start-daily" ${materialReady ? "" : "disabled"}>每日总练习</button>
          <button class="secondary-button" data-route-link="speaking">口语跟读</button>
        </div>
      </section>
      <section class="panel">
        <h2>今日状态</h2>
        <div class="grid two">
          ${statCard("完成", `${state.completed} 组`, "今日练习记录")}
          ${statCard("最近稳定度", `${accuracy}%`, "家长参考数据")}
          ${statCard("小漏洞", `${weakCount} 个`, "后面自动混入复习")}
          ${statCard("掌握进度", `${mastery.percent}%`, `${mastery.mastered}/${mastery.total} 个核心点`)}
        </div>
      </section>
    </div>
    <section class="panel classroom-flow">
      <h2>APP 学习流程</h2>
      <div class="flow-strip">
        ${flowStep(1, "预习课", "像上课一样先听、读、懂")}
        ${flowStep(2, "轻练习", "少量题确认刚学会")}
        ${flowStep(3, "小测", "核心内容目标 100%")}
        ${flowStep(4, "小漏洞回收", "答错不堵路，后面变式再练")}
        ${flowStep(5, "家长报告", "严格看数据，由 Mini 生成下一包")}
      </div>
      <p class="support-note">学习时间按题量估算：熟练时答完可直接下一题，不强制学满；有预习控制在约 45 分钟内，无预习控制在约 20 分钟内。</p>
    </section>
    <div class="grid three">
      <button class="card subject-tile primary" data-route-link="english">
        <span class="badge">重点</span>
        <div>
          <h3>英语</h3>
          <p class="muted">执行 Mini 下发的已核验学习包</p>
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
    <section class="panel" style="margin-top:16px">
      <h2>今日安排依据</h2>
      <div class="report-list">
        ${reportItem("学习包", materialReady ? "Mini 已生成当前可学包，仅开放已核验内容" : "Mini 资料校对中，学习入口已锁定", materialReady ? "badge" : "badge amber")}
        ${reportItem("优先级 1", weakCount ? `${weakCount} 个小漏洞会穿插复现` : "暂无高优先小漏洞", weakCount ? "badge amber" : "badge")}
        ${reportItem("优先级 2", `${mastery.pending} 个核心点未达 100% 掌握`, mastery.pending ? "badge amber" : "badge")}
        ${reportItem("推进规则", "Unit 核心词句全部 100% 掌握后，再进入下一单元", "badge blue")}
        ${reportItem("平板使用", "不需要每天连 Mini；有网时同步记录，Mini 再生成下一轮学习包", "badge blue")}
      </div>
    </section>
  `;

  appViews.home.querySelector("[data-action='start-preview']").addEventListener("click", () => {
    if (hasPreview) startLesson(previewUnit.id);
    else startPractice("daily");
  });
  appViews.home.querySelector("[data-action='start-daily']").addEventListener("click", () => {
    startPractice("daily");
  });
  bindRouteLinks(appViews.home);
}

function renderEnglish() {
  const materialReady = isMaterialVerified();
  const verifiedUnits = getVerifiedUnits();
  const reviewReady = getVerifiedReviewUnits().length > 0;
  const nextPreviewUnit = getNextPreviewUnit() || getFirstVerifiedUnit();
  appViews.english.innerHTML = `
    <div class="grid two" style="margin-bottom:16px">
      <section class="panel">
        <h2>三四年级总复习</h2>
        <p class="muted">Mini 保留完整课本库，核验通过后按“单词、句子、课文、专项”生成复习包，平板只展示可学内容。</p>
        <div class="report-list">
          ${data.reviewCatalog.map((item) => reviewCatalogRow(item)).join("")}
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="secondary-button" data-start="review-total" ${reviewReady ? "" : "disabled"}>${reviewReady ? "开始总复习" : "复习资料核对中"}</button>
          <button class="secondary-button" data-start="mistakes" ${materialReady ? "" : "disabled"}>小漏洞专项</button>
        </div>
      </section>
      <section class="panel">
        <h2>五上预习课堂</h2>
        <p class="muted">顺序按学校课堂来：课程导入、英音领读、词句理解、课文听读、轻练习、小测。</p>
        <div class="chip-row">
          ${data.learningTracks[1].sections.map((item) => `<span class="chip">${item}</span>`).join("")}
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="primary-button" data-lesson="${nextPreviewUnit?.id || ""}" ${nextPreviewUnit ? "" : "disabled"}>${nextPreviewUnit ? `开始 ${nextPreviewUnit.title.replace(/^Unit\\s+/i, "Unit ")} 预习课` : "预习包生成中"}</button>
          <button class="secondary-button" data-start="daily" ${materialReady ? "" : "disabled"}>每日总练习</button>
        </div>
      </section>
    </div>
    <div class="grid two">
      <section class="panel">
        <h2>学习路径</h2>
        <p class="muted">每个核心点都要听、认、拼、用全部过关；不会的不会卡住孩子，会被放进后面的滚动复习。</p>
        <div class="grid two">
          ${pathCard("先听", "听单词、短语、句子", "start-listening")}
          ${pathCard("再认", "听音选词、看中文选英文", "start-recognition")}
          ${pathCard("再拼", "补字母、完整拼写、听写", "start-spelling")}
          ${pathCard("再用", "核心句型、替换练习", "start-sentence")}
        </div>
      </section>
      <section class="panel">
        <h2>测试</h2>
        <div class="grid">
          ${testRow("日测", "小漏洞、到期复习、今日新学混合出现", "daily")}
          ${testRow("周测", "本周核心内容、小漏洞变式、旧知滚动", "weekly")}
          ${testRow("单元测", "词、句、课文理解、听力、拼写综合检查", "unit")}
        </div>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <h2>单元</h2>
      ${verifiedUnits.length ? verifiedUnits.map(unitRow).join("") : `<div class="card"><h3>资料校对中</h3><p class="muted">核验通过后才会开放单元练习。</p></div>`}
    </section>
  `;

  appViews.english.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
  appViews.english.querySelectorAll("[data-lesson]").forEach((button) => {
    button.addEventListener("click", () => startLesson(button.dataset.lesson));
  });
}

function renderMistakes() {
  const items = state.mistakes;
  const activeItems = getActiveMistakes();
  appViews.mistakes.innerHTML = `
    <div class="grid two">
      <section class="panel">
        <h2>小漏洞清单</h2>
        <p class="muted">这里不是惩罚区，只是把暂时没稳的内容收起来，后面换个方式再练。</p>
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
  appViews.mistakes.querySelector("[data-action='review-mistakes']").addEventListener("click", () => startPractice("mistakes"));
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
  const unit = getFirstVerifiedUnit();
  const speakingItems = unit ? [...unit.words.slice(0, 6), ...unit.sentences.slice(0, 3)] : [currentSpeakingItem];
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
        <h2>跟读清单</h2>
        <div class="mini-flow">
          ${flowStep(1, "听", "英音慢速两遍")}
          ${flowStep(2, "读", "孩子自己开口")}
          ${flowStep(3, "回放", "听自己哪里不同")}
          ${flowStep(4, "记录", "后续接云端评分")}
        </div>
        <div class="mistake-list">
          ${speakingItems
            .map(
              (item) => `
                <button class="mistake-item" data-speaking="${item.id}">
                  <span><strong>${item.en}</strong><br><span class="muted">${item.zh}</span></span>
                  <span class="badge blue">跟读</span>
                </button>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;

  appViews.speaking.querySelector("[data-action='play-reference']").addEventListener("click", () => speakLikeTeacher(currentSpeakingItem.en));
  appViews.speaking.querySelector("[data-action='record']").addEventListener("click", toggleRecording);
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
  appViews.parent.innerHTML = `
    <div class="grid two">
      <section class="panel">
        <h2>平板学习包</h2>
        <div class="report-list">
          ${reportItem("APP 版本", APP_VERSION, "badge")}
          ${reportItem("当前学习包", `${data.title} v${data.version}`, "badge blue")}
          ${reportItem("包类型", data.packageKind === "tablet-learning-package" ? "Mini 生成，平板执行" : "本地资料包", "badge blue")}
          ${reportItem("校验状态", isMaterialVerified() ? `${statusText}，只开放已核验内容` : "Mini 资料校对中，学习入口已锁定", isMaterialVerified() ? "badge" : "badge amber")}
          ${reportItem("缓存范围", (delivery.offlineCache || []).join(" / ") || "今日学习包", "badge")}
          ${reportItem("音频状态", "暂无官方音频，英音慢速领读兜底；正式启用前需逐条试听", "badge amber")}
          ${reportItem("朗读口音", "学校要求英音，默认 en-GB / Daniel 优先", "badge blue")}
          ${reportItem("发音评分", state.settings.speechProvider === "demo" ? "模拟接口，待接云服务" : "云服务已配置", "badge amber")}
          ${reportItem("平板运行", "iPad 不安装 Codex，只运行学习 APP；Codex/Mini 负责备课和生成包", "badge blue")}
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="secondary-button" data-action="export">导出学习记录</button>
          <label class="secondary-button file-label">
            导入学习包
            <input id="packageInput" type="file" accept="application/json" hidden />
          </label>
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
      <h2>Mini 与平板分工</h2>
      <div class="report-list">
        ${reportItem("Mini", delivery.miniRole || "资料中心、备课中心、计划中心", "badge blue")}
        ${reportItem("平板", delivery.tabletRole || "孩子学习端", "badge")}
        ${reportItem("完整资料库", data.generatedBy?.fullMaterialLibrary || "留在 Mini 端，不随平板全量下发", "badge blue")}
        ${reportItem("平板内容", data.generatedBy?.tabletPayload || "当前学习、近期复习、小漏洞回收所需内容", "badge")}
        ${reportItem("结果回传", delivery.resultReturn || "平板记录结果，联网后回传 Mini，再生成下一轮计划", "badge amber")}
        ${reportItem("日常连接", "孩子学习时不要求一直连 Mini；有网可同步，没同步也能先做本地包", "badge blue")}
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>当前计划包</h2>
      <div class="report-list">
        ${reportItem("范围", studyPackage.scope === "current-unit" ? "当前单元包" : studyPackage.scope || "今日学习包", "badge")}
        ${reportItem("当前内容", studyPackage.current?.unitId || "待生成", studyPackage.current?.unitId ? "badge blue" : "badge amber")}
        ${reportItem("目标时长", studyPackage.current?.targetMinutes ? `${studyPackage.current.targetMinutes} 分钟以内` : "按题量控制", "badge")}
        ${reportItem("时间规则", studyPackage.current?.timingRule || "按题量和预计耗时控制，熟练答完即可下一题，不强制学满。", "badge blue")}
        ${reportItem("下一包", studyPackage.nextGenerationRule || "学习结果回传后，由 Mini 生成下一轮学习包。", "badge amber")}
      </div>
    </section>
    <div class="grid two" style="margin-top:16px">
      <section class="panel">
        <h2>英音朗读设置</h2>
        <div class="setting-stack">
          <label class="setting-line">
            <span><strong>语速</strong><br><span class="muted">按老师音频：慢速、清楚、留停顿</span></span>
            <strong id="rateLabel">${state.settings.speechRate.toFixed(2)}x</strong>
          </label>
          <input id="speechRate" type="range" min="0.50" max="0.78" step="0.01" value="${state.settings.speechRate}" />
          <label class="setting-line">
            <span><strong>语音</strong><br><span class="muted">优先选择英国英语，平板可在这里切换</span></span>
          </label>
          <select id="speechVoice">${voiceOptions()}</select>
          <div class="button-row">
            <button class="secondary-button" data-action="test-voice">试听英音领读</button>
          </div>
        </div>
      </section>
      <section class="panel">
        <h2>掌握标准</h2>
        <div class="standards-grid">
          ${standardItem("核心单词", "100%", "会听、会认、会拼")}
          ${standardItem("核心短语", "100%", "能听懂、能识别")}
          ${standardItem("核心句型", "100%", "能听懂并会替换使用")}
          ${standardItem("单元综合", "100%", "日测 / 周测 / 单元测滚动达标")}
        </div>
        <p class="support-note">孩子端不显示压迫式结论；家长端严格按 100% 看未掌握点，并由 Mini 安排后续复现。</p>
      </section>
    </div>
    <section class="panel" style="margin-top:16px">
      <h2>Mini 端课本资料库</h2>
      <div class="report-list">
        ${[
          "26秋 五上.pdf",
          "英语_三年级_上册_译林出版社.pdf",
          "英语_三年级_下册_译林出版社.pdf",
          "英语_四年级_上册 译林版(1).pdf",
          "英语 四年级下册 译林版.pdf"
        ]
          .map((name) => reportItem(name, "留在 Mini 核验，不全量下发到平板", "badge"))
          .join("")}
      </div>
    </section>
    <section class="panel" style="margin-top:16px">
      <h2>生成与校验原则</h2>
      <div class="report-list">
        ${reportItem("资料来源", "Mini 端先核验课本完整资料库，再生成平板学习包", "badge blue")}
        ${reportItem("单词", "英文、中文释义必须能在课本 OCR/词汇表中定位", "badge blue")}
        ${reportItem("语句", "课文原句、目录句型或 Wrap-up 任务必须逐条核对", "badge blue")}
        ${reportItem("出题", "平板可按学习包自动出题；实时变式由 Mini/云端生成后下发", "badge blue")}
        ${reportItem("启用规则", "只开放 verified 内容；未核验资料不进入平板学习包", "badge amber")}
      </div>
    </section>
  `;

  appViews.parent.querySelector("[data-action='export']").addEventListener("click", exportRecords);
  appViews.parent.querySelector("[data-action='clear-cache']").addEventListener("click", clearAppCache);
  appViews.parent.querySelector("[data-action='add-manual-mistake']").addEventListener("click", addManualMistake);
  appViews.parent.querySelector("#packageInput").addEventListener("change", importPackage);
  appViews.parent.querySelector("#speechRate").addEventListener("input", (event) => {
    state.settings.speechRate = Number(event.target.value);
    appViews.parent.querySelector("#rateLabel").textContent = `${state.settings.speechRate.toFixed(2)}x`;
    saveState();
  });
  appViews.parent.querySelector("#speechVoice").addEventListener("change", (event) => {
    state.settings.speechVoiceURI = event.target.value;
    saveState();
    showToast("英音语音已更新");
  });
  appViews.parent.querySelector("[data-action='test-voice']").addEventListener("click", () => {
    speakLikeTeacher("Good habits are important.");
  });
}

function startLesson(unitId) {
  if (!isUnitVerified(unitId)) {
    showToast("这个单元还没核验完成，暂不进入学习");
    navigate("english");
    return;
  }
  currentLesson = {
    unitId,
    step: 0
  };
  navigate("lesson");
  renderLesson();
}

function renderLesson() {
  const unit = data.units.find((item) => item.id === currentLesson?.unitId) || data.units[0];
  const steps = buildLessonSteps(unit);
  const step = steps[currentLesson.step];
  const progress = Math.round(((currentLesson.step + 1) / steps.length) * 100);

  pageTitle.textContent = `${unit.title} 预习课`;
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
          <button class="primary-button" data-lesson-action="next">${currentLesson.step === steps.length - 1 ? "完成预习" : "下一步"}</button>
        </div>
      </section>
    </div>
  `;

  appViews.lesson.querySelector("[data-lesson-action='prev']").addEventListener("click", () => {
    currentLesson.step = Math.max(0, currentLesson.step - 1);
    renderLesson();
  });
  appViews.lesson.querySelector("[data-lesson-action='next']").addEventListener("click", () => {
    if (currentLesson.step >= steps.length - 1) {
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
      await withPlaybackButton(event.currentTarget, () => speakLikeTeacher(button.dataset.read));
    });
  });
  appViews.lesson.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => startPractice(button.dataset.start));
  });
}

function buildLessonSteps(unit) {
  const previewLesson = unit.previewLesson || {
    theme: unit.title,
    scene: "先熟悉本单元核心词句，再进入轻练习和小测。",
    teacherSteps: ["主题导入", "单词领读", "短语句型领读", "课文听读", "轻练习", "预习小测"]
  };
  const phrases = unit.phrases || [];
  const story = unit.story || unit.sentences || [];
  return [
    {
      kind: "intro",
      badge: "课程导入",
      title: previewLesson.theme,
      goal: "知道主题",
      body: `${previewLesson.scene} 这一页只帮孩子知道今天要学什么，不做题。`,
      items: [{ en: unit.title.replace(/^Unit\s+\d+\s+/i, ""), zh: previewLesson.theme }]
    },
    {
      kind: "words",
      badge: "英音领读",
      title: "先听清楚，再跟读单词",
      goal: "会听会读",
      body: "按英音慢速读两遍，换下一个词前留停顿。这里不计分，先把声音听准。",
      items: unit.words.slice(0, 8)
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
      items: unit.sentences
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
      body: "只测今天预习内容。基础题目标 100%，暂时没稳的点会进入后续滚动复习。",
      items: []
    }
  ];
}

function lessonStepTemplate(step) {
  if (["practice", "quiz"].includes(step.kind)) {
    return `
      <div>
        <span class="badge ${step.kind === "quiz" ? "amber" : "blue"}">${step.badge}</span>
        <h2 style="margin-top:12px">${step.title}</h2>
        <p class="question-zh">${step.body}</p>
        <div class="button-row" style="justify-content:center;margin-top:18px">
          <button class="primary-button" data-start="${step.kind === "quiz" ? "preview-quiz" : "preview-practice"}">
            ${step.kind === "quiz" ? "开始预习小测" : "开始轻练习"}
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
                <span class="badge">领读</span>
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

function startPractice(mode) {
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
  const pool = buildQuestionPool(mode);
  if (!pool.length) {
    showToast("这个环节的资料还不够，先做每日总练习");
    navigate("english");
    return;
  }
  currentPractice = {
    mode,
    index: 0,
    correct: 0,
    total: pool.length,
    questions: pool,
    results: []
  };
  renderPractice();
  navigate("practice");
  pageTitle.textContent = modeTitle(mode);
  eyebrow.textContent = "练习中";
}

function renderPractice() {
  const q = currentPractice.questions[currentPractice.index];
  const progress = Math.round((currentPractice.index / currentPractice.total) * 100);
  appViews.practice.innerHTML = `
    <div class="practice-stage">
      <section class="panel">
        <div class="metric-row">
          <span class="badge">${currentPractice.index + 1} / ${currentPractice.total}</span>
          <span class="badge blue">${q.badge || questionTypeLabel(q.type)}</span>
          <span class="badge amber">已稳 ${currentPractice.correct}</span>
        </div>
        <div class="meter" style="margin-top:12px"><span style="--value:${progress}%"></span></div>
      </section>
      ${questionTemplate(q)}
      <section class="panel">
        <div class="button-row">
          <button class="secondary-button" data-action="play-question">播放</button>
          <button class="secondary-button" data-action="play-slow">慢速播放</button>
          <button class="ghost-button" data-action="exit-practice">回到英语</button>
        </div>
      </section>
    </div>
  `;

  appViews.practice.querySelector("[data-action='play-question']").addEventListener("click", async (event) => {
    await withPlaybackButton(event.currentTarget, () => speakLikeTeacher(q.audioText));
  });
  appViews.practice.querySelector("[data-action='play-slow']").addEventListener("click", async (event) => {
    await withPlaybackButton(event.currentTarget, () => speakLikeTeacher(q.audioText, { rate: 0.5 }));
  });
  appViews.practice.querySelector("[data-action='exit-practice']").addEventListener("click", () => navigate("english"));
  appViews.practice.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => handleAnswer(button.dataset.answer, button));
  });
  const input = appViews.practice.querySelector("#spellAnswer");
  if (input) {
    input.focus();
    appViews.practice.querySelector("[data-action='submit-spell']").addEventListener("click", () => handleAnswer(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") handleAnswer(input.value);
    });
  }
}

function questionTemplate(q) {
  if (q.type === "listen-choice") {
    setTimeout(() => speakLikeTeacher(q.audioText), 250);
    return `
      <section class="question-card">
        <div>
          <span class="badge blue">${q.level || "听单词"}</span>
          <h2 style="margin-top:12px">${q.title || "听音选词"}</h2>
          <div class="choice-grid">
            ${q.choices.map((choice) => `<button class="choice-button" data-answer="${escapeAttr(choice)}">${choice}</button>`).join("")}
          </div>
        </div>
      </section>
    `;
  }

  if (q.type === "spell") {
    if (q.autoPlay) setTimeout(() => speakLikeTeacher(q.audioText), 250);
    return `
      <section class="question-card">
        <div>
          <span class="badge blue">${q.level || "拼写"}</span>
          <h2 style="margin-top:12px">${q.title || "看中文写英文"}</h2>
          <p class="question-zh">${q.prompt}</p>
          <input id="spellAnswer" class="text-input" autocomplete="off" autocapitalize="none" spellcheck="false" />
          <div class="button-row" style="justify-content:center;margin-top:14px">
            <button class="primary-button" data-action="submit-spell">提交</button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="question-card">
      <div>
        <span class="badge blue">${q.level || "理解"}</span>
        <h2 style="margin-top:12px">${q.title || "句义选择"}</h2>
        <div class="question-word">${q.prompt}</div>
        <div class="choice-grid">
          ${q.choices.map((choice) => `<button class="choice-button" data-answer="${escapeAttr(choice)}">${choice}</button>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function handleAnswer(answer, button) {
  const q = currentPractice.questions[currentPractice.index];
  const normalized = normalize(answer);
  const expected = normalize(q.answer);
  const ok = normalized === expected;

  if (button) button.classList.add(ok ? "correct" : "wrong");
  updateItemStats(q, ok);
  updateMistakeProgress(q, ok);
  if (ok) {
    currentPractice.correct += 1;
    showToast("很稳，继续");
  } else {
    addMistake(q, inferReason(q));
    showToast("先记下来，后面换个方式再见它");
  }

  state.records.push({
    id: `r-${Date.now()}`,
    mode: currentPractice.mode,
    question: q.prompt,
    answer,
    expected: q.answer,
    correct: ok,
    itemId: q.itemId,
    skill: q.skill,
    at: new Date().toISOString()
  });
  currentPractice.results.push({ question: q, correct: ok });
  saveState();

  setTimeout(() => {
    currentPractice.index += 1;
    if (currentPractice.index >= currentPractice.total) finishPractice();
    else renderPractice();
  }, 650);
}

function finishPractice() {
  const score = Math.round((currentPractice.correct / currentPractice.total) * 100);
  const sessionSummary = buildSessionSummary(currentPractice, score);
  state.completed += 1;
  state.streak = Math.max(1, state.streak + 1);
  state.sessionSummaries.push(sessionSummary);
  state.sessionSummaries = state.sessionSummaries.slice(-20);
  updateUnitProgressAfterPractice(currentPractice, score);
  saveState();
  renderAll();
  appViews.practice.innerHTML = `
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
          <button class="primary-button" data-route-link="home">回到今日</button>
          <button class="secondary-button" data-route-link="mistakes">看小漏洞</button>
        </div>
      </div>
    </section>
  `;
  bindRouteLinks(appViews.practice);
}

function buildQuestionPool(mode) {
  const unit = getCurrentStudyUnit();
  const words = unit.words;
  const sentences = unit.sentences;
  const phrases = unit.phrases || [];
  const mistakeQuestions = getActiveMistakes().slice(0, 4).map((item) => {
    const isListening = item.reason === "听不出来";
    return {
      type: "spell",
      title: isListening ? "听音默写" : "默写单词",
      badge: "小漏洞回收",
      level: isListening ? "听写" : "拼写",
      prompt: isListening ? "听录音，写出单词" : item.zh || item.prompt || "写出正确单词",
      answer: item.en || item.answer,
      audioText: item.en || item.answer,
      itemId: item.itemId || item.en || item.answer,
      itemKind: item.itemKind || "word",
      unitId: item.unitId || unit.id,
      skill: isListening ? "listen" : "spelling",
      autoPlay: isListening,
      source: item
    };
  });

  const generated = [
    listenQuestion(words[0], words, { unitId: unit.id, level: "听单词" }),
    listenQuestion(words[1], words, { unitId: unit.id, level: "听单词" }),
    spellQuestion(words[3], { unitId: unit.id, title: "看中文写英文", badge: "拼写" }),
    spellQuestion(words[7], { unitId: unit.id, title: "看中文写英文", badge: "拼写" }),
    meaningQuestion(sentences[0], sentences, { unitId: unit.id, title: "句义理解", badge: "句型" }),
    meaningQuestion(sentences[1], sentences, { unitId: unit.id, title: "句义理解", badge: "句型" })
  ];

  if (mode === "mistakes") return mistakeQuestions.length ? mistakeQuestions : generated.slice(0, 4);
  if (mode === "preview-practice") {
    return [
      listenQuestion(words[0], words, { unitId: unit.id, badge: "认词", level: "听单词" }),
      phraseChoiceQuestion(phrases[0], phrases, { unitId: unit.id }),
      sentenceListenQuestion(sentences[1], sentences, { unitId: unit.id }),
      spellQuestion(words[2], { unitId: unit.id, title: "看中文写英文", badge: "轻拼写" })
    ].filter(Boolean);
  }
  if (mode === "preview-quiz") {
    return [
      listenQuestion(words[1], words, { unitId: unit.id, badge: "预习小测", level: "听单词" }),
      phraseChoiceQuestion(phrases[2], phrases, { unitId: unit.id, badge: "预习小测" }),
      spellQuestion(words[3], { unitId: unit.id, title: "默写单词", badge: "预习小测" }),
      spellQuestion(words[7], { unitId: unit.id, title: "默写单词", badge: "预习小测" }),
      sentenceListenQuestion(sentences[0], sentences, { unitId: unit.id, badge: "预习小测" }),
      meaningQuestion(sentences[3], sentences, { unitId: unit.id, title: "句型理解", badge: "预习小测" })
    ].filter(Boolean);
  }
  if (mode === "start-listening") {
    return [
      listenQuestion(words[0], words, { unitId: unit.id, level: "听单词" }),
      phraseChoiceQuestion(phrases[0], phrases, { unitId: unit.id }),
      sentenceListenQuestion(sentences[2], sentences, { unitId: unit.id }),
      listenQuestion(words[8], words, { unitId: unit.id, level: "听单词" })
    ].filter(Boolean);
  }
  if (mode === "start-recognition") return [listenQuestion(words[2], words, { unitId: unit.id }), meaningQuestion(sentences[0], sentences, { unitId: unit.id }), phraseChoiceQuestion(phrases[1], phrases, { unitId: unit.id })].filter(Boolean);
  if (mode === "start-spelling") return [spellQuestion(words[3], { unitId: unit.id }), spellQuestion(words[6], { unitId: unit.id }), spellQuestion(words[9], { unitId: unit.id })].filter(Boolean);
  if (mode === "start-sentence") return sentences.map((sentence) => meaningQuestion(sentence, sentences, { unitId: unit.id }));
  if (mode === "review-total") return [listenQuestion(words[2], words, { unitId: unit.id }), spellQuestion(words[6], { unitId: unit.id }), spellQuestion(words[7], { unitId: unit.id }), meaningQuestion(sentences[2], sentences, { unitId: unit.id })].filter(Boolean);
  if (mode === "weekly") return [...mistakeQuestions, ...generated].slice(0, 8);
  if (mode === "unit") return [...generated, ...sentences.map((sentence) => meaningQuestion(sentence, sentences, { unitId: unit.id }))].slice(0, 10);
  return buildDailyQuestions(unit, mistakeQuestions);
}

function listenQuestion(word, words, overrides = {}) {
  if (!word) return null;
  return {
    type: "listen-choice",
    title: "听音选词",
    badge: "听音选词",
    level: "听单词",
    prompt: "听录音，选择听到的单词",
    answer: word.en,
    audioText: word.en,
    itemId: word.id,
    itemKind: "word",
    unitId: overrides.unitId || "5A-U1",
    skill: "listen",
    core: Boolean(word.core),
    choices: shuffle([word.en, ...words.filter((item) => item.id !== word.id).slice(0, 3).map((item) => item.en)]),
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
    choices: shuffle([sentence.zh, ...sentences.filter((item) => item.id !== sentence.id).slice(0, 2).map((item) => item.zh)]),
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
    choices: shuffle([phrase.en, ...phrases.filter((item) => item.id !== phrase.id).slice(0, 3).map((item) => item.en)]),
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
    choices: shuffle([sentence.zh, ...sentences.filter((item) => item.id !== sentence.id).slice(0, 2).map((item) => item.zh)]),
    ...overrides
  };
}

function getCurrentStudyUnit() {
  return getNextPreviewUnit() || getFirstVerifiedUnit();
}

function getActiveMistakes() {
  return state.mistakes
    .filter((item) => item.status !== "mastered")
    .sort((a, b) => (b.priority || 1) - (a.priority || 1) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

function buildDailyQuestions(unit, mistakeQuestions) {
  const words = unit.words;
  const sentences = unit.sentences;
  const phrases = unit.phrases || [];
  const dueQuestions = buildDueReviewQuestions(unit, 3);
  const foundationQuestions = [
    listenQuestion(words[0], words, { unitId: unit.id, badge: "核心复习" }),
    spellQuestion(words[6] || words[0], { unitId: unit.id, badge: "核心复习" }),
    sentenceListenQuestion(sentences[1] || sentences[0], sentences, { unitId: unit.id, badge: "句型复习" }),
    phraseChoiceQuestion(phrases[0], phrases, { unitId: unit.id, badge: "短语复习" }),
    meaningQuestion(sentences[2] || sentences[0], sentences, { unitId: unit.id, badge: "句型复习" })
  ].filter(Boolean);

  return uniqueQuestions([...mistakeQuestions.slice(0, 2), ...dueQuestions, ...foundationQuestions]).slice(0, 6);
}

function buildDueReviewQuestions(unit, limit) {
  const words = unit.words
    .map((word) => ({ item: word, score: getItemMasteryScore(word.id, "word") }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
  const questions = [];
  words.forEach(({ item }, index) => {
    if (index % 3 === 0) questions.push(listenQuestion(item, unit.words, { unitId: unit.id, badge: "到期复习" }));
    else if (index % 3 === 1) questions.push(spellQuestion(item, { unitId: unit.id, badge: "到期复习" }));
    else questions.push(listenQuestion(item, unit.words, { unitId: unit.id, badge: "认词复习", skill: "recognition" }));
  });
  return questions;
}

function uniqueQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = `${question.itemId}-${question.skill}-${question.answer}`;
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
      updatedAt: null
    };
  }
  return state.itemStats[key];
}

function updateItemStats(question, ok) {
  if (!question.itemId || !question.skill) return;
  const stat = getItemStat(question.itemId, question.itemKind);
  stat.attempts += 1;
  stat.correct += ok ? 1 : 0;
  stat.streak = ok ? stat.streak + 1 : 0;
  stat.updatedAt = new Date().toISOString();
  const current = stat.skills[question.skill] || { streak: 0, attempts: 0, correct: 0 };
  current.attempts += 1;
  current.correct += ok ? 1 : 0;
  current.streak = ok ? Math.min(3, current.streak + 1) : 0;
  stat.skills[question.skill] = current;
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
  const unit = getCurrentStudyUnit();
  if (!unit) return;
  if (practice.mode === "preview-practice") {
    state.unitProgress[unit.id] = "quiz-ready";
  }
  if (["preview-quiz", "unit", "daily"].includes(practice.mode)) {
    const mastery = getUnitMastery(unit);
    if (mastery.percent >= 100 && score === 100 && getActiveMistakes().every((item) => item.unitId !== unit.id)) {
      state.unitProgress[unit.id] = "mastered";
    } else {
      state.unitProgress[unit.id] = "consolidating";
    }
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
  appViews.speaking.querySelector("#scoreResult").innerHTML = scoreTemplate(result);
  state.records.push({
    id: `speech-${Date.now()}`,
    mode: "speaking",
    question: currentSpeakingItem.en,
    correct: result.total >= 82,
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
    existing.times += 1;
    existing.reason = reason;
    existing.status = "active";
    existing.priority = Math.min(5, (existing.priority || 1) + 1);
    existing.correctStreak = 0;
    existing.updatedAt = new Date().toISOString();
  } else {
    state.mistakes.push({
      id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      en: key,
      zh: question.word?.zh || question.prompt,
      answer: question.answer,
      itemId: question.itemId,
      itemKind: question.itemKind,
      unitId: question.unitId,
      skill: question.skill,
      reason,
      times: 1,
      correctStreak: 0,
      priority: 2,
      status: "active",
      updatedAt: new Date().toISOString()
    });
  }
  saveState();
}

function inferReason(question) {
  if (question.type === "listen-choice" || question.title?.includes("听")) return "听不出来";
  if (question.type === "meaning-choice") return "认不准";
  return "拼不出来";
}

function exportRecords() {
  const payload = {
    appVersion: APP_VERSION,
    package: data.title,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `xiaobao-study-records-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
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
  if (!confirm("清理缓存不会删除学习记录，但会让离线资源重新下载。确定清理？")) return;
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  showToast("缓存已清理");
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
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb") && /daniel|serena|susan|arthur|martha|kate|uk|british/.test(lower(voice))) ||
    availableVoices.find((voice) => voice.lang?.toLowerCase().startsWith("en-gb")) ||
    availableVoices.find((voice) => /daniel|serena|susan|arthur|martha|kate|british/.test(lower(voice))) ||
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
  speakText(text, options);
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

  const runId = ++speechRunId;
  window.speechSynthesis.cancel();
  window.speechSynthesis.resume?.();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickEnglishVoice();
  utterance.lang = voice?.lang || "en-GB";
  utterance.voice = voice || null;
  utterance.rate = options.rate ?? state.settings.speechRate ?? 0.64;
  utterance.pitch = 1;
  utterance.volume = 1;
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
      if (runId === speechRunId) showToast(`正在播放：${text}`);
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
  const rate = options.rate ?? state.settings.speechRate ?? 0.64;
  if (!options.silentToast) showToast("正在准备播放...");
  await speakText(text, { rate });
  await sleep(700);
  await speakText(text, { rate: Math.max(0.5, rate - 0.03) });
}

async function speakLessonList(texts) {
  showToast("英音领读：每项读两遍，中间留停顿");
  for (let index = 0; index < texts.length; index += 1) {
    await speakLikeTeacher(texts[index]);
    if (index < texts.length - 1) await sleep(2600);
  }
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
  return `
    <div class="unit-row">
      <div>
        <strong>${unit.title}</strong>
        <p class="muted" style="margin-bottom:8px">${unit.focus.join(" / ")}</p>
        <div class="chip-row">${unit.words.slice(0, 5).map((word) => `<span class="chip">${word.en}</span>`).join("")}</div>
      </div>
      <button class="secondary-button" data-lesson="${unit.id}">上预习课</button>
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
  return `
    <div class="report-item">
      <span>
        <strong>${item.title}</strong>
        <br><span class="muted">${item.focus.join(" / ")}</span>
      </span>
      <span class="badge amber">${item.status}</span>
    </div>
  `;
}

function mistakeItem(item) {
  const text = item.en || item.answer;
  const mastered = item.status === "mastered";
  return `
    <div class="mistake-item">
      <span>
        <strong>${text}</strong>
        <br><span class="muted">${item.zh || ""} · ${item.reason} · 见过 ${item.times} 次 · 已稳 ${item.correctStreak || 0}/3</span>
      </span>
      <span class="badge ${mastered ? "" : "amber"}">${mastered ? "已稳定" : "后面再见"}</span>
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
    "preview-quiz": "预习小测",
    "review-total": "总复习"
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
  document.querySelector("#syncTitle").textContent = data.title;
  const statusLabel = materialStatusText();
  document.querySelector("#syncMeta").textContent = `v${data.version} · ${statusLabel}`;
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
    return {
      ...defaultState,
      ...stored,
      settings: { ...defaultState.settings, ...(stored?.settings || {}) },
      unitProgress: { ...defaultState.unitProgress, ...(stored?.unitProgress || {}) },
      itemStats: stored?.itemStats || {},
      sessionSummaries: stored?.sessionSummaries || []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeAttr(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;");
}
