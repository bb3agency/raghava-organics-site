# GitHub CD — <Client Name>

> **Copy to:** `docs/clients/<client-id>/GITHUB_CD_SETUP.md`  
> **Full guide:** [backend/docs/GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md](../../GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md)  
> **Template summary:** [backend/docs/CLIENT_VPS_SETUP_GUIDE.md](../../CLIENT_VPS_SETUP_GUIDE.md) §22

---

## Client identity

| Field | Value |
|-------|-------|
| GitHub repo | `https://github.com/<org>/<repo>` |
| `CLIENT_ID` | `<client-id>` |
| VPS IP | `<vps-ip>` |
| Deploy user | `<deploy-user>` |
| Runner name / label | `<client-id>-vps` |
| Runner install dir | `/home/<deploy-user>/actions-runner-<client-id>` |

---

## GitHub repository configuration

### Variables

| Name | Value |
|------|-------|
| `VPS_DEPLOY_ENABLED` | `true` |
| `VPS_RUNNER_LABEL` | `<client-id>-vps` |
| `FRONTEND_DEPLOY_ENABLED` | `true` |

### Secrets

| Name | Value |
|------|-------|
| `VPS_CLIENT_PATH` | `/var/www/<client-id>/backend` |
| `VPS_FRONTEND_PATH` | `/var/www/<client-id>/frontend` |

---

## VPS runner install (one-time)

```bash
ssh <deploy-user>@<vps-ip>
mkdir -p ~/actions-runner-<client-id> && cd ~/actions-runner-<client-id>
# GitHub → repo → Settings → Actions → Runners → New self-hosted runner
# Copy curl URL + registration token from that page
curl -o actions-runner-linux-x64.tar.gz -L <URL_FROM_GITHUB>
tar xzf ./actions-runner-linux-x64.tar.gz
./config.sh \
  --url https://github.com/<org>/<repo> \
  --token <TOKEN> \
  --name "<client-id>-vps" \
  --labels "self-hosted,<client-id>-vps" \
  --unattended
sudo ./svc.sh install && sudo ./svc.sh start
```

Preflight: `bash /var/www/<client-id>/docs/clients/<client-id>/scripts/phase9-github-cd-setup.sh`

---

## Monorepo clone (recommended)

```bash
git clone https://github.com/<org>/<repo>.git /var/www/<client-id>
```

Paths: `/var/www/<client-id>/backend`, `/var/www/<client-id>/frontend`

---

## Test deploy

```bash
git push origin main
```

Actions: **Reliability CI** → **Deploy to VPS** on runner `<client-id>-vps`.

---

## Cleared

| Field | Value |
|-------|-------|
| Runner Online date | |
| First green CD deploy SHA | |
| Verified by | |
