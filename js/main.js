// ========================================
// MAIN.JS - 앱 진입점 / 이벤트 / 홈 렌더링
// ========================================


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

function renderHome() {
  try {
    // 클럽 전환 시 다른 클럽 선수 잔상 제거
    if (currentLoggedPlayer && Array.isArray(players) && !players.find(p => p.name === currentLoggedPlayer.name)) {
      currentLoggedPlayer = null;
    }
    _renderLockerRoom();
    _renderClubStatus();
  } catch (e) { console.warn('[renderHome] error:', e); }
}

function _renderLockerRoom() {
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

function _renderClubStatus() {
  const el = id => document.getElementById(id);
  if (!Array.isArray(matchLog) || !Array.isArray(players)) return;

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
// window 전역 등록
// ----------------------------------------

window.hideSplashSafe  = hideSplashSafe;
window.renderHome      = renderHome;
