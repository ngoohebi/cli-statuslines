#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SUPPORTED, getAdapter, detectCurrentCli } = require('../src/adapters');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HOOKS_DIR = path.join(PROJECT_ROOT, 'src', 'hooks');
const STATUSLINE = path.join(PROJECT_ROOT, 'src', 'statusline.js');

const R = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const CYAN = '\x1b[36m', GREEN = '\x1b[32m', RED = '\x1b[31m', YELLOW = '\x1b[33m', MAGENTA = '\x1b[35m';

const log = (m) => console.log(m);
const ok = (m) => log(`${GREEN}✓${R} ${m}`);
const warn = (m) => log(`${YELLOW}!${R} ${m}`);
const err = (m) => log(`${RED}✘${R} ${m}`);

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }
function writeJson(p, v) {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch (e) {}
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}

function isOurHook(hook) {
  return hook?.command?.includes(HOOKS_DIR);
}

function installForTarget(targetName, refreshSec) {
  const adapter = getAdapter(targetName);
  const settings = readJson(adapter.settingsPath);
  if (!settings.hooks) settings.hooks = {};

  const defs = adapter.installHookDefs(HOOKS_DIR, STATUSLINE);

  for (const [event, entries] of Object.entries(defs.hooks)) {
    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event] = settings.hooks[event].filter(entry => {
      if (!entry.hooks) return true;
      return !entry.hooks.some(h => isOurHook(h));
    });
    settings.hooks[event].push(...entries);
  }

  settings.statusLine = { ...defs.statusLine, refreshInterval: Math.max(1, Math.round(refreshSec)) };
  writeJson(adapter.settingsPath, settings);

  try { fs.mkdirSync(adapter.stateDir, { recursive: true }); } catch (e) {}

  ok(`[${targetName}] statusline configured (refresh ${Math.max(1, Math.round(refreshSec))}s)`);
  ok(`[${targetName}] ${Object.keys(defs.hooks).length} hook events registered`);
  ok(`[${targetName}] settings file: ${adapter.settingsPath}`);
  ok(`[${targetName}] state dir: ${adapter.stateDir}`);
}

function uninstallForTarget(targetName) {
  const adapter = getAdapter(targetName);
  if (!fs.existsSync(adapter.settingsPath)) {
    warn(`[${targetName}] no settings file at ${adapter.settingsPath} — nothing to remove`);
    return;
  }
  const settings = readJson(adapter.settingsPath);
  if (settings.hooks) {
    for (const event of Object.keys(settings.hooks)) {
      settings.hooks[event] = (settings.hooks[event] || []).filter(entry => {
        if (!entry.hooks) return true;
        return !entry.hooks.some(h => isOurHook(h));
      });
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
  }
  if (settings.statusLine?.command?.includes(STATUSLINE)) {
    delete settings.statusLine;
  }
  writeJson(adapter.settingsPath, settings);
  ok(`[${targetName}] removed statusline + hooks from settings`);
}

function isInstalled(adapter) {
  if (!fs.existsSync(adapter.settingsPath)) return false;
  const settings = readJson(adapter.settingsPath);
  if (!settings.statusLine?.command?.includes(STATUSLINE)) return false;
  return true;
}

function cmdInstall(args) {
  const refreshArg = args.find(a => a.startsWith('--refresh='));
  const refreshSec = parseFloat(refreshArg?.split('=')[1]) || 20;
  const target = args.find(a => !a.startsWith('--')) || 'claude-code';

  log(`\n${BOLD}${MAGENTA}⟐ cli-statuslines${R} — Installing\n`);

  if (target === 'all') {
    for (const t of SUPPORTED) installForTarget(t, refreshSec);
  } else if (SUPPORTED.includes(target)) {
    installForTarget(target, refreshSec);
  } else {
    err(`Unknown target: ${target}. Use: ${SUPPORTED.join(' | ')} | all`);
    return;
  }

  log(`\n${GREEN}${BOLD}Installation complete.${R} Restart the affected tool to see the dashboard.\n`);
}

function cmdUninstall(args) {
  const target = args.find(a => !a.startsWith('--')) || 'claude-code';
  log(`\n${BOLD}${MAGENTA}⟐ cli-statuslines${R} — Uninstalling\n`);

  if (target === 'all') {
    for (const t of SUPPORTED) uninstallForTarget(t);
  } else if (SUPPORTED.includes(target)) {
    uninstallForTarget(target);
  } else {
    err(`Unknown target: ${target}`);
    return;
  }
  log(`\n${DIM}State data preserved. Remove adapter.stateDir manually for a clean slate.${R}\n`);
}

// Order matters — first hit determines target when args omitted.
function pickStatusTarget(args) {
  const explicit = args.find(a => SUPPORTED.includes(a) || a === 'all');
  if (explicit) return explicit;
  return detectCurrentCli();
}

function statusBlock(target) {
  const adapter = getAdapter(target);
  const installed = isInstalled(adapter);
  const settings = readJson(adapter.settingsPath);

  log(`\n${BOLD}${MAGENTA}⟐ cli-statuslines${R} — ${BOLD}${adapter.displayName}${R} ${DIM}(${adapter.vendor})${R}\n`);

  // ── Installation ──
  log(`  ${BOLD}Installation${R}`);
  log(`    statusline   ${installed ? GREEN + 'active' : DIM + 'inactive'}${R}` +
      (installed ? `   ${DIM}refresh ${settings.statusLine?.refreshInterval || '?'}s${R}` : ''));
  if (installed) {
    let hookCount = 0;
    for (const entries of Object.values(settings.hooks || {})) {
      for (const entry of entries) {
        if (entry.hooks?.some(h => isOurHook(h))) hookCount++;
      }
    }
    log(`    hooks        ${GREEN}${hookCount}${R} ${DIM}registered${R}`);
  }
  log(`    settings     ${DIM}${adapter.settingsPath}${R}`);
  log(`    state dir    ${DIM}${adapter.stateDir}${R}`);
  log(`    config       ${DIM}${adapter.configPath}${R}`);

  // ── Sessions ──
  log(`\n  ${BOLD}Sessions${R}`);
  let sessionCount = 0, totalCost = 0, totalTok = 0, lastMtime = 0;
  try {
    const files = fs.readdirSync(adapter.stateDir);
    const sessions = new Set();
    for (const f of files) {
      if (!f.startsWith('cum-') || !f.endsWith('.json') || f.includes('.bak')) continue;
      sessions.add(f.replace('cum-', '').replace('.json', ''));
      try {
        const full = path.join(adapter.stateDir, f);
        const st = fs.statSync(full);
        if (st.mtimeMs > lastMtime) lastMtime = st.mtimeMs;
        const c = JSON.parse(fs.readFileSync(full, 'utf8'));
        totalCost += c.cost?.total || 0;
        totalTok += c.tok?.total || 0;
      } catch (e) {}
    }
    sessionCount = sessions.size;
  } catch (e) {}
  if (sessionCount === 0) {
    log(`    ${DIM}no sessions yet${R}`);
  } else {
    log(`    tracked      ${GREEN}${sessionCount}${R}`);
    if (adapter.features.cost) {
      log(`    total cost   ${GREEN}$${totalCost.toFixed(2)}${R}`);
    }
    log(`    total tokens ${GREEN}${fmtNum(totalTok)}${R}`);
    if (lastMtime > 0) {
      log(`    last active  ${DIM}${new Date(lastMtime).toLocaleString()}${R}`);
    }
  }

  // ── Available data sources ──
  log(`\n  ${BOLD}Available data${R} ${DIM}(for ${adapter.displayName})${R}`);
  const featureOrder = [
    ['model', 'model name'],
    ['context', 'context window %'],
    ['cost', 'cost / tokens / lines'],
    ['rateLimits', 'rate limits'],
    ['effort', 'effort level'],
    ['mcp', 'MCP servers'],
    ['memory', 'memory (CLAUDE.md / rules)'],
    ['subagents', 'subagents'],
    ['activeTime', 'active session time'],
    ['compact', 'context compact count'],
    ['msgHistory', 'message history'],
    ['editedFiles', 'edited files'],
  ];
  for (const [key, label] of featureOrder) {
    const on = adapter.features[key];
    log(`    ${on ? GREEN + '✓' : DIM + '✗'}${R} ${on ? '' : DIM}${label}${on ? '' : R}`);
  }

  log('');
}

const { fmtTokens: fmtNum } = require('../src/lib/format');

function cmdStatus(args) {
  const target = pickStatusTarget(args);
  if (target === 'all') {
    for (const t of SUPPORTED) statusBlock(t);
    return;
  }
  if (!SUPPORTED.includes(target)) {
    err(`Unknown target: ${target}`);
    return;
  }
  statusBlock(target);
}

function cmdConfig(args) {
  const target = args[0] && SUPPORTED.includes(args[0]) ? args.shift() : 'claude-code';
  const adapter = getAdapter(target);
  const cfg = readJson(adapter.configPath);
  const sub = args[0];

  if (!sub || sub === 'show') {
    log(`\n${BOLD}${MAGENTA}⟐ cli-statuslines${R} — Configuration [${target}]\n`);
    const rows = ['summary', 'dir', 'repo', 'model', 'duration', 'cost', 'usage', 'quota', 'agents', 'memory_mcp', 'edited', 'history'];
    for (const r of rows) {
      const on = cfg[r] !== false && cfg[r] !== 0;
      log(`  ${on ? GREEN + '●' : RED + '○'}${R} ${r}`);
    }
    log('');
    log(`  ${DIM}refresh interval${R}  ${cfg.refreshInterval || '(default: 20s)'}`);
    log(`  ${DIM}agg window${R}        ${cfg.aggWindowDays || 0} days (0 = all time)`);
    log(`  ${DIM}summary interval${R}  every ${cfg.summaryInterval || 10} messages`);
    log(`  ${DIM}terminal width${R}    ${cfg.statuslineWidth || '(auto-detect)'}`);
    log(`  ${DIM}config file${R}       ${adapter.configPath}`);
    log('');
    return;
  }

  if (sub === 'refresh') {
    const seconds = parseFloat(args[1]);
    if (!seconds || seconds < 1) { err('Usage: cli-statuslines config [target] refresh <seconds>'); return; }
    const rounded = Math.max(1, Math.round(seconds));
    if (fs.existsSync(adapter.settingsPath)) {
      const settings = readJson(adapter.settingsPath);
      if (settings.statusLine) {
        settings.statusLine.refreshInterval = rounded;
        writeJson(adapter.settingsPath, settings);
      }
    }
    cfg.refreshInterval = rounded;
    writeJson(adapter.configPath, cfg);
    ok(`[${target}] refresh interval set to ${rounded}s`);
    return;
  }

  if (sub === 'enable' || sub === 'disable') {
    const row = args[1];
    if (!row) { err(`Usage: cli-statuslines config [target] ${sub} <row>`); return; }
    cfg[row] = sub === 'enable' ? 1 : 0;
    writeJson(adapter.configPath, cfg);
    ok(`[${target}] row "${row}" ${sub}d`);
    return;
  }

  if (sub === 'width') {
    const w = parseInt(args[1], 10);
    if (!w || w < 20) { err('Usage: cli-statuslines config [target] width <columns>'); return; }
    cfg.statuslineWidth = w;
    writeJson(adapter.configPath, cfg);
    ok(`[${target}] terminal width set to ${w}`);
    return;
  }

  if (sub === 'window') {
    const d = parseInt(args[1], 10);
    if (d === undefined || d < 0) { err('Usage: cli-statuslines config [target] window <days> (0 = all time)'); return; }
    cfg.aggWindowDays = d;
    writeJson(adapter.configPath, cfg);
    ok(`[${target}] aggregation window set to ${d === 0 ? 'all time' : d + ' days'}`);
    return;
  }

  err(`Unknown config command: ${sub}`);
}

function cmdAudit(args) {
  const target = args[0] && SUPPORTED.includes(args[0]) ? args.shift() : 'claude-code';
  const adapter = getAdapter(target);
  const auditPath = path.join(adapter.stateDir, 'audit.log');
  if (!fs.existsSync(auditPath)) { log(`[${target}] No audit log found.`); return; }

  log(`\n${BOLD}${MAGENTA}⟐ cli-statuslines${R} — Cost Audit Log [${target}]\n`);
  const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').slice(-20);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      const delta = e.delta >= 0 ? `${GREEN}+$${e.delta.toFixed(2)}${R}` : `${RED}-$${Math.abs(e.delta).toFixed(2)}${R}`;
      log(`  ${DIM}${e.ts.slice(0, 19)}${R}  ${delta}  → $${e.after.toFixed(2)}  ${DIM}${e.sid.slice(0, 8)}${R}`);
    } catch (e) {}
  }
  log('');
}

function cmdReset(args) {
  const target = args.find(a => SUPPORTED.includes(a));
  const all = args.includes('all');
  if (!target || !all) {
    log(`Usage: cli-statuslines reset <${SUPPORTED.join('|')}> all`);
    return;
  }
  const adapter = getAdapter(target);
  try {
    for (const f of fs.readdirSync(adapter.stateDir)) {
      if (f === '.migrated-from-tmpdir') continue;
      try { fs.unlinkSync(path.join(adapter.stateDir, f)); } catch (e) {}
    }
    ok(`[${target}] all session data cleared`);
  } catch (e) { err(`Failed to clear state: ${e.message}`); }
}

function help() {
  log(`
${BOLD}${MAGENTA}⟐ cli-statuslines${R} — Statusline dashboard for AI coding CLIs

${BOLD}TARGETS${R}
  claude-code   Anthropic Claude Code
  antigravity   Google Antigravity CLI
  codex         OpenAI Codex CLI
  all           Install/uninstall for all supported targets

${BOLD}COMMANDS${R}
  ${CYAN}install${R} <target> [--refresh=<seconds>]
  ${CYAN}uninstall${R} <target>
  ${CYAN}status${R} [target|all]                 Show status (default: detected current CLI)
  ${CYAN}config${R} [target] show                Show current configuration
  ${CYAN}config${R} [target] refresh <seconds>   Set refresh interval (1-60s)
  ${CYAN}config${R} [target] enable|disable <row>  Toggle a dashboard row
  ${CYAN}config${R} [target] width <columns>    Set terminal width override
  ${CYAN}config${R} [target] window <days>      Set cost aggregation window (0=all)
  ${CYAN}audit${R} [target]                     Show last 20 cost movements
  ${CYAN}reset${R} <target> all                 Clear all session data

${BOLD}ROWS${R}
  summary, dir, repo, model, duration, cost, usage, quota,
  agents, memory_mcp, edited, history

${BOLD}EXAMPLES${R}
  cli-statuslines install claude-code --refresh=10
  cli-statuslines install antigravity
  cli-statuslines install codex
  cli-statuslines install all
  cli-statuslines uninstall all
  cli-statuslines config claude-code disable history
  cli-statuslines config codex refresh 5
  cli-statuslines status              # auto-detects current CLI
  cli-statuslines status all          # show all three side-by-side
`);
}

const [, , cmd, ...args] = process.argv;
switch (cmd) {
  case 'install':   cmdInstall(args); break;
  case 'uninstall': cmdUninstall(args); break;
  case 'config':    cmdConfig(args); break;
  case 'status':    cmdStatus(args); break;
  case 'audit':     cmdAudit(args); break;
  case 'reset':     cmdReset(args); break;
  case 'help': case '--help': case '-h': case undefined: help(); break;
  default: err(`Unknown command: ${cmd}`); help();
}
