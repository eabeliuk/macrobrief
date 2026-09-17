import type { Metadata } from "next";
import { IBM_Plex_Mono, Open_Sans } from "next/font/google";

import "./globals.css";

// The family face: the wordmark is set in it, and the interface follows so
// the lockup and the page read as one thing.
const openSans = Open_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-open-sans" });
// The wire's face: slugs, datelines, figures.
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "MacroBrief",
  description: "Tell it what you follow. Get a brief on your schedule, on the channel you actually read.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${openSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
