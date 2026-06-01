import type { ReactNode } from "react";
import type { Viewport } from "next";
import { OpsRootLayout } from "@/components/ops/OpsRootLayout";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

interface OpsLayoutProps {
  children: ReactNode;
}

export default function OpsLayout({ children }: OpsLayoutProps) {
  return <OpsRootLayout>{children}</OpsRootLayout>;
}
