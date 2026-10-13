"use strict";

// OrbitOffice 核心逻辑：员工与任务数据、模拟工作循环、主界面渲染。
// 界面面板（员工面板、大脑、设置、指令面板、提示条、小地图）在 ui.js；文字在 i18n.js。

// ---- 数据：员工、团队、交接链 ----
// 下面的 AGENTS / TEAMS 是「软件团队」模板。桌面 App 第一次启动时把它写成 .md 文件（见 office-def.js），
// 之后从文件读取，用户可以自己增删改员工和办公室；读到的内容会原地替换这两个数组，其余代码不用区分。
// 只有在浏览器里直接打开页面（模拟模式）时才一直用模板。
const AGENTS = [
  {
    id: "planner", team: "product",
    brief: "Turn the request into a concrete plan and write it to docs/plan.md: goals, scope, the chosen technology, and a task breakdown where every owner is one of your actual teammates. Keep the first version small enough for this team to build right away. Do not write calendar schedules in weeks or person-days. When the work needs building, hand off to the designer only if the product has a user interface people look at (screens, pages, app windows, game visuals); for a command-line tool, script, API, library or data processing, hand off straight to the developer.", color: "#4c9a6a",
    keywords: ["需求", "拆解", "拆分", "方案", "架构", "排期", "估时", "计划", "里程碑", "迭代",
      "requirement", "breakdown", "break down", "plan", "estimate", "estimation", "roadmap", "milestone", "sprint", "ticket", "architecture"],
    zh: {
      name: "规划师", role: "需求与排期", skills: ["需求拆解", "技术方案", "任务估时", "风险评估"],
      steps: ["正在理解需求背景…", "正在拆分任务和依赖…", "正在估时并标注风险…"],
      result: "已拆成可执行的任务清单，附估时、依赖关系和主要风险点。",
    },
    en: {
      name: "Planner", role: "Planning & scheduling", skills: ["Requirement breakdown", "Tech design", "Estimation", "Risk assessment"],
      steps: ["Understanding the requirement…", "Breaking down tasks and dependencies…", "Estimating and flagging risks…"],
      result: "Broken into an actionable task list with estimates, dependencies and key risks.",
    },
  },
  {
    id: "reviewer", team: "quality",
    brief: "Review the code in the project. Do NOT change any code. Write your findings to docs/review.md, ordered by severity, each with the file it concerns and a concrete suggested fix. If you find any defect that makes the code wrong (a real bug, not style), you must send it back: hand off to the developer with the list of bugs to fix.", color: "#e8a33d",
    keywords: ["审查", "评审", "重构", "规范", "优化", "性能", "代码质量", "坏味道", "合并请求",
      "review", "refactor", "pull request", "pr", "lint", "code quality", "performance", "clean code"],
    zh: {
      name: "老审", role: "代码审查员", skills: ["代码审查", "重构", "性能", "代码规范"],
      steps: ["正在通读改动…", "正在检查命名、结构与边界…", "正在整理评审意见…"],
      result: "审查完成：列出了 5 条改进建议，并标注了优先级和是否阻塞合并。",
    },
    en: {
      name: "Reviewer", role: "Code review", skills: ["Code review", "Refactoring", "Performance", "Style"],
      steps: ["Reading the changes…", "Checking naming, structure and edge cases…", "Writing up review comments…"],
      result: "Review done: 5 suggestions, prioritized, with blockers marked.",
    },
  },
  {
    id: "debugger", team: "engineering",
    brief: "Find the root cause in the code and fix it by editing the files. Explain the cause and the fix in your summary.", color: "#d45f8f",
    keywords: ["报错", "错误", "异常", "调试", "崩溃", "日志", "跑不起来", "线上", "故障", "排查",
      "bug", "error", "exception", "crash", "debug", "log", "stack trace", "500", "fix", "broken", "fails"],
    zh: {
      name: "虫探", role: "调试专家", skills: ["报错分析", "定位 Bug", "日志", "复现问题"],
      steps: ["正在阅读报错和日志…", "正在缩小问题范围…", "正在验证修复方案…"],
      result: "已定位根因，并给出最小修复方案和防止复发的建议。",
    },
    en: {
      name: "Debugger", role: "Debugging", skills: ["Error analysis", "Locating bugs", "Logs", "Reproduction"],
      steps: ["Reading errors and logs…", "Narrowing down the cause…", "Verifying the fix…"],
      result: "Root cause found, with a minimal fix and ways to prevent recurrence.",
    },
  },
  {
    id: "tester", team: "quality",
    brief: "Write automated tests for the code in the project, using the project's language and its usual test framework, in a tests/ folder. Run the tests when running commands is allowed. If the tests reveal real bugs in the code, send it back: hand off to the developer with the failing cases.", color: "#4c8fd9",
    keywords: ["测试", "用例", "单元测试", "边界", "回归", "覆盖率", "自测", "验收",
      "test", "unit test", "coverage", "regression", "qa", "e2e", "mock", "edge case"],
    zh: {
      name: "测试员", role: "测试工程师", skills: ["测试用例", "单元测试", "边界条件", "回归测试"],
      steps: ["正在分析被测逻辑…", "正在设计用例和边界条件…", "正在编写并运行测试…"],
      result: "已补充测试用例，覆盖正常、边界和异常路径，全部通过。",
    },
    en: {
      name: "Tester", role: "QA engineering", skills: ["Test cases", "Unit tests", "Edge cases", "Regression"],
      steps: ["Analyzing the code under test…", "Designing cases and edge conditions…", "Writing and running tests…"],
      result: "Test cases added covering normal, edge and error paths — all passing.",
    },
  },
  {
    id: "writer", team: "product",
    brief: "Write clear documentation or reports as Markdown files in the project.", color: "#9b6bd6",
    keywords: ["文档", "周报", "日报", "汇报", "纪要", "会议", "说明", "注释", "总结", "写作", "邮件", "描述",
      "doc", "docs", "document", "readme", "report", "weekly", "notes", "summary", "email", "write up", "changelog", "status report"],
    zh: {
      name: "笔杆", role: "文档与周报", skills: ["技术文档", "周报", "PR 描述", "会议纪要"],
      steps: ["正在整理材料…", "正在撰写初稿…", "正在润色并检查格式…"],
      result: "初稿已完成，结构清晰，可直接发送或继续修改。",
    },
    en: {
      name: "Writer", role: "Docs & reports", skills: ["Tech docs", "Weekly reports", "PR descriptions", "Meeting notes"],
      steps: ["Gathering material…", "Drafting…", "Polishing and checking format…"],
      result: "Draft ready — clear structure, ready to send or refine.",
    },
  },
  {
    id: "devops", team: "engineering", needsApproval: true,
    brief: "Prepare deployment for the project: write the files that are needed (for example a Dockerfile, a CI workflow, scripts) and docs/deploy.md covering release steps, health checks and rollback.", color: "#d9822b",
    keywords: ["部署", "发布", "上线", "容器", "监控", "告警", "流水线", "服务器", "环境", "回滚",
      "deploy", "release", "docker", "kubernetes", "k8s", "ci", "cd", "pipeline", "server", "monitor", "rollback", "infra", "container"],
    zh: {
      name: "运维哥", role: "部署与运维", skills: ["部署发布", "CI/CD", "Docker", "监控告警"],
      steps: ["正在检查环境和配置…", "正在编排部署步骤…", "正在验证并配置回滚方案…"],
      result: "部署方案已就绪：含发布步骤、健康检查和回滚预案。",
    },
    en: {
      name: "DevOps", role: "Deploy & operations", skills: ["Release", "CI/CD", "Docker", "Monitoring"],
      steps: ["Checking environment and config…", "Orchestrating deploy steps…", "Verifying and preparing rollback…"],
      result: "Deployment plan ready: release steps, health checks and rollback.",
    },
  },
  {
    id: "designer", team: "product", color: "#f97373",
    brief: "Design the user interface and experience. Always deliver a mockup the user can open in a browser: a self-contained static HTML file (with its CSS) under design/, showing the real screens and states with realistic sample content. Also write docs/design.md covering the screens, layout, components, states and user flows, and say in your summary which file to open. If the work has no user interface (a command-line tool, script, API, library or data processing), do not invent screens: finish with status 'blocked', say why, and hand off to the developer.",
    keywords: ["界面", "交互", "原型", "配色", "布局", "视觉", "样式", "设计稿",
      "ui", "ux", "mockup", "wireframe", "layout", "design", "prototype", "style"],
    zh: {
      name: "设计师", role: "界面与交互", skills: ["界面设计", "交互流程", "原型", "配色"],
      steps: ["正在梳理用户流程…", "正在设计界面布局…", "正在整理设计说明…"],
      result: "设计说明已完成：包含页面、布局、组件和交互流程。",
    },
    en: {
      name: "Designer", role: "UI & UX", skills: ["UI design", "User flows", "Prototyping", "Color"],
      steps: ["Mapping the user flow…", "Designing the layout…", "Writing up the design notes…"],
      result: "Design notes ready: screens, layout, components and user flows.",
    },
  },
  {
    id: "developer", team: "engineering", color: "#2dd4bf",
    brief: "Implement the requested feature by writing real, working code in the project. Follow docs/plan.md and docs/design.md when they exist. Keep the code complete and runnable, and match the style of the existing code. In your summary say exactly how to run it.",
    keywords: ["写代码", "实现", "开发", "功能", "编写", "函数", "接口", "页面", "脚本", "程序",
      "implement", "build", "code", "develop", "feature", "function", "api", "script", "program", "app"],
    zh: {
      name: "码哥", role: "开发工程师", skills: ["写代码", "实现功能", "接口", "重构"],
      steps: ["正在阅读需求和现有代码…", "正在编写代码…", "正在自查并整理改动…"],
      result: "功能已实现，代码已写入项目。",
    },
    en: {
      name: "Developer", role: "Software engineer", skills: ["Coding", "Features", "APIs", "Refactoring"],
      steps: ["Reading the requirement and existing code…", "Writing code…", "Self-checking and tidying the changes…"],
      result: "Feature implemented and written into the project.",
    },
  },
  // 安全组：攻击者（红队）找漏洞，安全员（蓝队）核实并安排修复。specialist：没点名时不会被随手派到无关的任务。
  {
    id: "attacker", team: "security", color: "#ef4444", specialist: true, localOnly: true, handsTo: "security",
    brief: "You are the red team. Look for security weaknesses in THIS project's own code, reading it the way an attacker would: input handling and injection, authentication and access checks, secrets left in code, unsafe file or command use, risky dependencies, data exposed to users. Do NOT change any code. Write security/findings.md: one entry per finding with severity, the exact file and line, how to trigger it step by step, and the impact. Report only what you can point to in the code; if you cannot show evidence, say so instead of guessing. If you find nothing real, say that plainly. When there are findings, hand off to the security engineer (security) to judge them; that is the only teammate you hand off to — never straight to the developer.",
    keywords: ["渗透", "攻击", "漏洞", "红队", "入侵", "破解", "注入",
      "pentest", "penetration", "exploit", "vulnerability", "vulnerabilities", "attack", "red team", "hack", "injection", "xss"],
    zh: {
      name: "红客", role: "攻击者（红队）", skills: ["找漏洞", "渗透思路", "复现步骤", "风险评级"],
      steps: ["正在像攻击者一样通读代码…", "正在尝试各种输入和绕过…", "正在整理漏洞和复现步骤…"],
      result: "攻击报告已完成：列出了发现的漏洞、所在位置、触发方法和影响。",
    },
    en: {
      name: "Attacker", role: "Attacker (red team)", skills: ["Finding holes", "Attack paths", "Reproduction", "Severity rating"],
      steps: ["Reading the code like an attacker…", "Trying inputs and bypasses…", "Writing up findings and how to trigger them…"],
      result: "Attack report ready: the weaknesses found, where they are, how to trigger them and their impact.",
    },
  },
  {
    id: "security", team: "security", color: "#22b8e6", specialist: true,
    brief: "You are the security engineer (blue team). Read security/findings.md and check every finding against the actual code: confirm it, or reject it and say why (for example no evidence, cannot be triggered, already handled). Do NOT change code yourself. Write security/review.md: the confirmed issues ordered by severity, each with the concrete fix, then the rejected ones with the reason. If any confirmed issue needs a fix, you must hand off to the developer with the list of fixes. If asked to check a fix, verify it in the code and hand off to the attacker to retest only when a retest is really needed. If there is no findings file, review the project's security yourself and write the same document.",
    keywords: ["安全", "加固", "防护", "权限", "加密", "蓝队", "防御", "鉴权", "隐私",
      "security", "secure", "harden", "hardening", "auth", "authentication", "encryption", "blue team", "threat", "privacy"],
    zh: {
      name: "安盾", role: "安全员（蓝队）", skills: ["漏洞核实", "修复方案", "安全加固", "权限检查"],
      steps: ["正在逐条核对漏洞报告…", "正在对照代码确认真假…", "正在整理修复方案…"],
      result: "安全评审已完成：确认了真实的问题并给出修复方案，驳回了证据不足的。",
    },
    en: {
      name: "Security", role: "Security engineer (blue team)", skills: ["Verifying findings", "Fix plans", "Hardening", "Access checks"],
      steps: ["Going through the findings one by one…", "Checking each against the code…", "Writing up the fixes…"],
      result: "Security review ready: real issues confirmed with fixes, unsupported ones rejected.",
    },
  },
];

// 团队：每个团队在 3D 办公室里占一座悬浮岛（顺序是绕着大脑一圈的顺序）
const TEAMS = [
  { id: "product", color: "#2fbf8f", zh: "产品组", en: "Product" },
  { id: "quality", color: "#5b86ff", zh: "质量组", en: "Quality" },
  { id: "engineering", color: "#e0556b", zh: "工程组", en: "Engineering" },
  { id: "security", color: "#a855f7", zh: "安全组", en: "Security" },
];

// 软件团队模板的原样副本：AGENTS / TEAMS 之后会被文件里的内容替换，恢复模板时用这两份
const TEMPLATE_AGENTS = AGENTS.slice(), TEMPLATE_TEAMS = TEAMS.slice();

// 交接链，对应做一个项目的步骤：需求 → 设计 → 写代码 → 测试 → 审查 → 部署 → 文档
// （planner → designer → developer → tester → reviewer → devops → writer；修完 Bug 也交给测试）
const HANDOFF = {
  planner:   { to: "designer",  tpl: "tpl.fromPlanner" },
  designer:  { to: "developer", tpl: "tpl.fromDesigner" },
  developer: { to: "tester",    tpl: "tpl.fromDeveloper" },
  debugger:  { to: "tester",    tpl: "tpl.fromDebugger" },
  tester:   { to: "reviewer", tpl: "tpl.fromTester" },
  reviewer: { to: "devops",   tpl: "tpl.fromReviewer" },
  devops:   { to: "writer",   tpl: "tpl.fromDevops" },
  attacker: { to: "security", tpl: "tpl.fromAttacker" },
  security: { to: "developer", tpl: "tpl.fromSecurity" },
};

const MODE_IDS = ["manual", "auto", "full"];
const RISKY = /部署|发布|上线|生产|删除|回滚|\b(deploy|release|drop|delete|rollback)/i;
const PICK_AUTO = "auto";   // 下拉框里的「自动分配」
const STORE_KEY = "myaioffice.v3";
// 桌面 App 里所有员工都用真 AI 执行任务（需要已选项目文件夹、AI 池里有可用的 AI）；条件不满足时任务停住并说明原因。
// 只有在浏览器里直接打开页面时才是模拟（没有读写文件的权限）。
const DESKTOP = !!(window.desktop && window.desktop.agent);
let realReady = false;
let realState = { project: false, ai: false };
let realWarned = false;
const EXAMPLE_KEYS = ["ex.1", "ex.2", "ex.3", "ex.4", "ex.5", "ex.6"];

// ---- 状态 ----
// task: { id, title, tpl, topic, agentId, status: "pending"|"queued"|"doing"|"done", progress, duration,
//         doneAt, handoff, from, parent, reason: "manual"|"risky"|"" }
let tasks = [];
let logs = [];     // { time, key, vars }，按当前语言渲染
let nextId = 1;
let mode = "auto";
let edits = {};    // 旧版本：用户在设置里改过的员工信息。第一次写成 .md 文件时带过去，之后不再使用
const OFFICE = { purpose: "", dir: "", fromFiles: false };   // 这个办公室是做什么的；定义文件放在哪
let agentsVersion = 0;   // 员工信息或语言变化时 +1，用来刷新界面文字

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (_) { /* 存档损坏：从空状态开始 */ }
  if (saved) {
    tasks = saved.tasks || [];
    logs = saved.logs || [];
    nextId = saved.nextId || 1;
    edits = saved.edits || {};
    if (MODE_IDS.includes(saved.mode)) mode = saved.mode;
    // 刷新页面后，进行中的任务退回排队，重新开始
    tasks.forEach(x => { if (x.status === "doing") { x.status = "queued"; x.progress = 0; x.started = false; } });
  }
  if (saved && I18N[saved.lang]) LANG = saved.lang;
  else LANG = (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
}
function save() {
  try {
    // 只保留最近 60 条已完成任务，避免存档无限增长
    const done = tasks.filter(x => x.status === "done").sort((a, b) => b.doneAt - a.doneAt).slice(0, 60);
    tasks = tasks.filter(x => x.status !== "done" || done.includes(x));
    localStorage.setItem(STORE_KEY, JSON.stringify({ tasks, logs, nextId, mode, edits, lang: LANG }));
  } catch (_) { /* localStorage 不可用时忽略 */ }
}

// ---- 取员工 / 团队的显示信息 ----
const agentExists = id => AGENTS.some(a => a.id === id);
// AI 交接时偶尔写名字而不是 id：按 id、名字依次找
const resolveAgentId = to => {
  const s = String(to || "").trim();
  const a = AGENTS.find(x => x.id === s) || AGENTS.find(x => x.id === s.toLowerCase()) || AGENTS.find(x => agentName(x) === s) || AGENTS.find(x => s && (s.includes(agentName(x)) || agentName(x).includes(s)));
  return a ? a.id : s;
};
const ghostAgent = id => {
  const texts = { name: t("agent.removed"), role: "", skills: [], steps: [""], result: "" };
  return { id, team: "", color: "#6b7280", brief: "", keywords: [], removed: true, zh: texts, en: texts };
};
const agentById = id => AGENTS.find(a => a.id === id) || ghostAgent(id);
const teamById = id => TEAMS.find(x => x.id === id) || { id, name: "?", color: "#6b7280", zh: "?", en: "?" };
const editOf = a => edits[a.id] || {};
const agentName = a => editOf(a).name || a[LANG].name;
const agentRole = a => editOf(a).role || a[LANG].role;
const agentSkills = a => (editOf(a).skills && editOf(a).skills.length ? editOf(a).skills : a[LANG].skills);
const agentColor = a => editOf(a).color || a.color;
const teamName = x => x.name || x[LANG];
const taskTitle = o => (o.tpl ? t(o.tpl, { topic: o.topic }) : o.title);
const snap = task => ({ title: task.title, tpl: task.tpl, topic: task.topic });

// ---- 日志 ----
function addLog(key, vars = {}) {
  logs.unshift({ time: new Date().toTimeString().slice(0, 8), key, vars });
  logs.length = Math.min(logs.length, 80);
}
function logText(l) {
  const v = Object.assign({}, l.vars);
  if (v.a) v.a = agentName(agentById(v.a));
  if (v.b) v.b = agentName(agentById(v.b));
  if (v.task) v.title = taskTitle(v.task);
  if (v.mode) v.mode = t("mode." + v.mode);
  if (v.reason) v.reason = t("reason." + v.reason);
  return t(l.key, v);
}

// ---- 任务分配 ----
function keywordHit(text, kw) {
  if (!/^[\x00-\x7f]+$/.test(kw)) return text.includes(kw);
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(kw.length <= 3 ? "\\b" + esc + "\\b" : "\\b" + esc).test(text);
}
function pickAgent(title) {
  const text = title.toLowerCase();
  let best = null, bestScore = 0;
  for (const a of AGENTS) {
    // 专职岗位（安全组）的关键词更明确，命中时优先于通用岗位
    // 任务里直接出现了员工的名字或岗位（例如「文案」），再加分：自建办公室里关键词常常互相重叠
    const named = [agentName(a), agentRole(a)].filter(w => w && w.length >= 2).some(w => text.includes(w.toLowerCase())) ? 1.5 : 0;
    const score = (a.keywords.reduce((n, k) => n + (keywordHit(text, k) ? 1 : 0), 0) + named) * (a.specialist ? 1.5 : 1);
    if (score > bestScore) { best = a; bestScore = score; }
  }
  if (best) return best.id;
  // 没有关键词命中：派给手头任务最少的员工
  const busy = a => tasks.filter(x => x.agentId === a.id && x.status !== "done").length;
  return AGENTS.filter(a => !a.specialist).sort((a, b) => busy(a) - busy(b))[0].id;
}

// 当前模式下，这个任务是否需要用户批准；返回原因（reason.* 的后缀），空字符串表示不需要
// 员工能写哪些文件（.md 里的 writes）；没有限制时返回 null
function scopeOf(a) {
  if (!a.writes || !a.writes.length) return null;
  return { allow: a.writes.map(OfficeDef.globToRegex), hint: a.writes.join(", ") };
}

function approvalReason(task) {
  if (mode === "manual") return "manual";
  if (mode === "auto" && (agentById(task.agentId).needsApproval || RISKY.test(task.title))) return "risky";
  return "";
}

function createTask(title, agentId, opts = {}) {
  const task = {
    id: nextId++, title, tpl: opts.tpl || null, topic: opts.topic || title, agentId, status: "queued",
    progress: 0, duration: 7000 + Math.random() * 6000, doneAt: 0,
    handoff: !!opts.handoff, from: opts.from || null, parent: opts.parent || null, reason: "",
  };
  task.reason = approvalReason(task);
  if (task.reason) task.status = "pending";
  return task;
}

function notify(title, body) {
  try {
    if (window.desktop && window.desktop.notify) window.desktop.notify(title, body);
    else if (!document.hasFocus() && "Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch (_) { /* 通知不可用时忽略 */ }
}

function announcePending(task) {
  UI.toastPending(task);
  notify(t("notify.pending"), `${agentName(agentById(task.agentId))}: ${taskTitle(task)}`);
}

function addTask(title, agentChoice, handoff) {
  const agentId = agentChoice === PICK_AUTO ? pickAgent(title) : agentChoice;
  const task = createTask(title, agentId, { handoff });
  tasks.push(task);
  addLog(task.status === "pending" ? "log.assignPending" : "log.assign", { task: snap(task), a: agentId, reason: task.reason });
  if (task.status === "pending") announcePending(task);
  save();
  render(true);
  return task;
}

function approveTask(id) {
  const task = tasks.find(x => x.id === id && x.status === "pending");
  if (!task) return;
  task.status = "queued";
  addLog("log.approved", { task: snap(task) });
  save();
  render(true);
}
function rejectTask(id) {
  const i = tasks.findIndex(x => x.id === id && x.status === "pending");
  if (i < 0) return;
  addLog("log.rejected", { task: snap(tasks[i]) });
  tasks.splice(i, 1);
  save();
  render(true);
}
function approveAll() {
  tasks.filter(x => x.status === "pending").forEach(x => { x.status = "queued"; });
  addLog("log.approvedAll");
  save();
  render(true);
}

function setMode(id) {
  if (mode === id || !MODE_IDS.includes(id)) return;
  mode = id;
  addLog("log.mode", { mode: id });
  save();
  renderModes();
  render(true);
}

// 员工设置：改动立即生效并保存
function setAgentEdit(id, field, value) {
  const e = edits[id] || (edits[id] = {});
  if (value === "" || (Array.isArray(value) && !value.length)) delete e[field];
  else e[field] = value;
  if (!Object.keys(e).length) delete edits[id];
  agentsVersion++;
  if (field === "color" && window.Office3D) Office3D.setAgentColor(id, agentColor(agentById(id)));
  save();
  render(true);
  ChatUI.render();
}
function resetAgentEdit(id) {
  delete edits[id];
  agentsVersion++;
  if (window.Office3D) Office3D.setAgentColor(id, agentColor(agentById(id)));
  save();
  render(true);
}

// 取消任务：正在执行的会在下一步之前停下；还没开始的直接标记为已取消
function cancelTask(id) {
  const task = tasks.find(x => x.id === id);
  if (!task || task.status === "done") return;
  if (task.status === "doing" && task.real && DESKTOP) { task.stepText = t("real.cancelling"); desktop.agent.cancel(id); render(true); return; }
  task.status = "done"; task.doneAt = Date.now(); task.failed = true; task.cancelled = true; task.progress = 1;
  task.result = t("real.failed", { error: t("real.e.cancelled") });
  addLog("log.cancelled", { task: snap(task) });
  save();
  render(true);
}
// 重试：照原样再派一次（同一位员工、同样的交接内容）
function retryTask(id) {
  const old = tasks.find(x => x.id === id);
  if (!old) return null;
  const task = createTask(old.title, old.agentId, { handoff: old.handoff, from: old.from, parent: old.parent, tpl: old.tpl, topic: old.topic });
  task.context = old.context || "";
  task.chat = old.chat; task.history = old.history; task.depth = old.depth;
  task.status = "queued"; task.reason = "";
  tasks.push(task);
  addLog("log.retry", { task: snap(task), a: task.agentId });
  save();
  render(true);
  return task;
}
function clearData() {
  tasks = []; logs = []; nextId = 1;
  addLog("log.cleared");
  save();
  render(true);
}
function exportData() {
  const data = { app: (window.desktop && desktop.appName) || "OrbitOffice", version: 3, exportedAt: new Date().toISOString(), lang: LANG, mode, edits, tasks, logs };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = "orbitoffice-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- 真实执行 ----
function refreshRealReady() {
  if (!(window.desktop && desktop.agent)) return;
  desktop.agent.available().then(r => { realState = r; realReady = r.project && r.ai; if (realReady) realWarned = false; });
}
function realError(res) {
  const k = "real.e." + res.error;
  return I18N[LANG][k] ? t(k, { detail: res.detail || "" }) : (res.error || "") + (res.detail ? " " + res.detail : "");
}
// 告诉 AI 有哪些同事：id（交接时用）、名字（职责说明里常用名字称呼同事）、岗位
const teamList = exceptId => AGENTS.filter(x => x.id !== exceptId).map(x => x.id + ": " + agentName(x) + (agentRole(x) ? ", " + agentRole(x) : "")).join("; ");

function startReal(task, a) {
  // 交接出来的任务：带上用户最初的要求，让接手的人知道整件事的目标，而不只是眼前这一步
  let root = task;
  for (let i = 0; i < 12 && root.parent; i++) { const p = tasks.find(x => x.id === root.parent); if (!p) break; root = p; }
  task.real = true;
  task.started = true;
  task.stepText = t("real.thinking", { step: 1, source: "…" });
  task.blocked = false;
  desktop.agent.run({ taskId: task.id, title: taskTitle(task), agentName: agentName(a), agentRole: agentRole(a), brief: a.brief, context: task.context || "", origin: root !== task ? taskTitle(root) : "",
    scope: scopeOf(a), localOnly: !!a.localOnly, chat: !!task.chat, history: task.history || [],
    team: teamList(a.id), allowHandoff: !!task.handoff && (task.depth || 0) < 6,
    agentId: a.id, skills: agentSkills(a), purpose: OFFICE.purpose, external: !!a.external,
    mode, lang: LANG }).then(res => {
    task.status = "done";
    task.doneAt = Date.now();
    task.progress = 1;
    task.failed = !res.ok || !!res.blocked;
    task.cancelled = res.error === "cancelled";
    task.blocked = false;
    task.files = res.files || [];
    task.source = res.source || null;
    task.usage = res.usage || null;
    task.result = !res.ok ? t("real.failed", { error: realError(res) })
      : res.blocked ? t("real.blocked", { reason: res.summary })
      : (task.files.length ? t("real.done.files", { summary: res.summary, files: task.files.join("、") }) : res.summary + (task.chat ? "\n\n" + t("real.done.nofiles") : ""));
    ChatUI.tell(a.id, task.result, task.chat === "group", task.id);
    if (res.ok && res.blocked) {
      addLog("log.realBlocked", { a: a.id, task: snap(task) });
      UI.toast(t("toast.blocked", { a: agentName(a) }), { kind: "warn", ttl: 12000, actionLabel: t("toast.view"), action: () => UI.openTask(task.id) });
      proposeHandoff(task, a, res.handoff);   // 停下的同时可以把问题打回给上一位
    } else if (res.ok) {
      addLog("log.done", { a: a.id, task: snap(task) });
      if (window.Office3D) Office3D.celebrate(a.id);
      UI.toastDone(task);
      // 没有实际产出就不往下传：免得后面的人对着空气干活
      if (res.handoff && !task.files.length && res.handoff.to !== task.from) task.result += "\n\n" + t("real.noOutputNoHandoff");
      else proposeHandoff(task, a, retestAfterFix(task, a) || res.handoff);   // 员工认为需要别人接着做时才交接
    } else if (task.cancelled) {
      addLog("log.cancelled", { task: snap(task) });
    } else {
      addLog("log.realFailed", { a: a.id, task: snap(task), error: realError(res) });
      UI.toast(t("real.failed", { error: realError(res) }), { kind: "warn", ttl: 9000 });
    }
    save();
    render(true);
  });
}
function onAgentEvent(ev) {
  const task = tasks.find(x => x.id === ev.taskId);
  if (!task) return;
  const a = agentById(task.agentId);
  // 过程记录：任务详情页里的时间线
  const trace = task.trace || (task.trace = []);
  if (trace.length < 160) trace.push({ at: Date.now(), type: ev.type, kind: ev.kind, path: ev.path, text: ev.text, step: ev.step, source: ev.source, from: ev.from, error: ev.error });
  if (ev.type === "thinking") { task.stepText = t("real.thinking", ev); task.progress = Math.min(0.92, ev.step / ev.max); }
  else if (["list", "read", "write", "edit", "search", "run", "tool"].includes(ev.type)) task.stepText = t("real." + ev.type, { path: ev.path });
  if (task.chat && task.stepText) ChatUI.progress(a.id, task.stepText);   // 聊天窗口里显示他正在做哪一步
  else if (ev.type === "switch") addLog("log.realFailed", { a: a.id, task: snap(task), error: t("real.switch", { from: ev.from }) + " " + (ev.error || "") });
  else if (ev.type === "ask") {
    // 员工提问或请求批准：用 App 内的弹窗，任务会一直等到你回应
    const entry = trace[trace.length - 1];
    const isQuestion = ev.kind === "question";
    task.stepText = t(isQuestion ? "real.waiting.answer" : "real.waiting.approve");
    notify(agentName(a), isQuestion ? ev.text : t("notify.pending"));
    if (isQuestion) {
      // 提问走聊天：员工在自己的单聊里给你发消息，你的回复就是答案
      ChatUI.ask(a.id, ev.text).then(text => {
        entry.allow = !!text;
        entry.answer = text;
        desktop.agent.answer(ev.askId, text || "");
      });
    } else {
      UI.askUser({ agent: a, input: false, message: t(ev.kind === "command" ? "real.ask.command" : ev.kind === "tool" ? "real.ask.tool" : "real.ask.write", { path: ev.path, size: ev.size }) }).then(r => {
        entry.allow = r.ok;
        desktop.agent.answer(ev.askId, r.ok);
      });
    }
  }
}

// 交接：把成果交给下一位同事，新任务带着上一位的总结和写过的文件
function handoffFrom(cur, a) {
  const h = cur.handoff && HANDOFF[a.id];
  if (!h) return;
  const context = cur.real ? agentName(a) + " (" + agentRole(a) + "): " + (cur.result || "") : "";
  const next = createTask(t(h.tpl, { topic: cur.topic }), h.to, { handoff: true, from: a.id, parent: cur.id, tpl: h.tpl, topic: cur.topic });
  next.context = context.slice(0, 3000);
  tasks.push(next);
  addLog(next.status === "pending" ? "log.handoffPending" : "log.handoff", { a: a.id, b: h.to, task: snap(next), reason: next.reason });
  if (next.status === "pending") announcePending(next);
  if (window.Office3D) Office3D.handoff(a.id, h.to);
}

// 真实执行时的交接：由员工自己提出（交给谁、做什么），不是固定流水线。
// 除了「完全访问」模式，交接都要用户批准。
// 安全员安排的修复做完后，必须让攻击者复测一次：修复本身可能没修好，或带来新漏洞。
// 只强制一轮（这条任务链上攻击者已经出场两次就不再强制），免得来回没完。
function retestAfterFix(task, a) {
  const from = task.from && AGENTS.find(x => x.id === task.from);
  const by = from && from.recheckBy;
  if (!by || by === a.id || !agentExists(by)) return null;
  let rounds = 0;
  for (let p = task; p; p = p.parent && tasks.find(x => x.id === p.parent)) if (p.agentId === by) rounds++;
  return rounds >= 2 ? null : { to: by, task: from.recheckTask || t("route.recheck", { name: agentName(from) }) };
}

// 没有界面的项目不需要设计：要交给设计师、但用户最初的要求明显是命令行/接口/脚本之类、又没提到任何界面时，直接改交给开发者
const UI_WORDS = /界面|页面|网页|网站|前端|按钮|屏幕|窗口|游戏|画面|小程序|\b(ui|ux|web\s?(site|page|app)|website|frontend|front-end|page|screen|window|button|game|gui|html|css|mobile app|desktop app)\b/i;
const NO_UI_WORDS = /命令行|终端|脚本|接口|后端|服务端|爬虫|数据处理|批处理|函数库|工具库|类库|\b(cli|command[- ]line|terminal|script|api|backend|back-end|library|sdk|daemon|cron|batch|parser|crawler|scraper)\b/i;
// 返回改交给谁（员工 .md 里的 no-ui-handoff），不用改时返回 null
function skipsDesign(cur, h) {
  const target = AGENTS.find(x => x.id === h.to);
  if (!target || !target.noUiHandoff || !agentExists(target.noUiHandoff)) return null;
  let root = cur;
  for (let i = 0; i < 12 && root.parent; i++) { const p = tasks.find(x => x.id === root.parent); if (!p) break; root = p; }
  // 只看用户最初的要求：交接任务是 AI 自己写的，常会顺手写上「设计界面」
  const text = taskTitle(root);
  return NO_UI_WORDS.test(text) && !UI_WORDS.test(text) ? target.noUiHandoff : null;
}

// 用量数字的简写：1234 → 1.2k，1234567 → 1.2M
const fmtTokens = n => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k" : String(n || 0));

function proposeHandoff(cur, a, h) {
  if (h) h = Object.assign({}, h, { to: resolveAgentId(h.to) });
  if (!h || !agentExists(h.to) || h.to === a.id) return;
  // 有固定下一站的岗位（例如攻击者的报告必须先经安全员核实）：不管它想交给谁，都改交给那一位
  if (a.handsTo && agentExists(a.handsTo) && h.to !== a.handsTo) h = { to: a.handsTo, task: a.handoffTask || h.task };
  const instead = skipsDesign(cur, h);
  if (instead) h = { to: instead, task: h.task };
  const next = createTask(h.task, h.to, { handoff: true, from: a.id, parent: cur.id, topic: cur.topic });
  next.depth = (cur.depth || 0) + 1;
  next.context = (agentName(a) + " (" + agentRole(a) + "): " + (cur.result || "")).slice(0, 3000);
  if (mode !== "full") { next.status = "pending"; next.reason = "handoff"; }
  tasks.push(next);
  addLog(next.status === "pending" ? "log.handoffPending" : "log.handoff", { a: a.id, b: h.to, task: snap(next), reason: next.reason });
  if (next.status === "pending") announcePending(next);
  if (window.Office3D) Office3D.handoff(a.id, h.to);
}

// 聊天里直接对话：你说一句，员工回答或动手做。回复会出现在聊天里，过程照样记在任务详情里。
function chatToAgent(agentId, text, history, inGroup) {
  if (!DESKTOP) return false;
  const task = createTask(text, agentId, { handoff: true });
  task.chat = inGroup ? "group" : "dm";
  task.history = history || [];
  task.status = "queued";   // 聊天是你直接发起的，不再另外要批准；写文件和运行命令仍按权限模式询问
  task.reason = "";
  tasks.push(task);
  addLog("log.assign", { task: snap(task), a: agentId });
  save();
  render(true);
  return true;
}

// 有先后顺序的任务（例如讨论结论里的一串任务）：前一个做完才轮到它
function readyToStart(x) {
  if (!x.after) return true;
  const prev = tasks.find(y => y.id === x.after);
  if (!prev) return true;
  if (prev.status !== "done") return false;
  if (prev.failed) {
    x.status = "done"; x.doneAt = Date.now(); x.failed = true; x.cancelled = true; x.progress = 1;
    x.result = t("real.failed", { error: t("real.e.prevFailed", { title: taskTitle(prev) }) });
    return false;
  }
  if (!x.context) x.context = (agentName(agentById(prev.agentId)) + " (" + agentRole(agentById(prev.agentId)) + "): " + (prev.result || "")).slice(0, 3000);
  return true;
}

// ---- 模拟工作循环 ----
let last = performance.now();
const atDesk = id => !(window.Office3D && Office3D.ready) || Office3D.isAtDesk(id);

function tick(now) {
  const dt = Math.min(now - last, 250); // 标签页在后台时不让任务瞬间跳完
  last = now;
  let structural = false;

  for (const a of AGENTS) {
    let cur = tasks.find(x => x.agentId === a.id && x.status === "doing");
    if (!cur) {
      cur = tasks.find(x => x.agentId === a.id && x.status === "queued" && readyToStart(x));
      if (cur) {
        cur.status = "doing";
        addLog("log.start", { a: a.id, task: snap(cur) });
        structural = true;
      }
    }
    // 桌面 App：坐下后交给真 AI 执行，进度由执行过程推动；条件不满足就停住并说明原因，绝不用假结果代替
    if (cur && DESKTOP) {
      if (!cur.started && atDesk(a.id)) {
        if (realReady) { startReal(cur, a); structural = true; }
        else {
          const why = t(realState.project ? "real.e.no-ai" : "real.e.no-project");
          cur.blocked = true;
          cur.stepText = why;
          if (!realWarned) { realWarned = true; UI.toast(why, { kind: "warn", ttl: 12000, actionLabel: t("nav.settings"), action: () => UI.open("settings") }); }
        }
      }
      continue;
    }
    // 员工要先走回工位坐下，任务才会推进
    if (cur && atDesk(a.id)) {
      cur.progress = Math.min(1, cur.progress + dt / cur.duration);
      if (cur.progress >= 1) {
        cur.status = "done";
        cur.doneAt = Date.now();
        addLog("log.done", { a: a.id, task: snap(cur) });
        if (window.Office3D) Office3D.celebrate(a.id);
        UI.toastDone(cur);
        structural = true;

        handoffFrom(cur, a);
      }
    }
  }

  if (structural) save();
  render(structural);
  requestAnimationFrame(tick);
}

// ---- 渲染 ----
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };

// 员工当前状态：idle / working / waiting / resting / returning
function agentStatus(a) {
  const cur = tasks.find(x => x.agentId === a.id && x.status === "doing");
  const pending = tasks.find(x => x.agentId === a.id && x.status === "pending");
  const seated = atDesk(a.id);
  if (cur) return { key: seated ? "working" : "returning", cur, seated };
  if (pending) return { key: "waiting", pending, seated };
  return { key: seated ? "idle" : "resting", seated };
}

const desks = {}; // agentId -> 悬浮标签 / 回退卡片里的元素

function buildOffice(use3d) {
  const layer = use3d ? Office3D.layer : $("office");
  if (!use3d) document.querySelector(".hint-corner").remove();   // 2D 回退时没有旋转/缩放操作
  for (const a of AGENTS) {
    const root = el("div", "desk");
    const head = el("div", "desk-head");
    const avatar = el("div", "avatar");
    const who = el("div");
    const name = el("div", "name"), role = el("div", "role");
    who.append(name, role);
    const chip = el("span", "chip");
    head.append(avatar, who, chip);

    const bubble = el("div", "bubble");
    const bar = el("div", "bar");
    const fill = el("i");
    bar.append(fill);
    const skills = el("div", "skills");

    root.append(head, bubble, bar, skills);
    layer.append(root);
    if (use3d) Office3D.setLabel(a.id, root);
    if (!use3d) root.addEventListener("click", () => UI.selectAgent(a.id));   // 3D 标签的点击由 Office3D.setLabel 处理
    desks[a.id] = { root, avatar, name, role, chip, bubble, fill, skills, ver: -1 };
  }
}

function refreshAgentTexts(a, d) {
  d.ver = agentsVersion;
  d.root.style.setProperty("--c", agentColor(a));
  setText(d.avatar, agentName(a)[0] || "?");
  setText(d.name, agentName(a));
  setText(d.role, agentRole(a));
  d.skills.replaceChildren(...agentSkills(a).map(s => el("span", null, s)));
}

function updateDesks() {
  const in3d = !!(window.Office3D && Office3D.ready);
  for (const a of AGENTS) {
    const d = desks[a.id];
    if (d.ver !== agentsVersion) refreshAgentTexts(a, d);
    const st = agentStatus(a);
    const queued = tasks.filter(x => x.agentId === a.id && x.status === "queued").length;
    const working = st.key === "working" || st.key === "returning";
    const waiting = st.key === "waiting";

    d.root.classList.toggle("working", working);
    d.root.classList.toggle("waiting", waiting);
    if (in3d) { Office3D.setWorking(a.id, working); Office3D.setWaiting(a.id, waiting); }

    setText(d.chip, t("chip." + st.key));
    if (st.key === "returning") {
      setText(d.bubble, t("bubble.returning"));
      d.fill.style.width = `${Math.round(st.cur.progress * 100)}%`;
    } else if (st.key === "working") {
      const steps = a[LANG].steps;
      const step = (st.cur.real || st.cur.blocked) ? (st.cur.stepText || "") : steps[Math.min(steps.length - 1, Math.floor(st.cur.progress * steps.length))];
      const queueNote = queued ? t("bubble.queued", { n: queued }) : "";
      // 3D 标签空间有限，只显示步骤；完整任务名放在悬停提示里
      setText(d.bubble, in3d ? step + queueNote : `${step} (${taskTitle(st.cur)})${queueNote}`);
      d.bubble.title = taskTitle(st.cur);
      d.fill.style.width = `${Math.round(st.cur.progress * 100)}%`;
    } else if (waiting) {
      setText(d.bubble, in3d ? t("bubble.waiting") : t("bubble.waiting2d", { title: taskTitle(st.pending) }));
      d.bubble.title = taskTitle(st.pending);
      d.fill.style.width = "0%";
    } else {
      setText(d.bubble, t("bubble.idle"));
      d.bubble.title = "";
      d.fill.style.width = "0%";
    }
  }
}

// 底部指令栏：权限模式、负责人下拉框、示例任务
function buildCommandBar() {
  const box = $("modes");
  for (const id of MODE_IDS) {
    const b = el("button", "mode");
    b.type = "button";
    b.dataset.mode = id;
    b.append(el("i"), el("span"));
    b.addEventListener("click", () => setMode(id));
    box.append(b);
  }
  renderModes();
  buildSelectAndExamples();
}
function renderModes() {
  $("modes").dataset.mode = mode;
  $("modes").querySelectorAll(".mode").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
    setText(b.lastChild, t("mode." + b.dataset.mode));
  });
  setText($("mode-hint"), t("mode." + mode + ".hint"));
}
function buildSelectAndExamples() {
  const sel = $("task-agent");
  const v = sel.value || PICK_AUTO;
  sel.replaceChildren(new Option(t("cmd.auto"), PICK_AUTO));
  AGENTS.forEach(a => sel.append(new Option(`${agentName(a)} · ${agentRole(a)}`, a.id)));
  sel.value = v;

  const ex = $("examples");
  ex.replaceChildren();
  for (const k of EXAMPLE_KEYS) {
    const b = el("button", null, t(k));
    b.type = "button";
    b.addEventListener("click", () => { $("task-title").value = t(k); $("task-title").focus(); });
    ex.append(b);
  }
}

// 看板（在任务面板里）
let boardSig = "";
function updateBoard(force) {
  const sig = LANG + agentsVersion + tasks.map(x => x.id + x.status).join(",");
  if (!force && sig === boardSig) return;
  boardSig = sig;

  const board = $("board");
  board.replaceChildren();
  const cols = [
    { title: t("col.pending"), pred: x => x.status === "pending", pending: true },
    { title: t("col.active"), pred: x => x.status === "queued" || x.status === "doing" },
    { title: t("col.done"), pred: x => x.status === "done", recent: 8 },
  ];
  for (const c of cols) {
    let list = tasks.filter(c.pred);
    if (c.pending && !list.length) continue;
    if (c.recent) list = list.sort((a, b) => b.doneAt - a.doneAt).slice(0, c.recent);

    const col = el("div", "col");
    const h = el("h3", null, c.title);
    h.append(el("em", null, String(list.length)));
    if (c.pending) {
      const all = el("button", "mini", t("board.approveAll"));
      all.type = "button";
      all.addEventListener("click", approveAll);
      h.append(all);
    }
    col.append(h);

    const cards = el("div", "cards");
    if (!list.length) cards.append(el("div", "empty", t("common.none")));
    for (const task of list) {
      const a = agentById(task.agentId);
      const card = el("div", "card clickable");
      card.addEventListener("click", e => { if (!e.target.closest("button")) UI.openTask(task.id); });
      card.dataset.status = task.status;
      card.style.setProperty("--c", agentColor(a));
      card.append(el("div", "card-title", taskTitle(task)));

      const meta = el("div", "card-meta");
      const who = el("span", "who");
      who.append(el("i", "dot"), document.createTextNode(agentName(a)));
      meta.append(who);
      if (task.from) meta.append(el("span", "via", "← " + agentName(agentById(task.from))));
      meta.append(el("span", "st", t("st." + task.status)));
      card.append(meta);

      if (task.status === "pending") {
        card.append(el("div", "result", t("board.needs", { reason: t("reason." + task.reason) })));
        const row = el("div", "actions");
        const ok = el("button", "mini ok", t("board.approve"));
        const no = el("button", "mini no", t("board.reject"));
        ok.type = no.type = "button";
        ok.addEventListener("click", () => approveTask(task.id));
        no.addEventListener("click", () => rejectTask(task.id));
        row.append(ok, no);
        card.append(row);
      }
      if (task.status === "done") card.append(el("div", "result", task.result || a[LANG].result));
      cards.append(card);
    }
    col.append(cards);
    board.append(col);
  }
}

// 动态时间线（在任务面板里）
let logSig = "";
function updateLog() {
  const sig = LANG + agentsVersion + logs.length + (logs[0] ? logs[0].time + logs[0].key : "");
  if (sig === logSig) return;
  logSig = sig;
  const ul = $("log");
  ul.replaceChildren();
  if (!logs.length) ul.append(el("li", "empty", t("log.empty")));
  for (const l of logs) {
    const li = el("li");
    li.append(el("time", null, l.time), document.createTextNode(logText(l)));
    ul.append(li);
  }
}

let statsKey = "";
function updateStats() {
  const doing = tasks.filter(x => x.status === "doing").length;
  const queued = tasks.filter(x => x.status === "queued" || x.status === "pending").length;
  const done = tasks.filter(x => x.status === "done").length;
  if (window.Office3D) Office3D.setBrainText(t("brain.label"), t("brain.labelSub", { done, doing }));

  const key = LANG + doing + "|" + queued + "|" + done;
  if (key === statsKey) return;
  statsKey = key;
  const pill = (label, n, color) => {
    const s = el("span", "stat");
    const d = el("i", "dot");
    d.style.setProperty("--c", color);
    s.append(d, document.createTextNode(label + " "), el("b", null, String(n)));
    return s;
  };
  $("stats").replaceChildren(pill(t("stat.doing"), doing, "#fbbf24"), pill(t("stat.queued"), queued, "#60a5fa"), pill(t("stat.done"), done, "#34d399"));
}

function syncTeamLabels() {
  if (!(window.Office3D && Office3D.ready)) return;
  for (const tm of TEAMS) Office3D.setTeamLabel(tm.id, teamName(tm), t("team.count", { n: AGENTS.filter(a => a.team === tm.id).length }));
}

function render(force) {
  updateDesks();
  updateBoard(force);
  updateLog();
  updateStats();
  UI.refresh(force);
}

// 切换界面语言：静态文字、下拉框、示例、3D 标签、面板全部刷新
function applyLanguage(l) {
  setLang(l);
  agentsVersion++;
  statsKey = ""; boardSig = ""; logSig = "";
  renderModes();
  buildSelectAndExamples();
  syncTeamLabels();
  save();
  UI.onLanguage();
  render(true);
}

// ---- 启动 ----
// 从文件读员工和办公室；第一次启动时先把模板写成文件。读不到或内容不能用时继续用模板，并提示。
async function loadOffice() {
  if (!(DESKTOP && desktop.office)) return;
  let r = await desktop.office.load();
  if (r && r.exists === false) {
    r = await desktop.office.write(OfficeDef.seed(LANG, edits));
    if (r && r.ok !== false) { edits = {}; save(); }
  }
  if (!r || r.ok === false || !r.exists) { console.error("office load failed", r); OFFICE.loadError = (r && r.error) || "load"; return; }
  OFFICE.dir = r.dir;
  OFFICE.purpose = r.purpose || "";
  const teams = (r.teams || []).map(x => ({ id: x.id, name: x.name, color: x.color, style: x.style }));
  if (!teams.length) { OFFICE.loadError = "no-teams"; return; }
  const agents = (r.agents || []).map(f => OfficeDef.toAgent(f, teams, LANG));
  if (!agents.length) { OFFICE.loadError = "no-agents"; return; }
  TEAMS.splice(0, TEAMS.length, ...teams);
  // 按团队顺序排员工；同一个团队里按 .md 里的 order（工位顺序），没写的排在后面
  AGENTS.splice(0, AGENTS.length, ...teams.flatMap(tm => agents.filter(a => a.team === tm.id).sort((x, y) => x.order - y.order || x.id.localeCompare(y.id))));
  OFFICE.fromFiles = true;
}

// 页面上显示的 App 名字（桌面 App 里从 package.json 的 productName 来；浏览器里用页面里写的默认名）
function applyAppName() {
  const name = window.desktop && desktop.appName;
  if (!name) return;
  document.title = name;
  const upper = name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toUpperCase();   // MyAIOffice → MY AI OFFICE
  for (const sel of [".tb-title", ".hud-brand b"]) { const e = document.querySelector(sel); if (e) e.textContent = upper; }
}

async function main() {
  applyAppName();
  load();
  setLang(LANG);
  await loadOffice();

  const in3d = window.Office3D && Office3D.init
    ? await Office3D.init($("office"), AGENTS.map(a => ({ id: a.id, team: a.team, color: agentColor(a), look: a.look && a.look.acc ? a.look : null })), TEAMS,
      { pick: id => UI.selectAgent(id), team: id => UI.focusTeam(id), brain: () => UI.open("brain") })
    : false;

  buildOffice(in3d);
  buildCommandBar();
  if (DESKTOP) { desktop.agent.onEvent(onAgentEvent); refreshRealReady(); setInterval(refreshRealReady, 3000); }
  UI.init({ in3d });
  $("hq").textContent = TEAMS.length + " teams · " + AGENTS.length + " agents · 1 brain";
  if (OFFICE.loadError) UI.toast(t("office.loadError", { error: OFFICE.loadError }), { kind: "warn", ttl: 12000 });
  // 编辑办公室后页面会重新载入：回到设置页的办公室那一段
  try { if (sessionStorage.getItem("reopen") === "office") { sessionStorage.removeItem("reopen"); UI.open("settings"); setTimeout(() => { const s = document.getElementById("set-office"); if (s) s.scrollIntoView(); }, 50); } } catch (_) { /* 不可用时忽略 */ }
  syncTeamLabels();

  $("task-form").addEventListener("submit", e => {
    e.preventDefault();
    const input = $("task-title");
    const title = input.value.trim();
    if (!title) return;
    addTask(title, $("task-agent").value, $("task-handoff").checked);
    input.value = "";
    input.focus();
  });

  render(true);
  requestAnimationFrame(now => { last = now; requestAnimationFrame(tick); });
}
main();
