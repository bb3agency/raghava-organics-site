import { OpsConfigForms } from "@/components/ops/OpsConfigForms";
import {
  getOpsConfigOverview,
  getOpsStoredConfig,
  type OpsConfigOverview,
  type OpsStoredConfig,
} from "@/lib/ops-api";

function ContractOverviewTable({ overview }: { overview: OpsConfigOverview }) {
  return (
    <div className="grid gap-4 rounded-lg border border-border p-4">
      <h3 className="font-medium">Contract overview (full)</h3>
      {overview.domains.map((domain) => (
        <div key={domain.domain} className="grid gap-2">
          <p className="font-medium">{domain.label}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1">Key</th>
                  <th className="px-2 py-1">Present</th>
                  <th className="px-2 py-1">Placeholder</th>
                  <th className="px-2 py-1">Mutable via ops</th>
                  <th className="px-2 py-1">Restart required</th>
                  <th className="px-2 py-1">Runtime source</th>
                  <th className="px-2 py-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {domain.items.map((item) => (
                  <tr key={item.key} className="border-t border-border">
                    <td className="px-2 py-1 font-mono text-xs">{item.key}</td>
                    <td className="px-2 py-1">{item.present ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{item.placeholder ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{item.mutableViaOps ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{item.requiresRestart ? "Yes" : "No"}</td>
                    <td className="px-2 py-1">{item.runtimeSource ?? "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">{item.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function StoredSecretsTable({ stored }: { stored: OpsStoredConfig }) {
  return (
    <div className="grid gap-4 rounded-lg border border-border p-4">
      <h3 className="font-medium">Stored secrets (masked)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="px-2 py-1">Domain</th>
              <th className="px-2 py-1">Key</th>
              <th className="px-2 py-1">Masked value</th>
              <th className="px-2 py-1">Key version</th>
              <th className="px-2 py-1">Restart</th>
              <th className="px-2 py-1">Updated</th>
            </tr>
          </thead>
          <tbody>
            {stored.items.map((item) => (
              <tr key={`${item.domain}:${item.key}`} className="border-t border-border">
                <td className="px-2 py-1">{item.domain}</td>
                <td className="px-2 py-1 font-mono text-xs">{item.key}</td>
                <td className="px-2 py-1">{item.maskedValue}</td>
                <td className="px-2 py-1">{item.keyVersion}</td>
                <td className="px-2 py-1">{item.requiresRestart ? "Yes" : "No"}</td>
                <td className="px-2 py-1">{item.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function OpsConfigPage() {
  let overview: OpsConfigOverview | null = null;
  let stored: OpsStoredConfig | null = null;
  let message = "Unable to load ops config";

  try {
    [overview, stored] = await Promise.all([
      getOpsConfigOverview(),
      getOpsStoredConfig(),
    ]);
  } catch (error) {
    message = error instanceof Error ? error.message : message;
  }

  if (!overview || !stored) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {message}
      </p>
    );
  }

  return (
    <section className="grid gap-6">
      <header>
        <h2 className="font-heading text-xl font-semibold">Ops config</h2>
        <p className="text-sm text-muted-foreground">
          Runtime profile: {overview.runtimeProfile} · generated {overview.generatedAt}
        </p>
        <p className="text-sm text-muted-foreground">
          Strict profile health: placeholders=
          {overview.strictProfileHealth.noPlaceholdersInStrict ? "none" : "detected"} · missing
          keys={overview.strictProfileHealth.missingRequiredKeysInStrict.join(", ") || "none"}
        </p>
        <p className="text-sm text-muted-foreground">
          Bootstrap keys (`DATABASE_URL`, initial `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`) are
          read-only in ops UI — change via deployment env.
        </p>
      </header>

      <ContractOverviewTable overview={overview} />
      <StoredSecretsTable stored={stored} />
      <OpsConfigForms />
    </section>
  );
}
