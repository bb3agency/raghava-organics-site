import type { ReactNode } from "react";
import { OpsRootLayout } from "@/components/ops/OpsRootLayout";

interface OpsLayoutProps {
  children: ReactNode;
}

export default function OpsLayout({ children }: OpsLayoutProps) {
  return <OpsRootLayout>{children}</OpsRootLayout>;
}
