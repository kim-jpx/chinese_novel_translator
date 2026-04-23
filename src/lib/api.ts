import type {
  GlossaryTerm,
  GlossaryExample,
  BookInfo,
  BookTitleUpdateResult,
  DatasetStats,
  DatasetRecord,
  DraftHistoryItem,
  DraftHistoryRestoreResult,
  TranslationRequest,
  TranslationResponse,
  SentenceExplainRequest,
  SentenceExplainResponse,
  ToneRewriteRequest,
  ToneRewriteResponse,
  DraftVerifyRequest,
  DraftVerifyResponse,
  SyntaxAlignResponse,
  UploadResult,
  UploadJobStatus,
  UploadJobItem,
  AlignmentReview,
  SupportedBook,
  HealthCheck,
  MappingDirection,
  ExtractCandidatesJobStart,
  ExtractCandidatesJobStatus,
  PromoteCandidatesResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 30000;
const TRANSLATE_TIMEOUT_MS = 300000;
const UPLOAD_TIMEOUT_MS = 180000;

function configuredApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_BASE;
  if (configured !== undefined) return configured.replace(/\/$/, "");
  return null;
}

function directBackendBase() {
  const configured = configuredApiBase();
  if (configured !== null) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.protocol}//${window.location.hostname}:8000`;
}

function apiUrl(endpoint: string, base = "") {
  return `${base}${endpoint}`;
}

function apiUrlCandidates(endpoint: string, timeoutMs: number) {
  const directBase = directBackendBase();
  const preferDirect = timeoutMs > DEFAULT_TIMEOUT_MS;
  const bases = preferDirect ? [directBase, ""] : ["", directBase];
  return Array.from(new Set(bases)).map((base) => apiUrl(endpoint, base));
}

function extractApiDetail(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (parsed.detail !== undefined) return JSON.stringify(parsed.detail);
  } catch {
    // fall through to raw text
  }
  return errorText;
}

function formatApiError(status: number, errorText: string) {
  const detail = extractApiDetail(errorText).trim() || "Unknown error";
  const lowerDetail = detail.toLowerCase();
  if (lowerDetail.includes("usage limit")) {
    return `AI 사용량 제한으로 요청을 처리할 수 없습니다. ${detail}`;
  }
  if (status === 429 || lowerDetail.includes("rate limit")) {
    return `AI 요청 한도에 걸렸습니다. ${detail}`;
  }
  return detail.startsWith("API Error") ? detail : `API Error (${status}): ${detail}`;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timeout after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const urls = apiUrlCandidates(endpoint, timeoutMs);
  let networkError: unknown = null;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      }, timeoutMs);

      if (!res.ok) {
        const error = await res.text().catch(() => "Unknown error");
        throw new Error(formatApiError(res.status, error));
      }

      return res.json();
    } catch (err) {
      networkError = err;
      if (err instanceof TypeError || (err instanceof Error && err.message.startsWith("Request timeout"))) {
        continue;
      }
      throw err;
    }
  }

  throw networkError instanceof Error ? networkError : new Error("API request failed");
}

// ===== Health =====
export async function getHealth() {
  return fetchApi<HealthCheck>("/api/health");
}

// ===== Glossary =====
export async function getGlossary(book?: string) {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  const qs = params.toString();
  return fetchApi<GlossaryTerm[]>(`/api/glossary${qs ? `?${qs}` : ""}`);
}

export async function createGlossaryTerm(term: GlossaryTerm) {
  return fetchApi<GlossaryTerm>("/api/glossary", {
    method: "POST",
    body: JSON.stringify(term),
  });
}

export async function updateGlossaryTerm(
  termZh: string,
  data: Partial<GlossaryTerm>
) {
  return fetchApi<GlossaryTerm>(
    `/api/glossary/${encodeURIComponent(termZh)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteGlossaryTerm(termZh: string) {
  return fetchApi<{ deleted: string }>(
    `/api/glossary/${encodeURIComponent(termZh)}`,
    { method: "DELETE" }
  );
}

export async function getGlossaryBooks() {
  return fetchApi<string[]>("/api/glossary/books");
}

export async function getGlossaryExamples(
  termZh: string,
  book?: string,
  limit: number = 6
) {
  const params = new URLSearchParams({ term_zh: termZh, limit: String(limit) });
  if (book) params.set("book", book);
  return fetchApi<GlossaryExample[]>(`/api/glossary/examples?${params.toString()}`);
}

// ===== Dataset =====
export async function getDatasets(
  book?: string,
  chapterKo?: number,
  chapterZh?: string,
  options?: { bookExact?: boolean; status?: "draft" | "confirmed" }
) {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  if (options?.bookExact && book) params.set("book_exact", book);
  if (options?.status) params.set("status", options.status);
  if (chapterKo !== undefined) params.set("chapter_ko", String(chapterKo));
  if (chapterZh) params.set("chapter_zh", chapterZh);
  const qs = params.toString();
  return fetchApi<DatasetRecord[]>(`/api/dataset/${qs ? `?${qs}` : ""}`);
}

export async function addDatasetRecord(record: DatasetRecord) {
  return fetchApi<DatasetRecord>("/api/dataset/", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export async function updateDatasetRecord(
  recordId: string,
  record: DatasetRecord
) {
  return fetchApi<DatasetRecord>(
    `/api/dataset/${encodeURIComponent(recordId)}`,
    {
      method: "PUT",
      body: JSON.stringify(record),
    }
  );
}

export async function getDraftHistory(recordId: string, limit: number = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  return fetchApi<DraftHistoryItem[]>(
    `/api/dataset/${encodeURIComponent(recordId)}/draft-history?${params.toString()}`
  );
}

export async function restoreDraftHistory(recordId: string, historyId: string) {
  return fetchApi<DraftHistoryRestoreResult>(
    `/api/dataset/${encodeURIComponent(recordId)}/draft-history/${encodeURIComponent(historyId)}/restore`,
    { method: "POST" }
  );
}

export async function deleteDatasetRecord(recordId: string) {
  return fetchApi<{ deleted: string }>(
    `/api/dataset/${encodeURIComponent(recordId)}`,
    { method: "DELETE" }
  );
}

export async function getBooks() {
  return fetchApi<BookInfo[]>("/api/dataset/books");
}

export async function updateBookTitles(body: {
  current_book: string;
  book?: string;
  book_ko?: string;
  book_zh?: string;
}) {
  return fetchApi<BookTitleUpdateResult>("/api/dataset/books/title", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function getStats() {
  return fetchApi<DatasetStats>("/api/dataset/stats");
}

export async function confirmRecord(
  recordId: string,
  body: { ko_text_confirmed: string; review_note?: string; alignment_rows?: DatasetRecord["alignment_rows"] }
) {
  return fetchApi<DatasetRecord>(
    `/api/dataset/${encodeURIComponent(recordId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function exportRecord(
  recordId: string,
  fmt: string = "json",
  options?: { allowDraft?: boolean }
) {
  const params = new URLSearchParams({ fmt });
  if (options?.allowDraft) {
    params.set("allow_draft", "true");
  }
  const url = apiUrlCandidates(
    `/api/dataset/${encodeURIComponent(recordId)}/export?${params.toString()}`,
    DEFAULT_TIMEOUT_MS
  )[0];
  const res = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res;
}

export async function exportAllConfirmed(fmt: string = "jsonl") {
  const url = apiUrlCandidates(`/api/dataset/export/confirmed?fmt=${fmt}`, DEFAULT_TIMEOUT_MS)[0];
  const res = await fetchWithTimeout(url, {}, DEFAULT_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res;
}

// ===== Translate =====
export async function translate(req: TranslationRequest) {
  return fetchApi<TranslationResponse>("/api/translate/", {
    method: "POST",
    body: JSON.stringify(req),
  }, TRANSLATE_TIMEOUT_MS);
}

export async function translateTest() {
  return fetchApi<{ ok: boolean; response: string }>("/api/translate/test", {
    method: "POST",
  });
}

export async function alignSyntax(body: {
  source_text: string;
  translation_text: string;
}) {
  return fetchApi<SyntaxAlignResponse>("/api/translate/syntax-align", {
    method: "POST",
    body: JSON.stringify(body),
  }, TRANSLATE_TIMEOUT_MS);
}

export async function explainSentence(req: SentenceExplainRequest) {
  return fetchApi<SentenceExplainResponse>("/api/translate/explain-sentence", {
    method: "POST",
    body: JSON.stringify(req),
  }, TRANSLATE_TIMEOUT_MS);
}

export async function rewriteTone(req: ToneRewriteRequest) {
  return fetchApi<ToneRewriteResponse>("/api/translate/rewrite-tone", {
    method: "POST",
    body: JSON.stringify(req),
  }, TRANSLATE_TIMEOUT_MS);
}

export async function verifyDraft(req: DraftVerifyRequest) {
  return fetchApi<DraftVerifyResponse>("/api/translate/verify-draft", {
    method: "POST",
    body: JSON.stringify(req),
  }, TRANSLATE_TIMEOUT_MS);
}

// ===== Upload =====
export async function uploadFile(formData: FormData) {
  const urls = apiUrlCandidates("/api/upload/", UPLOAD_TIMEOUT_MS);
  let networkError: unknown = null;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        body: formData,
      }, UPLOAD_TIMEOUT_MS);

      if (!res.ok) {
        const error = await res.text().catch(() => "Unknown error");
        throw new Error(`Upload Error (${res.status}): ${error}`);
      }

      return res.json() as Promise<UploadResult>;
    } catch (err) {
      networkError = err;
      if (err instanceof TypeError || (err instanceof Error && err.message.startsWith("Request timeout"))) {
        continue;
      }
      throw err;
    }
  }

  throw networkError instanceof Error ? networkError : new Error("Upload request failed");
}

export async function getUploadJob(jobId: string) {
  return fetchApi<UploadJobStatus>(`/api/upload/jobs/${encodeURIComponent(jobId)}`);
}

export async function listUploadJobs(limit: number = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return fetchApi<{ jobs: UploadJobItem[] }>(`/api/upload/jobs?${params.toString()}`);
}

export async function listAlignmentReviews(book?: string, limit: number = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (book) params.set("book", book);
  return fetchApi<AlignmentReview[]>(`/api/upload/alignment-reviews?${params.toString()}`);
}

export async function keepAlignmentReview(reviewId: string) {
  return fetchApi<AlignmentReview>(
    `/api/upload/alignment-reviews/${encodeURIComponent(reviewId)}/keep`,
    { method: "POST" }
  );
}

export async function updateAlignmentReview(
  reviewId: string,
  body: { proposed_ko_text?: string; start_reason?: string; end_reason?: string }
) {
  return fetchApi<AlignmentReview>(
    `/api/upload/alignment-reviews/${encodeURIComponent(reviewId)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}

export async function adjustAlignmentReviewBoundary(
  reviewId: string,
  body: {
    direction:
      | "send_start_to_prev"
      | "send_end_to_next"
      | "pull_from_prev"
      | "pull_from_next";
  }
) {
  return fetchApi<AlignmentReview[]>(
    `/api/upload/alignment-reviews/${encodeURIComponent(reviewId)}/adjust-boundary`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function applyAlignmentReview(reviewId: string, body?: { proposed_ko_text?: string }) {
  return fetchApi<DatasetRecord>(
    `/api/upload/alignment-reviews/${encodeURIComponent(reviewId)}/apply`,
    {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }
  );
}

export async function uploadText(body: {
  ko_text: string;
  zh_text?: string;
  book?: string;
  book_ko?: string;
  book_zh?: string;
  input_language?: "ko" | "zh";
  is_original_text?: boolean;
  resegment_ko_by_zh?: boolean;
  chapter: string;
  chapter_zh?: string;
  mapping_direction?: MappingDirection;
  script: string;
}) {
  return fetchApi<UploadResult>("/api/upload/text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function promoteUploadCandidates(body: { book?: string; chapter_ko?: number }) {
  return fetchApi<PromoteCandidatesResult>("/api/upload/promote-candidates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function extractUploadCandidates(body: { record_id?: string; record_ids?: string[]; book?: string; chapter_ko?: number }) {
  return fetchApi<ExtractCandidatesJobStart>("/api/upload/extract-candidates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getExtractUploadCandidatesJob(jobId: string) {
  return fetchApi<ExtractCandidatesJobStatus>(`/api/upload/extract-candidates/${encodeURIComponent(jobId)}`);
}

export async function getSupportedBooks() {
  return fetchApi<SupportedBook[]>("/api/upload/books");
}
