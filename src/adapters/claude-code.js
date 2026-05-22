const os = require('os');
const path = require('path');

const NAME = 'claude-code';
const PROJECT = 'cli-statuslines';
const STATE_DIR = path.join(os.homedir(), '.claude', PROJECT);
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CONFIG_PATH = path.join(os.homedir(), '.claude', `${PROJECT}-rows.json`);
const MCP_CACHE_PATH = path.join(STATE_DIR, 'mcp-status-cache.json');
const RATE_LIMIT_SNAPSHOT_PATH = path.join(STATE_DIR, 'rate-limit-snapshots.json');

function detectVersion() {
  try {
    if (process.env.CLAUDE_CODE_EXECPATH) {
      const m = process.env.CLAUDE_CODE_EXECPATH.match(/\/versions\/([0-9][0-9.]*)/);
      if (m) return m[1];
    }
    if (process.env.AI_AGENT) {
      const m = process.env.AI_AGENT.match(/claude-code[_-]([0-9][0-9-]*)/);
      if (m) return m[1].replace(/-/g, '.');
    }
  } catch (e) {}
  return null;
}

function deriveSessionId(payload) {
  let logical = payload.session_id;
  try {
    if (payload.transcript_path) {
      const m = path.basename(payload.transcript_path).match(/^([0-9a-fA-F-]+)\.jsonl$/);
      if (m) logical = m[1];
    }
  } catch (e) {}
  return (logical || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 24);
}

function normalize(payload) {
  if (!payload) return null;
  return {
    toolName: NAME,
    sessionId: deriveSessionId(payload),
    sessionName: payload.session_name || '',
    modelName: (payload.model?.display_name || '?').replace('Claude ', ''),
    cwd: payload.cwd || payload.workspace?.current_dir || '',
    transcriptPath: payload.transcript_path || null,

    contextUsedPct: payload.context_window?.used_percentage ?? 0,
    contextInputTokens: payload.context_window?.total_input_tokens ?? 0,
    contextOutputTokens: payload.context_window?.total_output_tokens ?? 0,

    totalCostUsd: payload.cost?.total_cost_usd ?? 0,
    totalDurationMs: payload.cost?.total_duration_ms ?? 0,
    totalLinesAdded: payload.cost?.total_lines_added ?? 0,
    totalLinesRemoved: payload.cost?.total_lines_removed ?? 0,

    rateLimits: {
      shortWindow: payload.rate_limits?.five_hour
        ? { usedPct: payload.rate_limits.five_hour.used_percentage,
            resetsAt: payload.rate_limits.five_hour.resets_at,
            periodSec: 5 * 3600,
            label: '5h-quota' }
        : null,
      longWindow: payload.rate_limits?.seven_day
        ? { usedPct: payload.rate_limits.seven_day.used_percentage,
            resetsAt: payload.rate_limits.seven_day.resets_at,
            periodSec: 7 * 86400,
            label: '7d-quota' }
        : null,
    },

    hookEventName: payload.hook_event_name || null,
    toolInput: payload.tool_input || null,
    prompt: payload.prompt || null,
    agentType: payload.agent_type || null,
    agentId: payload.agent_id || null,
    rawPayload: payload,
  };
}

// All three adapters share the same sectioned layout — see src/adapters/_layout.js.
const { buildLayout } = require('./_layout');

function installHookDefs(hooksDir, statuslinePath) {
  const hookCmd = (file) => `node ${path.join(hooksDir, file)} --tool=${NAME}`;
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
  displayName: 'Claude Code',
  vendor: 'Anthropic',
  stateDir: STATE_DIR,
  settingsPath: SETTINGS_PATH,
  configPath: CONFIG_PATH,
  mcpCachePath: MCP_CACHE_PATH,
  rateLimitSnapshotPath: RATE_LIMIT_SNAPSHOT_PATH,
  features: {
    model: true,
    context: true,
    cost: true,
    rateLimits: true,
    effort: true,
    mcp: true,
    memory: true,
    subagents: true,
    activeTime: true,
    compact: true,
    msgHistory: true,
    editedFiles: true,
  },
  deriveSessionId,
  detectVersion,
  normalize,
  installHookDefs,
  buildLayout,
};
