"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { alignSyntax } from "@/lib/api";
import PinyinText from "@/components/PinyinText";
import type { DatasetAlignmentRow } from "@/lib/types";
import {
  buildParallelSyntaxAlignment,
  buildParallelSyntaxAlignmentFromSentenceRows,
  buildParallelSyntaxAlignmentFromPairs,
  type ParallelSyntaxAlignment,
  type ParallelSyntaxUnit,
} from "@/lib/parallelText";

interface ParallelSyntaxViewProps {
  sourceText: string;
  translationText: string;
  sourceLabel?: string;
  translationLabel?: string;
  className?: string;
  maxHeightClassName?: string;
  compact?: boolean;
  showStats?: boolean;
  title?: string;
  hint?: string;
  allowAiAlignment?: boolean;
  sentenceRows?: DatasetAlignmentRow[];
}

const confidenceTone = {
  high: "border-emerald-500/20 bg-emerald-500/5 text-emerald-200",
  medium: "border-amber-500/20 bg-amber-500/5 text-amber-100",
  low: "border-rose-500/20 bg-rose-500/5 text-rose-100",
};

function unitTone(
  unit: ParallelSyntaxUnit,
  activeMatchId: string | null,
  activeGrammarGroup: string | null,
) {
  const isMatchActive = activeMatchId === unit.matchId;
  const isGrammarActive = !!unit.grammarGroup && activeGrammarGroup === unit.grammarGroup;
  const isActive = isMatchActive || isGrammarActive;
  const hasActive = !!activeMatchId || !!activeGrammarGroup;
  const base =
    "inline rounded-md border px-1.5 py-0.5 transition-colors duration-150 cursor-default";
  const grammarRing = unit.grammarGroup ? " ring-1 ring-violet-400/25" : "";
  if (isActive) {
    const activeRing = isGrammarActive
      ? " ring-1 ring-violet-300/70"
      : " shadow-[0_0_0_1px_rgba(125,211,252,0.25)]";
    return `${base}${activeRing} border-sky-300/70 bg-sky-400/20 text-white`;
  }
  if (hasActive) {
    return `${base}${grammarRing} border-white/5 bg-black/10 text-slate-500`;
  }
  if (unit.confidence === "high") {
    return `${base}${grammarRing} border-white/5 bg-white/[0.03] text-slate-100 hover:border-sky-300/40 hover:bg-sky-400/10`;
  }
  if (unit.confidence === "medium") {
    return `${base}${grammarRing} border-amber-500/15 bg-amber-500/[0.04] text-slate-100 hover:border-sky-300/40 hover:bg-sky-400/10`;
  }
  return `${base}${grammarRing} border-rose-500/15 bg-rose-500/[0.04] text-slate-100 hover:border-sky-300/40 hover:bg-sky-400/10`;
}

export default function ParallelSyntaxView({
  sourceText,
  translationText,
  sourceLabel,
  translationLabel,
  className = "",
  maxHeightClassName = "max-h-[560px]",
  compact = false,
  showStats = true,
  title,
  hint,
  allowAiAlignment = false,
  sentenceRows,
}: ParallelSyntaxViewProps) {
  const { t } = useLanguage();
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeGrammarGroup, setActiveGrammarGroup] = useState<string | null>(null);
  const [aiAlignment, setAiAlignment] = useState<ParallelSyntaxAlignment | null>(null);
  const [aiModel, setAiModel] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const savedRowAlignment = useMemo(
    () => (sentenceRows && sentenceRows.length > 0
      ? buildParallelSyntaxAlignmentFromSentenceRows(sentenceRows)
      : null),
    [sentenceRows],
  );
  const heuristicAlignment = useMemo(
    () => buildParallelSyntaxAlignment(sourceText, translationText),
    [sourceText, translationText],
  );
  const fallbackAlignment = savedRowAlignment || heuristicAlignment;
  const alignment = aiAlignment || fallbackAlignment;
  const hasContent = alignment.groups.length > 0;
  const displaySourceLabel = sourceLabel || t("upload.source");
  const displayTranslationLabel = translationLabel || t("upload.translation");
  const confidenceLabel = (confidence: "high" | "medium" | "low") => {
    if (confidence === "high") return t("upload.parallelSyntaxConfidenceHigh");
    if (confidence === "medium") return t("upload.parallelSyntaxConfidenceMedium");
    return t("upload.parallelSyntaxConfidenceLow");
  };

  useEffect(() => {
    setAiAlignment(null);
    setAiModel("");
    setAiError(null);
  }, [sentenceRows, sourceText, translationText]);

  const handleAiAlign = async () => {
    if (!sourceText.trim() || !translationText.trim() || aligning) return;
    setAligning(true);
    setAiError(null);
    try {
      const response = await alignSyntax({
        source_text: sourceText,
        translation_text: translationText,
      });
      const nextAlignment = response.pairs.length > 0
        ? buildParallelSyntaxAlignmentFromPairs(response.pairs)
        : fallbackAlignment;
      setAiAlignment(nextAlignment.groups.length > 0 ? nextAlignment : fallbackAlignment);
      setAiModel(response.model);
    } catch (err) {
      console.warn("[parallel-syntax] AI alignment failed; using local fallback", err);
      setAiAlignment(fallbackAlignment);
      setAiModel("local-fallback:client-error");
      setAiError(null);
    } finally {
      setAligning(false);
    }
  };

  const aiModelLabel = aiModel.startsWith("local-fallback")
    ? t("upload.parallelSyntaxLocalFallback")
    : aiModel || t("upload.parallelSyntaxAiAligned");

  const renderUnits = (units: ParallelSyntaxUnit[]) => {
    if (units.length === 0) {
      return <span className="text-slate-600">—</span>;
    }

    return units.map((unit) => {
      const handleEnter = () => {
        setActiveMatchId(unit.matchId);
        setActiveGrammarGroup(unit.grammarGroup || null);
      };
      const handleLeave = () => {
        setActiveMatchId(null);
        setActiveGrammarGroup(null);
      };
      const handleClick = () => {
        const isCurrent =
          activeMatchId === unit.matchId &&
          (unit.grammarGroup ? activeGrammarGroup === unit.grammarGroup : !activeGrammarGroup);
        setActiveMatchId(isCurrent ? null : unit.matchId);
        setActiveGrammarGroup(isCurrent ? null : unit.grammarGroup || null);
      };
      const tooltipRows = [
        unit.annotation ? { label: "의미", value: unit.annotation } : null,
        unit.grammarGroup ? { label: "문법", value: unit.grammarGroup } : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>;

      const inner = (
        <span
          className={unitTone(unit, activeMatchId, activeGrammarGroup)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onFocus={handleEnter}
          onBlur={handleLeave}
          onClick={handleClick}
          role="button"
          tabIndex={0}
        >
          {unit.text}
          {unit.grammarGroup && (
            <span className="ml-0.5 align-top text-[8px] text-violet-400/50">◆</span>
          )}
          {unit.annotation && (
            <span className="ml-0.5 align-top text-[8px] text-amber-400/60">?</span>
          )}
        </span>
      );

      if (tooltipRows.length > 0) {
        return (
          <span key={unit.id} className="group/tip relative inline-block">
            {inner}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 flex min-w-max max-w-[240px] -translate-x-1/2 flex-col gap-0.5 rounded-lg border border-slate-600/70 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-200 opacity-0 shadow-lg shadow-black/40 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100">
              {tooltipRows.map((row) => (
                <span key={row.label} className="flex gap-1.5">
                  <span className="shrink-0 text-slate-500">{row.label}</span>
                  <span className="whitespace-normal text-slate-100">{row.value}</span>
                </span>
              ))}
            </span>
          </span>
        );
      }

      return <span key={unit.id}>{inner}</span>;
    });
  };

  const renderAnalysisCapsules = (units: ParallelSyntaxUnit[]) => {
    if (units.length === 0) return null;
    const activeGroupLabel =
      activeGrammarGroup && units.some((u) => u.grammarGroup === activeGrammarGroup)
        ? activeGrammarGroup
        : null;
    return (
      <div className="mb-2 flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">분석</span>
          {activeGroupLabel && (
            <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-1.5 py-0.5 text-[10px] text-violet-300">
              {activeGroupLabel}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-1 gap-y-1.5">
          {renderUnits(units)}
        </div>
      </div>
    );
  };

  return (
    <div className={`rounded-2xl border border-surface-border bg-surface/70 ${className}`}>
      {showStats && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-white">{title || t("upload.parallelSyntaxTitle")}</h4>
            <p className="mt-1 text-xs text-slate-500">{hint || t("upload.parallelSyntaxHint")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-surface-border bg-surface-lighter px-2 py-1 text-slate-300">
              ZH {alignment.sourceUnitCount}
            </span>
            <span className="rounded-full border border-surface-border bg-surface-lighter px-2 py-1 text-slate-300">
              KO {alignment.translationUnitCount}
            </span>
            {aiAlignment && (
              <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-sky-200">
                {aiModelLabel}
              </span>
            )}
            {alignment.lowConfidenceCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
                <AlertCircle className="h-3 w-3" />
                {t("upload.parallelSyntaxLowConfidence")} {alignment.lowConfidenceCount}
              </span>
            )}
            {allowAiAlignment && (
              <button
                type="button"
                onClick={() => { void handleAiAlign(); }}
                disabled={aligning || !sourceText.trim() || !translationText.trim()}
                className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-sky-100 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {aligning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {aligning ? t("upload.parallelSyntaxAiRunning") : t("upload.parallelSyntaxAiButton")}
              </button>
            )}
          </div>
        </div>
      )}

      {aiError && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-200">
          {aiError}
        </div>
      )}

      <div className="grid grid-cols-2 border-b border-surface-border text-xs font-medium text-slate-400">
        <div className="border-r border-surface-border px-4 py-2">{displaySourceLabel}</div>
        <div className="px-4 py-2">{displayTranslationLabel}</div>
      </div>

      {!hasContent ? (
        <div className="p-6 text-center text-sm text-slate-500">{t("upload.parallelSyntaxEmpty")}</div>
      ) : (
        <div className={`${maxHeightClassName} overflow-auto`}>
          {alignment.groups.map((group) => (
            <div
              key={group.id}
              className={`grid grid-cols-2 border-b border-surface-border/70 last:border-b-0 ${
                compact ? "text-[13px] leading-6" : "text-sm leading-7"
              }`}
            >
              <div className="border-r border-surface-border/70 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-600">
                    {group.paragraphIndex + 1}.{group.sentenceIndex + 1}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${confidenceTone[group.confidence]}`}>
                    {confidenceLabel(group.confidence)}
                  </span>
                </div>
                {renderAnalysisCapsules(group.sourceUnits)}
                <PinyinText text={group.sourceSentence} compact={compact} className="mt-0.5" />
              </div>
              <div className="p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-600">
                    {group.paragraphIndex + 1}.{group.sentenceIndex + 1}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${confidenceTone[group.confidence]}`}>
                    {confidenceLabel(group.confidence)}
                  </span>
                </div>
                {renderAnalysisCapsules(group.translationUnits)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
