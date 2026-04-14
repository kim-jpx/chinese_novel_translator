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
} from "lucide-react";
import { getBooks, getStats } from "@/lib/api";
import type { BookInfo, DatasetStats } from "@/lib/types";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DashboardPage() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [stats, setStats] = useState<DatasetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    async function loadData() {
      try {
        const [booksData, statsData] = await Promise.all([
          getBooks(),
          getStats(),
        ]);
        setBooks(booksData);
        setStats(statsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("dashboard.loadError"));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* Stats Cards — matched to backend DatasetStats */}
      <div className="grid grid-cols-4 gap-5">
        <StatCard icon={BookOpen} label={t("dashboard.totalBooks")} value={stats?.total_books ?? 0} color="indigo" />
        <StatCard icon={FileText} label={t("dashboard.totalChapters")} value={stats?.total_records ?? 0} color="emerald" />
        <StatCard icon={BarChart3} label={t("dashboard.totalTerms")} value={stats?.records_with_zh ?? 0} color="sky" />
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
  const totalChapters = book.chapters_ko.length;
  const withSource = book.chapters_zh.filter((c) => c && c !== "").length;
  const progress = totalChapters > 0 ? Math.round((withSource / totalChapters) * 100) : 0;

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
      </div>
    </div>
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
