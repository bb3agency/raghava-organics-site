# Grocery Platform — Mock Interview Q&A Drill

> Rapid-fire rehearsal. Each answer is a spoken-length response (2–5 sentences) grounded in real code.
> Cover the answer, say yours out loud, then compare. Hardest follow-ups are marked **↳**.

---

## Payments & Idempotency

**Q1. Walk me through what happens when a user places a prepaid order.**
Cart → `prepare-checkout` (backend validates serviceability + recomputes pricing) → `POST /orders`
creates the order → `POST /payments/initiate` returns the Razorpay amount + `razorpayOrderId` → the
browser opens the Razorpay modal with *that* amount → `POST /payments/verify` confirms the signature.
COD short-circuits: `POST /orders` with `paymentMode: 'COD'` confirms immediately, no Razorpay.

**↳ Q2. A user double-clicks "Pay". How do you prevent two charges?**
Every payment write carries an `idempotency-key`. The first request writes a row in `IdempotencyRecord`
as `PROCESSING`; the second finds that row and gets a `409 already processing`. When the first
completes, the row flips to `COMPLETED` with the stored response, so any later retry with the same key
replays that response instead of charging again. It's a per-scope key + body-hash + state machine.

**Q3. Why not just put a unique constraint on the orders table?**
A unique constraint stops a duplicate *row*, but it doesn't return the *original response* to the
retrying client, and it doesn't handle the in-flight race cleanly. Idempotency gives me exactly-once
semantics plus a correct replay. I actually use both — the record's unique constraint backs the logic.

**↳ Q4. Why hash the request body?**
To catch a reused key with different data — a client bug or a tampering attempt. Same key + different
body returns `409 payload mismatch` rather than silently serving the wrong cached result.

**Q5. How do refunds work — is the order REFUNDED immediately?**
No. Admin cancel/refund validates the captured payment and *queues* the refund; it doesn't flip status
inline. The provider settles asynchronously, so the UI shows "Refund Pending" until a worker/webhook
confirms the final `REFUNDED` state. Designing for async here avoids lying to the user about money.

**↳ Q6. How do you make sure the customer can't tamper with the price?**
Money is server-authoritative. The backend recomputes subtotal + tax + shipping − discount, and the
Razorpay amount comes *only* from `/payments/initiate`. The frontend never computes the charged total;
it just displays what the backend returns. Money is stored as integer paise end-to-end, divided by 100
only at render.

---

## Courier Reliability

**Q7. You integrate two couriers — how is that structured?**
Both Delhivery and Shiprocket implement one `ShippingProviderAdapter` interface (rates, create shipment
with label + AWB, track, cancel). The active provider is selected at runtime from Ops config, so
swapping providers is config, not code. Cancellation differs underneath — Shiprocket cancels by
order_id, Delhivery by AWB — but that's hidden behind the adapter.

**Q8. A courier API starts timing out. What happens to my request?**
Two layers protect it. Each call races against a 12-second hard timeout (`Promise.race`), so a stalled
provider can't hang the request thread or surface as an Nginx 502. And the adapter is wrapped in a
circuit breaker: after 5 failures it opens for 30 seconds and fails fast with a 503 instead of piling
load onto a provider that's already down.

**↳ Q9. Why Promise.race and not just AbortController?**
In some Node/undici versions, aborting the signal doesn't actually interrupt a stalled body read — the
headers arrive but `response.text()` hangs forever. The wall-clock race guarantees the method always
settles within the timeout. I also attach a no-op `.catch()` so a late rejection from the losing
promise doesn't become an unhandled rejection that crashes the process.

**Q10. Walk me through your circuit breaker's states.**
Closed normally. Each failure increments a counter; at the threshold it opens and sets `openUntil =
now + cooldown`. While open, calls fail fast immediately. After the cooldown, the next call is allowed
through — effectively a half-open probe — and a success resets it to closed. It's process-local per
replica, which is fine because each instance independently protects itself.

**↳ Q11. Isn't a per-replica breaker a problem? One replica could be open while another is closed.**
It's a deliberate trade-off. The breaker's job is to protect *this* process from wasting work on a
dead dependency, and each replica observes its own failures. A shared Redis breaker adds a network hop
and a coordination dependency for marginal benefit; the provider being down will trip all replicas
quickly anyway.

---

## Auth & Security

**Q12. Where do you store tokens and why?**
Access token: short-lived JWT in frontend *memory* (Zustand) — never localStorage, so XSS can't read
it. Refresh token: httpOnly cookie, so JavaScript can't touch it at all, and it's stored
*bcrypt-hashed* in Postgres so a DB leak doesn't hand out usable sessions.

**Q13. Explain refresh-token rotation.**
Every refresh consumes the old token and issues a new pair. The consume is an atomic compare-and-set —
`updateMany where consumedAt: null` — so two concurrent refreshes can't both succeed; the loser gets a
401. This means a refresh token is single-use.

**↳ Q14. What if a refresh token is stolen and replayed?**
Reuse detection. If the presented token doesn't match the stored hash, or the device context
(User-Agent + IP hash) doesn't match, I revoke *every* active token for that session — so a stolen
token can't continue, and the legitimate user is forced to re-auth. The already-consumed case also
returns 401.

**Q15. How does authorization work for the admin console?**
Permissions are snapshotted into the access token at issue time and the UI hides/disables actions
based on them — but the backend re-validates every action, so client checks are just UX. The console
is permission-gated, and 5 critical Ops operations require a *secondary* OTP on top of login.

**↳ Q16. A downside of snapshotting permissions in the token?**
Staleness. A grant or revoke doesn't take effect until the next token refresh, because the old access
token still carries the old permissions. I handle it by forcing a refresh or re-login after permission
changes so the snapshot updates.

---

## Architecture / Data / Redis (warm-ups & curveballs)

**Q17. Give me the one-paragraph architecture.**
Headless Next.js 15 storefront (App Router, React Server Components) over a modular Fastify/TypeScript
REST API, on PostgreSQL via Prisma with Redis for coordination. Payments and couriers sit behind
swappable adapters hardened with idempotency, hard timeouts, and circuit breakers.

**Q18. Why React Server Components here?**
The storefront is read-heavy — catalogue, product detail, categories. RSC lets me fetch directly on
the server with no client JS for those views, which is good for LCP and SEO. I only drop to client
components for genuinely interactive bits (cart sheet, search, modals), and mutations go through
Server Actions.

**Q19. What's in Redis vs Postgres?**
Postgres is durable truth — orders, payments, money. Redis is fast ephemeral coordination: rate
limiting, OTP throttling, cart reservations/locks, and BullMQ job queues. One deliberate exception:
maintenance-mode state is Postgres-backed so it survives a Redis flush.

**↳ Q20. Curveball — how would you scale checkout for a flash sale?**
The reliability primitives are already there: idempotency makes retries safe, the circuit breaker
shields couriers, and inventory is decremented with reservations. To scale I'd lean on the queue for
async work (notifications, refunds, shipment creation), keep the hot read paths on RSC/ISR caching,
and horizontally scale the stateless API — the breaker being process-local means no shared bottleneck
there. I'd be careful to keep the idempotency record writes and inventory decrements on the DB, since
those need strong consistency.

---

### Drill tips
- If you blank, fall back to the **sound bites** in `grocery_interview_notes.md` — one sentence buys
  thinking time.
- For any "how" question, name the **file** ("that's in `shipping-provider.ts`") — it signals you
  actually built it.
- It's fine to say "the trade-off I chose was X over Y because Z" — interviewers reward the reasoning
  more than the answer.
