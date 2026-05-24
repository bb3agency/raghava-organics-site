"use client";

import { OpsBadge, OpsCard, OpsCardHeader } from "@/components/ops/ui/ops-ui";
import type { OpsConfigOverview } from "@/lib/ops-client-api";

interface OpsConfigOverviewGridProps {
  overview: OpsConfigOverview;
}

export function OpsConfigOverviewGrid({ overview }: OpsConfigOverviewGridProps) {
  return (
    <div className="grid gap-4">
      <OpsCard padding="md">
        <div className="flex flex-wrap items-center gap-3">
          <OpsBadge tone={overview.runtimeProfile === "production-like" ? "info" : "warning"}>
            {overview.runtimeProfile}
          </OpsBadge>
          {!overview.strictProfileHealth.noPlaceholdersInStrict ? (
            <OpsBadge tone="warning">Placeholders in strict profile</OpsBadge>
          ) : (
            <OpsBadge tone="success">No placeholders</OpsBadge>
          )}
          {overview.strictProfileHealth.missingRequiredKeysInStrict.length > 0 ? (
            <OpsBadge tone="danger">
              {overview.strictProfileHealth.missingRequiredKeysInStrict.length} missing keys
            </OpsBadge>
          ) : null}
        </div>
      </OpsCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {overview.domains.map((domain) => (
          <OpsCard key={domain.domain}>
            <OpsCardHeader title={domain.label} description={`Domain: ${domain.domain}`} />
            <ul className="grid gap-2">
              {domain.items.map((item) => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                >
                  <code className="text-xs">{item.key}</code>
                  <div className="flex flex-wrap gap-1">
                    <OpsBadge tone={item.present ? "success" : "danger"}>
                      {item.present ? "present" : "missing"}
                    </OpsBadge>
                    {item.placeholder ? <OpsBadge tone="warning">placeholder</OpsBadge> : null}
                    {item.mutableViaOps ? <OpsBadge tone="info">ops mutable</OpsBadge> : null}
                    {item.requiresRestart ? <OpsBadge tone="muted">restart</OpsBadge> : null}
                    {item.runtimeSource === "env-bootstrap" ? (
                      <OpsBadge tone="muted">bootstrap</OpsBadge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </OpsCard>
        ))}
      </div>
    </div>
  );
}
