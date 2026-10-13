# OrbitOffice

**A 3D office for your AI team.** Describe the work, and a team of AI agents plans it, does it, checks each other's work and hands it on — writing real files in a folder you choose. You watch them at their desks, chat with them, and approve what matters.

It ships with a ready-made software team, but the team is just a set of Markdown files: write your own agents and offices for content, marketing, research or anything else that produces text.

[中文说明](README.zh-CN.md)

## What it does

- **Real work, not a demo.** Agents list, search, read, edit and write files in your working folder. With your permission they can also run commands (tests, scripts) and use external tools through MCP connectors.
- **Up-to-date information.** Agents search the web and read pages (DuckDuckGo, no key) for news, trends, prices and current docs, and cite their sources. Requires [uv](https://docs.astral.sh/uv/) on the computer.
- **A team that checks itself.** Agents decide whether a teammate needs to continue, send flawed work back, and stop and say so when a task can't or shouldn't be done. Every handoff can require your approval.
- **Build your own office.** Each agent is a `.md` file: settings at the top, the job description below. Add, edit, import or drag in agents and offices — or describe what you need in one sentence and let the AI draft the whole office.
- **Skills.** The brain holds the team's shared know-how as skills (same `SKILL.md` format as Claude skills, so shared skills import as they are). Agents see only each skill's name and description, and read the full skill when a task calls for it.
- **Group discussion.** Raise a topic in the group chat; several agents discuss it from their own roles, then the lead sums up and proposes tasks you can start in order with one click.
- **Project memory.** Every finished piece of work is recorded in the project folder. Before a new task, agents look up related earlier work and read the team's shared notes, which are summarized automatically when they grow long.
- **Free AI pool.** Add API keys from several providers (Google Gemini, NVIDIA NIM, Groq, OpenRouter, a local Ollama, or any OpenAI-compatible endpoint). OrbitOffice tests every model, uses the strongest for real work and lighter ones for chat, and switches automatically when a quota runs out.
- **Built-in local AI.** No key and no internet needed: OrbitOffice checks your GPU, RAM and disk, recommends an open model (Qwen3.5, 2B to 35B) that runs well on your machine, and downloads and runs it in one click. No Ollama required.
- **You stay in control.** Three permission modes (Manual, Auto, Full access), per-role write limits, a block list for dangerous commands, and approval prompts before anything risky. Keys are stored encrypted on your computer and never shown in full.

## Getting started

1. Download the latest release for Windows and run the installer.
2. Open **Settings → AI pool**. Either enable **Local AI** (one click, runs on your computer), or pick a provider and paste its API key. Free keys work:
   - Google Gemini — <https://aistudio.google.com/apikey>
   - NVIDIA NIM — <https://build.nvidia.com>
   - Groq — <https://console.groq.com/keys>
3. In **Settings → Project folder**, choose the folder the team should work in.
4. Type a task in the bar at the bottom, for example *"Plan and build a to-do list web page"*, or open the chat and raise a topic.

Click any agent or task to see exactly what happened: every file read or written, every command, every handoff, and how many tokens it used.

## Writing an agent

Agents live in `%APPDATA%/OrbitOffice/office/agents/` (`%APPDATA%/myaioffice/...` if you used an early version) (Settings → Offices & agents → Open folder). A minimal agent:

```markdown
---
name: Copywriter
role: Social media copy
team: content
color: "#f472b6"
skills: [hooks, captions, hashtags]
keywords: [caption, copy, post, hashtag]
writes: [drafts/]
---

You turn a topic into a ready-to-post Instagram caption.
Write it to drafts/<date>-<topic>.md with a hook line, three short paragraphs and 5-8 hashtags.
Avoid exaggerated claims. If the brand or audience is unclear, ask the user one question first.
When you are done, hand off to the reviewer.
```

Optional settings:

| Setting | Meaning |
|---|---|
| `writes` | Files the agent may change, gitignore-style (`docs/`, `*.md`). Omit to allow the whole folder. |
| `order` | Desk position within the office (1 = first). |
| `auto-assign: false` | Only gets tasks that name it explicitly. |
| `send-results-to` / `send-task` | Always hand results to this teammate, with this task. |
| `recheck-by` / `recheck-task` | After a fix this agent asked for is done, this teammate rechecks it once. |
| `needs-approval: true` | Its tasks wait for your approval in Auto mode. |
| `lead: true` | Hosts group discussions and sums them up. |
| `local-only: true` | May only touch this computer; commands reaching other hosts are blocked. |
| `look` / `hair` | 3D accessories (`glasses`, `headset`, `cap`, `tie`) and hair color. |

Put reference material (style guides, product notes) as `.md` files in `agents/<id>/`, or drop them onto the agent in Settings; the agent reads them while working.

Agents imported from someone else are marked as external: whatever the permission mode, they must ask before running a command or using a connector.

## Building from source

Requires Node.js 18+ and Windows (the app itself is Electron, so macOS and Linux builds are possible but untested).

```bash
npm install
npm start                  # run in development
npm run dist              # build the installer in dist/installer/
npm run portable          # or a portable folder in dist/<name>/
```

3D models are generated with Blender from `tools/blender/build_models.py`, then packed with `node tools/pack-models.js`.

## Limitations

- The quality of the work depends on the models you connect. Free models are capable but not top-tier; long multi-agent chains are where they slip most.
- Agents work through text files, commands and connectors only. They cannot click through apps or websites, post to social media or create images.
- Connectors that need an OAuth login are not supported yet.
- The installer is not code-signed yet, so Windows SmartScreen shows a warning the first time (More info → Run anyway).
- Local AI is much weaker than the big cloud models; small local models in particular struggle with long multi-step tasks.
- The command guard for the security tester blocks obvious network access, but it is a guardrail, not a sandbox. Keep Manual or Auto mode when running untrusted agents.

## License

To be decided before the first public release.
