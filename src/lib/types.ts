// Types for the Chinese Novel Translation Agent
// Aligned with backend Pydantic models (translation-agent/backend/routers/)

export type LlmProvider = "anthropic" | "openai" | "gemini";

export interface LlmProviderStatus {
  label: string;
  configured: boolean;
  default_model: string;
  is_default: boolean;
}

// ===== Glossary (glossary.py - Term model) =====
export interface GlossaryTerm {
  term_zh: string;
  term_ko: string;       // backend field name: term_ko
  term_meaning_ko: string;
  pos: string;
  domain: string;
  policy: string;        // 고정 / 조건부 / 검토중
  notes: string;         // backend field name: notes
  book: string;
  added_at?: string;
  source_chapter?: number;
}

export interface GlossaryExample {
  record_id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  matched_in: "zh" | "ko" | "both" | string;
  zh_snippet: string;
  ko_snippet: string;
}

// ===== Dataset (dataset.py) =====
export interface DatasetAlignmentRow {
  id: string;
  order: number;
  source_text: string;
  translation_text: string;
  locked: boolean;
  origin: string;
  source_indexes?: number[];
  translation_indexes?: number[];
}

export interface DatasetRecord {
  id: string;
  book: string;
  book_ko?: string;
  book_zh?: string;
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
  new_term_candidates?: string[];
  alignment_rows?: DatasetAlignmentRow[];
  verify_reports?: SavedVerifyReport[];
}

export type MappingDirection = "ko_to_zh" | "zh_to_ko";

// GET /api/dataset/books response
export interface BookInfo {
  book: string;
  book_ko?: string;
  book_zh?: string;
  chapters_ko: number[];
  chapters_zh: string[];
  genre: string[];
  total_records: number;
  records_with_source_text: number;
  confirmed: number;
  draft: number;
  source_coverage_percent: number;
}

export interface BookTitleUpdateResult {
  updated_count: number;
  book: string;
  book_ko?: string;
  book_zh?: string;
  conflicts: Array<{
    record_id: string;
    chapter_ko: number;
    chapter_zh: string;
    conflicting_record_id: string;
    conflicting_book: string;
  }>;
}

// GET /api/dataset/stats response
export interface DatasetStats {
  total_records: number;
  total_books: number;
  books: string[];
  records_with_source_text: number;
  records_with_zh: number;
  glossary_terms: number;
  confirmed: number;
  draft: number;
}

export interface DraftHistoryItem {
  id: string;
  record_id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  zh_text: string;
  ko_text: string;
  ko_text_confirmed: string;
  review_note: string;
  notes: string;
  status: "draft" | "confirmed" | string;
  source: "create" | "save" | "confirm" | string;
  created_at: string;
  alignment_rows?: DatasetAlignmentRow[];
  verify_reports?: SavedVerifyReport[];
}

export interface DraftHistoryRestoreResult {
  record: DatasetRecord;
  history: DraftHistoryItem;
}

// ===== Translate (translate.py) =====
export interface TranslationRequest {
  text: string;
  book?: string;
  genre?: string[];
  era_profile: string;
  provider?: LlmProvider | string;
  model?: string;
  prev_chapter_id?: string;
  current_chapter_ko?: number;
  current_chapter_zh?: string;
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

export interface TranslateGlossaryHit {
  term_zh: string;
  term_ko: string;
  policy: string;
  pos: string;
  book: string;
  scope: "book" | "global" | string;
  notes: string;
  source_chapter?: number | null;
}

export interface TranslateReferenceExample {
  record_id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  source: "previous" | "term" | "similar" | "recent" | string;
  matched_terms: string[];
  zh_snippet: string;
  ko_snippet: string;
}

export interface TranslationContextSummary {
  confirmed_records: number;
  glossary_hits: number;
  reference_examples: number;
}

export interface TranslationResponse {
  translated: string;
  terms_used: string[];      // 사용된 용어 (중국어 목록)
  annotations: Annotation[];
  cultural_flags: CulturalFlag[];
  glossary_hits: TranslateGlossaryHit[];
  reference_examples: TranslateReferenceExample[];
  context_summary: TranslationContextSummary;
  provider: LlmProvider | string;
  model: string;
}

export interface SyntaxAlignPair {
  source: string;
  translation: string;
  confidence: "high" | "medium" | "low" | string;
  source_annotation?: string;   // 원문 구절이 번역에 흡수됐을 때 간결한 한국어 의미
  grammar_group?: string;       // 중국어 문법 패턴 (예: "只有…才…")
  source_order?: number;
  translation_order?: number;
}

export interface SyntaxAlignResponse {
  pairs: SyntaxAlignPair[];
  provider: LlmProvider | string;
  model: string;
}

export interface SentenceExplainRequest {
  source_text: string;
  translation_text?: string;
  book?: string;
  genre?: string[];
  era_profile?: string;
  provider?: LlmProvider | string;
  model?: string;
}

export interface SentenceExplainResponse {
  explanation: string;
  provider: LlmProvider | string;
  model: string;
}

export interface ToneRewriteRequest {
  source_text?: string;
  translation_text: string;
  target_tone: string;
  book?: string;
  genre?: string[];
  era_profile?: string;
  provider?: LlmProvider | string;
  model?: string;
}

export interface ToneRewriteResponse {
  rewritten: string;
  provider: LlmProvider | string;
  model: string;
}

export interface DraftVerifyRequest {
  source_text: string;
  translation_text: string;
  book?: string;
  genre?: string[];
  era_profile?: string;
  provider?: LlmProvider | string;
  model?: string;
}

export interface DraftVerifyCategory {
  id: "consistency" | "accuracy" | "naturalness" | "terminology" | "omission" | "style" | string;
  label: string;
  score: number;
  status: "pass" | "warning" | "fail" | string;
  comment: string;
}

export interface DraftVerifyIssue {
  severity: "critical" | "major" | "minor" | "suggestion" | string;
  category: string;
  source_excerpt: string;
  translation_excerpt: string;
  problem: string;
  suggestion: string;
}

export interface DraftVerifyResponse {
  overall_score: number;
  verdict: "ready" | "needs_minor_revision" | "needs_major_revision" | string;
  summary: string;
  categories: DraftVerifyCategory[];
  issues: DraftVerifyIssue[];
  strengths: string[];
  provider: LlmProvider | string;
  model: string;
}

export interface SavedVerifyReport extends DraftVerifyResponse {
  id: string;
  created_at: string;
}

// ===== Upload (upload.py) =====
export interface UploadResult {
  id: string;
  book: string;
  chapter: number;
  zh_fetched: boolean;
  new_terms: string[];       // 신규 용어 후보 (중국어 문자열 배열)
  status: string;
  created_count?: number;
  created_chapters?: number[];
  zh_fetched_any?: boolean;
  zh_fetched_all?: boolean;
  source_fetch_mode?: "full_text" | "metadata_only" | "not_configured" | "failed";
  upserted_count?: number;
  merged_count?: number;
  conflict_count?: number;
  conflicts?: UploadConflict[];
  alignment_applied_count?: number;
  alignment_review_count?: number;
  alignment_reviews?: AlignmentReview[];
}

export interface UploadConflict {
  record_id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  field: "zh_text" | "ko_text";
  existing_value: string;
  incoming_value: string;
}

export interface AlignmentReview {
  review_id: string;
  record_id: string;
  book: string;
  chapter_ko: number;
  chapter_zh: string;
  existing_ko_text: string;
  proposed_ko_text: string;
  batch_id?: string;
  batch_label?: string;
  batch_index?: number;
  batch_total?: number;
  confidence: number;
  warnings: string[];
  start_reason?: string;
  end_reason?: string;
  created_at?: string;
}

export interface UploadJobStatus {
  status: "queued" | "running" | "completed" | "failed";
  result?: UploadResult | null;
  error?: string | null;
  created_at?: string;
}

export interface UploadJobItem extends UploadJobStatus {
  job_id: string;
}

export interface SupportedBook {
  book: string;
  book_ko?: string;
  book_zh?: string;
  aliases?: string[];
  parser: string;
  genre: string[];
  era_profile: string;
}

export interface ExtractCandidatesJobStart {
  job_id: string;
  status: "queued";
}

export interface ExtractCandidatesJobStatus {
  status: "queued" | "running" | "completed" | "failed";
  result?: {
    updated_records: number;
    total_candidates: number;
  } | null;
  error?: string | null;
  created_at?: string;
}

export interface PromoteCandidatesResult {
  added: number;
  meaning_updated: number;
}

// ===== Health =====
export interface HealthCheck {
  api_key_set: boolean;
  default_provider: LlmProvider | string;
  available_providers: Array<LlmProvider | string>;
  providers: Record<string, LlmProviderStatus>;
  supabase_configured: boolean;
  supabase_connected: boolean;
  dataset_backend: string;
  glossary_exists: boolean;
  glossary_terms: number;
}
