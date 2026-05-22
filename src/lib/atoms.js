const fs = require('fs');

function atomicWrite(filepath, data) {
  const tmp = `${filepath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filepath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

function casMerge(filepath, mutate, verify, maxRetries = 10) {
  let finalState = {};
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let cur = {};
    try { cur = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch (e) {}
    const result = mutate(cur);
    if (result === null) return false;
    const toWrite = result !== undefined ? result : cur;
    atomicWrite(filepath, JSON.stringify(toWrite));
    let after = {};
    try { after = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch (e) {}
    finalState = after;
    if (verify(after)) return finalState;
  }
  return finalState;
}

module.exports = { atomicWrite, casMerge };
