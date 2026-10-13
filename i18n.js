"use strict";

// 中英文词表。用法：t("key", { var: value })；静态文字在 HTML 里写 data-i18n / data-i18n-ph / data-i18n-title。
const I18N = {
  zh: {
    "nav.office": "办公室", "nav.tasks": "任务", "nav.brain": "大脑", "nav.settings": "设置",
    "nav.aria": "视图",
    "stat.doing": "进行中", "stat.queued": "排队", "stat.done": "完成",
    "hud.fullscreen": "全屏", "hud.palette": "指令面板",
    "common.close": "关闭", "common.none": "暂无",

    "mode.manual": "手动", "mode.auto": "自动", "mode.full": "完全访问",
    "mode.manual.hint": "每个任务开始前都需要你批准，包括同事之间的交接。",
    "mode.auto.hint": "普通任务自动开始；部署、发布、删除等高风险任务需要你批准。",
    "mode.full.hint": "所有任务和交接都自动执行，不再询问。请谨慎使用。",
    "mode.aria": "权限模式",
    "reason.manual": "手动模式", "reason.risky": "高风险操作", "reason.handoff": "同事建议接着做，需要你确认",

    "cmd.placeholder": "派发任务给团队，例如：审查这个 PR 的代码质量",
    "cmd.agent": "负责人", "cmd.auto": "自动分配",
    "cmd.handoff": "允许交接", "cmd.handoff.title": "允许员工在需要时建议交给同事接着做（要你批准）", "cmd.send": "派发",
    "ex.1": "把「用户登录」需求拆成任务并估时", "ex.2": "审查这个 PR 的代码质量", "ex.3": "线上接口报 500 怎么排查",
    "ex.4": "给登录模块补单元测试", "ex.5": "写本周工作周报", "ex.6": "用 Docker 部署并准备回滚方案",
    "hint.corner": "拖动旋转 · 滚轮缩放 · 点击员工选中",

    "st.pending": "待批准", "st.queued": "排队中", "st.doing": "进行中", "st.done": "已完成",
    "chip.idle": "空闲", "chip.working": "工作中", "chip.waiting": "待批准", "chip.resting": "休息中", "chip.returning": "回工位",
    "bubble.idle": "等待新任务…", "bubble.waiting": "等你批准任务…", "bubble.returning": "正在走回工位…",
    "bubble.waiting2d": "「{title}」等你批准", "bubble.queued": " · 排队 {n}",

    "tasks.title": "任务", "tasks.board": "看板", "tasks.log": "动态",
    "col.pending": "待批准", "col.active": "进行中", "col.done": "已完成",
    "board.approveAll": "全部批准", "board.approve": "批准", "board.reject": "拒绝",
    "board.needs": "需要批准：{reason}",
    "log.empty": "还没有动态，派个任务试试吧",

    "tpl.fromPlanner": "为「{topic}」设计界面与交互",
    "tpl.fromDesigner": "实现「{topic}」",
    "tpl.fromDeveloper": "为「{topic}」编写测试",
    "tpl.fromDebugger": "为「{topic}」编写回归测试",
    "tpl.fromTester": "评审「{topic}」的改动和测试",
    "tpl.fromReviewer": "准备「{topic}」的发布与回滚方案",
    "tpl.fromDevops": "撰写「{topic}」的发布说明",

    "log.assign": "你把「{title}」交给了 {a}",
    "log.assignPending": "你把「{title}」交给了 {a}，等待你批准（{reason}）",
    "log.approved": "你批准了「{title}」",
    "log.rejected": "你拒绝了「{title}」",
    "log.approvedAll": "你批准了所有待批准的任务",
    "log.start": "{a} 开始处理「{title}」",
    "log.done": "{a} 完成了「{title}」",
    "log.handoff": "{a} 把成果交接给 {b}：「{title}」",
    "log.handoffPending": "{a} 把成果交接给 {b}：「{title}」（等待你批准：{reason}）",
    "log.mode": "权限模式切换为「{mode}」",
    "log.cleared": "已清空所有任务和动态",

    "toast.pending": "{a} 的任务等你批准", "toast.view": "查看", "toast.done": "{a} 完成了「{title}」",
    "notify.pending": "有任务等你批准",

    "team.count": "{n} 位员工",
    "brain.label": "共享大脑", "brain.labelSub": "已沉淀 {done} 项成果 · {doing} 项进行中",

    "ap.title": "员工", "ap.status": "状态", "ap.team": "团队", "ap.skills": "技能", "ap.current": "当前任务", "ap.none": "暂无任务",
    "ap.recent": "最近成果", "ap.noneRecent": "还没有完成过任务", "ap.assign": "派给 TA", "ap.locate": "定位", "ap.edit": "编辑",
    "ap.queue": "队列中还有 {n} 个", "ap.close": "关闭员工面板",

    "brain.title": "共享大脑", "brain.sub": "已沉淀 {n} 项成果",
    "brain.search": "搜索成果…", "brain.all": "全部",
    "brain.empty": "大脑还是空的。任务完成后，成果会沉淀到这里。", "brain.noMatch": "没有匹配的成果",
    "brain.completed": "完成于", "brain.by": "负责人", "brain.chain": "交接链", "brain.from": "来自 {a}：{title}", "brain.to": "交接给 {a}：{title}",
    "brain.summary": "成果摘要",

    "set.title": "设置", "set.general": "通用", "set.language": "语言", "set.mode": "权限模式",
    "set.agents": "员工", "set.name": "名字", "set.role": "岗位", "set.color": "颜色", "set.skills": "技能（用逗号分隔）",
    "set.reset": "恢复默认", "set.agentsNote": "修改会立即生效，并在两种语言下都使用你填写的内容。",
    "set.project": "项目文件夹", "set.project.none": "还没有选择", "set.project.pick": "选择文件夹",
    "set.project.note": "员工只能在这个文件夹里读写文件。", "set.project.web": "只有桌面 App 里才能选择项目文件夹。",
    "set.ai": "AI 池", "set.ai.web": "只有桌面 App 里才能连接 AI。",
    "set.ai.note": "选一家 AI，填上 API Key，点保存就行，其余自动完成。可以添加多个。Key 加密保存在这台电脑上，不会显示出来。",
    "set.ai.empty": "还没有添加 AI。在下面选一家，点「添加」，再填 Key 就行。",
    "set.ai.advanced": "高级设置", "set.ai.scan.label": "体检", "set.ai.scan": "检测全部模型",
    "set.ai.scan.running": "正在检测 {done}/{total}…", "set.ai.scan.done": "实测 {tested} 个模型，{count} 个可用。员工会从强到弱自动选用。", "set.ai.scan.none": "还没检测过。检测后员工只用实测可用的模型。", "set.ai.order": "其他", "set.ai.connect": "连接",
    "set.ai.s.connected": "已连接，可以用了（模型：{model}）", "set.ai.s.trying": "正在试模型 {model}…", "set.ai.s.saved": "已设置（模型：{model}）", "set.ai.add": "添加", "set.ai.custom": "自定义（OpenAI 兼容）", "set.ai.local": "本地 Ollama",
    "set.ai.name": "名称", "set.ai.url": "接口地址", "set.ai.tier": "用途", "set.ai.tier.strong": "强（写代码、审查）", "set.ai.tier.light": "轻（周报、整理）",
    "set.ai.enabled": "启用", "set.ai.remove": "删除", "set.ai.removeConfirm": "删除这个来源和它的 Key？", "set.ai.up": "上移", "set.ai.down": "下移",
    "set.ai.noKeyNeeded": "本地来源不需要 Key", "set.ai.e.bad-url": "接口地址要以 http:// 或 https:// 开头", "set.ai.e.ECONNREFUSED": "连不上这个地址（服务没开？）", "set.ai.e.404": "试过的模型都用不了。请点开「高级设置」手动选一个模型",
    "set.ai.key": "API Key", "set.ai.keyPh": "粘贴这个来源的 API Key", "set.ai.keySaved": "已保存（不显示）", "set.ai.save": "保存", "set.ai.clear": "清除",
    "set.ai.model": "模型", "set.ai.load": "查询可用模型", "set.ai.pick": "请选择模型", "set.ai.test": "发一条测试消息",
    "set.ai.s.nokey": "还没有填 API Key", "set.ai.s.ready": "Key 已保存", "set.ai.s.env": "正在使用环境变量里的 Key",
    "set.ai.s.loading": "正在连接…", "set.ai.s.models": "查到 {n} 个模型。这一步不验证 Key，请选一个模型并发测试消息确认", "set.ai.s.testok": "模型回复：{text}（{ms} 毫秒）",
    "set.ai.s.err": "失败：{error}", "set.ai.e.no-key": "还没有填 API Key", "set.ai.e.no-model": "还没有选模型", "set.ai.e.timeout": "连接超时",
    "set.ai.e.401": "Key 无效或已过期", "set.ai.e.403": "Key 无效，或没有权限使用这个模型", "set.ai.e.429": "请求太频繁或额度用完了",
    "set.data": "数据", "set.export": "导出 JSON", "set.clear": "清空任务与动态",
    "set.clearConfirm": "确定清空所有任务和动态吗？员工设置会保留。",
    "set.shortcuts": "快捷键", "set.sc.palette": "打开指令面板", "set.sc.close": "关闭面板", "set.sc.full": "全屏",

    "pal.placeholder": "输入命令或任务…", "pal.dispatch": "派发：{text}", "pal.goto": "前往 {page}",
    "pal.agent": "查看 {name}", "pal.mode": "切换权限模式：{mode}", "pal.lang": "切换语言 / Switch language",
    "pal.fullscreen": "切换全屏", "pal.noResults": "无匹配项", "pal.focus": "镜头对准 {name}", "pal.focusAll": "镜头回到全景",
    "map.aria": "小地图", "map.all": "全景",

    "hud.chat": "聊天", "ap.chat": "和 TA 聊天", "pal.chat": "打开聊天",
    "chat.title.group": "办公室群聊", "chat.online": "{n} 位员工在线", "chat.group": "群聊", "chat.min": "最小化",
    "chat.placeholder": "发消息，或 @某人 单独问 TA…", "chat.send": "发送",
    "chat.demo": "示例对话 · 在这里抛一个话题，大家会一起讨论；@ 某人则只有 TA 回答", "chat.working": "{name} 正在处理，回复会出现在这里",
    "chat.talk.typing": "{name} 正在输入…", "chat.talk.stop": "停止讨论", "chat.talk.stopped": "讨论已停止", "chat.talk.failed": "讨论中断了：{error}", "chat.plan.added": "已加入", "chat.plan.seq": "「全部转为任务」会按顺序一个接一个做：前一个完成，下一个才开始。", "real.e.prevFailed": "前一步「{title}」没有完成",
    "td.cancel": "取消任务", "td.retry": "重试", "real.cancelling": "正在取消…", "real.e.cancelled": "已取消", "log.cancelled": "你取消了「{title}」", "log.retry": "你让 {a} 重试「{title}」", "chat.tag.question": "提问", "chat.waiting": "{name} 在等你的回答，回复后 TA 会继续干活", "chat.dm.noted": "已发送。要让员工回复，需要在桌面 App 里选好项目文件夹并连上 AI。", "chat.soon": "消息已记下。员工的回答功能还没接上。",
    "chat.started": "讨论开始 · {n} 位员工参与", "chat.tag.summary": "总结",
    "chat.plan.title": "讨论结论 · 建议任务", "chat.plan.all": "全部转为任务（{n}）", "chat.plan.more": "继续讨论",
    "chat.plan.note": "当前是「{mode}」模式，转成任务时会遵守这个模式。", "chat.plan.soon": "「转成任务」的功能稍后接入",
    "chat.dm.empty": "这里是和 {name} 的单聊。直接说你要问的或要做的，TA 会回答或动手；TA 有问题也会在这里问你。",
    "chat.sug.1": "我要计划做一个游戏", "chat.sug.2": "怎么把项目上线？", "chat.sug.3": "这个功能怎么测？",
    "set.sc.chat": "打开 / 关闭聊天",

    "real.thinking": "正在思考…（第 {step} 步，{source}）", "real.list": "正在查看文件夹 {path}", "real.read": "正在读 {path}", "real.write": "正在写 {path}",
    "real.switch": "{from} 出错，换下一个 AI", "real.run": "正在运行 {path}", "real.edit": "正在修改 {path}", "real.search": "正在搜索「{path}」",
    "td.ev.edit": "修改 {path}", "td.ev.search": "搜索「{path}」", "td.ev.remember": "记入项目笔记：{text}", "td.ev.decided": "判断结果：{text}",
    "brain.notes": "项目笔记", "brain.notes.none": "还没有笔记。员工会把重要的决定记在这里，之后的任务会自动读到。",
    "real.waiting.answer": "在等你回答问题…", "real.waiting.approve": "在等你批准…", "real.blocked": "停下了，没有继续做：{reason}",
    "log.realBlocked": "{a} 判断「{title}」不该继续做，已停下", "toast.blocked": "{a} 停下了，想让你看一下原因",
    "ask.kind.question": "有个问题想问你", "ask.kind.approve": "需要你批准", "ask.placeholder": "输入你的回答…（Ctrl+Enter 发送）",
    "ask.answer": "回答", "ask.skip": "不回答，让 TA 自己判断", "ask.allow": "允许", "ask.deny": "拒绝",
    "td.ev.ask.q": "问你：{text}\n你回答：{answer}", "td.ev.ask.q.none": "问你：{text}\n你没有回答，TA 自己做了判断",
    "real.ask.command": "想运行命令：\n{path}", "real.noOutputNoHandoff": "（这一步没有写出任何文件，所以没有交给下一位。）", "real.e.empty-reply": "AI 没有给出任何结果",
    "td.ev.run": "运行命令 {path}", "td.ev.deciding": "判断是否需要同事接着做", "td.ev.ran": "命令输出：{text}", "td.ev.ask.cmd.yes": "询问是否允许运行 {path} → 你同意了", "td.ev.ask.cmd.no": "询问是否允许运行 {path} → 你拒绝了",
    "set.conn": "连接器", "set.conn.note": "连接器让员工能用项目文件夹以外的工具，比如上网查资料、查最新的开发文档、操作浏览器或 Blender。选一个常用的，或者粘贴它说明文档里给的命令、网址或 JSON 配置。除了「完全访问」模式，每次使用前都会问你。",
    "set.conn.ph": "粘贴命令、网址或 JSON 配置", "set.conn.add": "添加", "set.conn.added": "已添加，正在连接。", "set.conn.empty": "还没有连接器。",
    "set.conn.p.pick": "选一个常用的…", "set.conn.p.fetch": "上网读网页", "set.conn.p.docs": "查开发文档（Context7）", "set.conn.p.browser": "操作浏览器（Playwright）", "set.conn.p.blender": "Blender",
    "set.conn.blenderNote": "Blender 这个连接器还需要在 Blender 里装上 blender-mcp 插件并点「Connect」，否则能连上但用不了。",
    "set.conn.s.ready": "已连接 · {n} 个工具", "set.conn.s.connecting": "连接中…第一次要下载程序，可能要一两分钟。", "set.conn.s.error": "没连上：{error}", "set.conn.s.off": "已停用",
    "set.conn.trust": "使用前不用问我", "set.conn.reconnect": "重新连接", "set.conn.tools": "查看 {n} 个工具", "set.conn.removeConfirm": "删除这个连接器？", "set.conn.secrets": "已加密保存的密钥：{names}",
    "set.conn.e.bad-input": "看不懂这段内容。请粘贴一条命令、一个网址，或完整的 JSON 配置。", "set.conn.e.bad-json": "JSON 配置的格式不对，请完整复制。", "set.conn.e.too-many": "连接器太多了，最多 12 个。",
    "set.conn.e.needs-login": "这个连接器要登录账号才能用，目前还不支持。", "set.conn.e.missing": "电脑上找不到启动它需要的程序。以 npx 开头的要先装 Node.js，以 uvx 开头的要先装 uv。", "set.conn.e.encryption-unavailable": "这台电脑没法加密保存密钥，所以没有添加。",
    "real.tool": "正在使用 {path}", "real.ask.tool": "想使用连接器：\n{path}", "td.ev.tool": "使用连接器 {path}", "td.ev.toolout": "返回：{text}",
    "td.ev.ask.tool.yes": "询问是否允许使用 {path} → 你同意了", "td.ev.ask.tool.no": "询问是否允许使用 {path} → 你拒绝了",
    "set.caps": "员工的权限", "set.caps.commands": "允许运行命令", "set.caps.note": "打开后，员工可以在项目文件夹里运行命令，比如跑测试、跑脚本。除了「完全访问」模式，每条命令运行前都会问你。明显危险的命令始终会被拦下。",
    "set.caps.blender": "检测到 Blender：允许运行命令后，员工可以用它的后台模式生成模型。", "real.ask.write": "想写入文件：\n{path}（{size} 个字符）",
    "real.done.files": "{summary}\n\n改动的文件：{files}", "real.done.nofiles": "（这次没有改动任何文件）", "real.failed": "没有完成：{error}",
    "real.e.no-project": "还没有选择项目文件夹（在设置里选）", "real.e.no-ai": "AI 池里没有可用的 AI", "real.e.all-sources-failed": "所有 AI 都调用失败（{detail}）",
    "real.e.too-many-steps": "步骤太多，已停止", "real.e.crash": "程序出错（{detail}）",
    "real.badge": "真实执行", "log.realFailed": "{a} 没能完成「{title}」：{error}",

    "td.title": "任务详情", "td.agent": "负责人", "td.ai": "使用的 AI", "td.status": "状态", "td.context": "上一位交接来的内容",
    "td.steps": "过程", "td.files": "写入的文件", "td.result": "结果", "td.view": "查看", "td.hide": "收起", "td.reveal": "在文件夹中显示", "td.process": "查看过程",
    "td.nosteps": "还没有开始。", "td.sim": "这个任务是模拟执行的，没有真实的过程记录。", "td.nofiles": "没有写入文件",
    "td.ev.thinking": "思考中（第 {step} 步，{source}）", "td.ev.list": "查看文件夹 {path}", "td.ev.read": "读取 {path}", "td.ev.write": "写入 {path}",
    "td.ev.say": "说：{text}", "td.ev.switch": "{from} 出错，换下一个 AI（{error}）", "td.ev.ask.yes": "询问是否允许写入 {path} → 你同意了",
    "td.ev.ask.no": "询问是否允许写入 {path} → 你拒绝了", "td.ev.denied": "没有执行：{path}（被拒绝或不允许）", "td.readfail": "读不了这个文件：{error}",

    "tb.min": "最小化", "tb.max": "最大化", "tb.close": "关闭",
  },

  en: {
    "nav.office": "Office", "nav.tasks": "Tasks", "nav.brain": "Brain", "nav.settings": "Settings",
    "nav.aria": "Views",
    "stat.doing": "Active", "stat.queued": "Queued", "stat.done": "Done",
    "hud.fullscreen": "Fullscreen", "hud.palette": "Command palette",
    "common.close": "Close", "common.none": "None",

    "mode.manual": "Manual", "mode.auto": "Auto", "mode.full": "Full access",
    "mode.manual.hint": "Every task needs your approval before it starts, including handoffs between teammates.",
    "mode.auto.hint": "Routine tasks start automatically; risky ones (deploy, release, delete) need your approval.",
    "mode.full.hint": "Everything runs automatically with no prompts. Use with care.",
    "mode.aria": "Permission mode",
    "reason.manual": "Manual mode", "reason.risky": "Risky action", "reason.handoff": "A teammate suggests this follow-up — needs your OK",

    "cmd.placeholder": "Assign a task to the team, e.g. review this PR for code quality",
    "cmd.agent": "Assignee", "cmd.auto": "Auto-assign",
    "cmd.handoff": "Allow handoff", "cmd.handoff.title": "Let agents suggest a follow-up for a teammate when needed (you approve it)", "cmd.send": "Assign",
    "ex.1": "Break the “user login” requirement into tasks and estimate", "ex.2": "Review this PR for code quality", "ex.3": "Why is the API returning 500 in production",
    "ex.4": "Add unit tests for the login module", "ex.5": "Write this week's status report", "ex.6": "Deploy with Docker and prepare a rollback plan",
    "hint.corner": "Drag to rotate · Scroll to zoom · Click an agent",

    "st.pending": "Pending", "st.queued": "Queued", "st.doing": "In progress", "st.done": "Done",
    "chip.idle": "IDLE", "chip.working": "WORKING", "chip.waiting": "PENDING", "chip.resting": "BREAK", "chip.returning": "BACK",
    "bubble.idle": "Waiting for tasks…", "bubble.waiting": "Waiting for your approval…", "bubble.returning": "Heading back to the desk…",
    "bubble.waiting2d": "“{title}” awaits your approval", "bubble.queued": " · {n} queued",

    "tasks.title": "Tasks", "tasks.board": "Board", "tasks.log": "Activity",
    "col.pending": "Pending approval", "col.active": "In progress", "col.done": "Completed",
    "board.approveAll": "Approve all", "board.approve": "Approve", "board.reject": "Reject",
    "board.needs": "Approval needed: {reason}",
    "log.empty": "No activity yet — assign a task to get started",

    "tpl.fromPlanner": "Design the UI and interactions for “{topic}”",
    "tpl.fromDesigner": "Implement “{topic}”",
    "tpl.fromDeveloper": "Write tests for “{topic}”",
    "tpl.fromDebugger": "Write regression tests for “{topic}”",
    "tpl.fromTester": "Review the changes and tests for “{topic}”",
    "tpl.fromReviewer": "Prepare the release and rollback plan for “{topic}”",
    "tpl.fromDevops": "Write release notes for “{topic}”",

    "log.assign": "You assigned “{title}” to {a}",
    "log.assignPending": "You assigned “{title}” to {a} — awaiting your approval ({reason})",
    "log.approved": "You approved “{title}”",
    "log.rejected": "You rejected “{title}”",
    "log.approvedAll": "You approved all pending tasks",
    "log.start": "{a} started “{title}”",
    "log.done": "{a} finished “{title}”",
    "log.handoff": "{a} handed off to {b}: “{title}”",
    "log.handoffPending": "{a} handed off to {b}: “{title}” (awaiting your approval: {reason})",
    "log.mode": "Permission mode set to “{mode}”",
    "log.cleared": "Cleared all tasks and activity",

    "toast.pending": "{a} needs your approval", "toast.view": "View", "toast.done": "{a} finished “{title}”",
    "notify.pending": "A task needs your approval",

    "team.count": "{n} agents",
    "brain.label": "Shared brain", "brain.labelSub": "{done} stored · {doing} active",

    "ap.title": "Agent", "ap.status": "Status", "ap.team": "Team", "ap.skills": "Skills", "ap.current": "Current task", "ap.none": "No active task",
    "ap.recent": "Recent results", "ap.noneRecent": "Nothing completed yet", "ap.assign": "Assign task", "ap.locate": "Locate", "ap.edit": "Edit",
    "ap.queue": "{n} more in the queue", "ap.close": "Close agent panel",

    "brain.title": "Shared brain", "brain.sub": "{n} results stored",
    "brain.search": "Search results…", "brain.all": "All",
    "brain.empty": "The brain is empty. Results are stored here when tasks finish.", "brain.noMatch": "No matching results",
    "brain.completed": "Completed", "brain.by": "Owner", "brain.chain": "Handoff chain", "brain.from": "From {a}: {title}", "brain.to": "Handed to {a}: {title}",
    "brain.summary": "Summary",

    "set.title": "Settings", "set.general": "General", "set.language": "Language", "set.mode": "Permission mode",
    "set.agents": "Agents", "set.name": "Name", "set.role": "Role", "set.color": "Color", "set.skills": "Skills (comma-separated)",
    "set.reset": "Reset", "set.agentsNote": "Changes apply immediately and are used in both languages.",
    "set.project": "Project folder", "set.project.none": "Not selected", "set.project.pick": "Choose folder",
    "set.project.note": "Agents can only read and write files inside this folder.", "set.project.web": "The project folder can only be chosen in the desktop app.",
    "set.ai": "AI pool", "set.ai.web": "AI can only be connected in the desktop app.",
    "set.ai.note": "Pick a provider, paste its API key and click Save — the rest is automatic. You can add several. Keys are stored encrypted on this computer and never shown.",
    "set.ai.empty": "No AI added yet. Pick a provider below, click Add, then paste its key.",
    "set.ai.advanced": "Advanced", "set.ai.scan.label": "Check-up", "set.ai.scan": "Test all models",
    "set.ai.scan.running": "Testing {done}/{total}…", "set.ai.scan.done": "Tested {tested} models, {count} usable. Agents pick from strongest to weakest automatically.", "set.ai.scan.none": "Not tested yet. After testing, agents only use models that actually work.", "set.ai.order": "Other", "set.ai.connect": "Connect",
    "set.ai.s.connected": "Connected and ready (model: {model})", "set.ai.s.trying": "Trying model {model}…", "set.ai.s.saved": "Configured (model: {model})", "set.ai.add": "Add", "set.ai.custom": "Custom (OpenAI-compatible)", "set.ai.local": "Local Ollama",
    "set.ai.name": "Name", "set.ai.url": "Endpoint", "set.ai.tier": "Use for", "set.ai.tier.strong": "Heavy (code, review)", "set.ai.tier.light": "Light (reports, tidy-up)",
    "set.ai.enabled": "Enabled", "set.ai.remove": "Remove", "set.ai.removeConfirm": "Remove this source and its key?", "set.ai.up": "Move up", "set.ai.down": "Move down",
    "set.ai.noKeyNeeded": "Local sources need no key", "set.ai.e.bad-url": "The endpoint must start with http:// or https://", "set.ai.e.ECONNREFUSED": "Cannot reach this address (is the service running?)", "set.ai.e.404": "None of the tried models worked. Open Advanced and pick a model manually",
    "set.ai.key": "API key", "set.ai.keyPh": "Paste the API key for this source", "set.ai.keySaved": "Saved (hidden)", "set.ai.save": "Save", "set.ai.clear": "Clear",
    "set.ai.model": "Model", "set.ai.load": "List available models", "set.ai.pick": "Choose a model", "set.ai.test": "Send a test message",
    "set.ai.s.nokey": "No API key yet", "set.ai.s.ready": "Key saved", "set.ai.s.env": "Using the key from the environment variable",
    "set.ai.s.loading": "Connecting…", "set.ai.s.models": "Found {n} models. This does not verify the key — pick a model and send a test message", "set.ai.s.testok": "Model replied: {text} ({ms} ms)",
    "set.ai.s.err": "Failed: {error}", "set.ai.e.no-key": "No API key yet", "set.ai.e.no-model": "No model selected", "set.ai.e.timeout": "Connection timed out",
    "set.ai.e.401": "The key is invalid or expired", "set.ai.e.403": "The key is invalid, or not allowed to use this model", "set.ai.e.429": "Rate limited or out of quota",
    "set.data": "Data", "set.export": "Export JSON", "set.clear": "Clear tasks & activity",
    "set.clearConfirm": "Clear all tasks and activity? Agent settings are kept.",
    "set.shortcuts": "Shortcuts", "set.sc.palette": "Open command palette", "set.sc.close": "Close panel", "set.sc.full": "Fullscreen",

    "pal.placeholder": "Type a command or a task…", "pal.dispatch": "Assign: {text}", "pal.goto": "Go to {page}",
    "pal.agent": "Open {name}", "pal.mode": "Permission mode: {mode}", "pal.lang": "Switch language / 切换语言",
    "pal.fullscreen": "Toggle fullscreen", "pal.noResults": "No matches", "pal.focus": "Focus camera on {name}", "pal.focusAll": "Reset camera",
    "map.aria": "Minimap", "map.all": "Overview",

    "hud.chat": "Chat", "ap.chat": "Chat", "pal.chat": "Open chat",
    "chat.title.group": "Office chat", "chat.online": "{n} agents online", "chat.group": "Group", "chat.min": "Minimize",
    "chat.placeholder": "Message, or @someone to ask them directly…", "chat.send": "Send",
    "chat.demo": "Sample conversation · raise a topic here and the team discusses it; @ someone to ask only them", "chat.working": "{name} is on it — the reply will appear here",
    "chat.talk.typing": "{name} is typing…", "chat.talk.stop": "Stop", "chat.talk.stopped": "Discussion stopped", "chat.talk.failed": "The discussion was interrupted: {error}", "chat.plan.added": "Added", "chat.plan.seq": "“Turn all into tasks” runs them in order: each starts when the previous one is done.", "real.e.prevFailed": "the previous step “{title}” did not complete",
    "td.cancel": "Cancel task", "td.retry": "Retry", "real.cancelling": "Cancelling…", "real.e.cancelled": "Cancelled", "log.cancelled": "You cancelled “{title}”", "log.retry": "You asked {a} to retry “{title}”", "chat.tag.question": "Question", "chat.waiting": "{name} is waiting for your answer and will continue once you reply", "chat.dm.noted": "Sent. For agents to reply, use the desktop app with a project folder and an AI connected.", "chat.soon": "Noted. Agent replies aren't wired up yet.",
    "chat.started": "Discussion started · {n} agents joined", "chat.tag.summary": "Summary",
    "chat.plan.title": "Conclusion · suggested tasks", "chat.plan.all": "Turn all into tasks ({n})", "chat.plan.more": "Keep discussing",
    "chat.plan.note": "Current mode is “{mode}” — new tasks will follow it.", "chat.plan.soon": "Turning suggestions into tasks comes later",
    "chat.dm.empty": "This is your direct chat with {name}. Ask or tell them what to do and they will answer or get to work; they will also ask you here when they have a question.",
    "chat.sug.1": "I want to plan a game", "chat.sug.2": "How do we ship this project?", "chat.sug.3": "How should we test this feature?",
    "set.sc.chat": "Open / close chat",

    "real.thinking": "Thinking… (step {step}, {source})", "real.list": "Looking at folder {path}", "real.read": "Reading {path}", "real.write": "Writing {path}",
    "real.switch": "{from} failed — switching to the next AI", "real.run": "Running {path}", "real.edit": "Editing {path}", "real.search": "Searching for “{path}”",
    "td.ev.edit": "Edited {path}", "td.ev.search": "Searched for “{path}”", "td.ev.remember": "Saved to project notes: {text}", "td.ev.decided": "Decision: {text}",
    "brain.notes": "Project notes", "brain.notes.none": "No notes yet. Agents record important decisions here, and later tasks read them automatically.",
    "real.waiting.answer": "Waiting for your answer…", "real.waiting.approve": "Waiting for your approval…", "real.blocked": "Stopped without continuing: {reason}",
    "log.realBlocked": "{a} judged that “{title}” should not continue and stopped", "toast.blocked": "{a} stopped and wants you to see why",
    "ask.kind.question": "has a question for you", "ask.kind.approve": "needs your approval", "ask.placeholder": "Type your answer… (Ctrl+Enter to send)",
    "ask.answer": "Answer", "ask.skip": "Skip — let them decide", "ask.allow": "Allow", "ask.deny": "Decline",
    "td.ev.ask.q": "Asked you: {text}\nYou answered: {answer}", "td.ev.ask.q.none": "Asked you: {text}\nYou did not answer, so they decided themselves",
    "real.ask.command": "Wants to run a command:\n{path}", "real.noOutputNoHandoff": "(This step wrote no files, so it was not handed to the next teammate.)", "real.e.empty-reply": "The AI returned nothing",
    "td.ev.run": "Ran command {path}", "td.ev.deciding": "Deciding whether a teammate needs to follow up", "td.ev.ran": "Output: {text}", "td.ev.ask.cmd.yes": "Asked to run {path} → you allowed it", "td.ev.ask.cmd.no": "Asked to run {path} → you declined",
    "set.conn": "Connectors", "set.conn.note": "Connectors let agents use tools outside the project folder, such as reading web pages, looking up current developer docs, or driving a browser or Blender. Pick a common one, or paste the command, URL or JSON config from its documentation. Except in Full access mode, you are asked before every use.",
    "set.conn.ph": "Paste a command, URL or JSON config", "set.conn.add": "Add", "set.conn.added": "Added, connecting now.", "set.conn.empty": "No connectors yet.",
    "set.conn.p.pick": "Pick a common one…", "set.conn.p.fetch": "Read web pages", "set.conn.p.docs": "Developer docs (Context7)", "set.conn.p.browser": "Drive a browser (Playwright)", "set.conn.p.blender": "Blender",
    "set.conn.blenderNote": "The Blender connector also needs the blender-mcp add-on installed in Blender with “Connect” clicked; otherwise it connects but cannot do anything.",
    "set.conn.s.ready": "Connected · {n} tools", "set.conn.s.connecting": "Connecting… the first time it downloads the program, which can take a minute or two.", "set.conn.s.error": "Not connected: {error}", "set.conn.s.off": "Turned off",
    "set.conn.trust": "Don't ask before use", "set.conn.reconnect": "Reconnect", "set.conn.tools": "Show {n} tools", "set.conn.removeConfirm": "Remove this connector?", "set.conn.secrets": "Secrets stored encrypted: {names}",
    "set.conn.e.bad-input": "Could not understand this. Paste one command, one URL, or a complete JSON config.", "set.conn.e.bad-json": "The JSON config is not valid. Copy it in full.", "set.conn.e.too-many": "Too many connectors; the limit is 12.",
    "set.conn.e.needs-login": "This connector needs an account login, which is not supported yet.", "set.conn.e.missing": "The program needed to start it was not found. Commands starting with npx need Node.js; those starting with uvx need uv.", "set.conn.e.encryption-unavailable": "This computer cannot store secrets encrypted, so nothing was added.",
    "real.tool": "Using {path}", "real.ask.tool": "Wants to use a connector:\n{path}", "td.ev.tool": "Used connector {path}", "td.ev.toolout": "Returned: {text}",
    "td.ev.ask.tool.yes": "Asked to use {path} → you allowed it", "td.ev.ask.tool.no": "Asked to use {path} → you declined",
    "set.caps": "Agent permissions", "set.caps.commands": "Allow running commands", "set.caps.note": "When on, agents can run commands inside the project folder, such as tests and scripts. Except in Full access mode, you are asked before every command. Clearly dangerous commands are always blocked.",
    "set.caps.blender": "Blender detected: once commands are allowed, agents can use its background mode to generate models.", "real.ask.write": "Wants to write a file:\n{path} ({size} chars)",
    "real.done.files": "{summary}\n\nFiles changed: {files}", "real.done.nofiles": "(No files were changed this time)", "real.failed": "Not completed: {error}",
    "real.e.no-project": "No project folder selected (choose one in Settings)", "real.e.no-ai": "No usable AI in the pool", "real.e.all-sources-failed": "Every AI call failed ({detail})",
    "real.e.too-many-steps": "Too many steps — stopped", "real.e.crash": "Internal error ({detail})",
    "real.badge": "Real run", "log.realFailed": "{a} could not finish “{title}”: {error}",

    "td.title": "Task detail", "td.agent": "Owner", "td.ai": "AI used", "td.status": "Status", "td.context": "Handoff from the previous teammate",
    "td.steps": "Process", "td.files": "Files written", "td.result": "Result", "td.view": "View", "td.hide": "Hide", "td.reveal": "Show in folder", "td.process": "View process",
    "td.nosteps": "Not started yet.", "td.sim": "This task was simulated, so there is no real process log.", "td.nofiles": "No files written",
    "td.ev.thinking": "Thinking (step {step}, {source})", "td.ev.list": "Listed folder {path}", "td.ev.read": "Read {path}", "td.ev.write": "Wrote {path}",
    "td.ev.say": "Said: {text}", "td.ev.switch": "{from} failed — switched to the next AI ({error})", "td.ev.ask.yes": "Asked to write {path} → you allowed it",
    "td.ev.ask.no": "Asked to write {path} → you declined", "td.ev.denied": "Not done: {path} (declined or not allowed)", "td.readfail": "Cannot read this file: {error}",

    "tb.min": "Minimize", "tb.max": "Maximize", "tb.close": "Close",
  },
};

let LANG = "zh";

function t(key, vars) {
  let s = I18N[LANG][key];
  if (s === undefined) s = I18N.zh[key];
  if (s === undefined) return key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? "" : vars[k])) : s;
}

function setLang(l) {
  if (!I18N[l]) return;
  LANG = l;
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
  applyI18n();
}

// 刷新页面上所有静态文字
function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(e => { e.textContent = t(e.dataset.i18n); });
  root.querySelectorAll("[data-i18n-ph]").forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
  root.querySelectorAll("[data-i18n-title]").forEach(e => {
    const s = t(e.dataset.i18nTitle);
    e.title = s;
    e.setAttribute("aria-label", s);
  });
}
