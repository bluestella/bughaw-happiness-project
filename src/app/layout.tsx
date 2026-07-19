import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bughaw Calculators Hub",
  description:
    "Internal unit-economics, go-to-market, and forecasting tools for Bughaw Innovations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
