// ========================================
// ROUND_AUTO_VIEW.JS - 라운드 자동생성 뷰
// ========================================

const ROUND_AUTO_KEY = 'grandslam_round_auto_state_v1';

function createRoundAutoInitialState() {
  return {
    mode: 'double',
    courtCount: 2,
    selectedPlayers: [],
    matches: [],
    history: { partners: {}, opponents: {}, playedCount: {} },
    turnNo: 0,
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
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : initial.history,
      turnNo: Number(parsed.turnNo) || 0,
    };
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

  const playerPool = document.getElementById('round-auto-player-pool');
  if (!playerPool) return;

  const clubPlayers = Array.isArray(players)
    ? players
      .filter(p => !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'))
      .map(p => p.name)
    : [];

  roundAutoState.selectedPlayers = roundAutoState.selectedPlayers.filter(name => clubPlayers.includes(name));

  if (clubPlayers.length === 0) {
    playerPool.innerHTML = '<div style="font-size:12px; color:#999;">선수 데이터가 없습니다.</div>';
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    saveRoundAutoState();
    return;
  }

  playerPool.innerHTML = `
    <div class="player-pool">
      ${clubPlayers.map((name, idx) => {
    const id = `round-auto-player-${idx}`;
    const checked = roundAutoState.selectedPlayers.includes(name) ? 'checked' : '';
    return `
          <input type="checkbox" id="${id}" class="p-chk" value="${roundAutoEscape(name)}" ${checked}>
          <label for="${id}" class="p-label">${roundAutoEscape(roundAutoPlayerLabel(name))}</label>
        `;
  }).join('')}
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

function roundAutoGenerateNextTurn() {
  const requiredPerCourt = roundAutoState.mode === 'single' ? 2 : 4;
  const needed = roundAutoState.courtCount * requiredPerCourt;

  if (roundAutoState.selectedPlayers.length < needed) {
    gsAlert(`${roundAutoState.mode === 'single' ? '단식' : '복식'}은 코트 ${roundAutoState.courtCount}개 기준 최소 ${needed}명이 필요합니다.`);
    return;
  }

  roundAutoState.turnNo += 1;
  const shuffled = shuffleArray([...roundAutoState.selectedPlayers]);

  for (let i = 0; i < roundAutoState.courtCount; i += 1) {
    const start = i * requiredPerCourt;
    const picked = shuffled.slice(start, start + requiredPerCourt);

    if (roundAutoState.mode === 'double') {
      const [a, b, c, d] = picked;
      const match = {
        id: `ra-${roundAutoState.turnNo}-${i + 1}`,
        turnNo: roundAutoState.turnNo,
        courtNo: i + 1,
        home: [a, c],
        away: [b, d],
        winner: null,
      };
      roundAutoState.matches.push(match);
    } else {
      const [a, b] = picked;
      const match = {
        id: `ra-${roundAutoState.turnNo}-${i + 1}`,
        turnNo: roundAutoState.turnNo,
        courtNo: i + 1,
        home: a,
        away: b,
        winner: null,
      };
      roundAutoState.matches.push(match);
    }
  }

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  saveRoundAutoState();
}

function roundAutoSetWinner(matchId, side) {
  const match = roundAutoState.matches.find(m => m.id === matchId);
  if (!match) return;
  match.winner = match.winner === side ? null : side;
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  saveRoundAutoState();
}

function roundAutoRenderMatches() {
  const list = document.getElementById('round-auto-match-list');
  if (!list) return;

  if (!roundAutoState.matches.length) {
    list.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">생성된 매치가 없습니다.</div>';
    return;
  }

  const grouped = roundAutoState.matches.reduce((acc, match) => {
    if (!acc[match.turnNo]) acc[match.turnNo] = [];
    acc[match.turnNo].push(match);
    return acc;
  }, {});

  const turns = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  list.innerHTML = turns.map(turnNo => {
    const matches = grouped[turnNo].sort((a, b) => a.courtNo - b.courtNo);
    return `
      <div style="margin-bottom:16px;">
        <div style="font-weight:700; font-size:13px; color:var(--wimbledon-sage); margin-bottom:8px;">TURN ${turnNo}</div>
        ${matches.map(match => {
      const home = Array.isArray(match.home) ? match.home.map(roundAutoPlayerLabel).join(' & ') : roundAutoPlayerLabel(match.home);
      const away = Array.isArray(match.away) ? match.away.map(roundAutoPlayerLabel).join(' & ') : roundAutoPlayerLabel(match.away);
      return `
            <div class="team-box" style="padding:12px; margin-bottom:8px;">
              <div style="font-size:11px; color:#888; margin-bottom:8px;">코트 ${match.courtNo}</div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <div style="flex:1; font-size:13px;">${roundAutoEscape(home)}</div>
                <div style="font-size:11px; color:#888;">vs</div>
                <div style="flex:1; font-size:13px; text-align:right;">${roundAutoEscape(away)}</div>
              </div>
              <div style="display:flex; gap:8px;">
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','home')"
                  style="flex:1; ${match.winner === 'home' ? 'background:var(--wimbledon-sage); color:white;' : ''}">HOME 승</button>
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','away')"
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

  roundAutoState.matches
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
