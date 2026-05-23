import { AdminDataPanel } from "@/components/admin/AdminDataPanel";
import { AdminMutationPanel } from "@/components/admin/AdminMutationPanel";

export default function AdminCouponsPage() {
  return (
    <div className="grid gap-6">
      <AdminDataPanel
        title="Coupons"
        endpoint="/admin/coupons?page=1&limit=50"
        emptyMessage="No coupons found (or FEATURE_COUPONS_ENABLED is off)."
      />
      <AdminMutationPanel
        title="Create coupon"
        endpoint="/admin/coupons"
        payloadLabel="Coupon payload"
        payloadTemplate={`{\n  "code": "SAVE10",\n  "type": "PERCENTAGE",\n  "value": 10,\n  "minOrderPaise": 50000,\n  "maxUses": 100,\n  "startsAt": "2026-06-01T00:00:00.000Z",\n  "endsAt": "2026-12-31T23:59:59.000Z"\n}`}
      />
      <AdminMutationPanel
        title="Pause coupon"
        endpoint="/admin/coupons/COUPON_ID/pause"
        method="PATCH"
        payloadLabel="Optional reason"
        payloadTemplate={`{\n  "reason": "Seasonal pause"\n}`}
      />
      <AdminMutationPanel
        title="Restore deleted coupon"
        endpoint="/admin/coupons/COUPON_ID/restore"
        method="POST"
        payloadLabel="No body required"
        payloadTemplate=""
      />
    </div>
  );
}
