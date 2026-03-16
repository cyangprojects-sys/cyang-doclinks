// app/layout.tsx
import type { Metadata } from "next";
import { Manrope, JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const geistMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["500"],
  preload: false,
  display: "swap",
});

const editorial = Cormorant_Garamond({
  variable: "--font-editorial",
  subsets: ["latin"],
  weight: ["600", "700"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "cyang.io",
    template: "%s · cyang.io",
  },
  description:
    "Security-first document delivery and practical software systems by cyang.io.",
  metadataBase: new URL("https://cyang.io"),
  openGraph: {
    title: "cyang.io",
    description:
      "Security-first document sharing infrastructure and practical systems design.",
    url: "https://cyang.io",
    siteName: "cyang.io",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cyang.io",
    description:
      "Security-first document sharing infrastructure by cyang.io.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${editorial.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
