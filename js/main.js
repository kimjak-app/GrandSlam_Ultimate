  // ✅ Splash(인트로) 안전 종료: 네트워크/CDN 지연으로 window.load가 늦어져도 앱이 멈춘 것처럼 보이지 않게
  function hideSplashSafe() {
    const sp = $('splash');
    if (!sp) return;
    // 이미 숨김 처리된 경우 중복 실행 방지
    if (sp.dataset.hidden === '1') return;
    sp.dataset.hidden = '1';
    sp.classList.add('hide');
    setTimeout(() => { sp.style.display = 'none'; }, 700);
  }

  // ✅ v3.817: DOMContentLoaded로 변경 + 병렬 fetch로 스플래시 딜레이 최소화
  document.addEventListener("DOMContentLoaded", async () => {
    // ✅ v3.79: 클럽 시스템 초기화 (sync 전에 완료되어야 올바른 clubId 설정됨)
    try { await initClubSystem(); } catch(e) { console.error("initClubSystem() error:", e); }

    // ✅ v3.817: sync 완료 후 즉시 스플래시 숨김 (코트/공지는 병렬로)
    try { await sync(); } catch(e) { console.error("sync() error:", e); }

    // 스플래시는 sync 완료 즉시 숨김
    hideSplashSafe();

    // 날씨/코트/공지는 스플래시와 무관하게 병렬 처리
    try { loadWeatherForNextMeeting(0); } catch(e) { console.error("loadWeather() error:", e); }
    Promise.all([
      fetchCourtNotices().catch(e => console.warn("fetchCourtNotices error:", e)),
      fetchAnnouncements().catch(e => console.warn("fetchAnnouncements error:", e))
    ]).then(() => {
      try { loadCourtInfo(); loadNotices(); } catch(e) { console.warn("home render error:", e); }
    });

    // ✅ v3.79: 연습/실전 모드 버튼 상태 복원
    try {
      const btn = $('btnTourMode');
      if (btn && isPracticeMode === 'real') {
        btn.innerText = "🟥 실전 모드 (모든 기록 반영 O)";
        btn.style.background = "#FF3B30";
      }
    } catch(e) {}

    setTimeout(() => { 
      try { applyAutofitAllTables(); } catch(e) { console.error("applyAutofitAllTables() error:", e); }
    }, 0);
  });
window.addEventListener("resize", () => {
    updateSeason();
    updateWeekly();
    setTimeout(applyAutofitAllTables, 0);
  });
