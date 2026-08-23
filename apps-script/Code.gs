// 대상 스프레드시트: https://docs.google.com/spreadsheets/d/1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA
//
// 시트 구성 (탭 3개, 각 탭은 속성 중복 없는 단일 테이블):
//   LIKE                 - 정규화된 원본 데이터: Date, Hour, PostID, PostTitle, LikeCount, LastUpdated
//                          (날짜+시간+포스트 단위 사실 테이블. "모든 데이터"의 단일 출처)
//   Pending              - 클릭 원시 로그 (내부 처리용, 트리거 실행 후 비워짐)
//   일별 좋아요 집계      - 대시보드용 요약: 날짜, 오늘의 총 좋아요 수, 최다 좋아요 포스트
//                          (매번 LIKE 테이블에서 다시 계산해서 덮어씀 — 별도로 값을 누적하지 않음)
//
// 흐름:
//   1) doPost: 클릭 1건마다 즉시 Pending에 원시 로그로 적재 (빠른 응답)
//   2) aggregateAndClearPending: 시간 기반 트리거(1분마다, 브라우저와 무관)로
//      Pending을 읽어 LIKE에 합산하고, 영향받은 날짜의 "일별 좋아요 집계"를 재계산한 뒤
//      Pending을 비움.
//
// 배포/트리거 설정 방법은 apps-script/README.md 참고.

var SPREADSHEET_ID = "1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA";

var LIKE_SHEET_NAME = "LIKE";
var PENDING_SHEET_NAME = "Pending";
var DAILY_SUMMARY_SHEET_NAME = "일별 좋아요 집계";

var LIKE_HEADER = ["Date", "Hour", "PostID", "PostTitle", "LikeCount", "LastUpdated"];
var PENDING_HEADER = ["ServerTimestamp", "PostID", "PostTitle"];
var DAILY_SUMMARY_HEADER = ["날짜", "오늘의 총 좋아요 수", "최다 좋아요 포스트"];

function getOrCreateSheet_(ss, name, header) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
  }
  return sheet;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 시트에 "yyyy-MM-dd" 문자열을 쓰면 Google Sheets가 자동으로 진짜 Date 값으로
// 바꿔버리는 경우가 있다. 비교할 때는 항상 이 함수로 정규화해서, 셀에 Date가
// 들어있든 문자열이 들어있든 같은 날짜면 반드시 매칭되게 한다.
function normalizeDateStr_(value, tz) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, tz, "yyyy-MM-dd");
  }
  return String(value);
}

// key 컬럼들이 일치하는 행을 찾아 LikeCount에 count를 더하고, 없으면 새 행을 추가한다.
// 첫 번째 key 컬럼(index 0)은 항상 날짜로 취급해 Date/문자열 혼용 문제를 피한다.
function upsertSum_(sheet, keyValues, keyColCount, countCol, title, count, now, tz) {
  var lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    var keys = sheet.getRange(2, 1, lastRow - 1, keyColCount).getValues();
    for (var i = 0; i < keys.length; i++) {
      var match = true;
      for (var c = 0; c < keyColCount; c++) {
        var cellStr = c === 0 ? normalizeDateStr_(keys[i][c], tz) : String(keys[i][c]);
        var targetStr = c === 0 ? normalizeDateStr_(keyValues[c], tz) : String(keyValues[c]);
        if (cellStr !== targetStr) {
          match = false;
          break;
        }
      }
      if (match) {
        var rowIndex = i + 2;
        var countCell = sheet.getRange(rowIndex, countCol);
        countCell.setValue(countCell.getValue() + count);
        sheet.getRange(rowIndex, countCol + 1).setValue(now); // LastUpdated
        return;
      }
    }
  }

  var row = keyValues.slice();
  row.splice(keyColCount, 0, title || "");
  row.push(count, now);
  sheet.appendRow(row);
}

// keyCol 값이 일치하는 행을 찾아 통째로 덮어쓰고, 없으면 새 행을 추가한다. (합산이 아니라 재계산 결과로 교체)
// keyCol은 항상 날짜 컬럼이라고 가정한다.
function upsertOverwriteRow_(sheet, keyValue, keyCol, rowValues, tz) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var keys = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
    var targetStr = normalizeDateStr_(keyValue, tz);
    for (var i = 0; i < keys.length; i++) {
      if (normalizeDateStr_(keys[i][0], tz) === targetStr) {
        sheet.getRange(i + 2, 1, 1, rowValues.length).setValues([rowValues]);
        return;
      }
    }
  }
  sheet.appendRow(rowValues);
}

// LIKE 테이블에서 특정 날짜의 데이터를 다시 훑어 "일별 좋아요 집계" 한 행을 갱신한다.
function recomputeDailySummary_(likeSheet, dailySheet, date, tz) {
  var lastRow = likeSheet.getLastRow();
  var totalCount = 0;
  var postCounts = {}; // postId -> {title, count}

  if (lastRow > 1) {
    var values = likeSheet.getRange(2, 1, lastRow - 1, 5).getValues(); // Date,Hour,PostID,PostTitle,LikeCount
    values.forEach(function (row) {
      if (normalizeDateStr_(row[0], tz) !== date) return;
      var postId = row[2];
      var title = row[3];
      var count = Number(row[4]) || 0;

      totalCount += count;
      if (!postCounts[postId]) postCounts[postId] = { title: title, count: 0 };
      postCounts[postId].count += count;
    });
  }

  var topTitle = "";
  var topCount = -1;
  Object.keys(postCounts).forEach(function (postId) {
    if (postCounts[postId].count > topCount) {
      topCount = postCounts[postId].count;
      topTitle = postCounts[postId].title;
    }
  });

  upsertOverwriteRow_(dailySheet, date, 1, [date, totalCount, topTitle], tz);

  var dailyLastRow = dailySheet.getLastRow();
  if (dailyLastRow > 2) {
    dailySheet.getRange(2, 1, dailyLastRow - 1, 3).sort(1);
  }
}

// 클릭 즉시 호출됨. 무거운 집계 연산 없이 Pending에만 빠르게 적재한다.
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var postId = body.postId;
    var title = body.title || "";
    if (!postId) {
      return jsonOutput_({ status: "error", message: "postId is required" });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var pendingSheet = getOrCreateSheet_(ss, PENDING_SHEET_NAME, PENDING_HEADER);
    pendingSheet.appendRow([new Date(), postId, title]);

    return jsonOutput_({ status: "ok" });
  } catch (err) {
    return jsonOutput_({ status: "error", message: err.message });
  } finally {
    lock.releaseLock();
  }
}

// 시간 기반 트리거로 1분마다 실행됨 (브라우저 상태와 무관, Google 서버에서 동작).
function aggregateAndClearPending() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var pendingSheet = getOrCreateSheet_(ss, PENDING_SHEET_NAME, PENDING_HEADER);

    var lastRow = pendingSheet.getLastRow();
    if (lastRow <= 1) return; // 처리할 데이터 없음

    var rows = pendingSheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var tz = Session.getScriptTimeZone();

    var hourlySums = {}; // key: date|hour|postId
    var touchedDates = {};

    rows.forEach(function (row) {
      var ts = row[0];
      var postId = row[1];
      var title = row[2];
      if (!postId) return;

      var date = Utilities.formatDate(ts, tz, "yyyy-MM-dd");
      var hour = Number(Utilities.formatDate(ts, tz, "H"));

      var hKey = date + "|" + hour + "|" + postId;
      if (!hourlySums[hKey]) {
        hourlySums[hKey] = { date: date, hour: hour, postId: postId, title: title, count: 0 };
      }
      hourlySums[hKey].count++;
      touchedDates[date] = true;
    });

    var likeSheet = getOrCreateSheet_(ss, LIKE_SHEET_NAME, LIKE_HEADER);
    likeSheet.getRange("A:A").setNumberFormat("@"); // Date 컬럼을 텍스트로 고정해 자동 변환 방지
    var now = new Date();

    Object.keys(hourlySums).forEach(function (k) {
      var s = hourlySums[k];
      upsertSum_(likeSheet, [s.date, s.hour, s.postId], 3, 5, s.title, s.count, now, tz);
    });

    // 합산이 끝난 원시 로그는 삭제해 Pending 시트 크기를 작게 유지한다.
    pendingSheet.deleteRows(2, lastRow - 1);

    var dailySheet = getOrCreateSheet_(ss, DAILY_SUMMARY_SHEET_NAME, DAILY_SUMMARY_HEADER);
    dailySheet.getRange("A:A").setNumberFormat("@"); // 날짜 컬럼을 텍스트로 고정해 자동 변환 방지
    Object.keys(touchedDates).forEach(function (date) {
      recomputeDailySummary_(likeSheet, dailySheet, date, tz);
    });
  } finally {
    lock.releaseLock();
  }
}

// 기존에 LIKE 시트가 Post/Hourly/Daily/Pending 열 블록으로 되어 있던 이전 버전 데이터를
// 새 정규화 구조로 옮기는 1회성 함수. Apps Script 편집기에서 딱 한 번만 수동 실행할 것.
function migrateToNormalizedSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var likeSheet = ss.getSheetByName(LIKE_SHEET_NAME);
  if (!likeSheet) {
    Logger.log("LIKE 시트가 없어 마이그레이션할 데이터가 없습니다.");
    return;
  }

  var OLD_HOURLY_START_COL = 6; // 이전 버전의 Hourly 블록(F열) 위치
  var lastRow = likeSheet.getLastRow();
  var extracted = [];

  if (lastRow > 1) {
    var maxScanRows = likeSheet.getMaxRows() - 1;
    var values = likeSheet.getRange(2, OLD_HOURLY_START_COL, maxScanRows, 6).getValues();
    values.forEach(function (row) {
      if (row[0] !== "" && row[0] !== null && row[0] !== undefined) {
        extracted.push(row); // Date, Hour, PostID, PostTitle, LikeCount, LastUpdated
      }
    });
  }

  // 이전 블록 레이아웃 전체 삭제 (A:U 범위 정도면 충분히 덮음)
  likeSheet.getRange(1, 1, likeSheet.getMaxRows(), 21).clearContent();

  likeSheet.getRange(1, 1, 1, LIKE_HEADER.length).setValues([LIKE_HEADER]);
  if (extracted.length) {
    likeSheet.getRange(2, 1, extracted.length, 6).setValues(extracted);
  }

  getOrCreateSheet_(ss, PENDING_SHEET_NAME, PENDING_HEADER);
  var dailySheet = getOrCreateSheet_(ss, DAILY_SUMMARY_SHEET_NAME, DAILY_SUMMARY_HEADER);
  dailySheet.getRange("A:A").setNumberFormat("@");

  var tz = Session.getScriptTimeZone();
  var dates = {};
  extracted.forEach(function (row) {
    dates[normalizeDateStr_(row[0], tz)] = true;
  });
  Object.keys(dates).forEach(function (date) {
    recomputeDailySummary_(likeSheet, dailySheet, date, tz);
  });

  Logger.log("마이그레이션 완료: LIKE " + extracted.length + "행 이전, 일별 집계 " + Object.keys(dates).length + "일 계산됨.");
}

// LIKE 시트의 Date 컬럼이 문자열/Date 타입으로 뒤섞여서 (날짜,시간,포스트) 합산이
// 제대로 안 되고 중복 행이 쌓인 경우를 고치는 1회성 복구 함수. 모든 행을 다시 훑어
// 같은 (날짜,시간,포스트)를 하나로 합치고, 날짜를 텍스트로 통일해서 다시 쓴 뒤
// 일별 좋아요 집계도 전부 재계산한다. Apps Script 편집기에서 딱 한 번만 실행할 것.
function repairDuplicateLikeRows() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var likeSheet = getOrCreateSheet_(ss, LIKE_SHEET_NAME, LIKE_HEADER);
  var tz = Session.getScriptTimeZone();

  var lastRow = likeSheet.getLastRow();
  var merged = {}; // key: date|hour|postId -> {date,hour,postId,title,count,lastUpdated}

  if (lastRow > 1) {
    var values = likeSheet.getRange(2, 1, lastRow - 1, 6).getValues();
    values.forEach(function (row) {
      var date = normalizeDateStr_(row[0], tz);
      var hour = row[1];
      var postId = row[2];
      var title = row[3];
      var count = Number(row[4]) || 0;
      var lastUpdated = row[5];
      if (!postId) return;

      var key = date + "|" + hour + "|" + postId;
      if (!merged[key]) {
        merged[key] = { date: date, hour: hour, postId: postId, title: title, count: 0, lastUpdated: lastUpdated };
      }
      merged[key].count += count;
      if (lastUpdated instanceof Date && (!(merged[key].lastUpdated instanceof Date) || lastUpdated > merged[key].lastUpdated)) {
        merged[key].lastUpdated = lastUpdated;
        merged[key].title = title;
      }
    });
  }

  var rows = Object.keys(merged).map(function (k) {
    var m = merged[k];
    return [m.date, m.hour, m.postId, m.title, m.count, m.lastUpdated];
  });

  likeSheet.getRange(2, 1, Math.max(likeSheet.getMaxRows() - 1, rows.length), 6).clearContent();
  likeSheet.getRange("A:A").setNumberFormat("@");
  likeSheet.getRange(1, 1, 1, LIKE_HEADER.length).setValues([LIKE_HEADER]);
  if (rows.length) {
    likeSheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }

  var dailySheet = getOrCreateSheet_(ss, DAILY_SUMMARY_SHEET_NAME, DAILY_SUMMARY_HEADER);
  dailySheet.getRange("A:A").setNumberFormat("@");
  var dailyLastRow = dailySheet.getLastRow();
  if (dailyLastRow > 1) {
    dailySheet.getRange(2, 1, dailyLastRow - 1, DAILY_SUMMARY_HEADER.length).clearContent();
  }

  var dates = {};
  rows.forEach(function (row) {
    dates[row[0]] = true;
  });
  Object.keys(dates).forEach(function (date) {
    recomputeDailySummary_(likeSheet, dailySheet, date, tz);
  });

  Logger.log(
    "복구 완료: LIKE " + rows.length + "행으로 정리(합산), 일별 집계 " + Object.keys(dates).length + "일 재계산됨."
  );
}

// Apps Script 편집기에서 이 함수를 한 번만 수동 실행하면 1분 주기 트리거가 등록된다.
// 이미 등록되어 있다면 다시 실행해도 중복 없이 안전하다 (기존 트리거를 지우고 새로 만듦).
function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "aggregateAndClearPending") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("aggregateAndClearPending").timeBased().everyMinutes(1).create();
}

function doGet(e) {
  return jsonOutput_({ status: "ok", message: "LIKE aggregator web app is running." });
}
