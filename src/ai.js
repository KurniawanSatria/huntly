'use strict';
const OpenAI = require('openai');

const DEFAULT_BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

const SYSTEM_PROMPT = `You are Huntly, an AI triage assistant for authorized bug bounty recon.
You receive passive recon data: HTTP security headers, tech fingerprint, and endpoint surface
(links, forms, scripts). You do NOT have permission to attack anything.

Your job:
1. Rank the findings most likely to yield a valid bug bounty report. Order by payout likelihood.
2. For each: name the attack class it points at, and explain WHY in one sentence.
   (e.g. "Missing CSP + inline scripts → stored XSS candidate").
3. Give the exact next MANUAL test the hunter should run (in Burp / DevTools / browser).
4. Flag false-positive risks and any scope concerns.
5. Do not generate attack payloads. Do not produce exploit code.

Be concrete, concise, and ordered. Use markdown with short bullets. Prioritize signal.`;

function getClient() {
  if (!process.env.NVIDIA_API_KEY) return null;
  return new OpenAI({
    baseURL: process.env.NVIDIA_BASE_URL || DEFAULT_BASE,
    apiKey: process.env.NVIDIA_API_KEY,
  });
}

function redact(report) {
  return {
    target: report.target,
    finalUrl: report.finalUrl,
    status: report.status,
    contentType: report.contentType,
    meta: report.meta,
    missingHeaders: report.headers.filter(h => !h.present).map(h => ({
      header: h.header,
      why: h.why,
    })),
    presentHeaders: report.headers.filter(h => h.present).map(h => ({
      header: h.header,
      value: h.value,
    })),
    tech: report.tech,
    endpoints: {
      totalLinks: report.endpoints.links.length,
      sampleLinks: report.endpoints.links.slice(0, 40),
      totalScripts: report.endpoints.scripts.length,
      sampleScripts: report.endpoints.scripts.slice(0, 20),
      forms: report.endpoints.forms.slice(0, 20),
    },
  };
}

async function aiTriage(report) {
  const client = getClient();
  if (!client) throw new Error('NVIDIA_API_KEY not set');

  const completion = await client.chat.completions.create({
    model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          'Here is the passive recon payload. Triage it:\n\n' +
          JSON.stringify(redact(report), null, 2),
      },
    ],
  });

  return completion.choices[0]?.message?.content || null;
}

module.exports = { aiTriage };