export type Locale = "ko" | "en" | "zh";

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  zh: "中文",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  ko: "🇰🇷",
  en: "🇺🇸",
  zh: "🇨🇳",
};

// ===== Translation dictionary =====
const translations = {
  // ----- Common / Layout -----
  "app.title": {
    ko: "중한번역",
    en: "ZH-KO Trans",
    zh: "中韩翻译",
  },
  "app.subtitle": {
    ko: "Translation Agent",
    en: "Translation Agent",
    zh: "Translation Agent",
  },
  "nav.dashboard": {
    ko: "대시보드",
    en: "Dashboard",
    zh: "仪表盘",
  },
  "nav.glossary": {
    ko: "용어 사전",
    en: "Glossary",
    zh: "术语词典",
  },
  "nav.translate": {
    ko: "번역 에이전트",
    en: "Translate",
    zh: "翻译代理",
  },
  "nav.upload": {
    ko: "AI 학습",
    en: "Training AI",
    zh: "AI 训练",
  },
  "sidebar.backend": {
    ko: "Backend",
    en: "Backend",
    zh: "后端",
  },
  "sidebar.connected": {
    ko: "● Connected",
    en: "● Connected",
    zh: "● 已连接",
  },

  // ----- Dashboard -----
  "dashboard.title": {
    ko: "대시보드",
    en: "Dashboard",
    zh: "仪表盘",
  },
  "dashboard.subtitle": {
    ko: "중한 문학 번역 에이전트 현황",
    en: "Chinese-Korean Literary Translation Agent Overview",
    zh: "中韩文学翻译代理概览",
  },
  "dashboard.startTranslation": {
    ko: "번역 시작",
    en: "Start Translation",
    zh: "开始翻译",
  },
  "dashboard.totalBooks": {
    ko: "작품 수",
    en: "Books",
    zh: "作品数",
  },
  "dashboard.totalChapters": {
    ko: "총 화수",
    en: "Chapters",
    zh: "总章数",
  },
  "dashboard.totalTerms": {
    ko: "등록 용어",
    en: "Terms",
    zh: "注册术语",
  },
  "dashboard.newTerms": {
    ko: "신규 용어",
    en: "New Terms",
    zh: "新术语",
  },
  "dashboard.bookProgress": {
    ko: "작품별 진행 현황",
    en: "Book Progress",
    zh: "作品进度",
  },
  "dashboard.booksCount": {
    ko: "개 작품",
    en: " books",
    zh: " 部作品",
  },
  "dashboard.progress": {
    ko: "진행률",
    en: "Progress",
    zh: "进度",
  },
  "dashboard.chapters": {
    ko: "화",
    en: "ch.",
    zh: "话",
  },
  "dashboard.noBooks": {
    ko: "등록된 작품이 없습니다",
    en: "No books registered",
    zh: "暂无注册作品",
  },
  "dashboard.uploadDataset": {
    ko: "데이터셋 업로드하기 →",
    en: "Upload dataset →",
    zh: "上传数据集 →",
  },
  "dashboard.recentUploads": {
    ko: "최근 업로드 이력",
    en: "Recent Uploads",
    zh: "最近上传记录",
  },
  "dashboard.filename": {
    ko: "파일명",
    en: "Filename",
    zh: "文件名",
  },
  "dashboard.book": {
    ko: "작품",
    en: "Book",
    zh: "作品",
  },
  "dashboard.chapter": {
    ko: "화수",
    en: "Chapter",
    zh: "章节",
  },
  "dashboard.newTermsCol": {
    ko: "신규 용어",
    en: "New Terms",
    zh: "新术语",
  },
  "dashboard.uploadDate": {
    ko: "업로드 일시",
    en: "Upload Date",
    zh: "上传时间",
  },
  "dashboard.noUploads": {
    ko: "업로드 이력이 없습니다",
    en: "No upload history",
    zh: "暂无上传记录",
  },
  "dashboard.lastUpload": {
    ko: "마지막 업로드:",
    en: "Last upload:",
    zh: "最近上传：",
  },
  "dashboard.loadError": {
    ko: "데이터를 불러올 수 없습니다",
    en: "Could not load data",
    zh: "无法加载数据",
  },

  // ----- Glossary -----
  "glossary.title": {
    ko: "용어 사전",
    en: "Glossary",
    zh: "术语词典",
  },
  "glossary.subtitle": {
    ko: "Anki 스타일 카드로 용어 학습 · 편집",
    en: "Learn & edit terms with Anki-style flashcards",
    zh: "Anki风格卡片学习·编辑术语",
  },
  "glossary.search": {
    ko: "용어 검색...",
    en: "Search terms...",
    zh: "搜索术语...",
  },
  "glossary.filter": {
    ko: "필터",
    en: "Filter",
    zh: "筛选",
  },
  "glossary.byBook": {
    ko: "작품별",
    en: "By Book",
    zh: "按作品",
  },
  "glossary.byPos": {
    ko: "품사별",
    en: "By POS",
    zh: "按词性",
  },
  "glossary.byPolicy": {
    ko: "정책별",
    en: "By Policy",
    zh: "按策略",
  },
  "glossary.unknownOnly": {
    ko: "모르는 것만",
    en: "Unknown only",
    zh: "仅未掌握",
  },
  "glossary.clearFilter": {
    ko: "필터 초기화",
    en: "Clear filter",
    zh: "清除筛选",
  },
  "glossary.cards": {
    ko: "개 카드",
    en: " cards",
    zh: " 张卡片",
  },
  "glossary.learned": {
    ko: "학습 완료:",
    en: "Learned:",
    zh: "已掌握：",
  },
  "glossary.flipHint": {
    ko: "스페이스바 또는 클릭으로 뒤집기",
    en: "Press space or click to flip",
    zh: "按空格键或点击翻转",
  },
  "glossary.edit": {
    ko: "편집",
    en: "Edit",
    zh: "编辑",
  },
  "glossary.save": {
    ko: "저장",
    en: "Save",
    zh: "保存",
  },
  "glossary.korean": {
    ko: "한국어",
    en: "Korean",
    zh: "韩语",
  },
  "glossary.pos": {
    ko: "품사",
    en: "POS",
    zh: "词性",
  },
  "glossary.domain": {
    ko: "도메인",
    en: "Domain",
    zh: "领域",
  },
  "glossary.note": {
    ko: "비고",
    en: "Note",
    zh: "备注",
  },
  "glossary.known": {
    ko: "기억함",
    en: "Known",
    zh: "已记住",
  },
  "glossary.review": {
    ko: "다시보기",
    en: "Review",
    zh: "重新学习",
  },
  "glossary.noTerms": {
    ko: "등록된 용어가 없습니다",
    en: "No terms registered",
    zh: "暂无注册术语",
  },
  "glossary.noFilterMatch": {
    ko: "필터 조건에 맞는 용어가 없습니다",
    en: "No terms match the filter",
    zh: "没有匹配筛选条件的术语",
  },

  // ----- Translate -----
  "translate.title": {
    ko: "번역 에이전트",
    en: "Translation Agent",
    zh: "翻译代理",
  },
  "translate.subtitle": {
    ko: "중국어 문학 텍스트를 한국어로 번역합니다",
    en: "Translate Chinese literary text to Korean",
    zh: "将中文文学文本翻译为韩语",
  },
  "translate.inputLabel": {
    ko: "원문 입력",
    en: "Source Text",
    zh: "原文输入",
  },
  "translate.inputPlaceholder": {
    ko: "번역할 중국어 텍스트를 입력하세요...",
    en: "Enter Chinese text to translate...",
    zh: "请输入要翻译的中文文本...",
  },
  "translate.chars": {
    ko: "글자",
    en: "chars",
    zh: "字",
  },
  "translate.selectBook": {
    ko: "작품 선택",
    en: "Select Book",
    zh: "选择作品",
  },
  "translate.selectBookPlaceholder": {
    ko: "작품을 선택하세요",
    en: "Select a book",
    zh: "请选择作品",
  },
  "translate.genre": {
    ko: "장르",
    en: "Genre",
    zh: "类型",
  },
  "translate.era": {
    ko: "시대 배경",
    en: "Era Setting",
    zh: "时代背景",
  },
  "translate.eraAncient": {
    ko: "고대/고장극",
    en: "Ancient",
    zh: "古代",
  },
  "translate.eraMixed": {
    ko: "혼합",
    en: "Mixed",
    zh: "混合",
  },
  "translate.eraModern": {
    ko: "현대",
    en: "Modern",
    zh: "现代",
  },
  "translate.eraUnknown": {
    ko: "모름 (AI가 판단)",
    en: "Unknown (AI decides)",
    zh: "未知 (AI判断)",
  },
  "translate.withAnnotations": {
    ko: "주석 포함",
    en: "Include annotations",
    zh: "包含注释",
  },
  "translate.withCulturalCheck": {
    ko: "문화 검토",
    en: "Cultural check",
    zh: "文化审查",
  },
  "translate.submit": {
    ko: "번역하기",
    en: "Translate",
    zh: "翻译",
  },
  "translate.loading": {
    ko: "번역 중...",
    en: "Translating...",
    zh: "翻译中...",
  },
  "translate.aiLoading": {
    ko: "AI 번역 진행 중...",
    en: "AI translation in progress...",
    zh: "AI翻译进行中...",
  },
  "translate.aiLoadingDesc": {
    ko: "문맥을 분석하고 최적의 번역을 생성합니다",
    en: "Analyzing context and generating optimal translation",
    zh: "分析上下文并生成最佳翻译",
  },
  "translate.result": {
    ko: "번역 결과",
    en: "Translation Result",
    zh: "翻译结果",
  },
  "translate.annotations": {
    ko: "주석",
    en: "Annotations",
    zh: "注释",
  },
  "translate.culturalFlags": {
    ko: "문화 판단",
    en: "Cultural Flags",
    zh: "文化判断",
  },
  "translate.termsUsed": {
    ko: "사용된 용어",
    en: "Terms Used",
    zh: "使用的术语",
  },
  "translate.keep": {
    ko: "유지",
    en: "Keep",
    zh: "保留",
  },
  "translate.change": {
    ko: "변경",
    en: "Change",
    zh: "更改",
  },
  "translate.kept": {
    ko: "✓ 유지",
    en: "✓ Kept",
    zh: "✓ 已保留",
  },
  "translate.changed": {
    ko: "↺ 변경",
    en: "↺ Changed",
    zh: "↺ 已更改",
  },
  "translate.suggestion": {
    ko: "제안:",
    en: "Suggestion:",
    zh: "建议：",
  },
  "translate.errorOccurred": {
    ko: "번역 중 오류가 발생했습니다",
    en: "An error occurred during translation",
    zh: "翻译过程中发生错误",
  },
  "translate.emptyState": {
    ko: "원문을 입력하고 [번역하기]를 클릭하세요",
    en: "Enter source text and click [Translate]",
    zh: "请输入原文并点击[翻译]",
  },

  // ----- Upload -----
  "upload.title": {
    ko: "데이터셋 업로드",
    en: "Dataset Upload",
    zh: "数据集上传",
  },
  "upload.subtitle": {
    ko: "작품 텍스트 파일을 업로드하여 용어를 추출합니다",
    en: "Upload text files to extract terms",
    zh: "上传文本文件以提取术语",
  },
  "upload.dropzoneActive": {
    ko: "여기에 놓으세요",
    en: "Drop here",
    zh: "放在这里",
  },
  "upload.dropzoneDefault": {
    ko: "파일을 드래그하거나 클릭하여 선택하세요",
    en: "Drag a file or click to select",
    zh: "拖拽文件或点击选择",
  },
  "upload.supportedFormats": {
    ko: ".txt, .md, .csv, .json 지원",
    en: ".txt, .md, .csv, .json supported",
    zh: "支持 .txt, .md, .csv, .json",
  },
  "upload.remove": {
    ko: "제거",
    en: "Remove",
    zh: "移除",
  },
  "upload.bookName": {
    ko: "작품명",
    en: "Book Title",
    zh: "作品名",
  },
  "upload.bookNamePlaceholder": {
    ko: "작품 이름을 입력하세요",
    en: "Enter book title",
    zh: "请输入作品名",
  },
  "upload.chapter": {
    ko: "화수",
    en: "Chapter",
    zh: "章节",
  },
  "upload.chapterPlaceholder": {
    ko: "예: 1, 2, 3...",
    en: "e.g. 1, 2, 3...",
    zh: "例：1, 2, 3...",
  },
  "upload.submit": {
    ko: "업로드",
    en: "Upload",
    zh: "上传",
  },
  "upload.uploading": {
    ko: "업로드 중...",
    en: "Uploading...",
    zh: "上传中...",
  },
  "upload.uploadError": {
    ko: "업로드 중 오류가 발생했습니다",
    en: "An error occurred during upload",
    zh: "上传过程中发生错误",
  },
  "upload.newTermCandidates": {
    ko: "신규 용어 후보",
    en: "New Term Candidates",
    zh: "新术语候选",
  },
  "upload.uploadMore": {
    ko: "추가 업로드",
    en: "Upload More",
    zh: "继续上传",
  },
  "upload.existingDatasets": {
    ko: "기존 데이터셋",
    en: "Existing Datasets",
    zh: "现有数据集",
  },
  "upload.entries": {
    ko: "건",
    en: " entries",
    zh: " 条",
  },
  "upload.noDatasets": {
    ko: "등록된 데이터셋이 없습니다",
    en: "No datasets registered",
    zh: "暂无注册数据集",
  },
  "upload.noDatasetsSub": {
    ko: "파일을 업로드하면 여기에 표시됩니다",
    en: "Upload a file and it will appear here",
    zh: "上传文件后将显示在这里",
  },
  "upload.sourceZh": {
    ko: "원문 (zh)",
    en: "Source (zh)",
    zh: "原文 (zh)",
  },
  "upload.translKo": {
    ko: "번역 (ko)",
    en: "Transl. (ko)",
    zh: "翻译 (ko)",
  },
  "upload.createdAt": {
    ko: "등록일",
    en: "Created",
    zh: "创建日期",
  },
  "upload.previewTitle": {
    ko: "번역문 미리보기",
    en: "Translation Preview",
    zh: "翻译预览",
  },
  "upload.noTranslation": {
    ko: "번역문이 아직 없습니다",
    en: "No translation yet",
    zh: "暂无翻译",
  },
  "upload.noTranslationSub": {
    ko: "번역 에이전트에서 번역을 진행해보세요",
    en: "Try translating with the translation agent",
    zh: "请使用翻译代理进行翻译",
  },
  "upload.sourceSummary": {
    ko: "원문 요약",
    en: "Source Summary",
    zh: "原文摘要",
  },
  "upload.totalChars": {
    ko: "전체",
    en: "Total",
    zh: "总计",
  },
  "upload.source": {
    ko: "원문",
    en: "Source",
    zh: "原文",
  },
  "upload.translation": {
    ko: "번역",
    en: "Translation",
    zh: "翻译",
  },
  "upload.chapterZh": {
    ko: "중국어 원문 화수 (비워두면 한국어 화수와 동일)",
    en: "Chinese source chapter (leave empty to match Korean chapter)",
    zh: "中文原文章节（留空则与韩文章节相同）",
  },
  "upload.chapterZhPlaceholder": {
    ko: "예: 1, 1-2, 3",
    en: "e.g. 1, 1-2, 3",
    zh: "例：1, 1-2, 3",
  },
  "upload.script": {
    ko: "한자 자형",
    en: "Chinese Script",
    zh: "汉字字形",
  },
  "upload.scriptUnknown": {
    ko: "자동 감지",
    en: "Auto-detect",
    zh: "自动检测",
  },
  "upload.scriptSimplified": {
    ko: "간체자",
    en: "Simplified",
    zh: "简体字",
  },
  "upload.scriptTraditional": {
    ko: "번체자",
    en: "Traditional",
    zh: "繁体字",
  },
  "upload.scriptBadgeUnknown": {
    ko: "미확인",
    en: "Unknown",
    zh: "未确认",
  },

  // ----- Genre Labels -----
  "genre.wuxia": { ko: "무협", en: "Wuxia", zh: "武侠" },
  "genre.xianxia": { ko: "선협", en: "Xianxia", zh: "仙侠" },
  "genre.modern": { ko: "현대", en: "Modern", zh: "现代" },
  "genre.romance": { ko: "로맨스", en: "Romance", zh: "言情" },
  "genre.fantasy": { ko: "판타지", en: "Fantasy", zh: "奇幻" },
  "genre.sf": { ko: "SF", en: "Sci-Fi", zh: "科幻" },
  "genre.history": { ko: "역사", en: "History", zh: "历史" },
  "genre.mystery": { ko: "추리", en: "Mystery", zh: "推理" },
  "genre.horror": { ko: "공포", en: "Horror", zh: "恐怖" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[locale] || entry["ko"];
}
