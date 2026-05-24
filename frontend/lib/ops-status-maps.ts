import type { OpsBadgeTone } from "@/components/ops/ui/ops-ui";
import type { OpsInviteListItem, OpsLoadShedStatus } from "@/lib/ops-client-api";

export function loadShedBadgeTone(mode: OpsLoadShedStatus["mode"]): OpsBadgeTone {
  switch (mode) {
    case "normal":
      return "success";
    case "reduced":
      return "warning";
    case "emergency":
      return "danger";
    default:
      return "default";
  }
}

export function inviteStatusTone(status: OpsInviteListItem["status"]): OpsBadgeTone {
  switch (status) {
    case "CONSUMED":
      return "success";
    case "EMAIL_SENT":
    case "CREATED":
      return "info";
    case "CANCELLED":
    case "EXPIRED_CLEANED":
      return "muted";
    default:
      return "default";
  }
}

export function auditStatusTone(status: "EXECUTED" | "FAILED"): OpsBadgeTone {
  return status === "EXECUTED" ? "success" : "danger";
}
