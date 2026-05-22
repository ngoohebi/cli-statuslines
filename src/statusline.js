#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { getAdapterFromArgv } = require('./adapters');
const { ensureStateDir, statePath } = require('./lib/state');
const { loadConfig } = require('./lib/config');
const { R, fmtDuration, effortColor } = require('./lib/format');
const { COLORS } = require('./lib/theme');
const { getGitInfo } = require('./lib/git');
const { updateCumulative, getActiveTime, aggregateAllSessions } = require('./lib/cumulative');
const { updateAndAggregate, countdownSec } = require('./lib/rate-limits');
const { renderDashboard } = require('./lib/renderer');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const adapter = getAdapterFromArgv();
    const payload = JSON.parse(d);
    const i = adapter.normalize(payload);

    const cfg = loadConfig(adapter.configPath);
    if (!cfg.enabled) { process.stdout.write(''); return; }

    ensureStateDir(adapter.stateDir);

    const sid = i.sessionId;

    // ── Per-session derived state ──
    const cum = updateCumulative(adapter.stateDir, sid, i);
    const activeMs = getActiveTime(adapter.stateDir, sid);
    const dur = fmtDuration(Math.round((activeMs > 0 ? activeMs : cum.dur.total) / 60000));

    // ── Rate limits (only if adapter exposes them) ──
    let shortPct = 0, longPct = 0, resetShort = '', resetLong = '';
    if (adapter.features.rateLimits) {
      const r = updateAndAggregate(adapter.rateLimitSnapshotPath, sid, i);
      shortPct = r.shortPct; longPct = r.longPct;
      if (i.rateLimits.shortWindow) {
        const s = countdownSec(i.rateLimits.shortWindow.resetsAt, i.rateLimits.shortWindow.periodSec);
        if (s != null) resetShort = `${COLORS.label}resets${R} ${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
      }
      if (i.rateLimits.longWindow) {
        const s = countdownSec(i.rateLimits.longWindow.resetsAt, i.rateLimits.longWindow.periodSec);
        if (s != null) resetLong = `${COLORS.label}resets${R} ${Math.floor(s / 86400)}d${Math.floor((s % 86400) / 3600)}h`;
      }
    }

    // ── Effort level (Claude Code only — reads settings.effortLevel) ──
    let effort = '';
    if (adapter.features.effort) {
      try {
        const settings = JSON.parse(fs.readFileSync(adapter.settingsPath, 'utf8'));
        const lvl = settings.effortLevel || 'default';
        effort = `${COLORS.label}effort${R} ${effortColor(lvl)}${lvl}${R}`;
      } catch (e) {}
    }

    // ── State files ──
    let agents = null;
    try { agents = JSON.parse(fs.readFileSync(statePath(adapter.stateDir, `agents-${sid}.json`), 'utf8')); } catch (e) {}

    let compactCount = adapter.features.compact ? 0 : undefined;
    if (adapter.features.compact) {
      try { compactCount = JSON.parse(fs.readFileSync(statePath(adapter.stateDir, `compacts-${sid}.json`), 'utf8')).count; } catch (e) {}
    }

    let fileParts = [];
    try { fileParts = JSON.parse(fs.readFileSync(statePath(adapter.stateDir, `files-${sid}.json`), 'utf8')); } catch (e) {}

    let msgHistory = [];
    try { msgHistory = JSON.parse(fs.readFileSync(statePath(adapter.stateDir, `msgs-${sid}.json`), 'utf8')); } catch (e) {}

    // ── MCP cache (gated by feature flag) ──
    let mcpTotal = 0, mcpHealthy = 0;
    if (adapter.features.mcp) {
      try {
        const mcpCache = JSON.parse(fs.readFileSync(adapter.mcpCachePath, 'utf8'));
        for (const info of Object.values(mcpCache.servers || {})) {
          mcpTotal++;
          if (info.status === 'connected') mcpHealthy++;
        }
      } catch (e) {}

      // Background refresh (Claude Code's `claude mcp list` only)
      if (adapter.name === 'claude-code') {
        const MCP_REFRESH_INTERVAL_MS = 90 * 1000;
        let stale = true;
        try { stale = (Date.now() - fs.statSync(adapter.mcpCachePath).mtimeMs) > MCP_REFRESH_INTERVAL_MS; } catch (e) {}
        if (stale) {
          try {
            const { spawn } = require('child_process');
            const refresher = path.join(__dirname, 'hooks', 'mcp-refresh.js');
            if (fs.existsSync(refresher)) {
              const p = spawn(process.execPath, [refresher], { detached: true, stdio: 'ignore', windowsHide: true });
              p.unref();
            }
          } catch (e) {}
        }
      }
    }

    // ── Git ──
    const { branch, dirty, repoName } = getGitInfo();
    const shortDir = (i.cwd).split(/[/\\]/).slice(-2).join('/');
    // gitInfo always leads with the remote repo name (owner/repo when a
    // remote is configured, otherwise the repo's directory basename).
    const gitParts = [];
    if (repoName) gitParts.push(`${COLORS.repo}${repoName}${R}`);
    if (branch) gitParts.push(`${COLORS.branch}${branch}${R}${dirty ? ` ${COLORS.label}(${dirty} changed)${R}` : ''}`);
    const gitInfo = gitParts.join(' ');

    // ── Aggregates ──
    const { totalCost: allCost, totalTok: allTok } = aggregateAllSessions(adapter.stateDir, cfg.aggWindowDays || 0);
    const windowLabel = (cfg.aggWindowDays || 0) === 0 ? 'all time'
      : cfg.aggWindowDays === 1 ? 'past 1 day'
      : `past ${cfg.aggWindowDays} days`;

    // ── Terminal width ──
    let TERM_W = 0;
    if (cfg.statuslineWidth > 0) {
      TERM_W = cfg.statuslineWidth;
    } else {
      TERM_W = process.stdout.columns || process.stderr.columns || 0;
      if (!TERM_W) { try { TERM_W = parseInt(process.env.COLUMNS, 10) || 0; } catch (e) {} }
      if (!TERM_W) TERM_W = 120;
    }
    const widthOffset = cfg.statuslineWidthOffset ?? 4;
    TERM_W = Math.max(20, TERM_W - widthOffset);

    // ── Build the layout (no fragment packing — adapter returns final rows). ──
    const { displayWidth } = require('./lib/unicode');
    const ctx = {
      i, cfg, cum, activeMs, dur, compactCount,
      agents, fileParts, msgHistory,
      allCost, allTok, windowLabel,
      shortPct, longPct, resetShort, resetLong,
      gitInfo, shortDir, effort,
      mcpTotal, mcpHealthy,
      MSG_W: 0,  // re-computed below; layout doesn't depend on it
      adapter,
    };
    let layout = adapter.buildLayout(ctx);

    // ── Width math: content drives LEFT_W, message column fills the rest. ──
    let LEFT_W = 20;
    for (const r of layout.fullLeftRows) {
      if (r === null) continue;  // section-divider sentinel
      LEFT_W = Math.max(LEFT_W, displayWidth(r) + 2);
    }

    const MSG_W = Math.max(0, TERM_W - LEFT_W - 3);
    const showMsgs = cfg.history && MSG_W >= 15;

    // Rebuild with the now-known MSG_W so formatMessages can truncate properly.
    ctx.MSG_W = MSG_W;
    layout = adapter.buildLayout(ctx);

    process.stdout.write(renderDashboard({
      summary: layout.summary,
      fullLeftRows: layout.fullLeftRows,
      rightMsgs: layout.formattedMsgs,
      showMsgs,
      LEFT_W, MSG_W,
    }));
  } catch (e) {
    process.stdout.write('statusline error: ' + e.message);
  }
});
