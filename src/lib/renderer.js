const { pad, fit, isWide } = require('./unicode');
const { THEME, COLORS, RESET } = require('./theme');
const R = RESET;

function repeat(ch, n) { return ch.repeat(n); }
function h(c) { return `${COLORS.border}${c}${RESET}`; }

function wrapSummary(summary, maxWidth, maxLines) {
  const lines = [];
  let curLine = '', curW = 0, truncated = false;
  const chars = [...summary];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cw = isWide(ch.codePointAt(0)) ? 2 : 1;
    if (curW + cw > maxWidth && curLine) {
      if (lines.length + 1 >= maxLines) {
        const rest = chars.slice(i).join('');
        if (rest.length > 0) {
          while (curW + 1 > maxWidth && curLine) {
            const last = curLine[curLine.length - 1];
            curW -= isWide(last.codePointAt(0)) ? 2 : 1;
            curLine = curLine.slice(0, -1);
          }
          lines.push(curLine + '…');
          truncated = true;
          break;
        }
      }
      lines.push(curLine);
      curLine = ch; curW = cw;
    } else {
      curLine += ch; curW += cw;
    }
  }
  if (!truncated && curLine && lines.length < maxLines) lines.push(curLine);
  if (!lines.length) lines.push('');
  return lines;
}

// Renders:
//   ╭───┬───╮            top border (with msg-column tee when showMsgs)
//   │ session  ... │ msg │   summary rows
//   ├───────────────┤ msg │   summary→body divider
//   │ row content   │ msg │   fullLeftRows (strings)
//   ├───────────────┤ msg │   `null` entries become section dividers
//   │ row content   │ msg │
//   ╰───┴───╯            bottom border
//
// All width math is driven by the caller; LEFT_W is the content area inside
// the box (not counting the side borders), MSG_W is the right column width
// (0 = no right column).
function renderDashboard(data) {
  const { summary, fullLeftRows, rightMsgs, showMsgs, LEFT_W, MSG_W } = data;
  const b = THEME.border;
  const hasSummary = !!summary;

  const sumLines = hasSummary ? wrapSummary(summary, LEFT_W - 10, 4) : [];

  // One render row per: summary line, every fullLeftRows entry, and one
  // divider between summary and body (when both exist).
  const summarySepDivider = hasSummary && fullLeftRows.length > 0 ? 1 : 0;
  const totalSlots = sumLines.length + fullLeftRows.length + summarySepDivider;

  // Slot right-column messages over those rows.
  const slottedMsgs = [];
  if (showMsgs && rightMsgs) {
    const sliced = rightMsgs.slice(-totalSlots);
    const padCount = Math.max(0, totalSlots - sliced.length);
    for (let j = 0; j < padCount; j++) slottedMsgs.push('');
    for (const m of sliced) slottedMsgs.push(m);
  }

  let ri = 0;
  const rcell = () => {
    if (!showMsgs) return '';
    const content = fit(slottedMsgs[ri] || '', MSG_W - 2);
    ri++;
    return ` ${content} ${h(b.v)}`;
  };

  const out = [];

  // Top border
  if (showMsgs) {
    out.push(`${h(b.tl)}${h(repeat(b.h, LEFT_W))}${h(b.tt)}${h(repeat(b.h, MSG_W))}${h(b.tr)}`);
  } else {
    out.push(`${h(b.tl)}${h(repeat(b.h, LEFT_W))}${h(b.tr)}`);
  }

  // Summary rows
  if (hasSummary) {
    for (let si = 0; si < sumLines.length; si++) {
      const label = si === 0 ? `${COLORS.label}session${R} ` : ' '.repeat(8);
      out.push(`${h(b.v)} ${label}${pad(sumLines[si], LEFT_W - 10)} ${h(b.v)}${rcell()}`);
    }
    if (fullLeftRows.length > 0) {
      out.push(`${h(b.lt)}${h(repeat(b.h, LEFT_W))}${h(b.rt)}${rcell()}`);
    }
  }

  // Body rows. `null` entries are explicit section dividers.
  for (let j = 0; j < fullLeftRows.length; j++) {
    if (fullLeftRows[j] === null) {
      out.push(`${h(b.lt)}${h(repeat(b.h, LEFT_W))}${h(b.rt)}${rcell()}`);
    } else {
      out.push(`${h(b.v)} ${pad(fullLeftRows[j], LEFT_W - 2)} ${h(b.v)}${rcell()}`);
    }
  }

  // Bottom border
  if (showMsgs) {
    out.push(`${h(b.bl)}${h(repeat(b.h, LEFT_W))}${h(b.bt)}${h(repeat(b.h, MSG_W))}${h(b.br)}`);
  } else {
    out.push(`${h(b.bl)}${h(repeat(b.h, LEFT_W))}${h(b.br)}`);
  }

  return out.join('\n');
}

module.exports = { renderDashboard, wrapSummary };
