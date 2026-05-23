import { OpsUsersPanel } from "@/components/ops/OpsUsersPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function OpsUsersPage() {
  return (
    <OpsSessionGate>
      <OpsUsersPanel />
    </OpsSessionGate>
  );
}
