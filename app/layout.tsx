import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "UPTGT Hindi 2026 Result Predictor",
  description: "Predict your UPTGT Hindi 2026 result",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-slate-900">
          <nav className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link
              href="/"
              className="text-base font-bold tracking-wide text-white sm:text-lg"
            >
              UPTGT HINDI 2026{" "}
              <span className="font-semibold text-blue-300">
                RESULT PREDICTOR
              </span>
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
