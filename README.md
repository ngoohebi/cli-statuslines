# cli-statuslines

A statusline dashboard for AI coding CLIs. One unified visual design, three supported targets:

- **Claude Code** (Anthropic)
- **Antigravity** (Google)
- **Codex** (OpenAI)

### Examples

Same renderer, same theme — rows self-skip when an adapter doesn't expose that data.

**Claude Code** — full feature set: quota bars, agents, memory, edited files, message history.

```
╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┬──────────────────────────────────────────╮
│ session refactor statusline + per-CLI adapters                                                                    │                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                          │
│ Claude Code 2.1.147  Opus 4.7  effort high  · 23min                                                              │                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                          │
│ context ██████░░░░ 62%  ·  compact 2 times  ·  tokens 10.6M · 6.3M (session)  ·  cost $3.16 · $2.84 (session)    │                                          │
│ 5h-quota █████░░░░░ 54% resets 1h12m     ·     7d-quota ███░░░░░░░ 31% resets 3d4h                                │                                          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤                                          │
│ agents  Explore ○  critic ✓×3 4m ago  feature-dev ✓ 8m ago                                                       │ ▶ table line brighter                    │
│ memory global · project · 2 rules                                                                                │ ◀ border bumped from 236 to 244          │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤ ▶ remove mcp info                        │
│ edited  src/lib/theme.js → src/lib/layout-builders.js → src/lib/renderer.js                                      │ ◀ stripped the row, kept infra intact    │
│ ngoohebi/cli-statuslines main (3 changed)  ·  +432 -87 lines                                                     │                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┴──────────────────────────────────────────╯
```

**Antigravity** — quota and memory rows self-skip (`features.rateLimits = false`, `features.memory = false`).

```
╭──────────────────────────────────────────────────────────────────────────────────────────────╮
│ session debug normalize() schema for real Antigravity payloads                               │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Antigravity 0.4.2  Gemini 2.5 Pro  · 14min                                                   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ context ██░░░░░░░░ 18%  ·  tokens 4.2M · 1.8M (session)  ·  cost $0.42 · $0.42 (session)    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ edited  src/adapters/antigravity.js → src/adapters/_layout.js                                │
│ ngoohebi/cli-statuslines feat/ag-payload (5 changed)  ·  +80 -12 lines                       │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

**Codex** — same shape as Antigravity; context bar shifts to the mid hue once usage crosses 50%.

```
╭───────────────────────────────────────────────────────────────────────────────────────────╮
│ session wire Codex rate-limit normalization                                               │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ Codex 0.18.0  GPT-5 Codex  · 8min                                                        │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ context █████░░░░░ 52%  ·  tokens 8.1M · 3.4M (session)  ·  cost $0.88 · $0.88 (session) │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ edited  src/adapters/codex.js                                                             │
│ ngoohebi/cli-statuslines main  ·  +120 -24 lines                                          │
╰───────────────────────────────────────────────────────────────────────────────────────────╯
```

## Visual design

### Sectioned layout

Rows are grouped into four sections separated by box-dividers; rows within a section flow as a single visual block:

1. **Identity** — CLI name + version + model + effort + duration
2. **Usage** — context / compact / tokens / cost + rate-limit quotas
3. **Tools** — agents + memory loading
4. **Footer** — recently edited files + git repo line

Rows whose data is absent self-skip; entire sections collapse cleanly when nothing inside them has data.

### "Abyss" dark palette

All accents sit in the deep 24-130 range of the 256-color palette. Chrome uses the 234-240 grey ramp. Nothing in the palette glows — everything recedes into a dark terminal so warnings stand out.

| Color | Data type |
|---|---|
| `24` deep teal-blue | workspace glyph |
| `60` deep slate | directory, vendor tag, user message arrow |
| `91` deep purple | model name |
| `65` dark sage | repo name, positive values (cost, memory ✓, added) |
| `95` dark mauve | git branch, removed lines |
| `130` dark gold | warning band (50-79% bars), running agents, high-effort tag |
| `88` deep red | error band (≥80% bars), max-effort tag |
| `244` medium grey | box borders, divider lines |
| `240` dark grey | label words (`tokens`, `ctx`, ...) |
| `234` nearly black | bar empty cells |

### Bar palettes — warm vs. cool

Quota and context both use percentage thresholds, but with different hue families so they read distinctly at a glance:

| Band | Quota (warm) | Context (cool) |
|---|---|---|
| Low (<50%) | `65` dark sage | `24` deep teal-blue |
| Mid (50-79%) | `130` dark gold | `60` deep slate |
| High (≥80%) | `88` deep red | `91` deep purple |

Theme tokens live in `src/lib/theme.js#COLORS` — edit one file to restyle everything.

## Responsive box

Box width is driven by content. Configure a fixed width per-target with `cli-statuslines config <target> width <columns>`. Set `statuslineWidth: 0` (default `auto-detect`) and the terminal's columns will be picked up via `process.stdout.columns` / `$COLUMNS`. Set `statuslineWidthOffset` to subtract padding for parent UI chrome.

## Features

- Session summary (auto-updated every N user messages)
- Cumulative cost / tokens / lines per session and aggregate
- Active session time (turn-bounded, not wall-clock)
- Context window % + compact count
- Rate-limit usage with countdown (5h / 7d for Claude Code; per-tool labels)
- Git repo + branch + dirty count + +N/-M line deltas
- Subagent activity (running / completed / latest finish)
- Memory load detection (CLAUDE.md, .claude/rules — Claude Code only)
- Recently edited files
- Live message history in the right column
- **CLI version detection** — Claude Code reads `CLAUDE_CODE_EXECPATH`; Antigravity and Codex use env-var / file-based best-effort

A row hides automatically when the underlying data isn't available on a given target.

## Install

```bash
node bin/cli-statuslines.js install claude-code [--refresh=<seconds>]
node bin/cli-statuslines.js install antigravity
node bin/cli-statuslines.js install codex
node bin/cli-statuslines.js install all      # all three at once
```

The installer writes to the target's settings file (preserving unrelated hooks) and creates the state directory:

| Target | Settings | State dir |
|---|---|---|
| `claude-code` | `~/.claude/settings.json` | `~/.claude/cli-statuslines/` |
| `antigravity` | `~/.gemini/antigravity-cli/settings.json` (or `~/.antigravity/`) | `<AG_HOME>/cli-statuslines/` |
| `codex` | `~/.codex/settings.json` | `~/.codex/cli-statuslines/` |

Override Antigravity / Codex paths via env vars if the install lives elsewhere:
```bash
ANTIGRAVITY_HOME=~/.config/antigravity node bin/cli-statuslines.js install antigravity
CODEX_HOME=~/.config/codex             node bin/cli-statuslines.js install codex
```

Individual overrides: `AG_SETTINGS_PATH` / `AG_STATE_DIR` / `AG_CONFIG_PATH` / `AG_RL_SNAPSHOT_PATH` (and the `CODEX_*` equivalents).

Restart the affected tool after install.

## Uninstall

```bash
node bin/cli-statuslines.js uninstall <target>
node bin/cli-statuslines.js uninstall all
```

Removes the statusline command and only the hooks this project installed (matched by absolute path). State files are preserved — delete the state dir manually for a clean slate.

## Configuration

Per-target configuration at `<adapter.configPath>`:

```bash
cli-statuslines config <target> show
cli-statuslines config <target> refresh <seconds>
cli-statuslines config <target> enable|disable <row>
cli-statuslines config <target> width <columns>
cli-statuslines config <target> window <days>      # cost aggregation window
```

The target argument is optional and defaults to the auto-detected current CLI (from `CLAUDECODE` / `ANTIGRAVITY` / `CODEX` env vars).

### Row keys

`summary`, `dir`, `repo`, `model`, `duration`, `cost`, `usage`, `quota`, `agents`, `memory_mcp`, `edited`, `history`

Note: the dashboard layout currently doesn't render `dir` separately (the workspace folder name was dropped to avoid duplication with the git footer). The toggle is preserved for forward compatibility.

## Inspecting state

```bash
cli-statuslines status              # current CLI (env-detected)
cli-statuslines status <target>     # specific target
cli-statuslines status all          # all three side-by-side
cli-statuslines audit <target>      # last 20 cost movements
cli-statuslines reset <target> all  # clear all session state
```

`status` is grouped into three blocks: **Installation**, **Sessions** (tracked count, total cost, total tokens, last active), and **Available data** (✓/✗ feature table for that target).

## Architecture

```
bin/
  cli-statuslines.js          CLI: install / config / status / audit / reset
src/
  statusline.js               Main entry — invoked on every refresh
  adapters/
    index.js                  SUPPORTED + getAdapter + detectCurrentCli
    _layout.js                Shared section-based layout assembler
    claude-code.js            Anthropic adapter
    antigravity.js            Google adapter
    codex.js                  OpenAI adapter
  lib/
    theme.js                  Unified theme — Abyss palette + box-drawing chars
    layout-builders.js        Row builders (modelCell, usageRow, ...)
    renderer.js               Box-drawer; `null` rows = section dividers
    atoms.js                  Atomic write + CAS merge
    state.js                  State directory helpers
    config.js                 Row visibility + width config
    unicode.js                East Asian width / truncate / pad
    format.js                 Duration / token / bar formatters + colorByPct
    git.js                    Branch + dirty count + repo name (remote or path-derived)
    rate-limits.js            Cross-session quota aggregation
    cumulative.js             Cost / token tracking + audit log
  hooks/
    file-tracker.js           PostToolUse (Write|Edit)
    message-tracker.js        UserPromptSubmit + Stop
    compact-monitor.js        PreCompact
    active-time.js            UserPromptSubmit + Stop
    subagent.js               SubagentStart + SubagentStop
    summary.js                UserPromptSubmit (every N messages)
    mcp-refresh.js            Background MCP server list refresh (infra only, not displayed)
```

Zero npm dependencies. Pure Node ≥18. No build step.

### Adapter contract

Each adapter (`src/adapters/<name>.js`) exposes:

```js
{
  name, displayName, vendor,
  stateDir, settingsPath, configPath, rateLimitSnapshotPath,
  features,                            // {cost, rateLimits, memory, ...} bools
  deriveSessionId(payload) → string,
  detectVersion() → string | null,     // best-effort CLI version detection
  normalize(payload) → canonical,
  installHookDefs(hooksDir, statuslinePath) → { statusLine, hooks },
  buildLayout(ctx) → { summary, fullLeftRows, formattedMsgs },
}
```

All three adapters delegate `buildLayout` to `src/adapters/_layout.js` for a shared sectioned layout. Adding a fourth target = one new file in `src/adapters/`, add the name to `SUPPORTED` in `src/adapters/index.js`. No other changes.

### Canonical schema

What `adapter.normalize(payload)` produces:

```
toolName, sessionId, sessionName, modelName, cwd, transcriptPath,
contextUsedPct, contextInputTokens, contextOutputTokens,
totalCostUsd, totalDurationMs, totalLinesAdded, totalLinesRemoved,
rateLimits: { shortWindow|null, longWindow|null },   // each {usedPct, resetsAt, periodSec, label}
hookEventName, toolInput, prompt, agentType, agentId,
rawPayload,
```

Null fields cause matching builders to self-skip.

### Section-based renderer

`src/lib/renderer.js` accepts a `fullLeftRows` array where:
- A **string** entry renders as a content row.
- A **`null`** entry renders as a section divider (`├───┤`).

`src/adapters/_layout.js` constructs the rows with explicit `null` entries between sections, producing the four-band layout shown above.

### Hook event mapping

| Event | Hook |
|---|---|
| `PostToolUse` (Write\|Edit) | `file-tracker.js` |
| `PreCompact` | `compact-monitor.js` |
| `Stop` | `message-tracker.js`, `active-time.js` |
| `SubagentStart` | `subagent.js` |
| `SubagentStop` | `subagent.js` |
| `UserPromptSubmit` | `message-tracker.js`, `summary.js`, `active-time.js` |

All three adapters install the same hook events. If a target uses different names, only its `installHookDefs` changes.

### Hook command convention

Installed hook commands always include `--tool=<name>` so each hook process knows which adapter to load:

```
node /abs/path/src/hooks/file-tracker.js --tool=claude-code
```

The installer is idempotent and filters its own hooks by absolute path — it never disturbs unrelated hooks the user has configured.

## State files

Per-session state under `<adapter.stateDir>`, keyed by a 24-char session ID derived from the transcript filename:

- `cum-<sid>.json` — cumulative cost / duration / tokens / lines (+ `.bak.json` snapshot)
- `active-<sid>.json` — turn-bounded active time
- `agents-<sid>.json` — subagent registry
- `files-<sid>.json` — recently edited files
- `msgs-<sid>.json` — message history
- `compacts-<sid>.json` — context compact count
- `summary-<sid>.txt` — session summary
- `audit.log` — append-only cost movements
- `mcp-status-cache.json` — MCP server status cache (infra only, not displayed)
- `rate-limit-snapshots.json` — cross-session quota aggregation
