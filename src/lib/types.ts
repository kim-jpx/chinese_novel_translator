// Types for the Chinese Novel Translation Agent

export interface GlossaryTerm {
  term_zh: string;
  term_kr: string;
  pos?: string;         // 품사 (part of speech)
  domain?: string;      // 도메인
  policy?: string;      // 정책
  note?: string;        // 비고
  book?: string;
  is_new?: boolean;
}

export interface Book {
  name: string;
  total_chapters: number;
  completed_chapters: number;
  latest_upload?: string;
  new_terms_count?: number;
}

export interface DatasetStats {
  total_books: number;
  total_chapters: number;
  total_terms: number;
  recent_uploads: UploadRecord[];
  new_terms_count: number;
}

export interface UploadRecord {
  id: string;
  book: string;
  chapter: string;
  uploaded_at: string;
  new_terms_found: number;
  filename: string;
}

export interface TranslationRequest {
  text: string;
  book: string;
  genre: string[];
  era_profile: string;
  with_annotations: boolean;
  with_cultural_check: boolean;
}

export interface Annotation {
  term_zh: string;
  term_kr: string;
  explanation: string;
  type: string;
}

export interface CulturalFlag {
  original: string;
  category: string;
  explanation: string;
  suggestion?: string;
  user_action_needed: boolean;
  action?: "keep" | "change";
}

export interface TranslationResponse {
  translated: string;
  terms_used: GlossaryTerm[];
  annotations: Annotation[];
  cultural_flags: CulturalFlag[];
  model: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  new_terms: GlossaryTerm[];
}

export interface DatasetEntry {
  book: string;
  chapter: string;
  chapter_zh?: string;
  zh_text?: string;
  ko_text?: string;
  script?: "simplified" | "traditional" | "unknown";
  created_at: string;
}
