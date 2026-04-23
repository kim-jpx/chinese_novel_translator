export type ParallelTextSide = "source" | "translation";

export interface ParallelSyntaxUnit {
  id: string;
  matchId: string;
  side: ParallelTextSide;
  text: string;
  paragraphIndex: number;
  sentenceIndex: number;
  unitIndex: number;
  confidence: "high" | "medium" | "low";
  annotation?: string;     // hover tooltip: meaning when source phrase is absorbed into translation
  grammarGroup?: string;   // grammar pattern label (e.g. "只有…才…") for visual grouping
  order?: number;
}

export interface ParallelSyntaxGroup {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  sourceSentence: string;
  translationSentence: string;
  sourceUnits: ParallelSyntaxUnit[];
  translationUnits: ParallelSyntaxUnit[];
  confidence: "high" | "medium" | "low";
}

export interface ParallelSyntaxAlignment {
  groups: ParallelSyntaxGroup[];
  sourceUnitCount: number;
  translationUnitCount: number;
  lowConfidenceCount: number;
}

export interface ParallelSyntaxPairInput {
  source: string;
  translation: string;
  confidence?: string;
  source_annotation?: string;
  grammar_group?: string;
  source_order?: number;
  translation_order?: number;
}

export interface ParallelSyntaxSentenceRowInput {
  id?: string;
  source_text?: string;
  translation_text?: string;
}

const CJK_RE = /[\u3400-\u9fff]/;
const SOURCE_SENTENCE_RE = /[^。！？!?；;]+[。！？!?；;」』”’）)]*/g;
const TRANSLATION_SENTENCE_RE = /[^.!?…\n]+[.!?…]*/g;
const SOURCE_UNIT_RE = /[^，,、；;：:。！？!?]+[，,、；;：:。！？!?]*/g;
const TRANSLATION_UNIT_RE = /[^,，;；:：.!?…\n]+[,，;；:：.!?…]*/g;
const CHAPTER_NUMBER_CHARS = "0-9一二三四五六七八九十百千万零〇两兩";
const SOURCE_SENTENCE_END_RE = /[。！？!?][」』”’）)]*$/;
const TRANSLATION_SENTENCE_END_RE = /[.!?…][)"'”’]*$/;
const SOURCE_CLOSING_PUNCTUATION_RE = /^[」』”’）)]$/;
const PUNCTUATION_ONLY_RE = /^[，,、；;：:。！？!?"“”'‘’（）()《》<>「」『』…—\-\s]+$/;
const STANDALONE_QUOTE_RE = /(["'“”‘’「」『』])/g;
const TRANSLATION_HEADING_PATTERNS = [
  new RegExp(`^제\\s*[${CHAPTER_NUMBER_CHARS}]+\\s*[장화회]`, "i"),
  new RegExp(`^[${CHAPTER_NUMBER_CHARS}]+\\s*[장화회]`, "i"),
  new RegExp(`^第\\s*[${CHAPTER_NUMBER_CHARS}]+\\s*[章回节節]`, "i"),
  /^chapter\s+\d+/i,
];
const SOURCE_HEADING_RE = new RegExp(`^第\\s*[${CHAPTER_NUMBER_CHARS}]+\\s*[章回节節]`, "i");

function compactWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
}

function cleanSegmentText(value: string, side: ParallelTextSide) {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (side === "source") {
    return normalized.replace(/\s*\n\s*/g, "").trim();
  }
  return normalized.replace(/[ \t]+/g, " ").trim();
}

function isPunctuationOnly(value: string) {
  const cleaned = value.trim();
  return !!cleaned && PUNCTUATION_ONLY_RE.test(cleaned);
}

function joinPunctuationFragment(base: string, fragment: string, prepend = false) {
  if (!fragment) return base;
  if (!base) return fragment;
  return prepend ? `${fragment}${base}` : `${base}${fragment}`;
}

function mergePunctuationOnlyTexts(texts: string[]) {
  const merged: string[] = [];
  let pendingPrefix = "";

  texts.forEach((text) => {
    if (isPunctuationOnly(text)) {
      if (merged.length > 0) {
        merged[merged.length - 1] = joinPunctuationFragment(merged[merged.length - 1], text);
      } else {
        pendingPrefix = joinPunctuationFragment(pendingPrefix, text);
      }
      return;
    }

    merged.push(pendingPrefix ? joinPunctuationFragment(text, pendingPrefix, true) : text);
    pendingPrefix = "";
  });

  if (pendingPrefix && merged.length > 0) {
    merged[merged.length - 1] = joinPunctuationFragment(merged[merged.length - 1], pendingPrefix);
  }

  return merged;
}

function splitParagraphs(text: string): string[] {
  const normalized = compactWhitespace(text);
  if (!normalized) return [];
  return normalized
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function regexSplit(text: string, pattern: RegExp, side: ParallelTextSide): string[] {
  const matches = text.match(pattern) || [];
  const units = matches.map((unit) => cleanSegmentText(unit, side)).filter(Boolean);
  return units.length > 0
    ? units
    : text.split(/\n+/).map((unit) => cleanSegmentText(unit, side)).filter(Boolean);
}

function splitSentences(text: string, side: ParallelTextSide): string[] {
  const normalized = compactWhitespace(text);
  if (!normalized) return [];
  const pattern = side === "source" ? SOURCE_SENTENCE_RE : TRANSLATION_SENTENCE_RE;
  const sentenceInputs = side === "source" ? normalized.split(/\n+/) : [normalized];
  const sentences = sentenceInputs.flatMap((input) => regexSplit(input, pattern, side));
  return mergePunctuationOnlyTexts(sentences);
}

export function splitEditableSentences(text: string): string[] {
  return splitSentences(text, "translation");
}

export function splitEditableSourceSentences(text: string): string[] {
  return splitSentences(text, "source");
}

function splitLongUnit(text: string, maxLength: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return [trimmed];

  const pieces: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf(" ", maxLength);
    if (cut < Math.floor(maxLength * 0.55) || CJK_RE.test(remaining.slice(0, maxLength))) {
      cut = maxLength;
    }
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces.filter(Boolean);
}

function splitStandaloneQuoteUnits(text: string, side: ParallelTextSide): string[] {
  return cleanSegmentText(text, side)
    .split(STANDALONE_QUOTE_RE)
    .map((part) => cleanSegmentText(part, side))
    .filter(Boolean);
}

function splitSyntaxUnits(sentence: string, side: ParallelTextSide): string[] {
  const pattern = side === "source" ? SOURCE_UNIT_RE : TRANSLATION_UNIT_RE;
  const maxLength = side === "source" ? 28 : 64;
  const units = regexSplit(sentence, pattern, side);
  return units.flatMap((unit) =>
    splitLongUnit(unit, maxLength).flatMap((piece) => splitStandaloneQuoteUnits(piece, side)),
  );
}

function confidenceForPair(sourceCount: number, translationCount: number): "high" | "medium" | "low" {
  if (sourceCount === 0 || translationCount === 0) return "low";
  if (sourceCount === translationCount) return "high";
  const ratio = Math.min(sourceCount, translationCount) / Math.max(sourceCount, translationCount);
  if (ratio >= 0.65) return "medium";
  return "low";
}

function normalizeConfidence(value?: string): "high" | "medium" | "low" {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function combineConfidence(values: Array<"high" | "medium" | "low">): "high" | "medium" | "low" {
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function stripHeadingMarkup(text: string) {
  return text.replace(/^#{1,6}\s*/, "").trim();
}

function isTranslationHeading(text: string) {
  const trimmed = text.trim();
  const cleaned = stripHeadingMarkup(trimmed);
  if (!cleaned) return false;
  if (trimmed.startsWith("#")) return true;
  if (cleaned.length > 80) return false;
  return TRANSLATION_HEADING_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function isSourceHeading(text: string) {
  const cleaned = stripHeadingMarkup(cleanSegmentText(text, "source"));
  if (!cleaned || cleaned.length > 60) return false;
  return SOURCE_HEADING_RE.test(cleaned);
}

function joinSentenceParts(parts: string[], side: ParallelTextSide) {
  const cleanParts = parts.map((part) => cleanSegmentText(part, side)).filter(Boolean);
  if (side === "source") return cleanParts.join("");
  return cleanParts
    .join(" ")
    .replace(/\s+([,，.;；:：!?…])/g, "$1")
    .replace(/(["“‘])\s+/g, "$1")
    .replace(/\s+(["”’])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUnits(
  texts: string[],
  side: ParallelTextSide,
  paragraphIndex: number,
  sentenceIndex: number,
  groupId: string,
  matchIds: string[],
  confidence: "high" | "medium" | "low",
): ParallelSyntaxUnit[] {
  const count = texts.length;
  if (count === 0) return [];

  return texts.map((text, index) => ({
    id: `${groupId}:${side}:${index}`,
    matchId: matchIds[index] || `${groupId}:b${index}`,
    side,
    text,
    paragraphIndex,
    sentenceIndex,
    unitIndex: index,
    confidence,
  }));
}

function buildMatchIds(sourceCount: number, translationCount: number, groupId: string) {
  const make = (count: number, buckets: number) =>
    Array.from({ length: count }, (_, index) => {
      const bucket = Math.min(buckets - 1, Math.floor(((index + 0.5) * buckets) / count));
      return `${groupId}:b${bucket}`;
    });

  if (sourceCount > 1 && translationCount === 1) {
    return {
      sourceMatchIds: Array.from({ length: sourceCount }, () => `${groupId}:merged`),
      translationMatchIds: [`${groupId}:merged`],
    };
  }

  if (sourceCount === 1 && translationCount > 1) {
    return {
      sourceMatchIds: [`${groupId}:merged`],
      translationMatchIds: Array.from({ length: translationCount }, () => `${groupId}:merged`),
    };
  }

  const bucketCount = Math.max(sourceCount, translationCount, 1);
  return {
    sourceMatchIds: make(sourceCount, bucketCount),
    translationMatchIds: make(translationCount, bucketCount),
  };
}

function buildSyntaxGroup(
  sourceSentence: string,
  translationSentence: string,
  paragraphIndex: number,
  sentenceIndex: number,
  id: string,
  confidenceOverride?: "high" | "medium" | "low",
): ParallelSyntaxGroup {
  const sourceTexts = splitSyntaxUnits(sourceSentence, "source");
  const translationTexts = splitSyntaxUnits(translationSentence, "translation");
  const confidence = confidenceOverride || confidenceForPair(sourceTexts.length, translationTexts.length);
  const { sourceMatchIds, translationMatchIds } = buildMatchIds(
    sourceTexts.length,
    translationTexts.length,
    id,
  );

  return {
    id,
    paragraphIndex,
    sentenceIndex,
    sourceSentence,
    translationSentence,
    sourceUnits: buildUnits(
      sourceTexts,
      "source",
      paragraphIndex,
      sentenceIndex,
      id,
      sourceMatchIds,
      confidence,
    ),
    translationUnits: buildUnits(
      translationTexts,
      "translation",
      paragraphIndex,
      sentenceIndex,
      id,
      translationMatchIds,
      confidence,
    ),
    confidence,
  };
}

function collectSequentialSentences(
  text: string,
  side: ParallelTextSide,
): Array<{ text: string; paragraphIndex: number }> {
  return splitParagraphs(text).flatMap((paragraph, paragraphIndex) =>
    splitSentences(paragraph, side).map((sentence) => ({
      text: sentence,
      paragraphIndex,
    })),
  );
}

function makeAiUnit(
  text: string,
  side: ParallelTextSide,
  groupId: string,
  paragraphIndex: number,
  sentenceIndex: number,
  unitIndex: number,
  matchId: string,
  confidence: "high" | "medium" | "low",
  annotation?: string,
  grammarGroup?: string,
  order?: number,
): ParallelSyntaxUnit | null {
  const cleaned = cleanSegmentText(text, side);
  if (!cleaned) return null;
  const unit: ParallelSyntaxUnit = {
    id: `${groupId}:${side}:${unitIndex}`,
    matchId,
    side,
    text: cleaned,
    paragraphIndex,
    sentenceIndex,
    unitIndex,
    confidence,
  };
  if (annotation) unit.annotation = annotation;
  if (grammarGroup) unit.grammarGroup = grammarGroup;
  if (typeof order === "number" && Number.isFinite(order) && order > 0) unit.order = order;
  return unit;
}

function sideOrder(value: unknown, fallback: number) {
  const order = Number(value);
  return Number.isFinite(order) && order > 0 ? order : fallback;
}

function sortUnitsByNaturalOrder(units: ParallelSyntaxUnit[]) {
  units.sort((a, b) => (a.order || a.unitIndex + 1) - (b.order || b.unitIndex + 1));
  units.forEach((unit, index) => {
    unit.unitIndex = index;
  });
}

function buildAiSentenceGroup(
  pairs: ParallelSyntaxPairInput[],
  groupIndex: number,
): ParallelSyntaxGroup | null {
  const id = `ai:s${groupIndex}`;
  const confidenceValues = pairs.map((pair) => normalizeConfidence(pair.confidence));
  const confidence = combineConfidence(confidenceValues);
  const sourceUnits: ParallelSyntaxUnit[] = [];
  const translationUnits: ParallelSyntaxUnit[] = [];

  pairs.forEach((pair, pairIndex) => {
    const unitConfidence = normalizeConfidence(pair.confidence);
    const matchId = `${id}:p${pairIndex}`;
    const grammarGroup = pair.grammar_group || undefined;
    const fallbackOrder = pairIndex + 1;
    splitStandaloneQuoteUnits(pair.source, "source").forEach((sourcePiece) => {
      const sourceUnit = makeAiUnit(
        sourcePiece,
        "source",
        id,
        0,
        groupIndex,
        sourceUnits.length,
        matchId,
        unitConfidence,
        pair.source_annotation || undefined,
        grammarGroup,
        sideOrder(pair.source_order, fallbackOrder),
      );
      if (sourceUnit) sourceUnits.push(sourceUnit);
    });
    splitStandaloneQuoteUnits(pair.translation, "translation").forEach((translationPiece) => {
      const translationUnit = makeAiUnit(
        translationPiece,
        "translation",
        id,
        0,
        groupIndex,
        translationUnits.length,
        matchId,
        unitConfidence,
        undefined,
        grammarGroup,
        sideOrder(pair.translation_order, fallbackOrder),
      );
      if (translationUnit) translationUnits.push(translationUnit);
    });
  });

  sortUnitsByNaturalOrder(sourceUnits);
  sortUnitsByNaturalOrder(translationUnits);

  const sourceSentence = joinSentenceParts(sourceUnits.map((unit) => unit.text), "source");
  const translationSentence = joinSentenceParts(translationUnits.map((unit) => unit.text), "translation");
  if (!sourceSentence && !translationSentence) return null;

  return {
    id,
    paragraphIndex: 0,
    sentenceIndex: groupIndex,
    sourceSentence,
    translationSentence,
    sourceUnits,
    translationUnits,
    confidence,
  };
}

function isSourceSentenceEnd(text: string) {
  return SOURCE_SENTENCE_END_RE.test(cleanSegmentText(text, "source"));
}

function isTranslationSentenceEnd(text: string) {
  return TRANSLATION_SENTENCE_END_RE.test(cleanSegmentText(text, "translation"));
}

function isSourceClosingOnly(text: string) {
  return SOURCE_CLOSING_PUNCTUATION_RE.test(cleanSegmentText(text, "source"));
}

function shouldCloseAiSentenceGroup(
  current: ParallelSyntaxPairInput,
  next: ParallelSyntaxPairInput | undefined,
) {
  const source = cleanSegmentText(current.source, "source");
  const translation = cleanSegmentText(current.translation, "translation");
  const nextSource = next ? cleanSegmentText(next.source, "source") : "";

  if (!source && translation && isTranslationHeading(translation)) return true;
  if (source && isSourceSentenceEnd(source)) return !nextSource || !isSourceClosingOnly(nextSource);
  if (!source && translation && isTranslationSentenceEnd(translation)) return true;
  return !next;
}

function isPunctuationOnlyPair(pair: ParallelSyntaxPairInput) {
  const source = pair.source.trim();
  const translation = pair.translation.trim();
  if (!source && !translation) return false;
  const sourceEmptyOrPunctuation = !source || isPunctuationOnly(source);
  const translationEmptyOrPunctuation = !translation || isPunctuationOnly(translation);
  return sourceEmptyOrPunctuation && translationEmptyOrPunctuation;
}

function mergePairWithPunctuation(
  pair: ParallelSyntaxPairInput,
  sourcePunctuation: string,
  translationPunctuation: string,
  prepend = false,
): ParallelSyntaxPairInput {
  return {
    ...pair,
    source: joinPunctuationFragment(pair.source, sourcePunctuation, prepend),
    translation: joinPunctuationFragment(pair.translation, translationPunctuation, prepend),
  };
}

function mergePunctuationOnlyPairs(pairs: ParallelSyntaxPairInput[]) {
  const merged: ParallelSyntaxPairInput[] = [];
  let pendingSourcePrefix = "";
  let pendingTranslationPrefix = "";

  pairs.forEach((pair) => {
    if (isPunctuationOnlyPair(pair)) {
      if (merged.length > 0) {
        merged[merged.length - 1] = mergePairWithPunctuation(
          merged[merged.length - 1],
          pair.source,
          pair.translation,
        );
      } else {
        pendingSourcePrefix = joinPunctuationFragment(pendingSourcePrefix, pair.source);
        pendingTranslationPrefix = joinPunctuationFragment(
          pendingTranslationPrefix,
          pair.translation,
        );
      }
      return;
    }

    const nextPair =
      pendingSourcePrefix || pendingTranslationPrefix
        ? mergePairWithPunctuation(
            pair,
            pendingSourcePrefix,
            pendingTranslationPrefix,
            true,
          )
        : pair;
    pendingSourcePrefix = "";
    pendingTranslationPrefix = "";
    merged.push(nextPair);
  });

  if (merged.length > 0 && (pendingSourcePrefix || pendingTranslationPrefix)) {
    merged[merged.length - 1] = mergePairWithPunctuation(
      merged[merged.length - 1],
      pendingSourcePrefix,
      pendingTranslationPrefix,
    );
  }

  return merged;
}

export function buildParallelSyntaxAlignment(
  sourceText: string,
  translationText: string,
): ParallelSyntaxAlignment {
  const sourceSentences = collectSequentialSentences(sourceText, "source");
  const translationSentences = collectSequentialSentences(translationText, "translation");
  const groups: ParallelSyntaxGroup[] = [];
  let sourceIndex = 0;
  let translationIndex = 0;
  let groupIndex = 0;

  while (sourceIndex < sourceSentences.length || translationIndex < translationSentences.length) {
    const sourceItem = sourceSentences[sourceIndex];
    const translationItem = translationSentences[translationIndex];
    const sourceSentence = sourceItem?.text || "";
    const translationSentence = translationItem?.text || "";
    if (!sourceSentence && !translationSentence) break;

    const paragraphIndex = sourceItem?.paragraphIndex ?? translationItem?.paragraphIndex ?? 0;
    const id = `p${paragraphIndex}:s${groupIndex}`;

    if (
      translationSentence
      && isTranslationHeading(translationSentence)
      && (!sourceSentence || !isSourceHeading(sourceSentence))
    ) {
      groups.push(buildSyntaxGroup(
        "",
        translationSentence,
        translationItem?.paragraphIndex ?? paragraphIndex,
        groupIndex,
        id,
      ));
      translationIndex += 1;
      groupIndex += 1;
      continue;
    }

    groups.push(buildSyntaxGroup(sourceSentence, translationSentence, paragraphIndex, groupIndex, id));
    if (sourceSentence) sourceIndex += 1;
    if (translationSentence) translationIndex += 1;
    groupIndex += 1;
  }

  const sourceUnitCount = groups.reduce((sum, group) => sum + group.sourceUnits.length, 0);
  const translationUnitCount = groups.reduce((sum, group) => sum + group.translationUnits.length, 0);
  const lowConfidenceCount = groups.filter((group) => group.confidence === "low").length;

  return {
    groups,
    sourceUnitCount,
    translationUnitCount,
    lowConfidenceCount,
  };
}

export function buildParallelSyntaxAlignmentFromPairs(
  pairs: ParallelSyntaxPairInput[],
): ParallelSyntaxAlignment {
  const groups: ParallelSyntaxGroup[] = [];
  let currentPairs: ParallelSyntaxPairInput[] = [];
  const normalizedPairs = mergePunctuationOnlyPairs(pairs);

  normalizedPairs.forEach((pair, index) => {
    const sourceText = pair.source.trim();
    const translationText = pair.translation.trim();
    if (!sourceText && !translationText) return;

    currentPairs.push(pair);
    if (!shouldCloseAiSentenceGroup(pair, normalizedPairs[index + 1])) return;

    const group = buildAiSentenceGroup(currentPairs, groups.length);
    if (group) groups.push(group);
    currentPairs = [];
  });

  if (currentPairs.length > 0) {
    const group = buildAiSentenceGroup(currentPairs, groups.length);
    if (group) groups.push(group);
  }

  return {
    groups,
    sourceUnitCount: groups.reduce((sum, group) => sum + group.sourceUnits.length, 0),
    translationUnitCount: groups.reduce((sum, group) => sum + group.translationUnits.length, 0),
    lowConfidenceCount: groups.filter((group) => group.confidence === "low").length,
  };
}

export function buildParallelSyntaxAlignmentFromSentenceRows(
  rows: ParallelSyntaxSentenceRowInput[],
): ParallelSyntaxAlignment {
  const groups = rows
    .map((row, index) => {
      const sourceSentence = cleanSegmentText(row.source_text || "", "source");
      const translationSentence = cleanSegmentText(row.translation_text || "", "translation");
      if (!sourceSentence && !translationSentence) return null;
      return buildSyntaxGroup(
        sourceSentence,
        translationSentence,
        0,
        index,
        row.id?.trim() || `saved:s${index}`,
      );
    })
    .filter((group): group is ParallelSyntaxGroup => !!group);

  return {
    groups,
    sourceUnitCount: groups.reduce((sum, group) => sum + group.sourceUnits.length, 0),
    translationUnitCount: groups.reduce((sum, group) => sum + group.translationUnits.length, 0),
    lowConfidenceCount: groups.filter((group) => group.confidence === "low").length,
  };
}
