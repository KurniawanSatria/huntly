'use strict';

function hostMatches(host, pattern) {
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    const root = pattern.slice(2).toLowerCase();
    const h = host.toLowerCase();
    return h === root || h.endsWith('.' + root);
  }
  return host.toLowerCase() === pattern.toLowerCase();
}

function isInScope(url, scope) {
  if (!scope || !Array.isArray(scope.domains) || scope.domains.length === 0) {
    return { ok: false, reason: 'no scope file or empty domains list' };
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  const matched = scope.domains.find(p => hostMatches(host, p));
  if (matched) return { ok: true, matched };
  return {
    ok: false,
    reason: `host "${host}" is not covered by any domain in scope file [${scope.domains.join(', ')}]`,
  };
}

module.exports = { isInScope, hostMatches };