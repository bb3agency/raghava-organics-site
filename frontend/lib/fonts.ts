import { Inter, Manrope } from "next/font/google";

export const bodyFont = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const headingFont = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
