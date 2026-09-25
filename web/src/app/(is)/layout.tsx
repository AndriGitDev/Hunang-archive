import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GrainOverlay } from "@/components/GrainOverlay";
import { outfit, spaceMono } from "@/lib/fonts";
import { is } from "@/copy/is";
import "../globals.css";

export const metadata: Metadata = {
  title: is.meta.title,
  description: is.meta.description,
  metadataBase: new URL("https://hunang.kastro.is"),
  openGraph: {
    title: is.meta.ogTitle,
    siteName: "Kastro Labs",
    description: is.meta.ogDescription,
    type: "website",
    locale: "is_IS",
    alternateLocale: ["en_US"],
  },
};

export const viewport: Viewport = {
  themeColor: "#F2B705",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="is" className={`${outfit.variable} ${spaceMono.variable}`}>
      <body>
        {children}
        <GrainOverlay />
        <Analytics />
      </body>
    </html>
  );
}
