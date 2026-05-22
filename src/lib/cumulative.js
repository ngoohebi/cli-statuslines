const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./atoms');

const STEP_KEYS = ['cost', 'dur', 'add', 'rm', 'tok'];

function updateCumulative(stateDir, sid, canonical) {
  const curCost = canonical.totalCostUsd ?? 0;
  const curDur = canonical.totalDurationMs ?? 0;
  const curAdd = canonical.totalLinesAdded ?? 0;
  const curRm = canonical.totalLinesRemoved ?? 0;
  const curTok = (canonical.contextInputTokens ?? 0) + (canonical.contextOutputTokens ?? 0);
  const fieldCur = { cost: curCost, dur: curDur, add: curAdd, rm: curRm, tok: curTok };

  const cumPath = path.join(stateDir, `cum-${sid}.json`);

  let cum = {};
  for (const k of STEP_KEYS) cum[k] = { total: 0, base: fieldCur[k] };

  try {
    const stored = JSON.parse(fs.readFileSync(cumPath, 'utf8'));
    for (const k of STEP_KEYS) {
      if (stored[k] && typeof stored[k] === 'object') {
        cum[k] = {
          total: typeof stored[k].total === 'number' ? stored[k].total : 0,
          base: typeof stored[k].base === 'number' ? stored[k].base : fieldCur[k],
        };
      } else if (typeof stored[k] === 'number') {
        cum[k] = { total: stored[k], base: stored[k] };
      }
    }
  } catch (e) {}

  for (const k of STEP_KEYS) {
    const c = cum[k];
    const cur = fieldCur[k];
    if (cur >= c.base) { c.total += (cur - c.base); c.base = cur; }
    else { c.base = cur; }
  }

  let priorOnDisk = null;
  try { priorOnDisk = JSON.parse(fs.readFileSync(cumPath, 'utf8')); } catch (e) {}
  if (priorOnDisk) {
    for (const k of STEP_KEYS) {
      const stTotal = priorOnDisk[k]?.total;
      if (typeof stTotal === 'number' && stTotal > cum[k].total) {
        cum[k].total = stTotal;
      }
    }
  }

  try {
    if (priorOnDisk) {
      atomicWrite(cumPath.replace(/\.json$/, '.bak.json'), JSON.stringify(priorOnDisk));
    }
  } catch (e) {}

  atomicWrite(cumPath, JSON.stringify(cum));
  writeAuditLog(stateDir, sid, priorOnDisk, cum);

  return cum;
}

function writeAuditLog(stateDir, sid, priorOnDisk, cum) {
  try {
    const oldCost = priorOnDisk?.cost?.total || 0;
    const newCost = cum.cost.total;
    if (Math.abs(newCost - oldCost) >= 0.01) {
      const auditPath = path.join(stateDir, 'audit.log');
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        sid,
        kind: 'cost',
        before: oldCost,
        after: newCost,
        delta: +(newCost - oldCost).toFixed(4),
      }) + '\n';
      fs.appendFileSync(auditPath, line);
      try {
        if (fs.statSync(auditPath).size > 1024 * 1024) {
          try { fs.renameSync(auditPath, auditPath + '.1'); } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function getActiveTime(stateDir, sid) {
  try {
    const aPath = path.join(stateDir, `active-${sid}.json`);
    const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
    if (typeof a.activeMs === 'number') return a.activeMs;
  } catch (e) {}
  return 0;
}

function aggregateAllSessions(stateDir, aggWindowDays) {
  const maxAgeMs = aggWindowDays > 0 ? aggWindowDays * 86400 * 1000 : Infinity;
  const CUM_RE = /^cum-[0-9a-f]{24}\.json$/;
  const now = Date.now();
  let totalCost = 0, totalTok = 0;

  try {
    for (const f of fs.readdirSync(stateDir)) {
      if (!CUM_RE.test(f)) continue;
      const full = path.join(stateDir, f);
      try {
        if (now - fs.statSync(full).mtimeMs > maxAgeMs) continue;
        const c = JSON.parse(fs.readFileSync(full, 'utf8'));
        totalCost += c.cost?.total || 0;
        totalTok += c.tok?.total || 0;
      } catch (e) {}
    }
  } catch (e) {}

  return { totalCost, totalTok };
}

module.exports = { updateCumulative, getActiveTime, aggregateAllSessions };
