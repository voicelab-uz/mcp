# nginx: OpenAI domain verification (`openai-apps-challenge`)

**Do not invent a token.** Paste the exact value from the OpenAI portal when identity/billing unlocks submission.

## Target URL

- Primary: `https://mcp.voicelab.uz/.well-known/openai-apps-challenge`
- Optional parent: `https://voicelab.uz/.well-known/openai-apps-challenge`

Must return **HTTP 200**, `Content-Type: text/plain`, body = exact token (no JSON/HTML).

## Current production nginx (2026-10-01)

File: `/etc/nginx/sites-available/mcp.voicelab.uz`

Today `location /` proxies **everything** to `http://127.0.0.1:3100`, so `/.well-known/openai-apps-challenge` would hit the Node app (likely 404) unless handled there.

## Recommended snippet (insert **before** `location /`)

```nginx
# OpenAI Apps domain verification — static file only
# Token file owned by deploy user; do not commit the token.
location = /.well-known/openai-apps-challenge {
    default_type text/plain;
    alias /opt/mcp/well-known/openai-apps-challenge;
    add_header Cache-Control "no-store";
    access_log off;
}
```

## One-time host prep (no token yet)

```bash
sudo mkdir -p /opt/mcp/well-known
sudo chown aisha:aisha /opt/mcp/well-known
# When portal gives the token:
#   printf '%s' 'PASTE_TOKEN_FROM_OPENAI_PORTAL' > /opt/mcp/well-known/openai-apps-challenge
#   chmod 644 /opt/mcp/well-known/openai-apps-challenge
# Then add the location block above, test, reload:
#   sudo nginx -t && sudo systemctl reload nginx
# Verify:
#   curl -sS https://mcp.voicelab.uz/.well-known/openai-apps-challenge
```

## Notes

- Verifier hits hostname **root** `/.well-known/...` (not under `/mcp`).
- Keep mTLS (if any) off this path; challenge fetch is separate from MCP client auth.
- Do **not** put a placeholder/fake token in the file — OpenAI compares exact portal value.
