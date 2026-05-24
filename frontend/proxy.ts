import { connection } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  assertOpsUiAccessFromRequest,
  isOpsUiBasicAuthConfigured,
  isProductionLikeRuntime,
} from "@/lib/ops-ui-auth";

function unauthorizedResponse() {
  return new NextResponse("Authentication required for /ops", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ops-console", charset="UTF-8"',
    },
  });
}

/** Read OPS_UI_BASIC_AUTH_* at request time (not only from the production build bundle). */
export async function proxy(request: NextRequest) {
  await connection();

  if (isProductionLikeRuntime() && !isOpsUiBasicAuthConfigured()) {
    return new NextResponse(
      "Ops routes are disabled until OPS_UI_BASIC_AUTH_USERNAME and OPS_UI_BASIC_AUTH_PASSWORD are configured.",
      { status: 503 },
    );
  }

  if (!isOpsUiBasicAuthConfigured()) {
    return NextResponse.next();
  }

  try {
    assertOpsUiAccessFromRequest(request);
  } catch {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/ops/:path*"],
};
