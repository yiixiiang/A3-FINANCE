import type { Metadata, Viewport } from "next";
import EnterpriseShell from "@/components/enterprise-shell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://finance.a3group.sg"),
  title: "A3 Management",
  description: "A3 Management Multi-Company Platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body>
        <EnterpriseShell>{children}</EnterpriseShell>
      </body>
    </html>
  );
}
