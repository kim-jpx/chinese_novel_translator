"use client";

import { Languages } from "lucide-react";
import { useChineseScript, type ChineseScriptMode } from "@/contexts/ChineseScriptContext";
import { useLanguage } from "@/contexts/LanguageContext";

const MODES: ChineseScriptMode[] = ["original", "simplified", "traditional"];

export default function ChineseScriptSwitcher({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useChineseScript();
  const { t } = useLanguage();

  const labelFor = (value: ChineseScriptMode) => {
    if (value === "simplified") return t("scriptDisplay.simplified");
    if (value === "traditional") return t("scriptDisplay.traditional");
    return t("scriptDisplay.original");
  };

  return (
    <div className={compact ? "glass-card p-1 shadow-lg shadow-black/20" : "glass-card px-3 py-3"}>
      {!compact && (
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          <Languages className="h-3.5 w-3.5" />
          <span>{t("scriptDisplay.label")}</span>
          <span className="ml-auto text-[10px] text-slate-600">{t("scriptDisplay.displayOnly")}</span>
        </div>
      )}
      <div className={`grid ${compact ? "grid-cols-3 gap-1" : "grid-cols-3 gap-1.5"}`}>
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors ${
              mode === value
                ? "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30"
                : "bg-surface-lighter/60 text-slate-400 border border-transparent hover:text-white hover:border-surface-border"
            }`}
            aria-pressed={mode === value}
          >
            {labelFor(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
