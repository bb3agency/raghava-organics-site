import { OpsConfigPagePanel } from "@/components/ops/OpsConfigPagePanel";
import { OpsPageFrame } from "@/components/ops/ui/ops-ui";

export default function OpsConfigPage() {
  return (
    <OpsPageFrame
      title="Configuration"
      description="Contract overview, masked DB-overlay secrets, validate/save with OTP, and runtime readiness."
    >
      <OpsConfigPagePanel />
    </OpsPageFrame>
  );
}
