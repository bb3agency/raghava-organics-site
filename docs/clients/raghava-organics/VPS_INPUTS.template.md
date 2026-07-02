# VPS inputs — Raghava Organics (template)

Copy to `VPS_INPUTS.md` (gitignored) and fill before VPS deploy.

See [README.md](./README.md) for execution order.

| Field | Value |
|-------|-------|
| `PRODUCTION_DOMAIN` | `raghavaorganics.com` |
| `DNS_PROVIDER` | Cloudflare (nameservers at Namecheap) |
| `IMAGE_CDN_HOST` | `cdn.raghavaorganics.com` |
| `VPS_IP` | |
| `DEPLOY_USER` | |
| `GIT_REPO_URL` | |

Ports: `BACKEND_PORT=3001`, `STOREFRONT_PORT=3101`, `CLIENT_ID=raghava-organics`

## Cloudflare R2 (Ops UI — Product Media)

Non-secret values: [CLOUDFLARE_R2_MEDIA.md](./CLOUDFLARE_R2_MEDIA.md). Store `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` only in the filled `VPS_INPUTS.md` vault — never commit.

## Razorpay (Ops UI — Payments)

Runbook: [RAZORPAY_PAYMENTS_SETUP.md](./RAZORPAY_PAYMENTS_SETUP.md). Store `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` only in the filled `VPS_INPUTS.md` vault.

| Field | Value |
|-------|-------|
| `PAYMENT_PROVIDER` | `razorpay` |
| `RAZORPAY_KEY_ID` | |
| `RAZORPAY_KEY_SECRET` | |
| `RAZORPAY_WEBHOOK_SECRET` | generate 32+ char random; same in Razorpay webhook + Ops UI |
| Webhook URL | `https://<domain>/api/v1/payments/webhook` |
| Webhook events | `payment.captured`, `payment.failed`, `refund.processed` |

## Shiprocket (Ops UI — Shipping)

| Field | Value |
|-------|-------|
| `SHIPPING_PROVIDER` | `shiprocket` |
| `SHIPROCKET_EMAIL` | |
| `SHIPROCKET_PASSWORD` | |
| `SHIPROCKET_PICKUP_PINCODE` | warehouse pincode |
| `SHIPROCKET_PICKUP_LOCATION` | pickup nickname in Shiprocket dashboard (default `Primary`) |
| `SHIPROCKET_WEBHOOK_TOKEN` | |
| Webhook URL | `https://<domain>/api/v1/shipping/webhook` |

## Meta WhatsApp Business (Ops UI — Notifications)

Cloud API. Store `META_WHATSAPP_ACCESS_TOKEN` and `META_WHATSAPP_APP_SECRET` only in the filled `VPS_INPUTS.md` vault — never commit. All keys go in Ops UI → Config (DB overlay, `requiresRestart`), NOT `backend/.env`. Restart API + workers after save. Optional — leave `NOTIFY_WHATSAPP_ENABLED=false` if WhatsApp is not used.

| Field | Value |
|-------|-------|
| `NOTIFY_WHATSAPP_ENABLED` | `true` |
| `META_WHATSAPP_ACCESS_TOKEN` | System User token — prefer **"never expires"**; a 60-day token must be rotated before expiry or sends 401 |
| `META_WHATSAPP_PHONE_NUMBER_ID` | |
| `META_WHATSAPP_APP_SECRET` | |
| `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN` | random; same in Meta webhook config + Ops UI |
| `META_WHATSAPP_API_VERSION` | `v25.0` |
| `META_WHATSAPP_APP_ID` | reference only |
| `META_WHATSAPP_WABA_ID` | reference only |
| System User ID | reference only |
| Webhook URL | `https://<domain>/api/v1/notifications/webhook/meta-whatsapp` (apex domain, not an `api.` subdomain) |
| Webhook field | subscribe `messages` (status updates arrive nested; there is no separate `message_status` field) |

Templates: create the 6 UTILITY templates (`order_confirmed`, `order_shipped`, `out_for_delivery`, `order_delivered`, `order_cancelled`, `payment_failed`) in WhatsApp Manager per `backend/docs/WHATSAPP_TEMPLATE_REGISTRY.md`. Route a notification over WhatsApp by setting its `primaryChannels` entry to `WHATSAPP`.

**Go-live gates for WhatsApp:**
- [ ] **Publish the app** (App Review → App icon 1024×1024 + Privacy Policy URL + Category → toggle Live). Until published, only tester numbers receive messages — real customers get nothing.
- [ ] All 6 templates show **Approved** in WhatsApp Manager.
- [ ] Payment method added to the WhatsApp Business Account (utility/auth messages are billed per message; see cost note below).
- [ ] (OTP over WhatsApp only) create a separate **AUTHENTICATION**-category template — utility templates cannot carry an OTP code.

**Cost note:** WhatsApp Cloud API is not free per message. India rates (Jan 2026): utility ≈ ₹0.115/msg, authentication (OTP) ≈ ₹0.115/msg, marketing ≈ ₹0.86/msg, all + 18% GST. Replies inside a customer-opened 24h service window are free.
