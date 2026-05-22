const { casMerge } = require('./atoms');

const STALE_SEC = 300;
const MAX_FUTURE_SEC = 8 * 86400;

function updateAndAggregate(snapshotFile, sid, canonical) {
  const nowSec = Math.floor(Date.now() / 1000);
  const short = canonical.rateLimits?.shortWindow;
  const long = canonical.rateLimits?.longWindow;
  const mySnap = {
    t: nowSec,
    short: short ? { used_percentage: short.usedPct, resets_at: short.resetsAt, period_sec: short.periodSec } : null,
    long: long ? { used_percentage: long.usedPct, resets_at: long.resetsAt, period_sec: long.periodSec } : null,
  };

  const snaps = casMerge(snapshotFile,
    (state) => {
      state[sid] = mySnap;
      for (const k of Object.keys(state)) {
        if (!state[k]?.t || nowSec - state[k].t > STALE_SEC) delete state[k];
      }
    },
    (after) => after[sid]?.t === mySnap.t
  );

  const aggMax = (field, myWindow) => {
    const liveSnaps = [];
    for (const snap of Object.values(snaps)) {
      const s = snap?.[field];
      if (s && typeof s.used_percentage === 'number'
          && s.resets_at > nowSec
          && s.resets_at - nowSec <= MAX_FUTURE_SEC) {
        liveSnaps.push(s);
      }
    }
    if (liveSnaps.length === 0) {
      return (myWindow?.resetsAt > nowSec && typeof myWindow.usedPct === 'number')
        ? myWindow.usedPct : 0;
    }
    let latestR = 0;
    for (const s of liveSnaps) if (s.resets_at > latestR) latestR = s.resets_at;
    let max = 0;
    for (const s of liveSnaps) {
      if (s.resets_at === latestR && s.used_percentage > max) max = s.used_percentage;
    }
    return max;
  };

  return {
    shortPct: Math.round(aggMax('short', short)),
    longPct: Math.round(aggMax('long', long)),
  };
}

function countdownSec(resetAt, periodSec) {
  if (!resetAt) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (resetAt > nowSec) return resetAt - nowSec;
  return periodSec - ((nowSec - resetAt) % periodSec);
}

module.exports = { updateAndAggregate, countdownSec };
