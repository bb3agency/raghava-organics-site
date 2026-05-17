# Frontend Setup Readiness

Checkpoint completed during Phase 4 kickoff (session setup only).

## Completed

- Next.js 16 app at `frontend/` with App Router, TypeScript strict, Tailwind 4, shadcn/ui
- Dependencies: Zod, React Hook Form, Zustand, Framer Motion, Lucide
- Folder structure per `dev-rules`: `app/(storefront)`, `app/(auth)`, `components/`, `lib/`, `stores/`, `types/`, `actions/`
- `lib/api.ts` — centralized client with enveloped/raw parsing and `ApiError`
- Environment files: `.env.example`, `.env.local` (gitignored)
- AI rules: `.agents/rules/dev-rules.md`, `.cursor/rules/dev-rules.mdc`
- Dev log: `docs/FRONTEND_DEV_LOG.md`

## Before first feature slice

1. Start backend per `../backend/README.md` §Local Development Quickstart
2. Verify health: `http://localhost:3000/api/v1/health`
3. Run `npm run typecheck` and `npm run build` in `frontend/`
4. Set `NEXT_PUBLIC_RAZORPAY_KEY_ID` when Razorpay test credentials are available

## Local URLs

| Service | URL |
|---|---|
| Backend API | http://localhost:3000/api/v1 |
| Storefront | http://localhost:3101 |
