"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthErrorBanner } from "@/components/auth/AuthErrorBanner";
import { getApiErrorMessage } from "@/lib/error-messages";
import {
  requestOpsLoginOtp,
  verifyOpsLoginOtp,
} from "@/lib/ops-client-api";
import { emailSchema, otpSchema } from "@/lib/validators";

const emailStepSchema = z.object({
  email: emailSchema,
});

export default function OpsLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const form = useForm<z.infer<typeof emailStepSchema>>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: "" },
  });

  const handleRequestOtp = form.handleSubmit(async (values) => {
    try {
      setError(null);
      await requestOpsLoginOtp(values);
      setStep("otp");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  });

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    const email = form.getValues("email");
    const parsed = z.object({ email: emailSchema, otp: otpSchema }).safeParse({ email, otp });
    if (!parsed.success) {
      setError("Enter a valid 6-digit OTP.");
      return;
    }
    try {
      setError(null);
      await verifyOpsLoginOtp(parsed.data);
      router.replace("/ops");
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Ops sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Platform control plane — email OTP only. Session is stored as an httpOnly cookie on the
          API host.
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleRequestOtp} className="grid gap-4 rounded-lg border border-border p-6">
          <label className="grid gap-1 text-sm">
            Email
            <input
              type="email"
              className="h-11 rounded-md border border-border bg-background px-3 text-sm"
              {...form.register("email")}
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            disabled={form.formState.isSubmitting}
          >
            Send OTP
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="grid gap-4 rounded-lg border border-border p-6">
          <label className="grid gap-1 text-sm">
            OTP code
            <input
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            />
          </label>
          <button type="submit" className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
            Verify and continue
          </button>
        </form>
      )}

      <AuthErrorBanner message={error} />

      <Link href="/" className="text-center text-sm text-primary underline-offset-4 hover:underline">
        Back to storefront
      </Link>
    </div>
  );
}
