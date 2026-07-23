import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3 Group Singapore",
  description: "A3 Group connects premium nightlife, professional chauffeured transport and quality food experiences in Singapore.",
  metadataBase: new URL("https://a3group.sg"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
