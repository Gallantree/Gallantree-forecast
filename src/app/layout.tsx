import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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
