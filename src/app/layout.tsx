import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Folio — A little closer to the answer",
  description:
    "A reusable, evidence-first workspace for your RAG applications.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
