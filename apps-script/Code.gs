// 대상 스프레드시트: https://docs.google.com/spreadsheets/d/1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA
//
// 시트 1개("LIKE") 안에 열 블록으로 구분된 표 4개를 둔다. (여러 시트 탭으로 나누지 않음)
//   [A:D]  Post   - 포스트별 전체 누적 합계
//   [F:K]  Hourly - 날짜+시간별 합계 ("시각별")
//   [M:Q]  Daily  - 날짜별 합계
//   [S:U]  Pending- 클릭 원시 로그 (내부 처리용, 매 트리거 실행 후 비워짐)
// 표 사이에는 구분을 위한 빈 열을 하나씩 둔다.
//
// 흐름:
//   1) doPost: 클릭 1건마다 즉시 Pending 블록에 원시 로그로 적재 (빠른 응답)
//   2) aggregateAndClearPending: 시간 기반 트리거(1분마다, 브라우저와 무관)로
//      Pending을 읽어 Post/Hourly/Daily 블록에 합산하고 Pending 블록만 비움.
//
// 배포/트리거 설정 방법은 apps-script/README.md 참고.

var SPREADSHEET_ID = "1MOCGapRs-sc1civpI3wwV0BsYm85gMSTKsHoZOVmHJA";
var SHEET_NAME = "LIKE";

var BLOCKS = {
  post: { startCol: 1, header: ["PostID", "PostTitle", "LikeCount", "LastUpdated"] }, // A:D
  hourly: { startCol: 6, header: ["Date", "Hour", "PostID", "PostTitle", "LikeCount", "LastUpdated"] }, // F:K
  daily: { startCol: 13, header: ["Date", "PostID", "PostTitle", "LikeCount", "LastUpdated"] }, // M:Q
  pending: { startCol: 19, header: ["ServerTimestamp", "PostID", "PostTitle"] } // S:U
};

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  Object.keys(BLOCKS).forEach(function (key) {
    ensureHeader_(sheet, BLOCKS[key]);
  });
  return sheet;
}

function ensureHeader_(sheet, block) {
  var range = sheet.getRange(1, block.startCol, 1, block.header.length);
  var existing = range.getValues()[0];
  var isEmpty = existing.every(function (v) {
    return v === "" || v === null;
  });
  if (isEmpty) {
    range.setValues([block.header]);
  }
}

// 해당 블록(열 범위) 안에서만 마지막으로 데이터가 있는 행 번호를 찾는다.
// (다른 블록의 행 길이와 독립적으로 관리하기 위함)
function getBlockLastRow_(sheet, block) {
  var maxRows = sheet.getMaxRows();
  var values = sheet.getRange(1, block.startCol, maxRows, 1).getValues();
  var lastRow = 1; // 헤더 행
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] !== "" && values[i][0] !== null && values[i][0] !== undefined) {
      lastRow = i + 1;
    }
  }
  return lastRow;
}

function appendBlockRow_(sheet, block, rowValues) {
  var lastRow = getBlockLastRow_(sheet, block);
  sheet.getRange(lastRow + 1, block.startCol, 1, rowValues.length).setValues([rowValues]);
}

// key 컬럼들이 일치하는 행을 찾아 LikeCount에 count를 더하고, 없으면 새 행을 추가한다.
// countColOffset: 블록 내에서 LikeCount 컬럼의 0-based 오프셋 (바로 다음 컬럼이 LastUpdated)
function upsertSumBlock_(sheet, block, keyValues, keyColCount, countColOffset, title, count, now) {
  var lastRow = getBlockLastRow_(sheet, block);

  if (lastRow > 1) {
    var keys = sheet.getRange(2, block.startCol, lastRow - 1, keyColCount).getValues();
    for (var i = 0; i < keys.length; i++) {
      var match = true;
      for (var c = 0; c < keyColCount; c++) {
        if (String(keys[i][c]) !== String(keyValues[c])) {
          match = false;
          break;
        }
      }
      if (match) {
        var rowIndex = i + 2;
        var countCol = block.startCol + countColOffset;
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
  appendBlockRow_(sheet, block, row);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 클릭 즉시 호출됨. 무거운 집계 연산 없이 Pending 블록에만 빠르게 적재한다.
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

    var sheet = getSheet_();
    appendBlockRow_(sheet, BLOCKS.pending, [new Date(), postId, title]);

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
    var sheet = getSheet_();
    var pendingLastRow = getBlockLastRow_(sheet, BLOCKS.pending);
    if (pendingLastRow <= 1) return; // 처리할 데이터 없음

    var rows = sheet.getRange(2, BLOCKS.pending.startCol, pendingLastRow - 1, 3).getValues();
    var tz = Session.getScriptTimeZone();

    var postSums = {}; // key: postId
    var hourlySums = {}; // key: date|hour|postId
    var dailySums = {}; // key: date|postId

    rows.forEach(function (row) {
      var ts = row[0];
      var postId = row[1];
      var title = row[2];
      if (!postId) return;

      var date = Utilities.formatDate(ts, tz, "yyyy-MM-dd");
      var hour = Number(Utilities.formatDate(ts, tz, "H"));

      if (!postSums[postId]) postSums[postId] = { postId: postId, title: title, count: 0 };
      postSums[postId].count++;

      var hKey = date + "|" + hour + "|" + postId;
      if (!hourlySums[hKey]) {
        hourlySums[hKey] = { date: date, hour: hour, postId: postId, title: title, count: 0 };
      }
      hourlySums[hKey].count++;

      var dKey = date + "|" + postId;
      if (!dailySums[dKey]) {
        dailySums[dKey] = { date: date, postId: postId, title: title, count: 0 };
      }
      dailySums[dKey].count++;
    });

    var now = new Date();

    Object.keys(postSums).forEach(function (k) {
      var s = postSums[k];
      upsertSumBlock_(sheet, BLOCKS.post, [s.postId], 1, 2, s.title, s.count, now);
    });
    Object.keys(hourlySums).forEach(function (k) {
      var s = hourlySums[k];
      upsertSumBlock_(sheet, BLOCKS.hourly, [s.date, s.hour, s.postId], 3, 4, s.title, s.count, now);
    });
    Object.keys(dailySums).forEach(function (k) {
      var s = dailySums[k];
      upsertSumBlock_(sheet, BLOCKS.daily, [s.date, s.postId], 2, 3, s.title, s.count, now);
    });

    // 합산이 끝난 원시 로그(Pending 블록)만 비운다. 다른 블록의 행에는 영향 없음.
    sheet.getRange(2, BLOCKS.pending.startCol, pendingLastRow - 1, 3).clearContent();
  } finally {
    lock.releaseLock();
  }
}

// Apps Script 편집기에서 이 함수를 한 번만 수동 실행하면 1분 주기 트리거가 등록된다.
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
