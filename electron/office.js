"use strict";

// 办公室的定义存成普通文件，用户可以直接用编辑器改、拷给别人、放进 Git：
//   <userData>/office/office.json        办公室（团队）列表：[{ id, name, color, style }]
//   <userData>/office/agents/<id>.md     一个员工一个文件：开头是设置（名字、岗位、颜色…），正文是职责说明
//   <userData>/office/agents/<id>/*.md   给这个员工的参考资料（规范、风格指南…），干活时会读
// 这里只负责读写文件；.md 的解析和生成在页面（office-def.js）里，两边用同一份规则。
const fs = require("fs");
const path = require("path");

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REF_NAME = /^[^\\/:*?"<>|]{1,80}\.(md|txt)$/i;
const MAX_TEXT = 200 * 1024;
const MAX_REFS_TEXT = 12000;   // 参考资料交给 AI 的总字数上限

function dirs(userData) {
  const root = path.join(userData, "office");
  return { root, agents: path.join(root, "agents"), file: path.join(root, "office.json") };
}

function load(userData) {
  const d = dirs(userData);
  if (!fs.existsSync(d.file)) return { exists: false, dir: d.root };
  const info = readInfo(d.file);
  const teams = info.teams, purpose = info.purpose;
  const agents = [];
  try {
    for (const f of fs.readdirSync(d.agents).filter(f => f.endsWith(".md")).sort()) {
      const id = f.slice(0, -3);
      if (!ID.test(id)) continue;
      const text = fs.readFileSync(path.join(d.agents, f), "utf8").slice(0, MAX_TEXT);
      agents.push({ id, text, refs: listRefs(userData, id) });
    }
  } catch (_) { /* 还没有员工 */ }
  return { exists: true, dir: d.root, teams, purpose, agents };
}

// office.json：{ version, purpose（这个办公室是做什么的）, teams }。文件坏了就当作空的，页面会用模板补上。
function readInfo(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { teams: Array.isArray(j.teams) ? j.teams : [], purpose: typeof j.purpose === "string" ? j.purpose : "" };
  } catch (_) { return { teams: [], purpose: "" }; }
}

function listRefs(userData, id) {
  const dir = path.join(dirs(userData).agents, id);
  try {
    return fs.readdirSync(dir).filter(f => REF_NAME.test(f)).sort().map(name => ({ name, size: fs.statSync(path.join(dir, name)).size }));
  } catch (_) { return []; }
}

// 一次写入：团队列表、要保存的员工、要删除的员工
function write(userData, change) {
  const d = dirs(userData);
  fs.mkdirSync(d.agents, { recursive: true });
  // 只改传进来的部分：只改团队时保留原来的「做什么的」，反之亦然
  if (Array.isArray(change.teams) || typeof change.purpose === "string" || !fs.existsSync(d.file)) {
    const info = fs.existsSync(d.file) ? readInfo(d.file) : { teams: [], purpose: "" };
    const teams = (Array.isArray(change.teams) ? change.teams : info.teams).filter(t => t && ID.test(t.id)).slice(0, 12).map(t => ({
      id: t.id, name: String(t.name || t.id).slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#67e8f9", style: String(t.style || "").slice(0, 30),
    }));
    const purpose = typeof change.purpose === "string" ? change.purpose.slice(0, 2000) : info.purpose;
    fs.writeFileSync(d.file, JSON.stringify({ version: 1, purpose, teams }, null, 2));
  }
  for (const a of change.agents || []) {
    if (!a || !ID.test(a.id)) throw new Error("bad id: " + (a && a.id));
    fs.writeFileSync(path.join(d.agents, a.id + ".md"), String(a.text || "").slice(0, MAX_TEXT), "utf8");
  }
  for (const id of change.remove || []) {
    if (!ID.test(id)) continue;
    fs.rmSync(path.join(d.agents, id + ".md"), { force: true });
    fs.rmSync(path.join(d.agents, id), { recursive: true, force: true });
  }
  return load(userData);
}

// 参考资料：复制进员工自己的文件夹（同名覆盖）
function addRef(userData, id, name, text) {
  if (!ID.test(id)) throw new Error("bad id");
  name = path.basename(String(name || ""));
  if (!REF_NAME.test(name)) throw new Error("bad-name");
  const dir = path.join(dirs(userData).agents, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), String(text || "").slice(0, MAX_TEXT), "utf8");
  return listRefs(userData, id);
}
function removeRef(userData, id, name) {
  if (!ID.test(id)) throw new Error("bad id");
  name = path.basename(String(name || ""));
  if (REF_NAME.test(name)) fs.rmSync(path.join(dirs(userData).agents, id, name), { force: true });
  return listRefs(userData, id);
}

// 交给 AI 的参考资料全文（总字数有上限，超出的截掉并注明）
function refsText(userData, id) {
  if (!ID.test(id)) return "";
  let out = "";
  for (const r of listRefs(userData, id)) {
    let text;
    try { text = fs.readFileSync(path.join(dirs(userData).agents, id, r.name), "utf8"); } catch (_) { continue; }
    const block = "### " + r.name + "\n" + text.trim() + "\n\n";
    if (out.length + block.length > MAX_REFS_TEXT) { out += block.slice(0, Math.max(0, MAX_REFS_TEXT - out.length)) + "\n…(the rest of the reference material was cut off)"; break; }
    out += block;
  }
  return out.trim();
}

module.exports = { load, write, addRef, removeRef, refsText, dirs, REF_NAME };
