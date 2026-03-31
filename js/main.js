// ========================================
// MAIN.JS - 앱 진입점 / 이벤트 / 홈 렌더링
// ========================================

// ✅ 버전 상수 — 버전업 시 여기만 바꾸면 전체 반영
const APP_VERSION = 'v7.58';


// ----------------------------------------
// 1. 스플래시
// ----------------------------------------

function hideSplashSafe() {
  const sp = $('splash');
  if (!sp || sp.dataset.hidden === '1') return;
  sp.dataset.hidden = '1';

  const homeEl = document.getElementById('view-home');
  if (homeEl) { homeEl.style.opacity = '0'; homeEl.style.transition = 'opacity 0.5s ease'; }

  sp.classList.add('hide');
  setTimeout(() => { sp.style.display = 'none'; if (homeEl) homeEl.style.opacity = '1'; }, 700);
}


// ----------------------------------------
// 2. DOMContentLoaded 초기화
// ----------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  // ✅ v6.75: 전역 햅틱 피드백 — cursor:pointer 요소 전체 자동 감지
  document.addEventListener('touchstart', (e) => {
    let el = e.target;
    // cursor:pointer인 조상 요소까지 탐색 (최대 5단계)
    for (let i = 0; i < 5; i++) {
      if (!el || el === document.body) break;
      const cursor = window.getComputedStyle(el).cursor;
      if (cursor === 'pointer') break;
      el = el.parentElement;
    }
    if (!el || el === document.body) return;
    if (window.getComputedStyle(el).cursor !== 'pointer') return;

    if (el.classList.contains('crud-btn-del') || el.dataset.haptic === 'warning') {
      gsHaptic('warning');
    } else if (el.dataset.haptic === 'success' ||
               el.textContent?.trim().startsWith('저장') ||
               el.textContent?.includes('Save Changes')) {
      gsHaptic('success');
    } else {
      gsHaptic('light');
    }
  }, { passive: true });
  try { await initClubSystem(); } catch (e) { console.error('initClubSystem() error:', e); }
  try { await sync(); }           catch (e) { console.error('sync() error:', e); }

  hideSplashSafe();

  // ✅ 버전 표시 자동 주입
  const versionEl = document.getElementById('app-version-display');
  if (versionEl) versionEl.textContent = APP_VERSION;
  // title 태그도 동기화
  document.title = 'GrandSlam Ultimate ' + APP_VERSION;

  try { loadWeatherForNextMeeting(0); } catch (e) { console.error('loadWeather() error:', e); }
  Promise.all([
    fetchCourtNotices().catch(e  => console.warn('fetchCourtNotices error:', e)),
    fetchAnnouncements().catch(e => console.warn('fetchAnnouncements error:', e)),
  ]).then(() => {
    try { loadCourtInfo(); loadNotices(); } catch (e) { console.warn('home render error:', e); }
  });

  try {
    const btn = $('btnTourMode');
    if (btn && isPracticeMode === 'real') {
      btn.innerText = '🟥 실전 모드 (모든 기록 반영 O)';
      btn.style.background = '#FF3B30';
    }
  } catch (e) {}

  setTimeout(() => { try { applyAutofitAllTables(); } catch (e) { console.error('applyAutofitAllTables() error:', e); } }, 0);
});


// ----------------------------------------
// 3. 이벤트 리스너
// ----------------------------------------

let listenersBound = false;
if (!listenersBound) {
  listenersBound = true;

  AppEvents.addEventListener('gs:state:changed', e => {
    const { type } = e.detail || {};

    if (type === 'players') {
      try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) {}
      console.log('[AppEvents] gs:state:changed(players)');
    }
    if (type === 'data') {
      try { if (typeof updateSeason === 'function') updateSeason(); } catch (e) {}
      try { if (typeof updateWeekly === 'function') updateWeekly(); } catch (e) {}
      try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) {}
      console.log('[AppEvents] gs:state:changed(data)');
    }
    if (type === 'court') {
      try { if (typeof loadCourtInfo === 'function') loadCourtInfo(); } catch (e) { console.warn('[AppEvents] loadCourtInfo error:', e); }
    }
    if (type === 'announcements') {
      try { if (typeof loadNotices === 'function') loadNotices(); } catch (e) { console.warn('[AppEvents] loadNotices error:', e); }
    }
    if (type === 'fee') {
      try { if (typeof renderFeeTable === 'function') renderFeeTable(); } catch (e) {}
      try { if (typeof renderFinance  === 'function') renderFinance();  } catch (e) {}
    }
  });
}

window.addEventListener('resize', () => {
  updateSeason(); updateWeekly(); setTimeout(applyAutofitAllTables, 0);
});

window.addEventListener('beforeunload', () => {
  const cv = document.querySelector('#view-treasurer[style*="display: block"], #view-treasurer[style*="display:block"]');
  if (cv) pushDataOnly().catch(e => console.warn('beforeunload 자동저장 오류:', e));
});


// ----------------------------------------
// 4. 홈 화면 렌더링
// ----------------------------------------
// ✅ 2단계: renderHome은 섹션 오케스트레이터 역할만 담당
// 각 섹션은 renderHomeSection(id)으로 독립 호출 가능
// 새 섹션 추가 시 renderHome() 수정 없이 섹션 함수만 추가하면 됨

const _HOME_SECTIONS = ['locker', 'hall', 'clubStatus'];

function renderHomeSection(sectionId) {
  const _snapClubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  try {
    if (sectionId === 'locker') {
      if (currentLoggedPlayer && Array.isArray(players) && !players.find(p => p.name === currentLoggedPlayer.name)) {
        currentLoggedPlayer = null;
      }
      _renderLockerRoom(_snapClubId);
    } else if (sectionId === 'quickMenu') {
      _renderQuickMenu(_snapClubId);
    } else if (sectionId === 'hall') {
      _renderHallOfFamePreview(_snapClubId);
    } else if (sectionId === 'clubStatus') {
      _renderClubStatus(_snapClubId);
    }
  } catch (e) { console.warn(`[renderHomeSection:${sectionId}] error:`, e); }
}

function renderHome() {
  _HOME_SECTIONS.forEach(id => renderHomeSection(id));
}

function _renderLockerRoom(_snapClubId) {
  // ✅ 1단계 가드: DOM 쓰기 전 최상단에서 clubId 확인 — 클럽 바뀌었으면 즉시 중단
  if (_snapClubId !== null && (typeof getActiveClubId === 'function' ? getActiveClubId() : null) !== _snapClubId) return;

  const me     = typeof currentLoggedPlayer !== 'undefined' ? currentLoggedPlayer : null;
  const myName = me ? me.name : null;

  const titleEl = document.getElementById('lockerRoomTitleText');
  if (titleEl) titleEl.textContent = myName ? `${typeof displayName === 'function' ? displayName(myName) : myName}님의 라커룸` : '라커룸';

  const linkBtn = document.getElementById('lockerLinkBtn');
  if (linkBtn) {
    const loggedIn = typeof currentUserAuth !== 'undefined' && currentUserAuth;
    linkBtn.style.display = (loggedIn && !myName) ? 'block' : 'none';
  }

  const el = id => document.getElementById(id);
  const resetLocker = () => {
    ['myRankTotal','myRankDouble','myRankSingle'].forEach(id => { const e = el(id); if (e) e.textContent = '–'; });
    ['myRankTotalDelta','myRankDoubleDelta','myRankSingleDelta'].forEach(id => { const e = el(id); if (e) e.style.display = 'none'; });
    ['myRecordThisWeek','myRecordLastWeek','myRecordThisMonth'].forEach(id => { const e = el(id); if (e) e.innerHTML = '– 승 – 패 &nbsp;–%'; });
    if (el('myRecentGames')) el('myRecentGames').innerHTML = '<div style="font-size:12px; color:#bbb; text-align:center; padding:8px 0;">불러오는 중...</div>';
  };

  if (!myName || !Array.isArray(players) || !Array.isArray(matchLog)) { resetLocker(); return; }

  // 순위 계산
  const active  = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const sorted  = [...active].sort((a, b) => (b.score  || 0) - (a.score  || 0));
  const sortedD = [...active].sort((a, b) => (b.dScore || 0) - (a.dScore || 0));
  const sortedS = [...active].sort((a, b) => (b.sScore || 0) - (a.sScore || 0));

  const getRank = (arr, name, wKey, lKey) => {
    const me = arr.find(p => p.name === name);
    if (!me || ((me[wKey] || 0) + (me[lKey] || 0) === 0)) return null;
    const i = arr.findIndex(p => p.name === name);
    return i >= 0 ? i + 1 : null;
  };
  const myRank  = getRank(sorted,  myName, 'wins',  'losses');
  const myRankD = getRank(sortedD, myName, 'dWins', 'dLosses');
  const myRankS = getRank(sortedS, myName, 'sWins', 'sLosses');
  const myPlayer = players.find(p => p.name === myName);

  const setRank = (id, deltaId, rank, delta) => {
    const rEl = el(id), dEl = el(deltaId);
    if (rEl) rEl.textContent = rank ? `${rank}` : '–';
    if (dEl && delta) {
      dEl.textContent = delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`;
      dEl.style.color   = delta > 0 ? '#FFD700' : '#FF9999';
      dEl.style.display = 'inline';
    }
  };
  setRank('myRankTotal',  'myRankTotalDelta',  myRank,  myPlayer?.last  && myRank  ? myPlayer.last  - myRank  : null);
  setRank('myRankDouble', 'myRankDoubleDelta', myRankD, myPlayer?.lastD && myRankD ? myPlayer.lastD - myRankD : null);
  setRank('myRankSingle', 'myRankSingleDelta', myRankS, myPlayer?.lastS && myRankS ? myPlayer.lastS - myRankS : null);

  // 전적 계산
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const monthStr  = `${thisYear}-${String(thisMonth).padStart(2,'0')}`;
  const day       = now.getDay();
  const monday    = new Date(now); monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day)); monday.setHours(0,0,0,0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const toStr     = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayStr     = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(new Date(monday.getTime() - 86400000));

  const calcRecord = logs => {
    let w = 0, l = 0;
    logs.forEach(m => {
      const inHome = (m.home||[]).includes(myName), inAway = (m.away||[]).includes(myName);
      if (!inHome && !inAway) return;
      ((inHome && m.winner==='home') || (inAway && m.winner==='away')) ? w++ : l++;
    });
    return { w, l, rate: (w+l) > 0 ? Math.round(w/(w+l)*100) : 0 };
  };
  const fmt = r => (r.w === 0 && r.l === 0) ? '– 승 – 패 &nbsp;–%' : `${r.w}승 ${r.l}패 &nbsp;${r.rate}%`;

  const rTW = calcRecord(matchLog.filter(m => m.date >= mondayStr));
  const rLW = calcRecord(matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr));
  const rTM = calcRecord(matchLog.filter(m => (m.date||'').startsWith(monthStr)));

  if (el('myRecordThisWeek'))  el('myRecordThisWeek').innerHTML  = fmt(rTW) + (rTW.rate >= 70 && (rTW.w+rTW.l) >= 2 ? ' 🔥' : '');
  if (el('myRecordLastWeek'))  el('myRecordLastWeek').innerHTML  = fmt(rLW);
  if (el('myRecordThisMonth')) el('myRecordThisMonth').innerHTML = fmt(rTM);

  // 최근 경기 3게임
  const recentEl = el('myRecentGames');
  if (recentEl) {
    const myGames = matchLog.filter(m => (m.home||[]).includes(myName) || (m.away||[]).includes(myName))
      .sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,3);
    recentEl.innerHTML = myGames.length === 0
      ? '<div style="font-size:12px; color:#bbb; text-align:center; padding:8px 0;">최근 경기 기록이 없습니다</div>'
      : myGames.map(m => {
          const inHome = (m.home||[]).includes(myName);
          const win    = (inHome && m.winner==='home') || (!inHome && m.winner==='away');
          const opps   = (inHome ? (m.away||[]) : (m.home||[])).map(n => typeof displayName==='function' ? displayName(n) : n).join('·');
          return `<div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid #f5f5f5;">
            <span style="font-size:13px; font-weight:700; color:${win ? '#5D9C76' : '#FF3B30'};">${win ? '승' : '패'}</span>
            <span style="font-size:13px; color:#444; flex:1;">vs ${opps}</span>
            <span style="font-size:11px; color:#bbb;">${(m.date||'').slice(5).replace('-','/')}</span>
          </div>`;
        }).join('');
  }
}


function _ensureMvpHistoryShape() {
  if (!mvpHistory || typeof mvpHistory !== 'object') mvpHistory = {};
  if (!mvpHistory.monthly || typeof mvpHistory.monthly !== 'object') mvpHistory.monthly = {};
  if (!mvpHistory.weekly || typeof mvpHistory.weekly !== 'object') mvpHistory.weekly = {};
}

function _recordMonthlyMvp(monthKey, playerName) {
  if (!monthKey || !playerName) return;
  _ensureMvpHistoryShape();
  const p = players.find(x => x.name === playerName) || {};
  const prev = mvpHistory.monthly[monthKey];
  const next = { key: monthKey, playerName, level: p.level || 'A', updatedAt: Date.now() };
  if (prev && prev.playerName === next.playerName && prev.level === next.level) return;
  mvpHistory.monthly[monthKey] = next;
  if (typeof pushMvpHistory === 'function') pushMvpHistory();
}

function _weekOfMonthLabel(dateObj) {
  const firstDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const weekNo = Math.floor((dateObj.getDate() + offset - 1) / 7) + 1;
  return `${dateObj.getMonth() + 1}월 ${weekNo}주`;
}

function _recordWeeklyMvp(refDateStr, playerName) {
  if (!refDateStr || !playerName) return;
  const d = new Date(refDateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return;
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const weekKey = `${y}-${m}-${dd}`;

  _ensureMvpHistoryShape();
  const p = players.find(x => x.name === playerName) || {};
  const next = {
    key: weekKey,
    playerName,
    level: p.level || 'A',
    label: _weekOfMonthLabel(d),
    updatedAt: Date.now(),
  };
  const prev = mvpHistory.weekly[weekKey];
  if (prev && prev.playerName === next.playerName && prev.level === next.level && prev.label === next.label) return;
  mvpHistory.weekly[weekKey] = next;
  if (typeof pushMvpHistory === 'function') pushMvpHistory();
}

// ✅ v6.68: 클럽 현황 계산 함수들 — 전역 참조 금지, 반드시 스냅샷 인자로만 동작
function _calcClubScoreMap(logs, snapPlayers) {
  const scoring = (typeof getClubScoring === 'function' ? getClubScoring() : null) || TENNIS_RULES.scoring;
  const calcPts = (m, name) => {
    const inHome = (m.home||[]).includes(name), inAway = (m.away||[]).includes(name);
    if (!inHome && !inAway) return 0;
    const isWin = (inHome && m.winner==='home') || (inAway && m.winner==='away');
    const rule  = scoring[m.type || 'double'] || scoring.double;
    return scoring.participate + (isWin ? rule.win : rule.loss);
  };
  const map = {};
  logs.forEach(m => {
    [...(m.home||[]),...(m.away||[])].forEach(n => {
      if (!map[n]) map[n] = { w:0, l:0, pts:0 };
      const inHome = (m.home||[]).includes(n);
      const isWin  = (inHome && m.winner==='home') || (!inHome && m.winner==='away');
      isWin ? map[n].w++ : map[n].l++;
      map[n].pts += calcPts(m, n);
    });
  });
  return map;
}

function _calcMonthBest({ snapMatchLog, snapPlayers, thisMonthStr }) {
  const logs = snapMatchLog.filter(m => (m.date||'').startsWith(thisMonthStr));
  if (!logs.length) return null;
  const isActive = n => snapPlayers.find(p => p.name===n && !p.isGuest && (!p.status||p.status==='active'));
  const top = Object.entries(_calcClubScoreMap(logs, snapPlayers))
    .filter(([n]) => isActive(n)).sort(([,a],[,b]) => b.pts-a.pts || b.w-a.w)[0];
  return top ? { name: top[0], ...top[1] } : null;
}

function _calcWeekendBest({ snapMatchLog, snapPlayers, mondayStr, lastMondayStr, lastSundayStr, isThisWeek }) {
  const logs = isThisWeek
    ? snapMatchLog.filter(m => m.date >= mondayStr)
    : snapMatchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);
  if (!logs.length) return null;
  const isActive = n => snapPlayers.find(p => p.name===n && !p.isGuest && (!p.status||p.status==='active'));
  const top = Object.entries(_calcClubScoreMap(logs, snapPlayers))
    .filter(([n]) => isActive(n)).sort(([,a],[,b]) => b.pts-a.pts || b.w-a.w)[0];
  return top ? { name: top[0], ...top[1] } : null;
}

function _calcMostImproved({ snapMatchLog, snapPlayers, mondayStr, lastMondayStr, lastSundayStr }) {
  const isActive = n => snapPlayers.find(p => p.name===n && !p.isGuest && (!p.status||p.status==='active'));
  const twMap = _calcClubScoreMap(snapMatchLog.filter(m => m.date >= mondayStr), snapPlayers);
  const lwMap = _calcClubScoreMap(snapMatchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr), snapPlayers);
  return Object.entries(twMap)
    .filter(([n, d]) => isActive(n) && (d.w+d.l) >= 2)
    .map(([n, d]) => {
      const twRate = Math.round(d.w/(d.w+d.l)*100);
      const lw     = lwMap[n];
      const lwRate = lw && (lw.w+lw.l) >= 1 ? Math.round(lw.w/(lw.w+lw.l)*100) : 0;
      return { name:n, delta: twRate-lwRate, twRate, lwRate, pts: d.pts };
    })
    .filter(p => p.delta > 0).sort((a,b) => b.delta-a.delta || b.pts-a.pts).slice(0,3);
}

function _renderClubStatus(_snapClubId) {
  // ✅ v6.68: 진입 즉시 전역 데이터 스냅샷 고정 — 이후 계산은 복사본만 사용, 전역 참조 완전 차단
  const snapPlayers  = Array.isArray(players)  ? players.slice()  : [];
  const snapMatchLog = Array.isArray(matchLog) ? matchLog.slice() : [];
  const snapClubId   = _snapClubId;
  const getCurrentId = () => typeof getActiveClubId === 'function' ? getActiveClubId() : null;

  if (!Array.isArray(snapMatchLog) || !Array.isArray(snapPlayers)) return;
  if (snapClubId !== null && getCurrentId() !== snapClubId) return;

  const el = id => document.getElementById(id);
  const clubName = currentClub?.clubName || '우리 클럽';
  if (el('clubStatusName')) el('clubStatusName').innerHTML = `<span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle; margin-right:4px; color:#ffffff;">emoji_events</span>${clubName} 이번달`;

  // 리셋 (클럽 전환 시 잔상 제거)
  try {
    ['clubTopPlayerRow','clubWeekendPlayerRow','clubImprovedRow'].forEach(id => { const r = el(id); if (r) r.style.display = 'none'; });
    if (el('clubTopPlayer'))     el('clubTopPlayer').innerHTML    = '';
    if (el('clubWeekendPlayer')) el('clubWeekendPlayer').innerHTML = '';
    if (el('clubImprovedPlayer')) el('clubImprovedPlayer').innerHTML = '';
    const totalMembers0 = snapPlayers.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length;
    if (el('clubThisWeekGames'))  el('clubThisWeekGames').textContent  = '0';
    if (el('clubLastWeekGames'))  el('clubLastWeekGames').textContent  = '0';
    if (el('clubThisWeekAttend')) el('clubThisWeekAttend').textContent = `0/${totalMembers0}`;
    if (el('clubLastWeekAttend')) el('clubLastWeekAttend').textContent = `0/${totalMembers0}`;
  } catch (e) {}

  const now        = new Date();
  const day        = now.getDay();
  const monday     = new Date(now); monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day)); monday.setHours(0,0,0,0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const toStr      = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const mondayStr     = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(new Date(monday.getTime() - 86400000));
  const thisMonthStr  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const getNames     = logs => { const s = new Set(); logs.forEach(m => [...(m.home||[]),...(m.away||[])].forEach(n => s.add(n))); return s; };
  const totalMembers = snapPlayers.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length;
  const thisWeekGames = snapMatchLog.filter(m => m.date >= mondayStr).length;
  const lastWeekGames = snapMatchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr).length;

  if (el('clubThisWeekGames'))  el('clubThisWeekGames').textContent  = thisWeekGames || '0';
  if (el('clubThisWeekAttend')) el('clubThisWeekAttend').textContent = `${getNames(snapMatchLog.filter(m => m.date >= mondayStr)).size}/${totalMembers}`;
  if (el('clubLastWeekGames'))  el('clubLastWeekGames').textContent  = lastWeekGames || '0';
  if (el('clubLastWeekAttend')) el('clubLastWeekAttend').textContent = `${getNames(snapMatchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr)).size}/${totalMembers}`;

  const isThisWeek = thisWeekGames > 0;
  const args = { snapMatchLog, snapPlayers, mondayStr, lastMondayStr, lastSundayStr, thisMonthStr, isThisWeek };

  // ✅ 이달의 1위 — 스냅샷 기반 계산
  if (snapClubId !== null && getCurrentId() !== snapClubId) return;
  const monthBest = _calcMonthBest(args);
  if (monthBest && el('clubTopPlayer') && el('clubTopPlayerRow')) {
    const dname = typeof displayName === 'function' ? displayName(monthBest.name) : monthBest.name;
    const rate  = (monthBest.w+monthBest.l) > 0 ? Math.round(monthBest.w/(monthBest.w+monthBest.l)*100) : 0;
    el('clubTopPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:28px; vertical-align:middle; margin-right:4px; color:#8B6914;">stars</span>${dname}<div style="font-size:13px;font-weight:600;color:#888;margin-top:4px;">${monthBest.w}승 ${monthBest.l}패 &nbsp;${rate}%</div>`;
    el('clubTopPlayerRow').style.display = 'block';
    _recordMonthlyMvp(thisMonthStr, monthBest.name);
  }

  // ✅ BEST PLAYER THIS/LAST WEEKEND — 스냅샷 기반 계산
  if (snapClubId !== null && getCurrentId() !== snapClubId) return;
  const weekendBest = _calcWeekendBest(args);
  if (weekendBest && el('clubWeekendPlayer') && el('clubWeekendPlayerRow')) {
    const wdname = typeof displayName === 'function' ? displayName(weekendBest.name) : weekendBest.name;
    const wrate  = (weekendBest.w+weekendBest.l) > 0 ? Math.round(weekendBest.w/(weekendBest.w+weekendBest.l)*100) : 0;
    el('clubWeekendPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">military_tech</span>${wdname}<div style="font-size:12px;font-weight:600;color:#999;margin-top:3px;">${weekendBest.w}승 ${weekendBest.l}패 &nbsp;${wrate}%</div>`;
    const wLabelEl = el('clubWeekendPlayerRow').querySelector('div');
    if (wLabelEl) wLabelEl.textContent = `BEST PLAYER ${isThisWeek ? 'THIS WEEKEND' : 'LAST WEEKEND'}`;
    el('clubWeekendPlayerRow').style.display = 'block';
    _recordWeeklyMvp(isThisWeek ? mondayStr : lastMondayStr, weekendBest.name);
    if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
  }

  // ✅ MOST IMPROVED THIS WEEK — 스냅샷 기반 계산
  if (!isThisWeek) return;
  if (snapClubId !== null && getCurrentId() !== snapClubId) return;
  const improved = _calcMostImproved(args);
  if (improved.length > 0 && el('clubImprovedRow') && el('clubImprovedPlayer')) {
    el('clubImprovedPlayer').innerHTML = improved.map(p => {
      const dname = typeof displayName === 'function' ? displayName(p.name) : p.name;
      return `<div style="margin-bottom:6px;"><span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">trending_up</span>${dname}<div style="font-size:12px;color:#5D9C76;font-weight:600;margin-top:2px;">▲${p.delta}% (지난주 ${p.lwRate}% → 이번주 ${p.twRate}%)</div></div>`;
    }).join('');
    el('clubImprovedRow').style.display = 'block';
    if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
  }
}




// ----------------------------------------
// 6. 명예의 전당 (Hall of Fame)
// ----------------------------------------

function _calcHallOfFame(myName) {
  if (!myName || !Array.isArray(matchLog) || matchLog.length === 0) return null;

  const myGames = matchLog
    .filter(m => (m.home||[]).includes(myName) || (m.away||[]).includes(myName))
    .sort((a, b) => (a.date||'').localeCompare(b.date||'') || Number(a.ts||0) - Number(b.ts||0));

  if (myGames.length === 0) return null;

  const wins = myGames.filter(m => {
    const inHome = (m.home||[]).includes(myName);
    return (inHome && m.winner === 'home') || (!inHome && m.winner === 'away');
  });

  const getNthWin = (n) => wins.length >= n ? wins[n - 1] : null;

  const getMatchInfo = (m) => {
    if (!m) return null;
    const inHome = (m.home||[]).includes(myName);
    const myTeam  = inHome ? (m.home||[]) : (m.away||[]);
    const oppTeam = inHome ? (m.away||[]) : (m.home||[]);
    const partner = myTeam.filter(n => n !== myName);
    const dn = n => typeof displayName === 'function' ? displayName(n) : n;
    return { date: m.date || '', type: m.type || 'double', opps: oppTeam.map(dn).join('·'), partner: partner.map(dn).join('·') };
  };

  const toMonday = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return null;
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().slice(0, 10);
  };

  const periodStats = (keyFn) => {
    const map = {};
    myGames.forEach(m => {
      const key = keyFn(m.date || '');
      if (!key) return;
      if (!map[key]) map[key] = { w: 0, l: 0 };
      const inHome = (m.home||[]).includes(myName);
      const isWin = (inHome && m.winner === 'home') || (!inHome && m.winner === 'away');
      isWin ? map[key].w++ : map[key].l++;
    });
    return map;
  };

  const bestByRate = (map, minGames = 3) => {
    return Object.entries(map)
      .filter(([, v]) => (v.w + v.l) >= minGames)
      .map(([k, v]) => ({ key: k, w: v.w, l: v.l, total: v.w + v.l, rate: Math.round(v.w / (v.w + v.l) * 100) }))
      .sort((a, b) => b.rate - a.rate || b.w - a.w)[0] || null;
  };

  const bestByWins = (map) => {
    return Object.entries(map)
      .map(([k, v]) => ({ key: k, w: v.w, l: v.l, total: v.w + v.l, rate: Math.round(v.w / (v.w + v.l) * 100) }))
      .sort((a, b) => b.w - a.w || b.rate - a.rate)[0] || null;
  };

  const weekMap  = periodStats(d => toMonday(d));
  const monthMap = periodStats(d => (d || '').slice(0, 7));
  const yearMap  = periodStats(d => (d || '').slice(0, 4));

  const fmtWeek  = (s) => { if (!s) return '–'; const d = new Date(s + 'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()} 주`; };
  const fmtMonth = (m) => m ? `${m.slice(0,4)}년 ${parseInt(m.slice(5))}월` : '–';
  const fmtYear  = (y) => y ? `${y}년` : '–';

  // 동적 마일스톤 생성: 1승 이후 10단위, 100승 이후 50단위.
  // 현재 달성 단계 다음 목표 1개는 항상 보이도록 next target까지 포함.
  const FIXED_MILESTONES = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const dynamicMilestones = [...FIXED_MILESTONES];
  if (wins.length >= 100) {
    let next = 150;
    const nextTarget = Math.ceil((wins.length + 1) / 50) * 50;
    while (next <= nextTarget) {
      dynamicMilestones.push(next);
      next += 50;
    }
  }
  const milestoneMap = {};
  dynamicMilestones.forEach(n => {
    milestoneMap[n] = getMatchInfo(getNthWin(n));
  });

  // 연승/연패 계산
  const calcStreaks = () => {
    let bestWin = { count: 0, opps: [], startDate: '', endDate: '' };
    let bestLose = { count: 0, opps: [], startDate: '', endDate: '', breakInfo: null };
    let curWin = { count: 0, opps: [], startDate: '', endDate: '' };
    let curLose = { count: 0, opps: [], startDate: '', endDate: '', breakInfo: null };

    myGames.forEach((m, i) => {
      const inHome = (m.home||[]).includes(myName);
      const isDraw = m.winner === 'draw';
      const isWin  = !isDraw && ((inHome && m.winner === 'home') || (!inHome && m.winner === 'away'));
      const dn     = n => typeof displayName === 'function' ? displayName(n) : n;
      const oppTeam = (inHome ? (m.away||[]) : (m.home||[])).map(dn).join('·');
      const date    = m.date || '';

      // 무승부는 연승/연패 카운트 건너뜀
      if (isDraw) return;

      if (isWin) {
        // 연승 누적
        if (curWin.count === 0) curWin.startDate = date;
        curWin.count++;
        curWin.opps.push(oppTeam);
        curWin.endDate = date;
        if (curWin.count > bestWin.count) bestWin = { ...curWin, opps: [...curWin.opps] };
        // 연패 종료 — 연패 극복 정보 저장
        if (curLose.count > 0) {
          curLose.breakInfo = { opps: oppTeam, date };
          if (curLose.count > bestLose.count) bestLose = { ...curLose, opps: [...curLose.opps] };
          curLose = { count: 0, opps: [], startDate: '', endDate: '', breakInfo: null };
        }
      } else {
        // 연패 누적
        if (curLose.count === 0) curLose.startDate = date;
        curLose.count++;
        curLose.opps.push(oppTeam);
        curLose.endDate = date;
        // 연승 종료
        if (curWin.count > 0) {
          if (curWin.count > bestWin.count) bestWin = { ...curWin, opps: [...curWin.opps] };
          curWin = { count: 0, opps: [], startDate: '', endDate: '' };
        }
      }
    });
    // 마지막 연속 기록 처리
    if (curWin.count > bestWin.count)   bestWin  = { ...curWin,  opps: [...curWin.opps]  };
    if (curLose.count > bestLose.count) bestLose = { ...curLose, opps: [...curLose.opps] };

    return {
      bestWinStreak:  bestWin.count  > 0 ? bestWin  : null,
      bestLoseStreak: bestLose.count > 0 ? bestLose : null,
    };
  };

  const { bestWinStreak, bestLoseStreak } = calcStreaks();

  return {
    totalWins: wins.length, totalGames: myGames.length,
    milestones: dynamicMilestones,
    milestoneMap,
    bestWinStreak, bestLoseStreak,
    bestRateWeek: bestByRate(weekMap, 2), bestRateMonth: bestByRate(monthMap, 3), bestRateYear: bestByRate(yearMap, 5),
    bestWinsWeek: bestByWins(weekMap),   bestWinsMonth: bestByWins(monthMap),     bestWinsYear:  bestByWins(yearMap),
    fmtWeek, fmtMonth, fmtYear,
  };
}

function milestoneEmoji(n) {
  if (n === 1)          return 'firstWin';
  if (n === 50)         return 'trophy';
  if (n % 100 === 0 && n <= 100) return 'trophy';
  if (n < 200)          return 'star';
  if (n < 500)          return 'crown';
  return 'trident';
}

function hofIcon(type, size, color, isMuted, overlayLabel) {
  const px = size || 24;
  const c = color || '#D4A24C';
  const opacity = isMuted ? '0.45' : '1';

  const iconMap = {
    hall: 'fas fa-landmark',
    firstWin: 'fas fa-medal',
    monthAward: 'fas fa-crown',
    weekAward: 'fas fa-trophy',
    star: 'fas fa-star',
    spark: 'fas fa-bolt',
    trophy: 'fas fa-trophy',
    crown: 'fas fa-crown',
    trident: 'fas fa-shield-alt',
    rate: 'fas fa-chart-line',
    wins: 'fas fa-award',
    streak: 'fas fa-fire',
    calendarWeek: 'fas fa-calendar-week',
    calendarMonth: 'fas fa-calendar-alt',
    calendarYear: 'fas fa-calendar',
    close: 'fas fa-times'
  };

  const faClass = iconMap[type] || 'fas fa-trophy';

  // ✅ 달성(잠금 해제) 상태: 번쩍이는 프리미엄 뱃지 + Font Awesome 아이콘
  if (!isMuted) {
    let tierClass = 'silver';
    if (['monthAward', 'crown', 'trident', 'star'].includes(type)) tierClass = 'gold';
    else if (type === 'firstWin') tierClass = 'bronze';

    // 뱃지마다 자연스럽게 다른 타이밍 (type 문자열 기반 시드 → 항상 동일하게 재현)
    const seed = type.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const glowDelay   = -((seed % 17) / 10).toFixed(1);          // -0.0 ~ -1.6s
    const glowDur     = (1.6 + (seed % 13) / 10).toFixed(1);     // 1.6 ~ 2.8s
    const sweepDelay  = -((seed % 23) / 10).toFixed(1);          // -0.0 ~ -2.2s
    const sweepDur    = (2.4 + (seed % 19) / 10).toFixed(1);     // 2.4 ~ 4.2s
    const glowAnim    = tierClass === 'gold' ? 'badge-glow-gold' : tierClass === 'bronze' ? 'badge-glow-bronze' : 'badge-glow-silver';

    const overlayFontSize = overlayLabel && overlayLabel.length >= 3 ? 9 : 11;
    const overlay = overlayLabel
      ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:${overlayFontSize}px; font-weight:900; z-index:3; text-shadow:0 1px 3px rgba(0,0,0,0.9);">${overlayLabel}</div>`
      : '';

    return `<div class="shiny-badge-wrap ${tierClass}" style="width:${px}px; height:${px}px; position:relative; animation:${glowAnim} ${glowDur}s ${glowDelay}s infinite alternate; --sweep-dur:${sweepDur}s; --sweep-delay:${sweepDelay}s;">
      <i class="${faClass}" style="font-size:${px * 0.55}px;"></i>
      ${overlay}
    </div>`;
  }

  // 🔒 달성 전(잠금): 기존 밋밋한 룩 유지
  const overlayFontSize = overlayLabel && overlayLabel.length >= 3 ? 8 : 10;
  const overlay = overlayLabel
    ? `<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:white; font-size:${overlayFontSize}px; font-weight:900; z-index:3;">${overlayLabel}</div>`
    : '';

  return `<span style="display:inline-flex; align-items:center; justify-content:center; width:${px}px; height:${px}px; color:${c}; opacity:${opacity}; flex-shrink:0; position:relative;">
    <i class="${faClass}" style="font-size:${px * 0.8}px;"></i>
    ${overlay}
  </span>`;
}


function _hofGetClubPalette() {
  const base = (typeof currentClub !== 'undefined' && currentClub && currentClub.color) ? currentClub.color : '#5D9C76';
  const deep = (typeof tinycolor !== 'undefined')
    ? tinycolor(base).darken(16).saturate(8).toHexString()
    : base;
  const soft = (typeof tinycolor !== 'undefined')
    ? tinycolor(base).lighten(8).desaturate(6).toHexString()
    : '#78B18E';
  const halo = (typeof tinycolor !== 'undefined')
    ? tinycolor(base).setAlpha(0.16).toRgbString()
    : 'rgba(93, 156, 118, 0.16)';
  return { base, deep, soft, halo };
}

function _applyHofClubChrome() {
  const clubPalette = _hofGetClubPalette();
  const header = document.getElementById('hofCardHeader');
  const modalHeader = document.getElementById('hofModalHeader');
  const modalBody = document.getElementById('hofModalBody');
  const viewBtn = document.querySelector('#hallOfFameCard .section-header-chip');
  if (header) {
    header.style.background = `linear-gradient(135deg, ${clubPalette.base} 0%, ${clubPalette.deep} 100%)`;
  }
  if (modalHeader) {
    modalHeader.style.background = `linear-gradient(135deg, ${clubPalette.base} 0%, ${clubPalette.deep} 100%)`;
  }
  if (modalBody) {
    modalBody.style.background = '#F8F9FB';
  }
  if (viewBtn) {
    viewBtn.style.background = 'rgba(255,255,255,0.14)';
    viewBtn.style.borderColor = 'rgba(255,255,255,0.24)';
    viewBtn.style.color = '#fff';
  }
}

function _hofBadge(icon, label, value, sub) {
  return `<div style="background:linear-gradient(180deg,#FFFFFF 0%, #FAFBFD 100%); border-radius:20px; padding:15px 16px; box-shadow:0 8px 20px rgba(20,32,58,0.05); margin-bottom:12px; border:1px solid rgba(30,41,59,0.05);">
    <div style="display:flex; align-items:flex-start; gap:12px;">
      <div style="width:46px; height:46px; border-radius:15px; background:rgba(244,247,252,0.88); display:flex; align-items:center; justify-content:center; line-height:1; flex-shrink:0; box-shadow:inset 0 1px 0 rgba(255,255,255,0.9);">${icon}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:10px; color:#A0AEC0; font-weight:600; letter-spacing:1px; text-transform:uppercase; margin-bottom:5px;">${label}</div>
        <div style="font-size:16px; font-weight:600; color:#223047; line-height:1.3; letter-spacing:-0.01em;">${value}</div>
        ${sub ? `<div style="font-size:11px; color:#7B8794; margin-top:6px; line-height:1.55; font-weight:400;">${sub}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function _getVisibleMilestoneTrack(hof) {
  if (!hof || !Array.isArray(hof.milestones)) return [];
  const achieved = hof.milestones.filter(n => !!hof.milestoneMap[n]);
  const next = hof.milestones.find(n => !hof.milestoneMap[n]);
  const out = [...achieved];
  if (typeof next === 'number') out.push(next);
  return out;
}

function _getMilestonePalette(n, locked) {
  if (locked) {
    return {
      bg: '#FFFFFF',
      border: 'rgba(137, 148, 166, 0.26)',
      iconBg: 'rgba(241, 245, 249, 0.98)',
      iconColor: '#9AA4B2',
      title: '#7B8796',
      sub: '#98A2B3',
      chipBg: 'rgba(122, 134, 154, 0.10)',
      chipColor: '#7B8796',
      shadow: '0 10px 24px rgba(20, 32, 58, 0.05)'
    };
  }
  if (n === 1) {
    return {
      bg: '#FFFFFF',
      border: 'rgba(212, 162, 76, 0.36)',
      iconBg: 'rgba(255, 244, 214, 0.96)',
      iconColor: '#C17A5A',
      title: '#9F5F37',
      sub: '#B07A5B',
      chipBg: 'rgba(193, 122, 90, 0.10)',
      chipColor: '#9F5F37',
      shadow: '0 12px 28px rgba(193, 122, 90, 0.10)'
    };
  }
  if (n >= 100) {
    return {
      bg: '#FFFFFF',
      border: 'rgba(186, 138, 44, 0.32)',
      iconBg: 'rgba(255, 244, 217, 0.96)',
      iconColor: '#B8811F',
      title: '#8C6112',
      sub: '#A2772A',
      chipBg: 'rgba(184, 129, 31, 0.10)',
      chipColor: '#8C6112',
      shadow: '0 12px 28px rgba(184, 129, 31, 0.10)'
    };
  }
  return {
    bg: '#FFFFFF',
    border: 'rgba(79, 124, 198, 0.30)',
    iconBg: 'rgba(230, 239, 255, 0.98)',
    iconColor: '#3A7BD5',
    title: '#2A5FA8',
    sub: '#5D83B8',
    chipBg: 'rgba(58, 123, 213, 0.08)',
    chipColor: '#2A5FA8',
    shadow: '0 12px 28px rgba(58, 123, 213, 0.09)'
  };
}

function _hofMilestoneTrackBadge(hof, milestoneN, opts) {
  const info = hof && hof.milestoneMap ? hof.milestoneMap[milestoneN] : null;
  const locked = !info;
  const palette = _getMilestonePalette(milestoneN, locked);
  const iconType = milestoneN === 1 ? 'firstWin' : milestoneEmoji(milestoneN);
  const overlayLabel = milestoneN !== 1 ? String(milestoneN) : null;
  const compact = !!(opts && opts.compact);
  const icon = hofIcon(iconType, compact ? 38 : 50, palette.iconColor, locked, overlayLabel);
  const title = milestoneN === 1 ? '첫승' : `${milestoneN}승`;
  const sub = locked
    ? `${Math.min(hof.totalWins || 0, milestoneN)}/${milestoneN}`
    : (info.date || '달성');
  const chipLabel = locked ? 'NEXT' : 'CLEAR';
  return `<div style="
    flex:0 0 auto; min-width:${compact ? '108px' : '138px'}; padding:${compact ? '16px 12px 12px' : '20px 18px 17px'}; border-radius:${compact ? '22px' : '28px'};
    background:${palette.bg}; border:1px solid ${palette.border}; box-shadow:${palette.shadow}, 0 10px 20px ${_hofGetClubPalette().halo};
    display:flex; flex-direction:column; align-items:center; text-align:center; gap:${compact ? '10px' : '12px'};">
    <div style="width:${compact ? '66px' : '84px'}; height:${compact ? '66px' : '84px'}; border-radius:${compact ? '20px' : '24px'}; background:#FFFFFF; display:flex; align-items:center; justify-content:center; border:1px solid rgba(15,23,42,0.05); box-shadow:inset 0 1px 0 rgba(255,255,255,0.92);">
      ${icon}
    </div>
    <div style="font-size:${compact ? '12px' : '14px'}; font-weight:600; color:${palette.title}; line-height:1.1; letter-spacing:-0.01em;">${title}</div>
    <div style="font-size:${compact ? '10px' : '11px'}; font-weight:500; color:${palette.sub}; line-height:1.35; white-space:nowrap;">${locked ? '다음 목표 ' + sub : sub}</div>
    <div style="display:inline-flex; align-items:center; justify-content:center; min-width:${compact ? '48px' : '56px'}; padding:${compact ? '4px 8px' : '5px 11px'}; border-radius:999px; background:${palette.chipBg}; color:${palette.chipColor}; font-size:${compact ? '9px' : '10px'}; font-weight:600; letter-spacing:0.5px;">${chipLabel}</div>
  </div>`;
}

function _hofMilestoneDetailCard(hof, milestoneN) {
  const info = hof && hof.milestoneMap ? hof.milestoneMap[milestoneN] : null;
  if (!info) return '';
  const iconType = milestoneN === 1 ? 'firstWin' : milestoneEmoji(milestoneN);
  const overlayLabel = milestoneN !== 1 ? String(milestoneN) : null;
  const palette = _getMilestonePalette(milestoneN, false);
  const partnerTxt = info.partner ? ` · 파트너: ${info.partner}` : '';
  const label = milestoneN === 1 ? '첫 승리 달성' : `${milestoneN}승 달성`;
  return `<div style="background:#fff; border-radius:22px; padding:16px 18px; box-shadow:0 8px 22px rgba(20,32,58,0.07), 0 10px 24px ${_hofGetClubPalette().halo}; margin-bottom:10px; border:1px solid rgba(20,32,58,0.05);">
    <div style="display:flex; align-items:center; gap:14px;">
      <div style="width:86px; height:86px; border-radius:26px; background:#FFFFFF; border:1px solid ${palette.border}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:inset 0 1px 0 rgba(255,255,255,0.9);">
        ${hofIcon(iconType, 46, palette.iconColor, false, overlayLabel)}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:10px; color:${palette.sub}; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; margin-bottom:4px;">${label}</div>
        <div style="font-size:15px; font-weight:600; color:#1f2937; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">vs ${info.opps}</div>
        <div style="font-size:11px; color:#777; margin-top:4px; line-height:1.45;">${info.date}${partnerTxt}</div>
      </div>
    </div>
  </div>`;
}

function _hofMilestoneBadge(iconType, label, info, milestoneN, hof) {
  if (!hof || !info) return '';
  return _hofMilestoneDetailCard(hof, milestoneN);
}


function _hofGetPlayerAwards(name) {
  const monthly = (mvpHistory && mvpHistory.monthly) ? Object.values(mvpHistory.monthly) : [];
  const weekly = (mvpHistory && mvpHistory.weekly) ? Object.values(mvpHistory.weekly) : [];
  const monthItems = monthly.filter(x => x && x.playerName === name).sort((a,b) => String(a.key||'').localeCompare(String(b.key||'')));
  const weekItems = weekly.filter(x => x && x.playerName === name).sort((a,b) => String(a.key||'').localeCompare(String(b.key||'')));
  return {
    monthly: monthItems,
    weekly: weekItems,
    monthLabels: monthItems.map(x => {
      const key = String(x.key || '');
      if (!key) return '';
      const parts = key.split('-');
      if (parts.length >= 2) return `${Number(parts[0])}년 ${Number(parts[1])}월`;
      return key;
    }).filter(Boolean),
    weekLabels: weekItems.map(x => x.label || '').filter(Boolean)
  };
}

function _hofAwardHeroCard(type, labels, clubPalette) {
  const isMonth = type === 'month';
  const title = isMonth ? 'Player of the Month' : 'Player of the Week';
  const iconType = isMonth ? 'monthAward' : 'weekAward';
  const accent = isMonth ? '#D58B17' : '#7B8EA8';
  const border = isMonth ? 'rgba(213,139,23,0.26)' : 'rgba(123,142,168,0.24)';
  const iconBg = isMonth ? 'rgba(255,244,217,0.98)' : 'rgba(237,241,247,0.98)';
  const halo = clubPalette && clubPalette.halo ? clubPalette.halo : 'rgba(93,156,118,0.12)';
  const count = labels && labels.length ? labels.length : 0;
  const latest = labels && labels.length ? labels[labels.length - 1] : 'No awards yet';
  const titleHtml = isMonth
    ? `Player<br>of<br>the Month`
    : `Player<br>of<br>the Week`;
  return `<div style="display:flex; justify-content:center; overflow:hidden;">
    <div style="flex:0 0 auto; width:140px; padding:20px 18px 17px; border-radius:28px; background:linear-gradient(180deg,#FFFFFF 0%, #FBFCFE 100%); border:1px solid ${border}; box-shadow:0 12px 28px rgba(20,32,58,0.06), 0 10px 22px ${halo}; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px; box-sizing:border-box;">
      <div style="width:84px; height:84px; border-radius:24px; background:#FFFFFF; display:flex; align-items:center; justify-content:center; border:1px solid rgba(15,23,42,0.05); box-shadow:inset 0 1px 0 rgba(255,255,255,0.92);">
        ${hofIcon(iconType, 42, accent)}
      </div>
      <div style="font-size:11.5px; font-weight:500; color:#1f2937; line-height:1.2; text-align:center;">${titleHtml}</div>
      <div style="font-size:10px; font-weight:500; color:#8a94a6; line-height:1.35; display:flex; align-items:center; justify-content:center;">${latest}</div>
      <div style="display:inline-flex; align-items:center; justify-content:center; min-width:56px; padding:5px 11px; border-radius:999px; background:${iconBg}; color:${accent}; font-size:10px; font-weight:600; letter-spacing:0.5px;">${count}</div>
    </div>
  </div>`;
}

function _renderHallOfFamePreview(_snapClubId) {
  const card    = document.getElementById('hallOfFameCard');
  const preview = document.getElementById('hofPreview');
  if (!card || !preview) return;

  const myName = typeof currentLoggedPlayer !== 'undefined' && currentLoggedPlayer ? currentLoggedPlayer.name : null;
  if (!myName) { card.style.display = 'none'; return; }
  if (_snapClubId !== null && (typeof getActiveClubId === 'function' ? getActiveClubId() : null) !== _snapClubId) return;

  const hof = _calcHallOfFame(myName);
  if (!hof) { card.style.display = 'none'; return; }

  card.style.display = 'block';
  _applyHofClubChrome();
  const visibleTrack = _getVisibleMilestoneTrack(hof);
  const items = visibleTrack.length
    ? [`<div style="display:flex; gap:10px; overflow-x:auto; padding:2px 0 4px; scroll-snap-type:x proximity;">${visibleTrack.map(n => _hofMilestoneTrackBadge(hof, n, { compact:true })).join('')}</div>`]
    : [];

  preview.innerHTML = items.length ? items.join('') : '';
  if (!items.length) card.style.display = 'none';
}

function openHallOfFameModal() {
  const modal = document.getElementById('hallOfFameModal');
  const body  = document.getElementById('hofModalBody');
  if (!modal || !body) return;

  const myName = typeof currentLoggedPlayer !== 'undefined' && currentLoggedPlayer ? currentLoggedPlayer.name : null;
  if (!myName) return;

  // ✅ 모달 open 시점 clubId 가드 — 클럽 전환 중 열리면 차단
  const _snapClubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;

  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  _applyHofClubChrome();

  // ✅ v6.5: matchLog 전체 재계산 + Firebase 캐시 병합
  const hof = _calcHallOfFame(myName);
  if (hof && typeof hofHistory !== 'undefined') {
    // 마일스톤 병합 — matchLog 페이징 누락 기록 복원
    if (hofHistory.milestones && hofHistory.milestones[myName]) {
      const cached = hofHistory.milestones[myName];
      hof.milestones.forEach(n => {
        if (!hof.milestoneMap[n] && cached[n]) {
          hof.milestoneMap[n] = cached[n];
        }
      });
    }
    // streaks 병합 — 캐시의 최고 기록이 현재 계산값보다 크면 캐시 우선
    if (hofHistory.streaks && hofHistory.streaks[myName]) {
      const cs = hofHistory.streaks[myName];
      if (cs.bestWin  && (!hof.bestWinStreak  || cs.bestWin.count  > hof.bestWinStreak.count)) {
        hof.bestWinStreak  = cs.bestWin;
      }
      if (cs.bestLose && (!hof.bestLoseStreak || cs.bestLose.count > hof.bestLoseStreak.count)) {
        hof.bestLoseStreak = cs.bestLose;
      }
    }
  }

  // 계산 완료 후 clubId 재확인
  if (_snapClubId !== null && (typeof getActiveClubId === 'function' ? getActiveClubId() : null) !== _snapClubId) {
    closeHallOfFameModal(); return;
  }

  if (!hof) { body.innerHTML = '<div style="text-align:center; color:#bbb; padding:30px 0;">경기 기록이 없습니다.</div>'; return; }

  const section = (title, color, content) =>
    `<div style="margin-bottom:22px;"><div style="display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; color:${color}; letter-spacing:1.1px; text-transform:uppercase; margin-bottom:10px; padding-left:2px;">${title}</div>${content}</div>`;

  const fmtStat = (s) => s ? `${s.w}승 ${s.l}패 · ${s.rate}%` : '–';

  const lifetimeRate = hof.totalGames > 0 ? Math.round(hof.totalWins/hof.totalGames*100) : 0;
  const clubPalette = _hofGetClubPalette();
  const summary = `<div style="background:linear-gradient(180deg, ${clubPalette.base} 0%, ${clubPalette.deep} 100%); border-radius:24px; padding:18px 18px; margin-bottom:20px; box-shadow:0 18px 34px ${clubPalette.halo}; overflow:hidden; position:relative;">
    <div style="position:absolute; inset:auto -38px -38px auto; width:120px; height:120px; border-radius:50%; background:rgba(255,255,255,0.08);"></div>
    <div style="position:absolute; top:-28px; right:-18px; width:92px; height:92px; border-radius:50%; background:rgba(255,255,255,0.06);"></div>
    <div style="font-size:18px; letter-spacing:0.7px; color:rgba(255,255,255,0.96); font-weight:700; margin-bottom:14px; text-transform:uppercase;">TROPHY CABINET</div>
    <div style="display:flex; justify-content:space-between; gap:10px; text-align:center;">
      <div style="flex:1;"><div style="font-size:24px; font-weight:600; color:#fff; line-height:1.05;">${hof.totalWins}</div><div style="font-size:10px; color:rgba(255,255,255,0.72); margin-top:5px; font-weight:500;">총 승리</div></div>
      <div style="width:1px; background:rgba(255,255,255,0.16);"></div>
      <div style="flex:1;"><div style="font-size:24px; font-weight:600; color:#fff; line-height:1.05;">${hof.totalGames}</div><div style="font-size:10px; color:rgba(255,255,255,0.72); margin-top:5px; font-weight:500;">총 경기</div></div>
      <div style="width:1px; background:rgba(255,255,255,0.16);"></div>
      <div style="flex:1;"><div style="font-size:24px; font-weight:600; color:#C0392B; line-height:1.05;">${lifetimeRate}%</div><div style="font-size:10px; color:rgba(255,255,255,0.72); margin-top:5px; font-weight:500;">통산 승률</div></div>
    </div>
  </div>`;

  const playerAwards = _hofGetPlayerAwards(myName);
  const playerOfMonth = section('Player of the Month', '#D58B17', _hofAwardHeroCard('month', playerAwards.monthLabels, clubPalette));
  const playerOfWeek = section('Player of the Week', '#7B8EA8', _hofAwardHeroCard('week', playerAwards.weekLabels, clubPalette));

  const visibleTrack = _getVisibleMilestoneTrack(hof);
  const latestAchieved = [...visibleTrack].reverse().find(n => !!hof.milestoneMap[n]);
  const milestoneTrack = visibleTrack.length
    ? `<div style="display:flex; gap:12px; overflow-x:auto; padding:2px 2px 8px; margin-bottom:14px; scroll-snap-type:x proximity;">${visibleTrack.map(n => _hofMilestoneTrackBadge(hof, n)).join('')}</div>`
    : '';
  const milestoneDetail = latestAchieved ? _hofMilestoneDetailCard(hof, latestAchieved) : '';
  const milestones = section(`${hofIcon('firstWin', 14, '#C17A5A')} Victory Milestones`, '#C17A5A', milestoneTrack + milestoneDetail);

  const rates = section(`${hofIcon('rate', 14, '#3A7BD5')} 최고 승률`, '#3A7BD5',
    _hofBadge(hofIcon('calendarWeek',  24, '#3A7BD5'), '최고 승률의 주',   hof.bestRateWeek  ? `${hof.fmtWeek(hof.bestRateWeek.key)} · ${hof.bestRateWeek.rate}%`   : '기록 없음', hof.bestRateWeek  ? fmtStat(hof.bestRateWeek)  : null) +
    _hofBadge(hofIcon('calendarMonth', 24, '#3A7BD5'), '최고 승률의 달',   hof.bestRateMonth ? `${hof.fmtMonth(hof.bestRateMonth.key)} · ${hof.bestRateMonth.rate}%` : '기록 없음', hof.bestRateMonth ? fmtStat(hof.bestRateMonth) : null) +
    _hofBadge(hofIcon('calendarYear',  24, '#3A7BD5'), '최고 승률의 연도', hof.bestRateYear  ? `${hof.fmtYear(hof.bestRateYear.key)} · ${hof.bestRateYear.rate}%`   : '기록 없음', hof.bestRateYear  ? fmtStat(hof.bestRateYear)  : null));

  const mostWins = section(`${hofIcon('wins', 14, '#5D9C76')} 최다 승수`, '#5D9C76',
    _hofBadge(hofIcon('calendarWeek',  24, '#5D9C76'), '최다승 주',   hof.bestWinsWeek  ? `${hof.fmtWeek(hof.bestWinsWeek.key)} · ${hof.bestWinsWeek.w}승`   : '기록 없음', hof.bestWinsWeek  ? fmtStat(hof.bestWinsWeek)  : null) +
    _hofBadge(hofIcon('calendarMonth', 24, '#5D9C76'), '최다승 달',   hof.bestWinsMonth ? `${hof.fmtMonth(hof.bestWinsMonth.key)} · ${hof.bestWinsMonth.w}승` : '기록 없음', hof.bestWinsMonth ? fmtStat(hof.bestWinsMonth) : null) +
    _hofBadge(hofIcon('calendarYear',  24, '#5D9C76'), '최다승 연도', hof.bestWinsYear  ? `${hof.fmtYear(hof.bestWinsYear.key)} · ${hof.bestWinsYear.w}승`   : '기록 없음', hof.bestWinsYear  ? fmtStat(hof.bestWinsYear)  : null));

  // 연승 극복기 섹션
  const fmtStreakOpps = (opps) => {
    if (!opps || opps.length === 0) return '–';
    // 중복 상대 제거 후 최대 5명까지 표시
    const unique = [...new Set(opps)];
    return unique.slice(0, 5).join(', ') + (unique.length > 5 ? ` 외 ${unique.length - 5}명` : '');
  };

  const winStreakContent = hof.bestWinStreak
    ? _hofBadge(hofIcon('streak', 24, '#8B6B9A'), `최고 연승 · ${hof.bestWinStreak.count}연승`,
        `${hof.bestWinStreak.startDate} ~ ${hof.bestWinStreak.endDate}`,
        `상대: ${fmtStreakOpps(hof.bestWinStreak.opps)}`)
    : `<div style="background:#f5f5f5; border-radius:14px; padding:12px 14px; margin-bottom:10px; opacity:0.45; font-size:13px; color:#bbb; font-weight:600;">기록 없음</div>`;

  const loseStreakContent = hof.bestLoseStreak
    ? _hofBadge(hofIcon('streak', 24, '#8B6B9A'), `최고 연패 극복 · ${hof.bestLoseStreak.count}연패`,
        `${hof.bestLoseStreak.startDate} ~ ${hof.bestLoseStreak.endDate}`,
        `연패 상대: ${fmtStreakOpps(hof.bestLoseStreak.opps)}` +
        (hof.bestLoseStreak.breakInfo
          ? ` · 극복: vs ${hof.bestLoseStreak.breakInfo.opps} (${hof.bestLoseStreak.breakInfo.date})`
          : ' · 극복 기록 없음'))
    : `<div style="background:#f5f5f5; border-radius:14px; padding:12px 14px; margin-bottom:10px; opacity:0.45; font-size:13px; color:#bbb; font-weight:600;">기록 없음</div>`;

  const streaks = section(`${hofIcon('streak', 14, '#8B6B9A')} 연승 / 연패 극복기`, '#8B6B9A', winStreakContent + loseStreakContent);

  body.innerHTML = `<div style="padding-bottom:10px;">${summary + playerOfMonth + playerOfWeek + milestones + streaks + rates + mostWins}</div>`;
}

function closeHallOfFameModal() {
  const modal = document.getElementById('hallOfFameModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}


// ----------------------------------------
// 7. 즐겨찾기 퀵메뉴
// ----------------------------------------

// ✅ v6.65: 경기기록 제거, 순서 재배치
const QUICK_MENU_ALL = [
  { id: 'fee-status',         label: '회비납부\n현황',      icon: '<path d=\"M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-9 14H7v-2h3v2Zm7-4H7v-2h10v2Zm0-4H7V7h10v2Z\"/>', action: () => { _openTreasurerQuick('fee'); } },
  { id: 'finance-mgmt',      label: '재정관리',           icon: '<path d=\"M12 2 1 7l11 5 9-4.09V17h2V7L12 2Zm0 12L5 10.82V17l7 3 7-3v-6.18L12 14Z\"/>', action: () => { _openTreasurerQuick('finance'); } },
  { id: 'court-notice-mgmt', label: '코트공지\n관리',      icon: '<path d=\"M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2Zm0 16H5V8h14v11Zm-7-9h5v5h-5v-5Z\"/>', action: () => { _openTreasurerQuick('court-mgmt'); } },
  { id: 'notice-mgmt',       label: '공지사항\n관리',      icon: '<path d=\"M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4l4 4 4-4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-9 10H7v-2h4v2Zm6-4H7V6h10v2Z\"/>', action: () => { _openTreasurerQuick('notice-mgmt'); } },
  { id: 'monthly-report',    label: '월간운영\n리포트',    icon: '<path d=\"M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-8 14H7v-6h4v6Zm6 0h-4V7h4v10Z\"/>', action: () => { _openTreasurerQuick('report'); } },
  { id: 'player-mgmt',       label: '선수관리',           icon: '<path d=\"M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z\"/>', action: () => { closeQuickMenuPanel(); checkAdminAndShow('player-mgmt'); } },
  { id: 'member-history',    label: '회원이력\n관리',      icon: '<path d=\"M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5Zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5Zm6-1V7h2v6h-2Zm-4 4h6v2h-6v-2Z\"/>', action: () => { _openTreasurerQuick('member-history'); } },
  { id: 'record-reset',      label: '기록초기화',         icon: '<path d=\"M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5v4l5-5-5-5v4Z\"/>', action: () => { _openTreasurerQuick('record-reset'); } },
  { id: 'game',              label: '단일게임',           icon: '<path d=\"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 14H9V8h2v8Zm4 0h-2V8h2v8Z\"/>', action: () => { closeQuickMenuPanel(); showView('game'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'round-auto',        label: '라운드\n자동생성',    icon: '<path d=\"M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 14.93V15h-2v1.93A8 8 0 0 1 4.07 11H6V9H4.07A8 8 0 0 1 11 4.07V6h2V4.07A8 8 0 0 1 19.93 11H18v2h1.93A8 8 0 0 1 13 16.93Z\"/>', action: () => { closeQuickMenuPanel(); showView('round-auto'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'tournament',        label: '토너먼트',           icon: '<path d=\"M17 5h2v2h-2V5Zm0 4h2v2h-2V9Zm-4-4h2v2h-2V5Zm0 8h2v2h-2v-2ZM7 5h2v2H7V5Zm0 4h2v2H7V9Zm-2 8h14v2H5v-2Zm6-4h2v2h-2v-2ZM5 5h2v2H5V5Zm0 4h2v2H5V9Zm6-8h2v2h-2V1Z\"/>', action: () => { closeQuickMenuPanel(); showView('tournament'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'exchange',          label: '교류전',             icon: '<path d=\"M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3ZM21 9l-3.99-4v3H10v2h7.01v3L21 9Z\"/>', action: () => { closeQuickMenuPanel(); showView('exchange'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'ladder',            label: '사다리',             icon: '<path d=\"M4 2h2v20H4V2Zm14 0h2v20h-2V2ZM4 11h16v2H4v-2Z\"/>', action: () => { closeQuickMenuPanel(); showView('ladder'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'stats',             label: '통계',               icon: '<path d=\"M5 17h14v2H3V5h2v12Zm2-3.5 2.8-2.8 2.2 2.2L17 8h2v2h-1.2l-4.8 4.8-2.2-2.2L8.4 15 7 13.5Z\"/>', action: () => { closeQuickMenuPanel(); showView('stats'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'backup',            label: '백업&복원',           icon: '<path d=\"M12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2Zm-1 14v-4H7l5-6 5 6h-4v4h-2Z\"/>', action: () => { closeQuickMenuPanel(); showView('backup'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
];

function _openTreasurerQuick(section) {
  closeQuickMenuPanel();
  window._treasurerQuickTarget = section;
  if (typeof enterTreasurer === 'function') {
    enterTreasurer();
  } else {
    showView('treasurer');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _qmIcon(svgPath, color) {
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="${color || 'currentColor'}" aria-hidden="true">${svgPath}</svg>`;
}

function _normalizeQuickMenuItems(items) {
  const validIds = new Set(QUICK_MENU_ALL.map(item => item.id));
  const src = Array.isArray(items) ? items : [];
  const out = [];
  for (const id of src) {
    if (!validIds.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function _buildQuickMenuButton(item, small) {
  return `<button onclick="window._qmAction('${item.id}')" style="
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:${small ? '5px' : '8px'}; padding:${small ? '10px 4px 8px' : '14px 8px 12px'};
    background:#fff; border:1.5px solid rgba(40,103,70,0.12); border-radius:16px; cursor:pointer;
    min-height:${small ? '70px' : '88px'}; font-size:${small ? '11px' : '12px'}; font-weight:600;
    color:#191c1c; line-height:1.3; white-space:pre-line; text-align:center;
    box-shadow:0 4px 12px rgba(40,103,70,0.07);">
    <div style="width:38px;height:38px;border-radius:12px;background:rgba(40,103,70,0.08);display:flex;align-items:center;justify-content:center;">
      ${_qmIcon(item.icon, '#286746')}
    </div>
    ${item.label}
  </button>`;
}

function _renderQuickMenu(_snapClubId) {
  const panelEmpty = document.getElementById('quickMenuPanelEmpty');
  const panelGrid = document.getElementById('quickMenuPanelGrid');
  if (_snapClubId !== null && (typeof getActiveClubId === 'function' ? getActiveClubId() : null) !== _snapClubId) return;
  const items = _normalizeQuickMenuItems(quickMenu);
  if (Array.isArray(quickMenu) && items.length !== quickMenu.length) quickMenu = [...items];
  if (!panelGrid) return;
  if (!items.length) {
    if (panelEmpty) panelEmpty.style.display = 'block';
    panelGrid.innerHTML = '';
    return;
  }
  if (panelEmpty) panelEmpty.style.display = 'none';
  panelGrid.innerHTML = items.map(id => {
    const item = QUICK_MENU_ALL.find(m => m.id === id);
    return item ? _buildQuickMenuButton(item, false) : '';
  }).join('');
}

// 퀵메뉴 액션 실행 (inline onclick에서 호출)
window._qmAction = function(id) {
  const item = QUICK_MENU_ALL.find(m => m.id === id);
  if (item && typeof item.action === 'function') item.action();
};

let _qmEditSelected = [];

function openQuickMenuPanel() {
  const modal = document.getElementById('quickMenuPanelModal');
  if (!modal) return;
  _renderQuickMenu(typeof getActiveClubId === 'function' ? getActiveClubId() : null);
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  _applyHofClubChrome();
}

function closeQuickMenuPanel() {
  const modal = document.getElementById('quickMenuPanelModal');
  if (modal) modal.style.display = 'none';
  if (document.getElementById('quickMenuEditModal')?.style.display !== 'block') {
    document.body.style.overflow = '';
  }
}

function openQuickMenuEdit() {
  const modal = document.getElementById('quickMenuEditModal');
  const container = document.getElementById('quickMenuAllItems');
  if (!modal || !container) return;

  _qmEditSelected = [...(Array.isArray(quickMenu) ? _normalizeQuickMenuItems(quickMenu) : [])];

  const render = () => {
    container.innerHTML = QUICK_MENU_ALL.map(item => {
      const sel = _qmEditSelected.includes(item.id);
      const idx = _qmEditSelected.indexOf(item.id);
      return `<button onclick="window._qmToggle('${item.id}')" style="
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:10px; padding:20px 12px 18px; border-radius:16px; cursor:pointer;
        font-size:13px; font-weight:600; line-height:1.3; text-align:center;
        background:${sel ? '#fff' : '#F1F4F2'};
        border:2px solid ${sel ? '#286746' : 'transparent'};
        color:${sel ? '#191c1c' : '#4B5563'};
        box-shadow:${sel ? '0 8px 24px rgba(40,103,70,0.10)' : 'none'};
        position:relative; box-sizing:border-box; width:100%;">
        ${sel ? `<div style="position:absolute;top:10px;right:10px;width:22px;height:22px;border-radius:50%;background:#286746;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;">${idx + 1}</div>` : ''}
        <div style="width:48px;height:48px;border-radius:14px;background:${sel ? 'rgba(40,103,70,0.10)' : '#E5EAE7'};display:flex;align-items:center;justify-content:center;">
          ${_qmIcon(item.icon, sel ? '#286746' : '#6B7280')}
        </div>
        <span style="white-space:pre-line;">${item.label}</span>
      </button>`;
    }).join('');
  };

  window._qmToggle = function(id) {
    const idx = _qmEditSelected.indexOf(id);
    if (idx >= 0) {
      _qmEditSelected.splice(idx, 1);
    } else {
      _qmEditSelected.push(id);
    }
    render();
  };

  render();
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  _applyHofClubChrome();
}

function openQuickMenuEditFromPanel() {
  closeQuickMenuPanel();
  openQuickMenuEdit();
}

function closeQuickMenuEdit() {
  const modal = document.getElementById('quickMenuEditModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function saveQuickMenu() {
  quickMenu = _normalizeQuickMenuItems(_qmEditSelected);
  closeQuickMenuEdit();
  _renderQuickMenu(typeof getActiveClubId === 'function' ? getActiveClubId() : null);
  if (typeof pushQuickMenu === 'function') {
    pushQuickMenu().catch(e => console.warn('pushQuickMenu error:', e));
  }
}

// ----------------------------------------
// window 전역 등록
// ----------------------------------------

window.hideSplashSafe       = hideSplashSafe;
window.renderHome           = renderHome;
window.renderHomeSection    = renderHomeSection;
window.openHallOfFameModal  = openHallOfFameModal;
window.closeHallOfFameModal = closeHallOfFameModal;
window.openQuickMenuPanel   = openQuickMenuPanel;
window.closeQuickMenuPanel  = closeQuickMenuPanel;
window.openQuickMenuEdit    = openQuickMenuEdit;
window.openQuickMenuEditFromPanel = openQuickMenuEditFromPanel;
window.closeQuickMenuEdit   = closeQuickMenuEdit;
window.saveQuickMenu        = saveQuickMenu;
