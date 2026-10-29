'use strict';
const fs = require('fs');
const path = require('path');

function loadScope(scopePath) {
  const p = path.isAbsolute(scopePath)
    ? scopePath
    : path.resolve(process.cwd(), scopePath);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.domains)) {
      throw new Error('scope file missing "domains" array');
    }
    return parsed;
  } catch (e) {
    console.error(`warn: could not parse scope file ${p}: ${e.message}`);
    return null;
  }
}

module.exports = { loadScope };