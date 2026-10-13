"use strict";

// MyAIOffice 桌面外壳：无边框窗口、自定义标题栏、系统通知、项目文件夹选择。
// 渲染进程（index.html）不开 Node 权限，只能通过 preload.js 暴露的 window.desktop 调用这里的功能。
const { app, BrowserWindow, ipcMain, dialog, Notification, shell, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const { runAgent, discuss, readFile, resolveInside, readNotes, strength } = require("./agent");

const CONFIG_FILE = () => path.join(app.getPath("userData"), "config.json");
let win = null;
let config = { projectDir: null, sources: [], caps: { commands: false } };
let savedProjectDir;   // 开发时用环境变量临时换了项目文件夹的话，这里记着真正该保存的值

function loadConfig() {
  try { Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8"))); } catch (_) { /* 首次启动没有配置 */ }
  if (config.projectDir && !fs.existsSync(config.projectDir)) config.projectDir = null;
  if (!Array.isArray(config.sources)) config.sources = [];
  if (!config.caps || typeof config.caps !== "object") config.caps = { commands: false };
  if (process.env.MYAIOFFICE_PROJECT) { savedProjectDir = config.projectDir; config.projectDir = process.env.MYAIOFFICE_PROJECT; }   // 开发用：临时指定项目文件夹（不保存）
}
function saveConfig() {
  const toSave = process.env.MYAIOFFICE_PROJECT ? Object.assign({}, config, { projectDir: savedProjectDir || null }) : config;
  try { fs.writeFileSync(CONFIG_FILE(), JSON.stringify(toSave, null, 2)); } catch (_) { /* 写不了就算了，下次再选 */ }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 620,
    frame: false, backgroundColor: "#05070f", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  const headlessTest = process.argv.some(a => a.startsWith("--screenshot="));
  win.once("ready-to-show", () => { if (process.argv.includes("--hidden")) return; if (headlessTest) win.showInactive(); else win.show(); });

  // 不允许页面跳到别处，也不允许弹新窗口；外部链接交给系统浏览器
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.on("closed", () => { win = null; });

  // 开发用：--screenshot=文件路径，启动几秒后截图并退出，用来自动检查界面
  const shot = process.argv.find(a => a.startsWith("--screenshot="));
  const evalArg = process.argv.find(a => a.startsWith("--eval="));   // 开发用：截图前先在页面里执行一段脚本
  if (shot) {
    const evalOut = process.argv.find(a => a.startsWith("--eval-out="));
    if (evalArg) win.webContents.once("did-finish-load", () => setTimeout(() => win.webContents.executeJavaScript(evalArg.slice(7))
      .then(r => { if (evalOut) fs.writeFileSync(evalOut.slice(11), typeof r === "string" ? r : JSON.stringify(r, null, 2)); })
      .catch(err => { if (evalOut) fs.writeFileSync(evalOut.slice(11), "EVAL_ERROR " + err); }), 3000));
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(shot.slice("--screenshot=".length), image.toPNG());
      app.quit();
    }, Number(process.env.MYAIOFFICE_SHOT_DELAY) || 7000));
  }
}

ipcMain.on("window-control", (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  if (action === "minimize") w.minimize();
  else if (action === "maximize") { if (w.isMaximized()) w.unmaximize(); else w.maximize(); }
  else if (action === "close") w.close();
});

ipcMain.on("notify", (_e, title, body) => {
  if (Notification.isSupported()) new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300) }).show();
});

ipcMain.handle("project:get", () => config.projectDir);
ipcMain.handle("project:pick", async e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return config.projectDir;
  config.projectDir = r.filePaths[0];
  saveConfig();
  return config.projectDir;
});

// ---- AI 池：多个来源，都走 OpenAI 兼容接口（NVIDIA NIM、OpenRouter、Groq、本地 Ollama、自定义…）----
// 来源的设置存在 config.sources；API Key 用系统加密存储单独保存，只在主进程里使用，永远不发给页面。
// source: { id, name, baseUrl, model, tier: "strong" | "light", enabled }
const KEYS_FILE = () => path.join(app.getPath("userData"), "keys.json");

function readKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE(), "utf8")); } catch (_) { return {}; }
}
function getKey(source) {
  const enc = readKeys()[source.id];
  if (enc) { try { return safeStorage.decryptString(Buffer.from(enc, "base64")); } catch (_) { /* 解密失败当作没有 */ } }
  if (process.env.NVIDIA_API_KEY && /nvidia\.com/i.test(source.baseUrl)) return process.env.NVIDIA_API_KEY.trim();   // 开发时可用环境变量
  return null;
}
const isLocal = url => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
const findSource = id => (config.sources || []).find(s => s.id === id);
// 给页面看的打码 Key：只露出开头和末尾几位，中间用圆点代替
const maskKey = key => (!key ? "" : key.length <= 12 ? "•".repeat(key.length) : key.slice(0, 6) + "•".repeat(10) + key.slice(-4));
const publicSource = s => { const key = getKey(s); return Object.assign({}, s, { hasKey: !!key, keyMask: maskKey(key), needsKey: !isLocal(s.baseUrl) }); };

async function callSource(source, pathname, body, timeoutMs = 60000) {
  const key = getKey(source);
  if (!key && !isLocal(source.baseUrl)) return { ok: false, error: "no-key" };
  try {
    const headers = { Accept: "application/json" };
    if (key) headers.Authorization = "Bearer " + key;
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(source.baseUrl.replace(/\/+$/, "") + pathname, {
      method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { /* 不是 JSON */ }
    if (Array.isArray(data)) data = data[0];   // 有的服务把错误包在数组里
    if (!res.ok) {
      const msg = data && (data.detail || data.title || (data.error && (data.error.message || data.error)));
      return { ok: false, status: res.status, error: (typeof msg === "string" ? msg : "") || text.slice(0, 200) || res.statusText };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.name === "TimeoutError" ? "timeout" : String((e.cause && e.cause.code) || e.message || e) };
  }
}

ipcMain.handle("pool:list", () => (config.sources || []).map(publicSource));
ipcMain.handle("pool:save", (_e, input) => {
  input = input || {};
  const baseUrl = String(input.baseUrl || "").trim();
  if (!/^https?:\/\/\S+$/i.test(baseUrl)) return { ok: false, error: "bad-url" };
  const clean = {
    id: input.id && findSource(input.id) ? input.id : "src-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: String(input.name || "").trim().slice(0, 40) || "AI",
    baseUrl, model: input.model ? String(input.model).slice(0, 120) : null,
    tier: input.tier === "light" ? "light" : "strong", enabled: input.enabled !== false,
  };
  const i = config.sources.findIndex(s => s.id === clean.id);
  if (i >= 0) config.sources[i] = clean; else config.sources.push(clean);
  saveConfig();
  return { ok: true, source: publicSource(clean) };
});
ipcMain.handle("pool:remove", (_e, id) => {
  config.sources = config.sources.filter(s => s.id !== id);
  saveConfig();
  const keys = readKeys();
  delete keys[id];
  try { fs.writeFileSync(KEYS_FILE(), JSON.stringify(keys)); } catch (_) { /* 忽略 */ }
  return { ok: true };
});
ipcMain.handle("pool:move", (_e, id, dir) => {
  const i = config.sources.findIndex(s => s.id === id), j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= config.sources.length) return { ok: false };
  [config.sources[i], config.sources[j]] = [config.sources[j], config.sources[i]];
  saveConfig();
  return { ok: true };
});
ipcMain.handle("pool:setKey", (_e, id, key) => {
  if (!findSource(id)) return { ok: false, error: "no-source" };
  key = String(key || "").trim();
  try {
    const keys = readKeys();
    if (!key) delete keys[id];
    else {
      if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "encryption-unavailable" };
      keys[id] = safeStorage.encryptString(key).toString("base64");
    }
    fs.writeFileSync(KEYS_FILE(), JSON.stringify(keys));
    return { ok: true, keyMask: maskKey(key) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("pool:models", async (_e, id) => {
  const s = findSource(id);
  if (!s) return { ok: false, error: "no-source" };
  const r = await callSource(s, "/models");
  if (!r.ok) return r;
  const list = (r.data && (r.data.data || r.data.models)) || [];
  return { ok: true, models: list.map(m => m.id || m.name).filter(Boolean).sort() };
});
ipcMain.handle("pool:test", async (_e, id) => {
  const s = findSource(id);
  if (!s) return { ok: false, error: "no-source" };
  if (!s.model) return { ok: false, error: "no-model" };
  const t0 = Date.now();
  const r = await callSource(s, "/chat/completions", { model: s.model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 64, temperature: 0,
    tools: [{ type: "function", function: { name: "noop", description: "Does nothing.", parameters: { type: "object", properties: {} } } }], tool_choice: "auto" });
  if (!r.ok) return r;
  const msg = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message;
  return { ok: true, text: String((msg && msg.content) || "").trim().slice(0, 200) || "OK", ms: Date.now() - t0 };
});

// 员工的额外授权：是否允许运行命令。Blender 装了的话，允许运行命令时员工也能用它的后台模式。
function findBlender() {
  const base = "C:\\Program Files\\Blender Foundation";
  try {
    const dir = fs.readdirSync(base).filter(d => /^Blender/i.test(d)).sort().pop();
    const exe = dir && path.join(base, dir, "blender.exe");
    return exe && fs.existsSync(exe) ? exe : null;
  } catch (_) { return null; }
}
const currentCaps = () => ({ commands: !!config.caps.commands, blender: config.caps.commands ? findBlender() : null });
ipcMain.handle("caps:get", () => ({ commands: !!config.caps.commands, blenderFound: !!findBlender() }));
ipcMain.handle("caps:set", (_e, caps) => { config.caps.commands = !!(caps && caps.commands); saveConfig(); return { commands: config.caps.commands, blenderFound: !!findBlender() }; });

// 查看项目文件夹里的文件（任务详情页用）
ipcMain.handle("files:read", (_e, rel) => {
  if (!config.projectDir) return { ok: false, error: "no-project" };
  try { return { ok: true, text: readFile(config.projectDir, rel) }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("files:notes", () => (config.projectDir ? readNotes(config.projectDir) : ""));
ipcMain.handle("files:reveal", (_e, rel) => {
  if (!config.projectDir) return false;
  try { shell.showItemInFolder(resolveInside(config.projectDir, rel)); return true; } catch (_) { return false; }
});

// 同一家的备用模型：选定的模型额度用完或下线时先换这些，再换下一家。每小时最多查一次模型列表。
const ALT_NOT_CHAT = /embed|imagen|image|veo|tts|audio|speech|whisper|parakeet|aqa|live|rerank|guard|clip|vision-only|robotics|computer-use|lyria|nano-banana|transcribe|translate/i;
const ALT_PREFS = [/gemini-[\d.]+-pro(-preview)?$/i, /gemini-3\.\d+-flash$/i, /gemini-3\.\d+-flash-lite$/i, /gemini-2\.\d+-flash$/i, /gpt-oss-120b/i, /qwen3/i, /gpt-oss/i, /kimi/i, /deepseek/i, /llama-3\.3-70b/i, /mistral-large/i];
const altCache = new Map();   // source.id -> { at, models }
// 体检：实测这一家的每个对话模型能不能调用工具、要多久。结果存进设置，之后只从通过的里面挑。
const scans = new Map();   // source.id -> { done, total, running }
async function scanSource(source) {
  if (scans.get(source.id) && scans.get(source.id).running) return;
  const r = await callSource(source, "/models", null, 20000);
  if (!r.ok) { scans.set(source.id, { done: 0, total: 0, running: false, error: r.error }); return; }
  const ids = ((r.data && (r.data.data || r.data.models)) || []).map(m => m.id || m.name).filter(id => id && !ALT_NOT_CHAT.test(id));
  const state = { done: 0, total: ids.length, running: true };
  scans.set(source.id, state);
  const passed = [];
  const queue = ids.slice();
  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      const t0 = Date.now();
      const res = await callSource(source, "/chat/completions", {
        model: id, max_tokens: 200, temperature: 0,
        messages: [{ role: "user", content: "Call the ping tool with value \"ok\". Do not write anything else." }],
        tools: [{ type: "function", function: { name: "ping", description: "Connectivity check.", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } } }],
        tool_choice: "auto",
      }, 30000);
      const msg = res.ok && res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message;
      if (msg && (msg.tool_calls || []).some(c => c.function && c.function.name === "ping")) passed.push({ id, ms: Date.now() - t0 });
      else if (res.status === 429) await new Promise(ok => setTimeout(ok, 4000));   // 限速了，缓一缓
      state.done++;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  config.verified = config.verified || {};
  config.verified[source.id] = { at: Date.now(), tested: ids.length, models: passed };
  state.running = false;
  altCache.delete(source.id);
  saveConfig();
}
ipcMain.handle("pool:scan", (_e, id) => { const s = findSource(id); if (s) scanSource(s); return !!s; });
ipcMain.handle("pool:scanStatus", (_e, id) => {
  const v = config.verified && config.verified[id];
  return { progress: scans.get(id) || null, verified: v ? { at: v.at, tested: v.tested, count: v.models.length, models: v.models.map(m => m.id) } : null };
});

async function altModels(source) {
  // 体检过：用实测通过的型号（去掉太慢的），按强弱排
  const v = config.verified && config.verified[source.id];
  if (v && v.models.length) {
    return v.models.filter(m => m.ms < 25000 && m.id !== source.model).map(m => m.id).sort((a, b) => strength(b) - strength(a)).slice(0, 8);
  }
  const hit = altCache.get(source.id);
  if (hit && Date.now() - hit.at < 3600000 && hit.primary === source.model) return hit.models;
  const r = await callSource(source, "/models", null, 20000);
  let models = [];
  if (r.ok) {
    const ids = ((r.data && (r.data.data || r.data.models)) || []).map(m => m.id || m.name).filter(id => id && !ALT_NOT_CHAT.test(id) && id !== source.model);
    const newest = (a, b) => b.localeCompare(a, undefined, { numeric: true });
    for (const re of ALT_PREFS) for (const id of ids.filter(x => re.test(x)).sort(newest).slice(0, 3)) if (!models.includes(id)) models.push(id);
    models = models.slice(0, 6);
  }
  altCache.set(source.id, { at: Date.now(), primary: source.model, models });
  return models;
}

// ---- 员工真干活 ----
const pendingAsks = new Map();   // 等用户批准的操作：id -> { resolve, taskId }
const cancelledRuns = new Set();   // 被用户取消的任务 id
let askSeq = 0;

ipcMain.handle("agent:available", () => ({
  project: !!config.projectDir,
  ai: (config.sources || []).some(s => s.enabled && s.model && (getKey(s) || isLocal(s.baseUrl))),
}));
ipcMain.handle("agent:run", async (e, req) => {
  req = req || {};
  const send = payload => { if (!e.sender.isDestroyed()) e.sender.send("agent:event", Object.assign({ taskId: req.taskId }, payload)); };
  try {
    return await runAgent({
      projectDir: config.projectDir, title: String(req.title || "").slice(0, 2000),
      agentName: String(req.agentName || "Agent").slice(0, 60), agentRole: String(req.agentRole || "").slice(0, 80),
      brief: String(req.brief || "").slice(0, 1000), context: String(req.context || "").slice(0, 3000),
      team: String(req.team || "").slice(0, 800), allowHandoff: !!req.allowHandoff, caps: currentCaps(),
      chat: !!req.chat, history: Array.isArray(req.history) ? req.history.slice(-8) : [],
      scope: req.scope && Array.isArray(req.scope.allow) ? { allow: req.scope.allow.slice(0, 20).map(String), hint: String(req.scope.hint || "").slice(0, 200) } : null,
      mode: req.mode, lang: req.lang,
    }, {
      sources: () => config.sources || [],
      alts: altModels,
      cancelled: () => cancelledRuns.has(req.taskId),
      call: (source, pathname, body) => callSource(source, pathname, body, 90000),
      // 用不了的型号记在设置里，重启 App 后仍然有效
      coolUntil: key => (config.cool && config.cool[key]) || 0,
      cool: (key, until) => {
        config.cool = config.cool || {};
        for (const k in config.cool) if (config.cool[k] < Date.now()) delete config.cool[k];
        config.cool[key] = until;
        saveConfig();
      },
      emit: send,
      ask: question => new Promise(resolve => {
        const id = ++askSeq;
        pendingAsks.set(id, { resolve, taskId: req.taskId });
        send(Object.assign({ type: "ask", askId: id }, question));
      }),
    });
  } catch (err) {
    return { ok: false, error: "crash", detail: String(err.message || err) };
  }
});
ipcMain.on("agent:answer", (_e, id, allow) => {
  const p = pendingAsks.get(id);
  if (p) { pendingAsks.delete(id); p.resolve(typeof allow === "string" ? allow.slice(0, 2000) : !!allow); }
});

// 取消正在执行的任务：下一步开始前停下；如果正在等用户回答，按"不同意"处理
ipcMain.on("agent:cancel", (_e, taskId) => {
  cancelledRuns.add(taskId);
  for (const [id, p] of pendingAsks) if (p.taskId === taskId) { pendingAsks.delete(id); p.resolve(false); }
});
// 群聊讨论里的一次发言 / 结论
let talkCancelled = false;
ipcMain.on("agent:talkStop", () => { talkCancelled = true; });
ipcMain.handle("agent:say", async (_e, req) => {
  req = req || {};
  if (req.first) talkCancelled = false;
  try {
    return await discuss({
      mode: req.mode === "plan" ? "plan" : "turn", agentName: String(req.agentName || "").slice(0, 60), agentRole: String(req.agentRole || "").slice(0, 80),
      brief: String(req.brief || "").slice(0, 600), topic: String(req.topic || "").slice(0, 1000), transcript: String(req.transcript || "").slice(0, 8000),
      team: String(req.team || "").slice(0, 800), lang: req.lang, commands: !!config.caps.commands,
    }, {
      sources: () => config.sources || [], alts: altModels,
      call: (source, pathname, body) => callSource(source, pathname, body, 60000),
      coolUntil: key => (config.cool && config.cool[key]) || 0,
      cool: (key, until) => { config.cool = config.cool || {}; config.cool[key] = until; saveConfig(); },
      cancelled: () => talkCancelled,
    });
  } catch (err) { return { ok: false, error: "crash", detail: String(err.message || err) }; }
});

// 只允许一个实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { loadConfig(); createWindow(); });
  app.on("window-all-closed", () => app.quit());
}
