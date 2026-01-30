import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nostr Chess",
  description: "Decentralized chess on the Nostr protocol",
};

import { Header } from "@/components/Header";
import { NostrProvider } from "@/contexts/NostrContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-50 min-h-screen flex flex-col`}
      >
        <NostrProvider>
          <Header />
          <main className="flex-1">
            {children}
          </main>
        </NostrProvider>
      </body>
    </html>
  );
}
