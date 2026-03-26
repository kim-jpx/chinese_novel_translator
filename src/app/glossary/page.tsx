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
} from "lucide-react";
import { getGlossary, getBooks, updateGlossaryTerm } from "@/lib/api";
import type { GlossaryTerm, Book } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

type FilterType = "book" | "pos" | "policy" | "unknown";

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownSet, setKnownSet] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<FilterType | null>(null);
  const [filterValue, setFilterValue] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<GlossaryTerm>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    async function load() {
      try {
        const [termsData, booksData] = await Promise.all([getGlossary(), getBooks()]);
        setTerms(termsData);
        setBooks(booksData);
      } catch { /* */ } finally { setLoading(false); }
    }
    load();
  }, []);

  const filteredTerms = terms.filter((term) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!term.term_zh.toLowerCase().includes(q) && !term.term_kr.toLowerCase().includes(q)) return false;
    }
    if (onlyUnknown && knownSet.has(term.term_zh)) return false;
    if (filterType === "book" && filterValue && term.book !== filterValue) return false;
    if (filterType === "pos" && filterValue && term.pos !== filterValue) return false;
    if (filterType === "policy" && filterValue && term.policy !== filterValue) return false;
    return true;
  });

  const currentTerm = filteredTerms[currentIndex];
  const progress = filteredTerms.length > 0 ? Math.round((knownSet.size / filteredTerms.length) * 100) : 0;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editing) return;
    if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
    if (e.code === "ArrowRight" || e.code === "KeyL") { setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); }
    if (e.code === "ArrowLeft" || e.code === "KeyH") { setFlipped(false); setCurrentIndex((i) => Math.max(i - 1, 0)); }
    if (e.code === "KeyK" && currentTerm) { setKnownSet((prev) => new Set(prev).add(currentTerm.term_zh)); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); }
  }, [currentTerm, filteredTerms.length, editing]);

  useEffect(() => { window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [handleKeyDown]);

  const markKnown = () => { if (!currentTerm) return; setKnownSet((prev) => new Set(prev).add(currentTerm.term_zh)); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); };
  const markReview = () => { if (!currentTerm) return; setKnownSet((prev) => { const next = new Set(prev); next.delete(currentTerm.term_zh); return next; }); setFlipped(false); setCurrentIndex((i) => Math.min(i + 1, filteredTerms.length - 1)); };

  const saveEdit = async () => {
    if (!currentTerm) return;
    try {
      await updateGlossaryTerm(currentTerm.term_zh, editData);
      setTerms((prev) => prev.map((t2) => t2.term_zh === currentTerm.term_zh ? { ...t2, ...editData } : t2));
      setEditing(false);
    } catch { /* */ }
  };

  const posValues = Array.from(new Set(terms.map((t2) => t2.pos).filter((v): v is string => !!v)));
  const policyValues = Array.from(new Set(terms.map((t2) => t2.policy).filter((v): v is string => !!v)));

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

      {showFilters && (
        <div className="glass-card p-4 animate-fade-in">
          <div className="flex flex-wrap gap-3 items-center">
            <FilterDropdown label={t("glossary.byBook")} active={filterType === "book"} value={filterValue} options={books.map((b) => b.name)}
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
        </div>
      )}

      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400"><Layers className="w-4 h-4 inline mr-1" />{currentIndex + 1} / {filteredTerms.length}{t("glossary.cards")}</span>
          <span className="text-sm font-semibold text-indigo-300">{t("glossary.learned")} {knownSet.size}개 ({progress}%)</span>
        </div>
        <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${progress}%` }} /></div>
      </div>

      {currentTerm ? (
        <div className="flex flex-col items-center gap-6">
          <div ref={cardRef} className={`flip-card w-full max-w-2xl h-80 cursor-pointer ${flipped ? "flipped" : ""}`}
            onClick={() => { if (!editing) setFlipped((f) => !f); }}>
            <div className="flip-card-inner">
              <div className="flip-card-front glass-card flex flex-col items-center justify-center p-8 border-2 border-surface-border hover:border-indigo-500/30 transition-colors duration-300">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-4">中文</p>
                <p className="text-5xl font-bold text-white mb-4">{currentTerm.term_zh}</p>
                {currentTerm.book && <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">{currentTerm.book}</span>}
                <p className="text-xs text-slate-600 mt-6">{t("glossary.flipHint")}</p>
              </div>
              <div className="flip-card-back glass-card flex flex-col items-center justify-center p-8 border-2 border-indigo-500/20">
                {editing ? (
                  <div className="w-full max-w-sm space-y-4">
                    <div><label className="text-xs text-slate-500">{t("glossary.korean")}</label>
                      <input className="w-full mt-1 px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
                        value={editData.term_kr ?? currentTerm.term_kr} onChange={(e) => setEditData({ ...editData, term_kr: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
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
                        value={editData.note ?? currentTerm.note ?? ""} onChange={(e) => setEditData({ ...editData, note: e.target.value })} onClick={(e) => e.stopPropagation()} /></div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={(e) => { e.stopPropagation(); setEditing(false); setEditData({}); }}
                        className="px-3 py-1.5 rounded-lg bg-surface-lighter text-slate-400 text-sm hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors flex items-center gap-1"><Save className="w-4 h-4" />{t("glossary.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">{t("glossary.korean")}</p>
                    <p className="text-4xl font-bold text-white mb-6">{currentTerm.term_kr}</p>
                    <div className="flex flex-wrap gap-2 justify-center mb-4">
                      {currentTerm.pos && <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">{currentTerm.pos}</span>}
                      {currentTerm.domain && <span className="px-3 py-1 rounded-full bg-sky-500/10 text-sky-300 text-xs border border-sky-500/20">{currentTerm.domain}</span>}
                      {currentTerm.policy && <span className="px-3 py-1 rounded-full bg-violet-500/10 text-violet-300 text-xs border border-violet-500/20">{currentTerm.policy}</span>}
                    </div>
                    {currentTerm.note && <p className="text-sm text-slate-400 text-center max-w-md">{currentTerm.note}</p>}
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
              return (<button key={term.term_zh} onClick={() => { setCurrentIndex(realIdx); setFlipped(false); }}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${realIdx === currentIndex ? "bg-indigo-400 w-6" : knownSet.has(term.term_zh) ? "bg-emerald-500/50" : "bg-surface-border hover:bg-slate-500"}`} />);
            })}
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
