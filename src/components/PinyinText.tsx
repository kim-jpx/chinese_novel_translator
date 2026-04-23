"use client";

import { useEffect, useMemo, useState } from "react";
import { convertChineseText, useChineseScript } from "@/contexts/ChineseScriptContext";

const HAN_RE = /[\u3400-\u9fff]/;

interface PinyinTextProps {
  text: string;
  className?: string;
  compact?: boolean;
}

export default function PinyinText({ text, className = "", compact = false }: PinyinTextProps) {
  const { mode } = useChineseScript();
  const displayText = useMemo(() => convertChineseText(text || "", mode), [mode, text]);
  const [rendered, setRendered] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!HAN_RE.test(displayText)) {
      setRendered("");
      return () => {
        cancelled = true;
      };
    }

    void import("pinyin-pro").then(({ pinyin }) => {
      if (cancelled) return;
      const next = displayText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) =>
          pinyin(line, {
            separator: " ",
            toneSandhi: true,
          }).replace(/\s+/g, " ").trim()
        )
        .join("\n");
      setRendered(next);
    });

    return () => {
      cancelled = true;
    };
  }, [displayText]);

  if (!rendered) return null;

  return (
    <p
      className={`ignore-opencc whitespace-pre-wrap ${compact ? "text-[10px] leading-5" : "text-xs leading-5"} text-slate-500 ${className}`}
    >
      {rendered}
    </p>
  );
}
