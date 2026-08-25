import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Explicit choice, kept after comparing against a sans display alternative.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "Skylark BI - monday.com intelligence agent",
  description:
    "Ask founder-level questions about the Skylark Drones pipeline and project execution. Every answer is computed live from monday.com boards, with data caveats attached.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${display.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
