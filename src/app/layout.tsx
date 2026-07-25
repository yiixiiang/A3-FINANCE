import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
export const metadata: Metadata = { title: "A3 Management", description: "A3 Group business operating system" };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}<SpeedInsights /></body></html>;
}
