// ========================================
// ROUND_VIEW.JS - 라운드 UI/DOM 처리
// ========================================

function roundViewOpenRound() {
  showView('round');
  try {
    snapshotLastRanks();
    const rankMap = computeRanksByScoreOnly('score', 'wins', 'losses');
    players.forEach(p => { p.rank = rankMap[p.name] || p.rank || '-'; });
  } catch (e) {
    console.warn('[round] rank compute failed:', e);
  }
  roundViewInitRoundPlayerPool();
}

function roundViewSetRoundOpt(opt) {
  roundOpt = opt;
  ['rank', 'random', 'manual'].forEach(o => {
    const btn = $(`round-opt-${o}`);
    if (btn) btn.classList.toggle('active', o === opt);
  });
  if (opt === 'manual' && roundMode === 'double') roundViewUpdateRoundManualTeamPreview();
  else $('round-manual-team-box').style.display = 'none';
  roundViewCheckRoundGenButton();
}

function roundViewSetRoundMode(mode) {
  roundMode = mode;
  ['single', 'double'].forEach(m => {
    const btn = $(`round-mode-${m}`);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  const optBtns = ['round-opt-rank', 'round-opt-random', 'round-opt-manual'];
  const isSingle = mode === 'single';
  optBtns.forEach(id => {
    const btn = $(id);
    if (!btn) return;
    btn.disabled = isSingle;
    btn.style.opacity = isSingle ? '0.4' : '';
    btn.style.cursor = isSingle ? 'not-allowed' : 'pointer';
  });

  if (roundOpt === 'manual' && mode === 'double') roundViewUpdateRoundManualTeamPreview();
  else $('round-manual-team-box').style.display = 'none';
  roundViewCheckRoundGenButton();
}

function roundViewInitRoundPlayerPool() {
  const pList = $('round-pList');
  if (!pList) return;

  const setupArea = $('round-setup-area');
  const matchArea = $('round-match-area');
  if (setupArea) setupArea.style.display = 'block';
  if (matchArea) matchArea.style.display = 'none';

  miniTournamentMatches = [];
  miniTournamentRound = 0;

  let rankMap = {};
  try {
    rankMap = computeRanksByScoreOnly('score', 'wins', 'losses');
  } catch (e) {
    console.warn('[round] computeRanksByScoreOnly failed:', e);
  }

  const members = players.filter(p => !p.isGuest)
    .sort((a, b) => (b?.score || 0) - (a?.score || 0));
  members.forEach((p, idx) => { p.rank = rankMap[p.name] || p.rank || (idx + 1); });

  const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  let html = '<div class="player-pool">';

  members.forEach((p, idx) => {
    const gIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
    html += createPlayerOption({
      inputType: 'checkbox', nameAttr: 'round-player', id: `round-p-${p.name}`,
      value: p.name, checked: false, onClick: 'updateRoundCount(); checkRoundGenButton();',
      labelText: gIcon + displayName(p.name), isGuest: false, showRank: true, rankText: `${p.rank || (idx + 1)}위`
    });
  });

  if (guests.length > 0) {
    html += '</div>';
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
    html += '</div>';
    html += '<div class="player-pool">';
    guests.forEach(p => {
      html += createPlayerOption({
        inputType: 'checkbox', nameAttr: 'round-player', id: `round-p-${p.name}`,
        value: p.name, checked: false, onClick: 'updateRoundCount(); checkRoundGenButton();',
        labelText: displayName(p.name), isGuest: true, showRank: true, rankText: 'G'
      });
    });
  }

  if (oneTimePlayers.length > 0) {
    html += '</div>';
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:var(--aussie-blue); font-weight:bold;">당일 게스트</span>';
    html += '</div>';
    html += '<div class="player-pool">';
    oneTimePlayers.forEach((name, i) => {
      html += createPlayerOption({
        inputType: 'checkbox', nameAttr: 'round-player', id: `round-ot-${i}`,
        value: name, checked: false, onClick: 'updateRoundCount(); checkRoundGenButton();',
        labelText: '[당일] ' + displayName(name), isGuest: true, showRank: false, rankText: ''
      });
    });
  }

  html += '</div>';
  pList.innerHTML = html;
  roundViewUpdateRoundCount();
}

function roundViewUpdateRoundCount() {
  const checked = document.querySelectorAll('input[name="round-player"]:checked');
  $('round-cnt').innerText = checked.length;
  if (roundOpt === 'manual' && roundMode === 'double') roundViewUpdateRoundManualTeamPreview();
}

function roundViewUpdateRoundManualTeamPreview() {
  const box = $('round-manual-team-box');
  const list = $('round-manual-team-list');
  const checked = Array.from(document.querySelectorAll('input[name="round-player"]:checked')).map(c => c.value);

  if (checked.length < 4 || checked.length % 2 !== 0) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  let html = '';
  for (let i = 0; i < checked.length; i += 2) {
    html += `<div class="team-chip"><span class="chip-no">${(i / 2) + 1}</span>${displayName(checked[i])} & ${displayName(checked[i + 1])}</div>`;
  }
  list.innerHTML = html;
}

function roundViewCheckRoundGenButton() {
  const checked = document.querySelectorAll('input[name="round-player"]:checked');
  const btn = $('round-gen-btn');
  const minCount = roundMode === 'single' ? 3 : 4;

  if (roundMode === 'double' && checked.length % 2 !== 0) {
    btn.style.opacity = '0.6';
    btn.style.background = 'var(--roland-clay)';
    return;
  }

  btn.style.opacity = checked.length >= minCount ? '1' : '0.6';
  btn.style.background = checked.length >= minCount ? 'var(--aussie-blue)' : 'var(--roland-clay)';
}

function roundViewGenerateRoundSchedule() {
  const checked = Array.from(document.querySelectorAll('input[name="round-player"]:checked')).map(c => c.value);
  roundMatches = [];

  if (roundMode === 'single' && checked.length < 3) { gsAlert('단식은 최소 3명 이상 필요합니다.'); return; }
  if (roundMode === 'double') {
    if (checked.length < 4) { gsAlert('복식은 최소 4명(2팀) 이상 필요합니다.'); return; }
    if (checked.length % 2 !== 0) { gsAlert('복식은 짝수 인원이 필요합니다.'); return; }
  }

  if (roundMode === 'single') {
    roundParticipants = [...checked];
  } else {
    let teams = [];
    if (roundOpt === 'rank') {
      const sorted = checked.sort((a, b) => {
        const pA = players.find(p => p.name === a);
        const pB = players.find(p => p.name === b);
        return (pA.rank || 999) - (pB.rank || 999);
      });
      for (let i = 0; i < sorted.length; i += 2) teams.push([sorted[i], sorted[i + 1]]);
    } else if (roundOpt === 'random') {
      const shuffled = shuffleArray([...checked]);
      for (let i = 0; i < shuffled.length; i += 2) teams.push([shuffled[i], shuffled[i + 1]]);
    } else {
      for (let i = 0; i < checked.length; i += 2) teams.push([checked[i], checked[i + 1]]);
    }
    roundParticipants = teams;
  }

  roundMatches = roundEngineGenerateRoundRobinMatches(roundParticipants);
  $('round-setup-area').style.display = 'none';
  $('round-match-area').style.display = 'block';
  roundViewRenderRoundMatches();
  roundViewUpdateRoundRanking();
}

function roundViewRenderRoundMatches() {
  const list = $('round-match-list');
  let html = '';

  roundMatches.forEach(m => {
    const isFinished = m.winner !== null;
    const homeDisplay = roundMode === 'single' ? displayName(m.home) : `${displayName(m.home[0])} & ${displayName(m.home[1])}`;
    const awayDisplay = roundMode === 'single' ? displayName(m.away) : `${displayName(m.away[0])} & ${displayName(m.away[1])}`;

    html += `
      <div class="team-box" style="margin-bottom:10px; padding:12px; ${isFinished ? 'opacity:0.5;' : ''}">
        <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button onclick="setRoundWinner('${m.id}', 'home')"
            class="opt-btn"
            style="flex:1; padding:10px; ${m.winner === 'home' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
            ${homeDisplay}
          </button>
          <div style="font-size:14px; color:var(--text-gray);">vs</div>
          <button onclick="setRoundWinner('${m.id}', 'away')"
            class="opt-btn"
            style="flex:1; padding:10px; ${m.winner === 'away' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
            ${awayDisplay}
          </button>
        </div>
      </div>`;
  });

  list.innerHTML = html || '<div style="text-align:center; color:#ccc; padding:20px;">매치가 없습니다.</div>';
}

function roundViewSetRoundWinner(matchId, side) {
  const match = roundMatches.find(m => m.id === matchId);
  if (!match) return;
  match.winner = side;
  roundViewRenderRoundMatches();
  roundViewUpdateRoundRanking();
  roundViewCheckRoundSaveButton();
}

function roundViewUpdateRoundRanking() {
  const standings = roundEngineCalcRankingStandings();
  const sorted = roundEngineSortRankingStandings(standings);

  const table = $('round-rank-table');
  table.innerHTML = `
    <table class="tennis-table">
      <thead><tr>
        <th>순위</th>
        <th>${roundMode === 'single' ? '선수' : '팀'}</th>
        <th>승패</th><th>승률</th><th>총점</th>
      </tr></thead>
      <tbody>${sorted.map((s, idx) => {
        const nameDisplay = roundMode === 'single' ? displayName(s.name) : `${displayName(s.name[0])} & ${displayName(s.name[1])}`;
        return `<tr>
          <td>${idx + 1}</td>
          <td>${nameDisplay}</td>
          <td>${s.wins}-${s.losses}</td>
          <td>${(s.winRate * 100).toFixed(0)}%</td>
          <td>${s.points.toFixed(1)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

function roundViewCheckRoundSaveButton() {
  const finishedMatches = roundMatches.filter(m => m.winner !== null).length;
  const saveBtn = $('round-save-btn');
  const tourBtn = $('round-tournament-btn');
  const active = finishedMatches > 0;

  [saveBtn, tourBtn].forEach(btn => {
    btn.style.opacity = active ? '1' : '0.6';
    btn.style.background = active ? 'var(--aussie-blue)' : 'var(--roland-clay)';
  });
}

function roundViewSaveRoundResults() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveRoundResults()); return; }
  const finishedMatches = roundMatches.filter(m => m.winner !== null);
  if (finishedMatches.length === 0) { gsAlert('완료된 경기가 없습니다.'); return; }
  if (isPracticeMode === 'practice') { gsAlert('⚠️ 현재 연습 모드입니다. 기록이 반영되지 않습니다.'); return; }

  gsConfirm(`${finishedMatches.length}경기의 결과를 저장하시겠습니까?`, ok => {
    if (!ok) return;

    const standings = {};
    roundParticipants.forEach(p => {
      const key = roundMode === 'single' ? p : p.join('&');
      standings[key] = { name: p, wins: 0, losses: 0, matches: 0, points: 0 };
    });

    finishedMatches.forEach(m => {
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
      standings[homeKey].matches++;
      standings[awayKey].matches++;
      if (m.winner === 'home') { standings[homeKey].wins++; standings[awayKey].losses++; }
      else { standings[awayKey].wins++; standings[homeKey].losses++; }
    });

    Object.values(standings).forEach(s => { s.winRate = s.matches > 0 ? s.wins / s.matches : 0; });

    const sorted = Object.values(standings).sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.matches - a.matches;
    });

    const matchType = roundMode === 'single' ? 'single' : 'double';
    const winPoint = getRoundWinPoint(matchType);
    const losePoint = getRoundLosePoint(matchType);

    sorted.forEach((s, idx) => {
      let bonus = TENNIS_RULES.roundBonus[5];
      if (idx === 0) bonus = TENNIS_RULES.roundBonus[0];
      else if (idx === 1) bonus = TENNIS_RULES.roundBonus[1];
      else if (idx === 2) bonus = TENNIS_RULES.roundBonus[2];
      else if (idx === 3) bonus = TENNIS_RULES.roundBonus[3];
      else if (idx < 8) bonus = TENNIS_RULES.roundBonus[4];
      s.points = 1 + (s.wins * winPoint) + (s.losses * losePoint) + bonus;
    });

    const newLogEntries = [];
    finishedMatches.forEach(m => {
      const winner = m.winner === 'home' ? m.home : m.away;
      const loser = m.winner === 'home' ? m.away : m.home;
      const ts = Date.now();
      const ds = new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      newLogEntries.push({
        id: `${ts}-${Math.floor(Math.random() * 100000)}`,
        ts, date: ds, type: roundMode,
        home: roundMode === 'single' ? [winner] : winner,
        away: roundMode === 'single' ? [loser] : loser,
        winner: 'home', memo: 'round'
      });

      roundEngineApplyRoundScore(winner, loser, roundMode, winPoint, losePoint);
    });

    sorted.forEach((s, idx) => {
      let bonus = TENNIS_RULES.roundBonus[5];
      if (idx === 0) bonus = 5;
      else if (idx === 1) bonus = 4;
      else if (idx === 2) bonus = 3;
      else if (idx === 3) bonus = TENNIS_RULES.roundBonus[3];
      else if (idx < 8) bonus = TENNIS_RULES.roundBonus[4];
      roundEngineApplyRoundBonus(s.name, roundMode, bonus);
    });

    roundParticipants.forEach(participant => {
      const key = roundMode === 'single' ? participant : participant.join('&');
      if (standings[key] && standings[key].matches === 0) {
        roundEngineApplyRoundBonus(participant, roundMode, TENNIS_RULES.roundBonus[5]);
      }
    });

    computeAll();

    pushWithMatchLogAppend(newLogEntries).then(ok => {
      if (ok) { gsAlert('라운드 결과가 저장되었습니다!'); showView('game'); sync(); }
      else gsAlert('❌ 저장 실패! 네트워크 상태를 확인하고 다시 시도해주세요.');
    }).catch(e => {
      console.error('[round] saveRoundResults error:', e);
      gsAlert('❌ 저장 중 오류가 발생했습니다.');
    });
  });
}

function roundViewResetRound() {
  gsConfirm('라운드를 초기화하시겠습니까?', ok => {
    if (!ok) return;
    roundParticipants = [];
    roundMatches = [];
    miniTournamentMatches = [];
    miniTournamentRound = 0;

    $('round-setup-area').style.display = 'block';
    $('round-match-area').style.display = 'none';

    const rankTable = $('round-rank-table');
    const matchList = $('round-match-list');
    if (rankTable) rankTable.innerHTML = '';
    if (matchList) matchList.innerHTML = '';

    const cntSpan = $('round-cnt');
    if (cntSpan) cntSpan.textContent = '0';

    roundViewInitRoundPlayerPool();
  });
}

async function roundViewConvertRoundToTournament() {
  const finishedMatches = roundMatches.filter(m => m.winner !== null);
  if (finishedMatches.length === 0) { gsAlert('완료된 경기가 없습니다.'); return; }
  if (isPracticeMode !== 'practice') await roundViewSaveRoundDataToLog(finishedMatches);

  const standings = roundEngineCalcStandings(finishedMatches);
  const sorted = roundEngineSortStandings(standings);
  roundViewOpenTournamentModal(sorted.map(s => s.name));
}

async function roundViewSaveRoundDataToLog(finishedMatches) {
  const newLogEntries = [];

  finishedMatches.forEach(m => {
    const winner = m.winner === 'home' ? m.home : m.away;
    const loser = m.winner === 'home' ? m.away : m.home;
    const ts = Date.now();
    const ds = new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    newLogEntries.push({
      id: `${ts}-${Math.floor(Math.random() * 100000)}`,
      ts, date: ds, type: roundMode,
      home: roundMode === 'single' ? [winner] : winner,
      away: roundMode === 'single' ? [loser] : loser,
      winner: 'home', memo: 'round'
    });
    roundEngineApplyRoundScore(winner, loser, roundMode);
  });

  computeAll();
  await pushWithMatchLogAppend(newLogEntries);
}

function roundViewOpenTournamentModal(rankedParticipants) {
  const modal = $('tournament-modal');
  const list = $('modal-participant-list');
  if (!modal || !list) { console.error('Modal elements not found'); return; }

  list.innerHTML = rankedParticipants.map((participant, idx) => {
    const displayText = roundMode === 'single'
      ? displayName(participant)
      : `${displayName(participant[0])} & ${displayName(participant[1])}`;
    const checked = idx < 4 ? 'checked' : '';
    return `
      <div class="modal-participant-item ${idx < 4 ? 'selected' : ''}" onclick="toggleModalParticipant(${idx})">
        <input type="checkbox" class="modal-checkbox" id="modal-p-${idx}" ${checked} onclick="event.stopPropagation(); toggleModalParticipant(${idx})">
        <span class="modal-rank">${idx + 1}위</span>
        <span>${displayText}</span>
      </div>`;
  }).join('');

  roundViewUpdateModalCount();
  modal.classList.add('active');
}

function roundViewToggleModalParticipant(idx) {
  const checkbox = $(`modal-p-${idx}`);
  if (!checkbox) return;
  const item = checkbox.closest('.modal-participant-item');
  if (!item) return;
  checkbox.checked = !checkbox.checked;
  item.classList.toggle('selected', checkbox.checked);
  roundViewUpdateModalCount();
}

function roundViewUpdateModalCount() {
  const count = document.querySelectorAll('#modal-participant-list .modal-checkbox:checked').length;
  const countSpan = $('modal-selected-count');
  if (countSpan) countSpan.textContent = count;
}

function roundViewCloseTournamentModal() {
  const modal = $('tournament-modal');
  if (modal) modal.classList.remove('active');
}

function roundViewStartTournamentFromModal() {
  const checkboxes = document.querySelectorAll('#modal-participant-list .modal-checkbox:checked');
  if (checkboxes.length < 2) { gsAlert('최소 2명/팀을 선택해야 합니다.'); return; }

  const selectedIndices = Array.from(checkboxes)
    .map(cb => parseInt(cb.id.replace('modal-p-', '')))
    .sort((a, b) => a - b);

  const standings = roundEngineCalcStandings(roundMatches.filter(m => m.winner !== null));
  const sorted = roundEngineSortStandings(standings);
  const selectedParticipants = selectedIndices.map(i => sorted[i].name);

  roundViewCloseTournamentModal();

  const setupArea = $('round-setup-area');
  const matchArea = $('round-match-area');
  const matchList = $('round-match-list');
  const rankTable = $('round-rank-table');

  if (!matchArea || !matchList) { gsAlert('토너먼트 영역을 찾을 수 없습니다.'); return; }
  if (setupArea) setupArea.style.display = 'none';
  matchArea.style.display = 'block';

  if (rankTable) {
    const rankTitle = rankTable.previousElementSibling;
    if (rankTitle?.classList?.contains('tour-section-title')) rankTitle.style.display = 'block';
    rankTable.style.display = 'block';
  }

  try { if (typeof updateRoundRanking === 'function') updateRoundRanking(); } catch (e) { console.warn('[round] updateRoundRanking failed:', e); }
  matchList.innerHTML = '';
  setTimeout(() => startRoundMiniTournament(selectedParticipants), 100);
}

function roundViewStartRoundMiniTournament(rankedParticipants) {
  if (!rankedParticipants || rankedParticipants.length === 0) {
    gsAlert('토너먼트를 시작할 수 없습니다. 참가자 데이터가 없습니다.');
    return;
  }

  const n = rankedParticipants.length;
  let bracketSize = 2;
  while (bracketSize < n) bracketSize *= 2;
  const byeCount = bracketSize - n;

  miniTournamentMatches = [];
  let matchCount = 0;

  for (let i = 0; i < bracketSize / 2; i++) {
    const high = i < n ? rankedParticipants[i] : null;
    const low = (bracketSize - 1 - i) < n ? rankedParticipants[bracketSize - 1 - i] : null;

    if (high !== null && low !== null) {
      matchCount++;
      miniTournamentMatches.push({ id: `T-R1-M${matchCount}`, round: 1, home: high, away: low, winner: null });
    } else if (high !== null && low === null) {
      matchCount++;
      miniTournamentMatches.push({ id: `T-R1-M${matchCount}`, round: 1, home: high, away: null, winner: 'home', isBye: true });

      if (isPracticeMode !== 'practice') {
        roundEngineApplyRoundBonus(high, roundMode, 1);
        computeAll();
      }
    }
  }

  miniTournamentRound = 1;
  roundViewRenderMiniTournament();
  try { if (typeof updateRoundRanking === 'function') updateRoundRanking(); } catch (e) { console.warn('[round] updateRoundRanking failed:', e); }

  if (byeCount > 0) {
    setTimeout(() => gsAlert(`💡 ${byeCount}명/팀이 부전승으로 다음 라운드에 자동 진출합니다.\n상위 랭커에게 부전승이 배정됩니다.`), 500);
  }
}

function roundViewRenderMiniTournament() {
  const list = $('round-match-list');
  if (!list) return;

  const currentRound = miniTournamentMatches.filter(m => m.round === miniTournamentRound);
  if (currentRound.length === 0) {
    list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-gray);">표시할 매치가 없습니다.</div>';
    return;
  }

  let html = `<div style="text-align:center; margin-bottom:20px; padding:15px; background:var(--wimbledon-sage); color:white; border-radius:12px; font-size:16px; font-weight:bold;">🏆 라운드 미니 토너먼트 - Round ${miniTournamentRound}</div>`;

  currentRound.forEach(m => {
    const isFinished = m.winner !== null;
    const homeDisplay = roundMode === 'single' ? displayName(m.home) : `${displayName(m.home[0])} & ${displayName(m.home[1])}`;

    if (m.isBye) {
      html += `
        <div class="team-box" style="margin-bottom:10px; padding:12px; opacity:0.7; background:linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);">
          <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id} - 부전승</div>
          <div style="text-align:center; padding:10px;">
            <span style="color:var(--wimbledon-sage); font-weight:700; font-size:15px;">✓ ${homeDisplay}</span>
            <div style="font-size:12px; color:var(--text-gray); margin-top:5px;">다음 라운드 자동 진출</div>
          </div>
        </div>`;
      return;
    }

    const awayDisplay = roundMode === 'single' ? displayName(m.away) : `${displayName(m.away[0])} & ${displayName(m.away[1])}`;
    html += `
      <div class="team-box" style="margin-bottom:10px; padding:12px; ${isFinished ? 'opacity:0.5;' : ''}">
        <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id}</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button onclick="setMiniTournamentWinner('${m.id}', 'home')"
            class="opt-btn"
            style="flex:1; padding:10px; ${m.winner === 'home' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
            ${homeDisplay}
          </button>
          <div style="font-size:14px; color:var(--text-gray);">vs</div>
          <button onclick="setMiniTournamentWinner('${m.id}', 'away')"
            class="opt-btn"
            style="flex:1; padding:10px; ${m.winner === 'away' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
            ${awayDisplay}
          </button>
        </div>
      </div>`;
  });

  list.innerHTML = html;
}

function roundViewSetMiniTournamentWinner(matchId, side) {
  const match = miniTournamentMatches.find(m => m.id === matchId);
  if (!match || match.winner !== null) return;

  match.winner = side;
  const winner = side === 'home' ? match.home : match.away;
  const loser = side === 'home' ? match.away : match.home;

  if (isPracticeMode !== 'practice' && loser !== null) {
    const ts = Date.now();
    const ds = new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    match._logEntry = {
      id: `${ts}-${Math.floor(Math.random() * 100000)}`,
      ts, date: ds, type: roundMode,
      home: roundMode === 'single' ? [winner] : winner,
      away: roundMode === 'single' ? [loser] : loser,
      winner: 'home', memo: 'mini-tournament'
    };
  }

  if (isPracticeMode !== 'practice') {
    roundEngineApplyRoundBonus(winner, roundMode, 1);
  }

  try { if (typeof updateRoundRanking === 'function') updateRoundRanking(); } catch (e) { console.warn('[round] updateRoundRanking failed:', e); }

  const currentRound = miniTournamentMatches.filter(m => m.round === miniTournamentRound);
  const allFinished = currentRound.every(m => m.winner !== null);

  if (allFinished) {
    const winners = currentRound.map(m => m.winner === 'home' ? m.home : m.away);

    if (winners.length === 1) {
      const champDisplay = roundMode === 'single' ? displayName(winners[0]) : `${displayName(winners[0][0])} & ${displayName(winners[0][1])}`;

      if (isPracticeMode !== 'practice') {
        const allLogEntries = miniTournamentMatches.filter(m => m._logEntry).map(m => m._logEntry);
        computeAll();
        if (allLogEntries.length > 0) {
          pushWithMatchLogAppend(allLogEntries).then(ok => {
            if (!ok) console.warn('[round] mini-tournament log save failed');
            else sync();
          });
        } else {
          pushDataOnly().then(() => sync());
        }
      }

      gsAlert(`🏆 우승: ${champDisplay}!\n\n미니 토너먼트가 종료되었습니다.`);
      return;
    }

    miniTournamentRound++;
    const nextMatches = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextMatches.push({
        id: `T-R${miniTournamentRound}-M${(i / 2) + 1}`,
        round: miniTournamentRound,
        home: winners[i], away: winners[i + 1], winner: null
      });
    }
    miniTournamentMatches.push(...nextMatches);
  }

  roundViewRenderMiniTournament();
}

window.roundViewOpenRound = roundViewOpenRound;
window.roundViewSetRoundOpt = roundViewSetRoundOpt;
window.roundViewSetRoundMode = roundViewSetRoundMode;
window.roundViewInitRoundPlayerPool = roundViewInitRoundPlayerPool;
window.roundViewUpdateRoundCount = roundViewUpdateRoundCount;
window.roundViewUpdateRoundManualTeamPreview = roundViewUpdateRoundManualTeamPreview;
window.roundViewCheckRoundGenButton = roundViewCheckRoundGenButton;
window.roundViewGenerateRoundSchedule = roundViewGenerateRoundSchedule;
window.roundViewRenderRoundMatches = roundViewRenderRoundMatches;
window.roundViewSetRoundWinner = roundViewSetRoundWinner;
window.roundViewUpdateRoundRanking = roundViewUpdateRoundRanking;
window.roundViewCheckRoundSaveButton = roundViewCheckRoundSaveButton;
window.roundViewSaveRoundResults = roundViewSaveRoundResults;
window.roundViewResetRound = roundViewResetRound;
window.roundViewConvertRoundToTournament = roundViewConvertRoundToTournament;
window.roundViewSaveRoundDataToLog = roundViewSaveRoundDataToLog;
window.roundViewOpenTournamentModal = roundViewOpenTournamentModal;
window.roundViewToggleModalParticipant = roundViewToggleModalParticipant;
window.roundViewUpdateModalCount = roundViewUpdateModalCount;
window.roundViewCloseTournamentModal = roundViewCloseTournamentModal;
window.roundViewStartTournamentFromModal = roundViewStartTournamentFromModal;
window.roundViewStartRoundMiniTournament = roundViewStartRoundMiniTournament;
window.roundViewRenderMiniTournament = roundViewRenderMiniTournament;
window.roundViewSetMiniTournamentWinner = roundViewSetMiniTournamentWinner;
