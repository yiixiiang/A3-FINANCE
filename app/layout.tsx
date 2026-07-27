import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#07111f",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "A3 Management | A3 Group SG",
  description: "A3 Group SG business operating system",
  icons: {
    icon: "/brand/a3-group-sg-logo.png",
    shortcut: "/brand/a3-group-sg-logo.png",
    apple: "/brand/a3-group-sg-logo.png",
  },
  openGraph: {
    title: "A3 Management | A3 Group SG",
    description: "A3 Group SG business operating system",
    images: ["/brand/a3-group-sg-logo.png"],
  },
};
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}<SpeedInsights /></body></html>;
}
