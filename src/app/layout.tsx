import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "MacroBrief",
  description: "Tell it what you follow. Get a brief on your schedule, on the channel you actually read.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
