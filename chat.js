"use strict";

// 聊天浮窗：可拖动 / 缩放 / 最小化，群聊 + 每位员工的单聊，@ 点名弹层。
// 已接入真实流程：在单聊里说话，这位员工会回答或动手做；在群聊里说话，会交给最对口的员工（或你 @ 的人）。
// 员工干活时有问题也会在单聊里问你，你的回复就是答案（见 ask）。
// 群聊里多人互相讨论、以及结论卡片的「转成任务」尚未接入；没有真实消息时群聊显示示例对话。
// 依赖 app.js 的全局数据（AGENTS、agentName、agentColor、mode）与 i18n.js，都在调用时才读取。
const ChatUI = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const GEO_KEY = "myaioffice.chatwin";
  const MIN_W = 340, MIN_H = 380;

  // 示例讨论：{ me } 用户、{ a } 员工、{ sys } 系统行、{ plan } 结论卡片
  const DEMO = {
    zh: [
      { me: "我要计划做一个游戏" },
      { sys: "chat.started" },
      { a: "planner", text: "先把范围定清楚：类型、目标平台、第一个可玩版本要做到什么程度？我建议按 原型 → 垂直切片 → 发布 三个里程碑推进。" },
      { a: "writer", text: "@规划师 我来写游戏设计文档：核心玩法、关卡流程、美术风格。有了文档，后面所有人都有同一个参照。" },
      { a: "reviewer", text: "技术上先定好代码规范和模块划分，别把渲染、逻辑、存档混在一起，后期重构会很痛。" },
      { a: "tester", text: "我建议每个里程碑都有可验收的标准，比如帧率、加载时间、关键流程能通关。越早定越好。" },
      { a: "devops", text: "构建和发布流水线我来搭：自动打包、版本号、多平台导出。@测试员 打包产物我会自动提供给你测。" },
      { a: "debugger", text: "还要提前接入崩溃日志和调试面板，玩家一卡死我们才知道原因。" },
      { a: "planner", tag: "chat.tag.summary", text: "结论：先花 1 周做原型，验证核心玩法好不好玩。下面是我整理的任务建议。" },
      { plan: [["planner", "拆解游戏项目的范围和里程碑"], ["writer", "撰写游戏设计文档（核心玩法、关卡、美术风格）"], ["reviewer", "确定代码规范与模块划分"],
        ["tester", "制定各里程碑的验收标准"], ["devops", "搭建自动构建与发布流水线"], ["debugger", "接入崩溃日志与调试面板"]] },
    ],
    en: [
      { me: "I want to plan a game" },
      { sys: "chat.started" },
      { a: "planner", text: "Let's pin down the scope first: genre, target platform, and how far the first playable goes. I'd run three milestones: prototype → vertical slice → release." },
      { a: "writer", text: "@Planner I'll write the game design doc: core loop, level flow, art style. Then everyone works from the same reference." },
      { a: "reviewer", text: "Technically, settle code conventions and module boundaries early. Don't mix rendering, logic and saves — refactoring later hurts." },
      { a: "tester", text: "Give every milestone acceptance criteria: frame rate, load time, the critical path is completable. The earlier the better." },
      { a: "devops", text: "I'll set up the build and release pipeline: automated packaging, versioning, multi-platform export. @Tester I'll hand you each build automatically." },
      { a: "debugger", text: "Wire up crash logging and a debug panel up front, so we know why when a player gets stuck." },
      { a: "planner", tag: "chat.tag.summary", text: "Conclusion: spend one week on a prototype to prove the core loop is fun. Here are the tasks I'd suggest." },
      { plan: [["planner", "Break down the game's scope and milestones"], ["writer", "Write the game design doc (core loop, levels, art style)"], ["reviewer", "Define code conventions and module boundaries"],
        ["tester", "Define acceptance criteria per milestone"], ["devops", "Set up the automated build and release pipeline"], ["debugger", "Wire up crash logging and a debug panel"]] },
    ],
  };

  let geo = { x: 22, y: 82, w: 420, h: 640, open: false, min: false };
  let space = "group";              // "group" 或员工 id
  const sent = {};                  // 群聊里本次会话用户发的消息（不保存）
  const DM_KEY = "myaioffice.dm";
  let dm = {};                      // agentId -> [{ me?: true, text, at }]，单聊记录（保存在本机）
  let unread = {};                  // agentId -> 未读条数
  const waiting = {};               // agentId -> 等用户回答的问题的 resolve

  function loadDm() {
    try { const s = JSON.parse(localStorage.getItem(DM_KEY) || "{}"); dm = s.dm || {}; unread = s.unread || {}; } catch (_) { /* 忽略损坏的存档 */ }
  }
  function saveDm() {
    for (const id in dm) if (dm[id].length > 100) dm[id] = dm[id].slice(-100);
    try { localStorage.setItem(DM_KEY, JSON.stringify({ dm, unread })); } catch (_) { /* 忽略 */ }
  }
  function badge() {
    const n = Object.values(unread).reduce((a, b) => a + b, 0);
    $("chat-btn").classList.toggle("has-unread", n > 0);
    $("chat-pill").classList.toggle("has-unread", n > 0);
  }

  // 员工在单聊里向用户提问；返回的 Promise 在用户回复后给出答案
  function ask(agentId, text) {
    (dm[agentId] || (dm[agentId] = [])).push({ text, at: Date.now(), question: true });
    if (waiting[agentId]) waiting[agentId]("");   // 上一个问题还没答就来了新的：旧的按未回答处理
    const p = new Promise(resolve => { waiting[agentId] = resolve; });
    saveDm();
    open(agentId);   // 任务在等这个回答，直接把窗口切到这位员工的单聊
    return p;
  }
  // 员工主动发一条消息（不需要回答）
  function tell(agentId, text, inGroup) {
    const key = inGroup ? "group" : agentId;
    (dm[key] || (dm[key] = [])).push({ text, at: Date.now(), a: agentId });
    if (!(geo.open && !geo.min && space === key)) unread[key] = (unread[key] || 0) + 1;
    delete busy[agentId];
    saveDm(); badge(); render();
  }
  const busy = {};   // agentId -> 正在处理聊天消息
  let talk = null;   // 正在进行的群聊讨论：{ stop, typing }

  const pushGroup = entry => { (dm.group || (dm.group = [])).push(Object.assign({ at: Date.now() }, entry)); saveDm(); render(); };
  // 群聊讨论：几位员工依次发言（各自从岗位角度说，能看到前面的人说了什么），最后规划师给出结论和建议任务
  async function discuss(topic) {
    if (!(window.desktop && desktop.agent && desktop.agent.say)) return false;
    const state = talk = { stop: false, typing: null };
    const order = [];
    for (const id of ["planner", pickAgent(topic), "designer", "developer", "tester", "reviewer", "devops", "writer", "debugger"]) {
      const a = agentById(id);
      if (a && !order.includes(a)) order.push(a);
    }
    const speakers = order.slice(0, 5);
    const transcript = () => (dm.group || []).filter(m => m.text).slice(-14).map(m => (m.me ? "User" : agentName(agentById(m.a))) + ": " + m.text).join("\n");
    pushGroup({ sys: t("chat.started", { n: speakers.length }) });
    let failed = null;
    for (const [i, a] of speakers.entries()) {
      if (state.stop) break;
      state.typing = a.id; render();
      const r = await desktop.agent.say({ mode: "turn", first: i === 0, agentName: agentName(a), agentRole: agentRole(a), brief: a.brief, topic, transcript: transcript(), lang: LANG });
      if (state.stop) break;
      if (r.ok && r.text) pushGroup({ a: a.id, text: r.text });
      else { failed = r; break; }
    }
    if (!state.stop && !failed) {
      const p = agentById("planner");
      state.typing = p.id; render();
      const r = await desktop.agent.say({ mode: "plan", agentName: agentName(p), agentRole: agentRole(p), topic, transcript: transcript(),
        team: AGENTS.map(x => x.id + ": " + x.en.role).join("; "), lang: LANG });
      if (r.ok && !state.stop) {
        pushGroup({ a: p.id, text: r.summary, tag: "chat.tag.summary" });
        const tasks = (r.tasks || []).filter(x => agentById(x.to));
        if (tasks.length) pushGroup({ plan: tasks, added: [] });
      } else if (!r.ok) failed = r;
    }
    if (state.stop) pushGroup({ sys: t("chat.talk.stopped") });
    else if (failed) pushGroup({ sys: t("chat.talk.failed", { error: failed.detail || failed.error || "" }) });
    talk = null;
    render();
    return true;
  }
  function stopTalk() { if (talk) { talk.stop = true; if (window.desktop && desktop.agent) desktop.agent.talkStop(); } }

  // 讨论结论卡片：每条建议可以单独加入任务，或全部加入（遵守权限模式）
  function realPlanCard(entry) {
    const card = el("div", "plan");
    card.append(el("span", "eyebrow", t("chat.plan.title")));
    // after：排在哪个任务后面（「全部转为任务」时按顺序一个接一个做）
    const add = (i, after) => {
      if (entry.added.includes(i)) return null;
      const task = addTask(entry.plan[i].task, entry.plan[i].to, false);
      if (task && after) task.after = after.id;
      entry.added.push(i);
      saveDm();
      return task;
    };
    entry.plan.forEach((item, i) => {
      const a = agentById(item.to);
      const row = el("div", "plan-item");
      const dot = el("i", "dot");
      dot.style.setProperty("--c", agentColor(a));
      row.append(dot, el("span", "nm", agentName(a)), el("span", "tt", item.task));
      if (entry.added.includes(i)) row.append(el("span", "added", t("chat.plan.added")));
      else { const b = el("button", "add", "+"); b.type = "button"; b.addEventListener("click", () => { add(i); render(); }); row.append(b); }
      card.append(row);
    });
    const left = entry.plan.length - entry.added.length;
    if (left) {
      const foot = el("div", "plan-foot");
      const all = el("button", "primary", t("chat.plan.all", { n: left }));
      all.type = "button";
      all.addEventListener("click", () => { let prev = null; entry.plan.forEach((_, i) => { prev = add(i, prev) || prev; }); save(); render(); });
      foot.append(all);
      card.append(foot);
    }
    card.append(el("div", "plan-note", t("chat.plan.seq")));
    return card;
  }
  // 群聊里这句话该谁来接：被 @ 的人，否则按内容挑最对口的
  function addressee(text) {
    const at = AGENTS.find(a => text.includes("@" + agentName(a)));
    return at ? at.id : pickAgent(text);
  }
  let atIndex = 0, atList = [];

  function loadGeo() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(GEO_KEY) || "null"); } catch (_) { /* 忽略损坏的存档 */ }
    if (saved) Object.assign(geo, saved);
    else geo.h = Math.max(MIN_H, Math.min(640, window.innerHeight - geo.y - 200));   // 默认高度：停在底部指令栏上方
  }
  function saveGeo() {
    try { localStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch (_) { /* 忽略 */ }
  }

  // 保证窗口在可视范围内
  function clamp() {
    const top = document.body.classList.contains("has-titlebar") ? 34 : 0;
    geo.w = Math.max(MIN_W, Math.min(geo.w, window.innerWidth - 16));
    geo.h = Math.max(MIN_H, Math.min(geo.h, window.innerHeight - top - 16));
    geo.x = Math.max(8, Math.min(geo.x, window.innerWidth - geo.w - 8));
    geo.y = Math.max(top + 8, Math.min(geo.y, window.innerHeight - geo.h - 8));
  }
  function applyGeo() {
    clamp();
    const w = $("chat-win");
    w.style.left = geo.x + "px"; w.style.top = geo.y + "px";
    w.style.width = geo.w + "px"; w.style.height = geo.h + "px";
    w.hidden = !geo.open || geo.min;
    $("chat-pill").hidden = !(geo.open && geo.min);
    $("chat-btn").classList.toggle("active", geo.open && !geo.min);
  }

  function open(target) {
    if (target) space = target;
    geo.open = true; geo.min = false;
    applyGeo(); saveGeo(); render();
    $("chat-input").focus();
  }
  function close() { geo.open = false; applyGeo(); saveGeo(); }
  function minimize() { geo.min = true; applyGeo(); saveGeo(); }
  function toggle() { if (geo.open && !geo.min) close(); else open(); }

  // ---- 拖动与缩放 ----
  function dragging(handle, onMove) {
    handle.addEventListener("pointerdown", e => {
      if (e.button !== 0 || e.target.closest("button")) return;
      e.preventDefault();
      const start = { px: e.clientX, py: e.clientY, x: geo.x, y: geo.y, w: geo.w, h: geo.h };
      handle.setPointerCapture(e.pointerId);
      const move = ev => { onMove(start, ev.clientX - start.px, ev.clientY - start.py); applyGeo(); };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        saveGeo();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  // ---- 渲染 ----
  function richText(text) {
    const frag = document.createDocumentFragment();
    for (const part of text.split(/(@[^\s@，。,.!?！？]+)/)) {
      if (!part) continue;
      frag.append(part[0] === "@" ? el("span", "at", part) : document.createTextNode(part));
    }
    return frag;
  }
  function agentMsg(a, text, tagKey) {
    const row = el("div", "cmsg");
    row.style.setProperty("--c", agentColor(a));
    const who = el("div", "who", agentName(a));
    if (tagKey) who.append(el("i", null, t(tagKey)));
    const txt = el("div", "txt");
    txt.append(richText(text));
    const col = el("div");
    col.append(who, txt);
    row.append(el("div", "av", agentName(a)[0] || "?"), col);
    return row;
  }
  function myMsg(text) {
    const row = el("div", "cmsg me");
    const txt = el("div", "txt");
    txt.append(richText(text));
    const col = el("div");
    col.append(txt);
    row.append(col);
    return row;
  }
  function soon() { UI.toast(t("chat.plan.soon")); }

  function planCard(items) {
    const card = el("div", "plan");
    card.append(el("span", "eyebrow", t("chat.plan.title")));
    for (const [id, title] of items) {
      const a = agentById(id);
      const row = el("div", "plan-item");
      const dot = el("i", "dot");
      dot.style.setProperty("--c", agentColor(a));
      const add = el("button", "add", "+");
      add.type = "button";
      add.addEventListener("click", soon);
      row.append(dot, el("span", "nm", agentName(a)), el("span", "tt", title), add);
      card.append(row);
    }
    const foot = el("div", "plan-foot");
    const all = el("button", "primary", t("chat.plan.all", { n: items.length }));
    const more = el("button", "ghost small", t("chat.plan.more"));
    all.type = more.type = "button";
    all.addEventListener("click", soon);
    more.addEventListener("click", () => $("chat-input").focus());
    foot.append(all, more);
    card.append(foot, el("div", "plan-note", t("chat.plan.note", { mode: t("mode." + mode) })));
    return card;
  }

  function renderSpaces() {
    const box = $("chat-spaces");
    box.replaceChildren();
    const mk = (id, label, avatar, color) => {
      const b = el("button", "space" + (space === id ? " active" : ""));
      b.type = "button";
      if (color) b.style.setProperty("--c", color);
      b.append(avatar, document.createTextNode(label));
      if (unread[id] || waiting[id]) b.append(el("i", "space-dot"));
      b.addEventListener("click", () => { space = id; render(); $("chat-input").focus(); });
      box.append(b);
    };
    const g = el("span", "av group");
    g.textContent = "#";
    mk("group", t("chat.group"), g);
    for (const a of AGENTS) mk(a.id, agentName(a), el("span", "av", agentName(a)[0] || "?"), agentColor(a));
  }

  function render() {
    if (!geo.open || geo.min) return;
    renderSpaces();
    const isGroup = space === "group";
    const a = isGroup ? null : agentById(space);
    $("chat-title").textContent = isGroup ? t("chat.title.group") : agentName(a);
    $("chat-subtitle").textContent = isGroup ? t("chat.online", { n: AGENTS.length }) : agentRole(a);
    $("chat-pill-text").textContent = $("chat-title").textContent;
    $("chat-input").placeholder = t("chat.placeholder");

    const log = $("chat-log");
    log.replaceChildren();
    if (isGroup) {
      log.append(el("div", "cw-sys demo", t("chat.demo")));
      for (const m of DEMO[LANG]) {
        if (m.me) log.append(myMsg(m.me));
        else if (m.sys) log.append(el("div", "cw-sys", t(m.sys, { n: AGENTS.length })));
        else if (m.plan) log.append(planCard(m.plan));
        else log.append(agentMsg(agentById(m.a), m.text, m.tag));
      }
    }
    if (isGroup && (dm.group || []).length) {
      // 群聊里有真实消息了：显示真实记录，不再显示示例
      log.replaceChildren();
      if (unread.group) { unread.group = 0; saveDm(); badge(); }
      for (const m of dm.group) {
        if (m.sys) log.append(el("div", "cw-sys", m.sys));
        else if (m.plan) log.append(realPlanCard(m));
        else log.append(m.me ? myMsg(m.text) : agentMsg(agentById(m.a) || AGENTS[0], m.text, m.tag));
      }
      if (talk) {
        const note = el("div", "cw-sys demo talk-status", talk.typing ? t("chat.talk.typing", { name: agentName(agentById(talk.typing)) }) : "");
        const stop = el("button", "stop", t("chat.talk.stop"));
        stop.type = "button";
        stop.addEventListener("click", stopTalk);
        note.append(stop);
        log.append(note);
      }
      for (const id in busy) if (busy[id] === "group") log.append(el("div", "cw-sys demo", t("chat.working", { name: agentName(agentById(id)) })));
    } else if (!isGroup) {
      const list = dm[space] || [];
      if (unread[space]) { unread[space] = 0; saveDm(); badge(); }
      if (!list.length) {
        const empty = el("div", "cw-empty");
        const av = el("div", "av", agentName(a)[0] || "?");
        av.style.setProperty("--c", agentColor(a));
        empty.append(av, document.createTextNode(t("chat.dm.empty", { name: agentName(a) })));
        log.append(empty);
      }
      for (const m of list) log.append(m.me ? myMsg(m.text) : agentMsg(a, m.text, m.question ? "chat.tag.question" : null));
      if (waiting[space]) log.append(el("div", "cw-sys demo", t("chat.waiting", { name: agentName(a) })));
      else if (busy[space]) log.append(el("div", "cw-sys demo", t("chat.working", { name: agentName(a) })));
      else if (list.length && list[list.length - 1].me) log.append(el("div", "cw-sys", t("chat.dm.noted")));
    }
    log.scrollTop = log.scrollHeight;

    const sugg = $("chat-sugg");
    sugg.replaceChildren();
    for (const k of ["chat.sug.1", "chat.sug.2", "chat.sug.3"]) {
      const b = el("button", null, t(k));
      b.type = "button";
      b.addEventListener("click", () => { $("chat-input").value = t(k); $("chat-input").focus(); });
      sugg.append(b);
    }
  }

  // ---- @ 点名弹层 ----
  function updateAt() {
    const input = $("chat-input"), pop = $("chat-at");
    const m = input.value.slice(0, input.selectionStart).match(/@([^\s@]*)$/);
    atList = m ? AGENTS.filter(a => agentName(a).toLowerCase().includes(m[1].toLowerCase())) : [];
    pop.hidden = !atList.length;
    pop.replaceChildren();
    atIndex = Math.min(atIndex, Math.max(0, atList.length - 1));
    atList.forEach((a, i) => {
      const b = el("button", i === atIndex ? "active" : "");
      b.type = "button";
      const av = el("span", "av", agentName(a)[0] || "?");
      av.style.setProperty("--c", agentColor(a));
      b.append(av, document.createTextNode(agentName(a)), el("small", null, agentRole(a)));
      b.addEventListener("mousedown", e => { e.preventDefault(); pickAt(i); });
      pop.append(b);
    });
  }
  function pickAt(i) {
    const input = $("chat-input"), a = atList[i];
    if (!a) return;
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@([^\s@]*)$/, "@" + agentName(a) + " ");
    input.value = before + input.value.slice(pos);
    input.setSelectionRange(before.length, before.length);
    atIndex = 0;
    updateAt();
  }

  function init() {
    loadGeo();
    loadDm();
    dragging($("chat-head"), (s, dx, dy) => { geo.x = s.x + dx; geo.y = s.y + dy; });
    dragging($("chat-resize"), (s, dx, dy) => { geo.w = Math.max(MIN_W, s.w + dx); geo.h = Math.max(MIN_H, s.h + dy); });

    $("chat-btn").addEventListener("click", toggle);
    $("chat-min").addEventListener("click", minimize);
    $("chat-close").addEventListener("click", close);
    $("chat-pill").addEventListener("click", () => open());
    window.addEventListener("resize", applyGeo);

    const input = $("chat-input");
    input.addEventListener("input", () => { atIndex = 0; updateAt(); });
    input.addEventListener("blur", () => { $("chat-at").hidden = true; });
    input.addEventListener("keydown", e => {
      if ($("chat-at").hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); atIndex = Math.min(atList.length - 1, atIndex + 1); updateAt(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); atIndex = Math.max(0, atIndex - 1); updateAt(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickAt(atIndex); }
      else if (e.key === "Escape") { e.stopPropagation(); $("chat-at").hidden = true; }
    });
    $("chat-form").addEventListener("submit", e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      const history = (dm[space] || []).slice(-8).map(m => ({ me: !!m.me, text: m.text }));
      (dm[space] || (dm[space] = [])).push({ me: true, text, at: Date.now() });
      saveDm();
      if (space !== "group" && waiting[space]) {
        // 这位员工正在等回答：把这条回复交给他，任务继续
        const resolve = waiting[space]; delete waiting[space]; resolve(text);
      } else {
        // 直接对话：交给这位员工（群聊里交给被 @ 的人或最对口的人），回复会出现在这里
        const mentioned = space === "group" && AGENTS.some(a => text.includes("@" + agentName(a)));
        if (space === "group" && !mentioned) {
          // 群里没点名：大家一起讨论，最后给出结论
          if (!talk) discuss(text).then(ok => { if (!ok) { pushGroup({ sys: t("chat.dm.noted") }); } });
        } else {
          const who = space === "group" ? addressee(text) : space;
          if (chatToAgent(who, text, history, space === "group")) busy[who] = space === "group" ? "group" : "dm";
        }
      }
      render();
    });
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); toggle(); }
    });
    applyGeo();
    badge();
    render();
  }

  return { init, open, close, toggle, render, ask, tell, isOpen: () => geo.open && !geo.min };
})();
