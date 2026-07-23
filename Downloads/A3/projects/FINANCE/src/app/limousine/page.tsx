import type { Metadata } from "next";
import LimousineWebsite from "./limousine-website";

export const metadata: Metadata = {
  title: "AEJKY Limousine | Premium Chauffeur & Airport Transfer",
  description:
    "Premium limousine, airport transfer, point-to-point, hourly disposal and cross-border chauffeur services by AEJKY Limousine.",
  keywords: [
    "AEJKY Limousine",
    "Singapore limousine",
    "airport transfer",
    "chauffeur service",
    "hourly disposal",
    "Singapore Malaysia transfer",
  ],
  openGraph: {
    title: "AEJKY Limousine",
    description:
      "Premium chauffeur services with transparent rates and fast quotation requests.",
    type: "website",
    images: ["/aejky-limousine-logo.jpeg"],
  },
};

export default function LimousinePage() {
  return <LimousineWebsite />;
}
