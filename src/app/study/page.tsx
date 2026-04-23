"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, LibraryBig, Loader2 } from "lucide-react";
import { getBooks, getDatasets, getGlossary } from "@/lib/api";
import ParallelSyntaxView from "@/components/ParallelSyntaxView";
import type { BookInfo, DatasetRecord, GlossaryTerm } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

const sortBookRecords = (records: DatasetRecord[]) =>
  [...records].sort((a, b) => a.chapter_ko - b.chapter_ko);

const displayBookLabel = (book: BookInfo) =>
  book.book_ko?.trim() || book.book_zh?.trim() || book.book;

export default function StudyReviewPage() {
  const { t } = useLanguage();
  const [bookSummaries, setBookSummaries] = useState<BookInfo[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [readerBook, setReaderBook] = useState("");
  const [readerRecords, setReaderRecords] = useState<DatasetRecord[]>([]);
  const [readerIndex, setReaderIndex] = useState(0);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);

  const readerBooks = [...bookSummaries]
    .filter((bookSummary) => bookSummary.confirmed > 0)
    .sort((a, b) => a.book.localeCompare(b.book));
  const currentBookSummary =
    readerBooks.find((bookSummary) => bookSummary.book === readerBook) || null;
  const currentBookLabel = currentBookSummary ? displayBookLabel(currentBookSummary) : readerBook;
  const currentRecord = readerRecords[readerIndex] ?? null;
  const currentGlossaryHits = !currentRecord
    ? []
    : glossaryTerms
        .filter((term) => {
          const scopeBook = (term.book || term.domain || "").trim();
          if (scopeBook && scopeBook !== readerBook) return false;
          const zhText = currentRecord.zh_text || "";
          const koText = currentRecord.ko_text_confirmed || currentRecord.ko_text || "";
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
        .slice(0, 12);

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
        setBooksError(err instanceof Error ? err.message : t("reader.loadError"));
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

    void getDatasets(readerBook, undefined, undefined, { bookExact: true, status: "confirmed" })
      .then((records) => {
        if (!active) return;
        setReaderRecords(sortBookRecords(records));
        setReaderIndex(0);
      })
      .catch((err) => {
        if (!active) return;
        setReaderRecords([]);
        setReaderError(err instanceof Error ? err.message : t("reader.loadError"));
      })
      .finally(() => {
        if (!active) return;
        setReaderLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readerBook, t]);

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
        setGlossaryError(
          err instanceof Error ? err.message : t("reader.glossaryLoadError")
        );
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
              <LibraryBig className="w-5 h-5 text-white" />
            </div>
            {t("reader.title")}
          </h1>
          <p className="text-slate-400 mt-1">{t("reader.subtitle")}</p>
        </div>
        <Link
          href="/reader"
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200 transition-colors hover:bg-indigo-500/20 hover:text-white"
        >
          <BookOpen className="w-4 h-4" />
          {t("nav.reader")}
        </Link>
      </div>

      {booksError && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
          {booksError}
        </div>
      )}

      {booksLoading ? (
        <div className="glass-card p-8 flex items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("reader.loading")}
        </div>
      ) : readerBooks.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300">{t("reader.emptyTitle")}</p>
          <p className="text-sm text-slate-500 mt-2">{t("reader.emptySubtitle")}</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
          <div className="glass-card p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs text-slate-500">{t("reader.book")}</label>
                <div className="relative mt-1">
                  <select
                    value={readerBook}
                    onChange={(e) => {
                      setReaderBook(e.target.value);
                      setReaderIndex(0);
                    }}
                    className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                  >
                    {readerBooks.map((bookSummary) => (
                      <option key={bookSummary.book} value={bookSummary.book}>
                        {displayBookLabel(bookSummary)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">{t("reader.chapter")}</label>
                <div className="relative mt-1">
                  <select
                    value={currentRecord?.id || ""}
                    onChange={(e) => {
                      const nextIndex = readerRecords.findIndex((record) => record.id === e.target.value);
                      if (nextIndex >= 0) setReaderIndex(nextIndex);
                    }}
                    className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-emerald-500/50 cursor-pointer"
                    disabled={readerRecords.length === 0}
                  >
                    {readerRecords.map((record) => (
                      <option key={record.id} value={record.id}>
                        {t("reader.chapter")} {record.chapter_ko}
                        {record.chapter_title_zh ? ` · ${record.chapter_title_zh}` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {readerLoading ? (
              <div className="rounded-xl border border-surface-border bg-surface/70 p-8 flex items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("reader.loading")}
              </div>
            ) : readerError ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                {readerError}
              </div>
            ) : currentRecord ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-semibold">{currentBookLabel}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">
                    {t("reader.chapter")} {currentRecord.chapter_ko}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-lighter text-slate-400 text-xs border border-surface-border">
                    {readerIndex + 1} / {readerRecords.length}
                  </span>
                  {currentRecord.chapter_title_zh && (
                    <span className="text-sm text-slate-400">{currentRecord.chapter_title_zh}</span>
                  )}
                </div>

                <ParallelSyntaxView
                  sourceText={currentRecord.zh_text || ""}
                  translationText={currentRecord.ko_text_confirmed || currentRecord.ko_text || ""}
                  sentenceRows={currentRecord.alignment_rows || []}
                  sourceLabel="ZH"
                  translationLabel={t("reader.confirmedText")}
                  title={t("reader.syntaxStudyTitle")}
                  hint={t("reader.syntaxStudySubtitle")}
                  maxHeightClassName="max-h-[620px]"
                  compact
                  allowAiAlignment
                />

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
                    className="px-4 py-2 rounded-lg bg-emerald-600/80 text-sm text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("reader.next")}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-surface-border bg-surface/70 p-8 text-center text-slate-400">
                {t("reader.noConfirmedRows")}
              </div>
            )}
          </div>

          <div className="glass-card p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{t("reader.glossaryTitle")}</h3>
              <p className="text-xs text-slate-500 mt-1">{t("reader.glossarySubtitle")}</p>
            </div>

            {currentBookSummary && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-surface-border bg-surface/70 p-3">
                  <p className="text-xs text-slate-500">{t("dashboard.confirmed")}</p>
                  <p className="mt-2 text-xl font-semibold text-white">{currentBookSummary.confirmed}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface/70 p-3">
                  <p className="text-xs text-slate-500">{t("upload.sourceCoverage")}</p>
                  <p className="mt-2 text-xl font-semibold text-emerald-300">
                    {currentBookSummary.source_coverage_percent}%
                  </p>
                </div>
              </div>
            )}

            {glossaryError && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                {glossaryError}
              </div>
            )}

            {currentGlossaryHits.length === 0 ? (
              <p className="text-sm text-slate-500">{t("reader.glossaryEmpty")}</p>
            ) : (
              <div className="space-y-3">
                {currentGlossaryHits.map((term) => {
                  const scopeBook = (term.book || term.domain || "").trim();
                  const isBookScope = scopeBook === readerBook;
                  const displayRendering = (term.term_ko || "").trim();
                  const displayMeaning = (term.term_meaning_ko || displayRendering || t("glossary.meaningMissing")).trim();
                  return (
                    <div
                      key={`${term.term_zh}:${scopeBook || "global"}`}
                      className="rounded-xl border border-surface-border bg-surface/70 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{term.term_zh}</span>
                        <span className="text-slate-500">→</span>
                        <span className="text-emerald-300">{displayRendering || displayMeaning}</span>
                        <span
                          className={`ml-auto px-2 py-0.5 rounded-full text-[11px] border ${
                            isBookScope
                              ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                              : "bg-slate-500/10 text-slate-300 border-slate-500/20"
                          }`}
                        >
                          {isBookScope ? t("glossary.scopeBook") : t("glossary.scopeGlobal")}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-400">
                        {term.policy && <span>{term.policy}</span>}
                        {term.pos && <span>· {term.pos}</span>}
                        {scopeBook && <span>· {scopeBook}</span>}
                      </div>
                      {displayMeaning && displayMeaning !== (displayRendering || displayMeaning) && (
                        <p className="text-xs text-slate-300 mt-2">
                          {t("glossary.meaning")} · {displayMeaning}
                        </p>
                      )}
                      {term.notes && (
                        <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">{term.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
