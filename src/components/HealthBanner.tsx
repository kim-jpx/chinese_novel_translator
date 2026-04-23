"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, WifiOff } from "lucide-react";
import { useBackendHealth } from "@/contexts/BackendHealthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export default function HealthBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useLanguage();
  const { health, status } = useBackendHealth();

  const issues = useMemo(() => {
    if (!health) return [];
    return [
      !health.api_key_set ? t("health.issueApiKey") : null,
      !health.supabase_configured ? t("health.issueSupabaseConfig") : null,
      health.supabase_configured && !health.supabase_connected
        ? t("health.issueSupabaseConnection")
        : null,
      !health.glossary_exists ? t("health.issueGlossary") : null,
    ].filter((issue): issue is string => !!issue);
  }, [health, t]);

  useEffect(() => {
    setDismissed(false);
  }, [status, issues.length]);

  if (dismissed || status === "loading") return null;

  if (status === "error") {
    return (
      <div className="mx-8 mt-6 p-4 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center gap-3 animate-fade-in">
        <WifiOff className="w-5 h-5 text-red-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-red-300 text-sm font-medium">{t("health.disconnected")}</p>
          <p className="text-red-400/60 text-xs mt-0.5">{t("health.disconnectedDesc")}</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-red-400/50 hover:text-red-300 text-xs">✕</button>
      </div>
    );
  }

  if (issues.length > 0 && health) {
    return (
      <div className="mx-8 mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-3 animate-fade-in">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-amber-300 text-sm font-medium">{t("health.warning")}</p>
          <div className="flex gap-3 mt-1">
            {issues.map((issue) => (
              <span key={issue} className="text-xs text-amber-400/70">
                • {issue}
              </span>
            ))}
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-300 text-xs">✕</button>
      </div>
    );
  }

  return null;
}
