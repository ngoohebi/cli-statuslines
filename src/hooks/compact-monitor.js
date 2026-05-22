#!/usr/bin/env node
const fs = require('fs');
const { atomicWrite } = require('../lib/atoms');
const { getAdapterFromArgv } = require('../adapters');
const { ensureStateDir, statePath } = require('../lib/state');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const adapter = getAdapterFromArgv();
    const payload = JSON.parse(d);
    const i = adapter.normalize(payload);
    ensureStateDir(adapter.stateDir);

    const file = statePath(adapter.stateDir, `compacts-${i.sessionId}.json`);
    let state = { count: 0, last: null };
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    state.count++;
    state.last = Date.now();
    atomicWrite(file, JSON.stringify(state));
  } catch (e) {}
  process.stdout.write(d);
});
