import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BidCopilot — Freelancer bid co-pilot",
  description: "Find, score, and write proposals for Freelancer.com projects — bid faster, win more.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
