// ========================================
// STATS.JS - 랭킹 / 통계 / 차트
// ========================================

// ----------------------------------------
// 1. 유틸리티 함수
// ----------------------------------------

function nowISO() {
  const d = new Date();
  const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { ts: d.getTime(), ds };
}

function calcDeltas(type, isWin) {
  const rule = TENNIS_RULES.scoring[type] || TENNIS_RULES.scoring.double;
  const earn = isWin
    ? TENNIS_RULES.scoring.participate + rule.win
    : TENNIS_RULES.scoring.participate + rule.loss;
  if (type === "double" || type === "mixed") return { total: earn, d: earn, s: 0.0 };
  return { total: earn, d: 0.0, s: earn };
}

function calcRateByKeys(p, winK, lossK) {
  const t = (p[winK] || 0) + (p[lossK] || 0);
  return t > 0 ? (p[winK] || 0) / t : 0;
}

function rateText(w, l) {
  const t = (w || 0) + (l || 0);
  return t > 0 ? (((w || 0) / t) * 100).toFixed(1) : "0.0";
}

function isInTeam(teamArr, name) {
  return Array.isArray(teamArr) && teamArr.includes(name);
}

function getOpponentNames(log, name) {
  const homeHas = isInTeam(log.home, name);
  const awayHas = isInTeam(log.away, name);
  if (!homeHas && !awayHas) return [];
  return homeHas ? (log.away || []) : (log.home || []);
}

function getPartnerNames(log, name) {
  if (log.type !== "double") return [];
  const homeHas = isInTeam(log.home, name);
  const awayHas = isInTeam(log.away, name);
  if (!homeHas && !awayHas) return [];
  const team = homeHas ? (log.home || []) : (log.away || []);
  return team.filter(n => n !== name);
}

function didPlayerWin(log, name) {
  const homeHas = isInTeam(log.home, name);
  const awayHas = isInTeam(log.away, name);
  if (!homeHas && !awayHas) return null;
  if (log.winner === "home") return homeHas;
  if (log.winner === "away") return awayHas;
  const hs = Number(log.hs ?? 0), as = Number(log.as ?? 0);
  if (hs === as) return null;
  return hs > as ? homeHas : awayHas;
}

function pickBestByRule(map, preferHigh = true) {
  const entries = Object.entries(map);
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    const A = a[1], B = b[1];
    const Ar = (A.w + A.l) > 0 ? A.w / (A.w + A.l) : 0;
    const Br = (B.w + B.l) > 0 ? B.w / (B.w + B.l) : 0;

    if (preferHigh) {
      if (Br !== Ar) return Br - Ar;
      if (B.w !== A.w) return B.w - A.w;
      if (B.totalGames !== A.totalGames) return B.totalGames - A.totalGames;
    } else {
      if (Ar !== Br) return Ar - Br;
      if (B.totalGames !== A.totalGames) return B.totalGames - A.totalGames;
      if (B.l !== A.l) return B.l - A.l;
    }
    return a[0].localeCompare(b[0]);
  });

  return { name: entries[0][0], stat: entries[0][1] };
}


// ----------------------------------------
// 2. 선수 데이터 초기화 / 정규화
// ----------------------------------------

function ensure(p) {
  const fields = [
    'score', 'wins', 'losses', 'last',
    'dScore', 'dWins', 'dLosses', 'lastD',
    'sScore', 'sWins', 'sLosses', 'lastS',
    'weekly', 'wWins', 'wLosses',
    'wdScore', 'wsScore', 'wdWins', 'wdLosses', 'wsWins', 'wsLosses',
    'lastW', 'lastWD', 'lastWS',
    'mScore', 'mWins', 'mLosses', 'lastM'
  ];
  fields.forEach(f => { if (p[f] === undefined) p[f] = 0; });

  if (p.isGuest === undefined) p.isGuest = false;
  if (p.gender !== 'M' && p.gender !== 'F') p.gender = 'M';
  if (p.isTreasurer === undefined) p.isTreasurer = false;
  if (p.isFeeExempt === undefined) p.isFeeExempt = false;
  if (!p.level || !['A', 'B', 'C', 'D'].includes(p.level)) p.level = 'A';
  if (!p.attributes) p.attributes = { sport: 'tennis', preferredPosition: null };
  if (!p.name) p.name = "NONAME";
  return p;
}


// ----------------------------------------
// 3. 경기 결과 → 선수 점수 반영
// ----------------------------------------

function applyMatchToPlayers(type, homeArr, awayArr, winnerSide) {
  const homeWin = winnerSide === "home";
  const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };

  const isMixedTeam = (arr) => {
    if (arr.length < 2) return false;
    const genders = arr.map(getGender);
    return genders.includes('M') && genders.includes('F');
  };

  const homeMixed = type === 'double' && isMixedTeam(homeArr);
  const awayMixed = type === 'double' && isMixedTeam(awayArr);

  const isCrossSingle = type === 'single' && homeArr.length === 1 && awayArr.length === 1
    && getGender(homeArr[0]) !== getGender(awayArr[0]);

  const isCrossDouble = type === 'double' && !homeMixed && !awayMixed && (() => {
    const hg = homeArr.map(getGender);
    const ag = awayArr.map(getGender);
    return (hg.every(g => g === 'M') && ag.every(g => g === 'F'))
      || (hg.every(g => g === 'F') && ag.every(g => g === 'M'));
  })();

  const apply = (ns, isW, isMyTeamMixed) => ns.forEach(n => {
    const p = players.find(x => x.name === n);
    if (!p) return;
    const d = calcDeltas(type, isW);

    p.score += d.total;
    p.wins += isW ? 1 : 0;
    p.losses += isW ? 0 : 1;

    if (type === "double") {
      if (!isCrossDouble) {
        p.dScore += d.d;
        p.dWins += isW ? 1 : 0;
        p.dLosses += isW ? 0 : 1;
      }
      if (isMyTeamMixed) {
        p.mScore += d.d;
        p.mWins += isW ? 1 : 0;
        p.mLosses += isW ? 0 : 1;
      }
    } else {
      if (!isCrossSingle) {
        p.sScore += d.s;
        p.sWins += isW ? 1 : 0;
        p.sLosses += isW ? 0 : 1;
      }
    }

    p.weekly += d.total;
    p.wWins += isW ? 1 : 0;
    p.wLosses += isW ? 0 : 1;

    if (type === "double") {
      if (!isCrossDouble) {
        p.wdScore += d.d;
        p.wdWins += isW ? 1 : 0;
        p.wdLosses += isW ? 0 : 1;
      }
    } else {
      if (!isCrossSingle) {
        p.wsScore += d.s;
        p.wsWins += isW ? 1 : 0;
        p.wsLosses += isW ? 0 : 1;
      }
    }
  });

  if (homeWin) { apply(homeArr, true, homeMixed); apply(awayArr, false, awayMixed); }
  else { apply(awayArr, true, awayMixed); apply(homeArr, false, homeMixed); }
}


// ----------------------------------------
// 4. 랭킹 계산
// ----------------------------------------

function computeRanksByScoreOnly(scoreK, winK, lossK) {
  const sorted = [...players].sort((a, b) =>
    (b[scoreK] || 0) - (a[scoreK] || 0) || calcRateByKeys(b, winK, lossK) - calcRateByKeys(a, winK, lossK)
  );
  const ranks = {};
  let currentRank = 1;
  sorted.forEach((p, i) => {
    if (i > 0 && (p[scoreK] || 0) !== (sorted[i - 1][scoreK] || 0)) currentRank = i + 1;
    ranks[p.name] = currentRank;
  });
  return ranks;
}

function snapshotLastRanks() {
  if (!Array.isArray(players) || players.length === 0) return;

  const maps = {
    last:   computeRanksByScoreOnly('score',   'wins',   'losses'),
    lastD:  computeRanksByScoreOnly('dScore',  'dWins',  'dLosses'),
    lastS:  computeRanksByScoreOnly('sScore',  'sWins',  'sLosses'),
    lastW:  computeRanksByScoreOnly('weekly',  'wWins',  'wLosses'),
    lastWD: computeRanksByScoreOnly('wdScore', 'wdWins', 'wdLosses'),
    lastWS: computeRanksByScoreOnly('wsScore', 'wsWins', 'wsLosses'),
    lastM:  computeRanksByScoreOnly('mScore',  'mWins',  'mLosses'),
  };

  players.forEach(p => {
    p.last   = maps.last[p.name]   || p.last   || 0;
    p.lastD  = maps.lastD[p.name]  || p.lastD  || 0;
    p.lastS  = maps.lastS[p.name]  || p.lastS  || 0;
    p.lastW  = maps.lastW[p.name]  || p.lastW  || 0;
    p.lastWD = maps.lastWD[p.name] || p.lastWD || 0;
    p.lastWS = maps.lastWS[p.name] || p.lastWS || 0;
    p.lastM  = maps.lastM[p.name]  || p.lastM  || 0;
  });
}

function aggregateSeasonForNamesFromLog(nameList) {
  const set = new Set(nameList || []);
  const out = {};
  (nameList || []).forEach(n => {
    out[n] = { score: 0, wins: 0, losses: 0, dScore: 0, dWins: 0, dLosses: 0, sScore: 0, sWins: 0, sLosses: 0 };
  });

  (matchLog || []).forEach(m => {
    const type = m.type || "double";
    const winner = m.winner || "";
    const home = Array.isArray(m.home) ? m.home : [];
    const away = Array.isArray(m.away) ? m.away : [];

    const applyOne = (name, isHomeSide) => {
      if (!set.has(name)) return;
      const isWin = (winner === (isHomeSide ? "home" : "away"));
      const d = calcDeltas(type, isWin);
      const s = out[name];
      s.score += d.total;
      s.wins += isWin ? 1 : 0;
      s.losses += isWin ? 0 : 1;
      if (type === "double") {
        s.dScore += d.d;
        s.dWins += isWin ? 1 : 0;
        s.dLosses += isWin ? 0 : 1;
      } else {
        s.sScore += d.s;
        s.sWins += isWin ? 1 : 0;
        s.sLosses += isWin ? 0 : 1;
      }
    };

    home.forEach(n => applyOne(n, true));
    away.forEach(n => applyOne(n, false));
  });

  return out;
}

// round/tournament 등에서 호출하는 공용 재계산 훅
function computeAll() {
  if (typeof updateSeason === 'function') updateSeason();
  if (typeof updateWeekly === 'function') updateWeekly();
  if (typeof updateRankList === 'function') updateRankList();
  if (typeof updateChart === 'function') updateChart();
}


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

function renderRankTable(tableId, scoreK, winK, lossK, lastK, filterMode) {
  const levelFilter = window.levelRankTab || 'all';

  const baseList = (() => {
    if (filterMode === 'guest') {
      const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'));
      const names = guests.map(p => p.name);
      const agg = aggregateSeasonForNamesFromLog(names);
      return guests.map(p => Object.assign({}, p, agg[p.name] || {}));
    }
    let list;
    if (filterMode === 'all') list = players.filter(p => !p.status || p.status === 'active');
    else if (filterMode === 'male') list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && p.gender !== 'F');
    else if (filterMode === 'female') list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && p.gender === 'F');
    else list = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
    if (levelFilter !== 'all' && filterMode !== 'guest') {
      list = list.filter(p => (p.level || 'A') === levelFilter);
    }
    return list;
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

function renderStatsPlayerList() {
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => (b.score || 0) - (a.score || 0));
  const guests  = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name) && (!p.status || p.status === 'active'));

  let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';

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
}

function computeStatsFromMatchLog(name) {
  const logs = normalizeMatchLog(matchLog)
    .filter(l => isInTeam(l.home, name) || isInTeam(l.away, name))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const recent = logs.slice(0, 10);
  const recentResults = recent.map(l => didPlayerWin(l, name)).filter(v => v === true || v === false);
  const displayResults = recentResults.slice().reverse();

  const dotsHTML = (displayResults.length ? displayResults : Array.from({ length: 10 }, () => false))
    .slice(0, 10)
    .map(win => `<div class="form-dot ${win ? 'win-dot' : 'loss-dot'}"></div>`)
    .join('');

  let streak = 0;
  let lastResult = displayResults.length ? displayResults[displayResults.length - 1] : null;
  if (lastResult !== null) {
    for (let i = displayResults.length - 1; i >= 0; i--) {
      if (displayResults[i] === lastResult) streak++;
      else break;
    }
  }

  let sWins = 0, sLosses = 0, sScore = 0;
  let dWins = 0, dLosses = 0, dScore = 0;

  logs.forEach(l => {
    const win = didPlayerWin(l, name);
    if (win === null) return;
    const t = l.type === "double" ? "double" : "single";
    const d = calcDeltas(t, win);
    if (t === "double") { dScore += d.d || 0; if (win) dWins++; else dLosses++; }
    else { sScore += d.s || 0; if (win) sWins++; else sLosses++; }
  });

  const totalWins = sWins + dWins;
  const totalLosses = sLosses + dLosses;
  const totalPt = (Number(sScore) + Number(dScore)).toFixed(1);

  const tableHTML = `
    <tr><td>단식 전적</td><td>${rateText(sWins, sLosses)}%</td><td>${sWins}승 ${sLosses}패</td><td>${Number(sScore).toFixed(1)}</td></tr>
    <tr><td>복식 전적</td><td>${rateText(dWins, dLosses)}%</td><td>${dWins}승 ${dLosses}패</td><td>${Number(dScore).toFixed(1)}</td></tr>
  `;
  const footHTML = `
    <tr style="background:#f9f9f9; font-weight: bold; border-top: 2px solid var(--wimbledon-sage);">
      <td>종합 전적</td><td>${rateText(totalWins, totalLosses)}%</td><td>${totalWins}승 ${totalLosses}패</td>
      <td style="color:var(--wimbledon-sage);">${totalPt} pt</td>
    </tr>
  `;

  const myGender = (() => { const p = players.find(x => x.name === name); return p ? p.gender : 'M'; })();
  const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };

  const singleOppMap = {}, partnerMap = {}, doubleEnemyMap = {};
  const crossSingleOppMap = {}, mixedPartnerMap = {};
  const mixedEnemyMap = {}, mixedEnemyMMap = {}, mixedEnemyFMap = {};

  logs.forEach(l => {
    const win = didPlayerWin(l, name);
    if (win === null) return;

    if (l.type === "single") {
      getOpponentNames(l, name).forEach(op => {
        if (HIDDEN_PLAYERS.includes(op)) return;
        if (getGender(op) === myGender) {
          if (!singleOppMap[op]) singleOppMap[op] = { w: 0, l: 0, totalGames: 0 };
          if (win) singleOppMap[op].w++; else singleOppMap[op].l++;
          singleOppMap[op].totalGames++;
        }
        if (getGender(op) !== myGender) {
          if (!crossSingleOppMap[op]) crossSingleOppMap[op] = { w: 0, l: 0, totalGames: 0 };
          if (win) crossSingleOppMap[op].w++; else crossSingleOppMap[op].l++;
          crossSingleOppMap[op].totalGames++;
        }
      });
    }

    if (l.type === "double") {
      const homeHas = isInTeam(l.home, name);
      const myTeam = homeHas ? (l.home || []) : (l.away || []);
      const isMyTeamMixed = myTeam.map(getGender).some(g => g === 'M') && myTeam.map(getGender).some(g => g === 'F');

      getPartnerNames(l, name).forEach(pt => {
        if (HIDDEN_PLAYERS.includes(pt)) return;
        if (getGender(pt) === myGender) {
          if (!partnerMap[pt]) partnerMap[pt] = { w: 0, l: 0, totalGames: 0 };
          if (win) partnerMap[pt].w++; else partnerMap[pt].l++;
          partnerMap[pt].totalGames++;
        }
        if (isMyTeamMixed && getGender(pt) !== myGender) {
          if (!mixedPartnerMap[pt]) mixedPartnerMap[pt] = { w: 0, l: 0, totalGames: 0 };
          if (win) mixedPartnerMap[pt].w++; else mixedPartnerMap[pt].l++;
          mixedPartnerMap[pt].totalGames++;
        }
      });

      getOpponentNames(l, name).forEach(op => {
        if (HIDDEN_PLAYERS.includes(op)) return;
        if (getGender(op) === myGender) {
          if (!doubleEnemyMap[op]) doubleEnemyMap[op] = { w: 0, l: 0, totalGames: 0 };
          if (win) doubleEnemyMap[op].w++; else doubleEnemyMap[op].l++;
          doubleEnemyMap[op].totalGames++;
        }
        const oppTeam = homeHas ? (l.away || []) : (l.home || []);
        const isOppTeamMixed = oppTeam.map(getGender).some(g => g === 'M') && oppTeam.map(getGender).some(g => g === 'F');
        if (isMyTeamMixed || isOppTeamMixed) {
          if (!mixedEnemyMap[op]) mixedEnemyMap[op] = { w: 0, l: 0, totalGames: 0 };
          if (win) mixedEnemyMap[op].w++; else mixedEnemyMap[op].l++;
          mixedEnemyMap[op].totalGames++;
          const targetMap = getGender(op) === 'M' ? mixedEnemyMMap : mixedEnemyFMap;
          if (!targetMap[op]) targetMap[op] = { w: 0, l: 0, totalGames: 0 };
          if (win) targetMap[op].w++; else targetMap[op].l++;
          targetMap[op].totalGames++;
        }
      });
    }
  });

  const sBestRaw = pickBestByRule(singleOppMap, true);
  const sBest = (sBestRaw && sBestRaw.stat.w >= 1) ? sBestRaw : null;
  const sWorstRaw = pickBestByRule(singleOppMap, false);
  const sWorst = (sWorstRaw && sWorstRaw.stat.l >= 1) ? sWorstRaw : null;

  const crossBestRaw = pickBestByRule(crossSingleOppMap, true);
  const crossBest = (crossBestRaw && crossBestRaw.stat.w >= 1) ? crossBestRaw : null;
  const crossWorstRaw = pickBestByRule(crossSingleOppMap, false);
  const crossWorst = (crossWorstRaw && crossWorstRaw.stat.l >= 1) ? crossWorstRaw : null;

  const dBestPartnerRaw = pickBestByRule(partnerMap, true);
  const dBestPartner = (dBestPartnerRaw && dBestPartnerRaw.stat.w >= 1) ? dBestPartnerRaw : null;
  const dWorstPartnerRaw = pickBestByRule(partnerMap, false);
  const dWorstPartner = (() => {
    if (!dWorstPartnerRaw) return null;
    return (dWorstPartnerRaw.stat.l >= 1 && (!dBestPartner || dWorstPartnerRaw.name !== dBestPartner.name)) ? dWorstPartnerRaw : null;
  })();

  const mixedBestPartnerRaw = pickBestByRule(mixedPartnerMap, true);
  const mixedBestPartner = (mixedBestPartnerRaw && mixedBestPartnerRaw.stat.w >= 1) ? mixedBestPartnerRaw : null;
  const mixedWorstPartnerRaw = pickBestByRule(mixedPartnerMap, false);
  const mixedWorstPartner = (() => {
    if (!mixedWorstPartnerRaw) return null;
    return (mixedWorstPartnerRaw.stat.l >= 1 && (!mixedBestPartner || mixedWorstPartnerRaw.name !== mixedBestPartner.name)) ? mixedWorstPartnerRaw : null;
  })();

  const dEnemies = Object.entries(doubleEnemyMap)
    .filter(([, s]) => s.l >= 1)
    .sort((a, b) => {
      const Ar = (a[1].w + a[1].l) > 0 ? a[1].w / (a[1].w + a[1].l) : 0;
      const Br = (b[1].w + b[1].l) > 0 ? b[1].w / (b[1].w + b[1].l) : 0;
      return Ar - Br || b[1].totalGames - a[1].totalGames;
    });

  const mixedEnemyMList = Object.entries(mixedEnemyMMap)
    .filter(([, s]) => s.l >= 1)
    .sort((a, b) => { const Ar = a[1].w / (a[1].w + a[1].l) || 0, Br = b[1].w / (b[1].w + b[1].l) || 0; return Ar - Br || b[1].totalGames - a[1].totalGames; });
  const mixedEnemyFList = Object.entries(mixedEnemyFMap)
    .filter(([, s]) => s.l >= 1)
    .sort((a, b) => { const Ar = a[1].w / (a[1].w + a[1].l) || 0, Br = b[1].w / (b[1].w + b[1].l) || 0; return Ar - Br || b[1].totalGames - a[1].totalGames; });

  return {
    logs, dotsHTML, displayResults, streak, lastResult,
    sWins, sLosses, sScore, dWins, dLosses, dScore, totalWins, totalLosses, totalPt,
    tableHTML, footHTML,
    sBest, sWorst,
    crossBest, crossWorst,
    dBestPartner, dWorstPartner,
    mixedBestPartner, mixedWorstPartner,
    mixedEnemyM: mixedEnemyMList[0] || null,
    mixedEnemyF: mixedEnemyFList[0] || null,
    dE1: dEnemies[0], dE2: dEnemies[1],
    myGender,
    ...computeExtraStats(name, logs)
  };
}

function computeExtraStats(name, logs) {
  const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

  let maxWinStreak = 0, maxLoseStreak = 0, curW = 0, curL = 0;
  const allResults = [...logs].sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .map(l => didPlayerWin(l, name)).filter(v => v === true || v === false);
  allResults.forEach(win => {
    if (win) { curW++; curL = 0; maxWinStreak = Math.max(maxWinStreak, curW); }
    else     { curL++; curW = 0; maxLoseStreak = Math.max(maxLoseStreak, curL); }
  });

  const oppAllMap = {};
  logs.forEach(l => {
    const win = didPlayerWin(l, name);
    if (win === null) return;
    getOpponentNames(l, name).forEach(op => {
      if (HIDDEN_PLAYERS.includes(op)) return;
      if (!oppAllMap[op]) oppAllMap[op] = { w: 0, l: 0 };
      if (win) oppAllMap[op].w++; else oppAllMap[op].l++;
    });
  });
  const top3Opp = Object.entries(oppAllMap)
    .sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l))
    .slice(0, 3);

  const weekdayMap = {};
  logs.forEach(l => {
    const win = didPlayerWin(l, name);
    if (win === null || !l.date) return;
    const day = new Date(l.date).getDay();
    if (!weekdayMap[day]) weekdayMap[day] = { w: 0, l: 0 };
    if (win) weekdayMap[day].w++; else weekdayMap[day].l++;
  });

  const monthMap = {};
  logs.forEach(l => {
    if (!l.date) return;
    const mo = l.date.slice(0, 7);
    if (!monthMap[mo]) monthMap[mo] = 0;
    monthMap[mo]++;
  });

  return { maxWinStreak, maxLoseStreak, top3Opp, weekdayMap, monthMap, KO_DAYS };
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
  $('target-name-text').innerText = `${displayName(name)} (${p.level || 'A'}조) 분석 리포트`;

  const data = computeStatsFromMatchLog(name);
  renderStatsHTML(name, data);
  report.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
