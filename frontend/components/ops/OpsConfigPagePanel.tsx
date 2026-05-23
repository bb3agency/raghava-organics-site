"use client";

import { useEffect, useState } from "react";
import { OpsConfigForms } from "@/components/ops/OpsConfigForms";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  getOpsConfigOverviewClient,
  getOpsStoredConfigClient,
  type OpsConfigOverview,
  type OpsStoredConfig,
} from "@/lib/ops-client-api";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export function OpsConfigPagePanel() {
  return (
    <OpsSessionGate>
      <OpsConfigContent />
    </OpsSessionGate>
  );
}

function OpsConfigContent() {
  const [overview, setOverview] = useState<OpsConfigOverview | null>(null);
  const [stored, setStored] = useState<OpsStoredConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getOpsConfigOverviewClient(), getOpsStoredConfigClient()])
      .then(([nextOverview, nextStored]) => {
        setOverview(nextOverview);
        setStored(nextStored);
      })
      .catch((err) => setError(getApiErrorMessageWithHint(err)));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!overview || !stored) {
    return <p className="text-sm text-muted-foreground">Loading config metadata...</p>;
  }

  return (
    <section className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Ops config</h2>
        <p className="text-sm text-muted-foreground">
          Runtime profile: {overview.runtimeProfile} · generated {overview.generatedAt}
        </p>
        <p className="text-sm text-muted-foreground">
          Bootstrap keys are read-only in ops UI — change via deployment env.
        </p>
      </header>
      <OpsConfigForms />
      <pre className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-xs">
        {JSON.stringify({ overview, stored }, null, 2)}
      </pre>
    </section>
  );
}
