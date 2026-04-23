import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import HealthBanner from "@/components/HealthBanner";
import PwaRegister from "@/components/PwaRegister";
import ChineseScriptSwitcher from "@/components/ChineseScriptSwitcher";
import { BackendHealthProvider } from "@/contexts/BackendHealthContext";
import { ChineseScriptProvider } from "@/contexts/ChineseScriptContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

export const metadata: Metadata = {
  title: "중한 문학 번역 에이전트",
  description: "Chinese to Korean literary translation agent with glossary management, powered by AI.",
  applicationName: "번역에이전트",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "번역에이전트",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/pwa/icon.svg",
    apple: "/pwa/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0d1f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PwaRegister />
        <LanguageProvider>
          <ChineseScriptProvider>
            <BackendHealthProvider>
              <div className="flex min-h-screen bg-background text-foreground">
                <Sidebar />
                <main className="flex-1 lg:ml-64">
                  <HealthBanner />
                  <div className="mx-auto max-w-[1600px] px-4 py-6 pb-24 sm:px-6 lg:p-8 lg:pb-8">
                    {children}
                  </div>
                </main>
                <div className="fixed right-3 top-3 z-50 lg:hidden">
                  <ChineseScriptSwitcher compact />
                </div>
                <MobileNav />
              </div>
            </BackendHealthProvider>
          </ChineseScriptProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
