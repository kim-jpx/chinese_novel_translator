"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  LibraryBig,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
} from "lucide-react";
import { getBooks, getDatasets, getGlossary } from "@/lib/api";
import type { BookInfo, DatasetRecord, GlossaryTerm } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

const sortBookRecords = (records: DatasetRecord[]) =>
  [...records].sort((a, b) => a.chapter_ko - b.chapter_ko);

const displayBookLabel = (book: BookInfo) =>
  book.book_ko?.trim() || book.book_zh?.trim() || book.book;

const hasReadableText = (record: DatasetRecord, mode: "confirmed" | "draft") => {
  const translation = mode === "confirmed"
    ? (record.ko_text_confirmed || record.ko_text || "")
    : (record.ko_text || record.ko_text_confirmed || "");
  return !!translation.trim();
};

export default function ReadingPage() {
  const { t } = useLanguage();
  const [bookSummaries, setBookSummaries] = useState<BookInfo[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [readingMode, setReadingMode] = useState<"confirmed" | "draft">("confirmed");
  const [readerBook, setReaderBook] = useState("");
  const [readerRecords, setReaderRecords] = useState<DatasetRecord[]>([]);
  const [readerIndex, setReaderIndex] = useState(0);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);
  const [chapterPanelOpen, setChapterPanelOpen] = useState(false);

  const readerBooks = useMemo(
    () => [...bookSummaries]
      .filter((bookSummary) => (
        readingMode === "confirmed"
          ? bookSummary.confirmed > 0
          : bookSummary.draft > 0
      ))
      .sort((a, b) => a.book.localeCompare(b.book)),
    [bookSummaries, readingMode],
  );
  const currentBookSummary =
    readerBooks.find((bookSummary) => bookSummary.book === readerBook) || null;
  const currentBookLabel = currentBookSummary ? displayBookLabel(currentBookSummary) : readerBook;
  const currentRecord = readerRecords[readerIndex] ?? null;
  const currentTranslation = (
    readingMode === "confirmed"
      ? (currentRecord?.ko_text_confirmed || currentRecord?.ko_text || "")
      : (currentRecord?.ko_text || currentRecord?.ko_text_confirmed || "")
  ).trim();
  const modeLabel = readingMode === "confirmed" ? t("reading.modeConfirmed") : t("reading.modeDraft");
  const modeHint = readingMode === "confirmed" ? t("reading.modeConfirmedHint") : t("reading.modeDraftHint");
  const emptyTitle = readingMode === "confirmed" ? t("reading.emptyTitle") : t("reading.emptyDraftTitle");
  const emptySubtitle = readingMode === "confirmed" ? t("reading.emptySubtitle") : t("reading.emptyDraftSubtitle");
  const selectedBatchLabel = currentRecord ? `${t("reader.chapter")} ${currentRecord.chapter_ko}` : "—";
  const currentGlossaryHits = !currentRecord
    ? []
    : glossaryTerms
        .filter((term) => {
          const scopeBook = (term.book || term.domain || "").trim();
          if (scopeBook && scopeBook !== readerBook) return false;
          const zhText = currentRecord.zh_text || "";
          const koText = readingMode === "confirmed"
            ? (currentRecord.ko_text_confirmed || currentRecord.ko_text || "")
            : (currentRecord.ko_text || currentRecord.ko_text_confirmed || "");
          return (
            (!!term.term_zh && zhText.includes(term.term_zh)) ||
            (!!term.term_ko && koText.includes(term.term_ko))
          );
        })
        .sort((a, b) => {
          const aBookPriority = (a.book || a.domain || "").trim() === readerBook ? 0 : 1;
          const bBookPriority = (b.book || b.domain || "").trim() === readerBook ? 0 : 1;
          if (aBookPriority !== bBookPriority) return aBookPriority - bBookPriority;
          return b.term_zh.length - a.term_zh.length;
        })
        .slice(0, 10);

  useEffect(() => {
    let active = true;
    setBooksLoading(true);
    setBooksError(null);

    void getBooks()
      .then((books) => {
        if (!active) return;
        setBookSummaries(books);
      })
      .catch((err) => {
        if (!active) return;
        setBookSummaries([]);
        setBooksError(err instanceof Error ? err.message : t("reading.loadError"));
      })
      .finally(() => {
        if (!active) return;
        setBooksLoading(false);
      });

    return () => {
      active = false;
    };
  }, [t]);

  useEffect(() => {
    if (readerBook && readerBooks.some((bookSummary) => bookSummary.book === readerBook)) {
      return;
    }
    setReaderBook(readerBooks[0]?.book ?? "");
    setReaderIndex(0);
  }, [readerBook, readerBooks]);

  useEffect(() => {
    if (!readerBook) {
      setReaderRecords([]);
      setReaderIndex(0);
      setReaderError(null);
      return;
    }

    let active = true;
    setReaderLoading(true);
    setReaderError(null);

    void getDatasets(readerBook, undefined, undefined, {
      bookExact: true,
      status: readingMode === "confirmed" ? "confirmed" : "draft",
    })
      .then((records) => {
        if (!active) return;
        setReaderRecords(
          sortBookRecords(records).filter((record) => hasReadableText(record, readingMode))
        );
        setReaderIndex(0);
      })
      .catch((err) => {
        if (!active) return;
        setReaderRecords([]);
        setReaderError(err instanceof Error ? err.message : t("reading.loadError"));
      })
      .finally(() => {
        if (!active) return;
        setReaderLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readerBook, readingMode, t]);

  useEffect(() => {
    if (!readerBook) {
      setGlossaryTerms([]);
      setGlossaryError(null);
      return;
    }

    let active = true;
    setGlossaryError(null);

    void getGlossary(readerBook)
      .then((terms) => {
        if (!active) return;
        setGlossaryTerms(terms);
      })
      .catch((err) => {
        if (!active) return;
        setGlossaryTerms([]);
        setGlossaryError(err instanceof Error ? err.message : t("reader.glossaryLoadError"));
      });

    return () => {
      active = false;
    };
  }, [readerBook, t]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-700 flex items-center justify-center">
              <LibraryBig className="w-5 h-5 text-white" />
            </div>
            {t("reading.title")}
          </h1>
          <p className="text-slate-400 mt-1">{t("reading.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/study"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100 transition-colors hover:bg-emerald-500/20 hover:text-white"
          >
            <BookOpen className="w-4 h-4" />
            {t("reading.openStudy")}
          </Link>
          <Link
            href="/reader/iphone"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20 hover:text-white"
          >
            <Smartphone className="w-4 h-4" />
            {t("reading.prototypeButton")}
          </Link>
        </div>
      </div>

      {booksError && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
          {booksError}
        </div>
      )}

      {booksLoading ? (
        <div className="glass-card p-8 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("reading.loading")}
        </div>
      ) : readerBooks.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300">{emptyTitle}</p>
          <p className="text-sm text-slate-500 mt-2">{emptySubtitle}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="glass-card p-4 md:p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="text-xs text-slate-500">{t("reader.book")}</label>
                <div className="relative mt-1">
                  <select
                    value={readerBook}
                    onChange={(e) => {
                      setReaderBook(e.target.value);
                      setReaderIndex(0);
                    }}
                    className="w-full rounded-xl border border-surface-border bg-surface px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-indigo-500/50 cursor-pointer"
                  >
                    {readerBooks.map((bookSummary) => (
                      <option key={bookSummary.book} value={bookSummary.book}>
                        {displayBookLabel(bookSummary)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              <div className="min-w-[240px]">
                <p className="text-xs text-slate-500">{t("reading.title")}</p>
                <div className="mt-1 flex items-center gap-1 rounded-2xl border border-surface-border bg-surface/70 p-1">
                  <button
                    type="button"
                    onClick={() => setReadingMode("confirmed")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      readingMode === "confirmed"
                        ? "bg-indigo-500/20 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {t("reading.modeConfirmed")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReadingMode("draft")}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      readingMode === "draft"
                        ? "bg-amber-500/20 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {t("reading.modeDraft")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">{modeHint}</p>
              </div>

              <div className="min-w-[180px] rounded-2xl border border-surface-border bg-surface/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("reading.currentChapter")}</p>
                <p className="mt-2 text-sm font-medium text-white">{selectedBatchLabel}</p>
                <p className="mt-1 text-xs text-slate-500">{currentRecord?.chapter_title_zh || currentRecord?.chapter_zh || currentBookLabel}</p>
              </div>

              <div className="min-w-[140px] rounded-2xl border border-surface-border bg-surface/70 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{t("reading.chapterCount")}</p>
                <p className="mt-2 text-sm font-medium text-white">{readerRecords.length}</p>
                <p className="mt-1 text-xs text-slate-500">{t("reading.chapterListHint")}</p>
              </div>

              <button
                type="button"
                onClick={() => setChapterPanelOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100 transition-colors hover:bg-indigo-500/20 hover:text-white"
              >
                {chapterPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
                {chapterPanelOpen ? t("reading.hideChapterList") : t("reading.showChapterList")}
              </button>
            </div>
          </div>

          <div className={`grid gap-5 ${chapterPanelOpen ? "xl:grid-cols-[minmax(240px,0.72fr)_minmax(0,1.95fr)_minmax(250px,0.68fr)]" : "xl:grid-cols-[minmax(0,2fr)_minmax(250px,0.68fr)]"}`}>
            {chapterPanelOpen && (
              <aside className="glass-card p-5">
                <div className="flex items-start justify-between gap-3 border-b border-surface-border pb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{t("reading.chapterList")}</h3>
                    <p className="mt-1 text-xs text-slate-500">{t("reading.chapterListHint")}</p>
                  </div>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] text-indigo-200">
                    {readerRecords.length}
                  </span>
                </div>

                <div className="mt-4 max-h-[72vh] space-y-2 overflow-auto pr-1">
                  {readerRecords.map((record, index) => {
                    const active = record.id === currentRecord?.id;
                    return (
                      <button
                        key={record.id}
                        type="button"
                        onClick={() => setReaderIndex(index)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                          active
                            ? "border-indigo-500/30 bg-indigo-500/15 shadow-[0_0_0_1px_rgba(99,102,241,0.14)]"
                            : "border-surface-border bg-surface/70 hover:bg-surface-lighter/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-white">
                            {t("reader.chapter")} {record.chapter_ko}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? "bg-indigo-500/20 text-indigo-100" : "bg-surface-lighter text-slate-500"}`}>
                            {index + 1}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                          {record.chapter_title_zh || record.chapter_zh || currentBookLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}

          <main className="glass-card overflow-hidden">
            {readerLoading ? (
              <div className="p-8 flex items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("reading.loading")}
              </div>
            ) : readerError ? (
              <div className="p-6 text-sm text-amber-300">{readerError}</div>
            ) : currentRecord ? (
              <div className="space-y-6 p-6 md:p-8">
                <div className="border-b border-surface-border pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white font-semibold">{currentBookLabel}</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-200 text-xs border border-indigo-500/20">
                      {t("reader.chapter")} {currentRecord.chapter_ko}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${
                      readingMode === "confirmed"
                        ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-200 border-amber-500/20"
                    }`}>
                      {modeLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-surface-lighter text-slate-400 text-xs border border-surface-border">
                      {readerIndex + 1} / {readerRecords.length}
                    </span>
                  </div>
                  {currentRecord.chapter_title_zh && (
                    <h2 className="mt-3 text-2xl font-semibold text-white">{currentRecord.chapter_title_zh}</h2>
                  )}
                  <p className="mt-3 text-xs text-slate-500">
                    {t("reading.readerHint")} {modeHint}
                  </p>
                </div>

                <article className="mx-auto w-full max-w-4xl">
                  <div className="rounded-[32px] border border-white/5 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] px-6 py-8 md:px-12 md:py-14">
                    <p className="whitespace-pre-wrap text-[17px] leading-[2.2] tracking-[0.005em] text-slate-100 md:text-[19px]">
                      {currentTranslation || "—"}
                    </p>
                  </div>
                </article>

                {currentRecord.review_note && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <p className="text-xs font-medium text-amber-200 mb-2">{t("upload.reviewNote")}</p>
                    <p className="text-sm text-amber-100 whitespace-pre-wrap">
                      {currentRecord.review_note}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap justify-between gap-3 pt-2">
                  <button
                    onClick={() => setReaderIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={readerIndex === 0}
                    className="px-4 py-2 rounded-lg bg-surface-light border border-surface-border text-sm text-slate-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("reader.previous")}
                  </button>
                  <button
                    onClick={() => setReaderIndex((prev) => Math.min(prev + 1, readerRecords.length - 1))}
                    disabled={readerIndex >= readerRecords.length - 1}
                    className="px-4 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("reader.next")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                {t("reader.noConfirmedRows")}
              </div>
            )}
          </main>

          <aside className="glass-card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{t("reading.glossaryTitle")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("reading.glossarySubtitle")}</p>
            </div>

            {glossaryError && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                {glossaryError}
              </div>
            )}

            {currentGlossaryHits.length === 0 ? (
              <p className="text-sm text-slate-500">{t("reading.glossaryEmpty")}</p>
            ) : (
              <div className="space-y-3">
                {currentGlossaryHits.map((term) => {
                  const displayRendering = (term.term_ko || "").trim();
                  const displayMeaning = (term.term_meaning_ko || displayRendering || t("glossary.meaningMissing")).trim();
                  return (
                    <div
                      key={`${term.term_zh}:${term.book || term.domain || "global"}`}
                      className="rounded-xl border border-surface-border bg-surface/70 p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{term.term_zh}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-300">{displayRendering || displayMeaning}</span>
                      </div>
                      {displayMeaning && displayMeaning !== (displayRendering || displayMeaning) && (
                        <p className="mt-2 text-xs text-slate-300">
                          {t("glossary.meaning")} · {displayMeaning}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
        </div>
        </div>
      )}
    </div>
  );
}
