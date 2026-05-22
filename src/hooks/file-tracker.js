#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
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
    const fp = i.toolInput?.file_path;
    if (!fp) { process.stdout.write(d); return; }

    ensureStateDir(adapter.stateDir);
    const file = statePath(adapter.stateDir, `files-${i.sessionId}.json`);
    let files = [];
    try { files = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    const name = path.basename(fp);
    files = [name, ...files.filter(f => f !== name)].slice(0, 8);
    atomicWrite(file, JSON.stringify(files));
  } catch (e) {}
  process.stdout.write(d);
});
