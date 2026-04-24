"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Upload, FileText, CheckCircle, AlertCircle, X, Loader2,
  Plus, BookOpen, Hash, Database, Check, ChevronDown, ChevronRight, Eye, Type,
  ClipboardPaste, Save, Download, RefreshCcw, PencilLine, Languages, Sparkles,
  History, ShieldCheck,
} from "lucide-react";
import { useDropzone } from "react-dropzone";
import {
  uploadFile,
  uploadText,
  getUploadJob,
  listUploadJobs,
  listAlignmentReviews,
  getBooks,
  getDatasets,
  getDraftHistory,
  updateBookTitles,
  promoteUploadCandidates,
  extractUploadCandidates,
  getExtractUploadCandidatesJob,
  updateDatasetRecord,
  restoreDraftHistory,
  deleteDatasetRecord,
  confirmRecord,
  exportRecord,
  exportAllConfirmed,
  keepAlignmentReview,
  updateAlignmentReview,
  adjustAlignmentReviewBoundary,
  applyAlignmentReview,
  explainSentence,
  getApiErrorMessage,
  rewriteTone,
  verifyDraft,
  translate,
} from "@/lib/api";
import { downloadResponse } from "@/lib/download";
import { pollUntil } from "@/lib/polling";
import {
  buildParallelSyntaxAlignment,
} from "@/lib/parallelText";
import type {
  UploadResult,
  UploadJobItem,
  DatasetAlignmentRow,
  DatasetRecord,
  DraftHistoryItem,
  DraftVerifyResponse,
  SavedVerifyReport,
  MappingDirection,
  BookInfo,
  UploadConflict,
  AlignmentReview,
  LlmProvider,
} from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";

type PreviewEditorTab = "edit" | "confirmed" | "meta" | "history" | "verify";
type TonePresetId = "haoche" | "hasipsioche" | "haeyoche" | "banmal" | "literary";
type EditableSentenceRow = {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  sourceSentence: string;
  translationSentence: string;
  locked: boolean;
  origin: string;
};
type RowStructureTarget = "source" | "translation";
type RowStructureActionKind = "push" | "merge_next" | "split_marker";
type RowStructureActionState = {
  rowKey: string;
  action: RowStructureActionKind;
  includeSource: boolean;
  includeTranslation: boolean;
};

const ROW_STRUCTURE_FIELDS = {
  source: "sourceSentence",
  translation: "translationSentence",
} as const;

const TONE_PRESETS: Array<{ id: TonePresetId; labelKey: TranslationKey }> = [
  { id: "haoche", labelKey: "upload.tonePresetHaoche" },
  { id: "hasipsioche", labelKey: "upload.tonePresetHasipsioche" },
  { id: "haeyoche", labelKey: "upload.tonePresetHaeyoche" },
  { id: "banmal", labelKey: "upload.tonePresetBanmal" },
  { id: "literary", labelKey: "upload.tonePresetLiterary" },
];

const DEV_MODE = process.env.NODE_ENV !== "production";

const DEV_LLM_PROVIDER_KEYS: Array<{ value: "auto" | LlmProvider; key: TranslationKey }> = [
  { value: "auto", key: "translate.providerAuto" },
  { value: "anthropic", key: "provider.claude" },
  { value: "openai", key: "provider.gpt" },
  { value: "gemini", key: "provider.gemini" },
];

const DEV_LLM_MODEL_PRESETS: Record<LlmProvider, string[]> = {
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
  openai: ["gpt-5", "gpt-5-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

function makeEditableRowId(recordId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${recordId}:editor-row:${crypto.randomUUID()}`;
  }
  return `${recordId}:editor-row:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function makeEmptyEditableRow(
  recordId: string,
  paragraphIndex = 0,
  sentenceIndex = 0,
): EditableSentenceRow {
  return {
    id: makeEditableRowId(recordId),
    paragraphIndex,
    sentenceIndex,
    sourceSentence: "",
    translationSentence: "",
    locked: false,
    origin: "manual",
  };
}

function getSelectedRowStructureTargets(
  state: RowStructureActionState | null,
): RowStructureTarget[] {
  if (!state) return [];
  return (["source", "translation"] as RowStructureTarget[]).filter((target) =>
    target === "source" ? state.includeSource : state.includeTranslation
  );
}

function getRowStructureValue(row: EditableSentenceRow, target: RowStructureTarget) {
  return row[ROW_STRUCTURE_FIELDS[target]];
}

function mergeRowStructureText(currentValue: string, nextValue: string) {
  return [currentValue.trim(), nextValue.trim()].filter(Boolean).join(" ");
}

function buildEditableRowSignature(rows: EditableSentenceRow[]) {
  return JSON.stringify(
    rows.map((row, index) => ({
      index,
      source: row.sourceSentence.trim(),
      translation: row.translationSentence.trim(),
      locked: !!row.locked,
      origin: row.origin || "manual",
    }))
  );
}

function buildStoredAlignmentRows(rows: EditableSentenceRow[]): DatasetAlignmentRow[] {
  return rows.map((row, index) => ({
    id: row.id,
    order: index,
    source_text: row.sourceSentence.trim(),
    translation_text: row.translationSentence.trim(),
    locked: !!row.locked,
    origin: row.origin || "manual",
  }));
}

function buildAlignmentRowsForText(
  recordId: string,
  sourceText: string,
  translationText: string,
): DatasetAlignmentRow[] {
  return buildStoredAlignmentRows(
    buildEditableSentenceRows(recordId, sourceText, translationText),
  );
}

function makeSavedVerifyReport(result: DraftVerifyResponse): SavedVerifyReport {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `verify-report:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    created_at: now,
    overall_score: result.overall_score,
    verdict: result.verdict,
    summary: result.summary,
    categories: result.categories.map((category) => ({ ...category })),
    issues: result.issues.map((issue) => ({ ...issue })),
    strengths: [...result.strengths],
    provider: result.provider,
    model: result.model,
  };
}

function escapeVerifyReportHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function openVerifyReportPdfDialog(options: {
  report: SavedVerifyReport;
  bookLabel: string;
  chapterLabel: string;
  verdictLabel: string;
  verdictValue: string;
  scoreLabel: string;
  summaryLabel: string;
  categoriesLabel: string;
  issuesLabel: string;
  strengthsLabel: string;
  sourceLabel: string;
  translationLabel: string;
  createdAtLabel: string;
}) {
  if (typeof window === "undefined") return;
  const report = options.report;
  const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=1280");
  if (!popup) {
    throw new Error("PDF 저장 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.");
  }

  const categoriesHtml = report.categories.map((category) => `
    <div class="section-card">
      <div class="row-between">
        <strong>${escapeVerifyReportHtml(category.label)}</strong>
        <span class="badge">${escapeVerifyReportHtml(String(category.score))}</span>
      </div>
      <p>${escapeVerifyReportHtml(category.comment || "—")}</p>
    </div>
  `).join("");

  const issuesHtml = report.issues.length > 0
    ? report.issues.map((issue) => `
      <div class="section-card">
        <div class="row-between">
          <strong>${escapeVerifyReportHtml(issue.category)}</strong>
          <span class="badge">${escapeVerifyReportHtml(issue.severity)}</span>
        </div>
        <p>${escapeVerifyReportHtml(issue.problem)}</p>
        ${issue.source_excerpt ? `<p><span class="label">${escapeVerifyReportHtml(options.sourceLabel)}</span> ${escapeVerifyReportHtml(issue.source_excerpt)}</p>` : ""}
        ${issue.translation_excerpt ? `<p><span class="label">${escapeVerifyReportHtml(options.translationLabel)}</span> ${escapeVerifyReportHtml(issue.translation_excerpt)}</p>` : ""}
        ${issue.suggestion ? `<p><span class="label">Suggestion</span> ${escapeVerifyReportHtml(issue.suggestion)}</p>` : ""}
      </div>
    `).join("")
    : `<div class="section-card"><p>명확한 수정 이슈가 없습니다.</p></div>`;

  const strengthsHtml = report.strengths.length > 0
    ? report.strengths.map((strength) => `<li>${escapeVerifyReportHtml(strength)}</li>`).join("")
    : "<li>기록된 항목 없음</li>";

  const html = `<!doctype html>
  <html lang="ko">
    <head>
      <meta charset="utf-8" />
      <title>${escapeVerifyReportHtml(`${options.bookLabel} ${options.chapterLabel} AI 검증 리포트`)}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Segoe UI", sans-serif;
          color: #111827;
          line-height: 1.55;
          margin: 0;
          padding: 0;
          background: #ffffff;
        }
        h1, h2, h3, p { margin: 0; }
        .page { padding: 8px 0 24px; }
        .header { margin-bottom: 20px; }
        .meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
        .chip, .badge {
          display: inline-block;
          border: 1px solid #d1d5db;
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 12px;
          color: #374151;
          background: #f9fafb;
        }
        .score {
          font-size: 40px;
          font-weight: 700;
          margin-top: 12px;
        }
        .section { margin-top: 22px; }
        .section h2 {
          font-size: 16px;
          margin-bottom: 10px;
        }
        .section-card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 10px;
          break-inside: avoid;
        }
        .row-between {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          margin-bottom: 8px;
        }
        .label {
          font-weight: 600;
          color: #4b5563;
        }
        ul {
          margin: 0;
          padding-left: 18px;
        }
        li + li { margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <h1>${escapeVerifyReportHtml(options.bookLabel)}</h1>
          <p>${escapeVerifyReportHtml(options.chapterLabel)}</p>
          <div class="meta">
            <span class="chip">${escapeVerifyReportHtml(options.createdAtLabel)} ${escapeVerifyReportHtml(report.created_at)}</span>
            <span class="chip">${escapeVerifyReportHtml(options.verdictLabel)} ${escapeVerifyReportHtml(options.verdictValue)}</span>
            <span class="chip">Model ${escapeVerifyReportHtml(report.model || "unknown")}</span>
          </div>
          <div class="score">${escapeVerifyReportHtml(options.scoreLabel)} ${escapeVerifyReportHtml(String(report.overall_score))}</div>
        </div>

        <section class="section">
          <h2>${escapeVerifyReportHtml(options.summaryLabel)}</h2>
          <div class="section-card">
            <p>${escapeVerifyReportHtml(report.summary || "—")}</p>
          </div>
        </section>

        <section class="section">
          <h2>${escapeVerifyReportHtml(options.categoriesLabel)}</h2>
          ${categoriesHtml}
        </section>

        <section class="section">
          <h2>${escapeVerifyReportHtml(options.issuesLabel)}</h2>
          ${issuesHtml}
        </section>

        <section class="section">
          <h2>${escapeVerifyReportHtml(options.strengthsLabel)}</h2>
          <div class="section-card">
            <ul>${strengthsHtml}</ul>
          </div>
        </section>
      </div>
      <script>
        window.onload = () => {
          setTimeout(() => {
            window.focus();
            window.print();
          }, 150);
        };
      </script>
    </body>
  </html>`;

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function buildEditableRowsFromStoredAlignment(
  recordId: string,
  storedRows: DatasetAlignmentRow[] | undefined,
): EditableSentenceRow[] {
  if (!storedRows || storedRows.length === 0) return [];
  return [...storedRows]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((row, index) => ({
      id: row.id || `${recordId}:editor-row:${index}`,
      paragraphIndex: 0,
      sentenceIndex: index,
      sourceSentence: (row.source_text || "").trim(),
      translationSentence: (row.translation_text || "").trim(),
      locked: !!row.locked,
      origin: row.origin || "manual",
    }));
}

function buildEditableSentenceRows(
  recordId: string,
  sourceText: string,
  translationText: string,
  storedRows?: DatasetAlignmentRow[] | undefined,
): EditableSentenceRow[] {
  const savedRows = buildEditableRowsFromStoredAlignment(recordId, storedRows);
  if (savedRows.length > 0) {
    return savedRows;
  }

  const normalizedSourceText = sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const normalizedTranslationText = translationText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const explicitSourceRows = normalizedSourceText
    ? normalizedSourceText.split("\n").map((line) => line.trim())
    : [];
  const explicitTranslationRows = normalizedTranslationText
    ? normalizedTranslationText.split("\n\n").map((block) => block.trim())
    : [];

  if (
    explicitSourceRows.length > 1
    && (
      !normalizedTranslationText
      || (normalizedTranslationText.includes("\n\n") && explicitTranslationRows.length === explicitSourceRows.length)
    )
  ) {
    const rowCount = Math.max(explicitSourceRows.length, explicitTranslationRows.length, 1);
    return Array.from({ length: rowCount }, (_, index) => ({
      id: `${recordId}:editor-row:${index}`,
      paragraphIndex: 0,
      sentenceIndex: index,
      sourceSentence: explicitSourceRows[index] ?? "",
      translationSentence: explicitTranslationRows[index] ?? "",
      locked: false,
      origin: "auto",
    }));
  }

  return buildParallelSyntaxAlignment(sourceText, translationText).groups.map((group, index) => ({
    id: `${recordId}:editor-row:${index}`,
    paragraphIndex: group.paragraphIndex,
    sentenceIndex: group.sentenceIndex,
    sourceSentence: group.sourceSentence,
    translationSentence: group.translationSentence,
    locked: false,
    origin: "auto",
  }));
}

function composeEditableSourceText(rows: EditableSentenceRow[]) {
  return rows
    .map((row) => row.sourceSentence.trim())
    .join("\n");
}

function composeEditableTranslationText(rows: EditableSentenceRow[]) {
  return rows
    .map((row) => row.translationSentence.trim())
    .join("\n\n");
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

// ──────────────────────────────────────────────
// Shared metadata fields component
// ──────────────────────────────────────────────
function MetadataFields({
  bookKo, setBookKo, bookZh, setBookZh, chapter, setChapter,
  chapterZh, setChapterZh, script, setScript,
  mappingDirection, setMappingDirection,
  existingBookKoTitles, existingBookZhTitles,
  inputLanguage, setInputLanguage, isOriginalText, setIsOriginalText,
  resegmentKoByZh, setResegmentKoByZh,
}: {
  bookKo: string; setBookKo: (v: string) => void;
  bookZh: string; setBookZh: (v: string) => void;
  chapter: string; setChapter: (v: string) => void;
  chapterZh: string; setChapterZh: (v: string) => void;
  script: "unknown" | "simplified" | "traditional"; setScript: (v: "unknown" | "simplified" | "traditional") => void;
  mappingDirection: MappingDirection; setMappingDirection: (v: MappingDirection) => void;
  existingBookKoTitles: string[];
  existingBookZhTitles: string[];
  inputLanguage: "ko" | "zh"; setInputLanguage: (v: "ko" | "zh") => void;
  isOriginalText: boolean; setIsOriginalText: (v: boolean) => void;
  resegmentKoByZh: boolean; setResegmentKoByZh: (v: boolean) => void;
}) {
  const { t } = useLanguage();
  const requiredBadge = <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">{t("upload.requiredLabel")}</span>;
  const [showOptional, setShowOptional] = useState(false);
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Type className="w-4 h-4 text-indigo-400" />{t("upload.inputLanguage")}</label>
          <div className="relative">
            <select value={inputLanguage} onChange={(e) => setInputLanguage(e.target.value as "ko" | "zh")}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-indigo-500/50 cursor-pointer">
              <option value="ko">{t("upload.inputLanguageKo")}</option>
              <option value="zh">{t("upload.inputLanguageZh")}</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-end">
          <div>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
            <input type="checkbox" checked={isOriginalText} onChange={(e) => setIsOriginalText(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
            {t("upload.isOriginalText")}
            </label>
            <p className="mt-1 text-xs text-slate-500">{t("upload.originalTextHint")}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-indigo-400" />{t("upload.bookNameKo")}{inputLanguage === "ko" && requiredBadge}</label>
          <input type="text" list="dataset-book-ko-options" placeholder={t("upload.bookNameKoPlaceholder")} value={bookKo} onChange={(e) => setBookKo(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
          <datalist id="dataset-book-ko-options">
            {existingBookKoTitles.map((book) => (
              <option key={book} value={book} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-emerald-400" />{t("upload.bookNameZh")}{inputLanguage === "zh" && requiredBadge}</label>
          <input type="text" list="dataset-book-zh-options" placeholder={t("upload.bookNameZhPlaceholder")} value={bookZh} onChange={(e) => setBookZh(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
          <datalist id="dataset-book-zh-options">
            {existingBookZhTitles.map((book) => (
              <option key={book} value={book} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Hash className="w-4 h-4 text-indigo-400" />{t("upload.chapterKo")}{inputLanguage === "ko" && requiredBadge}</label>
          <input type="text" placeholder={t("upload.chapterPlaceholder")} value={chapter} onChange={(e) => setChapter(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Hash className="w-4 h-4 text-emerald-400" />{t("upload.chapterZhShort")}{inputLanguage === "zh" && requiredBadge}</label>
          <input type="text" placeholder={t("upload.chapterZhPlaceholder")} value={chapterZh} onChange={(e) => setChapterZh(e.target.value)}
            className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50" />
        </div>
      </div>
      <button type="button" onClick={() => setShowOptional((v) => !v)}
        className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors">
        {showOptional ? t("upload.hideOptionalFields") : t("upload.showOptionalFields")}
      </button>
      {showOptional && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-1.5"><Type className="w-4 h-4 text-amber-400" />{t("upload.mappingDirection")}</label>
            <div className="relative">
              <select value={mappingDirection} onChange={(e) => setMappingDirection(e.target.value as MappingDirection)}
                className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-indigo-500/50 cursor-pointer">
                <option value="zh_to_ko">{t("upload.mappingDirectionZhToKo")}</option>
                <option value="ko_to_zh">{t("upload.mappingDirectionKoToZh")}</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
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
          <div className="col-span-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
              <input type="checkbox" checked={resegmentKoByZh} onChange={(e) => setResegmentKoByZh(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
              {t("upload.resegmentKoByZh")}
            </label>
            <p className="mt-1 text-xs text-slate-500">{t("upload.resegmentKoByZhHint")}</p>
          </div>
        </div>
      )}
    </>
  );
}

function DevLlmOverridePanel({
  provider,
  setProvider,
  model,
  setModel,
}: {
  provider: "auto" | LlmProvider;
  setProvider: Dispatch<SetStateAction<"auto" | LlmProvider>>;
  model: string;
  setModel: Dispatch<SetStateAction<string>>;
}) {
  const { t } = useLanguage();
  const providerKey = DEV_LLM_PROVIDER_KEYS.find((entry) => entry.value === provider)?.key ?? "translate.providerAuto";

  if (!DEV_MODE) return null;

  return (
    <div className="glass-card border border-indigo-500/20 bg-indigo-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-300/80">Dev Only</p>
          <h2 className="mt-1 text-sm font-semibold text-white">LLM Override</h2>
          <p className="mt-1 text-xs text-slate-400">
            Upload job, 후보 재추출, 정렬 적용, 편집기 AI 도구에 같은 override를 적용합니다.
          </p>
        </div>
        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium text-indigo-200">
          {t(providerKey)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">{t("translate.provider")}</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DEV_LLM_PROVIDER_KEYS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setProvider(entry.value)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  provider === entry.value
                    ? "border-indigo-500/40 bg-indigo-500/20 text-white"
                    : "border-surface-border bg-surface text-slate-300 hover:border-indigo-500/30 hover:text-white"
                }`}
              >
                {t(entry.key)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("translate.providerHint")}</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-200">{t("translate.model")}</label>
          <input
            type="text"
            list="upload-dev-llm-model-options"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={provider === "auto"}
            placeholder={provider === "auto" ? t("translate.providerAuto") : t("translate.modelPlaceholder")}
            className="w-full rounded-lg border border-surface-border bg-surface px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <datalist id="upload-dev-llm-model-options">
            {provider !== "auto" && DEV_LLM_MODEL_PRESETS[provider].map((entry) => (
              <option key={entry} value={entry} />
            ))}
          </datalist>
          <p className="mt-2 text-xs text-slate-500">
            {provider === "auto" ? "자동 선택에서는 backend 기본 모델을 사용합니다." : "비우면 선택한 provider의 기본 모델을 사용합니다."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function UploadPage() {
  const [activeTab, setActiveTab] = useState<"file" | "text">("file");

  // shared
  const [bookKo, setBookKo] = useState("");
  const [bookZh, setBookZh] = useState("");
  const [inputLanguage, setInputLanguage] = useState<"ko" | "zh">("ko");
  const [isOriginalText, setIsOriginalText] = useState(false);
  const [chapter, setChapter] = useState("");
  const [chapterZh, setChapterZh] = useState("");
  const [mappingDirection, setMappingDirection] = useState<MappingDirection>("zh_to_ko");
  const [resegmentKoByZh, setResegmentKoByZh] = useState(true);
  const [script, setScript] = useState<"unknown" | "simplified" | "traditional">("unknown");
  const [llmProvider, setLlmProvider] = useState<"auto" | LlmProvider>("auto");
  const [llmModel, setLlmModel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [autoPromote, setAutoPromote] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [promotedCount, setPromotedCount] = useState<number | null>(null);
  const [extractResult, setExtractResult] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingConflicts, setPendingConflicts] = useState<UploadConflict[]>([]);
  const [pendingAlignmentReviews, setPendingAlignmentReviews] = useState<AlignmentReview[]>([]);
  const [alignmentQueueBook, setAlignmentQueueBook] = useState("all");
  const [alignmentQueueBatch, setAlignmentQueueBatch] = useState("all");
  const [alignmentQueueReviewId, setAlignmentQueueReviewId] = useState("");
  const [resolvingConflictKeys, setResolvingConflictKeys] = useState<Set<string>>(new Set());
  const [resolvingAlignmentKeys, setResolvingAlignmentKeys] = useState<Set<string>>(new Set());
  const [uploadJobs, setUploadJobs] = useState<UploadJobItem[]>([]);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  // file tab
  const [files, setFiles] = useState<File[]>([]);

  // text tab
  const [koText, setKoText] = useState("");

  // datasets
  const [bookSummaries, setBookSummaries] = useState<BookInfo[]>([]);
  const [recordsByBook, setRecordsByBook] = useState<Record<string, DatasetRecord[]>>({});
  const [loadingBookRecords, setLoadingBookRecords] = useState<Record<string, boolean>>({});
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const bookRequestSeqRef = useRef<Record<string, number>>({});
  const [collapsedBooks, setCollapsedBooks] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<DatasetRecord | null>(null);
  const [editingBookTitle, setEditingBookTitle] = useState<BookInfo | null>(null);
  const [alignmentPreviewReview, setAlignmentPreviewReview] = useState<AlignmentReview | null>(null);
  const [alignmentPreviewRecord, setAlignmentPreviewRecord] = useState<DatasetRecord | null>(null);
  const [alignmentPreviewLoading, setAlignmentPreviewLoading] = useState(false);
  const [alignmentPreviewError, setAlignmentPreviewError] = useState<string | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [retranslatingRecordIds, setRetranslatingRecordIds] = useState<Set<string>>(new Set());
  const [focusedBook, setFocusedBook] = useState<string | null>(null);
  const [focusedRecordIds, setFocusedRecordIds] = useState<Set<string>>(new Set());
  const [reviewBook, setReviewBook] = useState("");
  const [reviewRecords, setReviewRecords] = useState<DatasetRecord[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [quickConfirmingId, setQuickConfirmingId] = useState<string | null>(null);
  const datasetsSectionRef = useRef<HTMLElement | null>(null);
  const initializedCollapsedBooksRef = useRef(false);
  const prevFocusedBookRef = useRef<string | null>(null);
  const reviewBookManuallySelectedRef = useRef(false);
  const { t, locale } = useLanguage();
  const buildLlmOverrides = useCallback((): { provider?: LlmProvider; model?: string } => {
    if (llmProvider === "auto") return {};
    const trimmedModel = llmModel.trim();
    return {
      provider: llmProvider,
      ...(trimmedModel ? { model: trimmedModel } : {}),
    };
  }, [llmModel, llmProvider]);
  const appendLlmOverridesToFormData = useCallback((formData: FormData) => {
    const overrides = buildLlmOverrides();
    if (overrides.provider) formData.append("provider", overrides.provider);
    if (overrides.model) formData.append("model", overrides.model);
  }, [buildLlmOverrides]);
  const uploadStatusLabel = (status: string) => {
    if (status === "conflict_pending") return t("upload.statusConflictPending");
    if (status === "alignment_review_needed") return t("upload.statusAlignmentReviewNeeded");
    if (status === "added_multi") return t("upload.statusAddedMulti");
    if (status === "added") return t("upload.statusAdded");
    return status;
  };
  const sourceStatusLabel = (uploadResult: UploadResult) => {
    const anyFetched = uploadResult.zh_fetched_any ?? uploadResult.zh_fetched;
    const allFetched = uploadResult.zh_fetched_all ?? uploadResult.zh_fetched;
    if (uploadResult.source_fetch_mode === "metadata_only") return t("upload.sourceZhMetadataOnly");
    if (anyFetched && !allFetched) return t("upload.sourceZhPartial");
    return anyFetched ? t("upload.sourceZhFetched") : t("upload.sourceZhNotFetched");
  };
  const chapterDisplay = (uploadResult: UploadResult) => {
    const chapters = uploadResult.created_chapters;
    if (!chapters || chapters.length === 0) return String(uploadResult.chapter);
    if (chapters.length === 1) return String(chapters[0]);

    const sorted = Array.from(chapters).sort((a, b) => a - b);
    const isContiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (isContiguous) return `${sorted[0]}-${sorted[sorted.length - 1]}`;
    return sorted.join(", ");
  };

  const sortBookRecords = useCallback(
    (records: DatasetRecord[]) => [...records].sort((a, b) => a.chapter_ko - b.chapter_ko),
    []
  );
  const conflictKey = useCallback(
    (conflict: UploadConflict) => `${conflict.record_id}:${conflict.field}:${conflict.chapter_zh}`,
    []
  );
  const alignmentReviewKey = useCallback(
    (review: AlignmentReview) => `${review.record_id}:${review.chapter_zh}`,
    []
  );
  const alignmentWarningLabel = useCallback((warning: string) => {
    switch (warning) {
      case "empty_segment":
        return t("upload.alignmentWarningEmptySegment");
      case "leading_overflow":
        return t("upload.alignmentWarningLeadingOverflow");
      case "pool_exhausted_early":
        return t("upload.alignmentWarningPoolExhaustedEarly");
      case "trailing_overflow":
        return t("upload.alignmentWarningTrailingOverflow");
      case "insufficient_progress":
        return t("upload.alignmentWarningInsufficientProgress");
      case "segment_too_short":
        return t("upload.alignmentWarningSegmentTooShort");
      case "unchanged_from_existing":
        return t("upload.alignmentWarningUnchanged");
      default:
        return warning;
    }
  }, [t]);
  const storeUploadResult = useCallback((uploadResult: UploadResult) => {
    setResult(uploadResult);
    setPendingConflicts(uploadResult.conflicts ?? []);
    setPendingAlignmentReviews(uploadResult.alignment_reviews ?? []);
    setResolvingConflictKeys(new Set());
    setResolvingAlignmentKeys(new Set());
  }, []);
  const sortAlignmentReviews = useCallback((reviews: AlignmentReview[]) => {
    return [...reviews].sort((a, b) => {
      const bookCompare = a.book.localeCompare(b.book);
      if (bookCompare !== 0) return bookCompare;
      const batchCompare = (a.batch_label || "").localeCompare(b.batch_label || "");
      if (batchCompare !== 0) return batchCompare;
      return a.chapter_ko - b.chapter_ko;
    });
  }, []);
  const upsertAlignmentReviews = useCallback((updatedReviews: AlignmentReview[]) => {
    if (updatedReviews.length === 0) return;
    setPendingAlignmentReviews((prev) => {
      const map = new Map(prev.map((review) => [review.review_id, review]));
      updatedReviews.forEach((review) => map.set(review.review_id, review));
      return sortAlignmentReviews(Array.from(map.values()));
    });
    setAlignmentPreviewReview((prev) => {
      if (!prev) return prev;
      const updated = updatedReviews.find((review) => review.review_id === prev.review_id);
      return updated ?? prev;
    });
  }, [sortAlignmentReviews]);
  const saveAlignmentReviewProposal = useCallback(async (
    reviewId: string,
    patch: { proposed_ko_text?: string; start_reason?: string; end_reason?: string }
  ) => {
    const updated = await updateAlignmentReview(reviewId, patch);
    upsertAlignmentReviews([updated]);
    return updated;
  }, [upsertAlignmentReviews]);
  const loadAlignmentReviewQueue = useCallback(async () => {
    try {
      const reviews = await listAlignmentReviews(undefined, 100);
      setPendingAlignmentReviews(sortAlignmentReviews(reviews));
      setError((prev) => (prev === t("upload.alignmentQueueLoadError") ? null : prev));
    } catch {
      setError((prev) => prev || t("upload.alignmentQueueLoadError"));
    }
  }, [sortAlignmentReviews, t]);

  const loadBookSummaries = useCallback(async () => {
    try {
      const data = await getBooks();
      setBookSummaries(data);
      setDatasetsError(null);
    } catch (err) {
      setDatasetsError(
        err instanceof Error ? err.message : t("upload.datasetsLoadError")
      );
    } finally {
      setDatasetsLoading(false);
    }
  }, [t]);

  const loadBookRecords = useCallback(
    async (book: string, options?: { force?: boolean }) => {
      if (!options?.force && recordsByBook[book]) {
        return recordsByBook[book];
      }

      const requestSeq = (bookRequestSeqRef.current[book] ?? 0) + 1;
      bookRequestSeqRef.current[book] = requestSeq;
      setLoadingBookRecords((prev) => ({ ...prev, [book]: true }));
      try {
        const data = await getDatasets(book, undefined, undefined, { bookExact: true });
        const sorted = sortBookRecords(data);
        if (bookRequestSeqRef.current[book] === requestSeq) {
          setRecordsByBook((prev) => ({ ...prev, [book]: sorted }));
          setDatasetsError(null);
        }
        return sorted;
      } catch (err) {
        if (bookRequestSeqRef.current[book] === requestSeq) {
          setDatasetsError(
            err instanceof Error ? err.message : t("upload.datasetsLoadError")
          );
        }
        return recordsByBook[book] ?? [];
      } finally {
        if (bookRequestSeqRef.current[book] === requestSeq) {
          setLoadingBookRecords((prev) => ({ ...prev, [book]: false }));
        }
      }
    },
    [recordsByBook, sortBookRecords, t]
  );

  const upsertLocalDataset = useCallback((updated: DatasetRecord) => {
    setRecordsByBook((prev) => {
      const next: Record<string, DatasetRecord[]> = {};
      let inserted = false;

      for (const [book, records] of Object.entries(prev)) {
        const filtered = records.filter((entry) => entry.id !== updated.id);
        if (book === updated.book) {
          next[book] = sortBookRecords([...filtered, updated]);
          inserted = true;
          continue;
        }
        if (filtered.length > 0) {
          next[book] = filtered;
        }
      }

      if (!inserted) {
        next[updated.book] = sortBookRecords([...(next[updated.book] ?? []), updated]);
      }

      return next;
    });
  }, [sortBookRecords]);

  const removeLocalDatasets = useCallback((recordIds: string[]) => {
    const idSet = new Set(recordIds);
    setRecordsByBook((prev) => {
      const next: Record<string, DatasetRecord[]> = {};
      for (const [book, records] of Object.entries(prev)) {
        const filtered = records.filter((entry) => !idSet.has(entry.id));
        if (filtered.length > 0) {
          next[book] = filtered;
        }
      }
      return next;
    });
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      recordIds.forEach((recordId) => next.delete(recordId));
      return next;
    });
    setFocusedRecordIds((prev) => {
      const next = new Set(prev);
      recordIds.forEach((recordId) => next.delete(recordId));
      return next;
    });
    setPreviewEntry((prev) => (prev && idSet.has(prev.id) ? null : prev));
  }, []);

  const findBooksForRecordIds = useCallback((recordIds: string[]) => {
    const idSet = new Set(recordIds);
    const books = new Set<string>();
    for (const [book, records] of Object.entries(recordsByBook)) {
      if (records.some((entry) => idSet.has(entry.id))) {
        books.add(book);
      }
    }
    return Array.from(books);
  }, [recordsByBook]);
  const findRecordById = useCallback((recordId: string) => {
    for (const records of Object.values(recordsByBook)) {
      const matched = records.find((entry) => entry.id === recordId);
      if (matched) return matched;
    }
    return null;
  }, [recordsByBook]);
  const hasSourceText = useCallback((record: DatasetRecord | null | undefined) => {
    return !!record?.zh_text?.trim();
  }, []);
  const formatRecordChapterSummary = useCallback((records: DatasetRecord[]) => {
    const grouped = new Map<string, number[]>();
    for (const record of records) {
      const list = grouped.get(record.book) ?? [];
      list.push(record.chapter_ko);
      grouped.set(record.book, list);
    }
    return Array.from(grouped.entries())
      .map(([book, chapters]) => {
        const uniqueSorted = Array.from(new Set(chapters)).sort((a, b) => a - b);
        const visible = uniqueSorted.slice(0, 8).map((chapter) => `#${chapter}`).join(", ");
        const suffix = uniqueSorted.length > 8 ? ", ..." : "";
        return `${book} ${visible}${suffix}`.trim();
      })
      .join(" / ");
  }, []);
  const buildMissingSourceMessage = useCallback((records: DatasetRecord[]) => {
    const summary = formatRecordChapterSummary(records);
    if (!summary) return t("upload.translateNeedsSource");
    return `${t("upload.translateNeedsSource")} ${summary}`;
  }, [formatRecordChapterSummary, t]);
  const focusRecords = useCallback(async (book: string, chapterValues: number[]) => {
    const uniqueChapters = Array.from(new Set(chapterValues.filter((value) => Number.isFinite(value))));
    setFocusedBook(book);
    setCollapsedBooks((prev) => {
      const next = new Set(prev);
      next.delete(book);
      return next;
    });

    const records = await loadBookRecords(book, { force: true });
    const chapterSet = new Set(uniqueChapters);
    const matchedRecords = records.filter((entry) => chapterSet.has(entry.chapter_ko));
    setFocusedRecordIds(new Set(matchedRecords.map((entry) => entry.id)));
    if (matchedRecords.length === 1) {
      setPreviewEntry(matchedRecords[0]);
    }
    datasetsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loadBookRecords]);

  const focusSingleRecord = useCallback((record: DatasetRecord) => {
    setFocusedBook(record.book);
    setFocusedRecordIds(new Set([record.id]));
    setCollapsedBooks((prev) => {
      const next = new Set(prev);
      next.delete(record.book);
      return next;
    });
    datasetsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const orderedBookSummaries = useMemo(() => {
    return [...bookSummaries].sort((a, b) => {
      if (focusedBook) {
        if (a.book === focusedBook && b.book !== focusedBook) return -1;
        if (b.book === focusedBook && a.book !== focusedBook) return 1;
      }
      return a.book.localeCompare(b.book);
    });
  }, [bookSummaries, focusedBook]);
  const selectedRecords = useMemo(
    () =>
      Array.from(selectedRecordIds)
        .map((recordId) => findRecordById(recordId))
        .filter((record): record is DatasetRecord => !!record),
    [findRecordById, selectedRecordIds]
  );
  const selectedRecordsMissingSource = useMemo(
    () => selectedRecords.filter((record) => !hasSourceText(record)),
    [hasSourceText, selectedRecords]
  );
  const reviewBooks = useMemo(
    () => orderedBookSummaries.filter((bookSummary) => bookSummary.draft > 0),
    [orderedBookSummaries]
  );
  const alignmentQueueBooks = Array.from(new Set(pendingAlignmentReviews.map((review) => review.book))).sort((a, b) => a.localeCompare(b));
  const alignmentQueueBatches = Array.from(
    new Set(
      pendingAlignmentReviews
        .filter((review) => alignmentQueueBook === "all" || review.book === alignmentQueueBook)
        .map((review) => review.batch_id || review.batch_label || review.review_id)
    )
  );
  const filteredAlignmentReviews = pendingAlignmentReviews.filter((review) => {
    if (alignmentQueueBook !== "all" && review.book !== alignmentQueueBook) return false;
    if (alignmentQueueBatch !== "all") {
      const reviewBatchKey = review.batch_id || review.batch_label || review.review_id;
      if (reviewBatchKey !== alignmentQueueBatch) return false;
    }
    return true;
  });
  const activeAlignmentReview =
    filteredAlignmentReviews.find((review) => review.review_id === alignmentQueueReviewId) ||
    filteredAlignmentReviews[0] ||
    null;
  const activeAlignmentReviewIndex = activeAlignmentReview
    ? filteredAlignmentReviews.findIndex((review) => review.review_id === activeAlignmentReview.review_id)
    : -1;

  const titleMappings = bookSummaries.reduce(
    (acc, bookSummary) => {
      const ko = (
        bookSummary.book_ko ||
        (bookSummary.book_zh ? "" : bookSummary.book) ||
        ""
      ).trim();
      const zh = (
        bookSummary.book_zh ||
        (bookSummary.book_ko ? "" : bookSummary.book) ||
        ""
      ).trim();
      if (ko && zh) {
        if (!acc.koToZh.has(ko)) acc.koToZh.set(ko, zh);
        if (!acc.zhToKo.has(zh)) acc.zhToKo.set(zh, ko);
      }
      return acc;
    },
    { koToZh: new Map<string, string>(), zhToKo: new Map<string, string>() }
  );

  const existingBookKoTitles = Array.from(titleMappings.koToZh.keys()).sort((a, b) => a.localeCompare(b));
  const existingBookZhTitles = Array.from(titleMappings.zhToKo.keys()).sort((a, b) => a.localeCompare(b));
  const handleBookKoChange = (value: string) => {
    setBookKo(value);
    const matchedZh = titleMappings.koToZh.get(value.trim());
    if (matchedZh) setBookZh(matchedZh);
  };
  const handleBookZhChange = (value: string) => {
    setBookZh(value);
    const matchedKo = titleMappings.zhToKo.get(value.trim());
    if (matchedKo) setBookKo(matchedKo);
  };

  useEffect(() => { void loadBookSummaries(); }, [loadBookSummaries]);
  useEffect(() => { void loadAlignmentReviewQueue(); }, [loadAlignmentReviewQueue]);
  useEffect(() => {
    if (alignmentQueueBook === "all") return;
    if (alignmentQueueBooks.includes(alignmentQueueBook)) return;
    setAlignmentQueueBook("all");
  }, [alignmentQueueBook, alignmentQueueBooks]);
  useEffect(() => {
    if (alignmentQueueBatch === "all") return;
    if (alignmentQueueBatches.includes(alignmentQueueBatch)) return;
    setAlignmentQueueBatch("all");
  }, [alignmentQueueBatch, alignmentQueueBatches]);
  useEffect(() => {
    if (filteredAlignmentReviews.length === 0) {
      if (alignmentQueueReviewId) setAlignmentQueueReviewId("");
      return;
    }
    if (filteredAlignmentReviews.some((review) => review.review_id === alignmentQueueReviewId)) {
      return;
    }
    setAlignmentQueueReviewId(filteredAlignmentReviews[0].review_id);
  }, [alignmentQueueReviewId, filteredAlignmentReviews]);
  useEffect(() => {
    if (initializedCollapsedBooksRef.current) return;
    if (bookSummaries.length === 0) return;
    if (focusedBook) return;
    setCollapsedBooks(new Set(bookSummaries.map((bookSummary) => bookSummary.book)));
    initializedCollapsedBooksRef.current = true;
  }, [bookSummaries, focusedBook]);
  useEffect(() => {
    let active = true;
    const loadJobs = async () => {
      try {
        const listed = await listUploadJobs(12);
        if (active) {
          setUploadJobs(listed.jobs);
          setJobsError(null);
        }
      } catch (err) {
        if (active) {
          setJobsError(
            err instanceof Error ? err.message : t("upload.jobsLoadError")
          );
        }
      }
    };
    void loadJobs();
    const timer = setInterval(() => { void loadJobs(); }, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [t]);
  useEffect(() => {
    if (reviewBookManuallySelectedRef.current) return;
    if (focusedBook === prevFocusedBookRef.current) return;
    prevFocusedBookRef.current = focusedBook;
    if (!focusedBook) return;
    if (reviewBooks.some((bookSummary) => bookSummary.book === focusedBook)) {
      setReviewBook(focusedBook);
      setReviewIndex(0);
    }
  }, [focusedBook, reviewBooks]);
  useEffect(() => {
    if (reviewBook && reviewBooks.some((bookSummary) => bookSummary.book === reviewBook)) return;
    reviewBookManuallySelectedRef.current = false;
    setReviewBook(reviewBooks[0]?.book ?? "");
    setReviewIndex(0);
  }, [reviewBook, reviewBooks]);
  useEffect(() => {
    if (!reviewBook) {
      setReviewRecords([]);
      setReviewIndex(0);
      setReviewError(null);
      return;
    }

    let active = true;
    setReviewLoading(true);
    setReviewError(null);
    void getDatasets(reviewBook, undefined, undefined, { bookExact: true, status: "draft" }).then(
      (records) => {
        if (!active) return;
        setReviewRecords(sortBookRecords(records));
        setReviewIndex(0);
      },
      (err) => {
        if (!active) return;
        setReviewRecords([]);
        setReviewError(
          err instanceof Error ? err.message : t("upload.reviewQueueLoadError")
        );
      }
    ).finally(() => {
      if (!active) return;
      setReviewLoading(false);
    });

    return () => {
      active = false;
    };
  }, [reviewBook, sortBookRecords, t]);
  useEffect(() => {
    const pendingBooks = orderedBookSummaries
      .map((bookSummary) => bookSummary.book)
      .filter((book) => !collapsedBooks.has(book))
      .filter((book) => !recordsByBook[book] && !loadingBookRecords[book]);

    if (pendingBooks.length === 0) return;

    let active = true;
    void Promise.all(
      pendingBooks.map(async (book) => {
        const records = await loadBookRecords(book);
        return { book, records };
      })
    ).then(() => {
      if (!active) return;
    });

    return () => {
      active = false;
    };
  }, [collapsedBooks, loadBookRecords, loadingBookRecords, orderedBookSummaries, recordsByBook]);

  const totalDatasetRecords = bookSummaries.reduce(
    (sum, bookSummary) => sum + bookSummary.total_records,
    0
  );
  const totalConfirmedRecords = bookSummaries.reduce(
    (sum, bookSummary) => sum + bookSummary.confirmed,
    0
  );
  const totalRecordsWithSource = bookSummaries.reduce(
    (sum, bookSummary) => sum + bookSummary.records_with_source_text,
    0
  );
  const sourceCoveragePercent = totalDatasetRecords > 0
    ? Math.round((totalRecordsWithSource / totalDatasetRecords) * 100)
    : 0;
  const confirmedPercent = totalDatasetRecords > 0
    ? Math.round((totalConfirmedRecords / totalDatasetRecords) * 100)
    : 0;
  const titleIssueCount = bookSummaries.filter((bookSummary) => {
    const ko = (bookSummary.book_ko || "").trim();
    const zh = (bookSummary.book_zh || "").trim();
    return !ko || !zh || (!!ko && !!zh && ko === zh);
  }).length;
  const missingSourceCount = Math.max(totalDatasetRecords - totalRecordsWithSource, 0);
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFiles((prev) => [...prev, ...acceptedFiles]);
      setResult(null);
      setError(null);
      setNotice(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: true,
    accept: { "text/plain": [".txt"], "text/markdown": [".md"], "text/csv": [".csv"], "application/json": [".json"] },
  });

  const expandChapterInput = (value: string): number[] => {
    const tokens = value.split(",").map((v) => v.trim()).filter(Boolean);
    const values = new Set<number>();
    for (const token of tokens) {
      if (token.includes("-")) {
        const [rawStart, rawEnd] = token.split("-", 2).map((v) => v.trim());
        if (!/^\d+$/.test(rawStart) || !/^\d+$/.test(rawEnd)) continue;
        let start = Number(rawStart);
        let end = Number(rawEnd);
        if (end < start) [start, end] = [end, start];
        for (let i = start; i <= end; i += 1) values.add(i);
        continue;
      }
      const match = token.match(/\d+/);
      if (match) values.add(Number(match[0]));
    }
    return Array.from(values).sort((a, b) => a - b);
  };

  const pickByIndex = (values: number[], index: number): number => values[Math.min(index, values.length - 1)];

  const waitForUploadResult = async (jobId: string) => {
    const status = await pollUntil({
      task: () => getUploadJob(jobId),
      isDone: (value) => value.status === "completed" && !!value.result,
      getError: (value) => (value.status === "failed" ? value.error || t("upload.uploadError") : null),
      intervalMs: 1200,
      maxAttempts: 240,
      timeoutMessage: "업로드 작업 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    });

    if (!status.result) {
      throw new Error(t("upload.uploadError"));
    }

    return status.result;
  };

  const waitForExtractResult = useCallback(async (jobId: string) => {
    const status = await pollUntil({
      task: () => getExtractUploadCandidatesJob(jobId),
      isDone: (value) => value.status === "completed",
      getError: (value) => (value.status === "failed" ? value.error || t("upload.uploadError") : null),
      intervalMs: 1200,
      maxAttempts: 160,
      timeoutMessage: "용어 추출 작업 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
    });

    return status.result ?? { updated_records: 0, total_candidates: 0 };
  }, [t]);

  const formatExtractResultMessage = useCallback((summary: {
    totalCandidates: number;
    promoted: number;
    meaningUpdated: number;
  }) => {
    return [
      `${t("upload.extractResult")}: ${summary.totalCandidates}`,
      `${t("upload.promotedResult")}: ${summary.promoted}`,
      `${t("upload.meaningRefreshResult")}: ${summary.meaningUpdated}`,
    ].join(" · ");
  }, [t]);

  const handleReextractRecords = useCallback(async (targets: DatasetRecord[]) => {
    const uniqueTargets = Array.from(
      new Map(targets.filter(Boolean).map((record) => [record.id, record])).values()
    );
    if (uniqueTargets.length === 0) return;

    const targetBooks = Array.from(new Set(uniqueTargets.map((record) => record.book).filter(Boolean)));
    const promoteTargets = Array.from(
      new Map(
        uniqueTargets.map((record) => [
          `${record.book}::${record.chapter_ko}`,
          { book: record.book, chapter_ko: record.chapter_ko },
        ])
      ).values()
    );

    setExtracting(true);
    setError(null);
    setNotice(null);
    try {
      const started = await extractUploadCandidates(
        uniqueTargets.length === 1
          ? { record_id: uniqueTargets[0].id, ...buildLlmOverrides() }
          : { record_ids: uniqueTargets.map((record) => record.id), ...buildLlmOverrides() }
      );
      const extractSummary = await waitForExtractResult(started.job_id);
      const promotedResults = await Promise.all(
        promoteTargets.map((target) => promoteUploadCandidates(target))
      );
      const promotedTotal = promotedResults.reduce((sum, item) => sum + item.added, 0);
      const meaningUpdatedTotal = promotedResults.reduce((sum, item) => sum + item.meaning_updated, 0);

      setExtractResult(
        formatExtractResultMessage({
          totalCandidates: extractSummary.total_candidates ?? 0,
          promoted: promotedTotal,
          meaningUpdated: meaningUpdatedTotal,
        })
      );

      await loadBookSummaries();

      const refreshedGroups = await Promise.all(
        targetBooks.map(async (book) => ({
          book,
          records: await loadBookRecords(book, { force: true }),
        }))
      );
      const refreshedById = new Map<string, DatasetRecord>();
      refreshedGroups.forEach((group) => {
        group.records.forEach((record) => {
          refreshedById.set(record.id, record);
        });
      });

      setPreviewEntry((prev) => {
        if (!prev) return prev;
        return refreshedById.get(prev.id) ?? prev;
      });

      if (reviewBook && targetBooks.includes(reviewBook)) {
        const reviewGroup = refreshedGroups.find((group) => group.book === reviewBook);
        if (reviewGroup) {
          const refreshedDrafts = sortBookRecords(
            reviewGroup.records.filter((record) => record.status === "draft")
          );
          const preferredIds = new Set(uniqueTargets.map((record) => record.id));
          setReviewRecords(refreshedDrafts);
          setReviewIndex((prev) => {
            const preferredIndex = refreshedDrafts.findIndex((record) => preferredIds.has(record.id));
            if (preferredIndex >= 0) return preferredIndex;
            return Math.min(prev, Math.max(refreshedDrafts.length - 1, 0));
          });
          setReviewError(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    } finally {
      setExtracting(false);
    }
  }, [
    buildLlmOverrides,
    formatExtractResultMessage,
    loadBookRecords,
    loadBookSummaries,
    reviewBook,
    sortBookRecords,
    t,
    waitForExtractResult,
  ]);

  const sanitizeFilename = (value: string) =>
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "dataset";

  const buildExportFilename = ({
    book,
    chapter,
    fmt,
    scope,
  }: {
    book: string;
    chapter?: number | string;
    fmt: "json" | "jsonl" | "txt";
    scope: "record" | "confirmed";
  }) => {
    const ext = fmt === "jsonl" ? "jsonl" : fmt === "txt" ? "txt" : "json";
    const base = scope === "confirmed"
      ? "confirmed_records"
      : `${sanitizeFilename(book)}_${chapter ?? "record"}`;
    return `${base}.${ext}`;
  };

  const handleFileUpload = async () => {
    const bookKoInput = bookKo.trim();
    const bookZhInput = bookZh.trim();
    const requiredBook = inputLanguage === "ko" ? bookKoInput : bookZhInput;
    const requiredChapter = inputLanguage === "ko" ? chapter.trim() : chapterZh.trim();
    const canonicalBook = bookKoInput || bookZhInput;
    if (files.length === 0 || !requiredBook || !requiredChapter) return;
    if (inputLanguage === "ko" && isOriginalText) {
      setError(t("upload.originalTextInvalidCombo"));
      return;
    }
    setUploading(true); setError(null); setNotice(null); setResult(null);
    setPromotedCount(null);
    setExtractResult(null);
    try {
      if (files.length === 1) {
        const formData = new FormData();
        formData.append("file", files[0]); formData.append("book", canonicalBook); formData.append("chapter", chapter);
        if (bookKoInput) formData.append("book_ko", bookKoInput);
        if (bookZhInput) formData.append("book_zh", bookZhInput);
        formData.append("input_language", inputLanguage);
        formData.append("is_original_text", String(isOriginalText));
        if (chapterZh.trim()) {
          formData.append("chapter_zh", chapterZh.trim());
        } else if (chapter.trim()) {
          formData.append("chapter_zh", chapter.trim());
        }
        formData.append("mapping_direction", mappingDirection);
        formData.append("resegment_ko_by_zh", String(resegmentKoByZh));
        formData.append("script", script);
        appendLlmOverridesToFormData(formData);
        const started = await uploadFile(formData);
        const res = started.status === "queued" ? await waitForUploadResult(started.id) : started;
        if (autoPromote && res.new_terms.length > 0) {
          const promoted = await promoteUploadCandidates({ book: res.book });
          setPromotedCount(promoted.added);
        }
        storeUploadResult(res);
        await loadAlignmentReviewQueue();
        await loadBookSummaries();
        await focusRecords(res.book, res.created_chapters?.length ? res.created_chapters : [res.chapter]);
      } else {
        const chapterInput = chapter.trim();
        const chapterZhInput = chapterZh.trim();
        const normalizedChapter = chapterInput || chapterZhInput;
        const normalizedChapterZh = chapterZhInput || chapterInput;
        const chapterKoValues = expandChapterInput(normalizedChapter);
        const chapterZhValues = expandChapterInput(normalizedChapterZh);
        if (chapterKoValues.length === 0 || chapterZhValues.length === 0) {
          throw new Error(t("upload.uploadError"));
        }
        if (!(chapterKoValues.length === 1 || chapterKoValues.length === files.length)) {
          throw new Error(`chapter count (${chapterKoValues.length}) must be 1 or equal to file count (${files.length})`);
        }
        if (!(chapterZhValues.length === 1 || chapterZhValues.length === files.length)) {
          throw new Error(`chapter_zh count (${chapterZhValues.length}) must be 1 or equal to file count (${files.length})`);
        }

        let lastResult: UploadResult | null = null;
        const aggregatedTerms = new Set<string>();
        let zhFetchedAny = false;
        let zhFetchedAll = true;
        let sourceFetchMode: UploadResult["source_fetch_mode"] = "not_configured";
        let upsertedCount = 0;
        let mergedCount = 0;
        const aggregatedConflicts: UploadConflict[] = [];
        let alignmentAppliedCount = 0;
        const aggregatedAlignmentReviews: AlignmentReview[] = [];
        for (let i = 0; i < files.length; i += 1) {
          const chapterKo = pickByIndex(chapterKoValues, i);
          const chapterZhValue = pickByIndex(chapterZhValues, i);
          const formData = new FormData();
          formData.append("file", files[i]);
          formData.append("book", canonicalBook);
          if (bookKoInput) formData.append("book_ko", bookKoInput);
          if (bookZhInput) formData.append("book_zh", bookZhInput);
          formData.append("input_language", inputLanguage);
          formData.append("is_original_text", String(isOriginalText));
          formData.append("chapter", String(chapterKo));
          formData.append("chapter_zh", String(chapterZhValue));
          formData.append("mapping_direction", mappingDirection);
          formData.append("resegment_ko_by_zh", String(resegmentKoByZh));
          formData.append("script", script);
          appendLlmOverridesToFormData(formData);
          const started = await uploadFile(formData);
          lastResult = started.status === "queued" ? await waitForUploadResult(started.id) : started;
          lastResult.new_terms.forEach((term) => aggregatedTerms.add(term));
          zhFetchedAny = zhFetchedAny || !!(lastResult.zh_fetched_any ?? lastResult.zh_fetched);
          zhFetchedAll = zhFetchedAll && !!(lastResult.zh_fetched_all ?? lastResult.zh_fetched);
          if (lastResult.source_fetch_mode === "full_text") {
            sourceFetchMode = "full_text";
          } else if (
            sourceFetchMode !== "full_text" &&
            lastResult.source_fetch_mode === "metadata_only"
          ) {
            sourceFetchMode = "metadata_only";
          } else if (
            sourceFetchMode !== "full_text" &&
            sourceFetchMode !== "metadata_only" &&
            lastResult.source_fetch_mode === "failed"
          ) {
            sourceFetchMode = "failed";
          }
          upsertedCount += lastResult.upserted_count ?? 0;
          mergedCount += lastResult.merged_count ?? 0;
          aggregatedConflicts.push(...(lastResult.conflicts ?? []));
          alignmentAppliedCount += lastResult.alignment_applied_count ?? 0;
          aggregatedAlignmentReviews.push(...(lastResult.alignment_reviews ?? []));
        }
        if (lastResult) {
          const aggregatedNewTerms = Array.from(aggregatedTerms).sort((a, b) => a.localeCompare(b));
          if (autoPromote && aggregatedNewTerms.length > 0) {
            const promoted = await promoteUploadCandidates({ book: lastResult.book });
            setPromotedCount(promoted.added);
          }
          storeUploadResult({
            ...lastResult,
            status: aggregatedConflicts.length > 0
              ? "conflict_pending"
              : aggregatedAlignmentReviews.length > 0
                ? "alignment_review_needed"
                : "added_multi",
            new_terms: aggregatedNewTerms,
            created_count: files.length,
            zh_fetched_any: zhFetchedAny,
            zh_fetched_all: zhFetchedAll,
            source_fetch_mode: sourceFetchMode,
            upserted_count: upsertedCount,
            merged_count: mergedCount,
            conflict_count: aggregatedConflicts.length,
            conflicts: aggregatedConflicts,
            alignment_applied_count: alignmentAppliedCount,
            alignment_review_count: aggregatedAlignmentReviews.length,
            alignment_reviews: aggregatedAlignmentReviews,
            created_chapters: Array.from({ length: files.length }, (_, i) => pickByIndex(chapterKoValues, i)),
          });
          await loadAlignmentReviewQueue();
          await loadBookSummaries();
          await focusRecords(
            lastResult.book,
            Array.from({ length: files.length }, (_, i) => pickByIndex(chapterKoValues, i))
          );
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : t("upload.uploadError")); } finally { setUploading(false); }
  };

  const handleTextSave = async () => {
    const bookKoInput = bookKo.trim();
    const bookZhInput = bookZh.trim();
    const requiredBook = inputLanguage === "ko" ? bookKoInput : bookZhInput;
    const requiredChapter = inputLanguage === "ko" ? chapter.trim() : chapterZh.trim();
    const canonicalBook = bookKoInput || bookZhInput;
    if (!koText.trim() || !requiredBook || !requiredChapter) return;
    if (inputLanguage === "ko" && isOriginalText) {
      setError(t("upload.originalTextInvalidCombo"));
      return;
    }
    setUploading(true); setError(null); setNotice(null); setResult(null);
    setPromotedCount(null);
    setExtractResult(null);
    try {
      const started = await uploadText({
        ko_text: koText.trim(),
        book: canonicalBook,
        book_ko: bookKoInput || undefined,
        book_zh: bookZhInput || undefined,
        input_language: inputLanguage,
        is_original_text: isOriginalText,
        resegment_ko_by_zh: resegmentKoByZh,
        chapter: chapter.trim(),
        chapter_zh: chapterZh.trim() || undefined,
        mapping_direction: mappingDirection,
        script,
        ...buildLlmOverrides(),
      });
      const res = started.status === "queued" ? await waitForUploadResult(started.id) : started;
      if (autoPromote && res.new_terms.length > 0) {
        const promoted = await promoteUploadCandidates({ book: res.book });
        setPromotedCount(promoted.added);
      }
      storeUploadResult(res);
      await loadAlignmentReviewQueue();
      await loadBookSummaries();
      await focusRecords(res.book, res.created_chapters?.length ? res.created_chapters : [res.chapter]);
    } catch (e) { setError(e instanceof Error ? e.message : t("upload.uploadError")); } finally { setUploading(false); }
  };

  const handleReset = () => {
    setFiles([]); setKoText(""); setBookKo(""); setBookZh(""); setChapter("");
    setChapterZh(""); setInputLanguage("ko"); setIsOriginalText(false); setResegmentKoByZh(true); setMappingDirection("zh_to_ko"); setScript("unknown"); setResult(null); setError(null);
    setNotice(null);
    setPendingConflicts([]);
    setPendingAlignmentReviews([]);
    setAlignmentQueueBook("all");
    setAlignmentQueueBatch("all");
    setAlignmentQueueReviewId("");
    setResolvingConflictKeys(new Set());
    setResolvingAlignmentKeys(new Set());
    setPromotedCount(null);
    setExtractResult(null);
  };

  const handlePromoteCandidates = async () => {
    if (!result?.book) return;
    setPromoting(true);
    try {
      const promoted = await promoteUploadCandidates({ book: result.book });
      setPromotedCount(promoted.added);
      setNotice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    } finally {
      setPromoting(false);
    }
  };

  const handleExtractFromRecord = async (recordId: string) => {
    const targetRecord =
      (previewEntry?.id === recordId ? previewEntry : null) ||
      (currentReviewRecord?.id === recordId ? currentReviewRecord : null) ||
      findRecordById(recordId);
    if (!targetRecord) {
      setError(t("upload.uploadError"));
      return;
    }
    await handleReextractRecords([targetRecord]);
  };

  const markRetranslatingRecords = (recordIds: string[], active: boolean) => {
    setRetranslatingRecordIds((prev) => {
      const next = new Set(prev);
      for (const recordId of recordIds) {
        if (active) next.add(recordId);
        else next.delete(recordId);
      }
      return next;
    });
  };

  const handleRetranslateRecords = async (records: DatasetRecord[]) => {
    const uniqueTargets = Array.from(
      new Map(records.filter(Boolean).map((record) => [record.id, record])).values()
    );
    if (uniqueTargets.length === 0) {
      setError(t("upload.uploadError"));
      return [];
    }

    const translatableTargets = uniqueTargets.filter((record) => hasSourceText(record));
    const skippedTargets = uniqueTargets.filter((record) => !hasSourceText(record));
    const skippedCount = skippedTargets.length;
    if (translatableTargets.length === 0) {
      setNotice(null);
      setError(buildMissingSourceMessage(skippedTargets));
      if (skippedTargets[0]) {
        focusSingleRecord(skippedTargets[0]);
      }
      return [];
    }

    const activeIds = translatableTargets.map((record) => record.id);
    const updatedRecords: DatasetRecord[] = [];
    const failedLabels: string[] = [];
    markRetranslatingRecords(activeIds, true);
    setError(null);
    setNotice(t("upload.retranslating"));

    try {
      for (const record of translatableTargets) {
        try {
          const response = await translate({
            text: record.zh_text.trim(),
            book: record.book || record.book_ko || record.book_zh || undefined,
            genre: record.genre || [],
            era_profile: record.era_profile || "ancient",
            with_annotations: false,
            with_cultural_check: false,
            ...buildLlmOverrides(),
          });
          const translated = sanitizeKoreanTranslationPunctuation(response.translated || "").trim();
          if (!translated) {
            throw new Error(t("upload.retranslateEmptyResult"));
          }

          const stamp = new Date().toISOString();
          const retranslationNote = `[retranslated:${stamp}] ${response.model || "translation-model"}`;
          const nextAlignmentRows = buildAlignmentRowsForText(
            record.id,
            record.zh_text || "",
            translated,
          );
          const updated = await updateDatasetRecord(record.id, {
            ...record,
            ko_text: translated,
            ko_text_confirmed: translated,
            status: "draft",
            human_reviewed: false,
            notes: record.notes ? `${record.notes}\n${retranslationNote}` : retranslationNote,
            alignment_rows: nextAlignmentRows,
          });
          updatedRecords.push(updated);
          upsertLocalDataset(updated);
          if (previewEntry?.id === updated.id) setPreviewEntry(updated);
          if (alignmentPreviewRecord?.id === updated.id) setAlignmentPreviewRecord(updated);
        } catch (e) {
          console.error("[retranslate] failed", record.id, e);
          failedLabels.push(`${record.book} #${record.chapter_ko}`);
        }
      }

      const affectedBooks = Array.from(new Set(updatedRecords.map((record) => record.book)));
      await loadBookSummaries();
      await Promise.all(affectedBooks.map((book) => loadBookRecords(book, { force: true })));
      if (reviewBook && affectedBooks.includes(reviewBook)) {
        const refreshedDrafts = await getDatasets(
          reviewBook,
          undefined,
          undefined,
          { bookExact: true, status: "draft" }
        );
        setReviewRecords(sortBookRecords(refreshedDrafts));
        setReviewIndex((prev) => Math.min(prev, Math.max(refreshedDrafts.length - 1, 0)));
      }
      if (updatedRecords.length === 1) {
        focusSingleRecord(updatedRecords[0]);
      } else if (updatedRecords.length > 1) {
        setFocusedBook(updatedRecords[0].book);
        setFocusedRecordIds(new Set(updatedRecords.map((record) => record.id)));
        setCollapsedBooks((prev) => {
          const next = new Set(prev);
          affectedBooks.forEach((book) => next.delete(book));
          return next;
        });
      }

      if (failedLabels.length > 0) {
        setError(`${t("upload.retranslateFailed")}: ${failedLabels.join(", ")}`);
      } else if (skippedCount > 0) {
        setNotice(`${t("upload.retranslatePartialSuccess")} ${formatRecordChapterSummary(skippedTargets)}`);
      } else {
        setNotice(`${updatedRecords.length}${t("upload.entries")} ${t("upload.retranslateSuccess")}`);
      }
      return updatedRecords;
    } finally {
      markRetranslatingRecords(activeIds, false);
    }
  };

  const handleRetranslateRecordById = async (recordId: string) => {
    const targetRecord =
      (previewEntry?.id === recordId ? previewEntry : null) ||
      (currentReviewRecord?.id === recordId ? currentReviewRecord : null) ||
      findRecordById(recordId);
    if (!targetRecord) {
      setError(t("upload.uploadError"));
      return;
    }
    if (!hasSourceText(targetRecord)) {
      setNotice(null);
      setError(buildMissingSourceMessage([targetRecord]));
      focusSingleRecord(targetRecord);
      return;
    }
    await handleRetranslateRecords([targetRecord]);
  };

  const handleRetranslateRecord = async (record: DatasetRecord) => {
    const updated = await handleRetranslateRecords([record]);
    return updated[0];
  };

  const handleSaveRecord = async (record: DatasetRecord) => {
    try {
      const updated = await updateDatasetRecord(record.id, record);
      const refreshedBookRecords = await loadBookRecords(updated.book, { force: true });
      const canonical = refreshedBookRecords.find((entry) => entry.id === updated.id) ?? updated;
      upsertLocalDataset(canonical);
      if (reviewBook === canonical.book) {
        const refreshedDrafts = sortBookRecords(
          refreshedBookRecords.filter((entry) => entry.status === "draft")
        );
        setReviewRecords(refreshedDrafts);
        setReviewIndex((prev) => {
          const preferredIndex = refreshedDrafts.findIndex((entry) => entry.id === canonical.id);
          if (preferredIndex >= 0) return preferredIndex;
          return Math.min(prev, Math.max(refreshedDrafts.length - 1, 0));
        });
      }
      await loadBookSummaries();
      focusSingleRecord(canonical);
      setPreviewEntry(canonical);
      setNotice(t("upload.saveSuccess"));
      setError(null);
      return canonical;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
      return undefined;
    }
  };

  const handleRestoreDraftHistory = async (recordId: string, historyId: string) => {
    try {
      const restored = await restoreDraftHistory(recordId, historyId);
      const updated = restored.record;
      upsertLocalDataset(updated);
      await loadBookSummaries();
      await loadBookRecords(updated.book, { force: true });
      focusSingleRecord(updated);
      setPreviewEntry(updated);
      setNotice(t("upload.draftHistoryRestoreSuccess"));
      setError(null);
      return updated;
    } catch (e) {
      const message = e instanceof Error ? e.message : t("upload.draftHistoryRestoreFailed");
      setError(message);
      throw new Error(message);
    }
  };

  const handleUpdateBookTitle = async (currentBook: string, nextBookKo: string, nextBookZh: string) => {
    const bookKoValue = nextBookKo.trim();
    const bookZhValue = nextBookZh.trim();
    if (!bookKoValue && !bookZhValue) {
      setError(t("upload.bookTitleRequired"));
      return;
    }

    try {
      const updated = await updateBookTitles({
        current_book: currentBook,
        book: bookKoValue || bookZhValue,
        book_ko: bookKoValue || undefined,
        book_zh: bookZhValue || undefined,
      });
      setEditingBookTitle(null);
      setRecordsByBook({});
      setFocusedBook(updated.book);
      setFocusedRecordIds(new Set());
      setCollapsedBooks((prev) => {
        const next = new Set(prev);
        next.delete(updated.book);
        next.delete(currentBook);
        return next;
      });
      if (reviewBook === currentBook) setReviewBook(updated.book);
      await loadBookSummaries();
      await loadBookRecords(updated.book, { force: true });
      setNotice(`${t("upload.bookTitleUpdateSuccess")} ${updated.updated_count}${t("upload.entries")}`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.bookTitleUpdateError"));
    }
  };

  const handleConfirmRecord = async (
    recordId: string,
    body: { ko_text_confirmed: string; review_note?: string; alignment_rows?: DatasetAlignmentRow[] }
  ) => {
    try {
      const updated = await confirmRecord(recordId, body);
      upsertLocalDataset(updated);
      await loadBookSummaries();
      focusSingleRecord(updated);
      setPreviewEntry(updated);
      setNotice(t("upload.confirmSuccess"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    }
  };

  const handleExportRecord = async (
    record: DatasetRecord,
    fmt: "json" | "jsonl" | "txt"
  ) => {
    if (record.status !== "confirmed") {
      setError(t("upload.exportConfirmedOnly"));
      return;
    }
    try {
      const response = await exportRecord(record.id, fmt);
      await downloadResponse(
        response,
        buildExportFilename({
          book: record.book,
          chapter: record.chapter_ko,
          fmt,
          scope: "record",
        })
      );
      setNotice(t("upload.exportSuccess"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    }
  };

  const handleExportAllConfirmed = async () => {
    try {
      const response = await exportAllConfirmed("jsonl");
      await downloadResponse(
        response,
        buildExportFilename({
          book: "dataset",
          fmt: "jsonl",
          scope: "confirmed",
        })
      );
      setNotice(t("upload.exportSuccess"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    if (!window.confirm(t("upload.confirmDeleteRecord"))) return;
    const targetBooks = findBooksForRecordIds([recordId]);
    try {
      await deleteDatasetRecord(recordId);
      removeLocalDatasets([recordId]);
      await loadBookSummaries();
      await Promise.all(targetBooks.map((book) => loadBookRecords(book, { force: true })));
      setNotice(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    }
  };
  const handleKeepConflict = (conflict: UploadConflict) => {
    const key = conflictKey(conflict);
    setPendingConflicts((prev) => prev.filter((item) => conflictKey(item) !== key));
    setNotice(t("upload.conflictResolvedKeep"));
    setError(null);
  };
  const findNextAlignmentReviewId = useCallback((reviewId: string) => {
    const index = filteredAlignmentReviews.findIndex((review) => review.review_id === reviewId);
    if (index === -1) return filteredAlignmentReviews[0]?.review_id || "";
    return (
      filteredAlignmentReviews[index + 1]?.review_id ||
      filteredAlignmentReviews[index - 1]?.review_id ||
      ""
    );
  }, [filteredAlignmentReviews]);
  const handleOverwriteConflict = async (conflict: UploadConflict) => {
    const key = conflictKey(conflict);
    setResolvingConflictKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      let current = findRecordById(conflict.record_id);
      if (!current && conflict.book) {
        const refreshed = await loadBookRecords(conflict.book, { force: true });
        current = refreshed.find((entry) => entry.id === conflict.record_id) ?? null;
      }
      if (!current) {
        throw new Error(t("upload.conflictResolveError"));
      }

      const stamp = new Date().toISOString();
      const resolutionNote = `[conflict_resolved:${conflict.field}] overwritten with uploaded value at ${stamp}`;
      const updated = await updateDatasetRecord(conflict.record_id, {
        ...current,
        [conflict.field]: conflict.incoming_value,
        notes: current.notes ? `${current.notes}\n${resolutionNote}` : resolutionNote,
      });
      upsertLocalDataset(updated);
      await loadBookSummaries();
      focusSingleRecord(updated);
      if (previewEntry?.id === updated.id) {
        setPreviewEntry(updated);
      }
      setPendingConflicts((prev) => prev.filter((item) => conflictKey(item) !== key));
      setNotice(t("upload.conflictResolvedOverwrite"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.conflictResolveError"));
    } finally {
      setResolvingConflictKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
  const handleKeepAlignmentReview = (review: AlignmentReview) => {
    const key = alignmentReviewKey(review);
    const nextReviewId = findNextAlignmentReviewId(review.review_id);
    setResolvingAlignmentKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    void keepAlignmentReview(review.review_id)
      .then(async () => {
        await loadAlignmentReviewQueue();
        setAlignmentQueueReviewId(nextReviewId);
        if (alignmentPreviewReview?.review_id === review.review_id) {
          setAlignmentPreviewReview(null);
          setAlignmentPreviewRecord(null);
        }
        setNotice(t("upload.alignmentResolvedKeep"));
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : t("upload.alignmentResolveError"));
      })
      .finally(() => {
        setResolvingAlignmentKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  };
  const handleApplyAlignmentReview = async (review: AlignmentReview, proposedOverride?: string) => {
    const key = alignmentReviewKey(review);
    const nextReviewId = findNextAlignmentReviewId(review.review_id);
    setResolvingAlignmentKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    try {
      const updated = await applyAlignmentReview(
        review.review_id,
        {
          ...(proposedOverride && proposedOverride !== review.proposed_ko_text
            ? { proposed_ko_text: proposedOverride }
            : {}),
          ...buildLlmOverrides(),
        },
      );
      upsertLocalDataset(updated);
      await loadBookSummaries();
      await loadBookRecords(review.book, { force: true });
      await loadAlignmentReviewQueue();
      setAlignmentQueueReviewId(nextReviewId);
      focusSingleRecord(updated);
      if (previewEntry?.id === updated.id) {
        setPreviewEntry(updated);
      }
      if (alignmentPreviewReview?.review_id === review.review_id) {
        setAlignmentPreviewRecord(updated);
        setAlignmentPreviewReview(null);
      }
      setNotice(t("upload.alignmentResolvedApply"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.alignmentResolveError"));
    } finally {
      setResolvingAlignmentKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };
  const openAlignmentPreview = useCallback(async (review: AlignmentReview) => {
    setAlignmentQueueReviewId(review.review_id);
    setAlignmentPreviewReview(review);
    setAlignmentPreviewLoading(true);
    setAlignmentPreviewError(null);
    try {
      let current = findRecordById(review.record_id);
      if (!current && review.book) {
        const refreshed = await loadBookRecords(review.book, { force: true });
        current = refreshed.find((entry) => entry.id === review.record_id) ?? null;
      }
      if (!current) {
        throw new Error(t("upload.alignmentPreviewLoadError"));
      }
      setAlignmentPreviewRecord(current);
    } catch (e) {
      setAlignmentPreviewRecord(null);
      setAlignmentPreviewError(
        e instanceof Error ? e.message : t("upload.alignmentPreviewLoadError")
      );
    } finally {
      setAlignmentPreviewLoading(false);
    }
  }, [findRecordById, loadBookRecords, t]);
  const handleAdjustAlignmentBoundary = useCallback(async (
    review: AlignmentReview,
    direction: "send_start_to_prev" | "send_end_to_next" | "pull_from_prev" | "pull_from_next",
  ) => {
    const primaryKey = alignmentReviewKey(review);
    setResolvingAlignmentKeys((prev) => {
      const next = new Set(prev);
      next.add(primaryKey);
      return next;
    });
    try {
      const updatedReviews = await adjustAlignmentReviewBoundary(review.review_id, { direction });
      upsertAlignmentReviews(updatedReviews);
      setNotice(t("upload.alignmentBoundaryAdjusted"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.alignmentBoundaryAdjustError"));
    } finally {
      setResolvingAlignmentKeys((prev) => {
        const next = new Set(prev);
        next.delete(primaryKey);
        return next;
      });
    }
  }, [alignmentReviewKey, t, upsertAlignmentReviews]);
  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };
  const clearSelection = () => setSelectedRecordIds(new Set());
  const handleBulkExtract = async () => {
    if (selectedRecordIds.size === 0) return;
    const targets = Array.from(selectedRecordIds)
      .map((recordId) => findRecordById(recordId))
      .filter((record): record is DatasetRecord => !!record);
    if (targets.length === 0) {
      setError(t("upload.uploadError"));
      return;
    }
    await handleReextractRecords(targets);
  };
  const handleBulkRetranslate = async () => {
    if (selectedRecordIds.size === 0) return;
    const targets = Array.from(selectedRecordIds)
      .map((recordId) => findRecordById(recordId))
      .filter((record): record is DatasetRecord => !!record);
    if (targets.length === 0) {
      setError(t("upload.uploadError"));
      return;
    }
    await handleRetranslateRecords(targets);
  };
  const handleBulkDelete = async () => {
    if (selectedRecordIds.size === 0) return;
    if (!window.confirm(`${t("upload.confirmDeleteSelected")} (${selectedRecordIds.size})`)) return;
    const ids = Array.from(selectedRecordIds);
    try {
      await Promise.all(ids.map((id) => deleteDatasetRecord(id)));
      removeLocalDatasets(ids);
      await loadBookSummaries();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("upload.uploadError"));
    }
  };
  const openCurrentDraftForReview = useCallback(() => {
    const activeRecord = reviewRecords[reviewIndex] ?? null;
    if (!activeRecord) return;
    focusSingleRecord(activeRecord);
    setPreviewEntry(activeRecord);
    setReviewError(null);
  }, [focusSingleRecord, reviewIndex, reviewRecords]);
  const handleQuickConfirmCurrentDraft = useCallback(async () => {
    const activeRecord = reviewRecords[reviewIndex] ?? null;
    if (!activeRecord) return;
    const confirmedText = preferredRecordTranslation(activeRecord).trim();
    if (!confirmedText) {
      setReviewError(t("upload.reviewQueueEmptyDraft"));
      return;
    }
    setQuickConfirmingId(activeRecord.id);
    try {
      const updated = await confirmRecord(activeRecord.id, {
        ko_text_confirmed: confirmedText,
        review_note: "Quick confirmed from confirm queue",
      });
      upsertLocalDataset(updated);
      await loadBookSummaries();
      await loadBookRecords(activeRecord.book, { force: true });
      const refreshedDrafts = await getDatasets(
        activeRecord.book,
        undefined,
        undefined,
        { bookExact: true, status: "draft" }
      );
      setReviewRecords(sortBookRecords(refreshedDrafts));
      setReviewIndex((prev) => {
        const maxIndex = Math.max(refreshedDrafts.length - 1, 0);
        return Math.min(prev, maxIndex);
      });
      setNotice(t("upload.reviewQueueConfirmSuccess"));
      setError(null);
      setReviewError(null);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : t("upload.reviewQueueConfirmError"));
    } finally {
      setQuickConfirmingId(null);
    }
  }, [loadBookRecords, loadBookSummaries, reviewIndex, reviewRecords, sortBookRecords, t, upsertLocalDataset]);
  const toggleBookCollapse = async (book: string) => {
    const willExpand = collapsedBooks.has(book);
    setCollapsedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(book)) next.delete(book);
      else next.add(book);
      return next;
    });
    if (willExpand) {
      await loadBookRecords(book);
    }
  };
  const requiredBookReady = inputLanguage === "ko" ? !!bookKo.trim() : !!bookZh.trim();
  const requiredChapterReady = inputLanguage === "ko" ? !!chapter.trim() : !!chapterZh.trim();
  const fileReady = files.length > 0 && requiredBookReady && requiredChapterReady;
  const textReady = !!koText.trim() && requiredBookReady && requiredChapterReady;
  const currentReviewRecord = reviewRecords[reviewIndex] ?? null;
  const resultHint = !result
    ? null
    : pendingConflicts.length > 0
      ? t("upload.resultConflictHint")
      : pendingAlignmentReviews.length > 0
        ? t("upload.resultAlignmentReviewHint")
      : (result.merged_count ?? 0) > 0
        ? t("upload.resultMergedHint")
        : t("upload.resultCreatedHint");
  const reviewPending = pendingConflicts.length > 0 || pendingAlignmentReviews.length > 0;
  const splitPreviewUnits = (text: string) => {
    const lines = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length >= 2) return lines;
    return text
      .split(/(?<=[.!?。！？…])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);
  };
  const boundarySnippet = (text: string, side: "start" | "end", count: number = 2) => {
    const units = splitPreviewUnits(text);
    if (units.length === 0) return "—";
    const selected = side === "start" ? units.slice(0, count) : units.slice(-count);
    const snippet = selected.join("\n").trim();
    if (snippet.length <= 280) return snippet;
    return side === "start" ? `${snippet.slice(0, 280)}…` : `…${snippet.slice(-280)}`;
  };
  const renderAlignmentReviewSection = () => {
    if (pendingAlignmentReviews.length === 0) return null;
    return (
      <div className="glass-card border border-amber-500/20 bg-amber-500/5 p-6">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          {t("upload.alignmentReviewTitle")}
        </h3>
        <p className="text-sm text-amber-200/80">{t("upload.alignmentReviewSubtitle")}</p>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[180px]">
              <label className="text-xs text-slate-500">{t("upload.alignmentQueueBookFilter")}</label>
              <select
                value={alignmentQueueBook}
                onChange={(e) => {
                  setAlignmentQueueBook(e.target.value);
                  setAlignmentQueueBatch("all");
                }}
                className="mt-1 w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
              >
                <option value="all">{t("upload.alignmentQueueAllBooks")}</option>
                {alignmentQueueBooks.map((book) => (
                  <option key={book} value={book}>{book}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="text-xs text-slate-500">{t("upload.alignmentQueueBatchFilter")}</label>
              <select
                value={alignmentQueueBatch}
                onChange={(e) => setAlignmentQueueBatch(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500/50"
              >
                <option value="all">{t("upload.alignmentQueueAllBatches")}</option>
                {alignmentQueueBatches.map((batchKey) => {
                  const sample = pendingAlignmentReviews.find((review) => {
                    if (alignmentQueueBook !== "all" && review.book !== alignmentQueueBook) return false;
                    return (review.batch_id || review.batch_label || review.review_id) === batchKey;
                  });
                  const label = sample?.batch_label || batchKey;
                  return <option key={batchKey} value={batchKey}>{label}</option>;
                })}
              </select>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const previous = filteredAlignmentReviews[activeAlignmentReviewIndex - 1];
                  if (previous) setAlignmentQueueReviewId(previous.review_id);
                }}
                disabled={activeAlignmentReviewIndex <= 0}
                className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("upload.alignmentQueuePrevious")}
              </button>
              <div className="px-3 py-2 rounded-lg border border-white/5 bg-surface/70 text-sm text-slate-300">
                {activeAlignmentReviewIndex >= 0
                  ? `${activeAlignmentReviewIndex + 1} / ${filteredAlignmentReviews.length}`
                  : `0 / ${filteredAlignmentReviews.length}`}
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = filteredAlignmentReviews[activeAlignmentReviewIndex + 1];
                  if (next) setAlignmentQueueReviewId(next.review_id);
                }}
                disabled={activeAlignmentReviewIndex < 0 || activeAlignmentReviewIndex >= filteredAlignmentReviews.length - 1}
                className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("upload.alignmentQueueNext")}
              </button>
            </div>
          </div>

          {activeAlignmentReview ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_320px]">
              <div className="rounded-xl border border-amber-500/20 bg-surface/50 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-white">{activeAlignmentReview.book}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-300">{t("upload.chapter")} {activeAlignmentReview.chapter_ko}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-amber-200">{t("upload.alignmentConfidence")}: {(activeAlignmentReview.confidence * 100).toFixed(0)}%</span>
                  {activeAlignmentReview.batch_label && (
                    <>
                      <span className="text-slate-500">·</span>
                      <span className="px-2 py-0.5 rounded-full bg-surface-light border border-surface-border text-xs text-slate-300">
                        {t("upload.alignmentQueueBatch")}: {activeAlignmentReview.batch_label}
                      </span>
                    </>
                  )}
                  {!!activeAlignmentReview.batch_total && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200">
                      {activeAlignmentReview.batch_index || 1}/{activeAlignmentReview.batch_total}
                    </span>
                  )}
                </div>
                {activeAlignmentReview.warnings.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {activeAlignmentReview.warnings.map((warning) => (
                      <span
                        key={`${activeAlignmentReview.review_id}:${warning}`}
                        className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-200 text-[11px] border border-amber-500/20"
                      >
                        {alignmentWarningLabel(warning)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3 space-y-3">
                    <p className="text-xs font-medium text-slate-400">{t("upload.alignmentBoundaryCurrent")}</p>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">{t("upload.alignmentBoundaryStart")}</p>
                      <pre className="whitespace-pre-wrap break-words text-xs text-slate-200">{boundarySnippet(activeAlignmentReview.existing_ko_text, "start")}</pre>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">{t("upload.alignmentBoundaryEnd")}</p>
                      <pre className="whitespace-pre-wrap break-words text-xs text-slate-200">{boundarySnippet(activeAlignmentReview.existing_ko_text, "end")}</pre>
                    </div>
                  </div>
                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-3">
                    <p className="text-xs font-medium text-indigo-200">{t("upload.alignmentBoundaryProposed")}</p>
                    <div>
                      <p className="text-[11px] text-indigo-200/70 mb-1">{t("upload.alignmentBoundaryStart")}</p>
                      <pre className="whitespace-pre-wrap break-words text-xs text-slate-100">{boundarySnippet(activeAlignmentReview.proposed_ko_text, "start")}</pre>
                    </div>
                    <div>
                      <p className="text-[11px] text-indigo-200/70 mb-1">{t("upload.alignmentBoundaryEnd")}</p>
                      <pre className="whitespace-pre-wrap break-words text-xs text-slate-100">{boundarySnippet(activeAlignmentReview.proposed_ko_text, "end")}</pre>
                    </div>
                  </div>
                </div>
                {(activeAlignmentReview.start_reason || activeAlignmentReview.end_reason) && (
                  <div className="grid gap-2 lg:grid-cols-2 text-xs text-slate-400">
                    <div className="rounded-lg border border-surface-border bg-surface-light/40 p-3">
                      <p className="font-medium text-slate-300 mb-1">{t("upload.alignmentStartReason")}</p>
                      <p>{activeAlignmentReview.start_reason || "—"}</p>
                    </div>
                    <div className="rounded-lg border border-surface-border bg-surface-light/40 p-3">
                      <p className="font-medium text-slate-300 mb-1">{t("upload.alignmentEndReason")}</p>
                      <p>{activeAlignmentReview.end_reason || "—"}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { void openAlignmentPreview(activeAlignmentReview); }}
                    disabled={resolvingAlignmentKeys.has(alignmentReviewKey(activeAlignmentReview))}
                    className="px-3 py-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-sm text-indigo-200 hover:text-white hover:border-indigo-400/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    {t("upload.alignmentQueueOpenDetail")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeepAlignmentReview(activeAlignmentReview)}
                    disabled={resolvingAlignmentKeys.has(alignmentReviewKey(activeAlignmentReview))}
                    className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("upload.alignmentKeepExisting")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleApplyAlignmentReview(activeAlignmentReview); }}
                    disabled={resolvingAlignmentKeys.has(alignmentReviewKey(activeAlignmentReview))}
                    className="px-3 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {resolvingAlignmentKeys.has(alignmentReviewKey(activeAlignmentReview)) && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("upload.alignmentApply")}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/5 bg-surface/50 p-4">
                <h4 className="text-sm font-semibold text-white mb-3">{t("upload.alignmentQueuePendingList")}</h4>
                <div className="space-y-2 max-h-[480px] overflow-auto pr-1">
                  {filteredAlignmentReviews.map((review) => {
                    const isActive = activeAlignmentReview?.review_id === review.review_id;
                    return (
                      <button
                        key={review.review_id}
                        type="button"
                        onClick={() => setAlignmentQueueReviewId(review.review_id)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          isActive
                            ? "border-indigo-500/40 bg-indigo-500/10"
                            : "border-surface-border bg-surface-light/40 hover:border-indigo-500/20 hover:bg-surface-light/70"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-white font-medium">{review.book}</span>
                          <span className="text-slate-500">#{review.chapter_ko}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="text-amber-200">{(review.confidence * 100).toFixed(0)}%</span>
                          {review.batch_label && (
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-white/5 text-slate-300">
                              {review.batch_label}
                            </span>
                          )}
                          {!!review.batch_total && (
                            <span className="text-slate-500">{review.batch_index || 1}/{review.batch_total}</span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-400 line-clamp-3">
                          {boundarySnippet(review.proposed_ko_text, "start")}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-surface-border bg-surface/60 p-6 text-sm text-slate-400">
              {t("upload.alignmentQueueEmptyFilter")}
            </div>
          )}
        </div>
      </div>
    );
  };
  const alignmentPreviewNeighbors = (() => {
    if (!alignmentPreviewReview) {
      return { previous: null as AlignmentReview | null, next: null as AlignmentReview | null };
    }
    const siblings = pendingAlignmentReviews
      .filter((review) => review.book === alignmentPreviewReview.book)
      .sort((a, b) => a.chapter_ko - b.chapter_ko);
    const index = siblings.findIndex((review) => review.review_id === alignmentPreviewReview.review_id);
    return {
      previous: index > 0 ? siblings[index - 1] : null,
      next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
    };
  })();

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-navy-700 flex items-center justify-center"><Upload className="w-5 h-5 text-white" /></div>
          {t("upload.title")}
        </h1>
        <p className="text-slate-400 mt-1">{t("upload.subtitle")}</p>
        <p className="text-xs text-slate-500 mt-2">{t("upload.twoStepHint")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {[
          { icon: Upload, title: t("upload.workflowStepUpload"), hint: t("upload.workflowStepUploadHint") },
          { icon: Languages, title: t("upload.workflowStepRetranslate"), hint: t("upload.workflowStepRetranslateHint") },
          { icon: CheckCircle, title: t("upload.workflowStepConfirm"), hint: t("upload.workflowStepConfirmHint") },
        ].map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="rounded-2xl border border-white/5 bg-surface/70 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-xs font-semibold text-indigo-200">
                  {index + 1}
                </span>
                <Icon className="h-4 w-4 text-indigo-300" />
                <h2 className="text-sm font-semibold text-white">{step.title}</h2>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{step.hint}</p>
            </div>
          );
        })}
      </div>

      <DevLlmOverridePanel
        provider={llmProvider}
        setProvider={setLlmProvider}
        model={llmModel}
        setModel={setLlmModel}
      />

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
              <div {...getRootProps()} className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${isDragActive ? "dropzone-active" : files.length > 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-surface-border hover:border-indigo-500/30 hover:bg-indigo-500/5"}`}>
                <input {...getInputProps()} />
                {files.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4"><FileText className="w-8 h-8 text-emerald-400" /></div>
                    <p className="text-white font-semibold">
                      {files.length === 1 ? files[0].name : `${files.length} ${t("upload.filesSelected")}`}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      {(files.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)} KB
                    </p>
                    <button onClick={(e) => { e.stopPropagation(); setFiles([]); }} className="mt-3 text-xs text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"><X className="w-3 h-3" />{t("upload.remove")}</button>
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

              <MetadataFields bookKo={bookKo} setBookKo={handleBookKoChange} bookZh={bookZh} setBookZh={handleBookZhChange} chapter={chapter} setChapter={setChapter}
                chapterZh={chapterZh} setChapterZh={setChapterZh} script={script} setScript={setScript}
                mappingDirection={mappingDirection} setMappingDirection={setMappingDirection}
                existingBookKoTitles={existingBookKoTitles} existingBookZhTitles={existingBookZhTitles}
                inputLanguage={inputLanguage} setInputLanguage={setInputLanguage}
                isOriginalText={isOriginalText} setIsOriginalText={setIsOriginalText}
                resegmentKoByZh={resegmentKoByZh} setResegmentKoByZh={setResegmentKoByZh} />
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
                <input type="checkbox" checked={autoPromote} onChange={(e) => setAutoPromote(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                {t("upload.autoPromote")}
              </label>

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

              <MetadataFields bookKo={bookKo} setBookKo={handleBookKoChange} bookZh={bookZh} setBookZh={handleBookZhChange} chapter={chapter} setChapter={setChapter}
                chapterZh={chapterZh} setChapterZh={setChapterZh} script={script} setScript={setScript}
                mappingDirection={mappingDirection} setMappingDirection={setMappingDirection}
                existingBookKoTitles={existingBookKoTitles} existingBookZhTitles={existingBookZhTitles}
                inputLanguage={inputLanguage} setInputLanguage={setInputLanguage}
                isOriginalText={isOriginalText} setIsOriginalText={setIsOriginalText}
                resegmentKoByZh={resegmentKoByZh} setResegmentKoByZh={setResegmentKoByZh} />
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400">
                <input type="checkbox" checked={autoPromote} onChange={(e) => setAutoPromote(e.target.checked)} className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                {t("upload.autoPromote")}
              </label>

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
      {notice && (
        <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-300 text-sm">{notice}</p>
        </div>
      )}
      {extractResult && (
        <div className="glass-card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-300 text-sm">{extractResult}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4 animate-slide-up">
        <div className={`glass-card p-4 flex items-center gap-3 ${
            reviewPending
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-emerald-500/20 bg-emerald-500/5"
          }`}>
            {reviewPending ? (
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            )}
            <div className={`text-sm ${reviewPending ? "text-amber-200" : "text-emerald-300"}`}>
              <p className="font-medium">{result.book} — {t("upload.chapter")} {chapterDisplay(result)}</p>
              <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                {uploadStatusLabel(
                  pendingConflicts.length > 0
                    ? "conflict_pending"
                    : pendingAlignmentReviews.length > 0
                      ? "alignment_review_needed"
                      : result.status === "conflict_pending" || result.status === "alignment_review_needed"
                      ? (result.created_count && result.created_count > 1 ? "added_multi" : "added")
                      : result.status
                )} · {sourceStatusLabel(result)}
              </p>
              {result.created_count && result.created_count > 1 && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                  {t("upload.createdCount")}: {result.created_count}
                </p>
              )}
              {promotedCount !== null && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                  {t("upload.promotedResult")}: {promotedCount}
                </p>
              )}
              {typeof result.upserted_count === "number" && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                  {t("upload.upsertedCount")}: {result.upserted_count}
                </p>
              )}
              {typeof result.merged_count === "number" && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                  {t("upload.mergedFieldsCount")}: {result.merged_count}
                </p>
              )}
              {typeof result.alignment_applied_count === "number" && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>
                  {t("upload.alignmentAppliedCount")}: {result.alignment_applied_count}
                </p>
              )}
              {pendingConflicts.length > 0 && (
                <p className="text-amber-300/80 text-xs mt-0.5">
                  {t("upload.conflictCount")}: {pendingConflicts.length}
                </p>
              )}
              {pendingAlignmentReviews.length > 0 && (
                <p className="text-amber-300/80 text-xs mt-0.5">
                  {t("upload.alignmentReviewCount")}: {pendingAlignmentReviews.length}
                </p>
              )}
              {extractResult && (
                <p className={`text-xs mt-0.5 ${reviewPending ? "text-amber-300/80" : "text-emerald-400/70"}`}>{extractResult}</p>
              )}
              {resultHint && (
                <p className={`text-xs mt-1.5 ${reviewPending ? "text-amber-200/90" : "text-emerald-200/90"}`}>
                  {resultHint}
                </p>
              )}
            </div>
          </div>
          {pendingConflicts.length > 0 && (
            <div className="glass-card border border-amber-500/20 bg-amber-500/5 p-6">
              <h3 className="text-white font-semibold flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                {t("upload.conflictReviewTitle")}
              </h3>
              <p className="text-sm text-amber-200/80">{t("upload.conflictReviewSubtitle")}</p>
              <div className="mt-4 space-y-4">
                {pendingConflicts.map((conflict) => {
                  const key = conflictKey(conflict);
                  const resolving = resolvingConflictKeys.has(key);
                  const fieldLabel = conflict.field === "ko_text"
                    ? t("upload.conflictFieldKoText")
                    : t("upload.conflictFieldZhText");
                  return (
                    <div key={key} className="rounded-xl border border-amber-500/20 bg-surface/50 p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-white">{conflict.book}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300">{t("upload.chapter")} {conflict.chapter_ko}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-amber-200">{fieldLabel}</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-surface-border bg-surface-light/60 p-3">
                          <p className="text-xs font-medium text-slate-400 mb-2">{t("upload.conflictExisting")}</p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">{conflict.existing_value || "—"}</pre>
                        </div>
                        <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
                          <p className="text-xs font-medium text-indigo-200 mb-2">{t("upload.conflictIncoming")}</p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-100">{conflict.incoming_value || "—"}</pre>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleKeepConflict(conflict)}
                          disabled={resolving}
                          className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t("upload.conflictKeepExisting")}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleOverwriteConflict(conflict); }}
                          disabled={resolving}
                          className="px-3 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {resolving && <Loader2 className="w-4 h-4 animate-spin" />}
                          {t("upload.conflictOverwriteIncoming")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {renderAlignmentReviewSection()}
          {result.new_terms.length > 0 && (
            <div className="glass-card p-6">
              <NewTermCandidatesPanel
                terms={result.new_terms}
                previewCount={8}
                resetKey={result.new_terms.join("\u0000")}
              />
              <button onClick={handlePromoteCandidates} disabled={promoting}
                className="mt-4 px-3 py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {promoting ? t("upload.uploading") : t("upload.promoteCandidates")}
              </button>
            </div>
          )}
          <button onClick={handleReset} className="w-full py-3 rounded-xl border border-surface-border text-slate-400 font-medium text-sm hover:text-white hover:border-indigo-500/30 transition-all duration-200 flex items-center justify-center gap-2"><Plus className="w-4 h-4" />{t("upload.uploadMore")}</button>
        </div>
      )}
      {!result && renderAlignmentReviewSection()}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("upload.totalBooks")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{bookSummaries.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("upload.totalRecords")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{totalDatasetRecords}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("upload.sourceCoverage")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{sourceCoveragePercent}%</p>
          <p className="mt-1 text-xs text-slate-500">{totalRecordsWithSource} / {totalDatasetRecords || 0}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("upload.confirmedRate")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{confirmedPercent}%</p>
          <p className="mt-1 text-xs text-slate-500">{totalConfirmedRecords} / {totalDatasetRecords || 0}</p>
        </div>
      </div>

      {(titleIssueCount > 0 || missingSourceCount > 0) && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-300" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-100">{t("upload.datasetQualityTitle")}</p>
              <p className="mt-1 text-xs text-amber-200/80">
                {titleIssueCount > 0 && `${t("upload.datasetQualityTitleIssues")} ${titleIssueCount}${t("upload.entries")}`}
                {titleIssueCount > 0 && missingSourceCount > 0 && " · "}
                {missingSourceCount > 0 && `${t("upload.datasetQualityMissingSource")} ${missingSourceCount}${t("upload.entries")}`}
              </p>
            </div>
          </div>
        </div>
      )}

      {(uploadJobs.length > 0 || jobsError) && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{t("upload.recentJobs")}</h3>
            <span className="text-xs text-slate-500">{t("upload.autoRefresh")}</span>
          </div>
          {jobsError && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
              {jobsError}
            </div>
          )}
          <div className="space-y-2">
            {uploadJobs.map((job) => {
              const statusClass =
                job.status === "completed"
                  ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/10"
                  : job.status === "failed"
                    ? "text-red-300 border-red-500/20 bg-red-500/10"
                    : "text-amber-300 border-amber-500/20 bg-amber-500/10";
              const book = job.result?.book || "-";
              const chapter = job.result?.chapter ?? "-";
              return (
                <div key={job.job_id} className="rounded-lg border border-surface-border bg-surface/60 px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border ${statusClass}`}>{job.status}</span>
                    <span className="text-slate-300">{book}</span>
                    <span className="text-slate-500">#{chapter}</span>
                    <span className="ml-auto text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleTimeString() : ""}</span>
                  </div>
                  {job.error && <p className="mt-1 text-red-300">{job.error}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───── Existing Datasets ───── */}
      <section ref={datasetsSectionRef}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-400" />{t("upload.existingDatasets")}
            {totalDatasetRecords > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20">{totalDatasetRecords}{t("upload.entries")}</span>}
          </h2>
          <button
            onClick={handleExportAllConfirmed}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-light border border-surface-border text-sm text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t("upload.exportAllConfirmed")}
          </button>
        </div>
        {focusedBook && focusedRecordIds.size > 0 && (
          <div className="mb-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-sm text-indigo-200">
            <span className="font-medium text-white">{focusedBook}</span>
            <span className="text-indigo-300/80"> · {focusedRecordIds.size}{t("upload.recentlyUpdatedRecords")}</span>
          </div>
        )}
        {selectedRecordIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
            <span className="mr-auto text-xs text-indigo-100">{selectedRecordIds.size} {t("upload.selectedCount")}</span>
            {selectedRecordsMissingSource.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("upload.selectedMissingSourceHint")} {formatRecordChapterSummary(selectedRecordsMissingSource)}
              </span>
            )}
            <button onClick={handleBulkRetranslate} disabled={retranslatingRecordIds.size > 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/80 text-white text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {retranslatingRecordIds.size > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
              {retranslatingRecordIds.size > 0 ? t("upload.retranslating") : t("upload.bulkRetranslate")}
            </button>
            <button onClick={handleBulkExtract} disabled={extracting} className="px-3 py-1.5 rounded-lg bg-emerald-600/80 text-white text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {extracting ? t("upload.uploading") : t("upload.bulkExtract")}
            </button>
            <button onClick={handleBulkDelete} className="px-3 py-1.5 rounded-lg bg-red-600/80 text-white text-xs font-medium hover:bg-red-500 transition-colors">{t("upload.bulkDelete")}</button>
            <button onClick={clearSelection} className="px-3 py-1.5 rounded-lg bg-surface-lighter border border-surface-border text-slate-300 text-xs font-medium hover:text-white transition-colors">{t("upload.clearSelection")}</button>
          </div>
        )}
        {datasetsError && (
          <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            {datasetsError}
          </div>
        )}

        {datasetsLoading ? (
          <div className="glass-card overflow-hidden"><div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-10 shimmer rounded-lg" />))}</div></div>
        ) : bookSummaries.length === 0 ? (
          <div className="glass-card p-12 text-center"><Database className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">{t("upload.noDatasets")}</p><p className="text-slate-600 text-sm mt-1">{t("upload.noDatasetsSub")}</p></div>
        ) : (
          <div className="space-y-3">
            {orderedBookSummaries.map((bookSummary) => {
              const bk = bookSummary.book;
              const entries = recordsByBook[bk] ?? [];
              const bookLoading = !!loadingBookRecords[bk];
              const bookFocused = focusedBook === bk;
              return (
              <div key={bk} className={`glass-card overflow-hidden ${bookFocused ? "border border-indigo-500/20" : ""}`}>
                <div className="flex items-center gap-2 px-5 py-3.5 hover:bg-surface-lighter/40 transition-colors duration-150">
                  <button onClick={() => { void toggleBookCollapse(bk); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {collapsedBooks.has(bk) ? <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                    <BookOpen className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-white font-semibold text-sm">{bk}</span>
                      {(bookSummary.book_ko || bookSummary.book_zh) && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                          {bookSummary.book_ko || "—"} / {bookSummary.book_zh || "—"}
                        </span>
                      )}
                    </span>
                    {bookFocused && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] border border-indigo-500/20">
                        {t("upload.recentlyUpdated")}
                      </span>
                    )}
                  </button>
                  <span className="px-2 py-0.5 rounded-full bg-surface-lighter text-slate-400 text-xs">{bookSummary.total_records}{locale === "ko" ? "화" : locale === "zh" ? "话" : " ch."}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] border border-emerald-500/20">
                    ZH {bookSummary.source_coverage_percent}%
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-[11px] border border-amber-500/20">
                    {t("dashboard.confirmed")} {bookSummary.confirmed}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingBookTitle(bookSummary)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-surface-border bg-surface-light px-2.5 text-xs text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors"
                  >
                    <PencilLine className="w-3.5 h-3.5" />
                    {t("upload.editBookTitle")}
                  </button>
                </div>
                {!collapsedBooks.has(bk) && (
                  <div className="border-t border-surface-border overflow-y-auto max-h-[480px]">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-surface-light">
                        <tr className="border-b border-surface-border/50">
                          <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.chapter")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.sourceZh")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-28">{t("upload.translKo")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.script")}</th>
                          <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-24">{t("upload.status")}</th>
                          <th className="text-center px-2 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                            <input type="checkbox"
                              checked={entries.length > 0 && entries.every((entry) => selectedRecordIds.has(entry.id))}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setSelectedRecordIds((prev) => {
                                  const next = new Set(prev);
                                  for (const entry of entries) {
                                    if (checked) next.add(entry.id);
                                    else next.delete(entry.id);
                                  }
                                  return next;
                                });
                              }}
                              disabled={bookLoading || entries.length === 0}
                              className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                          </th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500 uppercase tracking-wider w-52">
                            {t("upload.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border/30">
                        {bookLoading && entries.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">
                              {t("upload.uploading")}
                            </td>
                          </tr>
                        )}
                        {!bookLoading && entries.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">
                              {t("upload.noDatasets")}
                            </td>
                          </tr>
                        )}
                        {entries.map((entry) => {
                          const entryTranslation = preferredRecordTranslation(entry);
                          const entryHasSource = hasSourceText(entry);
                          const entryHasTranslation = !!entryTranslation.trim();
                          const entryRetranslating = retranslatingRecordIds.has(entry.id);
                          return (
                          <tr key={entry.id} onClick={() => setPreviewEntry(entry)} className={`hover:bg-surface-lighter/30 transition-colors duration-150 cursor-pointer group ${focusedRecordIds.has(entry.id) ? "bg-indigo-500/5" : ""}`}>
                            <td className="px-5 py-3 text-sm text-white font-medium">{entry.chapter_ko}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</td>
                            <td className="px-5 py-3 text-center">{entry.zh_text ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10"><Check className="w-3.5 h-3.5 text-emerald-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center">{entryTranslation ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/10"><Check className="w-3.5 h-3.5 text-indigo-400" /></span> : <span className="text-slate-600 text-xs">—</span>}</td>
                            <td className="px-5 py-3 text-center"><ScriptBadge script={entry.script} /></td>
                            <td className="px-5 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <StatusBadge status={entry.status} />
                                {focusedRecordIds.has(entry.id) && (
                                  <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-[11px] border border-indigo-500/20">
                                    {t("upload.recentlyUpdated")}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <input type="checkbox" checked={selectedRecordIds.has(entry.id)}
                                onChange={(e) => { e.stopPropagation(); toggleRecordSelection(entry.id); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50" />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!entryHasSource) {
                                      setNotice(null);
                                      setError(buildMissingSourceMessage([entry]));
                                      focusSingleRecord(entry);
                                      return;
                                    }
                                    void handleRetranslateRecordById(entry.id);
                                  }}
                                  disabled={entryRetranslating}
                                  title={entryHasSource
                                    ? entryHasTranslation
                                      ? t("upload.retranslateChapter")
                                      : t("upload.translateChapter")
                                    : t("upload.translateNeedsSource")}
                                  aria-label={entryHasSource
                                    ? entryHasTranslation
                                      ? t("upload.retranslateChapter")
                                      : t("upload.translateChapter")
                                    : t("upload.translateNeedsSource")}
                                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    entryHasSource
                                      ? "border-indigo-500/20 bg-indigo-500/5 text-indigo-300 hover:text-white hover:border-indigo-400/40"
                                      : "border-amber-500/20 bg-amber-500/10 text-amber-200 hover:text-white hover:border-amber-400/40"
                                  }`}
                                >
                                  {entryRetranslating ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : entryHasSource ? (
                                    <Languages className="w-3.5 h-3.5" />
                                  ) : (
                                    <AlertCircle className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {entryHasSource
                                      ? entryHasTranslation
                                        ? t("upload.retranslateShort")
                                        : t("upload.translateShort")
                                      : t("upload.sourceMissingShort")}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleExtractFromRecord(entry.id);
                                  }}
                                  disabled={extracting}
                                  title={t("upload.reextractChapterTerms")}
                                  aria-label={t("upload.reextractChapterTerms")}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:text-white hover:border-emerald-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewEntry(entry);
                                  }}
                                  title={t("upload.openPreview")}
                                  aria-label={t("upload.openPreview")}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border bg-surface-light text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30 transition-colors"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )})}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )})}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-amber-400" />
              {t("upload.reviewQueueTitle")}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{t("upload.reviewQueueSubtitle")}</p>
          </div>
          {reviewBooks.length > 0 && (
            <div className="min-w-56">
              <label className="text-xs text-slate-500">{t("upload.reviewQueueBook")}</label>
              <div className="relative mt-1">
                <select
	                  value={reviewBook}
	                  onChange={(e) => {
	                    reviewBookManuallySelectedRef.current = true;
	                    setReviewBook(e.target.value);
	                    setReviewIndex(0);
	                  }}
                  className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm appearance-none focus:outline-none focus:border-amber-500/50 cursor-pointer"
                >
                  {reviewBooks.map((bookSummary) => (
                    <option key={bookSummary.book} value={bookSummary.book}>
                      {bookSummary.book}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {reviewBooks.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <CheckCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300">{t("upload.reviewQueueEmptyTitle")}</p>
            <p className="text-sm text-slate-500 mt-2">{t("upload.reviewQueueEmptySubtitle")}</p>
          </div>
        ) : reviewLoading ? (
          <div className="glass-card p-8 flex items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("upload.reviewQueueLoading")}
          </div>
        ) : reviewError ? (
          <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
            {reviewError}
          </div>
        ) : currentReviewRecord ? (
          <div className="glass-card p-6 space-y-4">
            {(() => {
              const currentReviewRecordHasTranslation = !!preferredRecordTranslation(currentReviewRecord).trim();
              return (
                <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white font-semibold">
                  {currentReviewRecord.book} · {t("upload.chapter")} {currentReviewRecord.chapter_ko}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {reviewIndex + 1} / {reviewRecords.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReviewIndex((prev) => Math.max(prev - 1, 0))}
                  disabled={reviewIndex === 0}
                  className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("upload.reviewQueuePrevious")}
                </button>
                <button
                  onClick={() => setReviewIndex((prev) => Math.min(prev + 1, reviewRecords.length - 1))}
                  disabled={reviewIndex >= reviewRecords.length - 1}
                  className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("upload.reviewQueueNext")}
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">
                  {t("upload.source")}
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
                  {currentReviewRecord.zh_text || t("upload.noSourceText")}
                </pre>
              </div>
              <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/[0.04] p-4">
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/70">
                  {t("upload.translation")}
                </p>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
                  {preferredRecordTranslation(currentReviewRecord) || t("upload.noTranslation")}
                </pre>
              </div>
            </div>

            {currentReviewRecord.new_term_candidates && currentReviewRecord.new_term_candidates.length > 0 && (
              <NewTermCandidatesPanel
                terms={currentReviewRecord.new_term_candidates}
                previewCount={6}
                resetKey={currentReviewRecord.id}
              />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => { void handleRetranslateRecordById(currentReviewRecord.id); }}
                disabled={retranslatingRecordIds.has(currentReviewRecord.id)}
                title={hasSourceText(currentReviewRecord) ? undefined : t("upload.translateNeedsSource")}
                className="px-3 py-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 text-sm text-indigo-200 hover:text-white hover:border-indigo-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {retranslatingRecordIds.has(currentReviewRecord.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                {retranslatingRecordIds.has(currentReviewRecord.id)
                  ? currentReviewRecordHasTranslation
                    ? t("upload.retranslating")
                    : t("upload.translatingChapter")
                  : currentReviewRecordHasTranslation
                    ? t("upload.retranslateChapter")
                    : t("upload.translateChapter")}
              </button>
              <button
                onClick={() => { void handleExtractFromRecord(currentReviewRecord.id); }}
                disabled={extracting}
                className="px-3 py-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-sm text-emerald-200 hover:text-white hover:border-emerald-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {t("upload.reextractChapterTerms")}
              </button>
              <button
                onClick={() => openCurrentDraftForReview()}
                className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors"
              >
                {t("upload.reviewQueueOpenEditor")}
              </button>
              <button
                onClick={() => { void handleQuickConfirmCurrentDraft(); }}
                disabled={quickConfirmingId === currentReviewRecord.id}
                className="px-3 py-2 rounded-lg bg-emerald-600/80 text-sm text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {quickConfirmingId === currentReviewRecord.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("upload.reviewQueueConfirmNow")}
              </button>
            </div>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="glass-card p-8 text-center text-slate-400">
            {t("upload.reviewQueueEmptyFilter")}
          </div>
        )}
      </section>

      {previewEntry && (
        <PreviewModal
          entry={previewEntry}
          onClose={() => setPreviewEntry(null)}
          onSave={handleSaveRecord}
          onConfirm={handleConfirmRecord}
          onRestoreHistory={handleRestoreDraftHistory}
          onExport={handleExportRecord}
          onDelete={handleDeleteRecord}
          onExtract={handleExtractFromRecord}
          onRetranslate={handleRetranslateRecord}
          extracting={extracting}
          retranslating={retranslatingRecordIds.has(previewEntry.id)}
          llmProvider={llmProvider}
          llmModel={llmModel}
        />
      )}
      {editingBookTitle && (
        <BookTitleEditModal
          book={editingBookTitle}
          onClose={() => setEditingBookTitle(null)}
          onSave={handleUpdateBookTitle}
        />
      )}
      {alignmentPreviewReview && (
        <AlignmentReviewModal
          review={alignmentPreviewReview}
          previousReview={alignmentPreviewNeighbors.previous}
          nextReview={alignmentPreviewNeighbors.next}
          record={alignmentPreviewRecord}
          loading={alignmentPreviewLoading}
          error={alignmentPreviewError}
          onClose={() => {
            setAlignmentPreviewReview(null);
            setAlignmentPreviewRecord(null);
            setAlignmentPreviewError(null);
          }}
          onKeep={() => handleKeepAlignmentReview(alignmentPreviewReview)}
          onSaveProposal={saveAlignmentReviewProposal}
          onAdjustBoundary={(direction) => handleAdjustAlignmentBoundary(alignmentPreviewReview, direction)}
          onApply={(proposedOverride) => { void handleApplyAlignmentReview(alignmentPreviewReview, proposedOverride); }}
          resolving={resolvingAlignmentKeys.has(alignmentReviewKey(alignmentPreviewReview))}
          boundarySnippet={boundarySnippet}
          warningLabel={alignmentWarningLabel}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────
type BoundaryParagraph = {
  text: string;
  status: "plain" | "shared" | "current_only" | "proposed_only";
};

function splitBoundaryParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildBoundaryParagraphs(
  text: string,
  compareText: string,
  mode: "plain" | "current" | "proposed"
): BoundaryParagraph[] {
  const paragraphs = splitBoundaryParagraphs(text);
  if (mode === "plain") {
    return paragraphs.map((paragraph) => ({ text: paragraph, status: "plain" }));
  }

  const compareCounts = new Map<string, number>();
  for (const paragraph of splitBoundaryParagraphs(compareText)) {
    compareCounts.set(paragraph, (compareCounts.get(paragraph) || 0) + 1);
  }

  return paragraphs.map((paragraph) => {
    const available = compareCounts.get(paragraph) || 0;
    if (available > 0) {
      compareCounts.set(paragraph, available - 1);
      return { text: paragraph, status: "shared" };
    }
    return {
      text: paragraph,
      status: mode === "current" ? "current_only" : "proposed_only",
    };
  });
}

function listBoundaryOnlyParagraphs(text: string, compareText: string): string[] {
  return buildBoundaryParagraphs(text, compareText, "current")
    .filter((paragraph) => paragraph.status === "current_only")
    .map((paragraph) => paragraph.text);
}

function NewTermCandidatesPanel({
  terms,
  previewCount = 6,
  resetKey,
}: {
  terms: string[];
  previewCount?: number;
  resetKey?: string;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const previewTerms = terms.slice(0, previewCount);
  const hiddenCount = Math.max(terms.length - previewTerms.length, 0);

  useEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  if (terms.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4 text-amber-400" />
            {t("upload.newTermCandidates")} ({terms.length})
          </h3>
          <p className="mt-1 text-xs text-amber-100/80">
            {t("upload.newTermCandidatesCollapsedHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-surface/70 px-3 py-1.5 text-[11px] font-medium text-amber-100 transition-colors hover:border-amber-400/40 hover:text-white"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {expanded ? t("upload.hideNewTermCandidates") : t("upload.showNewTermCandidates")}
        </button>
      </div>
      <div className="border-t border-amber-500/10 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {(expanded ? terms : previewTerms).map((term, index) => (
            <span
              key={`${term}:${index}`}
              className="rounded-lg border border-amber-500/20 bg-surface-lighter px-2.5 py-1 text-xs text-amber-200"
            >
              {term}
              {!expanded && <span className="ml-1.5 badge-pulse inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </span>
          ))}
          {!expanded && hiddenCount > 0 && (
            <span className="rounded-lg border border-dashed border-amber-500/20 bg-black/10 px-2.5 py-1 text-xs text-amber-100">
              +{hiddenCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AlignmentReviewModal({
  review,
  previousReview,
  nextReview,
  record,
  loading,
  error,
  resolving,
  onClose,
  onKeep,
  onSaveProposal,
  onAdjustBoundary,
  onApply,
  boundarySnippet,
  warningLabel,
}: {
  review: AlignmentReview;
  previousReview: AlignmentReview | null;
  nextReview: AlignmentReview | null;
  record: DatasetRecord | null;
  loading: boolean;
  error: string | null;
  resolving: boolean;
  onClose: () => void;
  onKeep: () => void;
  onSaveProposal: (
    reviewId: string,
    patch: { proposed_ko_text?: string; start_reason?: string; end_reason?: string }
  ) => Promise<AlignmentReview>;
  onAdjustBoundary: (
    direction: "send_start_to_prev" | "send_end_to_next" | "pull_from_prev" | "pull_from_next"
  ) => Promise<void>;
  onApply: (proposedOverride?: string) => void;
  boundarySnippet: (text: string, side: "start" | "end", count?: number) => string;
  warningLabel: (warning: string) => string;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "ko-KR";
  const zhText = record?.zh_text || "";
  const currentKo = record?.ko_text || review.existing_ko_text || "";
  const [proposedDraft, setProposedDraft] = useState(review.proposed_ko_text || "");
  const [savingProposal, setSavingProposal] = useState(false);
  const [adjustingDirection, setAdjustingDirection] = useState<string | null>(null);
  const proposedKo = proposedDraft || review.proposed_ko_text || "";

  useEffect(() => {
    setProposedDraft(review.proposed_ko_text || "");
  }, [review]);

  const currentStart = boundarySnippet(currentKo, "start");
  const currentEnd = boundarySnippet(currentKo, "end");
  const proposedStart = boundarySnippet(proposedKo, "start");
  const proposedEnd = boundarySnippet(proposedKo, "end");
  const startChanges = {
    currentOnly: listBoundaryOnlyParagraphs(currentStart, proposedStart),
    proposedOnly: listBoundaryOnlyParagraphs(proposedStart, currentStart),
  };
  const endChanges = {
    currentOnly: listBoundaryOnlyParagraphs(currentEnd, proposedEnd),
    proposedOnly: listBoundaryOnlyParagraphs(proposedEnd, currentEnd),
  };
  const panels = [
    {
      label: t("upload.alignmentBoundarySource"),
      tone: "border-emerald-500/20 bg-emerald-500/5",
      start: buildBoundaryParagraphs(boundarySnippet(zhText, "start"), "", "plain"),
      end: buildBoundaryParagraphs(boundarySnippet(zhText, "end"), "", "plain"),
    },
    {
      label: t("upload.alignmentBoundaryCurrent"),
      tone: "border-surface-border bg-surface/70",
      start: buildBoundaryParagraphs(currentStart, proposedStart, "current"),
      end: buildBoundaryParagraphs(currentEnd, proposedEnd, "current"),
    },
    {
      label: t("upload.alignmentBoundaryProposed"),
      tone: "border-indigo-500/20 bg-indigo-500/5",
      start: buildBoundaryParagraphs(proposedStart, currentStart, "proposed"),
      end: buildBoundaryParagraphs(proposedEnd, currentEnd, "proposed"),
    },
  ];
  const canSaveProposal =
    proposedDraft.trim().length > 0 &&
    proposedDraft.trim() !== (review.proposed_ko_text || "").trim();
  const handleSaveProposal = async () => {
    if (!canSaveProposal) return;
    setSavingProposal(true);
    try {
      const updated = await onSaveProposal(review.review_id, { proposed_ko_text: proposedDraft });
      setProposedDraft(updated.proposed_ko_text || "");
    } catch {
      // Parent error banner already handles the failure state.
    } finally {
      setSavingProposal(false);
    }
  };
  const handleBoundaryAdjust = async (
    direction: "send_start_to_prev" | "send_end_to_next" | "pull_from_prev" | "pull_from_next"
  ) => {
    setAdjustingDirection(direction);
    try {
      await onAdjustBoundary(direction);
    } catch {
      // Parent error banner already handles the failure state.
    } finally {
      setAdjustingDirection(null);
    }
  };
  const paragraphTone = (status: BoundaryParagraph["status"]) => {
    if (status === "current_only") return "border-amber-500/20 bg-amber-500/10 text-amber-100";
    if (status === "proposed_only") return "border-indigo-500/20 bg-indigo-500/10 text-indigo-100";
    return "border-white/5 bg-black/10 text-slate-100";
  };
  const diffLabel = (status: BoundaryParagraph["status"]) => {
    if (status === "current_only") return t("upload.alignmentOnlyInCurrent");
    if (status === "proposed_only") return t("upload.alignmentOnlyInProposal");
    return null;
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-6xl max-h-[86vh] glass-card border-amber-500/20 flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div>
            <h3 className="text-white font-semibold text-base">
              {t("upload.alignmentPreviewTitle")} · {review.book} · {t("upload.chapter")} {review.chapter_ko}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {t("upload.alignmentConfidence")}: {(review.confidence * 100).toFixed(0)}%
              {review.created_at ? ` · ${new Date(review.created_at).toLocaleString(dateLocale)}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-lighter flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-border transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <p className="text-sm text-slate-300">{t("upload.alignmentPreviewSubtitle")}</p>
            {(review.start_reason || review.end_reason) && (
              <div className="grid gap-3 lg:grid-cols-2 mt-4">
                <div className="rounded-xl border border-surface-border bg-surface/60 p-4">
                  <p className="text-xs font-medium text-slate-400 mb-2">{t("upload.alignmentStartReason")}</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{review.start_reason || "—"}</p>
                </div>
                <div className="rounded-xl border border-surface-border bg-surface/60 p-4">
                  <p className="text-xs font-medium text-slate-400 mb-2">{t("upload.alignmentEndReason")}</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{review.end_reason || "—"}</p>
                </div>
              </div>
            )}
          </div>

          {review.warnings.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {review.warnings.map((warning) => (
                <span
                  key={`${review.review_id}:${warning}`}
                  className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-200 text-xs border border-amber-500/20"
                >
                  {warningLabel(warning)}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="glass-card p-8 flex items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("upload.alignmentPreviewLoading")}
            </div>
          ) : error ? (
            <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
              {error}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 xl:grid-cols-3">
                {panels.map((panel) => (
                  <div key={panel.label} className={`rounded-2xl border p-4 space-y-4 ${panel.tone}`}>
                    <div>
                      <h4 className="text-sm font-semibold text-white">{panel.label}</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                        <p className="text-xs font-medium text-slate-400 mb-2">{t("upload.alignmentBoundaryStart")}</p>
                        <div className="space-y-2">
                          {panel.start.length > 0 ? (
                            panel.start.map((paragraph, index) => (
                              <div
                                key={`${panel.label}:start:${index}`}
                                className={`rounded-lg border p-2.5 ${paragraphTone(paragraph.status)}`}
                              >
                                {diffLabel(paragraph.status) && (
                                  <p className="text-[11px] font-medium mb-1.5 opacity-90">
                                    {diffLabel(paragraph.status)}
                                  </p>
                                )}
                                <pre className="whitespace-pre-wrap break-words text-sm leading-6">{paragraph.text}</pre>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">—</p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-black/10 p-3">
                        <p className="text-xs font-medium text-slate-400 mb-2">{t("upload.alignmentBoundaryEnd")}</p>
                        <div className="space-y-2">
                          {panel.end.length > 0 ? (
                            panel.end.map((paragraph, index) => (
                              <div
                                key={`${panel.label}:end:${index}`}
                                className={`rounded-lg border p-2.5 ${paragraphTone(paragraph.status)}`}
                              >
                                {diffLabel(paragraph.status) && (
                                  <p className="text-[11px] font-medium mb-1.5 opacity-90">
                                    {diffLabel(paragraph.status)}
                                  </p>
                                )}
                                <pre className="whitespace-pre-wrap break-words text-sm leading-6">{paragraph.text}</pre>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">—</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {[
                  {
                    label: t("upload.alignmentBoundaryStart"),
                    currentOnly: startChanges.currentOnly,
                    proposedOnly: startChanges.proposedOnly,
                  },
                  {
                    label: t("upload.alignmentBoundaryEnd"),
                    currentOnly: endChanges.currentOnly,
                    proposedOnly: endChanges.proposedOnly,
                  },
                ].map((section) => {
                  const hasChanges = section.currentOnly.length > 0 || section.proposedOnly.length > 0;
                  return (
                    <div key={section.label} className="rounded-2xl border border-surface-border bg-surface/70 p-4">
                      <h4 className="text-sm font-semibold text-white">
                        {t("upload.alignmentBoundaryChanges")} · {section.label}
                      </h4>
                      {hasChanges ? (
                        <div className="grid gap-3 md:grid-cols-2 mt-3">
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-amber-200">{t("upload.alignmentOnlyInCurrent")}</p>
                            {section.currentOnly.map((paragraph, index) => (
                              <div
                                key={`${section.label}:current:${index}`}
                                className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5"
                              >
                                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-amber-100">{paragraph}</pre>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-indigo-200">{t("upload.alignmentOnlyInProposal")}</p>
                            {section.proposedOnly.map((paragraph, index) => (
                              <div
                                key={`${section.label}:proposal:${index}`}
                                className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2.5"
                              >
                                <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-indigo-100">{paragraph}</pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 mt-3">{t("upload.alignmentNoBoundaryDifference")}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-surface-border bg-surface/70 p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">{t("upload.alignmentExisting")}</h4>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{currentKo || "—"}</pre>
                </div>
                <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">{t("upload.alignmentProposed")}</h4>
                  <textarea
                    value={proposedDraft}
                    onChange={(e) => setProposedDraft(e.target.value)}
                    className="w-full min-h-[320px] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-6 focus:outline-none focus:border-indigo-500/50 resize-y"
                  />
                  <div className="flex flex-wrap justify-end gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setProposedDraft(review.proposed_ko_text || "")}
                      disabled={savingProposal || proposedDraft === (review.proposed_ko_text || "")}
                      className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-indigo-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t("upload.alignmentResetDraft")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveProposal();
                      }}
                      disabled={!canSaveProposal || savingProposal}
                      className="px-3 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {savingProposal && <Loader2 className="w-4 h-4 animate-spin" />}
                      {t("upload.alignmentSaveProposal")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-white">{t("upload.alignmentManualAdjustTitle")}</h4>
                  <p className="text-xs text-amber-200/80 mt-1">{t("upload.alignmentManualAdjustSubtitle")}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleBoundaryAdjust("send_start_to_prev");
                    }}
                    disabled={!previousReview || !!adjustingDirection}
                    className="px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/70 text-sm text-amber-100 hover:text-white hover:border-amber-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("upload.alignmentSendStartToPrev")}
                    {previousReview ? ` · ${t("upload.chapter")} ${previousReview.chapter_ko}` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleBoundaryAdjust("send_end_to_next");
                    }}
                    disabled={!nextReview || !!adjustingDirection}
                    className="px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/70 text-sm text-amber-100 hover:text-white hover:border-amber-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("upload.alignmentSendEndToNext")}
                    {nextReview ? ` · ${t("upload.chapter")} ${nextReview.chapter_ko}` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleBoundaryAdjust("pull_from_prev");
                    }}
                    disabled={!previousReview || !!adjustingDirection}
                    className="px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/70 text-sm text-amber-100 hover:text-white hover:border-amber-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("upload.alignmentPullFromPrev")}
                    {previousReview ? ` · ${t("upload.chapter")} ${previousReview.chapter_ko}` : ""}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleBoundaryAdjust("pull_from_next");
                    }}
                    disabled={!nextReview || !!adjustingDirection}
                    className="px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/70 text-sm text-amber-100 hover:text-white hover:border-amber-400/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("upload.alignmentPullFromNext")}
                    {nextReview ? ` · ${t("upload.chapter")} ${nextReview.chapter_ko}` : ""}
                  </button>
                </div>
                {adjustingDirection && (
                  <p className="text-xs text-amber-200 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t("upload.alignmentAdjusting")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t border-surface-border">
          <button
            type="button"
            onClick={onKeep}
            disabled={resolving}
            className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white hover:border-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("upload.alignmentKeepExisting")}
          </button>
          <button
            type="button"
            onClick={() => onApply(proposedDraft)}
            disabled={resolving || savingProposal || !!adjustingDirection || !proposedDraft.trim()}
            className="px-3 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {resolving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("upload.alignmentApply")}
          </button>
        </div>
      </div>
    </div>
  );
}

function BookTitleEditModal({
  book,
  onClose,
  onSave,
}: {
  book: BookInfo;
  onClose: () => void;
  onSave: (currentBook: string, nextBookKo: string, nextBookZh: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [bookKo, setBookKo] = useState(book.book_ko || "");
  const [bookZh, setBookZh] = useState(book.book_zh || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBookKo(book.book_ko || "");
    setBookZh(book.book_zh || "");
  }, [book]);

  const handleSave = async () => {
    if (!bookKo.trim() && !bookZh.trim()) return;
    setSaving(true);
    try {
      await onSave(book.book, bookKo, bookZh);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-xl glass-card border-indigo-500/20 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div>
            <h3 className="text-white font-semibold text-sm">{t("upload.editBookTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{book.book}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-lighter flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-border transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">{t("upload.bookNameKo")}</label>
            <input
              type="text"
              value={bookKo}
              onChange={(e) => setBookKo(e.target.value)}
              placeholder={t("upload.bookNameKoPlaceholder")}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300 mb-2 block">{t("upload.bookNameZh")}</label>
            <input
              type="text"
              value={bookZh}
              onChange={(e) => setBookZh(e.target.value)}
              placeholder={t("upload.bookNameZhPlaceholder")}
              className="w-full px-4 py-2.5 bg-surface border border-surface-border rounded-lg text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <p className="text-xs text-slate-500">{t("upload.bookTitleEditHint")}</p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-light text-sm text-slate-300 hover:text-white transition-colors"
            >
              {t("upload.cancel")}
            </button>
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              disabled={saving || (!bookKo.trim() && !bookZh.trim())}
              className="px-3 py-2 rounded-lg bg-indigo-600/80 text-sm text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("upload.saveBookTitle")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({
  entry,
  onClose,
  onSave,
  onConfirm,
  onRestoreHistory,
  onExport,
  onDelete,
  onExtract,
  onRetranslate,
  extracting,
  retranslating,
  llmProvider,
  llmModel,
}: {
  entry: DatasetRecord;
  onClose: () => void;
  onSave: (record: DatasetRecord) => Promise<DatasetRecord | undefined>;
  onConfirm: (
    recordId: string,
    body: { ko_text_confirmed: string; review_note?: string; alignment_rows?: DatasetAlignmentRow[] }
  ) => Promise<void>;
  onRestoreHistory: (recordId: string, historyId: string) => Promise<DatasetRecord | undefined>;
  onExport: (record: DatasetRecord, fmt: "json" | "jsonl" | "txt") => Promise<void>;
  onDelete: (recordId: string) => Promise<void>;
  onExtract: (recordId: string) => Promise<void>;
  onRetranslate: (record: DatasetRecord) => Promise<DatasetRecord | undefined>;
  extracting: boolean;
  retranslating: boolean;
  llmProvider: "auto" | LlmProvider;
  llmModel: string;
}) {
  const { t, locale } = useLanguage();
  const dateLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "ko-KR";
  const initialTranslationText = preferredRecordTranslation(entry);
  const [sourceText, setSourceText] = useState(entry.zh_text || "");
  const [draftText, setDraftText] = useState(initialTranslationText);
  const [confirmedText, setConfirmedText] = useState(initialTranslationText);
  const [reviewNote, setReviewNote] = useState(entry.review_note || "");
  const [editableRows, setEditableRows] = useState<EditableSentenceRow[]>(() =>
    buildEditableSentenceRows(entry.id, entry.zh_text || "", initialTranslationText, entry.alignment_rows)
  );
  const editableRowsRef = useRef(editableRows);
  const translationInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const sourceTextRef = useRef(entry.zh_text || "");
  const draftTextRef = useRef(initialTranslationText);
  const confirmedTextRef = useRef(initialTranslationText);
  const reviewNoteRef = useRef(entry.review_note || "");
  const activeEntryIdRef = useRef(entry.id);
  const [editorTab, setEditorTab] = useState<PreviewEditorTab>("edit");
  const [openEditPanel, setOpenEditPanel] = useState<"sentences" | "full">("sentences");
  const [savingEditorDraft, setSavingEditorDraft] = useState(false);
  const [editorSaveMessage, setEditorSaveMessage] = useState("");
  const [editorErrorMessage, setEditorErrorMessage] = useState("");
  const [translatingRowKey, setTranslatingRowKey] = useState<string | null>(null);
  const [rowTranslationErrors, setRowTranslationErrors] = useState<Record<string, string>>({});
  const [tonePreset, setTonePreset] = useState<TonePresetId>("haoche");
  const [rewritingToneRowKey, setRewritingToneRowKey] = useState<string | null>(null);
  const [rowToneErrors, setRowToneErrors] = useState<Record<string, string>>({});
  const [explainingRowKey, setExplainingRowKey] = useState<string | null>(null);
  const [rowExplanations, setRowExplanations] = useState<Record<string, string>>({});
  const [rowExplanationErrors, setRowExplanationErrors] = useState<Record<string, string>>({});
  const [rowStructureErrors, setRowStructureErrors] = useState<Record<string, string>>({});
  const [rowSplitMarkers, setRowSplitMarkers] = useState<Record<string, string>>({});
  const [rowPushCounts, setRowPushCounts] = useState<Record<string, string>>({});
  const [rowStructureAction, setRowStructureAction] = useState<RowStructureActionState | null>(null);
  const [savedVerifyReports, setSavedVerifyReports] = useState<SavedVerifyReport[]>(entry.verify_reports || []);
  const [savingVerifyReport, setSavingVerifyReport] = useState(false);
  const [printingVerifyReport, setPrintingVerifyReport] = useState(false);
  const [verifyReportMessage, setVerifyReportMessage] = useState("");
  const [verifyReportError, setVerifyReportError] = useState("");
  const [draftHistory, setDraftHistory] = useState<DraftHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);
  const [verifyingDraft, setVerifyingDraft] = useState(false);
  const [verifyResult, setVerifyResult] = useState<DraftVerifyResponse | null>(null);
  const [verifyError, setVerifyError] = useState("");
  const sourceSummary = buildSourceSummary(sourceText || "");
  const buildLlmOverrides = (): { provider?: LlmProvider; model?: string } => {
    if (llmProvider === "auto") return {};
    const trimmedModel = llmModel.trim();
    return {
      provider: llmProvider,
      ...(trimmedModel ? { model: trimmedModel } : {}),
    };
  };

  const setSourceTextValue = (value: string) => {
    sourceTextRef.current = value;
    setSourceText(value);
    setEditorErrorMessage("");
    setVerifyResult(null);
    setVerifyError("");
  };
  const setReviewNoteValue = (value: string) => {
    reviewNoteRef.current = value;
    setReviewNote(value);
  };
  const currentTranslationText = useCallback(() => {
    const draft = draftTextRef.current;
    const confirmed = confirmedTextRef.current;
    return draft.trim() ? draft : confirmed.trim() ? confirmed : preferredRecordTranslation(entry);
  }, [entry]);
  const initialRowSignature = useCallback(
    () => buildEditableRowSignature(
      buildEditableSentenceRows(
        entry.id,
        entry.zh_text || "",
        preferredRecordTranslation(entry),
        entry.alignment_rows,
      )
    ),
    [entry],
  );
  const hasUnsavedChanges = useCallback(() => {
    return (
      sourceTextRef.current !== (entry.zh_text || "") ||
      currentTranslationText() !== preferredRecordTranslation(entry) ||
      reviewNoteRef.current !== (entry.review_note || "") ||
      buildEditableRowSignature(editableRowsRef.current) !== initialRowSignature()
    );
  }, [currentTranslationText, entry, initialRowSignature]);
  const requestClose = useCallback(() => {
    if (hasUnsavedChanges() && !window.confirm(t("upload.draftEditorUnsavedCloseConfirm"))) {
      return;
    }
    onClose();
  }, [hasUnsavedChanges, onClose, t]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isTextEditingTarget(e.target)) return;
      e.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [requestClose]);
  useEffect(() => {
    editableRowsRef.current = editableRows;
  }, [editableRows]);
  useEffect(() => {
    const nextTranslationText = preferredRecordTranslation(entry);
    const nextSourceText = entry.zh_text || "";
    const nextReviewNote = entry.review_note || "";
    const nextRows = buildEditableSentenceRows(
      entry.id,
      nextSourceText,
      nextTranslationText,
      entry.alignment_rows,
    );
    const sameRecord = activeEntryIdRef.current === entry.id;
    if (sameRecord && hasUnsavedChanges()) {
      return;
    }
    if (
      sameRecord
      && sourceTextRef.current === nextSourceText
      && currentTranslationText() === nextTranslationText
      && reviewNoteRef.current === nextReviewNote
      && buildEditableRowSignature(editableRowsRef.current) === buildEditableRowSignature(nextRows)
    ) {
      activeEntryIdRef.current = entry.id;
      return;
    }
    activeEntryIdRef.current = entry.id;
    sourceTextRef.current = nextSourceText;
    draftTextRef.current = nextTranslationText;
    confirmedTextRef.current = nextTranslationText;
    reviewNoteRef.current = nextReviewNote;
    editableRowsRef.current = nextRows;
    setSourceText(nextSourceText);
    setDraftText(nextTranslationText);
    setConfirmedText(nextTranslationText);
    setEditableRows(nextRows);
    setReviewNote(nextReviewNote);
    setEditorTab("edit");
    setOpenEditPanel("sentences");
    setSavingEditorDraft(false);
    setEditorSaveMessage("");
    setEditorErrorMessage("");
    setTranslatingRowKey(null);
    setRowTranslationErrors({});
    setTonePreset("haoche");
    setRewritingToneRowKey(null);
    setRowToneErrors({});
    setExplainingRowKey(null);
    setRowExplanations({});
    setRowExplanationErrors({});
    setRowStructureErrors({});
    setRowSplitMarkers({});
    setRowPushCounts({});
    setRowStructureAction(null);
    setSavedVerifyReports(entry.verify_reports || []);
    setSavingVerifyReport(false);
    setPrintingVerifyReport(false);
    setVerifyReportMessage("");
    setVerifyReportError("");
    setDraftHistory([]);
    setHistoryLoading(false);
    setHistoryError("");
    setHistoryMessage("");
    setRestoringHistoryId(null);
    setVerifyingDraft(false);
    setVerifyResult(null);
    setVerifyError("");
  }, [currentTranslationText, entry, hasUnsavedChanges]);

  const editorTabs: Array<{ id: PreviewEditorTab; label: string }> = [
    { id: "edit", label: t("upload.draftEditorEditTab") },
    { id: "confirmed", label: t("upload.draftEditorConfirmTab") },
    { id: "meta", label: t("upload.draftEditorMetaTab") },
    { id: "history", label: t("upload.draftHistoryTab") },
    { id: "verify", label: t("upload.draftVerifyTab") },
  ];
  const loadDraftHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const history = await getDraftHistory(entry.id, 80);
      setDraftHistory(history);
    } catch (err) {
      setHistoryError(getApiErrorMessage(err, t("upload.draftHistoryLoadFailed")));
    } finally {
      setHistoryLoading(false);
    }
  }, [entry.id, t]);
  useEffect(() => {
    void loadDraftHistory();
  }, [loadDraftHistory]);
  const linkedTranslationText =
    draftText.trim() ? draftText : confirmedText.trim() ? confirmedText : preferredRecordTranslation(entry);
  const chapterHasSource = !!sourceText.trim();
  const chapterTranslationExists = !!linkedTranslationText.trim();
  const setLinkedTranslationText = (value: string) => {
    const sanitized = sanitizeKoreanTranslationPunctuation(value);
    draftTextRef.current = sanitized;
    confirmedTextRef.current = sanitized;
    setDraftText(sanitized);
    setConfirmedText(sanitized);
    setEditorSaveMessage("");
    setEditorErrorMessage("");
    setVerifyResult(null);
    setVerifyError("");
  };
  const resetEditableRows = (
    nextSourceText: string,
    nextTranslationText: string,
    storedRows?: DatasetAlignmentRow[] | undefined,
  ) => {
    const nextRows = buildEditableSentenceRows(entry.id, nextSourceText, nextTranslationText, storedRows);
    editableRowsRef.current = nextRows;
    setEditableRows(nextRows);
  };
  const normalizeEditableRows = (rows: EditableSentenceRow[]) =>
    rows.map((row, index) => ({
      ...row,
      paragraphIndex: row.paragraphIndex ?? 0,
      sentenceIndex: index,
      locked: !!row.locked,
      origin: row.origin || "manual",
    }));
  const rebuildRowsFromTranslationProjection = (nextTranslationText: string) => {
    const currentRows = editableRowsRef.current;
    if (currentRows.length === 0) {
      resetEditableRows(sourceTextRef.current, nextTranslationText);
      return;
    }
    const normalized = sanitizeKoreanTranslationPunctuation(nextTranslationText)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    const translationBlocks = normalized.trim() ? normalized.split("\n\n").map((block) => block.trim()) : [];
    const rowCount = Math.max(currentRows.length, translationBlocks.length, 1);
    syncTextsFromEditableRows(
      Array.from({ length: rowCount }, (_, index) => {
        const previous = currentRows[index];
        return {
          id: previous?.id || makeEditableRowId(entry.id),
          paragraphIndex: previous?.paragraphIndex ?? 0,
          sentenceIndex: index,
          sourceSentence: previous?.sourceSentence ?? "",
          translationSentence: translationBlocks[index] ?? "",
          locked: previous?.locked ?? false,
          origin: "manual",
        };
      }),
    );
  };
  const rebuildRowsFromSourceProjection = (nextSourceText: string) => {
    const currentRows = editableRowsRef.current;
    if (currentRows.length === 0) {
      resetEditableRows(nextSourceText, currentTranslationText());
      return;
    }
    const normalized = nextSourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const sourceRows = normalized.trim() ? normalized.split("\n").map((line) => line.trim()) : [];
    const rowCount = Math.max(currentRows.length, sourceRows.length, 1);
    syncTextsFromEditableRows(
      Array.from({ length: rowCount }, (_, index) => {
        const previous = currentRows[index];
        return {
          id: previous?.id || makeEditableRowId(entry.id),
          paragraphIndex: previous?.paragraphIndex ?? 0,
          sentenceIndex: index,
          sourceSentence: sourceRows[index] ?? "",
          translationSentence: previous?.translationSentence ?? "",
          locked: previous?.locked ?? false,
          origin: "manual",
        };
      }),
    );
  };
  const syncTextsFromEditableRows = (nextRows: EditableSentenceRow[]) => {
    const normalizedRows = normalizeEditableRows(nextRows);
    editableRowsRef.current = normalizedRows;
    setEditableRows(normalizedRows);
    setSourceTextValue(composeEditableSourceText(normalizedRows));
    setLinkedTranslationText(composeEditableTranslationText(normalizedRows));
  };
  const clearRowError = (
    setter: Dispatch<SetStateAction<Record<string, string>>>,
    key: string,
  ) => {
    setter((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const clearRowCache = (key: string) => {
    clearRowError(setRowTranslationErrors, key);
    clearRowError(setRowToneErrors, key);
    clearRowError(setRowExplanationErrors, key);
    clearRowError(setRowStructureErrors, key);
    setRowExplanations((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  const clearAllRowDerivedState = () => {
    setRowTranslationErrors({});
    setRowToneErrors({});
    setRowExplanationErrors({});
    setRowStructureErrors({});
    setRowExplanations({});
  };
  const setStructureError = (key: string, message: string) => {
    setRowStructureErrors((prev) => ({ ...prev, [key]: message }));
  };
  const updateEditableRow = (
    key: string,
    patch: Partial<Pick<EditableSentenceRow, "sourceSentence" | "translationSentence">>,
  ) => {
    clearRowCache(key);
    const nextRows = editableRowsRef.current.map((row) =>
      row.id === key ? { ...row, ...patch, origin: "manual" } : row
    );
    syncTextsFromEditableRows(nextRows);
    setEditorSaveMessage("");
  };
  const updateSourceRow = (key: string, value: string) => {
    updateEditableRow(key, { sourceSentence: value });
  };
  const updateDraftRow = (key: string, value: string) => {
    updateEditableRow(key, { translationSentence: value });
  };
  const setTranslationInputRef = (key: string, node: HTMLTextAreaElement | null) => {
    translationInputRefs.current[key] = node;
  };
  const setRowSplitMarkerValue = (key: string, value: string) => {
    clearRowError(setRowStructureErrors, key);
    setRowSplitMarkers((prev) => ({ ...prev, [key]: value }));
  };
  const setRowPushCountValue = (key: string, value: string) => {
    clearRowError(setRowStructureErrors, key);
    setRowPushCounts((prev) => ({ ...prev, [key]: value }));
  };
  const openRowStructureAction = (rowKey: string, action: RowStructureActionKind) => {
    clearRowError(setRowStructureErrors, rowKey);
    setRowStructureAction((prev) => (
      prev && prev.rowKey === rowKey && prev.action === action
        ? null
        : {
          rowKey,
          action,
          includeSource: true,
          includeTranslation: true,
        }
    ));
  };
  const updateRowStructureTarget = (target: RowStructureTarget, checked: boolean) => {
    setRowStructureAction((prev) => {
      if (!prev) return prev;
      return target === "source"
        ? { ...prev, includeSource: checked }
        : { ...prev, includeTranslation: checked };
    });
  };
  const closeRowStructureAction = () => {
    setRowStructureAction(null);
  };
  const applyStructuralRows = (nextRows: EditableSentenceRow[]) => {
    clearAllRowDerivedState();
    setRowStructureAction(null);
    syncTextsFromEditableRows(nextRows);
    setEditorSaveMessage("");
  };
  const toggleRowLock = (key: string) => {
    const nextRows = editableRowsRef.current.map((row) =>
      row.id === key ? { ...row, locked: !row.locked, origin: "manual" } : row
    );
    applyStructuralRows(nextRows);
  };
  const mergeNextRowIntoCurrentRow = (key: string, targets: RowStructureTarget[]) => {
    if (targets.length === 0) {
      setStructureError(key, t("upload.rowStructureTargetRequired"));
      return;
    }
    const currentIndex = editableRowsRef.current.findIndex((row) => row.id === key);
    if (currentIndex < 0 || currentIndex >= editableRowsRef.current.length - 1) return;
    const nextRows = editableRowsRef.current.map((row) => ({ ...row }));
    let changed = false;
    for (const target of targets) {
      const field = ROW_STRUCTURE_FIELDS[target];
      const nextValue = nextRows[currentIndex + 1][field].trim();
      if (!nextValue) continue;
      const currentValue = nextRows[currentIndex][field].trim();
      nextRows[currentIndex] = {
        ...nextRows[currentIndex],
        [field]: mergeRowStructureText(currentValue, nextValue),
        origin: "manual",
      };
      nextRows[currentIndex + 1] = {
        ...nextRows[currentIndex + 1],
        [field]: "",
        origin: "manual",
      };
      changed = true;
    }
    if (!changed) {
      setStructureError(key, t("upload.mergeNextRowUnavailable"));
      return;
    }
    applyStructuralRows(nextRows);
  };
  const liftFollowingTranslationsUp = (key: string) => {
    const currentIndex = editableRowsRef.current.findIndex((row) => row.id === key);
    if (currentIndex < 0 || currentIndex >= editableRowsRef.current.length - 1) return;
    const hasNextTranslation = editableRowsRef.current
      .slice(currentIndex + 1)
      .some((row) => row.translationSentence.trim());
    if (!hasNextTranslation) {
      setStructureError(key, t("upload.shiftTranslationsUnavailable"));
      return;
    }
    const nextRows = editableRowsRef.current.map((row, index, rows) => {
      if (index < currentIndex) return row;
      if (index === rows.length - 1) {
        return {
          ...row,
          translationSentence: "",
          origin: "manual",
        };
      }
      return {
        ...row,
        translationSentence: rows[index + 1].translationSentence,
        origin: "manual",
      };
    });
    applyStructuralRows(nextRows);
  };
  const pushRowsDown = (key: string, targets: RowStructureTarget[]) => {
    if (targets.length === 0) {
      setStructureError(key, t("upload.rowStructureTargetRequired"));
      return;
    }
    const currentIndex = editableRowsRef.current.findIndex((row) => row.id === key);
    if (currentIndex < 0) return;
    const rawCount = (rowPushCounts[key] || "").trim();
    const count = Number.parseInt(rawCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setStructureError(key, t("upload.pushRowsInvalidCount"));
      return;
    }
    const currentRow = editableRowsRef.current[currentIndex];
    const blankRows = Array.from({ length: count }, (_, offset) =>
      makeEmptyEditableRow(entry.id, currentRow?.paragraphIndex ?? 0, currentIndex + offset)
    );
    let nextRows = [
      ...editableRowsRef.current.slice(0, currentIndex).map((row) => ({ ...row })),
      ...blankRows,
      ...editableRowsRef.current.slice(currentIndex).map((row) => ({ ...row })),
    ];
    for (const target of (["source", "translation"] as RowStructureTarget[])) {
      if (targets.includes(target)) continue;
      const field = ROW_STRUCTURE_FIELDS[target];
      const originalValues = editableRowsRef.current.map((row) => row[field]);
      nextRows = nextRows.map((row, index) => ({
        ...row,
        [field]: originalValues[index] ?? "",
        origin: "manual",
      }));
    }
    applyStructuralRows(nextRows);
  };
  const splitSelectedFieldsToNextRow = (
    currentIndex: number,
    segments: Partial<Record<RowStructureTarget, { before: string; after: string }>>,
  ) => {
    const currentRow = editableRowsRef.current[currentIndex];
    if (!currentRow) return false;

    const nextRows = editableRowsRef.current.map((row) => ({ ...row }));
    if (!nextRows[currentIndex + 1]) {
      nextRows.splice(
        currentIndex + 1,
        0,
        makeEmptyEditableRow(entry.id, currentRow.paragraphIndex, currentIndex + 1),
      );
    }
    for (const target of (["source", "translation"] as RowStructureTarget[])) {
      const segment = segments[target];
      if (!segment) continue;
      const field = ROW_STRUCTURE_FIELDS[target];
      const nextValue = nextRows[currentIndex + 1][field].trim();
      const movedText = nextValue ? `${segment.after} ${nextValue}` : segment.after;
      nextRows[currentIndex] = {
        ...nextRows[currentIndex],
        [field]: segment.before,
        origin: "manual",
      };
      nextRows[currentIndex + 1] = {
        ...nextRows[currentIndex + 1],
        [field]: movedText,
        origin: "manual",
      };
    }
    applyStructuralRows(nextRows);
    return true;
  };
  const splitTranslationToNextRow = (key: string) => {
    const textarea = translationInputRefs.current[key];
    if (!textarea) return;
    const currentIndex = editableRowsRef.current.findIndex((row) => row.id === key);
    if (currentIndex < 0) return;
    const currentRow = editableRowsRef.current[currentIndex];
    const selectionStart = textarea.selectionStart ?? currentRow.translationSentence.length;
    const before = currentRow.translationSentence.slice(0, selectionStart).trim();
    const after = currentRow.translationSentence.slice(selectionStart).trim();
    if (!after) {
      setStructureError(key, t("upload.splitMarkerEmptyTail"));
      return;
    }
    const didSplit = splitSelectedFieldsToNextRow(currentIndex, {
      translation: { before, after },
    });
    if (!didSplit) return;
    queueMicrotask(() => {
      const nextKey = editableRowsRef.current[currentIndex + 1]?.id;
      if (!nextKey) return;
      const nextTextarea = translationInputRefs.current[nextKey];
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(0, 0);
    });
  };
  const splitRowByMarker = (key: string, targets: RowStructureTarget[]) => {
    if (targets.length === 0) {
      setStructureError(key, t("upload.rowStructureTargetRequired"));
      return;
    }
    const marker = rowSplitMarkers[key]?.trim() || "";
    const currentIndex = editableRowsRef.current.findIndex((row) => row.id === key);
    if (currentIndex < 0) return;
    if (!marker) {
      setStructureError(key, t("upload.splitMarkerRequired"));
      return;
    }
    const currentRow = editableRowsRef.current[currentIndex];
    const segments: Partial<Record<RowStructureTarget, { before: string; after: string }>> = {};
    let foundMarker = false;
    let hasTail = false;

    for (const target of targets) {
      const value = getRowStructureValue(currentRow, target);
      const markerIndex = value.indexOf(marker);
      if (markerIndex < 0) continue;
      foundMarker = true;
      const splitIndex = markerIndex + marker.length;
      const before = value.slice(0, splitIndex).trim();
      const after = value.slice(splitIndex).trim();
      if (!after) continue;
      hasTail = true;
      segments[target] = { before, after };
    }

    if (!foundMarker) {
      setStructureError(key, t("upload.splitMarkerNotFoundSelected"));
      return;
    }
    if (!hasTail) {
      setStructureError(key, t("upload.splitMarkerEmptyTailSelected"));
      return;
    }
    const didSplit = splitSelectedFieldsToNextRow(currentIndex, segments);
    if (!didSplit) return;
    if (segments.translation) {
      queueMicrotask(() => {
        const nextKey = editableRowsRef.current[currentIndex + 1]?.id;
        if (!nextKey) return;
        const nextTextarea = translationInputRefs.current[nextKey];
        nextTextarea?.focus();
        nextTextarea?.setSelectionRange(0, 0);
      });
    }
  };
  const applyRowStructureAction = () => {
    if (!rowStructureAction) return;
    const { rowKey, action } = rowStructureAction;
    const targets = getSelectedRowStructureTargets(rowStructureAction);
    if (action === "push") {
      pushRowsDown(rowKey, targets);
      return;
    }
    if (action === "merge_next") {
      mergeNextRowIntoCurrentRow(rowKey, targets);
      return;
    }
    splitRowByMarker(rowKey, targets);
  };
  const reanalyzeUnlockedRows = () => {
    const rows = editableRowsRef.current;
    if (rows.length === 0) return;
    const rebuilt: EditableSentenceRow[] = [];
    let cursor = 0;
    while (cursor < rows.length) {
      const row = rows[cursor];
      if (row.locked) {
        rebuilt.push({ ...row, origin: row.origin || "manual" });
        cursor += 1;
        continue;
      }

      const block: EditableSentenceRow[] = [];
      while (cursor < rows.length && !rows[cursor].locked) {
        block.push(rows[cursor]);
        cursor += 1;
      }
      const rebuiltBlock = buildEditableSentenceRows(
        entry.id,
        composeEditableSourceText(block),
        composeEditableTranslationText(block),
      ).map((rebuiltRow, index) => ({
        ...rebuiltRow,
        id: block[index]?.id || makeEditableRowId(entry.id),
        locked: false,
        origin: "auto",
      }));
      rebuilt.push(...rebuiltBlock);
    }
    applyStructuralRows(rebuilt);
  };
  const saveCurrentDraft = async () => {
    const nextAlignmentRows = buildStoredAlignmentRows(editableRowsRef.current);
    const nextSourcePayload = composeEditableSourceText(editableRowsRef.current);
    const nextTranslationPayload = composeEditableTranslationText(editableRowsRef.current);
    const nextReviewNotePayload = reviewNoteRef.current;
    setSavingEditorDraft(true);
    setEditorSaveMessage("");
    setEditorErrorMessage("");
    try {
      const updated = await onSave({
        ...entry,
        zh_text: nextSourcePayload,
        ko_text: nextTranslationPayload,
        ko_text_confirmed: nextTranslationPayload,
        review_note: nextReviewNotePayload,
        alignment_rows: nextAlignmentRows,
      });
      if (!updated) return;
      const nextSourceText = updated.zh_text || "";
      const nextTranslationText = preferredRecordTranslation(updated);
      setSourceTextValue(nextSourceText);
      setLinkedTranslationText(nextTranslationText);
      resetEditableRows(nextSourceText, nextTranslationText, updated.alignment_rows);
      setReviewNoteValue(updated.review_note || "");
      setEditorSaveMessage(t("upload.saveSuccess"));
      setHistoryMessage(t("upload.saveSuccess"));
      await loadDraftHistory();
    } finally {
      setSavingEditorDraft(false);
    }
  };
  const retranslateCurrentChapter = async () => {
    const nextSourcePayload = composeEditableSourceText(editableRowsRef.current);
    if (!nextSourcePayload.trim()) {
      setEditorSaveMessage("");
      setEditorErrorMessage(t("upload.translateNeedsSource"));
      return;
    }
    setEditorErrorMessage("");
    const nextTranslationPayload = composeEditableTranslationText(editableRowsRef.current);
    const updated = await onRetranslate({
      ...entry,
      zh_text: nextSourcePayload,
      ko_text: nextTranslationPayload,
      ko_text_confirmed: nextTranslationPayload,
      review_note: reviewNoteRef.current,
      alignment_rows: buildStoredAlignmentRows(editableRowsRef.current),
    });
    if (updated) {
      const nextSourceText = updated.zh_text || "";
      const nextTranslationText = preferredRecordTranslation(updated);
      setSourceTextValue(nextSourceText);
      setLinkedTranslationText(nextTranslationText);
      resetEditableRows(nextSourceText, nextTranslationText, updated.alignment_rows);
      setReviewNoteValue(updated.review_note || "");
      setEditorTab("edit");
      setEditorSaveMessage(t("upload.retranslateSuccess"));
      setHistoryMessage(t("upload.retranslateSuccess"));
      await loadDraftHistory();
    }
  };
  const restoreHistoryVersion = async (historyItem: DraftHistoryItem) => {
    if (restoringHistoryId) return;
    if (!window.confirm(t("upload.draftHistoryRestoreConfirm"))) return;

    setRestoringHistoryId(historyItem.id);
    setHistoryError("");
    setHistoryMessage("");
    try {
      const updated = await onRestoreHistory(entry.id, historyItem.id);
      if (!updated) return;
      const nextSourceText = updated.zh_text || "";
      const nextTranslationText = preferredRecordTranslation(updated);
      setSourceTextValue(nextSourceText);
      setLinkedTranslationText(nextTranslationText);
      resetEditableRows(nextSourceText, nextTranslationText, updated.alignment_rows);
      setReviewNoteValue(updated.review_note || "");
      setEditorTab("edit");
      setEditorSaveMessage(t("upload.draftHistoryRestoreSuccess"));
      setHistoryMessage(t("upload.draftHistoryRestoreSuccess"));
      await loadDraftHistory();
    } catch (err) {
      setHistoryError(getApiErrorMessage(err, t("upload.draftHistoryRestoreFailed")));
    } finally {
      setRestoringHistoryId(null);
    }
  };
  const verifyCurrentDraft = async () => {
    const source = composeEditableSourceText(editableRowsRef.current).trim();
    const translation = composeEditableTranslationText(editableRowsRef.current).trim();
    if (!source || !translation || verifyingDraft) return;

    setEditorTab("verify");
    setVerifyingDraft(true);
    setVerifyError("");
    setVerifyReportMessage("");
    setVerifyReportError("");
    try {
      const result = await verifyDraft({
        source_text: source,
        translation_text: translation,
        book: entry.book || entry.book_ko || entry.book_zh || undefined,
        genre: entry.genre || [],
        era_profile: entry.era_profile || "ancient",
        ...buildLlmOverrides(),
      });
      setVerifyResult(result);
    } catch (err) {
      setVerifyError(getApiErrorMessage(err, t("upload.draftVerifyFailed")));
    } finally {
      setVerifyingDraft(false);
    }
  };
  const translateEditRow = async (row: EditableSentenceRow, key: string) => {
    const sourceSentence = row.sourceSentence.trim();
    if (!sourceSentence || translatingRowKey) return;

    setTranslatingRowKey(key);
    clearRowError(setRowTranslationErrors, key);
    try {
      const response = await translate({
        text: sourceSentence,
        book: entry.book || entry.book_ko || entry.book_zh || undefined,
        genre: entry.genre || [],
        era_profile: entry.era_profile || "ancient",
        with_annotations: false,
        with_cultural_check: false,
        ...buildLlmOverrides(),
      });
      const translated = sanitizeKoreanTranslationPunctuation(response.translated).trim();
      if (!translated) return;

      updateEditableRow(key, { translationSentence: translated });
    } catch (err) {
      console.warn("[draft-editor] row translation failed", err);
      setRowTranslationErrors((prev) => ({
        ...prev,
        [key]: getApiErrorMessage(err, t("upload.translateRowFailed")),
      }));
    } finally {
      setTranslatingRowKey(null);
    }
  };
  const rewriteToneRow = async (row: EditableSentenceRow, key: string) => {
    const translationSentence = row.translationSentence.trim();
    if (!translationSentence || rewritingToneRowKey) return;

    setRewritingToneRowKey(key);
    clearRowError(setRowToneErrors, key);
    try {
      const response = await rewriteTone({
        source_text: row.sourceSentence.trim(),
        translation_text: translationSentence,
        target_tone: tonePreset,
        book: entry.book || entry.book_ko || entry.book_zh || undefined,
        genre: entry.genre || [],
        era_profile: entry.era_profile || "ancient",
        ...buildLlmOverrides(),
      });
      const rewritten = sanitizeKoreanTranslationPunctuation(response.rewritten).trim();
      if (!rewritten) return;

      updateEditableRow(key, { translationSentence: rewritten });
    } catch (err) {
      console.warn("[draft-editor] tone rewrite failed", err);
      setRowToneErrors((prev) => ({
        ...prev,
        [key]: getApiErrorMessage(err, t("upload.rewriteToneFailed")),
      }));
    } finally {
      setRewritingToneRowKey(null);
    }
  };
  const explainEditRow = async (row: EditableSentenceRow, key: string) => {
    const sourceSentence = row.sourceSentence.trim();
    if (!sourceSentence || explainingRowKey) return;

    setExplainingRowKey(key);
    clearRowError(setRowExplanationErrors, key);
    try {
      const response = await explainSentence({
        source_text: sourceSentence,
        translation_text: row.translationSentence.trim(),
        book: entry.book || entry.book_ko || entry.book_zh || undefined,
        genre: entry.genre || [],
        era_profile: entry.era_profile || "ancient",
        ...buildLlmOverrides(),
      });
      const explanation = response.explanation.trim();
      if (explanation) {
        setRowExplanations((prev) => ({ ...prev, [key]: explanation }));
      }
    } catch (err) {
      console.warn("[draft-editor] row explanation failed", err);
      setRowExplanationErrors((prev) => ({
        ...prev,
        [key]: getApiErrorMessage(err, t("upload.explainRowFailed")),
      }));
    } finally {
      setExplainingRowKey(null);
    }
  };
  const formatDraftHistoryTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return date.toLocaleString(dateLocale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const draftHistorySourceLabel = (source: string) => {
    if (source === "create") return t("upload.draftHistorySourceCreate");
    if (source === "confirm") return t("upload.draftHistorySourceConfirm");
    if (source === "before_restore") return t("upload.draftHistorySourceBeforeRestore");
    if (source === "before_confirm") return t("upload.draftHistorySourceBeforeConfirm");
    if (source === "before_save") return t("upload.draftHistorySourceBeforeSave");
    return t("upload.draftHistorySourceSave");
  };
  const previewSnippet = (value: string, maxLength = 180) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) return "—";
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  };
  const draftVerifyVerdictLabel = (verdict: string) => {
    if (verdict === "ready") return t("upload.draftVerifyVerdictReady");
    if (verdict === "needs_major_revision") return t("upload.draftVerifyVerdictMajor");
    return t("upload.draftVerifyVerdictMinor");
  };
  const draftVerifySeverityLabel = (severity: string) => {
    if (severity === "critical") return t("upload.draftVerifySeverityCritical");
    if (severity === "major") return t("upload.draftVerifySeverityMajor");
    if (severity === "suggestion") return t("upload.draftVerifySeveritySuggestion");
    return t("upload.draftVerifySeverityMinor");
  };
  const draftVerifyStatusClass = (status: string) => {
    if (status === "pass") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-200";
    if (status === "fail") return "border-red-500/20 bg-red-500/10 text-red-200";
    return "border-amber-500/20 bg-amber-500/10 text-amber-200";
  };
  const draftVerifySeverityClass = (severity: string) => {
    if (severity === "critical") return "border-red-500/30 bg-red-500/15 text-red-200";
    if (severity === "major") return "border-orange-500/30 bg-orange-500/15 text-orange-200";
    if (severity === "suggestion") return "border-sky-500/25 bg-sky-500/10 text-sky-200";
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  };
  const formatSavedVerifyReportTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return date.toLocaleString(dateLocale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  const saveVerifyReportInProgram = async () => {
    if (!verifyResult || savingVerifyReport) return;
    setSavingVerifyReport(true);
    setVerifyReportMessage("");
    setVerifyReportError("");
    try {
      const report = makeSavedVerifyReport(verifyResult);
      const updated = await onSave({
        ...entry,
        zh_text: composeEditableSourceText(editableRowsRef.current),
        ko_text: composeEditableTranslationText(editableRowsRef.current),
        ko_text_confirmed: composeEditableTranslationText(editableRowsRef.current),
        review_note: reviewNoteRef.current,
        alignment_rows: buildStoredAlignmentRows(editableRowsRef.current),
        verify_reports: [report, ...savedVerifyReports].slice(0, 20),
      });
      const nextReports = updated?.verify_reports || [report, ...savedVerifyReports].slice(0, 20);
      setSavedVerifyReports(nextReports);
      setVerifyReportMessage(t("upload.draftVerifySaveInAppSuccess"));
    } catch (err) {
      setVerifyReportError(getApiErrorMessage(err, t("upload.draftVerifySaveInAppFailed")));
    } finally {
      setSavingVerifyReport(false);
    }
  };
  const saveVerifyReportAsPdf = async (report: SavedVerifyReport) => {
    if (printingVerifyReport) return;
    setPrintingVerifyReport(true);
    setVerifyReportMessage("");
    setVerifyReportError("");
    try {
      openVerifyReportPdfDialog({
        report,
        bookLabel: entry.book || entry.book_ko || entry.book_zh || t("upload.draftVerifyTitle"),
        chapterLabel: `${t("reader.chapter")} ${entry.chapter_ko}`,
        verdictLabel: t("upload.draftVerifyVerdictLabel"),
        verdictValue: draftVerifyVerdictLabel(report.verdict),
        scoreLabel: t("upload.draftVerifyScore"),
        summaryLabel: t("upload.draftVerifySummary"),
        categoriesLabel: t("upload.draftVerifyCategories"),
        issuesLabel: t("upload.draftVerifyIssues"),
        strengthsLabel: t("upload.draftVerifyStrengths"),
        sourceLabel: t("upload.source"),
        translationLabel: t("upload.translation"),
        createdAtLabel: t("upload.draftVerifyReportCreatedAt"),
      });
      setVerifyReportMessage(t("upload.draftVerifySavePdfHint"));
    } catch (err) {
      setVerifyReportError(getApiErrorMessage(err, t("upload.draftVerifySavePdfFailed")));
    } finally {
      setPrintingVerifyReport(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-[min(96vw,1500px)] max-h-[90vh] glass-card border-indigo-500/20 flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"><Eye className="w-4 h-4 text-indigo-400" /></div>
            <div>
              <h3 className="text-white font-semibold text-sm">{entry.book} — {entry.chapter_ko}{locale === "ko" ? "화" : locale === "zh" ? "话" : ""}</h3>
              <p className="text-xs text-slate-500">{entry.updated_at ? new Date(entry.updated_at).toLocaleDateString(dateLocale, { year: "numeric", month: "long", day: "numeric" }) : "—"}</p>
            </div>
          </div>
          <button onClick={requestClose} className="w-8 h-8 rounded-lg bg-surface-lighter flex items-center justify-center text-slate-400 hover:text-white hover:bg-surface-border transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${sourceText ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.source")} {sourceText ? "✓" : "✗"}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${linkedTranslationText ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-surface-lighter text-slate-500 border-surface-border"}`}>{t("upload.translation")} {linkedTranslationText ? "✓" : "✗"}</span>
              <StatusBadge status={entry.status} />
            </div>
            <div className="flex flex-wrap gap-1 rounded-xl border border-surface-border bg-surface/70 p-1">
              {editorTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEditorTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    editorTab === tab.id
                      ? "bg-indigo-500/20 text-white"
                      : "text-slate-400 hover:bg-surface-lighter/70 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {editorTab === "edit" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
                <p className="text-xs text-indigo-100">{t("upload.draftEditorEditHint")}</p>
                <div className="flex items-center gap-2">
                  {editorErrorMessage && (
                    <span className="text-xs text-amber-300">{editorErrorMessage}</span>
                  )}
                  {editorSaveMessage && (
                    <span className="text-xs text-emerald-300">{editorSaveMessage}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { void verifyCurrentDraft(); }}
                    disabled={verifyingDraft || !sourceText.trim() || !linkedTranslationText.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {verifyingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {verifyingDraft ? t("upload.draftVerifyRunning") : t("upload.draftVerifyRun")}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void saveCurrentDraft(); }}
                    disabled={savingEditorDraft}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/80 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingEditorDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {savingEditorDraft ? t("upload.saving") : t("upload.saveDraft")}
                  </button>
                </div>
              </div>

              <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5">
                <button
                  type="button"
                  onClick={() => setOpenEditPanel("sentences")}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">{t("upload.draftEditorSentenceBlocks")}</h4>
                    <p className="mt-1 text-xs text-slate-500">{t("upload.source")} / {t("upload.translation")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reanalyzeUnlockedRows();
                      }}
                      disabled={editableRows.length === 0}
                      className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-lighter px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCcw className="h-3 w-3" />
                      {t("upload.reanalyzeUnlockedRows")}
                    </button>
                    {openEditPanel === "sentences" ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>
                {openEditPanel === "sentences" && (
                  <div className="border-t border-surface-border/70 p-4">
                    {editableRows.length > 0 ? (
                      <div className="max-h-[54vh] space-y-3 overflow-auto pr-1">
                        {editableRows.map((row, index) => {
                          const rowKey = row.id;
                          const rowExplanation = rowExplanations[rowKey];
                          const explanationError = rowExplanationErrors[rowKey];
                          const translationError = rowTranslationErrors[rowKey];
                          const toneError = rowToneErrors[rowKey];
                          const structureError = rowStructureErrors[rowKey];
                          const rowStructurePanel = rowStructureAction?.rowKey === rowKey ? rowStructureAction : null;
                          const selectedStructureTargets = getSelectedRowStructureTargets(rowStructurePanel);
                          const combinedRowError = [translationError, toneError, structureError]
                            .filter((value): value is string => !!value)
                            .join("\n");
                          return (
                          <div key={rowKey} className="rounded-xl border border-surface-border bg-surface/70 p-3">
                            <div className="mb-3 flex flex-wrap items-start gap-2">
                              <p className="font-mono text-[11px] text-slate-500">#{index + 1}</p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openRowStructureAction(rowKey, "push")}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                                    rowStructurePanel?.action === "push"
                                      ? "border-indigo-500/30 bg-indigo-500/15 text-white"
                                      : "border-surface-border bg-surface-lighter text-slate-300 hover:text-white"
                                  }`}
                                >
                                  {t("upload.pushRowsDown")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRowStructureAction(rowKey, "merge_next")}
                                  disabled={index >= editableRows.length - 1}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    rowStructurePanel?.action === "merge_next"
                                      ? "border-indigo-500/30 bg-indigo-500/15 text-white"
                                      : "border-surface-border bg-surface-lighter text-slate-300 hover:text-white"
                                  }`}
                                >
                                  {t("upload.mergeNextRow")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRowStructureAction(rowKey, "split_marker")}
                                  disabled={!row.sourceSentence.trim() && !row.translationSentence.trim()}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                    rowStructurePanel?.action === "split_marker"
                                      ? "border-indigo-500/30 bg-indigo-500/15 text-white"
                                      : "border-surface-border bg-surface-lighter text-slate-300 hover:text-white"
                                  }`}
                                >
                                  {t("upload.splitRowByMarker")}
                                </button>
                              </div>
                            </div>
                            {rowStructurePanel && (
                              <div className="mb-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <span className="text-[11px] font-medium text-indigo-100">
                                    {t("upload.rowStructureTargetsLabel")}
                                  </span>
                                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={rowStructurePanel.includeSource}
                                      onChange={(e) => updateRowStructureTarget("source", e.target.checked)}
                                      className="h-3.5 w-3.5 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50"
                                    />
                                    {t("upload.source")}
                                  </label>
                                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={rowStructurePanel.includeTranslation}
                                      onChange={(e) => updateRowStructureTarget("translation", e.target.checked)}
                                      className="h-3.5 w-3.5 rounded border-surface-border bg-surface text-indigo-600 focus:ring-indigo-500/50"
                                    />
                                    {t("upload.translation")}
                                  </label>
                                </div>
                                {rowStructurePanel.action === "push" && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      inputMode="numeric"
                                      value={rowPushCounts[rowKey] || ""}
                                      onChange={(e) => setRowPushCountValue(rowKey, e.target.value)}
                                      placeholder={t("upload.pushRowsCountPlaceholder")}
                                      className="h-8 w-[128px] rounded-lg border border-surface-border bg-surface-lighter px-2.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none"
                                    />
                                  </div>
                                )}
                                {rowStructurePanel.action === "split_marker" && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <input
                                      type="text"
                                      value={rowSplitMarkers[rowKey] || ""}
                                      onChange={(e) => setRowSplitMarkerValue(rowKey, e.target.value)}
                                      placeholder={t("upload.splitMarkerPlaceholder")}
                                      className="h-8 min-w-[160px] rounded-lg border border-surface-border bg-surface-lighter px-2.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-indigo-400/60 focus:outline-none"
                                    />
                                  </div>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={applyRowStructureAction}
                                    disabled={selectedStructureTargets.length === 0}
                                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/80 px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {rowStructurePanel.action === "push"
                                      ? t("upload.pushRowsDown")
                                      : rowStructurePanel.action === "merge_next"
                                        ? t("upload.mergeNextRow")
                                        : t("upload.splitRowByMarker")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={closeRowStructureAction}
                                    className="inline-flex items-center gap-1 rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-[11px] font-medium text-slate-300 transition-colors hover:text-white"
                                  >
                                    {t("upload.cancel")}
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">{t("upload.source")}</p>
                                  <button
                                    type="button"
                                    onClick={() => { void explainEditRow(row, rowKey); }}
                                    disabled={!!explainingRowKey || !row.sourceSentence.trim()}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {explainingRowKey === rowKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Sparkles className="h-3 w-3" />
                                    )}
                                    {explainingRowKey === rowKey ? t("upload.explainingRow") : t("upload.explainRow")}
                                  </button>
                                </div>
                                <textarea
                                  value={row.sourceSentence}
                                  onFocus={() => setOpenEditPanel("sentences")}
                                  onChange={(e) => updateSourceRow(rowKey, e.target.value)}
                                  placeholder={t("upload.noSourceText")}
                                  className="w-full min-h-[108px] px-3 py-2 bg-surface-lighter border border-emerald-500/15 rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-emerald-500/50 resize-y"
                                />
                                {explainingRowKey === rowKey && (
                                  <p className="mt-2 text-xs leading-5 text-slate-500">{t("upload.explainingRow")}</p>
                                )}
                                {(rowExplanation || explanationError) && (
                                  <p className={`mt-2 whitespace-pre-wrap text-xs leading-5 ${explanationError ? "text-amber-300" : "text-slate-500"}`}>
                                    {rowExplanation || explanationError}
                                  </p>
                                )}
                              </div>
                              <div>
                                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/70">{t("upload.translation")}</p>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <label className="sr-only" htmlFor={`${rowKey}:tone-preset`}>
                                      {t("upload.tonePresetLabel")}
                                    </label>
                                    <select
                                      id={`${rowKey}:tone-preset`}
                                      value={tonePreset}
                                      onChange={(e) => setTonePreset(e.target.value as TonePresetId)}
                                      className="h-7 rounded-full border border-surface-border bg-surface-lighter px-2 text-[10px] font-medium text-slate-200 focus:border-indigo-400/60 focus:outline-none"
                                    >
                                      {TONE_PRESETS.map((preset) => (
                                        <option key={preset.id} value={preset.id}>
                                          {t(preset.labelKey)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => { void rewriteToneRow(row, rowKey); }}
                                      disabled={!!rewritingToneRowKey || !row.translationSentence.trim()}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {rewritingToneRowKey === rowKey ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-3 w-3" />
                                      )}
                                      {rewritingToneRowKey === rowKey ? t("upload.rewritingTone") : t("upload.rewriteTone")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { void translateEditRow(row, rowKey); }}
                                      disabled={!!translatingRowKey || !row.sourceSentence.trim()}
                                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-100 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {translatingRowKey === rowKey ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-3 w-3" />
                                      )}
                                      {translatingRowKey === rowKey ? t("upload.translatingRow") : t("upload.translateRow")}
                                    </button>
                                  </div>
                                </div>
                                <textarea
                                  value={row.translationSentence}
                                  ref={(node) => setTranslationInputRef(rowKey, node)}
                                  onFocus={() => setOpenEditPanel("sentences")}
                                  onChange={(e) => updateDraftRow(rowKey, e.target.value)}
                                  placeholder={t("upload.noTranslation")}
                                  className="w-full min-h-[108px] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-indigo-500/50 resize-y"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleRowLock(rowKey)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
                                      row.locked
                                        ? "border-amber-500/25 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                        : "border-surface-border bg-surface-lighter text-slate-300 hover:text-white"
                                    }`}
                                  >
                                    {row.locked ? t("upload.unlockRow") : t("upload.lockRow")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => liftFollowingTranslationsUp(rowKey)}
                                    disabled={index >= editableRows.length - 1}
                                    className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-lighter px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {t("upload.shiftTranslationsUp")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => splitTranslationToNextRow(rowKey)}
                                    disabled={!row.translationSentence.trim()}
                                    className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-lighter px-2 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {t("upload.splitRowAtCursor")}
                                  </button>
                                </div>
                                {combinedRowError && (
                                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-amber-300">
                                    {combinedRowError}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        value={linkedTranslationText}
                        onFocus={() => setOpenEditPanel("sentences")}
                        onChange={(e) => {
                          rebuildRowsFromTranslationProjection(e.target.value);
                        }}
                        placeholder={t("upload.noTranslation")}
                        className="w-full min-h-[240px] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-indigo-500/50 resize-y"
                      />
                    )}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-surface-border bg-surface/70">
                <button
                  type="button"
                  onClick={() => setOpenEditPanel("full")}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div>
                    <h4 className="text-sm font-medium text-slate-200">{t("upload.draftEditorFullText")}</h4>
                    <p className="mt-1 text-xs text-slate-500">{t("upload.draftEditorEditHint")}</p>
                  </div>
                  {openEditPanel === "full" ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                </button>
                {openEditPanel === "full" && (
                  <div className="border-t border-surface-border/70 p-4">
                    <textarea
                      value={linkedTranslationText}
                      onFocus={() => setOpenEditPanel("full")}
                      onChange={(e) => {
                        rebuildRowsFromTranslationProjection(e.target.value);
                      }}
                      placeholder={t("upload.noTranslation")}
                      className="w-full min-h-[420px] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-indigo-500/50 resize-y"
                    />
                  </div>
                )}
              </section>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { void saveCurrentDraft(); }}
                  disabled={savingEditorDraft}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/80 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingEditorDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingEditorDraft ? t("upload.saving") : t("upload.saveDraft")}
                </button>
              </div>
            </div>
          )}

          {editorTab === "confirmed" && (
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-surface-border bg-surface/70 p-4">
                <h4 className="text-sm font-medium text-slate-300 mb-2">{t("upload.previewTitle")}</h4>
                <pre className="max-h-[62vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
                  {linkedTranslationText || t("upload.noTranslation")}
                </pre>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <h4 className="text-sm font-medium text-emerald-200 mb-2">{t("upload.confirmedText")}</h4>
                <textarea
                  value={linkedTranslationText}
                  onChange={(e) => {
                    rebuildRowsFromTranslationProjection(e.target.value);
                  }}
                  className="w-full min-h-[62vh] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-emerald-500/50 resize-y"
                />
              </div>
            </div>
          )}

          {editorTab === "meta" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="rounded-2xl border border-surface-border bg-surface/70 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-1">{t("upload.source")}</h4>
                  <p className="text-xs text-slate-500 mb-2">{t("upload.draftEditorSourceEditHint")}</p>
                  <textarea
                    value={sourceText}
                    onChange={(e) => {
                      rebuildRowsFromSourceProjection(e.target.value);
                    }}
                    placeholder={t("upload.noSourceText")}
                    className="w-full min-h-[320px] px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-7 focus:outline-none focus:border-indigo-500/50 resize-y"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-2">{t("upload.reviewNote")}</h4>
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNoteValue(e.target.value)}
                    placeholder={t("upload.reviewNotePlaceholder")}
                    rows={4}
                    className="w-full px-3 py-2 bg-surface-lighter border border-surface-border rounded-lg text-white text-sm leading-relaxed focus:outline-none focus:border-indigo-500/50 resize-y"
                  />
                </div>
              </div>

              {sourceText ? (
                <div className="rounded-2xl border border-surface-border bg-surface/70 p-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-3">{t("upload.sourceSummary")}</h4>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-surface-border bg-surface-lighter/60 p-3">
                      <p className="text-xs font-medium text-slate-500 mb-2">
                        {sourceSummary.truncated ? t("upload.alignmentBoundaryStart") : t("upload.source")}
                      </p>
                      <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {sourceSummary.start}
                      </p>
                    </div>
                    {sourceSummary.end && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <p className="text-xs font-medium text-emerald-300 mb-2">
                          {t("upload.alignmentBoundaryEnd")}
                        </p>
                        <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                          {sourceSummary.end}
                        </p>
                      </div>
                    )}
                    {sourceSummary.truncated && (
                      <p className="text-xs text-slate-500">{t("upload.sourceSummaryOmitted")}</p>
                    )}
                    {sourceText.length > 500 && (
                      <p className="text-xs text-slate-600">
                        {t("upload.totalChars")} {sourceText.length.toLocaleString()}{locale === "ko" ? "자" : locale === "zh" ? "字" : " chars"}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-surface-border bg-surface/70 p-6 text-sm text-slate-500">
                  {t("upload.noSourceText")}
                </div>
              )}
            </div>
          )}

          {editorTab === "history" && (
            <div className="rounded-2xl border border-surface-border bg-surface/70 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <History className="h-4 w-4 text-indigo-300" />
                    {t("upload.draftHistoryTitle")}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">{t("upload.draftHistoryHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { void loadDraftHistory(); }}
                  disabled={historyLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                  {t("upload.draftHistoryRefresh")}
                </button>
              </div>

              {historyMessage && (
                <p className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {historyMessage}
                </p>
              )}
              {historyError && (
                <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {historyError}
                </p>
              )}

              {historyLoading && draftHistory.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-lighter/50 p-4 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("upload.draftHistoryLoading")}
                </div>
              ) : draftHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-border bg-surface-lighter/30 p-6 text-center text-sm text-slate-500">
                  {t("upload.draftHistoryEmpty")}
                </div>
              ) : (
                <div className="max-h-[62vh] space-y-3 overflow-auto pr-1">
                  {draftHistory.map((historyItem, index) => {
                    const restored = restoringHistoryId === historyItem.id;
                    const translationPreview = historyItem.ko_text || historyItem.ko_text_confirmed;
                    return (
                      <div key={historyItem.id} className="rounded-xl border border-surface-border bg-surface-lighter/45 p-4">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-200">
                              {t("upload.draftHistoryVersion")} #{draftHistory.length - index}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {formatDraftHistoryTime(historyItem.created_at)} · {draftHistorySourceLabel(historyItem.source)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => { void restoreHistoryVersion(historyItem); }}
                            disabled={!!restoringHistoryId}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/80 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {restored ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                            {restored ? t("upload.draftHistoryRestoring") : t("upload.draftHistoryRestore")}
                          </button>
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">{t("upload.source")}</p>
                            <p className="text-sm leading-6 text-slate-300">{previewSnippet(historyItem.zh_text)}</p>
                          </div>
                          <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/[0.04] p-3">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/70">{t("upload.translation")}</p>
                            <p className="text-sm leading-6 text-slate-300">{previewSnippet(translationPreview)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {editorTab === "verify" && (
            <div className="rounded-2xl border border-surface-border bg-surface/70 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    {t("upload.draftVerifyTitle")}
                  </h4>
                  <p className="mt-1 text-xs text-slate-500">{t("upload.draftVerifyHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { void verifyCurrentDraft(); }}
                  disabled={verifyingDraft || !sourceText.trim() || !linkedTranslationText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {verifyingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {verifyingDraft ? t("upload.draftVerifyRunning") : t("upload.draftVerifyRun")}
                </button>
              </div>

              {verifyError && (
                <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {verifyError}
                </p>
              )}
              {verifyReportError && (
                <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  {verifyReportError}
                </p>
              )}
              {verifyReportMessage && (
                <p className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                  {verifyReportMessage}
                </p>
              )}

              {verifyingDraft && !verifyResult ? (
                <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface-lighter/50 p-4 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("upload.draftVerifyRunning")}
                </div>
              ) : !verifyResult ? (
                <div className="rounded-xl border border-dashed border-surface-border bg-surface-lighter/30 p-6 text-center text-sm text-slate-500">
                  {t("upload.draftVerifyEmpty")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { void saveVerifyReportInProgram(); }}
                      disabled={savingVerifyReport}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600/80 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingVerifyReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {savingVerifyReport ? t("upload.draftVerifySavingInApp") : t("upload.draftVerifySaveInApp")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void saveVerifyReportAsPdf(makeSavedVerifyReport(verifyResult)); }}
                      disabled={printingVerifyReport}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-lighter px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {printingVerifyReport ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {printingVerifyReport ? t("upload.draftVerifyPreparingPdf") : t("upload.draftVerifySavePdf")}
                    </button>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <p className="text-xs font-medium text-emerald-200">{t("upload.draftVerifyScore")}</p>
                      <p className="mt-2 text-5xl font-semibold text-white">{verifyResult.overall_score}</p>
                      <p className="mt-3 inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-100">
                        {draftVerifyVerdictLabel(verifyResult.verdict)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-surface-border bg-surface-lighter/45 p-4">
                      <p className="mb-2 text-xs font-medium text-slate-500">{t("upload.draftVerifySummary")}</p>
                      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{verifyResult.summary}</p>
                      <p className="mt-3 text-[11px] text-slate-600">{t("upload.draftVerifyModel")} {verifyResult.model}</p>
                    </div>
                  </div>

                  <div>
                    <h5 className="mb-2 text-sm font-medium text-slate-300">{t("upload.draftVerifyCategories")}</h5>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {verifyResult.categories.map((category) => (
                        <div key={category.id} className="rounded-xl border border-surface-border bg-surface-lighter/45 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-200">{category.label}</p>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${draftVerifyStatusClass(category.status)}`}>
                              {category.score}
                            </span>
                          </div>
                          <p className="text-xs leading-5 text-slate-400">{category.comment}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="mb-2 text-sm font-medium text-slate-300">{t("upload.draftVerifyIssues")}</h5>
                    {verifyResult.issues.length === 0 ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                        {t("upload.draftVerifyNoIssues")}
                      </div>
                    ) : (
                      <div className="max-h-[42vh] space-y-3 overflow-auto pr-1">
                        {verifyResult.issues.map((issue, index) => (
                          <div key={`${issue.category}:${index}`} className="rounded-xl border border-surface-border bg-surface-lighter/45 p-4">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${draftVerifySeverityClass(issue.severity)}`}>
                                {draftVerifySeverityLabel(issue.severity)}
                              </span>
                              <span className="rounded-full border border-surface-border bg-surface/70 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                                {issue.category}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-slate-100">{issue.problem}</p>
                            {(issue.source_excerpt || issue.translation_excerpt) && (
                              <div className="mt-3 grid gap-2 xl:grid-cols-2">
                                {issue.source_excerpt && (
                                  <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
                                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">{t("upload.source")}</p>
                                    <p className="text-xs leading-5 text-slate-300">{issue.source_excerpt}</p>
                                  </div>
                                )}
                                {issue.translation_excerpt && (
                                  <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/[0.04] p-3">
                                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-indigo-300/70">{t("upload.translation")}</p>
                                    <p className="text-xs leading-5 text-slate-300">{issue.translation_excerpt}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {issue.suggestion && (
                              <p className="mt-3 rounded-lg border border-sky-500/15 bg-sky-500/10 p-3 text-xs leading-5 text-sky-100">
                                {issue.suggestion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {verifyResult.strengths.length > 0 && (
                    <div>
                      <h5 className="mb-2 text-sm font-medium text-slate-300">{t("upload.draftVerifyStrengths")}</h5>
                      <div className="space-y-2">
                        {verifyResult.strengths.map((strength, index) => (
                          <p key={`${strength}:${index}`} className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2 text-xs leading-5 text-emerald-100">
                            {strength}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h5 className="mb-2 text-sm font-medium text-slate-300">{t("upload.draftVerifySavedReports")}</h5>
                    {savedVerifyReports.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-surface-border bg-surface-lighter/30 p-4 text-sm text-slate-500">
                        {t("upload.draftVerifySavedReportsEmpty")}
                      </div>
                    ) : (
                      <div className="max-h-[32vh] space-y-3 overflow-auto pr-1">
                        {savedVerifyReports.map((report) => (
                          <div key={report.id} className="rounded-xl border border-surface-border bg-surface-lighter/45 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-100">
                                  {draftVerifyVerdictLabel(report.verdict)} · {report.overall_score}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {t("upload.draftVerifyReportCreatedAt")} {formatSavedVerifyReportTime(report.created_at)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => { void saveVerifyReportAsPdf(report); }}
                                disabled={printingVerifyReport}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {t("upload.draftVerifySavePdf")}
                              </button>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{report.summary}</p>
                            <p className="mt-2 text-[11px] text-slate-600">{t("upload.draftVerifyModel")} {report.model}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={() => { void retranslateCurrentChapter(); }}
              disabled={retranslating}
              title={chapterHasSource ? undefined : t("upload.translateNeedsSource")}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                chapterHasSource
                  ? "bg-indigo-600/80 hover:bg-indigo-500"
                  : "bg-amber-600/80 hover:bg-amber-500"
              }`}
            >
              {retranslating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : chapterHasSource ? (
                <Languages className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {retranslating
                ? chapterTranslationExists
                  ? t("upload.retranslating")
                  : t("upload.translatingChapter")
                : chapterHasSource
                  ? chapterTranslationExists
                    ? t("upload.retranslateChapter")
                    : t("upload.translateChapter")
                  : t("upload.sourceMissingShort")}
            </button>
            <button onClick={() => onExtract(entry.id)} disabled={extracting} className="px-3 py-2 rounded-lg bg-emerald-600/80 text-white text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {extracting ? t("upload.uploading") : t("upload.reextractChapterTerms")}
            </button>
            <button
              onClick={() => { void verifyCurrentDraft(); }}
              disabled={verifyingDraft || !sourceText.trim() || !linkedTranslationText.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600/80 text-white text-xs font-medium hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {verifyingDraft ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {verifyingDraft ? t("upload.draftVerifyRunning") : t("upload.draftVerifyRun")}
            </button>
            <button
              onClick={() => { void saveCurrentDraft(); }}
              disabled={savingEditorDraft}
              className="px-3 py-2 rounded-lg bg-indigo-600/80 text-white text-xs font-medium hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingEditorDraft ? t("upload.saving") : t("upload.saveDraft")}
            </button>
            <button
              onClick={() =>
                onConfirm(entry.id, {
                  ko_text_confirmed: composeEditableTranslationText(editableRowsRef.current).trim(),
                  review_note: reviewNoteRef.current,
                  alignment_rows: buildStoredAlignmentRows(editableRowsRef.current),
                })
              }
              disabled={!linkedTranslationText.trim()}
              className="px-3 py-2 rounded-lg bg-amber-600/80 text-white text-xs font-medium hover:bg-amber-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("upload.confirmRecord")}
            </button>
            <button
              onClick={() => onExport(entry, "jsonl")}
              disabled={entry.status !== "confirmed"}
              className="px-3 py-2 rounded-lg bg-surface-lighter border border-surface-border text-slate-300 text-xs font-medium hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {t("upload.exportRecord")}
            </button>
            <button onClick={() => onDelete(entry.id)} className="px-3 py-2 rounded-lg bg-red-600/80 text-white text-xs font-medium hover:bg-red-500 transition-colors">{t("upload.deleteRecord")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function preferredRecordTranslation(record: DatasetRecord) {
  const draft = record.ko_text || "";
  const confirmed = record.ko_text_confirmed || "";
  if (record.status === "confirmed") {
    return sanitizeKoreanTranslationPunctuation(confirmed.trim() ? confirmed : draft.trim() ? draft : "");
  }
  return sanitizeKoreanTranslationPunctuation(draft.trim() ? draft : confirmed.trim() ? confirmed : "");
}

function sanitizeKoreanTranslationPunctuation(value: string) {
  return value
    .replace(/^[ \t]*[—–―─-]{2,}[ \t]*$/gm, "")
    .replace(/[ \t]*(?:[—–―─]+|--+)[ \t]*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/[ \t]+([,.!?…])/g, "$1")
    .replace(/([(\[{「『])\s*,\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}


function buildSourceSummary(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { start: "", end: "", truncated: false };
  }

  const units = normalized
    .split(/\n+/)
    .map((unit) => unit.trim())
    .filter(Boolean);

  if (units.length >= 3) {
    const startCount = Math.min(2, units.length - 1);
    const endCount = Math.min(2, units.length - startCount);
    return {
      start: units.slice(0, startCount).join("\n\n"),
      end: units.slice(-endCount).join("\n\n"),
      truncated: true,
    };
  }

  const startChars = 280;
  const endChars = 220;
  if (normalized.length <= startChars + endChars + 40) {
    return { start: normalized, end: "", truncated: false };
  }

  return {
    start: `${normalized.slice(0, startChars).trimEnd()}…`,
    end: `…${normalized.slice(-endChars).trimStart()}`,
    truncated: true,
  };
}

function StatusBadge({ status }: { status: "draft" | "confirmed" }) {
  const { t } = useLanguage();

  if (status === "confirmed") {
    return <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-xs font-medium border border-emerald-500/20">{t("dashboard.confirmed")}</span>;
  }
  return <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20">{t("dashboard.draft")}</span>;
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
