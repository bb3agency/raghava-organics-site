import { OpsQueuesPanel } from "@/components/ops/OpsQueuesPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function OpsQueuesPage() {
  return (
    <OpsSessionGate>
      <OpsQueuesPanel />
    </OpsSessionGate>
  );
}
