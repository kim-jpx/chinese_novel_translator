"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BookOpen,
  Filter,
  RotateCcw,
  Check,
  ChevronDown,
  Edit3,
  Save,
  X,
  Search,
  Layers,
  LibraryBig,
} from "lucide-react";
import { getGlossary, getGlossaryBooks, getGlossaryExamples, updateGlossaryTerm } from "@/lib/api";
import type { GlossaryTerm, GlossaryExample } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

type FilterType = "book" | "pos" | "policy" | "unknown";
type GlossaryViewMode = "cards" | "list";

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [books, setBooks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownSet, setKnownSet] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<FilterType | null>(null);
  const [filterValue, setFilterValue] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<GlossaryTerm>>({});
  const [viewMode, setViewMode] = useState<GlossaryViewMode>("cards");
  const [activeBatchKey, setActiveBatchKey] = useState("");
  const [listEditingKey, setListEditingKey] = useState<string | null>(null);
  const [listEditData, setListEditData] = useState<Partial<GlossaryTerm>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [examplesByKey, setExamplesByKey] = useState<Record<string, GlossaryExample[]>>({});
  const [examplesLoadingKey, setExamplesLoadingKey] = useState<string | null>(null);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const termKey = (term: GlossaryTerm) => `${term.term_zh}::${term.book || term.domain || "global"}`;
  const termScope = (term: GlossaryTerm) => (term.book || term.domain ? "book" : "global");
  const batchKey = (term: GlossaryTerm) => `${term.book || term.domain || "global"}::${term.source_chapter ?? "misc"}`;
  const batchLabel = (term: GlossaryTerm) => {
    const scope = term.book || term.domain || t("glossary.batchUnknown");
    if (term.source_chapter !== undefined && term.source_chapter !== null) {
      return `${scope} · ${t("reader.chapter")} ${term.source_chapter}`;
    }
    return scope;
  };

  useEffect(() => {
    async function load() {
      const [termsResult, booksResult] = await Promise.allSettled([
        getGlossary(),
        getGlossaryBooks(),
      ]);

      const failures: string[] = [];

      if (termsResult.status === "fulfilled") {
        setTerms(termsResult.value);
      } else {
        failures.push(
          termsResult.reason instanceof Error
            ? termsResult.reason.message
            : t("glossary.loadError")
        );
      }

      if (booksResult.status === "fulfilled") {
        setBooks(booksResult.value);
      } else {
        failures.push(
          booksResult.reason instanceof Error
            ? booksResult.reason.message
            : t("glossary.loadError")
        );
      }

      setError(failures.length > 0 ? failures.join(" / ") : null);
      setLoading(false);
    }
    void load();
  }, [t]);

  const batchOptions = Array.from(
    terms.reduce((map, term) => {
      const key = batchKey(term);
      const timestamp = Date.parse(term.added_at || "") || 0;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { key, label: batchLabel(term), latest: timestamp, count: 1 });
      } else {
        existing.latest = Math.max(existing.latest, timestamp);
        existing.count += 1;
      }
      return map;
    }, new Map<string, { key: string; label: string; latest: number; count: number }>())
      .values()
  ).sort((a, b) => b.latest - a.latest || a.label.localeCompare(b.label));
  const activeBatchOption = batchOptions.find((option) => option.key === activeBatchKey) ?? null;

  useEffect(() => {
    if (activeBatchKey && (activeBatchKey === "all" || batchOptions.some((option) => option.key === activeBatchKey))) return;
    setActiveBatchKey(batchOptions[0]?.key || "all");
  }, [activeBatchKey, batchOptions]);

  const filteredTerms = terms
    .filter((term) => {
      if (activeBatchKey !== "all" && batchKey(term) !== activeBatchKey) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !term.term_zh.toLowerCase().includes(q)
          && !term.term_ko.toLowerCase().includes(q)
          && !(term.term_meaning_ko || "").toLowerCase().includes(q)
          && !(term.book || term.domain || "").toLowerCase().includes(q)
        ) return false;
      }
      if (onlyUnknown && knownSet.has(termKey(term))) return false;
      if (filterType === "book" && filterValue) {
        const belongsToBook = term.book === filterValue || term.domain === filterValue;
        const isGlobal = !(term.book || term.domain);
        if (!belongsToBook && !isGlobal) return false;
      }
      if (filterType === "pos" && filterValue && term.pos !== filterValue) return false;
      if (filterType === "policy" && filterValue && term.policy !== filterValue) return false;
      return true;
    })
    .sort((a, b) => {
      if (filterType === "book" && filterValue) {
        const aSpecific = a.book === filterValue || a.domain === filterValue;
        const bSpecific = b.book === filterValue || b.domain === filterValue;
        if (aSpecific !== bSpecific) return aSpecific ? -1 : 1;
      }
      const aScope = termScope(a);
      const bScope = termScope(b);
      if (aScope !== bScope) return aScope === "book" ? -1 : 1;
      if ((a.book || a.domain) !== (b.book || b.domain)) {
        return (a.book || a.domain || "").localeCompare(b.book || b.domain || "");
      }
      return a.term_zh.localeCompare(b.term_zh);
    });

  useEffect(() => {
    if (filteredTerms.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((prev) => Math.min(prev, filteredTerms.length - 1));
  }, [filteredTerms.length]);

  const currentTerm = filteredTerms[currentIndex];
  const progress = filteredTerms.length > 0 ? Math.round((knownSet.size / filteredTerms.length) * 100) : 0;
  const currentExamples = currentTerm ? examplesByKey[termKey(currentTerm)] ?? [] : [];
  const currentMeaning = currentTerm?.term_meaning_ko?.trim() || currentTerm?.term_ko?.trim() || t("glossary.meaningMissing");
  const currentMeaningMissing = !(currentTerm?.term_meaning_ko?.trim() || currentTerm?.term_ko?.trim());
  const currentRendering = currentTerm?.term_ko?.trim() || "";

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editing) return;
    if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
    if (e.code === "ArrowRight" || e.code === "KeyL") { setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); }
    if (e.code === "ArrowLeft" || e.code === "KeyH") { setFlipped(false); setCurrentIndex((i) => Math.max(i - 1, 0)); }
    if (e.code === "KeyK" && currentTerm) { setKnownSet((prev) => new Set(prev).add(termKey(currentTerm))); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); }
  }, [currentTerm, filteredTerms.length, editing]);

  useEffect(() => { window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

  const markKnown = () => { if (!currentTerm) return; setKnownSet((prev) => new Set(prev).add(termKey(currentTerm))); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); };
  const markReview = () => { if (!currentTerm) return; setKnownSet((prev) => { const next = new Set(prev); next.delete(termKey(currentTerm)); return next; }); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); };

  const persistTermEdit = async (baseTerm: GlossaryTerm, patch: Partial<GlossaryTerm>) => {
    const currentKey = termKey(baseTerm);
    const fullTerm = {
      ...baseTerm,
      ...patch,
      book: patch.book ?? baseTerm.book,
      domain: patch.domain ?? patch.book ?? baseTerm.domain,
    };
    await updateGlossaryTerm(baseTerm.term_zh, fullTerm);
    const nextKey = termKey(fullTerm);
    setTerms((prev) => prev.map((t2) => termKey(t2) === currentKey ? fullTerm : t2));
    setKnownSet((prev) => {
      if (!prev.has(currentKey) || currentKey === nextKey) return prev;
      const next = new Set(prev);
      next.delete(currentKey);
      next.add(nextKey);
      return next;
    });
    setExamplesByKey((prev) => {
      if (!(currentKey in prev) || currentKey === nextKey) return prev;
      const next = { ...prev, [nextKey]: prev[currentKey] };
      delete next[currentKey];
      return next;
    });
    return fullTerm;
  };

  const saveEdit = async () => {
    if (!currentTerm) return;
    try {
      await persistTermEdit(currentTerm, editData);
      setEditing(false);
      setEditData({});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("glossary.saveError"));
    }
  };

  const posValues = Array.from(new Set(terms.map((t2) => t2.pos).filter((v): v is string => !!v)));
  const policyValues = Array.from(new Set(terms.map((t2) => t2.policy).filter((v): v is string => !!v)));
  const formatBatchTime = (value?: string) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  };
  const startListEdit = (term: GlossaryTerm) => {
    setListEditingKey(termKey(term));
    setListEditData({
      term_ko: term.term_ko,
      term_meaning_ko: term.term_meaning_ko,
      book: term.book,
      domain: term.domain,
      policy: term.policy,
      pos: term.pos,
      notes: term.notes,
    });
  };
  const saveListEdit = async (term: GlossaryTerm) => {
    try {
      await persistTermEdit(term, listEditData);
      setListEditingKey(null);
      setListEditData({});
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("glossary.saveError"));
    }
  };

  useEffect(() => {
    if (!currentTerm) return;
    const key = termKey(currentTerm);
    if (examplesByKey[key]) return;

    let active = true;
    const scopedBook = currentTerm.book || currentTerm.domain || (filterType === "book" ? filterValue : "");
    setExamplesLoadingKey(key);
    setExamplesError(null);
    void getGlossaryExamples(currentTerm.term_zh, scopedBook || undefined).then(
      (examples) => {
        if (!active) return;
        setExamplesByKey((prev) => ({ ...prev, [key]: examples }));
        setExamplesLoadingKey(null);
      },
      (err) => {
        if (!active) return;
        setExamplesError(err instanceof Error ? err.message : t("glossary.examplesLoadError"));
        setExamplesLoadingKey(null);
      }
    );
    return () => {
      active = false;
    };
  }, [currentTerm, examplesByKey, filterType, filterValue, t]);

  if (loading) return <GlossarySkeleton />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("glossary.title")}</h1>
          <p className="text-slate-400 mt-1">{t("glossary.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input type="text" placeholder={t("glossary.search")} value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentIndex(0); setFlipped(false); }}
              className="pl-10 pr-4 py-2 bg-surface-light border border-surface-border rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 w-64" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${showFilters ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20" : "bg-surface-light border border-surface-border text-slate-400 hover:text-white"}`}>
            <Filter className="w-4 h-4" /> {t("glossary.filter")}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-card border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {showFilters && (
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-center">
            <FilterDropdown label={t("glossary.byBook")} active={filterType === "book"} value={filterValue} options={books}
              onSelect={(v) => { setFilterType("book"); setFilterValue(v); setCurrentIndex(0); }} onClear={() => { setFilterType(null); setFilterValue(""); }} clearLabel={t("glossary.clearFilter")} />
            <FilterDropdown label={t("glossary.byPos")} active={filterType === "pos"} value={filterValue} options={posValues}
              onSelect={(v) => { setFilterType("pos"); setFilterValue(v); setCurrentIndex(0); }} onClear={() => { setFilterType(null); setFilterValue(""); }} clearLabel={t("glossary.clearFilter")} />
            <FilterDropdown label={t("glossary.byPolicy")} active={filterType === "policy"} value={filterValue} options={policyValues}
              onSelect={(v) => { setFilterType("policy"); setFilterValue(v); setCurrentIndex(0); }} onClear={() => { setFilterType(null); setFilterValue(""); }} clearLabel={t("glossary.clearFilter")} />
            <button onClick={() => { setOnlyUnknown(!onlyUnknown); setCurrentIndex(0); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${onlyUnknown ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-surface-lighter border border-surface-border text-slate-400 hover:text-white"}`}>
              {t("glossary.unknownOnly")}
            </button>
          </div>
          {filterType === "book" && filterValue && (
            <p className="mt-3 text-xs text-slate-500">{t("glossary.globalIncluded")}</p>
          )}
        </div>
      )}

      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <p className="text-xs text-slate-500">{t("glossary.recentBatch")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1 max-w-[420px]">
                <select
                  value={activeBatchKey}
                  onChange={(e) => {
                    setActiveBatchKey(e.target.value);
                    setCurrentIndex(0);
                  }}
                  className="w-full appearance-none rounded-xl border border-surface-border bg-surface-light px-4 py-3 pr-10 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="all">{t("glossary.allBatches")}</option>
                  {batchOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} · {option.count}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
                {activeBatchKey === "all"
                  ? t("glossary.allBatches")
                  : activeBatchOption
                    ? `${activeBatchOption.count}${t("glossary.batchTermCount")}`
                    : "—"}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">{t("glossary.batchSelectHint")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface/70 p-1">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "cards"
                  ? "bg-indigo-500/20 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t("glossary.viewCards")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-indigo-500/20 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t("glossary.viewList")}
            </button>
          </div>
        </div>

        {viewMode === "cards" ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400"><Layers className="w-4 h-4 inline mr-1" />{filteredTerms.length > 0 ? currentIndex + 1 : 0} / {filteredTerms.length}{t("glossary.cards")}</span>
              <span className="text-sm font-semibold text-indigo-300">{t("glossary.learned")} {knownSet.size}개 ({progress}%)</span>
            </div>
            <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("glossary.listHint")}</p>
        )}
      </div>

      {viewMode === "list" ? (
        <div className="glass-card overflow-hidden">
          {filteredTerms.length === 0 ? (
            <div className="p-8 text-center text-slate-400">{t("glossary.listEmpty")}</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-surface-border text-sm">
                <thead className="bg-surface-light/70 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-left">{t("glossary.listTermZh")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.listTermKo")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.listMeaning")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.listBatch")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.policy")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.pos")}</th>
                    <th className="px-3 py-3 text-left">{t("glossary.listAddedAt")}</th>
                    <th className="px-3 py-3 text-right">{t("glossary.listActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/70">
                  {filteredTerms.map((term) => {
                    const key = termKey(term);
                    const editingRow = listEditingKey === key;
                    return (
                      <tr
                        key={key}
                        className="bg-surface/40 hover:bg-surface-lighter/40"
                        onClick={() => {
                          const nextIndex = filteredTerms.findIndex((item) => termKey(item) === key);
                          if (nextIndex >= 0) setCurrentIndex(nextIndex);
                        }}
                      >
                        <td className="px-3 py-3 align-top font-medium text-white">{term.term_zh}</td>
                        <td className="px-3 py-3 align-top">
                          {editingRow ? (
                            <input
                              value={listEditData.term_ko ?? ""}
                              onChange={(e) => setListEditData((prev) => ({ ...prev, term_ko: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg border border-surface-border bg-surface-light px-2 py-1.5 text-white"
                            />
                          ) : (
                            <span className="text-slate-200">{term.term_ko || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {editingRow ? (
                            <input
                              value={listEditData.term_meaning_ko ?? ""}
                              onChange={(e) => setListEditData((prev) => ({ ...prev, term_meaning_ko: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg border border-surface-border bg-surface-light px-2 py-1.5 text-white"
                            />
                          ) : (
                            <span className="text-slate-200">{term.term_meaning_ko || term.term_ko || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-400">{batchLabel(term)}</td>
                        <td className="px-3 py-3 align-top">
                          {editingRow ? (
                            <input
                              value={listEditData.policy ?? ""}
                              onChange={(e) => setListEditData((prev) => ({ ...prev, policy: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg border border-surface-border bg-surface-light px-2 py-1.5 text-white"
                            />
                          ) : (
                            <span className="text-slate-300">{term.policy || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {editingRow ? (
                            <input
                              value={listEditData.pos ?? ""}
                              onChange={(e) => setListEditData((prev) => ({ ...prev, pos: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full rounded-lg border border-surface-border bg-surface-light px-2 py-1.5 text-white"
                            />
                          ) : (
                            <span className="text-slate-300">{term.pos || "—"}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top text-slate-500">{formatBatchTime(term.added_at)}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            {editingRow ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void saveListEdit(term);
                                  }}
                                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
                                >
                                  {t("glossary.save")}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setListEditingKey(null);
                                    setListEditData({});
                                  }}
                                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                                >
                                  {t("glossary.listCancel")}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startListEdit(term);
                                }}
                                className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                              >
                                {t("glossary.listEdit")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : currentTerm ? (
        <div className="flex flex-col items-center gap-6">
          <div ref={cardRef} className={`flip-card w-full max-w-2xl h-80 cursor-pointer ${flipped ? "flipped" : ""}`}
            onClick={() => { if (!editing) setFlipped((f) => !f); }}>
            <div className="flip-card-inner">
              <div className="flip-card-front glass-card flex flex-col items-center justify-center p-8 border-2 border-surface-border hover:border-indigo-500/30 transition-colors duration-300">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">中文</p>
                <p className="text-5xl font-bold text-white mb-4">{currentTerm.term_zh}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs border ${
                    termScope(currentTerm) === "book"
                      ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                      : "bg-slate-500/10 text-slate-300 border-slate-500/20"
                  }`}>
                    {termScope(currentTerm) === "book" ? t("glossary.scopeBook") : t("glossary.scopeGlobal")}
                  </span>
                  {(currentTerm.book || currentTerm.domain) && (
                    <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">
                      {currentTerm.book || currentTerm.domain}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-6">{t("glossary.flipHint")}</p>
              </div>
              <div className="flip-card-back glass-card flex flex-col items-center justify-center p-8 border-2 border-indigo-500/20">
                {editing ? (
                  <div className="w-full max-w-sm space-y-4">
                    <div><label className="text-xs text-slate-500">{t("glossary.korean")}</label>
                      <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                        value={editData.term_ko ?? currentTerm.term_ko} onChange={(e) => setEditData({ ...editData, term_ko: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    <div><label className="text-xs text-slate-500">{t("glossary.meaning")}</label>
                      <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                        value={editData.term_meaning_ko ?? currentTerm.term_meaning_ko ?? ""} onChange={(e) => setEditData({ ...editData, term_meaning_ko: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-slate-500">{t("glossary.book")}</label>
                        <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                          value={editData.book ?? currentTerm.book ?? ""} onChange={(e) => setEditData({ ...editData, book: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                      <div><label className="text-xs text-slate-500">{t("glossary.policy")}</label>
                        <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                          value={editData.policy ?? currentTerm.policy ?? ""} onChange={(e) => setEditData({ ...editData, policy: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs text-slate-500">{t("glossary.pos")}</label>
                        <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                          value={editData.pos ?? currentTerm.pos ?? ""} onChange={(e) => setEditData({ ...editData, pos: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                      <div><label className="text-xs text-slate-500">{t("glossary.domain")}</label>
                        <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                          value={editData.domain ?? currentTerm.domain ?? ""} onChange={(e) => setEditData({ ...editData, domain: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    </div>
                    <div><label className="text-xs text-slate-500">{t("glossary.note")}</label>
                      <textarea className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50 resize-none" rows={2}
                        value={editData.notes ?? currentTerm.notes ?? ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={(e) => { e.stopPropagation(); setEditing(false); setEditData({}); }}
                        className="px-3 py-1.5 rounded-lg bg-surface-lighter text-slate-400 text-sm hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors flex items-center gap-1"><Save className="w-4 h-4" />{t("glossary.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{t("glossary.meaning")}</p>
                    <p className={`text-4xl font-bold mb-3 ${currentMeaningMissing ? "text-slate-500" : "text-white"}`}>{currentMeaning}</p>
                    {currentRendering && currentRendering !== currentMeaning && (
                      <p className="text-sm text-slate-400 text-center mb-3">
                        {t("glossary.korean")} · {currentRendering}
                      </p>
                    )}
                    {currentMeaningMissing && (
                      <p className="text-sm text-slate-500 text-center max-w-md mb-6">
                        {t("glossary.meaningMissingHelp")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 justify-center mb-4">
                      <span className={`px-3 py-1 rounded-full text-xs border ${
                        termScope(currentTerm) === "book"
                          ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                          : "bg-slate-500/10 text-slate-300 border-slate-500/20"
                      }`}>
                        {termScope(currentTerm) === "book" ? t("glossary.scopeBook") : t("glossary.scopeGlobal")}
                      </span>
                      {(currentTerm.book || currentTerm.domain) && <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">{currentTerm.book || currentTerm.domain}</span>}
                      {currentTerm.pos && <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">{currentTerm.pos}</span>}
                      {currentTerm.policy && <span className="px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs border border-violet-500/20">{currentTerm.policy}</span>}
                      {currentTerm.source_chapter !== undefined && currentTerm.source_chapter !== null && (
                        <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-300 text-xs border border-sky-500/20">
                          #{currentTerm.source_chapter}
                        </span>
                      )}
                    </div>
                    {currentTerm.notes && <p className="text-sm text-slate-400 text-center max-w-md">{currentTerm.notes}</p>}
                    <button onClick={(e) => { e.stopPropagation(); setEditing(true); setEditData({}); }}
                      className="mt-4 flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-400 transition-colors"><Edit3 className="w-3 h-3" />{t("glossary.edit")}</button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={markReview} className="flex items-center gap-2 px-6 py-3 rounded-xl border border-amber-500/30 text-amber-300 font-medium text-sm hover:bg-amber-500/10 transition-all duration-200">
              <RotateCcw className="w-4 h-4" />{t("glossary.review")}
            </button>
            <button onClick={markKnown} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 transition-all duration-200 shadow-lg shadow-emerald-500/20">
              <Check className="w-4 h-4" />{t("glossary.known")}
            </button>
          </div>

          <div className="flex gap-1.5 max-w-md overflow-hidden">
            {filteredTerms.slice(Math.max(0, currentIndex - 10), currentIndex + 11).map((term, idx) => {
              const realIdx = Math.max(0, currentIndex - 10) + idx;
              return (<button key={termKey(term)} onClick={() => { setCurrentIndex(realIdx); setFlipped(false); }}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${realIdx === currentIndex ? "bg-indigo-400 w-6" : knownSet.has(termKey(term)) ? "bg-emerald-500/50" : "bg-surface-border hover:bg-slate-500"}`} />);
            })}
          </div>

          <div className="w-full max-w-4xl glass-card p-6">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <LibraryBig className="w-4 h-4 text-indigo-400" />
              {t("glossary.examples")}
            </h3>
            {examplesError && (
              <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                {examplesError}
              </div>
            )}
            {examplesLoadingKey === termKey(currentTerm) ? (
              <p className="text-sm text-slate-500">{t("glossary.examplesLoading")}</p>
            ) : currentExamples.length === 0 ? (
              <p className="text-sm text-slate-500">{t("glossary.noExamples")}</p>
            ) : (
              <div className="space-y-4">
                {currentExamples.map((example) => (
                  <div key={example.record_id} className="rounded-xl border border-surface-border bg-surface/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-300">{example.book}</span>
                      <span className="text-slate-500">#{example.chapter_ko}</span>
                      <span className="text-slate-500">zh {example.chapter_zh}</span>
                      <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {example.matched_in === "both"
                          ? t("glossary.matchedInBoth")
                          : example.matched_in === "ko"
                            ? t("glossary.matchedInKo")
                            : t("glossary.matchedInZh")}
                      </span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">ZH</p>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{example.zh_snippet}</p>
                      </div>
                      <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3">
                        <p className="text-xs font-medium text-slate-500 mb-2">{t("glossary.korean")}</p>
                        <p className="text-sm text-slate-200 whitespace-pre-wrap">{example.ko_snippet}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-card p-16 text-center">
          <BookOpen className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">{terms.length === 0 ? t("glossary.noTerms") : t("glossary.noFilterMatch")}</p>
        </div>
      )}
    </div>
  );
}

function FilterDropdown({ label, active, value, options, onSelect, onClear, clearLabel }: {
  label: string; active: boolean; value: string; options: string[];
  onSelect: (v: string) => void; onClear: () => void; clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${active ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20" : "bg-surface-lighter border border-surface-border text-slate-400 hover:text-white"}`}>
        {label}{active && value && <span className="text-xs text-indigo-400">: {value}</span>}<ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 glass-card py-1 z-50 max-h-60 overflow-y-auto animate-fade-in">
          {active && <button onClick={() => { onClear(); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-surface-lighter">{clearLabel}</button>}
          {options.map((opt) => (
            <button key={opt} onClick={() => { onSelect(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-lighter transition-colors ${active && value === opt ? "text-indigo-300" : "text-slate-300"}`}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function GlossarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-12 w-48 shimmer rounded-lg" />
      <div className="glass-card p-4 h-12 shimmer" />
      <div className="flex justify-center"><div className="w-full max-w-2xl h-80 shimmer rounded-xl" /></div>
    </div>
  );
}
