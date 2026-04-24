"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  TrendingUp,
  FileText,
  Sparkles,
  Clock,
  AlertCircle,
  BarChart3,
  CheckCircle,
  Edit,
  DatabaseZap,
  KeyRound,
  LibraryBig,
} from "lucide-react";
import { getBooks, getStats } from "@/lib/api";
import { useBackendHealth } from "@/contexts/BackendHealthContext";
import type { BookInfo, DatasetStats, HealthCheck } from "@/lib/types";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DashboardPage() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();
  const { health, status: healthStatus, error: healthError } = useBackendHealth();

  useEffect(() => {
    async function loadData() {
      const [booksResult, statsResult] = await Promise.allSettled([
        getBooks(),
        getStats(),
      ]);

      const failures: string[] = [];

      if (booksResult.status === "fulfilled") {
        setBooks(booksResult.value);
      } else {
        failures.push(booksResult.reason instanceof Error ? booksResult.reason.message : "Could not load books");
      }

      if (statsResult.status === "fulfilled") {
        setStats(statsResult.value);
      } else {
        failures.push(statsResult.reason instanceof Error ? statsResult.reason.message : "Could not load stats");
      }

      setError(failures.length > 0 ? failures.join(" / ") : null);
      setLoading(false);
    }

    void loadData();
  }, []);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("dashboard.title")}</h1>
          <p className="text-slate-400 mt-1">{t("dashboard.subtitle")}</p>
        </div>
        <Link
          href="/translate"
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-navy-700 text-white rounded-xl font-medium text-sm hover:from-indigo-500 hover:to-navy-600 transition-all duration-300 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
        >
          <Sparkles className="w-4 h-4" />
          {t("dashboard.startTranslation")}
        </Link>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="glass-card border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <SetupPanel
        health={health}
        healthStatus={healthStatus}
        healthError={healthError}
      />

      {/* Stats Cards — matched to backend DatasetStats */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard icon={BookOpen} label={t("dashboard.totalBooks")} value={stats?.total_books ?? 0} color="indigo" />
        <StatCard icon={FileText} label={t("dashboard.totalChapters")} value={stats?.total_records ?? 0} color="emerald" />
        <StatCard icon={BarChart3} label={t("dashboard.totalTerms")} value={stats?.glossary_terms ?? 0} color="sky" />
        <StatCard icon={CheckCircle} label={t("dashboard.confirmed")} value={stats?.confirmed ?? 0} color="gold" badge={stats?.draft !== undefined && stats.draft > 0} />
      </div>

      {/* Book Progress Cards — uses BookInfo from backend */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" />
            {t("dashboard.bookProgress")}
          </h2>
          <span className="text-sm text-slate-500">
            {books.length}{t("dashboard.booksCount")}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {books.map((book) => (
            <BookCard key={book.book} book={book} />
          ))}
          {books.length === 0 && !error && (
            <div className="col-span-3 glass-card p-12 text-center">
              <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">{t("dashboard.noBooks")}</p>
              <Link href="/upload" className="text-indigo-400 text-sm hover:text-indigo-300 mt-2 inline-block">
                {t("dashboard.uploadDataset")}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Draft/Confirmed Summary */}
      <section>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-indigo-400" />
          {t("dashboard.recentUploads")}
        </h2>
        <div className="glass-card p-6">
          {stats && stats.total_records > 0 ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-white">{stats.total_records}</p>
                <p className="text-sm text-slate-400 mt-1">{t("dashboard.totalChapters")}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-400">{stats.confirmed}</p>
                <p className="text-sm text-slate-400 mt-1">{t("dashboard.confirmed")}</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-amber-400">{stats.draft}</p>
                <p className="text-sm text-slate-400 mt-1">{t("dashboard.draft")}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">{t("dashboard.noUploads")}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ===== Sub Components =====

function StatCard({
  icon: Icon, label, value, color, badge,
}: {
  icon: React.ElementType; label: string; value: number;
  color: "indigo" | "emerald" | "sky" | "gold"; badge?: boolean;
}) {
  const colorMap = {
    indigo: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    sky: { bg: "bg-sky-500/10", text: "text-sky-400", border: "border-sky-500/20" },
    gold: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  };
  const c = colorMap[color];

  return (
    <div className={`glass-card-hover p-5 relative overflow-hidden ${c.border}`}>
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.text}`} />
        </div>
        {badge && (
          <span className="badge-pulse px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">DRAFT</span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
        <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      </div>
      <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${c.bg} blur-2xl opacity-30`} />
    </div>
  );
}

function BookCard({ book }: { book: BookInfo }) {
  const { t } = useLanguage();
  const totalChapters = book.total_records;
  const withSource = book.records_with_source_text;
  const progress = book.source_coverage_percent;

  return (
    <div className="glass-card-hover p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate">{book.book}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {totalChapters} {t("dashboard.chapters")}
          </p>
        </div>
        {book.genre.length > 0 && (
          <span className="flex-shrink-0 ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">
            {book.genre[0]}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-400">{t("dashboard.progress")}</span>
          <span className="text-xs font-semibold text-indigo-300">{progress}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Edit className="w-3 h-3" /> {withSource} / {totalChapters}
        </span>
        <span className="text-xs text-slate-500">
          {t("dashboard.confirmed")}: {book.confirmed}
        </span>
      </div>
    </div>
  );
}

function SetupPanel({
  health,
  healthStatus,
  healthError,
}: {
  health: HealthCheck | null;
  healthStatus: "loading" | "ready" | "error";
  healthError: string | null;
}) {
  const { t } = useLanguage();
  const configuredProviderLabels = Object.entries(health?.providers || {})
    .filter(([, provider]) => provider.configured)
    .map(([, provider]) => provider.label);

  const setupItems = [
    {
      icon: KeyRound,
      label: t("dashboard.setupApiKey"),
      ok: !!health?.api_key_set,
      description: configuredProviderLabels.length > 0
        ? `${t("dashboard.setupApiKeyDesc")} (${configuredProviderLabels.join(", ")})`
        : t("dashboard.setupApiKeyDesc"),
    },
    {
      icon: DatabaseZap,
      label: t("dashboard.setupSupabase"),
      ok: !!health?.supabase_configured && !!health?.supabase_connected,
      description: t("dashboard.setupSupabaseDesc"),
    },
    {
      icon: LibraryBig,
      label: t("dashboard.setupGlossary"),
      ok: !!health?.glossary_exists,
      description: `${t("dashboard.setupGlossaryDesc")} ${
        health?.glossary_terms ? `(${health.glossary_terms.toLocaleString()})` : ""
      }`.trim(),
    },
  ];

  return (
    <section className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("dashboard.setupTitle")}</h2>
          <p className="text-sm text-slate-400 mt-1">{t("dashboard.setupSubtitle")}</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full border border-surface-border text-slate-300 bg-surface-lighter/60">
          {health?.dataset_backend || "backend"}
        </span>
      </div>
      {healthStatus === "error" ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {healthError || t("dashboard.setupLoadError")}
        </div>
      ) : healthStatus === "loading" ? (
        <div className="rounded-xl border border-surface-border bg-surface-light/50 px-4 py-3 text-sm text-slate-400">
          {t("dashboard.setupLoading")}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {setupItems.map((item) => (
            <div key={item.label} className="rounded-xl border border-surface-border bg-surface-light/50 p-4">
              <div className="flex items-center justify-between">
                <item.icon className={`w-4 h-4 ${item.ok ? "text-emerald-400" : "text-amber-300"}`} />
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    item.ok
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-300 border-amber-500/20"
                  }`}
                >
                  {item.ok ? t("dashboard.setupReady") : t("dashboard.setupNeeded")}
                </span>
              </div>
              <p className="text-sm text-white font-medium mt-3">{item.label}</p>
              <p className="text-xs text-slate-500 mt-1">{item.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-12 w-48 shimmer rounded-lg" />
      <div className="grid grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card p-5 h-32 shimmer" />
        ))}
      </div>
      <div>
        <div className="h-8 w-40 shimmer rounded-lg mb-4" />
        <div className="grid grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card p-5 h-36 shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}
