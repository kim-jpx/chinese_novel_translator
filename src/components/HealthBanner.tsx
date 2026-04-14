"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Wifi, WifiOff } from "lucide-react";
import { getHealth } from "@/lib/api";
import type { HealthCheck } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export default function HealthBanner() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

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

  if (health && (!health.api_key_set || !health.dataset_exists || !health.glossary_exists)) {
    return (
      <div className="mx-8 mt-6 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center gap-3 animate-fade-in">
        <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-amber-300 text-sm font-medium">{t("health.warning")}</p>
          <div className="flex gap-3 mt-1">
            {!health.api_key_set && <span className="text-xs text-amber-400/70">• API Key ✗</span>}
            {!health.dataset_exists && <span className="text-xs text-amber-400/70">• Dataset ✗</span>}
            {!health.glossary_exists && <span className="text-xs text-amber-400/70">• Glossary ✗</span>}
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-300 text-xs">✕</button>
      </div>
    );
  }

  // All good — show nothing (or optionally a brief success flash)
  return null;
}
