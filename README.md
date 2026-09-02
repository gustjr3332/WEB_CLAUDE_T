# WEB_CLAUDE_T

- 백엔드: https://web-claude-t.onrender.com/api/contests/
- 프론트엔드: https://hackman-virid.vercel.app/

해커톤/공모전 운영 플랫폼입니다. Django REST Framework 백엔드(Render 배포) +
React/Vite 프론트엔드(Vercel 배포)로 구성됩니다.

## 개요

초기 버전은 정적 HTML/CSS/JS + Google Apps Script(Sheets) 조합으로, 좋아요 집계
정도의 단순 기능만 처리할 수 있었습니다. 서비스를 실제로 확장할 계획이라
Django/React 기반 풀스택 구조로 전환했습니다 (2026-08-28 시작, 2026-08-31 백엔드
배포 완료). 초기 정적 사이트와 Google Apps Script 백엔드는 제품 방향이 해커톤
플랫폼으로 확정되면서 더 이상 쓸모가 없어져 저장소에서 제거했습니다
(2026-09-02, 아래 "마이그레이션 메모" 참고).

### 제품 방향 전환 (2026-08-31)

Django/React 전환은 완료됐지만, 이 저장소의 최종 목적지는 블로그가 아니라
**해커톤/공모전 운영 플랫폼**(하이브리드 앱)으로 확정됐습니다. 검토했던 두
방향과 결정 이유:

1. **해커톤/공모전 운영 플랫폼 (채택)** — 우아한형제들 사례(36팀 153명, 예선
   15분·결선 10분 실시간 집계)를 참고 모델로 삼습니다. 외부 시스템 종속이
   없어 데이터 모델·권한·상태 전이를 팀이 직접 설계할 수 있고, 실제 학과/동아리
   공모전에 바로 시범 적용해볼 수 있습니다. 예상 비중 FE 60 / BE 40.
2. **포털 연동 팀빌딩 (기각)** — 세종대 포털에는 공식 API가 없고, 존재하는
   건 학생이 만든 비공식 스크래핑 라이브러리(포털 ID/비밀번호를 서버가 직접
   받아 대리 로그인)뿐입니다. 타인의 학교 계정 비밀번호를 서버가 보관하는
   구조라 개인정보보호법 책임·약관 위반 리스크가 사이드 프로젝트가 감당할
   수준을 넘습니다. 팀빌딩 가치가 필요해지면 학교 이메일(@sejong.ac.kr)
   인증 + 학번/학과 자기입력 방식으로 대체합니다.

**이에 따른 실행 방침**: 기존 정적 사이트와의 기능 패리티 확인(과거 6단계)은
스킵합니다 — 신규 스택이 레거시를 "대체"하는 게 아니라 완전히 다른 제품으로
넘어가는 것이므로 패리티 자체가 의미가 없습니다. 현재 `posts` 앱(게시글/좋아요)은
마이그레이션 연습용 스캐폴딩이며, 곧 대회/팀/제출물/심사 점수 중심의 도메인
모델로 교체될 예정입니다. 우선순위는 (1) 프론트엔드 배포 확정 → (2) 곧바로
해커톤 플랫폼 기능 개발 착수입니다.

## 저장소 구조

```
.
├── backend/                # 백엔드: Django + DRF + PostgreSQL
│   ├── config/              # 프로젝트 설정 (settings.py, urls.py, wsgi.py)
│   ├── contests/             # 대회/팀/제출물/심사 도메인 앱 (models, serializers,
│   │                           permissions, views, migrations) — posts 앱 대체
│   ├── postman/               # Postman 컬렉션/환경 (엔드포인트 수동 검증용)
│   ├── docker-compose.yml       # 로컬 PostgreSQL 컨테이너
│   ├── Procfile                  # 배포 시작 명령 (Render)
│   └── requirements.txt
├── frontend/                # 프론트엔드: React + TypeScript + Vite
│   └── src/                    # App.tsx, AuthPanel.tsx, ContestDetail.tsx, api.ts, types.ts
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
| 배포(프론트) | Vercel | https://hackman-virid.vercel.app — 선정 근거는 [프론트엔드 배포처 분석](#프론트엔드-배포처-분석-2026-08-31-결정-기록) 참고 |
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

**Windows 호스트에서 직접 개발 시 주의**: `node_modules`를 devcontainer(Linux)에서
설치한 채로 Windows npm으로 `npm run dev`를 돌리면 `.bin`의 심볼릭 링크가 Windows용
실행 파일이 아니라서 `'vite' is not recognized...` 로 실패합니다. Windows에서 직접
작업할 때는 `node_modules`를 지우고 Windows npm으로 다시 `npm install`하세요.

### API 엔드포인트 검증

`backend/postman/WebClaude.postman_collection.json` + `WebClaude.postman_environment.json`을
Postman에 가져오면 회원가입/로그인(JWT), 대회 CRUD, 팀 생성/참가, 제출물 등록/수정,
심사 점수 입력, 스코어보드 조회 요청을 바로 실행해볼 수 있습니다.
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

- ~~Render 재배포 필요~~ **완료 확인됨** (2026-09-02): `contests` 도메인이 반영된 상태로
  `/api/auth/register/`, `/api/contests/`가 정상 응답하는 것을 직접 확인했습니다.
- ~~프론트엔드 배포 도메인이 정해지면 CORS_ALLOWED_ORIGINS에 추가~~ **완료**:
  `CORS_ALLOWED_ORIGINS`에 `https://hackman-virid.vercel.app` 반영되어 preflight
  정상 응답 확인함.
- 커스텀 도메인 연결 여부 결정 (선택)

### Django admin으로 가입 계정 확인하기

가입된 사용자 목록은 별도 API가 없고 Django admin(`/admin/`)에서 확인합니다. superuser가
없으면 먼저 만들어야 합니다:

```bash
cd backend
python manage.py createsuperuser
```

Render(프로덕션)는 대시보드의 **Shell** 탭에서 같은 명령을 실행하면 됩니다. 계정 목록만
빠르게 볼 때는 admin 대신 아래처럼 shell 한 줄로도 확인 가능합니다:

```bash
python manage.py shell -c "
from django.contrib.auth.models import User
for u in User.objects.all():
    print(u.id, u.username, u.email, u.date_joined)
"
```

## 프론트엔드 배포처 분석 (2026-08-31 결정 기록)

Vercel 배포는 이미 완료됐고, 아래는 당시 결정 근거를 남겨둔 기록입니다.
Vite로 빌드되는 순수 정적 SPA(`frontend/dist`)라 정적 호스팅 어디든 올릴 수 있지만,
빌드 시점에 `VITE_API_BASE_URL` 환경변수 주입이 필요하고 Render 백엔드와의 CORS
설정이 걸려있어 아래 기준으로 비교했습니다.

| 기준 | GitHub Pages (당시 레거시) | Vercel | Netlify | Cloudflare Pages |
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

## 마이그레이션 메모

- 초기 `index.html` / `script.js` / `like-widget.*` / `apps-script/`(Google Apps
  Script 백엔드)는 GitHub Pages에 당분간 남겨뒀었지만, 제품 방향이 해커톤 플랫폼으로
  완전히 확정되면서 패리티 기준으로서의 가치가 없어져 **2026-09-02에 저장소에서
  전부 삭제**했습니다 (`gustjr3332.github.io/WEB_CLAUDE_T` GitHub Pages 사이트도
  함께 내려감). 필요하면 git 히스토리(이 커밋 이전)에서 복구 가능합니다.
- Flutter 앱은 더 이상 "향후 옵션"이 아니라 확정된 방향입니다 — 해커톤 플랫폼을
  웹+모바일 하이브리드로 만들 계획이므로, Django REST API 설계 시 "웹 전용"이
  아니라 "웹+앱 공용"을 염두에 두고 인증(JWT 등)·응답 포맷을 잡아야 합니다.

## 다음 단계 (순서)

1. ~~Django 프로젝트 + DRF 세팅, PostgreSQL 연결 (로컬 Docker)~~ 완료
2. ~~핵심 모델/엔드포인트 설계 (게시글, 좋아요 등 기존 기능부터 이식)~~ 완료
3. ~~React(TS) 프로젝트 세팅, 기존 UI를 컴포넌트로 재구성해 API 연동~~ 완료
4. ~~Postman 컬렉션 작성 및 엔드포인트 검증~~ 완료
5. 백엔드+DB 배포: ~~Render~~ 완료 / 프론트 배포처: ~~Vercel~~ **완료** —
   https://hackman-virid.vercel.app
6. ~~기존 정적 사이트와 기능 패리티 확인 후 전환~~ **스킵** (제품 방향 전환으로 무의미해짐)

### 2026-09-01 재수립: 해커톤/공모전 도메인 실행 계획

기존 7번 항목("도메인 모델 설계 및 posts 교체 착수")이 바로 실행하기엔 너무
뭉뚱그려져 있어, 실행 가능한 단위로 세분화했습니다.

1. ~~**도메인 모델 설계** — Contest / Team / Participant / Submission / Judge /
   Score 엔터티와 대회 상태 전이(모집중→진행중→심사중→종료) 정의~~ 완료
2. ~~**`contests` 앱 신설** — 위 모델 + 마이그레이션 작성, 기존 `posts` 앱은 제거~~ 완료
3. ~~**인증/권한 도입** — 웹+Flutter 공용 전제로 JWT(`simplejwt`) 도입, 역할 기반
   권한(운영자/참가자/심사위원) 설계~~ 완료
4. ~~**핵심 API 구현** — 대회 생성, 팀 등록/참가, 제출물 업로드, 심사 점수 입력
   엔드포인트~~ 완료 (테스트 9개로 인증/권한/집계 검증)
5. ~~**실시간 집계 기능** — 우아한형제들 사례(예선 15분·결선 10분) 참고해 팀별
   점수 집계 스코어보드 API~~ 완료 (REST 폴링 기반 MVP로 구현, WebSocket은 후속 과제)
6. ~~**프론트엔드 연동** — React에 로그인/대회 목록/팀 관리/제출/스코어보드 UI 구성~~
   완료 (회원가입→로그인→팀 생성→제출→스코어보드 흐름을 실제 브라우저로 검증함).
   ~~Vercel 실배포는 계정 로그인이 필요해 사람이 직접 진행해야 함 (미착수)~~
   **완료** (2026-09-02): https://hackman-virid.vercel.app 배포됨.
7. ~~**심사위원용 채점 화면**~~ **완료** (2026-09-02): 대회 상세 화면에서 로그인한
   사용자가 해당 대회의 심사위원으로 배정돼 있으면 "심사하기" 섹션이 자동으로
   나타나고, 팀별 제출물마다 예선/결선 점수·코멘트를 입력·수정할 수 있음. 로컬에서
   실제 브라우저로 채점 생성(POST)·수정(PATCH)·스코어보드 반영까지 검증함. 다만
   **심사위원 배정 UI는 아직 없음** — 지금은 조직자가 Django admin이나 API로
   `Judge`를 직접 등록해야 함.
8. **학과/동아리 공모전 시범 적용** — 소규모 실사용 파일럿 진행, 피드백 반영해
   반복 개선 (실제 대회 운영이 필요해 이후 별도로 진행)

1~7번 코딩과 Render/Vercel 배포는 완료했습니다. 남은 건 심사위원 배정 UI와
8번 실제 파일럿입니다.

## 해결된 이슈 (기록용)

### Vercel 프로덕션에서 모든 API 호출 404 (2026-09-02 발견 및 해결)

**증상**: https://hackman-virid.vercel.app 에서 회원가입/로그인 등 백엔드 호출이
전부 "요청에 실패했습니다 (404)".

**원인**: Vercel 프로젝트의 `VITE_API_BASE_URL` 환경변수가 `https://web-claude-t.onrender.com`
로 설정되어 있었음(끝에 `/api`가 빠짐). `frontend/src/api.ts`는
`${API_BASE_URL}${path}` 형태로 요청을 만들기 때문에, 실제 요청이
`https://web-claude-t.onrender.com/auth/register/`로 나가는데 Django에는 이 경로가
없고 `/api/auth/register/`만 존재함 → 404. 배포된 JS 번들(`assets/index-*.js`)에서
baked-in 값을 직접 확인해서 원인을 특정함. 백엔드 자체와 CORS(`hackman-virid.vercel.app`
허용됨)는 정상이었음.

**해결**: Vercel 대시보드 → Settings → Environment Variables에서
`VITE_API_BASE_URL`을 `https://web-claude-t.onrender.com/api`로 수정 후 재배포.
수정 후 프로덕션에서 실제 브라우저로 회원가입→자동 로그인까지 재검증 완료.