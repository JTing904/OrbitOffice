"use strict";

// MCP 服务器：让别的 AI 工具（Claude Code、Claude Desktop、Cursor…）通过 MCP 使用 OrbitOffice。
// 只听本机 127.0.0.1，每个请求都要带 Bearer 密钥；任务状态在页面里（app.js），所以工具调用转给页面去做，
// 和用户在任务栏里打字走的是同一条路：要批准的操作照样在 App 里弹窗给用户，这里不会替用户批准任何东西。
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROTOCOL = "2025-06-18";
const FIRST_PORT = 47821;
const MAX_BODY = 256 * 1024;

const TOOLS = [
  { name: "list_agents", description: "List the departments, teams and agents in the OrbitOffice office, with each agent's role and whether it is busy right now.",
    inputSchema: { type: "object", properties: {} } },
  { name: "assign_task", description: "Give the office a task, exactly like typing it into OrbitOffice's task bar. Without 'agent' the office picks the right agent. The task may wait for the user's approval in the app depending on the permission mode; agents ask the user in the app before risky actions. Returns the task id; then call wait_task (not get_task in a loop) to get the result.",
    inputSchema: { type: "object", properties: {
      title: { type: "string", description: "What to do, in plain words." },
      agent: { type: "string", description: "Optional agent id or name to give it to." },
      department: { type: "string", description: "Optional department id or name; auto-assign picks inside it." } }, required: ["title"] } },
  { name: "get_task", description: "Status of a task: pending (waiting for the user's approval), queued, doing or done; the agent; current step; result summary; files written; failed flag; and the tasks it handed off to.",
    inputSchema: { type: "object", properties: { id: { type: "integer", description: "Task id from assign_task, chat or list_tasks." } }, required: ["id"] } },
  { name: "wait_task", description: "Wait until a task is done (or until it needs the user, or the time runs out) and return its final state, so you do not have to call get_task again and again. Waits up to timeout_seconds (default 90, max 100); if it is not done yet, call wait_task again.",
    inputSchema: { type: "object", properties: { id: { type: "integer" }, timeout_seconds: { type: "integer", minimum: 5, maximum: 100 } }, required: ["id"] } },
  { name: "read_file", description: "Read a text file the agents wrote in OrbitOffice's project folder (for example a path from a task's files list). Read-only; only inside the project folder; up to 200 KB.",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Path relative to the project folder, e.g. drafts/post.md" } }, required: ["path"] } },
  { name: "list_tasks", description: "The newest tasks (up to 30), optionally only one status.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["pending", "queued", "doing", "done"] } } } },
  { name: "chat", description: "Talk to one agent directly, like the agent's chat in OrbitOffice. The agent answers or does the work; the reply arrives as the result of the returned task (use wait_task).",
    inputSchema: { type: "object", properties: { agent: { type: "string", description: "Agent id or name." }, message: { type: "string" } }, required: ["agent", "message"] } },
];

let server = null, port = null, token = null, getWin = null, getProject = null;
const pending = new Map();   // 调用 id -> { resolve, timer }
let seq = 0;

function loadToken(userData) {
  const file = path.join(userData, "mcp-server.json");
  try { const t = JSON.parse(fs.readFileSync(file, "utf8")).token; if (/^[0-9a-f]{64}$/.test(t)) return t; } catch (_) { /* 第一次：新建 */ }
  const t = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, JSON.stringify({ token: t }));
  return t;
}

// 固定时间比较，避免按字符逐个猜出密钥
function tokenOk(header) {
  const m = /^Bearer\s+(.+)$/i.exec(header || "");
  if (!m) return false;
  const a = Buffer.from(m[1].trim()), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 交给页面去执行，等它回 mcp:result
function callRenderer(tool, args) {
  const win = getWin && getWin();
  if (!win || win.isDestroyed()) return Promise.resolve({ ok: false, error: "OrbitOffice window is not open" });
  const id = ++seq;
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: "No answer from OrbitOffice within 15s" }); }, 15000);
    pending.set(id, { resolve, timer });
    win.webContents.send("mcp:call", { id, tool, args: args || {} });
  });
}
function onResult(msg) {
  const p = msg && pending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(msg.id);
  p.resolve(msg);
}

// 在这边等，而不是让外面的 AI 一直问：每 2 秒看一次，做完、要等用户批准、或时间到就回一次（大大省 token）
async function waitTask(args) {
  const limit = Math.min(100, Math.max(5, Number(args.timeout_seconds) || 90)) * 1000, t0 = Date.now();
  for (;;) {
    const r = await callRenderer("get_task", { id: args.id });
    if (!r.ok) return r;
    const x = r.result;
    const settled = x.status === "done" || x.needsUser;
    if (settled || Date.now() - t0 >= limit) return { ok: true, result: Object.assign({ timedOut: !settled }, x) };
    await new Promise(res => setTimeout(res, 2000));
  }
}

// 只读、只在项目文件夹里：外面的 AI 能拿到员工写的成果，但碰不到别的地方
function readFile(args) {
  const root = getProject && getProject();
  if (!root) return { ok: false, error: "OrbitOffice has no project folder set" };
  const rel = String(args.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const full = path.resolve(root, rel);
  const inside = path.relative(path.resolve(root), full);
  if (!rel || inside.startsWith("..") || path.isAbsolute(inside)) return { ok: false, error: "Only files inside the project folder can be read" };
  let st;
  try { st = fs.statSync(full); } catch (_) { return { ok: false, error: "No such file: " + rel }; }
  if (!st.isFile()) return { ok: false, error: "Not a file: " + rel };
  if (st.size > 200 * 1024) return { ok: false, error: "File is larger than 200 KB" };
  const buf = fs.readFileSync(full);
  if (buf.includes(0)) return { ok: false, error: "Not a text file" };
  return { ok: true, result: { path: rel, content: buf.toString("utf8") } };
}

async function handle(msg) {
  const reply = result => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg.id === undefined ? null : msg.id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Invalid request");
  if (msg.id === undefined) return null;   // 通知（例如 notifications/initialized）：不用回
  switch (msg.method) {
    case "initialize":
      return reply({ protocolVersion: PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: "OrbitOffice", version: require("../package.json").version },
        instructions: "OrbitOffice is a 3D office of AI agents that do real work in the user's project folder. Use assign_task or chat, then wait_task for the result. Approvals happen in the OrbitOffice app, not here." });
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      const name = msg.params && msg.params.name;
      if (!TOOLS.some(x => x.name === name)) return fail(-32602, "Unknown tool: " + name);
      const args = msg.params.arguments || {};
      const r = name === "wait_task" ? await waitTask(args) : name === "read_file" ? readFile(args) : await callRenderer(name, args);
      return reply({ content: [{ type: "text", text: r.ok ? JSON.stringify(r.result, null, 2) : String(r.error || "Failed") }], isError: !r.ok });
    }
    default: return fail(-32601, "Method not found: " + msg.method);
  }
}

function send(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { "Content-Type": "application/json" });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function onRequest(req, res) {
  // 网页不能借用户的浏览器连进来（DNS rebinding）：带了 Origin 的只接受本机
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return send(res, 403, { error: "Forbidden origin" });
  if (!tokenOk(req.headers.authorization)) return send(res, 401, { error: "Unauthorized" });
  if (req.url.split("?")[0] !== "/mcp") return send(res, 404, { error: "Not found" });
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });   // 不提供 SSE 推送
  let body = "", size = 0;
  req.on("data", c => { size += c.length; if (size > MAX_BODY) { req.destroy(); return; } body += c; });
  req.on("end", async () => {
    let msg;
    try { msg = JSON.parse(body); } catch (_) { return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    try {
      if (Array.isArray(msg)) {
        const out = (await Promise.all(msg.map(handle))).filter(Boolean);
        return out.length ? send(res, 200, out) : send(res, 202);
      }
      const out = await handle(msg);
      return out ? send(res, 200, out) : send(res, 202);
    } catch (e) { return send(res, 500, { jsonrpc: "2.0", id: msg && msg.id, error: { code: -32603, message: String(e.message || e) } }); }
  });
}

function listenOn(p) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(onRequest);
    s.once("error", reject);
    s.listen(p, "127.0.0.1", () => { s.removeListener("error", reject); resolve(s); });
  });
}

// 被占用就试后面 10 个端口
async function start(userData, winGetter, projectGetter) {
  if (server) return status();
  getWin = winGetter; getProject = projectGetter;
  token = loadToken(userData);
  for (let p = FIRST_PORT; p < FIRST_PORT + 11; p++) {
    try { server = await listenOn(p); port = p; return status(); } catch (e) { if (e.code !== "EADDRINUSE") throw e; }
  }
  throw new Error("No free port between " + FIRST_PORT + " and " + (FIRST_PORT + 10));
}
function stop() {
  if (server) server.close();
  server = null; port = null;
  for (const [id, p] of pending) { clearTimeout(p.timer); p.resolve({ ok: false, error: "MCP server stopped" }); pending.delete(id); }
}
function status() { return server ? { on: true, port, url: "http://127.0.0.1:" + port + "/mcp", token } : { on: false }; }

module.exports = { start, stop, status, onResult };
