#!/usr/bin/env node
/**
 * Validates bootstrap .env for client workspaces (raghava-organics baseline).
 * Usage: node scripts/verify-client-bootstrap-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

if (!existsSync(envPath)) {
  console.error("FAIL: backend/.env not found. Copy from .env.example and set client values.");
  process.exit(1);
}

const raw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx === -1) return null;
      return [line.slice(0, idx), line.slice(idx + 1)];
    })
    .filter(Boolean),
);

const errors = [];
const warnings = [];

function requireKey(key) {
  const value = env[key]?.trim();
  if (!value) errors.push(`Missing required key: ${key}`);
  return value ?? "";
}

const clientId = requireKey("CLIENT_ID");
const postgresDb = requireKey("POSTGRES_DB");
const databaseUrl = requireKey("DATABASE_URL");
const redisPassword = requireKey("REDIS_PASSWORD");
const redisUrl = requireKey("REDIS_URL");
const jwtSecret = requireKey("JWT_SECRET");
const jwtRefresh = requireKey("JWT_REFRESH_SECRET");
const opsKey = requireKey("OPS_DB_ENCRYPTION_KEY");

if (clientId === "ecom" || clientId === "ecomtemplate") {
  errors.push("CLIENT_ID must be a client slug (e.g. raghava-organics), not template default");
}

if (postgresDb.includes("-")) {
  errors.push("POSTGRES_DB must use underscores only (hyphens invalid in PostgreSQL DB names)");
}

if (/ecom_template/i.test(databaseUrl)) {
  errors.push("DATABASE_URL must not use ecom_template in a client workspace");
}

if (!databaseUrl.includes(postgresDb)) {
  errors.push("DATABASE_URL database name must match POSTGRES_DB exactly");
}

if (!redisPassword) {
  errors.push("REDIS_PASSWORD must be non-empty");
}

if (!redisUrl.includes(redisPassword)) {
  errors.push("REDIS_URL must embed the same password as REDIS_PASSWORD");
}

for (const [key, value] of [
  ["JWT_SECRET", jwtSecret],
  ["JWT_REFRESH_SECRET", jwtRefresh],
  ["OPS_DB_ENCRYPTION_KEY", opsKey],
]) {
  if (/replace_with|change_me/i.test(value)) {
    errors.push(`${key} still contains placeholder text`);
  }
}

if (jwtSecret && jwtRefresh && jwtSecret === jwtRefresh) {
  errors.push("JWT_REFRESH_SECRET must differ from JWT_SECRET");
}

const nodeEnv = (env.NODE_ENV ?? "production").trim().toLowerCase();
if (!["production", "staging"].includes(nodeEnv) && nodeEnv !== "development") {
  warnings.push(`Unexpected NODE_ENV='${env.NODE_ENV}'. Expected production/staging/development.`);
}

const appPort = (env.PORT ?? "").trim();
if (!appPort) {
  errors.push("Missing required key: PORT");
} else if (appPort !== "3000") {
  errors.push("PORT must be 3000 for Docker runtime (host port is BACKEND_PORT).");
}

const paymentProviderRaw = (env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
const paymentProvider = paymentProviderRaw || "razorpay";
if (!["razorpay", "cod", "noop"].includes(paymentProvider)) {
  errors.push(`Unsupported PAYMENT_PROVIDER='${paymentProvider}'. Allowed: razorpay, cod, noop.`);
}

if (!paymentProviderRaw) {
  warnings.push(
    "PAYMENT_PROVIDER is not set. First bootstrap is allowed, but set PAYMENT_PROVIDER=cod or full razorpay keys before prepaid go-live."
  );
} else if (paymentProvider === "razorpay") {
  for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"]) {
    requireKey(key);
    if (/replace_with|change_me/i.test(env[key] ?? "")) {
      errors.push(`${key} still contains placeholder text`);
    }
  }
}

const shippingProviderRaw = (env.SHIPPING_PROVIDER ?? "").trim().toLowerCase();
const shippingProvider = shippingProviderRaw || "delhivery";
if (!["delhivery", "shiprocket", "noop"].includes(shippingProvider)) {
  errors.push(`Unsupported SHIPPING_PROVIDER='${shippingProvider}'. Allowed: delhivery, shiprocket, noop.`);
}

if (!shippingProviderRaw) {
  warnings.push(
    "SHIPPING_PROVIDER is not set. First bootstrap is allowed, but set SHIPPING_PROVIDER and provider keys before shipping flows."
  );
} else if (shippingProvider === "delhivery") {
  for (const key of ["DELHIVERY_API_KEY", "DELHIVERY_WEBHOOK_TOKEN"]) {
    requireKey(key);
    if (/replace_with|change_me/i.test(env[key] ?? "")) {
      errors.push(`${key} still contains placeholder text`);
    }
  }
}

if (shippingProvider === "shiprocket") {
  for (const key of ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "SHIPROCKET_WEBHOOK_TOKEN"]) {
    requireKey(key);
    if (/replace_with|change_me/i.test(env[key] ?? "")) {
      errors.push(`${key} still contains placeholder text`);
    }
  }
}

if (/replace_with/i.test(env.RESEND_API_KEY ?? "")) {
  warnings.push("RESEND_API_KEY is placeholder — required before ops:newuser on VPS");
}

if (!(env.REPLAY_APPROVAL_TOKEN ?? "").trim()) {
  warnings.push("REPLAY_APPROVAL_TOKEN is not set — analytics replay APIs will fail closed until configured.");
}

if (!(env.OPS_METRICS_TOKEN ?? "").trim()) {
  warnings.push("OPS_METRICS_TOKEN is not set — /ops/metrics will be inaccessible until configured.");
}

if (paymentProvider === "cod") {
  warnings.push(
    "PAYMENT_PROVIDER=cod detected. This is valid for bootstrap, but switch to razorpay before prepaid go-live."
  );
}

if (warnings.length) {
  console.warn("Warnings:");
  for (const w of warnings) console.warn(`  - ${w}`);
}

if (errors.length) {
  console.error("Bootstrap env verification FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Bootstrap env verification OK for CLIENT_ID=%s POSTGRES_DB=%s", clientId, postgresDb);
process.exit(0);
