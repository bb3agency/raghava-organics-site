# API Endpoint Index

Canonical low-noise index of backend HTTP endpoints. Route files and schemas remain the source of truth for request/response details.

**Primary code sources:** `src/modules/**/*.routes.ts`, `src/modules/**/*.schemas.ts`, `src/common/auth/admin-endpoint-policy-registry.ts`.

---

## How to use this doc

- **Frontend agents:** Use this to plan pages, navigation, permissions, and API client methods.
- **Backend agents:** Update this doc when adding/removing routes.
- **Detailed contracts:** Use `TRD.md` and colocated module schemas.
- **Admin permissions:** Use `src/common/auth/admin-permissions.ts` and `src/common/auth/admin-endpoint-policy-registry.ts`.
- **Error handling canon:** Use `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` section `2.1` (frontend matrix) and `docs/CLIENT_VPS_SETUP_GUIDE.md` section `19.1` (runtime triage matrix).

---

## Public and health endpoints

| Method | Endpoint | Purpose | Source |
|---|---|---|---|
| GET | `/api/v1/health` | Full health check | `health.routes.ts` |
| GET | `/api/v1/health/live` | Liveness check | `health.routes.ts` |
| GET | `/api/v1/health/ready` | Readiness/dependency freshness check | `health.routes.ts` |
| GET | `/api/v1/products` | Public product listing | `products.routes.ts` |
| GET | `/api/v1/products/categories` | Public category list | `products.routes.ts` |
| GET | `/api/v1/products/categories/:slug/products` | Products by category | `products.routes.ts` |
| GET | `/api/v1/products/:slug` | Product detail by slug | `products.routes.ts` |
| GET | `/api/v1/reviews/product/:slug` | Public product reviews | `reviews.routes.ts` |

---

## Auth endpoints

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Customer registration | Idempotency guarded |
| POST | `/api/v1/auth/send-otp` | Send OTP | Auth-sensitive rate limit |
| POST | `/api/v1/auth/verify-otp` | Verify OTP and issue auth | Sets refresh cookie |
| POST | `/api/v1/auth/signup-phone` | Phone signup flow | Idempotency guarded |
| POST | `/api/v1/auth/forgot-password` | Forgot password flow | Idempotency guarded |
| POST | `/api/v1/auth/login` | Customer login | Sets refresh cookie |
| POST | `/api/v1/auth/refresh` | Refresh access token | Uses HTTP-only refresh cookie |
| POST | `/api/v1/auth/logout` | Logout | Clears refresh cookie |
| POST | `/api/v1/auth/admin/login` | Merchant admin login | Admin JWT + cookies |
| POST | `/api/v1/auth/admin/mfa/setup/start` | Start admin MFA setup | Requires admin auth |
| POST | `/api/v1/auth/admin/mfa/setup/confirm` | Confirm admin MFA setup | Requires admin auth |
| POST | `/api/v1/auth/admin/mfa/disable` | Disable admin MFA | Requires admin auth |

Identity boundary contract (critical):

- Email identities are exclusive across customer/admin (`User`) and ops (`OpsUser`) accounts.
- Customer registration and phone-signup with email reject emails already used by ops accounts.
- Admin/ops invite setup flows reject emails already used by the other account domain.

---

## Customer cart, checkout, orders, and account endpoints

| Method | Endpoint | Purpose | Notes |
|---|---|---|---|
| GET | `/api/v1/cart` | Get current cart | Guest/customer session aware |
| POST | `/api/v1/cart/items` | Add cart item | Idempotency guarded |
| PATCH | `/api/v1/cart/items/:id` | Update cart item quantity | Cart mutation |
| DELETE | `/api/v1/cart/items/:id` | Remove cart item | Cart mutation |
| DELETE | `/api/v1/cart` | Clear cart | Cart mutation |
| POST | `/api/v1/cart/merge` | Merge guest cart after login | Cart/session flow |
| POST | `/api/v1/cart/coupon` | Apply coupon | Idempotency guarded |
| DELETE | `/api/v1/cart/coupon` | Remove coupon | Cart mutation |
| POST | `/api/v1/cart/check-pincode` | Check delivery serviceability | Shipping estimate flow |
| GET | `/api/v1/cart/delivery-rates` | Estimate delivery rates | Shipping estimate flow |
| POST | `/api/v1/orders` | Create order | Customer auth + idempotency |
| GET | `/api/v1/orders/:id` | Customer order detail | Owner-only |
| GET | `/api/v1/orders/:id/invoice.pdf` | Customer invoice PDF | Owner-only PDF |
| POST | `/api/v1/orders/:id/cancel` | Customer order cancel | Idempotency guarded |
| POST | `/api/v1/payments/initiate` | Start prepaid payment | Customer auth + idempotency |
| POST | `/api/v1/payments/verify` | Verify Razorpay payment callback | Customer auth + idempotency |
| POST | `/api/v1/payments/retry` | Retry failed payment | Customer flow |
| GET | `/api/v1/shipping/track/:awb` | Track shipment | Customer auth |
| POST | `/api/v1/orders/:id/return-requests` | Create return request | Customer flow |
| GET | `/api/v1/users/me` | Current customer profile | Customer auth |
| PATCH | `/api/v1/users/me` | Update profile | Customer auth |
| GET | `/api/v1/users/me/addresses` | List addresses | Customer auth |
| POST | `/api/v1/users/me/addresses` | Create address | Customer auth |
| PATCH | `/api/v1/users/me/addresses/:id` | Update address | Customer auth |
| DELETE | `/api/v1/users/me/addresses/:id` | Delete address | Customer auth |
| GET | `/api/v1/users/me/orders` | Customer order history | Customer auth |
| GET | `/api/v1/reviews/me` | Customer review history | Customer auth |
| POST | `/api/v1/reviews` | Create product review | Customer auth |
| GET | `/api/v1/wishlist` | Wishlist listing | Customer auth |
| POST | `/api/v1/wishlist/items` | Add wishlist item | Customer auth |
| DELETE | `/api/v1/wishlist/items/:productId` | Remove wishlist item | Customer auth |

---

## Webhook endpoints

Browser apps must never call these endpoints.

| Method | Endpoint | Purpose | Source |
|---|---|---|---|
| POST | `/api/v1/payments/webhook` | Razorpay payment webhook | `orders.routes.ts` |
| POST | `/api/v1/shipping/webhook` | Shipping provider webhook | `orders.routes.ts` |
| GET | `/api/v1/notifications/webhook/meta-whatsapp` | Meta WhatsApp verification | `notifications-webhook.routes.ts` |
| POST | `/api/v1/notifications/webhook/meta-whatsapp` | Meta WhatsApp events | `notifications-webhook.routes.ts` |

---

## Merchant admin UI endpoint groups

Admin UI should be served under `/admin/*` in the frontend and call `/api/v1/admin/*` backend routes. Navigation must be permission-aware.

### Admin dashboard

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/dashboard/kpis` | KPI cards |
| GET | `/api/v1/admin/dashboard/sales-chart` | Sales chart |
| GET | `/api/v1/admin/dashboard/top-products` | Top products table |

### Products and categories

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/products` | Product table |
| GET | `/api/v1/admin/products/:id` | Product detail/editor |
| POST | `/api/v1/admin/products/import-csv` | CSV import |
| POST | `/api/v1/admin/products` | Create product |
| PATCH | `/api/v1/admin/products/:id` | Update product |
| DELETE | `/api/v1/admin/products/:id` | Delete product |
| POST | `/api/v1/admin/products/:id/variants` | Create variant |
| PATCH | `/api/v1/admin/products/:id/variants/:variantId` | Update variant |
| POST | `/api/v1/admin/products/:id/images` | Add product image |
| PATCH | `/api/v1/admin/products/:id/images/reorder` | Reorder images |
| DELETE | `/api/v1/admin/products/:id/images/:imageId` | Delete image |
| GET | `/api/v1/admin/categories` | Category table |
| POST | `/api/v1/admin/categories` | Create category |
| PATCH | `/api/v1/admin/categories/:id` | Update category |
| DELETE | `/api/v1/admin/categories/:id` | Delete category |

### Orders, shipping, returns, invoices

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/orders` | Orders table |
| GET | `/api/v1/admin/orders/board` | Pipeline/kanban board |
| GET | `/api/v1/admin/orders/export` | CSV export |
| GET | `/api/v1/admin/orders/:id` | Order detail |
| GET | `/api/v1/admin/orders/:id/invoice.pdf` | Invoice download |
| PATCH | `/api/v1/admin/orders/:id/status` | Status update |
| POST | `/api/v1/admin/orders/:id/ship` | Manual shipment booking |
| POST | `/api/v1/admin/orders/:id/schedule-pickup` | Schedule pickup |
| POST | `/api/v1/admin/orders/:id/print-label` | Print shipping label |
| POST | `/api/v1/admin/orders/:id/cancel` | Cancel/refund-sensitive action |
| POST | `/api/v1/admin/orders/:id/notifications/retrigger` | Retrigger notifications |
| GET | `/api/v1/admin/return-requests` | Return request queue |
| PATCH | `/api/v1/admin/return-requests/:id` | Update return request |

### Inventory

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/inventory` | Inventory table |
| GET | `/api/v1/admin/inventory/low-stock` | Low-stock queue |
| PATCH | `/api/v1/admin/inventory/:variantId` | Stock adjustment |

### Coupons and promotions

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/coupons/analytics` | Coupon analytics |
| GET | `/api/v1/admin/coupons` | Coupon table |
| POST | `/api/v1/admin/coupons` | Create coupon |
| PATCH | `/api/v1/admin/coupons/:id` | Update coupon |
| PATCH | `/api/v1/admin/coupons/:id/status` | Pause/resume/status change |
| DELETE | `/api/v1/admin/coupons/:id` | Soft-delete coupon |
| POST | `/api/v1/admin/coupons/:id/restore` | Restore coupon |
| GET | `/api/v1/admin/coupons/:id/audit` | Coupon audit trail |

### Reviews and customers

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/reviews` | Review moderation queue |
| PATCH | `/api/v1/admin/reviews/:id/moderate` | Moderate review |
| GET | `/api/v1/admin/users` | Customer table |
| GET | `/api/v1/admin/users/:id` | Customer detail |

### Analytics and reliability

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/analytics/revenue` | Revenue chart |
| GET | `/api/v1/admin/analytics/revenue/export` | Revenue CSV export |
| GET | `/api/v1/admin/analytics/funnel` | Funnel chart |
| GET | `/api/v1/admin/analytics/inventory-alerts` | Inventory alert analytics |
| GET | `/api/v1/admin/analytics/notifications` | Notification analytics |
| GET | `/api/v1/admin/analytics/reconciliation-issues` | Reconciliation issue list |
| GET | `/api/v1/admin/analytics/category-breakdown` | Category analytics |
| GET | `/api/v1/admin/analytics/outbox-dead-letter` | Outbox DLQ table |
| POST | `/api/v1/admin/analytics/outbox-dead-letter/:id/replay-preview` | Preview outbox replay |
| POST | `/api/v1/admin/analytics/outbox-dead-letter/:id/replay` | Execute outbox replay |
| GET | `/api/v1/admin/analytics/inbox-failures` | Inbox failure table |
| POST | `/api/v1/admin/analytics/inbox-failures/:id/replay-preview` | Preview inbox replay |
| POST | `/api/v1/admin/analytics/inbox-failures/:id/replay` | Execute inbox replay |
| GET | `/api/v1/admin/queues` | Bull Board UI |
| GET | `/api/v1/admin/queues/dlq/summary` | DLQ summary card |

### Settings

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/admin/settings/shipping` | Shipping settings |
| PATCH | `/api/v1/admin/settings/shipping` | Update shipping settings |
| GET | `/api/v1/admin/settings/store` | Store profile settings |
| PATCH | `/api/v1/admin/settings/store` | Update store profile |
| GET | `/api/v1/admin/settings/notifications` | Notification settings |
| PATCH | `/api/v1/admin/settings/notifications` | Update notification settings |
| GET | `/api/v1/admin/settings/inventory` | Inventory defaults |
| PATCH | `/api/v1/admin/settings/inventory` | Update inventory defaults |
| GET | `/api/v1/admin/settings/cod` | COD settings |
| PATCH | `/api/v1/admin/settings/cod` | Update COD settings |

### Admin invite setup

| Method | Endpoint | UI use |
|---|---|---|
| POST | `/api/v1/admin/invites` | Ops-created merchant admin invite |
| POST | `/api/v1/admin/invites/setup/send-otp` | Send setup OTP |
| POST | `/api/v1/admin/invites/consume` | Consume setup token on `/admin/setup` |
| POST | `/api/v1/admin/invites/cleanup-expired` | Ops cleanup of expired invites |

Setup URL contract:

- `setupBaseUrl` must be the frontend base origin (for example, `https://example.com`).
- Backend composes setup links as `${setupBaseUrl}/admin/setup?token=...`.

---

## Ops control plane endpoint groups

Ops endpoints are platform/developer controls. Do not expose write controls in normal merchant admin UI.

| Method | Endpoint | UI use |
|---|---|---|
| GET | `/api/v1/ops/session` | Bootstrap ops user/session |
| GET | `/api/v1/ops/config/overview` | Runtime config overview |
| POST | `/api/v1/ops/config/validate` | Validate config draft |
| GET | `/api/v1/ops/config/stored` | Masked stored DB config |
| POST | `/api/v1/ops/config/save` | Save encrypted DB config |
| POST | `/api/v1/ops/otp/request` | Request privileged-write OTP |
| POST | `/api/v1/ops/otp/verify` | Verify privileged-write OTP |
| POST | `/api/v1/ops/invites` | Issue ops invite |
| POST | `/api/v1/ops/invites/setup/send-otp` | Send ops setup OTP |
| POST | `/api/v1/ops/invites/consume` | Consume ops setup token |
| POST | `/api/v1/ops/invites/cleanup-expired` | Cleanup expired ops invites |
| GET | `/api/v1/ops/load-shed` | Current load-shed mode |
| POST | `/api/v1/ops/load-shed` | Request load-shed mode change |
| GET | `/api/v1/ops/approvals` | Approval queue |
| POST | `/api/v1/ops/approvals/:requestId/confirm` | Approve pending op |
| POST | `/api/v1/ops/approvals/:requestId/reject` | Reject pending op |
| GET | `/api/v1/ops/audit/logs` | Ops audit timeline |

Setup URL contract:

- `setupBaseUrl` must be the frontend base origin (for example, `https://example.com`).
- Backend composes setup links as `${setupBaseUrl}/ops/setup?token=...`.

---

## SaaS admin UI blueprint

Recommended frontend route groups:

```text
/admin
/admin/orders
/admin/orders/board
/admin/orders/:id
/admin/products
/admin/products/new
/admin/products/:id
/admin/inventory
/admin/customers
/admin/customers/:id
/admin/coupons
/admin/reviews
/admin/analytics
/admin/settings/store
/admin/settings/shipping
/admin/settings/notifications
/admin/settings/inventory
/admin/settings/cod
/admin/reliability
/admin/queues
/admin/setup
/admin/login
/admin/mfa
/ops
/ops/config
/ops/approvals
/ops/audit
```

SaaS-grade UI expectations:
+- Permission-aware sidebar and command menu.
+- KPI cards, charts, filterable tables, detail drawers, and audit timelines.
+- Sensitive actions require explicit confirmation and show permission/risk labels.
+- Async workflows (refunds, shipping, replay) show pending/progress states.
+- Webhook endpoints are never called from browser code.
