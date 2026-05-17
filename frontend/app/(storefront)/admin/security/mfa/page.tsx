import { AdminMfaSetupPanel } from "@/components/admin/AdminMfaSetupPanel";

export default function AdminMfaSecurityPage() {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Requires <code className="text-xs">users:read</code> permission. Secrets are shown once
        during enrollment — store them only in your authenticator app.
      </p>
      <AdminMfaSetupPanel />
    </div>
  );
}
