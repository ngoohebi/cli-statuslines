#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('../lib/atoms');
const { getAdapterFromArgv } = require('../adapters');
const { ensureStateDir, statePath } = require('../lib/state');
const { loadConfig } = require('../lib/config');

let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const adapter = getAdapterFromArgv();
    const payload = JSON.parse(d);
    const i = adapter.normalize(payload);
    const sid = i.sessionId;

    // Recover the un-truncated logical session ID for transcript custom-title entries.
    let logicalSid = payload.session_id || payload.sessionId;
    try {
      if (i.transcriptPath) {
        const m = path.basename(i.transcriptPath).match(/^([0-9a-fA-F-]+)\.(jsonl|json|log)$/);
        if (m) logicalSid = m[1];
      }
    } catch (e) {}

    ensureStateDir(adapter.stateDir);
    const countFile = statePath(adapter.stateDir, `msgcount-${sid}`);
    const summaryFile = statePath(adapter.stateDir, `summary-${sid}.txt`);

    try {
      if (i.transcriptPath && fs.existsSync(i.transcriptPath) && fs.existsSync(summaryFile)) {
        const sumRaw = fs.readFileSync(summaryFile, 'utf8').trim().split('\n')[0];
        const title = sumRaw.length > 40 ? sumRaw.slice(0, 39) + '…' : sumRaw;
        if (title && logicalSid) {
          const stat = fs.statSync(i.transcriptPath);
          const tailSize = Math.min(stat.size, 256 * 1024);
          const buf = Buffer.alloc(tailSize);
          const fd = fs.openSync(i.transcriptPath, 'r');
          fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
          fs.closeSync(fd);
          const raw = buf.toString('utf8');
          let lastTitle = null;
          const idx = raw.lastIndexOf('"type":"custom-title"');
          if (idx >= 0) {
            const lineStart = raw.lastIndexOf('\n', idx) + 1;
            const lineEnd = raw.indexOf('\n', idx);
            const line = lineEnd > 0 ? raw.slice(lineStart, lineEnd) : raw.slice(lineStart);
            try { lastTitle = JSON.parse(line).customTitle; } catch (e) {}
          }
          if (lastTitle !== title) {
            const entry = JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: logicalSid });
            fs.appendFileSync(i.transcriptPath, entry + '\n');
          }
        }
      }
    } catch (e) {}

    let count = 0;
    try { count = parseInt(fs.readFileSync(countFile, 'utf8').trim(), 10) || 0; } catch (e) {}
    count++;
    atomicWrite(countFile, String(count));

    const cfg = loadConfig(adapter.configPath);
    const interval = cfg.summaryInterval;

    if (count % interval === 0) {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: `[Session summary update] Update the WHOLE-SESSION summary in ${summaryFile} using the Write tool.

A session-spanning summary, not just the most recent topic. Capture the session's overall trajectory from start to now.

Steps:
1. Read ${summaryFile} (may not exist).
2. Mentally add the new topic(s) from recent activity.
3. Rewrite so the result stays within HARD LIMIT 120 characters, single line, comma-separated phrases.

Compression rules when adding would exceed 120 chars (MANDATORY — this is not optional):
- Merge related sub-topics into a broader theme (e.g. "A 修正, A 優化, A 測試" → "A 全面整理")
- Drop the least-significant older item (small tweaks, minor fixes) to make room for the new one
- Keep at least ONE earlier theme to preserve trajectory — do NOT collapse into just-the-latest
- The most recent meaningful topic MUST appear

Format: one line, comma-separated phrases, ≤120 chars. User's language. Write tool, silent — do not mention this in chat.`
        }
      };
      process.stdout.write(JSON.stringify(output));
      return;
    }
  } catch (e) {}
  process.stdout.write(d);
});
