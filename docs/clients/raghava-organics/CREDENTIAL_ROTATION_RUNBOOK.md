# Credential Rotation Runbook — GitHub tokens & VPS git auth

> **When to use this:** a GitHub token expired or was revoked and deploys / CI /
> core-sync started failing. Written 2026-08-08 after a full-day outage caused by
> exactly that. Contains **no secrets** — live values live in the git-ignored
> [`VPS_INPUTS.md`](./VPS_INPUTS.md).
>
> **Scope:** applies to every client on the shared VPS `178.104.46.202`
> (`sbgs` + `raghava-organics`). Agency-wide — worth upstreaming to the platform
> template so new clients inherit it.

---

## 1. Symptom → which credential is dead

Match the error to the credential. They fail **independently** — fixing one does
not fix the others, and two of the four fail *silently*.

| Symptom | Dead credential | Where it lives | Silent? |
|---|---|---|---|
| Deploy to VPS fails at "Sync monorepo root via git pull" with `remote: Invalid username or token` / `Authentication failed` | **VPS git auth** | on the VPS (`~/.ssh` or `~/.git-credentials`) | No — deploy goes red |
| `core-drift` fails at "Wire template remote (read-only)" with `Authentication failed for .../ecom-platform-template.git` | **`TEMPLATE_READ_PAT`** | client repo → Settings → Secrets → Actions | No — workflow goes red |
| core-sync PR opens but **client CI never runs on it**; log shows `::warning::CORE_SYNC_PAT not set` | **`CORE_SYNC_PAT`** | client repo → Settings → Secrets → Actions | ⚠️ **Yes** — workflow still "succeeds" |
| You tag a core release in the template and **no client repo ever receives a sync PR** | **`CROSS_REPO_PAT`** | **template** repo → Settings → Secrets → Actions | ⚠️ **Yes** — nothing errors anywhere |

> The two silent ones are the dangerous pair: an unvalidated core PR can be
> merged, or a core release can reach zero clients, with nothing going red.
> **After any token rotation, run §5 to verify all four.**

---

## 2. Create the replacement PAT (one token covers all three secrets)

GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new.

| Setting | Value |
|---|---|
| Owner | `bb3agency` |
| Repository access | **All three**: `sbgs-site`, `raghava-organics-site`, `ecom-platform-template` |
| Contents | **Read and write** |
| Pull requests | **Read and write** |
| Actions | **Read and write** |
| Expiration | as long as policy allows — **calendar-reminder the expiry date** |

Why these: Contents+PR write lets `CORE_SYNC_PAT` push the sync branch and open
the PR; Actions write lets `CROSS_REPO_PAT` dispatch core-sync into client repos.
Repository access **must include the client repos** even for the token stored in
the template repo — it acts *on* the clients.

Verify before pasting it anywhere (all three must return `200`):

```bash
T='<new-pat>'
for r in sbgs-site raghava-organics-site ecom-platform-template; do
  printf '%s: ' "$r"
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" \
    "https://api.github.com/repos/bb3agency/$r"
done
```

---

## 3. Set the three Actions secrets

Paste the **same** token into all three. Settings → Secrets and variables →
Actions → Update secret.

| Secret | Repo |
|---|---|
| `TEMPLATE_READ_PAT` | `bb3agency/raghava-organics-site` |
| `CORE_SYNC_PAT` | `bb3agency/raghava-organics-site` |
| `TEMPLATE_READ_PAT` | `bb3agency/sbgs-site` |
| `CORE_SYNC_PAT` | `bb3agency/sbgs-site` |
| `CROSS_REPO_PAT` | `bb3agency/ecom-platform-template` |

> A fine-grained PAT **cannot** manage repo secrets unless you explicitly grant
> it the `Secrets` permission — so this step is manual in the UI. Do not expect
> an agent/CLI to do it for you (`gh secret set` returns
> `403 Resource not accessible by personal access token`).

Also confirm the repo **variable** `TEMPLATE_REPO` = `bb3agency/ecom-platform-template`
exists in each client repo (`core-drift` hard-fails without it).

---

## 4. VPS git auth — SSH, no rotation needed

**Since 2026-08-08 the VPS uses an SSH account key, not a PAT.** Nothing here
expires. Do **not** reintroduce an HTTPS remote — that is what caused the outage.

| Item | Value |
|---|---|
| Private key | `~/.ssh/id_ed25519_github` (user `d_user`) |
| Registered at | GitHub account **bb3agency** → Settings → SSH and GPG keys |
| Remotes | `git@github.com:bb3agency/raghava-organics-site.git`, `git@github.com:bb3agency/sbgs-site.git` |

Health check — **must** answer `Hi bb3agency!`:

```bash
ssh -T git@github.com
```

If it answers `Hi bb3agency/<repo>!` instead, the key has been demoted to a
**repo-scoped deploy key** and the *other* client will fail with
`ERROR: Repository not found`. GitHub permits a deploy key on exactly one repo
ever, which is why this is an account key.

### If the key is lost or must be replaced

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github -N '' -C 'ecom-vps-1'
cat ~/.ssh/id_ed25519_github.pub
```

Add the printed line at GitHub → account **bb3agency** → Settings → SSH and GPG
keys (**not** a repo Deploy key), then verify with §5.

### Emergency fallback (HTTPS + PAT) — temporary only

If SSH cannot be restored immediately:

```bash
git -C /var/www/raghava-organics remote set-url origin \
  https://bb3agency:<PAT>@github.com/bb3agency/raghava-organics-site.git
```

⚠️ **Embed the PAT in the remote URL.** Rewriting `~/.git-credentials` does
**not** work on this VPS even though `credential.helper store` is configured
globally — git keeps rejecting with `Invalid username or token`. Hours were lost
to this. Revert to SSH as soon as possible.

---

## 5. Verify everything (do this after ANY rotation)

```bash
# A. VPS git auth — expect "Hi bb3agency!" then two clean fetches
ssh -T git@github.com
git -C /var/www/raghava-organics fetch origin && git -C /var/www/sbgs fetch origin && echo GIT-OK
```

```bash
# B. TEMPLATE_READ_PAT — re-run core-drift, expect success
gh run list -R bb3agency/raghava-organics-site --workflow core-drift.yml --limit 1
gh run rerun <run-id> --failed -R bb3agency/raghava-organics-site
```

```bash
# C. CORE_SYNC_PAT — no-op sync against the tag the repo is ALREADY on
#    (read PLATFORM_VERSION for the current tag). Expect success, no PR created,
#    and NO "CORE_SYNC_PAT not set" warning in the log.
gh workflow run core-sync.yml -R bb3agency/raghava-organics-site -f tag=frontend-core-v<current>
```

Expected healthy output from C:
`ℹ️ frontend-core is already at X.Y.Z (>= requested X.Y.Z). Nothing to do`

```bash
# D. Full deploy — proves the runner (not just your shell) can authenticate
gh workflow run deploy.yml -R bb3agency/raghava-organics-site
```

**`CROSS_REPO_PAT` has no safe no-op test** — it only fires when a core release
is tagged in the template. Treat the next release-train run as its verification,
and if no client receives a sync PR, suspect this token first.

---

## 6. Known trap: `npm ci --prefer-offline` after a lockfile change

Not a credential issue, but it surfaces during the same recovery work.
`backend/scripts/vps-frontend-deploy.sh` runs `npm ci --prefer-offline`, which
trusts cached registry metadata indefinitely. If a lockfile regeneration pulls in
a **newly published** package version, the VPS reports
`No matching version found for <pkg>@<ver>` even though it exists publicly.

```bash
npm cache clean --force   # on the VPS, then re-run the deploy
```

## 7. Known trap: verifying a regenerated lockfile

Verify against the **committed blob**, never the working copy — a working copy
can be mangled or clobbered between generation and commit (this shipped a broken
lockfile to production once):

```bash
T=$(mktemp -d)
git show HEAD:frontend/package-lock.json > "$T/package-lock.json"
git show HEAD:frontend/package.json      > "$T/package.json"
cd "$T" && npm ci --dry-run; echo "EXIT=$?"   # must be 0
```

npm-native lockfiles are **2-space indented**. 4-space indent means something
re-serialized the file (a PowerShell `ConvertTo-Json` round-trip did this) and
silently dropped nested `node_modules/*/node_modules/*` entries.
