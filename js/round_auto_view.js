// ========================================
// ROUND_AUTO_VIEW.JS - 라운드 자동생성 뷰
// ========================================

const ROUND_AUTO_KEY = 'grandslam_round_auto_state_v1';

function createRoundAutoInitialState() {
  return {
    mode: 'double',
    courtCount: 2,
    selectedPlayers: [],
    turns: [],
    history: { partners: {}, opponents: {}, playedCount: {} },
    turnNo: 0,
    config: {
      levels: ['A', 'B', 'C'],
      gender: 'all',
      allowMixed: true,
    },
    oneTimeGuests: [],
  };
}

let roundAutoState = createRoundAutoInitialState();

function roundAutoEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roundAutoPlayerLabel(name) {
  if (typeof displayName === 'function') return displayName(name);
  return name;
}

function roundAutoGenderIcon(player) {
  return player?.gender === 'F'
    ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
    : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
}

function roundAutoLargestPowerOfTwo(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

function roundAutoFlattenMatches() {
  return (roundAutoState.turns || []).flatMap(turn => Array.isArray(turn.matches) ? turn.matches : []);
}

function roundAutoGetClubPlayers() {
  let rankMap = {};
  try {
    rankMap = computeRanksByScoreOnly('score', 'wins', 'losses');
  } catch (e) {
    console.warn('[round-auto] computeRanksByScoreOnly failed:', e);
  }

  return Array.isArray(players)
    ? players
      .filter(p => !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'))
      .map((p, idx) => ({ ...p, rank: rankMap[p.name] || p.rank || (idx + 1) }))
    : [];
}

function roundAutoGetFilteredClubPlayers() {
  const cfg = roundAutoState.config || {};
  return roundAutoGetClubPlayers().filter(p => {
    const levelOk = Array.isArray(cfg.levels) ? cfg.levels.includes((p.level || 'A')) : true;
    const genderOk = cfg.gender === 'all' || p.gender === cfg.gender;
    return levelOk && genderOk;
  });
}

function roundAutoGetFilteredGuests() {
  const cfg = roundAutoState.config || {};
  const guests = Array.isArray(roundAutoState.oneTimeGuests) ? roundAutoState.oneTimeGuests : [];
  return guests.filter(g => cfg.gender === 'all' || g.gender === cfg.gender);
}

function loadRoundAutoState() {
  try {
    const raw = localStorage.getItem(ROUND_AUTO_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;

    const initial = createRoundAutoInitialState();
    roundAutoState = {
      ...initial,
      ...parsed,
      courtCount: Math.max(1, Number(parsed.courtCount) || initial.courtCount),
      selectedPlayers: Array.isArray(parsed.selectedPlayers) ? parsed.selectedPlayers : [],
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : initial.history,
      turnNo: Number(parsed.turnNo) || 0,
      config: { ...initial.config, ...(parsed.config || {}) },
      oneTimeGuests: Array.isArray(parsed.oneTimeGuests) ? parsed.oneTimeGuests : [],
    };

    if (!roundAutoState.turns.length && Array.isArray(parsed.matches) && parsed.matches.length) {
      const grouped = parsed.matches.reduce((acc, m) => {
        if (!acc[m.turnNo]) acc[m.turnNo] = [];
        acc[m.turnNo].push(m);
        return acc;
      }, {});
      const turnNos = Object.keys(grouped).map(Number).sort((a, b) => a - b);
      roundAutoState.turns = turnNos.map((turnNo, idx) => ({
        turnNo,
        matches: grouped[turnNo],
        status: idx === turnNos.length - 1 ? 'active' : 'done',
      }));
      if (roundAutoState.turns.length === 1) {
        roundAutoState.turnNo = Math.max(roundAutoState.turnNo, roundAutoState.turns[0].turnNo);
        roundAutoState.turns.push(roundAutoBuildTurn(roundAutoState.turnNo + 1, 'preview'));
        roundAutoState.turnNo += 1;
      }
    }
  } catch (e) {
    console.warn('[round-auto] state load failed:', e);
    roundAutoState = createRoundAutoInitialState();
  }
}

function saveRoundAutoState() {
  try {
    localStorage.setItem(ROUND_AUTO_KEY, JSON.stringify(roundAutoState));
  } catch (e) {
    console.warn('[round-auto] state save failed:', e);
  }
}

function roundAutoBuildTurn(turnNo, status) {
  const requiredPerCourt = roundAutoState.mode === 'single' ? 2 : 4;
  const pool = shuffleArray([...roundAutoState.selectedPlayers]);
  const matches = [];

  for (let i = 0; i < roundAutoState.courtCount; i += 1) {
    const start = i * requiredPerCourt;
    const picked = pool.slice(start, start + requiredPerCourt);
    if (picked.length < requiredPerCourt) break;

    if (roundAutoState.mode === 'double') {
      const [a, b, c, d] = picked;
      if (!roundAutoState.config.allowMixed) {
        const genders = [a, b, c, d].map(name => {
          const member = roundAutoGetClubPlayers().find(p => p.name === name);
          const guest = (roundAutoState.oneTimeGuests || []).find(g => g.name === name);
          return member?.gender || guest?.gender || 'M';
        });
        const valid = (genders[0] === genders[2]) && (genders[1] === genders[3]);
        if (!valid) {
          continue;
        }
      }
      matches.push({
        id: `ra-${turnNo}-${i + 1}`,
        turnNo,
        courtNo: i + 1,
        home: [a, c],
        away: [b, d],
        winner: null,
      });
    } else {
      const [a, b] = picked;
      matches.push({ id: `ra-${turnNo}-${i + 1}`, turnNo, courtNo: i + 1, home: a, away: b, winner: null });
    }
  }

  return { turnNo, matches, status };
}

function roundAutoRenderFilterUI() {
  const levelsWrap = document.getElementById('round-auto-level-filters');
  const genderBtns = document.querySelectorAll('#round-auto-gender-filters button[data-gender]');
  const mixedBtn = document.getElementById('round-auto-mixed-toggle');
  if (!levelsWrap) return;

  levelsWrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.checked = (roundAutoState.config.levels || []).includes(chk.value);
    chk.onchange = () => {
      const selected = Array.from(levelsWrap.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
      roundAutoState.config.levels = selected.length ? selected : ['A', 'B', 'C'];
      initRoundAutoPlayerPool();
    };
  });

  genderBtns.forEach(btn => {
    const active = (roundAutoState.config.gender || 'all') === btn.dataset.gender;
    btn.style.background = active ? 'var(--wimbledon-sage)' : '#f3f4f6';
    btn.style.color = active ? '#fff' : '#333';
    btn.onclick = () => {
      roundAutoState.config.gender = btn.dataset.gender;
      initRoundAutoPlayerPool();
    };
  });

  if (mixedBtn) {
    mixedBtn.textContent = `혼복 허용: ${(roundAutoState.config.allowMixed ? 'ON' : 'OFF')}`;
    mixedBtn.style.background = roundAutoState.config.allowMixed ? 'var(--wimbledon-sage)' : '#8E8E93';
    mixedBtn.onclick = () => {
      roundAutoState.config.allowMixed = !roundAutoState.config.allowMixed;
      roundAutoRenderFilterUI();
      saveRoundAutoState();
    };
  }
}

function roundAutoOpenAddGuestModal() {
  gsEditName('', ({ name, gender }) => {
    const cleanName = (name || '').trim();
    if (!cleanName) return;
    const clubNames = roundAutoGetClubPlayers().map(p => p.name);
    const guestNames = (roundAutoState.oneTimeGuests || []).map(g => g.name);
    if (clubNames.includes(cleanName)) {
      gsAlert('이미 정식 회원입니다. 참가자 풀에서 선택해 주세요.');
      return;
    }
    if (guestNames.includes(cleanName)) {
      gsAlert('이미 추가된 게스트입니다.');
      return;
    }
    roundAutoState.oneTimeGuests.push({ name: cleanName, gender: gender || 'M', createdAt: Date.now() });
    roundAutoState.selectedPlayers.push(cleanName);
    initRoundAutoPlayerPool();
  }, {
    title: '당일 게스트 추가',
    placeholder: '게스트 이름 입력',
    suggestions: [],
    hideSuggestions: true,
    showGender: true,
    returnObject: true,
  });
}

function initRoundAutoPlayerPool() {
  loadRoundAutoState();

  const courtInput = document.getElementById('round-auto-court-count');
  if (courtInput) {
    courtInput.value = String(roundAutoState.courtCount || 2);
    courtInput.onchange = () => {
      const value = Math.max(1, Number(courtInput.value) || 1);
      roundAutoState.courtCount = value;
      courtInput.value = String(value);
      saveRoundAutoState();
    };
  }

  roundAutoRenderFilterUI();

  const filteredClubPlayers = roundAutoGetFilteredClubPlayers();
  const filteredGuests = roundAutoGetFilteredGuests();
  const availableNames = [...filteredClubPlayers.map(p => p.name), ...filteredGuests.map(g => g.name)];
  roundAutoState.selectedPlayers = roundAutoState.selectedPlayers.filter(name => availableNames.includes(name));

  const playerPool = document.getElementById('round-auto-player-pool');
  if (!playerPool) return;

  if (availableNames.length === 0) {
    playerPool.innerHTML = '<div style="font-size:12px; color:#999;">조건에 맞는 참가자가 없습니다.</div>';
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    saveRoundAutoState();
    return;
  }

  playerPool.innerHTML = `
    <div class="player-pool">
      ${filteredClubPlayers.map((player, idx) => {
    const id = `round-auto-player-${idx}`;
    const labelText = `${roundAutoGenderIcon(player)}${roundAutoEscape(roundAutoPlayerLabel(player.name))}`;
    if (typeof createPlayerOption === 'function') {
      return createPlayerOption({
        inputType: 'checkbox',
        nameAttr: 'round-auto-player',
        id,
        value: player.name,
        checked: roundAutoState.selectedPlayers.includes(player.name),
        onClick: '',
        labelText,
        isGuest: false,
        showRank: true,
        rankText: `${player.rank}위`
      });
    }
    return '';
  }).join('')}
    </div>
    <div id="round-auto-guests-wrap" style="margin-top:12px; border-top:1px dashed #ddd; padding-top:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-size:13px; font-weight:700; color:#666;">당일 게스트</div>
        <button type="button" class="opt-btn" onclick="roundAutoOpenAddGuestModal()" style="margin:0;">+ 게스트 추가</button>
      </div>
      <div class="player-pool" id="round-auto-guest-pool">
        ${filteredGuests.length ? filteredGuests.map((guest, idx) => {
    const id = `round-auto-guest-${idx}`;
    const checked = roundAutoState.selectedPlayers.includes(guest.name);
    return createPlayerOption({
      inputType: 'checkbox', nameAttr: 'round-auto-player', id, value: guest.name,
      checked, onClick: '', labelText: `${roundAutoGenderIcon(guest)}[당일] ${roundAutoEscape(guest.name)}`,
      isGuest: true, showRank: false, rankText: ''
    });
  }).join('') : '<div style="font-size:12px; color:#999;">당일 게스트가 없습니다.</div>'}
      </div>
    </div>
  `;

  playerPool.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', () => {
      const selected = Array.from(playerPool.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
      roundAutoState.selectedPlayers = selected;
      saveRoundAutoState();
    });
  });

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  saveRoundAutoState();
}

function roundAutoToTournament() {
  const standingsMap = {};
  const teamStandingsMap = {};

  const ensurePlayer = (name) => {
    if (!standingsMap[name]) standingsMap[name] = { key: name, players: [name], wins: 0, losses: 0, matches: 0 };
    return standingsMap[name];
  };
  const teamKeyOf = (team) => [...team].sort().join('|');
  const ensureTeam = (team) => {
    const key = teamKeyOf(team);
    if (!teamStandingsMap[key]) teamStandingsMap[key] = { key, players: [...team], wins: 0, losses: 0, matches: 0 };
    return teamStandingsMap[key];
  };

  roundAutoFlattenMatches().forEach(match => {
    if (!match || (match.winner !== 'home' && match.winner !== 'away')) return;

    const homePlayers = Array.isArray(match.home) ? match.home : [match.home];
    const awayPlayers = Array.isArray(match.away) ? match.away : [match.away];

    if (roundAutoState.mode === 'double') {
      const homeTeam = ensureTeam(homePlayers);
      const awayTeam = ensureTeam(awayPlayers);
      homeTeam.matches += 1;
      awayTeam.matches += 1;
      if (match.winner === 'home') {
        homeTeam.wins += 1;
        awayTeam.losses += 1;
      } else {
        awayTeam.wins += 1;
        homeTeam.losses += 1;
      }
      return;
    }

    homePlayers.forEach(name => ensurePlayer(name).matches += 1);
    awayPlayers.forEach(name => ensurePlayer(name).matches += 1);
    if (match.winner === 'home') {
      homePlayers.forEach(name => ensurePlayer(name).wins += 1);
      awayPlayers.forEach(name => ensurePlayer(name).losses += 1);
    } else {
      awayPlayers.forEach(name => ensurePlayer(name).wins += 1);
      homePlayers.forEach(name => ensurePlayer(name).losses += 1);
    }
  });

  const rows = Object.values(roundAutoState.mode === 'double' ? teamStandingsMap : standingsMap)
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || (b.matches - a.matches) || a.key.localeCompare(b.key));

  if (!rows.length) {
    gsAlert('토너먼트로 넘길 승/패 데이터가 없습니다. 먼저 승자를 선택해 주세요.');
    return;
  }

  const bracketSize = roundAutoLargestPowerOfTwo(rows.length);
  if (bracketSize < 2) {
    gsAlert('토너먼트 참가 인원이 부족합니다.');
    return;
  }

  const selectedEntities = rows.slice(0, bracketSize);
  const selectedNames = roundAutoState.mode === 'double'
    ? selectedEntities.flatMap(row => row.players)
    : selectedEntities.map(row => row.players[0]);

  showViewUI('tournament');

  if (roundAutoState.mode === 'double') {
    tType = 'double';
    const doubleBtn = document.querySelector('#view-tournament .opt-row:nth-of-type(2) .opt-btn:last-child');
    if (doubleBtn) setOpt('type', 'double', doubleBtn);
    const manualBtn = document.querySelector('#view-tournament .opt-row:nth-of-type(1) .opt-btn:last-child');
    if (manualBtn) setOpt('mode', 'manual', manualBtn);
    manualPickOrder = [...selectedNames];
  } else {
    tType = 'single';
    const singleBtn = document.querySelector('#view-tournament .opt-row:nth-of-type(2) .opt-btn:first-child');
    if (singleBtn) setOpt('type', 'single', singleBtn);
  }

  document.querySelectorAll('#view-tournament .p-chk').forEach(chk => {
    chk.checked = selectedNames.includes(chk.value);
  });

  upCnt();
  renderManualTeamsPreview();
}

function roundAutoGenerateNextTurn() {
  const requiredPerCourt = roundAutoState.mode === 'single' ? 2 : 4;
  const needed = roundAutoState.courtCount * requiredPerCourt;

  if (roundAutoState.selectedPlayers.length < needed) {
    gsAlert(`${roundAutoState.mode === 'single' ? '단식' : '복식'}은 코트 ${roundAutoState.courtCount}개 기준 최소 ${needed}명이 필요합니다.`);
    return;
  }

  if (!roundAutoState.turns.length) {
    const activeTurnNo = roundAutoState.turnNo + 1;
    const previewTurnNo = activeTurnNo + 1;
    roundAutoState.turns = [
      roundAutoBuildTurn(activeTurnNo, 'active'),
      roundAutoBuildTurn(previewTurnNo, 'preview')
    ];
    roundAutoState.turnNo = previewTurnNo;
  } else {
    const activeTurn = roundAutoState.turns.find(t => t.status === 'active');
    if (!activeTurn) {
      gsAlert('활성 턴 정보가 없습니다. 초기화 후 다시 시도해 주세요.');
      return;
    }
    const allDone = (activeTurn.matches || []).every(m => m.winner === 'home' || m.winner === 'away');
    if (!allDone) {
      gsAlert('승자 먼저 체크');
      return;
    }

    activeTurn.status = 'done';
    const previewTurn = roundAutoState.turns.find(t => t.status === 'preview');
    if (previewTurn) previewTurn.status = 'active';

    const newTurnNo = roundAutoState.turnNo + 1;
    roundAutoState.turns.push(roundAutoBuildTurn(newTurnNo, 'preview'));
    roundAutoState.turnNo = newTurnNo;
  }

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  saveRoundAutoState();
}

function roundAutoSetWinner(matchId, side) {
  for (const turn of roundAutoState.turns || []) {
    const match = (turn.matches || []).find(m => m.id === matchId);
    if (match) {
      match.winner = match.winner === side ? null : side;
      break;
    }
  }
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  saveRoundAutoState();
}

function roundAutoRenderMatches() {
  const list = document.getElementById('round-auto-match-list');
  if (!list) return;

  const turns = (roundAutoState.turns || []).filter(t => t.status === 'active' || t.status === 'preview');

  if (!turns.length) {
    list.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">생성된 매치가 없습니다.</div>';
    return;
  }

  list.innerHTML = turns.map(turn => {
    const matches = (turn.matches || []).sort((a, b) => a.courtNo - b.courtNo);
    const turnBadge = turn.status === 'active' ? '진행중' : '미리보기';
    const badgeBg = turn.status === 'active' ? 'var(--wimbledon-sage)' : '#6b7280';
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13px; color:var(--wimbledon-sage);">TURN ${turn.turnNo}</div>
          <span style="font-size:11px; color:#fff; background:${badgeBg}; border-radius:999px; padding:3px 8px;">${turnBadge}</span>
        </div>
        ${matches.map(match => {
      const home = Array.isArray(match.home) ? match.home.map(roundAutoPlayerLabel).join(' & ') : roundAutoPlayerLabel(match.home);
      const away = Array.isArray(match.away) ? match.away.map(roundAutoPlayerLabel).join(' & ') : roundAutoPlayerLabel(match.away);
      const disabled = turn.status === 'preview' ? 'opacity:0.8;' : '';
      const disableAttr = turn.status === 'preview' ? 'disabled' : '';
      return `
            <div class="team-box" style="padding:12px; margin-bottom:8px; ${disabled}">
              <div style="font-size:11px; color:#888; margin-bottom:8px;">코트 ${match.courtNo}</div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <div style="flex:1; font-size:13px;">${roundAutoEscape(home)}</div>
                <div style="font-size:11px; color:#888;">vs</div>
                <div style="flex:1; font-size:13px; text-align:right;">${roundAutoEscape(away)}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','home')" ${disableAttr}
                  style="flex:1; ${match.winner === 'home' ? 'background:var(--wimbledon-sage); color:white;' : ''}">HOME 승</button>
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','away')" ${disableAttr}
                  style="flex:1; ${match.winner === 'away' ? 'background:var(--wimbledon-sage); color:white;' : ''}">AWAY 승</button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }).join('');
}

function roundAutoRenderRanking() {
  const table = document.getElementById('round-auto-rank-table');
  if (!table) return;

  const standingsMap = {};
  const ensure = (name) => {
    if (!standingsMap[name]) standingsMap[name] = { name, wins: 0, losses: 0, matches: 0 };
    return standingsMap[name];
  };

  roundAutoFlattenMatches()
    .filter(match => match.winner === 'home' || match.winner === 'away')
    .forEach(match => {
      const homePlayers = Array.isArray(match.home) ? match.home : [match.home];
      const awayPlayers = Array.isArray(match.away) ? match.away : [match.away];

      homePlayers.forEach(name => ensure(name).matches += 1);
      awayPlayers.forEach(name => ensure(name).matches += 1);

      if (match.winner === 'home') {
        homePlayers.forEach(name => ensure(name).wins += 1);
        awayPlayers.forEach(name => ensure(name).losses += 1);
      } else {
        awayPlayers.forEach(name => ensure(name).wins += 1);
        homePlayers.forEach(name => ensure(name).losses += 1);
      }
    });

  const standings = Object.values(standingsMap)
    .sort((a, b) => (b.wins - a.wins) || (b.matches - a.matches) || a.name.localeCompare(b.name));

  if (!standings.length) {
    table.innerHTML = '<div style="font-size:12px; color:#999;">승자 선택 후 랭킹이 표시됩니다.</div>';
    return;
  }

  table.innerHTML = `
    <table class="tennis-table">
      <thead>
        <tr><th>순위</th><th>선수</th><th>승</th><th>패</th><th>경기</th></tr>
      </thead>
      <tbody>
        ${standings.map((s, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${roundAutoEscape(roundAutoPlayerLabel(s.name))}</td>
            <td>${s.wins}</td>
            <td>${s.losses}</td>
            <td>${s.matches}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function roundAutoReset() {
  roundAutoState = createRoundAutoInitialState();
  try {
    localStorage.removeItem(ROUND_AUTO_KEY);
  } catch (e) {
    console.warn('[round-auto] state clear failed:', e);
  }
  initRoundAutoPlayerPool();
}

function roundAutoViewOpen() {
  return showViewUI('round-auto');
}

window.ROUND_AUTO_KEY = ROUND_AUTO_KEY;
window.initRoundAutoPlayerPool = initRoundAutoPlayerPool;
window.roundAutoGenerateNextTurn = roundAutoGenerateNextTurn;
window.roundAutoSetWinner = roundAutoSetWinner;
window.roundAutoRenderMatches = roundAutoRenderMatches;
window.roundAutoRenderRanking = roundAutoRenderRanking;
window.roundAutoReset = roundAutoReset;
window.roundAutoViewOpen = roundAutoViewOpen;
window.roundAutoToTournament = roundAutoToTournament;
window.roundAutoOpenAddGuestModal = roundAutoOpenAddGuestModal;
