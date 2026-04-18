import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GPT Debate Studio",
  description:
    "Run multi-agent GPT debates on your documents, inspect consensus progress, and save the final conclusion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
