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
  try { await initClubSystem(); } catch (e) { console.error("initClubSystem() error:", e); }

  // ✅ v3.817: sync 완료 후 즉시 스플래시 숨김 (코트/공지는 병렬로)
  try { await sync(); } catch (e) { console.error("sync() error:", e); }

  // 스플래시는 sync 완료 즉시 숨김
  hideSplashSafe();

  // 날씨/코트/공지는 스플래시와 무관하게 병렬 처리
  try { loadWeatherForNextMeeting(0); } catch (e) { console.error("loadWeather() error:", e); }
  Promise.all([
    fetchCourtNotices().catch(e => console.warn("fetchCourtNotices error:", e)),
    fetchAnnouncements().catch(e => console.warn("fetchAnnouncements error:", e))
  ]).then(() => {
    try { loadCourtInfo(); loadNotices(); } catch (e) { console.warn("home render error:", e); }
  });

  // ✅ v3.79: 연습/실전 모드 버튼 상태 복원
  try {
    const btn = $('btnTourMode');
    if (btn && isPracticeMode === 'real') {
      btn.innerText = "🟥 실전 모드 (모든 기록 반영 O)";
      btn.style.background = "#FF3B30";
    }
  } catch (e) { }

  setTimeout(() => {
    try { applyAutofitAllTables(); } catch (e) { console.error("applyAutofitAllTables() error:", e); }
  }, 0);
});

// ========================================
// ✅ v3.92: 이벤트 기반 아키텍처 — 통합 리스너 (프로급 보강)
// gs:state:changed 이벤트 하나로 모든 데이터 상태 변화를 수신
// listenersBound 가드로 중복 등록 원천 차단
// 기존 클라우드 저장 로직은 전혀 건드리지 않음
// ========================================

let listenersBound = false; // ✅ v3.92: 리스너 중복 등록 방지 플래그

if (!listenersBound) {
  listenersBound = true;

  AppEvents.addEventListener('gs:state:changed', (e) => {
    const { type } = e.detail || {};

    if (type === 'data') {
      // 선수/경기 데이터 확정 → 홈 화면 + 시즌/주간 통계 갱신
      try { if (typeof renderHome === 'function') renderHome(); } catch (e) { console.warn('[AppEvents] renderHome error:', e); }
      try { if (typeof updateSeason === 'function') updateSeason(); } catch (e) { }
      try { if (typeof updateWeekly === 'function') updateWeekly(); } catch (e) { }
      try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) { }
      console.log('[AppEvents] gs:state:changed(data) → 홈/통계 렌더링 완료');

    } else if (type === 'court') {
      // 코트공지 확정 → 홈화면 코트 정보 갱신
      try { if (typeof loadCourtInfo === 'function') loadCourtInfo(); } catch (e) { console.warn('[AppEvents] loadCourtInfo error:', e); }
      console.log('[AppEvents] gs:state:changed(court) → 코트 정보 렌더링 완료');

    } else if (type === 'announcements') {
      // 공지사항 확정 → 홈화면 공지사항 갱신
      try { if (typeof loadNotices === 'function') loadNotices(); } catch (e) { console.warn('[AppEvents] loadNotices error:', e); }
      console.log('[AppEvents] gs:state:changed(announcements) → 공지사항 렌더링 완료');

    } else if (type === 'fee') {
      // 회비 데이터 확정 → 운영 탭 회비 테이블 + 재무 목록 갱신
      try { if (typeof renderFeeTable === 'function') renderFeeTable(); } catch (e) { console.warn('[AppEvents] renderFeeTable error:', e); }
      try { if (typeof renderFinance === 'function') renderFinance(); } catch (e) { }
      console.log('[AppEvents] gs:state:changed(fee) → 운영탭 렌더링 완료');
    }
  });
}

window.addEventListener("resize", () => {
  updateSeason();
  updateWeekly();
  setTimeout(applyAutofitAllTables, 0);
});
