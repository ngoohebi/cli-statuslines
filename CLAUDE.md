# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A statusline dashboard for AI coding CLIs. Three supported targets — Claude Code (Anthropic), Antigravity (Google), Codex (OpenAI) — share **one** unified visual design and **one** renderer. Per-CLI differences live entirely in the adapter layer (paths, payload normalization, feature flags, version detection). There are no per-CLI themes; colors carry semantic meaning by data type, not by vendor.

Zero npm dependencies. Pure Node ≥18. No build step.

## Commands

```bash
# Install / uninstall — per target. Use 'all' to apply to every supported CLI.
node bin/cli-statuslines.js install claude-code [--refresh=<seconds>]
node bin/cli-statuslines.js install antigravity
node bin/cli-statuslines.js install codex
node bin/cli-statuslines.js install all
node bin/cli-statuslines.js uninstall <target | all>

# Per-target config
node bin/cli-statuslines.js config <target> show
node bin/cli-statuslines.js config <target> refresh <seconds>
node bin/cli-statuslines.js config <target> enable|disable <row>
node bin/cli-statuslines.js config <target> width <columns>

# Status — defaults to the env-detected current CLI
node bin/cli-statuslines.js status
node bin/cli-statuslines.js status all
node bin/cli-statuslines.js audit <target>

# Manual smoke-test (Claude Code path; env-detect picks --tool automatically)
echo '{"session_id":"test","model":{"display_name":"Claude Opus 4.6"},"cost":{"total_cost_usd":1.25,"total_lines_added":150,"total_lines_removed":30},"context_window":{"used_percentage":35,"total_input_tokens":50000,"total_output_tokens":10000},"rate_limits":{"five_hour":{"used_percentage":20,"resets_at":9999999999},"seven_day":{"used_percentage":5,"resets_at":9999999999}},"cwd":"/tmp"}' \
  | node src/statusline.js --tool=claude-code

# Antigravity smoke-test with env-overridden paths (don't touch the real install)
AG_STATE_DIR=/tmp/ag-test AG_SETTINGS_PATH=/tmp/ag-settings.json \
  AG_CONFIG_PATH=/tmp/ag-cfg.json AG_MCP_CACHE_PATH=/tmp/ag-mcp.json \
  AG_RL_SNAPSHOT_PATH=/tmp/ag-rl.json \
  bash -c 'echo "{\"session_id\":\"test\",\"model\":{\"name\":\"Gemini\"},\"cwd\":\"/tmp\"}" | node src/statusline.js --tool=antigravity'

# Manual hook smoke-test
echo '{"hook_event_name":"UserPromptSubmit","session_id":"test","prompt":"hello"}' \
  | node src/hooks/message-tracker.js --tool=claude-code
```

No test framework. Verify changes by piping mock payloads through `src/statusline.js` and each `src/hooks/*.js`, then inspecting stdout and state files at `<adapter.stateDir>`.

## Architecture

### The adapter layer is the only thing that differs between CLIs

Every entry point (`src/statusline.js`, each `src/hooks/*.js`, `bin/cli-statuslines.js`) starts with `getAdapterFromArgv()`, which parses `--tool=<name>` (env fallbacks: `STATUSLINE_TOOL`, then `CLAUDECODE` / `ANTIGRAVITY` / `CODEX` to auto-detect). Each adapter exposes:

- `name`, `displayName`, `vendor`
- `stateDir`, `settingsPath`, `configPath`, `mcpCachePath`, `rateLimitSnapshotPath`
- `features` — flags drive `status`'s availability table and let builders self-skip
- `deriveSessionId(payload)` — 24-char string keyed off the transcript UUID
- `detectVersion()` — best-effort CLI version: Claude Code reads `CLAUDE_CODE_EXECPATH`; Antigravity and Codex try `*_VERSION` env vars then `AI_AGENT` regex then a `VERSION` file
- `normalize(payload)` — produces the canonical schema (the shape every downstream consumer sees)
- `installHookDefs(hooksDir, statuslinePath)` — the JSON the installer merges into the target's settings
- `buildLayout(ctx)` → `{ summary, fullLeftRows, formattedMsgs }`

All three adapters delegate `buildLayout` to **`src/adapters/_layout.js`** for a shared sectioned layout. The architecture allows divergence if a target's layout ever needs to differ, but today there's no reason to.

To add a fourth target: one new file in `src/adapters/`, add the name to `SUPPORTED` in `src/adapters/index.js`, write its env-detection branch in `detectCurrentCli()`. Nothing else changes.

### Canonical schema

```
toolName, sessionId, sessionName, modelName, cwd, transcriptPath,
contextUsedPct, contextInputTokens, contextOutputTokens,
totalCostUsd, totalDurationMs, totalLinesAdded, totalLinesRemoved,
rateLimits: { shortWindow|null, longWindow|null },   // each {usedPct, resetsAt, periodSec, label}
hookEventName, toolInput, prompt, agentType, agentId,
rawPayload,
```

A field that's null/0/missing causes the matching builder to self-skip in `src/lib/layout-builders.js`. That's how AG (with `features.cost = false`, `features.rateLimits = false`) renders a shorter dashboard than Claude Code without per-adapter layout code.

### Sectioned layout

`src/adapters/_layout.js` assembles four visual sections separated by `null` divider entries:

1. **Identity** — `modelCell` (CLI name + version + model + effort + duration). The workspace folder name was deliberately dropped to avoid duplication with the git footer.
2. **Usage** — `usageRow` (context · compact · tokens · cost) + `quotaRow` (5h + 7d quota).
3. **Tools** — `agentsRow` (agents inline with MCP count) + `memoryMcpRow` (memory-only now, MCP moved into the agents row).
4. **Footer** — `editedRow` + `repoRow` (git remote name + branch + dirty count + line deltas, all in one row at the bottom).

Rows whose data is absent return `''`; sections with no content are skipped along with their leading divider.

### Renderer's `null` row convention

`src/lib/renderer.js` accepts `fullLeftRows` where:
- A **string** entry renders as a `│ content │` row.
- A **`null`** entry renders as a section divider (`├───┤`).

This replaced the older auto-divider-between-every-row behavior. Section-based grouping reduces visual noise: rows in the same section flow together.

### Theme + colors by data type

`src/lib/theme.js` exports `THEME` (box characters, glyph, bar chars, divider) and a `COLORS` object mapping semantic keys (`border`, `label`, `glyph`, `dir`, `vendor`, `model`, `repo`, `branch`, `positive`, `negative`, `warn`, `error`, `barLow/Mid/High`, `ctxBarLow/Mid/High`, `barEmpty`, message arrows, effort tiers, agent states) to 256-color escape sequences.

Current palette is **"Abyss"** — all accents sit in the deep 24-130 range; chrome lives in 234-240. Designed for dark terminals; nothing in the palette glows. To restyle the whole project: edit `COLORS` in one file. Do not reintroduce per-CLI palettes — colors are determined by **data type**, never by vendor.

### Three execution surfaces

1. **`src/statusline.js`** — invoked on every refresh tick (default 20s). Reads payload on stdin, normalizes via adapter, builds layout, renders. Must be fast.
2. **`src/hooks/*.js`** — invoked on tool events. Each reads stdin, mutates state files atomically, and **MUST write the input back to stdout unchanged** (hooks chain via stdout). Exception: `summary.js` may replace stdout with a `hookSpecificOutput` JSON envelope to inject context.
3. **`bin/cli-statuslines.js`** — user-invoked CLI. Edits the target's settings file via `adapter.installHookDefs()`.

### Hook command convention

Installed hook commands always include `--tool=<name>`:
`node /abs/path/src/hooks/file-tracker.js --tool=claude-code`. This is how each hook process knows which adapter to load — no runtime payload sniffing. The installer writes both the `--tool` argument and the absolute path; uninstall filters by absolute path so it never disturbs other hooks the user has configured.

### Shared state model

State lives under `<adapter.stateDir>` — not in this repo. Files keyed by a 24-char session ID from the transcript UUID, NOT raw `session_id` (which can drift). All writes go through `atomicWrite` or `casMerge` in `src/lib/atoms.js`. **A `mutate()` returning `null` from `casMerge` means "dedup-reject, do NOT write"** — used by `message-tracker.js` to skip duplicate entries. Treating null as "write it" silently corrupts state files.

### Cumulative tracking invariant

`src/lib/cumulative.js` tracks values that monotonically increase across a session even though the CLI can RESET payload values mid-session (context compact, auto-recovery). Pattern: `step = max(0, cur - base)`; accumulate the step; rebaseline `base`. **Only `statusline.js` writes `cum-<sid>.json`** — hooks must never touch this file or they will partial-overwrite and zero out the totals. Hooks use per-feature state files (`active-<sid>.json`, `msgs-<sid>.json`, etc.).

### Git info — remote vs path-derived

`src/lib/git.js` returns `repoName` as `owner/repo` parsed from `git remote get-url origin`. If no remote is configured, it falls back to `<parent-dir>/<repo-basename>` of the git toplevel — so a repo at `/Users/x/.../ngoohebi/cli-status-lines` reads as `ngoohebi/cli-status-lines` even without a remote. The git footer row leads with `repoName`, followed by branch + dirty count + `+N -M lines`.

### Bar palette — warm vs cool

`format.js` exports two `colorByPct()` variants:
- `colorByPct(pct)` — warm family (sage → gold → red) used by quota bars
- `ctxColorByPct(pct)` — cool family (teal-blue → slate → purple) used by the context bar

Same percentage thresholds, different hue family, so context and quota read distinctly at a glance even at the same percentage.

### Cross-session rate-limit aggregation

Rate-limit usage is GLOBAL to the user's account but each session only sees its own latest observation. `src/lib/rate-limits.js` shares snapshots via `<adapter.rateLimitSnapshotPath>` and reports MAX across sessions whose `resets_at` falls in the live window. Sanity caps any `resets_at` more than 8 days in the future as malformed.

### Unicode width

`src/lib/unicode.js` implements UAX #11 East Asian Width plus common emoji ranges. CJK + most emoji = width-2; everything else width-1. Every padding / truncation / fit calculation in the renderer goes through `displayWidth` — never `.length`. A new builder mixing CJK and ASCII without using `displayWidth` will misalign.

## When modifying hooks

- Preserve stdout pass-through. Forgetting `process.stdout.write(d)` silently breaks downstream hooks in the same event chain.
- Call `getAdapterFromArgv()` and operate on `adapter.normalize(payload)` — never read raw payload fields like `tool_input.file_path` directly.
- Wrap state writes in `atomicWrite` or `casMerge`. Never `fs.writeFileSync` raw on state files.
- For transcript JSONL: read only the tail (see `message-tracker.js` and `summary.js`). Full reads on a long session can be 100MB+ and stall the hook.

## When modifying the installer

`bin/cli-statuslines.js#installForTarget` mutates the target's settings file. `isOurHook` identifies hooks by absolute path match. The installer is idempotent: running install twice filters out old entries before re-adding. Don't break this. Don't wipe events wholesale — `settings.hooks[event].filter(...)` preserves unrelated hooks the user has configured.

## When modifying the visual design

- **Theme tokens** (border characters, glyph, bar chars, divider, colors) live in `src/lib/theme.js`. Edit there to restyle.
- **Row builders** (`modelCell`, `usageRow`, `quotaRow`, `agentsRow`, `memoryMcpRow`, `editedRow`, `repoRow`, `summaryText`, `formatMessages`) live in `src/lib/layout-builders.js`. They consume the ctx prepared in `src/statusline.js` and the theme colors.
- **Section composition** lives in `src/adapters/_layout.js`. To add or reorder sections, edit the `pushSection` calls there.
- **The renderer is pure box-drawing** — `src/lib/renderer.js` doesn't normalize data, derive widths, or pack fragments. Everything semantic happens upstream.
- Do not reintroduce per-CLI themes. Colors are picked by **data type**, not by vendor. Keep the same semantic color → meaning mapping if you add a new fragment.

## Antigravity & Codex adapter caveats

Both adapters' payload schemas are best-effort — neither has been verified against a real production payload. `normalize()` accepts both snake_case and camelCase variants and falls back to Claude Code field names where applicable. If a real payload sample reveals different field names, only `normalize()` (and possibly `installHookDefs`) in that adapter needs to change. Env vars allow path overrides for non-default install locations.

`detectVersion()` for AG/Codex is similarly best-effort: it tries env vars, an `AI_AGENT` regex, and a `VERSION` file under the adapter's home dir. If none match, the CLI tag in the model row shows just the displayName without a version number — that's an acceptable degraded mode.
