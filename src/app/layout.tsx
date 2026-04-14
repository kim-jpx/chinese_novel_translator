import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import HealthBanner from "@/components/HealthBanner";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "중한 문학 번역 에이전트",
  description: "Chinese to Korean literary translation agent with glossary management, powered by AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="antialiased">
        <LanguageProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-64">
              <HealthBanner />
              <div className="p-8 max-w-[1600px] mx-auto">
                {children}
              </div>
            </main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
