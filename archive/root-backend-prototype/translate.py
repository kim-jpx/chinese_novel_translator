"""
Translate router - 번역 에이전트 (Claude API)
- 문화적 배경 판단 (동북공정 민감 항목 포함)
- 주석 자동 생성 (한자어, 사자성어, 시/시구, 문화 용어)
- 판단 불가 시 사용자에게 위임
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import json
import os
from pathlib import Path
import anthropic

router = APIRouter()

GLOSSARY_PATH = Path(os.getenv("GLOSSARY_PATH", "../../glossary.json"))
STYLE_GUIDE_PATH = Path(os.getenv("STYLE_GUIDE_PATH", "../../style_guide_v1.md"))
DATASET_PATH = Path(os.getenv("DATASET_PATH", "../../dataset_multinovel.jsonl"))


class TranslateRequest(BaseModel):
    text: str
    book: Optional[str] = None
    genre: Optional[List[str]] = []
    era_profile: str = "ancient"
    prev_chapter_id: Optional[str] = None
    with_annotations: bool = True   # 주석 생성 여부
    with_cultural_check: bool = True # 문화 판단 여부


class Annotation(BaseModel):
    term: str              # 원문 표현
    type: str              # "한자어" / "사자성어" / "시/시구" / "문화용어" / "지명"
    explanation: str       # 주석 설명
    keep_original: bool    # 원문 표현 그대로 쓰는 경우 True


class CulturalFlag(BaseModel):
    term: str              # 문제 표현
    issue: str             # 판단 이유 (동북공정 관련 등)
    ai_decision: str       # AI 판단 결과 ("유지" / "변경" / "사용자 판단 필요")
    ai_reasoning: str      # 짧은 근거
    suggested: str         # 제안 번역 (있을 경우)
    user_action_needed: bool  # True면 사용자 판단 필요


class TranslateResponse(BaseModel):
    translated: str
    terms_used: List[str]
    annotations: List[Annotation]
    cultural_flags: List[CulturalFlag]
    model: str


def load_glossary_filtered(book: Optional[str] = None) -> str:
    if not GLOSSARY_PATH.exists():
        return "용어사전 없음"
    terms = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
    if book:
        terms = [t for t in terms if not t.get("domain") or
                 t.get("domain") == book or t.get("book") == book]
    lines = ["| 중국어 | 한국어 | 품사 | 정책 | 비고 |",
             "|--------|--------|------|------|------|"]
    for t in terms[:80]:
        lines.append(f"| {t.get('term_zh','')} | {t.get('term_ko','')} | "
                     f"{t.get('pos','')} | {t.get('policy','')} | {t.get('notes','')} |")
    return "\n".join(lines)


def load_style_guide_filtered() -> str:
    if not STYLE_GUIDE_PATH.exists():
        return "스타일 가이드 없음"
    return STYLE_GUIDE_PATH.read_text(encoding="utf-8")[:3000]


def load_prev_chapter_sample(chapter_id: str) -> str:
    if not DATASET_PATH.exists() or not chapter_id:
        return ""
    for line in DATASET_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("id") == chapter_id:
            ko = r.get("ko_text", "")
            return ko[:800] + "..." if len(ko) > 800 else ko
    return ""


def build_system_prompt(era_profile, genre, glossary_text, style_guide_text,
                        prev_sample, with_annotations, with_cultural_check) -> str:
    genre_str = "/".join(genre) if genre else "고장극"
    prev_section = f"\n## 이전 화 번역 스타일 참고\n{prev_sample}" if prev_sample else ""

    annotation_instruction = ""
    if with_annotations:
        annotation_instruction = """
## 주석 생성 규칙
번역 후 반드시 아래 JSON 배열을 포함하세요:

```annotations
[
  {
    "term": "원문 표현",
    "type": "한자어|사자성어|시/시구|문화용어|지명",
    "explanation": "간결한 설명 (1~2줄)",
    "keep_original": true/false
  }
]
```

주석 대상:
- **한자어**: 당옥(堂屋), 진왕부 등 원문 그대로 쓰는 게 나은 경우
- **사자성어**: 뜻과 맥락 설명
- **시/시구**: 출처와 의미
- **문화용어**: 중국 고유 풍습/제도 (음식, 의복, 예법 등)
- **지명**: 역사적 맥락 있는 지명
"""

    cultural_instruction = ""
    if with_cultural_check:
        cultural_instruction = """
## 문화적 배경 판단 규칙 (중요)
번역 후 반드시 아래 JSON 배열을 포함하세요:

```cultural_flags
[
  {
    "term": "문제 표현",
    "issue": "판단 이유",
    "ai_decision": "유지|변경|사용자 판단 필요",
    "ai_reasoning": "근거 (1~2줄)",
    "suggested": "대안 번역 (있을 경우)",
    "user_action_needed": true/false
  }
]
```

판단 기준:
- **동북공정 민감 항목**: 중국 문화를 한국 전통문화로 치환하지 않는다.
  예) 炕(온돌 아님 → 캉/침상), 만두(중국식 만두 ≠ 한국식 만두)
- **표현이 애매한 경우**: `user_action_needed: true`로 설정하고 판단 위임
- **명확히 중립적인 경우**: 빈 배열 [] 반환 가능
- **판단 근거를 항상 한 줄로 서술** (근거 없는 판단 금지)
"""

    return f"""당신은 중국 {genre_str} 소설 전문 번역가입니다.

## 번역 원칙
1. 의미 보존 우선. 사건/관계/권력구조 정보 누락 금지.
2. 아래 [용어사전]에 있는 용어는 반드시 지정된 한국어 번역어 사용.
3. 아래 [스타일 가이드]의 장르 규칙을 따름.
4. 과도한 한문투 남발 금지. 읽히는 자연스러운 한국어 우선.
5. 대사 따옴표는 큰따옴표("") 사용.

## 시대 배경: {era_profile}
- ancient: 공자/낭자/전하/은량/이랑 등 고풍 용어 사용
- mixed: 고풍 서사 + 현대식 은유 병행 (한 문단 내 과도 혼합 금지)
- modern: 현대 기준 언어 유지
- unknown: 원문 문체와 내용을 분석하여 가장 적합한 시대배경을 스스로 판단하고 그에 맞게 번역

## 장르: {genre_str}

## 용어사전
{glossary_text}

## 스타일 가이드
{style_guide_text}
{prev_section}

{annotation_instruction}
{cultural_instruction}

---
출력 형식:
1. 번역문 (일반 텍스트)
2. ```annotations [...] ``` 블록 (주석 요청 시)
3. ```cultural_flags [...] ``` 블록 (문화 판단 요청 시)

번역문 외 불필요한 설명은 하지 마세요."""


def parse_json_block(text: str, tag: str) -> list:
    """응답에서 ```tag [...] ``` 블록 파싱"""
    pattern = f"```{tag}\\s*(.*?)\\s*```"
    import re
    m = re.search(pattern, text, re.S)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except Exception:
        return []


def strip_json_blocks(text: str) -> str:
    """번역문에서 JSON 블록 제거"""
    import re
    text = re.sub(r'```(?:annotations|cultural_flags).*?```', '', text, flags=re.S)
    return text.strip()


@router.post("/", response_model=TranslateResponse)
async def translate(req: TranslateRequest):
    """중국어 원문 → 한국어 번역 (문화 판단 + 주석 포함)"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")

    glossary_text = load_glossary_filtered(req.book)
    style_guide_text = load_style_guide_filtered()
    prev_sample = load_prev_chapter_sample(req.prev_chapter_id or "")

    system_prompt = build_system_prompt(
        era_profile=req.era_profile,
        genre=req.genre or [],
        glossary_text=glossary_text,
        style_guide_text=style_guide_text,
        prev_sample=prev_sample,
        with_annotations=req.with_annotations,
        with_cultural_check=req.with_cultural_check,
    )

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": f"다음 원문을 번역하세요:\n\n{req.text}"}]
    )

    raw = message.content[0].text

    # 파싱
    annotations_raw = parse_json_block(raw, "annotations")
    cultural_flags_raw = parse_json_block(raw, "cultural_flags")
    translated = strip_json_blocks(raw)

    # 사용된 용어
    terms = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8")) if GLOSSARY_PATH.exists() else []
    terms_used = [t["term_zh"] for t in terms if t["term_zh"] in req.text]

    # 모델 검증
    annotations = []
    for a in annotations_raw:
        try:
            annotations.append(Annotation(**a))
        except Exception:
            pass

    cultural_flags = []
    for c in cultural_flags_raw:
        try:
            cultural_flags.append(CulturalFlag(**c))
        except Exception:
            pass

    return TranslateResponse(
        translated=translated,
        terms_used=terms_used,
        annotations=annotations,
        cultural_flags=cultural_flags,
        model=message.model
    )


@router.post("/test")
async def translate_test():
    """API 연결 테스트용"""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY 없음")
    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=50,
        messages=[{"role": "user", "content": "안녕이라고 짧게 대답해"}]
    )
    return {"ok": True, "response": message.content[0].text}
