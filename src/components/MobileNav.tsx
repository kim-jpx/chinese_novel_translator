"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Languages,
  Upload,
  LibraryBig,
  GraduationCap,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MobileNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const navItems = [
    { href: "/", label: t("nav.dashboard"), icon: LayoutDashboard },
    { href: "/glossary", label: t("nav.glossary"), icon: BookOpen },
    { href: "/translate", label: t("nav.translate"), icon: Languages },
    { href: "/reader", label: t("nav.reader"), icon: LibraryBig },
    { href: "/study", label: t("nav.study"), icon: GraduationCap },
    { href: "/upload", label: t("nav.upload"), icon: Upload },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-surface/90 backdrop-blur-xl lg:hidden">
      <div className="grid grid-cols-6 gap-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-indigo-500/15 text-indigo-300"
                  : "text-slate-400 hover:bg-surface-lighter/60 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
