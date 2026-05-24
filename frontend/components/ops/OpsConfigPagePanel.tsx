"use client";

import { useEffect, useState } from "react";
import { OpsConfigForms } from "@/components/ops/OpsConfigForms";
import { OpsConfigOverviewGrid } from "@/components/ops/OpsConfigOverviewGrid";
import { OpsRuntimeReadinessCard } from "@/components/ops/OpsRuntimeReadinessCard";
import { OpsStoredConfigTable } from "@/components/ops/OpsStoredConfigTable";
import { OpsAlert, OpsLoadingBlock } from "@/components/ops/ui/ops-ui";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  getOpsConfigOverviewClient,
  getOpsStoredConfigClient,
  type OpsConfigOverview,
  type OpsStoredConfig,
} from "@/lib/ops-client-api";

export function OpsConfigPagePanel() {
  const [overview, setOverview] = useState<OpsConfigOverview | null>(null);
  const [stored, setStored] = useState<OpsStoredConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([getOpsConfigOverviewClient(), getOpsStoredConfigClient()])
      .then(([nextOverview, nextStored]) => {
        setOverview(nextOverview);
        setStored(nextStored);
        setError(null);
      })
      .catch((err) => setError(getApiErrorMessageWithHint(err)))
      .finally(() => setLoading(false));
  }, [refreshSignal]);

  if (loading) {
    return <OpsLoadingBlock label="Loading configuration contract…" />;
  }

  if (error) {
    return <OpsAlert tone="error">{error}</OpsAlert>;
  }

  if (!overview || !stored) {
    return null;
  }

  return (
    <div className="grid gap-8">
      <OpsAlert tone="info">
        Bootstrap keys (<code className="text-xs">DATABASE_URL</code>,{" "}
        <code className="text-xs">OPS_DB_ENCRYPTION_KEY</code>) are read-only here — change via
        deployment environment. DB-overlay keys require OTP save and may need API/worker restart.
      </OpsAlert>
      <OpsRuntimeReadinessCard refreshSignal={refreshSignal} />
      <OpsConfigOverviewGrid overview={overview} />
      <OpsStoredConfigTable stored={stored} />
      <OpsConfigForms onConfigSaved={() => setRefreshSignal((prev) => prev + 1)} />
    </div>
  );
}
