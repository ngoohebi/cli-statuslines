const fs = require('fs');
const { atomicWrite } = require('./atoms');

const ROW_DEFAULTS = {
  summary: 1, dir: 1, repo: 1, model: 1, duration: 1,
  cost: 1, usage: 1, quota: 1, agents: 1,
  memory_mcp: 1, edited: 1, history: 1,
};

function loadConfig(configPath) {
  const cfg = { ...ROW_DEFAULTS, enabled: true, aggWindowDays: 0, summaryInterval: 10 };
  try {
    const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    for (const k of Object.keys(ROW_DEFAULTS)) {
      if (k in stored) cfg[k] = !!stored[k];
    }
    if (stored.enabled === false) cfg.enabled = false;
    if (typeof stored.aggWindowDays === 'number' && stored.aggWindowDays >= 0) {
      cfg.aggWindowDays = Math.floor(stored.aggWindowDays);
    }
    if (typeof stored.summaryInterval === 'number' && stored.summaryInterval >= 1) {
      cfg.summaryInterval = Math.floor(stored.summaryInterval);
    }
    if (typeof stored.statuslineWidth === 'number' && stored.statuslineWidth > 0) {
      cfg.statuslineWidth = Math.floor(stored.statuslineWidth);
    }
    if (typeof stored.statuslineWidthOffset === 'number' && stored.statuslineWidthOffset >= 0) {
      cfg.statuslineWidthOffset = Math.floor(stored.statuslineWidthOffset);
    }
  } catch (e) {}
  return cfg;
}

function saveConfig(configPath, cfg) {
  atomicWrite(configPath, JSON.stringify(cfg, null, 2));
}

function showRow(cfg, key) {
  return !!cfg[key];
}

module.exports = { ROW_DEFAULTS, loadConfig, saveConfig, showRow };
