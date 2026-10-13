"use strict";

// 员工的定义文件（.md）：开头一段设置，正文是职责说明。例如：
//
//   ---
//   name: 文案
//   role: 社媒文案
//   team: content
//   color: "#f472b6"
//   skills: [小红书文案, 标题, 话题标签]
//   keywords: [文案, 标题, 小红书]
//   writes: [drafts/, "*.md"]        # 只能写这些文件；不写这一行 = 工作文件夹里都能写
//   ---
//   你负责把选题写成能直接发布的小红书笔记……
//
// 其余可选设置：auto-assign（没点名时能不能派给它）、local-only（只能碰本机）、send-results-to / send-task（成果固定交给谁、交什么任务）、
// recheck-by / recheck-task（它安排的修改做完后由谁复查）、no-ui-handoff（项目没有界面时改交给谁）、needs-approval（任务要先批准）、
// lead（主持群聊讨论）、look / hair（3D 小人的配饰和发色）、source: imported（从外部导入，运行命令前一定先问）。
// 依赖 app.js 的 TEMPLATE_AGENTS / TEMPLATE_TEAMS（软件团队模板）和 i18n.js 的 t()，都在调用时才读取。
const OfficeDef = (() => {
  const LOOK_NAMES = { glasses: "AccGlasses", headset: "AccHeadset", cap: "AccCap", tie: "AccTie" };
  const ORDER = ["name", "role", "team", "order", "color", "skills", "keywords", "writes", "auto-assign", "local-only", "send-results-to", "send-task",
    "recheck-by", "recheck-task", "no-ui-handoff", "needs-approval", "lead", "look", "hair", "source"];

  // 软件团队模板里，每个员工在 app.js 之外的设置
  const TEMPLATE_EXTRA = {
    planner: { writes: ["docs/"], look: ["glasses"], hair: "#2b2118", lead: true },
    reviewer: { writes: ["docs/"], look: ["glasses", "tie"], hair: "#4a4038" },
    debugger: { look: ["headset"], hair: "#1b1b22" },
    tester: { writes: ["tests/", "test/", "__tests__/", "docs/", "test_*", "*.test.*", "*.spec.*", "*_test.*", "*-test.*", "*_spec.*"], look: ["cap"], hair: "#3a2a1c" },
    writer: { writes: ["docs/", "*.md", "*.txt"], look: [], hair: "#5a3b25" },
    devops: { writes: ["docs/", ".github/", "scripts/", "script/", "deploy/", "Dockerfile*", "docker-compose*", "*.yml", "*.yaml", "*.sh", "*.bat", "*.ps1", "*.toml", "*.ini", "*.conf", ".*ignore", "Makefile"],
      look: ["headset", "cap"], hair: "#22252b", needsApproval: true },
    designer: { writes: ["design/", "docs/"], look: [], hair: "#8a5a3c", noUiHandoff: "developer" },
    developer: { look: ["glasses", "headset"], hair: "#1f2937" },
    attacker: { writes: ["security/"], look: ["cap"], hair: "#111318", sendTaskKey: "route.attacker" },
    security: { writes: ["security/", "docs/"], look: ["tie", "headset"], hair: "#3b3027", recheckBy: "attacker", recheckTaskKey: "route.retest" },
  };
  const TEMPLATE_PURPOSE = {
    zh: "我们是一个小型软件团队：根据用户的需求做规划、界面设计、写代码、测试、代码审查、安全检查、部署和写文档，成果都写进工作文件夹。",
    en: "We are a small software team: we plan, design interfaces, write code, test, review, check security, deploy and write documentation for the user's requests, and put our work in the working folder.",
  };

  // ---- 解析 / 生成 ----
  function parseValue(v) {
    v = v.trim();
    if (/^\[.*\]$/.test(v)) return splitList(v.slice(1, -1));
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1).replace(/\\"/g, "\"");
    if (v === "true") return true;
    if (v === "false") return false;
    return v;
  }
  function splitList(s) {
    const out = [];
    let cur = "", q = null;
    for (const ch of s) {
      if (q) { if (ch === q) q = null; else cur += ch; }
      else if (ch === "\"" || ch === "'") q = ch;
      else if (ch === "," || ch === "，") { if (cur.trim()) out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  const asList = v => (Array.isArray(v) ? v : typeof v === "string" && v ? splitList(v) : []).map(String).filter(Boolean);

  // 返回 { meta, body }；没有开头那段设置时整篇都是正文
  function parse(text) {
    text = String(text || "").replace(/^﻿/, "").replace(/\r\n/g, "\n");
    const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) return { meta: {}, body: text.trim() };
    const meta = {};
    for (const line of m[1].split("\n")) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const k = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
      if (!k) continue;
      let v = k[2];
      // 行尾注释：# 前面有空格、且不在引号里
      if (!/^["']/.test(v.trim())) v = v.replace(/\s+#.*$/, "");
      meta[k[1].toLowerCase()] = parseValue(v);
    }
    return { meta, body: m[2].trim() };
  }

  const q = v => (/^[\w一-鿿][\w一-鿿 .\-·/()（）]*$/.test(v) && !/^(true|false)$/.test(v) ? v : JSON.stringify(v));
  function serialize(meta, body) {
    const lines = ["---"];
    const keys = ORDER.concat(Object.keys(meta).filter(k => !ORDER.includes(k)));
    for (const k of keys) {
      const v = meta[k];
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (Array.isArray(v)) lines.push(k + ": [" + v.map(x => q(String(x))).join(", ") + "]");
      else if (typeof v === "boolean") lines.push(k + ": " + v);
      else lines.push(k + ": " + q(String(v)));
    }
    lines.push("---", "", String(body || "").trim(), "");
    return lines.join("\n");
  }

  // 可写文件的写法（像 .gitignore）：docs/ = 根目录下的 docs 文件夹；*.md = 任何位置的 .md 文件；带 / 的按完整路径匹配
  function globToRegex(g) {
    g = String(g).trim().replace(/^\.\//, "");
    const conv = s => s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
    if (g.endsWith("/")) return "^" + conv(g);
    if (g.includes("/")) return "^" + conv(g) + "$";
    return "(^|/)" + conv(g) + "$";
  }

  // ---- 员工：文件 <-> App 里用的对象 ----
  const slug = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  // prefix：名字转不出英文 id 时用的开头（员工用 agent，办公室用 team）
  function uniqueId(base, taken, prefix = "agent") {
    // 名字是中文时英文字母很少：不够长就用 agent-xxx，文件名一看就知道是员工
    let id = slug(base);
    if (id.length < 3) id = prefix + (id ? "-" + id : "");
    let n = 1, out = id;
    while (taken.has(out)) out = id + "-" + (++n);
    return out;
  }

  // 解析后的文件 -> App 里的员工对象（和 app.js 里模板员工的形状一样，界面代码不用区分）
  function toAgent(file, teams, lang) {
    const { meta, body } = parse(file.text);
    const name = String(meta.name || file.id).slice(0, 40);
    const role = String(meta.role || "").slice(0, 60);
    const skills = asList(meta.skills).slice(0, 12);
    const team = teams.some(x => x.id === meta.team) ? meta.team : (teams[0] && teams[0].id);
    const hair = /^#[0-9a-f]{6}$/i.test(meta.hair || "") ? parseInt(meta.hair.slice(1), 16) : 0x2b2118;
    const texts = { name, role, skills, steps: [t("sim.step1"), t("sim.step2"), t("sim.step3")], result: "" };
    const writes = asList(meta.writes).filter(w => w !== "any");
    return {
      id: file.id, team, color: /^#[0-9a-f]{6}$/i.test(meta.color || "") ? meta.color : "#67e8f9", brief: body,
      keywords: asList(meta.keywords).concat(skills).map(k => k.toLowerCase()),
      specialist: meta["auto-assign"] === false, localOnly: meta["local-only"] === true,
      handsTo: meta["send-results-to"] || null, handoffTask: meta["send-task"] || null,
      recheckBy: meta["recheck-by"] || null, recheckTask: meta["recheck-task"] || null,
      noUiHandoff: meta["no-ui-handoff"] || null, needsApproval: meta["needs-approval"] === true, lead: meta.lead === true,
      writes: writes.length ? writes : null, external: meta.source === "imported",
      look: { acc: asList(meta.look).map(x => LOOK_NAMES[x.toLowerCase()]).filter(Boolean), hair },
      order: Number(meta.order) || 999, refs: file.refs || [], meta, body,
      zh: texts, en: texts,
    };
  }

  // 写入时用的 { meta, body }：从编辑器里的字段生成
  function metaOf(a) {
    return Object.assign({}, a.meta || {}, {
      name: a.zh.name, role: a.zh.role, team: a.team, color: a.color, skills: a.zh.skills,
    });
  }

  // 第一次启动：把软件团队模板写成文件。edits 是旧版本里用户在设置中改过的名字、岗位、颜色、技能，一起带过去。
  function seed(lang, edits) {
    const L = lang === "en" ? "en" : "zh";
    const agents = TEMPLATE_AGENTS.map((a, i) => {
      const x = TEMPLATE_EXTRA[a.id] || {}, e = (edits && edits[a.id]) || {};
      const meta = {
        name: e.name || a[L].name, role: e.role || a[L].role, team: a.team, order: i + 1, color: e.color || a.color,
        skills: e.skills && e.skills.length ? e.skills : a[L].skills, keywords: a.keywords, writes: x.writes || null,
        "auto-assign": a.specialist ? false : null, "local-only": a.localOnly || null,
        "send-results-to": a.handsTo || null, "send-task": x.sendTaskKey ? t(x.sendTaskKey) : null,
        "recheck-by": x.recheckBy || null, "recheck-task": x.recheckTaskKey ? t(x.recheckTaskKey) : null,
        "no-ui-handoff": x.noUiHandoff || null, "needs-approval": x.needsApproval || null, lead: x.lead || null,
        look: x.look || [], hair: x.hair || null,
      };
      return { id: a.id, text: serialize(meta, a.brief) };
    });
    const teams = TEMPLATE_TEAMS.map(x => ({ id: x.id, name: x[L], color: x.color, style: x.id }));
    return { teams, purpose: TEMPLATE_PURPOSE[L], agents };
  }

  return { parse, serialize, globToRegex, toAgent, metaOf, seed, uniqueId, slug, asList, LOOK_NAMES, TEMPLATE_PURPOSE };
})();
