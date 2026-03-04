// ========================================
// EXCHANGE_VIEW.JS - 교류전 UI/렌더링
// ========================================

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
    renderExchangePlayerPool('A');
    if (!activeExchange.isClubBTemp && activeExchange.clubBId) {
      loadClubBPlayers(activeExchange.clubBId);
    } else {
      renderExchangePlayerPool('B');
    }
    if ($('ex-club-label-a') && currentClub) $('ex-club-label-a').textContent = currentClub.clubName + ' 선수';
    if ($('ex-club-label-b')) $('ex-club-label-b').textContent = activeExchange.clubBName + ' 선수';

    const guideEl = $('ex-result-guide');
    if (guideEl) {
      const guides = { wins: '승리 팀에 1승을 추가합니다. (점수는 기록용)', score: '양 팀의 득점을 합산하여 전체 스코어에 반영합니다.' };
      guideEl.textContent = guides[activeExchange.victoryMode] || guides.wins;
    }
  } else {
    if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
    if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
  }
}

function renderExchangeScoreBar() {
  if (!activeExchange) return;
  const ex = activeExchange;
  const clubAName = currentClub?.clubName || '홈 클럽';
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

function _makePlayerChip(side, p, isGuest, idx) {
  const gIcon = p.gender === 'F'
    ? '<span style="font-size:12px;color:#E8437A;vertical-align:middle;">♀</span>'
    : '<span style="font-size:12px;color:#3A7BD5;vertical-align:middle;">♂</span>';
  const chkId = isGuest ? `ex-chk-${side}-g-${p.name}` : `ex-chk-${side}-${p.name}`;
  const label = isGuest ? `[당일] ${gIcon}${p.name}` : `${gIcon}${p.name}<span class="p-rank">${idx + 1}위</span>`;
  const cls = isGuest ? 'p-label day-guest-label' : 'p-label';
  return `<input type="checkbox" id="${chkId}" class="p-chk" value="${p.name}" onclick="exchangePickPlayer('${side}', '${p.name}')">` +
         `<label for="${chkId}" class="${cls}">${label}</label>`;
}

function renderExchangePlayerPool(side) {
  const el = $(`ex-pool-${side}`);
  if (!el) return;
  const clubPlayers = side === 'A' ? (players || []) : exchangeClubBPlayers;
  const guests = side === 'A' ? exchangeGuestsA : exchangeGuestsB;
  el.innerHTML =
    clubPlayers.map((p, i) => _makePlayerChip(side, p, false, i)).join('') +
    guests.map(p => _makePlayerChip(side, p, true, 0)).join('');
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

  const victoryMode = document.querySelector('input[name="ex-victory-mode"]:checked')?.value || 'wins';
  const handicapEnabled = ($('ex-handicap-toggle') || {}).checked || false;

  closeExchangeSetupModal();
  await createExchange({
    clubBName: clubBName.trim(),
    clubBId: exSetupSelectedClubId || null,
    isClubBTemp: !exSetupSelectedClubId,
    victoryMode, handicapEnabled,
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
  const max = exMatchCategory === 'doubles' ? 2 : 1;
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
  if ($('ex-picked-home')) $('ex-picked-home').textContent = exPickedHome.join(' + ') || '선택 없음';
  if ($('ex-picked-away')) $('ex-picked-away').textContent = exPickedAway.join(' + ') || '선택 없음';
}

function setExMatchCategory(category) {
  exMatchCategory = category;
  exPickedHome = [];
  exPickedAway = [];
  renderExchangePickedPlayers();
  ['singles', 'doubles'].forEach(c => { const btn = $(`ex-cat-${c}`); if (btn) btn.classList.toggle('active', c === category); });
}

async function saveExchangeResult() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveExchangeResult()); return; }

  const hs = ($('ex-score-home') || {}).value;
  const as = ($('ex-score-away') || {}).value;
  if (!hs || !as || hs == as) { gsAlert('점수를 확인해주세요!'); return; }

  const max = exMatchCategory === 'doubles' ? 2 : 1;
  if (exPickedHome.length !== max || exPickedAway.length !== max) { gsAlert('선수를 모두 선택해주세요!'); return; }

  const homeScore = parseInt(hs, 10);
  const awayScore = parseInt(as, 10);
  const { ts, ds } = nowISO();
  const resultType = document.querySelector('input[name="ex-result-type"]:checked')?.value || 'normal';

  const logEntry = {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts, date: ds,
    type: exMatchCategory === 'doubles' ? 'double' : 'single',
    home: [...exPickedHome], away: [...exPickedAway],
    hs: homeScore, as: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
  };

  applyMatchToPlayers(logEntry.type, [...exPickedHome], [...exPickedAway], logEntry.winner);

  if (isSimulation) {
    const pts = calcExchangePoints(logEntry, activeExchange);
    updateExchangeAggregateLocal(pts);
    renderExchangeScoreBar();
    gsAlert('✅ 시뮬레이션 저장! (실제 데이터 반영 안됨)');
  } else {
    const ok = await saveExchangeGame(logEntry, exMatchCategory, resultType, 'A');
    if (!ok) return;
    await pushDataOnly();
    gsAlert('저장!');
  }

  exPickedHome = []; exPickedAway = [];
  $('ex-score-home').value = '';
  $('ex-score-away').value = '';
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
