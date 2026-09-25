import localFont from "next/font/local";

export const outfit = localFont({
  src: "../fonts/outfit-latin-wght-normal.woff2",
  variable: "--font-outfit",
  display: "swap",
});

export const spaceMono = localFont({
  src: [
    { path: "../fonts/space-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/space-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-space-mono",
  display: "swap",
});
