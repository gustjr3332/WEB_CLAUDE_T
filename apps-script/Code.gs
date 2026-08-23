// 대상 스프레드시트: https://docs.google.com/spreadsheets/d/1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA
//
// 시트 구성 (탭 2개):
//   LIKE                 - 정규화된 원본 데이터: Date, PostID, PostTitle, LikeCount, LastUpdated
//                          (날짜+포스트 단위 사실 테이블. 내부용이라 기본적으로 숨김 처리)
//   일별 좋아요 집계      - 실제로 눈으로 보는 대시보드: 날짜, 오늘의 총 좋아요 수, 최다 좋아요 포스트
//                          (매번 LIKE 테이블에서 다시 계산해서 덮어씀 — 별도로 값을 누적하지 않음)
//
// 흐름 (2026-08 개편):
//   브라우저는 클릭할 때마다 서버로 보내지 않고 localStorage에만 누적하다가, 방문자 로컬 시각
//   19:00을 넘긴 첫 체크에서 그날 하루치 누적분을 한 번에 배치로 전송한다 (script.js 참고).
//   doPost가 이 배치를 받아 곧바로 LIKE에 합산하고 "일별 좋아요 집계"를 재계산한다.
//   (예전 버전의 "클릭마다 즉시 전송 + Pending + 1분 트리거" 구조는 더 이상 쓰지 않는다.)
//
// 배포 방법은 apps-script/README.md 참고.

var SPREADSHEET_ID = "1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA";

var LIKE_SHEET_NAME = "LIKE";
var DAILY_SUMMARY_SHEET_NAME = "일별 좋아요 집계";

var LIKE_HEADER = ["Date", "PostID", "PostTitle", "LikeCount", "LastUpdated"];
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
// 최다 좋아요 포스트 칸에는 "제목 (N개)" 형식으로 개수까지 같이 적는다.
function recomputeDailySummary_(likeSheet, dailySheet, date, tz) {
  var lastRow = likeSheet.getLastRow();
  var totalCount = 0;
  var postCounts = {}; // postId -> {title, count}

  if (lastRow > 1) {
    var values = likeSheet.getRange(2, 1, lastRow - 1, 4).getValues(); // Date,PostID,PostTitle,LikeCount
    values.forEach(function (row) {
      if (normalizeDateStr_(row[0], tz) !== date) return;
      var postId = row[1];
      var title = row[2];
      var count = Number(row[3]) || 0;

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

  var topDisplay = topCount > 0 ? topTitle + " (" + topCount + "개)" : "";

  upsertOverwriteRow_(dailySheet, date, 1, [date, totalCount, topDisplay], tz);

  var dailyLastRow = dailySheet.getLastRow();
  if (dailyLastRow > 2) {
    dailySheet.getRange(2, 1, dailyLastRow - 1, 3).sort(1);
  }
}

// 하루치 배치를 한 번에 받는다: { date: "yyyy-MM-dd", posts: { postId: {title, count} } }
// date는 클라이언트가 계산한 "19:00 기준 버킷 날짜"를 그대로 신뢰한다 (실제로 좋아요가
// 눌린 날짜를 아는 건 클라이언트뿐이라, 서버 수신 시각을 쓰면 오히려 하루씩 밀릴 수 있음).
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    var date = body.date;
    var posts = body.posts || {};
    if (!date) {
      return jsonOutput_({ status: "error", message: "date is required" });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var tz = Session.getScriptTimeZone();
    var now = new Date();

    var likeSheet = getOrCreateSheet_(ss, LIKE_SHEET_NAME, LIKE_HEADER);
    likeSheet.getRange("A:A").setNumberFormat("@"); // Date 컬럼을 텍스트로 고정해 자동 변환 방지

    var updated = 0;
    Object.keys(posts).forEach(function (postId) {
      var p = posts[postId];
      if (!p || !p.count) return;
      upsertSum_(likeSheet, [date, postId], 2, 4, p.title, p.count, now, tz);
      updated++;
    });

    if (updated > 0) {
      var dailySheet = getOrCreateSheet_(ss, DAILY_SUMMARY_SHEET_NAME, DAILY_SUMMARY_HEADER);
      dailySheet.getRange("A:A").setNumberFormat("@");
      recomputeDailySummary_(likeSheet, dailySheet, date, tz);
    }

    return jsonOutput_({ status: "ok", postsUpdated: updated });
  } catch (err) {
    return jsonOutput_({ status: "error", message: err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return jsonOutput_({ status: "ok", message: "LIKE aggregator web app is running." });
}

// ── 1회성 관리용 함수 (Apps Script 편집기에서 필요할 때만 수동 실행) ─────────────

// 이전 스키마(Date, Hour, PostID, PostTitle, LikeCount, LastUpdated)로 쌓여 있던 LIKE
// 데이터를 새 스키마(Hour 없이 날짜+포스트 단위)로 합쳐서 옮긴다. 기존 데이터를 잃지
// 않기 위한 1회성 함수. 여러 번 실행해도 안전하다 (매번 다시 합쳐서 같은 결과가 나옴).
function migrateDropHourColumn() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var likeSheet = ss.getSheetByName(LIKE_SHEET_NAME);
  if (!likeSheet) {
    Logger.log("LIKE 시트가 없어 옮길 데이터가 없습니다.");
    return;
  }

  var tz = Session.getScriptTimeZone();
  var lastRow = likeSheet.getLastRow();
  var lastCol = likeSheet.getLastColumn();
  var merged = {}; // key: date|postId

  if (lastRow > 1 && lastCol >= 6) {
    // 이전 스키마: Date(1), Hour(2), PostID(3), PostTitle(4), LikeCount(5), LastUpdated(6)
    var values = likeSheet.getRange(2, 1, lastRow - 1, 6).getValues();
    values.forEach(function (row) {
      var date = normalizeDateStr_(row[0], tz);
      var postId = row[2];
      var title = row[3];
      var count = Number(row[4]) || 0;
      var lastUpdated = row[5];
      if (!postId) return;

      var key = date + "|" + postId;
      if (!merged[key]) {
        merged[key] = { date: date, postId: postId, title: title, count: 0, lastUpdated: lastUpdated };
      }
      merged[key].count += count;
      if (lastUpdated instanceof Date && (!(merged[key].lastUpdated instanceof Date) || lastUpdated > merged[key].lastUpdated)) {
        merged[key].lastUpdated = lastUpdated;
        merged[key].title = title;
      }
    });
  } else if (lastRow > 1) {
    Logger.log("이미 새 스키마(Hour 없음)로 보입니다. 옮길 필요 없이 그대로 둡니다.");
    return;
  }

  var rows = Object.keys(merged).map(function (k) {
    var m = merged[k];
    return [m.date, m.postId, m.title, m.count, m.lastUpdated];
  });

  likeSheet.getRange(1, 1, likeSheet.getMaxRows(), Math.max(lastCol, 5)).clearContent();
  likeSheet.getRange("A:A").setNumberFormat("@");
  likeSheet.getRange(1, 1, 1, LIKE_HEADER.length).setValues([LIKE_HEADER]);
  if (rows.length) {
    likeSheet.getRange(2, 1, rows.length, 5).setValues(rows);
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

  Logger.log("이전 완료: LIKE " + rows.length + "행(날짜+포스트 단위), 일별 집계 " + Object.keys(dates).length + "일 재계산됨.");
}

// LIKE 탭은 내부용 원본 데이터라 화면에는 "일별 좋아요 집계"만 보이면 되므로 숨긴다.
// 필요하면 시트 하단 탭에서 우클릭 → 숨기기 취소로 언제든 다시 볼 수 있다.
function hideRawDataSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var likeSheet = ss.getSheetByName(LIKE_SHEET_NAME);
  if (likeSheet) likeSheet.hideSheet();

  var pendingSheet = ss.getSheetByName("Pending");
  if (pendingSheet) pendingSheet.hideSheet();
}

// 예전 버전에서 등록했던 1분 주기 트리거(aggregateAndClearPending)를 정리한다.
// 그 함수는 이번 개편으로 코드에서 삭제됐기 때문에, 트리거가 남아있으면 매분 실행
// 오류 알림 메일만 쌓이게 된다. Apps Script 편집기에서 한 번만 실행할 것.
function removeOldTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "aggregateAndClearPending") {
      ScriptApp.deleteTrigger(t);
    }
  });
}
