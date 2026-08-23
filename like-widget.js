(function () {
  "use strict";

  // 이 위젯은 script.js와 완전히 같은 localStorage 키/로직을 공유하도록 설계했다.
  // 그래서 한 페이지(Canva 등)에 포스트별로 이 위젯을 여러 개 iframe으로 박아놔도,
  // 같은 오리진(GitHub Pages)이라 localStorage를 공유하며 하루치 누적이 자연스럽게
  // 합쳐지고, 19:00에 그중 하나가 한 번에 배치로 전송한다.

  var params = new URLSearchParams(window.location.search);
  var postId = params.get("postId");
  var postTitle = params.get("title") || postId || "";

  var btn = document.getElementById("like-btn");
  var countEl = document.getElementById("like-count");
  var errorEl = document.getElementById("like-error");

  if (!postId) {
    if (errorEl) errorEl.hidden = false;
    if (btn) btn.disabled = true;
    return;
  }

  var CONFIG = window.LIKE_SYNC_CONFIG || {};
  var APPS_SCRIPT_URL = CONFIG.APPS_SCRIPT_URL || "";
  var CHECK_INTERVAL_MS = CONFIG.CHECK_INTERVAL_MS || 60000;

  var TOTALS_KEY = "like_daily_totals_v1";
  var LAST_SENT_KEY = "like_daily_last_sent_v1";
  var SEND_LOCK_KEY = "like_daily_send_lock_v1"; // 같은 오리진의 여러 탭/iframe이 동시에 전송하는 걸 방지
  var SEND_LOCK_TTL_MS = 10000;
  var SEND_HOUR = 19;

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

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

  function renderCount() {
    var totals = loadTotals();
    if (countEl) countEl.textContent = (totals[postId] && totals[postId].count) || 0;
  }

  function recordLike() {
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

  function maybeSendDailyBatch() {
    var currentBucket = bucketDateKey(new Date());
    var lastSent = localStorage.getItem(LAST_SENT_KEY);
    if (lastSent === currentBucket) return;

    var totals = loadTotals();
    if (!hasData(totals)) {
      localStorage.setItem(LAST_SENT_KEY, currentBucket);
      return;
    }

    if (!tryClaimSendLock()) return; // 다른 iframe/탭이 지금 막 시도 중

    sendDailyBatch(currentBucket, totals).then(function (ok) {
      if (ok) {
        saveTotals({});
        localStorage.setItem(LAST_SENT_KEY, currentBucket);
        renderCount();
      }
    });
  }

  renderCount();

  if (btn) {
    btn.addEventListener("click", function () {
      var newCount = recordLike();
      if (countEl) countEl.textContent = newCount;
      btn.classList.add("liked");
    });
  }

  maybeSendDailyBatch();
  setInterval(maybeSendDailyBatch, CHECK_INTERVAL_MS);
})();
