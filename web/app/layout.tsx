import type { Metadata } from "next";
import { Lexend, Sometype_Mono } from "next/font/google";
import "./globals.css";
import "./vision-style-panel.css";
import "./design-system-v2.css";

const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
});

const sometypeMono = Sometype_Mono({
  variable: "--font-sometype-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diregram",
  description: "Semantic diagrams as Markdown text.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="diregram-v2" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${lexend.variable} ${sometypeMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
