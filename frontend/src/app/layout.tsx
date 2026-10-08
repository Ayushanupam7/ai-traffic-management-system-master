import type { Metadata } from "next";
import TopNav from "@/components/Layout/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marg Dhristhi | मार्ग दृष्टि - AI Traffic Management",
  description: "Marg Dhristhi (मार्ग दृष्टि) - Next-Gen AI Traffic Management & Real-time Flow Orchestration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full flex flex-col bg-slate-100 dark:bg-[#060a0f] text-slate-900 dark:text-gray-100 overflow-hidden transition-colors duration-250">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
