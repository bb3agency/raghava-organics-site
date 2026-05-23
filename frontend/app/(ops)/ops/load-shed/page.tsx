import { OpsLoadShedPanel } from "@/components/ops/OpsLoadShedPanel";
import { OpsSessionGate } from "@/components/ops/OpsSessionGate";

export default function LoadShedPage() {
  return (
    <OpsSessionGate>
      <OpsLoadShedPanel />
    </OpsSessionGate>
  );
}
