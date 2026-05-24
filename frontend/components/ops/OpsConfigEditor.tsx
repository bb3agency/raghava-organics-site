"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import { useOpsCanWrite } from "@/components/ops/OpsSessionProvider";
import {
  OpsAlert,
  OpsBadge,
  OpsCard,
  OpsCardHeader,
  OpsField,
  OpsInput,
  OpsSelect,
} from "@/components/ops/ui/ops-ui";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getApiErrorMessageWithHint } from "@/lib/error-messages";
import {
  buildOpsConfigFieldDefinitions,
  groupOpsConfigFieldsByDomain,
  type OpsConfigFieldDefinition,
} from "@/lib/ops-config-fields";
import {
  requestOpsOtpChallenge,
  saveOpsConfigClient,
  validateOpsConfigClient,
  type OpsConfigOverview,
  type OpsStoredConfig,
} from "@/lib/ops-client-api";

interface OpsConfigEditorProps {
  overview: OpsConfigOverview;
  stored: OpsStoredConfig;
  onConfigSaved?: () => void;
}

type DraftEntry = {
  value: string;
  touched: boolean;
  cleared: boolean;
};

function buildInitialDraft(fields: OpsConfigFieldDefinition[]): Record<string, DraftEntry> {
  const draft: Record<string, DraftEntry> = {};
  for (const field of fields) {
    draft[field.key] = { value: "", touched: false, cleared: false };
  }
  return draft;
}

interface OpsConfigFieldRowProps {
  field: OpsConfigFieldDefinition;
  entry: DraftEntry;
  canWrite: boolean;
  onChange: (key: string, value: string) => void;
  onClear: (key: string) => void;
}

function OpsConfigFieldRow({
  field,
  entry,
  canWrite,
  onChange,
  onClear,
}: OpsConfigFieldRowProps) {
  const [showSecret, setShowSecret] = useState(false);
  const hasStoredValue = Boolean(field.storedMasked);
  const isDirty = entry.touched || entry.cleared;
  const canEditField = canWrite && !field.envLocked;

  return (
    <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/15 p-4 sm:grid-cols-[minmax(0,220px)_1fr_auto] sm:items-start sm:gap-4">
      <div className="grid gap-1">
        <code className="text-xs font-medium text-foreground">{field.key}</code>
        <p className="text-xs text-muted-foreground">{field.label}</p>
        <div className="flex flex-wrap gap-1">
          {field.present ? (
            <OpsBadge tone="success">Runtime present</OpsBadge>
          ) : (
            <OpsBadge tone="danger">Missing</OpsBadge>
          )}
          {hasStoredValue ? <OpsBadge tone="info">Saved in DB</OpsBadge> : null}
          {field.envLocked ? <OpsBadge tone="muted">Managed via env file</OpsBadge> : null}
          {field.requiresRestart ? <OpsBadge tone="muted">Restart required</OpsBadge> : null}
          {isDirty ? <OpsBadge tone="warning">Unsaved</OpsBadge> : null}
        </div>
      </div>

      <div className="grid gap-2">
        {field.envLocked ? (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Runtime value is currently sourced from environment. Edit the deployment env file and
            restart services to change this key.
          </div>
        ) : field.inputKind === "boolean" ? (
          <OpsSelect
            id={`config-${field.key}`}
            value={entry.value}
            disabled={!canEditField}
            onChange={(event) => onChange(field.key, event.target.value)}
          >
            <option value="">— Select —</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </OpsSelect>
        ) : field.inputKind === "select" && field.options ? (
          <OpsSelect
            id={`config-${field.key}`}
            value={entry.value}
            disabled={!canEditField}
            onChange={(event) => onChange(field.key, event.target.value)}
          >
            <option value="">— Select —</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </OpsSelect>
        ) : (
          <div className="relative">
            <OpsInput
              id={`config-${field.key}`}
              type={field.inputKind === "secret" && !showSecret ? "password" : "text"}
              value={entry.value}
              disabled={!canEditField}
              placeholder={
                entry.cleared
                  ? "Will remove stored value on save"
                  : hasStoredValue
                    ? `Stored: ${field.storedMasked} — enter new value to replace`
                    : "Enter value"
              }
              onChange={(event) => onChange(field.key, event.target.value)}
              className={field.inputKind === "secret" ? "pr-10 font-mono text-xs" : "font-mono text-xs"}
              autoComplete="off"
            />
            {field.inputKind === "secret" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1/2 right-1 size-8 -translate-y-1/2"
                onClick={() => setShowSecret((prev) => !prev)}
                aria-label={showSecret ? "Hide value" : "Show value"}
              >
                {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            ) : null}
          </div>
        )}
        {field.hint ? <p className="text-xs text-muted-foreground">{field.hint}</p> : null}
      </div>

      <div className="flex gap-2 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEditField || (!entry.value && !hasStoredValue && !entry.cleared)}
          onClick={() => onClear(field.key)}
          className="gap-1"
        >
          <Trash2 className="size-3.5" aria-hidden />
          Clear
        </Button>
      </div>
    </div>
  );
}

export function OpsConfigEditor({ overview, stored, onConfigSaved }: OpsConfigEditorProps) {
  const canWrite = useOpsCanWrite();
  const fields = useMemo(
    () => buildOpsConfigFieldDefinitions(overview, stored),
    [overview, stored],
  );
  const sections = useMemo(() => groupOpsConfigFieldsByDomain(fields), [fields]);

  const [draft, setDraft] = useState<Record<string, DraftEntry>>(() => buildInitialDraft(fields));
  const [challengeId, setChallengeId] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setDraft(buildInitialDraft(fields));
  }, [fields]);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const dirtyValues = useMemo(() => {
    const values: Record<string, string | null> = {};
    for (const field of fields) {
      const entry = draft[field.key];
      if (!entry) {
        continue;
      }
      if (entry.cleared) {
        values[field.key] = null;
        continue;
      }
      if (entry.touched && entry.value.trim()) {
        values[field.key] = entry.value.trim();
      }
    }
    return values;
  }, [draft, fields]);

  const dirtyCount = Object.keys(dirtyValues).length;

  const handleChange = useCallback((key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: {
        value,
        touched: true,
        cleared: false,
      },
    }));
  }, []);

  const handleClear = useCallback((key: string) => {
    setDraft((prev) => ({
      ...prev,
      [key]: {
        value: "",
        touched: true,
        cleared: true,
      },
    }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft(buildInitialDraft(fields));
    setOtpCode("");
    setChallengeId("");
    setExpiresAt(null);
    setError(null);
    setMessage(null);
  }, [fields]);

  async function handleRequestOtp() {
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const challenge = await requestOpsOtpChallenge("config-save");
      setChallengeId(challenge.challengeId);
      setExpiresAt(challenge.expiresAt);
      setMessage("A 6-digit code was sent to your ops email.");
    } catch (err) {
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function executeSave() {
    if (!canWrite) {
      return;
    }
    if (dirtyCount === 0) {
      setError("Change at least one field before saving.");
      return;
    }

    if (!challengeId) {
      await handleRequestOtp();
      return;
    }

    if (otpCode.trim().length !== 6) {
      setError("Enter the 6-digit OTP sent to your email.");
      return;
    }
    if (secondsLeft <= 0) {
      setError("OTP expired. Request a new code.");
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const validation = await validateOpsConfigClient({ values: dirtyValues });
      if (!validation.valid) {
        setError(
          validation.errors.map((issue) => `${issue.key}: ${issue.message}`).join(" · ") ||
            "Configuration validation failed.",
        );
        return;
      }

      const result = await saveOpsConfigClient({
        values: dirtyValues,
        challengeId,
        otpCode: otpCode.trim(),
      });
      setMessage(
        `Saved ${result.savedKeys.length} key(s). Restart API and workers when prompted.`,
      );
      setOtpCode("");
      setChallengeId("");
      setExpiresAt(null);
      onConfigSaved?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === "ops_audit_chain_lock_timeout") {
        setError(getApiErrorMessageWithHint(err));
        window.setTimeout(() => {
          void executeSave();
        }, 1500);
        return;
      }
      setError(getApiErrorMessageWithHint(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    await executeSave();
  }

  if (!canWrite) {
    return (
      <OpsAlert tone="warning">
        Read-only session — configuration changes require ops:write.
      </OpsAlert>
    );
  }

  return (
    <form onSubmit={handleSave} className="grid gap-8">
      {sections.map((section) => (
        <OpsCard key={section.domain}>
          <OpsCardHeader
            title={section.label}
            description="DB-overlay keys — variable name is fixed; edit the value column."
          />
          <div className="grid gap-3">
            {section.fields.map((field) => (
              <OpsConfigFieldRow
                key={field.key}
                field={field}
                entry={draft[field.key] ?? { value: "", touched: false, cleared: false }}
                canWrite={canWrite}
                onChange={handleChange}
                onClear={handleClear}
              />
            ))}
          </div>
        </OpsCard>
      ))}

      <OpsCard className="border-primary/25 bg-primary/5">
        <OpsCardHeader
          title="Save configuration"
          description="Sends an OTP to your ops email, then encrypts and stores changed keys in the database."
          actions={
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-5" aria-hidden />
            </div>
          }
        />

        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            {dirtyCount > 0
              ? `${dirtyCount} unsaved change(s) ready to persist.`
              : "Edit values above, then save."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetDraft}
              disabled={isLoading || dirtyCount === 0}
              className="gap-1"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset changes
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRequestOtp()}
              disabled={isLoading}
            >
              {challengeId && secondsLeft > 0 ? "Resend OTP" : "Send OTP to email"}
            </Button>
            {challengeId && secondsLeft > 0 ? (
              <span className="self-center text-xs text-muted-foreground" role="status">
                OTP expires in {secondsLeft}s
              </span>
            ) : null}
          </div>

          <OpsField label="Verification code" htmlFor="ops-config-otp">
            <OpsInput
              id="ops-config-otp"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="max-w-xs tracking-[0.3em]"
            />
          </OpsField>

          <Button type="submit" disabled={isLoading || dirtyCount === 0} className="w-fit">
            {isLoading
              ? "Working…"
              : challengeId
                ? "Verify OTP and save to database"
                : "Save — send OTP first"}
          </Button>

          {message ? <OpsAlert tone="success">{message}</OpsAlert> : null}
          {error ? <OpsAlert tone="error">{error}</OpsAlert> : null}

          <OpsAlert tone="info">
            After saving provider keys, restart the backend API and workers on the VPS so runtime
            overlay values load into memory.
          </OpsAlert>
        </div>
      </OpsCard>
    </form>
  );
}
