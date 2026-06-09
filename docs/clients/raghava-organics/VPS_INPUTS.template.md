# VPS inputs — Raghava Organics (template)

Copy to `VPS_INPUTS.md` (gitignored) and fill before VPS deploy.

See [README.md](./README.md) for execution order.

| Field | Value |
|-------|-------|
| `PRODUCTION_DOMAIN` | `raghavaorganics.com` |
| `DNS_PROVIDER` | Cloudflare (nameservers at Namecheap) |
| `IMAGE_CDN_HOST` | `cdn.raghavaorganics.com` |
| `VPS_IP` | |
| `DEPLOY_USER` | |
| `GIT_REPO_URL` | |

Ports: `BACKEND_PORT=3001`, `STOREFRONT_PORT=3101`, `CLIENT_ID=raghava-organics`

## Cloudflare R2 (Ops UI — Product Media)

Non-secret values: [CLOUDFLARE_R2_MEDIA.md](./CLOUDFLARE_R2_MEDIA.md). Store `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` only in the filled `VPS_INPUTS.md` vault — never commit.
