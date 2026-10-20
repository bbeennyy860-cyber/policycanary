import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "PolicyCanary · Release gate for robot AI policies",
  description: "Anytime-valid sequential release gate for robot AI policies, replayed on real RoboArena evaluation sessions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
