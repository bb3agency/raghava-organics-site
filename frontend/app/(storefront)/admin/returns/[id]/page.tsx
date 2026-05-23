"use client";

import { useParams } from "next/navigation";
import { AdminDataPanel } from "@/components/admin/AdminDataPanel";

export default function AdminReturnRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <AdminDataPanel
      title={`Return request ${id}`}
      endpoint={`/admin/return-requests/${id}`}
      emptyMessage="Return request not found."
    />
  );
}
