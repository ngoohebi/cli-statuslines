// Layout builders — normal multi-row view.
// Visual chrome and colors come from lib/theme.js. Data types map to colors
// semantically (positive=mint, negative=coral, etc.) — never per-CLI.

const { displayWidth, truncate } = require('./unicode');
const { fmtTokens, ago, bar, colorByPct, ctxColorByPct } = require('./format');
const { THEME, COLORS, RESET: R } = require('./theme');
const L = COLORS.label; // shorthand for label colour
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Top split cells ────────────────────────────────────────────────────

function modelCell(c) {
  if (!c.cfg.model) return '';
  const ver = c.adapter.detectVersion ? c.adapter.detectVersion() : null;
  const cli = `${COLORS.vendor}${c.adapter.displayName}${ver ? ' ' + ver : ''}${R}`;
  const eff = c.effort ? `  ${c.effort}` : '';
  const dur = c.cfg.duration ? `  ${L}·${R} ${c.dur}` : '';
  return `${cli}  ${COLORS.model}${c.i.modelName}${R}${eff}${dur}`;
}

// ─── Full-width rows ────────────────────────────────────────────────────

// Repo row — gathers ALL git-related info: repo name, branch, dirty count,
// and the +N -M line deltas for the current session.
function repoRow(c) {
  if (!c.cfg.repo) return '';
  const lines = `${COLORS.positive}+${c.cum.add.total}${R} ${COLORS.negative}-${c.cum.rm.total}${R} ${L}lines${R}`;
  if (!c.gitInfo) return lines;
  return `${c.gitInfo}  ${L}·${R}  ${lines}`;
}

function usageRow(c) {
  if (!c.cfg.usage) return '';
  const ctxPct = Math.round(c.i.contextUsedPct);
  const tokTotal = c.cum.tok.total;
  const parts = [
    `${L}context${R} ${ctxColorByPct(ctxPct)}${bar(ctxPct, 10, THEME.bar)}${R} ${ctxPct}%`,
  ];
  if (c.adapter.features.compact && c.compactCount !== undefined) {
    const n = c.compactCount;
    parts.push(`${L}compact${R} ${n} ${L}time${n === 1 ? '' : 's'}${R}`);
  }
  parts.push(`${L}tokens${R} ${COLORS.positive}${fmtTokens(c.allTok)}${R} ${L}·${R} ${fmtTokens(tokTotal)} ${L}(session)${R}`);
  if (c.cfg.cost && (c.i.totalCostUsd > 0 || c.cum.cost.total > 0)) {
    const allCostStr = '$' + c.allCost.toFixed(2);
    const sess = '$' + c.cum.cost.total.toFixed(2);
    parts.push(`${L}cost${R} ${COLORS.positive}${allCostStr}${R} ${L}·${R} ${sess} ${L}(session)${R}`);
  }
  return parts.join(`  ${L}·${R}  `);
}

function quotaRow(c) {
  if (!c.cfg.quota) return '';
  const s = c.i.rateLimits.shortWindow;
  const l = c.i.rateLimits.longWindow;
  if (!s && !l) return '';
  const parts = [];
  if (s) parts.push(`${L}${s.label}${R} ${colorByPct(c.shortPct)}${bar(c.shortPct, 10, THEME.bar)}${R} ${c.shortPct}% ${c.resetShort || ''}`);
  if (l) parts.push(`${L}${l.label}${R} ${colorByPct(c.longPct)}${bar(c.longPct, 10, THEME.bar)}${R} ${c.longPct}% ${c.resetLong || ''}`);
  return parts.join(`     ${L}·${R}     `);
}

// Agents row also carries MCP server count — they're both "active tooling".
function agentsRow(c) {
  if (!c.cfg.agents) return '';
  let agentsPart = '';
  if (c.agents) {
    const byName = {};
    for (const [key, info] of Object.entries(c.agents)) {
      const n = info.name || key;
      if (!byName[n]) byName[n] = { running: 0, done: 0, latestFinished: 0 };
      if (info.status === 'running') byName[n].running++;
      else {
        byName[n].done++;
        if ((info.finished || 0) > byName[n].latestFinished) byName[n].latestFinished = info.finished;
      }
    }
    const entries = Object.entries(byName);
    if (entries.length) {
      const line = entries.sort((a, b) => {
        if (a[1].running !== b[1].running) return b[1].running - a[1].running;
        return b[1].latestFinished - a[1].latestFinished;
      }).slice(0, 3).map(([n, s]) => {
        const short = n.length > 12 ? n.slice(0, 12) : n;
        const parts = [];
        if (s.running > 0) parts.push(`${COLORS.agentRunning}○${s.running > 1 ? `×${s.running}` : ''}${R}`);
        if (s.done > 0) parts.push(`${COLORS.agentDone}✓${s.done > 1 ? `×${s.done}` : ''}${R}${s.latestFinished ? ` ${L}${ago(s.latestFinished)}${R}` : ''}`);
        return `${short} ${parts.join(' ')}`;
      }).join('  ');
      agentsPart = `${L}agents${R}  ${line}`;
    }
  }

  let mcpPart = '';
  if (c.adapter.features.mcp && c.mcpTotal > 0) {
    const m = c.mcpHealthy === c.mcpTotal
      ? `${COLORS.positive}${c.mcpTotal}${R} active`
      : `${COLORS.positive}${c.mcpHealthy}${R}/${c.mcpTotal} active`;
    mcpPart = `${L}mcp${R} ${m}`;
  }

  if (agentsPart && mcpPart) return `${agentsPart}  ${L}·${R}  ${mcpPart}`;
  return agentsPart || mcpPart;
}

// Memory row — MCP moved to the agents row, so this is memory-only now.
function memoryMcpRow(c) {
  if (!c.cfg.memory_mcp) return '';
  if (!c.adapter.features.memory) return '';

  const memParts = [];
  const cwd = c.i.cwd;
  if (fs.existsSync(path.join(os.homedir(), '.claude', 'CLAUDE.md'))) memParts.push(`${COLORS.positive}global${R}`);
  const projMd = [path.join(cwd, 'CLAUDE.md'), path.join(cwd, '.claude', 'CLAUDE.md')];
  if (projMd.some(p => { try { return fs.existsSync(p); } catch (e) { return false; } })) memParts.push(`${COLORS.positive}project${R}`);
  try {
    const rulesDir = path.join(cwd, '.claude', 'rules');
    if (fs.existsSync(rulesDir)) {
      const ruleCount = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).length;
      if (ruleCount > 0) memParts.push(`${COLORS.positive}${ruleCount} rules${R}`);
    }
  } catch (e) {}

  if (!memParts.length) return '';
  return `${L}memory${R} ${memParts.join(`${L} · ${R}`)}`;
}

function editedRow(c) {
  if (!c.cfg.edited || !c.fileParts || !c.fileParts.length) return '';
  const sep = ` ${L}→${R} `;
  const shortFile = f => f.length > 25 ? '…' + f.slice(-24) : f;
  let fitted = [], usedW = 8;
  for (const f of c.fileParts) {
    const sf = shortFile(f);
    const fw = sf.length + (fitted.length ? 3 : 0);
    if (usedW + fw > 90) break;
    fitted.push(sf);
    usedW += fw;
  }
  return fitted.length ? `${L}edited${R}  ${fitted.join(sep)}` : '';
}

// ─── Summary + message history ──────────────────────────────────────────

function summaryText(c) {
  if (!c.cfg.summary) return '';
  let summary = '';
  try {
    const sf = path.join(c.adapter.stateDir, `summary-${c.i.sessionId}.txt`);
    summary = fs.readFileSync(sf, 'utf8').trim().split('\n')[0].slice(0, 500);
  } catch (e) {}
  if (!summary) summary = c.i.sessionName || '';
  if (!summary && c.msgHistory.length) {
    const firstUser = c.msgHistory.find(m => m.r === 'u');
    if (firstUser) summary = firstUser.t.replace(/\n/g, ' ').trim().slice(0, 60);
  }
  if (!summary) summary = `session ${c.i.sessionId.slice(0, 8)}`;
  return summary;
}

function formatMessages(c) {
  if (!c.cfg.history || !c.msgHistory) return [];
  return c.msgHistory.map(m => {
    const icon = m.r === 'u' ? `${COLORS.userMsg}▶${R}` : `${COLORS.asstMsg}◀${R}`;
    const text = truncate(m.t.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), c.MSG_W - 4);
    return `${icon} ${text}`;
  });
}

module.exports = {
  modelCell, repoRow,
  usageRow, quotaRow, agentsRow, memoryMcpRow, editedRow,
  summaryText, formatMessages,
};
