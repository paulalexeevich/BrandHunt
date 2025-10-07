import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrangHunt - AI Product Detection",
  description: "AI-powered product detection and brand recognition using Gemini and FoodGraph APIs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
