# huntly

Interactive recon + AI triage CLI for **authorized** bug bounty testing.

`huntly` does passive reconnaissance on a single target — security headers,
tech fingerprint, endpoint surface — then asks **Nemotron 3 Ultra** to rank
findings likely to yield a valid report and suggest the next manual test.

It does not send attack payloads. It is a triage layer on top of Burp / nuclei.

## Install

```bash
git clone https://github.com/KurniawanSatria/huntly.git && cd huntly
npm install && npm link
```

Requires Node.js ≥ 18.

## Setup AI (optional)

```bash
cp .env.example .env
# edit → NVIDIA_API_KEY=nvapi-...
```

Get a free key at https://build.nvidia.com. Without it, huntly still runs
recon — AI triage is skipped.

## Setup scope (recommended)

```bash
cp .huntly-scope.json.example .huntly-scope.json
```

```json
{
  "program": "Example Bug Bounty",
  "domains": ["*.example.com", "app.example.org"]
}
```

If the target is not covered, huntly warns and asks for explicit confirmation
before proceeding.

## Usage

```bash
huntly https://app.example.com
huntly https://app.example.com -y
huntly https://app.example.com --json > report.json
huntly https://app.example.com --no-ai
huntly https://app.example.com --scope ./h1-scope.json
```

## Flags

| Flag | Effect |
|---|---|
| `-y, --yes` | Skip authorization prompt |
| `--json` | Emit JSON on stdout |
| `--no-ai` | Skip AI triage |
| `--scope <path>` | Alternate scope file |
| `-h` / `-V` | Help / version |

## Environment

| Var | Required | Default |
|---|---|---|
| `NVIDIA_API_KEY` | for AI triage | — |
| `NVIDIA_BASE_URL` | no | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | no | `nvidia/nemotron-3-ultra-550b-a55b` |
| `DEBUG` | no | unset |

## What it checks

**Security headers (8):** CSP, XFO, XCTO, HSTS, Referrer-Policy,
Permissions-Policy, COOP, CORP.

**Tech fingerprint:** Server / X-Powered-By / Via headers, WordPress paths,
`meta[generator]`, Angular, Next.js, React, Vue, framework CSRF tokens,
public CDN scripts.

**Endpoint surface:** Unique links (max 200), scripts (max 100), and forms
(action, method, input names).

## Output

**Human mode:** colorized sections (page meta, headers, tech, endpoints, AI).

**JSON mode:** single object on stdout (spinners go to stderr, pipes clean):

```bash
huntly https://app.example.com --json | jq '.aiTriage'
```

JSON shape:

```
{
  target, finalUrl, status, contentType, contentLength,
  headers:  [{ header, key, present, value, why }],
  rawHeaders, tech[], meta{title,description,language},
  endpoints: { links[], forms[], scripts[] },
  fetchedAt, aiTriage
}
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Fatal error |
| 2 | Bad URL / args |
| 3 | Out of scope |
| 4 | Authorization denied |
| 5 | Recon fetch failed |

## AI triage

Recon payload (no attack traffic) is sent to Nemotron with a system prompt
asking for: top attack surfaces ranked by payout, the attack class each
points at, the exact manual next test, and false-positive risks. Payload
generation is explicitly forbidden in the prompt.

## Safety

huntly only issues `GET` requests, only reads public HTML / headers, sends
no payloads, doesn't fuzz or brute force, and refuses out-of-scope targets
without confirmation. One request per invocation.

You are still responsible for: reading program scope, only testing
authorized targets, and following rate limits. Unauthorized scanning is
illegal (CFAA, Computer Misuse Act, UU ITE, etc.).

## Roadmap

- Per-program configs (`~/.huntly/programs/<name>.json`)
- Passive subdomain enum (crt.sh)
- Nuclei subprocess bridge
- TLS cert parse
- Markdown / HTML report export
- Diff mode (header / tech drift)

## License

MIT