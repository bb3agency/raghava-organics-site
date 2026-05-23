import { OpsSystemPanel } from "@/components/ops/OpsSystemPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function OpsSystemPage() {
  return (
    <OpsSessionGate>
      <OpsSystemPanel />
    </OpsSessionGate>
  );
}
