#!/usr/bin/env node
const fs = require('fs');
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
    ensureStateDir(adapter.stateDir);
    const file = statePath(adapter.stateDir, `msgs-${i.sessionId}.json`);

    const pushUnique = (r, t) => casMerge(file,
      (cur) => {
        const msgs = Array.isArray(cur) ? cur : [];
        const last = msgs[msgs.length - 1];
        if (last && last.r === r && last.t === t) return null;
        msgs.push({ r, t });
        return msgs.slice(-30);
      },
      (after) => {
        if (!Array.isArray(after)) return false;
        const last = after[after.length - 1];
        return last && last.r === r && last.t === t;
      }
    );

    if (i.hookEventName === 'UserPromptSubmit' && i.prompt) {
      const text = i.prompt.replace(/\n/g, ' ').trim();
      if (text.length > 2) pushUnique('u', text);
    } else if (i.hookEventName === 'Stop') {
      const tp = i.transcriptPath;
      if (tp && fs.existsSync(tp)) {
        const stat = fs.statSync(tp);
        const readSize = Math.min(stat.size, 500000);
        const buf = Buffer.alloc(readSize);
        const fd = fs.openSync(tp, 'r');
        fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
        fs.closeSync(fd);
        const lines = buf.toString('utf8').split('\n');
        for (let j = lines.length - 1; j >= 0; j--) {
          try {
            const entry = JSON.parse(lines[j]);
            if (entry.type !== 'assistant') continue;
            const c = entry.message?.content;
            let text = '';
            if (Array.isArray(c)) text = c.filter(b => b.type === 'text').map(b => b.text).join(' ');
            else if (typeof c === 'string') text = c;
            text = text.replace(/\n/g, ' ').trim();
            if (text.length > 5) { pushUnique('a', text); break; }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  process.stdout.write(d);
});
