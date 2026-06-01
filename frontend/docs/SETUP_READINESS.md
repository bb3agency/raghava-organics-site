# Frontend Setup Readiness

Checkpoint completed during Phase 4 kickoff (session setup only).

## Completed

- Next.js 16 app at `frontend/` with App Router, TypeScript strict, Tailwind 4, shadcn/ui
- Dependencies: Zod, React Hook Form, Zustand, Framer Motion, Lucide
- Folder structure per `dev-rules`: `app/(storefront)`, `app/(auth)`, `components/`, `lib/`, `stores/`, `types/`, `actions/`
- `lib/api.ts` + `lib/api-base.ts` — centralized client, same-site cookie auth, Next rewrite to Fastify
- Environment files: `.env.example`, `.env.local` (gitignored)
- AI rules: `.agents/rules/dev-rules.md`, `.cursor/rules/dev-rules.mdc`
- Dev log: `docs/FRONTEND_DEV_LOG.md`

## Before first feature slice

1. Start backend per `../backend/README.md` §Local Development Quickstart
2. Verify health (direct): `curl http://127.0.0.1:3000/api/v1/health`
3. Configure `frontend/.env.local` per `.env.example` (browser API on **storefront port**, not `:3000`)
4. Start storefront: `cd frontend && npm run dev`
5. Verify rewrite: `curl http://localhost:3101/api/v1/health`
6. Run `npm run typecheck`, `npm test`, and `npx vitest run -c vitest.integration.config.ts`

## Local URLs

| Service | URL | Notes |
|---|---|---|
| Backend API (direct) | http://127.0.0.1:3000/api/v1 | `INTERNAL_API_BASE_URL`, health, Postman |
| Browser API | http://localhost:3101/api/v1 | `NEXT_PUBLIC_API_BASE_URL` — **required for cookies** |
| Storefront / Admin UI | http://localhost:3101 | Next.js dev server |

## Admin session refresh

After admin OTP login, `refresh_token` must appear under **localhost:3101** in DevTools → Application → Cookies. Page reload on `/admin` calls `POST /auth/refresh` via the same origin (see `lib/restore-auth-session.ts`, `components/auth/AdminGuard.tsx`). Details: `../backend/docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` §1.0.1.
