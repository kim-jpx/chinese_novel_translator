"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload, FileText, CheckCircle, AlertCircle, X, Loader2,
  Plus, BookOpen, Hash, Database, Check, ChevronDown, ChevronRight, Eye, Type,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { uploadFile, getDatasets } from "@/lib/api";
import type { GlossaryTerm, UploadResponse, DatasetEntry } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [bookName, setBookName] = useState("");
  const [chapter, setChapter] = useState("");
  const [chapterZh, setChapterZh] = useState("");
  const [script, setScript] = useState<"unknown" | "simplified" | "traditional">("unknown");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [collapsedBooks, setCollapsedBooks] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<DatasetEntry | null>(null);
  const { t, locale } = useLanguage();

  const loadDatasets = useCallback(async () => {
    try { const data = await getDatasets(); setDatasets(data); } catch { /* */ } finally { setDatasetsLoading(false); }
  }, []);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) { setFile(acceptedFiles[0]); setResult(null); setError(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: false,
    accept: { "text/plain": [".txt"], "text/markdown": [".md"], "text/csv": [".csv"], "application/json": [".json"] },
  });

  const handleUpload = async () => {
    if (!file || !bookName.trim() || !chapter.trim()) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file); formData.append("book", bookName); formData.append("chapter", chapter);
      if (chapterZh.trim()) formData.append("chapter_zh", chapterZh.trim());
      formData.append("script", script);
      const res = await uploadFile(formData);
      setResult(res); loadDatasets();
    } catch (e) { setError(e instanceof Error ? e.message : t("upload.uploadError")); } finally { setUploading(false); }
  };

  const handleReset = () => { setFile(null); setBookName(""); setChapter(""); setChapterZh(""); setScript("unknown"); setResult(null); setError(null); };

  const groupedDatasets = datasets.reduce<Record<string, DatasetEntry[]>>((acc, entry) => {
    if (!acc[entry.book]) acc[entry.book] = []; acc[entry.book].push(entry); return acc;
  }, {});

  Object.values(groupedDatasets).forEach((entries) => entries.sort((a, b) => {
    const numA = parseInt(a.chapter, 10); const numB = parseInt(b.chapter, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB; return a.chapter.localeCompare(b.chapter);
  }));

  const toggleBookCollapse = (book: string) => setCollapsedBooks((prev) => { const next = new Set(prev); if (next.has(book)) next.delete(book); else next.add(book); return next; });

  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "ko-KR";

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-navy-700 flex items-center justify-center"><Upload className="w-5 h-5 text-white" /></div>
          {t("upload.title")}
        </h1>
        <p className="text-slate-400 mt-1">{t("upload.subtitle")}</p>
      </div>

      <div className="glass-card p-8 space-y-6">
        <div {...getRootProps()} className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${isDragActive ? "dropzone-active" : file ? "border-emerald-500/30 bg-emerald-500/5" : "border-surface-border hover:border-indigo-500/30 hover:bg-indigo-500/5"}`}>
          <input {...getInputProps()} />
          {file ? (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4"><FileText className="w-8 h-8 text-emerald-400" /></div>
              <p className="text-white font-semibold">{file.name}</p>
              <p className="text-slate-500 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="mt-3 text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"><X className="w-3 h-3" />{t("upload.remove")}</button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${isDragActive ? "bg-indigo-500/20 scale-110" : "bg-surface-lighter"}`}>
                <Upload className={`w-10 h-10 transition-colors duration-300 ${isDragActive ? "text-indigo-400" : "text-slate-600"}`} />
              </div>
              <p className="text-white font-medium">{isDragActive ? t("upload.dropzoneActive") : t("upload.dropzoneDefault")}</p>
              <p className="text-slate-500 text-sm mt-1">{t("upload.supportedFormats")}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-400" />{t("upload.bookName")}</label>
            <input type="text" placeholder={t("upload.bookNamePlaceholder")} value={bookName} onChange={(e) => setBookName(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Hash className="w-4 h-4 text-indigo-400" />{t("upload.chapter")}</label>
            <input type="text" placeholder={t("upload.chapterPlaceholder")} value={chapter} onChange={(e) => setChapter(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Hash className="w-4 h-4 text-emerald-400" />{t("upload.chapterZh")}</label>
            <input type="text" placeholder={t("upload.chapterZhPlaceholder")} value={chapterZh} onChange={(e) => setChapterZh(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Type className="w-4 h-4 text-emerald-400" />{t("upload.script")}</label>
            <div className="relative">
              <select value={script} onChange={(e) => setScript(e.target.value as "unknown" | "simplified" | "traditional")}
                className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                <option value="unknown">{t("upload.scriptUnknown")}</option>
                <option value="simplified">{t("upload.scriptSimplified")}</option>
                <option value="traditional">{t("upload.scriptTraditional")}</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <button onClick={handleUpload} disabled={!file || !bookName.trim() || !chapter.trim() || uploading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-navy-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-navy-600 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40">
          {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t("upload.uploading")}</>) : (<><Upload className="w-4 h-4" />{t("upload.submit")}</>)}
        </button>
      </div>

      {error && (<div className="glass-card border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3 animate-fade-in"><AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" /><p className="text-red-300 text-sm">{error}</p></div>)}

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3"><CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" /><p className="text-emerald-300 text-sm">{result.message}</p></div>
          {result.new_terms.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-4"><Plus className="w-4 h-4 text-amber-400" />{t("upload.newTermCandidates")} ({result.new_terms.length})</h3>
              <div className="space-y-2">{result.new_terms.map((term) => (<NewTermRow key={term.term_zh} term={term} />))}</div>
            </div>
          )}
          <button onClick={handleReset} className="w-full py-3 rounded-xl border border-surface-border text-slate-400 font-medium text-sm hover:text-white hover:border-indigo-500/30 transition-all duration-200 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />{t("upload.uploadMore")}</button>
        </div>
      )}

      {/* Existing Datasets */}
      <section>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-indigo-400" />{t("upload.existingDatasets")}
          {datasets.length > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">{datasets.length}{t("upload.entries")}</span>}
        </h2>

        {datasetsLoading ? (
          <div className="glass-card overflow-hidden"><div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-10 shimmer rounded-lg" />))}</div></div>
        ) : Object.keys(groupedDatasets).length === 0 ? (
          <div className="glass-card p-12 text-center"><Database className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">{t("upload.noDatasets")}</p><p className="text-slate-600 text-sm mt-1">{t("upload.noDatasetsSub")}</p></div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedDatasets).map(([bookName, entries]) => (
              <div key={bookName} className="glass-card overflow-hidden">
                <button onClick={() => toggleBookCollapse(bookName)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-lighter/40 transition-colors duration-150">
                  {collapsedBooks.has(bookName) ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span className="text-white font-semibold text-sm">{bookName}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-surface-lighter text-slate-400 text-xs">{entries.length}{locale === "ko" ? "화" : locale === "zh" ? "话" : " ch."}</span>
                </button>
                {!collapsedBooks.has(bookName) && (
                  <div className="border-t border-surface-border">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-border/50">
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.chapter")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.sourceZh")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.translKo")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.script")}</th>
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("upload.createdAt")}</th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border/30">
                        {entries.map((entry) => (
                          <tr key={`${entry.book}-${entry.chapter}`} onClick={() => setPreviewEntry(entry)} className="hover:bg-surface-lighter/30 transition-colors duration-150 cursor-pointer group">
                            <td className="px-5 py-3 text-sm text-white font-medium">{entry.chapter}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</td>
                            <td className="px-5 py-3 text-center">{entry.zh_text ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10"><Check className="w-3.5 h-3.5 text-emerald-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center">{entry.ko_text ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/10"><Check className="w-3.5 h-3.5 text-indigo-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center"><ScriptBadge script={entry.script} /></td>
                            <td className="px-5 py-3 text-sm text-slate-400">{new Date(entry.created_at).toLocaleDateString(dateLocale, { year: "numeric", month: "short", day: "numeric" })}</td>
                            <td className="px-3 py-3"><Eye className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {previewEntry && <PreviewModal entry={previewEntry} onClose={() => setPreviewEntry(null)} />}
    </div>
  );
}

function PreviewModal({ entry, onClose }: { entry: DatasetEntry; onClose: () => void }) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "ko-KR";

  useEffect(() => { const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-3xl max-h-[80vh] glass-card border-indigo-500/20 flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><Eye className="w-4 h-4 text-indigo-400" /></div>
            <div>
              <h3 className="text-white font-semibold text-sm">{entry.book} — {entry.chapter}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</h3>
              <p className="text-xs text-slate-500">{new Date(entry.created_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-lighter flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-border transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${entry.zh_text ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.source")} {entry.zh_text ? "✓" : "✗"}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${entry.ko_text ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.translation")} {entry.ko_text ? "✓" : "✗"}</span>
          </div>
          {entry.ko_text ? (
            <div><h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">📖 {t("upload.previewTitle")}</h4>
              <div className="p-4 bg-surface rounded-xl border border-surface-border max-h-[50vh] overflow-y-auto"><p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{entry.ko_text}</p></div></div>
          ) : (
            <div className="p-8 bg-surface rounded-xl border border-surface-border text-center"><FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" /><p className="text-slate-500 text-sm">{t("upload.noTranslation")}</p><p className="text-slate-600 text-xs mt-1">{t("upload.noTranslationSub")}</p></div>
          )}
          {entry.zh_text && (
            <div><h4 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5">📝 {t("upload.sourceSummary")}</h4>
              <div className="p-4 bg-surface rounded-xl border border-surface-border">
                <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{entry.zh_text.length > 500 ? entry.zh_text.slice(0, 500) + "…" : entry.zh_text}</p>
                {entry.zh_text.length > 500 && <p className="text-xs text-slate-600 mt-2">{t("upload.totalChars")} {entry.zh_text.length.toLocaleString()}{locale === "ko" ? "자" : locale === "zh" ? "字" : " chars"}</p>}
              </div></div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewTermRow({ term }: { term: GlossaryTerm }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-surface rounded-lg border border-surface-border hover:border-indigo-500/20 transition-colors">
      <span className="text-white font-medium text-base min-w-[100px]">{term.term_zh}</span>
      <span className="text-slate-600">→</span>
      <span className="text-indigo-300 font-medium">{term.term_kr}</span>
      {term.pos && <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">{term.pos}</span>}
      {term.domain && <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 text-xs border border-sky-500/20">{term.domain}</span>}
      {term.is_new && <span className="ml-auto badge-pulse px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">NEW</span>}
    </div>
  );
}

function ScriptBadge({ script }: { script?: "simplified" | "traditional" | "unknown" }) {
  const { t } = useLanguage();

  if (script === "simplified") {
    return <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 text-xs font-medium border border-sky-500/20">{t("upload.scriptSimplified")}</span>;
  }
  if (script === "traditional") {
    return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-medium border border-emerald-500/20">{t("upload.scriptTraditional")}</span>;
  }
  return <span className="px-2 py-0.5 rounded-full bg-surface-lighter text-slate-500 text-xs font-medium border border-surface-border">{t("upload.scriptBadgeUnknown")}</span>;
}
