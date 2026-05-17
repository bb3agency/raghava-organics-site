# Co-Development Sync Guide (Client Repo ↔ Template Repo)

This guide defines safe, repeatable ways to upstream reusable backend changes discovered during client development.

---

## 1) Core Rule

When your client repo contains both `frontend/` and `backend/`, pushing to client remote does **not** automatically push backend changes to the template repo.

You must do a separate upstream step for template-worthy backend changes.

---

## 2) Change Classification (always first)

Before syncing, classify backend changes:

- **Template-worthy**: reusable bug fixes, security hardening, reliability improvements, generic API/contract upgrades.
- **Client-specific**: one-off business rules, branding, custom integrations for one client only.

Only template-worthy changes should be upstreamed to template repo.

---

## 3) Flow A — Single Repo with `frontend/` + `backend/`

### Recommended when

- You have one repo root containing both folders.
- You want minimal duplicate implementation work.

### Repo shape

- `clientsite/.git` ✅
- `clientsite/frontend/` ✅
- `clientsite/backend/` ✅
- `clientsite/backend/.git` ❌

### One-time setup

Run from client repo root:

```bash
git remote add template-remote https://bb3agency@github.com/bb3agency/ecom-backend-template.git
git fetch template-remote
```

### Upstream commands (template-worthy backend change)

Run from client repo root:

```bash
# 1) Commit backend change in client repo
git add backend
git commit -m "fix(backend): <template-worthy change>"

# 2) Create backend-only branch from subtree
git subtree split --prefix backend -b backend-sync

# 3) Push backend-only branch to template repo
git push template-remote backend-sync:feature/<short-change-name>

# 4) Cleanup local temporary branch
git branch -D backend-sync
```

Then open PR in template repo:
- `feature/<short-change-name>` → `main`

### Why this works

`git subtree split --prefix backend` extracts only `backend/` and rewrites it as root-level history, which matches template repo layout.

---

## 4) Flow B — Separate Local Template Clone

### Recommended when

- You prefer explicit repo separation and no subtree commands.
- You are okay re-applying minimal template-worthy changes in template clone.

### Repo shape

- `clientsite/` (client repo with its own `.git`)
- `ecom-backend-template/` (separate local clone with its own `.git`)

### Upstream commands (inside template repo)

```bash
git checkout -b feature/<short-change-name>
git add .
git commit -m "fix(<scope>): <template-worthy change>"
git push -u origin feature/<short-change-name>
```

Then open PR:
- `feature/<short-change-name>` → `main`

### Important

Flow B is not “copy entire backend folder every time”.
Prefer re-applying only minimal relevant file changes.

---

## 5) Copy/Paste Safety Checklist (Flow B)

If you choose copy/paste style sync, use this checklist before committing in template repo.

### 5.1 Scope filter

- Confirm change is template-worthy.
- Exclude client-only behavior and branding.

### 5.2 Copy only changed files

- Do not copy full backend tree.
- Copy exact changed files only.

### 5.3 Dependency/migration integrity

- If `package.json` changed, update `package-lock.json` too.
- If Prisma schema changed, include required migration files.

### 5.4 Diff sanity

```bash
git status
git diff --name-only
git diff
```

Verify no accidental files are included.

### 5.5 Validation in template repo

```bash
npm ci
npm run prisma:generate:safe
npm run typecheck
npm run test:unit
```

Run extra checks if change touches reliability/security/build.

### 5.6 Branching discipline

- Push feature branch and open PR.
- Do not push directly to `main`.

---

## 6) Guardrails — Never Upstream

Never copy or commit:

- Real `.env` values or secrets
- Client domains/branding
- Client-only provider credentials
- One-off client-specific business rules

---

## 7) Practical Recommendation

For your current setup (`frontend/` + `backend/` in one client repo), default to **Flow A**.
Use **Flow B** when you prefer strict repository separation and explicit manual control.
