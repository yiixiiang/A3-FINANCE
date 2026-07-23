import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: "Sakura Entertainment | Singapore Nightlife",
    template: "%s | Sakura Entertainment",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/sakura-mark.svg",
    apple: "/sakura-mark.svg",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: siteConfig.name,
    title: "Sakura Entertainment | Singapore Nightlife",
    description: siteConfig.description,
    images: [
      {
        url: "/sakura-mark.svg",
        width: 512,
        height: 512,
        alt: "Sakura Entertainment",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Sakura Entertainment | Singapore Nightlife",
    description: siteConfig.description,
    images: ["/sakura-mark.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#070307",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "EntertainmentBusiness",
    name: siteConfig.name,
    url: siteConfig.siteUrl,
    description: siteConfig.description,
    address: siteConfig.address,
  };

  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
