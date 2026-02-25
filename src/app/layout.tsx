import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Goddard GUI — Mission Control",
  description: "Dashboard for OpenClaw Gateway",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Sidebar />
        <main className="md:ml-64 min-h-screen pb-20 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
