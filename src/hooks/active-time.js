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
    const event = i.hookEventName;
    if (event !== 'UserPromptSubmit' && event !== 'Stop') {
      process.stdout.write(d); return;
    }

    ensureStateDir(adapter.stateDir);
    const activePath = statePath(adapter.stateDir, `active-${i.sessionId}.json`);

    let active = {};
    try { active = JSON.parse(fs.readFileSync(activePath, 'utf8')); } catch (e) {}

    const NOW_MS = Date.now();

    if (active.activeMs === undefined) {
      active.activeMs = 0;
      if (i.transcriptPath) {
        try {
          const raw = fs.readFileSync(i.transcriptPath, 'utf8');
          let lastUserTs = null;
          for (const line of raw.split('\n')) {
            if (!line) continue;
            try {
              const entry = JSON.parse(line);
              const t = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
              if (!t) continue;
              if (entry.type === 'user') lastUserTs = t;
              else if (entry.type === 'assistant' && lastUserTs) {
                if (t > lastUserTs) active.activeMs += t - lastUserTs;
                lastUserTs = null;
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    if (event === 'UserPromptSubmit') {
      active.turnStartAt = NOW_MS;
    } else {
      if (active.turnStartAt) {
        const dur = NOW_MS - active.turnStartAt;
        if (dur > 0 && dur < 24 * 60 * 60 * 1000) active.activeMs += dur;
        active.turnStartAt = null;
      }
    }

    atomicWrite(activePath, JSON.stringify(active));
  } catch (e) {}
  process.stdout.write(d);
});
