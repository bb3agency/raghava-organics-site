# GitHub CD — Raghava Organics

> **Canonical guide (all clients):** [backend/docs/GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md](../../../backend/docs/GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md)  
> **Onboarding phase:** [CLIENT_ONBOARDING_EXECUTION_ORDER.md](../../../backend/docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md) — Phase 7.6  
> **VPS summary:** [backend/docs/CLIENT_VPS_SETUP_GUIDE.md](../../../backend/docs/CLIENT_VPS_SETUP_GUIDE.md) §22

---

## Client identity

| Field | Value |
|-------|-------|
| GitHub repo | `https://github.com/bb3agency/raghava-organics-site` |
| `CLIENT_ID` | `raghava-organics` |
| VPS IP | `178.104.46.202` |
| Deploy user | `d_user` |
| Runner name / label | `raghava-organics-vps` |
| Monorepo path | `/var/www/raghava-organics` |

---

## GitHub repository configuration

### Variables

| Name | Value |
|------|-------|
| `VPS_DEPLOY_ENABLED` | `true` |
| `VPS_RUNNER_LABEL` | `raghava-organics-vps` |
| `FRONTEND_DEPLOY_ENABLED` | `true` |

### Secrets

| Name | Value |
|------|-------|
| `VPS_CLIENT_PATH` | `/var/www/raghava-organics/backend` |
| `VPS_FRONTEND_PATH` | `/var/www/raghava-organics/frontend` |

---

## VPS runner (one-time)

```bash
ssh d_user@178.104.46.202
mkdir -p ~/actions-runner && cd ~/actions-runner
# GitHub → bb3agency/raghava-organics-site → Settings → Actions → Runners → New
curl -o actions-runner-linux-x64.tar.gz -L <URL_FROM_GITHUB>
tar xzf ./actions-runner-linux-x64.tar.gz
./config.sh \
  --url https://github.com/bb3agency/raghava-organics-site \
  --token <TOKEN> \
  --name "raghava-organics-vps" \
  --labels "self-hosted,raghava-organics-vps" \
  --unattended
sudo ./svc.sh install && sudo ./svc.sh start
```

Preflight: `bash /var/www/raghava-organics/docs/clients/raghava-organics/scripts/phase9-github-cd-setup.sh`

---

## Workflows (monorepo)

Must exist on `main` at **repository root**:

- `.github/workflows/reliability-ci.yml`
- `.github/workflows/deploy.yml`

Deploy scripts: `backend/scripts/vps-deploy.sh`, `backend/scripts/vps-frontend-deploy.sh`

---

## Test + daily use

```bash
git push origin main
# Actions: Reliability CI → Deploy to VPS (runner raghava-organics-vps)
```

After setup, every deploy is: **commit → push to `main` → automatic**.

> **PM2 does not watch git.** Push-to-deploy is **not** PM2 — it is the **GitHub Actions self-hosted runner** on the VPS running `vps-deploy.sh` / `vps-frontend-deploy.sh` (git pull + docker/pm2 reload).

---

## Verify CD is working (VPS)

SSH as `d_user` and run:

```bash
bash /var/www/raghava-organics/docs/clients/raghava-organics/scripts/verify-cd-status.sh
```

| Check | What PASS means |
|-------|-----------------|
| Git `local HEAD` = `origin/main` | VPS has latest code from GitHub |
| Runner service running | Deploy jobs can execute on VPS |
| PM2 `raghava-organics-frontend` | Frontend process exists |
| Docker `raghava-organics-backend` | API container running |

**GitHub (browser):** [Actions](https://github.com/bb3agency/raghava-organics-site/actions)

1. **Reliability CI** — must be green on your commit (deploy does **not** run if CI fails).
2. **Deploy to VPS** — two jobs: `Deploy Backend` + `Deploy Frontend`, both on runner `raghava-organics-vps`.

**Quick test after a push:**

```bash
# On VPS — should match your latest commit on GitHub
git -C /var/www/raghava-organics rev-parse --short HEAD
git -C /var/www/raghava-organics rev-parse --short origin/main
cat /var/www/raghava-organics/frontend/.last-frontend-deploy-sha 2>/dev/null || echo "no frontend CD yet"
```

**Manual deploy (no new commit):** GitHub → Actions → **Deploy to VPS** → **Run workflow**.

**Manual frontend only on VPS:**

```bash
SHA=$(git -C /var/www/raghava-organics rev-parse HEAD)
bash /var/www/raghava-organics/backend/scripts/vps-frontend-deploy.sh \
  /var/www/raghava-organics/frontend "$SHA"
# Force rebuild even if change-detection skips:
# FORCE_FRONTEND_BUILD=true bash ... (same command)
```

---

## Cleared

| Field | Value |
|-------|-------|
| Runner Online date | |
| First green CD deploy SHA | |
| Verified by | |
