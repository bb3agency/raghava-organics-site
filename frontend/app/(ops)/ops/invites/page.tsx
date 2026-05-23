import { OpsInvitesPanel } from "@/components/ops/OpsInvitesPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function OpsInvitesPage() {
  return (
    <OpsSessionGate>
      <OpsInvitesPanel />
    </OpsSessionGate>
  );
}
