// Types for the Chinese Novel Translation Agent
// Aligned with backend Pydantic models (translation-agent/backend/routers/)

// ===== Glossary (glossary.py - Term model) =====
export interface GlossaryTerm {
  term_zh: string;
  term_ko: string;       // backend field name: term_ko
  pos: string;
  domain: string;
  policy: string;        // 고정 / 조건부 / 검토중
  notes: string;         // backend field name: notes
  book: string;
  added_at?: string;
  source_chapter?: number;
}

// ===== Dataset (dataset.py) =====
export interface DatasetRecord {
  id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  chapter?: number;
  script: "simplified" | "traditional" | "unknown";
  chapter_id: string;
  chapter_title_zh: string;
  genre: string[];
  source_url: string;
  source_lang: string;
  target_lang: string;
  zh_text: string;
  ko_text: string;
  ko_text_confirmed: string;
  translation_mode: string;
  register: string;
  era_profile: string;
  status: "draft" | "confirmed";
  human_reviewed: boolean;
  review_note: string;
  notes: string;
  updated_at?: string;
}

// GET /api/dataset/books response
export interface BookInfo {
  book: string;
  chapters_ko: number[];
  chapters_zh: string[];
  genre: string[];
}

// GET /api/dataset/stats response
export interface DatasetStats {
  total_records: number;
  total_books: number;
  books: string[];
  records_with_zh: number;
  confirmed: number;
  draft: number;
}

// ===== Translate (translate.py) =====
export interface TranslationRequest {
  text: string;
  book?: string;
  genre?: string[];
  era_profile: string;
  prev_chapter_id?: string;
  with_annotations: boolean;
  with_cultural_check: boolean;
}

export interface Annotation {
  term: string;            // 원문 표현
  type: string;            // 한자어 / 사자성어 / 시/시구 / 문화용어 / 지명
  explanation: string;     // 주석 설명
  keep_original: boolean;  // 원문 표현 그대로 쓰는 경우 True
}

export interface CulturalFlag {
  term: string;              // 문제 표현
  issue: string;             // 판단 이유
  ai_decision: string;       // 유지 / 변경 / 사용자 판단 필요
  ai_reasoning: string;      // 짧은 근거
  suggested: string;         // 제안 번역
  user_action_needed: boolean;
  // client-side only
  action?: "keep" | "change";
}

export interface TranslationResponse {
  translated: string;
  terms_used: string[];      // 사용된 용어 (중국어 목록)
  annotations: Annotation[];
  cultural_flags: CulturalFlag[];
  model: string;
}

// ===== Upload (upload.py) =====
export interface UploadResult {
  id: string;
  book: string;
  chapter: number;
  zh_fetched: boolean;
  new_terms: string[];       // 신규 용어 후보 (중국어 문자열 배열)
  status: string;
}

export interface SupportedBook {
  book: string;
  parser: string;
  genre: string[];
  era_profile: string;
}

// ===== Health =====
export interface HealthCheck {
  api_key_set: boolean;
  dataset_exists: boolean;
  glossary_exists: boolean;
}
