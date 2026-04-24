"use client";

import { useEffect, useState } from "react";
import {
  Languages, Send, BookOpen, AlertTriangle, Check, RefreshCw,
  Loader2, Sparkles, Info, Globe,
} from "lucide-react";
import { translate, getBooks, getDatasets, getGlossary, uploadText, getUploadJob } from "@/lib/api";
import type {
  TranslationRequest,
  TranslationResponse,
  Annotation,
  CulturalFlag,
  BookInfo,
  UploadResult,
  DatasetRecord,
  GlossaryTerm,
  LlmProvider,
} from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n";
import { pollUntil } from "@/lib/polling";

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

const PROVIDER_KEYS: Array<{ value: "auto" | LlmProvider; key: TranslationKey }> = [
  { value: "auto", key: "translate.providerAuto" },
  { value: "anthropic", key: "provider.claude" },
  { value: "openai", key: "provider.gpt" },
  { value: "gemini", key: "provider.gemini" },
];

const MODEL_PRESETS: Record<LlmProvider, string[]> = {
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  openai: ["gpt-5", "gpt-5-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

export default function TranslatePage() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [text, setText] = useState("");
  const [bookKo, setBookKo] = useState("");
  const [bookZh, setBookZh] = useState("");
  const [chapterKo, setChapterKo] = useState("");
  const [chapterZh, setChapterZh] = useState("");
  const [provider, setProvider] = useState<"auto" | LlmProvider>("auto");
  const [model, setModel] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [era, setEra] = useState("ancient");
  const [withAnnotations, setWithAnnotations] = useState(true);
  const [withCulturalCheck, setWithCulturalCheck] = useState(true);
  const [prevChapterId, setPrevChapterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [result, setResult] = useState<TranslationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contextRecords, setContextRecords] = useState<DatasetRecord[]>([]);
  const [contextGlossary, setContextGlossary] = useState<GlossaryTerm[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const { t } = useLanguage();
  const bookKoInput = bookKo.trim();
  const bookZhInput = bookZh.trim();
  const selectedBook = books.find((entry) => {
    const titles = [entry.book, entry.book_ko, entry.book_zh]
      .map((value) => value?.trim())
      .filter(Boolean);
    return (bookKoInput && titles.includes(bookKoInput)) || (bookZhInput && titles.includes(bookZhInput));
  }) || null;
  const book = selectedBook?.book || bookKoInput || bookZhInput;
  const draftBookKo = bookKoInput || selectedBook?.book_ko?.trim() || "";
  const draftBookZh = bookZhInput || selectedBook?.book_zh?.trim() || "";
  const existingBookKoTitles = Array.from(new Set(
    books
      .map((entry) => entry.book_ko?.trim() || (!entry.book_zh?.trim() ? entry.book.trim() : ""))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const existingBookZhTitles = Array.from(new Set(
    books
      .map((entry) => entry.book_zh?.trim() || (!entry.book_ko?.trim() ? entry.book.trim() : ""))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  const handleBookKoChange = (value: string) => {
    setBookKo(value);
    const matched = books.find((entry) => entry.book === value || entry.book_ko === value);
    if (matched?.book_zh) setBookZh(matched.book_zh);
  };
  const handleBookZhChange = (value: string) => {
    setBookZh(value);
    const matched = books.find((entry) => entry.book === value || entry.book_zh === value);
    if (matched?.book_ko) setBookKo(matched.book_ko);
  };
  const scopeLabel = (scope: string) =>
    scope === "book" ? t("translate.scopeBook") : t("translate.scopeGlobal");
  const referenceSourceLabel = (source: string) => {
    if (source === "previous") return t("translate.referenceSourcePrevious");
    if (source === "term") return t("translate.referenceSourceTerm");
    if (source === "similar") return t("translate.referenceSourceSimilar");
    return t("translate.referenceSourceRecent");
  };
  const providerLabel = (value: string) => {
    if (value === "anthropic") return t("provider.claude");
    if (value === "openai") return t("provider.gpt");
    if (value === "gemini") return t("provider.gemini");
    if (value === "auto") return t("translate.providerAuto");
    return value;
  };
  const parsePositiveInt = (value: string): number | undefined => {
    const match = value.trim().match(/\d+/);
    if (!match) return undefined;
    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };
  const excerpt = (value: string, maxChars: number = 120) => {
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (!cleaned) return "—";
    return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars - 1)}…` : cleaned;
  };
  const prioritizedGlossary = [...contextGlossary]
    .filter((term) => {
      if (!text.trim()) return true;
      return (
        (!!term.term_zh && text.includes(term.term_zh))
        || (!!term.term_ko && text.includes(term.term_ko))
        || (!!term.term_meaning_ko && text.includes(term.term_meaning_ko))
      );
    })
    .sort((a, b) => {
      const aScope = ((a.book || a.domain || "").trim() === book) ? 0 : 1;
      const bScope = ((b.book || b.domain || "").trim() === book) ? 0 : 1;
      if (aScope !== bScope) return aScope - bScope;
      return b.term_zh.length - a.term_zh.length;
    })
    .slice(0, 8);
  const recentConfirmedRecords = [...contextRecords]
    .sort((a, b) => b.chapter_ko - a.chapter_ko)
    .slice(0, 3);

  useEffect(() => {
    async function loadBooks() {
      try {
        const loadedBooks = await getBooks();
        setBooks(loadedBooks);
        setLoadError(null);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : t("translate.loadBooksError")
        );
      }
    }

    void loadBooks();
  }, [t]);

  useEffect(() => {
    if (!book) {
      setPrevChapterId("");
      setContextRecords([]);
      setContextGlossary([]);
      return;
    }

    async function loadContext() {
      try {
        setContextLoading(true);
        const [records, glossary] = await Promise.all([
          getDatasets(book, undefined, undefined, { bookExact: true, status: "confirmed" }),
          getGlossary(book),
        ]);
        const sorted = [...records].sort((a, b) => b.chapter_ko - a.chapter_ko);
        setContextRecords(sorted);
        setContextGlossary(glossary);
        setPrevChapterId(sorted[0]?.id || "");
        setLoadError(null);
      } catch (err) {
        setPrevChapterId("");
        setContextRecords([]);
        setContextGlossary([]);
        setLoadError(
          err instanceof Error ? err.message : t("translate.loadContextError")
        );
      } finally {
        setContextLoading(false);
      }
    }

    void loadContext();
  }, [book, t]);

  const handleTranslate = async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResult(null); setSaveNotice(null); setSaveWarning(null);
    try {
      const req: TranslationRequest = {
        text,
        book: book || undefined,
        genre: genres,
        era_profile: era,
        provider: provider === "auto" ? undefined : provider,
        model: provider === "auto" ? undefined : (model.trim() || undefined),
        prev_chapter_id: prevChapterId || undefined,
        current_chapter_ko: parsePositiveInt(chapterKo),
        current_chapter_zh: chapterZh.trim() || undefined,
        with_annotations: withAnnotations,
        with_cultural_check: withCulturalCheck,
      };
      const res = await translate(req);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("translate.errorOccurred"));
    } finally { setLoading(false); }
  };

  const toggleGenre = (g: string) => setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  const waitForDraftUpload = async (jobId: string) => {
    const status = await pollUntil({
      task: () => getUploadJob(jobId),
      isDone: (value) => value.status === "completed" && !!value.result,
      getError: (value) => (value.status === "failed" ? value.error || t("upload.uploadError") : null),
      intervalMs: 1200,
      maxAttempts: 240,
      timeoutMessage: t("upload.uploadError"),
    });

    if (!status.result) {
      throw new Error(t("upload.uploadError"));
    }

    return status.result as UploadResult;
  };

  const handleSaveDraft = async () => {
    if (!result || (!bookKoInput && !bookZhInput) || !(chapterZh.trim() || chapterKo.trim())) {
      setError(t("translate.saveDraftMissingFields"));
      return;
    }

    setSavingDraft(true);
    setError(null);
    setSaveNotice(null);
    setSaveWarning(null);
    try {
      const started = await uploadText({
        ko_text: result.translated,
        zh_text: text,
        book,
        book_ko: draftBookKo || undefined,
        book_zh: draftBookZh || undefined,
        input_language: "ko",
        is_original_text: false,
        resegment_ko_by_zh: false,
        chapter: chapterKo.trim() || chapterZh.trim(),
        chapter_zh: chapterZh.trim() || chapterKo.trim(),
        mapping_direction: "zh_to_ko",
        script: "unknown",
      });
      const saved = started.status === "queued" ? await waitForDraftUpload(started.id) : started;
      setSaveNotice(t("translate.saveDraftSuccess"));
      if ((saved.conflict_count ?? 0) > 0) {
        setSaveWarning(t("translate.saveDraftConflict"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("translate.errorOccurred"));
    } finally {
      setSavingDraft(false);
    }
  };

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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    list="translate-book-ko-options"
                    value={bookKo}
                    onChange={(e) => handleBookKoChange(e.target.value)}
                    placeholder={t("translate.bookKoPlaceholder")}
                    className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                  />
                  <datalist id="translate-book-ko-options">
                    {existingBookKoTitles.map((title) => (<option key={title} value={title} />))}
                  </datalist>
                </div>
                <div>
                  <input
                    type="text"
                    list="translate-book-zh-options"
                    value={bookZh}
                    onChange={(e) => handleBookZhChange(e.target.value)}
                    placeholder={t("translate.bookZhPlaceholder")}
                    className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                  />
                  <datalist id="translate-book-zh-options">
                    {existingBookZhTitles.map((title) => (<option key={title} value={title} />))}
                  </datalist>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">{t("translate.bookInputHint")}</p>
            </div>

            {book && (
              <div className="rounded-2xl border border-indigo-500/15 bg-indigo-500/5 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{t("translate.bookContextTitle")}</h3>
                  <p className="text-xs text-slate-400 mt-1">{t("translate.bookContextSubtitle")}</p>
                </div>
                {contextLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("translate.bookContextLoading")}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-surface-border bg-surface/70 p-3">
                        <p className="text-xs text-slate-500">{t("translate.bookContextConfirmedCount")}</p>
                        <p className="mt-2 text-xl font-semibold text-white">{contextRecords.length}</p>
                      </div>
                      <div className="rounded-xl border border-surface-border bg-surface/70 p-3">
                        <p className="text-xs text-slate-500">{t("translate.glossaryHits")}</p>
                        <p className="mt-2 text-xl font-semibold text-indigo-300">{contextGlossary.length}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-slate-400 mb-2">{t("translate.bookContextGlossary")}</h4>
                      {prioritizedGlossary.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {prioritizedGlossary.map((term) => (
                            <span
                              key={`${term.term_zh}:${term.book || term.domain || "global"}`}
                              className="px-2 py-1 rounded-lg border border-indigo-500/20 bg-surface/70 text-xs text-slate-100"
                            >
                              {term.term_zh} → {term.term_ko || term.term_meaning_ko || "미정"}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">{t("translate.noGlossaryHits")}</p>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-slate-400 mb-2">{t("translate.bookContextRecent")}</h4>
                      {recentConfirmedRecords.length > 0 ? (
                        <div className="space-y-2">
                          {recentConfirmedRecords.map((record) => (
                            <div key={record.id} className="rounded-xl border border-surface-border bg-surface/70 p-3">
                              <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>{record.book}</span>
                                <span>#{record.chapter_ko}</span>
                                <span>zh {record.chapter_zh}</span>
                              </div>
                              <p className="mt-2 text-xs text-slate-300">{excerpt(record.zh_text)}</p>
                              <p className="mt-1 text-xs text-emerald-200">{excerpt(record.ko_text_confirmed || record.ko_text)}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">{t("translate.bookContextEmpty")}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.chapterKo")}</label>
                <input
                  type="text"
                  value={chapterKo}
                  onChange={(e) => setChapterKo(e.target.value)}
                  placeholder={t("translate.chapterPlaceholder")}
                  className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.chapterZh")}</label>
                <input
                  type="text"
                  value={chapterZh}
                  onChange={(e) => setChapterZh(e.target.value)}
                  placeholder={t("translate.chapterPlaceholder")}
                  className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.provider")}</label>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_KEYS.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setProvider(entry.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      provider === entry.value
                        ? "bg-sky-500/20 text-sky-200 border border-sky-500/30"
                        : "bg-surface-lighter border border-surface-border text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {t(entry.key)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{t("translate.providerHint")}</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">{t("translate.model")}</label>
              <input
                type="text"
                list={provider === "auto" ? undefined : `translate-model-options-${provider}`}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={t("translate.modelPlaceholder")}
                disabled={provider === "auto"}
                className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              {provider !== "auto" && (
                <datalist id={`translate-model-options-${provider}`}>
                  {MODEL_PRESETS[provider].map((entry) => (<option key={entry} value={entry} />))}
                </datalist>
              )}
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
          {loadError && (
            <div className="glass-card border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-sm">{loadError}</p>
            </div>
          )}

          {saveNotice && (
            <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3 animate-fade-in">
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-300 text-sm">{saveNotice}</p>
            </div>
          )}

          {saveWarning && (
            <div className="glass-card border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-sm">{saveWarning}</p>
            </div>
          )}

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
                  <div className="flex items-center gap-2">
	                    <button
	                      type="button"
	                      onClick={() => { void handleSaveDraft(); }}
	                      disabled={savingDraft || (!bookKoInput && !bookZhInput) || !(chapterZh.trim() || chapterKo.trim())}
	                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
	                    >
                      {savingDraft ? t("translate.savingDraft") : t("translate.saveDraft")}
                    </button>
                    <span className="text-xs text-slate-500 font-mono">
                      {providerLabel(result.provider)} / {result.model}
                    </span>
                  </div>
                </div>
                <div className="p-4 bg-surface rounded-xl border border-surface-border">
                  <p className="text-white leading-relaxed whitespace-pre-wrap">{result.translated}</p>
                </div>
              </div>

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  {t("translate.contextSummary")}
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-xl border border-surface-border bg-surface p-4">
                    <p className="text-xs text-slate-500">{t("translate.confirmedRecords")}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{result.context_summary.confirmed_records}</p>
                  </div>
                  <div className="rounded-xl border border-surface-border bg-surface p-4">
                    <p className="text-xs text-slate-500">{t("translate.glossaryHits")}</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-300">{result.context_summary.glossary_hits}</p>
                  </div>
                  <div className="rounded-xl border border-surface-border bg-surface p-4">
                    <p className="text-xs text-slate-500">{t("translate.referenceCount")}</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-300">{result.context_summary.reference_examples}</p>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-emerald-400" />
                  {t("translate.glossaryHits")} ({result.glossary_hits.length})
                </h3>
                {result.glossary_hits.length > 0 ? (
                  <div className="space-y-3">
                    {result.glossary_hits.map((hit) => (
                      <div key={`${hit.term_zh}:${hit.book}`} className="rounded-xl border border-surface-border bg-surface p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-white font-semibold">{hit.term_zh}</span>
                          <span className="text-slate-500">→</span>
                          <span className="text-emerald-300 font-medium">{hit.term_ko || "미정"}</span>
                          <span className="ml-auto px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">
                            {scopeLabel(hit.scope)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                          {hit.policy && <span>{hit.policy}</span>}
                          {hit.pos && <span>· {hit.pos}</span>}
                          {hit.book && <span>· {hit.book}</span>}
                        </div>
                        {hit.notes && <p className="mt-2 text-sm text-slate-400">{hit.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("translate.noGlossaryHits")}</p>
                )}
              </div>

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
                  <RefreshCw className="w-4 h-4 text-sky-400" />
                  {t("translate.referenceExamples")} ({result.reference_examples.length})
                </h3>
                {result.reference_examples.length > 0 ? (
                  <div className="space-y-4">
                    {result.reference_examples.map((example) => (
                      <div key={example.record_id} className="rounded-xl border border-surface-border bg-surface p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                            {referenceSourceLabel(example.source)}
                          </span>
                          <span className="text-slate-400">{example.book}</span>
                          <span className="text-slate-500">#{example.chapter_ko}</span>
                          <span className="text-slate-500">zh {example.chapter_zh}</span>
                        </div>
                        {example.matched_terms.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-slate-500">{t("translate.matchedTerms")}</span>
                            {example.matched_terms.map((term) => (
                              <span key={`${example.record_id}:${term}`} className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">
                                {term}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="grid gap-3 lg:grid-cols-2">
                          <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3">
                            <p className="text-xs font-medium text-slate-500 mb-2">{t("upload.source")}</p>
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">{example.zh_snippet}</p>
                          </div>
                          <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3">
                            <p className="text-xs font-medium text-slate-500 mb-2">{t("upload.translation")}</p>
                            <p className="text-sm text-slate-200 whitespace-pre-wrap">{example.ko_snippet}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("translate.noReferenceExamples")}</p>
                )}
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
