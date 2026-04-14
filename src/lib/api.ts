import type {
  GlossaryTerm,
  BookInfo,
  DatasetStats,
  DatasetRecord,
  TranslationRequest,
  TranslationResponse,
  UploadResult,
  SupportedBook,
  HealthCheck,
} from "./types";

// Requests are proxied through Next.js rewrites (next.config.mjs)
// so we use empty string (same origin) — no CORS issues.
const API_BASE = "";

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "Unknown error");
    throw new Error(`API Error (${res.status}): ${error}`);
  }

  return res.json();
}

// ===== Health =====
export async function getHealth() {
  return fetchApi<HealthCheck>("/api/health");
}

// ===== Glossary =====
export async function getGlossary(book?: string) {
  const params = book ? `?book=${encodeURIComponent(book)}` : "";
  return fetchApi<GlossaryTerm[]>(`/api/glossary${params}`);
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

// ===== Dataset =====
export async function getDatasets(book?: string, chapterKo?: number) {
  const params = new URLSearchParams();
  if (book) params.set("book", book);
  if (chapterKo !== undefined) params.set("chapter_ko", String(chapterKo));
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

export async function getBooks() {
  return fetchApi<BookInfo[]>("/api/dataset/books");
}

export async function getStats() {
  return fetchApi<DatasetStats>("/api/dataset/stats");
}

export async function confirmRecord(
  recordId: string,
  body: { ko_text_confirmed: string; review_note?: string }
) {
  return fetchApi<DatasetRecord>(
    `/api/dataset/${encodeURIComponent(recordId)}/confirm`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export async function exportRecord(recordId: string, fmt: string = "json") {
  const url = `${API_BASE}/api/dataset/${encodeURIComponent(recordId)}/export?fmt=${fmt}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res;
}

export async function exportAllConfirmed(fmt: string = "jsonl") {
  const url = `${API_BASE}/api/dataset/export/confirmed?fmt=${fmt}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res;
}

// ===== Translate =====
export async function translate(req: TranslationRequest) {
  return fetchApi<TranslationResponse>("/api/translate/", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function translateTest() {
  return fetchApi<{ ok: boolean; response: string }>("/api/translate/test", {
    method: "POST",
  });
}

// ===== Upload =====
export async function uploadFile(formData: FormData) {
  const url = `${API_BASE}/api/upload/`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "Unknown error");
    throw new Error(`Upload Error (${res.status}): ${error}`);
  }

  return res.json() as Promise<UploadResult>;
}

export async function uploadText(body: {
  ko_text: string;
  book: string;
  chapter: number;
  chapter_zh?: string;
  script: string;
}) {
  return fetchApi<UploadResult>("/api/upload/text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getSupportedBooks() {
  return fetchApi<SupportedBook[]>("/api/upload/books");
}
