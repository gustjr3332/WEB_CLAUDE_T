# HACKMAN 개발 문서

개발·배포·운영자를 위한 문서다. 서비스 소개와 사용 방법은 [README.md](README.md), 화면 디자인
기준은 [DESIGN.md](DESIGN.md)를 본다. 여기에는 도메인 모델, 저장소 구조, 기술 스택, 로컬 개발 환경,
테스트, 배포, 로드맵, 트러블슈팅 기록을 둔다.

- 백엔드: https://web-claude-t.onrender.com/api/contests/
- 프론트엔드: https://hackman-virid.vercel.app/

Django REST Framework + React(Vite) 기반 해커톤/공모전 운영 플랫폼입니다. 대회 생성 →
팀 구성 → 제출물 등록 → 심사위원 채점 → 실시간 스코어보드로 이어지는 흐름을 지원합니다.
우아한형제들 해커톤 운영 사례(예선 15분·결선 10분 실시간 집계)를 참고 모델로 삼았습니다.
향후 Flutter로 동일 Django REST API를 재사용하는 웹+앱 하이브리드 확장을 계획하고 있습니다.

## 도메인 모델

`Contest` — `Team` — `Participant` / `Submission` — `Judge` — `Score`

- 대회 상태 전이: 모집중 → 진행중 → 심사중 → 종료 (운영자가 대회 상세 화면에서 전환)
- 역할: 운영자(staff) / 참가자 / 심사위원
- 채점: 팀의 제출물 1건에 대해 심사위원별로 예선/결선 라운드 점수·코멘트 입력.
  같은 심사위원이 같은 라운드에 다시 저장하면 기존 점수를 덮어쓴다(upsert).
- 스코어보드: 라운드별 평균 점수·심사 수·**순위**를 집계. 동점은 같은 순위를 공유하고 다음
  순위는 건너뛴다(1, 1, 3). 점수가 없는 팀은 순위 없이 맨 아래에 표시.

대회 상태에 따라 서버가 허용하는 동작 (프론트는 같은 규칙으로 폼을 숨기고, 강제는 서버가 함):

| 동작 | 모집중 | 진행중 | 심사중 | 종료 |
|---|:-:|:-:|:-:|:-:|
| 팀 생성 / 참가 | O | O | – | – |
| 제출물 등록 / 수정 | O | O | – | – |
| 심사위원 채점 | – | – | O | – |
| 스코어보드 조회 | O | O | O | O |

허용되지 않는 상태에서 요청하면 `403` + `"… (현재 상태: 심사중)"` 형태의 메시지를 돌려준다.
규칙 정의: `backend/contests/views.py`의 `*_STATUSES`, `frontend/src/rules.ts`.

## 저장소 구조

```
.
├── backend/                # 백엔드: Django + DRF + PostgreSQL
│   ├── config/              # 프로젝트 설정 (settings.py, urls.py, wsgi.py)
│   ├── contests/             # 대회/팀/제출물/심사 도메인 앱 (models, serializers,
│   │                           permissions, views, migrations)
│   ├── postman/               # Postman 컬렉션/환경 (엔드포인트 수동 검증용)
│   ├── docker-compose.yml       # 로컬 PostgreSQL 컨테이너
│   ├── Procfile                  # 배포 시작 명령 (Render)
│   └── requirements.txt
├── frontend/                # 프론트엔드: React + TypeScript + Vite
│   └── src/                    # App.tsx, AuthPanel.tsx, ContestForm.tsx, ContestDetail.tsx,
│                                 api.ts, types.ts, labels.ts, rules.ts, style.css
├── .devcontainer/            # Python+Node+PostgreSQL 개발 컨테이너 (VS Code Dev Containers)
├── README.md                # 서비스 소개·사용 방법 (운영자/참가자/심사위원 대상)
├── DEVELOPMENT.md            # 이 문서: 개발·배포·운영 기록
└── DESIGN.md                 # 프론트엔드 디자인 기준
```

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 백엔드 | Python / Django 6.1 + Django REST Framework | REST API 서버, 프론트와 완전히 분리 |
| 프론트엔드 | TypeScript / React 18 (Vite) | SPA, 백엔드 API를 fetch로 호출 |
| 인증 | JWT (`djangorestframework-simplejwt`) | 웹+앱(Flutter) 공용 전제 |
| DB | PostgreSQL 16 | 로컬 개발은 Docker, 배포는 Render 관리형 DB |
| API 테스트 | Postman | `backend/postman/`에 컬렉션·환경 파일로 관리 |
| 배포(백엔드) | Render (Web Service + 관리형 PostgreSQL) | gunicorn + whitenoise |
| 배포(프론트) | Vercel | Root Directory: `frontend` |
| 향후 하이브리드 앱 | Flutter | 같은 Django REST API 재사용 예정 |

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

Docker를 띄우지 않고 빠르게 돌려볼 때는 SQLite를 지정하면 됩니다:

```powershell
# PowerShell
$env:DATABASE_URL = "sqlite:///$PWD/dev.sqlite3"; python manage.py migrate; python manage.py runserver
```

```bash
# bash
DATABASE_URL="sqlite:///$(pwd)/dev.sqlite3" python manage.py migrate && DATABASE_URL="sqlite:///$(pwd)/dev.sqlite3" python manage.py runserver
```

### 백엔드 테스트

`backend/contests/tests.py`에 API 테스트 47건(인증·토큰 갱신, 대회 CRUD·상태 전이, 상태별
동작 제한, 팀/제출물 권한, 심사위원 배정, 스코어보드 순위 집계, 쿼리 수 고정 검증)이 있습니다.
Postgres가 없어도 SQLite로 실행됩니다:

```powershell
# PowerShell
$env:DATABASE_URL = "sqlite:///$PWD/test.sqlite3"; python manage.py test
```

```bash
# bash
DATABASE_URL="sqlite:///$(pwd)/test.sqlite3" python manage.py test
```

### 프론트엔드

```bash
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL 확인 (기본: http://127.0.0.1:8000/api)
npm run dev                   # http://localhost:5173
npm run build                 # tsc 타입 검사 + 프로덕션 번들 (배포 전 확인용)
```

프론트 동작 메모:

- 로그인 시 access/refresh 토큰을 모두 `localStorage`에 저장하고, API가 `401`을 돌려주면
  refresh 토큰으로 한 번 재발급한 뒤 원 요청을 재시도합니다(동시 요청은 재발급 1회로 합침).
  재발급도 실패하면 로그아웃 처리 후 "로그인이 만료되었습니다" 안내가 뜹니다.
- 대회 상세 화면은 **5초마다** 팀 목록·스코어보드·대회 상태를 다시 가져옵니다(탭이 백그라운드면
  건너뛰고, 다시 보이면 즉시 갱신). 운영자가 상태를 바꾸면 참가자·심사위원 화면도 다음 폴링에서
  폼 잠금/해제가 따라갑니다. 종료된 대회는 30초 주기로만 확인합니다. 상단
  `LIVE · 5초마다 갱신 · hh:mm:ss` 표시로 마지막 갱신 시각을 확인할 수 있고, 요청이 실패하면
  `연결 끊김 · 재시도 중`으로 바뀝니다.
- 운영자(staff) 계정은 목록 화면에서 **새 대회 만들기**, 상세 화면에서 **상태 전이**
  (모집중 → 진행중 → 심사중 → 종료)와 심사위원 배정을 할 수 있습니다.

### API 엔드포인트 검증

`backend/postman/WebClaude.postman_collection.json` + `WebClaude.postman_environment.json`을
Postman에 가져오면 회원가입/로그인(JWT), 대회 CRUD, 팀 생성/참가, 제출물 등록/수정,
심사 점수 입력, 스코어보드 조회 요청을 바로 실행해볼 수 있습니다.
로컬 대상: `base_url = http://127.0.0.1:8000/api`.

### 가입 계정 / 운영자(superuser) 확인

가입된 사용자 목록과 운영자 여부(`is_staff`, `is_superuser`)는 별도 API가 없고 아래 세 가지
방법으로 확인합니다.

**1. Django admin** — https://web-claude-t.onrender.com/admin/ → *인증 및 권한 › 사용자*.
superuser 계정 하나가 있어야 로그인할 수 있고, 여기서 다른 계정에 `is_staff`를 켜면 그 계정이
바로 운영자(대회 생성·상태 전이·심사위원 배정 가능)가 됩니다. 앱에서 로그인한 뒤
`GET /api/auth/me/`로 자기 자신의 `is_staff`만 확인할 수도 있습니다.

**2. 로컬 PC에서 Render DB에 직접 연결** — Render Shell(유료 플랜 전용) 없이 됩니다.
Render 대시보드 → PostgreSQL 서비스 → *Info* → **External Database URL**을 복사해서, 로컬
`backend/` 디렉터리에서 그 값을 `DATABASE_URL`로 넘겨 manage.py 를 실행하면 프로덕션 DB를
대상으로 동작합니다:

```powershell
# PowerShell (backend/ 에서, .venv 활성화 상태)
$env:DATABASE_URL = "postgres://...external url..."
python manage.py shell -c "from django.contrib.auth.models import User; [print(u.id, u.username, u.email, u.is_staff, u.is_superuser) for u in User.objects.all()]"
python manage.py createsuperuser        # superuser가 하나도 없을 때
```

```bash
# bash
DATABASE_URL="postgres://...external url..." python manage.py shell -c "
from django.contrib.auth.models import User
for u in User.objects.all():
    print(u.id, u.username, u.email, 'staff' if u.is_staff else '', 'superuser' if u.is_superuser else '')
"
```

이미 있는 계정을 운영자로 올릴 때는
`User.objects.filter(username='아이디').update(is_staff=True)` 한 줄이면 됩니다.
External URL은 외부 접속용이라 Render 내부 URL과 다르고, 무료 DB는 만료 시 URL이 바뀝니다.

**3. DB 클라이언트** — 같은 External Database URL을 DBeaver / TablePlus / psql에 넣고
`SELECT id, username, email, is_staff, is_superuser FROM auth_user;`.

로컬 개발 DB에서는 그냥 `python manage.py createsuperuser` 후 http://127.0.0.1:8000/admin/ 입니다.

## 배포

### 백엔드 (Render)

- URL: https://web-claude-t.onrender.com
- Root Directory: `backend`
- Build: `pip install -r requirements.txt`
- Start: `python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn config.wsgi`
  (대시보드 **Start Command** 필드가 `Procfile`보다 우선이므로 둘을 같은 값으로 유지)
- DB: Render 관리형 PostgreSQL, `DATABASE_URL`로 연결
- 환경변수: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`,
  `DJANGO_ALLOWED_HOSTS=web-claude-t.onrender.com`, `DATABASE_URL`,
  `CORS_ALLOWED_ORIGINS=https://hackman-virid.vercel.app`

### 프론트엔드 (Vercel)

- URL: https://hackman-virid.vercel.app
- Root Directory: `frontend`
- 환경변수: `VITE_API_BASE_URL=https://web-claude-t.onrender.com/api`
  (Vite는 빌드 시점에 env를 박아 넣으므로, 값 변경 후 반드시 재배포 필요)

### 커스텀 도메인 (예정, 2026-09-03 조사)

비용은 도메인 등록비만 든다. Vercel·Render의 커스텀 도메인 연결과 SSL(Let's Encrypt 자동
발급·갱신)은 둘 다 무료 플랜에 포함.

| 항목 | 비용 | 비고 |
|---|---|---|
| `.com` | 연 $10~13 | Cloudflare Registrar·Porkbun이 원가 판매 |
| `.kr` / `.co.kr` | 연 약 2.2만원 | 가비아·후이즈 |
| `.xyz` 등 | 첫해 $2~5 | 갱신비 확인 필요 |
| Vercel / Render 연결, SSL | 무료 | |

**추천 구성: 프론트만 도메인 연결.** 참가자가 보는 주소만 바뀌면 되고 백엔드는
`web-claude-t.onrender.com`을 그대로 써도 된다. 절차 (약 20분 + DNS 전파):

1. 도메인 구매 (예: `sjuhack.com`)
2. Vercel → 프로젝트 → Settings → Domains → 도메인 추가. 안내대로 DNS에 A 레코드
   (`76.76.21.21`) 또는 CNAME(`cname.vercel-dns.com`) 등록. SSL 자동
3. Render → web-claude-t → Environment → `CORS_ALLOWED_ORIGINS`에
   `https://sjuhack.com,https://www.sjuhack.com` 추가 (기존 vercel 주소는 유지). 저장 시 자동 재배포
4. 새 주소로 로그인 한 번 해서 확인

백엔드까지 `api.sjuhack.com`으로 붙일 경우 추가 작업: Render Custom Domains에 등록(DNS CNAME →
`web-claude-t.onrender.com`), `DJANGO_ALLOWED_HOSTS`에 추가, Vercel
`VITE_API_BASE_URL=https://api.sjuhack.com/api`로 변경 후 **재배포**(Vite는 빌드 시 값이 박힘).

도메인보다 먼저 볼 비용: Render Free는 15분 미사용 시 잠들어 첫 요청에 30~50초 걸린다. 대회
당일 체감이 크므로 대회 기간만 Starter 플랜(월 $7)으로 올려 상시 가동하는 방안을 검토.

## 로드맵

### 완료

- Django + DRF + PostgreSQL 세팅 (로컬 Docker)
- 도메인 모델(`Contest`/`Team`/`Participant`/`Submission`/`Judge`/`Score`) + 마이그레이션
- JWT 인증 + 역할 기반 권한(운영자/참가자/심사위원)
- 핵심 API: 대회 CRUD, 팀 생성/참가, 제출물 등록/수정, 심사 점수 입력, 스코어보드 집계
- React 프론트: 로그인/회원가입, 대회 목록·상세, 팀 생성/참가, 제출물 등록, 스코어보드,
  **심사자 채점 화면**
- Postman 컬렉션 (회원가입~스코어보드 전 구간)
- Render 백엔드 배포 / Vercel 프론트엔드 배포
- 레거시 정적 사이트 + Google Apps Script 백엔드 제거 (2026-09-02)
- 프론트엔드 리디자인 — `DESIGN.md` 기준 헤어라인 리스트 + 히어로 스코어보드 (2026-09-03)
- **심사위원 배정 UI** — 대회 상세 화면에서 운영자(staff)가 아이디로 심사위원을 배정/해제
  (`GET /api/auth/me/`로 운영자 여부 확인, `POST/DELETE /api/judges/`) (2026-09-03)
- **대회 생성 / 상태 전이 UI** — 운영자가 목록 화면에서 대회를 만들고(slug 자동 제안,
  시작·종료 검증), 상세 화면에서 모집중 → 진행중 → 심사중 → 종료를 전환 (2026-09-03)
- **대회 상태 기반 동작 제한** — 팀 생성/참가·제출물 수정은 모집중/진행중에만, 채점은 심사중에만.
  서버가 `403`으로 강제하고 프론트는 같은 규칙으로 폼을 잠금 (2026-09-03)
- **스코어보드 실시간화(REST 폴링)** — 5초 주기 폴링 + LIVE 인디케이터, 예선/결선 라운드 탭,
  순위 컬럼(동점 공동 순위), 대회 상태 변경도 폴링으로 전파, 종료된 대회는 30초 주기 (2026-09-03)
- **JWT 액세스 토큰 자동 갱신** — `401` 시 refresh 토큰으로 재발급 후 재시도, 실패 시 세션
  만료 안내 (2026-09-03)
- 보안/안정성 수정 — 타 팀에 제출물 생성 가능했던 구멍 차단, 같은 라운드 중복 채점 시 500 →
  upsert, 대회 종료일 < 시작일 검증 (2026-09-03)
- 백엔드 API 테스트 37건 (SQLite로 Docker 없이 실행 가능) (2026-09-03)
- **`/code-review xhigh` 결과 반영 — 알고리즘/기능 연결성 최적화** (2026-09-03)
  - `ContestSerializer.team_count`가 대회마다 `teams.count()` 쿼리를 날리던 것을
    `ContestViewSet.get_queryset`의 `annotate(Count/Exists)`로 바꿔, 목록 조회가 대회 수와
    무관하게 고정 쿼리 수로 끝난다. 같은 annotate로 `is_judge`(요청자가 이 대회 심사위원인지)도
    함께 계산해 프론트가 더 이상 `judges` 배열을 문자열로 비교하지 않는다.
  - `TeamViewSet.get_queryset`이 참가자 `username`까지 `select_related`로 미리 가져와
    (기존엔 팀마다 참가자 목록 직렬화 시 유저 조회가 반복됨) 5초 폴링 부하를 줄였다.
  - **버그 수정** — 채점을 마친 심사위원을 해제하면 `Score.judge`가 `CASCADE`라 그 점수가
    통째로 사라지던 문제. `JudgeViewSet.perform_destroy`가 `score_count > 0`이면 403으로
    막고, 프론트는 해당 심사위원 옆에 채점 건수를 보여주며 해제 버튼을 비활성화한다.
  - **버그 수정** — 운영자가 자기 자신을 심사위원으로 겸임하면 `GET /scores/`가 전체 심사위원의
    점수를 돌려줘, 채점 화면이 남의 점수를 "내 점수"로 착각해 덮어쓸 수 있던 문제.
    `?mine=1` 쿼리로 항상 본인 점수만 받도록 프론트·백엔드를 맞췄다.
  - **버그 수정** — 로그인 폼에 입력한 문자열을 그대로 신원 비교에 썼던 것을, `/api/auth/me/`가
    돌려주는 서버 정식 아이디로 교체(앞뒤 공백 등으로 "내 팀"·심사 패널이 조용히 숨던 문제 해소).
    다른 탭에서 로그인/로그아웃하면 `storage` 이벤트로 이 탭도 같은 계정으로 맞춘다.
  - `JudgeSerializer`의 쓰기 전용 `user_username`/읽기 전용 `username` 이원화를 없애고
    `SlugRelatedField` 하나로 통일. 중복 배정 시 DRF 기본 영문 오류 대신 한국어 메시지를 준다.
    `JudgeViewSet`은 PUT/PATCH를 막아(`http_method_names`) 심사위원의 점수를 다른 사람 것으로
    재배정할 수 있던 경로를 닫았다.
  - 팀 참가(`join`) 응답이 방금 만든 `Participant`를 다시 조회하던 왕복을 없애고 바로 직렬화.
  - 회귀 테스트 10건 추가(쿼리 수 고정 검증 2건 포함, 총 47건), 프론트 `npm run build` 통과.

### 남은 작업

- **제출물 심사 도구 — 웹 데모 시현 + GitHub 코드 열람** (2026-09-04 설계, 구현 대기)
  범위: 웹 데모만 지원(앱 실행 테스트는 제외 — 브라우저에서 네이티브 앱을 구동하려면
  Appetize.io 같은 유료 클라우드 에뮬레이터가 필요해 난이도·비용이 급증하므로 보류).
  코드 리뷰는 GitHub 링크 기반 열람까지만(인라인 코멘트·diff 툴은 제외).
  - **데이터 모델**: `Submission`에 `repo_url`(URLField, blank=True) 신규 필드 추가.
    기존 `link_url`은 데모 URL 용도로 그대로 유지. 마이그레이션 1개.
  - **웹 데모 시현**: 백엔드 변경 없음. 심사 화면에서 `link_url`을 iframe으로 띄우고
    "새 탭에서 열기" 버튼을 항상 함께 노출한다(X-Frame-Options로 iframe이 막히는지는
    JS로 안정적으로 감지할 수 없어, fallback이 아니라 기본 노출로 둔다).
  - **GitHub 코드 열람**: 백엔드 프록시 없이 프론트에서 `api.github.com`에 직접 GET
    (공개 API, CORS 허용, 비인증 60회/시간 — 소규모 파일럿 규모엔 충분).
    - `repo_url`에서 owner/repo 파싱
    - `/repos/{owner}/{repo}/readme` → README 렌더링
    - `/repos/{owner}/{repo}/git/trees/{branch}?recursive=1` → 파일 트리
    - 파일 클릭 시 `/contents/{path}` → base64 디코드 후 `<pre>`로 표시
      (문법 하이라이팅은 MVP 범위 밖)
    - private repo·rate limit 초과 시 "GitHub에서 직접 열기" 링크로 대체
  - **작업량 추정**: 모델·마이그레이션·시리얼라이저 30분 / 제출물 폼에 `repo_url` 입력
    15분 / 심사 화면 데모 패널 30분 / GitHub 파일트리·README·코드뷰 패널 2~3시간 /
    테스트 30분 — 총 반나절.
- **학과/동아리 공모전 시범 적용** — 소규모 실사용 파일럿 진행, 피드백 반영해 반복 개선.
  운영자 계정은 `python manage.py createsuperuser`(또는 admin에서 `is_staff` 체크)로 만든다.
- (선택) 커스텀 도메인 연결 — 비용·절차는 위 [커스텀 도메인 (예정)](#커스텀-도메인-예정-2026-09-03-조사) 참고.
  프론트만 먼저 붙이는 구성 추천.
- (선택) 대회 기간 Render Starter 플랜으로 슬립 방지 (월 $7)
- (후속 과제) 스코어보드 WebSocket 전환 — 현재 5초 REST 폴링으로 파일럿 규모(수십 팀·수 명의
  심사위원)는 충분. Render 단일 프로세스에서 Django Channels + Redis를 붙이는 비용 대비 이점이
  작아 보류. 참가 팀이 수백 단위로 늘거나 폴링 부하가 문제 되면 재검토.

---

## 트러블슈팅 / 이슈 기록

과거에 겪은 문제와 해결 과정을 기록용으로 모아둔 섹션입니다.

### Render 배포: `relation "posts_post" does not exist` (500 에러)

원인: `Procfile`에 Heroku 방식인 `release: python manage.py migrate`를 썼는데, Render는
이 `release` 단계를 지원하지 않아 마이그레이션이 한 번도 실행되지 않음.
해결: `Procfile`을 `web: python manage.py migrate --noinput && gunicorn config.wsgi`
한 줄로 합쳐서, 매 배포/재시작 시 마이그레이션이 먼저 실행되도록 수정.

### Render 배포: Procfile을 고쳤는데도 그대로 500

원인: Render 대시보드의 **Start Command** 필드에 `gunicorn config.wsgi`가 직접
입력되어 있어 `Procfile` 내용을 완전히 무시하고 있었음 (대시보드 Start Command가
Procfile보다 우선 적용됨).
해결: 대시보드 Start Command 값을 위 한 줄로 직접 교체.

### Render 프로덕션에서 `/admin/`이 500 (2026-09-03, 해결됨)

증상: API는 정상인데 https://web-claude-t.onrender.com/admin/login/ 만 500.
원인: `settings.py`가 whitenoise의 `CompressedManifestStaticFilesStorage`를 쓰는데 배포
과정에 `collectstatic`이 없어 `staticfiles/` 매니페스트가 존재하지 않았음. `DEBUG=False`에서
admin 템플릿의 `{% static %}`가 매니페스트를 찾다 `ValueError: Missing staticfiles manifest
entry`로 터짐(API 응답은 static을 쓰지 않아 멀쩡했음). 로컬에서 `DJANGO_DEBUG=False`로
재현 → `collectstatic` 후 200 확인.
해결: `Procfile`과 Render **Start Command**에 `python manage.py collectstatic --noinput`을
`migrate` 다음에 추가.

### Render 디버깅 팁

`DJANGO_ALLOWED_HOSTS`가 배포 도메인과 정확히 일치해야 함. 원인 파악이 안 될 때는
`DJANGO_DEBUG=True`로 잠깐 바꿔 Django 에러 페이지의 traceback을 직접 확인한 뒤 다시
`False`로 되돌리는 방식이 가장 빠름 (Render 접근 로그만으로는 500 원인이 안 보임).

### Windows 호스트에서 `npm run dev`가 `'vite' is not recognized`로 실패

원인: `node_modules`를 devcontainer(Linux)에서 설치한 채로 Windows npm으로 실행하면
`.bin`의 심볼릭 링크가 Windows용 실행 파일이 아님.
해결: Windows에서 직접 작업할 때는 `node_modules`를 지우고 Windows npm으로 다시
`npm install`.

### Vercel 프로덕션에서 모든 API 호출 404 (2026-09-02, 해결됨)

증상: 회원가입/로그인 등 백엔드 호출이 전부 "요청에 실패했습니다 (404)".
원인: Vercel의 `VITE_API_BASE_URL` 환경변수가 `https://web-claude-t.onrender.com`으로
설정되어 있었음(끝에 `/api` 누락). `frontend/src/api.ts`가 `${API_BASE_URL}${path}`
형태로 요청을 만들어 실제로는 `/auth/register/`로 나갔는데, Django에는 `/api/auth/register/`만
존재해 404. 배포된 JS 번들(`assets/index-*.js`)에서 baked-in 값을 직접 확인해 원인을
특정함.
해결: `VITE_API_BASE_URL`을 `https://web-claude-t.onrender.com/api`로 수정 후 재배포.
프로덕션에서 회원가입→자동 로그인까지 재검증 완료.

