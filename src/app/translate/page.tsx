"use client";

import { useEffect, useState } from "react";
import {
  Languages, Send, BookOpen, AlertTriangle, Check, RefreshCw,
  Loader2, Sparkles, Info, ChevronDown, Globe,
} from "lucide-react";
import { translate, getBooks } from "@/lib/api";
import type { TranslationRequest, TranslationResponse, Annotation, CulturalFlag, BookInfo } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n";

const GENRE_KEYS: { value: string; key: TranslationKey }[] = [
  { value: "무협", key: "genre.wuxia" },
  { value: "선협", key: "genre.xianxia" },
  { value: "현대", key: "genre.modern" },
  { value: "로맨스", key: "genre.romance" },
  { value: "판타지", key: "genre.fantasy" },
  { value: "SF", key: "genre.sf" },
  { value: "역사", key: "genre.history" },
  { value: "추리", key: "genre.mystery" },
  { value: "공포", key: "genre.horror" },
];

const ERA_KEYS: { value: string; key: TranslationKey }[] = [
  { value: "ancient", key: "translate.eraAncient" },
  { value: "mixed", key: "translate.eraMixed" },
  { value: "modern", key: "translate.eraModern" },
  { value: "unknown", key: "translate.eraUnknown" },
];

export default function TranslatePage() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [text, setText] = useState("");
  const [book, setBook] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [era, setEra] = useState("ancient");
  const [withAnnotations, setWithAnnotations] = useState(true);
  const [withCulturalCheck, setWithCulturalCheck] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLanguage();

  useEffect(() => { getBooks().then(setBooks).catch(() => {}); }, []);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const req: TranslationRequest = { text, book, genre: genres, era_profile: era, with_annotations: withAnnotations, with_cultural_check: withCulturalCheck };
      const res = await translate(req);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("translate.errorOccurred"));
    } finally { setLoading(false); }
  };

  const toggleGenre = (g: string) => setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);

  const handleCulturalAction = (idx: number, action: "keep" | "change") => {
    if (!result) return;
    setResult({ ...result, cultural_flags: result.cultural_flags.map((f, i) => i === idx ? { ...f, action, user_action_needed: false } : f) });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-navy-700 flex items-center justify-center">
            <Languages className="w-5 h-5 text-white" />
          </div>
          {t("translate.title")}
        </h1>
        <p className="text-slate-400 mt-1">{t("translate.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Left: Input */}
        <div className="space-y-4">
          <div className="glass-card p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.inputLabel")}</label>
              <textarea className="w-full h-64 px-4 py-3 bg-surface border border-surface-border rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none font-mono text-sm leading-relaxed"
                placeholder={t("translate.inputPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex justify-end mt-1"><span className="text-xs text-slate-600">{text.length} {t("translate.chars")}</span></div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block"><BookOpen className="w-4 h-4 inline mr-1" />{t("translate.selectBook")}</label>
              <div className="relative">
                <select value={book} onChange={(e) => setBook(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                  <option value="">{t("translate.selectBookPlaceholder")}</option>
                  {books.map((b) => (<option key={b.book} value={b.book}>{b.book}</option>))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.genre")}</label>
              <div className="flex flex-wrap gap-2">
                {GENRE_KEYS.map((g) => (
                  <button key={g.value} onClick={() => toggleGenre(g.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${genres.includes(g.value) ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-surface-lighter border border-surface-border text-slate-500 hover:text-slate-300"}`}>
                    {t(g.key)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block"><Globe className="w-4 h-4 inline mr-1" />{t("translate.era")}</label>
              <div className="flex flex-wrap gap-2">
                {ERA_KEYS.map((e) => (
                  <button key={e.value} onClick={() => setEra(e.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${era === e.value ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-surface-lighter border border-surface-border text-slate-500 hover:text-slate-300"}`}>
                    {t(e.key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={withAnnotations} onChange={(e) => setWithAnnotations(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                <span className="text-sm text-slate-400">{t("translate.withAnnotations")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={withCulturalCheck} onChange={(e) => setWithCulturalCheck(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                <span className="text-sm text-slate-400">{t("translate.withCulturalCheck")}</span>
              </label>
            </div>

            <button onClick={handleTranslate} disabled={loading || !text.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-navy-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-navy-600 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40">
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t("translate.loading")}</>) : (<><Send className="w-4 h-4" />{t("translate.submit")}</>)}
            </button>
          </div>
        </div>

        {/* Right: Result */}
        <div className="space-y-4">
          {error && (
            <div className="glass-card border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" /><p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {loading && (
            <div className="glass-card p-12 flex flex-col items-center justify-center animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-navy-600/20 flex items-center justify-center mb-4 animate-pulse-glow">
                <Sparkles className="w-8 h-8 text-indigo-400" />
              </div>
              <p className="text-slate-300 font-medium">{t("translate.aiLoading")}</p>
              <p className="text-slate-500 text-sm mt-1">{t("translate.aiLoadingDesc")}</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4 animate-slide-up">
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Languages className="w-4 h-4 text-indigo-400" />{t("translate.result")}</h3>
                  <span className="text-xs text-slate-500 font-mono">{result.model}</span>
                </div>
                <div className="p-4 bg-surface rounded-xl border border-surface-border">
                  <p className="text-white leading-relaxed whitespace-pre-wrap">{result.translated}</p>
                </div>
              </div>

              {result.annotations.length > 0 && (
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4"><Info className="w-4 h-4 text-sky-400" />{t("translate.annotations")} ({result.annotations.length})</h3>
                  <div className="space-y-3">{result.annotations.map((anno, i) => (<AnnotationCard key={i} annotation={anno} />))}</div>
                </div>
              )}

              {result.cultural_flags.length > 0 && (
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4"><Globe className="w-4 h-4 text-amber-400" />{t("translate.culturalFlags")} ({result.cultural_flags.length})</h3>
                  <div className="space-y-3">{result.cultural_flags.map((flag, i) => (<CulturalFlagCard key={i} flag={flag} onAction={(a) => handleCulturalAction(i, a)} />))}</div>
                </div>
              )}

              {result.terms_used.length > 0 && (
                <div className="glass-card p-6">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4"><BookOpen className="w-4 h-4 text-emerald-400" />{t("translate.termsUsed")} ({result.terms_used.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.terms_used.map((term) => (
                      <span key={term} className="px-3 py-1.5 rounded-lg bg-surface-lighter border border-surface-border text-sm text-white">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="glass-card p-16 text-center">
              <Languages className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">{t("translate.emptyState")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Backend Annotation: { term, type, explanation, keep_original }
function AnnotationCard({ annotation }: { annotation: Annotation }) {
  return (
    <div className="p-3 bg-surface rounded-lg border border-surface-border">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">{annotation.type}</span>
        <span className="text-white font-medium text-sm">{annotation.term}</span>
        {annotation.keep_original && <span className="text-xs text-emerald-400 ml-auto">원문유지</span>}
      </div>
      <p className="text-slate-400 text-xs mt-1">{annotation.explanation}</p>
    </div>
  );
}

// Backend CulturalFlag: { term, issue, ai_decision, ai_reasoning, suggested, user_action_needed }
function CulturalFlagCard({ flag, onAction }: { flag: CulturalFlag; onAction: (a: "keep" | "change") => void }) {
  const { t } = useLanguage();
  return (
    <div className={`p-4 rounded-lg border ${flag.user_action_needed ? "action-needed" : flag.action === "keep" ? "border-emerald-500/20 bg-emerald-500/5" : flag.action === "change" ? "border-indigo-500/20 bg-indigo-500/5" : "border-surface-border bg-surface"} transition-all duration-300`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {flag.user_action_needed && <AlertTriangle className="w-4 h-4 text-amber-400" />}
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">{flag.ai_decision}</span>
          </div>
          <p className="text-white text-sm font-medium">&ldquo;{flag.term}&rdquo;</p>
          <p className="text-slate-400 text-xs mt-1">{flag.issue}</p>
          <p className="text-slate-500 text-xs mt-0.5 italic">{flag.ai_reasoning}</p>
          {flag.suggested && <p className="text-indigo-300 text-xs mt-1">{t("translate.suggestion")} {flag.suggested}</p>}
        </div>
        {flag.user_action_needed && (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => onAction("keep")} className="px-3 py-1.5 rounded-lg bg-emerald-600/80 text-white text-xs font-medium hover:bg-emerald-500 transition-colors flex items-center gap-1"><Check className="w-3 h-3" />{t("translate.keep")}</button>
            <button onClick={() => onAction("change")} className="px-3 py-1.5 rounded-lg bg-indigo-600/80 text-white text-xs font-medium hover:bg-indigo-500 transition-colors flex items-center gap-1"><RefreshCw className="w-3 h-3" />{t("translate.change")}</button>
          </div>
        )}
        {!flag.user_action_needed && flag.action && (
          <span className={`text-xs font-medium ${flag.action === "keep" ? "text-emerald-400" : "text-indigo-400"}`}>
            {flag.action === "keep" ? t("translate.kept") : t("translate.changed")}
          </span>
        )}
      </div>
    </div>
  );
}
