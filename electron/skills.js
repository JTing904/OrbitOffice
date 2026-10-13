"use strict";

// 技能库（放在大脑里，整个团队共用）：一个技能是一个文件夹，里面有 SKILL.md（格式和 Claude 的技能一样：
// 开头写 name 和 description，正文是做法），也可以带模板、示例、脚本等其他文件。
//   <userData>/skills/<id>/SKILL.md
// 员工平时只看技能的名字和一句话简介；要用时调用 use_skill 读全文，这样技能再多也不会把提示词撑爆。
const fs = require("fs");
const path = require("path");
const { tokens } = require("./memory");

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MAX_TEXT = 200 * 1024;
const MAX_FILES = 50;

let base = null;
function init(userData) { base = path.join(userData, "skills"); }
const dirOf = id => path.join(base, id);

// SKILL.md 开头那段设置：只取简单的「键: 值」
function parseHead(text) {
  const m = String(text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = {};
  if (!m) return { meta, body: String(text || "").trim() };
  for (const line of m[1].split("\n")) {
    const k = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (k) meta[k[1].toLowerCase()] = k[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

function listFiles(dir, rel = "") {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    if (out.length >= MAX_FILES) break;
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, r).slice(0, MAX_FILES - out.length));
    else if (r !== "SKILL.md") out.push(r);
  }
  return out;
}

function list() {
  if (!base || !fs.existsSync(base)) return [];
  const out = [];
  for (const id of fs.readdirSync(base).sort()) {
    if (!ID.test(id)) continue;
    let text;
    try { text = fs.readFileSync(path.join(dirOf(id), "SKILL.md"), "utf8"); } catch (_) { continue; }
    const { meta } = parseHead(text);
    out.push({ id, name: meta.name || id, description: meta.description || "", external: meta.source === "imported", files: listFiles(dirOf(id)), size: text.length });
  }
  return out;
}

function read(id) {
  if (!ID.test(id)) throw new Error("bad id");
  return fs.readFileSync(path.join(dirOf(id), "SKILL.md"), "utf8");
}

function write(id, text) {
  if (!ID.test(id)) throw new Error("bad id");
  fs.mkdirSync(dirOf(id), { recursive: true });
  fs.writeFileSync(path.join(dirOf(id), "SKILL.md"), String(text || "").slice(0, MAX_TEXT), "utf8");
  return list();
}

function remove(id) {
  if (!ID.test(id)) throw new Error("bad id");
  fs.rmSync(dirOf(id), { recursive: true, force: true });
  return list();
}

const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
function uniqueId(name) {
  let id = slug(name);
  if (id.length < 3) id = "skill" + (id ? "-" + id : "");
  let out = id, n = 1;
  while (fs.existsSync(dirOf(out))) out = id + "-" + (++n);
  return out;
}

// 导入：一个技能文件夹（里面有 SKILL.md）整个复制进来；标记为来自外部
function importFolder(src) {
  const skillFile = path.join(src, "SKILL.md");
  if (!fs.existsSync(skillFile)) throw new Error("no-skill-md");
  const text = fs.readFileSync(skillFile, "utf8");
  const { meta } = parseHead(text);
  const id = uniqueId(meta.name || path.basename(src));
  fs.mkdirSync(base, { recursive: true });
  fs.cpSync(src, dirOf(id), { recursive: true, filter: p => !/[\\/](\.git|node_modules)([\\/]|$)/.test(p) });
  fs.writeFileSync(path.join(dirOf(id), "SKILL.md"), markImported(text), "utf8");
  return id;
}
// 导入：单个 .md 文件当作 SKILL.md
function importText(name, text) {
  const { meta } = parseHead(text);
  const id = uniqueId(meta.name || String(name || "").replace(/\.(md|txt)$/i, ""));
  return write(id, markImported(text)) && id;
}
// 在开头那段设置里加上 source: imported（没有设置段就补一段）
function markImported(text) {
  text = String(text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (/^---\n[\s\S]*?\n---/.test(text)) return /^---\n[\s\S]*?\nsource\s*:/m.test(text) ? text : text.replace(/^---\n/, "---\nsource: imported\n");
  return "---\nname: " + (text.match(/^#\s*(.+)$/m) || [, "Imported skill"])[1].trim() + "\ndescription: \nsource: imported\n---\n\n" + text;
}

// 给员工看的技能目录（只有名字和简介）
function catalog(max = 40) {
  return list().slice(0, max).map(s => "- " + s.id + ": " + s.name + (s.description ? " — " + s.description.slice(0, 200) : "")).join("\n");
}

// 和这次任务可能相关的技能：按名字和简介里的词打分
function match(query, limit = 3) {
  const q = [...tokens(query)];
  if (!q.length) return [];
  return list().map(s => {
    const set = tokens(s.name + " " + s.description);
    const hits = q.filter(w => set.has(w)).length;
    return { s, hits, score: hits / Math.max(4, set.size) };
  }).filter(x => x.hits >= 2).sort((a, b) => b.hits - a.hits || b.score - a.score).slice(0, limit).map(x => x.s);
}

// 员工用 use_skill 读技能：默认读 SKILL.md；也可以读技能文件夹里的其他文件（模板、示例）。脚本的完整路径一并告诉它，需要时用 run_command 运行。
function readForAgent(id, file) {
  const s = list().find(x => x.id === id || x.name === id);
  if (!s) throw new Error("No skill named " + id + ". Available: " + list().map(x => x.id).join(", "));
  if (file) {
    const p = path.resolve(dirOf(s.id), String(file));
    if (!p.startsWith(dirOf(s.id) + path.sep)) throw new Error("That file is outside the skill folder.");
    const buf = fs.readFileSync(p);
    if (buf.includes(0)) throw new Error("This is a binary file.");
    return { skill: s, text: buf.toString("utf8").slice(0, 60000) };
  }
  const body = parseHead(read(s.id)).body;
  const files = s.files.length ? "\n\nOther files in this skill (read one with use_skill and its file name; run scripts by their full path):\n" + s.files.map(f => "- " + f + "  (" + path.join(dirOf(s.id), f) + ")").join("\n") : "";
  return { skill: s, text: "Skill: " + s.name + "\n\n" + body.slice(0, 60000) + files };
}

const dir = () => { fs.mkdirSync(base, { recursive: true }); return base; };

module.exports = { init, list, read, write, remove, uniqueId, importFolder, importText, catalog, match, readForAgent, parseHead, dir };
