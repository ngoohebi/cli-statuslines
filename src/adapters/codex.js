const os = require('os');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────
// Codex CLI adapter (OpenAI) — best-effort, schema not yet confirmed.
// Override paths via env vars if Codex lives somewhere non-default:
//   CODEX_HOME=~/.config/codex  cli-statusline install codex
//   CODEX_SETTINGS_PATH, CODEX_STATE_DIR, CODEX_CONFIG_PATH,
//   CODEX_MCP_CACHE_PATH, CODEX_RL_SNAPSHOT_PATH
// ─────────────────────────────────────────────────────────────────────────

const NAME = 'codex';
const PROJECT = 'cli-statuslines';

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const STATE_DIR = process.env.CODEX_STATE_DIR || path.join(CODEX_HOME, PROJECT);
const SETTINGS_PATH = process.env.CODEX_SETTINGS_PATH || path.join(CODEX_HOME, 'settings.json');
const CONFIG_PATH = process.env.CODEX_CONFIG_PATH || path.join(CODEX_HOME, `${PROJECT}-rows.json`);
const MCP_CACHE_PATH = process.env.CODEX_MCP_CACHE_PATH || path.join(STATE_DIR, 'mcp-status-cache.json');
const RATE_LIMIT_SNAPSHOT_PATH = process.env.CODEX_RL_SNAPSHOT_PATH || path.join(STATE_DIR, 'rate-limit-snapshots.json');

function detectVersion() {
  try {
    if (process.env.CODEX_VERSION) return process.env.CODEX_VERSION;
    if (process.env.AI_AGENT) {
      const m = process.env.AI_AGENT.match(/codex[_-]([0-9][0-9.\-]*)/i);
      if (m) return m[1].replace(/-/g, '.');
    }
    const fs = require('fs');
    const ver = path.join(CODEX_HOME, 'VERSION');
    if (fs.existsSync(ver)) return fs.readFileSync(ver, 'utf8').trim();
  } catch (e) {}
  return null;
}

function deriveSessionId(payload) {
  let logical = payload.session_id || payload.sessionId || payload.conversation_id;
  try {
    const tp = payload.transcript_path || payload.transcriptPath;
    if (tp) {
      const m = path.basename(tp).match(/^([0-9a-fA-F-]+)\.(jsonl|json|log)$/);
      if (m) logical = m[1];
    }
  } catch (e) {}
  return (logical || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 24);
}

function normalize(payload) {
  if (!payload) return null;
  const rl = payload.rate_limits || payload.rateLimits || {};
  const ctx = payload.context_window || payload.contextWindow || {};
  const cost = payload.cost || payload.usage || {};

  return {
    toolName: NAME,
    sessionId: deriveSessionId(payload),
    sessionName: payload.session_name || payload.sessionName || '',
    // Codex models tend to be GPT-* — display the bare name where possible.
    modelName: (payload.model?.display_name || payload.model?.name || payload.model || '?').replace(/^OpenAI /, ''),
    cwd: payload.cwd || payload.workingDirectory || payload.workspace?.current_dir || '',
    transcriptPath: payload.transcript_path || payload.transcriptPath || null,

    contextUsedPct: ctx.used_percentage ?? ctx.usedPct ?? 0,
    contextInputTokens: ctx.total_input_tokens ?? ctx.inputTokens ?? 0,
    contextOutputTokens: ctx.total_output_tokens ?? ctx.outputTokens ?? 0,

    totalCostUsd: cost.total_cost_usd ?? cost.totalUsd ?? cost.usd ?? 0,
    totalDurationMs: cost.total_duration_ms ?? cost.durationMs ?? 0,
    totalLinesAdded: cost.total_lines_added ?? cost.linesAdded ?? 0,
    totalLinesRemoved: cost.total_lines_removed ?? cost.linesRemoved ?? 0,

    // OpenAI rate limits typically come as rpm/tpm not 5h/7d. Map whatever is
    // present into the shortWindow/longWindow slots so the renderer doesn't
    // need to know.
    rateLimits: {
      shortWindow: rl.requests_per_minute || rl.tpm || rl.short_window
        ? mapWindow(rl.requests_per_minute || rl.tpm || rl.short_window, 60, 'rpm')
        : null,
      longWindow: rl.daily || rl.long_window
        ? mapWindow(rl.daily || rl.long_window, 86400, 'daily')
        : null,
    },

    hookEventName: payload.hook_event_name || payload.event || null,
    toolInput: payload.tool_input || payload.toolInput || null,
    prompt: payload.prompt || payload.user_prompt || null,
    agentType: payload.agent_type || payload.agentType || null,
    agentId: payload.agent_id || payload.agentId || null,
    rawPayload: payload,
  };
}

function mapWindow(w, defaultPeriod, kind) {
  if (!w) return null;
  return {
    usedPct: w.used_percentage ?? w.usedPct ?? 0,
    resetsAt: w.resets_at ?? w.resetsAt ?? null,
    periodSec: w.period_sec ?? w.periodSec ?? defaultPeriod,
    label: kind === 'rpm' ? 'rpm' : kind === 'daily' ? 'daily' : kind,
  };
}

function installHookDefs(hooksDir, statuslinePath) {
  const hookCmd = (file) => `node ${path.join(hooksDir, file)} --tool=${NAME}`;
  // Best-effort hook event names — same shape as Claude Code's. If Codex uses
  // different event names, only this block changes.
  return {
    statusLine: {
      type: 'command',
      command: `node ${statuslinePath} --tool=${NAME}`,
    },
    hooks: {
      PostToolUse: [
        { matcher: 'Write|Edit', hooks: [{ type: 'command', command: hookCmd('file-tracker.js') }] },
      ],
      PreCompact: [
        { matcher: '.*', hooks: [{ type: 'command', command: hookCmd('compact-monitor.js') }] },
      ],
      Stop: [
        { matcher: '*', hooks: [
          { type: 'command', command: hookCmd('message-tracker.js') },
          { type: 'command', command: hookCmd('active-time.js') },
        ] },
      ],
      SubagentStart: [
        { matcher: '.*', hooks: [{ type: 'command', command: hookCmd('subagent.js') }] },
      ],
      SubagentStop: [
        { matcher: '.*', hooks: [{ type: 'command', command: hookCmd('subagent.js') }] },
      ],
      UserPromptSubmit: [
        { hooks: [
          { type: 'command', command: hookCmd('message-tracker.js') },
          { type: 'command', command: hookCmd('summary.js') },
          { type: 'command', command: hookCmd('active-time.js') },
        ] },
      ],
    },
  };
}

// All three adapters share the same sectioned layout — see src/adapters/_layout.js.
const { buildLayout } = require('./_layout');

module.exports = {
  name: NAME,
  displayName: 'Codex',
  vendor: 'OpenAI',
  stateDir: STATE_DIR,
  settingsPath: SETTINGS_PATH,
  configPath: CONFIG_PATH,
  mcpCachePath: MCP_CACHE_PATH,
  rateLimitSnapshotPath: RATE_LIMIT_SNAPSHOT_PATH,
  // Best-effort feature availability. Flip to true as Codex's payload schema
  // gets confirmed.
  features: {
    model: true,
    context: true,
    cost: true,
    rateLimits: true,
    effort: false,
    mcp: true,
    memory: false,
    subagents: true,
    activeTime: true,
    compact: false,
    msgHistory: true,
    editedFiles: true,
  },
  deriveSessionId,
  detectVersion,
  normalize,
  installHookDefs,
  buildLayout,
};
