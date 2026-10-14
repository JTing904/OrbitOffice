"use strict";

// 设置里的「办公室与员工」：增删改办公室（团队）和员工，导入 .md，用 AI 帮忙写员工或搭整个办公室。
// 员工存成 .md 文件（office-def.js 负责格式，electron/office.js 负责读写）。
// 改了结构（增删员工或办公室、换办公室、换颜色或样子）要重新搭 3D 场景：保存后页面重新载入，回到这里。
// 为了不打断正在干活的员工，有任务在进行时不能改结构；名字、职责、技能这些随时可以改，立刻生效。
// 依赖 app.js 的全局（AGENTS、TEAMS、OFFICE、tasks、el、t…）和 ui.js 的 UI.toast / UI.askUser，都在调用时才读取。
const OfficeUI = (() => {
  const MAX_TEAMS = 12, MAX_PER_TEAM = 6, MAX_AGENTS = 40;
  const STYLES = ["product", "quality", "engineering", "security"];
  const PALETTE = ["#4c9a6a", "#e8a33d", "#d45f8f", "#4c8fd9", "#9b6bd6", "#d9822b", "#f97373", "#2dd4bf", "#ef4444", "#22b8e6", "#a3e635", "#f472b6"];
  let box = null;          // 这一段设置的容器
  let editing = null;      // 正在编辑的员工：{ id（新员工为 null）, team, meta, body, raw }
  let busyText = "";       // 正在用 AI 生成时显示的文字

  const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", onClick); return b; };
  const api = () => window.desktop && desktop.office;
  const working = () => tasks.some(x => x.status === "doing") || !!document.querySelector(".talk-status");
  const taken = () => new Set(AGENTS.map(a => a.id).concat(TEAMS.map(x => x.id)));
  const fail = r => UI.toast(t("office.e.save", { error: (r && (r.error || r.detail)) || "?" }), { kind: "warn", ttl: 9000 });

  // 改了结构：写文件后重新载入页面（3D 场景要重搭）
  async function saveStructural(change) {
    if (working()) { UI.toast(t("office.busy"), { kind: "warn", ttl: 9000 }); return false; }
    const r = await api().write(change);
    if (!r || r.ok === false) { fail(r); return false; }
    try { sessionStorage.setItem("reopen", "office"); } catch (_) { /* 不可用时忽略 */ }
    if (window.desktop && desktop.windowControl) desktop.windowControl("reload"); else location.reload();
    return true;
  }
  const teamsPlain = () => TEAMS.map(x => ({ id: x.id, name: teamName(x), color: x.color, style: x.style || "", dept: x.dept || "" }));
  const deptsPlain = () => DEPTS.map(d => Object.assign({}, d));
  const DEPT_COLORS = ["#2dd4bf", "#f472b6", "#f59e0b", "#60a5fa", "#a78bfa", "#34d399"];
  // 第一次分部门：现有的组都放进「部门 1」（沿用办公室的说明），再加一个空的新部门
  function startDepartments(ids) {
    const first = { id: OfficeDef.uniqueId("", ids, "dept"), name: t("dept.newName", { n: 1 }), color: DEPT_COLORS[0], purpose: OFFICE.purpose, folder: "" };
    ids.add(first.id);
    return { depts: [first], teams: teamsPlain().map(x => Object.assign(x, { dept: first.id })) };
  }
  function newDept(ids, n, purpose) {
    const d = { id: OfficeDef.uniqueId("", ids, "dept"), name: t("dept.newName", { n }), color: DEPT_COLORS[(n - 1) % DEPT_COLORS.length], purpose: purpose || "", folder: "" };
    ids.add(d.id);
    return d;
  }

  // ---- 整段 ----
  function build(section) {
    box = section;
    section.id = "set-office";
    render();
  }

  function render() {
    if (!box) return;
    const keep = box.parentNode ? box.parentNode.scrollTop : 0;
    box.replaceChildren(el("h3", "eyebrow", t("set.office")));
    if (!api()) { box.append(el("p", "set-note", t("set.project.web"))); return; }
    if (!OFFICE.fromFiles) box.append(el("p", "set-status bad", t("office.loadError", { error: OFFICE.loadError || "?" })));
    box.append(el("p", "set-note", t("office.note")));

    // 这个办公室是做什么的
    const purpose = el("textarea", "set-input wide office-purpose");
    purpose.rows = 2; purpose.value = OFFICE.purpose; purpose.placeholder = t("office.purpose.ph");
    purpose.addEventListener("change", async () => {
      const r = await api().write({ purpose: purpose.value.trim() });
      if (!r || r.ok === false) return fail(r);
      OFFICE.purpose = purpose.value.trim();
      UI.toast(t("office.saved"), { kind: "ok", ttl: 3000 });
    });
    const pRow = el("label", "office-field");
    pRow.append(el("span", null, t("office.purpose")), purpose);
    box.append(pRow);

    const tools = el("div", "set-buttons office-tools");
    tools.append(
      btn("ghost", t("office.ai.office"), () => { editing = { kind: "office-ai" }; render(); }),
      btn("ghost", t("office.import"), importFiles),
      btn("ghost", t("office.openDir"), () => api().openDir()),
    );
    // 换成某个现成的模板（软件团队、内容团队）
    const tpl = el("select", "set-select office-template");
    for (const name of OfficeDef.TEMPLATES) tpl.append(new Option(t("office.tpl." + name), name));
    tools.append(tpl, btn("ghost", t("dept.addTemplate"), () => templateAsDept(tpl.value)), btn("ghost danger", t("office.useTemplate"), () => useTemplate(tpl.value)));
    box.append(tools);
    if (editing && editing.kind === "office-ai") box.append(officeAiPanel());
    if (busyText) box.append(el("p", "set-status", busyText));

    box.append(deptBlock());
    for (const tm of TEAMS) box.append(teamBlock(tm));
    if (TEAMS.length < MAX_TEAMS) box.append(btn("ghost office-add-team", t("office.addTeam"), addTeam));

    // 把 .md 拖进这一段：拖到某个员工上 = 给他的参考资料；拖到别处 = 导入成新员工
    box.ondragover = e => { e.preventDefault(); box.classList.add("drop"); };
    box.ondragleave = () => box.classList.remove("drop");
    box.ondrop = async e => {
      e.preventDefault();
      box.classList.remove("drop");
      const files = [...e.dataTransfer.files].filter(f => /\.(md|txt)$/i.test(f.name)).slice(0, 20);
      if (!files.length) return UI.toast(t("office.e.notMd"), { kind: "warn" });
      const read = await Promise.all(files.map(async f => ({ name: f.name, text: (await f.text()).slice(0, 200 * 1024) })));
      const row = e.target.closest && e.target.closest("[data-agent]");
      if (row) addRefs(row.dataset.agent, read);
      else importTexts(read);
    };
    if (box.parentNode) box.parentNode.scrollTop = keep;
  }

  // ---- 部门：一个世界里几种不同的工作，各有说明、主持人和工作文件夹 ----
  function deptBlock() {
    const wrap = el("div", "office-depts");
    wrap.append(el("span", "eyebrow", t("dept.title")), el("p", "set-note", t(DEPTS.length ? "dept.note" : "dept.noneYet")));
    for (const d of DEPTS) {
      const row = el("div", "office-dept-row");
      row.style.setProperty("--dc", d.color);
      const color = el("input", "swatch");
      color.type = "color"; color.value = d.color;
      color.addEventListener("change", () => saveStructural({ departments: deptsPlain().map(x => x.id === d.id ? Object.assign(x, { color: color.value }) : x) }));
      const name = el("input", "set-input office-team-name");
      name.type = "text"; name.value = d.name;
      // 名字、说明、文件夹只改文字：直接生效，不用重搭 3D
      const saveText = async patch => {
        const r = await api().write({ departments: deptsPlain().map(x => x.id === d.id ? Object.assign(x, patch) : x) });
        if (!r || r.ok === false) return fail(r);
        Object.assign(d, patch);
        if (typeof buildSelectAndExamples === "function") buildSelectAndExamples();
        syncTeamLabels();
        UI.toast(t("office.saved"), { kind: "ok", ttl: 2500 });
      };
      name.addEventListener("change", () => name.value.trim() && saveText({ name: name.value.trim() }));
      const n = AGENTS.filter(a => (deptOf(a) || {}).id === d.id).length;
      const del = btn("ghost small danger", t("office.removeTeam"), async () => {
        if (!window.confirm(t("dept.removeConfirm", { name: d.name }))) return;
        await saveStructural({ departments: deptsPlain().filter(x => x.id !== d.id), teams: teamsPlain().map(x => x.dept === d.id ? Object.assign(x, { dept: "" }) : x) });
      });
      const head = el("div", "office-team-head");
      head.append(color, name, el("span", "office-count", t("dept.count", { n, lead: n ? agentName(deptLead(d.id)) : "—" })), del);
      const purpose = el("textarea", "set-input wide office-purpose");
      purpose.rows = 2; purpose.value = d.purpose || ""; purpose.placeholder = t("dept.purpose.ph");
      purpose.addEventListener("change", () => saveText({ purpose: purpose.value.trim() }));
      const folderLine = el("div", "set-inline office-dept-folder");
      folderLine.append(el("code", "set-path", d.folder || t("dept.folder.default")), btn("ghost small", t("dept.folder.pick"), async () => {
        const r = await api().pickDeptFolder(d.id);
        if (r && r.ok) { d.folder = r.folder; render(); } else if (r && !r.canceled) fail(r);
      }));
      row.append(head, purpose, folderLine);
      wrap.append(row);
    }
    if (DEPTS.length < 8) wrap.append(btn("ghost small", t("dept.add"), async () => {
      const ids = taken();
      DEPTS.forEach(d => ids.add(d.id));
      if (!DEPTS.length) {
        const s = startDepartments(ids);
        await saveStructural({ departments: s.depts.concat(newDept(ids, 2, "")), teams: s.teams });
      } else await saveStructural({ departments: deptsPlain().concat(newDept(ids, DEPTS.length + 1, "")) });
    }));
    return wrap;
  }

  // ---- 一个办公室（团队）----
  function teamBlock(tm) {
    const wrap = el("div", "office-team");
    wrap.style.setProperty("--tc", tm.color);
    const head = el("div", "office-team-head");
    const color = el("input", "swatch");
    color.type = "color"; color.value = tm.color;
    color.addEventListener("change", () => saveStructural({ teams: teamsPlain().map(x => x.id === tm.id ? Object.assign(x, { color: color.value }) : x) }));
    const name = el("input", "set-input office-team-name");
    name.type = "text"; name.value = teamName(tm);
    name.addEventListener("change", async () => {
      const v = name.value.trim();
      if (!v) { name.value = teamName(tm); return; }
      const r = await api().write({ teams: teamsPlain().map(x => x.id === tm.id ? Object.assign(x, { name: v }) : x) });
      if (!r || r.ok === false) return fail(r);
      tm.name = v;
      if (window.Office3D && Office3D.setTeamLabel) syncTeamLabels();
      render();
    });
    const style = el("select", "set-select office-style");
    for (const s of STYLES) style.append(new Option(t("office.style." + s), s));
    style.value = STYLES.includes(tm.style) ? tm.style : STYLES.includes(tm.id) ? tm.id : "product";
    style.title = t("office.style");
    style.addEventListener("change", () => saveStructural({ teams: teamsPlain().map(x => x.id === tm.id ? Object.assign(x, { style: style.value }) : x) }));
    const members = AGENTS.filter(a => a.team === tm.id);
    const del = btn("ghost small danger", t("office.removeTeam"), async () => {
      if (TEAMS.length <= 1) return UI.toast(t("office.e.lastTeam"), { kind: "warn" });
      if (!window.confirm(t("office.removeTeamConfirm", { name: teamName(tm), n: members.length }))) return;
      cancelTasksOf(members.map(a => a.id));
      await saveStructural({ teams: teamsPlain().filter(x => x.id !== tm.id), remove: members.map(a => a.id) });
    });
    head.append(color, name, style);
    if (DEPTS.length) {
      const dept = el("select", "set-select office-dept");
      dept.append(new Option(t("dept.none"), ""));
      for (const d of DEPTS) dept.append(new Option(d.name, d.id));
      dept.value = tm.dept || "";
      dept.title = t("dept.of");
      dept.addEventListener("change", () => saveStructural({ teams: teamsPlain().map(x => x.id === tm.id ? Object.assign(x, { dept: dept.value }) : x) }));
      head.append(dept);
    }
    head.append(el("span", "office-count", t("team.count", { n: members.length })), del);
    wrap.append(head);

    for (const a of members) {
      wrap.append(agentRow(a));
      if (editing && editing.id === a.id) wrap.append(editor());
    }
    if (editing && !editing.id && editing.team === tm.id && editing.kind === "agent") wrap.append(editor());
    if (editing && editing.kind === "agent-ai" && editing.team === tm.id) wrap.append(agentAiPanel(tm));

    if (members.length < MAX_PER_TEAM && AGENTS.length < MAX_AGENTS) {
      const add = el("div", "set-inline office-add");
      add.append(
        btn("ghost small", t("office.addAgent"), () => { editing = newAgentDraft(tm.id); render(); }),
        btn("ghost small", t("office.ai.agent"), () => { editing = { kind: "agent-ai", team: tm.id }; render(); }),
      );
      wrap.append(add);
    } else wrap.append(el("p", "set-note", t("office.full", { n: MAX_PER_TEAM })));
    return wrap;
  }

  function agentRow(a) {
    const row = el("div", "office-agent");
    row.dataset.agent = a.id;
    row.style.setProperty("--c", agentColor(a));
    const who = el("div", "office-agent-who");
    who.append(el("i", "dot"), el("b", null, agentName(a)), el("span", null, agentRole(a)));
    if (a.external) who.append(el("em", "office-ext", t("office.external")));
    if ((a.refs || []).length) who.append(el("em", "office-refs", t("office.refsCount", { n: a.refs.length })));
    row.append(who,
      btn("ghost small", t(editing && editing.id === a.id ? "office.close" : "office.edit"), () => {
        editing = editing && editing.id === a.id ? null : draftFrom(a);
        render();
      }),
      btn("ghost small danger", t("office.removeAgent"), async () => {
        if (AGENTS.length <= 1) return UI.toast(t("office.e.lastAgent"), { kind: "warn" });
        if (!window.confirm(t("office.removeAgentConfirm", { name: agentName(a) }))) return;
        cancelTasksOf([a.id]);
        await saveStructural({ remove: [a.id] });
      }));
    return row;
  }

  // 删员工前：他还没开始的任务一并取消（正在做的不会有，因为干活时不能改结构）
  function cancelTasksOf(ids) {
    for (const x of tasks) if (ids.includes(x.agentId) && x.status !== "done") cancelTask(x.id);
    save();
  }

  // ---- 员工编辑器 ----
  const draftFrom = a => ({ kind: "agent", id: a.id, team: a.team, meta: Object.assign({}, a.meta || {}), body: a.body || a.brief || "", refs: a.refs || [], raw: null });
  function newAgentDraft(team, meta, body) {
    const used = new Set(AGENTS.map(a => a.color));
    return { kind: "agent", id: null, team, refs: [], raw: null,
      meta: Object.assign({ name: t("office.newName"), role: "", color: PALETTE.find(c => !used.has(c)) || PALETTE[0] }, meta || {}),
      body: body != null ? body : t("office.newBody") };
  }

  function editor() {
    const d = editing;
    const form = el("div", "office-editor");
    const field = (labelKey, input, hintKey) => {
      const l = el("label", "office-field");
      l.append(el("span", null, t(labelKey)), input);
      if (hintKey) l.append(el("small", null, t(hintKey)));
      return l;
    };
    const text = (value, ph) => { const i = el("input", "set-input wide"); i.type = "text"; i.value = value || ""; if (ph) i.placeholder = ph; return i; };
    const list = v => OfficeDef.asList(v).join(", ");
    const check = (checked, labelKey) => { const l = el("label", "office-check"); const i = el("input"); i.type = "checkbox"; i.checked = !!checked; l.append(i, el("span", null, t(labelKey))); l.input = i; return l; };

    // 直接编辑 .md 源文件
    if (d.raw != null) {
      const raw = el("textarea", "set-input wide mono office-raw");
      raw.rows = 22; raw.value = d.raw; raw.spellcheck = false;
      const acts = el("div", "set-buttons");
      acts.append(btn("primary", t("office.save"), () => { const p = OfficeDef.parse(raw.value); d.meta = p.meta; d.body = p.body; d.raw = null; saveAgent(); }),
        btn("ghost", t("office.fields"), () => { const p = OfficeDef.parse(raw.value); d.meta = p.meta; d.body = p.body; d.raw = null; render(); }),
        btn("ghost", t("office.cancel"), () => { editing = null; render(); }));
      form.append(el("p", "set-note", t("office.rawNote")), raw, acts);
      return form;
    }

    const m = d.meta;
    const name = text(m.name), role = text(m.role, t("office.role.ph"));
    const color = el("input", "swatch"); color.type = "color"; color.value = /^#[0-9a-f]{6}$/i.test(m.color || "") ? m.color : "#67e8f9";
    const team = el("select", "set-select wide");
    for (const tm of TEAMS) team.append(new Option(teamName(tm), tm.id));
    team.value = d.team;
    const skills = text(list(m.skills)), keywords = text(list(m.keywords));
    const body = el("textarea", "set-input wide office-body");
    body.rows = 12; body.value = d.body;
    const top = el("div", "office-grid");
    const colorWrap = el("div", "set-inline"); colorWrap.append(color);
    top.append(field("set.name", name), field("set.role", role), field("office.color", colorWrap), field("office.team", team));
    form.append(top, field("set.skills", skills, "office.skills.hint"), field("office.keywords", keywords, "office.keywords.hint"),
      field("office.body", body, "office.body.hint"));

    // 参考资料
    if (d.id) {
      const refs = el("div", "office-refs-box");
      refs.append(el("span", "eyebrow", t("office.refs")));
      if (!d.refs.length) refs.append(el("p", "set-note", t("office.refs.none")));
      for (const r of d.refs) {
        const line = el("div", "office-ref");
        line.append(el("code", null, r.name), el("small", null, (r.size / 1024).toFixed(1) + " KB"),
          btn("ghost small danger", "✕", async () => { const res = await api().removeRef(d.id, r.name); if (Array.isArray(res)) { d.refs = res; syncRefs(d.id, res); render(); } else fail(res); }));
        refs.append(line);
      }
      refs.append(btn("ghost small", t("office.refs.add"), async () => {
        const res = await api().addRefFiles(d.id);
        if (res && res.ok && res.refs) { d.refs = res.refs; syncRefs(d.id, res.refs); render(); } else if (res && !res.ok) fail(res);
      }), el("small", "set-note", t("office.refs.drop")));
      form.append(refs);
    } else form.append(el("p", "set-note", t("office.refs.later")));

    // 高级
    const adv = el("details", "src-adv");
    const writes = text(list(m.writes), t("office.writes.ph"));
    const autoAssign = check(m["auto-assign"] !== false, "office.autoAssign");
    const approval = check(m["needs-approval"] === true, "office.needsApproval");
    const lead = check(m.lead === true, "office.lead");
    const localOnly = check(m["local-only"] === true, "office.localOnly");
    const external = check(m.source === "imported", "office.externalFlag");
    const sendTo = el("select", "set-select wide");
    sendTo.append(new Option(t("office.sendTo.none"), ""));
    for (const a of AGENTS) if (a.id !== d.id) sendTo.append(new Option(agentName(a) + " · " + agentRole(a), a.id));
    sendTo.value = m["send-results-to"] && AGENTS.some(a => a.id === m["send-results-to"]) ? m["send-results-to"] : "";
    const looks = el("div", "office-looks");
    const lookChecks = Object.keys(OfficeDef.LOOK_NAMES).map(k => { const c = check(OfficeDef.asList(m.look).map(x => x.toLowerCase()).includes(k), "office.look." + k); looks.append(c); return [k, c]; });
    adv.append(el("summary", null, t("office.advanced")), field("office.writes", writes, "office.writes.hint"),
      field("office.sendTo", sendTo, "office.sendTo.hint"), autoAssign, approval, lead, localOnly, external, field("office.look", looks));
    form.append(adv);

    const collect = () => {
      const next = Object.assign({}, m, {
        name: name.value.trim() || t("office.newName"), role: role.value.trim(), team: team.value, color: color.value,
        skills: OfficeDef.asList(skills.value), keywords: OfficeDef.asList(keywords.value), writes: OfficeDef.asList(writes.value),
        "auto-assign": autoAssign.input.checked ? null : false, "needs-approval": approval.input.checked || null, lead: lead.input.checked || null,
        "local-only": localOnly.input.checked || null, "send-results-to": sendTo.value || null, source: external.input.checked ? "imported" : null,
        look: lookChecks.filter(([, c]) => c.input.checked).map(([k]) => k),
      });
      d.meta = next; d.team = team.value; d.body = body.value;
    };
    const acts = el("div", "set-buttons");
    acts.append(btn("primary", t("office.save"), () => { collect(); saveAgent(); }),
      btn("ghost", t("office.raw"), () => { collect(); d.raw = OfficeDef.serialize(d.meta, d.body); render(); }),
      btn("ghost", t("office.cancel"), () => { editing = null; render(); }));
    form.append(acts);
    return form;
  }

  function syncRefs(id, refs) { const a = AGENTS.find(x => x.id === id); if (a) a.refs = refs; }

  async function saveAgent() {
    const d = editing;
    d.meta.team = TEAMS.some(x => x.id === d.meta.team) ? d.meta.team : d.team;
    const old = d.id && AGENTS.find(a => a.id === d.id);
    if (!d.id && AGENTS.filter(a => a.team === d.meta.team).length >= MAX_PER_TEAM) return UI.toast(t("office.full", { n: MAX_PER_TEAM }), { kind: "warn" });
    const id = d.id || OfficeDef.uniqueId(d.meta.name, taken());
    if (!d.id && !d.meta.order) d.meta.order = AGENTS.reduce((n, a) => Math.max(n, a.order < 999 ? a.order : 0), 0) + 1;   // 新员工坐在最后一个工位
    const text = OfficeDef.serialize(d.meta, d.body);
    const lookKey = m => OfficeDef.asList(m.look).join(",");
    const structural = !old || old.team !== d.meta.team || old.color !== d.meta.color || lookKey(old.meta || {}) !== lookKey(d.meta);
    if (structural) { if (await saveStructural({ agents: [{ id, text }] })) editing = null; return; }
    // 只改了文字：直接生效，不用重搭 3D
    const r = await api().write({ agents: [{ id, text }] });
    if (!r || r.ok === false) return fail(r);
    const fresh = OfficeDef.toAgent({ id, text, refs: d.refs }, TEAMS, LANG);
    AGENTS.splice(AGENTS.indexOf(old), 1, fresh);
    editing = null;
    agentsVersion++;
    render();
    UI.refresh();
    UI.toast(t("office.saved"), { kind: "ok", ttl: 3000 });
  }

  // ---- 新建 ----
  async function addTeam() {
    const n = TEAMS.length + 1;
    const id = OfficeDef.uniqueId("", taken(), "team");
    const used = new Set(TEAMS.map(x => x.color));
    const team = { id, name: t("office.newTeam", { n }), color: PALETTE.find(c => !used.has(c)) || PALETTE[n % PALETTE.length], style: STYLES[TEAMS.length % STYLES.length] };
    // 新办公室至少要有一个员工，不然 3D 里是一座空岛
    const meta = { name: t("office.newName"), role: "", team: id, color: PALETTE[(n + 3) % PALETTE.length] };
    await saveStructural({ teams: teamsPlain().concat(team), agents: [{ id: OfficeDef.uniqueId(meta.name, new Set([...taken(), id])), text: OfficeDef.serialize(meta, t("office.newBody")) }] });
  }

  // ---- 用 AI 写 ----
  function aiPanel(placeholderKey, onGo, rows) {
    const p = el("div", "office-ai");
    const input = el("textarea", "set-input wide");
    input.rows = rows || 3; input.placeholder = t(placeholderKey);
    const acts = el("div", "set-buttons");
    const go = btn("primary", t("office.ai.go"), async () => {
      if (!input.value.trim()) return;
      go.disabled = true;
      busyText = t("office.ai.working");
      render();
      try { await onGo(input.value.trim()); } finally { busyText = ""; render(); }
    });
    acts.append(go, btn("ghost", t("office.cancel"), () => { editing = null; render(); }));
    p.append(input, acts);
    return p;
  }
  const composeErr = r => UI.toast(t("office.ai.fail", { error: (r && (r.detail || r.error)) || "?" }), { kind: "warn", ttl: 10000 });

  function agentAiPanel(tm) {
    return aiPanel("office.ai.agent.ph", async text => {
      const r = await desktop.agent.compose({ kind: "agent", text, lang: LANG, purpose: OFFICE.purpose, team: teamList(null) });
      if (!r || !r.ok) { editing = null; return composeErr(r); }
      const a = r.result;
      editing = newAgentDraft(tm.id, { name: a.name, role: a.role, color: /^#[0-9a-f]{6}$/i.test(a.color || "") ? a.color : undefined, skills: a.skills || [], keywords: a.keywords || [] }, a.instructions);
    });
  }

  function officeAiPanel() {
    const wrap = el("div", "office-ai");
    if (editing.preview) {
      const o = editing.preview;
      const card = el("div", "office-preview");
      card.append(el("p", "set-note", o.purpose || ""));
      for (const tm of o.teams) {
        const tb = el("div", "office-preview-team");
        tb.append(el("b", null, tm.name));
        for (const a of tm.agents || []) tb.append(el("div", "office-preview-agent", a.name + " · " + a.role));
        card.append(tb);
      }
      const acts = el("div", "set-buttons");
      acts.append(btn("primary", t("office.ai.replace"), () => applyOffice(o, true)), btn("ghost", t("office.ai.append"), () => applyOffice(o, false)),
        btn("ghost", t("office.cancel"), () => { editing = null; render(); }));
      wrap.append(card, acts);
      return wrap;
    }
    return aiPanel("office.ai.office.ph", async text => {
      const r = await desktop.agent.compose({ kind: "office", text, lang: LANG });
      if (!r || !r.ok) { editing = null; return composeErr(r); }
      editing = { kind: "office-ai", preview: r.result };
    }, 4);
  }

  // 把 AI 生成的办公室写成文件：替换现在的全部，或加在现在的后面
  async function applyOffice(o, replace) {
    if (replace && !window.confirm(t("office.ai.replaceConfirm"))) return;
    const ids = replace ? new Set() : taken();
    const teams = replace ? [] : teamsPlain();
    const agents = [];
    const room = MAX_TEAMS - teams.length;
    o.teams.slice(0, room).forEach((tm, i) => {
      const id = OfficeDef.uniqueId(tm.name, ids, "team"); ids.add(id);
      teams.push({ id, name: String(tm.name || id).slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(tm.color || "") ? tm.color : PALETTE[(teams.length) % PALETTE.length], style: STYLES[teams.length % STYLES.length] });
      (tm.agents || []).slice(0, MAX_PER_TEAM).forEach((a, j) => {
        const aid = OfficeDef.uniqueId(a.name || "agent", ids); ids.add(aid);
        const meta = { name: a.name, role: a.role, team: id, color: /^#[0-9a-f]{6}$/i.test(a.color || "") ? a.color : PALETTE[(i * 3 + j) % PALETTE.length],
          skills: a.skills || [], keywords: a.keywords || [], order: i * 10 + j + 1, lead: replace && i === 0 && j === 0 ? true : null };
        agents.push({ id: aid, text: OfficeDef.serialize(meta, a.instructions || "") });
      });
    });
    const change = { teams, agents };
    if (replace) { change.remove = AGENTS.map(a => a.id); change.purpose = o.purpose || ""; change.departments = []; cancelTasksOf(AGENTS.map(a => a.id)); }
    else {
      // 加在后面 = 新开一个部门，用 AI 写的说明；原来没分部门的话，原来的组先放进「部门 1」
      DEPTS.forEach(d => ids.add(d.id));
      let depts = deptsPlain(), old = teamsPlain();
      if (!depts.length) { const s = startDepartments(ids); depts = s.depts; old = s.teams; }
      const d = newDept(ids, depts.length + 1, o.purpose || "");
      change.departments = depts.concat(d);
      change.teams = old.concat(teams.slice(old.length).map(x => Object.assign(x, { dept: d.id })));
    }
    // 删除和写入在同一次里：先删旧的再写新的，id 不会冲突（新 id 是在空集合里生成的，可能和旧的同名，所以分两步）
    if (replace) {
      if (working()) return UI.toast(t("office.busy"), { kind: "warn", ttl: 9000 });
      const r1 = await api().write({ remove: change.remove });
      if (!r1 || r1.ok === false) return fail(r1);
      delete change.remove;
    }
    editing = null;
    await saveStructural(change);
  }

  // ---- 导入 ----
  async function importFiles() {
    const r = await api().pickFiles();
    if (!r || !r.ok) return r && fail(r);
    importTexts(r.files);
  }

  // 导入别人写的员工：先给你看内容，同意了才加，并标记为「来自外部」（运行命令前一定先问）
  async function importTexts(files) {
    const ids = taken();
    const add = [];
    for (const f of files) {
      const { meta, body } = OfficeDef.parse(f.text);
      if (!meta.name) meta.name = f.name.replace(/\.(md|txt)$/i, "");
      const team = TEAMS.some(x => x.id === meta.team) ? meta.team : TEAMS[0].id;
      if (AGENTS.filter(a => a.team === team).length + add.filter(x => x.team === team).length >= MAX_PER_TEAM) { UI.toast(t("office.full", { n: MAX_PER_TEAM }), { kind: "warn" }); continue; }
      const preview = OfficeDef.toAgent({ id: "preview", text: f.text }, TEAMS, LANG);
      const ok = await UI.askUser({ agent: preview, input: false, yes: t("office.import.yes"), no: t("office.import.no"),
        message: t("office.import.confirm", { file: f.name, role: meta.role || "—", body: body.slice(0, 700) + (body.length > 700 ? "…" : "") }) });
      if (!ok.ok) continue;
      meta.source = "imported";
      meta.team = team;
      const id = OfficeDef.uniqueId(meta.name, ids); ids.add(id);
      add.push({ id, team, text: OfficeDef.serialize(meta, body) });
    }
    if (add.length) await saveStructural({ agents: add.map(x => ({ id: x.id, text: x.text })) });
  }

  async function addRefs(id, files) {
    let refs = null;
    for (const f of files) {
      const r = await api().addRefText(id, f.name, f.text);
      if (!Array.isArray(r)) return fail(r);
      refs = r;
    }
    syncRefs(id, refs);
    if (editing && editing.id === id) editing.refs = refs;
    render();
    UI.toast(t("office.refs.added", { n: files.length, name: agentName(agentById(id)) }), { kind: "ok", ttl: 4000 });
  }

  async function templateAsDept(name) {
    const ids = taken();
    DEPTS.forEach(d => ids.add(d.id));
    let depts = deptsPlain(), old = teamsPlain();
    if (!depts.length) { const s = startDepartments(ids); depts = s.depts; old = s.teams; }
    const def = OfficeDef.fromTemplate(name, LANG);
    const d = newDept(ids, depts.length + 1, def.purpose);
    d.name = t("office.tpl." + name).replace(/^[^：:]+[：:]\s*/, "");
    const added = OfficeDef.intoDepartment(def, d.id, ids);
    if (old.length + added.teams.length > MAX_TEAMS) return UI.toast(t("office.e.tooManyTeams", { n: MAX_TEAMS }), { kind: "warn" });
    await saveStructural({ departments: depts.concat(d), teams: old.concat(added.teams), agents: added.agents });
  }

  async function useTemplate(name) {
    if (!window.confirm(t("office.resetConfirm", { name: t("office.tpl." + name) }))) return;
    if (working()) return UI.toast(t("office.busy"), { kind: "warn", ttl: 9000 });
    cancelTasksOf(AGENTS.map(a => a.id));
    const r1 = await api().write({ remove: AGENTS.map(a => a.id) });
    if (!r1 || r1.ok === false) return fail(r1);
    await saveStructural(Object.assign(OfficeDef.fromTemplate(name, LANG), { departments: [] }));
  }

  return { build, render };
})();
