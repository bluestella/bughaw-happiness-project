import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/components/AppToaster";

export const metadata: Metadata = {
  title: "Bughaw Calculators Hub",
  description:
    "Internal unit-economics, go-to-market, and forecasting tools for Bughaw Innovations.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-root">
          {children}
          <AppToaster />
        </div>
      </body>
    </html>
  );
}
