# WEB_CLAUDE_T

- 기존 정적 사이트(운영 중): https://gustjr3332.github.io/WEB_CLAUDE_T/
- 신규 백엔드(배포 완료): https://web-claude-t.onrender.com/api/posts/

## 개요

기존 버전은 정적 HTML/CSS/JS + Google Apps Script(Sheets) 조합으로, 좋아요 집계
정도의 단순 기능만 처리할 수 있었습니다. 서비스를 실제로 확장(회원, 게시글 CRUD,
댓글 등)할 계획이라 Django/React 기반 풀스택 구조로 전환 중입니다 (2026-08-28 시작).

새 스택이 기존 기능(좋아요 집계 포함)을 완전히 커버하고 검증될 때까지, 두 시스템을
**병행 유지**합니다. 아직 레거시 정적 사이트를 걷어내지 않았습니다.

## 저장소 구조

```
.
├── index.html / script.js / style.css / config.js / like-widget.*  # 레거시 정적 사이트 (운영 중, GitHub Pages)
├── apps-script/            # 레거시 백엔드: Google Apps Script + Sheets (Code.gs, README.md)
├── backend/                # 신규 백엔드: Django + DRF + PostgreSQL
│   ├── config/              # 프로젝트 설정 (settings.py, urls.py, wsgi.py)
│   ├── posts/                # 게시글/좋아요 앱 (models, serializers, views, migrations)
│   ├── postman/               # Postman 컬렉션/환경 (엔드포인트 수동 검증용)
│   ├── docker-compose.yml       # 로컬 PostgreSQL 컨테이너
│   ├── Procfile                  # 배포 시작 명령 (Render)
│   └── requirements.txt
├── frontend/                # 신규 프론트엔드: React + TypeScript + Vite
│   └── src/                    # App.tsx, PostCard.tsx, api.ts, types.ts
└── .devcontainer/            # Python+Node+PostgreSQL 개발 컨테이너 (VS Code Dev Containers)
```

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 백엔드 | Python / Django 6.1 + Django REST Framework | REST API 서버로 프론트와 완전히 분리 |
| 프론트엔드 | TypeScript / React 18 (Vite) | SPA, 백엔드 API를 fetch로 호출 |
| DB | PostgreSQL 16 | 로컬 개발은 Docker, 배포는 Render 관리형 DB |
| API 테스트 | Postman | `backend/postman/`에 컬렉션·환경 파일로 관리 |
| 배포(백엔드) | Render (Web Service + 관리형 PostgreSQL) | gunicorn + whitenoise |
| 배포(프론트) | 미정 — 아래 [프론트엔드 배포처 분석](#프론트엔드-배포처-분석) 참고 | |
| 향후 하이브리드 앱 | Flutter | 같은 Django REST API를 그대로 재사용 예정 |

## 로컬 개발 환경

### 백엔드

```bash
cd backend
docker compose up -d          # PostgreSQL 컨테이너 기동 (localhost:5432)
python -m venv .venv && .venv/Scripts/activate   # (Windows) 최초 1회
pip install -r requirements.txt
cp .env.example .env          # 필요 시 값 수정
python manage.py migrate
python manage.py runserver    # http://127.0.0.1:8000
```

`.env`가 없으면 Django가 기본값(`webclaude`/`webclaude`)으로 로컬 Postgres에 접속합니다.
`DATABASE_URL` 환경변수가 설정되어 있으면 `POSTGRES_*` 값 대신 그걸 우선 사용합니다
(Render 등 PaaS 배포용).

### 프론트엔드

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL 확인 (기본: http://127.0.0.1:8000/api)
npm run dev                   # http://localhost:5173
```

### API 엔드포인트 검증

`backend/postman/WebClaude.postman_collection.json` + `WebClaude.postman_environment.json`을
Postman에 가져오면 posts 목록/조회/생성/수정/삭제/좋아요 요청을 바로 실행해볼 수 있습니다.
로컬 대상: `base_url = http://127.0.0.1:8000/api`.

## 백엔드 배포 (Render)

**상태: 배포 완료 및 동작 확인됨** (2026-08-31)

- URL: https://web-claude-t.onrender.com
- Web Service Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `python manage.py migrate --noinput && gunicorn config.wsgi`
- PostgreSQL: Render 관리형 인스턴스, `DATABASE_URL` 환경변수로 연결
- 환경변수: `DJANGO_SECRET_KEY`(고유 발급값), `DJANGO_DEBUG=False`,
  `DJANGO_ALLOWED_HOSTS=web-claude-t.onrender.com`, `DATABASE_URL`,
  `CORS_ALLOWED_ORIGINS=<프론트 배포 도메인 확정 후 추가>`

### 배포 중 겪은 이슈와 해결 (기록용)

1. **`relation "posts_post" does not exist` (500 에러)**
   원인: `Procfile`에 Heroku 방식인 `release: python manage.py migrate`를 썼는데,
   Render는 이 `release` 단계를 지원하지 않아 마이그레이션이 한 번도 실행되지
   않음. → `Procfile`을 `web: python manage.py migrate --noinput && gunicorn
   config.wsgi` 한 줄로 합쳐서, 매 배포/재시작 시 마이그레이션이 먼저 실행되도록
   수정.
2. **Procfile을 고쳤는데도 그대로 500**
   원인: Render 대시보드의 **Start Command** 필드에 `gunicorn config.wsgi`가
   직접 입력되어 있어 `Procfile` 내용을 완전히 무시하고 있었음. Render는 대시보드
   Start Command가 설정되어 있으면 그게 `Procfile`보다 우선 적용됨. → 대시보드
   Start Command 값을 위 한 줄로 직접 교체해서 해결.
3. **디버깅 팁**: `DJANGO_ALLOWED_HOSTS`가 배포 도메인과 정확히 일치해야 하고,
   원인 파악이 안 될 때는 `DJANGO_DEBUG=True`로 잠깐 바꿔 Django 에러 페이지의
   traceback을 직접 확인한 뒤 다시 `False`로 되돌리는 방식이 가장 빠름
   (Render 접근 로그만으로는 500 원인이 안 보임).

### 남은 배포 작업

- 프론트엔드 배포 도메인이 정해지면 `CORS_ALLOWED_ORIGINS`에 추가
- 커스텀 도메인 연결 여부 결정 (선택)

## 프론트엔드 배포처 분석

Vite로 빌드되는 순수 정적 SPA(`frontend/dist`)라 정적 호스팅 어디든 올릴 수 있지만,
빌드 시점에 `VITE_API_BASE_URL` 환경변수 주입이 필요하고 Render 백엔드와의 CORS
설정이 걸려있어 아래 기준으로 비교했습니다.

| 기준 | GitHub Pages (현행 레거시) | Vercel | Netlify | Cloudflare Pages |
|---|---|---|---|---|
| Vite/React 지원 | 수동 설정 필요 (`base` 경로, Actions 워크플로 직접 작성) | 자동 감지, 설정 거의 불필요 | 자동 감지, 설정 거의 불필요 | 자동 감지, 설정 거의 불필요 |
| 빌드 시 환경변수 UI | 없음 (Actions 워크플로 secrets로 우회해야 함) | 대시보드에서 바로 관리 | 대시보드에서 바로 관리 | 대시보드에서 바로 관리 |
| PR/브랜치별 프리뷰 배포 | 없음 | 있음 (자동) | 있음 (자동) | 있음 (자동) |
| 커스텀 도메인 + HTTPS | 지원 (무료) | 지원 (무료) | 지원 (무료) | 지원 (무료) |
| 무료 티어 한도 | 넉넉함 (정적 파일만) | 넉넉함, 개인 프로젝트에 충분 | 넉넉함, 개인 프로젝트에 충분 | 가장 넉넉함 (대역폭 무제한) |
| SPA 라우팅(새로고침 404 방지) | 수동 우회 필요 (404.html 트릭) | 자동 처리 | 자동 처리 (`_redirects` 필요할 수 있음) | 자동 처리 |
| 현재 프로젝트와의 연속성 | 이미 쓰고 있고 저장소 Pages도 켜져 있음 | 새로 연결 필요 | 새로 연결 필요 | 새로 연결 필요 |

### 추천: Vercel

React/Vite 생성 프로젝트로서는 설정 부담이 가장 적고(`frontend`를 Root Directory로
지정만 하면 빌드/배포 자동 인식), 대시보드에서 `VITE_API_BASE_URL` 같은 환경변수를
GUI로 관리할 수 있어 지금 백엔드 배포에서 Render 환경변수를 다루던 것과 경험이
비슷합니다. PR 프리뷰 배포도 기본 제공되어 이후 기능을 늘려갈 때(회원, 댓글 등)
변경 사항을 배포 전에 미리 볼 수 있다는 이점이 큽니다.

**차선책**: 지금 그대로 GitHub Pages를 쓰고 싶다면 유지 가능하지만, Vite SPA 특성상
`vite.config.ts`에 `base` 경로 설정, GitHub Actions 빌드 워크플로 작성, SPA
새로고침 404 우회(`404.html`을 `index.html` 복사본으로 두는 방식) 등 추가 설정이
필요합니다. 레거시 정적 사이트는 지금처럼 Pages에 남겨두고, 신규 React 앱만
Vercel로 옮기는 조합을 권장합니다.

## 마이그레이션 메모

- 기존 `index.html` / `script.js` / `like-widget.*` / Apps Script 백엔드는
  당장 걷어내지 않고, 새 Django/React 스택이 기존 기능(좋아요 집계 포함)을
  완전히 커버하는 게 확인되면 그때 정리합니다 (README "다음 단계" 6번).
- Flutter 앱은 이번 단계 범위 밖. Django REST API 설계 시 "웹 전용"이 아니라
  "웹+앱 공용"을 염두에 두고 인증(JWT 등)·응답 포맷을 잡아두면 이후 앱 붙일 때
  API를 다시 만들 필요가 없습니다.

## 다음 단계 (순서)

1. ~~Django 프로젝트 + DRF 세팅, PostgreSQL 연결 (로컬 Docker)~~ 완료
2. ~~핵심 모델/엔드포인트 설계 (게시글, 좋아요 등 기존 기능부터 이식)~~ 완료
3. ~~React(TS) 프로젝트 세팅, 기존 UI를 컴포넌트로 재구성해 API 연동~~ 완료
4. ~~Postman 컬렉션 작성 및 엔드포인트 검증~~ 완료
5. 백엔드+DB 배포: ~~Render~~ 완료 / 프론트 배포처 확정: **Vercel 권장** (위 분석 참고, 실제 연결 대기 중)
6. 기존 정적 사이트와 기능 패리티 확인 후 전환
