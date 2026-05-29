const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

export async function isBackendHealthy(
  apiBase: string = DEFAULT_API_BASE,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

