# 배포 가이드

## 서비스 구성

```
Supabase (DB) → Railway (백엔드) → Vercel (프론트)
```

| 서비스 | 용도 | 비용 |
|--------|------|------|
| Supabase | 데이터베이스 | 무료 |
| Railway | FastAPI 백엔드 | 무료~$5/월 |
| Vercel | Next.js 프론트엔드 | 무료 |
| Anthropic API | Claude AI | 사용량에 따라 $1~40/월 |

---

## STEP 1 — Supabase 키 확인 (이미 연결됨)

**Supabase → Settings → API** 에서 복사:
- `Project URL` → `SUPABASE_URL`
- `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY`

---

## STEP 2 — Railway (Python 백엔드)

1. [railway.app](https://railway.app) 가입 (GitHub 로그인 추천)
2. **New Project → Deploy from GitHub repo** → 이 저장소 선택
3. **Root Directory**: `translation-agent/backend`
4. **Settings → Start Command**:
   ```
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
5. **Variables** 탭에서 환경변수 추가:

   | 키 | 값 |
   |---|---|
   | `ANTHROPIC_API_KEY` | Anthropic 키 |
   | `SUPABASE_URL` | STEP 1에서 복사한 URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | STEP 1에서 복사한 키 |
   | `DATASET_BACKEND` | `supabase` |
   | `BACKEND_CORS_ORIGINS` | `*` (일단 임시, 나중에 Vercel URL로 교체) |

6. 배포 완료 후 Railway URL 메모 (예: `https://your-app.railway.app`)

---

## STEP 3 — Vercel (Next.js 프론트엔드)

1. [vercel.com](https://vercel.com) 가입 (GitHub 로그인 추천)
2. **New Project → Import Git Repository** → 이 저장소 선택
3. **Root Directory**: 루트(`/`) 그대로 유지
4. **Environment Variables** 추가:

   | 키 | 값 |
   |---|---|
   | `NEXT_PUBLIC_API_BASE` | Railway URL (STEP 2에서 메모한 것) |

5. **Deploy** 클릭
6. 배포 완료 후 Vercel URL 메모 (예: `https://your-app.vercel.app`)

---

## STEP 4 — CORS 마무리

Railway **Variables** 탭에서 `BACKEND_CORS_ORIGINS` 값을 업데이트:

```
https://your-app.vercel.app
```

`*` 대신 실제 Vercel URL로 교체 → Railway 자동 재배포됨

---

## 완료 확인

`https://your-app.railway.app/api/health` 접속 시 아래처럼 나오면 성공:

```json
{
  "api_key_set": true,
  "supabase_configured": true,
  "supabase_connected": true
}
```
