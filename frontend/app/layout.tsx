import type { Metadata } from "next";
import { interFont } from "@/lib/fonts";
import { APP_NAME } from "@/lib/constants";
import { MaintenanceBanner } from "@/components/maintenance/MaintenanceBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "Premium chemical free and natural products from Raghava Organics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans overflow-x-hidden" suppressHydrationWarning>
        {/*
          Global maintenance banner. Self-hides on /ops/* routes (operators
          already see the load-shed panel) and on `normal|reduced|emergency`
          modes. Polls every 60s in steady state, escalates to 5s when a
          maintenance window is pending so the countdown stays accurate.
        */}
        <MaintenanceBanner />
        {children}
      </body>
    </html>
  );
}
