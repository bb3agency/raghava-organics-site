"use client";

import { OpsBadge, OpsCard, OpsCardHeader, OpsDataTable, OpsEmptyState } from "@/components/ops/ui/ops-ui";
import { formatOpsDateTime } from "@/lib/ops-format";
import type { OpsStoredConfig } from "@/lib/ops-client-api";

interface OpsStoredConfigTableProps {
  stored: OpsStoredConfig;
}

export function OpsStoredConfigTable({ stored }: OpsStoredConfigTableProps) {
  if (stored.items.length === 0) {
    return (
      <OpsEmptyState
        title="No DB-overlay keys saved"
        description="Provider credentials and runtime secrets are saved via POST /ops/config/save after OTP."
      />
    );
  }

  return (
    <OpsCard>
      <OpsCardHeader
        title="Stored configuration"
        description="Masked values from OpsConfigSecret — plaintext is never returned."
      />
      <OpsDataTable
        rows={stored.items}
        rowKey={(row) => `${row.domain}-${row.key}`}
        columns={[
          { key: "domain", header: "Domain", cell: (row) => <OpsBadge tone="muted">{row.domain}</OpsBadge> },
          { key: "key", header: "Key", cell: (row) => <code className="text-xs">{row.key}</code> },
          { key: "value", header: "Value", cell: (row) => <code className="text-xs">{row.maskedValue}</code> },
          {
            key: "restart",
            header: "Restart",
            cell: (row) =>
              row.requiresRestart ? <OpsBadge tone="warning">Required</OpsBadge> : <span>—</span>,
          },
          {
            key: "updated",
            header: "Updated",
            cell: (row) => formatOpsDateTime(row.updatedAt),
          },
        ]}
      />
    </OpsCard>
  );
}
