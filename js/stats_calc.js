// ========================================
// STATS_CALC.JS - 랭킹/통계 계산 로직
// ========================================

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

