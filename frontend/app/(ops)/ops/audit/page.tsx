import { OpsAuditPanel } from "@/components/ops/OpsAuditPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function OpsAuditPage() {
  return (
    <OpsSessionGate>
      <OpsAuditPanel />
    </OpsSessionGate>
  );
}
