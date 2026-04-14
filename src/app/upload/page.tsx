"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload, FileText, CheckCircle, AlertCircle, X, Loader2,
  Plus, BookOpen, Hash, Database, Check, ChevronDown, ChevronRight, Eye, Type,
  ClipboardPaste, Save,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import { uploadFile, uploadText, getDatasets } from "@/lib/api";
import type { UploadResult, DatasetRecord } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

// ──────────────────────────────────────────────
// Shared metadata fields component
// ──────────────────────────────────────────────
function MetadataFields({
  bookName, setBookName, chapter, setChapter,
  chapterZh, setChapterZh, script, setScript,
}: {
  bookName: string; setBookName: (v: string) => void;
  chapter: string; setChapter: (v: string) => void;
  chapterZh: string; setChapterZh: (v: string) => void;
  script: "unknown" | "simplified" | "traditional"; setScript: (v: "unknown" | "simplified" | "traditional") => void;
}) {
  const { t } = useLanguage();
  return (
    <>
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
    </>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");

  // shared
  const [bookName, setBookName] = useState("");
  const [chapter, setChapter] = useState("");
  const [chapterZh, setChapterZh] = useState("");
  const [script, setScript] = useState<"unknown" | "simplified" | "traditional">("unknown");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // file tab
  const [file, setFile] = useState<File | null>(null);

  // text tab
  const [koText, setKoText] = useState("");

  // datasets
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [collapsedBooks, setCollapsedBooks] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<DatasetRecord | null>(null);
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

  const handleFileUpload = async () => {
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

  const handleTextSave = async () => {
    if (!koText.trim() || !bookName.trim() || !chapter.trim()) return;
    setUploading(true); setError(null); setResult(null);
    try {
      const res = await uploadText({
        ko_text: koText.trim(),
        book: bookName.trim(),
        chapter: parseInt(chapter, 10) || 0,
        chapter_zh: chapterZh.trim() || undefined,
        script,
      });
      setResult(res); loadDatasets();
    } catch (e) { setError(e instanceof Error ? e.message : t("upload.uploadError")); } finally { setUploading(false); }
  };

  const handleReset = () => {
    setFile(null); setKoText(""); setBookName(""); setChapter("");
    setChapterZh(""); setScript("unknown"); setResult(null); setError(null);
  };

  // Group datasets by book using DatasetRecord.book
  const groupedDatasets = datasets.reduce<Record<string, DatasetRecord[]>>((acc, entry) => {
    if (!acc[entry.book]) acc[entry.book] = []; acc[entry.book].push(entry); return acc;
  }, {});

  // Sort by chapter_ko (number)
  Object.values(groupedDatasets).forEach((entries) => entries.sort((a, b) => a.chapter_ko - b.chapter_ko));

  const toggleBookCollapse = (book: string) => setCollapsedBooks((prev) => { const next = new Set(prev); if (next.has(book)) next.delete(book); else next.add(book); return next; });


  const fileReady = !!file && !!bookName.trim() && !!chapter.trim();
  const textReady = !!koText.trim() && !!bookName.trim() && !!chapter.trim();

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-navy-700 flex items-center justify-center"><Upload className="w-5 h-5 text-white" /></div>
          {t("upload.title")}
        </h1>
        <p className="text-slate-400 mt-1">{t("upload.subtitle")}</p>
      </div>

      {/* ───── Tab Card ───── */}
      <div className="glass-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-surface-border">
          <button onClick={() => setActiveTab("file")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium transition-all duration-200 relative
              ${activeTab === "file" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}>
            <Upload className="w-4 h-4" />
            {t("upload.tabFile")}
            {activeTab === "file" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />}
          </button>
          <button onClick={() => setActiveTab("text")}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium transition-all duration-200 relative
              ${activeTab === "text" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}>
            <ClipboardPaste className="w-4 h-4" />
            {t("upload.tabText")}
            {activeTab === "text" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />}
          </button>
        </div>

        {/* Tab content */}
        <div className="p-8 space-y-6">
          {activeTab === "file" ? (
            <>
              {/* Dropzone */}
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

              <MetadataFields bookName={bookName} setBookName={setBookName} chapter={chapter} setChapter={setChapter}
                chapterZh={chapterZh} setChapterZh={setChapterZh} script={script} setScript={setScript} />

              <button onClick={handleFileUpload} disabled={!fileReady || uploading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-navy-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-navy-600 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40">
                {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t("upload.uploading")}</>) : (<><Upload className="w-4 h-4" />{t("upload.submit")}</>)}
              </button>
            </>
          ) : (
            <>
              {/* Textarea */}
              <div>
                <textarea
                  value={koText} onChange={(e) => setKoText(e.target.value)}
                  placeholder={t("upload.textPlaceholder")}
                  className="w-full min-h-[200px] px-4 py-3 bg-surface border border-surface-border rounded-xl text-white text-sm leading-relaxed placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-y"
                />
                {koText.length > 0 && (
                  <p className="text-right text-xs text-slate-500 mt-1">{koText.length.toLocaleString()} {locale === "ko" ? "자" : locale === "zh" ? "字" : "chars"}</p>
                )}
              </div>

              <MetadataFields bookName={bookName} setBookName={setBookName} chapter={chapter} setChapter={setChapter}
                chapterZh={chapterZh} setChapterZh={setChapterZh} script={script} setScript={setScript} />

              <button onClick={handleTextSave} disabled={!textReady || uploading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-navy-700 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-indigo-500 hover:to-navy-600 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40">
                {uploading ? (<><Loader2 className="w-4 h-4 animate-spin" />{t("upload.saving")}</>) : (<><Save className="w-4 h-4" />{t("upload.save")}</>)}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ───── Result / Error ───── */}
      {error && (<div className="glass-card border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3 animate-fade-in"><AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" /><p className="text-red-300 text-sm">{error}</p></div>)}

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div className="text-emerald-300 text-sm">
              <p className="font-medium">{result.book} — {t("upload.chapter")} {result.chapter}</p>
              <p className="text-emerald-400/70 text-xs mt-0.5">{result.status} · {result.zh_fetched ? t("upload.sourceZhFetched") : t("upload.sourceZhNotFetched")}</p>
            </div>
          </div>
          {result.new_terms.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-4"><Plus className="w-4 h-4 text-amber-400" />{t("upload.newTermCandidates")} ({result.new_terms.length})</h3>
              <div className="flex flex-wrap gap-2">
                {result.new_terms.map((term) => (
                  <span key={term} className="px-3 py-1.5 rounded-lg bg-surface-lighter border border-amber-500/20 text-sm text-amber-200">
                    {term}
                    <span className="ml-1.5 badge-pulse inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  </span>
                ))}
              </div>
            </div>
          )}
          <button onClick={handleReset} className="w-full py-3 rounded-xl border border-surface-border text-slate-400 font-medium text-sm hover:text-white hover:border-indigo-500/30 transition-all duration-200 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />{t("upload.uploadMore")}</button>
        </div>
      )}

      {/* ───── Existing Datasets ───── */}
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
            {Object.entries(groupedDatasets).map(([bk, entries]) => (
              <div key={bk} className="glass-card overflow-hidden">
                <button onClick={() => toggleBookCollapse(bk)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-lighter/40 transition-colors duration-150">
                  {collapsedBooks.has(bk) ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <BookOpen className="w-4 h-4 text-indigo-400" />
                  <span className="text-white font-semibold text-sm">{bk}</span>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-surface-lighter text-slate-400 text-xs">{entries.length}{locale === "ko" ? "화" : locale === "zh" ? "话" : " ch."}</span>
                </button>
                {!collapsedBooks.has(bk) && (
                  <div className="border-t border-surface-border">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-surface-border/50">
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.chapter")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.sourceZh")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.translKo")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.script")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.status")}</th>
                          <th className="w-12" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border/30">
                        {entries.map((entry) => (
                          <tr key={entry.id} onClick={() => setPreviewEntry(entry)} className="hover:bg-surface-lighter/30 transition-colors duration-150 cursor-pointer group">
                            <td className="px-5 py-3 text-sm text-white font-medium">{entry.chapter_ko}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</td>
                            <td className="px-5 py-3 text-center">{entry.zh_text ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10"><Check className="w-3.5 h-3.5 text-emerald-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center">{entry.ko_text ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/10"><Check className="w-3.5 h-3.5 text-indigo-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center"><ScriptBadge script={entry.script} /></td>
                            <td className="px-5 py-3 text-center"><StatusBadge status={entry.status} /></td>
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

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────
function PreviewModal({ entry, onClose }: { entry: DatasetRecord; onClose: () => void }) {
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
              <h3 className="text-white font-semibold text-sm">{entry.book} — {entry.chapter_ko}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</h3>
              <p className="text-xs text-slate-500">{entry.updated_at ? new Date(entry.updated_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" }) : "—"}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-lighter flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-border transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${entry.zh_text ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.source")} {entry.zh_text ? "✓" : "✗"}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${entry.ko_text ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.translation")} {entry.ko_text ? "✓" : "✗"}</span>
            <StatusBadge status={entry.status} />
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

function StatusBadge({ status }: { status: "draft" | "confirmed" }) {
  if (status === "confirmed") {
    return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-medium border border-emerald-500/20">confirmed</span>;
  }
  return <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20">draft</span>;
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
