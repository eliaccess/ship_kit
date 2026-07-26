import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipKit — from repo to app store",
  description: "Turn a GitHub repo into installable Android & iOS apps, guided step by step.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              ShipKit
              <span className="text-xs font-normal text-stone-400">repo → phone</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">Projects</Link>
              <Link href="/settings" className="hover:text-stone-900">Settings</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
