# Grocery Platform — Memorizable Code Snippets

> Whiteboard-ready, simplified-but-faithful versions of real code. Each lists the source file so you
> can open the full version. Order = highest interview value first.

---

## 1. Idempotent payment write (exactly-once)
**Source:** `backend/src/common/idempotency/idempotency.ts`

```ts
// Pre-handler on POST /orders, /payments/initiate, /payments/verify
const key   = req.headers['idempotency-key'];
const scope = req.user?.sub ?? cartCookie ?? req.ip;     // who is calling
const hash  = sha256(JSON.stringify(req.body));          // what they sent

const row = await prisma.idempotencyRecord.findUnique({
  where: { scopeKey_route_method_idempotencyKey: { scopeKey: scope, route, method, idempotencyKey: key } },
});

if (row) {
  if (row.requestHash !== hash)   throw new AppError(CONFLICT, 'Key payload mismatch', 409);
  if (row.status === 'PROCESSING') throw new AppError(CONFLICT, 'Already processing', 409);
  if (row.status === 'COMPLETED')  return reply.code(row.responseStatus).send(row.responsePayload); // replay
}
// else create row as PROCESSING → run handler → mark COMPLETED with the response (TTL 24h)
```
**One line:** "Per-scope key + body hash + PROCESSING/COMPLETED state machine → retries replay, never double-charge."

---

## 2. Server-authoritative total (trust boundary)
**Source:** `backend/src/modules/orders/orders.service.ts` + `modules/payments/*`

```ts
// ❌ NEVER trust the client's total
// const amount = cart.items.reduce((s, i) => s + i.price * i.qty, 0);

// ✅ Backend computes money; Razorpay amount comes ONLY from initiate
const order   = await createOrder(cartItems);            // backend: subtotal+tax+shipping−discount
const payment = await initiatePayment(order.id);         // backend returns amount + razorpayOrderId
openRazorpay({ amount: payment.amount, order_id: payment.razorpayOrderId });
```
**One line:** "Money is server-authoritative; the modal opens with the amount the backend signed, not one the browser computed."

---

## 3. Deferred (async) refund
**Source:** `backend/src/modules/orders/orders.service.ts` (~L794)

```ts
// Admin cancel/refund does NOT flip status inline
if (payment.status === 'CAPTURED') {
  if (!payment.providerPaymentId) throw new AppError(CONFLICT, 'Missing provider payment id', 409);
  queuedRefund = true;                                    // worker + provider webhook finalize later
  refundReason = input.reason ?? 'Order cancelled and refunded';
}
// UI shows "Refund Pending" until status reaches REFUNDED
```
**One line:** "Refunds are queued, not synchronous — the provider settles async, so the UI shows a pending state until a webhook confirms REFUNDED."

---

## 4. Circuit breaker (fail fast)
**Source:** `backend/src/modules/shipping/shipping-provider.ts`

```ts
class CircuitBreakerShippingAdapter {
  private failures = 0;
  private openUntil = 0;
  constructor(private delegate, private threshold = 5, private cooldownMs = 30_000) {}

  async createShipment(input) {
    if (Date.now() < this.openUntil)                       // OPEN → fail fast
      throw new AppError(INTERNAL_ERROR, 'Shipping provider temporarily unavailable', 503);
    try {
      const r = await this.delegate.createShipment(input);
      this.failures = 0; this.openUntil = 0;               // success → CLOSED
      return r;
    } catch (e) {
      if (++this.failures >= this.threshold)               // trip → OPEN for cooldown
        { this.openUntil = Date.now() + this.cooldownMs; this.failures = 0; }
      throw e;
    }
  }
}
```
**One line:** "After 5 failures it opens for 30s and fails fast, so we stop hammering a dead provider; success closes it again."

---

## 5. Hard per-call timeout (Promise.race)
**Source:** `backend/src/modules/shipping/adapters/delhivery.adapter.ts` (~L645)

```ts
const controller = new AbortController();
const timeout = new Promise((_, reject) =>
  setTimeout(() => { controller.abort(); reject(new AppError(INTERNAL_ERROR, 'Provider timed out', 422)); }, 12_000)
);
const operation = fetch(url, { ...init, signal: controller.signal }).then(r => r.text());
operation.catch(() => {});                                 // swallow late rejection → no unhandled crash
return await Promise.race([operation, timeout]);           // first to settle wins
```
**One line:** "A 12s wall-clock race guarantees the call always settles — even when an aborted signal doesn't interrupt a stalled body read."

---

## 6. Refresh-token rotation (CAS + reuse detection)
**Source:** `backend/src/modules/auth/auth.service.ts` (~L1338)

```ts
const rec = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
if (!rec || rec.revokedAt || rec.consumedAt || rec.expiresAt <= new Date())
  throw new AppError(UNAUTHORISED, 'Invalid refresh token', 401);

if (!(await bcrypt.compare(token, rec.tokenHash)) || rec.deviceKeyHash !== ctx.deviceKeyHash) {
  await prisma.refreshToken.updateMany(                    // reuse/theft → kill whole session
    { where: { sessionId: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  throw new AppError(UNAUTHORISED, 'Invalid refresh token', 401);
}
const consumed = await prisma.refreshToken.updateMany(     // atomic CAS: consume exactly once
  { where: { id: rec.id, consumedAt: null }, data: { consumedAt: new Date() } });
if (consumed.count === 0) throw new AppError(UNAUTHORISED, 'Already consumed', 401);

return issueTokensForUser(user, { sessionId: payload.sid }); // rotate: new access + refresh
```
**One line:** "Refresh tokens are bcrypt-hashed, rotated on every use via an atomic CAS, and a mismatch revokes the whole session."

---

## 7. Money formatting (paise → display)
**Source:** `frontend/lib/format-price.ts` (`formatPrice`)

```ts
export function formatPrice(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(paise / 100);
}
// Rule: money is stored as Int paise everywhere; divide by 100 ONLY at display. Never do math on displayed values.
```
**One line:** "All money is integer paise end-to-end; the only division by 100 is at render — no float rounding bugs."

---

### Recall order under pressure
Payments first (1→2→3), then reliability (4→5), then auth (6), money rule (7) as a closer.
