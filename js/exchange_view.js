// ========================================
// EXCHANGE_VIEW.JS - 교류전 UI/렌더링
// ========================================

let exRecordMode = 'quick';
let exQuickWinner = '';
let exCourtCountInputMode = 'preset';

function getExCourtCount() {
  if (activeExchange && Number(activeExchange.courtCount) > 0) return Math.max(1, Number(activeExchange.courtCount) || 1);
  const inputValue = Number(($('ex-view-court-custom-input') || {}).value);
  return Math.max(1, inputValue || 1);
}

function syncExCourtCountUI() {
  const courtCount = getExCourtCount();
  const usePreset = exCourtCountInputMode !== 'custom' && courtCount >= 1 && courtCount <= 5;
  const directBtn = $('ex-view-court-direct-btn');
  const input = $('ex-view-court-custom-input');
  document.querySelectorAll('#ex-view-court-tabs .ex-view-court-count-btn').forEach(btn => {
    const isActive = usePreset && Number(btn.dataset.court) === courtCount;
    btn.style.background = isActive ? 'var(--aussie-blue)' : '#f3f4f6';
    btn.style.color = isActive ? '#fff' : '#333';
  });
  if (directBtn) {
    const active = !usePreset;
    directBtn.style.background = active ? 'var(--aussie-blue)' : '#fff';
    directBtn.style.color = active ? '#fff' : '#333';
  }
  if (input) {
    input.style.display = usePreset ? 'none' : 'block';
    input.value = usePreset ? '' : String(courtCount);
  }
}

function setExCourtCount(count) {
  const next = Math.max(1, Number(count) || 1);
  exCourtCountInputMode = 'preset';
  if (activeExchange) activeExchange.courtCount = next;
  const input = $('ex-view-court-custom-input');
  if (input) input.value = '';
  syncExCourtCountUI();
  persistExchangeCourtCount(next);
  syncExQuickCourtState();
  renderExRecordModeUI();
}

function openExCourtCountDirectInput() {
  exCourtCountInputMode = 'custom';
  syncExCourtCountUI();
  $('ex-view-court-custom-input')?.focus();
}

function syncExViewCourtCountInput() {
  const next = Math.max(1, Number(($('ex-view-court-custom-input') || {}).value) || 1);
  exCourtCountInputMode = 'custom';
  if (activeExchange) activeExchange.courtCount = next;
  syncExCourtCountUI();
  persistExchangeCourtCount(next);
  syncExQuickCourtState();
  renderExRecordModeUI();
}

function persistExchangeCourtCount(courtCount) {
  if (!activeExchange?.id || isSimulation) return;
  _exchangeRef(activeExchange.id).update({ courtCount }).catch(e => {
    console.warn('[exchange] persistExchangeCourtCount error:', e);
  });
}

function getExRequiredPlayersPerSide(matchType) {
  return matchType === 'singles' ? 1 : 2;
}

function createExQuickCourt(courtNo, matchType = 'doubles') {
  return { courtNo, matchType, home: [], away: [] };
}

function getExCourtMatchType(court) {
  return court?.matchType === 'singles' ? 'singles' : 'doubles';
}

function getExScoreMatchType() {
  return getExCourtMatchType(getExQuickCourt(1));
}

function getExQuickTarget() {
  for (const court of exQuickCourts) {
    const required = getExRequiredPlayersPerSide(getExCourtMatchType(court));
    if ((court.home || []).length < required) return { courtNo: court.courtNo, slot: 'home' };
    if ((court.away || []).length < required) return { courtNo: court.courtNo, slot: 'away' };
  }
  return null;
}

function syncExQuickTarget() {
  exQuickTarget = getExQuickTarget() || { courtNo: 1, slot: 'home' };
}

function syncExQuickCourtState({ reset = false } = {}) {
  const count = getExCourtCount();
  const nextCourts = Array.from({ length: count }, (_, i) => {
    const prev = !reset ? exQuickCourts.find(c => c.courtNo === i + 1) : null;
    const matchType = prev ? getExCourtMatchType(prev) : 'doubles';
    const required = getExRequiredPlayersPerSide(matchType);
    return {
      ...createExQuickCourt(i + 1, matchType),
      home: prev ? (prev.home || []).slice(0, required) : [],
      away: prev ? (prev.away || []).slice(0, required) : [],
    };
  });
  exQuickCourts = nextCourts;
  syncExQuickTarget();
  renderExchangePickedPlayers();
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
}

function getExQuickAssignedKeys() {
  const keys = new Set();
  exQuickCourts.forEach(court => {
    (court.home || []).forEach(name => keys.add(`A:${name}`));
    (court.away || []).forEach(name => keys.add(`B:${name}`));
  });
  return keys;
}

function getExQuickCourt(courtNo) {
  return exQuickCourts.find(c => c.courtNo === Number(courtNo));
}

function removeExQuickPlayer(courtNo, slot, name) {
  const court = getExQuickCourt(courtNo);
  if (!court) return;
  const key = slot === 'away' ? 'away' : 'home';
  court[key] = (court[key] || []).filter(v => v !== name);
  syncExQuickTarget();
  renderExchangePickedPlayers();
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
}

function exchangeQuickPickPlayer(side, name) {
  const target = getExQuickTarget();
  if (!target) {
    gsAlert('모든 코트가 완성되었습니다. 승리팀을 먼저 선택해주세요.');
    return;
  }

  const targetSide = target.slot === 'home' ? 'A' : 'B';
  if (side !== targetSide) return;

  const court = getExQuickCourt(target.courtNo);
  if (!court) return;

  const listKey = side === 'A' ? 'home' : 'away';
  const assignedKeys = getExQuickAssignedKeys();
  const uniqueKey = `${side}:${name}`;
  const currentList = court[listKey] || [];
  const required = getExRequiredPlayersPerSide(getExCourtMatchType(court));

  if (currentList.includes(name)) {
    court[listKey] = currentList.filter(v => v !== name);
  } else {
    if (assignedKeys.has(uniqueKey)) return;
    if (currentList.length >= required) return;
    court[listKey] = [...currentList, name];
    showExchangeHint(side, getExchangePlayerHint(name));
  }

  syncExQuickTarget();
  renderExchangePickedPlayers();
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
}

function setExQuickCourtMatchType(courtNo, matchType) {
  const court = getExQuickCourt(courtNo);
  if (!court) return;
  const nextType = matchType === 'singles' ? 'singles' : 'doubles';
  if (getExCourtMatchType(court) === nextType) return;

  const hadPlayers = (court.home || []).length || (court.away || []).length;
  court.matchType = nextType;
  court.home = [];
  court.away = [];
  court.winner = null;
  court.homeScore = null;
  court.awayScore = null;
  syncExQuickTarget();
  renderExchangePickedPlayers();
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
  if (hadPlayers) gsAlert(`코트${courtNo} 경기유형 변경으로 해당 코트 배정을 초기화했습니다.`);
}

function resetExQuickCourt(courtNo) {
  const court = getExQuickCourt(courtNo);
  if (!court) return;
  court.home = [];
  court.away = [];
  court.winner = null;
  court.homeScore = null;
  court.awayScore = null;
  syncExQuickTarget();
  renderExchangePickedPlayers();
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
  showExchangeHint('A', '');
  showExchangeHint('B', '');
}

function confirmCancelExQuickCourt(courtNo) {
  gsConfirm(
    '이 코트 경기를 취소하시겠습니까?\n선수 선택이 초기화됩니다.',
    ok => { if (ok) resetExQuickCourt(courtNo); },
    { title: '경기 취소', okText: '경기 취소', cancelText: '취소' }
  );
}

async function finishExchange() {
  if (isSimulation) {
    gsConfirm('시뮬레이션을 종료하시겠습니까?\n종료 후에는 점수 수정이 불가능합니다.', ok => {
      if (!ok) return;
      activeExchange = null;
      isSimulation = false;
      _hideGameArea();
      initExchangeView();
    });
    return;
  }
  if (!activeExchange) return;
  gsConfirm('교류전을 종료하시겠습니까?\n종료 후에는 점수 수정이 불가능합니다.', async ok => {
    if (!ok) return;
    const { ts } = nowISO();
    try {
      await _exchangeRef(activeExchange.id).update({ status: 'finished', finishedAt: ts });
      activeExchange.status = 'finished';
      activeExchange.finishedAt = ts;
      activeExchange = null;
      _hideGameArea();
      gsAlert('교류전이 종료되었습니다!');
      showView('game');
    } catch (e) {
      console.error('[exchange] finishExchange error:', e);
      gsAlert('종료 처리 실패 😵');
    }
  });
}

function _hideGameArea() {
  if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
  if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
  if ($('ex-scoreboard')) $('ex-scoreboard').style.display = 'none';
}

function addExchangeGuest(side, name, gender) {
  const guest = { name: name.trim(), gender, isGuest: true };
  const list = side === 'A' ? exchangeGuestsA : exchangeGuestsB;
  if (!list.find(g => g.name === guest.name)) list.push(guest);
  renderExchangePlayerPool(side);
}

function removeExchangeGuest(side, name) {
  if (side === 'A') exchangeGuestsA = exchangeGuestsA.filter(g => g.name !== name);
  else exchangeGuestsB = exchangeGuestsB.filter(g => g.name !== name);
  renderExchangePlayerPool(side);
}

function openExchangeAdminModal() {
  const modal = $('ex-admin-modal');
  if (modal) modal.style.display = 'flex';
}

function closeExchangeAdminModal() {
  const modal = $('ex-admin-modal');
  if (modal) modal.style.display = 'none';
}

async function openExchangeActiveAdminModal() {
  const modal = $('ex-active-admin-modal');
  if (modal) modal.style.display = 'flex';
  await renderExchangeActiveAdminList();
}

function closeExchangeActiveAdminModal() {
  const modal = $('ex-active-admin-modal');
  if (modal) modal.style.display = 'none';
}

async function forceFinishExchangeRecord(exchangeId) {
  if (!exchangeId) return;
  try {
    const { ts } = nowISO();
    await _exchangeRef(exchangeId, getActiveClubId()).update({ status: 'finished', finishedAt: ts });
    await renderExchangeActiveAdminList();
  } catch (e) {
    console.error('[exchange] forceFinishExchangeRecord error:', e);
    gsAlert('처리 실패');
  }
}

function deleteActiveExchangeRecord(exchangeId) {
  if (!exchangeId) return;
  gsConfirm('해당 진행중 교류전을 삭제하시겠습니까?', async ok => {
    if (!ok) return;
    try {
      await _exchangeRef(exchangeId, getActiveClubId()).delete();
      await renderExchangeActiveAdminList();
    } catch (e) {
      console.error('[exchange] deleteActiveExchangeRecord error:', e);
      gsAlert('삭제 실패');
    }
  });
}

async function renderExchangeActiveAdminList() {
  const el = $('ex-active-admin-list');
  if (!el) return;

  const snap = await _exchangeColRef(getActiveClubId()).get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(ex => ex.status === 'active');
  if (!items.length) {
    el.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:18px 0;">진행중(active) 교류전 기록이 없습니다.</p>';
    return;
  }

  const clubAName = currentClub?.clubName || 'A클럽';
  el.innerHTML = items.map(ex => {
    const date = ex.date || '';
    const clubBName = ex.clubBName || 'B클럽';
    const score = ex.victoryMode === 'score'
      ? `${Number(ex.scoreA || 0).toFixed(1)} : ${Number(ex.scoreB || 0).toFixed(1)}`
      : `${Number(ex.winsA || 0)} : ${Number(ex.winsB || 0)}`;
    const safeId = String(ex.id || '').replace(/'/g, "\\'");
    return `
      <div style="padding:10px; border:1px solid #ececec; border-radius:10px; margin-bottom:8px; display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div style="min-width:0;">
          <div style="font-size:12px; color:#8E8E93;">${escapeHtml(date)}</div>
          <div style="font-size:14px; font-weight:700; color:var(--text-dark);">${escapeHtml(clubAName)} vs ${escapeHtml(clubBName)}</div>
          <div style="font-size:13px; color:#444;">현재 스코어 ${escapeHtml(score)}</div>
        </div>
        <div style="display:flex; gap:6px; flex:0 0 auto;">
          <button class="ex-save-btn" style="width:auto; padding:8px 10px; margin:0;" onclick="forceFinishExchangeRecord('${safeId}')">강제 종료</button>
          <button class="ex-finish-btn" style="width:auto; padding:8px 10px; margin:0;" onclick="deleteActiveExchangeRecord('${safeId}')">삭제</button>
        </div>
      </div>`;
  }).join('');
}

async function openExchangeHistoryAdminModal() {
  const modal = $('ex-history-admin-modal');
  if (modal) modal.style.display = 'flex';
  await renderExchangeHistoryAdminList();
}

function closeExchangeHistoryAdminModal() {
  const modal = $('ex-history-admin-modal');
  if (modal) modal.style.display = 'none';
}

function deleteExchangeHistoryRecord(exchangeId) {
  if (!exchangeId) return;
  gsConfirm('해당 교류전 기록을 삭제하시겠습니까?', async ok => {
    if (!ok) return;
    try {
      await _exchangeRef(exchangeId, getActiveClubId()).delete();
      await renderExchangeHistoryAdminList();
    } catch (e) {
      console.error('[exchange] deleteExchangeHistoryRecord error:', e);
      gsAlert('삭제 실패');
    }
  });
}

async function renderExchangeHistoryAdminList() {
  const el = $('ex-history-admin-list');
  if (!el) return;

  const items = await fetchExchangeHistory(getActiveClubId());
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:18px 0;">종료된 교류전 기록이 없습니다.</p>';
    return;
  }

  const clubAName = currentClub?.clubName || 'A클럽';
  el.innerHTML = items.map(ex => {
    const date = ex.date || '';
    const clubBName = ex.clubBName || 'B클럽';
    const score = ex.victoryMode === 'score'
      ? `${Number(ex.scoreA || 0).toFixed(1)} : ${Number(ex.scoreB || 0).toFixed(1)}`
      : `${Number(ex.winsA || 0)} : ${Number(ex.winsB || 0)}`;
    return `
      <div style="padding:10px; border:1px solid #ececec; border-radius:10px; margin-bottom:8px; display:flex; gap:10px; align-items:center; justify-content:space-between;">
        <div style="min-width:0;">
          <div style="font-size:12px; color:#8E8E93;">${escapeHtml(date)}</div>
          <div style="font-size:14px; font-weight:700; color:var(--text-dark);">${escapeHtml(clubAName)} vs ${escapeHtml(clubBName)}</div>
          <div style="font-size:13px; color:#444;">최종스코어 ${escapeHtml(score)}</div>
        </div>
        <button class="ex-finish-btn" style="width:auto; padding:8px 10px; margin:0; flex:0 0 auto;" onclick="deleteExchangeHistoryRecord('${String(ex.id || '').replace(/'/g, "\\'")}')">삭제</button>
      </div>`;
  }).join('');
}

function openExchange() {
  showView('exchange');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  initExchangeView();
}

async function initExchangeView() {
  await fetchActiveExchange(getActiveClubId());
  switchExchangeTab('game');
  renderExchangeView();
}

function switchExchangeTab(tab) {
  exchangeCurrentTab = tab;
  ['game', 'ranking', 'stats', 'history'].forEach(t => {
    const btn = $(`ex-tab-${t}`);
    const view = $(`ex-view-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (view) view.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'ranking') {
    const clubBtn = $('ex-rank-tab-club');
    if (clubBtn && !clubBtn.classList.contains('active') && !$('ex-rank-tab-player')?.classList.contains('active')) {
      clubBtn.classList.add('active');
    }
    renderExchangeRanking();
  }
  if (tab === 'stats') renderExchangeStatsView();
  if (tab === 'history') renderExchangeHistory();
}

function renderExchangeView() {
  if (activeExchange?.status === 'ongoing') {
    if ($('ex-start-area')) $('ex-start-area').style.display = 'none';
    if ($('ex-game-area')) $('ex-game-area').style.display = 'block';
    if ($('ex-scoreboard')) $('ex-scoreboard').style.display = 'block';
    renderExchangeScoreBar();
    if (Array.isArray(players) && players.length) exchangeClubAPlayers = [...players];
    renderExchangePlayerPool('A');
    if (activeExchange.clubAId) loadClubAPlayers(activeExchange.clubAId);
    if (!activeExchange.isClubBTemp && activeExchange.clubBId) {
      loadClubBPlayers(activeExchange.clubBId);
    } else {
      renderExchangePlayerPool('B');
    }
    if ($('ex-club-label-a') && currentClub) $('ex-club-label-a').textContent = (currentClub.clubName || currentClub.name || '홈 클럽') + ' 선수';
    if ($('ex-club-label-b')) $('ex-club-label-b').textContent = activeExchange.clubBName + ' 선수';

    const guideEl = $('ex-result-guide');
    if (guideEl) {
      const guides = { wins: '승리 팀에 1승을 추가합니다. (점수는 기록용)', score: '양 팀의 득점을 합산하여 전체 스코어에 반영합니다.' };
      guideEl.textContent = guides[activeExchange.victoryMode] || guides.wins;
    }
    exCourtCountInputMode = (Number(activeExchange.courtCount) >= 1 && Number(activeExchange.courtCount) <= 5) ? 'preset' : 'custom';
  } else {
    if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
    if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
  }
  syncExCourtCountUI();
  syncExQuickCourtState();
  renderExRecordModeUI();
}

function renderExchangeScoreBar() {
  if (!activeExchange) return;
  const ex = activeExchange;
  const clubAName = currentClub?.clubName || currentClub?.name || '홈 클럽';
  const clubBName = ex.clubBName || '원정 클럽';
  const scoreA = ex.victoryMode === 'score' ? ex.scoreA.toFixed(1) : ex.winsA;
  const scoreB = ex.victoryMode === 'score' ? ex.scoreB.toFixed(1) : ex.winsB;

  if ($('ex-score-a')) $('ex-score-a').textContent = scoreA;
  if ($('ex-score-b')) $('ex-score-b').textContent = scoreB;
  if ($('ex-club-name-a')) $('ex-club-name-a').textContent = clubAName;
  if ($('ex-club-name-b')) $('ex-club-name-b').textContent = clubBName;
  if ($('ex-detail-a')) $('ex-detail-a').textContent = `단식 ${ex.singlesWinsA}승${ex.singlesLossA}패 | 복식 ${ex.doublesWinsA}승${ex.doublesLossA}패`;
  if ($('ex-detail-b')) $('ex-detail-b').textContent = `단식 ${ex.singlesWinsB}승${ex.singlesLossB}패 | 복식 ${ex.doublesWinsB}승${ex.doublesLossB}패`;
  if ($('ex-mode-badge')) $('ex-mode-badge').textContent = EXCHANGE_LANG[ex.victoryMode] + (ex.handicapEnabled ? ' · 핸디캡' : '');

  animateScoreUpdate('ex-score-a');
  animateScoreUpdate('ex-score-b');
}

function animateScoreUpdate(elId) {
  const el = $(elId);
  if (!el) return;
  el.classList.remove('score-flash');
  void el.offsetWidth;
  el.classList.add('score-flash');
}

function _makePlayerChip(side, p, isGuest, idx, opts = {}) {
  const gIcon = p.gender === 'F'
    ? '<span style="font-size:12px;color:#E8437A;vertical-align:middle;">♀</span>'
    : '<span style="font-size:12px;color:#3A7BD5;vertical-align:middle;">♂</span>';
  const chkId = isGuest ? `ex-chk-${side}-g-${p.name}` : `ex-chk-${side}-${p.name}`;
  const label = isGuest ? `[당일] ${gIcon}${p.name}` : `${gIcon}${p.name}<span class="p-rank">${idx + 1}위</span>`;
  const cls = `${isGuest ? 'p-label day-guest-label' : 'p-label'}${opts.disabled ? ' ex-player-disabled' : ''}`;
  const checked = opts.checked ? ' checked' : '';
  const disabled = opts.disabled ? ' disabled' : '';
  const title = opts.title ? ` title="${escapeHtml(opts.title)}"` : '';
  return `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}"${checked}${disabled} onclick="exchangePickPlayer('${side}', '${p.name}')">` +
         `<label for="${chkId}" class="${cls}"${title}>${label}</label>`;
}

function renderExchangePlayerPool(side) {
  const el = $(`ex-pool-${side}`);
  if (!el) return;
  const clubPlayers = side === 'A'
    ? (((players || []).length ? players : exchangeClubAPlayers) || [])
    : exchangeClubBPlayers;
  const guests = side === 'A' ? exchangeGuestsA : exchangeGuestsB;
  const target = exRecordMode === 'quick' ? getExQuickTarget() : null;
  const targetSide = target ? (target.slot === 'home' ? 'A' : 'B') : null;
  const activeCourt = target ? getExQuickCourt(target.courtNo) : null;
  const currentSelected = exRecordMode === 'quick' && activeCourt
    ? (side === 'A' ? (activeCourt.home || []) : (activeCourt.away || []))
    : (side === 'A' ? exPickedHome : exPickedAway);
  const assigned = getExQuickAssignedKeys();

  const renderChip = (p, i, isGuest) => {
    const key = `${side}:${p.name}`;
    const isChecked = currentSelected.includes(p.name);
    const disabled = exRecordMode === 'quick' && (
      side !== targetSide ||
      (assigned.has(key) && !isChecked)
    );
    const title = disabled && !target
      ? '모든 코트가 완성되었습니다. 승리팀을 선택해주세요.'
      : (disabled && side !== targetSide
        ? `현재 입력은 ${targetSide === 'A' ? '홈팀' : '어웨이팀'} 선수 차례입니다.`
        : (disabled ? '다른 코트에 이미 배정된 선수입니다.' : ''));
    return _makePlayerChip(side, p, isGuest, i, { checked: isChecked, disabled, title });
  };

  el.innerHTML =
    clubPlayers.map((p, i) => renderChip(p, i, false)).join('') +
    guests.map(p => renderChip(p, 0, true)).join('');
}

async function loadClubAPlayers(clubAId) {
  if (!clubAId) { exchangeClubAPlayers = []; return; }
  try {
    exchangeClubAPlayers = await _fsGetPlayers(clubAId);
    renderExchangePlayerPool('A');
    const label = $('ex-club-label-a');
    if (label && currentClub) label.textContent = (currentClub.clubName || currentClub.name || '홈 클럽') + ' 선수';
  } catch (e) {
    console.error('[exchange] loadClubAPlayers error:', e);
    exchangeClubAPlayers = [];
  }
}

async function loadClubBPlayers(clubBId) {
  if (!clubBId) { exchangeClubBPlayers = []; return; }
  try {
    exchangeClubBPlayers = await _fsGetPlayers(clubBId);
    renderExchangePlayerPool('B');
    const label = $('ex-club-label-b');
    if (label && activeExchange) label.textContent = activeExchange.clubBName + ' 선수';
  } catch (e) {
    console.error('[exchange] loadClubBPlayers error:', e);
    exchangeClubBPlayers = [];
  }
}

function renderExchangeRanking() {
  const el = $('ex-ranking-content');
  if (!el) return;
  const clubBtn = document.getElementById('ex-rank-tab-club');
  const currentTab = clubBtn?.classList.contains('active') ? 'club' : 'player';
  currentTab === 'club' ? renderExClubRanking(el) : renderExPlayerRanking(el);
}

function switchExRankingTab(tab) {
  ['club', 'player'].forEach(t => {
    const btn = $(`ex-rank-tab-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  const el = $('ex-ranking-content');
  if (!el) return;
  tab === 'club' ? renderExClubRanking(el) : renderExPlayerRanking(el);
}

function renderExClubRanking(el) {
  const vsMap = {};
  matchLog.filter(m => m.exchangeId).forEach(m => {
    const clubBName = m.clubBName || m.clubBId || '상대 클럽';
    if (!vsMap[clubBName]) vsMap[clubBName] = { win: 0, loss: 0 };
    if (m.resultType === 'cancelled') return;
    const inHome = m.clubSideHome === 'A';
    const homeWin = m.winner === 'home';
    const weWon = (inHome && homeWin) || (!inHome && !homeWin);
    weWon ? vsMap[clubBName].win++ : vsMap[clubBName].loss++;
  });

  const rows = Object.entries(vsMap);
  if (!rows.length) { el.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:30px 0;">교류전 경기 기록이 없습니다.</p>'; return; }

  el.innerHTML = `<table class="tennis-table" style="width:100%;">
    <thead><tr><th>상대 클럽</th><th>승</th><th>패</th><th>승률</th></tr></thead>
    <tbody>${rows.sort((a, b) => b[1].win - a[1].win).map(([name, s]) => {
      const total = s.win + s.loss;
      return `<tr><td style="text-align:left;padding-left:10px;">${escapeHtml(name)}</td><td>${s.win}</td><td>${s.loss}</td><td><b>${total > 0 ? Math.round(s.win / total * 100) : 0}%</b></td></tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderExPlayerRanking(el) {
  const exPlayers = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  if (!exPlayers.length) { el.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:30px 0;">등록된 선수가 없습니다.</p>'; return; }

  const stats = exPlayers.map(p => {
    const s = getExchangeStatsForPlayer(p.name);
    const total = s.singleWin + s.singleLoss + s.doubleWin + s.doubleLoss;
    const wins = s.singleWin + s.doubleWin;
    return { name: p.name, wins, losses: total - wins, rate: total > 0 ? Math.round(wins / total * 100) : 0, total };
  }).filter(s => s.total > 0).sort((a, b) => b.wins - a.wins || b.rate - a.rate);

  if (!stats.length) { el.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:30px 0;">교류전 경기 기록이 없습니다.</p>'; return; }

  el.innerHTML = `<table class="tennis-table" style="width:100%;">
    <thead><tr><th>순위</th><th style="text-align:left;padding-left:10px;">선수</th><th>승</th><th>패</th><th>승률</th></tr></thead>
    <tbody>${stats.map((s, i) => `<tr><td>${i + 1}</td><td style="text-align:left;padding-left:10px;">${escapeHtml(s.name)}</td><td>${s.wins}</td><td>${s.losses}</td><td><b>${s.rate}%</b></td></tr>`).join('')}</tbody>
  </table>`;
}

function renderExchangeStatsView() {
  const listEl = $('ex-stats-player-list');
  if (!listEl) return;
  const exPlayers = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  if (!exPlayers.length) { listEl.innerHTML = '<p style="color:#8E8E93;text-align:center;padding:20px;">등록된 선수가 없습니다.</p>'; return; }
  listEl.innerHTML = exPlayers.map((p, i) => {
    const gIcon = p.gender === 'F' ? '<span style="font-size:12px;color:#E8437A;vertical-align:middle;">♀</span>' : '<span style="font-size:12px;color:#3A7BD5;vertical-align:middle;">♂</span>';
    return `<input type="checkbox" id="ex-stats-p-${i}" class="p-chk" value="${escapeHtml(p.name)}" onclick="viewExchangeStats('${escapeHtml(p.name).replace(/'/g, "&#39;")}')">
      <label for="ex-stats-p-${i}" class="p-label">${gIcon}${escapeHtml(p.name)}</label>`;
  }).join('');
}

function viewExchangeStats(name) {
  document.querySelectorAll('#ex-stats-player-list .p-chk').forEach(chk => { chk.checked = chk.value === name; });
  const reportEl = $('ex-stats-report');
  if (!reportEl) return;

  const s = getExchangeStatsForPlayer(name);
  const totalWin = s.singleWin + s.doubleWin;
  const totalLoss = s.singleLoss + s.doubleLoss;
  const total = totalWin + totalLoss;
  const rate = total > 0 ? Math.round(totalWin / total * 100) : 0;

  const vsRows = Object.entries(s.vsClubs).map(([club, v]) => {
    const vTotal = v.win + v.loss;
    return `<tr><td style="text-align:left;padding-left:8px;">${escapeHtml(club)}</td><td>${v.win}승 ${v.loss}패</td><td><b>${vTotal > 0 ? Math.round(v.win / vTotal * 100) : 0}%</b></td></tr>`;
  }).join('');

  reportEl.style.display = 'block';
  reportEl.innerHTML = `
    <div style="background:#f8f8f8;border-radius:12px;padding:14px;margin-top:10px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:12px;">📊 ${escapeHtml(name)} — 교류전 통계</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
        <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#8E8E93;margin-bottom:4px;">전체</div>
          <div style="font-size:18px;font-weight:700;">${totalWin}승 ${totalLoss}패</div>
          <div style="font-size:13px;color:var(--aussie-blue);">${rate}%</div>
        </div>
        <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#8E8E93;margin-bottom:4px;">단식</div>
          <div style="font-size:18px;font-weight:700;">${s.singleWin}승 ${s.singleLoss}패</div>
        </div>
        <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#8E8E93;margin-bottom:4px;">복식</div>
          <div style="font-size:18px;font-weight:700;">${s.doubleWin}승 ${s.doubleLoss}패</div>
        </div>
        <div style="background:white;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:11px;color:#8E8E93;margin-bottom:4px;">출전 경기</div>
          <div style="font-size:18px;font-weight:700;">${total}경기</div>
        </div>
      </div>
      ${vsRows ? `<div style="font-size:13px;font-weight:700;margin-bottom:8px;">상대 클럽별 전적</div>
      <table class="tennis-table" style="width:100%;"><thead><tr><th style="text-align:left;padding-left:8px;">클럽</th><th>전적</th><th>승률</th></tr></thead><tbody>${vsRows}</tbody></table>`
      : '<p style="color:#8E8E93;font-size:13px;">상대 클럽 전적 없음</p>'}
    </div>`;
}

async function renderExchangeHistory() {
  const history = await fetchExchangeHistory(getActiveClubId());
  const el = $('ex-history-list');
  if (!el) return;
  if (!history.length) { el.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">교류전 기록이 없습니다.</p>'; return; }
  el.innerHTML = history.map(ex => `
    <div class="ex-history-item">
      <div class="ex-history-date">${ex.date}</div>
      <div class="ex-history-teams"><strong>${currentClub?.clubName || '홈'}</strong> vs ${ex.clubBName}</div>
      <div class="ex-history-score">${ex.victoryMode === 'score' ? `${ex.scoreA.toFixed(1)} : ${ex.scoreB.toFixed(1)}점` : `${ex.winsA}승 : ${ex.winsB}승`}</div>
      <div class="ex-history-mode">${EXCHANGE_LANG[ex.victoryMode]}</div>
    </div>`).join('');
}

function openExchangeSetupModal() {
  const modal = $('ex-setup-modal');
  if (modal) modal.style.display = 'flex';
  renderClubSearchInModal();
}

function closeExchangeSetupModal() {
  const modal = $('ex-setup-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmExchangeSetup() {
  const clubBName = ($('ex-setup-club-b-name') || {}).value || '';
  if (!clubBName.trim()) { gsAlert('상대 클럽을 선택하거나 입력해주세요.'); return; }

  const courtCount = Math.max(1, parseInt(($('ex-setup-court-count') || {}).value || '1', 10) || 1);
  const victoryMode = document.querySelector('input[name="ex-victory-mode"]:checked')?.value || 'wins';
  const handicapEnabled = ($('ex-handicap-toggle') || {}).checked || false;
  const homeSideVal = document.querySelector('input[name="ex-home-side"]:checked')?.value || 'home';
  // clubSideHome: 우리 클럽이 홈이면 'A', 원정이면 'B'
  const clubSideHome = homeSideVal === 'home' ? 'A' : 'B';

  closeExchangeSetupModal();
  await createExchange({
    clubBName: clubBName.trim(),
    clubBId: exSetupSelectedClubId || null,
    isClubBTemp: !exSetupSelectedClubId,
    courtCount,
    victoryMode, handicapEnabled,
    clubSideHome,
  });
}

function renderClubSearchInModal() { exSetupSelectedClubId = null; }

function searchClubInModal(keyword) {
  const q = (keyword || '').trim().toLowerCase();
  const filtered = (clubList || []).filter(c => !q || (c.clubName || '').toLowerCase().includes(q));
  renderClubSearchResults(filtered, 'ex-club-search-results');
}

function filterClubByRegion(elBtn, region) {
  document.querySelectorAll('.ex-region-chip').forEach(b => b.classList.remove('active'));
  if (elBtn) elBtn.classList.add('active');
  renderClubSearchResults((clubList || []).filter(c => (c.region1 || '').includes(region)), 'ex-club-region-results');
}

function renderClubSearchResults(list, containerId) {
  const el = $(containerId || 'ex-club-search-results');
  if (!el) return;
  if (!list.length) { el.innerHTML = '<p style="color:#888; padding:12px; text-align:center;">검색 결과가 없습니다.</p>'; return; }
  el.innerHTML = list.map(c =>
    `<div class="ex-club-result-item" onclick="selectExchangeClubB('${c.clubId}', '${c.clubName}')">
      <strong>${c.clubName}</strong>
      <span class="ex-club-result-region">${c.region1 || ''} ${c.region2 || ''}</span>
    </div>`
  ).join('');
}

function selectExchangeClubB(clubId, clubName) {
  exSetupSelectedClubId = clubId;
  if ($('ex-setup-club-b-name')) $('ex-setup-club-b-name').value = clubName;
  document.querySelectorAll('.ex-club-result-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('strong')?.textContent === clubName);
  });
}

function openExchangeGuestModal(side) {
  const modal = $('ex-guest-modal');
  if (!modal) return;
  modal.dataset.side = side;
  modal.dataset.gender = 'M';
  modal.style.display = 'flex';
  if ($('ex-guest-name')) $('ex-guest-name').value = '';
  document.querySelectorAll('.ex-gender-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.ex-gender-btn.male')?.classList.add('active');
}

function closeExchangeGuestModal() {
  const modal = $('ex-guest-modal');
  if (modal) modal.style.display = 'none';
}

function confirmExchangeGuest() {
  const modal = $('ex-guest-modal');
  if (!modal) return;
  const name = $('ex-guest-name')?.value?.trim();
  const gender = modal.dataset.gender || 'M';
  if (!name) { gsAlert('이름을 입력해주세요.'); return; }
  addExchangeGuest(modal.dataset.side, name, gender);
  closeExchangeGuestModal();
}

function exchangePickPlayer(side, name) {
  if (exRecordMode === 'quick') {
    exchangeQuickPickPlayer(side, name);
    return;
  }

  const max = getExRequiredPlayersPerSide(getExScoreMatchType());
  const target = side === 'A' ? exPickedHome : exPickedAway;

  if (target.includes(name)) {
    target.splice(target.indexOf(name), 1);
  } else {
    if (target.length >= max) {
      const removed = target.shift();
      const oldChk = document.getElementById(`ex-chk-${side}-${removed}`) ||
                     document.getElementById(`ex-chk-${side}-g-${removed}`);
      if (oldChk) oldChk.checked = false;
    }
    target.push(name);
    showExchangeHint(side, getExchangePlayerHint(name));
  }

  const allPicked = side === 'A' ? exPickedHome : exPickedAway;
  $(`ex-pool-${side}`)?.querySelectorAll('.p-chk').forEach(chk => { chk.checked = allPicked.includes(chk.value); });
  renderExchangePickedPlayers();
}

function showExchangeHint(side, msg) {
  const el = $(`ex-hint-${side}`);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function renderExchangePickedPlayers() {
  const homeText = exRecordMode === 'quick'
    ? (() => {
        const target = getExQuickTarget();
        const court = target ? getExQuickCourt(target.courtNo) : null;
        return (court?.home || []).join(' + ') || '선택 없음';
      })()
    : (exPickedHome.join(' + ') || '선택 없음');
  const awayText = exRecordMode === 'quick'
    ? (() => {
        const target = getExQuickTarget();
        const court = target ? getExQuickCourt(target.courtNo) : null;
        return (court?.away || []).join(' + ') || '선택 없음';
      })()
    : (exPickedAway.join(' + ') || '선택 없음');
  if ($('ex-picked-home')) $('ex-picked-home').textContent = homeText;
  if ($('ex-picked-away')) $('ex-picked-away').textContent = awayText;
  renderExQuickMatchupCards();
  renderExRecordModeUI();
}

function renderExQuickMatchupCards() {
  const wrap = $('ex-quick-courts');
  if (!wrap) return;

  syncExQuickTarget();
  const target = getExQuickTarget();
  let html = '';

  exQuickCourts.forEach(court => {
    const matchType = getExCourtMatchType(court);
    const required = getExRequiredPlayersPerSide(matchType);
    const home = court.home || [];
    const away = court.away || [];
    const homeReady = home.length === required;
    const awayReady = away.length === required;
    const isFull = homeReady && awayReady;
    const typeLabel = matchType === 'singles' ? '● 단식 경기중' : '● 복식 경기중';
    const typeClass = matchType === 'singles' ? ' singles' : ' doubles';
    const homeGuide = required === 1 ? '홈팀 선수 선택' : `홈팀 선수 선택 (${required}명)`;
    const awayGuide = required === 1 ? '어웨이팀 선수 선택' : `어웨이팀 선수 선택 (${required}명)`;
    const isTargetCourt = target && target.courtNo === court.courtNo;
    const waitingText = !target
      ? '승리팀 선택 대기'
      : (isTargetCourt
          ? (target.slot === 'home' ? homeGuide : awayGuide)
          : '다른 코트 입력 중');
    const actionHtml = isFull
      ? `<div class="ex-court-win-row">
           <button class="ex-court-win-btn home" onclick="saveExchangeQuickCourtResult(${court.courtNo}, 'home')">홈 승</button>
           <button class="ex-court-win-btn away" onclick="saveExchangeQuickCourtResult(${court.courtNo}, 'away')">어웨이 승</button>
         </div>`
      : `<div class="ex-court-waiting">${waitingText}</div>`;
    html += `
      <div class="ex-court-match-card">
        <div class="ex-court-match-header">
          <div class="ex-court-match-header-left">
            <div class="ex-court-match-title">코트${court.courtNo}</div>
            <span class="ex-court-match-status${typeClass}">${typeLabel}</span>
          </div>
          <div class="ex-court-match-header-actions">
            <button class="ex-court-type-btn singles${matchType === 'singles' ? ' active' : ''}" onclick="setExQuickCourtMatchType(${court.courtNo}, 'singles')">단식</button>
            <button class="ex-court-type-btn doubles${matchType === 'doubles' ? ' active' : ''}" onclick="setExQuickCourtMatchType(${court.courtNo}, 'doubles')">복식</button>
            <button class="ex-court-type-btn cancel" onclick="confirmCancelExQuickCourt(${court.courtNo})">경기취소</button>
          </div>
        </div>
        <div class="ex-court-match-body">
          <div class="ex-court-slot${isTargetCourt && target?.slot === 'home' ? ' active' : ''}">
            <div class="ex-court-slot-label">HOME</div>
            <div class="ex-court-slot-players">
              ${home.length
                ? home.map(name => `<button class="ex-slot-player-chip" onclick="removeExQuickPlayer(${court.courtNo}, 'home', '${String(name).replace(/'/g, "\\'")}')">${escapeHtml(name)} <span>✕</span></button>`).join('')
                : `<span class="ex-court-slot-empty">${homeGuide}</span>`}
            </div>
          </div>
          <div class="ex-court-match-vs">VS</div>
          <div class="ex-court-slot${isTargetCourt && target?.slot === 'away' ? ' active' : ''}">
            <div class="ex-court-slot-label away">AWAY</div>
            <div class="ex-court-slot-players">
              ${away.length
                ? away.map(name => `<button class="ex-slot-player-chip away" onclick="removeExQuickPlayer(${court.courtNo}, 'away', '${String(name).replace(/'/g, "\\'")}')">${escapeHtml(name)} <span>✕</span></button>`).join('')
                : `<span class="ex-court-slot-empty">${awayGuide}</span>`}
            </div>
          </div>
        </div>
        ${actionHtml}
      </div>`;
  });

  wrap.innerHTML = html;
}

function setExRecordMode(mode) {
  exRecordMode = mode === 'score' ? 'score' : 'quick';
  if (exRecordMode === 'score') exQuickWinner = '';
  renderExchangePlayerPool('A');
  renderExchangePlayerPool('B');
  renderExchangePickedPlayers();
  renderExRecordModeUI();
}

function setExQuickWinner(side) {
  exQuickWinner = side === 'away' ? 'away' : 'home';
  renderExRecordModeUI();
}

function renderExRecordModeUI() {
  $('ex-record-mode-quick')?.classList.toggle('active', exRecordMode === 'quick');
  $('ex-record-mode-score')?.classList.toggle('active', exRecordMode === 'score');
  if ($('ex-picked-display-wrap')) $('ex-picked-display-wrap').style.display = exRecordMode === 'score' ? 'flex' : 'none';
  if ($('ex-quick-matchup-card')) $('ex-quick-matchup-card').style.display = exRecordMode === 'quick' ? 'block' : 'none';
  if ($('ex-score-area')) $('ex-score-area').style.display = exRecordMode === 'score' ? 'block' : 'none';
  if ($('ex-save-result-btn')) $('ex-save-result-btn').style.display = exRecordMode === 'score' ? 'flex' : 'none';
}

async function persistExchangeMatch(logEntry, matchCategory, resultType) {
  if (resultType !== 'cancelled') {
    applyMatchToPlayers(logEntry.type, [...logEntry.home], [...logEntry.away], logEntry.winner);
  }

  if (isSimulation) {
    const pts = calcExchangePoints(logEntry, activeExchange);
    updateExchangeAggregateLocal(pts, logEntry.winner, matchCategory);
    renderExchangeScoreBar();
    return true;
  }

  const ok = await saveExchangeGame(logEntry, matchCategory, resultType, activeExchange.clubSideHome || 'A');
  if (!ok) return false;
  await pushDataOnly();
  return true;
}

async function saveExchangeQuickCourtResult(courtNo, winnerKey) {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveExchangeQuickCourtResult(courtNo, winnerKey)); return; }
  const court = getExQuickCourt(courtNo);
  if (!court) return;

  const matchType = getExCourtMatchType(court);
  const required = getExRequiredPlayersPerSide(matchType);
  if ((court.home || []).length !== required || (court.away || []).length !== required) {
    gsAlert('해당 코트의 선수를 먼저 모두 배정해주세요.');
    return;
  }

  const resultType = 'normal';
  const winner = winnerKey === 'away' ? 'away' : 'home';
  const homeScore = resultType === 'cancelled' ? 0 : (winner === 'home' ? 1 : 0);
  const awayScore = resultType === 'cancelled' ? 0 : (winner === 'away' ? 1 : 0);
  const { ts, ds } = nowISO();
  const logEntry = {
    id: `${ts}-${courtNo}-${Math.floor(Math.random() * 100000)}`,
    ts, date: ds,
    type: matchType === 'doubles' ? 'double' : 'single',
    home: [...court.home],
    away: [...court.away],
    hs: homeScore,
    as: awayScore,
    winner,
  };

  const ok = await persistExchangeMatch(logEntry, matchType, resultType);
  if (!ok) return;

  resetExQuickCourt(courtNo);
}

async function saveExchangeResult() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveExchangeResult()); return; }
  const scoreMatchType = getExScoreMatchType();

  if (exRecordMode === 'quick' && !exQuickWinner) { gsAlert('승리팀을 선택해주세요!'); return; }

  const hs = exRecordMode === 'quick'
    ? (exQuickWinner === 'home' ? '1' : (exQuickWinner === 'away' ? '0' : ''))
    : (($('ex-score-home') || {}).value);
  const as = exRecordMode === 'quick'
    ? (exQuickWinner === 'home' ? '0' : (exQuickWinner === 'away' ? '1' : ''))
    : (($('ex-score-away') || {}).value);
  if (!hs || !as || hs == as) { gsAlert('점수를 확인해주세요!'); return; }

  const max = getExRequiredPlayersPerSide(scoreMatchType);
  if (exPickedHome.length !== max || exPickedAway.length !== max) { gsAlert('선수를 모두 선택해주세요!'); return; }

  const homeScore = parseInt(hs, 10);
  const awayScore = parseInt(as, 10);
  const { ts, ds } = nowISO();
  const resultType = 'normal';

  const logEntry = {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts, date: ds,
    type: scoreMatchType === 'doubles' ? 'double' : 'single',
    home: [...exPickedHome], away: [...exPickedAway],
    hs: homeScore, as: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
  };
  const ok = await persistExchangeMatch(logEntry, scoreMatchType, resultType);
  if (!ok) return;

  exPickedHome = []; exPickedAway = [];
  exQuickWinner = '';
  if ($('ex-score-home')) $('ex-score-home').value = '';
  if ($('ex-score-away')) $('ex-score-away').value = '';
  renderExchangePickedPlayers();
  showExchangeHint('A', '');
  showExchangeHint('B', '');
}

function startExchangeSimulation() {
  gsConfirm('시뮬레이션 모드로 시작할까요?\nFirestore에 저장되지 않습니다.', ok => {
    if (!ok) return;
    isSimulation = true;
    activeExchange = {
      id: 'sim-' + Date.now(), clubAId: getActiveClubId(),
      clubBId: 'sim-club-b', clubBName: '상대클럽 (시뮬)', isClubBTemp: true,
      victoryMode: 'wins', handicapEnabled: false, status: 'ongoing',
      scoreA: 0, scoreB: 0, winsA: 0, winsB: 0,
      singlesWinsA: 0, singlesWinsB: 0, doublesWinsA: 0, doublesWinsB: 0,
      singlesLossA: 0, singlesLossB: 0, doublesLossA: 0, doublesLossB: 0,
      gameIds: [],
    };
    exchangeGuestsB = [{ name: '상대1', gender: 'M' }, { name: '상대2', gender: 'M' }, { name: '상대3', gender: 'F' }];
    renderExchangeView();
    const badge = document.getElementById('ex-mode-badge');
    if (badge) badge.textContent = '🔧 시뮬레이션 모드';
  });
}
