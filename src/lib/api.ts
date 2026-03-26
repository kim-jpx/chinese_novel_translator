const API_BASE = "http://192.168.64.2:8000";

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

// ===== Glossary =====
export async function getGlossary(book?: string) {
  const params = book ? `?book=${encodeURIComponent(book)}` : "";
  return fetchApi<import("./types").GlossaryTerm[]>(
    `/api/glossary${params}`
  );
}

export async function createGlossaryTerm(
  term: import("./types").GlossaryTerm
) {
  return fetchApi<import("./types").GlossaryTerm>("/api/glossary", {
    method: "POST",
    body: JSON.stringify(term),
  });
}

export async function updateGlossaryTerm(
  termZh: string,
  data: Partial<import("./types").GlossaryTerm>
) {
  return fetchApi<import("./types").GlossaryTerm>(
    `/api/glossary/${encodeURIComponent(termZh)}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
}

// ===== Dataset =====
export async function getBooks() {
  return fetchApi<import("./types").Book[]>("/api/dataset/books");
}

export async function getStats() {
  return fetchApi<import("./types").DatasetStats>("/api/dataset/stats");
}

export async function getDatasets() {
  return fetchApi<import("./types").DatasetEntry[]>("/api/dataset/");
}

// ===== Translate =====
export async function translate(
  req: import("./types").TranslationRequest
) {
  return fetchApi<import("./types").TranslationResponse>(
    "/api/translate/",
    {
      method: "POST",
      body: JSON.stringify(req),
    }
  );
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

  return res.json() as Promise<import("./types").UploadResponse>;
}

export async function uploadText(body: {
  ko_text: string;
  book: string;
  chapter: number;
  chapter_zh?: string;
  script: string;
}) {
  return fetchApi<import("./types").UploadResponse>("/api/upload/text", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
