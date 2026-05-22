const fs = require('fs');

const SUPPORTED = ['claude-code', 'antigravity', 'codex'];

function parseToolArg(argv) {
  const flag = (argv || process.argv.slice(2)).find(a => a.startsWith('--tool='));
  const fromArgv = flag ? flag.split('=')[1] : null;
  const fromEnv = process.env.STATUSLINE_TOOL || null;
  const tool = fromArgv || fromEnv || detectCurrentCli();
  if (!SUPPORTED.includes(tool)) {
    throw new Error(`unsupported tool "${tool}"; expected one of: ${SUPPORTED.join(', ')}`);
  }
  return tool;
}

// Detect which CLI the user is currently running inside. Priority:
//   1. CLAUDECODE / CLAUDE_CODE_ENTRYPOINT  → claude-code
//   2. ANTIGRAVITY / AI_AGENT contains antigravity → antigravity
//   3. First target whose statusline is installed
//   4. claude-code (default)
function detectCurrentCli() {
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return 'claude-code';
  if (process.env.ANTIGRAVITY || process.env.ANTIGRAVITY_AGENT) return 'antigravity';
  if (process.env.CODEX || process.env.CODEX_CLI) return 'codex';
  if (process.env.AI_AGENT && /antigrav/i.test(process.env.AI_AGENT)) return 'antigravity';
  if (process.env.AI_AGENT && /codex/i.test(process.env.AI_AGENT)) return 'codex';
  for (const t of SUPPORTED) {
    try {
      const ad = require(`./${t}`);
      if (fs.existsSync(ad.settingsPath)) {
        const s = JSON.parse(fs.readFileSync(ad.settingsPath, 'utf8'));
        if (s.statusLine?.command?.includes('statusline.js')) return t;
      }
    } catch (e) {}
  }
  return 'claude-code';
}

function getAdapter(toolName) {
  return require(`./${toolName}`);
}

function getAdapterFromArgv(argv) {
  return getAdapter(parseToolArg(argv));
}

module.exports = { SUPPORTED, parseToolArg, getAdapter, getAdapterFromArgv, detectCurrentCli };
