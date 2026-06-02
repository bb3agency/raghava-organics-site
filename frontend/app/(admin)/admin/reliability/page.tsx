import { AdminReliabilityPanels } from "@/components/admin/AdminReliabilityPanels";
import { ReliabilityReplayPanel } from "@/components/admin/ReliabilityReplayPanel";

export default function AdminReliabilityPage() {
  return (
    <div className="grid gap-6">
      <AdminReliabilityPanels />
      <ReliabilityReplayPanel />
    </div>
  );
}
