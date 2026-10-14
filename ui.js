"use strict";

// 界面层：页面切换（办公室 / 任务 / 大脑 / 设置）、员工面板、指令面板、提示条、小地图、桌面标题栏。
// 依赖 app.js 里的全局数据与函数（tasks、AGENTS、addTask、setMode……），都在调用时才读取，所以本文件可先于 app.js 加载。
const UI = (() => {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const button = (cls, text, onClick) => {
    const b = el("button", cls, text);
    b.type = "button";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  };

  const VIEWS = ["office", "tasks", "brain", "settings"];
  let in3d = false;
  let panel = null;          // null | "tasks" | "agent" | "brain" | "settings"
  let selected = null;       // 当前选中的员工 id
  let tasksTab = "board";
  let memQuery = "", memTeam = "all", memOpen = null;
  let agentSig = "", agentRefs = {}, brainSig = "";
  let palIndex = 0, palItems = [];
  let detailId = null, detailSig = "", detailOpenFile = null;   // 任务详情页

  // ---------- 页面切换 ----------
  function open(name) {
    if (!name || name === "office") return closeAll();
    panel = name;
    const inDrawer = name === "tasks" || name === "agent";
    $("drawer").classList.toggle("open", inDrawer);
    $("drawer").setAttribute("aria-hidden", String(!inDrawer));
    $("sheet").classList.toggle("open", !inDrawer);
    $("sheet").setAttribute("aria-hidden", String(inDrawer));
    $("view-tasks").hidden = name !== "tasks";
    $("view-agent").hidden = name !== "agent";
    $("view-brain").hidden = name !== "brain";
    $("view-settings").hidden = name !== "settings";
    $("view-task").hidden = name !== "task";

    if (name !== "agent") { selected = null; if (in3d) Office3D.setSelected(null); }
    if (name === "tasks") showTasksTab();
    if (name === "agent") { agentSig = ""; renderAgent(); }
    if (name === "brain") buildBrain();
    if (name === "settings") buildSettings();
    if (name === "task") { detailSig = ""; renderTask(); }
    syncChrome();
  }

  function closeAll() {
    panel = null;
    selected = null;
    if (in3d) Office3D.setSelected(null);
    $("drawer").classList.remove("open");
    $("drawer").setAttribute("aria-hidden", "true");
    $("sheet").classList.remove("open");
    $("sheet").setAttribute("aria-hidden", "true");
    syncChrome();
  }

  // 标签高亮、标题、场景避让
  function syncChrome() {
    const active = panel === "agent" || !panel ? "office" : panel === "task" ? "tasks" : panel;
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === active));
    setText($("drawer-title"), panel === "agent" ? t("ap.title") : t("tasks.title"));
    setText($("sheet-title"), panel === "settings" ? t("set.title") : panel === "task" ? t("td.title") : t("nav.brain"));
    updateInset();
  }

  // 让 3D 场景避开右侧抽屉和底部指令栏
  function updateInset() {
    const drawerOpen = (panel === "tasks" || panel === "agent") && window.innerWidth > 900;
    document.body.classList.toggle("drawer-open", drawerOpen);
    if (!in3d) return;
    Office3D.setInset(drawerOpen ? Math.min(430, window.innerWidth * 0.4) : 0, $("task-form").offsetHeight + 22);
  }

  // ---------- 任务面板 ----------
  function showTasksTab() {
    document.querySelectorAll(".subtab").forEach(b => b.classList.toggle("active", b.dataset.sub === tasksTab));
    $("board").hidden = tasksTab !== "board";
    $("log").hidden = tasksTab !== "log";
  }

  function updateBadge() {
    const pending = tasks.filter(x => x.status === "pending").length;
    const active = tasks.filter(x => x.status === "queued" || x.status === "doing").length;
    const n = pending || active;
    const badge = $("tab-count");
    badge.hidden = !n;
    setText(badge, String(n));
    badge.classList.toggle("alert", pending > 0);
  }

  // ---------- 员工面板 ----------
  function selectAgent(id) {
    selected = id;
    if (in3d) Office3D.setSelected(id);
    $("task-agent").value = id;
    open("agent");
  }
  function focusTeam(id) { if (in3d) Office3D.focus(id); }

  function renderAgent() {
    if (panel !== "agent" || !selected) return;
    const a = agentById(selected);
    const st = agentStatus(a);
    const recent = tasks.filter(x => x.agentId === a.id && x.status === "done").sort((p, q) => q.doneAt - p.doneAt).slice(0, 3);
    const queued = tasks.filter(x => x.agentId === a.id && x.status === "queued").length;
    const sig = [LANG, agentsVersion, st.key, st.cur && st.cur.id, st.pending && st.pending.id, queued, recent.map(r => r.id).join(",")].join("|");
    if (sig !== agentSig) { agentSig = sig; buildAgentView(a, st, recent, queued); }

    if (agentRefs.fill && st.cur) {
      agentRefs.fill.style.width = `${Math.round(st.cur.progress * 100)}%`;
      const steps = a[LANG].steps;
      setText(agentRefs.step, (st.cur.real || st.cur.blocked) ? (st.cur.stepText || "") : steps[Math.min(steps.length - 1, Math.floor(st.cur.progress * steps.length))]);
    }
  }

  function teamPill(team) {
    if (!TEAMS.includes(team)) return document.createTextNode("");   // 员工已被删除、所属的组也不在了
    const p = el("span", "team-pill");
    p.style.setProperty("--tc", team.color);
    p.append(el("i"), document.createTextNode(teamName(team)));
    return p;
  }

  function buildAgentView(a, st, recent, queued) {
    const v = $("view-agent");
    v.replaceChildren();
    v.style.setProperty("--c", agentColor(a));
    agentRefs = {};

    const head = el("div", "ap-head");
    const chip = el("span", "chip", t("chip." + st.key));
    chip.dataset.k = st.key;
    const who = el("div", "ap-who");
    who.append(el("h3", "ap-name", agentName(a)), el("div", "ap-role", agentRole(a)));
    head.append(el("div", "avatar big", agentName(a)[0] || "?"), who, chip);

    const teamRow = el("div", "ap-row");
    teamRow.append(el("span", "eyebrow", t("ap.team")), teamPill(teamById(a.team)));

    const skills = el("div", "ap-block");
    const chips = el("div", "skills");
    agentSkills(a).forEach(s => chips.append(el("span", null, s)));
    skills.append(el("span", "eyebrow", t("ap.skills")), chips);

    const cur = el("div", "ap-block");
    cur.append(el("span", "eyebrow", t("ap.current")));
    if (st.cur) {
      const card = el("div", "ap-task");
      card.append(el("div", "ap-task-title", taskTitle(st.cur)));
      agentRefs.step = el("div", "ap-task-step");
      const bar = el("div", "bar");
      agentRefs.fill = el("i");
      bar.append(agentRefs.fill);
      card.append(agentRefs.step, bar);
      if (queued) card.append(el("div", "ap-task-queue", t("ap.queue", { n: queued })));
      cur.append(card);
    } else if (st.pending) {
      const card = el("div", "ap-task");
      card.append(el("div", "ap-task-title", taskTitle(st.pending)),
        el("div", "ap-task-step", t("board.needs", { reason: t("reason." + st.pending.reason) })));
      const row = el("div", "actions");
      row.append(button("mini ok", t("board.approve"), () => approveTask(st.pending.id)),
        button("mini no", t("board.reject"), () => rejectTask(st.pending.id)));
      card.append(row);
      cur.append(card);
    } else {
      cur.append(el("div", "empty", t("ap.none")));
    }

    const rec = el("div", "ap-block");
    rec.append(el("span", "eyebrow", t("ap.recent")));
    if (!recent.length) rec.append(el("div", "empty", t("ap.noneRecent")));
    for (const r of recent) {
      const item = el("div", "ap-result");
      item.append(el("div", "ap-result-title", taskTitle(r)), el("div", "ap-result-text", r.result || a[LANG].result));
      rec.append(item);
    }

    const actions = el("div", "ap-actions");
    actions.append(
      button("primary", t("ap.assign"), () => { $("task-agent").value = a.id; $("task-title").focus(); }),
      button("ghost", t("ap.chat"), () => ChatUI.open(a.id)),
      button("ghost", t("ap.edit"), () => { open("settings"); focusAgentRow(a.id); }),
    );
    if (in3d) actions.insertBefore(button("ghost", t("ap.locate"), () => Office3D.focus(a.team)), actions.lastChild);   // 2D 回退时没有镜头可飞
    v.append(head, teamRow, skills, cur, rec, actions);
  }

  // ---------- 大脑 ----------
  // 分页：设置和大脑内容多，按主题分成几页，一次只看一页
  const tabState = { brain: "memory", settings: "general" };
  function tabbed(view, key, pages) {
    const bar = el("div", "view-tabs");
    const panes = pages.map(p => {
      const pane = el("div", "view-pane");
      pane.append(...p.nodes.filter(Boolean));
      pane.dataset.tab = p.id;
      const h = pane.querySelector(".set-section > h3, #set-office > h3");
      if (h && h.textContent.trim() === p.label.trim()) h.hidden = true;
      return pane;
    });
    const show = id => {
      tabState[key] = id;
      bar.querySelectorAll(".view-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
      panes.forEach(p => { p.hidden = p.dataset.tab !== id; });
      if (view.parentNode) view.parentNode.scrollTop = 0;
    };
    for (const p of pages) { const b = button("view-tab", p.label, () => show(p.id)); b.dataset.tab = p.id; bar.append(b); }
    show(pages.some(p => p.id === tabState[key]) ? tabState[key] : pages[0].id);
    return { bar, panes, show };
  }

  function buildBrain() {
    const v = $("view-brain");
    v.replaceChildren();
    const head = el("div", "brain-head");
    head.append(el("div", "brain-orb"));
    const titles = el("div");
    titles.append(el("h2", null, t("brain.title")), el("p", null, ""));
    titles.lastChild.id = "brain-sub";
    head.append(titles);

    const q = el("input", "search");
    q.type = "search";
    q.placeholder = t("brain.search");
    q.value = memQuery;
    q.addEventListener("input", () => { memQuery = q.value; renderMemories(); });

    const filters = el("div", "filters");
    filters.id = "mem-filters";
    const mk = (id, label, color) => {
      const b = button("filter", label, () => { memTeam = id; renderFilters(); renderMemories(); });
      b.dataset.team = id;
      if (color) { const d = el("i", "dot"); d.style.setProperty("--c", color); b.prepend(d); }
      return b;
    };
    filters.append(mk("all", t("brain.all")));
    TEAMS.forEach(tm => filters.append(mk(tm.id, teamName(tm), tm.color)));

    const list = el("div", "mem-list");
    list.id = "mem-list";
    // 项目笔记：员工记下的决定，之后的任务会自动读到
    const notes = el("section", "td-block");
    const notesText = el("div", "td-text", t("brain.notes.none"));
    const notesHead = el("div", "brain-notes-head");
    notesHead.append(el("span", "eyebrow", t("brain.notes")));
    notes.append(notesHead, notesText);
    // 项目记忆：这个项目里记住了多少次工作（员工接新任务时会从里面找相关的）
    const memLine = el("p", "set-note brain-memory");
    notes.append(memLine);
    // 笔记和记忆跟着工作文件夹走：分了部门时可以切换看哪个部门的
    const loadNotes = dept => {
      if (!(window.desktop && desktop.files && desktop.files.notes)) return;
      notesText.textContent = t("brain.notes.none");
      desktop.files.notes(dept).then(text => { if (text) notesText.textContent = text; });
      desktop.files.memory(dept).then(m => { memLine.textContent = t("brain.memory", { n: m.count }); });
    };
    if (DEPTS.length) {
      const pick = el("select", "set-select brain-dept");
      for (const d of DEPTS) pick.append(new Option(d.name, d.id));
      pick.addEventListener("change", () => loadNotes(pick.value));
      notesHead.append(pick);
      loadNotes(DEPTS[0].id);
    } else loadNotes("");
    const skillBox = el("section", "td-block skills-lib");
    if (window.desktop && desktop.skills) buildSkills(skillBox);
    const connBox = el("section", "td-block connectors");
    if (window.desktop && desktop.connectors) buildConnSettings(connBox, desktop.connectors);
    // 大脑分三页：记忆（笔记 + 做过的成果）、技能库、连接器
    const memTitle = el("span", "eyebrow brain-results", t("brain.results"));
    const tabs = tabbed(v, "brain", [
      { id: "memory", label: t("brain.tab.memory"), nodes: [notes, memTitle, q, filters, list] },
      { id: "skills", label: t("brain.tab.skills"), nodes: window.desktop && desktop.skills ? [skillBox] : [el("p", "set-note", t("set.project.web"))] },
      { id: "connectors", label: t("brain.tab.connectors"), nodes: window.desktop && desktop.connectors ? [connBox] : [el("p", "set-note", t("set.project.web"))] },
    ]);
    v.append(head, tabs.bar, ...tabs.panes);
    UI.brainTab = tabs.show;
    renderFilters();
    brainSig = "";
    renderMemories();
  }
  function renderFilters() {
    document.querySelectorAll("#mem-filters .filter").forEach(b => b.classList.toggle("active", b.dataset.team === memTeam));
  }

  const timeText = ms => new Date(ms).toLocaleString(LANG === "zh" ? "zh-CN" : "en-US", { hour12: false });

  function renderMemories() {
    const list = $("mem-list");
    if (!list) return;
    const done = tasks.filter(x => x.status === "done").sort((p, q) => q.doneAt - p.doneAt);
    setText($("brain-sub"), t("brain.sub", { n: done.length }));

    const needle = memQuery.trim().toLowerCase();
    const shown = done.filter(x => {
      const a = agentById(x.agentId);
      if (memTeam !== "all" && a.team !== memTeam) return false;
      return !needle || (taskTitle(x) + " " + agentName(a) + " " + (x.result || a[LANG].result)).toLowerCase().includes(needle);
    });

    list.replaceChildren();
    if (!shown.length) list.append(el("div", "empty big", done.length ? t("brain.noMatch") : t("brain.empty")));
    for (const x of shown) {
      const a = agentById(x.agentId);
      const open = memOpen === x.id;
      const card = el("article", "mem" + (open ? " open" : ""));
      card.style.setProperty("--c", agentColor(a));
      card.tabIndex = 0;
      const toggle = () => { memOpen = memOpen === x.id ? null : x.id; renderMemories(); };
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });

      const top = el("div", "mem-top");
      top.append(el("b", null, taskTitle(x)), el("time", null, new Date(x.doneAt).toTimeString().slice(0, 5)));
      const meta = el("div", "mem-meta");
      const who = el("span", "who");
      who.append(el("i", "dot"), document.createTextNode(agentName(a)));
      meta.append(who, teamPill(teamById(a.team)));
      card.append(top, meta, el("div", "mem-result", x.result || a[LANG].result));

      if (open) {
        const detail = el("div", "mem-detail");
        detail.append(el("div", "mem-line", `${t("brain.completed")}  ${timeText(x.doneAt)}`));
        const parent = x.parent && tasks.find(p => p.id === x.parent);
        const children = tasks.filter(c => c.parent === x.id);
        if (parent || children.length) {
          detail.append(el("span", "eyebrow", t("brain.chain")));
          if (parent) detail.append(el("div", "mem-line", "← " + t("brain.from", { a: agentName(agentById(parent.agentId)), title: taskTitle(parent) })));
          for (const c of children) detail.append(el("div", "mem-line", "→ " + t("brain.to", { a: agentName(agentById(c.agentId)), title: taskTitle(c) })));
        }
        detail.append(button("ghost small", t("td.process"), e => { e.stopPropagation(); openTask(x.id); }));
        card.append(detail);
      }
      list.append(card);
    }
  }

  // ---------- 从做成的任务里学技能：AI 把这一次的做法提炼成通用的技能，打开编辑器给用户过目，确认后才保存 ----------
  let skillDraft = null;   // 交给技能库编辑器的草稿
  async function learnSkill(task, btn) {
    const a = agentById(task.agentId);
    btn.disabled = true;
    btn.textContent = t("td.learning");
    // 给 AI 看：任务、谁做的、过程（工具步骤）、结论、产出的文件内容（每个截一段）
    const steps = (task.trace || []).filter(e => !["thinking", "deciding", "switch"].includes(e.type))
      .map(e => "- " + e.type + (e.kind ? ":" + e.kind : "") + " " + String(e.path || e.text || "").replace(/\s+/g, " ").slice(0, 200)).slice(0, 60).join("\n");
    let files = "";
    for (const f of (task.files || []).slice(0, 5)) {
      const r = await desktop.files.read(f, (deptOf(a) || {}).id);
      if (r.ok) files += "\n\n### File: " + f + "\n" + r.text.slice(0, 2500);
    }
    const text = "Task: " + taskTitle(task) + "\nDone by: " + agentName(a) + " (" + agentRole(a) + ")\n\nSteps taken:\n" + steps +
      "\n\nFinal summary:\n" + String(task.result || "").slice(0, 2000) + (files ? "\n\nFiles produced:" + files : "");
    const r = await desktop.agent.compose({ kind: "learn", text, lang: LANG, purpose: OFFICE.purpose });
    btn.disabled = false;
    btn.textContent = t("td.learn");
    if (!r || !r.ok) return toast(t("office.ai.fail", { error: (r && (r.detail || r.error)) || "?" }), { kind: "warn", ttl: 10000 });
    const one = s => String(s || "").replace(/\s+/g, " ").trim();
    skillDraft = "---\nname: " + one(r.result.name) + "\ndescription: " + one(r.result.description) + "\nsource: learned\n---\n\n" + String(r.result.instructions || "").trim() + "\n";
    open("brain");
    toast(t("td.learned"), { kind: "ok", ttl: 6000 });
  }

  // ---------- 技能库：团队共用的做事方法（SKILL.md，格式和 Claude 的技能一样）----------
  // 员工平时只看名字和一句话简介，干活前觉得用得上才读全文。
  function buildSkills(box) {
    const api = desktop.skills;
    let editing = null;   // { id（新技能为 null）, text } 或 { ai: true }
    if (skillDraft) { editing = { id: null, text: skillDraft }; skillDraft = null; setTimeout(() => { const ed = box.querySelector(".office-editor"); if (ed) ed.scrollIntoView({ block: "center" }); }, 300); }
    let busy = "";
    const NEW = () => "---\nname: " + t("skill.newName") + "\ndescription: " + t("skill.newDesc") + "\n---\n\n" + t("skill.newBody") + "\n";
    const fail = r => UI.toast(t("skill.e", { error: (r && (r.error || r.detail)) || "?" }), { kind: "warn", ttl: 9000 });

    // 导入别人写的技能：先给你看全文，同意了才留下
    async function confirmImport(id) {
      const r = await api.read(id);
      if (!r.ok) return fail(r);
      const ok = await UI.askUser({ agent: { color: "#67e8f9", zh: { name: t("skill.title") }, en: { name: t("skill.title") } }, input: false,
        yes: t("office.import.yes"), no: t("office.import.no"), message: t("skill.importConfirm", { text: r.value.slice(0, 900) + (r.value.length > 900 ? "…" : "") }) });
      if (!ok.ok) await api.remove(id);
    }
    async function importTexts(files) {
      for (const f of files) {
        const r = await api.importText(f.name, f.text);
        if (!r.ok) { fail(r); continue; }
        await confirmImport(r.value);
      }
      draw();
    }

    async function draw() {
      const res = await api.list();
      const items = res.ok ? res.value : [];
      box.replaceChildren(el("p", "set-note", t("skill.note")));
      const tools = el("div", "set-buttons skill-tools");
      const more = el("details", "more-menu");
      const menu = el("div", "more-items");
      menu.append(
        button("ghost small", t("skill.importFolder"), async () => { more.open = false; const r = await api.importFolder(); if (!r.ok) return fail(r); if (r.value) await confirmImport(r.value); draw(); }),
        button("ghost small", t("skill.importFiles"), async () => { more.open = false; const r = await api.pickFiles(); if (!r.ok) return fail(r); await importTexts(r.value); }),
        button("ghost small", t("office.openDir"), () => { more.open = false; api.openDir(); }),
      );
      more.append(el("summary", "ghost small", t("skill.more")), menu);
      tools.append(
        button("primary small", t("store.open"), () => { editing = editing && editing.store ? null : { store: true, cat: "all", q: "" }; draw(); }),
        button("ghost small", t("skill.new"), () => { editing = { id: null, text: NEW() }; draw(); }),
        button("ghost small", t("skill.ai"), () => { editing = { ai: true }; draw(); }),
        more,
      );
      box.append(tools);
      if (busy) box.append(el("p", "set-status", busy));
      if (editing && editing.ai) box.append(aiPanel());
      if (editing && editing.store) box.append(await storePanel());
      if (editing && !editing.ai && !editing.id) box.append(editor());
      if (!items.length && !editing) box.append(el("p", "set-note", t("skill.empty")));
      for (const s of items) {
        const row = el("div", "skill-row");
        const who = el("div", "skill-who");
        who.append(el("b", null, s.name), el("span", null, s.description || "—"));
        const tags = el("div", "skill-tags");
        if (s.external) tags.append(el("em", "office-ext", t("office.external")));
        if (s.files.length) tags.append(el("em", null, t("skill.files", { n: s.files.length })));
        row.append(who, tags,
          button("ghost small", t(editing && editing.id === s.id ? "office.close" : "office.edit"), async () => {
            if (editing && editing.id === s.id) { editing = null; return draw(); }
            const r = await api.read(s.id);
            if (!r.ok) return fail(r);
            editing = { id: s.id, text: r.value };
            draw();
          }),
          button("ghost small danger", t("office.removeAgent"), async () => { if (await confirmDialog(t("skill.removeConfirm", { name: s.name }), { danger: true, yes: t("common.delete") })) { await api.remove(s.id); draw(); } }));
        box.append(row);
        if (editing && editing.id === s.id) box.append(editor());
      }
      // 把 .md 拖进来：导入成技能
      box.ondragover = e => { e.preventDefault(); box.classList.add("drop"); };
      box.ondragleave = () => box.classList.remove("drop");
      box.ondrop = async e => {
        e.preventDefault();
        box.classList.remove("drop");
        const files = [...e.dataTransfer.files].filter(f => /\.(md|txt)$/i.test(f.name)).slice(0, 20);
        if (!files.length) return UI.toast(t("office.e.notMd"), { kind: "warn" });
        importTexts(await Promise.all(files.map(async f => ({ name: f.name, text: (await f.text()).slice(0, 200 * 1024) }))));
      };
    }

    function editor() {
      const form = el("div", "office-editor");
      const ta = el("textarea", "set-input wide mono office-raw");
      ta.rows = 16; ta.value = editing.text; ta.spellcheck = false;
      const acts = el("div", "set-buttons");
      acts.append(button("primary", t("office.save"), async () => {
        const text = ta.value;
        const name = (text.match(/^name\s*:\s*(.+)$/m) || [, ""])[1].trim();
        const r = editing.id ? await api.write(editing.id, text) : await api.create(name, text);
        if (!r.ok) return fail(r);
        editing = null;
        UI.toast(t("office.saved"), { kind: "ok", ttl: 3000 });
        draw();
      }), button("ghost", t("office.cancel"), () => { editing = null; draw(); }));
      form.append(el("p", "set-note", t("skill.editNote")), ta, acts);
      return form;
    }

    // 技能商店：App 自带的技能，按类别浏览、搜索，一键安装 / 卸载
    async function storePanel() {
      const p = el("div", "skill-store");
      const r = await api.store();
      if (!r.ok) { p.append(el("p", "set-status bad", t("skill.e", { error: r.error }))); return p; }
      const { categories, skills: items } = r.value;
      const st = editing;
      const head = el("div", "store-head");
      const search = el("input", "set-input");
      search.type = "search"; search.placeholder = t("store.search"); search.value = st.q;
      search.addEventListener("input", () => { st.q = search.value; renderList(); });
      head.append(el("b", null, t("store.title")), search);
      const chips = el("div", "filters store-cats");
      const chip = (id, label, n) => {
        const b = button("filter" + (st.cat === id ? " active" : ""), label + " " + n, () => { st.cat = id; chips.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === b)); renderList(); });
        return b;
      };
      chips.append(chip("all", t("brain.all"), items.length));
      for (const c of categories) chips.append(chip(c.id, c[LANG] || c.en, items.filter(s => s.category === c.id).length));
      const listBox = el("div", "store-list");
      const L = s => s[LANG] || s.en;
      function renderList() {
        const q = st.q.trim().toLowerCase();
        const shown = items.filter(s => (st.cat === "all" || s.category === st.cat) && (!q || (L(s).name + " " + L(s).description + " " + s.id).toLowerCase().includes(q)));
        listBox.replaceChildren();
        if (!shown.length) listBox.append(el("p", "set-note", t("brain.noMatch")));
        for (const s of shown) {
          const row = el("div", "store-item");
          const who = el("div", "skill-who");
          const cat = categories.find(c => c.id === s.category);
          who.append(el("b", null, L(s).name), el("span", null, L(s).description));
          const tag = el("em", "store-cat", cat ? cat[LANG] || cat.en : s.category);
          const act = s.installed
            ? button("ghost small", t("store.uninstall"), async () => { await api.remove(s.installed); s.installed = null; renderList(); draw(); })
            : button("primary small", t("store.install"), async () => {
              const res = await api.install(s.id, LANG);
              if (!res.ok) return fail(res);
              s.installed = res.value;
              UI.toast(t("store.installed", { name: L(s).name }), { kind: "ok", ttl: 3000 });
              renderList();
              draw();
            });
          if (s.installed) row.classList.add("on");
          row.append(who, tag, act);
          listBox.append(row);
        }
      }
      renderList();
      p.append(head, chips, listBox);
      return p;
    }

    function aiPanel() {
      const p = el("div", "office-ai");
      const input = el("textarea", "set-input wide");
      input.rows = 3; input.placeholder = t("skill.ai.ph");
      const acts = el("div", "set-buttons");
      const go = button("primary", t("office.ai.go"), async () => {
        if (!input.value.trim()) return;
        busy = t("office.ai.working");
        draw();
        const r = await desktop.agent.compose({ kind: "skill", text: input.value.trim(), lang: LANG, purpose: OFFICE.purpose });
        busy = "";
        if (!r || !r.ok) { editing = null; UI.toast(t("office.ai.fail", { error: (r && (r.detail || r.error)) || "?" }), { kind: "warn", ttl: 10000 }); return draw(); }
        const a = r.result;
        const oneLine = s => String(s || "").replace(/\s+/g, " ").trim();
        editing = { id: null, text: "---\nname: " + oneLine(a.name) + "\ndescription: " + oneLine(a.description) + "\n---\n\n" + String(a.instructions || "").trim() + "\n" };
        draw();
      });
      acts.append(go, button("ghost", t("office.cancel"), () => { editing = null; draw(); }));
      p.append(input, acts);
      return p;
    }

    draw();
  }

  // ---------- 任务详情：把员工做了什么完整摊开 ----------
  function openTask(id) {
    detailId = id;
    detailOpenFile = null;
    open("task");
  }

  function traceLine(ev) {
    if (ev.type === "ask" && ev.kind === "question") return t(ev.answer ? "td.ev.ask.q" : "td.ev.ask.q.none", ev);
    if (ev.type === "ask") return t((ev.kind === "command" ? "td.ev.ask.cmd." : ev.kind === "tool" ? "td.ev.ask.tool." : "td.ev.ask.") + (ev.allow ? "yes" : "no"), ev);
    return t("td.ev." + ev.type, ev);
  }

  function renderTask() {
    if (panel !== "task") return;
    const v = $("view-task");
    const task = tasks.find(x => x.id === detailId);
    if (!task) { v.replaceChildren(el("div", "empty big", t("common.none"))); return; }
    const a = agentById(task.agentId);
    const trace = task.trace || [];
    const sig = [LANG, agentsVersion, task.status, trace.length, (task.files || []).join(","), detailOpenFile, task.stepText].join("|");
    if (sig === detailSig) return;
    detailSig = sig;

    const keepScroll = v.parentNode.scrollTop;
    v.replaceChildren();
    v.style.setProperty("--c", agentColor(a));

    const head = el("div", "td-head");
    head.append(el("h2", null, taskTitle(task)));
    const meta = el("div", "td-meta");
    const who = el("span", "who");
    who.append(el("i", "dot"), document.createTextNode(agentName(a) + " · " + agentRole(a)));
    const st = el("span", "st", t("st." + task.status));
    st.dataset.status = task.failed ? "failed" : task.status;
    meta.append(who, st);
    if (task.source) meta.append(el("span", "td-ai", t("td.ai") + "：" + task.source));
    if (task.usage && task.usage.calls) meta.append(el("span", "td-ai", t("td.usage", { calls: task.usage.calls, tokens: fmtTokens(task.usage.prompt + task.usage.completion) })));
    head.append(meta);
    const acts = el("div", "td-actions");
    if (task.status !== "done") acts.append(button("ghost small danger", t("td.cancel"), () => cancelTask(task.id)));
    else if (task.failed) acts.append(button("ghost small", t("td.retry"), () => { const n = retryTask(task.id); if (n) openTask(n.id); }));
    else if (task.real && window.desktop && desktop.skills) acts.append(button("ghost small", t("td.learn"), e => learnSkill(task, e.currentTarget)));
    if (acts.childNodes.length) head.append(acts);
    v.append(head);

    const block = (titleKey, node) => { const b = el("section", "td-block"); b.append(el("span", "eyebrow", t(titleKey)), node); v.append(b); };

    if (task.context) block("td.context", el("div", "td-text", task.context));

    // 过程
    const steps = el("ol", "td-steps");
    if (!trace.length) {
      steps.append(el("li", "empty", task.status === "done" && !task.real ? t("td.sim") : task.blocked ? (task.stepText || "") : t("td.nosteps")));
    }
    for (const ev of trace) {
      if (ev.type === "thinking" && trace.indexOf(ev) > 0 && trace[trace.indexOf(ev) - 1].type === "thinking") continue;
      const li = el("li", "td-step");
      li.dataset.type = ev.type;
      li.append(el("time", null, new Date(ev.at).toTimeString().slice(0, 8)), el("span", null, traceLine(ev)));
      steps.append(li);
    }
    block("td.steps", steps);

    // 写入的文件：可以直接查看内容
    const files = el("div", "td-files");
    if (!(task.files || []).length) files.append(el("div", "empty", t("td.nofiles")));
    for (const f of task.files || []) {
      const rowEl = el("div", "td-file");
      const name = el("code", null, f);
      const viewer = el("pre", "td-code");
      viewer.hidden = detailOpenFile !== f;
      const toggle = button("ghost small", t(detailOpenFile === f ? "td.hide" : "td.view"), () => { detailOpenFile = detailOpenFile === f ? null : f; renderTask(); });
      const line = el("div", "td-file-head");
      line.append(name, toggle);
      if (window.desktop && desktop.files) line.append(button("ghost small", t("td.reveal"), () => desktop.files.reveal(f, (deptOf(a) || {}).id)));
      rowEl.append(line, viewer);
      if (detailOpenFile === f && window.desktop && desktop.files) {
        desktop.files.read(f, (deptOf(a) || {}).id).then(r => { viewer.textContent = r.ok ? r.text : t("td.readfail", { error: r.error }); });
      }
      files.append(rowEl);
    }
    block("td.files", files);

    if (task.status === "done") block("td.result", el("div", "td-text" + (task.failed ? " bad" : ""), task.result || a[LANG].result));
    v.parentNode.scrollTop = keepScroll;
  }

  // ---------- 设置 ----------
  function seg(items, current, onPick) {
    const box = el("div", "seg");
    for (const [id, label] of items) {
      const b = button("seg-btn" + (id === current ? " active" : ""), label, () => {
        box.querySelectorAll(".seg-btn").forEach(x => x.classList.toggle("active", x === b));
        onPick(id);
      });
      box.append(b);
    }
    return box;
  }
  function section(titleKey) {
    const s = el("section", "set-section");
    s.append(el("h3", "eyebrow", t(titleKey)));
    return s;
  }
  function row(labelText, control) {
    const r = el("div", "set-row");
    r.append(el("span", "set-label", labelText), control);
    return r;
  }

  function buildSettings() {
    const v = $("view-settings");
    v.replaceChildren();

    const general = section("set.general");
    general.append(
      row(t("set.language"), seg([["zh", "中文"], ["en", "English"]], LANG, applyLanguage)),
      row(t("set.mode"), seg(MODE_IDS.map(m => [m, t("mode." + m)]), mode, setMode)),
    );

    // 桌面 App：办公室和员工存成 .md 文件，可以增删改（office-ui.js）；浏览器里只能改名字、岗位、颜色、技能
    const agents = section("set.agents");
    if (window.desktop && desktop.office && typeof OfficeUI !== "undefined") OfficeUI.build(agents);
    else agents.append(el("p", "set-note", t("set.agentsNote")));
    for (const a of (window.desktop && desktop.office ? [] : AGENTS)) {
      const r = el("div", "agent-row");
      r.dataset.id = a.id;

      const color = el("input", "swatch");
      color.type = "color";
      color.value = agentColor(a);
      color.setAttribute("aria-label", t("set.color"));
      color.addEventListener("input", () => setAgentEdit(a.id, "color", color.value));

      const field = (labelKey, value, onInput, wide) => {
        const l = el("label", wide ? "field wide" : "field");
        const i = el("input");
        i.type = "text";
        i.value = value;
        i.addEventListener("input", () => onInput(i.value));
        l.append(el("span", null, t(labelKey)), i);
        return l;
      };
      const fields = el("div", "fields");
      fields.append(
        field("set.name", agentName(a), val => setAgentEdit(a.id, "name", val.trim())),
        field("set.role", agentRole(a), val => setAgentEdit(a.id, "role", val.trim())),
        field("set.skills", agentSkills(a).join(", "), val => setAgentEdit(a.id, "skills", val.split(/[,，、]/).map(s => s.trim()).filter(Boolean)), true),
      );
      const reset = button("ghost small", t("set.reset"), () => { resetAgentEdit(a.id); buildSettings(); focusAgentRow(a.id); });
      r.append(color, fields, reset);
      agents.append(r);
    }

    // 项目文件夹（只有桌面 App 里可选）
    const project = section("set.project");
    const d = window.desktop;
    if (d && d.pickProject) {
      const pathText = el("code", "set-path", t("set.project.none"));
      const show = p => { pathText.textContent = p || t("set.project.none"); };
      d.getProject().then(show);
      const r = row("", button("ghost", t("set.project.pick"), () => d.pickProject().then(show)));
      r.firstChild.replaceWith(pathText);
      project.append(el("p", "set-note", t("set.project.note")), r);
    } else {
      project.append(el("p", "set-note", t("set.project.web")));
    }

    // 员工的权限：是否允许运行命令
    const caps = section("set.caps");
    if (d && d.caps) {
      const sw = el("label", "switch");
      const box = el("input");
      box.type = "checkbox";
      sw.append(box, el("span", "track"));
      const blender = el("p", "set-note");
      // 授权目标：攻击者可测的、本机以外的主机/IP。默认只有本机。
      let targets = [];
      const tagBox = el("div", "target-tags");
      const tInput = el("input", "set-input mono");
      tInput.type = "text"; tInput.spellcheck = false; tInput.placeholder = t("set.caps.targets.ph");
      const saveTargets = next => d.caps.set({ targets: next }).then(c => { targets = c.targets || []; drawTags(); });
      const drawTags = () => {
        tagBox.replaceChildren();
        if (!targets.length) { tagBox.append(el("span", "set-note", t("set.caps.targets.none"))); return; }
        for (const host of targets) {
          const tag = el("span", "target-tag");
          tag.append(el("code", null, host), button("tag-x", "✕", () => saveTargets(targets.filter(h => h !== host))));
          tagBox.append(tag);
        }
      };
      const addTarget = () => { const v = tInput.value.trim(); if (!v) return; tInput.value = ""; saveTargets(targets.concat(v)); };
      tInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addTarget(); } });
      const addRow = el("div", "set-inline");
      addRow.append(tInput, button("ghost small", t("set.caps.targets.add"), addTarget));
      const targetWrap = el("div", "set-targets");
      targetWrap.append(el("p", "set-note", t("set.caps.targets.note")), tagBox, addRow);
      const show = c => {
        box.checked = c.commands; blender.textContent = c.blenderFound ? t("set.caps.blender") : ""; blender.hidden = !c.blenderFound;
        targets = c.targets || []; drawTags(); targetWrap.hidden = !c.commands; targetHead.hidden = !c.commands;
      };
      box.addEventListener("change", () => d.caps.set({ commands: box.checked }).then(show));
      d.caps.get().then(show);
      const targetHead = el("h4", "set-subhead", t("set.caps.targets"));
      caps.append(row(t("set.caps.commands"), sw), el("p", "set-note", t("set.caps.note")), blender, targetHead, targetWrap);
    } else caps.append(el("p", "set-note", t("set.project.web")));

    // 连接器：接上外部工具
    const conn = section("set.conn");
    conn.append(el("p", "set-note", t("conn.inBrain")), button("ghost", t("conn.openBrain"), () => { open("brain"); setTimeout(() => { const c = document.querySelector("#view-brain .connectors"); if (c) c.scrollIntoView(); }, 200); }));

    // AI 池：NVIDIA NIM
    const ai = section("set.ai");
    if (d && d.pool) buildAiSettings(ai, d.pool);
    else ai.append(el("p", "set-note", t("set.ai.web")));

    const data = section("set.data");
    const btns = el("div", "set-buttons");
    btns.append(
      button("ghost", t("set.export"), exportData),
      button("ghost danger", t("set.clear"), async () => { if (await confirmDialog(t("set.clearConfirm"), { danger: true, yes: t("set.clear") })) clearData(); }),
    );
    data.append(btns);

    const keys = section("set.shortcuts");
    const kbd = (k, label) => row(label, el("kbd", null, k));
    keys.append(kbd("Ctrl J", t("set.sc.chat")), kbd("Ctrl K", t("set.sc.palette")), kbd("Esc", t("set.sc.close")), kbd("F11", t("set.sc.full")));

    const tabs = tabbed(v, "settings", [
      { id: "general", label: t("set.tab.general"), nodes: [general, project, keys] },
      { id: "office", label: t("set.tab.office"), nodes: [agents] },
      { id: "ai", label: t("set.tab.ai"), nodes: [ai, conn] },
      { id: "perm", label: t("set.tab.perm"), nodes: [caps] },
      { id: "data", label: t("set.tab.data"), nodes: [data] },
    ]);
    v.append(tabs.bar, ...tabs.panes);
    UI.settingsTab = tabs.show;
  }

  const AI_PRESETS = [
    { name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1" },
    { name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
    { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
    { name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
    { nameKey: "set.ai.local", baseUrl: "http://localhost:11434/v1" },
    { nameKey: "set.ai.custom", baseUrl: "https://" },
  ];

  // 自动挑模型时的偏好（从前往后匹配）；都不匹配就用列表里的第一个。用户可以在「高级设置」里改。
  const AI_NOT_CHAT = /embed|imagen|image|veo|tts|audio|speech|whisper|parakeet|aqa|live|rerank|guard|clip|vision-only|robotics|computer-use|lyria|nano-banana/i;
  // 排在前面的几项是实测能通过工具调用写出文件的型号
  const AI_MODEL_PREFS = [/gemini-3.5-flash$/i, /qwen3/i, /gpt-oss/i, /qwen.*coder/i, /deepseek/i, /llama-3\.3-70b/i, /gemini-[\d.]+-flash$/i, /gemini-[\d.]+-flash-lite$/i, /gemini.*flash/i, /gemini.*pro/i, /gpt-4o-mini/i, /llama.*70b/i, /mistral.*large/i];

  function buildAiSettings(box, api) {
    const list = el("div", "src-list");
    const errText = r => {
      const k = "set.ai.e." + (r.status || r.error);
      return I18N[LANG][k] ? t(k) : (r.status ? r.status + " " : "") + r.error;
    };

    function card(s, index, total) {
      const c = el("div", "src" + (s.enabled ? "" : " off"));
      const status = el("p", "set-status");
      const say = (key, vars, bad) => { status.textContent = t(key, vars); status.classList.toggle("bad", !!bad); };
      const fail = r => say("set.ai.s.err", { error: errText(r) }, true);
      const save = async patch => {
        const r = await api.save(Object.assign(s, patch));
        if (!r.ok) fail(r); else { Object.assign(s, r.source); c.classList.toggle("off", !s.enabled); }
        return r.ok;
      };
      const text = (value, cls, onChange) => {
        const i = el("input", "set-input " + cls);
        i.type = "text"; i.value = value; i.spellcheck = false;
        i.addEventListener("change", () => onChange(i.value.trim()));
        return i;
      };

      // 第一行：名称、启用、排序、删除
      const head = el("div", "src-head");
      const on = el("label", "switch");
      const onBox = el("input");
      onBox.type = "checkbox"; onBox.checked = s.enabled;
      onBox.addEventListener("change", () => save({ enabled: onBox.checked }));
      on.append(onBox, el("span", "track"), el("em", null, t("set.ai.enabled")));
      const up = button("ghost small", "↑", async () => { await api.move(s.id, -1); render(); });
      const down = button("ghost small", "↓", async () => { await api.move(s.id, 1); render(); });
      up.title = t("set.ai.up"); down.title = t("set.ai.down");
      up.disabled = index === 0; down.disabled = index === total - 1;
      head.append(el("span", "src-rank", String(index + 1)), text(s.name, "src-name", v => save({ name: v })), on,
        button("ghost small danger", t("set.ai.remove"), async () => { if (await confirmDialog(t("set.ai.removeConfirm"), { danger: true, yes: t("common.delete") })) { await api.remove(s.id); render(); } }));

      // 接口地址
      const url = text(s.baseUrl, "wide", v => save({ baseUrl: v }));

      // Key
      // 已保存的 Key 显示成打码的样子（开头几位 + 圆点 + 末尾几位）；点进去可以填新的
      const key = el("input", "set-input wide mono");
      key.type = "text"; key.autocomplete = "off"; key.spellcheck = false;
      const keyHint = () => {
        key.placeholder = !s.needsKey ? t("set.ai.noKeyNeeded") : t("set.ai.keyPh");
        key.value = s.hasKey ? s.keyMask : "";
        key.classList.toggle("masked", !!s.hasKey);
      };
      key.addEventListener("focus", () => { if (key.classList.contains("masked")) { key.value = ""; key.classList.remove("masked"); } });
      key.addEventListener("blur", () => { if (!key.value.trim() && s.hasKey) keyHint(); });
      keyHint();
      const keyRow = el("div", "set-inline");
      keyRow.append(key, button("ghost small", t("set.ai.save"), async () => {
        if (!key.value.trim() || key.classList.contains("masked")) return;
        const r = await api.setKey(s.id, key.value);
        if (!r.ok) return fail(r);
        s.hasKey = true; s.keyMask = r.keyMask; keyHint();
        autoSetup();
      }));

      // 模型
      const select = el("select", "set-select wide");
      const fill = models => {
        select.replaceChildren(new Option(t("set.ai.pick"), ""));
        for (const id of models) select.append(new Option(id, id));
        if (s.model && !models.includes(s.model)) select.append(new Option(s.model, s.model));
        select.value = s.model || "";
      };
      fill(s.model ? [s.model] : []);
      select.addEventListener("change", () => save({ model: select.value || null }));
      const modelRow = el("div", "set-inline");
      modelRow.append(select, button("ghost small", t("set.ai.load"), async () => {
        say("set.ai.s.loading");
        const r = await api.models(s.id);
        if (!r.ok) return fail(r);
        fill(r.models);
        say("set.ai.s.models", { n: r.models.length });
      }), button("ghost small", t("set.ai.test"), async () => {
        say("set.ai.s.loading");
        const r = await api.test(s.id);
        if (r.ok) say("set.ai.s.testok", { text: r.text || "(empty)", ms: r.ms }); else fail(r);
      }));

      // 自动配置：查模型，按偏好挑几个候选，逐个发测试消息，第一个通的就用它
      async function autoSetup() {
        say("set.ai.s.loading");
        const r = await api.models(s.id);
        if (!r.ok) return fail(r);
        fill(r.models);
        // 候选：去掉不是用来对话的模型；每条偏好取版本最新的两个；最后补上列表里其余的，最多试 8 个
        const chat = r.models.filter(id => !AI_NOT_CHAT.test(id));
        const newestFirst = (a, b) => b.localeCompare(a, undefined, { numeric: true });
        const picks = [];
        const add = id => { if (id && !picks.includes(id)) picks.push(id); };
        add(s.model);
        for (const re of AI_MODEL_PREFS) chat.filter(id => re.test(id)).sort(newestFirst).slice(0, 2).forEach(add);
        chat.slice().sort(newestFirst).forEach(add);
        let last = { ok: false, error: "no-model" };
        for (const id of picks.slice(0, 8)) {
          say("set.ai.s.trying", { model: id });
          await save({ model: id });
          select.value = id;
          last = await api.test(s.id);
          if (last.ok) { api.scan(s.id); setTimeout(showScan, 800); return say("set.ai.s.connected", { model: id }); }   // 连上后在后台给这一家做体检
          if (last.status === 401 || last.error === "no-key" || last.error === "timeout") break;   // Key 或网络的问题，换模型也没用
        }
        fail(last);
      }

      const tier = seg([["strong", t("set.ai.tier.strong")], ["light", t("set.ai.tier.light")]], s.tier, v => save({ tier: v }));
      const line = (labelKey, control) => { const r = el("div", "src-row"); r.append(el("span", "src-label", t(labelKey)), control); return r; };
      const order = el("div", "set-inline");
      order.append(up, down, button("ghost small", t("set.ai.clear"), async () => { await api.setKey(s.id, ""); s.hasKey = false; s.keyMask = ""; keyHint(); say("set.ai.s.nokey"); }));
      // 体检：实测这一家哪些模型真的能用
      const scanText = el("span", "set-status");
      const showScan = async () => {
        const st = await api.scanStatus(s.id);
        if (st.progress && st.progress.running) { scanText.textContent = t("set.ai.scan.running", st.progress); setTimeout(showScan, 1500); }
        else if (st.verified) scanText.textContent = t("set.ai.scan.done", { count: st.verified.count, tested: st.verified.tested });
        else scanText.textContent = t("set.ai.scan.none");
      };
      const scanRow = el("div", "set-inline");
      scanRow.append(button("ghost small", t("set.ai.scan"), async () => { await api.scan(s.id); setTimeout(showScan, 500); }), scanText);
      showScan();
      const adv = el("details", "src-adv");
      adv.append(el("summary", null, t("set.ai.advanced")), line("set.ai.url", url), line("set.ai.model", modelRow), line("set.ai.tier", tier), el("p", "set-note src-tier-note", t("set.ai.tier.note")), line("set.ai.scan.label", scanRow), line("set.ai.order", order));
      c.append(head, line("set.ai.key", keyRow), status, el("p", "set-status usage-line", usageLine(s.id)), adv);
      if (!s.needsKey) keyRow.replaceChildren(button("ghost small", t("set.ai.connect"), autoSetup));
      if (s.hasKey && s.model) say("set.ai.s.saved", { model: s.model }); else if (s.needsKey && !s.hasKey) say("set.ai.s.nokey");
      return c;
    }

    // 用量：今天 / 最近 7 天，按来源分开；服务商告诉我们剩余额度时也显示
    let usage = { today: {}, week: {}, limits: {} };
    const usageLine = id => {
      const d = usage.today[id], w = usage.week[id], lim = usage.limits[id];
      const parts = [t("set.ai.usage.today", { calls: d ? d.calls : 0, tokens: fmtTokens(d ? d.prompt + d.completion : 0) }),
        t("set.ai.usage.week", { calls: w ? w.calls : 0, tokens: fmtTokens(w ? w.prompt + w.completion : 0) })];
      if (lim && lim.remainingRequests != null && lim.limitRequests != null) parts.push(t("set.ai.usage.left", { left: lim.remainingRequests, limit: lim.limitRequests }));
      return parts.join(" · ");
    };
    async function render() {
      const sources = await api.list();
      if (api.usage) usage = await api.usage();
      const sumOf = obj => Object.values(obj).reduce((a, u) => ({ calls: a.calls + u.calls, tokens: a.tokens + u.prompt + u.completion }), { calls: 0, tokens: 0 });
      const td = sumOf(usage.today), wk = sumOf(usage.week);
      total.replaceChildren(el("b", null, t("set.ai.usage.title")),
        el("span", null, t("set.ai.usage.today", { calls: td.calls, tokens: fmtTokens(td.tokens) })),
        el("span", null, t("set.ai.usage.week", { calls: wk.calls, tokens: fmtTokens(wk.tokens) })));
      list.replaceChildren(...sources.map((s, i) => card(s, i, sources.length)));
      if (!sources.length) list.append(el("p", "set-note", t("set.ai.empty")));
    }

    const preset = el("select", "set-select");
    AI_PRESETS.forEach((p, i) => preset.append(new Option(p.name || t(p.nameKey), String(i))));
    const addRow = el("div", "set-inline src-add");
    addRow.append(preset, button("primary", t("set.ai.add"), async () => {
      const p = AI_PRESETS[Number(preset.value)];
      await api.save({ name: p.name || t(p.nameKey), baseUrl: p.baseUrl, tier: "strong", enabled: true });
      render();
    }));
    const total = el("div", "usage-total");
    const local = el("div", "local-ai");
    box.append(el("p", "set-note", t("set.ai.note")), local, total, list, addRow);
    if (window.desktop && desktop.local) buildLocalAi(local, () => render());
    render();
  }

  // ---- 内置本地 AI：检测电脑配置，推荐模型，一键下载并启用 ----
  function buildLocalAi(box, onChange) {
    let info = null, timer = null, busy = false, kind = "general", showAll = false;
    const gb = n => (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + " GB";
    const draw = async () => {
      clearTimeout(timer);
      if (!box.isConnected && info) return;   // 设置页已经关掉或重建了
      if (!info) {
        box.replaceChildren(el("b", null, t("local.title")), el("p", "set-note", t("local.detecting")));   // 检测显卡要几秒
        info = await desktop.local.detect();
      }
      const st = await desktop.local.status();
      box.replaceChildren();
      const head = el("div", "local-head");
      head.append(el("b", null, t("local.title")), el("span", "local-tag", t("local.free")));
      box.append(head, el("p", "set-note", t("local.note")));
      if (!info.ok) { box.append(el("p", "set-status bad", t("local.e.detect", { error: info.error }))); return; }
      const hw = info.hw;
      box.append(el("p", "local-hw", t("local.hw", { gpu: hw.gpu ? hw.gpu.name + " (" + gb(hw.gpu.vramGB) + ")" : t("local.noGpu"), ram: gb(hw.ramGB), disk: hw.diskFreeGB != null ? gb(hw.diskFreeGB) : "?" })));
      const phase = st.state.phase;
      const active = st.running && st.running.model;
      if (phase === "downloading" || phase === "starting") {
        const bar = el("div", "local-bar");
        const fill = el("i");
        fill.style.width = Math.round((phase === "starting" ? 1 : st.state.progress) * 100) + "%";
        bar.append(fill);
        const line = el("div", "set-inline local-progress");
        line.append(el("span", "set-status", phase === "starting" ? t("local.starting") : t("local.downloading", { text: st.state.text })));
        if (phase === "downloading") line.append(button("ghost small", t("local.cancel"), () => desktop.local.cancel()));
        box.append(bar, line);
      } else if (phase === "error" && st.state.error) {
        box.append(el("p", "set-status bad", t(st.state.error === "cancelled" ? "local.cancelled" : "local.e.failed", { error: st.state.error })));
      }
      if (active) {
        const m = info.list.find(x => x.id === active);
        box.append(el("p", "set-status local-running", t("local.running", { name: m ? m.label : active, where: t(st.running.gpu ? "local.where.gpu" : "local.where.cpu") })));
      }
      const kinds = el("div", "local-kinds");
      for (const k of ["general", "code"]) {
        const b = button("view-tab" + (kind === k ? " active" : ""), t("local.kind." + k), () => { kind = k; draw(); });
        kinds.append(b);
      }
      if (info.list.some(m => m.kind === "code")) box.append(kinds);   // 有写代码专用的模型才分两页
      const recId = kind === "code" ? info.recommendedCode : info.recommended;
      const inKind = info.list.filter(m => (m.kind || "general") === kind);
      // 跑不动的模型默认不显示（正在用的、已下载的总是显示）
      const shown = inKind.filter(m => showAll || m.fit !== "no" || m.installed || active === m.id);
      if (kind === "code") box.append(el("p", "set-note", t("local.codeNote")));
      for (const m of shown) {
        const row = el("div", "local-model" + (m.id === recId ? " rec" : "") + (m.fit === "no" ? " off" : ""));
        const name = el("div", "local-name");
        name.append(el("b", null, m.label), el("span", "local-by", m.by || ""), el("span", null, gb(m.size)));
        if (m.id === recId) name.append(el("em", "local-rec", t("local.recommended")));
        const fit = el("span", "local-fit speed-" + m.speed, m.fit === "no" ? t("local.fit.no") : t("local.fit." + m.fit) + " · " + t("local.speed." + m.speed));
        const acts = el("div", "set-inline");
        const installed = m.installed || (st.binInstalled && active === m.id);
        if (active === m.id) acts.append(button("ghost small", t("local.disable"), async () => { await desktop.local.disable(); onChange(); draw(); }));
        else if (m.fit !== "no" && m.disk) {
          const b = button(installed || m.id !== recId ? "ghost small" : "primary small", t(installed ? "local.enable" : "local.download"), async () => {
            if (busy) return;
            busy = true;
            const pending = desktop.local.enable(m.id, t("local.sourceName"));
            setTimeout(draw, 300);
            const r = await pending;
            busy = false;
            info = await desktop.local.detect();   // 重新看哪些已经下载了
            if (!r.ok && r.error !== "cancelled") UI.toast(t("local.e.failed", { error: r.error }), { kind: "warn", ttl: 10000 });
            if (r.ok) UI.toast(t("local.ready", { name: m.label }), { kind: "ok", ttl: 6000 });
            onChange();
            draw();
          });
          b.disabled = phase === "downloading" || phase === "starting";
          acts.append(b);
        } else if (!m.disk) acts.append(el("span", "set-note", t("local.noDisk")));
        if (m.installed && active !== m.id) acts.append(button("ghost small danger", t("local.remove", { size: gb(m.size) }), async () => {
          if (!(await confirmDialog(t("local.removeConfirm", { name: m.label }), { danger: true, yes: t("common.delete") }))) return;
          await desktop.local.remove(m.id); info = await desktop.local.detect(); onChange(); draw();
        }));
        row.append(name, fit, acts);
        box.append(row);
      }
      const hidden = inKind.length - shown.length;
      if (hidden > 0 || showAll) box.append(button("ghost small local-more", showAll ? t("local.hideBig") : t("local.showBig", { n: hidden }), () => { showAll = !showAll; draw(); }));
      if (phase === "downloading" || phase === "starting") timer = setTimeout(draw, 1000);
    };
    draw();
  }

  // 常用的连接器：选一个就把它的接法填进输入框。都不需要密钥。
  const CONN_PRESETS = [
    { key: "set.conn.p.pick", text: "" },
    { key: "set.conn.p.search", text: "uvx duckduckgo-mcp-server" },
    { key: "set.conn.p.fetch", text: "uvx mcp-server-fetch" },
    { key: "set.conn.p.docs", text: "https://mcp.context7.com/mcp" },
    { key: "set.conn.p.browser", text: "npx -y @playwright/mcp@latest" },
    { key: "set.conn.p.blender", text: "uvx blender-mcp" },
  ];

  function buildConnSettings(box, api) {
    const list = el("div", "src-list");
    const status = el("p", "set-status");
    let timer = null, drawn = false;
    const errText = e => {
      if (/not recognized|not found|ENOENT/i.test(e)) return t("set.conn.e.missing");
      if (/RegistrationRejected|Client Registration rejected|invalid_redirect_uri|invalid_client_metadata/i.test(e)) return t("set.conn.e.loginBlocked");
      return I18N[LANG]["set.conn.e." + e] ? t("set.conn.e." + e) : e;
    };

    function card(c) {
      const node = el("div", "src" + (c.enabled ? "" : " off"));
      const head = el("div", "src-head");
      const name = el("input", "set-input src-name");
      name.type = "text"; name.value = c.name; name.spellcheck = false;
      name.addEventListener("change", async () => { if (name.value.trim()) { await api.update(c.id, { name: name.value.trim() }); render(); } });
      const sw = (checked, labelKey, onChange) => {
        const l = el("label", "switch");
        const i = el("input");
        i.type = "checkbox"; i.checked = checked;
        i.addEventListener("change", () => onChange(i.checked));
        l.append(i, el("span", "track"), el("em", null, t(labelKey)));
        return l;
      };
      head.append(name, sw(c.enabled, "set.ai.enabled", async on => { await api.update(c.id, { enabled: on }); render(); }),
        button("ghost small danger", t("set.ai.remove"), async () => { if (await confirmDialog(t("set.conn.removeConfirm"), { danger: true, yes: t("common.delete") })) { await api.remove(c.id); render(); refreshStore(); } }));

      const target = el("code", "set-path conn-target", c.type === "http" ? c.url : c.command);
      target.title = target.textContent;
      if (c.catalogId || /duckduckgo-mcp-server/.test(c.command || "")) target.hidden = true;
      const st = el("p", "set-status" + (c.status === "error" ? " bad" : ""));
      st.textContent = !c.enabled ? t("set.conn.s.off")
        : c.status === "ready" ? t("set.conn.s.ready", { n: c.tools.length })
        : c.status === "error" ? t("set.conn.s.error", { error: errText(c.error) })
        : c.online ? t("conn.s.login") : t("set.conn.s.connecting");
      node.append(head, target, st);
      if (c.online && c.enabled) node.append(el("p", "set-note", t("conn.online")));
      if ((c.secrets || []).length) node.append(el("p", "set-status", t("set.conn.secrets", { names: c.secrets.join(", ") })));

      if (c.enabled) {
        const acts = el("div", "set-inline");
        acts.append(sw(c.trusted, c.online ? "set.conn.trustRead" : "set.conn.trust", on => api.update(c.id, { trusted: on })), button("ghost small", t("set.conn.reconnect"), async () => { await api.reconnect(c.id); render(); }));
        node.append(acts);
      }
      if (c.tools.length || target.hidden) {
        const more = el("details", "src-adv");
        const cmd = el("code", "set-path conn-target", c.type === "http" ? c.url : c.command);
        more.append(el("summary", null, c.tools.length ? t("set.conn.tools", { n: c.tools.length }) : t("set.ai.advanced")), cmd, el("div", "conn-tools", c.tools.join("  ·  ")));
        node.append(more);
      }
      return node;
    }

    async function render() {
      clearTimeout(timer);
      const items = await api.list();
      if (drawn && !list.isConnected) return;   // 设置页已经重建了，这份不用再刷新
      drawn = true;
      // 正在输入名字时不重画，免得打断
      if (!(document.activeElement && list.contains(document.activeElement) && document.activeElement.type === "text")) {
        list.replaceChildren(...items.map(card));
        if (!items.length) list.append(el("p", "set-note", t("set.conn.empty")));
      }
      if (items.some(c => c.enabled && c.status === "connecting")) timer = setTimeout(render, 1500);
    }

    const preset = el("select", "set-select");
    for (const p of CONN_PRESETS) preset.append(new Option(t(p.key), p.text));
    const input = el("input", "set-input wide mono");
    input.type = "text"; input.spellcheck = false; input.autocomplete = "off"; input.placeholder = t("set.conn.ph");
    preset.addEventListener("change", () => { input.value = preset.value; status.textContent = preset.value === "uvx blender-mcp" ? t("set.conn.blenderNote") : ""; status.classList.remove("bad"); });
    const add = async () => {
      if (!input.value.trim()) return;
      const r = await api.add(input.value);
      status.classList.toggle("bad", !r.ok);
      status.textContent = r.ok ? t("set.conn.added") : t("set.conn.s.error", { error: errText(r.error) });
      if (r.ok) { input.value = ""; preset.value = ""; }
      render();
      refreshStore();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    const addRow = el("div", "set-inline src-add conn-add");
    addRow.append(preset, input, button("primary", t("set.conn.add"), add));
    const storeBox = el("div");
    let store = null;   // { cat, q } 打开时
    const storeBtn = button("primary small", t("conn.store"), () => { store = store ? null : { cat: "all", q: "" }; drawStore(); });
    // 连接器有增减时，商店（开着的话）要跟着重新读，否则会显示过时的「断开/连接」
    function refreshStore() { if (store) drawStore(); }
    async function drawStore() {
      storeBox.replaceChildren();
      if (!store || !api.store) return;
      const { categories, connectors } = await api.store();
      const p = el("div", "skill-store");
      const head = el("div", "store-head");
      const search = el("input", "set-input");
      search.type = "search"; search.placeholder = t("conn.search"); search.value = store.q;
      search.addEventListener("input", () => { store.q = search.value; renderItems(); });
      head.append(el("b", null, t("conn.storeTitle")), search);
      const chips = el("div", "filters store-cats");
      const chip = (id, label, n) => {
        const b = button("filter" + (store.cat === id ? " active" : ""), label + " " + n, () => { store.cat = id; chips.querySelectorAll(".filter").forEach(x => x.classList.toggle("active", x === b)); renderItems(); });
        return b;
      };
      chips.append(chip("all", t("brain.all"), connectors.length));
      for (const c of categories) chips.append(chip(c.id, c[LANG] || c.en, connectors.filter(x => x.category === c.id).length));
      const items = el("div", "store-list");
      const L = x => x[LANG] || x.en;
      function renderItems() {
        const q = store.q.trim().toLowerCase();
        items.replaceChildren();
        for (const x of connectors.filter(x => (store.cat === "all" || x.category === store.cat) && (!q || (L(x).name + " " + L(x).description + " " + x.id).toLowerCase().includes(q)))) {
          const row = el("div", "store-item" + (x.installed ? " on" : ""));
          const who = el("div", "skill-who");
          who.append(el("b", null, L(x).name), el("span", null, L(x).description));
          const tag = el("em", "store-cat", t(x.login ? "conn.tag.login" : "conn.tag.free"));
          const act = x.installed
            ? button("ghost small", t("conn.disconnect"), async () => { await api.remove(x.installed); render(); drawStore(); })
            : button("primary small", t("conn.connect"), async () => {
              const r = await api.install(x.id, LANG);
              if (!r.ok) return toast(t("set.conn.s.error", { error: errText(r.error) }), { kind: "warn", ttl: 8000 });
              toast(t(x.login ? "conn.connectingLogin" : "conn.connecting", { name: L(x).name }), { kind: "ok", ttl: x.login ? 12000 : 4000 });
              render();
              drawStore();   // 重新读一次：拿到新连接器真正的 id，「断开」才删得掉
            });
          row.append(who, tag, act);
          items.append(row);
        }
      }
      renderItems();
      p.append(head, chips, items, el("p", "set-note", t("conn.storeNote")));
      storeBox.append(p);
    }
    const adv = el("details", "src-adv conn-manual");
    adv.append(el("summary", null, t("conn.manual")), addRow, status);
    box.append(el("p", "set-note", t("set.conn.note")), storeBtn, storeBox, list, adv);
    render();
  }

  function focusAgentRow(id) {
    const r = document.querySelector(`.agent-row[data-id="${id}"]`);
    if (!r) return;
    r.scrollIntoView({ block: "center" });
    r.classList.add("flash");
    setTimeout(() => r.classList.remove("flash"), 1400);
  }

  // ---------- 指令面板 ----------
  function paletteOpen() { return $("palette").classList.contains("open"); }
  function openPalette() {
    $("palette").classList.add("open");
    $("palette").setAttribute("aria-hidden", "false");
    $("pal-input").value = "";
    palIndex = 0;
    renderPalette();
    $("pal-input").focus();
  }
  function closePalette() {
    $("palette").classList.remove("open");
    $("palette").setAttribute("aria-hidden", "true");
  }
  function buildPaletteItems(q) {
    const text = q.trim();
    const items = [];
    if (text) items.push({ label: t("pal.dispatch", { text }), run: () => addTask(text, $("task-agent").value, $("task-handoff").checked), always: true });
    for (const v of VIEWS) items.push({ label: t("pal.goto", { page: t("nav." + v) }), run: () => open(v) });
    for (const a of AGENTS) items.push({ label: t("pal.agent", { name: agentName(a) }), run: () => selectAgent(a.id) });
    for (const m of MODE_IDS) items.push({ label: t("pal.mode", { mode: t("mode." + m) }), run: () => setMode(m) });
    items.push({ label: t("pal.chat"), run: () => ChatUI.open() });
    items.push({ label: t("pal.lang"), run: () => applyLanguage(LANG === "zh" ? "en" : "zh") });
    items.push({ label: t("pal.fullscreen"), run: toggleFullscreen });
    if (in3d) items.push({ label: t("pal.focusAll"), run: () => Office3D.focus("all") });
    const needle = text.toLowerCase();
    return items.filter(it => it.always || !needle || it.label.toLowerCase().includes(needle)).slice(0, 9);
  }
  function renderPalette() {
    palItems = buildPaletteItems($("pal-input").value);
    palIndex = Math.min(palIndex, Math.max(0, palItems.length - 1));
    const ul = $("pal-list");
    ul.replaceChildren();
    if (!palItems.length) ul.append(el("li", "pal-empty", t("pal.noResults")));
    palItems.forEach((it, i) => {
      const li = el("li", i === palIndex ? "active" : "", it.label);
      li.addEventListener("mousemove", () => { if (palIndex !== i) { palIndex = i; renderPalette(); } });
      li.addEventListener("click", () => runPalette(i));
      ul.append(li);
    });
  }
  function runPalette(i) {
    const it = palItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }

  // ---------- 员工提问 / 请求批准（排队逐个显示）----------
  const askQueue = [];
  let asking = false;
  // App 内的确认框（代替 window.confirm：系统对话框和 App 的样子不搭，按钮也只有英文）
  // opts.danger：确认按钮变红，默认焦点放在「取消」，免得手快误删；opts.yes：确认按钮的文字
  let confirmBox = null;
  function confirmDialog(message, opts = {}) {
    if (!confirmBox) {
      confirmBox = el("div", "palette-wrap ask-wrap confirm-wrap");
      confirmBox.setAttribute("aria-hidden", "true");
      const card = el("div", "ask");
      card.setAttribute("role", "alertdialog");
      card.setAttribute("aria-modal", "true");
      confirmBox._text = el("p", "ask-text");
      confirmBox._no = el("button", "ghost"); confirmBox._no.type = "button";
      confirmBox._yes = el("button"); confirmBox._yes.type = "button";
      const acts = el("div", "ask-actions");
      acts.append(confirmBox._no, confirmBox._yes);
      card.append(confirmBox._text, acts);
      confirmBox.append(card);
      document.body.append(confirmBox);
    }
    const b = confirmBox;
    if (b._done) b._done(false);   // 上一个还开着就当作取消
    b._text.textContent = message;
    b._no.textContent = t("common.cancel");
    b._yes.textContent = opts.yes || t("common.confirm");
    b._yes.className = opts.danger ? "ghost danger" : "primary";
    b.classList.add("open");
    b.setAttribute("aria-hidden", "false");
    (opts.danger ? b._no : b._yes).focus();
    return new Promise(resolve => {
      const onKey = e => {
        if (e.key === "Escape") { e.preventDefault(); done(false); }
        else if (e.key === "Enter" && document.activeElement !== b._no) { e.preventDefault(); done(true); }
      };
      const onBack = e => { if (e.target === b) done(false); };
      const done = ok => {
        b._done = null;
        b.classList.remove("open");
        b.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onKey, true);
        b.removeEventListener("mousedown", onBack);
        b._yes.onclick = b._no.onclick = null;
        resolve(ok);
      };
      b._done = done;
      b._yes.onclick = () => done(true);
      b._no.onclick = () => done(false);
      document.addEventListener("keydown", onKey, true);
      b.addEventListener("mousedown", onBack);
    });
  }

  function askUser(req) {
    return new Promise(resolve => { askQueue.push({ req, resolve }); nextAsk(); });
  }
  function nextAsk() {
    if (asking || !askQueue.length) return;
    asking = true;
    const { req, resolve } = askQueue.shift();
    const a = req.agent;
    $("ask-av").textContent = agentName(a)[0] || "?";
    $("ask-av").style.setProperty("--c", agentColor(a));
    $("ask-who").textContent = agentName(a);
    $("ask-kind").textContent = t(req.input ? "ask.kind.question" : "ask.kind.approve");
    $("ask-text").textContent = req.message;
    const input = $("ask-input");
    input.hidden = !req.input;
    input.value = "";
    input.placeholder = t("ask.placeholder");
    $("ask-yes").textContent = req.yes || t(req.input ? "ask.answer" : "ask.allow");
    $("ask-no").textContent = req.no || t(req.input ? "ask.skip" : "ask.deny");
    const done = ok => {
      $("ask").classList.remove("open");
      $("ask").setAttribute("aria-hidden", "true");
      $("ask-yes").onclick = $("ask-no").onclick = input.onkeydown = null;
      asking = false;
      resolve({ ok: ok && (!req.input || !!input.value.trim()), text: input.value.trim() });
      nextAsk();
    };
    $("ask-yes").onclick = () => done(true);
    $("ask-no").onclick = () => done(false);
    input.onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) done(true); };
    $("ask").classList.add("open");
    $("ask").setAttribute("aria-hidden", "false");
    (req.input ? input : $("ask-yes")).focus();
  }

  // ---------- 提示条 ----------
  function toast(text, opts = {}) {
    const box = $("toasts");
    const n = el("div", "toast");
    n.dataset.kind = opts.kind || "info";
    n.append(el("i", "toast-dot"), el("span", "toast-text", text));
    const remove = () => { n.classList.remove("in"); setTimeout(() => n.remove(), 250); };
    if (opts.action) n.append(button("toast-act", opts.actionLabel, () => { opts.action(); remove(); }));
    box.append(n);
    while (box.children.length > 3) box.firstChild.remove();
    requestAnimationFrame(() => n.classList.add("in"));
    setTimeout(remove, opts.ttl || 4500);
  }
  function toastPending(task) {
    if (panel === "tasks") return;
    toast(t("toast.pending", { a: agentName(agentById(task.agentId)) }),
      { kind: "warn", actionLabel: t("toast.view"), action: () => open("tasks"), ttl: 9000 });
  }
  function toastDone(task) {
    toast(t("toast.done", { a: agentName(agentById(task.agentId)), title: taskTitle(task) }), { kind: "ok", ttl: 9000, actionLabel: t("toast.view"), action: () => openTask(task.id) });
  }

  // ---------- 小地图 ----------
  function buildMinimap() {
    const box = $("minimap");
    box.replaceChildren();
    box.hidden = !in3d;
    if (!in3d) return;
    const lay = Office3D.getLayout();
    const R = (lay.radius || 10.5) + 5.5;
    const X0 = -R, X1 = R, Z0 = -R * 0.88, Z1 = R * 1.38;
    const pos = (x, z) => [((x - X0) / (X1 - X0)) * 100, ((z - Z0) / (Z1 - Z0)) * 100];
    for (const isl of lay.islands) {
      const tm = teamById(isl.id);
      const [l, tp] = pos(isl.x, isl.z);
      const b = button("map-node island", "", () => Office3D.focus(isl.id));
      b.style.cssText = `left:${l}%;top:${tp}%;--tc:${isl.color}`;
      b.title = teamName(tm);
      b.setAttribute("aria-label", teamName(tm));
      box.append(b);
    }
    const [bl, bt] = pos(lay.brain.x, lay.brain.z);
    const brainBtn = button("map-node brain", "", () => Office3D.focus("brain"));
    brainBtn.style.cssText = `left:${bl}%;top:${bt}%`;
    brainBtn.title = t("brain.title");
    brainBtn.setAttribute("aria-label", t("brain.title"));
    const all = button("map-all", t("map.all"), () => Office3D.focus("all"));
    box.append(brainBtn, all);
  }

  // ---------- 全屏 / 标题栏 ----------
  function toggleFullscreen() {
    try {
      const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* 浏览器不支持或被拦截时忽略 */ }
  }

  function setupTitlebar() {
    const d = window.desktop;
    if (!d || !d.windowControl) return;
    document.body.classList.add("has-titlebar");
    $("titlebar").hidden = false;
    $("tb-min").addEventListener("click", () => d.windowControl("minimize"));
    $("tb-max").addEventListener("click", () => d.windowControl("maximize"));
    $("tb-close").addEventListener("click", () => d.windowControl("close"));
  }

  // ---------- 初始化与刷新 ----------
  function init(opts) {
    in3d = !!opts.in3d;
    applyI18n();

    $("tabs").addEventListener("click", e => {
      const b = e.target.closest(".tab");
      if (b) open(b.dataset.view);
    });
    $("task-tabs").addEventListener("click", e => {
      const b = e.target.closest(".subtab");
      if (b) { tasksTab = b.dataset.sub; showTasksTab(); }
    });
    $("drawer-close").addEventListener("click", closeAll);
    $("sheet-close").addEventListener("click", closeAll);
    $("sheet").addEventListener("mousedown", e => { if (e.target === $("sheet")) closeAll(); });
    $("fs").addEventListener("click", toggleFullscreen);
    $("palette-btn").addEventListener("click", openPalette);
    window.addEventListener("resize", updateInset);

    // 指令面板
    $("palette").addEventListener("mousedown", e => { if (e.target === $("palette")) closePalette(); });
    $("pal-input").addEventListener("input", () => { palIndex = 0; renderPalette(); });
    $("pal-input").addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); palIndex = Math.min(palItems.length - 1, palIndex + 1); renderPalette(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); palIndex = Math.max(0, palIndex - 1); renderPalette(); }
      else if (e.key === "Enter") { e.preventDefault(); runPalette(palIndex); }
    });
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen()) closePalette(); else openPalette();
      } else if (e.key === "Escape") {
        if (paletteOpen()) closePalette();
        else if (panel) closeAll();
      }
    });

    buildMinimap();
    setupTitlebar();
    ChatUI.init();
    open(tasks.some(x => x.status === "pending") ? "tasks" : "office");
  }

  function refresh() {
    updateBadge();
    if (panel === "agent") renderAgent();
    else if (panel === "task") renderTask();
    else if (panel === "brain") {
      const sig = tasks.filter(x => x.status === "done").map(x => x.id).join(",");
      if (sig !== brainSig) { brainSig = sig; renderMemories(); }
    }
  }

  // 语言切换后：静态文字、小地图、已打开的面板、指令面板都重新生成
  function onLanguage() {
    applyI18n();
    buildMinimap();
    agentSig = "";
    if (panel === "brain") buildBrain();
    else if (panel === "settings") buildSettings();
    detailSig = "";
    syncChrome();
    if (paletteOpen()) renderPalette();
    ChatUI.render();
  }

  return { init, refresh, onLanguage, open, openTask, askUser, confirm: confirmDialog, selectAgent, focusTeam, toast, toastPending, toastDone };
})();
