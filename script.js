(function () {
  "use strict";

  var CONFIG = window.LIKE_SYNC_CONFIG || {};
  var APPS_SCRIPT_URL = CONFIG.APPS_SCRIPT_URL || "";
  var CHECK_INTERVAL_MS = CONFIG.CHECK_INTERVAL_MS || 60000;

  var TOTALS_KEY = "like_daily_totals_v1"; // 오늘 버킷에 누적된 포스트별 좋아요 수 (화면 표시 = 이 값 그대로)
  var LAST_SENT_KEY = "like_daily_last_sent_v1"; // 마지막으로 전송에 성공한 "버킷 날짜"
  var SEND_LOCK_KEY = "like_daily_send_lock_v1"; // 같은 오리진의 여러 탭/iframe이 동시에 전송하는 걸 방지
  var SEND_LOCK_TTL_MS = 10000;
  var SEND_HOUR = 19; // 매일 이 시각에 그날 누적분을 한 번에 전송

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // 19:00을 하루 경계로 삼는 버킷 날짜. 예: 8/23 18:59 -> "2026-08-22", 8/23 19:00 -> "2026-08-23"
  function bucketDateKey(date) {
    var d = new Date(date.getTime());
    if (d.getHours() < SEND_HOUR) {
      d.setDate(d.getDate() - 1);
    }
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function loadTotals() {
    return loadJSON(TOTALS_KEY, {});
  }

  function saveTotals(totals) {
    saveJSON(TOTALS_KEY, totals);
  }

  function hasData(totals) {
    return Object.keys(totals).some(function (id) {
      return totals[id].count > 0;
    });
  }

  function tryClaimSendLock() {
    var now = Date.now();
    var raw = localStorage.getItem(SEND_LOCK_KEY);
    if (raw && now - Number(raw) < SEND_LOCK_TTL_MS) return false;
    localStorage.setItem(SEND_LOCK_KEY, String(now));
    return true;
  }

  function renderCounts() {
    var totals = loadTotals();
    document.querySelectorAll(".post").forEach(function (postEl) {
      var postId = postEl.dataset.postId;
      var countEl = postEl.querySelector(".like-count");
      if (countEl) countEl.textContent = (totals[postId] && totals[postId].count) || 0;
    });
  }

  // 클릭은 서버로 보내지 않고 이 브라우저에만 누적한다. 실제 전송은 하루 한 번, 19시에 배치로 나간다.
  function recordLike(postId, postTitle) {
    var totals = loadTotals();
    if (!totals[postId]) totals[postId] = { title: postTitle, count: 0 };
    totals[postId].count += 1;
    saveTotals(totals);
    return totals[postId].count;
  }

  function sendDailyBatch(date, posts) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.resolve(false);
    }
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // Content-Type을 text/plain으로 두면 브라우저가 preflight(OPTIONS)를 보내지
      // 않아 Apps Script 웹 앱과의 CORS 문제를 피할 수 있다. 본문은 서버에서 JSON.parse.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ date: date, posts: posts })
    })
      .then(function (res) {
        return res.ok ? res.json() : { status: "error" };
      })
      .then(function (data) {
        return data && data.status === "ok";
      })
      .catch(function () {
        return false;
      });
  }

  // 19:00 버킷 경계를 넘었는데 아직 이번 버킷을 못 보냈으면 한 번에 전송하고,
  // 성공했을 때만 화면 카운트를 0으로 초기화한다 (실패하면 다음 체크에서 계속 재시도).
  function maybeSendDailyBatch(setStatus) {
    var currentBucket = bucketDateKey(new Date());
    var lastSent = localStorage.getItem(LAST_SENT_KEY);
    if (lastSent === currentBucket) return Promise.resolve();

    var totals = loadTotals();
    if (!hasData(totals)) {
      localStorage.setItem(LAST_SENT_KEY, currentBucket);
      return Promise.resolve();
    }

    if (!tryClaimSendLock()) return Promise.resolve(); // 다른 탭이 지금 막 시도 중

    setStatus("19:00 집계 전송 중…");
    return sendDailyBatch(currentBucket, totals).then(function (ok) {
      if (ok) {
        saveTotals({});
        localStorage.setItem(LAST_SENT_KEY, currentBucket);
        renderCounts();
        setStatus("전송 완료 (" + new Date().toLocaleTimeString("ko-KR") + ")");
      } else {
        setStatus("전송 실패, 잠시 후 재시도합니다");
      }
    });
  }

  function init() {
    var statusEl = document.getElementById("sync-status");
    var setStatus = function (text) {
      if (statusEl) statusEl.textContent = text;
    };

    renderCounts();

    document.querySelectorAll(".like-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var postEl = btn.closest(".post");
        var postId = postEl.dataset.postId;
        var postTitle = postEl.dataset.postTitle;

        var newCount = recordLike(postId, postTitle);
        var countEl = btn.querySelector(".like-count");
        if (countEl) countEl.textContent = newCount;

        btn.classList.add("liked");
      });
    });

    maybeSendDailyBatch(setStatus);
    setInterval(function () {
      maybeSendDailyBatch(setStatus);
    }, CHECK_INTERVAL_MS);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
