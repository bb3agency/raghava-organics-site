# Client Handoff Index (Post-Development Main)

Use this document as the primary entrypoint after development and go-live for client operations, validation, and handoff continuity.

## Lifecycle

- Status: **Client-Main (Post-Development)**
- Primary phase: Post-development, go-live validation, ongoing client operations
- Not primary for: Template engineering design/history or internal frontend build SOPs

## Canonical Post-Development Reading Order

1. `docs/PRODUCTION_FIRST_DEPLOY_CHECKLIST.md` — **start here for first deploy**: Phase 1/2 model, bootstrap keys (incl. `RESEND_API_KEY`), ops-newuser flow, Ops UI config.
2. `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md` — final validation and acceptance walkthrough.
3. `docs/CLIENT_VPS_SETUP_GUIDE.md` — VPS/runtime setup and operations baseline.
4. `docs/GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md` — push-to-deploy: self-hosted runner per client repo, GitHub Variables/Secrets, daily `git push` workflow.
5. `docs/PHASE7_VPS_DEPLOY_INCIDENT_PLAYBOOK.md` — incident-derived Phase 7 troubleshooting and hardening gates.
6. `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` — provider keys, rotation, and incident drill policy.
7. `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md` — instantiate and maintain credential ownership trail.
8. `docs/BACKEND_GO_LIVE_CHECKLIST.md` and `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` — release evidence gates.

## Delivery Records (Client-Specific Artifacts)

Maintain finalized project records in the client project folder:

- `client-<id>/CLIENT_DEV_LOG.md`
- `client-<id>/frontend/docs/FRONTEND_DEV_LOG.md`
- `client-<id>/CLIENT_VPS_DEPLOYMENT_LOG.md`
- `client-<id>/GITHUB_CD_SETUP.md` (from `docs/templates/client-GITHUB_CD_SETUP.template.md`)

These are the operational truth for what was done for that specific client.

## Build-Time SOP Docs (Kept, But Not Post-Go-Live Primary)

These docs are retained for engineering reuse and future builds, but should not be treated as the main post-development handoff set:

- `README.md`
- `docs/MASTER_DEPLOYMENT_PLAYBOOK.md`
- `starter-prompt.md`
- `frontend-agent-rules.md`
- `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md`

## Agent Rule (Phase-Aware Precedence)

- During active build: use build-time SOP docs.
- After development/go-live: prioritize this index and linked Client-Main docs.
- Do not present template-general SOP text as the client-facing handoff baseline unless troubleshooting historical implementation details.
