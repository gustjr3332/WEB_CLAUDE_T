(function () {
  "use strict";

  var CONFIG = window.LIKE_SYNC_CONFIG || {};
  var APPS_SCRIPT_URL = CONFIG.APPS_SCRIPT_URL || "";
  var RETRY_INTERVAL_MS = CONFIG.RETRY_INTERVAL_MS || 15000;

  var DISPLAY_KEY = "like_display_totals_v1"; // 이 브라우저 기준 누적 카운트 (버튼 표시용)
  var RETRY_QUEUE_KEY = "like_retry_queue_v1"; // 전송 실패한 클릭만 임시 보관, 성공하면 즉시 제거

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

  function loadDisplayTotals() {
    return loadJSON(DISPLAY_KEY, {});
  }

  function loadRetryQueue() {
    return loadJSON(RETRY_QUEUE_KEY, []);
  }

  function saveRetryQueue(queue) {
    saveJSON(RETRY_QUEUE_KEY, queue);
  }

  // 클릭 한 건을 서버(Apps Script)로 즉시 전송한다. 집계 시점/방식은 서버가 결정한다.
  function sendLike(event) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.resolve(false);
    }
    return fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // Content-Type을 text/plain으로 두면 브라우저가 preflight(OPTIONS)를 보내지
      // 않아 Apps Script 웹 앱과의 CORS 문제를 피할 수 있다. 본문은 서버에서 JSON.parse.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(event)
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

  function flushRetryQueue(setStatus) {
    var queue = loadRetryQueue();
    if (!queue.length) return Promise.resolve();

    setStatus("재전송 시도 중… (" + queue.length + "건 대기)");

    var remaining = [];
    var chain = Promise.resolve();

    queue.forEach(function (event) {
      chain = chain.then(function () {
        return sendLike(event).then(function (ok) {
          if (!ok) remaining.push(event);
        });
      });
    });

    return chain.then(function () {
      saveRetryQueue(remaining);
      setStatus(remaining.length ? remaining.length + "건 전송 대기 중" : "모두 전송 완료");
    });
  }

  function recordLike(postId, postTitle, setStatus) {
    var totals = loadDisplayTotals();
    totals[postId] = (totals[postId] || 0) + 1;
    saveJSON(DISPLAY_KEY, totals);

    var event = { postId: postId, title: postTitle };

    setStatus("전송 중…");
    sendLike(event).then(function (ok) {
      if (ok) {
        setStatus("전송 완료 (" + new Date().toLocaleTimeString("ko-KR") + ")");
      } else {
        var queue = loadRetryQueue();
        queue.push(event);
        saveRetryQueue(queue);
        setStatus("전송 실패, 재시도 예정 (" + queue.length + "건 대기)");
      }
    });

    return totals[postId];
  }

  function init() {
    var statusEl = document.getElementById("sync-status");
    var setStatus = function (text) {
      if (statusEl) statusEl.textContent = text;
    };

    var totals = loadDisplayTotals();
    document.querySelectorAll(".post").forEach(function (postEl) {
      var postId = postEl.dataset.postId;
      var countEl = postEl.querySelector(".like-count");
      if (countEl) countEl.textContent = totals[postId] || 0;
    });

    document.querySelectorAll(".like-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var postEl = btn.closest(".post");
        var postId = postEl.dataset.postId;
        var postTitle = postEl.dataset.postTitle;

        var newCount = recordLike(postId, postTitle, setStatus);
        var countEl = btn.querySelector(".like-count");
        if (countEl) countEl.textContent = newCount;

        btn.classList.add("liked");
      });
    });

    flushRetryQueue(setStatus);
    setInterval(function () {
      flushRetryQueue(setStatus);
    }, RETRY_INTERVAL_MS);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
