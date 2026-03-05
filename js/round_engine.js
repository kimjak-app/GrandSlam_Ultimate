// ========================================
// ROUND_ENGINE.JS - 라운드 로직/데이터 처리
// ========================================

function roundEngineGenerateRoundRobinMatches(participants) {
  let items = [...participants];
  if (items.length % 2 === 1) items.push('BYE');

  const matches = [];
  const seen = new Set();
  const keyOf = (p) => Array.isArray(p) ? p.join('&') : String(p);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a === 'BYE' || b === 'BYE') continue;
      const id = `${keyOf(a)}-${keyOf(b)}`;
      const idRev = `${keyOf(b)}-${keyOf(a)}`;
      if (seen.has(id) || seen.has(idRev)) continue;
      seen.add(id);
      matches.push({ id, round: 1, home: a, away: b, winner: null });
    }
  }
  return matches;
}

function roundEngineCalcRankingStandings() {
  const standings = {};

  roundParticipants.forEach(p => {
    const key = roundMode === 'single' ? p : p.join('&');
    standings[key] = { name: p, wins: 0, losses: 0, matches: 0, points: 0, h2h: {} };
  });

  roundMatches.forEach(m => {
    if (m.winner === null) return;
    const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
    const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
    standings[homeKey].matches++;
    standings[awayKey].matches++;
    if (m.winner === 'home') {
      standings[homeKey].wins++;
      standings[awayKey].losses++;
      standings[homeKey].h2h[awayKey] = (standings[homeKey].h2h[awayKey] || 0) + 1;
    } else {
      standings[awayKey].wins++;
      standings[homeKey].losses++;
      standings[awayKey].h2h[homeKey] = (standings[awayKey].h2h[homeKey] || 0) + 1;
    }
  });

  if (miniTournamentMatches && miniTournamentMatches.length > 0) {
    miniTournamentMatches.forEach(m => {
      if (m.winner === null) return;
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = m.away ? (roundMode === 'single' ? m.away : m.away.join('&')) : null;
      if (m.winner === 'home' && standings[homeKey]) standings[homeKey].miniWins = (standings[homeKey].miniWins || 0) + 1;
      if (m.winner === 'away' && awayKey && standings[awayKey]) standings[awayKey].miniWins = (standings[awayKey].miniWins || 0) + 1;
    });
  }

  const matchType = roundMode === 'single' ? 'single' : 'double';
  const winPoint = getRoundWinPoint(matchType);
  const losePoint = getRoundLosePoint(matchType);

  Object.values(standings).forEach(s => {
    s.winRate = s.matches > 0 ? s.wins / s.matches : 0;
    s.points = 1 + (s.wins * winPoint) + (s.losses * losePoint) + ((s.miniWins || 0) * 1);
  });

  return standings;
}

function roundEngineSortRankingStandings(standings) {
  return Object.values(standings).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;

    const tiedGroup = Object.values(standings).filter(s =>
      Math.abs(s.wins - a.wins) < 0.001 && Math.abs(s.winRate - a.winRate) < 0.001
    );
    if (tiedGroup.length === 2) {
      const aKey = roundMode === 'single' ? a.name : a.name.join('&');
      const bKey = roundMode === 'single' ? b.name : b.name.join('&');
      if (a.h2h[bKey] > 0) return -1;
      if (b.h2h[aKey] > 0) return 1;
    }

    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.matches !== a.matches) return b.matches - a.matches;

    if (roundMode === 'single') {
      const pA = players.find(p => p.name === a.name);
      const pB = players.find(p => p.name === b.name);
      return (pA ? pA.sRank || 999 : 999) - (pB ? pB.sRank || 999 : 999);
    } else {
      const avgRank = (team) => {
        const p1 = players.find(p => p.name === team[0]);
        const p2 = players.find(p => p.name === team[1]);
        return ((p1 ? p1.dRank || 999 : 999) + (p2 ? p2.dRank || 999 : 999)) / 2;
      };
      return avgRank(a.name) - avgRank(b.name);
    }
  });
}

function roundEngineApplyRoundScore(winner, loser, mode, winPoint, losePoint) {
  const applyOne = (name, isWin) => {
    const p = players.find(pl => pl.name === name);
    if (!p) return;
    const earn = TENNIS_RULES.scoring.participate + (isWin
      ? TENNIS_RULES.scoring[mode === 'single' ? 'single' : 'double'].win
      : TENNIS_RULES.scoring[mode === 'single' ? 'single' : 'double'].loss);

    p.score = (p.score || 0) + earn;
    p.weekly = (p.weekly || 0) + earn;
    if (isWin) {
      p.wins = (p.wins || 0) + 1;
      p.wWins = (p.wWins || 0) + 1;
    } else {
      p.losses = (p.losses || 0) + 1;
      p.wLosses = (p.wLosses || 0) + 1;
    }

    if (mode === 'single') {
      p.sScore = (p.sScore || 0) + earn;
      p.wsScore = (p.wsScore || 0) + earn;
      if (isWin) {
        p.sWins = (p.sWins || 0) + 1;
        p.wsWins = (p.wsWins || 0) + 1;
      } else {
        p.sLosses = (p.sLosses || 0) + 1;
        p.wsLosses = (p.wsLosses || 0) + 1;
      }
    } else {
      p.dScore = (p.dScore || 0) + earn;
      p.wdScore = (p.wdScore || 0) + earn;
      if (isWin) {
        p.dWins = (p.dWins || 0) + 1;
        p.wdWins = (p.wdWins || 0) + 1;
      } else {
        p.dLosses = (p.dLosses || 0) + 1;
        p.wdLosses = (p.wdLosses || 0) + 1;
      }
    }
  };

  if (mode === 'single') {
    applyOne(winner, true);
    applyOne(loser, false);
  } else {
    winner.forEach(n => applyOne(n, true));
    loser.forEach(n => applyOne(n, false));
  }
}

function roundEngineApplyRoundBonus(participant, mode, bonus) {
  if (mode === 'single') {
    const p = players.find(pl => pl.name === participant);
    if (p) { p.sScore = (p.sScore || 0) + bonus; p.score = (p.score || 0) + bonus; }
  } else {
    participant.forEach(name => {
      const p = players.find(pl => pl.name === name);
      if (p) { p.dScore = (p.dScore || 0) + bonus; p.score = (p.score || 0) + bonus; }
    });
  }
}

function roundEngineCalcStandings(finishedMatches) {
  const standings = {};
  roundParticipants.forEach(p => {
    const key = roundMode === 'single' ? p : p.join('&');
    standings[key] = { name: p, wins: 0, losses: 0, matches: 0, winRate: 0 };
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
  return standings;
}

function roundEngineSortStandings(standings) {
  return Object.values(standings).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return b.matches - a.matches;
  });
}

window.roundEngineGenerateRoundRobinMatches = roundEngineGenerateRoundRobinMatches;
window.roundEngineCalcRankingStandings = roundEngineCalcRankingStandings;
window.roundEngineSortRankingStandings = roundEngineSortRankingStandings;
window.roundEngineApplyRoundScore = roundEngineApplyRoundScore;
window.roundEngineApplyRoundBonus = roundEngineApplyRoundBonus;
window.roundEngineCalcStandings = roundEngineCalcStandings;
window.roundEngineSortStandings = roundEngineSortStandings;
