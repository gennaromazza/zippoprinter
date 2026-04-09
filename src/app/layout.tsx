import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { RecoveryHashRedirect } from "@/components/recovery-hash-redirect";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stampiss | Ordini di stampa fotografica per studi e clienti",
  description:
    "Stampiss aiuta gli studi fotografici a raccogliere, gestire e preparare ordini di stampa in modo semplice e professionale.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col app-shell">
        <RecoveryHashRedirect />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
