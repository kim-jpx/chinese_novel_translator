create table if not exists public.dataset_records (
  id text primary key,
  book text not null,
  book_ko text not null default '',
  book_zh text not null default '',
  chapter_ko integer not null,
  chapter_zh text not null default '',
  chapter integer,
  script text not null default 'unknown',
  chapter_id text not null default '',
  chapter_title_zh text not null default '',
  genre jsonb not null default '[]'::jsonb,
  source_url text not null default '',
  source_lang text not null default 'zh-CN',
  target_lang text not null default 'ko-KR',
  zh_text text not null default '',
  ko_text text not null default '',
  ko_text_confirmed text not null default '',
  translation_mode text not null default '문학 번역',
  register text not null default '',
  era_profile text not null default 'ancient',
  status text not null default 'draft',
  human_reviewed boolean not null default false,
  review_note text not null default '',
  notes text not null default '',
  new_term_candidates jsonb not null default '[]'::jsonb,
  canonical_book_key text not null,
  chapter_zh_primary integer not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists dataset_records_canonical_pair_idx
  on public.dataset_records (canonical_book_key, chapter_zh_primary);

create index if not exists dataset_records_book_chapter_idx
  on public.dataset_records (book, chapter_ko);

create index if not exists dataset_records_status_idx
  on public.dataset_records (status);
