"use strict";

// 内置本地 AI：不用装 Ollama，一键下载 llama.cpp 的 llama-server 和一个开源模型，在本机跑一个兼容 OpenAI 的接口，加进 AI 池。
//   <userData>/local-ai/bin/      llama-server.exe 等（从 GitHub 上 llama.cpp 的发布页下载）
//   <userData>/local-ai/models/   .gguf 模型文件（从 Hugging Face 下载）
// 先检测电脑配置（内存、显卡和显存、硬盘空间），推荐跑得动的最大模型。
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

// 可选的模型：都是 Apache-2.0 许可的 Qwen3.5，调用工具和中文都不错。size 是文件大小（GB）。
const MODELS = [
  { id: "qwen3.5-2b", label: "Qwen3.5 2B", repo: "unsloth/Qwen3.5-2B-GGUF", file: "Qwen3.5-2B-Q4_K_M.gguf", size: 1.19 },
  { id: "qwen3.5-4b", label: "Qwen3.5 4B", repo: "unsloth/Qwen3.5-4B-GGUF", file: "Qwen3.5-4B-Q4_K_M.gguf", size: 2.55 },
  { id: "qwen3.5-9b", label: "Qwen3.5 9B", repo: "unsloth/Qwen3.5-9B-GGUF", file: "Qwen3.5-9B-Q4_K_M.gguf", size: 5.29 },
  { id: "qwen3.5-35b-a3b", label: "Qwen3.5 35B-A3B", repo: "unsloth/Qwen3.5-35B-A3B-GGUF", file: "Qwen3.5-35B-A3B-Q4_K_M.gguf", size: 20.5, moe: true },
];
const PORT = 18765;

let base = null;          // <userData>/local-ai
let server = null;        // 运行中的 llama-server：{ child, port, model }
const state = { phase: "idle", progress: 0, text: "", error: "" };   // 下载 / 启动的进度，给页面看
let abort = null;

const dirs = () => ({ bin: path.join(base, "bin"), models: path.join(base, "models") });
function init(userData) { base = path.join(userData, "local-ai"); }

const run = (file, args, timeout = 8000) => new Promise(resolve => {
  execFile(file, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? "" : String(stdout)));
});

// ---- 检测电脑配置 ----
async function detect() {
  const ramGB = os.totalmem() / 1073741824;
  const cpus = os.cpus();
  const gpus = [];
  // NVIDIA：nvidia-smi 报的显存准确
  const smi = await run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
  for (const line of smi.split(/\r?\n/).filter(Boolean)) {
    const [name, mem] = line.split(",").map(s => s.trim());
    gpus.push({ name, vramGB: Number(mem) / 1024, vendor: "nvidia" });
  }
  // 其他显卡：Windows 报的显存最多到 4GB（32 位字段），只当作参考
  const ps = await run("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + '|' + $_.AdapterRAM }"]);
  for (const line of ps.split(/\r?\n/).filter(Boolean)) {
    const [name, ram] = line.split("|");
    if (!name || gpus.some(g => g.name === name.trim())) continue;
    const integrated = /intel.*(uhd|iris|hd graphics)|radeon\(tm\) graphics|microsoft basic/i.test(name);
    gpus.push({ name: name.trim(), vramGB: integrated ? 0 : Number(ram) / 1073741824 || 0, vendor: /amd|radeon/i.test(name) ? "amd" : /intel/i.test(name) ? "intel" : "other", integrated });
  }
  const best = gpus.filter(g => !g.integrated).sort((a, b) => b.vramGB - a.vramGB)[0] || null;
  let diskFreeGB = null;
  try { const st = fs.statfsSync(path.parse(base || os.homedir()).root); diskFreeGB = st.bavail * st.bsize / 1073741824; } catch (_) { /* 拿不到就不显示 */ }
  return { ramGB, cpu: cpus[0] ? cpus[0].model.trim() : "", cores: cpus.length, gpus, gpu: best, diskFreeGB, os: process.platform };
}

// 每个模型在这台电脑上能不能跑、大概多快。模型加上对话缓存大约要比文件多 1.5GB。
function assess(hw) {
  const vram = hw.gpu ? hw.gpu.vramGB : 0;
  return MODELS.map(m => {
    const need = m.size + 1.5;
    const disk = hw.diskFreeGB == null || hw.diskFreeGB > m.size + 1;
    // 员工每一步都要读很长的提示词，速度主要看模型有多少能放进显卡：
    // 全放进去 = 快；放进一大半 = 快；放进一小半 = 中；纯 CPU 时小模型（或每次只用一小部分的 MoE）= 中，其余 = 慢
    let fit, speed;
    const share = vram > 1.5 ? (vram - 1.5) / m.size : 0;
    if (need <= vram) { fit = "gpu"; speed = "fast"; }
    else if (need <= Math.max(hw.ramGB * 0.6, hw.ramGB - 6)) {   // 给系统和其他程序留出内存
      fit = share > 0 ? "mixed" : "cpu";
      speed = share >= 0.6 ? "fast" : share >= 0.3 || m.moe || m.size < 2 ? "medium" : "slow";
    } else { fit = "no"; speed = "none"; }
    return Object.assign({}, m, { fit, speed, disk, installed: isInstalled(m) });
  });
}
// 推荐：能「快」跑的里面最大的；没有就「中」等速度里最大的；再没有就最小的
function recommend(list) {
  const ok = list.filter(m => m.fit !== "no" && m.disk);
  const pick = speed => ok.filter(m => m.speed === speed).pop();
  return (pick("fast") || pick("medium") || ok[0] || list[0]).id;
}

const modelPath = m => path.join(dirs().models, m.file);
const isInstalled = m => { try { return fs.statSync(modelPath(m)).size > m.size * 0.9 * 1073741824; } catch (_) { return false; } };
const serverExe = () => path.join(dirs().bin, process.platform === "win32" ? "llama-server.exe" : "llama-server");
const binInstalled = () => fs.existsSync(serverExe());

// ---- 下载 ----
async function download(url, dest, label, sizeHint) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  abort = new AbortController();
  // 断点续传：上次没下完的接着下（服务器支持的话回 206，只发剩下的部分）
  let have = 0;
  try { have = fs.statSync(part).size; } catch (_) { /* 从头下载 */ }
  const res = await fetch(url, { signal: abort.signal, redirect: "follow", headers: have ? { Range: "bytes=" + have + "-" } : {} });
  if (!res.ok || !res.body) throw new Error("download failed: " + res.status + " " + url);
  const resumed = have > 0 && res.status === 206;
  if (!resumed) have = 0;
  const total = (Number(res.headers.get("content-length")) || 0) + have || sizeHint || 0;
  const out = fs.createWriteStream(part, { flags: resumed ? "a" : "w" });
  let got = have;
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise(ok => out.once("drain", ok));
      got += chunk.length;
      Object.assign(state, { progress: total ? got / total : 0, text: label + " " + (got / 1048576).toFixed(0) + (total ? " / " + (total / 1048576).toFixed(0) : "") + " MB" });
    }
  } finally { await new Promise(ok => out.end(ok)); }
  if (total && got < total * 0.98) throw new Error("download incomplete");
  fs.renameSync(part, dest);
}

// llama.cpp 的发布：找最新一个带 Windows 版本的；有独立显卡用 Vulkan 版（N 卡、A 卡、Intel 独显都能用），否则用 CPU 版
async function installBinary(hw) {
  const flavor = hw.gpu && hw.gpu.vramGB >= 1.5 ? "vulkan" : "cpu";
  const res = await fetch("https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10", { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error("GitHub " + res.status);
  const releases = await res.json();
  const want = new RegExp("^llama-.*-bin-win-" + flavor + "-x64\\.zip$");
  let asset = null;
  for (const r of releases) { asset = (r.assets || []).find(a => want.test(a.name)); if (asset) break; }
  if (!asset) throw new Error("no llama.cpp build for Windows " + flavor);
  const zip = path.join(base, asset.name);
  await download(asset.browser_download_url, zip, "llama.cpp", asset.size);
  state.text = "llama.cpp: " + flavor;
  fs.rmSync(dirs().bin, { recursive: true, force: true });
  fs.mkdirSync(dirs().bin, { recursive: true });
  // 解压：用 Windows 10 以后自带的 tar.exe（写明完整路径：电脑上装了 Git 的话，PATH 里的 tar 可能是不会解 zip 的另一个版本）；没有就用 PowerShell
  const sysTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const [cmd, args] = fs.existsSync(sysTar) ? [sysTar, ["-xf", zip, "-C", dirs().bin]]
    : ["powershell", ["-NoProfile", "-Command", "Expand-Archive -LiteralPath '" + zip.replace(/'/g, "''") + "' -DestinationPath '" + dirs().bin.replace(/'/g, "''") + "' -Force"]];
  await new Promise((ok, fail) => {
    const p = spawn(cmd, args, { windowsHide: true });
    p.on("close", code => (code === 0 ? ok() : fail(new Error("unzip failed (" + code + ")"))));
    p.on("error", fail);
  });
  fs.rmSync(zip, { force: true });
  // 有的版本把文件放在子文件夹里：找到 llama-server.exe 所在的地方
  if (!binInstalled()) {
    const found = findFile(dirs().bin, "llama-server.exe");
    if (!found) throw new Error("llama-server.exe not found in the download");
    for (const f of fs.readdirSync(path.dirname(found))) fs.renameSync(path.join(path.dirname(found), f), path.join(dirs().bin, f));
  }
  return flavor;
}
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name) return p;
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; }
  }
  return null;
}

// 一键安装：程序 + 模型，然后启动
async function install(modelId, hw) {
  const m = MODELS.find(x => x.id === modelId);
  if (!m) throw new Error("unknown model");
  if (state.phase === "downloading") throw new Error("busy");
  Object.assign(state, { phase: "downloading", progress: 0, error: "", text: "" });
  try {
    if (!binInstalled()) await installBinary(hw);
    if (!isInstalled(m)) await download("https://huggingface.co/" + m.repo + "/resolve/main/" + m.file, modelPath(m), m.label, m.size * 1073741824);
    state.phase = "idle";
  } catch (e) {
    Object.assign(state, { phase: "error", error: e.name === "AbortError" ? "cancelled" : String(e.message || e) });
    throw e;
  } finally { abort = null; }
}
function cancel() { if (abort) abort.abort(); }

// ---- 启动 / 停止 ----
// llama.cpp 看到的设备，例如「Vulkan0: Intel(R) UHD Graphics (8042 MiB, 7384 MiB free)」。
// 笔记本上核显常常排在第一个：不指定的话，模型会被分到核显上，又慢又容易失败。所以挑显存最大的独立显卡，明确指定它。
async function pickDevice() {
  const out = await run(serverExe(), ["--list-devices"], 30000);
  const devs = [];
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^\s*(\S+):\s*(.+?)\s*\((\d+)\s*MiB/);
    if (m) devs.push({ id: m[1], name: m[2], mib: Number(m[3]) });
  }
  const discrete = devs.filter(d => !/intel.*(uhd|iris|hd graphics)|radeon\(tm\) graphics|microsoft basic|llvmpipe/i.test(d.name));
  return discrete.sort((a, b) => b.mib - a.mib)[0] || null;
}

// 先用独立显卡（让 llama.cpp 自己算放多少层进显存，放不下的留在内存）；起不来就只用 CPU，并且不碰任何显卡
async function start(modelId, hw) {
  const m = MODELS.find(x => x.id === modelId);
  if (!m || !isInstalled(m) || !binInstalled()) throw new Error("not installed");
  if (server && server.model === modelId && server.child.exitCode == null) return server.port;
  stop();
  const ctx = hw.ramGB >= 15 ? 32768 : 16384;
  const dev = await pickDevice();
  const attempts = (dev ? [{ gpu: true, args: ["--device", dev.id, "--fit", "on"] }] : []).concat([{ gpu: false, args: ["--device", "none", "-ngl", "0"] }]);
  let lastErr = "";
  for (const at of attempts) {
    Object.assign(state, { phase: "starting", text: at.gpu ? dev.name : "CPU", error: "" });
    const log = [];
    const child = spawn(serverExe(), ["-m", modelPath(m), "--host", "127.0.0.1", "--port", String(PORT), "--jinja", "-c", String(ctx), "--alias", m.id].concat(at.args),
      { cwd: dirs().bin, windowsHide: true });
    child.stdout.on("data", d => log.push(String(d)));
    child.stderr.on("data", d => { log.push(String(d)); if (log.length > 200) log.splice(0, 100); });
    server = { child, port: PORT, model: modelId, ctx, gpu: at.gpu, device: at.gpu ? dev.name : null };
    // 等它加载好（/health 返回 200）；进程提前退出就是失败
    const ok = await new Promise(resolve => {
      const t0 = Date.now();
      const tick = async () => {
        if (child.exitCode != null) return resolve(false);
        try { const r = await fetch("http://127.0.0.1:" + PORT + "/health", { signal: AbortSignal.timeout(2000) }); if (r.ok) return resolve(true); } catch (_) { /* 还在加载 */ }
        if (Date.now() - t0 > 180000) return resolve(false);
        setTimeout(tick, 1000);
      };
      tick();
    });
    if (ok) { Object.assign(state, { phase: "running", text: server.gpu ? server.device : "CPU" }); return PORT; }
    lastErr = log.join("").split(/\r?\n/).filter(l => /error|failed|out of memory/i.test(l)).slice(-3).join(" ") || "llama-server did not start";
    try { child.kill(); } catch (_) { /* 已经退出 */ }
    server = null;
  }
  Object.assign(state, { phase: "error", error: lastErr.slice(0, 300) });
  throw new Error(lastErr);
}

function stop() {
  if (!server) return;
  const { child } = server;
  server = null;
  if (child.exitCode == null) {
    try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); else child.kill(); } catch (_) { /* 已经退出 */ }
  }
  if (state.phase === "running" || state.phase === "starting") Object.assign(state, { phase: "idle", text: "" });
}

function remove(modelId) {
  const m = MODELS.find(x => x.id === modelId);
  if (!m) return;
  if (server && server.model === modelId) stop();
  fs.rmSync(modelPath(m), { force: true });
  fs.rmSync(modelPath(m) + ".part", { force: true });
}

function status() {
  return { state: Object.assign({}, state), running: server && server.child.exitCode == null && state.phase === "running" ? { model: server.model, port: server.port, gpu: server.gpu, device: server.device, ctx: server.ctx } : null, binInstalled: binInstalled() };
}

module.exports = { init, detect, assess, recommend, install, cancel, start, stop, remove, status, MODELS, PORT };
