import {
  requestOpsOtpAction,
  saveOpsConfigAction,
  validateOpsConfigAction,
  verifyOpsOtpAction,
} from "@/actions/ops.actions";

const SAMPLE_VALUES = '{\n  "JWT_SECRET": "replace_me"\n}';

export function OpsConfigForms() {
  return (
    <section className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Validate config draft</h3>
        <form action={validateOpsConfigAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Domain (optional)
            <select
              name="domain"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              defaultValue=""
            >
              <option value="">all domains</option>
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Values JSON
            <textarea
              name="values"
              minLength={2}
              className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue={SAMPLE_VALUES}
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Validate draft
          </button>
        </form>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">OTP challenge for privileged writes</h3>
        <form action={requestOpsOtpAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Action label
            <input
              name="action"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              defaultValue="ops_config_save"
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Request OTP
          </button>
        </form>

        <form action={verifyOpsOtpAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Challenge ID
            <input
              name="challengeId"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            OTP code
            <input
              name="code"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              minLength={4}
              maxLength={10}
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Verify OTP
          </button>
        </form>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-4">
        <h3 className="font-medium">Save config draft (requires OTP)</h3>
        <form action={saveOpsConfigAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Domain
            <select
              name="domain"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              defaultValue="core"
              required
            >
              <option value="core">core</option>
              <option value="payments">payments</option>
              <option value="shipping">shipping</option>
              <option value="notifications">notifications</option>
              <option value="opsSecurity">opsSecurity</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Values JSON
            <textarea
              name="values"
              minLength={2}
              className="min-h-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
              defaultValue={SAMPLE_VALUES}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Challenge ID
            <input
              name="challengeId"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            OTP code
            <input
              name="otpCode"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              minLength={4}
              maxLength={10}
              required
            />
          </label>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Save draft
          </button>
        </form>
      </div>
    </section>
  );
}
