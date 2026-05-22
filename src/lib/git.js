const { spawnSync } = require('child_process');
const path = require('path');

function getGitInfo() {
  let branch = '', dirty = 0, repoName = '', topLevel = '';
  try {
    branch = (spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      { encoding: 'utf8', timeout: 2000 }).stdout || '').trim();
    dirty = (spawnSync('git', ['status', '--porcelain'],
      { encoding: 'utf8', timeout: 2000 }).stdout || '').trim().split('\n').filter(Boolean).length;
    const remoteUrl = (spawnSync('git', ['remote', 'get-url', 'origin'],
      { encoding: 'utf8', timeout: 2000 }).stdout || '').trim();
    topLevel = (spawnSync('git', ['rev-parse', '--show-toplevel'],
      { encoding: 'utf8', timeout: 2000 }).stdout || '').trim();
    const m = remoteUrl.match(/[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (m) {
      repoName = `${m[1]}/${m[2]}`;
    } else if (topLevel) {
      // No remote configured — fall back to <parent>/<basename> of the repo
      // root so a repo at /Users/x/.../ngoohebi/cli-status-lines reads as
      // "ngoohebi/cli-status-lines" rather than just "cli-status-lines".
      const base = path.basename(topLevel);
      const parent = path.basename(path.dirname(topLevel));
      repoName = parent && parent !== '/' && parent !== '.' ? `${parent}/${base}` : base;
    }
  } catch (e) {}
  return { branch, dirty, repoName, topLevel };
}

module.exports = { getGitInfo };
