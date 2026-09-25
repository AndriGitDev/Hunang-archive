import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GrainOverlay } from "@/components/GrainOverlay";
import { outfit, spaceMono } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "Hunang — an internet field study | Kastro Labs",
  description: "The findings and anonymous results of Hunang, an SSH and Telnet honeypot field study.",
  metadataBase: new URL("https://hunang.kastro.is"),
  openGraph: {
    title: "Hunang — an internet field study | Kastro Labs",
    siteName: "Kastro Labs",
    description: "What one decoy server recorded when it was exposed to the open internet.",
    type: "website",
    locale: "en_US",
  },
};

export const viewport: Viewport = {
  themeColor: "#F2B705",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${spaceMono.variable}`}>
      <body>
        {children}
        <GrainOverlay />
        <Analytics />
      </body>
    </html>
  );
}
