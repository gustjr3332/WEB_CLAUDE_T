# WEB_CLAUDE_T

https://gustjr3332.github.io/WEB_CLAUDE_T/

## 개발 방향 전환 (2026-08-28)

기존 버전은 정적 HTML/CSS/JS + Google Apps Script(Sheets) 조합으로, 좋아요 집계
정도의 단순 기능만 처리할 수 있습니다. 서비스를 실제로 확장(회원, 게시글 CRUD,
댓글 등)할 계획이라 아래와 같이 풀스택 구조로 전환합니다.

### 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 백엔드 | Python / Django (+ Django REST Framework) | REST API 서버로 프론트와 완전히 분리 |
| 프론트엔드 | TypeScript / React | SPA, 백엔드 API를 fetch/axios로 호출 |
| DB | PostgreSQL | 로컬 개발은 Docker, 배포는 PaaS 제공 관리형 DB 사용 |
| API 테스트 | Postman | 엔드포인트별 컬렉션 관리, 팀/개인 공유용 |
| 향후 하이브리드 앱 | Flutter | 같은 Django REST API를 그대로 재사용 (앱 전용 API 별도 개발 불필요) |

### 배포 계획

GitHub Pages는 정적 파일만 서빙 가능해 Django+PostgreSQL을 올릴 수 없습니다.

- **백엔드 + DB**: Render 또는 Railway 같은 무료/저가 PaaS에 배포 (Django 앱 +
  관리형 PostgreSQL을 함께 제공, 초기 단계에 적합)
- **프론트엔드**: 지금처럼 GitHub Pages(정적 빌드 산출물 배포)를 유지하거나,
  React 프로젝트 배포에 더 편한 Vercel로 이전 고려
- CORS: Django 쪽에서 프론트 도메인만 허용하도록 `django-cors-headers` 설정

#### 배포 준비 완료 항목 (backend)

- `gunicorn`(WSGI 서버), `whitenoise`(정적 파일 서빙), `dj-database-url`
  추가 (`requirements.txt`)
- `settings.py`: `DATABASE_URL` 환경변수가 있으면 그걸 파싱해서 DB 연결
  (없으면 기존 `POSTGRES_*` 변수로 로컬 개발 그대로 동작), whitenoise
  미들웨어/정적파일 스토리지 설정
- `backend/Procfile`: `release: python manage.py migrate` /
  `web: gunicorn config.wsgi`
- 대시보드에서 채워야 하는 환경변수: `DJANGO_SECRET_KEY`(새로 발급),
  `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS=<배포 도메인>`,
  `DATABASE_URL`(관리형 Postgres가 자동 제공), `CORS_ALLOWED_ORIGINS=<프론트 도메인>`

### 마이그레이션 메모

- 기존 `index.html` / `script.js` / `like-widget.*` / Apps Script 백엔드는
  당장 걷어내지 않고, 새 Django/React 스택 작업이 어느 정도 자리잡을 때까지
  병행 유지. 새 스택이 기존 기능(좋아요 집계 포함)을 커버하면 그때 정리.
- Flutter 앱은 이번 단계 범위 밖. Django REST API 설계 시 "웹 전용"이 아니라
  "웹+앱 공용"을 염두에 두고 인증(JWT 등)·응답 포맷을 잡아두면 이후 앱 붙일 때
  API를 다시 만들 필요가 없음.

### 다음 단계 (순서)

1. Django 프로젝트 + DRF 세팅, PostgreSQL 연결 (로컬 Docker)
2. 핵심 모델/엔드포인트 설계 (게시글, 좋아요 등 기존 기능부터 이식)
3. React(TS) 프로젝트 세팅, 기존 UI를 컴포넌트로 재구성해 API 연동
4. Postman 컬렉션 작성 및 엔드포인트 검증
5. Render/Railway에 백엔드+DB 배포, 프론트 배포처 확정
6. 기존 정적 사이트와 기능 패리티 확인 후 전환
