import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminMutationPanel } from "@/components/admin/AdminMutationPanel";

export default function AdminReviewsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Review moderation queue"
        endpoint="/admin/reviews?page=1&limit=50"
        emptyMessage="No reviews in the queue."
      />
      <AdminMutationPanel
        title="Hard delete review"
        endpoint="/admin/reviews/REVIEW_ID"
        method="DELETE"
        payloadLabel="No body required"
        payloadTemplate=""
      />
    </div>
  );
}
