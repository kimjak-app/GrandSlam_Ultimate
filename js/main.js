// ✅ v4.921: Splash 안전 종료 — 딜레이 제거, 페이드아웃 후 홈 화면 등장
function hideSplashSafe() {
  const sp = $('splash');
  if (!sp) return;
  if (sp.dataset.hidden === '1') return;
  sp.dataset.hidden = '1';

  const homeEl = document.getElementById('view-home');
  if (homeEl) {
    homeEl.style.opacity = '0';
    homeEl.style.transition = 'opacity 0.5s ease';
  }

  // ✅ v4.921: 1초 홀드 제거 — 즉시 페이드아웃
  sp.classList.add('hide');
  setTimeout(() => {
    sp.style.display = 'none';
    if (homeEl) homeEl.style.opacity = '1';
  }, 700);
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

    if (type === 'players') {
      // ✅ v4.10: players만 먼저 로드된 상태 — 빠른 체감용 렌더(랭킹/명단 중심)
      // ✅ v4.928: renderHome 제거 — currentLoggedPlayer 복원 전이라 라커룸 꼬임
      try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) { }
      console.log('[AppEvents] gs:state:changed(players) → 빠른 렌더 완료');
    }

    if (type === 'data') {
      // 선수/경기 데이터 확정 → 홈 화면 + 시즌/주간 통계 갱신
      // ✅ v4.928: renderHome은 _syncRestoreLoggedPlayer에서 호출 → 중복 제거
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

// ✅ v4.032: 앱 종료/탭 닫기 시 treasurer 화면이면 자동 저장 시도
window.addEventListener('beforeunload', () => {
  const currentVisible = document.querySelector('#view-treasurer[style*="display: block"], #view-treasurer[style*="display:block"]');
  if (currentVisible) {
    pushDataOnly().catch(e => console.warn('beforeunload 자동저장 오류:', e));
  }
});

// ✅ v4.924: 라커룸 홈화면 렌더링
function renderHome() {
  try {
    // ✅ v4.924 버그픽스: 클럽 전환 시 다른 클럽 선수가 남아있으면 초기화
    if (typeof currentLoggedPlayer !== 'undefined' && currentLoggedPlayer && Array.isArray(players)) {
      const stillExists = players.find(p => p.name === currentLoggedPlayer.name);
      if (!stillExists) {
        currentLoggedPlayer = null;
      }
    }
    _renderLockerRoom();
    _renderClubStatus();
  } catch(e) {
    console.warn('[renderHome] error:', e);
  }
}

function _renderLockerRoom() {
  const me = typeof currentLoggedPlayer !== 'undefined' ? currentLoggedPlayer : null;
  const myName = me ? me.name : null;

  // 헤더 타이틀
  const titleEl = document.getElementById('lockerRoomTitleText');
  if (titleEl) titleEl.textContent = myName ? `${typeof displayName === 'function' ? displayName(myName) : myName}님의 라커룸` : '라커룸';

  // ✅ v4.930: 로그인됐지만 이 클럽에 실명 미연결 → 연결하기 버튼 표시
  const linkBtn = document.getElementById('lockerLinkBtn');
  if (linkBtn) {
    const loggedIn = typeof currentUserAuth !== 'undefined' && currentUserAuth;
    linkBtn.style.display = (loggedIn && !myName) ? 'block' : 'none';
  }


  // ✅ v4.927_2: 클럽 전환 중(데이터 로딩 전) 라커룸 잔상 제거
  const resetLocker = () => {
    const el = id => document.getElementById(id);
    if (el('myRankTotal'))  el('myRankTotal').textContent  = '–';
    if (el('myRankDouble')) el('myRankDouble').textContent = '–';
    if (el('myRankSingle')) el('myRankSingle').textContent = '–';
    if (el('myRankTotalDelta'))  el('myRankTotalDelta').style.display  = 'none';
    if (el('myRankDoubleDelta')) el('myRankDoubleDelta').style.display = 'none';
    if (el('myRankSingleDelta')) el('myRankSingleDelta').style.display = 'none';
    if (el('myRecordThisWeek'))  el('myRecordThisWeek').innerHTML  = '– 승 – 패 &nbsp;–%';
    if (el('myRecordLastWeek'))  el('myRecordLastWeek').innerHTML  = '– 승 – 패 &nbsp;–%';
    if (el('myRecordThisMonth')) el('myRecordThisMonth').innerHTML = '– 승 – 패 &nbsp;–%';
    if (el('myRecentGames')) el('myRecentGames').innerHTML =
      '<div style="font-size:12px; color:#bbb; text-align:center; padding:8px 0;">불러오는 중...</div>';
  };


  if (!myName || !Array.isArray(players) || !Array.isArray(matchLog)) { resetLocker(); return; }

  // ── 순위 계산 ──
  const activePlayers = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const sorted = [...activePlayers].sort((a,b) => (b.score||0) - (a.score||0));
  const sortedD = [...activePlayers].sort((a,b) => (b.dScore||0) - (a.dScore||0));
  const sortedS = [...activePlayers].sort((a,b) => (b.sScore||0) - (a.sScore||0));

  // ✅ v4.931: 시합을 뛴 선수만 순위 표시 (wins+losses=0이면 –)
  const getRank = (arr, name, wKey, lKey) => {
    const me = arr.find(p => p.name === name);
    if (!me) return null;
    if ((me[wKey] || 0) + (me[lKey] || 0) === 0) return null;
    const i = arr.findIndex(p => p.name === name);
    return i >= 0 ? i + 1 : null;
  };
  const myRank  = getRank(sorted,  myName, 'wins',  'losses');
  const myRankD = getRank(sortedD, myName, 'dWins', 'dLosses');
  const myRankS = getRank(sortedS, myName, 'sWins', 'sLosses');

  const myPlayer = players.find(p => p.name === myName);

  // 순위 표시
  const setRank = (id, deltaId, rank, delta) => {
    const el = document.getElementById(id);
    const dEl = document.getElementById(deltaId);
    if (el) el.textContent = rank ? `${rank}` : '–';
    if (dEl && delta !== null && delta !== undefined) {
      const up = delta > 0;
      const down = delta < 0;
      if (up || down) {
        dEl.textContent = up ? `▲${delta}` : `▼${Math.abs(delta)}`;
        dEl.style.color = up ? '#FFD700' : '#FF9999';
        dEl.style.display = 'inline';
      }
    }
  };

  const lastRank  = myPlayer ? (myPlayer.last  || 0) : 0;
  const lastRankD = myPlayer ? (myPlayer.lastD || 0) : 0;
  const lastRankS = myPlayer ? (myPlayer.lastS || 0) : 0;

  setRank('myRankTotal',  'myRankTotalDelta',  myRank,  lastRank  && myRank  ? lastRank  - myRank  : null);
  setRank('myRankDouble', 'myRankDoubleDelta', myRankD, lastRankD && myRankD ? lastRankD - myRankD : null);
  setRank('myRankSingle', 'myRankSingleDelta', myRankS, lastRankS && myRankS ? lastRankS - myRankS : null);

  // ── 전적 계산 ──
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const monthStr = `${thisYear}-${String(thisMonth).padStart(2,'0')}`;

  // 이번주 월요일
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMon); monday.setHours(0,0,0,0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);

  const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayStr = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(new Date(monday.getTime() - 86400000));

  const calcRecord = (logs) => {
    let w = 0, l = 0;
    logs.forEach(m => {
      const inHome = (m.home||[]).includes(myName);
      const inAway = (m.away||[]).includes(myName);
      if (!inHome && !inAway) return;
      const win = (inHome && m.winner === 'home') || (inAway && m.winner === 'away');
      win ? w++ : l++;
    });
    const rate = (w + l) > 0 ? Math.round(w / (w + l) * 100) : 0;
    return { w, l, rate };
  };

  const thisWeekLogs  = matchLog.filter(m => m.date >= mondayStr);
  const lastWeekLogs  = matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);
  const thisMonthLogs = matchLog.filter(m => (m.date||'').startsWith(monthStr));

  const fmt = (r, highlight) => {
    if (r.w === 0 && r.l === 0) return '– 승 – 패 &nbsp;–%';
    return `${r.w}승 ${r.l}패 &nbsp;${r.rate}%`;
  };

  const rTW = calcRecord(thisWeekLogs);
  const rLW = calcRecord(lastWeekLogs);
  const rTM = calcRecord(thisMonthLogs);

  const el = id => document.getElementById(id);
  if (el('myRecordThisWeek'))  el('myRecordThisWeek').innerHTML  = fmt(rTW, true);
  if (el('myRecordLastWeek'))  el('myRecordLastWeek').innerHTML  = fmt(rLW, false);
  if (el('myRecordThisMonth')) el('myRecordThisMonth').innerHTML = fmt(rTM, false);

  // 이번주 🔥 강조
  if (el('myRecordThisWeek') && rTW.rate >= 70 && (rTW.w + rTW.l) >= 2) {
    el('myRecordThisWeek').innerHTML += ' 🔥';
  }

  // ── 최근 경기 3게임 ──
  const recentEl = el('myRecentGames');
  if (recentEl) {
    const myGames = matchLog
      .filter(m => (m.home||[]).includes(myName) || (m.away||[]).includes(myName))
      .sort((a,b) => (b.date||'').localeCompare(a.date||''))
      .slice(0, 3);

    if (myGames.length === 0) {
      recentEl.innerHTML = '<div style="font-size:12px; color:#bbb; text-align:center; padding:8px 0;">최근 경기 기록이 없습니다</div>';
    } else {
      recentEl.innerHTML = myGames.map(m => {
        const inHome = (m.home||[]).includes(myName);
        const win = (inHome && m.winner === 'home') || (!inHome && m.winner === 'away');
        const opponents = inHome ? (m.away||[]) : (m.home||[]);
        const oppNames = opponents.map(n => typeof displayName === 'function' ? displayName(n) : n).join('·');
        const dateStr = (m.date||'').slice(5).replace('-','/');
        return `<div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #f5f5f5;">
          <span style="font-size:13px; font-weight:700; color:${win ? '#5D9C76' : '#FF3B30'};">${win ? '승' : '패'}</span>
          <span style="font-size:13px; color:#444; flex:1;">vs ${oppNames}</span>
          <span style="font-size:11px; color:#bbb;">${dateStr}</span>
        </div>`;
      }).join('');
    }
  }
}

function _renderClubStatus() {
  const el = id => document.getElementById(id);
  if (!Array.isArray(matchLog) || !Array.isArray(players)) return;

  // 클럽명
  const clubName = currentClub ? (currentClub.clubName || '우리 클럽') : '우리 클럽';
  if (el('clubStatusName')) el('clubStatusName').innerHTML = `<span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle; margin-right:4px; color:#ffffff;">emoji_events</span>${clubName} 이번달`;

  // ✅ v4.927_2: 클럽 전환/로딩 타이밍에 '이전 클럽 UI 잔상' 제거용 리셋
  // - matchLog가 아직 비어있을 때(로딩 중) 예전 '이달의 선수/주말 베스트'가 그대로 남는 문제 방지
  try {
    const hide = (rowId) => { const r = el(rowId); if (r) r.style.display = 'none'; };
    hide('clubTopPlayerRow');
    hide('clubWeekendPlayerRow');
    if (el('clubTopPlayer')) el('clubTopPlayer').innerHTML = '';
    if (el('clubWeekendPlayer')) el('clubWeekendPlayer').innerHTML = '';
    if (el('clubThisWeekGames'))  el('clubThisWeekGames').textContent  = '0';
    if (el('clubLastWeekGames'))  el('clubLastWeekGames').textContent  = '0';
    // 출석 텍스트는 players 로드 전엔 0/0로
    const totalMembers0 = Array.isArray(players) ? players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length : 0;
    if (el('clubThisWeekAttend')) el('clubThisWeekAttend').textContent = `0/${totalMembers0}`;
    if (el('clubLastWeekAttend')) el('clubLastWeekAttend').textContent = `0/${totalMembers0}`;
  } catch (e) { }


  // 이번주/지난주 기준
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMon); monday.setHours(0,0,0,0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const toStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayStr = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(new Date(monday.getTime() - 86400000));

  const thisWeekGames = matchLog.filter(m => m.date >= mondayStr).length;
  const lastWeekGames = matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr).length;

  // 출석: 이번주 경기에 참여한 고유 선수 수
  const thisWeekNames = new Set();
  matchLog.filter(m => m.date >= mondayStr).forEach(m => {
    [...(m.home||[]), ...(m.away||[])].forEach(n => thisWeekNames.add(n));
  });
  const lastWeekNames = new Set();
  matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr).forEach(m => {
    [...(m.home||[]), ...(m.away||[])].forEach(n => lastWeekNames.add(n));
  });

  const totalMembers = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length;

  if (el('clubThisWeekGames'))  el('clubThisWeekGames').textContent  = thisWeekGames || '0';
  if (el('clubThisWeekAttend')) el('clubThisWeekAttend').textContent = `${thisWeekNames.size}/${totalMembers}`;
  if (el('clubLastWeekGames'))  el('clubLastWeekGames').textContent  = lastWeekGames || '0';
  if (el('clubLastWeekAttend')) el('clubLastWeekAttend').textContent = `${lastWeekNames.size}/${totalMembers}`;

  // ✅ v4.924: 총점 계산 헬퍼 (matchLog + TENNIS_RULES)
  const calcMatchScore = (m, name) => {
    const inHome = (m.home||[]).includes(name);
    const inAway = (m.away||[]).includes(name);
    if (!inHome && !inAway) return 0;
    const isWin = (inHome && m.winner === 'home') || (inAway && m.winner === 'away');
    const type = m.type || 'double';
    const scoring = (typeof getClubScoring === 'function' ? getClubScoring() : null) || TENNIS_RULES.scoring;
    const rule = scoring[type] || scoring.double;
    return scoring.participate + (isWin ? rule.win : rule.loss);
  };

  const buildScoreMap = (logs) => {
    const map = {};
    logs.forEach(m => {
      [...(m.home||[]), ...(m.away||[])].forEach(n => {
        if (!map[n]) map[n] = { w:0, l:0, pts:0 };
        const inHome = (m.home||[]).includes(n);
        const isWin = (inHome && m.winner==='home') || (!inHome && m.winner==='away');
        isWin ? map[n].w++ : map[n].l++;
        map[n].pts += calcMatchScore(m, n);
      });
    });
    return map;
  };

  const isActiveMember = n => players.find(p => p.name===n && !p.isGuest && (!p.status||p.status==='active'));

  // 이달의 1위 (총점 기준)
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthGames = matchLog.filter(m => (m.date||'').startsWith(thisMonth));
  if (monthGames.length > 0) {
    const scoreMap = buildScoreMap(monthGames);
    const top = Object.entries(scoreMap)
      .filter(([n]) => isActiveMember(n))
      .sort(([,a],[,b]) => b.pts - a.pts || b.w - a.w)[0];
    if (top && el('clubTopPlayer') && el('clubTopPlayerRow')) {
      const dname = typeof displayName === 'function' ? displayName(top[0]) : top[0];
      const ts = top[1];
      const rate = (ts.w+ts.l)>0 ? Math.round(ts.w/(ts.w+ts.l)*100) : 0;
      el('clubTopPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:28px; vertical-align:middle; margin-right:4px; color:#8B6914;">stars</span>${dname}<div style="font-size:13px;font-weight:600;color:#888;margin-top:4px;">${ts.w}승 ${ts.l}패 &nbsp;${rate}%</div>`;
      el('clubTopPlayerRow').style.display = 'block';
    }
  }

  // 이번주/지난주 BEST PLAYER (총점 기준)
  const weekendSource = thisWeekGames > 0
    ? matchLog.filter(m => m.date >= mondayStr)
    : matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);
  const isThisWeek = thisWeekGames > 0;

  if (weekendSource.length > 0) {
    const wMap = buildScoreMap(weekendSource);
    const wTop = Object.entries(wMap)
      .filter(([n]) => isActiveMember(n))
      .sort(([,a],[,b]) => b.pts - a.pts || b.w - a.w)[0];
    if (wTop && el('clubWeekendPlayer') && el('clubWeekendPlayerRow')) {
      const wLabel = isThisWeek ? 'THIS WEEKEND' : 'LAST WEEKEND';
      const wdname = typeof displayName === 'function' ? displayName(wTop[0]) : wTop[0];
      const ws = wTop[1];
      const wrate = (ws.w+ws.l)>0 ? Math.round(ws.w/(ws.w+ws.l)*100) : 0;
      el('clubWeekendPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">military_tech</span>${wdname}<div style="font-size:12px;font-weight:600;color:#999;margin-top:3px;">${ws.w}승 ${ws.l}패 &nbsp;${wrate}%</div>`;
      const wLabelEl = el('clubWeekendPlayerRow').querySelector('div');
      if (wLabelEl) wLabelEl.textContent = `BEST PLAYER ${wLabel}`;
      el('clubWeekendPlayerRow').style.display = 'block';
      if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
    }
  }

  // ✅ v4.924: MOST IMPROVED THIS WEEK (승률 상승폭 기준, 최소 2경기)
  if (isThisWeek) {
    const thisWeekLogs = matchLog.filter(m => m.date >= mondayStr);
    const lastWeekLogs = matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);
    const twMap = buildScoreMap(thisWeekLogs);
    const lwMap = buildScoreMap(lastWeekLogs);

    const improved = Object.entries(twMap)
      .filter(([n, d]) => isActiveMember(n) && (d.w+d.l) >= 2)
      .map(([n, d]) => {
        const twRate = Math.round(d.w/(d.w+d.l)*100);
        const lw = lwMap[n];
        const lwRate = lw && (lw.w+lw.l)>=1 ? Math.round(lw.w/(lw.w+lw.l)*100) : 0;
        const delta = twRate - lwRate;
        return { name:n, delta, twRate, lwRate, pts: d.pts };
      })
      .filter(p => p.delta > 0)
      .sort((a,b) => b.delta - a.delta || b.pts - a.pts)
      .slice(0, 3);

    if (improved.length > 0 && el('clubImprovedRow') && el('clubImprovedPlayer')) {
      const single = improved.length === 1;
      el('clubImprovedPlayer').innerHTML = improved.map(p => {
        const dname = typeof displayName === 'function' ? displayName(p.name) : p.name;
        const detail = `▲${p.delta}% (지난주 ${p.lwRate}% → 이번주 ${p.twRate}%)`;
        return `<div style="margin-bottom:6px;"><span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">trending_up</span>${dname}<div style="font-size:12px;color:#5D9C76;font-weight:600;margin-top:2px;">${detail}</div></div>`;
      }).join('');
      el('clubImprovedRow').style.display = 'block';
      if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
    }
  }
}
