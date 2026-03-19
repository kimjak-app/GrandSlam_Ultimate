// ========================================
// MAIN.JS - 앱 진입점 / 이벤트 / 홈 렌더링
// ========================================

// ✅ 버전 상수 — 버전업 시 여기만 바꾸면 전체 반영
const APP_VERSION = 'v6.64';


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

function _renderClubStatus(_snapClubId) {
  const el = id => document.getElementById(id);
  if (!Array.isArray(matchLog) || !Array.isArray(players)) return;

  // ✅ 1단계 가드: 계산 시작 전 클럽이 바뀌었으면 중단
  if (_snapClubId !== null && (typeof getActiveClubId === 'function' ? getActiveClubId() : null) !== _snapClubId) return;

  const clubName = currentClub?.clubName || '우리 클럽';
  if (el('clubStatusName')) el('clubStatusName').innerHTML = `<span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle; margin-right:4px; color:#ffffff;">emoji_events</span>${clubName} 이번달`;

  // 리셋 (클럽 전환 시 잔상 제거)
  try {
    ['clubTopPlayerRow','clubWeekendPlayerRow'].forEach(id => { const r = el(id); if (r) r.style.display = 'none'; });
    if (el('clubTopPlayer'))    el('clubTopPlayer').innerHTML    = '';
    if (el('clubWeekendPlayer')) el('clubWeekendPlayer').innerHTML = '';
    const totalMembers0 = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length;
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
  const mondayStr      = toStr(monday);
  const lastMondayStr  = toStr(lastMonday);
  const lastSundayStr  = toStr(new Date(monday.getTime() - 86400000));
  const thisMonthStr   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const thisWeekGames = matchLog.filter(m => m.date >= mondayStr).length;
  const lastWeekGames = matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr).length;

  const getNames = logs => { const s = new Set(); logs.forEach(m => [...(m.home||[]),...(m.away||[])].forEach(n => s.add(n))); return s; };
  const totalMembers = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).length;

  if (el('clubThisWeekGames'))  el('clubThisWeekGames').textContent  = thisWeekGames || '0';
  if (el('clubThisWeekAttend')) el('clubThisWeekAttend').textContent = `${getNames(matchLog.filter(m => m.date >= mondayStr)).size}/${totalMembers}`;
  if (el('clubLastWeekGames'))  el('clubLastWeekGames').textContent  = lastWeekGames || '0';
  if (el('clubLastWeekAttend')) el('clubLastWeekAttend').textContent = `${getNames(matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr)).size}/${totalMembers}`;

  const calcMatchScore = (m, name) => {
    const inHome = (m.home||[]).includes(name), inAway = (m.away||[]).includes(name);
    if (!inHome && !inAway) return 0;
    const isWin  = (inHome && m.winner==='home') || (inAway && m.winner==='away');
    const scoring = (typeof getClubScoring === 'function' ? getClubScoring() : null) || TENNIS_RULES.scoring;
    const rule   = scoring[m.type || 'double'] || scoring.double;
    return scoring.participate + (isWin ? rule.win : rule.loss);
  };

  const buildScoreMap = logs => {
    const map = {};
    logs.forEach(m => {
      [...(m.home||[]),...(m.away||[])].forEach(n => {
        if (!map[n]) map[n] = { w:0, l:0, pts:0 };
        const inHome = (m.home||[]).includes(n);
        const isWin  = (inHome && m.winner==='home') || (!inHome && m.winner==='away');
        isWin ? map[n].w++ : map[n].l++;
        map[n].pts += calcMatchScore(m, n);
      });
    });
    return map;
  };

  const isActiveMember = n => players.find(p => p.name===n && !p.isGuest && (!p.status||p.status==='active'));

  // 이달의 1위
  const monthGames = matchLog.filter(m => (m.date||'').startsWith(thisMonthStr));
  if (monthGames.length > 0) {
    const top = Object.entries(buildScoreMap(monthGames))
      .filter(([n]) => isActiveMember(n)).sort(([,a],[,b]) => b.pts-a.pts || b.w-a.w)[0];
    if (top && el('clubTopPlayer') && el('clubTopPlayerRow')) {
      const dname = typeof displayName === 'function' ? displayName(top[0]) : top[0];
      const ts    = top[1];
      const rate  = (ts.w+ts.l) > 0 ? Math.round(ts.w/(ts.w+ts.l)*100) : 0;
      el('clubTopPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:28px; vertical-align:middle; margin-right:4px; color:#8B6914;">stars</span>${dname}<div style="font-size:13px;font-weight:600;color:#888;margin-top:4px;">${ts.w}승 ${ts.l}패 &nbsp;${rate}%</div>`;
      el('clubTopPlayerRow').style.display = 'block';
      _recordMonthlyMvp(thisMonthStr, top[0]);
    }
  }

  // 이번주/지난주 BEST PLAYER
  const isThisWeek    = thisWeekGames > 0;
  const weekendSource = isThisWeek
    ? matchLog.filter(m => m.date >= mondayStr)
    : matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);

  if (weekendSource.length > 0) {
    const wTop = Object.entries(buildScoreMap(weekendSource))
      .filter(([n]) => isActiveMember(n)).sort(([,a],[,b]) => b.pts-a.pts || b.w-a.w)[0];
    if (wTop && el('clubWeekendPlayer') && el('clubWeekendPlayerRow')) {
      const wdname = typeof displayName === 'function' ? displayName(wTop[0]) : wTop[0];
      const ws     = wTop[1];
      const wrate  = (ws.w+ws.l) > 0 ? Math.round(ws.w/(ws.w+ws.l)*100) : 0;
      el('clubWeekendPlayer').innerHTML = `<span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">military_tech</span>${wdname}<div style="font-size:12px;font-weight:600;color:#999;margin-top:3px;">${ws.w}승 ${ws.l}패 &nbsp;${wrate}%</div>`;
      const wLabelEl = el('clubWeekendPlayerRow').querySelector('div');
      if (wLabelEl) wLabelEl.textContent = `BEST PLAYER ${isThisWeek ? 'THIS WEEKEND' : 'LAST WEEKEND'}`;
      el('clubWeekendPlayerRow').style.display = 'block';
      const weekRefDate = (isThisWeek ? mondayStr : lastMondayStr);
      _recordWeeklyMvp(weekRefDate, wTop[0]);
      if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
    }
  }

  // MOST IMPROVED THIS WEEK
  if (isThisWeek) {
    const twMap = buildScoreMap(matchLog.filter(m => m.date >= mondayStr));
    const lwMap = buildScoreMap(matchLog.filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr));
    const improved = Object.entries(twMap)
      .filter(([n, d]) => isActiveMember(n) && (d.w+d.l) >= 2)
      .map(([n, d]) => {
        const twRate = Math.round(d.w/(d.w+d.l)*100);
        const lw     = lwMap[n];
        const lwRate = lw && (lw.w+lw.l) >= 1 ? Math.round(lw.w/(lw.w+lw.l)*100) : 0;
        return { name:n, delta: twRate-lwRate, twRate, lwRate, pts: d.pts };
      })
      .filter(p => p.delta > 0).sort((a,b) => b.delta-a.delta || b.pts-a.pts).slice(0,3);

    if (improved.length > 0 && el('clubImprovedRow') && el('clubImprovedPlayer')) {
      el('clubImprovedPlayer').innerHTML = improved.map(p => {
        const dname = typeof displayName === 'function' ? displayName(p.name) : p.name;
        return `<div style="margin-bottom:6px;"><span class="material-symbols-outlined" style="font-size:22px; vertical-align:middle; margin-right:4px; color:#8B6914;">trending_up</span>${dname}<div style="font-size:12px;color:#5D9C76;font-weight:600;margin-top:2px;">▲${p.delta}% (지난주 ${p.lwRate}% → 이번주 ${p.twRate}%)</div></div>`;
      }).join('');
      el('clubImprovedRow').style.display = 'block';
      if (el('clubTopPlayerRow')) el('clubTopPlayerRow').style.display = 'block';
    }
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

  // 동적 마일스톤 생성: 1·10·50·100 고정 + 100 이후 50단위 자동 확장
  const FIXED_MILESTONES = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const dynamicMilestones = [...FIXED_MILESTONES];
  if (wins.length > 100) {
    let next = 150;
    while (next <= wins.length + 50) {
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
      const isWin  = (inHome && m.winner === 'home') || (!inHome && m.winner === 'away');
      const dn     = n => typeof displayName === 'function' ? displayName(n) : n;
      const oppTeam = (inHome ? (m.away||[]) : (m.home||[])).map(dn).join('·');
      const date    = m.date || '';

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

function hofIcon(type, size, color, isMuted) {
  const px = size || 24;
  const c = color || '#D4A24C';
  const opacity = isMuted ? '0.45' : '1';
  const icons = {
    hall: '<path d="M12 2l7 3v4c0 4.7-2.9 8.8-7 10.2C7.9 17.8 5 13.7 5 9V5l7-3Zm0 2.2L7 6.3v2.6c0 3.6 2.1 6.8 5 8 2.9-1.2 5-4.4 5-8V6.3l-5-2.1Zm-2.2 4.3h4.4v1.6h-1.4v3.7h-1.6v-3.7H9.8V8.5Z"/>',
    firstWin: '<path d="M9 4h6v2h-1v3.3a3.5 3.5 0 0 1-2 3.2V15h2v2H8v-2h2v-2.5a3.5 3.5 0 0 1-2-3.2V6H7V4h2Zm1 2v3.3a1.5 1.5 0 0 0 3 0V6h-3Z"/><path d="M17 5h2v2a3 3 0 0 1-3 3h-1V8h1a1 1 0 0 0 1-1V5ZM7 5v2a1 1 0 0 0 1 1h1v2H8a3 3 0 0 1-3-3V5h2Z"/>',
    star: '<path d="m12 3 2.1 4.6 5 .6-3.7 3.5 1 5-4.4-2.5L7.6 17l1-5L5 8.2l5-.6L12 3Z"/>',
    spark: '<path d="M12 2.5 14.2 8l5.8.5-4.4 3.8 1.3 5.7L12 15.1 7.1 18l1.3-5.7L4 8.5 9.8 8 12 2.5Z"/><path d="M18.8 3.8 20 6l2.2 1.2L20 8.4l-1.2 2.2-1.2-2.2-2.2-1.2L17.6 6l1.2-2.2Z"/>',
    trophy: '<path d="M8 4h8v2h1a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h-.6A5.5 5.5 0 0 1 13 14.6V17h3v2H8v-2h3v-2.4A5.5 5.5 0 0 1 9.6 13H9a4 4 0 0 1-4-4V8a2 2 0 0 1 2-2h1V4Zm0 2v3a3.5 3.5 0 0 0 7 0V6H8Zm9 2v1a2 2 0 0 1-2 2V8h2Zm-10 0v3a2 2 0 0 1-2-2V8h2Z"/>',
    crown: '<path d="m4 17 1.6-9 4.1 3.2L12 5l2.3 6.2L18.4 8 20 17H4Zm2.4-2h11.2l-.5-3.2-2.4 1.8L12 9.5l-2.7 4.1-2.4-1.8L6.4 15Z"/>',
    trident: '<path d="M11 2h2v4.6l1.3-1.3 1.4 1.4-2.7 2.7V18h3v2H8v-2h3V9.4L8.3 6.7l1.4-1.4L11 6.6V2Zm6.5 1.8L20.8 7 19.4 8.4l-1.9-1.9-1.9 1.9L14.2 7l3.3-3.2Zm-11 0L9.8 7 8.4 8.4 6.5 6.5 4.6 8.4 3.2 7l3.3-3.2Z"/>',
    rate: '<path d="M5 17h14v2H3V5h2v12Zm2-3.5 2.8-2.8 2.2 2.2L17 8h2v2h-1.2l-4.8 4.8-2.2-2.2L8.4 15 7 13.5Z"/>',
    wins: '<path d="M7 18h10v2H7v-2Zm5-16 6 3v4c0 4.3-2.5 8.1-6 9.6C8.5 17.1 6 13.3 6 9V5l6-3Zm0 2.2L8 6.3v2.6c0 3.1 1.7 5.9 4 7 2.3-1.1 4-3.9 4-7V6.3l-4-2.1Z"/>',
    streak: '<path d="M13 2 6 13h4l-1 9 7-11h-4l1-9Z"/>',
    calendarWeek: '<path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 8H5v8h14v-8ZM5 8h14V6H5v2Z"/>',
    calendarMonth: '<path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2Zm12 6H5v10h14V8Zm-9 3h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z"/>',
    calendarYear: '<path d="M6 3h12a2 2 0 0 1 2 2v14H4V5a2 2 0 0 1 2-2Zm12 6H6v8h12V9ZM8 5H6v2h12V5h-2v1h-2V5h-4v1H8V5Z"/>',
    close: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"/>'
  };
  const svg = icons[type] || icons.trophy;
  return `<span style="display:inline-flex; align-items:center; justify-content:center; width:${px}px; height:${px}px; color:${c}; opacity:${opacity}; flex-shrink:0; line-height:1; vertical-align:middle;"><svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="currentColor" aria-hidden="true">${svg}</svg></span>`;
}

function _hofBadge(icon, label, value, sub) {
  return `<div style="background:#fff; border-radius:14px; padding:12px 14px; box-shadow:0 2px 8px rgba(0,0,0,0.07); margin-bottom:10px;">
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="line-height:1; flex-shrink:0;">${icon}</div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:10px; color:#999; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin-bottom:3px;">${label}</div>
        <div style="font-size:15px; font-weight:800; color:#1a1a2e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${value}</div>
        ${sub ? `<div style="font-size:11px; color:#888; margin-top:3px;">${sub}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function _hofMilestoneBadge(iconType, label, info) {
  if (!info) return `<div style="background:#f5f5f5; border-radius:14px; padding:12px 14px; margin-bottom:10px; opacity:0.45;">
    <div style="display:flex; align-items:center; gap:10px;">
      <div style="line-height:1; flex-shrink:0;">${hofIcon(iconType, 28, '#D4A24C', true)}</div>
      <div><div style="font-size:10px; color:#bbb; font-weight:700; letter-spacing:1px;">${label}</div>
      <div style="font-size:13px; color:#ccc; font-weight:600;">아직 달성 전</div></div>
    </div></div>`;
  const partnerTxt = info.partner ? ` · 파트너: ${info.partner}` : '';
  return _hofBadge(hofIcon(iconType, 28, '#D4A24C'), label, `vs ${info.opps}`, `${info.date}${partnerTxt}`);
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
  const items = [];

  if (hof.milestoneMap[1]) items.push(`<div style="flex-shrink:0; background:#FFF8E8; border:1.5px solid #F0D080; border-radius:14px; padding:10px 14px; min-width:130px; text-align:center;">
    <div>${hofIcon('firstWin', 22, '#C17A5A')}</div>
    <div style="font-size:10px; color:#C17A5A; font-weight:700; margin-top:4px;">첫 승리</div>
    <div style="font-size:12px; font-weight:800; color:#1a1a2e; margin-top:2px;">${hof.milestoneMap[1].date}</div>
  </div>`);

  // 가장 최근 달성한 마일스톤 배지 (10승 이상)
  const achieved = hof.milestones.filter(n => n >= 10 && hof.milestoneMap[n]);
  const latestMilestone = achieved[achieved.length - 1];
  if (latestMilestone) {
    const info  = hof.milestoneMap[latestMilestone];
    const emoji = milestoneEmoji(latestMilestone);
    items.push(`<div style="flex-shrink:0; background:#EEF6FF; border:1.5px solid #90C0E8; border-radius:14px; padding:10px 14px; min-width:130px; text-align:center;">
      <div>${hofIcon(emoji, 22, '#3A7BD5')}</div>
      <div style="font-size:10px; color:#3A7BD5; font-weight:700; margin-top:4px;">${latestMilestone}승 달성</div>
      <div style="font-size:12px; font-weight:800; color:#1a1a2e; margin-top:2px;">${info.date}</div>
    </div>`);
  }

  if (hof.bestRateMonth) items.push(`<div style="flex-shrink:0; background:#F0FBF4; border:1.5px solid #90D0A8; border-radius:14px; padding:10px 14px; min-width:130px; text-align:center;">
    <div>${hofIcon('rate', 22, '#5D9C76')}</div>
    <div style="font-size:10px; color:#5D9C76; font-weight:700; margin-top:4px;">최고 승률의 달</div>
    <div style="font-size:12px; font-weight:800; color:#1a1a2e; margin-top:2px;">${hof.fmtMonth(hof.bestRateMonth.key)} · ${hof.bestRateMonth.rate}%</div>
  </div>`);

  if (hof.bestWinsWeek) items.push(`<div style="flex-shrink:0; background:#F8F0FF; border:1.5px solid #C0A0E0; border-radius:14px; padding:10px 14px; min-width:130px; text-align:center;">
    <div>${hofIcon('wins', 22, '#8B6B9A')}</div>
    <div style="font-size:10px; color:#8B6B9A; font-weight:700; margin-top:4px;">최다승 주</div>
    <div style="font-size:12px; font-weight:800; color:#1a1a2e; margin-top:2px;">${hof.fmtWeek(hof.bestWinsWeek.key)} · ${hof.bestWinsWeek.w}승</div>
  </div>`);

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
    `<div style="margin-bottom:16px;"><div style="font-size:11px; font-weight:800; color:${color}; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:8px; padding-left:4px;">${title}</div>${content}</div>`;

  const fmtStat = (s) => s ? `${s.w}승 ${s.l}패 · ${s.rate}%` : '–';

  const summary = `<div style="background:#2C3E6B; border-radius:14px; padding:14px 16px; margin-bottom:16px; display:flex; justify-content:space-around; text-align:center;">
    <div><div style="font-size:26px; font-weight:900; color:#fff;">${hof.totalWins}</div><div style="font-size:10px; color:rgba(255,255,255,0.6); margin-top:2px;">총 승리</div></div>
    <div style="width:1px; background:rgba(255,255,255,0.15);"></div>
    <div><div style="font-size:26px; font-weight:900; color:#fff;">${hof.totalGames}</div><div style="font-size:10px; color:rgba(255,255,255,0.6); margin-top:2px;">총 경기</div></div>
    <div style="width:1px; background:rgba(255,255,255,0.15);"></div>
    <div><div style="font-size:26px; font-weight:900; color:#fff;">${hof.totalGames > 0 ? Math.round(hof.totalWins/hof.totalGames*100) : 0}%</div><div style="font-size:10px; color:rgba(255,255,255,0.6); margin-top:2px;">통산 승률</div></div>
  </div>`;

  // 동적 마일스톤 배지 생성
  const milestoneBadges = hof.milestones.map(n =>
    _hofMilestoneBadge(milestoneEmoji(n), `${n === 1 ? '첫 승리' : n + '승'} 달성`, hof.milestoneMap[n])
  ).join('');

  const milestones = section(`${hofIcon('firstWin', 14, '#C17A5A')} 승리 마일스톤`, '#C17A5A', milestoneBadges);

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

  body.innerHTML = summary + milestones + streaks + rates + mostWins;
}

function closeHallOfFameModal() {
  const modal = document.getElementById('hallOfFameModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}


// ----------------------------------------
// 7. 즐겨찾기 퀵메뉴
// ----------------------------------------

const QUICK_MENU_ALL = [
  { id: 'fee-status',         label: '회비납부\n현황',      icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-9 14H7v-2h3v2Zm7-4H7v-2h10v2Zm0-4H7V7h10v2Z"/>', action: () => { _openTreasurerQuick('fee'); } },
  { id: 'finance-mgmt',      label: '재정관리',           icon: '<path d="M12 2 1 7l11 5 9-4.09V17h2V7L12 2Zm0 12L5 10.82V17l7 3 7-3v-6.18L12 14Z"/>', action: () => { _openTreasurerQuick('finance'); } },
  { id: 'court-notice-mgmt', label: '코트공지\n관리',      icon: '<path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V5c0-1.1-.9-2-2-2Zm0 16H5V8h14v11Zm-7-9h5v5h-5v-5Z"/>', action: () => { _openTreasurerQuick('court-mgmt'); } },
  { id: 'notice-mgmt',       label: '공지사항\n관리',      icon: '<path d="M20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4l4 4 4-4h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-9 10H7v-2h4v2Zm6-4H7V6h10v2Z"/>', action: () => { _openTreasurerQuick('notice-mgmt'); } },
  { id: 'monthly-report',    label: '월간운영\n리포트',    icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-8 14H7v-6h4v6Zm6 0h-4V7h4v10Z"/>', action: () => { _openTreasurerQuick('report'); } },
  { id: 'player-mgmt',       label: '선수관리',           icon: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z"/>', action: () => { closeQuickMenuPanel(); checkAdminAndShow('player-mgmt'); } },
  { id: 'member-history',    label: '회원이력\n관리',      icon: '<path d="M12 12c2.76 0 5-2.24 5-5S14.76 2 12 2 7 4.24 7 7s2.24 5 5 5Zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5Zm6-1V7h2v6h-2Zm-4 4h6v2h-6v-2Z"/>', action: () => { _openTreasurerQuick('member-history'); } },
  { id: 'record-reset',      label: '기록초기화',         icon: '<path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5v4l5-5-5-5v4Z"/>', action: () => { _openTreasurerQuick('record-reset'); } },
  { id: 'game',              label: '단일게임',           icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 14H9V8h2v8Zm4 0h-2V8h2v8Z"/>', action: () => { closeQuickMenuPanel(); showView('game'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'round-auto',        label: '라운드\n자동생성',    icon: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 14.93V15h-2v1.93A8 8 0 0 1 4.07 11H6V9H4.07A8 8 0 0 1 11 4.07V6h2V4.07A8 8 0 0 1 19.93 11H18v2h1.93A8 8 0 0 1 13 16.93Z"/>', action: () => { closeQuickMenuPanel(); showView('round-auto'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'exchange',          label: '교류전',             icon: '<path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3ZM21 9l-3.99-4v3H10v2h7.01v3L21 9Z"/>', action: () => { closeQuickMenuPanel(); showView('exchange'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'ladder',            label: '사다리',             icon: '<path d="M4 2h2v20H4V2Zm14 0h2v20h-2V2ZM4 11h16v2H4v-2Z"/>', action: () => { closeQuickMenuPanel(); showView('ladder'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'stats',             label: '통계',               icon: '<path d="M5 17h14v2H3V5h2v12Zm2-3.5 2.8-2.8 2.2 2.2L17 8h2v2h-1.2l-4.8 4.8-2.2-2.2L8.4 15 7 13.5Z"/>', action: () => { closeQuickMenuPanel(); showView('stats'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'tournament',        label: '토너먼트',           icon: '<path d="M17 5h2v2h-2V5Zm0 4h2v2h-2V9Zm-4-4h2v2h-2V5Zm0 8h2v2h-2v-2ZM7 5h2v2H7V5Zm0 4h2v2H7V9Zm-2 8h14v2H5v-2Zm6-4h2v2h-2v-2ZM5 5h2v2H5V5Zm0 4h2v2H5V9Zm6-8h2v2h-2V1Z"/>', action: () => { closeQuickMenuPanel(); showView('tournament'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  { id: 'record',            label: '경기기록',           icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6Zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19Z"/>', action: () => { closeQuickMenuPanel(); showView('record'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
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
    gap:${small ? '5px' : '6px'}; padding:${small ? '10px 4px 8px' : '12px 6px 10px'};
    background:#F8F9FB; border:1.5px solid #EBEBEB; border-radius:14px; cursor:pointer;
    min-height:${small ? '70px' : '84px'}; font-size:${small ? '11px' : '12px'}; font-weight:700;
    color:#3A4A5A; line-height:1.3; white-space:pre-line; text-align:center;">
    ${_qmIcon(item.icon, '#4A6B8A')}
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
        gap:5px; padding:10px 4px 8px; border-radius:14px; cursor:pointer; min-height:70px;
        font-size:11px; font-weight:700; line-height:1.3; white-space:pre-line; text-align:center;
        background:${sel ? '#E8F0FB' : '#F8F9FB'};
        border:2px solid ${sel ? 'var(--aussie-blue)' : '#EBEBEB'};
        color:${sel ? 'var(--aussie-blue)' : '#3A4A5A'};
        position:relative;">
        ${sel ? `<span style="position:absolute;top:4px;right:6px;font-size:10px;font-weight:900;color:var(--aussie-blue);">${idx + 1}</span>` : ''}
        ${_qmIcon(item.icon, sel ? 'var(--aussie-blue)' : '#4A6B8A')}
        ${item.label}
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
