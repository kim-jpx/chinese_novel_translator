"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Languages,
  Upload,
  Sparkles,
  Globe,
  Activity,
  LibraryBig,
  GraduationCap,
} from "lucide-react";
import { useBackendHealth } from "@/contexts/BackendHealthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { LOCALE_FLAGS, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import ChineseScriptSwitcher from "@/components/ChineseScriptSwitcher";
import { useState, useRef, useEffect } from "react";

export default function Sidebar() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useLanguage();
  const { health, status } = useBackendHealth();

  const navItems = [
    { href: "/", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/glossary", label: t("nav.glossary"), icon: BookOpen },
    { href: "/translate", label: t("nav.translate"), icon: Languages },
    { href: "/reader", label: t("nav.reader"), icon: LibraryBig },
    { href: "/study", label: t("nav.study"), icon: GraduationCap },
    { href: "/upload", label: t("nav.upload"), icon: Upload },
  ];

  const backendReady =
    status === "ready" &&
    !!health &&
    health.api_key_set &&
    health.supabase_configured &&
    health.supabase_connected &&
    health.glossary_exists;

  const backendStatusText =
    status === "loading"
      ? t("sidebar.checking")
      : status === "error"
        ? t("sidebar.disconnected")
        : backendReady
          ? t("sidebar.connected")
          : t("sidebar.attention");

  const backendStatusClass =
    status === "loading"
      ? "text-slate-400"
      : status === "error"
        ? "text-red-300"
        : backendReady
          ? "text-emerald-400"
          : "text-amber-300";

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-surface-border bg-surface-light/80 backdrop-blur-xl lg:flex">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-surface-border">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-navy-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow duration-300">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              {t("app.title")}
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              {t("app.subtitle")}
            </p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-surface-lighter/60"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors duration-200 ${
                  isActive
                    ? "text-indigo-400"
                    : "text-slate-500 group-hover:text-slate-300"
                }`}
              />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 space-y-3 border-t border-surface-border">
        {/* Language Switcher */}
        <LanguageSwitcher locale={locale} setLocale={setLocale} />

        <ChineseScriptSwitcher />

        {/* Backend Status */}
        <div className="glass-card px-4 py-3 text-center">
          <p className="text-xs text-slate-500">{t("sidebar.backend")}</p>
          <p className={`text-xs font-mono mt-0.5 ${backendStatusClass}`}>
            {backendStatusText}
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
            <Activity className="w-3 h-3" />
            <span>{health?.dataset_backend || "backend"}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ===== Language Switcher =====
function LanguageSwitcher({
  locale,
  setLocale,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const locales: Locale[] = ["ko", "en", "zh"];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-surface-lighter/60 border border-surface-border hover:border-indigo-500/30 transition-all duration-200 group"
      >
        <Globe className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
        <span className="text-sm text-slate-300">
          {LOCALE_FLAGS[locale]} {LOCALE_LABELS[locale]}
        </span>
        <svg
          className={`w-3 h-3 ml-auto text-slate-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 glass-card py-1 z-50 animate-fade-in">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150 ${
                locale === l
                  ? "text-indigo-300 bg-indigo-500/10"
                  : "text-slate-400 hover:text-white hover:bg-surface-lighter/60"
              }`}
            >
              <span>{LOCALE_FLAGS[l]}</span>
              <span>{LOCALE_LABELS[l]}</span>
              {locale === l && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
