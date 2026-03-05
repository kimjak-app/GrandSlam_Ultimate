// ========================================
// STATS_VIEW.JS - 랭킹/통계 UI 렌더링
// ========================================

// ----------------------------------------
// 5. 랭킹 테이블 렌더링
// ----------------------------------------

function tab(n) {
  tabNow = n;
  for (let i = 1; i <= 2; i++) {
    if ($('s' + i)) $('s' + i).style.display = (i === n ? 'block' : 'none');
    if ($('t' + i)) $('t' + i).className = (i === n ? 'tab-btn active' : 'tab-btn');
  }
  if (n === 1) { updateSeason(); updateChartRange(0); }
  if (n === 2) updateWeekly();
  setTimeout(applyAutofitAllTables, 0);
}


function getLeaderboardPlayers(basePlayers, opts = {}) {
  return (basePlayers || []).map(p => {
    const stats = getPlayerStats(p.name, opts);
    return Object.assign({}, p, {
      score: Number(stats.score || 0),
      wins: Number(stats.wins || 0),
      losses: Number(stats.losses || 0),
      dScore: Number(stats.dScore || 0),
      sScore: Number(stats.sScore || 0)
    });
  });
}

function renderRankTable(tableId, scoreK, winK, lossK, lastK, filterMode) {
  const levelFilter = window.levelRankTab || 'all';

  const baseList = (() => {
    if (filterMode === 'guest') {
      const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'));
      return getLeaderboardPlayers(guests);
    }
    let list;
    if (filterMode === 'all') list = players.filter(p => !p.status || p.status === 'active');
    else if (filterMode === 'male') list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && p.gender !== 'F');
    else if (filterMode === 'female') list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && p.gender === 'F');
    else list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
    if (levelFilter !== 'all' && filterMode !== 'guest') {
      list = list.filter(p => (p.level || 'A') === levelFilter);
    }
    return getLeaderboardPlayers(list);
  })();

  const isOverallKey = (scoreK === 'score' || scoreK === 'weekly');
  const filtered = isOverallKey
    ? baseList
    : baseList.filter(p => (p[winK] || 0) + (p[lossK] || 0) > 0);

  const calcRate = (p) => {
    const t = (p[winK] || 0) + (p[lossK] || 0);
    return t > 0 ? (p[winK] || 0) / t : 0;
  };

  const wrSorted = [...filtered].sort((a, b) => calcRate(b) - calcRate(a) || (b[winK] || 0) - (a[winK] || 0));
  const wrRanks = {};
  let currentWrRank = 1;
  wrSorted.forEach((p, i) => {
    if (i > 0 && calcRate(p) !== calcRate(wrSorted[i - 1])) currentWrRank = i + 1;
    wrRanks[p.name] = currentWrRank;
  });

  const sorted = [...filtered].sort((a, b) => (b[scoreK] || 0) - (a[scoreK] || 0) || calcRate(b) - calcRate(a));
  const table = $(tableId);
  if (!table) return;

  if (sorted.length === 0) {
    table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">경기 기록 없음</td></tr></tbody>';
    return;
  }

  table.style.minWidth = '340px';
  table.innerHTML = `<thead><tr>
    <th style="width:40px; min-width:40px;">순위</th>
    <th style="min-width:110px; text-align:left; padding-left:10px;">이름</th>
    <th style="width:90px; min-width:90px;">승률</th>
    <th style="width:55px; min-width:55px;">승/패</th>
    <th style="width:60px; min-width:60px;">총점</th>
  </tr></thead><tbody></tbody>`;

  let currentRank = 1;
  table.querySelector('tbody').innerHTML = sorted.map((p, i) => {
    if (i > 0 && (p[scoreK] || 0) !== (sorted[i - 1][scoreK] || 0)) currentRank = i + 1;

    const rankIcon = currentRank === 1
      ? '<span class="material-symbols-outlined rank-1-icon">emoji_events</span>'
      : currentRank;
    const lastShown = (p[lastK] && Number(p[lastK]) > 0) ? Number(p[lastK]) : currentRank;
    const df = (p[lastK] && Number(p[lastK]) > 0 && lastShown !== currentRank)
      ? (lastShown > currentRank
        ? `<span style="color:var(--up-red)">▲${lastShown - currentRank}</span>`
        : `<span style="color:var(--down-blue)">▼${currentRank - lastShown}</span>`)
      : '-';

    const gIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px; color:#E8437A; vertical-align:middle; margin-right:2px;">female</span>'
      : '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px; color:#3A7BD5; vertical-align:middle; margin-right:2px;">male</span>';
    const lvBadge = `<span style="font-size:9px; background:#F0F0F0; color:#666; border-radius:3px; padding:1px 3px; margin-left:2px; vertical-align:middle;">${p.level || 'A'}</span>`;
    const isWrTop = wrRanks[p.name] === 1;
    const wrCellStyle = isWrTop
      ? `background:var(--aussie-blue); color:white; border-radius:6px; font-weight:600; white-space:nowrap;`
      : `white-space:nowrap;`;

    return `<tr>
      <td style="white-space:nowrap;">${rankIcon}</td>
      <td style="text-align:left; padding-left:10px; white-space:nowrap;">
        <div style="display:flex; align-items:center; gap:2px;">
          ${gIcon}<span style="font-weight:400;">${escapeHtml(displayName(p.name))}</span>${lvBadge}
          <span class="sub-info" style="margin-left:2px; white-space:nowrap;">(${lastShown}위)${df}</span>
        </div>
      </td>
      <td style="${wrCellStyle}" class="${isWrTop ? '' : 'sub-info'}">${(calcRate(p) * 100).toFixed(1)}% (${wrRanks[p.name]}위)</td>
      <td style="font-size:11px; white-space:nowrap;">${p[winK] || 0}/${p[lossK] || 0}</td>
      <td class="point-text" style="white-space:nowrap;">${Number(p[scoreK] || 0).toFixed(1)}</td>
    </tr>`;
  }).join('');

  setTimeout(() => applyAutofit(table), 0);
}

function renderMixedRankTable(tableId, genderFilter) {
  const table = $(tableId);
  if (!table) return;

  let list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && (p.mWins > 0 || p.mLosses > 0));
  if (genderFilter === 'male') list = list.filter(p => p.gender !== 'F');
  if (genderFilter === 'female') list = list.filter(p => p.gender === 'F');

  if (list.length === 0) {
    table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">혼복 경기 기록 없음</td></tr></tbody>';
    return;
  }

  const calcRate = (p) => {
    const t = (p.mWins || 0) + (p.mLosses || 0);
    return t > 0 ? (p.mWins || 0) / t : 0;
  };

  const wrSorted = [...list].sort((a, b) => calcRate(b) - calcRate(a) || (b.mWins || 0) - (a.mWins || 0));
  const wrRanks = {};
  let currentWrRank = 1;
  wrSorted.forEach((p, i) => {
    if (i > 0 && calcRate(p) !== calcRate(wrSorted[i - 1])) currentWrRank = i + 1;
    wrRanks[p.name] = currentWrRank;
  });

  const sorted = [...list].sort((a, b) => (b.mScore || 0) - (a.mScore || 0) || calcRate(b) - calcRate(a));

  table.style.minWidth = '340px';
  table.innerHTML = `<thead><tr>
    <th style="width:40px; min-width:40px;">순위</th>
    <th style="min-width:110px; text-align:left; padding-left:10px;">이름</th>
    <th style="width:90px; min-width:90px;">승률</th>
    <th style="width:55px; min-width:55px;">승/패</th>
    <th style="width:60px; min-width:60px;">총점</th>
  </tr></thead><tbody></tbody>`;

  let currentRank = 1;
  table.querySelector('tbody').innerHTML = sorted.map((p, i) => {
    if (i > 0 && (sorted[i - 1].mScore || 0) !== (p.mScore || 0)) currentRank = i + 1;
    const rankIcon = currentRank === 1
      ? '<span class="material-symbols-outlined rank-1-icon">emoji_events</span>'
      : currentRank;
    const lastShown = (p.lastM && Number(p.lastM) > 0) ? Number(p.lastM) : currentRank;
    const df = (p.lastM && Number(p.lastM) > 0 && lastShown !== currentRank)
      ? (lastShown > currentRank
        ? `<span style="color:var(--up-red)">▲${lastShown - currentRank}</span>`
        : `<span style="color:var(--down-blue)">▼${currentRank - lastShown}</span>`)
      : '-';
    const gIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px;color:#E8437A;vertical-align:middle;margin-right:2px;">female</span>'
      : '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px;color:#3A7BD5;vertical-align:middle;margin-right:2px;">male</span>';
    const lvBadge = `<span style="font-size:9px; background:#F0F0F0; color:#666; border-radius:3px; padding:1px 3px; margin-left:2px; vertical-align:middle;">${p.level || 'A'}</span>`;
    const isWrTop = wrRanks[p.name] === 1;
    const wrCellStyle = isWrTop
      ? `background:var(--aussie-blue); color:white; border-radius:6px; font-weight:600; white-space:nowrap;`
      : `white-space:nowrap;`;

    return `<tr>
      <td style="white-space:nowrap;">${rankIcon}</td>
      <td style="text-align:left; padding-left:10px; white-space:nowrap;">
        <div style="display:flex; align-items:center; gap:2px;">
          ${gIcon}<span style="font-weight:400;">${escapeHtml(displayName(p.name))}</span>${lvBadge}
          <span class="sub-info" style="margin-left:2px; white-space:nowrap;">(${lastShown}위)${df}</span>
        </div>
      </td>
      <td style="${wrCellStyle}" class="${isWrTop ? '' : 'sub-info'}">${(calcRate(p) * 100).toFixed(1)}% (${wrRanks[p.name]}위)</td>
      <td style="font-size:11px; white-space:nowrap;">${p.mWins || 0}/${p.mLosses || 0}</td>
      <td class="point-text" style="white-space:nowrap;">${Number(p.mScore || 0).toFixed(1)}</td>
    </tr>`;
  }).join('');

  setTimeout(() => applyAutofit(table), 0);
}

function renderPairRankTable(tableId, mode) {
  const table = $(tableId);
  if (!table) return;

  const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };
  const pairMap = {};

  (matchLog || []).forEach(m => {
    if (m.type !== 'double') return;
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];
    if (home.length < 2 || away.length < 2) return;

    const homeGenders = home.map(getGender);
    const awayGenders = away.map(getGender);
    const homeMixed = homeGenders.includes('M') && homeGenders.includes('F');
    const awayMixed = awayGenders.includes('M') && awayGenders.includes('F');

    const teams = [
      { arr: home, win: m.winner === 'home', isMixed: homeMixed, genders: homeGenders },
      { arr: away, win: m.winner === 'away', isMixed: awayMixed, genders: awayGenders }
    ];

    teams.forEach(({ arr, win, isMixed, genders }) => {
      if (mode === 'male'   && (isMixed || genders.includes('F'))) return;
      if (mode === 'female' && (isMixed || !genders.every(g => g === 'F'))) return;
      if (mode === 'mixed'  && !isMixed) return;

      const key = [...arr].sort().join('&');
      if (!pairMap[key]) pairMap[key] = { names: arr, wins: 0, losses: 0 };
      if (win) pairMap[key].wins++; else pairMap[key].losses++;
    });
  });

  const list = Object.entries(pairMap)
    .map(([key, v]) => ({ key, names: v.names, wins: v.wins, losses: v.losses, total: v.wins + v.losses }))
    .filter(v => v.total >= 1)
    .sort((a, b) => {
      const ar = a.total > 0 ? a.wins / a.total : 0;
      const br = b.total > 0 ? b.wins / b.total : 0;
      return br - ar || b.wins - a.wins;
    });

  if (list.length === 0) {
    table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">조합 기록 없음</td></tr></tbody>';
    return;
  }

  const wrSorted = [...list].sort((a, b) => {
    const ar = a.total > 0 ? a.wins / a.total : 0;
    const br = b.total > 0 ? b.wins / b.total : 0;
    return br - ar || b.wins - a.wins;
  });
  const wrRankMap = {};
  let wrRank = 1;
  wrSorted.forEach((v, i) => {
    if (i > 0) {
      const pr = wrSorted[i - 1].total > 0 ? wrSorted[i - 1].wins / wrSorted[i - 1].total : 0;
      const cr = v.total > 0 ? v.wins / v.total : 0;
      if (cr !== pr) wrRank = i + 1;
    }
    wrRankMap[v.key] = wrRank;
  });

  const mIcon = '<span class="material-symbols-outlined" style="font-size:12px;color:#3A7BD5;vertical-align:middle;">male</span>';
  const fIcon = '<span class="material-symbols-outlined" style="font-size:12px;color:#E8437A;vertical-align:middle;">female</span>';
  const nameIcon = (n) => getGender(n) === 'F' ? fIcon : mIcon;
  const dName = (n) => escapeHtml(displayName(n));

  let rank = 1;
  const rows = list.map((v, i) => {
    if (i > 0) {
      const pr = list[i - 1].total > 0 ? list[i - 1].wins / list[i - 1].total : 0;
      const cr = v.total > 0 ? v.wins / v.total : 0;
      if (pr !== cr) rank = i + 1;
    }
    const rate = v.total > 0 ? ((v.wins / v.total) * 100).toFixed(1) : '0.0';
    const pairLabel = v.names.map(n => `${nameIcon(n)}${dName(n)}`).join(' & ');
    return `<tr>
      <td style="text-align:center; width:36px; min-width:36px; white-space:nowrap;">${rank}</td>
      <td style="text-align:left; padding-left:8px; white-space:nowrap;">${pairLabel}</td>
      <td style="text-align:center; white-space:nowrap; font-size:11px; color:#666;">${rate}% (${wrRankMap[v.key]}위)</td>
      <td style="text-align:center; font-size:11px; white-space:nowrap; min-width:48px;">${v.wins}/${v.losses}</td>
    </tr>`;
  }).join('');

  table.style.minWidth = '320px';
  table.innerHTML = `
    <thead><tr>
      <th style="width:36px; min-width:36px; white-space:nowrap;">순위</th>
      <th style="text-align:left; padding-left:8px;">조합</th>
      <th style="width:90px; min-width:90px; white-space:nowrap;">승률</th>
      <th style="width:48px; min-width:48px; white-space:nowrap;">승/패</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;

  setTimeout(() => applyAutofit(table), 0);
}


// ----------------------------------------
// 6. 시즌/주간 랭킹 업데이트
// ----------------------------------------

function switchGenderRankTab(tabName) {
  window.genderRankTab = tabName;
  ['all', 'male', 'female'].forEach(t => {
    const btn = $('gender-rank-tab-' + t);
    if (btn) btn.className = (t === tabName) ? 'gender-tab-btn active' : 'gender-tab-btn';
  });
  updateSeason();
  const currentRangeIdx = window.currentChartRangeIdx || 0;
  updateChartRange(currentRangeIdx);
}

function switchLevelRankTab(lvl) {
  window.levelRankTab = lvl;
  ['all', 'A', 'B', 'C'].forEach(t => {
    const btn = $('level-rank-tab-' + t);
    if (btn) btn.className = (t === lvl) ? 'gender-tab-btn active' : 'gender-tab-btn';
  });
  updateSeason();
  renderPureGroupRankTable(lvl);
}

function updateSeason() {
  if (Array.isArray(players) && Array.isArray(matchLog)) {
    const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };
    const isMixedTeam = (arr) => {
      if (arr.length < 2) return false;
      const gs = arr.map(getGender);
      return gs.includes('M') && gs.includes('F');
    };

    players.forEach(p => { p.mScore = 0; p.mWins = 0; p.mLosses = 0; });

    matchLog.forEach(m => {
      if (m.type !== 'double') return;
      const home = Array.isArray(m.home) ? m.home : [];
      const away = Array.isArray(m.away) ? m.away : [];
      const homeMixed = isMixedTeam(home);
      const awayMixed = isMixedTeam(away);
      if (!homeMixed && !awayMixed) return;
      const homeWin = m.winner === 'home';
      [[home, homeMixed, homeWin], [away, awayMixed, !homeWin]].forEach(([arr, isMixed, isW]) => {
        if (!isMixed) return;
        arr.forEach(n => {
          const p = players.find(x => x.name === n);
          if (!p) return;
          const d = calcDeltas('double', isW);
          p.mScore += d.d;
          p.mWins  += isW ? 1 : 0;
          p.mLosses += isW ? 0 : 1;
        });
      });
    });
  }

  const currentTab = window.genderRankTab || 'all';

  if (currentTab === 'all') {
    renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last');
  } else if (currentTab === 'male') {
    renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last', 'male');
  } else if (currentTab === 'female') {
    renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last', 'female');
  }

  const secDoubleM = $('sec-double-male');
  const secDoubleF = $('sec-double-female');
  const secMixedM  = $('sec-mixed-male');
  const secMixedF  = $('sec-mixed-female');
  const secSingleM = $('sec-single-male');
  const secSingleF = $('sec-single-female');
  const gs         = $('guest-rank-section');
  const showMixed  = (m, f) => { if (secMixedM) secMixedM.style.display = m; if (secMixedF) secMixedF.style.display = f; };

  if (currentTab === 'all') {
    if (secDoubleM) secDoubleM.style.display = 'block';
    if (secDoubleF) secDoubleF.style.display = 'block';
    showMixed('block', 'block');
    if (secSingleM) secSingleM.style.display = 'block';
    if (secSingleF) secSingleF.style.display = 'block';
    if (gs) gs.style.display = 'block';

    renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
    renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
    renderMixedRankTable('seasonMixedTableM', 'male');
    renderMixedRankTable('seasonMixedTableF', 'female');
    renderPairRankTable('seasonPairTableM', 'male');
    renderPairRankTable('seasonPairTableF', 'female');
    renderPairRankTable('seasonMixedPairTable', 'mixed');
    renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');
    renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
    renderRankTable('guestSeasonTotalTable',  'score',  'wins',  'losses',  'last',  'guest');
    renderRankTable('guestSeasonDoubleTable', 'dScore', 'dWins', 'dLosses', 'lastD', 'guest');
    renderRankTable('guestSeasonSingleTable', 'sScore', 'sWins', 'sLosses', 'lastS', 'guest');

  } else if (currentTab === 'male') {
    if (secDoubleM) secDoubleM.style.display = 'block';
    if (secDoubleF) secDoubleF.style.display = 'none';
    showMixed('block', 'none');
    if (secSingleM) secSingleM.style.display = 'block';
    if (secSingleF) secSingleF.style.display = 'none';
    if (gs) gs.style.display = 'none';

    renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
    renderMixedRankTable('seasonMixedTableM', 'male');
    renderPairRankTable('seasonPairTableM', 'male');
    renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');

  } else if (currentTab === 'female') {
    if (secDoubleM) secDoubleM.style.display = 'none';
    if (secDoubleF) secDoubleF.style.display = 'block';
    showMixed('none', 'block');
    if (secSingleM) secSingleM.style.display = 'none';
    if (secSingleF) secSingleF.style.display = 'block';
    if (gs) gs.style.display = 'none';

    renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
    renderMixedRankTable('seasonMixedTableF', 'female');
    renderPairRankTable('seasonPairTableF', 'female');
    renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
  }
}

function renderPureGroupRankTable(lvl) {
  const sec = $('sec-pure-group-rank');
  const table = $('pureGroupRankTable');
  const titleEl = $('pureGroupRankTitle');
  if (!sec || !table) return;

  if (lvl === 'all') { sec.style.display = 'none'; return; }

  sec.style.display = 'block';
  if (titleEl) titleEl.textContent = lvl + '조 순수 랭킹';

  const groupNames = new Set(
    players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && (p.level || 'A') === lvl)
           .map(p => p.name)
  );

  const pureLog = (matchLog || []).filter(m => {
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];
    return [...home, ...away].every(n => groupNames.has(n));
  });

  if (pureLog.length === 0) {
    table.innerHTML = `<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">${lvl}조 순수 경기 기록 없음</td></tr></tbody>`;
    return;
  }

  const stats = {};
  groupNames.forEach(n => { stats[n] = { wins: 0, losses: 0, score: 0 }; });
  pureLog.forEach(m => {
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];
    const homeWin = m.winner === 'home';
    const apply = (names, isWin) => names.forEach(n => {
      if (!stats[n]) return;
      const d = calcDeltas(m.type || 'double', isWin);
      stats[n].score += d.total;
      stats[n].wins  += isWin ? 1 : 0;
      stats[n].losses += isWin ? 0 : 1;
    });
    apply(home, homeWin);
    apply(away, !homeWin);
  });

  const calcRate = (s) => (s.wins + s.losses) > 0 ? s.wins / (s.wins + s.losses) : 0;
  const sorted = Object.entries(stats)
    .filter(([, s]) => s.wins + s.losses > 0)
    .sort(([, a], [, b]) => b.score - a.score || calcRate(b) - calcRate(a));

  if (sorted.length === 0) {
    table.innerHTML = `<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">${lvl}조 순수 경기 기록 없음</td></tr></tbody>`;
    return;
  }

  table.style.minWidth = '340px';
  table.innerHTML = `<thead><tr>
    <th style="width:40px; min-width:40px;">순위</th>
    <th style="min-width:110px; text-align:left; padding-left:10px;">이름</th>
    <th style="width:90px; min-width:90px;">승률</th>
    <th style="width:55px; min-width:55px;">승/패</th>
    <th style="width:60px; min-width:60px;">총점</th>
  </tr></thead><tbody></tbody>`;

  let rank = 1;
  table.querySelector('tbody').innerHTML = sorted.map(([name, s], i) => {
    if (i > 0 && s.score !== sorted[i - 1][1].score) rank = i + 1;
    const rate = Math.round(calcRate(s) * 100);
    const dname = (typeof displayName === 'function') ? displayName(name) : name;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    return `<tr>
      <td style="text-align:center;">${medal}</td>
      <td style="text-align:left; padding-left:10px; font-weight:600;">${dname}</td>
      <td style="text-align:center;">${rate}%</td>
      <td style="text-align:center;">${s.wins}승 ${s.losses}패</td>
      <td style="text-align:center;">${s.score}</td>
    </tr>`;
  }).join('');
}

function updateWeekly() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now); monday.setDate(now.getDate() + diffToMon); monday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const toStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mondayStr     = toStr(monday);
  const lastMondayStr = toStr(lastMonday);
  const lastSundayStr = toStr(new Date(monday.getTime() - 86400000));

  const thisWeekLogs = (matchLog || []).filter(m => m.date >= mondayStr);
  const lastWeekLogs = (matchLog || []).filter(m => m.date >= lastMondayStr && m.date <= lastSundayStr);
  const isThisWeek = thisWeekLogs.length > 0;
  const sourceLogs = isThisWeek ? thisWeekLogs : lastWeekLogs;

  const weekLabel = isThisWeek ? '이번 주 주간 랭킹' : '지난 주 주간 랭킹';
  document.querySelectorAll('.weekly-section-label').forEach(el => { el.textContent = weekLabel; });

  const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };
  const isMixedTeam = (arr) => {
    if (arr.length < 2) return false;
    const gs = arr.map(getGender);
    return gs.includes('M') && gs.includes('F');
  };

  players.forEach(p => {
    p.weekly = 0; p.wWins = 0; p.wLosses = 0;
    p.wdScore = 0; p.wdWins = 0; p.wdLosses = 0;
    p.wsScore = 0; p.wsWins = 0; p.wsLosses = 0;
  });

  sourceLogs.forEach(m => {
    const type = m.type || 'double';
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];
    const homeMixed = type === 'double' && isMixedTeam(home);
    const awayMixed = type === 'double' && isMixedTeam(away);
    const isCrossDouble = type === 'double' && !homeMixed && !awayMixed && (() => {
      const hg = home.map(getGender); const ag = away.map(getGender);
      return (hg.every(g => g === 'M') && ag.every(g => g === 'F')) || (hg.every(g => g === 'F') && ag.every(g => g === 'M'));
    })();
    const isCrossSingle = type === 'single' && home.length === 1 && away.length === 1
      && getGender(home[0]) !== getGender(away[0]);

    [[home, true], [away, false]].forEach(([arr, isHomeSide]) => {
      const isW = isHomeSide ? m.winner === 'home' : m.winner === 'away';
      arr.forEach(n => {
        const p = players.find(x => x.name === n);
        if (!p) return;
        const d = calcDeltas(type, isW);
        p.weekly += d.total;
        p.wWins  += isW ? 1 : 0;
        p.wLosses += isW ? 0 : 1;
        if (type === 'double' && !isCrossDouble) {
          p.wdScore += d.d; p.wdWins += isW ? 1 : 0; p.wdLosses += isW ? 0 : 1;
        } else if (type === 'single' && !isCrossSingle) {
          p.wsScore += d.s; p.wsWins += isW ? 1 : 0; p.wsLosses += isW ? 0 : 1;
        }
      });
    });
  });

  snapshotLastRanks();
  renderRankTable('weeklyTotalTable',  'weekly',  'wWins',  'wLosses',  'lastW');
  renderRankTable('weeklyDoubleTable', 'wdScore', 'wdWins', 'wdLosses', 'lastWD');
  renderRankTable('weeklySingleTable', 'wsScore', 'wsWins', 'wsLosses', 'lastWS');
}


// ----------------------------------------
// 7. 차트
// ----------------------------------------

function updateChartRange(rangeIdx) {
  window.currentChartRangeIdx = rangeIdx;
  document.querySelectorAll('.chart-nav .chart-btn').forEach((b, i) =>
    b.className = i === rangeIdx ? 'chart-btn active' : 'chart-btn'
  );

  const emptyChart = () => {
    if (chart) chart.destroy();
    chart = new Chart($('seasonChart').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  };

  if (!matchLog || matchLog.length === 0) { emptyChart(); return; }

  const allDates = [...new Set(
    matchLog.filter(m => m.date && m.date.length >= 10).map(m => m.date.slice(0, 10))
  )].sort();

  if (allDates.length === 0) { emptyChart(); return; }

  const monthRanges = [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 1]];
  const [startMonth, endMonth] = monthRanges[rangeIdx];
  const filteredDates = allDates.filter(d => {
    const m = parseInt(d.slice(5, 7));
    return startMonth <= endMonth ? (m >= startMonth && m <= endMonth) : (m >= startMonth || m <= endMonth);
  });

  if (filteredDates.length === 0) { emptyChart(); return; }

  const genderTab = window.genderRankTab || 'all';
  const members = players.filter(p => {
    if (p.isGuest) return false;
    if (p.status === 'inactive' || p.status === 'dormant') return false;
    if (genderTab === 'male')   return p.gender !== 'F';
    if (genderTab === 'female') return p.gender === 'F';
    return true;
  });
  const colors = ['#FF3B30', '#007AFF', '#34C759', '#FF9500', '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA', '#FFCC00'];

  const cumScore = {};
  members.forEach(p => { cumScore[p.name] = 0; });

  const sortedLog = [...matchLog]
    .filter(m => m.date && m.date.length >= 10)
    .sort((a, b) => a.date.localeCompare(b.date));

  const rankSnapshots = {};
  let logIdx = 0;

  allDates.forEach(dateStr => {
    while (logIdx < sortedLog.length && sortedLog[logIdx].date.slice(0, 10) <= dateStr) {
      const log = sortedLog[logIdx];
      const homeWin = log.winner === 'home';
      const winners = homeWin ? (log.home || []) : (log.away || []);
      const losers  = homeWin ? (log.away || []) : (log.home || []);
      const isDouble = log.type === 'double';
      winners.forEach(n => { if (cumScore[n] !== undefined) cumScore[n] += isDouble ? TENNIS_RULES.cumScore.double : TENNIS_RULES.cumScore.single; });
      losers.forEach(n  => { if (cumScore[n] !== undefined) cumScore[n] += isDouble ? (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.loss) : (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.loss); });
      logIdx++;
    }
    const sorted = [...members].sort((a, b) => (cumScore[b.name] || 0) - (cumScore[a.name] || 0));
    const snap = {};
    sorted.forEach((p, i) => { snap[p.name] = i + 1; });
    rankSnapshots[dateStr] = snap;
  });

  const labels = filteredDates.map(d => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`);
  const datasets = members.map((p, i) => ({
    label: p.name,
    data: filteredDates.map(d => rankSnapshots[d] ? (rankSnapshots[d][p.name] || null) : null),
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length],
    pointRadius: 5,
    borderWidth: 2,
    spanGaps: true,
    clip: false
  }));

  if (chart) chart.destroy();
  chart = new Chart($('seasonChart').getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 50, bottom: 20, left: 10, right: 10 } },
      scales: {
        y: { reverse: true, min: 1, max: Math.max(members.length + 1, 10), ticks: { stepSize: 1, autoSkip: false }, grid: { color: '#eee' } },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } }
      }
    }
  });
}


// ----------------------------------------
// 8. 개인 통계
// ----------------------------------------


function _getMonthlyMvpCards() {
  const monthly = (mvpHistory && mvpHistory.monthly) ? Object.values(mvpHistory.monthly) : [];
  return monthly.sort((a, b) => (b.key || '').localeCompare(a.key || ''));
}

function _getWeeklyMvpCards() {
  const weekly = (mvpHistory && mvpHistory.weekly) ? Object.values(mvpHistory.weekly) : [];
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
  return weekly
    .filter(w => {
      if (!w || !w.key) return false;
      const d = new Date(`${w.key}T00:00:00`);
      return !Number.isNaN(d.getTime()) && d.getTime() >= cutoff;
    })
    .sort((a, b) => (b.key || '').localeCompare(a.key || ''));
}

function renderClubHistorySection() {
  const target = $('stats-club-history');
  if (!target) return;

  const monthlyCards = _getMonthlyMvpCards();
  const weeklyCards = _getWeeklyMvpCards();

  const mItems = monthlyCards.map(item => {
    const ym = String(item.key || '').replace('-', '.');
    return `<div style="min-width:160px; border:1px solid #E5E5EA; border-radius:10px; padding:8px 10px; background:#fff; font-size:12px;">${ym} ${escapeHtml(displayName(item.playerName || '-'))}(${escapeHtml(item.level || 'A')})</div>`;
  }).join('');

  const wItems = weeklyCards.map(item => {
    const label = item.label || '';
    return `<div style="min-width:160px; border:1px solid #E5E5EA; border-radius:10px; padding:8px 10px; background:#fff; font-size:12px;">${escapeHtml(label)} ${escapeHtml(displayName(item.playerName || '-'))}(${escapeHtml(item.level || 'A')})</div>`;
  }).join('');

  target.innerHTML = `
    <div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold;">이달의 선수</div>
    <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; margin-bottom:10px; max-width:520px;">${mItems || '<div style="font-size:12px;color:#999;">기록 없음</div>'}</div>
    <div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold;">이주의 선수</div>
    <div style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;">${wItems || '<div style="font-size:12px;color:#999;">기록 없음</div>'}</div>
  `;
}

function _getMvpAwardCount(name) {
  const monthly = (mvpHistory && mvpHistory.monthly) ? Object.values(mvpHistory.monthly) : [];
  const weekly = (mvpHistory && mvpHistory.weekly) ? Object.values(mvpHistory.weekly) : [];
  return {
    monthly: monthly.filter(x => x && x.playerName === name).length,
    weekly: weekly.filter(x => x && x.playerName === name).length,
  };
}

function renderStatsPlayerList() {
  const members = getLeaderboardPlayers(players.filter(p => !p.isGuest && (!p.status || p.status === 'active'))).sort((a, b) => (b.score || 0) - (a.score || 0));
  const guests  = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'));

  let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';

  html += '<div style="font-size:13px; color:#333; margin-bottom:8px; font-weight:700;">클럽 기록</div>';
  html += '<div id="stats-club-history" style="margin-bottom:14px;"></div>';

  html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';
  members.forEach((p, i) => {
    const gIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:13px; color:#E8437A; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:13px; color:#3A7BD5; vertical-align:middle;">male</span>';
    html += createPlayerOption({ inputType: "radio", nameAttr: "statsPick", id: `stat_p_${i}`, value: p.name, checked: false, onClick: `viewStats('${escapeHtml(p.name).replace(/'/g, "&#39;")}')`, labelText: `${gIcon}${escapeHtml(displayName(p.name))}`, isGuest: false, showRank: true, rankText: `${i + 1}위` });
  });
  html += '</div>';

  if (guests.length > 0) {
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
    html += '</div>';
    html += '<div class="player-pool">';
    guests.forEach((p, i) => {
      html += createPlayerOption({ inputType: "radio", nameAttr: "statsPick", id: `stat_g_${i}`, value: p.name, checked: false, onClick: `viewStats('${escapeHtml(p.name).replace(/'/g, "&#39;")}')`, labelText: `[G] ${escapeHtml(displayName(p.name))}`, isGuest: true, showRank: false });
    });
    html += '</div>';
  }

  html += '</div>';
  $('stats-pList').innerHTML = html;
  renderClubHistorySection();
}

function renderStatsHTML(name, data) {
  $('form-dots').innerHTML = data.dotsHTML;

  const adviceBox = $('advice-box');
  const adviceText = $('res-advice');
  if (data.lastResult === true && data.streak >= 2) {
    adviceBox.style.background = "var(--wimbledon-sage)";
    adviceText.innerHTML = `🔥 최근 ${data.streak}연승 스타트! 지금 폼이 좋습니다. <br>리턴 한 번만 더 붙이면 거의 끝입니다.`;
  } else if (data.lastResult === false && data.streak >= 2) {
    adviceBox.style.background = "var(--up-red)";
    adviceText.innerHTML = `😰 최근 ${data.streak}연패… 하지만 이럴 때 한 번만 끊으면 바로 반등합니다. <br>첫 2게임은 '실수 최소' 모드로 가는 게 좋습니다.`;
  } else {
    adviceBox.style.background = "var(--aussie-blue)";
    adviceText.innerHTML = `🎾 최근 폼이 조금 출렁입니다. <br>서브/리턴 중 하나만 안정시키면 연승 흐름이 잡힙니다.`;
  }

  $('res-table').innerHTML = data.tableHTML;
  $('res-foot').innerHTML = data.footHTML;

  const isValid = (obj) => obj && (obj.w + obj.l) > 0;

  const setCard = (id, subId, obj) => {
    const el = $(id);
    if (el) {
      el.innerText = (obj && isValid(obj.stat)) ? displayName(obj.name) : "-";
      $(subId).innerText = (obj && isValid(obj.stat)) ? `${obj.stat.w}승 ${obj.stat.l}패` : "0승 0패";
    }
  };
  const setCardArr = (id, subId, arr) => {
    const el = $(id);
    if (el) {
      el.innerText = (arr && isValid(arr[1])) ? displayName(arr[0]) : "-";
      $(subId).innerText = (arr && isValid(arr[1])) ? `${arr[1].w}승 ${arr[1].l}패` : "0승 0패";
    }
  };

  setCard('res-s-best',             'res-s-best-sub',             data.sBest);
  setCard('res-s-worst',            'res-s-worst-sub',            data.sWorst);
  setCard('res-cross-best',         'res-cross-best-sub',         data.crossBest);
  setCard('res-cross-worst',        'res-cross-worst-sub',        data.crossWorst);
  setCard('res-d-partner',          'res-d-partner-sub',          data.dBestPartner);
  setCard('res-d-partner-worst',    'res-d-partner-worst-sub',    data.dWorstPartner);
  setCard('res-mixed-partner',      'res-mixed-partner-sub',      data.mixedBestPartner);
  setCard('res-mixed-partner-worst','res-mixed-partner-worst-sub',data.mixedWorstPartner);
  setCardArr('res-mixed-enemy-m',   'res-mixed-enemy-m-sub',      data.mixedEnemyM);
  setCardArr('res-mixed-enemy-f',   'res-mixed-enemy-f-sub',      data.mixedEnemyF);
  setCardArr('res-d-enemy1',        'res-d-enemy1-sub',           data.dE1);
  setCardArr('res-d-enemy2',        'res-d-enemy2-sub',           data.dE2);

  const mwEl = $('res-max-streak-win');
  if (mwEl) {
    mwEl.innerText = data.maxWinStreak > 0 ? data.maxWinStreak : '-';
    $('res-max-streak-win-sub').innerText = data.maxWinStreak > 0 ? '연승 (전체 기록)' : '기록 없음';
  }
  const mlEl = $('res-max-streak-lose');
  if (mlEl) {
    mlEl.innerText = data.maxLoseStreak > 0 ? data.maxLoseStreak : '-';
    $('res-max-streak-lose-sub').innerText = data.maxLoseStreak > 0 ? '연패 (전체 기록)' : '기록 없음';
  }

  const top3El = $('res-top3-opp');
  if (top3El) {
    top3El.innerHTML = data.top3Opp.length === 0
      ? '<span style="color:var(--text-gray);">경기 기록 없음</span>'
      : data.top3Opp.map(([op, s], i) => {
          const total = s.w + s.l;
          const rate = total > 0 ? Math.round(s.w / total * 100) : 0;
          const medal = ['🥇', '🥈', '🥉'][i] || '';
          const rateColor = rate >= 50 ? 'var(--wimbledon-sage)' : 'var(--up-red)';
          return `<div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
            <span>${medal} ${escapeHtml(displayName(op))}</span>
            <span style="color:${rateColor}; font-weight:bold;">${s.w}승${s.l}패 (${rate}%)</span>
          </div>`;
        }).join('');
  }

  const wdEl = $('res-weekday');
  if (wdEl) {
    const days = [1, 2, 3, 4, 5, 6, 0];
    const bars = days.map(d => {
      const stat = data.weekdayMap[d];
      if (!stat || (stat.w + stat.l) === 0) return null;
      const total = stat.w + stat.l;
      const rate = Math.round(stat.w / total * 100);
      const barColor = rate >= 60 ? 'var(--wimbledon-sage)' : rate >= 40 ? 'var(--aussie-blue)' : 'var(--up-red)';
      return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
        <span style="width:16px; font-weight:bold;">${data.KO_DAYS[d]}</span>
        <div style="flex:1; background:#eee; border-radius:4px; height:12px; overflow:hidden;">
          <div style="width:${Math.max(4, rate)}%; background:${barColor}; height:100%; border-radius:4px;"></div>
        </div>
        <span style="font-size:11px; min-width:70px;">${rate}% (${stat.w}승${stat.l}패)</span>
      </div>`;
    }).filter(Boolean);
    wdEl.innerHTML = bars.length > 0 ? bars.join('') : '<span style="color:var(--text-gray);">경기 기록 없음</span>';
  }

  const moEl = $('res-monthly');
  if (moEl) {
    const months = Object.entries(data.monthMap).sort((a, b) => a[0].localeCompare(b[0]));
    if (months.length === 0) {
      moEl.innerHTML = '<span style="color:var(--text-gray);">경기 기록 없음</span>';
    } else {
      const maxGames = Math.max(...months.map(([, v]) => v));
      moEl.innerHTML = months.map(([mo, cnt]) => {
        const label = mo.slice(2).replace('-', '년 ') + '월';
        const barW = Math.max(4, Math.round(cnt / maxGames * 100));
        return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <span style="width:46px; font-size:11px;">${label}</span>
          <div style="flex:1; background:#eee; border-radius:4px; height:12px; overflow:hidden;">
            <div style="width:${barW}%; background:var(--aussie-blue); height:100%; border-radius:4px;"></div>
          </div>
          <span style="font-size:11px; min-width:30px;">${cnt}경기</span>
        </div>`;
      }).join('');
    }
  }
}

function viewStats(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;

  $('welcome-msg').style.display = 'none';
  const report = $('stats-report');
  report.style.display = 'block';
  const awards = _getMvpAwardCount(name);
  $('target-name-text').innerText = `${displayName(name)} (${p.level || 'A'}조) 분석 리포트`;
  const nameTitle = $('target-name');
  if (nameTitle) {
    const oldMeta = nameTitle.querySelector('.stats-award-meta');
    if (oldMeta) oldMeta.remove();
    const meta = document.createElement('div');
    meta.className = 'stats-award-meta';
    meta.style.cssText = 'margin-top:6px; font-size:12px; color:#EAF3FF;';
    meta.textContent = `이달의 선수 ${awards.monthly}회 · 이주의 선수 ${awards.weekly}회`;
    nameTitle.appendChild(meta);
  }

  const data = computeStatsFromMatchLog(name);
  renderStatsHTML(name, data);
  report.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
