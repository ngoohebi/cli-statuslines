const fs = require('fs');
const path = require('path');

function ensureStateDir(stateDir) {
  try { fs.mkdirSync(stateDir, { recursive: true }); } catch (e) {}
}

function statePath(stateDir, filename) {
  return path.join(stateDir, filename);
}

module.exports = { ensureStateDir, statePath };
