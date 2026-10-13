"use strict";

// 项目记忆（大脑）：跟着项目文件夹走，换电脑、清掉 App 里的记录都不会丢。
//   .myaioffice/history.jsonl   每做完一件事记一行：什么时候、谁、做了什么、结论、改了哪些文件
//   .myaioffice/notes.md        员工用 remember 记下的决定和事实（由 agent.js 写入）
// 员工接新任务前，先在记忆里找和这次任务相关的旧工作，带进提示词；笔记太长时整理成摘要，而不是把前面的截掉。
const fs = require("fs");
const path = require("path");

const HISTORY_FILE = ".myaioffice/history.jsonl";
const NOTES_FILE = ".myaioffice/notes.md";
const MAX_HISTORY = 2000;        // 最多留这么多条，超出时丢最旧的
const NOTES_LIMIT = 6000;        // 笔记超过这个字数就整理

function appendHistory(root, entry) {
  if (!root) return;
  const file = path.join(root, HISTORY_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = JSON.stringify({
    at: Date.now(), agent: String(entry.agent || "").slice(0, 60), role: String(entry.role || "").slice(0, 80),
    title: String(entry.title || "").slice(0, 400), summary: String(entry.summary || "").slice(0, 1500),
    files: (entry.files || []).slice(0, 30).map(String), ok: entry.ok !== false,
  });
  fs.appendFileSync(file, line + "\n", "utf8");
  // 偶尔检查一下长度，太长就只留最近的
  if (Math.random() < 0.05) {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_HISTORY) fs.writeFileSync(file, lines.slice(-MAX_HISTORY).join("\n") + "\n", "utf8");
  }
}

function readHistory(root) {
  try {
    return fs.readFileSync(path.join(root, HISTORY_FILE), "utf8").split("\n").filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

// 分词：英文和数字按单词（3 个字母以上），中文按相邻两个字（「登录」「录页」…），这样不用词典也能比较相似度
function tokens(text) {
  const out = new Set();
  const s = String(text || "").toLowerCase();
  for (const w of s.match(/[a-z0-9_]{3,}/g) || []) out.add(w);
  for (const run of s.match(/[㐀-鿿]+/g) || []) for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  return out;
}
const STOP = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "please", "一个", "这个", "帮我", "我们", "需要", "然后", "可以", "什么", "怎么"]);

// 找和这次任务最相关的几条旧工作：按共同的词打分，越少见的词分越高；太不相关的不要
function searchHistory(root, query, limit = 3) {
  const items = readHistory(root);
  if (!items.length) return [];
  const q = [...tokens(query)].filter(w => !STOP.has(w));
  if (!q.length) return [];
  const docs = items.map(it => ({ it, set: tokens(it.title + " " + it.summary + " " + (it.files || []).join(" ")) }));
  const df = w => docs.reduce((n, d) => n + (d.set.has(w) ? 1 : 0), 0);
  const idf = Object.fromEntries(q.map(w => [w, Math.log(1 + docs.length / (1 + df(w)))]));
  const maxScore = q.reduce((n, w) => n + idf[w], 0);
  return docs.map(d => {
    const hit = q.filter(w => d.set.has(w));
    return { it: d.it, score: hit.reduce((n, w) => n + idf[w], 0) / maxScore, hits: hit.length };
  }).filter(x => x.hits >= 2 && x.score >= 0.2)
    .sort((a, b) => b.score - a.score || b.it.at - a.it.at)
    .slice(0, limit).map(x => x.it);
}

// 给 AI 看的相关旧工作
function memoryText(root, query) {
  const hits = searchHistory(root, query);
  if (!hits.length) return "";
  return hits.map(h => "- " + localDay(h.at) + " " + h.agent + (h.role ? " (" + h.role + ")" : "") + ": " + h.title +
    (h.ok ? "" : " [did not complete]") + "\n  Result: " + h.summary.replace(/\s+/g, " ").slice(0, 600) +
    ((h.files || []).length ? "\n  Files: " + h.files.slice(0, 8).join(", ") : "")).join("\n");
}

const localDay = ms => { const d = new Date(ms); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

function historyCount(root) { return readHistory(root).length; }

// 笔记太长：请 AI 整理成简洁的版本（合并重复、去掉过时的、保留所有还有用的事实），整理前留一份备份
async function compactNotes(root, summarize) {
  const file = path.join(root, NOTES_FILE);
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { return false; }
  if (text.length <= NOTES_LIMIT) return false;
  const out = await summarize(text);
  if (!out || out.length < 200 || out.length >= text.length) return false;   // 整理得不像样就不动原来的
  fs.writeFileSync(path.join(root, ".myaioffice/notes.before-summary.md"), text, "utf8");
  fs.writeFileSync(file, out.trim() + "\n", "utf8");
  return true;
}

module.exports = { appendHistory, readHistory, searchHistory, memoryText, historyCount, compactNotes, tokens, NOTES_LIMIT, HISTORY_FILE };
