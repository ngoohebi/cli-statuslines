const path = require('path');

function deriveSessionId(input) {
  let logicalSid = input.session_id;
  try {
    if (input.transcript_path) {
      const m = path.basename(input.transcript_path).match(/^([0-9a-fA-F-]+)\.jsonl$/);
      if (m) logicalSid = m[1];
    }
  } catch (e) {}
  return (logicalSid || 'default').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 24);
}

module.exports = { deriveSessionId };
