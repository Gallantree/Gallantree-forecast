import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { SessionExpiryGuard } from "@/app/_components/SessionExpiryGuard";
import { SessionProviderClient } from "@/app/_components/SessionProviderClient";
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
  // Per-page titles append the brand: `<Page>` | Gallantree Financial.
  // Pages that don't set their own title fall back to `default`.
  title: {
    default: "Gallantree Financial",
    template: "%s | Gallantree Financial",
  },
  description:
    "Five-year forecasting, capital programs, and CRE loan-book modeling for Gallantree.",
  applicationName: "Gallantree Financial",
  icons: {
    icon: "/gallantree-logo.png",
    shortcut: "/gallantree-logo.png",
    apple: "/gallantree-logo.png",
  },
  openGraph: {
    title: "Gallantree Financial",
    description:
      "Five-year forecasting, capital programs, and CRE loan-book modeling for Gallantree.",
    siteName: "Gallantree Financial",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Windows + ClearType render text noticeably thinner than macOS, so the
  // lighter zinc text utilities (zinc-400 / zinc-500) become hard to read.
  // We detect Windows from the User-Agent on the server and tag <html> so
  // CSS in globals.css can darken those utilities only for Windows clients.
  const ua = (await headers()).get("user-agent") ?? "";
  const isWindows = /Windows/i.test(ua);
  const platformClass = isWindows ? "is-windows" : "";
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${platformClass} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProviderClient>
          {children}
          <SessionExpiryGuard />
        </SessionProviderClient>
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
