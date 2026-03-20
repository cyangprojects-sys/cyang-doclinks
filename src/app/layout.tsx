// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "cyang.io",
    template: "%s · cyang.io",
  },
  description:
    "Premium secure workflow software by cyang.io, with Doclinks as the flagship and trust built into the public operating shell.",
  metadataBase: new URL("https://cyang.io"),
  openGraph: {
    title: "cyang.io",
    description:
      "Premium secure workflow software, disciplined product systems, and trust-centered public architecture.",
    url: "https://cyang.io",
    siteName: "cyang.io",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "cyang.io",
    description:
      "Premium secure workflow software by cyang.io.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
