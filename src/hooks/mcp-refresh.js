#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { atomicWrite } = require('../lib/atoms');

const CACHE = path.join(os.homedir(), '.claude', 'mcp-status-cache.json');
const STALE_MS = 90 * 1000;

try {
  const stat = fs.statSync(CACHE);
  if (Date.now() - stat.mtimeMs < STALE_MS) process.exit(0);
} catch (e) {}

function findClaude() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
    path.join(os.homedir(), '.local', 'bin', 'claude.cmd'),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
}

const bin = findClaude();
const targetCwd = process.argv[2] && fs.existsSync(process.argv[2]) ? process.argv[2] : os.homedir();
let r;
const spawnOpts = { encoding: 'utf8', timeout: 15000, cwd: targetCwd, windowsHide: true };

if (bin) {
  r = spawnSync(bin, ['mcp', 'list'], spawnOpts);
} else {
  const cmd = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  r = spawnSync(cmd, ['mcp', 'list'], { ...spawnOpts, shell: true });
}

const out = (r.stdout || '') + (r.stderr || '');
if (!out.trim()) process.exit(0);

const servers = {};
for (const raw of out.split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('Checking')) continue;
  const sepIdx = line.lastIndexOf(' - ');
  if (sepIdx < 0) continue;
  const left = line.slice(0, sepIdx);
  const statusRaw = line.slice(sepIdx + 3).trim();
  const colonIdx = left.indexOf(': ');
  if (colonIdx < 0) continue;
  const name = left.slice(0, colonIdx).trim();
  if (!name) continue;
  let status = 'unknown';
  if (/Connected/i.test(statusRaw)) status = 'connected';
  else if (/Failed/i.test(statusRaw)) status = 'failed';
  else if (/Needs authentication|Not authenticated/i.test(statusRaw)) status = 'auth';
  else if (/Disconnected/i.test(statusRaw)) status = 'disconnected';
  servers[name] = { status, detail: statusRaw };
}

atomicWrite(CACHE, JSON.stringify({ updated: Date.now(), servers }, null, 2));
