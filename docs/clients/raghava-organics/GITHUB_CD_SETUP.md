# GitHub CD — Raghava Organics

Reference: [backend/.github/workflows/deploy.yml](../../../backend/.github/workflows/deploy.yml)

## Repository variables

| Name | Value |
|------|-------|
| `VPS_DEPLOY_ENABLED` | `true` |
| `VPS_RUNNER_LABEL` | `raghava-organics-vps` |
| `FRONTEND_DEPLOY_ENABLED` | `true` |

## Repository secrets

| Name | Value |
|------|-------|
| `VPS_CLIENT_PATH` | `/var/www/raghava-organics/backend` |
| `VPS_FRONTEND_PATH` | `/var/www/raghava-organics/frontend` |

## Self-hosted runner (on VPS)

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# Download runner package from GitHub → Settings → Actions → Runners → New
./config.sh --url https://github.com/<org>/<repo> --token <TOKEN> \
  --name "raghava-organics-vps" \
  --labels "self-hosted,raghava-organics-vps" \
  --unattended
sudo ./svc.sh install && sudo ./svc.sh start
```

Deploy flow: push to `main` → Reliability CI green → `deploy.yml` → `backend/scripts/vps-deploy.sh` and `vps-frontend-deploy.sh`.
