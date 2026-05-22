const fs = require('fs');
const os = require('os');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────
// Antigravity CLI adapter — best-effort, schema not yet confirmed.
// Override fields by setting env vars before invocation, e.g.
//   AG_SETTINGS_PATH=~/.config/antigravity/settings.json antigravity install ...
// ─────────────────────────────────────────────────────────────────────────

const NAME = 'antigravity';
const PROJECT = 'cli-statuslines';

let defaultAgHome = path.join(os.homedir(), '.gemini', 'antigravity-cli');
if (!fs.existsSync(defaultAgHome) && fs.existsSync(path.join(os.homedir(), '.antigravity'))) {
  defaultAgHome = path.join(os.homedir(), '.antigravity');
}
const AG_HOME = process.env.ANTIGRAVITY_HOME || defaultAgHome;
const STATE_DIR = process.env.AG_STATE_DIR || path.join(AG_HOME, PROJECT);
const SETTINGS_PATH = process.env.AG_SETTINGS_PATH || path.join(AG_HOME, 'settings.json');
const CONFIG_PATH = process.env.AG_CONFIG_PATH || path.join(AG_HOME, `${PROJECT}-rows.json`);
const MCP_CACHE_PATH = process.env.AG_MCP_CACHE_PATH || path.join(STATE_DIR, 'mcp-status-cache.json');
const RATE_LIMIT_SNAPSHOT_PATH = process.env.AG_RL_SNAPSHOT_PATH || path.join(STATE_DIR, 'rate-limit-snapshots.json');

function detectVersion() {
  try {
    if (process.env.ANTIGRAVITY_VERSION) return process.env.ANTIGRAVITY_VERSION;
    if (process.env.AI_AGENT) {
      const m = process.env.AI_AGENT.match(/antigravity[_-]([0-9][0-9.\-]*)/i);
      if (m) return m[1].replace(/-/g, '.');
    }
    const ver = path.join(AG_HOME, 'antigravity', 'VERSION');
    if (fs.existsSync(ver)) return fs.readFileSync(ver, 'utf8').trim();
  } catch (e) {}
  return null;
}

function deriveSessionId(payload) {
  let logical = payload.session_id || payload.sessionId || payload.conversation_id;
  try {
    const tp = payload.transcript_path || payload.transcriptPath;
    if (tp) {
      const m = path.basename(tp).match(/^([0-9a-fA-F-]+)\.(jsonl|json|log|pb)$/);
      if (m) logical = m[1];
    }
  } catch (e) {}
  return (logical || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 24);
}

// Best-effort field mapping. Hooks fall back to Claude Code-style fields
// when a tool-specific equivalent is not present, so a payload that mimics
// Claude Code (which is the user's stated assumption) still works.
function normalize(payload) {
  if (!payload) return null;
  const rl = payload.rate_limits || payload.rateLimits || {};
  const ctx = payload.context_window || payload.contextWindow || {};
  const cost = payload.cost || payload.usage || {};

  return {
    toolName: NAME,
    sessionId: deriveSessionId(payload),
    sessionName: payload.session_name || payload.sessionName || '',
    modelName: (payload.model?.display_name || payload.model?.name || payload.model || '?'),
    cwd: payload.cwd || payload.workingDirectory || payload.workspace?.current_dir || '',
    transcriptPath: payload.transcript_path || payload.transcriptPath || null,

    contextUsedPct: ctx.used_percentage ?? ctx.usedPct ?? 0,
    contextInputTokens: ctx.total_input_tokens ?? ctx.inputTokens ?? 0,
    contextOutputTokens: ctx.total_output_tokens ?? ctx.outputTokens ?? 0,

    totalCostUsd: cost.total_cost_usd ?? cost.totalUsd ?? cost.usd ?? 0,
    totalDurationMs: cost.total_duration_ms ?? cost.durationMs ?? 0,
    totalLinesAdded: cost.total_lines_added ?? cost.linesAdded ?? 0,
    totalLinesRemoved: cost.total_lines_removed ?? cost.linesRemoved ?? 0,

    rateLimits: {
      shortWindow: rl.short_window || rl.shortWindow || rl.five_hour
        ? mapWindow(rl.short_window || rl.shortWindow || rl.five_hour, 5 * 3600, 'short')
        : null,
      longWindow: rl.long_window || rl.longWindow || rl.seven_day
        ? mapWindow(rl.long_window || rl.longWindow || rl.seven_day, 7 * 86400, 'long')
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
    label: kind === 'short' ? '5h-quota' : '7d-quota',
  };
}

// All three adapters share the same sectioned layout — see src/adapters/_layout.js.
const { buildLayout } = require('./_layout');

function installHookDefs(hooksDir, statuslinePath) {
  const hookCmd = (file) => `node ${path.join(hooksDir, file)} --tool=${NAME}`;
  // Assumes Antigravity uses the same hook event names as Claude Code. If
  // that turns out wrong, only this block changes — hooks themselves stay
  // tool-agnostic.
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

module.exports = {
  name: NAME,
  displayName: 'Antigravity',
  vendor: 'Google',
  stateDir: STATE_DIR,
  settingsPath: SETTINGS_PATH,
  configPath: CONFIG_PATH,
  mcpCachePath: MCP_CACHE_PATH,
  rateLimitSnapshotPath: RATE_LIMIT_SNAPSHOT_PATH,
  // Feature availability — drives the status command and layout selection.
  // Schema not yet confirmed; conservative defaults until a real payload sample
  // lets us flip individual flags on.
  features: {
    model: true,
    context: true,
    cost: false,
    rateLimits: false,
    effort: false,
    mcp: false,
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
