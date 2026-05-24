import { OpsDashboard } from "@/components/ops/OpsDashboard";
import { OpsPageFrame } from "@/components/ops/ui/ops-ui";

export default function OpsOverviewPage() {
  return (
    <OpsPageFrame
      title="Overview"
      description="Platform health, your operator session, and shortcuts to privileged control-plane actions."
    >
      <OpsDashboard />
    </OpsPageFrame>
  );
}
