"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  fetchMaintenanceStatus,
  secondsUntilMaintenance,
  shouldShowMaintenanceBanner,
  type MaintenanceStatus,
} from "@/lib/maintenance-client";

const POLL_INTERVAL_NORMAL_MS = 60_000;
const POLL_INTERVAL_PENDING_MS = 5_000;
const COUNTDOWN_TICK_MS = 1_000;

/**
 * Global maintenance banner. Mounted in the root layout so every non-ops
 * route sees it. The component:
 *
 *   1. Polls `/api/v1/maintenance/status` on a slow cadence (60s) when the
 *      site is healthy. The endpoint is intentionally rate-limit-exempt and
 *      cached in-process on the backend, so this poll is essentially free.
 *   2. Switches to a fast cadence (5s) the moment maintenance becomes
 *      `pending`, plus a 1s local countdown tick, so the displayed time
 *      remains accurate without hammering the backend.
 *   3. Hides itself on every `/ops/*` route — operators need the full
 *      console without a banner blocking the top of the viewport, and
 *      the ops console explicitly surfaces the same state in its
 *      load-shed panel.
 *   4. Renders nothing during `normal | reduced | emergency` — those modes
 *      degrade gracefully without a global UX takeover.
 *
 * Behaviour during the two maintenance phases:
 *   - `pending`: shows a fixed "Maintenance starting in a moment" message
 *                and a live countdown badge so users can finish active
 *                work before the storefront goes dark. The 2-minute window
 *                covers both the announced warning AND the worker drain
 *                step — the copy stays the same throughout, including the
 *                final seconds when the worker is finishing the queue drain
 *                (we deliberately do NOT surface "queue draining" or other
 *                infrastructure detail to end users).
 *   - `active` : **the tab force-reloads itself once**. After the reload,
 *                Nginx's maintenance gate intercepts the request and serves
 *                the static `maintenance.html` page directly — operators
 *                get the same branded full-page UX whether they opened a
 *                fresh tab during the window or had one already loaded
 *                when the cutover fired. The reload is guarded by a ref so
 *                a slow follow-up poll cannot trigger a second reload.
 *                The `/ops/*` console is exempt (operators need to keep
 *                using the console to exit maintenance).
 */
export function MaintenanceBanner() {
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [tick, setTick] = useState(0);

  // Tracks whether we have already initiated a force-reload for the current
  // pending→active cutover. Without this guard a 5-second poll that keeps
  // returning `active` would call window.location.reload() on every fetch,
  // which a sufficiently slow nginx → static-page redirect could turn into
  // a reload loop on flaky networks.
  const reloadInitiatedRef = useRef(false);

  const isOpsRoute = pathname.startsWith("/ops");

  useEffect(() => {
    if (isOpsRoute) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const next = await fetchMaintenanceStatus();
        if (!cancelled) {
          setStatus(next);
        }
      } catch {
        // Backend unreachable — keep last-known status. If the backend is
        // down we already render whatever we last knew (possibly nothing),
        // which is the most conservative default.
      }
      if (!cancelled) {
        const interval =
          status && status.mode === "maintenance" && status.phase === "pending"
            ? POLL_INTERVAL_PENDING_MS
            : POLL_INTERVAL_NORMAL_MS;
        timer = setTimeout(poll, interval);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // We intentionally re-create the polling loop when the phase flips so
    // the cadence adjusts. `status` is stable per phase change so this won't
    // loop in normal mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpsRoute, status?.phase, status?.mode]);

  useEffect(() => {
    if (!status || status.phase !== "pending") return;
    const interval = setInterval(() => setTick((t) => t + 1), COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [status?.phase, status]);

  // Force-reload as soon as we observe phase=active. Nginx will short-circuit
  // the next request via its maintenance gate (`auth_request` → 401 →
  // `error_page 401 =503 /maintenance.html`) and serve the static page,
  // replacing this stale React tree with the branded downtime UX.
  // Skipped on `/ops/*` so operators retain access to the console.
  useEffect(() => {
    if (isOpsRoute) return;
    if (typeof window === "undefined") return;
    if (!status) return;
    if (status.mode !== "maintenance" || status.phase !== "active") return;
    if (reloadInitiatedRef.current) return;
    reloadInitiatedRef.current = true;
    window.location.reload();
  }, [isOpsRoute, status?.mode, status?.phase, status]);

  const secondsRemaining = useMemo(() => {
    if (!status || status.phase !== "pending") return 0;
    const base = secondsUntilMaintenance(status);
    return Math.max(0, base - tick);
  }, [status, tick]);

  if (isOpsRoute) return null;
  if (!shouldShowMaintenanceBanner(status)) return null;
  if (!status) return null;

  // Active phase: the reload effect above is in flight. Render nothing so we
  // don't briefly flash an inline "site is in maintenance" banner over a
  // stale storefront tree — nginx is about to take over with the static page.
  if (status.phase === "active") return null;

  const mm = Math.floor(secondsRemaining / 60);
  const ss = secondsRemaining % 60;
  const countdownLabel = `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full border-b border-amber-300 bg-amber-50 text-amber-900"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/60 text-base font-semibold">
            !
          </span>
          <div className="text-sm leading-snug">
            <strong className="font-semibold">Maintenance starting in a moment.</strong>{" "}
            Please complete any active checkout or save your cart now.
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto" aria-label={`Maintenance starts in ${countdownLabel}`}>
          <span className="text-xs uppercase tracking-wide opacity-80">Starts in</span>
          <span className="rounded-md bg-white/70 px-2 py-1 font-mono text-base font-semibold tabular-nums">
            {countdownLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
