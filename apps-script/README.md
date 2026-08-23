# Google Apps Script 배포 방법

구글 계정 인증이 필요한 단계이므로 아래 과정은 직접 진행해 주세요.

1. 스프레드시트 열기: https://docs.google.com/spreadsheets/d/1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA
   (`gustjr3332@gmail.com` 계정으로 접근 권한이 있어야 합니다.)
2. 메뉴에서 **확장 프로그램 → Apps Script** 클릭.
3. 기본으로 생성된 `Code.gs` 내용을 전부 지우고, 이 폴더의 `Code.gs` 내용을 붙여넣기.
4. 상단 **배포 → 새 배포** 클릭.
   - 유형: **웹 앱**
   - 다음 사용자 권한으로 실행: **나(본인 계정)**
   - 액세스 권한이 있는 사용자: **모든 사용자** (익명 클라이언트에서 POST 요청을 보내야 하므로 필요)
5. 배포 후 발급되는 **웹 앱 URL**(`https://script.google.com/macros/s/xxxx/exec` 형태)을 복사.
6. 프로젝트 루트의 `config.js` 파일을 열어 `APPS_SCRIPT_URL` 값을 방금 복사한 URL로 교체.
7. 처음 배포 시 구글이 권한 승인(스프레드시트 접근 등)을 요청합니다. 승인해야 정상 동작합니다.

## 8. 1분마다 자동 집계 트리거 등록 (★ 반드시 필요, 한 번만 하면 됨)

브라우저가 열려 있지 않아도 서버(Google) 쪽에서 알아서 집계가 돌아가게 하려면
시간 기반 트리거를 등록해야 합니다.

1. Apps Script 편집기 상단의 함수 선택 드롭다운에서 **`createTrigger`** 선택.
2. **실행(▶)** 버튼 클릭.
3. 처음 실행 시 권한 승인 팝업이 뜨면 승인.
4. 왼쪽 메뉴의 시계 아이콘(트리거)을 클릭하면 `aggregateAndClearPending` 함수가
   "시간 기반 / 분 타이머 / 1분마다"로 등록된 것을 확인할 수 있습니다.

이후부터는 브라우저를 아무도 켜놓지 않아도 1분마다 Google 서버가 알아서
`LIKE` 시트의 Pending 영역을 읽어 Post/Hourly/Daily 영역에 합산하고 Pending 영역을 비웁니다.

## 시트 구조

이제 시트 탭은 **`LIKE` 하나만** 사용합니다. 그 안에 표 4개가 열(컬럼) 블록으로 나란히 배치됩니다.

| 표 | 위치(열) | 컬럼 | 의미 |
|---|---|---|---|
| Post (포스트별) | A:D | PostID, PostTitle, LikeCount, LastUpdated | 포스트별 전체 누적 합계 |
| Hourly (시각별) | F:K | Date, Hour, PostID, PostTitle, LikeCount, LastUpdated | 날짜+시간 단위 합계 |
| Daily (날짜별) | M:Q | Date, PostID, PostTitle, LikeCount, LastUpdated | 날짜 단위 합계 |
| Pending (내부용) | S:U | ServerTimestamp, PostID, PostTitle | 클릭 원시 로그, 트리거가 처리 후 자동으로 비움 |

표 사이 E, L, R 열은 구분을 위한 빈 열입니다. Pending은 실질적인 리포트가 아니라
내부 처리용 큐이므로 필요하면 시트에서 숨김 처리해도 됩니다(열을 숨겨도 스크립트 동작에는 영향 없음).

### 기존에 `Pending`/`Hourly`/`Daily`가 별도 시트 탭으로 있었다면
새 `LIKE` 시트가 정상적으로 데이터를 쌓기 시작한 것을 확인한 뒤, 기존 `Pending`/`Hourly`/`Daily`
탭은 더 이상 사용하지 않으므로 수동으로 삭제하셔도 됩니다(자동 삭제는 하지 않았습니다).

## 동작 확인
- 브라우저에서 웹 앱 URL을 그냥 열어보면(`GET` 요청) `{"status":"ok", ...}` 응답이 보이면 배포가 정상입니다.
- 블로그 페이지에서 LIKE 버튼을 누르면 클릭 즉시 `LIKE` 시트의 Pending 영역(S:U)에 한 줄이 추가됩니다 (탭을 바로 닫아도 무관).
- 최대 1분 안에 트리거가 실행되어 Pending 데이터가 Post/Hourly/Daily 영역으로 합산되고 Pending 영역은 비워집니다.

## 코드를 수정한 경우
- `Code.gs` 내용을 바꿨다면 **배포 → 배포 관리 → 수정(연필 아이콘) → 새 버전으로 배포** 를 눌러야 웹 앱 URL(doPost/doGet)에 변경사항이 반영됩니다. (URL 자체는 바뀌지 않습니다.)
- `aggregateAndClearPending` 함수의 로직만 바꾼 경우에는 재배포 없이도 다음 트리거 실행부터 바로 반영됩니다. (트리거는 웹 앱 배포와 별개로, 항상 최신 코드로 실행됩니다.)
- 이미 `createTrigger`를 한 번 실행해서 트리거가 등록되어 있다면, 이번 구조 변경 때문에 다시 실행할 필요는 없습니다(함수 이름이 그대로라 기존 트리거가 새 코드를 그대로 사용합니다).
