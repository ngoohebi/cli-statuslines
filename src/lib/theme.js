// Unified visual theme for all CLI statuslines.
// Chrome (borders, glyph, bar chars, divider) and a semantic COLORS palette
// (data-type → color) live here. Any visual change should land in this file.

const RESET = '\x1b[0m';

// "Abyss" palette — proper dark theme. All accents sit in the deep 24-130
// range of the 256-color cube; chrome uses the 234-240 grey ramp. Nothing
// in the palette glows or pops — everything recedes into the dark.
const COLORS = {
  // Chrome
  border:   '\x1b[38;5;236m',  // very dark grey
  label:    '\x1b[38;5;240m',  // dark grey labels

  // Identity
  glyph:    '\x1b[38;5;24m',   // deep teal-blue glyph
  dir:      '\x1b[38;5;60m',   // deep slate path
  vendor:   '\x1b[38;5;60m',   // deep slate vendor tag
  model:    '\x1b[38;5;91m',   // deep purple model name
  repo:     '\x1b[38;5;65m',   // dark sage repo name
  branch:   '\x1b[38;5;95m',   // dark mauve branch

  // Status / values
  positive: '\x1b[38;5;65m',   // dark sage (cost, healthy mcp, memory ✓, added)
  negative: '\x1b[38;5;95m',   // dark mauve-red (removed lines)
  warn:     '\x1b[38;5;130m',  // dark gold (mid-pct)
  error:    '\x1b[38;5;88m',   // deep red (high-pct danger)

  // Progress bars — quota WARM family
  barLow:   '\x1b[38;5;65m',   // dark sage
  barMid:   '\x1b[38;5;130m',  // dark gold
  barHigh:  '\x1b[38;5;88m',   // deep red
  barEmpty: '\x1b[38;5;234m',  // nearly black

  // Context bar — COOL family for visual distinction
  ctxBarLow:  '\x1b[38;5;24m',  // deep teal-blue
  ctxBarMid:  '\x1b[38;5;60m',  // deep slate
  ctxBarHigh: '\x1b[38;5;91m',  // deep purple

  // Message arrows
  userMsg:  '\x1b[38;5;60m',   // deep slate
  asstMsg:  '\x1b[38;5;65m',   // dark sage

  // Effort levels
  effortLow:     '\x1b[38;5;238m',
  effortDefault: '\x1b[38;5;65m',
  effortMedium:  '\x1b[38;5;65m',
  effortHigh:    '\x1b[38;5;130m',
  effortXhigh:   '\x1b[38;5;94m',
  effortMax:     '\x1b[38;5;88m',

  // Agents
  agentRunning: '\x1b[38;5;130m',
  agentDone:    '\x1b[38;5;65m',
};

const THEME = {
  // Rounded box-drawing — modern, soft, reads well at every width.
  border: {
    tl: '╭', tr: '╮', bl: '╰', br: '╯',
    h: '─', v: '│',
    lt: '├', rt: '┤', tt: '┬', bt: '┴', x: '┼',
  },
  glyph: '▎',
  bar: { filled: '█', empty: '░' },
  divider: '·',
  colors: COLORS,
  reset: RESET,
};

module.exports = { THEME, COLORS, RESET };
