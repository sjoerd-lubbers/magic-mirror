import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Magic Mirror",
  description: "Multitenant magic mirror beheerapp",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
