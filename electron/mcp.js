"use strict";

// 连接器：用 MCP 协议接上外部工具（Blender、网页抓取、文档查询…），员工就能像用自带工具一样调用它们。
// 两种接法：本地程序（启动一条命令，通过标准输入输出对话）和网址（HTTP）。只实现了工具这一部分，够员工干活用。
const { spawn } = require("child_process");
const os = require("os");

const PROTOCOL = "2025-06-18";
const CLIENT = { name: "MyAIOffice", version: "1.0.0" };
const MAX_TOOLS = 40;          // 交给模型的工具总数上限：太多的话弱一点的模型会选不准
const MAX_RESULT = 20000;

// ---- 本地程序 ----
class Stdio {
  constructor(cfg, secret) {
    this.cfg = cfg; this.secret = secret || {};
    this.pending = new Map(); this.seq = 0; this.buf = ""; this.err = ""; this.closed = false; this.onExit = null;
  }
  start() {
    const env = Object.assign({}, process.env, this.secret.env || {});
    delete env.ELECTRON_RUN_AS_NODE;
    // 用 shell 启动：npx、uvx 在 Windows 上是 .cmd，直接启动会找不到
    this.child = spawn(this.cfg.command, { cwd: os.homedir(), shell: true, env, windowsHide: true });
    this.child.stdout.on("data", chunk => this.read(chunk));
    this.child.stderr.on("data", chunk => { this.err = (this.err + chunk.toString("utf8")).slice(-2000); });
    this.child.on("error", e => this.fail("Could not start: " + e.message));
    this.child.on("close", code => this.fail("The program exited (code " + code + ")" + (this.err.trim() ? ": " + this.err.trim().slice(-400) : "")));
    this.child.stdin.on("error", () => { /* 程序已经退出 */ });
  }
  read(chunk) {
    this.buf += chunk.toString("utf8");
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }   // 有的程序会往标准输出打日志，跳过
      if (msg.id != null && msg.method) {
        // 对方问我们：只应答 ping，其余的说不支持
        this.send(msg.method === "ping" ? { jsonrpc: "2.0", id: msg.id, result: {} } : { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Not supported" } });
      } else if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || "Error " + msg.error.code)); else p.resolve(msg.result || {});
      }
    }
  }
  send(msg) { try { this.child.stdin.write(JSON.stringify(msg) + "\n"); } catch (_) { /* 程序已经退出 */ } }
  request(method, params, timeoutMs) {
    if (this.closed) return Promise.reject(new Error(this.closed));
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("No answer after " + timeoutMs / 1000 + "s")); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }
  notify(method) { this.send({ jsonrpc: "2.0", method }); return Promise.resolve(); }
  fail(reason) {
    if (this.closed) return;
    this.closed = reason;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(reason)); }
    this.pending.clear();
    if (this.onExit) this.onExit(reason);
  }
  close() {
    this.onExit = null;
    this.fail("closed");
    if (!this.child || this.child.exitCode != null) return;
    // 连同它启动的子进程一起结束（shell 外面还包了一层）
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(this.child.pid), "/T", "/F"], { windowsHide: true });
      else this.child.kill();
    } catch (_) { /* 已经退出 */ }
  }
}

// ---- 网址（Streamable HTTP）----
class Http {
  constructor(cfg, secret) { this.cfg = cfg; this.secret = secret || {}; this.seq = 0; this.session = null; this.version = null; this.onExit = null; }
  start() { /* 不需要先建立连接 */ }
  async post(msg, timeoutMs) {
    const headers = Object.assign({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, this.secret.headers || {});
    if (this.session) headers["Mcp-Session-Id"] = this.session;
    if (this.version) headers["MCP-Protocol-Version"] = this.version;
    let res;
    try { res = await fetch(this.cfg.url, { method: "POST", headers, body: JSON.stringify(msg), signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { throw new Error(e.name === "TimeoutError" ? "No answer after " + timeoutMs / 1000 + "s" : String((e.cause && e.cause.code) || e.message || e)); }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.session = sid;
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error("needs-login");
    if (!res.ok) throw new Error(res.status + " " + text.slice(0, 200));
    if (msg.id == null) return null;
    // 回答可能是一段 JSON，也可能是事件流：从里面找出对应这次请求的那一条
    const found = [];
    if (/text\/event-stream/i.test(res.headers.get("content-type") || "")) {
      for (const block of text.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
        if (data) { try { found.push(JSON.parse(data)); } catch (_) { /* 不是 JSON */ } }
      }
    } else { try { const d = JSON.parse(text); found.push(...(Array.isArray(d) ? d : [d])); } catch (_) { /* 不是 JSON */ } }
    const hit = found.find(m => m && m.id === msg.id);
    if (!hit) throw new Error("Unexpected answer from the server");
    if (hit.error) throw new Error(hit.error.message || "Error " + hit.error.code);
    return hit.result || {};
  }
  request(method, params, timeoutMs) { return this.post({ jsonrpc: "2.0", id: ++this.seq, method, params }, timeoutMs); }
  notify(method) { return this.post({ jsonrpc: "2.0", method }, 20000).catch(() => null); }
  close() { this.onExit = null; }
}

// ---- 连接管理 ----
const conns = new Map();   // connector.id -> { id, name, trusted, status, error, tools, transport }

async function connect(cfg, secret) {
  stop(cfg.id);
  const c = { id: cfg.id, name: cfg.name, trusted: !!cfg.trusted, status: "connecting", error: "", tools: [], transport: null };
  conns.set(cfg.id, c);
  const tr = cfg.type === "http" ? new Http(cfg, secret) : new Stdio(cfg, secret);
  c.transport = tr;
  try {
    tr.start();
    // 第一次启动可能要先下载程序（npx、uvx），多等一会儿
    const init = await tr.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT }, 180000);
    tr.version = init.protocolVersion || PROTOCOL;
    await tr.notify("notifications/initialized");
    const tools = [];
    let cursor;
    do {
      const r = await tr.request("tools/list", cursor ? { cursor } : {}, 30000);
      tools.push(...(Array.isArray(r.tools) ? r.tools : []));
      cursor = r.nextCursor;
    } while (cursor && tools.length < 200);
    if (conns.get(cfg.id) !== c) { tr.close(); return c; }   // 等的时候已经被重新连接或删除了
    c.tools = tools.filter(x => x && typeof x.name === "string");
    c.status = "ready";
    tr.onExit = reason => { c.status = "error"; c.error = reason; };
  } catch (e) {
    c.status = "error";
    c.error = String(e.message || e);
    tr.close();
  }
  return c;
}

function stop(id) {
  const c = conns.get(id);
  if (!c) return;
  conns.delete(id);
  if (c.transport) c.transport.close();
}
function stopAll() { for (const id of Array.from(conns.keys())) stop(id); }
function status(id) {
  const c = conns.get(id);
  return c ? { status: c.status, error: c.error, tools: c.tools.map(x => x.name) } : { status: "off", error: "", tools: [] };
}
function setTrusted(id, trusted) { const c = conns.get(id); if (c) c.trusted = !!trusted; }

// 各家模型对参数说明（JSON Schema）的要求不一样，有的遇到不认识的字段就报错：只留最基本的几样
function cleanSchema(s, depth) {
  depth = depth || 0;
  if (!s || typeof s !== "object" || depth > 6) return { type: "string" };
  const alt = Array.isArray(s.anyOf) ? s.anyOf : Array.isArray(s.oneOf) ? s.oneOf : null;
  if (alt) { const pick = alt.find(x => x && x.type !== "null") || {}; s = Object.assign({}, pick, { description: s.description || pick.description }); }
  let type = Array.isArray(s.type) ? s.type.find(x => x !== "null") : s.type;
  if (!["string", "number", "integer", "boolean", "object", "array"].includes(type)) type = s.properties ? "object" : s.items ? "array" : "string";
  const out = { type };
  if (s.description) out.description = String(s.description).slice(0, 300);
  if (Array.isArray(s.enum) && type !== "object" && type !== "array") out.enum = s.enum.slice(0, 40);
  if (type === "object") {
    out.properties = {};
    for (const k of Object.keys(s.properties || {}).slice(0, 30)) out.properties[k] = cleanSchema(s.properties[k], depth + 1);
    if (Array.isArray(s.required)) out.required = s.required.filter(k => k in out.properties);
  }
  if (type === "array") out.items = cleanSchema(s.items, depth + 1);
  return out;
}

// 交给员工的工具清单。工具名加上连接器的前缀，免得和自带工具或别的连接器重名。
function agentTools() {
  const list = [], used = new Set();
  let n = 0;
  for (const c of conns.values()) {
    n++;
    if (c.status !== "ready") continue;
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16) || "c" + n;
    for (const tool of c.tools) {
      if (list.length >= MAX_TOOLS) return list;
      let name = (slug + "__" + tool.name.replace(/[^a-zA-Z0-9_-]/g, "_")).slice(0, 60);
      while (used.has(name)) name += "_";
      used.add(name);
      const params = cleanSchema(tool.inputSchema || {});
      if (params.type !== "object") { params.type = "object"; params.properties = {}; delete params.items; delete params.enum; }
      list.push({
        connector: c.id, connectorName: c.name, tool: tool.name, trusted: c.trusted,
        def: { type: "function", function: { name, description: ("[" + c.name + "] " + (tool.description || tool.name)).slice(0, 500), parameters: params } },
      });
    }
  }
  return list;
}

async function callTool(id, tool, args) {
  const c = conns.get(id);
  if (!c || c.status !== "ready") throw new Error("This connector is not connected right now" + (c && c.error ? " (" + c.error.slice(0, 200) + ")" : "") + ".");
  const r = await c.transport.request("tools/call", { name: tool, arguments: args || {} }, 120000);
  let text = (Array.isArray(r.content) ? r.content : []).map(p =>
    p.type === "text" ? p.text : p.type === "resource" && p.resource && p.resource.text ? p.resource.text : "[" + p.type + " content not shown]").join("\n");
  if (!text && r.structuredContent) text = JSON.stringify(r.structuredContent);
  text = text || "(no output)";
  return (r.isError ? "Error: " : "") + (text.length > MAX_RESULT ? text.slice(0, MAX_RESULT) + "\n…(truncated)" : text);
}

// 把用户粘贴的内容认成连接器：一条命令、一个网址，或文档里常见的 JSON 配置（{"mcpServers": {...}}）
const quote = a => (/[\s"&|<>^]/.test(a) ? "\"" + String(a).replace(/"/g, "\\\"") + "\"" : String(a));
function parseInput(text, fallbackName) {
  text = String(text || "").trim();
  if (!text) return [];
  const one = (name, v) => {
    if (!v || typeof v !== "object") return null;
    const strings = o => { const out = {}; for (const k in o || {}) if (typeof o[k] === "string" || typeof o[k] === "number") out[k] = String(o[k]); return out; };
    if (typeof v.url === "string" && /^https?:\/\//i.test(v.url)) return { name, type: "http", url: v.url.trim(), secret: { headers: strings(v.headers) } };
    if (typeof v.command === "string" && v.command.trim()) {
      return { name, type: "stdio", command: [v.command.trim()].concat(Array.isArray(v.args) ? v.args.map(String) : []).map(quote).join(" "), secret: { env: strings(v.env) } };
    }
    return null;
  };
  if (text[0] === "{" || /^"mcpServers"/.test(text)) {
    let data;
    try { data = JSON.parse(text[0] === "{" ? text : "{" + text + "}"); } catch (_) { throw new Error("bad-json"); }
    const servers = data.mcpServers || data.servers;
    if (servers && typeof servers === "object") return Object.keys(servers).slice(0, 10).map(k => one(k, servers[k])).filter(Boolean);
    const single = one(fallbackName || "Connector", data);
    return single ? [single] : [];
  }
  if (/^https?:\/\/\S+$/i.test(text)) {
    let host = "Connector";
    try { host = new URL(text).hostname.replace(/^(www|mcp|api)\./, "").split(".")[0]; } catch (_) { /* 用默认名 */ }
    return [{ name: fallbackName || host, type: "http", url: text, secret: {} }];
  }
  if (/[\r\n]/.test(text)) throw new Error("bad-input");
  const words = text.split(/\s+/).filter(w => !/^-/.test(w));
  const guess = (words[words.length - 1] || "Connector").replace(/^@[^/]+\//, "").replace(/@[\w.]+$/, "").replace(/^mcp-server-|-mcp(-server)?$|^server-/g, "");
  return [{ name: fallbackName || guess || "Connector", type: "stdio", command: text, secret: {} }];
}

module.exports = { connect, stop, stopAll, status, setTrusted, agentTools, callTool, parseInput };
