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
  "nav.reader": {
    ko: "읽기",
    en: "Reading",
    zh: "阅读",
  },
  "nav.study": {
    ko: "학습/복습",
    en: "Study / Review",
    zh: "学习 / 复习",
  },
  "nav.upload": {
    ko: "데이터셋 관리",
    en: "Dataset Admin",
    zh: "数据集管理",
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
  "sidebar.checking": {
    ko: "● 확인 중",
    en: "● Checking",
    zh: "● 检查中",
  },
  "sidebar.disconnected": {
    ko: "● 연결 실패",
    en: "● Offline",
    zh: "● 连接失败",
  },
  "sidebar.attention": {
    ko: "● 설정 필요",
    en: "● Setup Needed",
    zh: "● 需要配置",
  },
  "scriptDisplay.label": {
    ko: "한자 표시",
    en: "Chinese script",
    zh: "汉字显示",
  },
  "scriptDisplay.original": {
    ko: "원문",
    en: "Original",
    zh: "原文",
  },
  "scriptDisplay.simplified": {
    ko: "간체",
    en: "Simplified",
    zh: "简体",
  },
  "scriptDisplay.traditional": {
    ko: "번체",
    en: "Traditional",
    zh: "繁體",
  },
  "scriptDisplay.displayOnly": {
    ko: "표시만",
    en: "display only",
    zh: "仅显示",
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
  "dashboard.apiKeyTitle": {
    ko: "Anthropic API 키",
    en: "Anthropic API Key",
    zh: "Anthropic API 密钥",
  },
  "dashboard.apiKeyPlaceholder": {
    ko: "sk-ant-... 형태의 키를 입력하세요",
    en: "Enter key in sk-ant-... format",
    zh: "输入 sk-ant-... 形式的密钥",
  },
  "dashboard.apiKeySave": {
    ko: "키 저장",
    en: "Save Key",
    zh: "保存密钥",
  },
  "dashboard.apiKeySaving": {
    ko: "저장 중...",
    en: "Saving...",
    zh: "保存中...",
  },
  "dashboard.apiKeySaved": {
    ko: "API 키를 .env에 저장했습니다",
    en: "Saved API key to .env",
    zh: "API 密钥已保存到 .env",
  },
  "dashboard.apiKeyRequired": {
    ko: "API 키를 입력하세요",
    en: "Please enter API key",
    zh: "请输入 API 密钥",
  },
  "dashboard.setupTitle": {
    ko: "백엔드 설정 상태",
    en: "Backend Setup",
    zh: "后端配置状态",
  },
  "dashboard.setupSubtitle": {
    ko: "브라우저에 비밀키를 저장하지 않고 서버 환경을 점검합니다",
    en: "Checks the server environment without storing secrets in the browser",
    zh: "在不将密钥保存到浏览器的前提下检查服务器环境",
  },
  "dashboard.setupApiKey": {
    ko: "Anthropic API 키",
    en: "Anthropic API Key",
    zh: "Anthropic API 密钥",
  },
  "dashboard.setupApiKeyDesc": {
    ko: "백엔드 환경 변수에 설정되어 있어야 합니다",
    en: "Must be configured in backend environment variables",
    zh: "必须配置在后端环境变量中",
  },
  "dashboard.setupSupabase": {
    ko: "Supabase 데이터셋",
    en: "Supabase Dataset",
    zh: "Supabase 数据集",
  },
  "dashboard.setupSupabaseDesc": {
    ko: "URL, 서비스 키, 연결 상태를 함께 확인합니다",
    en: "Checks URL, service role key, and connectivity together",
    zh: "同时检查 URL、服务密钥和连接状态",
  },
  "dashboard.setupGlossary": {
    ko: "용어 사전",
    en: "Glossary",
    zh: "术语词典",
  },
  "dashboard.setupGlossaryDesc": {
    ko: "정규화된 용어 파일과 용어 수를 표시합니다",
    en: "Shows canonical glossary availability and term count",
    zh: "显示规范术语文件状态和术语数量",
  },
  "dashboard.setupReady": {
    ko: "준비됨",
    en: "Ready",
    zh: "已就绪",
  },
  "dashboard.setupNeeded": {
    ko: "점검 필요",
    en: "Needs Attention",
    zh: "需要检查",
  },
  "dashboard.setupLoading": {
    ko: "백엔드 상태를 확인하는 중입니다",
    en: "Checking backend status",
    zh: "正在检查后端状态",
  },
  "dashboard.setupLoadError": {
    ko: "백엔드 상태를 확인할 수 없습니다",
    en: "Could not load backend status",
    zh: "无法加载后端状态",
  },
  "dashboard.confirmed": {
    ko: "확정 완료",
    en: "Confirmed",
    zh: "已确认",
  },
  "dashboard.draft": {
    ko: "초안",
    en: "Draft",
    zh: "草稿",
  },

  // ----- Glossary -----
  "glossary.title": {
    ko: "용어 사전",
    en: "Glossary",
    zh: "术语词典",
  },
  "glossary.subtitle": {
    ko: "작품 우선 규칙과 공통 규칙을 함께 관리하고, 실제 데이터셋 예문으로 복습합니다",
    en: "Manage book-first and shared rules together, then review them with real dataset examples",
    zh: "同时管理作品优先规则与通用规则，并用真实数据集例句复习",
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
  "glossary.loadError": {
    ko: "용어 사전을 불러올 수 없습니다",
    en: "Could not load glossary",
    zh: "无法加载术语词典",
  },
  "glossary.saveError": {
    ko: "용어를 저장할 수 없습니다",
    en: "Could not save glossary term",
    zh: "无法保存术语",
  },
  "glossary.korean": {
    ko: "한국어",
    en: "Korean",
    zh: "韩语",
  },
  "glossary.meaning": {
    ko: "뜻",
    en: "Meaning",
    zh: "释义",
  },
  "glossary.meaningMissing": {
    ko: "뜻 미입력",
    en: "Meaning not entered",
    zh: "释义未填写",
  },
  "glossary.meaningMissingHelp": {
    ko: "확정된 원문-번역 짝에서 아직 뜻을 추정하지 못했습니다",
    en: "A meaning has not been inferred yet from confirmed source-translation pairs",
    zh: "尚未从已确认的原文-译文配对中推断出释义",
  },
  "glossary.viewCards": {
    ko: "카드",
    en: "Cards",
    zh: "卡片",
  },
  "glossary.viewList": {
    ko: "리스트",
    en: "List",
    zh: "列表",
  },
  "glossary.recentBatch": {
    ko: "최근 저장 배치",
    en: "Recent Batch",
    zh: "最近批次",
  },
  "glossary.batchSelectHint": {
    ko: "최신 배치가 기본 선택됩니다",
    en: "The latest batch is selected by default",
    zh: "默认选中最新批次",
  },
  "glossary.batchTermCount": {
    ko: "개 용어",
    en: "terms",
    zh: "条术语",
  },
  "glossary.allBatches": {
    ko: "전체",
    en: "All",
    zh: "全部",
  },
  "glossary.batchUnknown": {
    ko: "배치 미분류",
    en: "Unbatched",
    zh: "未分批",
  },
  "glossary.listHint": {
    ko: "리스트에서 바로 선택하고 수정할 수 있습니다",
    en: "Select and edit terms directly in the list",
    zh: "可在列表中直接选择并编辑术语",
  },
  "glossary.listTermZh": {
    ko: "원문",
    en: "Source",
    zh: "原文",
  },
  "glossary.listTermKo": {
    ko: "한국어 표기",
    en: "Korean Rendering",
    zh: "韩文写法",
  },
  "glossary.listMeaning": {
    ko: "뜻",
    en: "Meaning",
    zh: "释义",
  },
  "glossary.listBatch": {
    ko: "배치",
    en: "Batch",
    zh: "批次",
  },
  "glossary.listAddedAt": {
    ko: "저장 시각",
    en: "Saved At",
    zh: "保存时间",
  },
  "glossary.listActions": {
    ko: "작업",
    en: "Actions",
    zh: "操作",
  },
  "glossary.listEdit": {
    ko: "수정",
    en: "Edit",
    zh: "编辑",
  },
  "glossary.listCancel": {
    ko: "취소",
    en: "Cancel",
    zh: "取消",
  },
  "glossary.listEmpty": {
    ko: "조건에 맞는 용어가 없습니다",
    en: "No terms match the current filters",
    zh: "没有符合当前条件的术语",
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
  "glossary.book": {
    ko: "작품",
    en: "Book",
    zh: "作品",
  },
  "glossary.policy": {
    ko: "정책",
    en: "Policy",
    zh: "策略",
  },
  "glossary.scopeBook": {
    ko: "작품 우선",
    en: "Book-first",
    zh: "作品优先",
  },
  "glossary.scopeGlobal": {
    ko: "공통 규칙",
    en: "Shared rule",
    zh: "通用规则",
  },
  "glossary.examples": {
    ko: "실제 데이터셋 예문",
    en: "Real Dataset Examples",
    zh: "真实数据集例句",
  },
  "glossary.examplesLoadError": {
    ko: "예문을 불러올 수 없습니다",
    en: "Could not load examples",
    zh: "无法加载例句",
  },
  "glossary.noExamples": {
    ko: "확정된 데이터셋 예문이 아직 없습니다",
    en: "There are no confirmed dataset examples yet",
    zh: "还没有已确认的数据集例句",
  },
  "glossary.examplesLoading": {
    ko: "예문 불러오는 중...",
    en: "Loading examples...",
    zh: "正在加载例句...",
  },
  "glossary.matchedInZh": {
    ko: "원문 매칭",
    en: "Matched in source",
    zh: "原文命中",
  },
  "glossary.matchedInKo": {
    ko: "번역 매칭",
    en: "Matched in translation",
    zh: "译文命中",
  },
  "glossary.matchedInBoth": {
    ko: "원문/번역 모두",
    en: "Matched in both",
    zh: "原文/译文均命中",
  },
  "glossary.globalIncluded": {
    ko: "작품 필터 시 공통 규칙도 함께 표시됩니다",
    en: "Shared rules are shown together when a book filter is active",
    zh: "按作品筛选时也会同时显示通用规则",
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
    ko: "작품 제목",
    en: "Book titles",
    zh: "作品标题",
  },
  "translate.selectBookPlaceholder": {
    ko: "기존 작품을 선택하거나 새 제목을 입력하세요",
    en: "Select an existing book or enter a new title",
    zh: "选择已有作品或输入新标题",
  },
  "translate.bookKoPlaceholder": {
    ko: "한국어 제목",
    en: "Korean title",
    zh: "韩文标题",
  },
  "translate.bookZhPlaceholder": {
    ko: "중국어 원문 제목",
    en: "Chinese source title",
    zh: "中文原题",
  },
  "translate.bookInputHint": {
    ko: "한국어 제목과 원문 제목 중 하나는 필요합니다. 기존 작품을 선택하면 다른 제목을 자동으로 채웁니다.",
    en: "At least one title is required. Selecting an existing title fills the matching counterpart.",
    zh: "韩文标题和中文原题至少填写一个。选择已有作品会自动补全对应标题。",
  },
  "translate.chapterKo": {
    ko: "한국어 화수",
    en: "Korean chapter",
    zh: "韩文章节",
  },
  "translate.chapterZh": {
    ko: "중국어 원문 화수",
    en: "Chinese source chapter",
    zh: "中文原文章节",
  },
  "translate.chapterPlaceholder": {
    ko: "예: 12",
    en: "e.g. 12",
    zh: "例：12",
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
  "translate.saveDraft": {
    ko: "초안을 데이터셋에 저장",
    en: "Save draft to dataset",
    zh: "保存草稿到数据集",
  },
  "translate.savingDraft": {
    ko: "초안 저장 중...",
    en: "Saving draft...",
    zh: "保存草稿中...",
  },
  "translate.saveDraftSuccess": {
    ko: "번역 초안을 데이터셋에 저장했습니다",
    en: "Saved the translation draft to the dataset",
    zh: "已将译文草稿保存到数据集",
  },
  "translate.saveDraftConflict": {
    ko: "기존 데이터와 충돌하는 필드가 있어 기존 값을 유지했습니다. 데이터셋/학습 탭에서 검토하세요.",
    en: "Some fields conflicted with existing data, so the current dataset was kept. Review them in Dataset / Study.",
    zh: "与现有数据存在冲突，因此当前先保留原数据。请在数据集 / 学习页面中检查。",
  },
  "translate.saveDraftMissingFields": {
    ko: "한국어/원문 제목 중 하나와 원문 화수를 입력해야 초안을 저장할 수 있습니다",
    en: "At least one title and the source chapter are required to save a draft",
    zh: "保存草稿前必须填写至少一个标题和原文章节",
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
  "translate.glossaryHits": {
    ko: "적용 용어 규칙",
    en: "Applied Glossary Rules",
    zh: "已应用术语规则",
  },
  "translate.referenceExamples": {
    ko: "참고 확정 예문",
    en: "Reference Confirmed Examples",
    zh: "参考已确认例句",
  },
  "translate.contextSummary": {
    ko: "번역 메모리 요약",
    en: "Translation Memory Summary",
    zh: "翻译记忆摘要",
  },
  "translate.confirmedRecords": {
    ko: "확정 레코드",
    en: "Confirmed records",
    zh: "已确认记录",
  },
  "translate.referenceCount": {
    ko: "참고 예문",
    en: "Reference examples",
    zh: "参考例句",
  },
  "translate.scopeBook": {
    ko: "작품 우선",
    en: "Book-first",
    zh: "作品优先",
  },
  "translate.scopeGlobal": {
    ko: "공통 규칙",
    en: "Global rule",
    zh: "通用规则",
  },
  "translate.referenceSourcePrevious": {
    ko: "이전 화",
    en: "Previous chapter",
    zh: "上一话",
  },
  "translate.referenceSourceTerm": {
    ko: "용어 예문",
    en: "Term example",
    zh: "术语例句",
  },
  "translate.referenceSourceSimilar": {
    ko: "유사 문맥",
    en: "Similar context",
    zh: "相似语境",
  },
  "translate.referenceSourceRecent": {
    ko: "최근 확정본",
    en: "Recent confirmed",
    zh: "最近确认",
  },
  "translate.bookContextTitle": {
    ko: "작품 번역 메모리",
    en: "Book Translation Memory",
    zh: "作品翻译记忆",
  },
  "translate.bookContextSubtitle": {
    ko: "번역 전에 작품 확정본과 작품 전용 용어를 먼저 확인합니다.",
    en: "Review confirmed examples and book-specific terms before translating.",
    zh: "翻译前先查看该作品的已确认例句与专用术语。",
  },
  "translate.bookContextLoading": {
    ko: "작품 문맥을 불러오는 중...",
    en: "Loading book context...",
    zh: "正在加载作品上下文...",
  },
  "translate.bookContextConfirmedCount": {
    ko: "확정 예문 수",
    en: "Confirmed examples",
    zh: "确认例句数",
  },
  "translate.bookContextGlossary": {
    ko: "우선 적용할 작품 용어",
    en: "Priority book terms",
    zh: "优先应用的作品术语",
  },
  "translate.bookContextRecent": {
    ko: "최근 확정본 미리보기",
    en: "Recent confirmed previews",
    zh: "最近确认内容预览",
  },
  "translate.bookContextEmpty": {
    ko: "아직 이 작품의 확정본이 없습니다",
    en: "No confirmed examples for this book yet",
    zh: "该作品还没有已确认例句",
  },
  "translate.noGlossaryHits": {
    ko: "직접 적용된 용어 규칙이 없습니다",
    en: "No direct glossary hits",
    zh: "没有直接命中的术语规则",
  },
  "translate.noReferenceExamples": {
    ko: "같은 작품의 확정 예문이 아직 부족합니다",
    en: "There are not enough confirmed examples for this book yet",
    zh: "该作品的已确认例句还不足",
  },
  "translate.matchedTerms": {
    ko: "매칭 용어",
    en: "Matched terms",
    zh: "匹配术语",
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
  "translate.loadBooksError": {
    ko: "작품 목록을 불러올 수 없습니다",
    en: "Could not load books",
    zh: "无法加载作品列表",
  },
  "translate.loadContextError": {
    ko: "이전 회차 컨텍스트를 불러올 수 없습니다",
    en: "Could not load previous chapter context",
    zh: "无法加载上一章上下文",
  },
  "translate.emptyState": {
    ko: "원문을 입력하고 [번역하기]를 클릭하세요",
    en: "Enter source text and click [Translate]",
    zh: "请输入原文并点击[翻译]",
  },

  // ----- Upload -----
  "upload.title": {
    ko: "데이터셋/학습",
    en: "Dataset / Study",
    zh: "数据集 / 学习",
  },
  "upload.subtitle": {
    ko: "원문과 번역본을 업로드해 작품별 번역 데이터셋과 용어 규칙을 누적합니다",
    en: "Upload source and translated text to build a per-book translation dataset and glossary rules",
    zh: "上传原文与译文，持续积累作品级翻译数据集与术语规则",
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
  "upload.bookNameKo": {
    ko: "작품명 (한국어)",
    en: "Book Title (Korean)",
    zh: "作品名（韩文）",
  },
  "upload.bookNameZh": {
    ko: "작품명 (중국어)",
    en: "Book Title (Chinese)",
    zh: "作品名（中文）",
  },
  "upload.bookNamePlaceholder": {
    ko: "작품 이름을 입력하세요",
    en: "Enter book title",
    zh: "请输入作品名",
  },
  "upload.bookNameKoPlaceholder": {
    ko: "한국어 작품명을 입력/선택하세요",
    en: "Enter/select Korean title",
    zh: "输入/选择韩文作品名",
  },
  "upload.bookNameZhPlaceholder": {
    ko: "중국어 작품명을 입력/선택하세요",
    en: "Enter/select Chinese title",
    zh: "输入/选择中文作品名",
  },
  "upload.inputLanguage": {
    ko: "입력 기준 언어",
    en: "Primary Input Language",
    zh: "主要输入语言",
  },
  "upload.inputLanguageKo": {
    ko: "한국어",
    en: "Korean",
    zh: "韩语",
  },
  "upload.inputLanguageZh": {
    ko: "중국어",
    en: "Chinese",
    zh: "中文",
  },
  "upload.requiredLabel": {
    ko: "필수",
    en: "Required",
    zh: "必填",
  },
  "upload.chapterKo": {
    ko: "한국어 회차",
    en: "Korean Chapter",
    zh: "韩文回次",
  },
  "upload.chapterZhShort": {
    ko: "중국어 회차",
    en: "Chinese Chapter",
    zh: "中文回次",
  },
  "upload.isOriginalText": {
    ko: "현재 입력 텍스트가 원문",
    en: "Current input text is original source",
    zh: "当前输入文本为原文",
  },
  "upload.originalTextHint": {
    ko: "원문 체크는 입력 기준 언어가 중국어일 때만 사용하세요.",
    en: "Use original-text only when primary input language is Chinese.",
    zh: "仅当主要输入语言为中文时使用原文勾选。",
  },
  "upload.originalTextInvalidCombo": {
    ko: "입력 기준 언어가 한국어일 때는 원문 체크를 사용할 수 없습니다.",
    en: "Original-text cannot be enabled when primary input language is Korean.",
    zh: "主要输入语言为韩语时不能启用原文勾选。",
  },
  "upload.chapter": {
    ko: "화수",
    en: "Chapter",
    zh: "章节",
  },
  "upload.chapterPlaceholder": {
    ko: "예: 1, 1-5, 3,7-9",
    en: "e.g. 1, 1-5, 3,7-9",
    zh: "例：1, 1-5, 3,7-9",
  },
  "upload.tabFile": {
    ko: "파일 업로드",
    en: "File Upload",
    zh: "文件上传",
  },
  "upload.tabText": {
    ko: "텍스트 붙여넣기",
    en: "Paste Text",
    zh: "粘贴文本",
  },
  "upload.textPlaceholder": {
    ko: "번역 텍스트를 여기에 붙여넣으세요...",
    en: "Paste translated text here...",
    zh: "在此粘贴翻译文本...",
  },
  "upload.save": {
    ko: "저장",
    en: "Save",
    zh: "保存",
  },
  "upload.saving": {
    ko: "저장 중...",
    en: "Saving...",
    zh: "保存中...",
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
  "upload.newTermCandidatesCollapsedHint": {
    ko: "기본은 요약만 표시합니다. 필요할 때만 펼쳐서 전체 후보를 확인하세요.",
    en: "Only a summary is shown by default. Expand this section only when you need the full list.",
    zh: "默认只显示摘要。需要时再展开查看全部候选。",
  },
  "upload.showNewTermCandidates": {
    ko: "후보 펼치기",
    en: "Show candidates",
    zh: "展开候选",
  },
  "upload.hideNewTermCandidates": {
    ko: "후보 접기",
    en: "Hide candidates",
    zh: "收起候选",
  },
  "upload.uploadMore": {
    ko: "추가 업로드",
    en: "Upload More",
    zh: "继续上传",
  },
  "upload.totalBooks": {
    ko: "작품 수",
    en: "Books",
    zh: "作品数",
  },
  "upload.totalRecords": {
    ko: "데이터셋 행",
    en: "Dataset Rows",
    zh: "数据行",
  },
  "upload.sourceCoverage": {
    ko: "원문 페어링",
    en: "Source Coverage",
    zh: "原文配对率",
  },
  "upload.confirmedRate": {
    ko: "확정본 비율",
    en: "Confirmed Rate",
    zh: "确认率",
  },
  "reader.title": {
    ko: "학습/복습",
    en: "Study / Review",
    zh: "学习 / 复习",
  },
  "reader.subtitle": {
    ko: "확정된 번역을 읽으면서 원문 구문과 용어를 함께 복습합니다",
    en: "Study confirmed translations with source syntax and glossary review",
    zh: "阅读已确认译文，并同步复习原文句法与术语",
  },
  "reader.syntaxStudyTitle": {
    ko: "구문 학습",
    en: "Syntax Study",
    zh: "句法学习",
  },
  "reader.syntaxStudySubtitle": {
    ko: "확정본을 기준으로 원문 구문과 한국어 대응을 복습합니다. row 재번역은 문장 편집에서만 가능합니다.",
    en: "Review source syntax and Korean correspondence from confirmed text. Row retranslation is only available in sentence editing.",
    zh: "基于确认稿复习原文语块与韩文对应关系。单行重译仅在句子编辑中提供。",
  },
  "reader.book": {
    ko: "작품",
    en: "Book",
    zh: "作品",
  },
  "reader.chapter": {
    ko: "화",
    en: "Chapter",
    zh: "章节",
  },
  "reader.loading": {
    ko: "확정본을 불러오는 중...",
    en: "Loading confirmed chapters...",
    zh: "正在加载确认章节...",
  },
  "reader.loadError": {
    ko: "확정본을 불러올 수 없습니다",
    en: "Could not load confirmed chapters",
    zh: "无法加载确认章节",
  },
  "reader.glossaryLoadError": {
    ko: "용어 규칙을 불러올 수 없습니다",
    en: "Could not load glossary rules",
    zh: "无法加载术语规则",
  },
  "reader.emptyTitle": {
    ko: "아직 읽을 확정본이 없습니다",
    en: "No confirmed chapters to read yet",
    zh: "还没有可阅读的确认章节",
  },
  "reader.emptySubtitle": {
    ko: "데이터셋 관리에서 초안을 확정하면 여기서 사용자용 읽기/복습 화면으로 확인할 수 있습니다.",
    en: "Confirm drafts in Dataset Admin first, then review them here in the reader experience.",
    zh: "请先在数据集管理中确认草稿，然后在此以阅读器体验复习。",
  },
  "reader.previous": {
    ko: "이전 화",
    en: "Previous",
    zh: "上一章",
  },
  "reader.next": {
    ko: "다음 화",
    en: "Next",
    zh: "下一章",
  },
  "reader.glossaryTitle": {
    ko: "이 화의 용어",
    en: "Terms in This Chapter",
    zh: "本章术语",
  },
  "reader.glossarySubtitle": {
    ko: "본문에 직접 등장한 작품 전용/공통 용어를 보여줍니다",
    en: "Shows book-specific and shared glossary terms that appear in this chapter",
    zh: "显示本章出现的作品专用和通用术语",
  },
  "reader.glossaryEmpty": {
    ko: "이 화에 걸린 용어 규칙이 없습니다",
    en: "No glossary rules were hit in this chapter",
    zh: "本章没有命中的术语规则",
  },
  "reader.confirmedText": {
    ko: "확정 번역",
    en: "Confirmed Translation",
    zh: "确认译文",
  },
  "reader.noConfirmedRows": {
    ko: "선택한 작품에 읽을 확정본이 없습니다",
    en: "The selected book has no confirmed chapters to read",
    zh: "所选作品没有可阅读的确认章节",
  },
  "reader.prototypeButton": {
    ko: "iPhone 프로토타입",
    en: "iPhone Prototype",
    zh: "iPhone 原型",
  },
  "reader.prototypeBadge": {
    ko: "모바일 리더 프로토타입",
    en: "Mobile Reader Prototype",
    zh: "移动阅读器原型",
  },
  "reader.prototypeTitle": {
    ko: "아이폰 확정본 리더",
    en: "iPhone Confirmed Reader",
    zh: "iPhone 确认稿阅读器",
  },
  "reader.prototypeSubtitle": {
    ko: "확정 번역을 세로 읽기 흐름으로 소비하는 모바일 전용 화면 시안입니다",
    en: "A mobile-first reading prototype for consuming confirmed translations in a vertical flow",
    zh: "面向手机的确认译文纵向阅读原型界面",
  },
  "reader.prototypePhoneHint": {
    ko: "모바일 화면 시안",
    en: "Mobile preview",
    zh: "移动端预览",
  },
  "reader.prototypeConfirmed": {
    ko: "확정본",
    en: "Confirmed",
    zh: "确认稿",
  },
  "reader.prototypeReadingTab": {
    ko: "번역",
    en: "Translation",
    zh: "译文",
  },
  "reader.prototypeSourceTab": {
    ko: "원문",
    en: "Source",
    zh: "原文",
  },
  "reader.prototypeParallelTab": {
    ko: "구문 학습",
    en: "Syntax",
    zh: "句法学习",
  },
  "reader.prototypeChaptersTab": {
    ko: "목차",
    en: "Chapters",
    zh: "目录",
  },
  "reader.prototypeGlossaryTab": {
    ko: "용어",
    en: "Glossary",
    zh: "术语",
  },
  "reader.prototypeChapterList": {
    ko: "화 목록",
    en: "Chapter list",
    zh: "章节列表",
  },
  "reader.prototypeEmpty": {
    ko: "읽을 작품이 아직 없습니다",
    en: "There is nothing to read yet",
    zh: "还没有可阅读的作品",
  },
  "reader.prototypeEmptySubtitle": {
    ko: "데이터셋 관리에서 초안을 확정하면 여기서 모바일 리더 흐름으로 확인할 수 있습니다.",
    en: "Confirm drafts in Dataset Admin first, then preview the mobile reader flow here.",
    zh: "请先在数据集管理中确认草稿，然后在这里预览移动阅读流程。",
  },
  "reader.prototypeNoGlossary": {
    ko: "이 화에 걸린 용어 규칙이 없습니다",
    en: "No glossary rules were hit in this chapter",
    zh: "本章没有命中的术语规则",
  },
  "reading.title": {
    ko: "읽기",
    en: "Reading",
    zh: "阅读",
  },
  "reading.subtitle": {
    ko: "확정본을 전자책처럼 편하게 읽습니다",
    en: "Read confirmed chapters in a clean e-book layout",
    zh: "以简洁电子书界面阅读确认稿",
  },
  "reading.openStudy": {
    ko: "학습/복습으로 열기",
    en: "Open Study View",
    zh: "打开学习视图",
  },
  "reading.prototypeButton": {
    ko: "iPhone 읽기 프로토타입",
    en: "iPhone Reading Prototype",
    zh: "iPhone 阅读原型",
  },
  "reading.loading": {
    ko: "읽을 확정본을 불러오는 중...",
    en: "Loading confirmed chapters...",
    zh: "正在加载可阅读确认稿...",
  },
  "reading.loadError": {
    ko: "읽기 화면을 불러올 수 없습니다",
    en: "Could not load reader",
    zh: "无法加载阅读器",
  },
  "reading.emptyTitle": {
    ko: "아직 읽을 확정본이 없습니다",
    en: "No confirmed chapters to read yet",
    zh: "还没有可阅读的确认章节",
  },
  "reading.emptySubtitle": {
    ko: "데이터셋 관리에서 초안을 확정하면 여기서 사용자용 읽기 화면으로 볼 수 있습니다.",
    en: "Confirm drafts in Dataset Admin first, then read them here.",
    zh: "请先在数据集管理中确认草稿，然后在此阅读。",
  },
  "reading.readerHint": {
    ko: "본문만 집중해서 읽을 수 있게 원문과 분석은 숨겼습니다",
    en: "Source text and analysis are hidden so you can focus on reading",
    zh: "已隐藏原文与分析，便于专注阅读正文",
  },
  "reading.modeConfirmed": {
    ko: "확정본 읽기",
    en: "Confirmed",
    zh: "确认稿",
  },
  "reading.modeDraft": {
    ko: "초안 읽기",
    en: "Draft",
    zh: "草稿",
  },
  "reading.modeConfirmedHint": {
    ko: "기본 읽기 모드입니다. 확정된 회차만 보여줍니다",
    en: "Default mode. Shows confirmed chapters only",
    zh: "默认阅读模式。仅显示确认章节",
  },
  "reading.modeDraftHint": {
    ko: "보조 확인용 모드입니다. 아직 확정되지 않은 draft 회차를 읽습니다",
    en: "Secondary mode for checking drafts before confirmation",
    zh: "辅助检查模式。阅读尚未确认的草稿章节",
  },
  "reading.emptyDraftTitle": {
    ko: "읽을 초안 회차가 없습니다",
    en: "No draft chapters to read",
    zh: "没有可阅读的草稿章节",
  },
  "reading.emptyDraftSubtitle": {
    ko: "데이터셋 관리에서 번역 초안을 만든 뒤 여기서 임시 읽기 흐름으로 확인할 수 있습니다.",
    en: "Create draft translations in Dataset Admin, then review them here in the same reading layout.",
    zh: "先在数据集管理中生成草稿译文，然后可在此用同样的阅读布局查看。",
  },
  "reading.chapterList": {
    ko: "회차 목록",
    en: "Chapter List",
    zh: "章节列表",
  },
  "reading.chapterListHint": {
    ko: "확정본 회차를 바로 이동합니다",
    en: "Jump directly between confirmed chapters",
    zh: "可直接切换已确认章节",
  },
  "reading.showChapterList": {
    ko: "회차 목록 펼치기",
    en: "Show chapter list",
    zh: "展开章节列表",
  },
  "reading.hideChapterList": {
    ko: "회차 목록 접기",
    en: "Hide chapter list",
    zh: "收起章节列表",
  },
  "reading.currentChapter": {
    ko: "현재 읽는 회차",
    en: "Current chapter",
    zh: "当前章节",
  },
  "reading.chapterCount": {
    ko: "확정 회차 수",
    en: "Confirmed chapters",
    zh: "确认章节数",
  },
  "reading.glossaryTitle": {
    ko: "이 화의 용어",
    en: "Terms in This Chapter",
    zh: "本章术语",
  },
  "reading.glossarySubtitle": {
    ko: "본문에 등장한 용어만 간단히 확인합니다",
    en: "Quick glossary hits found in this chapter",
    zh: "仅简要显示本章命中的术语",
  },
  "reading.glossaryEmpty": {
    ko: "이 화에 연결된 용어가 없습니다",
    en: "No glossary items were hit in this chapter",
    zh: "本章没有命中的术语",
  },
  "reading.openPrototypeBack": {
    ko: "읽기 창으로 돌아가기",
    en: "Back to Reader",
    zh: "返回阅读器",
  },
  "reading.prototypeBadge": {
    ko: "모바일 읽기 프로토타입",
    en: "Mobile Reading Prototype",
    zh: "移动阅读原型",
  },
  "reading.prototypeTitle": {
    ko: "아이폰 읽기 리더",
    en: "iPhone Reading Reader",
    zh: "iPhone 阅读器",
  },
  "reading.prototypeSubtitle": {
    ko: "확정본을 스마트폰에서 읽는 흐름만 남긴 모바일 읽기 프로토타입입니다",
    en: "A mobile-first prototype focused on clean confirmed-text reading",
    zh: "仅保留确认稿阅读流程的手机阅读原型",
  },
  "reading.prototypeReadingTab": {
    ko: "본문",
    en: "Text",
    zh: "正文",
  },
  "reading.prototypeChaptersTab": {
    ko: "회차",
    en: "Chapters",
    zh: "章节",
  },
  "reading.prototypeGlossaryTab": {
    ko: "용어",
    en: "Glossary",
    zh: "术语",
  },
  "reading.prototypeChapterList": {
    ko: "회차 목록",
    en: "Chapter List",
    zh: "章节列表",
  },
  "reading.prototypeEmpty": {
    ko: "읽을 확정본이 없습니다",
    en: "No confirmed chapters available",
    zh: "没有可阅读的确认章节",
  },
  "reading.prototypeEmptySubtitle": {
    ko: "확정본을 하나 이상 만든 뒤 다시 확인해 주세요.",
    en: "Create at least one confirmed chapter and check again.",
    zh: "请至少创建一个确认章节后再查看。",
  },
  "reading.prototypeNoGlossary": {
    ko: "이 화에 연결된 용어가 없습니다",
    en: "No glossary items are linked to this chapter",
    zh: "本章没有关联术语",
  },
  "upload.reviewQueueTitle": {
    ko: "확정 대기 큐",
    en: "Confirm Queue",
    zh: "待确认队列",
  },
  "upload.reviewQueueSubtitle": {
    ko: "draft 레코드를 한 화씩 확인하고, 그대로 확정하거나 편집기로 넘길 수 있습니다.",
    en: "Review draft rows chapter by chapter, then confirm directly or open them in the editor.",
    zh: "可逐章检查草稿记录，并直接确认或送入编辑器处理。",
  },
  "upload.reviewQueueBook": {
    ko: "확정할 작품",
    en: "Book to confirm",
    zh: "待确认作品",
  },
  "upload.reviewQueueEmptyTitle": {
    ko: "확정 대기 중인 draft가 없습니다",
    en: "There are no draft rows waiting for confirmation",
    zh: "没有等待确认的草稿记录",
  },
  "upload.reviewQueueEmptySubtitle": {
    ko: "새 번역 초안이 쌓이면 여기서 빠르게 확정할 수 있습니다.",
    en: "New translation drafts will appear here for quick confirmation.",
    zh: "新的译文草稿会显示在这里，便于快速确认。",
  },
  "upload.reviewQueueLoading": {
    ko: "확정 대기 큐를 불러오는 중...",
    en: "Loading confirm queue...",
    zh: "正在加载待确认队列...",
  },
  "upload.reviewQueueLoadError": {
    ko: "확정 대기 큐를 불러올 수 없습니다",
    en: "Could not load the confirm queue",
    zh: "无法加载待确认队列",
  },
  "upload.reviewQueuePrevious": {
    ko: "이전 초안",
    en: "Previous draft",
    zh: "上一条草稿",
  },
  "upload.reviewQueueNext": {
    ko: "다음 초안",
    en: "Next draft",
    zh: "下一条草稿",
  },
  "upload.reviewQueueOpenEditor": {
    ko: "편집기로 열기",
    en: "Open in editor",
    zh: "在编辑器中打开",
  },
  "upload.reviewQueueConfirmNow": {
    ko: "현재 draft 그대로 확정",
    en: "Confirm current draft as-is",
    zh: "按当前草稿直接确认",
  },
  "upload.reviewQueueConfirmSuccess": {
    ko: "현재 draft를 확정본으로 반영했습니다",
    en: "Confirmed the current draft",
    zh: "已确认当前草稿",
  },
  "upload.reviewQueueConfirmError": {
    ko: "현재 draft를 확정할 수 없습니다",
    en: "Could not confirm the current draft",
    zh: "无法确认当前草稿",
  },
  "upload.reviewQueueEmptyDraft": {
    ko: "확정할 한국어 초안이 비어 있습니다",
    en: "The Korean draft is empty",
    zh: "待确认的韩文草稿为空",
  },
  "upload.reviewQueueEmptyFilter": {
    ko: "현재 선택한 작품에 확인할 draft가 없습니다.",
    en: "There are no draft rows to review for the selected book.",
    zh: "当前所选作品没有待检查的草稿记录。",
  },
  "upload.workflowStepUpload": {
    ko: "업로드/저장",
    en: "Upload / Save",
    zh: "上传/保存",
  },
  "upload.workflowStepUploadHint": {
    ko: "원문 또는 번역문을 작품/회차 메타데이터와 함께 데이터셋에 넣습니다.",
    en: "Add source or translation text to the dataset with book and chapter metadata.",
    zh: "将原文或译文连同作品/章节信息加入数据集。",
  },
  "upload.workflowStepRetranslate": {
    ko: "재번역/용어 점검",
    en: "Retranslate / Terms",
    zh: "重译/术语检查",
  },
  "upload.workflowStepRetranslateHint": {
    ko: "품질이 어색한 회차는 전체 재번역하고, 용어 추출은 필요할 때 별도로 다시 돌립니다.",
    en: "Retranslate weak chapters, and rerun term extraction separately when needed.",
    zh: "质量不佳的章节可整章重译，术语提取可按需重新运行。",
  },
  "upload.workflowStepConfirm": {
    ko: "검증/확정",
    en: "Review / Confirm",
    zh: "校验/确认",
  },
  "upload.workflowStepConfirmHint": {
    ko: "문장 편집에서 원문과 번역을 맞춘 뒤 확정본으로 넘깁니다. 구문 학습은 확정 후 학습/복습에서 확인합니다.",
    en: "Match source and translation in sentence editing, then confirm it. Syntax study is reviewed after confirmation.",
    zh: "先在句子编辑中核对原文和译文，再设为确认稿。句法学习在确认后查看。",
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
  "upload.noSourceText": {
    ko: "원문이 아직 없습니다",
    en: "No source text yet",
    zh: "暂无原文",
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
  "upload.sourceSummaryOmitted": {
    ko: "중간 내용은 생략하고 원문 시작부와 끝부분을 함께 보여줍니다.",
    en: "Middle content is omitted; the source opening and ending are shown together.",
    zh: "中间内容已省略，同时显示原文开头与结尾。",
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
  "upload.parallelSyntaxTitle": {
    ko: "원문-번역 구문 학습",
    en: "Source-translation syntax study",
    zh: "原文-译文句法学习",
  },
  "upload.parallelSyntaxHint": {
    ko: "구문에 마우스를 올리거나 탭하면 대응 구문이 함께 강조됩니다. 매칭은 학습 보조용 추정입니다.",
    en: "Hover or tap a syntax unit to highlight its counterpart. Matching is an estimated study aid.",
    zh: "悬停或点击语块会同步高亮对应语块。匹配结果仅供学习参考。",
  },
  "upload.parallelSyntaxLowConfidence": {
    ko: "낮은 신뢰도",
    en: "Low confidence",
    zh: "低置信度",
  },
  "upload.parallelSyntaxAiButton": {
    ko: "AI 구문 정렬 재생성",
    en: "Regenerate AI alignment",
    zh: "重新生成 AI 对齐",
  },
  "upload.parallelSyntaxAiRunning": {
    ko: "AI 정렬 중",
    en: "Aligning",
    zh: "正在对齐",
  },
  "upload.parallelSyntaxAiAligned": {
    ko: "정렬됨",
    en: "aligned",
    zh: "已对齐",
  },
  "upload.parallelSyntaxLocalFallback": {
    ko: "로컬 정렬",
    en: "Local alignment",
    zh: "本地对齐",
  },
  "upload.parallelSyntaxAiError": {
    ko: "AI 구문 정렬을 생성할 수 없습니다",
    en: "Could not generate AI syntax alignment",
    zh: "无法生成 AI 句法对齐",
  },
  "upload.parallelSyntaxEmpty": {
    ko: "원문과 번역문이 있어야 구문 학습을 표시할 수 있습니다.",
    en: "Source and translation are required to show syntax study.",
    zh: "需要原文和译文才能显示句法学习。",
  },
  "upload.parallelSyntaxConfidenceHigh": {
    ko: "안정",
    en: "Stable",
    zh: "稳定",
  },
  "upload.parallelSyntaxConfidenceMedium": {
    ko: "점검",
    en: "Check",
    zh: "需检查",
  },
  "upload.parallelSyntaxConfidenceLow": {
    ko: "주의",
    en: "Review",
    zh: "注意",
  },
  "upload.translateRow": {
    ko: "재번역",
    en: "Retranslate",
    zh: "重新翻译",
  },
  "upload.translatingRow": {
    ko: "재번역 중",
    en: "Retranslating",
    zh: "重新翻译中",
  },
  "upload.translateRowFailed": {
    ko: "이 row를 번역할 수 없습니다",
    en: "Could not translate this row",
    zh: "无法翻译此行",
  },
  "upload.lockRow": {
    ko: "row 잠금",
    en: "Lock row",
    zh: "锁定此行",
  },
  "upload.unlockRow": {
    ko: "잠금 해제",
    en: "Unlock row",
    zh: "解除锁定",
  },
  "upload.mergeNextRow": {
    ko: "다음 row 붙이기",
    en: "Merge next row",
    zh: "合并下一行",
  },
  "upload.mergeNextRowTranslation": {
    ko: "다음 번역 붙이기",
    en: "Merge next translation",
    zh: "合并下一行译文",
  },
  "upload.mergeNextRowUnavailable": {
    ko: "선택한 항목에서 다음 row에 붙일 내용이 없습니다",
    en: "There is no content to merge from the next row for the selected targets",
    zh: "所选项目在下一行中没有可合并的内容",
  },
  "upload.shiftTranslationsUp": {
    ko: "아래 번역 전체 끌어올리기",
    en: "Shift all following translations up",
    zh: "将下方译文整体上移",
  },
  "upload.shiftTranslationsUnavailable": {
    ko: "이 row 아래에서 끌어올릴 번역을 찾을 수 없습니다",
    en: "No following translation to shift upward",
    zh: "此行下方没有可上移的译文",
  },
  "upload.pushRowsCountPlaceholder": {
    ko: "밀 row 수",
    en: "Rows to insert",
    zh: "插入行数",
  },
  "upload.pushRowsDown": {
    ko: "밀기",
    en: "Push down",
    zh: "下推",
  },
  "upload.rowStructureTargetsLabel": {
    ko: "적용 대상",
    en: "Apply to",
    zh: "应用目标",
  },
  "upload.rowStructureTargetRequired": {
    ko: "원문 또는 번역을 하나 이상 선택해 주세요",
    en: "Select source, translation, or both",
    zh: "请至少选择原文或译文中的一项",
  },
  "upload.pushRowsInvalidCount": {
    ko: "밀 row 수를 1 이상 숫자로 입력해 주세요",
    en: "Enter a row count of 1 or more",
    zh: "请输入 1 以上的行数",
  },
  "upload.splitRowAtCursor": {
    ko: "커서 뒤 분리",
    en: "Split at cursor",
    zh: "在光标处分开",
  },
  "upload.splitMarkerPlaceholder": {
    ko: "분리 기호 입력",
    en: "Split marker",
    zh: "输入分隔标记",
  },
  "upload.splitRowByMarker": {
    ko: "기호 뒤 분리",
    en: "Split after marker",
    zh: "在标记后分开",
  },
  "upload.splitMarkerNotFoundSelected": {
    ko: "선택한 항목에서 입력한 기호를 찾을 수 없습니다",
    en: "Could not find that marker in the selected targets",
    zh: "在所选项目中找不到该标记",
  },
  "upload.splitMarkerEmptyTailSelected": {
    ko: "선택한 항목에서 기호 뒤로 밀 내용이 없습니다",
    en: "There is no trailing content to move for the selected targets",
    zh: "所选项目中没有可移到后面的内容",
  },
  "upload.splitMarkerRequired": {
    ko: "분리에 사용할 기호를 입력해 주세요",
    en: "Enter a marker to split on",
    zh: "请输入用于分隔的标记",
  },
  "upload.splitMarkerNotFound": {
    ko: "입력한 기호를 이 row에서 찾을 수 없습니다",
    en: "Could not find that marker in this row",
    zh: "在此行中找不到该标记",
  },
  "upload.splitMarkerEmptyTail": {
    ko: "분리 뒤로 보낼 번역이 없습니다",
    en: "There is no trailing text to move into the next row",
    zh: "分隔后没有可移动到下一行的内容",
  },
  "upload.reanalyzeUnlockedRows": {
    ko: "잠금 제외 재분석",
    en: "Reanalyze unlocked rows",
    zh: "重新分析未锁定行",
  },
  "upload.tonePresetLabel": {
    ko: "말투 프리셋",
    en: "Tone preset",
    zh: "语气预设",
  },
  "upload.tonePresetHaoche": {
    ko: "하오체",
    en: "Hao-style",
    zh: "하오体",
  },
  "upload.tonePresetHasipsioche": {
    ko: "하십시오체",
    en: "Formal polite",
    zh: "하십시오体",
  },
  "upload.tonePresetHaeyoche": {
    ko: "해요체",
    en: "Polite casual",
    zh: "해요体",
  },
  "upload.tonePresetBanmal": {
    ko: "반말",
    en: "Casual",
    zh: "非敬语",
  },
  "upload.tonePresetLiterary": {
    ko: "문어체 서술",
    en: "Literary narration",
    zh: "书面叙述",
  },
  "upload.rewriteTone": {
    ko: "말투 맞춤",
    en: "Match tone",
    zh: "调整语气",
  },
  "upload.rewritingTone": {
    ko: "말투 맞춤 중",
    en: "Matching tone",
    zh: "调整语气中",
  },
  "upload.rewriteToneFailed": {
    ko: "이 문장 말투를 맞출 수 없습니다",
    en: "Could not match tone for this sentence",
    zh: "无法调整此句语气",
  },
  "upload.explainRow": {
    ko: "AI 설명",
    en: "AI explanation",
    zh: "AI 说明",
  },
  "upload.explainingRow": {
    ko: "설명 중",
    en: "Explaining",
    zh: "说明中",
  },
  "upload.explainRowFailed": {
    ko: "이 문장 설명을 생성할 수 없습니다",
    en: "Could not explain this sentence",
    zh: "无法生成此句说明",
  },
  "upload.draftEditorEditTab": {
    ko: "문장 편집",
    en: "Edit Text",
    zh: "编辑文本",
  },
  "upload.draftEditorConfirmTab": {
    ko: "확정본",
    en: "Confirmed",
    zh: "确认稿",
  },
  "upload.draftEditorMetaTab": {
    ko: "메모/원문",
    en: "Notes / Source",
    zh: "备注 / 原文",
  },
  "upload.draftHistoryTab": {
    ko: "저장 히스토리",
    en: "Save History",
    zh: "保存历史",
  },
  "upload.draftEditorEditHint": {
    ko: "원문과 번역을 문장 단위로 수정하고, 필요한 문장은 row 재번역이나 AI 설명으로 바로 점검하세요.",
    en: "Edit source and translation by sentence, then use row retranslation or AI explanations where needed.",
    zh: "可按句修改原文和译文，并对需要的行使用重译或 AI 说明。",
  },
  "upload.draftEditorSentenceBlocks": {
    ko: "문장별 편집",
    en: "Sentence editor",
    zh: "按句编辑",
  },
  "upload.draftEditorFullText": {
    ko: "전체 텍스트 직접 편집",
    en: "Edit full text directly",
    zh: "直接编辑全文",
  },
  "upload.draftEditorSourceEditHint": {
    ko: "원문도 필요하면 수정할 수 있습니다. 저장 시 레코드 원문에 반영됩니다.",
    en: "You can edit the source if needed. It is saved back to the record.",
    zh: "如有需要也可修改原文，保存后会写回记录。",
  },
  "upload.draftEditorUnsavedCloseConfirm": {
    ko: "저장하지 않은 편집 내용이 있습니다. 편집창을 닫고 변경사항을 버릴까요?",
    en: "There are unsaved edits. Close the editor and discard them?",
    zh: "有未保存的编辑内容。是否关闭编辑窗口并放弃更改？",
  },
  "upload.draftHistoryTitle": {
    ko: "초안 저장 히스토리",
    en: "Draft Save History",
    zh: "草稿保存历史",
  },
  "upload.draftHistoryHint": {
    ko: "초안 저장, 재번역, 확정 시점의 원문/번역 스냅샷을 확인하고 이전 버전으로 복원할 수 있습니다.",
    en: "Review source/translation snapshots from draft saves, retranslations, and confirmations, then restore an earlier version.",
    zh: "查看草稿保存、重译和确认时的原文/译文快照，并可恢复旧版本。",
  },
  "upload.draftHistoryRefresh": {
    ko: "새로고침",
    en: "Refresh",
    zh: "刷新",
  },
  "upload.draftHistoryLoading": {
    ko: "히스토리를 불러오는 중...",
    en: "Loading history...",
    zh: "正在加载历史...",
  },
  "upload.draftHistoryEmpty": {
    ko: "아직 저장된 초안 히스토리가 없습니다. 초안 저장을 누르면 이곳에 버전이 쌓입니다.",
    en: "No draft history yet. Saved drafts will appear here.",
    zh: "还没有草稿历史。保存草稿后会显示在这里。",
  },
  "upload.draftHistoryLoadFailed": {
    ko: "초안 히스토리를 불러올 수 없습니다",
    en: "Could not load draft history",
    zh: "无法加载草稿历史",
  },
  "upload.draftHistoryRestore": {
    ko: "이 버전으로 복원",
    en: "Restore this version",
    zh: "恢复此版本",
  },
  "upload.draftHistoryRestoring": {
    ko: "복원 중",
    en: "Restoring",
    zh: "正在恢复",
  },
  "upload.draftHistoryRestoreSuccess": {
    ko: "선택한 초안 버전으로 복원했습니다",
    en: "Restored the selected draft version",
    zh: "已恢复所选草稿版本",
  },
  "upload.draftHistoryRestoreFailed": {
    ko: "초안 버전을 복원할 수 없습니다",
    en: "Could not restore draft version",
    zh: "无法恢复草稿版本",
  },
  "upload.draftHistoryRestoreConfirm": {
    ko: "현재 저장된 레코드가 이 히스토리 버전으로 바뀝니다. 계속할까요?",
    en: "The saved record will be replaced with this history version. Continue?",
    zh: "当前保存的记录将被此历史版本替换。是否继续？",
  },
  "upload.draftHistoryVersion": {
    ko: "버전",
    en: "Version",
    zh: "版本",
  },
  "upload.draftHistorySourceCreate": {
    ko: "생성",
    en: "Created",
    zh: "创建",
  },
  "upload.draftHistorySourceSave": {
    ko: "저장",
    en: "Saved",
    zh: "保存",
  },
  "upload.draftHistorySourceConfirm": {
    ko: "확정",
    en: "Confirmed",
    zh: "确认",
  },
  "upload.draftHistorySourceBeforeSave": {
    ko: "저장 전",
    en: "Before save",
    zh: "保存前",
  },
  "upload.draftHistorySourceBeforeConfirm": {
    ko: "확정 전",
    en: "Before confirm",
    zh: "确认前",
  },
  "upload.draftHistorySourceBeforeRestore": {
    ko: "복원 전",
    en: "Before restore",
    zh: "恢复前",
  },
  "upload.draftVerifyTab": {
    ko: "AI 검증",
    en: "AI Review",
    zh: "AI 校验",
  },
  "upload.draftVerifyTitle": {
    ko: "초안 AI 검증",
    en: "AI Draft Review",
    zh: "草稿 AI 校验",
  },
  "upload.draftVerifyHint": {
    ko: "원문과 현재 번역 초안을 비교해 일관성, 해석 정확도, 자연스러움, 용어, 누락, 문체를 점검합니다.",
    en: "Compare the source and current draft for consistency, accuracy, naturalness, terminology, omissions, and style.",
    zh: "对比原文与当前译稿，检查一致性、准确度、自然度、术语、遗漏和文风。",
  },
  "upload.draftVerifyRun": {
    ko: "AI 검증 실행",
    en: "Run AI Review",
    zh: "执行 AI 校验",
  },
  "upload.draftVerifyRunning": {
    ko: "검증 중",
    en: "Reviewing",
    zh: "校验中",
  },
  "upload.draftVerifySaveInApp": {
    ko: "프로그램에 저장",
    en: "Save in app",
    zh: "保存到程序",
  },
  "upload.draftVerifySavingInApp": {
    ko: "리포트 저장 중",
    en: "Saving report",
    zh: "正在保存报告",
  },
  "upload.draftVerifySaveInAppSuccess": {
    ko: "검증 리포트를 프로그램에 저장했습니다",
    en: "Saved the verification report in the app",
    zh: "已将校验报告保存到程序中",
  },
  "upload.draftVerifySaveInAppFailed": {
    ko: "검증 리포트를 프로그램에 저장할 수 없습니다",
    en: "Could not save the verification report in the app",
    zh: "无法将校验报告保存到程序中",
  },
  "upload.draftVerifySavePdf": {
    ko: "PDF 저장",
    en: "Save PDF",
    zh: "保存 PDF",
  },
  "upload.draftVerifyPreparingPdf": {
    ko: "PDF 준비 중",
    en: "Preparing PDF",
    zh: "正在准备 PDF",
  },
  "upload.draftVerifySavePdfHint": {
    ko: "인쇄 창이 열리면 PDF로 저장할 수 있습니다",
    en: "Use the print dialog to save as PDF",
    zh: "打印窗口打开后可保存为 PDF",
  },
  "upload.draftVerifySavePdfFailed": {
    ko: "PDF 저장 창을 열 수 없습니다",
    en: "Could not open the PDF save dialog",
    zh: "无法打开 PDF 保存窗口",
  },
  "upload.draftVerifyEmpty": {
    ko: "초안이 완성됐다고 판단되면 AI 검증 실행을 눌러 전체 품질을 점검하세요.",
    en: "When the draft looks ready, run AI review to check overall quality.",
    zh: "草稿看起来完成后，运行 AI 校验检查整体质量。",
  },
  "upload.draftVerifyFailed": {
    ko: "초안을 검증할 수 없습니다",
    en: "Could not review the draft",
    zh: "无法校验草稿",
  },
  "upload.draftVerifyScore": {
    ko: "전체 점수",
    en: "Overall Score",
    zh: "总分",
  },
  "upload.draftVerifySummary": {
    ko: "요약 판단",
    en: "Summary",
    zh: "摘要判断",
  },
  "upload.draftVerifyModel": {
    ko: "모델:",
    en: "Model:",
    zh: "模型：",
  },
  "upload.draftVerifyVerdictLabel": {
    ko: "판정:",
    en: "Verdict:",
    zh: "判定：",
  },
  "upload.draftVerifyCategories": {
    ko: "항목별 점검",
    en: "Category Checks",
    zh: "分类检查",
  },
  "upload.draftVerifyIssues": {
    ko: "수정 필요 이슈",
    en: "Issues To Fix",
    zh: "待修正问题",
  },
  "upload.draftVerifyNoIssues": {
    ko: "AI가 명확한 수정 이슈를 찾지 못했습니다.",
    en: "AI did not find clear issues to fix.",
    zh: "AI 未发现明确需要修正的问题。",
  },
  "upload.draftVerifyStrengths": {
    ko: "잘 된 점",
    en: "Strengths",
    zh: "优点",
  },
  "upload.draftVerifySavedReports": {
    ko: "저장된 검증 리포트",
    en: "Saved verification reports",
    zh: "已保存的校验报告",
  },
  "upload.draftVerifySavedReportsEmpty": {
    ko: "아직 저장된 검증 리포트가 없습니다.",
    en: "No verification reports have been saved yet.",
    zh: "还没有保存的校验报告。",
  },
  "upload.draftVerifyReportCreatedAt": {
    ko: "저장 시각:",
    en: "Saved at:",
    zh: "保存时间：",
  },
  "upload.draftVerifyVerdictReady": {
    ko: "확정 가능",
    en: "Ready",
    zh: "可确认",
  },
  "upload.draftVerifyVerdictMinor": {
    ko: "소폭 수정 필요",
    en: "Minor Revision Needed",
    zh: "需小幅修改",
  },
  "upload.draftVerifyVerdictMajor": {
    ko: "주요 수정 필요",
    en: "Major Revision Needed",
    zh: "需重点修改",
  },
  "upload.draftVerifySeverityCritical": {
    ko: "치명",
    en: "Critical",
    zh: "严重",
  },
  "upload.draftVerifySeverityMajor": {
    ko: "주요",
    en: "Major",
    zh: "主要",
  },
  "upload.draftVerifySeverityMinor": {
    ko: "경미",
    en: "Minor",
    zh: "轻微",
  },
  "upload.draftVerifySeveritySuggestion": {
    ko: "제안",
    en: "Suggestion",
    zh: "建议",
  },
  "upload.datasetQualityTitle": {
    ko: "데이터셋 점검 필요",
    en: "Dataset needs review",
    zh: "数据集需要检查",
  },
  "upload.datasetQualityTitleIssues": {
    ko: "제목 보정 필요",
    en: "Title issues",
    zh: "标题待修正",
  },
  "upload.datasetQualityMissingSource": {
    ko: "원문 누락",
    en: "Missing source",
    zh: "缺少原文",
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
  "upload.mappingDirection": {
    ko: "화수 매칭 기준",
    en: "Chapter Matching Direction",
    zh: "章节匹配方向",
  },
  "upload.mappingDirectionZhToKo": {
    ko: "중국어 화수 기준 -> 한국어 화수 매칭",
    en: "Match from Chinese chapter to Korean chapter",
    zh: "以中文章节匹配韩文章节",
  },
  "upload.mappingDirectionKoToZh": {
    ko: "한국어 화수 기준 -> 중국어 화수 매칭",
    en: "Match from Korean chapter to Chinese chapter",
    zh: "以韩文章节匹配中文章节",
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
  "upload.status": {
    ko: "상태",
    en: "Status",
    zh: "状态",
  },
  "upload.sourceZhFetched": {
    ko: "원문 수집 완료",
    en: "Source fetched",
    zh: "原文已获取",
  },
  "upload.sourceZhNotFetched": {
    ko: "원문 미수집",
    en: "Source not fetched",
    zh: "原文未获取",
  },
  "upload.createdCount": {
    ko: "개별 저장 화수",
    en: "Individually saved chapters",
    zh: "已分别保存章节数",
  },
  "upload.statusAdded": {
    ko: "업로드 완료",
    en: "Upload completed",
    zh: "上传完成",
  },
  "upload.statusAddedMulti": {
    ko: "분할 업로드 완료",
    en: "Split upload completed",
    zh: "分章上传完成",
  },
  "upload.statusConflictPending": {
    ko: "충돌 검토 필요",
    en: "Conflict review needed",
    zh: "需要检查冲突",
  },
  "upload.statusAlignmentReviewNeeded": {
    ko: "회차 정렬 검토 필요",
    en: "Chapter alignment review needed",
    zh: "需要检查章节对齐",
  },
  "upload.resultCreatedHint": {
    ko: "새 레코드가 데이터셋에 추가되었습니다.",
    en: "New rows were added to the dataset.",
    zh: "新记录已添加到数据集。",
  },
  "upload.resultMergedHint": {
    ko: "같은 작품/원문 화수의 기존 레코드를 보강했습니다. 그래서 총 행 수는 그대로일 수 있습니다.",
    en: "An existing row for the same book/source chapter was enriched, so the total row count may stay the same.",
    zh: "已补强同作品/原文章节的现有记录，因此总行数可能不变。",
  },
  "upload.resultConflictHint": {
    ko: "같은 작품/원문 화수에서 기존 값과 충돌이 있어 사용자의 선택이 필요합니다.",
    en: "An existing value conflicts with the uploaded one for the same book/source chapter, so user review is required.",
    zh: "同作品/原文章节的现有值与上传值冲突，需要用户决定。",
  },
  "upload.resultAlignmentReviewHint": {
    ko: "원문 기준 회차 정렬 결과 중 신뢰도가 낮은 구간이 있어 적용 전 검토가 필요합니다.",
    en: "Some source-chapter alignment results are low confidence and should be reviewed before applying.",
    zh: "部分按原文章节对齐的结果置信度较低，应用前需要人工检查。",
  },
  "upload.sourceZhPartial": {
    ko: "원문 일부 수집",
    en: "Source partially fetched",
    zh: "原文部分获取",
  },
  "upload.sourceZhMetadataOnly": {
    ko: "원문 메타데이터만 지원",
    en: "Metadata-only source supported",
    zh: "仅支持原文元数据",
  },
  "upload.promoteCandidates": {
    ko: "후보 용어를 사전에 추가",
    en: "Add candidate terms to glossary",
    zh: "将候选术语添加到词典",
  },
  "upload.promotedResult": {
    ko: "사전에 추가됨",
    en: "Added to glossary",
    zh: "已添加到词典",
  },
  "upload.meaningRefreshResult": {
    ko: "뜻 보정",
    en: "Meaning refresh",
    zh: "释义补全",
  },
  "upload.autoPromote": {
    ko: "자동 사전 반영",
    en: "Auto-promote to glossary",
    zh: "自动写入词典",
  },
  "upload.twoStepHint": {
    ko: "기준 단위는 원문 화수입니다. 권장 순서: 1) 중국어 원문 업로드 2) 같은 중국어 화수로 한국어 번역 업로드 3) 충돌이 나면 직접 선택 후 확정",
    en: "The base unit is the source chapter. Recommended: 1) Upload Chinese source 2) Upload Korean translation with the same Chinese chapter 3) Resolve conflicts before confirming",
    zh: "基准单位是原文章节。推荐顺序：1）上传中文原文 2）按相同中文回次上传韩文译文 3）出现冲突时手动选择后再确认",
  },
  "upload.chapterZhRequired": {
    ko: "중국어 회차(chapter_zh)는 항상 입력해야 합니다.",
    en: "Chinese chapter (chapter_zh) is always required.",
    zh: "中文回次(chapter_zh)为必填项。",
  },
  "upload.upsertedCount": {
    ko: "기존 회차 병합",
    en: "Merged into existing chapters",
    zh: "合并到已有回次",
  },
  "upload.mergedFieldsCount": {
    ko: "채워진 필드 수",
    en: "Filled fields count",
    zh: "已填充字段数",
  },
  "upload.conflictCount": {
    ko: "충돌 필드 수",
    en: "Conflicting fields",
    zh: "冲突字段数",
  },
  "upload.alignmentAppliedCount": {
    ko: "자동 재정렬 적용",
    en: "Auto-applied resegmented chapters",
    zh: "已自动应用的重分段章节",
  },
  "upload.alignmentReviewCount": {
    ko: "정렬 검토 대기",
    en: "Alignment reviews pending",
    zh: "待检查的对齐项",
  },
  "upload.conflictReviewTitle": {
    ko: "업로드 충돌 검토",
    en: "Review Upload Conflicts",
    zh: "检查上传冲突",
  },
  "upload.conflictReviewSubtitle": {
    ko: "기존 데이터와 다른 값이 감지되어 우선 기존 값을 유지했습니다. 각 항목마다 유지/덮어쓰기를 선택하세요.",
    en: "Different values were detected, so the existing dataset was kept first. Choose whether to keep or overwrite each field.",
    zh: "检测到与现有数据不同的值，因此当前先保留现有数据。请为每个字段选择保留或覆盖。",
  },
  "upload.conflictExisting": {
    ko: "기존 데이터",
    en: "Existing dataset",
    zh: "现有数据",
  },
  "upload.conflictIncoming": {
    ko: "이번 업로드",
    en: "Current upload",
    zh: "本次上传",
  },
  "upload.conflictKeepExisting": {
    ko: "기존 유지",
    en: "Keep existing",
    zh: "保留现有值",
  },
  "upload.conflictOverwriteIncoming": {
    ko: "업로드본으로 덮어쓰기",
    en: "Overwrite with upload",
    zh: "用上传内容覆盖",
  },
  "upload.conflictResolvedKeep": {
    ko: "충돌 항목을 기존 값 유지로 처리했습니다",
    en: "Conflict resolved by keeping the existing value",
    zh: "已按保留现有值处理冲突",
  },
  "upload.conflictResolvedOverwrite": {
    ko: "충돌 항목을 업로드본으로 덮어썼습니다",
    en: "Conflict resolved by overwriting with the uploaded value",
    zh: "已用上传内容覆盖冲突字段",
  },
  "upload.conflictResolveError": {
    ko: "충돌 항목을 처리할 수 없습니다",
    en: "Could not resolve the conflict",
    zh: "无法处理冲突项",
  },
  "upload.alignmentReviewTitle": {
    ko: "원문 기준 회차 정렬 검토",
    en: "Review Source-Chapter Alignment",
    zh: "检查按原文章节对齐结果",
  },
  "upload.alignmentReviewSubtitle": {
    ko: "번역본을 원문 화수 기준으로 다시 자른 결과입니다. 신뢰도가 낮은 항목은 자동 적용하지 않았으니 유지/적용을 선택하세요.",
    en: "These are resegmented translation candidates aligned to source chapter boundaries. Low-confidence rows were not auto-applied, so choose whether to keep or apply them.",
    zh: "这些是按原文章节边界重新切分的译文候选。低置信度项未自动应用，请选择保留或应用。",
  },
  "upload.alignmentQueueBookFilter": {
    ko: "검토 책 필터",
    en: "Book filter",
    zh: "作品筛选",
  },
  "upload.alignmentQueueBatchFilter": {
    ko: "정렬 배치 필터",
    en: "Alignment batch filter",
    zh: "对齐批次筛选",
  },
  "upload.alignmentQueueAllBooks": {
    ko: "모든 책",
    en: "All books",
    zh: "全部作品",
  },
  "upload.alignmentQueueAllBatches": {
    ko: "모든 배치",
    en: "All batches",
    zh: "全部批次",
  },
  "upload.alignmentQueuePrevious": {
    ko: "이전 검토",
    en: "Previous review",
    zh: "上一项",
  },
  "upload.alignmentQueueNext": {
    ko: "다음 검토",
    en: "Next review",
    zh: "下一项",
  },
  "upload.alignmentQueueOpenDetail": {
    ko: "상세 검토 열기",
    en: "Open detailed review",
    zh: "打开详细检查",
  },
  "upload.alignmentQueuePendingList": {
    ko: "대기 중인 검토 목록",
    en: "Pending review list",
    zh: "待处理检查列表",
  },
  "upload.alignmentQueueEmptyFilter": {
    ko: "현재 필터에 맞는 정렬 검토 항목이 없습니다.",
    en: "No alignment reviews match the current filter.",
    zh: "当前筛选条件下没有对齐检查项。",
  },
  "upload.alignmentQueueBatch": {
    ko: "배치",
    en: "Batch",
    zh: "批次",
  },
  "upload.alignmentPreview": {
    ko: "시작/끝 비교",
    en: "Compare boundaries",
    zh: "比较起止边界",
  },
  "upload.alignmentPreviewTitle": {
    ko: "원문 기준 회차 경계 비교",
    en: "Source-Chapter Boundary Comparison",
    zh: "原文章节边界对比",
  },
  "upload.alignmentPreviewSubtitle": {
    ko: "원문 시작/끝과 현재 번역, 정렬 제안본의 시작/끝을 나란히 비교해 경계가 맞는지 확인하세요.",
    en: "Compare the source start/end against the current and proposed translation boundaries before applying.",
    zh: "请并排比较原文起止与当前译文、对齐候选译文的起止边界，再决定是否应用。",
  },
  "upload.alignmentPreviewLoading": {
    ko: "정렬 비교용 원문을 불러오는 중...",
    en: "Loading source text for alignment preview...",
    zh: "正在加载对齐比较所需原文...",
  },
  "upload.alignmentPreviewLoadError": {
    ko: "정렬 비교용 레코드를 불러올 수 없습니다",
    en: "Could not load the record for alignment preview",
    zh: "无法加载对齐比较所需记录",
  },
  "upload.alignmentSaveProposal": {
    ko: "제안 저장",
    en: "Save proposal",
    zh: "保存候选译文",
  },
  "upload.alignmentResetDraft": {
    ko: "저장본으로 되돌리기",
    en: "Reset to saved proposal",
    zh: "恢复为已保存候选",
  },
  "upload.alignmentManualAdjustTitle": {
    ko: "수동 경계 조정",
    en: "Manual boundary adjustment",
    zh: "手动边界调整",
  },
  "upload.alignmentManualAdjustSubtitle": {
    ko: "앞뒤 화와 한 단락씩 주고받아 경계를 미세 조정할 수 있습니다.",
    en: "Move one paragraph at a time to or from adjacent chapters to fine-tune the boundary.",
    zh: "可以与前后章节逐段交换内容，微调边界。",
  },
  "upload.alignmentSendStartToPrev": {
    ko: "현재 시작 단락을 이전 화로 보내기",
    en: "Send current opening to previous chapter",
    zh: "将当前开头段落发送到上一章",
  },
  "upload.alignmentSendEndToNext": {
    ko: "현재 끝 단락을 다음 화로 보내기",
    en: "Send current ending to next chapter",
    zh: "将当前结尾段落发送到下一章",
  },
  "upload.alignmentPullFromPrev": {
    ko: "이전 화 끝 단락 가져오기",
    en: "Pull previous ending into current chapter",
    zh: "将上一章结尾段落拉到当前章节",
  },
  "upload.alignmentPullFromNext": {
    ko: "다음 화 시작 단락 가져오기",
    en: "Pull next opening into current chapter",
    zh: "将下一章开头段落拉到当前章节",
  },
  "upload.alignmentAdjusting": {
    ko: "경계를 조정하는 중...",
    en: "Adjusting chapter boundary...",
    zh: "正在调整章节边界...",
  },
  "upload.alignmentBoundaryAdjusted": {
    ko: "정렬 경계를 업데이트했습니다",
    en: "Alignment boundary updated",
    zh: "已更新对齐边界",
  },
  "upload.alignmentBoundaryAdjustError": {
    ko: "정렬 경계를 조정할 수 없습니다",
    en: "Could not adjust the alignment boundary",
    zh: "无法调整对齐边界",
  },
  "upload.alignmentBoundarySource": {
    ko: "원문 경계",
    en: "Source boundary",
    zh: "原文边界",
  },
  "upload.alignmentBoundaryCurrent": {
    ko: "현재 번역 경계",
    en: "Current translation boundary",
    zh: "当前译文边界",
  },
  "upload.alignmentBoundaryProposed": {
    ko: "정렬 제안 경계",
    en: "Aligned proposal boundary",
    zh: "对齐候选边界",
  },
  "upload.alignmentBoundaryStart": {
    ko: "시작부",
    en: "Start",
    zh: "开头",
  },
  "upload.alignmentBoundaryEnd": {
    ko: "끝부분",
    en: "End",
    zh: "结尾",
  },
  "upload.alignmentBoundaryChanges": {
    ko: "경계 차이 요약",
    en: "Boundary change summary",
    zh: "边界差异摘要",
  },
  "upload.alignmentOnlyInCurrent": {
    ko: "현재 번역에만 있음",
    en: "Only in current translation",
    zh: "仅存在于当前译文",
  },
  "upload.alignmentOnlyInProposal": {
    ko: "정렬 제안에만 있음",
    en: "Only in aligned proposal",
    zh: "仅存在于对齐候选",
  },
  "upload.alignmentNoBoundaryDifference": {
    ko: "현재 번역과 정렬 제안의 경계 차이가 없습니다.",
    en: "No boundary difference detected between the current translation and aligned proposal.",
    zh: "当前译文与对齐候选之间未检测到边界差异。",
  },
  "upload.alignmentExisting": {
    ko: "현재 번역",
    en: "Current translation",
    zh: "当前译文",
  },
  "upload.alignmentProposed": {
    ko: "정렬 제안본",
    en: "Aligned proposal",
    zh: "对齐后候选译文",
  },
  "upload.alignmentApply": {
    ko: "정렬 제안 적용",
    en: "Apply aligned proposal",
    zh: "应用对齐候选",
  },
  "upload.alignmentKeepExisting": {
    ko: "현재 번역 유지",
    en: "Keep current translation",
    zh: "保留当前译文",
  },
  "upload.alignmentConfidence": {
    ko: "신뢰도",
    en: "Confidence",
    zh: "置信度",
  },
  "upload.alignmentStartReason": {
    ko: "시작 경계 근거",
    en: "Start boundary reason",
    zh: "起始边界依据",
  },
  "upload.alignmentEndReason": {
    ko: "종료 경계 근거",
    en: "End boundary reason",
    zh: "结束边界依据",
  },
  "upload.alignmentResolvedKeep": {
    ko: "정렬 검토 항목을 현재 번역 유지로 처리했습니다",
    en: "Alignment review resolved by keeping the current translation",
    zh: "已按保留当前译文处理对齐检查项",
  },
  "upload.alignmentResolvedApply": {
    ko: "정렬 제안본을 데이터셋에 반영했습니다",
    en: "The aligned proposal was applied to the dataset",
    zh: "已将对齐候选应用到数据集",
  },
  "upload.alignmentResolveError": {
    ko: "정렬 검토 항목을 처리할 수 없습니다",
    en: "Could not resolve the alignment review",
    zh: "无法处理对齐检查项",
  },
  "upload.alignmentQueueLoadError": {
    ko: "정렬 검토 큐를 불러올 수 없습니다",
    en: "Could not load the alignment review queue",
    zh: "无法加载对齐检查队列",
  },
  "upload.alignmentWarningEmptySegment": {
    ko: "잘린 번역 구간이 비어 있습니다",
    en: "The proposed translated segment is empty",
    zh: "切分后的译文片段为空",
  },
  "upload.alignmentWarningLeadingOverflow": {
    ko: "현재 화 앞부분에 이전 화 내용이 섞여 있습니다",
    en: "Previous-chapter content still appears before this chapter",
    zh: "本章前面仍混有上一章内容",
  },
  "upload.alignmentWarningPoolExhaustedEarly": {
    ko: "다음 화로 넘길 번역 풀이 너무 빨리 소진되었습니다",
    en: "The remaining translation pool ran out too early",
    zh: "留给后续章节的译文过早耗尽",
  },
  "upload.alignmentWarningTrailingOverflow": {
    ko: "현재 화 뒤에 다음 화 내용이 남아 있습니다",
    en: "Trailing content remains after this chapter",
    zh: "本章后面仍残留下一章内容",
  },
  "upload.alignmentWarningInsufficientProgress": {
    ko: "이번 화에서 번역 풀이 거의 줄지 않았습니다",
    en: "This chapter consumed too little of the translation pool",
    zh: "本章消耗的译文池过少",
  },
  "upload.alignmentWarningSegmentTooShort": {
    ko: "잘린 번역 구간이 비정상적으로 짧습니다",
    en: "The proposed segment is unusually short",
    zh: "切分后的片段异常短",
  },
  "upload.alignmentWarningUnchanged": {
    ko: "현재 번역과 제안본이 동일합니다",
    en: "The current translation already matches the proposal",
    zh: "当前译文与候选结果相同",
  },
  "upload.conflictFieldZhText": {
    ko: "중국어 원문",
    en: "Chinese source",
    zh: "中文原文",
  },
  "upload.conflictFieldKoText": {
    ko: "한국어 번역",
    en: "Korean translation",
    zh: "韩文译文",
  },
  "upload.extractCandidates": {
    ko: "이 레코드에서 용어 추출",
    en: "Extract terms from this record",
    zh: "从该记录提取术语",
  },
  "upload.reextractChapterTerms": {
    ko: "이 화 용어 다시 추출",
    en: "Re-extract chapter terms",
    zh: "重新提取本话术语",
  },
  "upload.extractResult": {
    ko: "용어 추출 결과",
    en: "Extraction result",
    zh: "术语提取结果",
  },
  "upload.saveRecord": {
    ko: "레코드 저장",
    en: "Save record",
    zh: "保存记录",
  },
  "upload.saveDraft": {
    ko: "초안 저장",
    en: "Save Draft",
    zh: "保存草稿",
  },
  "upload.confirmRecord": {
    ko: "확정",
    en: "Confirm",
    zh: "确认",
  },
  "upload.confirmedText": {
    ko: "확정 번역문",
    en: "Confirmed Translation",
    zh: "确认译文",
  },
  "upload.reviewNote": {
    ko: "검토 메모",
    en: "Review Note",
    zh: "审校备注",
  },
  "upload.reviewNotePlaceholder": {
    ko: "검토 메모나 수정 이유를 입력하세요",
    en: "Leave review notes or reasons for changes",
    zh: "填写审校备注或修改原因",
  },
  "upload.exportRecord": {
    ko: "단건 내보내기",
    en: "Export Record",
    zh: "导出记录",
  },
  "upload.exportAllConfirmed": {
    ko: "확정본 전체 내보내기",
    en: "Export All Confirmed",
    zh: "导出全部已确认",
  },
  "upload.exportSuccess": {
    ko: "내보내기를 시작했습니다",
    en: "Export started",
    zh: "已开始导出",
  },
  "upload.exportConfirmedOnly": {
    ko: "확정된 번역만 내보낼 수 있습니다. 먼저 Confirm 하세요.",
    en: "Only confirmed translations can be exported. Confirm the record first.",
    zh: "只能导出已确认的译文。请先确认该记录。",
  },
  "upload.exportFormatJson": {
    ko: "JSON",
    en: "JSON",
    zh: "JSON",
  },
  "upload.exportFormatJsonl": {
    ko: "JSONL",
    en: "JSONL",
    zh: "JSONL",
  },
  "upload.exportFormatTxt": {
    ko: "TXT",
    en: "TXT",
    zh: "TXT",
  },
  "upload.confirmSuccess": {
    ko: "번역문을 확정했습니다",
    en: "Translation confirmed",
    zh: "译文已确认",
  },
  "upload.saveSuccess": {
    ko: "초안을 저장했습니다",
    en: "Draft saved",
    zh: "草稿已保存",
  },
  "upload.editBookTitle": {
    ko: "제목 수정",
    en: "Edit title",
    zh: "编辑标题",
  },
  "upload.saveBookTitle": {
    ko: "제목 저장",
    en: "Save title",
    zh: "保存标题",
  },
  "upload.bookTitleEditHint": {
    ko: "같은 작품에 속한 모든 회차의 한국어 제목/원문 제목을 함께 수정합니다.",
    en: "Updates the Korean and source titles for every chapter in this book.",
    zh: "会同时更新该作品所有章节的韩文标题和中文原题。",
  },
  "upload.bookTitleRequired": {
    ko: "한국어 제목 또는 원문 제목 중 하나는 입력해야 합니다",
    en: "Enter at least one Korean or source title",
    zh: "韩文标题或中文原题至少填写一个",
  },
  "upload.bookTitleUpdateSuccess": {
    ko: "작품 제목을 수정했습니다:",
    en: "Updated book title:",
    zh: "已更新作品标题：",
  },
  "upload.bookTitleUpdateError": {
    ko: "작품 제목을 수정할 수 없습니다",
    en: "Could not update book title",
    zh: "无法更新作品标题",
  },
  "upload.cancel": {
    ko: "취소",
    en: "Cancel",
    zh: "取消",
  },
  "upload.jobsLoadError": {
    ko: "업로드 작업 목록을 불러올 수 없습니다",
    en: "Could not load upload jobs",
    zh: "无法加载上传任务",
  },
  "upload.datasetsLoadError": {
    ko: "데이터셋 목록을 불러올 수 없습니다",
    en: "Could not load dataset records",
    zh: "无法加载数据集记录",
  },
  "upload.deleteRecord": {
    ko: "레코드 삭제",
    en: "Delete record",
    zh: "删除记录",
  },
  "upload.showOptionalFields": {
    ko: "비필수 필드 펼치기",
    en: "Show optional fields",
    zh: "展开非必填字段",
  },
  "upload.hideOptionalFields": {
    ko: "비필수 필드 접기",
    en: "Hide optional fields",
    zh: "收起非必填字段",
  },
  "upload.bulkExtract": {
    ko: "선택 회차 용어 다시 추출",
    en: "Re-extract terms for selected chapters",
    zh: "重新提取所选章节术语",
  },
  "upload.bulkRetranslate": {
    ko: "선택 회차 다시 번역",
    en: "Retranslate selected chapters",
    zh: "重新翻译所选章节",
  },
  "upload.retranslateChapter": {
    ko: "이 화 전체 다시 번역",
    en: "Retranslate this chapter",
    zh: "重新翻译本章",
  },
  "upload.translateChapter": {
    ko: "이 화 전체 번역",
    en: "Translate this chapter",
    zh: "翻译本章",
  },
  "upload.translateShort": {
    ko: "번역",
    en: "Translate",
    zh: "翻译",
  },
  "upload.retranslateShort": {
    ko: "재번역",
    en: "Retranslate",
    zh: "重译",
  },
  "upload.sourceMissingShort": {
    ko: "원문 없음",
    en: "No source",
    zh: "无原文",
  },
  "upload.retranslating": {
    ko: "재번역 중",
    en: "Retranslating",
    zh: "正在重译",
  },
  "upload.translatingChapter": {
    ko: "번역 중",
    en: "Translating",
    zh: "翻译中",
  },
  "upload.retranslateSuccess": {
    ko: "재번역 초안을 저장했습니다",
    en: "Saved the retranslated draft",
    zh: "已保存重译草稿",
  },
  "upload.retranslatePartialSuccess": {
    ko: "재번역을 저장했습니다. 원문이 없어 건너뛴 회차:",
    en: "Saved retranslations. Skipped chapters without source:",
    zh: "已保存重译结果。因无原文而跳过的章节：",
  },
  "upload.retranslateMissingSource": {
    ko: "재번역할 중국어 원문이 없습니다.",
    en: "There is no Chinese source text to retranslate.",
    zh: "没有可重译的中文原文。",
  },
  "upload.translateNeedsSource": {
    ko: "중국어 원문이 없어 번역할 수 없습니다. 먼저 원문을 업로드하거나 스크랩해 주세요.",
    en: "This chapter cannot be translated because the Chinese source text is missing. Upload or scrape the source first.",
    zh: "由于缺少中文原文，无法翻译本章。请先上传或抓取原文。",
  },
  "upload.selectedMissingSourceHint": {
    ko: "원문 없는 선택 회차:",
    en: "Selected chapters without source:",
    zh: "所选章节缺少原文：",
  },
  "upload.retranslateEmptyResult": {
    ko: "번역 결과가 비어 있습니다.",
    en: "The translation result is empty.",
    zh: "翻译结果为空。",
  },
  "upload.retranslateFailed": {
    ko: "재번역 실패",
    en: "Retranslation failed",
    zh: "重译失败",
  },
  "upload.actions": {
    ko: "작업",
    en: "Actions",
    zh: "操作",
  },
  "upload.openPreview": {
    ko: "미리보기 열기",
    en: "Open preview",
    zh: "打开预览",
  },
  "upload.bulkDelete": {
    ko: "선택 항목 삭제",
    en: "Delete selected",
    zh: "删除所选项",
  },
  "upload.clearSelection": {
    ko: "선택 해제",
    en: "Clear selection",
    zh: "清除选择",
  },
  "upload.selectedCount": {
    ko: "선택됨",
    en: "selected",
    zh: "已选择",
  },
  "upload.confirmDeleteRecord": {
    ko: "정말 이 레코드를 삭제할까요?",
    en: "Delete this record?",
    zh: "确定要删除这条记录吗？",
  },
  "upload.confirmDeleteSelected": {
    ko: "선택한 레코드를 삭제할까요?",
    en: "Delete selected records?",
    zh: "确定要删除所选记录吗？",
  },
  "upload.filesSelected": {
    ko: "개 파일 선택됨",
    en: "files selected",
    zh: "个文件已选择",
  },
  "upload.recentJobs": {
    ko: "최근 업로드 작업",
    en: "Recent upload jobs",
    zh: "最近上传任务",
  },
  "upload.autoRefresh": {
    ko: "자동 갱신",
    en: "Auto refresh",
    zh: "自动刷新",
  },
  "upload.recentlyUpdated": {
    ko: "방금 반영",
    en: "Recently updated",
    zh: "刚刚更新",
  },
  "upload.recentlyUpdatedRecords": {
    ko: "건 반영됨",
    en: " rows updated",
    zh: "条已更新",
  },
  "upload.resegmentKoByZh": {
    ko: "중국어 회차 기준으로 한국어 재분할 정렬",
    en: "Resegment Korean by Chinese chapter boundaries",
    zh: "按中文回次边界重新切分韩文",
  },
  "upload.resegmentKoByZhHint": {
    ko: "특히 한국어를 먼저 업로드한 뒤 중국어를 올릴 때, 중국어 기준으로 한국어를 다시 통합/분할합니다.",
    en: "Useful when Korean is uploaded first; after Chinese upload, Korean is re-merged and split by Chinese boundaries.",
    zh: "适用于先上传韩文再上传中文的场景；会按中文边界重新合并/切分韩文。",
  },

  // ----- Health Check -----
  "health.disconnected": {
    ko: "백엔드 서버에 연결할 수 없습니다",
    en: "Cannot connect to backend server",
    zh: "无法连接后端服务器",
  },
  "health.disconnectedDesc": {
    ko: "FastAPI 서버가 실행 중인지 확인하세요",
    en: "Make sure the FastAPI server is running",
    zh: "请确认FastAPI服务器是否正在运行",
  },
  "health.warning": {
    ko: "백엔드 구성 확인 필요",
    en: "Backend configuration check needed",
    zh: "需要检查后端配置",
  },
  "health.issueApiKey": {
    ko: "API 키 없음",
    en: "API key missing",
    zh: "缺少 API 密钥",
  },
  "health.issueSupabaseConfig": {
    ko: "Supabase 설정 없음",
    en: "Supabase not configured",
    zh: "Supabase 未配置",
  },
  "health.issueSupabaseConnection": {
    ko: "Supabase 연결 실패",
    en: "Supabase unreachable",
    zh: "Supabase 连接失败",
  },
  "health.issueGlossary": {
    ko: "용어 사전 없음",
    en: "Glossary missing",
    zh: "术语词典缺失",
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
