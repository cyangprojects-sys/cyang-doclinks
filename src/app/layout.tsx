// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
