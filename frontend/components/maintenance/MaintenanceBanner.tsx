"use client";

import { useEffect, useMemo, useState } from "react";
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
 *   - `pending`: shows a countdown like "Scheduled maintenance in 01:42 —
 *                please complete checkout now". Encourages users to wrap
 *                up active work before the storefront goes dark.
 *   - `active` : shows "Site is in maintenance mode. We'll be back soon".
 *                Acts as the rare fallback for tabs that loaded before the
 *                cutover and are still trying to render the storefront —
 *                Nginx will have started serving the static page for new
 *                navigations.
 */
export function MaintenanceBanner() {
  const pathname = usePathname() ?? "";
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [tick, setTick] = useState(0);

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

  const secondsRemaining = useMemo(() => {
    if (!status || status.phase !== "pending") return 0;
    const base = secondsUntilMaintenance(status);
    return Math.max(0, base - tick);
  }, [status, tick]);

  if (isOpsRoute) return null;
  if (!shouldShowMaintenanceBanner(status)) return null;
  if (!status) return null;

  const isPending = status.phase === "pending";
  // Three visual states:
  //   1. pending + countdown > 0  → "Starting soon" with countdown
  //   2. pending + countdown = 0  → "Finalising — wrapping up active transactions"
  //                                  (worker is draining queues + payments)
  //   3. active                   → "Site is in maintenance mode"
  const isDraining = isPending && secondsRemaining === 0;
  const tone = isPending && !isDraining
    ? "bg-amber-50 text-amber-900 border-amber-300"
    : "bg-rose-50 text-rose-900 border-rose-300";

  const mm = Math.floor(secondsRemaining / 60);
  const ss = secondsRemaining % 60;
  const countdownLabel = `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 w-full border-b ${tone}`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span aria-hidden className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/60 text-base font-semibold">
            !
          </span>
          <div className="text-sm leading-snug">
            {isDraining ? (
              <>
                <strong className="font-semibold">Finalising maintenance window.</strong>{" "}
                Wrapping up active transactions before the site goes offline. New checkouts are paused.
              </>
            ) : isPending ? (
              <>
                <strong className="font-semibold">Scheduled maintenance starting soon.</strong>{" "}
                The site will be temporarily unavailable while we finish a planned update. Please complete any active checkout or save your cart now.
              </>
            ) : (
              <>
                <strong className="font-semibold">Site is in maintenance mode.</strong>{" "}
                We&rsquo;ll be back online shortly. Thanks for your patience.
              </>
            )}
          </div>
        </div>
        {isPending && !isDraining ? (
          <div className="flex items-center gap-2 self-start sm:self-auto" aria-label={`Maintenance starts in ${countdownLabel}`}>
            <span className="text-xs uppercase tracking-wide opacity-80">Starts in</span>
            <span className="rounded-md bg-white/70 px-2 py-1 font-mono text-base font-semibold tabular-nums">
              {countdownLabel}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
