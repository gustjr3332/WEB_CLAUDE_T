// Google Apps Script 웹 앱 배포 후 발급되는 URL을 여기에 붙여넣으세요.
// 예: https://script.google.com/macros/s/AKfycb.../exec
// apps-script/Code.gs 배포 방법은 apps-script/README.md 참고.
window.LIKE_SYNC_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwBCfvgIlfVaBLSMDOEhOwHUsGqkLAtlCwTRwzZUB1_klvMS2Rbj_SL1QnUNxFcKB9VUg/exec",
  // 전송 실패한 클릭을 재시도하는 주기 (ms). 정상 클릭은 즉시 전송되므로 이 값은
  // 네트워크 순간 장애 복구용일 뿐, 집계 정확도와는 무관.
  RETRY_INTERVAL_MS: 15000
};
//AKfycbwBCfvgIlfVaBLSMDOEhOwHUsGqkLAtlCwTRwzZUB1_klvMS2Rbj_SL1QnUNxFcKB9VUg