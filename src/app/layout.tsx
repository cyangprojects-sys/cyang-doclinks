// app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chang Yang — Personal Hub",
    template: "%s · Chang Yang",
  },
  description:
    "Chang Yang’s personal hub for projects, tools, and experiments. Clean, minimal, and built to be useful.",
  metadataBase: new URL("https://cyang.io"),
  openGraph: {
    title: "Chang Yang — Personal Hub",
    description:
      "Projects, tools, and experiments by Chang Yang. Secure doc sharing, automation, and practical builds.",
    url: "https://cyang.io",
    siteName: "cyang.io",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chang Yang — Personal Hub",
    description:
      "Projects, tools, and experiments by Chang Yang.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
