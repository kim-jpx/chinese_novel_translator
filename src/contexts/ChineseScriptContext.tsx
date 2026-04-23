"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as OpenCC from "opencc-js";

export type ChineseScriptMode = "original" | "simplified" | "traditional";

interface ChineseScriptContextType {
  mode: ChineseScriptMode;
  setMode: (mode: ChineseScriptMode) => void;
}

const STORAGE_KEY = "translator-chinese-script-mode";
const SKIP_SELECTOR = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "option",
  "canvas",
  "svg",
].join(",");

const ChineseScriptContext = createContext<ChineseScriptContextType>({
  mode: "original",
  setMode: () => {},
});

const converters = {
  simplified: OpenCC.Converter({ from: "tw", to: "cn" }),
  traditional: OpenCC.Converter({ from: "cn", to: "tw" }),
};

export function convertChineseText(value: string, mode: ChineseScriptMode) {
  if (mode === "original" || !value) return value;
  return converters[mode](value);
}

function shouldSkipNode(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE
    ? node as Element
    : node.parentElement;
  if (!element) return false;
  if (element.closest(".ignore-opencc")) return true;
  return !!element.closest(SKIP_SELECTOR);
}

export function ChineseScriptProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ChineseScriptMode>("original");
  const originalText = useRef(new Map<Text, string>());
  const observer = useRef<MutationObserver | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ChineseScriptMode | null;
    if (saved && ["original", "simplified", "traditional"].includes(saved)) {
      setModeState(saved);
    }
  }, []);

  const setMode = (nextMode: ChineseScriptMode) => {
    setModeState(nextMode);
    localStorage.setItem(STORAGE_KEY, nextMode);
  };

  const value = useMemo(() => ({ mode, setMode }), [mode]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const restoreAll = () => {
      applying.current = true;
      originalText.current.forEach((text, node) => {
        if (node.isConnected) node.nodeValue = text;
      });
      originalText.current.clear();
      applying.current = false;
    };

    const convertTextNode = (node: Text, converter: (value: string) => string) => {
      if (!node.nodeValue || shouldSkipNode(node)) return;
      if (!originalText.current.has(node)) {
        originalText.current.set(node, node.nodeValue);
      }
      const source = originalText.current.get(node) || "";
      node.nodeValue = converter(source);
    };

    const convertTree = (root: Node, converter: (value: string) => string) => {
      if (shouldSkipNode(root)) return;
      if (root.nodeType === Node.TEXT_NODE) {
        convertTextNode(root as Text, converter);
        return;
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return shouldSkipNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      let current = walker.nextNode();
      while (current) {
        convertTextNode(current as Text, converter);
        current = walker.nextNode();
      }
    };

    observer.current?.disconnect();
    restoreAll();

    if (mode === "original") return undefined;

    const converter = mode === "simplified" ? converters.simplified : converters.traditional;
    applying.current = true;
    convertTree(document.body, converter);
    applying.current = false;

    observer.current = new MutationObserver((mutations) => {
      if (applying.current) return;
      applying.current = true;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          const node = mutation.target as Text;
          if (!shouldSkipNode(node)) {
            originalText.current.set(node, node.nodeValue || "");
            convertTextNode(node, converter);
          }
        }
        mutation.addedNodes.forEach((node) => convertTree(node, converter));
      }
      applying.current = false;
    });
    observer.current.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    return () => {
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [mode]);

  return (
    <ChineseScriptContext.Provider value={value}>
      {children}
    </ChineseScriptContext.Provider>
  );
}

export function useChineseScript() {
  return useContext(ChineseScriptContext);
}
