"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  LibraryBig,
  List,
  Loader2,
  Smartphone,
} from "lucide-react";
import { getBooks, getDatasets, getGlossary } from "@/lib/api";
import type { BookInfo, DatasetRecord, GlossaryTerm } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

type PrototypeTab = "reading" | "chapters" | "glossary";

const sortBookRecords = (records: DatasetRecord[]) =>
  [...records].sort((a, b) => a.chapter_ko - b.chapter_ko);

const displayBookLabel = (book: BookInfo) =>
  book.book_ko?.trim() || book.book_zh?.trim() || book.book;

export default function IPhoneReaderPrototypePage() {
  const { t } = useLanguage();
  const [bookSummaries, setBookSummaries] = useState<BookInfo[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [readerBook, setReaderBook] = useState("");
  const [bookRecords, setBookRecords] = useState<DatasetRecord[]>([]);
  const [readerIndex, setReaderIndex] = useState(0);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>([]);
  const [glossaryError, setGlossaryError] = useState<string | null>(null);
  const [tab, setTab] = useState<PrototypeTab>("reading");

  const readerBooks = [...bookSummaries]
    .filter((bookSummary) => bookSummary.confirmed > 0)
    .sort((a, b) => a.book.localeCompare(b.book));
  const currentBookSummary =
    readerBooks.find((bookSummary) => bookSummary.book === readerBook) || null;
  const readerRecords = sortBookRecords(
    bookRecords.filter((record) => !!record.ko_text_confirmed?.trim() || !!record.ko_text?.trim())
  );
  const currentRecord = readerRecords[readerIndex] ?? null;
  const currentBookLabel = currentBookSummary ? displayBookLabel(currentBookSummary) : readerBook;
  const currentTranslation = currentRecord?.ko_text_confirmed || currentRecord?.ko_text || "—";
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
      setBookRecords([]);
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
        setBookRecords(records);
        setReaderIndex(0);
      })
      .catch((err) => {
        if (!active) return;
        setBookRecords([]);
        setReaderError(err instanceof Error ? err.message : t("reading.loadError"));
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

  const tabs: { id: PrototypeTab; label: string }[] = [
    { id: "reading", label: t("reading.prototypeReadingTab") },
    { id: "chapters", label: t("reading.prototypeChaptersTab") },
    { id: "glossary", label: t("reading.prototypeGlossaryTab") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Smartphone className="h-3.5 w-3.5" />
            {t("reading.prototypeBadge")}
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white">{t("reading.prototypeTitle")}</h1>
          <p className="mt-1 text-slate-400">{t("reading.prototypeSubtitle")}</p>
        </div>
        <Link
          href="/reader"
          className="inline-flex items-center gap-2 rounded-xl border border-surface-border bg-surface-light/70 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-surface-lighter/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("reading.openPrototypeBack")}
        </Link>
      </div>

      {booksError && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
          {booksError}
        </div>
      )}

      {booksLoading ? (
        <div className="glass-card flex items-center justify-center gap-3 p-8 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("reading.loading")}
        </div>
      ) : readerBooks.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <LibraryBig className="mx-auto mb-3 h-12 w-12 text-slate-600" />
          <p className="text-slate-200">{t("reading.prototypeEmpty")}</p>
          <p className="mt-2 text-sm text-slate-500">{t("reading.prototypeEmptySubtitle")}</p>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="w-full max-w-[460px]">
            <p className="mb-3 text-center text-xs uppercase tracking-[0.35em] text-slate-500">
              {t("reader.prototypePhoneHint")}
            </p>
            <div className="rounded-[2.75rem] border border-white/10 bg-[#070a14] p-2 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              <div className="overflow-hidden rounded-[2.1rem] border border-white/5 bg-gradient-to-b from-[#141a30] via-[#0c1224] to-[#090d18]">
                <div className="flex items-center justify-between px-6 pt-4 text-[11px] font-medium text-slate-400">
                  <span>9:41</span>
                  <div className="h-1.5 w-24 rounded-full bg-white/10" />
                  <span>100%</span>
                </div>

                <div className="space-y-4 px-4 pb-5 pt-4">
                  <div className="rounded-[1.75rem] border border-white/5 bg-white/5 p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                          {currentBookLabel}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">
                          {currentRecord ? `${t("reader.chapter")} ${currentRecord.chapter_ko}` : "—"}
                        </h2>
                        {currentRecord?.chapter_title_zh && (
                          <p className="mt-1 text-sm text-slate-400">{currentRecord.chapter_title_zh}</p>
                        )}
                      </div>
                      <div className="space-y-2 text-right">
                        <span
                          className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300"
                        >
                          {t("reader.prototypeConfirmed")}
                        </span>
                        <p className="text-xs text-slate-500">
                          {readerRecords.length > 0 ? `${readerIndex + 1} / ${readerRecords.length}` : "0 / 0"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="relative">
                        <select
                          value={readerBook}
                          onChange={(e) => {
                            setReaderBook(e.target.value);
                            setReaderIndex(0);
                          }}
                          className="w-full appearance-none rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-white focus:border-indigo-400/40 focus:outline-none"
                        >
                          {readerBooks.map((bookSummary) => (
                            <option key={bookSummary.book} value={bookSummary.book}>
                              {displayBookLabel(bookSummary)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      </div>
                      <button
                        onClick={() => setTab("chapters")}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-white/10"
                      >
                        <List className="h-4 w-4" />
                        {t("reading.prototypeChapterList")}
                      </button>
                    </div>

                  </div>

                  <div className="grid grid-cols-3 gap-1.5 rounded-[1.4rem] border border-white/5 bg-black/15 p-1.5">
                    {tabs.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        className={`rounded-[1.1rem] px-2 py-2 text-[11px] font-medium transition-colors ${
                          tab === item.id
                            ? "bg-white text-slate-950"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <div className="min-h-[540px] rounded-[1.75rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-5 py-6">
                    {readerLoading ? (
                      <div className="flex min-h-[500px] items-center justify-center gap-3 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("reading.loading")}
                      </div>
                    ) : readerError ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        {readerError}
                      </div>
                    ) : !currentRecord ? (
                      <div className="flex min-h-[500px] flex-col items-center justify-center text-center">
                        <BookOpen className="mb-4 h-10 w-10 text-slate-600" />
                        <p className="text-slate-200">{t("reading.prototypeEmpty")}</p>
                      </div>
                    ) : tab === "reading" ? (
                      <div className="space-y-5">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-emerald-300">
                          <LibraryBig className="h-3.5 w-3.5" />
                          {t("reader.confirmedText")}
                        </div>
                        <p className="whitespace-pre-wrap text-[17px] leading-8 text-slate-100">
                          {currentTranslation}
                        </p>
                        {currentRecord.review_note && (
                          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                            <p className="text-xs font-medium text-amber-200">{t("upload.reviewNote")}</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-100">
                              {currentRecord.review_note}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : tab === "chapters" ? (
                      <div className="space-y-3">
                        {readerRecords.map((record, index) => {
                          const isActive = record.id === currentRecord.id;
                          return (
                            <button
                              key={record.id}
                              onClick={() => setReaderIndex(index)}
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                                isActive
                                  ? "border-indigo-500/30 bg-indigo-500/15"
                                  : "border-white/5 bg-black/10 hover:bg-white/5"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    {t("reader.chapter")} {record.chapter_ko}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {record.chapter_title_zh || record.chapter_zh}
                                  </p>
                                </div>
                                <span className="text-xs text-slate-500">
                                  {t("reader.prototypeConfirmed")}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : glossaryError ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        {glossaryError}
                      </div>
                    ) : currentGlossaryHits.length === 0 ? (
                      <div className="flex min-h-[500px] flex-col items-center justify-center text-center">
                        <LibraryBig className="mb-4 h-10 w-10 text-slate-600" />
                        <p className="text-slate-300">{t("reading.prototypeNoGlossary")}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {currentGlossaryHits.map((term) => (
                          <div
                            key={`${term.term_zh}:${term.book || term.domain || "global"}`}
                            className="rounded-2xl border border-white/5 bg-black/10 p-4"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-white">{term.term_zh}</span>
                              <span className="text-slate-500">→</span>
                              <span className="text-sm text-emerald-300">
                                {term.term_ko || term.term_meaning_ko || t("glossary.meaningMissing")}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              {term.policy && <span>{term.policy}</span>}
                              {term.pos && <span>· {term.pos}</span>}
                              {(term.book || term.domain) && <span>· {term.book || term.domain}</span>}
                            </div>
                            {term.term_meaning_ko && term.term_meaning_ko !== term.term_ko && (
                              <p className="mt-2 text-xs leading-5 text-slate-300">
                                {t("glossary.meaning")} · {term.term_meaning_ko}
                              </p>
                            )}
                            {term.notes && (
                              <p className="mt-2 text-xs leading-5 text-slate-400">{term.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setReaderIndex((prev) => Math.max(prev - 1, 0))}
                      disabled={readerIndex === 0}
                      className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("reader.previous")}
                    </button>
                    <button
                      onClick={() =>
                        setReaderIndex((prev) => Math.min(prev + 1, readerRecords.length - 1))
                      }
                      disabled={readerIndex >= readerRecords.length - 1}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-950 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("reader.next")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {currentBookSummary && (
              <div className="mt-4 grid grid-cols-2 gap-3 px-3">
                <div className="rounded-2xl border border-surface-border bg-surface/70 p-4 text-center">
                  <p className="text-xs text-slate-500">{t("dashboard.confirmed")}</p>
                  <p className="mt-2 text-xl font-semibold text-white">{currentBookSummary.confirmed}</p>
                </div>
                <div className="rounded-2xl border border-surface-border bg-surface/70 p-4 text-center">
                  <p className="text-xs text-slate-500">{t("upload.sourceCoverage")}</p>
                  <p className="mt-2 text-xl font-semibold text-white">
                    {currentBookSummary.source_coverage_percent}%
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
