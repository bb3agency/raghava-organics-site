# Raghava Organics — VPS Deployment Pack

Use this pack when executing [CLIENT_ONBOARDING_EXECUTION_ORDER.md](../../../backend/docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md) Phases 6–8. **Do not commit production secrets to git.**

Fill [VPS_INPUTS.md](./VPS_INPUTS.md) first, then run scripts under [scripts/](./scripts/).

## Client identity

| Field | Value |
|-------|-------|
| Client name | Raghava Organics |
| `CLIENT_ID` | `raghava-organics` |
| `BACKEND_PORT` | `3001` (confirm free on VPS) |
| `STOREFRONT_PORT` | `3101` |
| `POSTGRES_DB` (host) | `raghava_organics` |
| VPS backend path | `/var/www/raghava-organics/backend` |
| VPS frontend path | `/var/www/raghava-organics/frontend` |
| Local API (dev) | `http://localhost:3000/api/v1` |
| Production API | `https://raghavaorganics.com/api/v1` |
| Production domain | `raghavaorganics.com` |
| VPS IP | `178.104.46.202` |

## Phase 1 production `.env` (bootstrap-only)

Copy to VPS `/var/www/raghava-organics/backend/.env` from vault. Template: [production.backend.env.example](./production.backend.env.example)

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Do not** put Razorpay, Delhivery/Shiprocket, MSG91, webhook tokens, or `OPS_METRICS_TOKEN` in `.env` — configure via Ops UI after Phase 8. See [ENV_VS_DB_CONFIG_REFERENCE.md](../../../backend/docs/ENV_VS_DB_CONFIG_REFERENCE.md).

## GitHub Actions (CD)

See [GITHUB_CD_SETUP.md](./GITHUB_CD_SETUP.md).

## Nginx

Templates in [backend/nginx/](../../../backend/nginx/):

1. `rate-zones.conf.template` → `/etc/nginx/snippets/rate-zones.conf` (in `http {}`)
2. `client.conf.template` → `/etc/nginx/sites-available/raghava-organics.conf`
3. `proxy_pass` → `127.0.0.1:3001` (API), storefront → `127.0.0.1:3101`
4. `certbot --nginx -d <PRODUCTION_DOMAIN>`

## Webhook URLs (after TLS)

- `https://<PRODUCTION_DOMAIN>/api/v1/payments/webhook`
- `https://<PRODUCTION_DOMAIN>/api/v1/shipping/webhook`

## Frontend production env

See [frontend/.env.production.example](../../../frontend/.env.production.example) on VPS as `.env.production.local`.
