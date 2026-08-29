import type { Metadata } from "next";
import { Fraunces, Archivo } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display",
  fallback: ["Georgia", "serif"],
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  fallback: ["system-ui", "sans-serif"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brandstof",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
