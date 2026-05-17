# ECOM_MASTER.md
## E-Commerce Backend Template — Supreme Architecture Document

> **This is the source of truth.**  
> Every TRD, BRD, ADR, and implementation decision traces back to this file.  
> If it isn't here, it isn't decided. If it's here, it isn't up for debate.

**Prepared by:** Freelance Developer — Hyderabad, India  
**Stack Version:** v2.0  
**Date:** April 2026  
**Status:** 🔒 Locked — All decisions final. Active implementation has progressed through Phase 5 hardening.

**May 2026 hardening closeout policy notes (normative):**
- Process crash boundaries are observability-visible (`process_crash_total{reason}`) and must be preserved in bootstrap behavior.
- Admin MFA key material is isolated from refresh-token secrets in production-like profiles.
- Admin authorization remains fail-closed until explicit permission grants exist.
- Admin permission changes are access-token issuance scoped; immediate enforcement requires revocation/logout.
- Provider circuit breakers are intentionally process-local unless a deliberate shared-state architecture upgrade is approved.
- Deferred refund completion is queue-driven; synchronous admin mutation responses are not the source of truth for final refunded state.
- Frontend/storefront/admin/ops implementation must follow simultaneous build + integration via contract-first vertical slices; UI-only page completion is not accepted as release evidence.

---

## Table of Contents

1. [Core Ideology](#1-core-ideology)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [Technology Stack — All Decisions Locked](#3-technology-stack--all-decisions-locked)
4. [Repository & Git Workflow](#4-repository--git-workflow)
5. [VPS & Deployment Architecture](#5-vps--deployment-architecture)
6. [Folder Structure](#6-folder-structure)
7. [Database Schema](#7-database-schema)
8. [API Contract](#8-api-contract)
9. [Module Definitions](#9-module-definitions)
10. [Background Job Queues](#10-background-job-queues)
11. [Security Architecture](#11-security-architecture)
12. [Per-Client Customisation Checklist](#12-per-client-customisation-checklist)
13. [Development Phases](#13-development-phases)
14. [Future Module Roadmap](#14-future-module-roadmap)

---

## 1. Core Ideology

### 1.1 The Single Founding Principle

> **Build it once. Deploy it for every client.**

This is not a one-off application. This is a **private, production-grade template** — a master recipe. Every client gets their own independent instance of this codebase, deployed in full isolation. You never build from scratch again. You clone, configure, and ship.

### 1.2 What This Template Is

- A **Modular Monolith** — one Fastify process per client, structured internally with clean module boundaries and adapter interfaces that make every integration point swappable without touching business logic.
- A **plug-and-play system** — switching payment gateway, delivery partner, or notification provider is a single `.env` change. No code changes. No redeploy of other modules.
- A **freelancer's compounding asset** — every bug fixed, every feature hardened, every edge case handled in the template raises the quality of every future client deployment automatically.
- An **IP-protected master** — the template repo never contains client data, credentials, or customisations. It is the recipe, not any one dish.

### 1.3 What This Template Is Not

- Not a SaaS product — there is no shared runtime between clients. Every client is fully isolated.
- Not a microservices architecture — running true distributed microservices on a VPS hosting 5–10 clients is resource-prohibitive and operationally unjustifiable at this scale.
- Not a CMS — the admin dashboard is a purpose-built operations panel, not a generic content management interface.
- Not a monolith that fights you — the modular structure means module boundaries are already clean. When a future client needs microservices scale, physical separation is minimal refactoring.

### 1.4 The Compound Effect Over Time

```
Template v1.0  →  Client 1 (food store)        ← template proven in production
Template v1.1  →  Client 2 (apparel)           ← bug fixes + apparel-specific attrs
Template v1.2  →  Client 3 (electronics)       ← WhatsApp module added
Template v2.0  →  Client 4 ...                 ← abandoned cart, subscriptions added
```

Each client improves the template. The template never regresses a live client. This is the flywheel.

---

## 2. Architecture Philosophy

### 2.1 Modular Monolith — The Right Choice at This Scale

One Fastify process per client. Internally structured exactly like microservices — fully decoupled modules, no cross-module deep/internal imports (adapters/helpers/private types), and communication through public service interfaces — but deployed as a single container.

**Why not microservices:**
- A VPS hosting 5–10 clients cannot afford the memory overhead of 8+ separate Node processes per client.
- Operational complexity (inter-service networking, distributed tracing, service discovery) on a single VPS is unjustifiable.
- Clean module boundaries now mean physical separation later is straightforward if a client outgrows the VPS.

**What the modular monolith gives you:**
- Full code isolation between domains: modules may consume other modules only through public service interfaces; deep/internal cross-module imports are forbidden.
- Single Docker container per client backend — easy to debug, monitor, and restart.
- Swap any integration by changing one provider without touching other modules.

### 2.2 The Adapter Pattern — The Plug-and-Play Contract

Every external integration point follows this three-layer pattern without exception:

```
Layer 1:  Abstract TypeScript interfaces    →  see `src/common/interfaces/*.ts` (e.g. `PaymentProviderAdapter`)
Layer 2:  Concrete adapter implementations →  Razorpay adapter, Delhivery adapter, Resend / MSG91 / MetaWhatsApp adapters
Layer 3:  Environment variable selection   →  PAYMENT_PROVIDER=razorpay
```

No business logic code knows or cares which adapter is active. It calls the interface. To swap Razorpay for Cashfree: change one `.env` line and restart. Nothing else changes. **This is the invariant.**

**Defined adapter interfaces:** Authoritative type names and method shapes live in the repository under `src/common/interfaces/`. The canonical payment abstraction is `PaymentProviderAdapter` in `payment-provider.interface.ts`; shipping and notification providers follow the same pattern with concrete adapters selected by env.

```typescript
// Illustrative only — use payment-provider.interface.ts, shipping-provider.interface.ts,
// notification-provider.interface.ts for exact signatures and DTOs.

// payment-provider.interface.ts — export interface PaymentProviderAdapter { ... }
// shipping-provider.interface.ts — shipping provider contract + Delhivery adapter
// notification-provider.interface.ts — email (Resend), SMS (MSG91 or Fast2SMS), WhatsApp (Meta Cloud API) channels
```

### 2.3 Multi-Tenancy Model — Isolated Per-Client Deployment

Each client is fully isolated at every layer. There is no shared runtime, no shared database, no shared Redis.

| Layer | Isolation Strategy |
|---|---|
| Codebase | Independent Git repo cloned from template |
| Process | Separate Docker container — own Fastify process |
| Database | Separate PostgreSQL database on shared host PostgreSQL server |
| Cache | Separate Redis container in each client's Docker Compose stack |
| Domain / SSL | Separate Nginx `server {}` block + separate Certbot certificate |
| Environment | Separate `.env` file — all secrets isolated, never shared |

**Resource efficiency:** One VPS, one PostgreSQL server (host process), one Nginx instance, shared Docker base image layers. **Full isolation:** separate databases, Redis instances, processes, env files. Result: 5–10 client sites on a single mid-range VPS (4 vCPU / 8GB RAM) with zero data bleed.

---

## 3. Technology Stack — All Decisions Locked

> These decisions are final. Rationale is documented. Reopening requires a new ADR with strong justification.

| Layer | Technology | Decision Rationale |
|---|---|---|
| **Backend Framework** | **Fastify + TypeScript** | 3–5× faster than Express in benchmarks. Built-in JSON Schema validation on every route. First-class TypeScript. Pino structured logging included. Plugin architecture maps perfectly to the modular template pattern. |
| **Language** | **TypeScript (strict mode)** | Type safety prevents entire classes of runtime bugs — wrong price types, null order IDs. Prisma generates types from schema. AI IDEs (Cursor, Copilot) are dramatically more productive with typed code. |
| **ORM** | **Prisma** | Schema-first: `schema.prisma` is the single source of truth for the database. Auto-generates fully typed client. Clean migration system. Parameterised queries make SQL injection structurally impossible. |
| **Database** | **PostgreSQL 16** | ACID compliance is non-negotiable for e-commerce. Order creation snapshots + cart clear run atomically, while paid-order inventory decrement is handled in the queue-driven payment-confirmation flow. JSONB columns handle flexible product attributes (nutrition info, specs, allergens) without schema changes. **MongoDB was considered and rejected** — ACID multi-document transactions in MongoDB are slower and less proven at this workload. |
| **Cache / Queue Broker** | **Redis 7** | Guest cart sessions. Rate limiting. BullMQ job queue. Razorpay webhook idempotency store. OTP TTL cache. |
| **Job Queue** | **BullMQ** | Order processing, notification dispatch, inventory alerts — all non-blocking background jobs. Retry logic + dead-letter queue + Bull Board UI included out of the box. |
| **Payment Gateway** | **Razorpay (default adapter)** | India-first. Supports UPI / Cards / NetBanking / Wallets. Best webhook reliability in India. PCI DSS compliant — card data never touches your server. Swappable via `IPaymentProvider`. |
| **Logistics Partner** | **Delhivery (default adapter)** | API token auth (simpler than Shiprocket's JWT refresh). Programmatic AWB generation. Push webhook tracking. 18,700+ pin codes. Rapid Commerce same-day option. Swappable via `IShippingProvider`. |
| **Email** | **Resend + React Email** | Modern API, excellent deliverability, generous free tier. React Email templates are typed, version-controlled TSX — not fragile drag-and-drop builders. |
| **SMS** | **MSG91 / Fast2SMS** | India-first. MSG91: DLT-compliant OTP + transactional routes. Fast2SMS: no DLT required, Quick SMS and OTP routes. Provider selected via `SMS_PROVIDER` ops config key (`msg91` \| `fast2sms` \| `noop`). |
| **WhatsApp** | **Meta Cloud API direct** | No BSP platform fees (vs Interakt/Wati). Template-based messaging for order updates. Direct Graph API integration via `MetaWhatsAppAdapter`. |
| **Storefront Frontend** | **Next.js (App Router)** | SSR is critical for product page SEO. App Router for streaming, layouts, and server components. Connects to Fastify API via REST. |
| **Admin Dashboard** | **Next.js + Refine** | Refine handles data fetching, pagination, CRUD forms, table sorting/filtering, auth provider, and access control. Runs inside the same Next.js frontend deployment and is exposed via route (for example `/admin`). |
| **Containerisation** | **Docker + Docker Compose** | One `docker-compose.yml` per client. Full process isolation, easy rollback, portable environments. |
| **Reverse Proxy** | **Nginx (host process)** | Domain-based routing to client containers. SSL termination. Rate limiting at the network edge. Static file serving for admin build. |
| **SSL** | **Certbot / Let's Encrypt** | Free, auto-renewing. Nginx plugin handles provisioning and renewal in one command. |
| **VPS OS** | **Ubuntu 22.04 LTS** | LTS support until 2027. Widest package availability. Docker and Nginx best documented on Ubuntu. |

### 3.1 Money: Integer Paise — Non-Negotiable

All monetary values are stored as **integers in paise** (₹1 = 100 paise) throughout the entire system — database columns, runtime variables, API payloads to Razorpay, BullMQ job data. No exceptions.

```typescript
// ✅ CORRECT — store and compute in paise
const price   = 9950                         // ₹99.50
const gst     = Math.round(price * 0.12)     // 1194 paise = ₹11.94
const total   = price + gst                  // 11144 paise = ₹111.44
const display = (total / 100).toFixed(2)     // "111.44" — only at render time

// ❌ WRONG — never store or compute with floats
const price = 99.50  // floating point arithmetic causes rounding errors in GST and discount calculations
```

**Prisma schema money columns:** `Int` type. **Razorpay API:** already expects paise as integers. **Display layer:** divide by 100 only at render time, never store the divided value.

---

## 4. Repository & Git Workflow

### 4.1 Repository Structure

```
GitHub (your account)
│
├── ecommerce-backend-template      ← 🔒 Private master. Your IP. Never has client data.
├── ecommerce-frontend-template     ← 🔒 Private master. Single frontend template (storefront + admin routes).
│
├── client-foodstore-backend        ← Client 1 backend (cloned from template v2.0)
├── client-foodstore-frontend       ← Client 1 single frontend app (storefront + admin routes)
├── client-clothingstore-backend    ← Client 2 (cloned from template v2.1)
└── ...
```

### 4.2 Starting a New Client Project

```bash
# ── On your local machine ───────────────────────────────────────────────
# 1. Clone the template into a new independent repo
git clone https://github.com/you/ecommerce-backend-template client-foodstore-backend
cd client-foodstore-backend

# 2. Detach from template history — this is now THIS client's repo
rm -rf .git
git init
git remote add origin https://github.com/you/client-foodstore-backend

# 3. First client-specific commit
git add .
git commit -m "init: bootstrapped from ecommerce-backend-template v2.0"
git push -u origin main
```

From this point the client repo is **fully independent.** No connection to the template. Customise freely.

### 4.3 What Lives Where

| Item | Template Repo | Client Repo |
|---|---|---|
| Fastify source code | ✅ Complete | ✅ Copied, then customised |
| Prisma base schema | ✅ All core models | ✅ Extended with client-specific fields |
| `.env.example` | ✅ All variables documented | ✅ Becomes `.env` with real values |
| `.env` (real secrets) | ❌ Never — ever | ✅ Only here, in `.gitignore` |
| Docker Compose | ✅ Parameterised template | ✅ Used as-is or tweaked |
| Nginx config template | ✅ Template file | ✅ Filled with client domain and ports |
| Email / SMS templates | ✅ Base design | ✅ Customised with client branding |
| Client logo / brand colours | ❌ Never | ✅ Only in client repo |
| Razorpay / Delhivery API keys | ❌ Never | ✅ In `.env` only |

### 4.4 Template Versioning

Each client repo commit message records which template version it was bootstrapped from. Future template improvements (security patches, new modules) are applied to active client repos as deliberate, reviewed changes — never automatically. This prevents surprise breaking changes on live sites.

---

## 5. VPS & Deployment Architecture

### 5.1 VPS Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                    VPS (Ubuntu 22.04 LTS)                        │
│             Recommended: 4 vCPU / 8 GB RAM (handles 5–10 sites) │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Nginx (Host Process)                     │   │
│  │  Port 80  → redirect to 443                               │   │
│  │  Port 443 → SSL termination + reverse proxy               │   │
│  │                                                            │   │
│  │  client1.com        → Docker: client1-backend :3001        │   │
│  │  client1.com/admin  → Served by same frontend deployment    │   │
│  │  client2.com        → Docker: client2-backend :3002        │   │
│  │  client2.com/admin  → Served by same frontend deployment    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ...         │
│  │   Client 1 Stack    │  │   Client 2 Stack    │              │
│  │  (Docker Compose)   │  │  (Docker Compose)   │              │
│  │                     │  │                     │              │
│  │  client1-backend    │  │  client2-backend    │              │
│  │  (Fastify :3001)    │  │  (Fastify :3002)    │              │
│  │                     │  │                     │              │
│  │  client1-redis      │  │  client2-redis      │              │
│  │  (:6379 internal)   │  │  (:6379 internal)   │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  PostgreSQL 16 (Host Process — Port 5432)                  │ │
│  │  DB: client1_ecom    DB: client2_ecom    DB: client3_ecom  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  /etc/letsencrypt/live/client1.com/  (Certbot — auto-renews)    │
│  /etc/letsencrypt/live/client2.com/                             │
└──────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions:**
- **PostgreSQL runs on the host** (not in Docker) — simpler backup (`pg_dump`), accessible from all client containers via `host.docker.internal`, no volume management needed.
- **Redis per client** inside each Docker Compose stack — memory footprint < 50MB per instance at this scale, complete isolation.
- **Nginx on the host** — one instance handles all domain routing and SSL. Certbot (host-installed) manages all certificates.
- **Admin frontend is route-based in same app** — Next.js frontend serves storefront and admin routes from one deployment (no separate admin host/container).

### 5.2 Docker Compose (Per Client)

```yaml
# docker-compose.yml — each client fills via .env
services:
  backend:
    build: .
    container_name: ${CLIENT_ID:-ecom}-backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-3000}:3000"       # e.g. 3001 for client1, 3002 for client2
    extra_hosts:
      - "host.docker.internal:host-gateway"   # reach host PostgreSQL on VPS
    env_file: .env                             # all vars injected from .env
    environment:
      - NODE_ENV=production                    # override — containers always run prod
      - OTEL_SERVICE_NAME=${CLIENT_ID:-ecom}-backend
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    networks: [client-network]

  workers:
    build: .
    container_name: ${CLIENT_ID:-ecom}-workers
    restart: unless-stopped
    command: ["node", "bootstrap-workers.js"]
    env_file: .env
    environment:
      - NODE_ENV=production
      - OTEL_SERVICE_NAME=${CLIENT_ID:-ecom}-workers
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    networks: [client-network]

  # ── Infrastructure (used in both dev and prod) ──────────
  postgres:
    image: postgres:16-alpine
    container_name: ${CLIENT_ID:-ecom}-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_DB=${POSTGRES_DB:-ecom_template}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes: [pg-data:/var/lib/postgresql/data]
    networks: [client-network]

  redis:
    image: redis:7-alpine
    container_name: ${CLIENT_ID:-ecom}-redis
    restart: unless-stopped
    command: >-
      sh -c "redis-server ${REDIS_PASSWORD:+--requirepass \"$REDIS_PASSWORD\"}
      --appendonly yes --appendfsync everysec
      --maxmemory 100mb --maxmemory-policy noeviction"
    healthcheck:
      test: ["CMD-SHELL", "redis-cli ${REDIS_PASSWORD:+-a \"$REDIS_PASSWORD\"} ping | grep PONG"]
      interval: 10s
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes: [redis-data:/data]
    networks: [client-network]

networks:
  client-network:
    driver: bridge

volumes:
  pg-data:
  redis-data:
```

> **Development vs Production usage:**
> - **Dev laptop:** `docker compose up -d postgres redis` — only infrastructure. Run Node on the host with `npm run dev`.
> - **VPS production:** `docker compose up -d --build` — full stack. `backend` and `workers` containers always run `NODE_ENV=production`.
> - **No inline env var warnings:** All application config is injected via `env_file: .env`. Docker Compose never sees `${DELHIVERY_API_KEY}` etc., so there are zero "variable is not set" warnings when starting only infrastructure services.

### 5.3 Nginx Config (Per Client)

```nginx
server {
  listen 80;
  server_name client1.com www.client1.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name client1.com www.client1.com;
  ssl_certificate     /etc/letsencrypt/live/client1.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/client1.com/privkey.pem;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;

  limit_req_zone $binary_remote_addr zone=api_client1:10m rate=30r/m;
  limit_req zone=api_client1 burst=10 nodelay;

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20M;
  }

  location / {
    proxy_pass http://127.0.0.1:3101;   # Next.js storefront
  }
}

# Admin routes (for example /admin) are handled by the same frontend upstream.
```

**Payment pages & browser script integrity:** Checkout HTML and Razorpay’s hosted checkout script load from the **storefront** origin or PSP/CDN—not from this Fastify API. For PCI SAQ-A eligibility and script-injection risk (e.g. Magecart-class attacks), **Content-Security-Policy**, **Subresource Integrity** where applicable, script inventory, and optional **WAF** rules belong at the **Nginx/CDN/storefront** layer. See `TRD.md` §11.5 for ownership split; this backend continues to enforce JSON API headers via Helmet only.

### 5.4 New Client Onboarding — Step by Step

```bash
# ── LOCAL MACHINE ─────────────────────────────────────────────────────────────
# Step 1: Create the client repo from the template
git clone https://github.com/you/ecommerce-backend-template client-foodstore
cd client-foodstore && rm -rf .git && git init
git remote add origin https://github.com/you/client-foodstore
git add . && git commit -m "init: bootstrapped from ecommerce-backend-template v2.0"
git push -u origin main

# ── VPS ───────────────────────────────────────────────────────────────────────
# Step 2: Clone client repo to VPS
ssh deploy@your-vps
git clone https://github.com/you/client-foodstore /var/www/client-foodstore
cd /var/www/client-foodstore

# Step 3: Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE client_foodstore;"
psql -U postgres -c "CREATE USER foodstore_user WITH PASSWORD 'strongpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE client_foodstore TO foodstore_user;"

# Step 4: Fill environment variables
cp .env.example .env
nano .env   # Fill CLIENT_ID, BACKEND_PORT, DATABASE_URL, all API keys

# Step 5: Run Prisma migrations (creates all tables)
docker run --rm -v $(pwd):/app -w /app node:22-alpine npx prisma migrate deploy

# Step 6: Build and start containers
docker compose up -d --build

# Step 7: Configure Nginx
sudo cp nginx/client.conf.template /etc/nginx/sites-available/foodstore.com
sudo nano /etc/nginx/sites-available/foodstore.com   # fill domain + ports
sudo ln -s /etc/nginx/sites-available/foodstore.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Step 8: SSL certificate
sudo certbot --nginx -d foodstore.com -d www.foodstore.com -d admin.foodstore.com

# Step 9: Build and deploy admin frontend
cd /var/www/client-foodstore-frontend
npm ci && npm run build
# deploy/update the same frontend app that serves both storefront and /admin routes

echo "✅  foodstore.com is live"
```

| Step | Time |
|---|---|
| Git setup (local + push) | ~3 min |
| VPS clone + PostgreSQL setup | ~3 min |
| `.env` configuration | ~5 min |
| Docker build (first client — downloads base images) | ~10 min |
| Docker build (subsequent clients — cached layers) | ~2 min |
| Prisma migrations | ~30 sec |
| Nginx config + SSL | ~2 min |
| Admin frontend build + deploy | ~3 min |
| **Total — first client on fresh VPS** | **~26 min** |
| **Total — each additional client (Docker cached)** | **~16 min** |

---

## 6. Folder Structure

### 6.1 Backend Template (`ecommerce-backend-template/`)

```
ecommerce-backend-template/
│
├── prisma/
│   ├── schema.prisma              ← Single source of truth for all DB models
│   └── migrations/                ← Auto-generated migration files
│
├── src/
│   ├── main.ts                    ← Bootstrap: Fastify instance, global plugins, server start
│   ├── app.ts                     ← Root plugin — registers all feature modules
│   │
│   ├── config/
│   │   ├── app.config.ts          ← Port, API version, environment
│   │   ├── database.config.ts     ← PostgreSQL / Prisma connection
│   │   ├── redis.config.ts        ← Redis connection
│   │   └── feature-flags.ts       ← Which modules are active (read from .env)
│   │
│   ├── common/
│   │   ├── decorators/            ← @CurrentUser(), @Public(), @Roles()
│   │   ├── guards/                ← jwtAuthGuard, rolesGuard (Fastify preHandler hooks)
│   │   ├── hooks/                 ← onRequest (Helmet, CORS), onSend (response envelope)
│   │   ├── plugins/               ← JWT plugin, rate-limit plugin, multipart
│   │   ├── errors/                ← Custom AppError class, global error handler
│   │   └── interfaces/
│   │       ├── payment-provider.interface.ts
│   │       ├── shipping-provider.interface.ts
│   │       └── notification-provider.interface.ts
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schemas.ts    ← JSON Schema validation (Fastify native)
│   │   │   └── auth.types.ts
│   │   │
│   │   ├── users/                 ← Customer profiles, address book
│   │   ├── products/              ← Catalogue, categories, variants, images
│   │   ├── inventory/             ← Stock tracking, low-stock alerts
│   │   ├── cart/                  ← Guest + auth carts, merge on login
│   │   ├── wishlist/              ← Saved products per customer (feature-flagged)
│   │   ├── orders/                ← Order lifecycle, state machine, order number gen
│   │   ├── reviews/               ← Verified-purchase reviews + moderation (feature-flagged)
│   │   │
│   │   ├── payments/
│   │   │   └── adapters/
│   │   │       └── razorpay.adapter.ts    ← Primary provider adapter (order/payment/refund/signature ops)
│   │   │
│   │   ├── shipping/
│   │   │   └── adapters/
│   │   │       └── delhivery.adapter.ts   ← Primary provider adapter (shipment create/track)
│   │   │
│   │   ├── notifications/
│   │   │   ├── adapters/
│   │   │   │   ├── resend.adapter.ts
│   │   │   │   ├── msg91.adapter.ts
│   │   │   │   └── fast2sms.adapter.ts
│   │   │   └── templates/
│   │   │       ├── email-templates.ts
│   │   │       └── email-template-components.ts
│   │   │
│   │   ├── invoices/              ← GST-compliant PDF generation (React PDF renderer)
│   │   ├── coupons/               ← Admin coupon CRUD + analytics, cart coupon validation
│   │   └── analytics/             ← KPIs, sales charts, funnel + category breakdown
│   │
│   └── database/
│       └── prisma.service.ts      ← PrismaClient singleton
│
├── queues/
│   ├── queue-registry.ts          ← All BullMQ queue definitions
│   └── workers/
│       ├── order-processing.worker.ts
│       ├── notifications.worker.ts
│       ├── shipping.worker.ts
│       ├── inventory-alerts.worker.ts
│       ├── refunds.worker.ts
│       ├── analytics.worker.ts
│       ├── cart-cleanup.worker.ts
│       ├── reconciliation.worker.ts
│       └── outbox-dispatch.worker.ts
│
├── src/** and queues/**           ← Colocated `*.test.ts` unit/e2e-style coverage
├── package.json scripts:
│   ├── `test:unit`                ← Vitest unit suite
│   └── `test:e2e`                 ← Vitest integration/e2e contract suite
│
├── .env.example                   ← Every variable documented with description + example
├── .gitignore                     ← .env* entries here — secrets never committed
├── docker-compose.yml
├── Dockerfile
├── nginx/
│   └── client.conf.template
└── scripts/
    ├── dr-*.js / release-*.js     ← Reliability, DR, and release-guard automation
    └── parity-scorecard.js        ← Evidence-oriented parity scoring
```

---

## 7. Database Schema

> Defined in `prisma/schema.prisma` — the single source of truth.  
> All tables have `createdAt` and `updatedAt`. UUID primary keys throughout.  
> Money columns are **`Int` (paise)**. No `Decimal` or `Float` for monetary values.

### 7.1 Users & Addresses

```prisma
model User {
  id           String    @id @default(uuid())
  email        String    @unique
  phone        String?   @unique
  passwordHash String
  firstName    String
  lastName     String
  role         Role      @default(CUSTOMER)   // enum: CUSTOMER | ADMIN
  isVerified   Boolean   @default(false)
  addresses    Address[]
  orders       Order[]
  cart         Cart?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Address {
  id        String  @id @default(uuid())
  userId    String
  user      User    @relation(fields: [userId], references: [id])
  fullName  String
  phone     String
  line1     String
  line2     String?
  city      String
  state     String
  pincode   String
  isDefault Boolean @default(false)
}
```

### 7.2 Product Catalogue

```prisma
model Category {
  id       String     @id @default(uuid())
  name     String
  slug     String     @unique
  parentId String?
  parent   Category?  @relation("CategoryTree", fields: [parentId], references: [id])
  children Category[] @relation("CategoryTree")
  imageUrl String?
  isActive Boolean    @default(true)
  products Product[]
}

model Product {
  id              String           @id @default(uuid())
  name            String
  slug            String           @unique
  description     String
  categoryId      String
  category        Category         @relation(fields: [categoryId], references: [id])
  tags            String[]
  attributes      Json?            // food: { nutritionInfo, allergens, shelfLife, fssaiNumber, hsnCode }
  metaTitle       String?          // SEO
  metaDescription String?          // SEO
  isActive        Boolean          @default(true)
  isFeatured      Boolean          @default(false)
  images          ProductImage[]
  variants        ProductVariant[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model ProductImage {
  id        String  @id @default(uuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  url       String
  altText   String
  sortOrder Int     @default(0)
}

model ProductVariant {
  id             String     @id @default(uuid())
  productId      String
  product        Product    @relation(fields: [productId], references: [id])
  sku            String     @unique
  name           String                      // "500g", "Mango Flavour", "Red / XL"
  attributes     Json?                       // { size: "500g", flavor: "Mango" }
  price          Int                         // paise
  compareAtPrice Int?                        // paise — strike-through original price
  weight         Int?                        // grams — for shipping calculation
  isActive       Boolean    @default(true)
  inventory      Inventory?
  cartItems      CartItem[]
  orderItems     OrderItem[]
}

model Inventory {
  id                String         @id @default(uuid())
  variantId         String         @unique
  variant           ProductVariant @relation(fields: [variantId], references: [id])
  quantity          Int            @default(0)
  lowStockThreshold Int            @default(5)
  lowStockAlerted   Boolean        @default(false)   // prevents duplicate alerts until restocked
  updatedAt         DateTime       @updatedAt
}
```

### 7.3 Cart

```prisma
model Cart {
  id           String     @id @default(uuid())
  userId       String?    @unique
  user         User?      @relation(fields: [userId], references: [id])
  sessionToken String?    @unique                  // guest cart — httpOnly cookie
  expiresAt    DateTime                            // guest carts expire after 30 days
  items        CartItem[]
  updatedAt    DateTime   @updatedAt
}

model CartItem {
  id            String         @id @default(uuid())
  cartId        String
  cart          Cart           @relation(fields: [cartId], references: [id])
  variantId     String
  variant       ProductVariant @relation(fields: [variantId], references: [id])
  quantity      Int
  priceSnapshot Int            // paise — price at time of adding (prevents silent price changes)
}
```

### 7.4 Orders

```prisma
model Order {
  id              String        @id @default(uuid())
  orderNumber     String        @unique               // ORD-2026-00001
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  status          OrderStatus
  shippingAddress Json                                // snapshot at order time
  subtotal        Int                                 // paise
  shippingCharge  Int                                 // paise
  discountAmount  Int           @default(0)           // paise
  total           Int                                 // paise
  notes           String?
  items           OrderItem[]
  payment         Payment?
  shipment        Shipment?
  statusHistory   OrderStatusHistory[]
  invoice         Invoice?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

model OrderItem {
  id          String         @id @default(uuid())
  orderId     String
  order       Order          @relation(fields: [orderId], references: [id])
  variantId   String
  variant     ProductVariant @relation(fields: [variantId], references: [id])
  productName String                                  // snapshot at order time
  variantName String                                  // snapshot
  sku         String                                  // snapshot
  quantity    Int
  unitPrice   Int                                     // paise — snapshot
  totalPrice  Int                                     // paise — snapshot
}

model OrderStatusHistory {
  id         String      @id @default(uuid())
  orderId    String
  order      Order       @relation(fields: [orderId], references: [id])
  fromStatus OrderStatus?
  toStatus   OrderStatus
  note       String?
  createdAt  DateTime    @default(now())
}

enum OrderStatus {
  PENDING_PAYMENT
  PAYMENT_FAILED
  CONFIRMED
  PROCESSING
  SHIPPED
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
  REFUNDED
}
```

### 7.5 Payments & Shipments

```prisma
model Payment {
  id                String          @id @default(uuid())
  orderId           String          @unique
  order             Order           @relation(fields: [orderId], references: [id])
  provider          PaymentProvider                   // enum: RAZORPAY | CASHFREE | COD
  providerOrderId   String
  providerPaymentId String?                           // set after successful capture
  amount            Int                               // paise
  currency          String          @default("INR")
  status            PaymentStatus                     // CREATED | CAPTURED | FAILED | REFUNDED
  method            String?                           // upi | card | netbanking | wallet
  webhookPayload    Json?                             // sanitized provider metadata for audit trail
  capturedAt        DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model Shipment {
  id                String          @id @default(uuid())
  orderId           String          @unique
  order             Order           @relation(fields: [orderId], references: [id])
  provider          ShippingProvider                  // enum: DELHIVERY | SHIPROCKET
  awbNumber         String?
  status            ShipmentStatus
  trackingUrl       String?
  estimatedDelivery DateTime?
  webhookPayload    Json?                             // sanitized provider metadata for audit trail
  events            ShipmentEvent[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
}

model ShipmentEvent {
  id         String   @id @default(uuid())
  shipmentId String
  shipment   Shipment @relation(fields: [shipmentId], references: [id])
  status     String
  location   String?
  description String
  occurredAt DateTime
}
```

### 7.6 Notifications, Analytics & Invoices

```prisma
model NotificationLog {
  id                String              @id @default(uuid())
  channel           NotificationChannel // EMAIL | SMS | WHATSAPP
  recipient         String
  template          String              // ORDER_CONFIRMED | SHIPPED | DELIVERED | etc.
  status            NotificationStatus  // SENT | FAILED | PENDING
  provider          String              // resend | msg91 | fast2sms | meta-whatsapp
  providerMessageId String?
  errorMessage      String?
  createdAt         DateTime            @default(now())
}

model Invoice {
  id            String   @id @default(uuid())
  orderId       String   @unique
  order         Order    @relation(fields: [orderId], references: [id])
  invoiceNumber String   @unique                    // FOOD-2026-00001
  pdfUrl        String
  issuedAt      DateTime @default(now())
}

model AnalyticsEvent {
  id        String   @id @default(uuid())
  eventType String   // PAGE_VIEW | ADD_TO_CART | CHECKOUT_STARTED | PURCHASE | etc.
  sessionId String
  userId    String?
  payload   Json
  occurredAt DateTime @default(now())
}
```

---

## 8. API Contract

### 8.1 Standard Response Envelope

Every API response — success or error — **can be** wrapped in this envelope via a global Fastify `onSend` hook, activated by setting `FEATURE_RESPONSE_ENVELOPE_ENABLED=true`. When disabled (default), success responses return route-specific payloads directly; error responses always use the standard error envelope via the global error handler regardless of the flag.

```json
// Success
{
  "success": true,
  "data": { "...": "..." },
  "meta": { "page": 1, "total": 42, "limit": 20 }
}

// Error
{
  "success": false,
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "No order found with the given ID",
    "statusCode": 404
  }
}
```

**Exception:** Non-JSON file downloads (for example CSV exports with `text/csv`) are returned as raw payloads and are exempt from JSON envelope wrapping.

PCI scope, caller-class JSON minimisation (public vs customer vs admin vs ops), optional webhook IP allowlists / Razorpay timestamp skew, checkout risk velocity, and Redis guest-key hashing are specified in `TRD.md` (sections 7.11–7.13).

### 8.2 Auth & Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Customer registration |
| POST | `/api/v1/auth/send-otp` | Public | Send OTP to phone (MSG91 or Fast2SMS per `SMS_PROVIDER`) |
| POST | `/api/v1/auth/verify-otp` | Public | Verify OTP → JWT pair |
| POST | `/api/v1/auth/forgot-password` | Public | Request password reset email |
| POST | `/api/v1/auth/login` | Public | Email + password login → JWT pair |
| POST | `/api/v1/auth/refresh` | Cookie | Refresh access token |
| POST | `/api/v1/auth/logout` | Customer | Invalidate refresh token |
| POST | `/api/v1/auth/admin/login` | Public | Admin login (stricter rate limit) |
| GET | `/api/v1/users/me` | Customer | Get own profile |
| PATCH | `/api/v1/users/me` | Customer | Update profile |
| GET/POST | `/api/v1/users/me/addresses` | Customer | List / add addresses |
| PATCH/DELETE | `/api/v1/users/me/addresses/:id` | Customer | Update / delete address |
| GET | `/api/v1/users/me/orders` | Customer | Own order history |

### 8.3 Catalogue

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/products` | Public | List products — filter, sort, paginate, full-text search |
| GET | `/api/v1/products/:slug` | Public | Product detail + variants + reviews |
| GET | `/api/v1/products/categories` | Public | Full category tree |
| GET | `/api/v1/products/categories/:slug/products` | Public | Products in a category |

### 8.4 Cart & Checkout

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/cart` | Public / Customer | Get current cart (session token or JWT) |
| POST | `/api/v1/cart/items` | Public / Customer | Add item to cart |
| PATCH | `/api/v1/cart/items/:id` | Public / Customer | Update item quantity |
| DELETE | `/api/v1/cart/items/:id` | Public / Customer | Remove item |
| DELETE | `/api/v1/cart` | Public / Customer | Clear cart |
| POST | `/api/v1/cart/merge` | Customer | Merge guest cart on login |
| POST | `/api/v1/cart/coupon` | Public / Customer | Apply coupon code |
| DELETE | `/api/v1/cart/coupon` | Public / Customer | Remove coupon |
| POST | `/api/v1/cart/check-pincode` | Public | Shipping provider serviceability check |
| GET | `/api/v1/cart/delivery-rates` | Public / Customer | Shipping rate from active provider |

### 8.5 Wishlist

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/wishlist` | Customer | List saved products (paginated) |
| POST | `/api/v1/wishlist/items` | Customer | Add product to wishlist |
| DELETE | `/api/v1/wishlist/items/:productId` | Customer | Remove product from wishlist |

### 8.6 Reviews

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/reviews/product/:slug` | Public | Approved reviews for a product |
| GET | `/api/v1/reviews/me` | Customer | Customer's own reviews |
| POST | `/api/v1/reviews` | Customer | Create review for delivered purchased item |

### 8.7 Orders & Payments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/orders` | Customer | Create order from cart |
| GET | `/api/v1/orders/:id` | Customer | Order detail (own only) |
| POST | `/api/v1/orders/:id/cancel` | Customer | Request cancellation |
| POST | `/api/v1/payments/initiate` | Customer | Create Razorpay order → returns `order_id` |
| POST | `/api/v1/payments/verify` | Customer | Verify Razorpay signature after frontend callback |
| POST | `/api/v1/payments/webhook` | Public (HMAC verified) | Razorpay webhook receiver |
| GET | `/api/v1/shipping/track/:awb` | Customer | Track shipment by AWB for customer-owned orders |
| POST | `/api/v1/shipping/webhook` | Public (verified) | Shipping provider push webhook receiver (Delhivery or Shiprocket) |

### 8.8 Admin Routes (JWT + ADMIN role on all)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/admin/dashboard/kpis` | Revenue, orders, AOV, conversion — today/7d/30d |
| GET | `/api/v1/admin/dashboard/sales-chart` | Time-series sales data |
| GET | `/api/v1/admin/dashboard/top-products` | Best-selling by revenue |
| GET | `/api/v1/admin/products` | List products (paginated) |
| POST | `/api/v1/admin/products/import-csv` | Bulk create/update products from CSV |
| POST | `/api/v1/admin/products` | Create product |
| GET | `/api/v1/admin/products/:id` | Product detail |
| POST | `/api/v1/admin/products/:id/variants` | Create product variant |
| PATCH | `/api/v1/admin/products/:id/variants/:variantId` | Update variant + inventory fields |
| PATCH | `/api/v1/admin/products/:id` | Update product |
| DELETE | `/api/v1/admin/products/:id` | Soft-delete product |
| GET | `/api/v1/admin/categories` | Category tree list |
| POST | `/api/v1/admin/categories` | Create category |
| PATCH | `/api/v1/admin/categories/:id` | Update category |
| DELETE | `/api/v1/admin/categories/:id` | Deactivate category |
| GET | `/api/v1/admin/inventory` | All variants with stock levels |
| PATCH | `/api/v1/admin/inventory/:variantId` | Update stock quantity |
| GET | `/api/v1/admin/inventory/low-stock` | Variants below threshold |
| GET | `/api/v1/admin/orders` | All orders — filter by status, date, search |
| GET | `/api/v1/admin/orders/:id` | Full order detail + payment + shipment timeline |
| PATCH | `/api/v1/admin/orders/:id/status` | Manually update order status |
| POST | `/api/v1/admin/orders/:id/ship` | Trigger shipment booking via active shipping provider |
| POST | `/api/v1/admin/orders/:id/schedule-pickup` | Schedule courier pickup (Shiprocket) |
| POST | `/api/v1/admin/orders/:id/print-label` | Generate and return shipping label URL (Shiprocket) |
| POST | `/api/v1/admin/orders/:id/cancel` | Cancel + refund if paid |
| POST | `/api/v1/admin/orders/:id/notifications/retrigger` | Re-trigger selected order notification template via selected channels (`EMAIL`/`SMS`/`WHATSAPP`) |
| GET | `/api/v1/admin/orders/export` | Export filtered orders as CSV for accounting/reporting |
| GET | `/api/v1/admin/reviews` | List reviews for moderation |
| PATCH | `/api/v1/admin/reviews/:id/moderate` | Approve or reject a review |
| GET | `/api/v1/admin/settings/shipping` | Read effective pickup pincode + minimum order value (DB/env source) |
| PATCH | `/api/v1/admin/settings/shipping` | Update pickup pincode and minimum order value used in checkout/shipping validation |
| GET | `/api/v1/admin/settings/store` | Read store profile (identity/regulatory) |
| PATCH | `/api/v1/admin/settings/store` | Update store profile (identity/regulatory) |
| GET | `/api/v1/admin/settings/notifications` | Read notification channel toggles |
| PATCH | `/api/v1/admin/settings/notifications` | Update notification channel toggles |
| GET | `/api/v1/admin/settings/inventory` | Read default low-stock threshold |
| PATCH | `/api/v1/admin/settings/inventory` | Update default low-stock threshold |
| GET | `/api/v1/admin/users` | Customer list with search + aggregates |
| GET | `/api/v1/admin/users/:id` | Customer detail + addresses + order history |
| GET | `/api/v1/admin/analytics/revenue` | Revenue over time (custom date range) |
| GET | `/api/v1/admin/analytics/revenue/export` | Revenue CSV export |
| GET | `/api/v1/admin/analytics/funnel` | Sessions → cart → checkout → payment funnel |
| GET | `/api/v1/admin/analytics/inventory-alerts` | Low stock report |
| GET | `/api/v1/admin/analytics/notifications` | Notification delivery rates per channel |
| GET | `/api/v1/admin/analytics/category-breakdown` | Revenue contribution by category |
| GET | `/api/v1/admin/coupons` | Coupon list + filters |
| POST | `/api/v1/admin/coupons` | Create coupon |
| PATCH | `/api/v1/admin/coupons/:id` | Update coupon |
| PATCH | `/api/v1/admin/coupons/:id/status` | Pause/resume coupon |
| DELETE | `/api/v1/admin/coupons/:id` | Delete coupon |
| GET | `/api/v1/admin/coupons/analytics` | Coupon redemption analytics |
| GET | `/api/v1/admin/queues` | Bull Board UI — queue monitor (admin JWT required) |

---

## 9. Module Definitions

### 🔐 Auth Module
- Stateless JWT: access token (15 min TTL) + refresh token (7 days, stored hashed in DB, invalidated on logout)
- Frontend stores `accessToken` in memory; `refreshToken` in `httpOnly` cookie — **never** `localStorage`
- OTP-based login via SMS provider (MSG91 or Fast2SMS per `SMS_PROVIDER`) — standard for Indian mobile-first e-commerce
- Admin login via `/auth/admin/login` — separate endpoint with stricter controls (8 req/min route cap + progressive account+IP lockout on repeated failures)
- Both roles share JWT structure with `role` claim (`CUSTOMER` vs `ADMIN`); admin tokens also carry operation permissions (`permissions[]`).
- `rolesGuard` on all admin routes rejects non-admin JWTs with 403, and sensitive admin routes enforce operation-level permissions (`dashboard:read`, `analytics:read`, `orders:read`, `orders:write`, `orders:export`, `orders:refund`, `orders:notify`, etc.) across catalogue, coupons, settings, reviews, inventory, orders, analytics, users, and queues.
- Customer namespaces (`/users/me*`, `/wishlist*`, `/orders*`, `/payments/*`, `/shipping/track/:awb`) enforce `rolesGuard(Role.CUSTOMER)` in addition to JWT validation.
- All JWT secrets are per-client — compromise of one client doesn't affect others

### 📦 Product Catalogue Module
- Products with slugs (SEO), description, tags, category, `attributes` JSON for flexible fields
- `attributes` JSON handles food-specific data: `nutritionInfo`, `allergens`, `shelfLife`, `fssaiNumber`, `hsnCode`
- Categories as self-referencing tree (`parentId`) — supports `Snacks > Namkeen > Bhujia`
- `ProductVariant` is the atomic unit in carts and orders — price, SKU, weight, stock are per-variant
- `compareAtPrice` for strike-through original price on storefront
- Full-text search via PostgreSQL `tsvector` — no external search service needed at this scale
- Soft-delete (`isActive=false`) — order history remains intact
- Bulk CSV import endpoint for clients with large catalogues

### 🛒 Cart Module
- Guest cart: created on first item add, tracked by `sessionToken` in `httpOnly` cookie, stored in PostgreSQL
- Cart response contracts do not expose `sessionToken`; the token remains cookie-bound only.
- Auth cart: linked to `userId`, persists across devices and sessions
- Cart merge on login: guest cart items moved to user's cart, quantities combined
- `priceSnapshot` on `CartItem`: price at add-time — prevents silent price changes from affecting cart total
- Cart reservation TTL (`CartReservation`): line-item stock hold (default 20 min), extended on cart activity, released on expiry/clear/merge/order conversion
- Reservation-aware stock semantics: available stock = inventory quantity - active reservations from other carts
- Cart expiry: guest carts expire after 30 days; BullMQ cleanup handles expired guest carts and expired reservations
- Delhivery serviceability check before checkout to validate delivery address
- Delivery rate calculation at cart stage using Delhivery rate calculator with total cart weight

### 📋 Orders Module
- Order creation is a single **Prisma transaction**: cart → order items, cart clear (inventory decremented later in `process-order-update` after captured payment — `deduct-inventory` and `confirm-order` are thin delegation stubs that enqueue this canonical job)
- If any variant has insufficient stock, the entire transaction rolls back — no partial orders, no overselling
- Order number format: `ORD-2026-00001` — human-readable, per-store sequential counter
- Full state machine with `OrderStatusHistory` audit trail on every transition
- `shippingAddress` is a JSON snapshot at order time — address book changes don't affect old orders
- Customer cancellation only allowed in `CONFIRMED` or `PROCESSING` — not after shipment; enforced within `cancellationWindowHours` from StoreSettings (default 24h)
- Post-delivery return requests: `POST /orders/:id/return-requests` → `ReturnRequest` model with status `REQUESTED → APPROVED/REJECTED → COMPLETED`

### 💳 Payments Module (Pluggable — `IPaymentProvider`)

**PREPAID flow (Razorpay):**
1. Customer places order with `paymentMode: PREPAID` → `POST /orders` → Order created in `PENDING_PAYMENT`
2. Frontend calls `POST /payments/initiate` → Backend calls Razorpay API → Returns `razorpay_order_id`
3. Frontend opens Razorpay Checkout modal
4. Customer pays → Razorpay sends `payment.captured` webhook
5. Backend verifies HMAC-SHA256 on **raw Buffer** — never parsed JSON body
6. On valid signature → BullMQ jobs: inventory deduct + confirm order + invoice + notifications
7. Redis idempotency: hashed keys derived from provider identifiers are checked before processing — duplicate webhooks ignored without storing raw provider IDs in Redis key names
8. Webhook responds `200 OK` in < 200ms — Razorpay's 5-second timeout is never at risk
9. Frontend also calls `POST /payments/verify` as secondary confirmation (belt-and-suspenders)
10. Critical mutation retries support deterministic replay with optional `Idempotency-Key` header

**COD flow (Shiprocket handles collection):**
1. Admin enables COD via `PATCH /admin/settings/cod` (`isCodEnabled: true`) — on/off toggle per store
2. Customer places order with `paymentMode: COD` → Order immediately created in `CONFIRMED` — no Razorpay step
3. Payment record created with `provider: COD`, `status: CREATED`
4. Admin packs order and triggers shipment → Shiprocket API called with `payment_method: "COD"` — Shiprocket's delivery agent collects cash at the customer's door
5. Shiprocket fires `delivered` webhook → `shipping.worker.ts` auto-marks `Payment.status = CAPTURED`; merchant website does nothing
6. Shiprocket remits net COD amount to merchant (D+8 working days standard; D+2 with Early COD plan)
7. `POST /payments/retry` returns `400 VALIDATION_ERROR` for COD orders
8. `CodPaymentAdapter` implements `PaymentProviderAdapter`: `verifyPaymentSignature` always returns `true`; `verifyWebhookSignature` always returns `false`; `initiateRefund` returns a manual-refund reference

### 🚚 Shipping Module (Pluggable — `IShippingProvider`)
- **Delhivery** (default): API token auth (`Authorization: Token <key>`). Programmatic AWB generation. Push webhook tracking.
- **Shiprocket** (switch via `SHIPPING_PROVIDER=shiprocket`): JWT auth with 9-day auto-refresh. Courier comparison + NDR management. Pickup scheduling. Label generation. Push webhook tracking.
- Both adapters implement the same `ShippingProviderAdapter` interface — business logic is provider-agnostic.
- `createShipment`: maps Order to provider API, returns AWB number + tracking URL
- Admin triggers shipment manually from admin panel after packing
- Provider push webhooks → `ShipmentEvent` records created → `Shipment.status` updated → BullMQ notification job
- `OUT_FOR_DELIVERY` → high-priority SMS/WhatsApp alert
- `DELIVERED` → order status `DELIVERED`, email with confirmation + review request; for COD orders, `Payment.status` auto-set to `CAPTURED` in the same transaction

### 🔔 Notifications Module (Pluggable — multi-channel)
- Three independent channel adapters: Email (Resend), SMS (MSG91 or Fast2SMS — selectable via `SMS_PROVIDER` ops config key), WhatsApp (Meta Cloud API direct)
- Each channel enabled/disabled by env var: `NOTIFY_EMAIL_ENABLED`, `NOTIFY_SMS_ENABLED`, `NOTIFY_WHATSAPP_ENABLED`
- 8 React Email templates: `ORDER_CONFIRMED`, `PAYMENT_FAILED`, `ORDER_SHIPPED`, `OUT_FOR_DELIVERY`, `ORDER_DELIVERED`, `ORDER_CANCELLED`, `LOW_STOCK_ALERT` (admin), `PASSWORD_RESET`
- All notifications queued via BullMQ — never synchronous in the request cycle
- Every send attempt creates a `NotificationLog` record
- Retry logic: 3 attempts with exponential backoff → dead-letter queue on permanent failure

### 🏷️ Coupons Module (Feature-Flagged: `FEATURE_COUPONS_ENABLED`)
- Discount types: `PERCENTAGE_OFF`, `FLAT_AMOUNT_OFF`, `FREE_SHIPPING`, `BUY_X_GET_Y`
- Minimum order value, per-customer usage limit, global usage limit
- Category or product-specific scope
- Validity window (start date, end date — auto-expires)
- Coupons are code-based and validated against date window, usage caps, minimum order, and optional product/category scope.
- **Soft delete only** — coupons are never hard-deleted; `deletedAt`/`deletedBy` are set and the coupon is excluded from active lists. Restoring sets `isActive=true` and clears soft-delete fields via `POST /api/v1/admin/coupons/:id/restore`.
- **Full mutation audit trail** — every create/update/status change/delete/restore writes a `CouponAuditLog` row with `previousState`, `newState`, and field-level diffs. Accessible at `GET /api/v1/admin/coupons/:id/audit`.
- **Tamper-evident hash chain** — each `CouponAuditLog` row carries a `chainHash` (SHA-256) and links to the prior row's hash via `previousChainHash`. First entry per coupon uses sentinel `'GENESIS'` as the anchor.
- **Per-admin mutation rate limits** — enforced by `AdminRateLimitStore` (Redis sliding window, bounded in-memory fallback): create 10/min, update 20/min, status-toggle 20/min, delete 5/min, restore 5/min. Exceeds return `429 RATE_LIMIT_EXCEEDED`.
- **Singleton service** with bounded 1000-entry TTL cache (1 min) — prevents redundant DB reads across concurrent requests.

### 🧾 GST Invoicing Module
- Invoice generated automatically on order confirmation, attached to confirmation email
- PDF contains: GSTIN, FSSAI number (food), HSN codes, CGST+SGST / IGST breakdown, invoice number
- Invoice number format: `FOOD-2026-00001` — sequential per store, configurable
- Generated in worker context with React PDF renderer (`@react-pdf/renderer`) using an Invoicely-style composition pattern, stored on local filesystem
- Authenticated download routes:
  - Customer: `GET /api/v1/orders/:id/invoice.pdf`
  - Admin: `GET /api/v1/admin/orders/:id/invoice.pdf`
- API payload contract exposes `invoice.hasPdf` metadata only (no public/signed invoice URLs)
- Credit note on refund, referencing original invoice number
- **Important:** For B2C food e-commerce (AATO < ₹5 Cr), PDF invoice is sufficient. IRP e-invoicing is not mandatory in the current template release.

### 🔐 Ops Config Mutation Policy (Contract-Driven)
- Ops config visibility/mutation is controlled by `src/modules/ops/ops-config-contract.ts`.
- `DATABASE_URL`, initial `REDIS_URL`, and `OPS_DB_ENCRYPTION_KEY` are bootstrap-only deployment env values; they are visible/read-only in ops metadata and are never activated from DB-backed config.
- Non-bootstrap `mutableViaOps: true` keys are editable only through ops auth + verified OTP save flow (`POST /api/v1/ops/config/save`) with encrypted DB persistence.
- API and worker processes apply the encrypted DB runtime overlay before provider/worker initialization; saved non-bootstrap values override real env only after restart.

### ⚙️ Admin Dashboard (Next.js + Refine)
- Admin routes are served from the same frontend deployment (for example `/admin`)
- Refine handles: data fetching, pagination, CRUD forms, table sorting/filtering, auth provider, access control
- Pages: Dashboard (KPIs + sales chart), Orders, Order Detail, Products, Product Editor, Inventory, Categories, Customers, Analytics, Queue Monitor, Settings
- Recharts for sales chart and funnel visualisation
- Bull Board UI at `/api/v1/admin/queues` — inspect job status, retry failed jobs, view dead-letter queue
- Branding per client: logo + 5 CSS variable changes = 15 minutes

---

## 10. Background Job Queues

All async work is handled by named BullMQ queues. Workers run in a dedicated worker process (`npm run dev:workers` / `npm run start:workers`) separate from the Fastify API process. Every job has: 3-attempt retry with exponential backoff, dead-letter queue for permanent failures, 24-hour job history inspectable via Bull Board.

| Queue | Jobs | Triggered By |
|---|---|---|
| `order-processing` | `process-order-update` (canonical), `deduct-inventory` (stub), `confirm-order` (stub), `payment-webhook`, `generate-invoice`, `generate-credit-note` | Payment/refund webhook lifecycle — `process-order-update` is the single authoritative handler for order confirmation and all side effects |
| `notifications` | `send-email`, `send-sms`, `send-whatsapp` | Order status/auth/inventory lifecycle events (template-driven) |
| `shipping` | `create-shipment` (backward compat: `create-delhivery-shipment`), `update-shipment-status`, `shipment-webhook` (legacy alias), `shiprocket-token-refresh` | Admin triggers / Provider webhook |
| `inventory-alerts` | `check-low-stock` (repeatable — every 1 hour) | Scheduled — runs continuously |
| `refunds` | `initiate-razorpay-refund` | Order cancellation with captured payment |
| `analytics` | `record-event` (page-view, add-to-cart, purchase) | Storefront events |
| `cart-cleanup` | `delete-expired-guest-carts` (daily), `release-expired-reservations` (every 60s) | Scheduled cleanup + stock release |
| `outbox-dispatch` | `publish-pending` (repeatable — every 10 sec) | Publishes persisted outbox events to target queues |
| `reconciliation` | `run-order-lifecycle-check` (repeatable — every 60 min) | Detects lifecycle drift and records reconciliation issues |

**Why BullMQ for payment webhooks specifically:**
> Razorpay has a 5-second webhook response timeout. After `payment.captured`, the downstream chain — inventory decrement + email + SMS + invoice generation — can take 2–10 seconds. The webhook handler verifies the signature, pushes jobs to BullMQ queues with minimal payload metadata, and responds `200 OK` in < 200ms. Redis idempotency key prevents duplicate processing when Razorpay retries.

---

## 11. Security Architecture

| Layer | Implementation |
|---|---|
| Authentication | JWT (HS256), refresh token rotation, refresh token stored hashed in DB, invalidated on logout |
| Password Storage | bcrypt with cost factor 12 |
| Input Validation | JSON Schema on every Fastify route — invalid body rejected before service layer. All 300+ `type: 'object'` declarations enforce `additionalProperties: false` (only webhook header schemas intentionally use `true`). |
| SQL Injection | Prisma parameterised queries — structurally impossible via the ORM |
| Rate Limiting | Fastify `rate-limit` plugin (tiered + dynamic by load-shed mode) + Nginx route-class `limit_req` zones — dual layer |
| Webhook Verification | Razorpay: HMAC-SHA256 on **raw Buffer** with timing-safe compare. Shipping: token-authenticated webhook payload using provider-specific inbound token (`DELHIVERY_WEBHOOK_TOKEN` or `SHIPROCKET_WEBHOOK_TOKEN`) with timing-safe compare. |
| CORS | Whitelist only the client's frontend domain — no wildcard `*` |
| Security Headers | **App layer:** `@fastify/helmet` — sets CSP, HSTS, X-Frame-Options, X-Content-Type-Options. **Nginx layer:** `Strict-Transport-Security` (HSTS 2yr + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block` (see `nginx/client.conf.template`). |
| HTTPS | Enforced at Nginx — HTTP always redirected, TLSv1.2 minimum |
| Secrets | Bootstrap secrets stay in `.env` / deployment secret manager and `.env*` is ignored. DB-overlay eligible ops config values are encrypted in `OpsConfigSecret` and applied only after restart. Production merchant admin provisioning is invite-only; legacy seed scripts are local/emergency tools and read credentials from env vars. `JWT_SECRET` and `JWT_REFRESH_SECRET` fail-fast if missing/empty after overlay. |
| Admin Routes | Role guard + operation permission guard + stricter auth throttling (progressive account+IP lockout) + dedicated admin read/write limits |
| Ops Routes | Layer C only: IP-allowlist → API key (bcrypt with salt) → optional email-OTP MFA (`OPS_MFA_ENFORCE`) → dual approval for critical writes (`OPS_DUAL_APPROVAL_WINDOW_MINUTES`). No merchant access. |
| Payment Data | Never store raw card details — Razorpay handles all PCI DSS compliance |
| Cookie Security | Refresh token: `httpOnly=true`, `secure=true`, `sameSite=strict` |
| Reliability Guardrails | Load-shed mode (`normal/reduced/emergency`), optional idempotency replay, outbox/inbox persistence, reconciliation checks |
| **Concurrency & Atomicity** | TOCTOU (Time-of-Check-to-Time-of-Use) vulnerabilities eliminated via Prisma `updateMany` Compare-And-Swap (CAS) pattern: atomic updates guarded by status/field conditions prevent race conditions. Distributed Redis locks serialize audit chain writes (`OpsAuditLog`, `CouponAuditLog`). All CAS paths include test-mock fallbacks for backward compatibility. See §11.2 for surface-by-surface coverage. |

### 11.1 Atomic Operations & Distributed Locking (Race-Condition Hardening)

All critical state transitions use atomic CAS patterns to prevent TOCTOU races:

| Surface | Atomic Pattern | Guard Condition |
|---------|----------------|-----------------|
| Idempotency first-write | `create` + unique-conflict catch + `updateMany` | `status: PROCESSING` → `COMPLETED`/`FAILED` |
| Admin invite expiry | `updateMany` | `status in ['CREATED', 'EMAIL_SENT']` → `EXPIRED_CLEANED` |
| Admin invite consumption | `updateMany` | `status in ['CREATED', 'EMAIL_SENT']` → `CONSUMED` |
| Refresh token consume | `updateMany` | `consumedAt: null` → `new Date()` (prevents double-spend) |
| Ops OTP verification | `updateMany` | `attempts < max AND status = PENDING` |
| Ops invite cleanup | `deleteMany` | `status in ['CREATED', 'EMAIL_SENT']` |
| Dual-approval confirm | `updateMany` (inside transaction) | `status = PENDING` → `CONFIRMED`/`REJECTED` |
| Reconciliation auto-heal | `updateMany` | `status: not REFUNDED` → `REFUNDED`; `status = PENDING_PAYMENT` → `CANCELLED` |
| Webhook inbox claim | `create` + unique-violation + `updateMany` | `status = FAILED` → `PROCESSING` |
| Analytics replay | `updateMany` | `status = PENDING` ↔ `FAILED` |
| Audit chain append | Redis lock + Prisma `create` | `withOpsAuditChainLock()` serializes chain-head reads |

**Compatibility strategy:** All CAS paths detect mock delegates (`'mock' in delegate.method`) and fall back to single-row `update`/`delete` to satisfy existing test assertions. Production deployments using real Prisma clients execute full atomic guards.

### 11.2 Fastify Request Pipeline

Every incoming API request passes through this pipeline in order. No bypassing at any layer.

```
Request
  → Nginx               (edge rate limiting, HTTPS enforcement, SSL termination)
  → Fastify onRequest   (Helmet headers, CORS check)
  → Fastify preHandler  (jwtAuthGuard → rolesGuard)
  → Route preValidation (JSON Schema validation — body / params / query)
  → Controller          (thin — calls service only, no business logic)
  → Service Layer       (all business logic lives here)
  → Prisma              (parameterised database queries)
  → Fastify onSend      (wraps response in standard envelope)
  → Response

Exception at any layer → Global Error Handler → standard error envelope → correct HTTP status
```

---

## 12. Per-Client Customisation Checklist

When deploying for a new client, **only these items change**. No core business logic changes.

Operational release sign-off must pair:
- `docs/BACKEND_GO_LIVE_CHECKLIST.md` (full backend environment-to-implementation parity across required env groups)
- `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` (frontend integration contract and browser boundary checks)

Integration operations controls (mandatory before go-live):
- `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md`
- `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`
- One staging dry run per provider class is completed and archived.
- 90-day rotation calendar is assigned with primary + backup owners.
- Compromise drill (`revoke -> regenerate -> redeploy -> verify`) evidence is archived.
- Shipment dispatch policy is validated as manual-only (`POST /api/v1/admin/orders/:id/ship`); payment confirmation does not auto-book shipments.

### 12.1 Environment Variables (`.env`)

```bash
# Store identity
STORE_NAME="Annapoorna Foods"
STORE_GSTIN=29AAAAA0000A1Z5
STORE_FSSAI=12345678901234     # food clients only
STORE_TIMEZONE=Asia/Kolkata

# Infrastructure
CLIENT_ID=annapoorna
BACKEND_PORT=3001
DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/client_annapoorna
JWT_SECRET=<openssl rand -base64 64>
JWT_REFRESH_SECRET=<openssl rand -base64 64>

# Payment adapter
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=rzp_live_XXXXXXXX
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>

# Shipping adapter (set SHIPPING_PROVIDER to switch — zero code changes)
SHIPPING_PROVIDER=delhivery

# Delhivery credentials (used when SHIPPING_PROVIDER=delhivery)
DELHIVERY_API_KEY=<api-key>
DELHIVERY_WEBHOOK_TOKEN=<webhook-secret>
DELHIVERY_PICKUP_PINCODE=<pincode>

# Shiprocket credentials (used when SHIPPING_PROVIDER=shiprocket)
SHIPROCKET_EMAIL=<shiprocket-email>
SHIPROCKET_PASSWORD=<shiprocket-password>
SHIPROCKET_WEBHOOK_TOKEN=<webhook-secret>
SHIPROCKET_PICKUP_PINCODE=<pincode>

# Notifications
NOTIFY_EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_XXXXXXXX
EMAIL_FROM=orders@annapoorna.com

NOTIFY_SMS_ENABLED=true
SMS_PROVIDER=msg91           # msg91 | fast2sms | noop
MSG91_AUTH_KEY=<auth-key>    # Required when SMS_PROVIDER=msg91
MSG91_SENDER_ID=ANNFDS       # Required when SMS_PROVIDER=msg91
# FAST2SMS_API_KEY=<key>     # Required when SMS_PROVIDER=fast2sms

NOTIFY_WHATSAPP_ENABLED=false
```

### 12.2 Feature Flags (also in `.env`)

```bash
FEATURE_COUPONS_ENABLED=false              # Enable when client needs promos
FEATURE_REVIEWS_ENABLED=false              # Enable when reviews module is active
FEATURE_WISHLIST_ENABLED=false             # Enable when wishlist module is active
FEATURE_GST_INVOICING_ENABLED=true         # Always true for Indian clients
FEATURE_RESPONSE_ENVELOPE_ENABLED=false    # Wraps all 2xx JSON in { success, data, meta? }
```

### 12.3 Product Schema Extensions (Prisma — client repo only)

```prisma
// Food client — add to Product model
nutritionInfo Json?    // { per100g: { calories, protein, fat, carbs } }
allergens     String[] // ["gluten", "nuts", "dairy"]
shelfLife     Int?     // days
fssaiNumber   String?
hsnCode       String?

// Apparel — ProductVariant.attributes Json already handles { size: "L", color: "Red" }
// Electronics — add to Product model
specifications Json?   // { processor: "M3", ram: "16GB", storage: "512GB" }
warranty       String?
```

### 12.4 Notification Templates
- Copy React Email templates from `/src/modules/notifications/templates/`
- Update brand colours, logo, store name, footer links
- ~30 minutes to brand all 8 templates

### 12.5 Admin Dashboard Branding
- Replace `/public/logo.png`
- Update 5 CSS variables in `/src/styles/theme.css`
- Set `NEXT_PUBLIC_STORE_NAME` in admin `.env`
- **Total: ~15 minutes**

---

## 13. Development Phases

Six phases. Sequential. Do not start a phase until the previous phase's deliverable is verified end-to-end.

### Phase 1 — Foundation ⏱ Weeks 1–2
- Fastify project: TypeScript strict mode, ESLint, Prettier, path aliases
- Prisma setup: all core models in `schema.prisma`, first migration, `PrismaService` singleton
- PostgreSQL + Redis connection, health check endpoint (`/api/v1/health`)
- Auth module: OTP send/verify (SMS provider per `SMS_PROVIDER`), JWT issue/refresh, admin login, `jwtAuthGuard`, `rolesGuard`
- Users module: profile CRUD, address book
- Global error handler, standard response envelope via `onSend` hook, Helmet, CORS
- BullMQ setup: queue registry, all worker stubs (empty — wired up in later phases)
- Docker Compose: `docker compose up -d postgres redis` for infrastructure; Node runs on host via `npm run dev` *(Ensure `REDIS_PASSWORD` is set in `.env` to prevent protected-mode `ECONNRESET` loops)*
- **Deliverable:** Authenticated API with working OTP login, all infrastructure wired

### Phase 2 — Core Commerce ⏱ Weeks 3–4
- Products module: CRUD, categories (tree), variants, image upload with HTTPS CDN-compatible URLs
- Inventory module: stock tracking, `lowStockThreshold`, `lowStockAlerted` flag
- Cart module: guest cart (session token), auth cart (userId), merge on login, `priceSnapshot`, cart expiry job
- Orders module: order creation transaction (cart → order items + cart clear atomically), with inventory decrement in `order-processing` `process-order-update` after captured payment (`deduct-inventory`/`confirm-order` are delegation stubs)
- Order state machine fully implemented with `OrderStatusHistory` audit trail
- **Deliverable:** Full browse → add-to-cart → prepaid checkout flow, end-to-end

### Phase 3 — Payment & Logistics Integrations ⏱ Weeks 5–6
- Payments module: Razorpay adapter (`createOrder`, `verifyPayment`, `verifyWebhookSignature`, `initiateRefund`)
- Webhook handler: HMAC verification on raw Buffer, Redis idempotency, BullMQ dispatch, `200 OK` in < 200ms
- `order-processing` BullMQ worker: deduct inventory, confirm order, generate invoice
- Shipping module: Delhivery adapter (`createShipment`, `trackShipment`, `cancelShipment`, webhook processing)
- `ShipmentEvent` records created on each Delhivery push
- Delhivery webhook → order status update → BullMQ notification job
- GST invoice PDF generation with React PDF renderer (`@react-pdf/renderer`), stored on local filesystem, linked to order
- **Deliverable:** Full prepaid checkout with real Razorpay payment + Delhivery shipment creation

### Phase 4 — Notifications & Admin API ⏱ Weeks 7–8
- Notifications module: Resend email adapter + all 8 React Email templates
- SMS adapter: MSG91 (DLT-compliant) or Fast2SMS (no DLT required), selectable via `SMS_PROVIDER` — OTP + transactional order notifications
- `notifications` BullMQ worker — processes all jobs, creates `NotificationLog` records
- Inventory alerts repeatable job (hourly) + refunds worker
- All admin REST endpoints: dashboard KPIs, products, orders, inventory, users, analytics
- Bull Board UI mounted at `/api/v1/admin/queues` (admin JWT required)
- **Deliverable:** Full order lifecycle with notifications + complete admin API

### Phase 5 — Admin Frontend & Hardening ⏱ Weeks 9–10
- Next.js + Refine admin dashboard: all pages (dashboard, orders, products, inventory, customers, analytics, settings)
- Refine data provider wired to `/api/v1/admin/*` endpoints
- Recharts sales chart and funnel chart in analytics page
- Security audit: Helmet config, CORS whitelist, rate limit tuning, all JSON schemas reviewed
- Swagger / OpenAPI docs auto-generated from Fastify JSON schemas
- `.env.example` finalised — every variable documented with description and example value
- Reliability automation scripts finalised and tested (`dr-*`, `release:*`, `parity:scorecard`)
- End-to-end test: browse → cart → Razorpay payment → order confirmed → Delhivery shipment → delivered notification
- Clean all TODO comments, dead code, placeholder values
- **Deliverable:** Hardened, documented, deployable template

### Phase 6 — First Client Deployment (Food Store) ⏱ Week 11
- Clone template → create `client-foodstore-backend` and `client-foodstore-admin` repos
- Add food-specific Prisma fields: `nutritionInfo`, `allergens`, `shelfLife`, `fssaiNumber`, `hsnCode`
- Configure `.env`: Razorpay keys, Delhivery API key, Resend, SMS provider (MSG91 or Fast2SMS), `STORE_FSSAI`, `STORE_GSTIN`
- Enable: email + SMS notifications. Disable: guest checkout and WhatsApp. Keep reviews/wishlist OFF until storefront modules are enabled.
- Customise email templates with food client branding
- Deploy to VPS: Nginx config, SSL, Docker Compose up, Prisma migrations
- Seed initial product catalogue via CSV import or admin panel
- Go-live monitoring: watch BullMQ queues, Nginx logs, PostgreSQL for 48 hours
- **Deliverable:** Live production food e-commerce site — template proven in production

---

## 14. Future Module Roadmap

## 15. Operational Parity Controls (90%+ Closeout v3)

- Edge and app abuse-defense controls share a single policy source (`src/common/security/edge-policy.ts`) to prevent drift.
- Edge/app parity drift checks are executable via `npm run edge:drift-check`.
- Reliability SLO and burn-rate automation rules are versioned in `observability/slo-rules.yml` with test harness `observability/slo-rules.test.yml`.
- Deploy freeze guardrails are executable via `npm run release:guard` (supports env + file-based reliability state truth).
- Ops metrics endpoint (`/api/v1/ops/metrics`) is protected by allowlist/token and not publicly exposed by default.
- Reconciliation control-plane visibility is exposed at `/api/v1/admin/analytics/reconciliation-issues` with severity/classification/age metadata.
- Outbox dead-letter replay can be operator-triggered at `/api/v1/admin/analytics/outbox-dead-letter/:id/replay`.
- Auth abuse defense supports server-side challenge validation and challenge-outcome observability.
- Flash-sale no-oversell contention simulation is executable via `npm run stress:flash-sale:api:matrix`.
- Flash-sale API evidence is only valid when fixture preconditions are met; runs with `fixturePreconditionMet=false` (for example all `rejected_client`) must fail invariant enforcement.
- DR/game-day cadence is executable with `npm run dr:drill:checklist` and evidence freshness validation via `npm run dr:drill:stale-check`.

### 15.1 Implemented vs Roadmap Boundary

- **Implemented now:** reliability scripts, replay governance APIs, queue/SLO artifacts, CI reliability/security workflows, and parity evidence scorecards.
- **Roadmap/ops rollout:** full production telemetry wiring for live release policy, production-grade ephemeral DR orchestration commands, and full per-client Prometheus/Alertmanager/Grafana infrastructure.
- **Rule:** roadmap controls must be explicitly labeled and never represented as active runtime guarantees without evidence artifacts.


Drop-in additions — each is a self-contained Fastify plugin, added to `app.ts`, enabled via a feature flag. Adding to an existing client deployment is a code update + Prisma migration, not a rebuild.

| Module | Description | Priority |
|---|---|---|
| **Abandoned Cart Recovery** | BullMQ job emails customers who added items but didn't checkout (triggered 1h after cart inactivity) | High |
| **Return & Exchange Flow** | Structured return requests, admin approval, reverse pickup via Delhivery, refund trigger | High |
| **WhatsApp Commerce** | Full order status flow via WhatsApp Business API (Meta Cloud API or Interakt) | High |
| **Subscription Orders** | Recurring orders with billing schedule (weekly ghee, monthly spice box, etc.) | Medium |
| **Referral Program** | Referral codes, credit wallet, refer-a-friend tracking | Medium |
| **Delivery Time Slots** | Time-window selection (morning/evening) for hyperlocal or perishable food delivery | Medium |
| **Multi-Image Upload (R2)** | Cloudflare R2 storage adapter for scalable media storage, S3-compatible | Medium |
| **Multi-Warehouse Inventory** | Zone-based stock allocation per fulfilment centre | Low |
| **Product Q&A** | Customer questions on product pages, answered by admin | Low |
| **Prometheus + Grafana full stack rollout** | Metrics endpoint and alert artifacts exist in backend; full per-client observability stack rollout remains optional operational work | Low |
| **Stripe Adapter** | Payment adapter for international clients | Low |
| **Shopify-style Webhooks** | Outbound webhooks for clients who want to sync orders to external systems | Low |

---

## Final Decision Log — All Locked

| Decision | Answer | Rationale |
|---|---|---|
| Backend Framework | Fastify + TypeScript | 3–5× faster than Express. Built-in schema validation. Plugin architecture = modular template. |
| Frontend (Storefront) | Next.js (App Router) | SSR for product page SEO. App Router for streaming + server components. |
| Admin Dashboard | Next.js + Refine | Refine handles CRUD/tables/auth/pagination. One framework for both frontends. |
| Database | PostgreSQL 16 | ACID is non-negotiable for financial transactions. JSONB for flexible product data. MongoDB rejected. |
| ORM | Prisma | Type-safe, schema-first, auto-migrations, impossible SQL injection. |
| Money Storage | Integer paise | No float rounding. ₹1 = 100 paise. All math is integer math. |
| Cache + Queue | Redis 7 + BullMQ | Sessions, rate limiting, webhook idempotency, async job processing. |
| Payment (default) | Razorpay | India-first, best webhook reliability. Swappable via `IPaymentProvider`. |
| Delivery (default) | Delhivery | API token auth, 18,700+ pincodes, push webhooks. Swappable via `IShippingProvider`. |
| Email | Resend + React Email | Typed, version-controlled templates. Great deliverability. Free tier sufficient. |
| SMS | MSG91 | India-first, OTP + transactional, cheapest rates. |
| Architecture | Modular Monolith | One Fastify process per client. Clean module boundaries. Swap-anything adapter pattern. |
| VPS Isolation | Docker Compose per client | Full process isolation. Easy rollback. Independent restart. Zero data bleed. |
| Reverse Proxy | Nginx (host) + Certbot | All domains → correct containers. SSL auto-renew. Rate limiting at edge. |
| Git Workflow | 1 template → clone per client | Template is master IP. Each client repo is independent. No shared runtime ever. |
| VPS OS | Ubuntu 22.04 LTS | 5-year LTS. Best Docker + Nginx documentation. |
| Concurrency Safety Pattern | CAS `updateMany` + mock-compat fallback | All critical state mutations (inventory, alerts, outbox, coupon cap, MFA, invites, refunds, reconciliation, idempotency) use Prisma `updateMany` with guard conditions. Zero-count result → `409 CONFLICT`. Test mock detection (`vi.fn` in delegate) falls back to single-row `update`/`delete` for backward test compatibility without weakening production atomicity. |
| SQL Injection Prevention | Parameterized Prisma SQL + CI guard | All raw SQL uses `prisma.$executeRaw\`...\`` / `prisma.$queryRaw\`...\`` tagged templates (never `$executeRawUnsafe` or `$queryRawUnsafe`). CI gate `scripts/sql-injection-guard.js` scans `src/`, `queues/`, `scripts/` for unsafe patterns and fails build on detection. |

---

*This document is the canonical source of truth for the e-commerce backend template.*  
*TRD and BRD are derived from this document — they do not contradict it.*  
*Development begins with Phase 1. First code generated: `prisma/schema.prisma` and Fastify bootstrap.*

---

> **Deploying this template for a new client?** The end-to-end sequenced execution order — from client intake and third-party account setup, through VPS provisioning, backend configuration, staging dry-runs, frontend build, VPS deploy, ops bootstrap, admin provisioning, webhook registration, go-live validation, DNS cutover, and post-handoff maintenance setup — is consolidated in **[`docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md`](docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md)**. All isolation rules defined in this document (§5, §11) are enforced as evidence gates in that runbook.
