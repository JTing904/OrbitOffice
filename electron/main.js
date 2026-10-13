"use strict";

// OrbitOffice 桌面外壳：无边框窗口、自定义标题栏、系统通知、项目文件夹选择。
// 渲染进程（index.html）不开 Node 权限，只能通过 preload.js 暴露的 window.desktop 调用这里的功能。
const { app, BrowserWindow, ipcMain, dialog, Notification, shell, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");
const { runAgent, discuss, compose, summarizeNotes, readFile, resolveInside, readNotes, strength } = require("./agent");
const mcp = require("./mcp");
const office = require("./office");
const memory = require("./memory");
const localai = require("./localai");
const skills = require("./skills");

// 设置和数据放在哪：老用户继续用原来的 %APPDATA%/myaioffice（改了产品名也不丢设置、Key 和记录）；新用户用产品名命名的文件夹
{
  const legacy = path.join(app.getPath("appData"), "myaioffice");
  const explicit = process.argv.some(x => x.startsWith("--user-data-dir"));   // 启动时指定了别的目录（例如测试）就听它的
  if (!explicit && fs.existsSync(path.join(legacy, "config.json"))) app.setPath("userData", legacy);
}
const APP_ICON = path.join(__dirname, "..", "assets", "icon", "icon.png");

const CONFIG_FILE = () => path.join(app.getPath("userData"), "config.json");
let win = null;
let config = { projectDir: null, sources: [], caps: { commands: false }, connectors: [] };
let savedProjectDir;   // 开发时用环境变量临时换了项目文件夹的话，这里记着真正该保存的值

function loadConfig() {
  try { Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8"))); } catch (_) { /* 首次启动没有配置 */ }
  if (config.projectDir && !fs.existsSync(config.projectDir)) config.projectDir = null;
  if (!Array.isArray(config.sources)) config.sources = [];
  if (!Array.isArray(config.connectors)) config.connectors = [];
  // 员工默认就能上网搜索、读网页（DuckDuckGo，不用 Key）：第一次启动时自动加上；用户删掉后不再加回来
  if (!config.webSeeded) {
    config.webSeeded = true;
    if (!config.connectors.some(c => /duckduckgo-mcp-server/.test(c.command || ""))) {
      config.connectors.unshift({ id: "conn-web", name: "Web search", type: "stdio", command: "uvx duckduckgo-mcp-server", enabled: true, trusted: true, secrets: [] });
    }
    saveConfig();
  }
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
    frame: false, backgroundColor: "#05070f", show: false, title: app.getName(),
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, "..", "index.html"));
  // 开发用：--size=宽x高，测试小窗口下的布局
  const sizeArg = process.argv.find(x => /^--size=\d+x\d+$/.test(x));
  if (sizeArg) { const [w, h] = sizeArg.slice(7).split("x").map(Number); win.setSize(w, h); }
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
  else if (action === "reload") w.webContents.reload();   // 改了办公室结构后重搭 3D 场景（页面自己的 location.reload 会被防跳转拦下）
});

// 产品名（package.json 的 productName），页面上显示的名字都用它
ipcMain.on("app:name", e => { e.returnValue = app.getName(); });

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

// ---- 用量：每家 AI 每天调用了多少次、用了多少 token；服务商在回应里告诉剩余额度时也记下来 ----
// config.usage = { "2026-10-14": { sourceId: { calls, prompt, completion } } }，只留最近 30 天
// config.limits = { sourceId: { remainingRequests, limitRequests, remainingTokens, limitTokens, at } }
const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
let usageSaveTimer = null;
function recordUsage(source, usage, headers) {
  const day = dayKey();
  config.usage = config.usage || {};
  const today = config.usage[day] = config.usage[day] || {};
  const u = today[source.id] = today[source.id] || { calls: 0, prompt: 0, completion: 0 };
  u.calls++;
  if (usage) { u.prompt += Number(usage.prompt_tokens) || 0; u.completion += Number(usage.completion_tokens) || 0; }
  const num = name => { const v = headers && headers.get(name); return v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null; };
  const lim = { remainingRequests: num("x-ratelimit-remaining-requests"), limitRequests: num("x-ratelimit-limit-requests"),
    remainingTokens: num("x-ratelimit-remaining-tokens"), limitTokens: num("x-ratelimit-limit-tokens") };
  if (Object.values(lim).some(v => v != null)) { config.limits = config.limits || {}; config.limits[source.id] = Object.assign(lim, { at: Date.now() }); }
  const days = Object.keys(config.usage).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 30))) delete config.usage[d];
  // 每次调用都写文件太频繁：攒几秒再存
  clearTimeout(usageSaveTimer);
  usageSaveTimer = setTimeout(saveConfig, 3000);
}

async function callSource(source, pathname, body, timeoutMs = 60000) {
  const key = getKey(source);
  if (!key && !isLocal(source.baseUrl)) return { ok: false, error: "no-key" };
  try {
    const headers = { Accept: "application/json" };
    if (key) headers.Authorization = "Bearer " + key;
    if (body) headers["Content-Type"] = "application/json";
    if (body && source.local && body.tool_choice && typeof body.tool_choice === "object") body = Object.assign({}, body, { tool_choice: "required" });
    const res = await fetch(source.baseUrl.replace(/\/+$/, "") + pathname, {
      method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { /* 不是 JSON */ }
    if (Array.isArray(data)) data = data[0];   // 有的服务把错误包在数组里
    if (body) recordUsage(source, res.ok && data && data.usage, res.headers);   // 失败的调用也算一次（同样占用额度）
    if (!res.ok) {
      const msg = data && (data.detail || data.title || (data.error && (data.error.message || data.error)));
      return { ok: false, status: res.status, error: (typeof msg === "string" ? msg : "") || text.slice(0, 200) || res.statusText };
    }
    return { ok: true, data, usage: data && data.usage };
  } catch (e) {
    return { ok: false, error: e.name === "TimeoutError" ? "timeout" : String((e.cause && e.cause.code) || e.message || e) };
  }
}

ipcMain.handle("pool:list", () => (config.sources || []).map(publicSource));
// 用量：今天和最近 7 天，按来源分开，外加服务商告诉我们的剩余额度
ipcMain.handle("pool:usage", () => {
  const sum = (a, b) => ({ calls: a.calls + b.calls, prompt: a.prompt + b.prompt, completion: a.completion + b.completion });
  const zero = { calls: 0, prompt: 0, completion: 0 };
  const usage = config.usage || {};
  const today = usage[dayKey()] || {};
  const week = {};
  for (let i = 0; i < 7; i++) {
    const d = usage[dayKey(new Date(Date.now() - i * 86400000))] || {};
    for (const id in d) week[id] = sum(week[id] || zero, d[id]);
  }
  return { today, week, limits: config.limits || {} };
});
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
// 授权目标：攻击者可以测试的、本机以外的主机/IP（用户自己拥有并允许被测的）。只留主机名或 IP。
const cleanTargets = list => [...new Set((Array.isArray(list) ? list : []).map(t => String(t || "").trim().toLowerCase()
  .replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^\[|\]$/g, ""))
  .filter(t => /^(\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z]{2,}|[a-z0-9-]+)$/i.test(t) && !/^(localhost|127\.|0\.0\.0\.0|::1)/.test(t)))].slice(0, 30);
const currentTargets = () => cleanTargets(config.caps.targets);
ipcMain.handle("caps:get", () => ({ commands: !!config.caps.commands, blenderFound: !!findBlender(), targets: currentTargets() }));
ipcMain.handle("caps:set", (_e, caps) => {
  if (caps && "commands" in caps) config.caps.commands = !!caps.commands;
  if (caps && "targets" in caps) config.caps.targets = cleanTargets(caps.targets);
  saveConfig();
  return { commands: !!config.caps.commands, blenderFound: !!findBlender(), targets: currentTargets() };
});

// ---- 连接器（MCP）：接上外部工具给员工用 ----
// connector: { id, name, type: "stdio" | "http", command, url, enabled, trusted, secrets: [名字] }
// 配置里带的密钥（环境变量、请求头）和 API Key 一样加密单独存，页面只看得到名字。
function connSecret(id) {
  const enc = readKeys()["conn:" + id];
  if (!enc) return {};
  try { return JSON.parse(safeStorage.decryptString(Buffer.from(enc, "base64"))); } catch (_) { return {}; }
}
function setConnSecret(id, secret) {
  const keys = readKeys();
  const has = secret && (Object.keys(secret.env || {}).length || Object.keys(secret.headers || {}).length);
  if (!has) delete keys["conn:" + id];
  else {
    if (!safeStorage.isEncryptionAvailable()) return false;
    keys["conn:" + id] = safeStorage.encryptString(JSON.stringify(secret)).toString("base64");
  }
  try { fs.writeFileSync(KEYS_FILE(), JSON.stringify(keys)); return true; } catch (_) { return false; }
}
const findConn = id => config.connectors.find(c => c.id === id);
const publicConn = c => Object.assign({}, c, mcp.status(c.id));
const startConn = c => { if (c.enabled) mcp.connect(c, connSecret(c.id)); else mcp.stop(c.id); };

ipcMain.handle("conn:list", () => config.connectors.map(publicConn));
ipcMain.handle("conn:add", (_e, text) => {
  let found;
  try { found = mcp.parseInput(String(text || "").slice(0, 8000)); } catch (e) { return { ok: false, error: e.message }; }
  if (!found.length) return { ok: false, error: "bad-input" };
  if (config.connectors.length + found.length > 12) return { ok: false, error: "too-many" };
  for (const f of found) {
    const c = {
      id: "conn-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(f.name || "Connector").slice(0, 40), type: f.type, command: f.command, url: f.url, enabled: true, trusted: false,
      secrets: Object.keys(f.secret.env || {}).concat(Object.keys(f.secret.headers || {})),
    };
    if (c.secrets.length && !setConnSecret(c.id, f.secret)) return { ok: false, error: "encryption-unavailable" };
    config.connectors.push(c);
    startConn(c);
  }
  saveConfig();
  return { ok: true, added: found.length };
});
ipcMain.handle("conn:update", (_e, id, patch) => {
  const c = findConn(id);
  if (!c) return { ok: false };
  patch = patch || {};
  if (typeof patch.name === "string" && patch.name.trim()) c.name = patch.name.trim().slice(0, 40);
  if (typeof patch.trusted === "boolean") { c.trusted = patch.trusted; mcp.setTrusted(id, c.trusted); }
  if (typeof patch.enabled === "boolean" && patch.enabled !== c.enabled) { c.enabled = patch.enabled; startConn(c); }
  else if (typeof patch.name === "string" && c.enabled) startConn(c);   // 工具名的前缀跟着名字走
  saveConfig();
  return { ok: true };
});
ipcMain.handle("conn:reconnect", (_e, id) => { const c = findConn(id); if (c && c.enabled) startConn(c); return !!c; });
ipcMain.handle("conn:remove", (_e, id) => {
  mcp.stop(id);
  config.connectors = config.connectors.filter(c => c.id !== id);
  setConnSecret(id, null);
  saveConfig();
  return { ok: true };
});

// ---- 内置本地 AI（见 localai.js）：下载、启动，并作为一个来源加进 AI 池 ----
// config.localAI = { model, enabled }：开 App 时自动启动上次用的模型
const LOCAL_ID = "local-ai";
let hwCache = null;
const hardware = async () => (hwCache = hwCache || await localai.detect());
function upsertLocalSource(modelId, name, enabled) {
  const st = localai.status().running;
  let s = findSource(LOCAL_ID);
  if (!s) { s = { id: LOCAL_ID, name: name || "Local AI", tier: "strong" }; config.sources.push(s); }
  Object.assign(s, { baseUrl: "http://127.0.0.1:" + localai.PORT + "/v1", model: modelId, enabled: !!enabled, local: true, ctx: st ? st.ctx : 16384 });
  if (name) s.name = name;
  altCache.delete(LOCAL_ID);
  if (config.verified) delete config.verified[LOCAL_ID];   // 本地只有一个模型，不需要体检出来的备用列表
  saveConfig();
}
ipcMain.handle("local:detect", async () => {
  try {
    const hw = await hardware();
    const list = localai.assess(hw);
    return { ok: true, hw, list, recommended: localai.recommend(list), status: localai.status(), config: config.localAI || null };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("local:status", () => Object.assign(localai.status(), { config: config.localAI || null }));
// 下载（如果还没有）并启动；完成前一直等着，进度用 local:status 查
ipcMain.handle("local:enable", async (_e, modelId, name) => {
  try {
    const hw = await hardware();
    await localai.install(modelId, hw);
    await localai.start(modelId, hw);
    config.localAI = { model: modelId, enabled: true };
    upsertLocalSource(modelId, name, true);
    return { ok: true, status: localai.status() };
  } catch (e) { return { ok: false, error: String(e.message || e), status: localai.status() }; }
});
ipcMain.handle("local:disable", () => {
  localai.stop();
  if (config.localAI) config.localAI.enabled = false;
  const s = findSource(LOCAL_ID);
  if (s) { s.enabled = false; saveConfig(); }
  return localai.status();
});
ipcMain.handle("local:cancel", () => { localai.cancel(); return true; });
ipcMain.handle("local:remove", (_e, modelId) => {
  try {
    if (config.localAI && config.localAI.model === modelId) { config.localAI.enabled = false; const s = findSource(LOCAL_ID); if (s) s.enabled = false; saveConfig(); }
    localai.remove(modelId);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
async function autoStartLocal() {
  const c = config.localAI;
  if (!c || !c.enabled) return;
  try { const hw = await hardware(); await localai.start(c.model, hw); upsertLocalSource(c.model, null, true); }
  catch (_) { const s = findSource(LOCAL_ID); if (s) { s.enabled = false; saveConfig(); } }   // 起不来就先停用，设置里会显示原因
}

// ---- 技能库（见 skills.js）----
const skillCall = fn => { try { return { ok: true, value: fn() }; } catch (e) { return { ok: false, error: String(e.message || e) }; } };
ipcMain.handle("skills:list", () => skillCall(() => skills.list()));
ipcMain.handle("skills:read", (_e, id) => skillCall(() => skills.read(String(id))));
ipcMain.handle("skills:write", (_e, id, text) => skillCall(() => skills.write(String(id), String(text || ""))));
ipcMain.handle("skills:create", (_e, name, text) => skillCall(() => { const id = skills.uniqueId(String(name || "")); skills.write(id, String(text || "")); return id; }));
ipcMain.handle("skills:remove", (_e, id) => skillCall(() => skills.remove(String(id))));
ipcMain.handle("skills:importText", (_e, name, text) => skillCall(() => skills.importText(String(name || ""), String(text || "").slice(0, 200 * 1024))));
// 导入技能：选一个技能文件夹（里面有 SKILL.md），或者一个或多个 .md 文件
ipcMain.handle("skills:importFolder", async e => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return { ok: true, value: null };
  return skillCall(() => skills.importFolder(r.filePaths[0]));
});
ipcMain.handle("skills:pickFiles", async e => { try { return { ok: true, value: await pickTextFiles(e, true) }; } catch (err) { return { ok: false, error: String(err.message || err) }; } });
ipcMain.handle("skills:openDir", () => { shell.openPath(skills.dir()); return true; });

// ---- 办公室和员工：存成文件（见 office.js），用户可以增删改 ----
const userDir = () => app.getPath("userData");
const wrap = fn => { try { return fn(); } catch (e) { return { ok: false, error: String(e.message || e) }; } };
ipcMain.handle("office:load", () => wrap(() => office.load(userDir())));
ipcMain.handle("office:write", (_e, change) => wrap(() => office.write(userDir(), change || {})));
ipcMain.handle("office:removeRef", (_e, id, name) => wrap(() => office.removeRef(userDir(), id, name)));
ipcMain.handle("office:addRefText", (_e, id, name, text) => wrap(() => office.addRef(userDir(), id, name, text)));
// 用系统的选择文件窗口挑 .md / .txt：作为参考资料放进某个员工，或作为新员工导入
async function pickTextFiles(e, multi) {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    properties: multi ? ["openFile", "multiSelections"] : ["openFile"], filters: [{ name: "Markdown", extensions: ["md", "txt"] }],
  });
  if (r.canceled) return [];
  return r.filePaths.slice(0, 20).map(p => ({ name: path.basename(p), text: fs.readFileSync(p, "utf8").slice(0, 200 * 1024) }));
}
ipcMain.handle("office:addRefFiles", async (e, id) => {
  try {
    let refs = null;
    for (const f of await pickTextFiles(e, true)) refs = office.addRef(userDir(), id, f.name, f.text);
    return { ok: true, refs };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
});
ipcMain.handle("office:pickFiles", async e => { try { return { ok: true, files: await pickTextFiles(e, true) }; } catch (err) { return { ok: false, error: String(err.message || err) }; } });
ipcMain.handle("office:openDir", () => { const d = office.dirs(userDir()).root; fs.mkdirSync(d, { recursive: true }); shell.openPath(d); return d; });

// 查看项目文件夹里的文件（任务详情页用）
ipcMain.handle("files:read", (_e, rel) => {
  if (!config.projectDir) return { ok: false, error: "no-project" };
  try { return { ok: true, text: readFile(config.projectDir, rel) }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle("files:notes", () => (config.projectDir ? readNotes(config.projectDir) : ""));
ipcMain.handle("files:memory", () => (config.projectDir ? { count: memory.historyCount(config.projectDir) } : { count: 0 }));
// 出错时用默认值：记忆只是辅助，不能因为它让任务失败
function safe(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }
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
  const spent = { calls: 0, prompt: 0, completion: 0 };
  try {
    const res = await runAgent({
      projectDir: config.projectDir, title: String(req.title || "").slice(0, 2000),
      agentName: String(req.agentName || "Agent").slice(0, 60), agentRole: String(req.agentRole || "").slice(0, 80),
      brief: String(req.brief || "").slice(0, 8000), context: String(req.context || "").slice(0, 3000),
      skills: Array.isArray(req.skills) ? req.skills.slice(0, 20).map(s => String(s).slice(0, 60)) : [],
      refs: req.agentId ? office.refsText(userDir(), String(req.agentId)) : "",
      purpose: String(req.purpose || "").slice(0, 2000), external: !!req.external,
      skillCatalog: safe(() => skills.catalog(), ""),
      skillHints: safe(() => skills.match(String(req.title || "") + " " + String(req.origin || "")).map(s => s.id).join(", "), ""),
      memory: config.projectDir ? safe(() => memory.memoryText(config.projectDir, String(req.title || "") + " " + String(req.origin || "")), "") : "", origin: String(req.origin || "").slice(0, 600),
      team: String(req.team || "").slice(0, 800), allowHandoff: !!req.allowHandoff, caps: currentCaps(),
      chat: !!req.chat, history: Array.isArray(req.history) ? req.history.slice(-8) : [],
      scope: req.scope && Array.isArray(req.scope.allow) ? { allow: req.scope.allow.slice(0, 20).map(String), hint: String(req.scope.hint || "").slice(0, 200) } : null,
      mode: req.mode, lang: req.lang, localOnly: !!req.localOnly, targets: req.localOnly ? currentTargets() : [],
    }, {
      sources: () => config.sources || [],
      alts: altModels,
      cancelled: () => cancelledRuns.has(req.taskId),
      connectorTools: () => mcp.agentTools(),
      skill: (id, file) => { const r = skills.readForAgent(id, file); return { name: r.skill.name, text: r.text, external: r.skill.external }; },
      callTool: mcp.callTool,
      call: async (source, pathname, body) => {
        const r = await callSource(source, pathname, body, 90000);
        spent.calls++;
        if (r.usage) { spent.prompt += Number(r.usage.prompt_tokens) || 0; spent.completion += Number(r.usage.completion_tokens) || 0; }
        return r;
      },
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
    // 记进项目记忆（聊天里只回答问题、什么都没动的不记）；笔记太长时在后台整理
    if (config.projectDir && (!req.chat || (res.files || []).length) && res.error !== "cancelled") {
      safe(() => memory.appendHistory(config.projectDir, { agent: req.agentName, role: req.agentRole, title: req.title, summary: res.summary || res.detail || res.error, files: res.files, ok: res.ok && !res.blocked }));
      memory.compactNotes(config.projectDir, text => summarizeNotes(text, {
        sources: () => config.sources || [], alts: altModels, call: (source, pathname, body) => callSource(source, pathname, body, 90000),
        coolUntil: key => (config.cool && config.cool[key]) || 0,
      })).catch(() => { /* 整理失败就保持原样，下次再试 */ });
    }
    return Object.assign(res, { usage: spent });
  } catch (err) {
    return { ok: false, error: "crash", detail: String(err.message || err), usage: spent };
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
      brief: String(req.brief || "").slice(0, 1500), topic: String(req.topic || "").slice(0, 1000), transcript: String(req.transcript || "").slice(0, 8000),
      team: String(req.team || "").slice(0, 2000), lang: req.lang, commands: !!config.caps.commands, purpose: String(req.purpose || "").slice(0, 2000),
    }, {
      sources: () => config.sources || [], alts: altModels,
      call: (source, pathname, body) => callSource(source, pathname, body, 60000),
      coolUntil: key => (config.cool && config.cool[key]) || 0,
      cool: (key, until) => { config.cool = config.cool || {}; config.cool[key] = until; saveConfig(); },
      cancelled: () => talkCancelled,
    });
  } catch (err) { return { ok: false, error: "crash", detail: String(err.message || err) }; }
});

// 用 AI 帮用户写员工 / 搭办公室
ipcMain.handle("agent:compose", async (_e, req) => {
  req = req || {};
  try {
    return await compose({ kind: ["office", "skill"].includes(req.kind) ? req.kind : "agent", text: String(req.text || "").slice(0, 2000), lang: req.lang,
      purpose: String(req.purpose || "").slice(0, 2000), team: String(req.team || "").slice(0, 2000) }, {
      sources: () => config.sources || [], alts: altModels,
      call: (source, pathname, body) => callSource(source, pathname, body, 120000),
      coolUntil: key => (config.cool && config.cool[key]) || 0,
      cool: (key, until) => { config.cool = config.cool || {}; config.cool[key] = until; saveConfig(); },
    });
  } catch (err) { return { ok: false, error: "crash", detail: String(err.message || err) }; }
});

// 只允许一个实例
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { loadConfig(); localai.init(app.getPath("userData")); skills.init(app.getPath("userData")); createWindow(); config.connectors.forEach(startConn); autoStartLocal(); });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { mcp.stopAll(); localai.stop(); });   // 连接器和本地 AI 启动的程序跟着 App 一起关
}
