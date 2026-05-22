#!/usr/bin/env node
const { casMerge } = require('../lib/atoms');
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
    if (event !== 'SubagentStart' && event !== 'SubagentStop') {
      process.stdout.write(d); return;
    }

    ensureStateDir(adapter.stateDir);
    const file = statePath(adapter.stateDir, `agents-${i.sessionId}.json`);

    let name = i.agentType;
    if (!name && typeof i.agentId === 'string') {
      if (i.agentId.startsWith('acompact-')) name = 'compact';
    }
    if (!name) { process.stdout.write(d); return; }

    const key = (typeof i.agentId === 'string' && i.agentId)
      ? i.agentId : `${name}-${Date.now()}`;
    const myStamp = Date.now();

    casMerge(file,
      (state) => {
        if (event === 'SubagentStart') {
          state[key] = { name, status: 'running', started: myStamp };
        } else {
          const prev = state[key] || {};
          state[key] = { name, status: 'done', started: prev.started, finished: myStamp };
        }
        const entries = Object.entries(state);
        const running = entries.filter(([_, v]) => v.status === 'running');
        const done = entries.filter(([_, v]) => v.status === 'done')
          .sort((a, b) => b[1].finished - a[1].finished).slice(0, 20);
        for (const k of Object.keys(state)) delete state[k];
        for (const [k, v] of [...running, ...done]) state[k] = v;
      },
      (after) => {
        const e = after[key];
        if (!e) return false;
        return event === 'SubagentStart' ? e.started === myStamp : e.finished === myStamp;
      }
    );
  } catch (e) {}
  process.stdout.write(d);
});
