'use strict';
const axios = require('axios');
const cheerio = require('cheerio');
const ora = require('ora');

const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB — skip cheerio on huge responses
const MAX_LINKS = 200;
const MAX_SCRIPTS = 100;

const SECURITY_HEADERS = [
  ['content-security-policy', 'CSP', 'mitigates XSS / script injection'],
  ['x-frame-options', 'XFO', 'clickjacking protection'],
  ['x-content-type-options', 'XCTO', 'MIME sniffing protection'],
  ['strict-transport-security', 'HSTS', 'forces HTTPS'],
  ['referrer-policy', 'Referrer-Policy', 'controls referrer leakage'],
  ['permissions-policy', 'Permissions-Policy', 'gates browser features'],
  ['cross-origin-opener-policy', 'COOP', 'cross-origin isolation'],
  ['cross-origin-resource-policy', 'CORP', 'cross-origin resource loading'],
];

async function fetchTarget(url, { quiet } = {}) {
  const spinner = quiet ? null : ora(`fetching ${url}`).start();
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: MAX_HTML_BYTES,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'huntly/0.1 (+authorized bug-bounty recon)',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });
    spinner?.succeed(
      `${res.status} ${res.statusText || ''} — ${res.headers['content-type'] || 'unknown type'}`
    );
    return res;
  } catch (e) {
    spinner?.fail(`fetch failed: ${e.message}`);
    return null;
  }
}

function analyzeHeaders(res) {
  const h = res.headers || {};
  return SECURITY_HEADERS.map(([key, name, why]) => ({
    header: name,
    key,
    present: !!h[key],
    value: h[key] ? String(h[key]).slice(0, 300) : null,
    why,
  }));
}

function fingerprint(res, $) {
  const tech = new Set();
  const s = res.headers['server'];
  const p = res.headers['x-powered-by'];
  const via = res.headers['via'];
  if (s) tech.add(`Server: ${s}`);
  if (p) tech.add(`X-Powered-By: ${p}`);
  if (via) tech.add(`Via: ${via}`);

  if ($) {
    if ($('script[src*="wp-content"], link[href*="wp-content"]').length) tech.add('WordPress');
    const gen = $('meta[name="generator"]').attr('content');
    if (gen) tech.add(`Generator: ${gen}`);
    if ($('[ng-version]').length) tech.add(`Angular (${$('[ng-version]').first().attr('ng-version')})`);
    else if ($('[ng-app]').length) tech.add('AngularJS');
    if ($('#__next').length) tech.add('Next.js');
    if ($('[data-reactroot]').length) tech.add('React (legacy root)');
    if ($('[data-v-app]').length) tech.add('Vue');
    if ($('meta[name="csrf-token"], meta[name="_csrf"]').length) tech.add('CSRF meta token (framework present)');
    if ($('script[src*="cdn.jsdelivr"], script[src*="unpkg"]').length) tech.add('public CDN scripts');
  }
  return [...tech];
}

function extractMeta($) {
  if (!$) return {};
  return {
    title: $('title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content') || null,
    language: $('html').attr('lang') || null,
  };
}

function extractEndpoints($, baseUrl) {
  if (!$) return { links: [], forms: [], scripts: [] };

  const links = new Set();
  const scripts = new Set();
  const forms = [];

  $('a[href]').each((_, el) => {
    if (links.size >= MAX_LINKS) return false;
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try { links.add(new URL(href, baseUrl).href); } catch {}
  });

  $('script[src]').each((_, el) => {
    if (scripts.size >= MAX_SCRIPTS) return false;
    try { scripts.add(new URL($(el).attr('src'), baseUrl).href); } catch {}
  });

  $('form').each((_, el) => {
    forms.push({
      action: $(el).attr('action') || '(self)',
      method: ($(el).attr('method') || 'GET').toUpperCase(),
      inputs: $(el).find('input,select,textarea')
        .map((_, i) => $(i).attr('name'))
        .get()
        .filter(Boolean),
    });
  });

  return { links: [...links], forms, scripts: [...scripts] };
}

async function runRecon(url, opts = {}) {
  const res = await fetchTarget(url, opts);
  if (!res) return null;

  const ct = String(res.headers['content-type'] || '');
  let $ = null;
  if (ct.includes('html') && typeof res.data === 'string') {
    try { $ = cheerio.load(res.data); } catch { $ = null; }
  }

  const finalUrl =
    res.request?.res?.responseUrl ||
    res.request?._redirectable?._currentUrl ||
    url;

  return {
    target: url,
    finalUrl,
    status: res.status,
    contentType: ct,
    contentLength: res.headers['content-length'] || null,
    headers: analyzeHeaders(res),
    rawHeaders: res.headers,
    tech: fingerprint(res, $),
    meta: extractMeta($),
    endpoints: extractEndpoints($, finalUrl),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { runRecon };