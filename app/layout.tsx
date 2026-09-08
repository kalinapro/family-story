import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["cyrillic", "latin"], variable: "--font-manrope" });
const playfair = Playfair_Display({ subsets: ["cyrillic", "latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: "Семейная история",
  description: "Соберите семейные фотографии в одну тёплую историю",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} ${playfair.variable}`}>{children}</body>
    </html>
  );
}
