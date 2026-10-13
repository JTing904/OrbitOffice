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

  // ---- 内容团队模板：做图文和短视频内容（小红书、抖音、公众号…）----
  const CONTENT = {
    purpose: {
      zh: "我们是一个内容团队：根据用户的品牌和目标人群，策划选题，写图文笔记和短视频脚本，审稿把关，再整理成各平台的发布版本和排期。所有成果都是工作文件夹里可以直接复制使用的 Markdown 文件。",
      en: "We are a content team: for the user's brand and audience we plan topics, write posts and short-video scripts, review everything, and prepare per-platform versions and a publishing schedule. Every deliverable is a ready-to-use Markdown file in the working folder.",
    },
    teams: [
      { id: "plan", color: "#f59e0b", style: "product", zh: "策划室", en: "Planning" },
      { id: "create", color: "#ec4899", style: "quality", zh: "创作室", en: "Studio" },
      { id: "review", color: "#22c55e", style: "security", zh: "审核室", en: "Review" },
    ],
    agents: [
      { id: "strategist", team: "plan", color: "#f59e0b", lead: true, look: ["glasses"], hair: "#2b2118", writes: ["plan/"],
        keywords: ["策划", "选题", "计划", "排期", "方向", "plan", "topic", "calendar", "strategy"],
        zh: { name: "策划", role: "内容策划", skills: ["选题", "内容规划", "目标人群"] },
        en: { name: "Strategist", role: "Content strategist", skills: ["Topics", "Content planning", "Audience"] },
        body: {
          zh: "你负责把用户的需求变成一份能直接执行的内容计划。\n\n1. 先弄清楚：品牌或账号是谁、目标人群、平台、想达到什么效果。缺了关键信息就问用户一个问题，不要瞎猜。\n2. 写进 plan/内容计划.md：每条选题一行，写清标题方向、要点、形式（图文还是短视频）、交给谁。选题要具体，一看就知道写什么。\n3. 把每条内容交给对口的同事：图文交给「文案」，短视频交给「脚本」。一次交接写清楚一条选题。\n4. 只写计划，不要自己写正文或脚本。",
          en: "You turn the user's request into a content plan that can be executed right away.\n\n1. First make sure you know the brand or account, the audience, the platform and the goal. If something key is missing, ask the user one question instead of guessing.\n2. Write plan/content-plan.md: one line per topic with the angle, key points, format (post or short video) and owner. Topics must be concrete enough to write from.\n3. Hand each piece to the right teammate: posts to the copywriter, videos to the scriptwriter, one topic per handoff.\n4. Only plan; do not write the posts or scripts yourself.",
        } },
      { id: "copywriter", team: "create", color: "#ec4899", look: [], hair: "#5a3b25", writes: ["drafts/"], sendTo: "editor",
        keywords: ["文案", "笔记", "图文", "标题", "正文", "小红书", "公众号", "copy", "post", "caption", "article"],
        zh: { name: "文案", role: "图文文案", skills: ["标题", "正文", "话题标签"] },
        en: { name: "Copywriter", role: "Post copywriter", skills: ["Headlines", "Body copy", "Hashtags"] },
        body: {
          zh: "你负责写能直接发布的图文内容。\n\n- 每篇写进 drafts/<日期>-<主题>.md，包括：3 个备选标题（标出最推荐的一个）、正文、5 到 8 个话题标签。\n- 开头一句要让人想往下看；正文分短段，口语化，有具体细节，不要空话套话。\n- 品牌名、产品功效只写用户给过的或项目文件里有的，不确定就不写。不用「最」「第一」「100%」这类绝对化词。\n- 写完交给「审稿」。",
          en: "You write posts that are ready to publish.\n\n- Write each one to drafts/<date>-<topic>.md: three headline options (mark the best), the body, and 5-8 hashtags.\n- The first line must make people keep reading; short paragraphs, conversational, concrete details, no filler.\n- Only state brand facts and product claims the user gave or that are in the project files. Avoid absolute words such as best, #1 or 100%.\n- When done, hand off to the editor.",
        } },
      { id: "scriptwriter", team: "create", color: "#8b5cf6", look: ["headset"], hair: "#1f2937", writes: ["scripts/"], sendTo: "editor",
        keywords: ["脚本", "短视频", "视频", "分镜", "口播", "抖音", "script", "video", "storyboard", "reel"],
        zh: { name: "脚本", role: "短视频脚本", skills: ["开头钩子", "分镜", "口播"] },
        en: { name: "Scriptwriter", role: "Short-video scripts", skills: ["Hooks", "Storyboards", "Voice-over"] },
        body: {
          zh: "你负责写短视频脚本。\n\n- 每条写进 scripts/<主题>.md，用表格：镜头号、时长、画面、台词或字幕、备注。默认 30 到 60 秒。\n- 前 3 秒必须有钩子（一个问题、反差或结果先行），让人不划走；结尾给一个明确的行动（关注、评论、点链接）。\n- 台词口语化，每句短；画面写得具体到能照着拍。\n- 不夸大功效，不用绝对化词。写完交给「审稿」。",
          en: "You write short-video scripts.\n\n- Write each to scripts/<topic>.md as a table: shot, duration, visuals, lines or captions, notes. Default 30-60 seconds.\n- The first 3 seconds need a hook (a question, a contrast, or the result first); end with a clear call to action.\n- Conversational, short lines; visuals concrete enough to shoot from.\n- No exaggerated claims or absolute words. When done, hand off to the editor.",
        } },
      { id: "editor", team: "review", color: "#22c55e", look: ["glasses", "tie"], hair: "#4a4038",
        keywords: ["审稿", "审核", "检查", "违禁词", "合规", "校对", "review", "proofread", "compliance", "check"],
        zh: { name: "审稿", role: "审稿与合规", skills: ["校对", "违禁词", "事实核对"] },
        en: { name: "Editor", role: "Editing & compliance", skills: ["Proofreading", "Banned words", "Fact checks"] },
        body: {
          zh: "你负责发布前的最后把关。\n\n- 逐句检查：错别字和病句；绝对化用词（最、第一、唯一、100%、必备、必买、神器、根治、永久…），每一处都要改；夸大或虚假的功效，以及用户没提供、项目文件里也没有的产品功效和数据，一律删掉或改成个人感受；平台敏感词；和当前季节、日期对不上的说法。\n- 小问题直接在原文件里改；把每处修改和原因记进 review/审稿记录.md。\n- 问题大到需要重写的（方向错了、事实不对），不要自己重写：打回给原作者，写清楚要改什么。\n- 检查通过的，交给「运营」准备发布。",
          en: "You are the final check before publishing.\n\n- Check every sentence: typos and grammar; absolute claims (best, #1, only, 100%, must-have, miracle, cures, forever…) — fix every one; exaggerated or false claims, and any product claim or number the user did not provide and the project files do not contain — remove it or turn it into a personal impression; platform-sensitive words; anything that does not match the current season or date.\n- Fix small issues directly in the file and log each change and why in review/review-log.md.\n- If it needs a rewrite (wrong angle, wrong facts), do not rewrite it yourself: send it back to the author with what must change.\n- When it passes, hand off to the publisher.",
        } },
      { id: "publisher", team: "plan", color: "#06b6d4", look: ["cap"], hair: "#3a2a1c", writes: ["publish/"],
        keywords: ["运营", "发布", "排期", "平台", "改写", "publish", "schedule", "platform"],
        zh: { name: "运营", role: "社媒运营", skills: ["发布排期", "多平台改写", "互动话术"] },
        en: { name: "Publisher", role: "Social media manager", skills: ["Scheduling", "Platform versions", "Community replies"] },
        body: {
          zh: "你负责把审过的内容整理成可以直接发的版本。\n\n- 每篇内容在 publish/<主题>.md 里给出各平台的版本（标题长度、标签数量、语气按平台调整），以及建议的发布时间。\n- 在 publish/排期.md 里维护一张发布排期表：日期、平台、内容、状态。\n- 准备 3 到 5 条评论区的回复话术。\n- 只改写和排期，不改原稿的意思；发现原稿有问题就交回给「审稿」。",
          en: "You turn reviewed content into ready-to-post versions.\n\n- For each piece, write publish/<topic>.md with a version per platform (headline length, hashtag count and tone adjusted) and a suggested posting time.\n- Keep a schedule table in publish/schedule.md: date, platform, piece, status.\n- Prepare 3-5 replies for the comments.\n- Only adapt and schedule; do not change what the content says. If the draft has a problem, send it back to the editor.",
        } },
    ],
  };

  function seedContent(lang) {
    const L = lang === "en" ? "en" : "zh";
    const agents = CONTENT.agents.map((a, i) => ({ id: a.id, text: serialize({
      name: a[L].name, role: a[L].role, team: a.team, order: i + 1, color: a.color, skills: a[L].skills, keywords: a.keywords, writes: a.writes || null,
      "send-results-to": a.sendTo || null, "recheck-by": a.recheck || null, lead: a.lead || null, look: a.look, hair: a.hair,
    }, a.body[L]) }));
    return { teams: CONTENT.teams.map(x => ({ id: x.id, name: x[L], color: x.color, style: x.style })), purpose: CONTENT.purpose[L], agents };
  }

  const TEMPLATES = ["software", "content"];
  const fromTemplate = (name, lang) => (name === "content" ? seedContent(lang) : seed(lang, {}));

  return { parse, serialize, globToRegex, toAgent, metaOf, seed, fromTemplate, TEMPLATES, uniqueId, slug, asList, LOOK_NAMES, TEMPLATE_PURPOSE };
})();
