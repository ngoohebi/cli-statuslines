const R = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const CYAN = '\x1b[36m', GREEN = '\x1b[32m', RED = '\x1b[31m';
const YELLOW = '\x1b[33m', MAGENTA = '\x1b[35m', BLUE = '\x1b[34m';

// One 256-color accent kept for the "xhigh" effort level only.
const ORANGE = '\x1b[38;5;208m';

function fmtDuration(min) {
  if (min < 60) return `${min}min`;
  if (min < 1440) {
    const h = Math.floor(min / 60), m = min % 60;
    return m > 0 ? `${h}hr ${m}min` : `${h}hr`;
  }
  const dd = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  return h > 0 ? `${dd}d ${h}hr` : `${dd}d`;
}

function fmtTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

function bar(pct, len = 10, chars) {
  const filled = Math.round(pct / 100 * len);
  const f = (chars && chars.filled) || '█';
  const e = (chars && chars.empty) || '░';
  // Empty cells styled in the muted barEmpty color so the filled portion pops.
  const { COLORS, RESET } = require('./theme');
  return f.repeat(filled) + COLORS.barEmpty + e.repeat(len - filled) + RESET;
}

function colorByPct(pct) {
  const { COLORS } = require('./theme');
  if (pct >= 80) return COLORS.barHigh;
  if (pct >= 50) return COLORS.barMid;
  return COLORS.barLow;
}

// Same thresholds, cool palette — used for the context-window bar so it
// reads distinct from the warm quota bars at a glance.
function ctxColorByPct(pct) {
  const { COLORS } = require('./theme');
  if (pct >= 80) return COLORS.ctxBarHigh;
  if (pct >= 50) return COLORS.ctxBarMid;
  return COLORS.ctxBarLow;
}

function effortColor(level) {
  const { COLORS } = require('./theme');
  const map = {
    low: COLORS.effortLow,
    default: COLORS.effortDefault,
    medium: COLORS.effortMedium,
    high: COLORS.effortHigh,
    xhigh: COLORS.effortXhigh,
    max: COLORS.effortMax,
  };
  return map[level] || COLORS.effortDefault;
}

module.exports = {
  R, DIM, BOLD,
  CYAN, GREEN, RED, YELLOW, MAGENTA, BLUE,
  fmtDuration, fmtTokens, ago, bar, colorByPct, ctxColorByPct, effortColor,
};
