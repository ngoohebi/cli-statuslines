// Shared layout assembler — three adapters use the same row arrangement
// today, organised into visual sections separated by `null` dividers.
//
//   identity  — workspace + CLI/model
//   usage     — context/tokens/cost + quota
//   tools     — agents+mcp + memory
//   footer    — edited + git info
//
// Builders that return empty strings self-skip; if a whole section ends up
// empty, no divider is inserted for it.

const lb = require('../lib/layout-builders');

function buildLayout(c) {
  const rows = [];

  const pushSection = (entries) => {
    const present = entries.filter(Boolean);
    if (!present.length) return;
    if (rows.length > 0) rows.push(null);  // section divider
    for (const e of present) rows.push(e);
  };

  // Identity (CLI name + version + model + effort + duration).
  // Workspace folder name dropped — the git footer already identifies where
  // you are, so a separate path row was redundant.
  pushSection([
    lb.modelCell(c),
  ]);

  // Usage
  pushSection([
    lb.usageRow(c),
    lb.quotaRow(c),
  ]);

  // Tools (agents + MCP inline + memory)
  pushSection([
    lb.agentsRow(c),
    lb.memoryMcpRow(c),
  ]);

  // Footer (recent + git)
  pushSection([
    lb.editedRow(c),
    lb.repoRow(c),
  ]);

  return {
    summary: lb.summaryText(c),
    fullLeftRows: rows,
    formattedMsgs: lb.formatMessages(c),
  };
}

module.exports = { buildLayout };
