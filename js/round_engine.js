// ========================================
// ROUND_ENGINE.JS - 라운드 로직/데이터 처리
// ========================================

function roundEngineResolveGender(name) {
  const p = players.find(pl => pl.name === name);
  return p?.gender === 'M' || p?.gender === 'F' ? p.gender : 'UNKNOWN';
}

function roundEngineGetParticipantGenderType(participant) {
  if (Array.isArray(participant)) {
    const genders = participant.map(roundEngineResolveGender);
    if (genders.length && genders.every(g => g === 'M')) return 'M';
    if (genders.length && genders.every(g => g === 'F')) return 'F';
    return 'MIXED_OR_UNKNOWN';
  }
  if (typeof participant === 'string') {
    const g = roundEngineResolveGender(participant);
    return g === 'M' || g === 'F' ? g : 'UNKNOWN';
  }
  return 'UNKNOWN';
}

function roundEngineIsBlockedGenderBattleMatch(home, away, allowGenderBattle) {
  if (allowGenderBattle) return false;
  const homeType = roundEngineGetParticipantGenderType(home);
  const awayType = roundEngineGetParticipantGenderType(away);
  return (homeType === 'M' && awayType === 'F') || (homeType === 'F' && awayType === 'M');
}

function roundEngineBuildAutoDoubleMatches(playersList, courtCount, options = {}) {
  const allowMixed = options.allowMixed !== false;
  const allowGenderBattle = options.allowGenderBattle === true;
  const targetCourts = Math.max(0, Number(courtCount) || 0);
  if (!Array.isArray(playersList) || playersList.length < 4 || targetCourts <= 0) return [];

  const shuf = arr => (typeof shuffleArray === 'function' ? shuffleArray([...arr]) : [...arr].sort(() => Math.random() - 0.5));
  const statsRef = options.statsRef && typeof options.statsRef === 'object' ? options.statsRef : {};
  const turnNo = Number(options.turnNo) || 0;
  const femaleCountBase = Math.max(0, Number(options.femaleCount) || playersList.filter(p => p?.gender === 'F').length);

  const getStat = name => statsRef[name] || { played: 0, restStreak: 0, lastTurnPlayed: -9999 };
  const restPriority = (a, b) => {
    const sa = getStat(a.name);
    const sb = getStat(b.name);
    const aRestedPrev = sa.lastTurnPlayed !== (turnNo - 1);
    const bRestedPrev = sb.lastTurnPlayed !== (turnNo - 1);
    if (aRestedPrev !== bRestedPrev) return aRestedPrev ? -1 : 1;
    if ((sa.played || 0) !== (sb.played || 0)) return (sa.played || 0) - (sb.played || 0);
    if ((sa.restStreak || 0) !== (sb.restStreak || 0)) return (sb.restStreak || 0) - (sa.restStreak || 0);
    return Math.random() - 0.5;
  };

  const men = shuf(playersList.filter(p => p?.gender === 'M')).sort(restPriority);
  const women = shuf(playersList.filter(p => p?.gender === 'F')).sort(restPriority);
  const unknown = shuf(playersList.filter(p => p?.gender !== 'M' && p?.gender !== 'F')).sort(restPriority);
  if (unknown.length) men.push(...unknown);
  const samePossibleFromPool = men.length >= 4 || women.length >= 4;

  const normHistory = options.history && typeof options.history === 'object' ? options.history : {};
  const maleMatchSet = new Set(Array.isArray(normHistory.sameMaleMatchKeys) ? normHistory.sameMaleMatchKeys : []);
  const femaleMatchSet = new Set(Array.isArray(normHistory.sameFemaleMatchKeys) ? normHistory.sameFemaleMatchKeys : []);
  const mixedMatchSet = new Set(Array.isArray(normHistory.mixedMatchKeys) ? normHistory.mixedMatchKeys : []);
  const supportMatchSet = new Set(Array.isArray(normHistory.supportMatchKeys) ? normHistory.supportMatchKeys : []);
  const maleTeamSet = new Set(Array.isArray(normHistory.sameMaleTeamKeys) ? normHistory.sameMaleTeamKeys : []);
  const femaleTeamSet = new Set(Array.isArray(normHistory.sameFemaleTeamKeys) ? normHistory.sameFemaleTeamKeys : []);
  const mixedTeamSet = new Set(Array.isArray(normHistory.mixedTeamKeys) ? normHistory.mixedTeamKeys : []);

  let phase = options.phase === 'mixed' ? 'mixed' : 'same';
  let mixedRemaining = Math.max(0, Number(options.mixedRemaining) || 0);
  let mixedStreak = Math.max(0, Number(options.mixedStreak) || 0);
  if (phase === 'mixed' && mixedRemaining <= 0) mixedRemaining = femaleCountBase;

  const matches = [];

  const pushMatch = (home, away) => {
    if (!home || !away) return false;
    if (roundEngineIsBlockedGenderBattleMatch(home, away, allowGenderBattle)) return false;
    matches.push({ courtNo: matches.length + 1, home, away });
    return true;
  };
  const teamKey = team => [...team].sort().join('|');
  const matchKey = (a, b) => {
    const t1 = teamKey(a);
    const t2 = teamKey(b);
    return [t1, t2].sort().join('||');
  };
  const makeTeam = bucket => {
    if (bucket.length < 2) return null;
    return [bucket.shift().name, bucket.shift().name];
  };
  const rankValue = p => {
    const r = Number(p?.rank);
    if (Number.isFinite(r)) return r;
    const dr = Number(p?.dRank);
    if (Number.isFinite(dr)) return dr;
    return Number.POSITIVE_INFINITY;
  };
  const popWorstMale = () => {
    if (!men.length) return null;
    let idx = 0;
    for (let i = 1; i < men.length; i += 1) {
      const a = men[i];
      const b = men[idx];
      if (rankValue(a) > rankValue(b)) idx = i;
      else if (rankValue(a) === rankValue(b) && (Number(a?.score) || 0) < (Number(b?.score) || 0)) idx = i;
    }
    return men.splice(idx, 1)[0];
  };
  const makeMixedTeam = () => {
    if (!allowMixed) return null;
    if (men.length && women.length) return [men.shift().name, women.shift().name];
    return null;
  };
  const removeByNames = (bucket, names) => {
    names.forEach(n => {
      const idx = bucket.findIndex(x => x.name === n);
      if (idx >= 0) bucket.splice(idx, 1);
    });
  };
  const chooseBestSameMatch = (bucket, type) => {
    if (bucket.length < 4) return null;
    const maxCandidates = Math.min(bucket.length, 10);
    const cands = bucket.slice(0, maxCandidates);
    let best = null;

    for (let i = 0; i < cands.length - 3; i += 1) {
      for (let j = i + 1; j < cands.length - 2; j += 1) {
        for (let k = j + 1; k < cands.length - 1; k += 1) {
          for (let l = k + 1; l < cands.length; l += 1) {
            const group = [cands[i], cands[j], cands[k], cands[l]];
            const pairings = [
              [[group[0].name, group[1].name], [group[2].name, group[3].name]],
              [[group[0].name, group[2].name], [group[1].name, group[3].name]],
              [[group[0].name, group[3].name], [group[1].name, group[2].name]],
            ];
            pairings.forEach(([home, away]) => {
              const tkHome = teamKey(home);
              const tkAway = teamKey(away);
              const mk = matchKey(home, away);
              const tSet = type === 'M' ? maleTeamSet : femaleTeamSet;
              const mSet = type === 'M' ? maleMatchSet : femaleMatchSet;
              const score =
                (mSet.has(mk) ? 1000 : 0) +
                (tSet.has(tkHome) ? 100 : 0) +
                (tSet.has(tkAway) ? 100 : 0);
              if (!best || score < best.score) best = { score, home, away, names: group.map(x => x.name) };
            });
          }
        }
      }
    }
    return best;
  };
  const chooseMixedPairMatch = () => {
    if (!allowMixed || men.length < 2 || women.length < 2) return null;
    const m1 = men[0], m2 = men[1], f1 = women[0], f2 = women[1];
    const c1 = { home: [m1.name, f1.name], away: [m2.name, f2.name] };
    const c2 = { home: [m1.name, f2.name], away: [m2.name, f1.name] };
    const score = c => {
      const mk = matchKey(c.home, c.away);
      const th = teamKey(c.home), ta = teamKey(c.away);
      return (mixedMatchSet.has(mk) ? 1000 : 0) + (mixedTeamSet.has(th) ? 100 : 0) + (mixedTeamSet.has(ta) ? 100 : 0);
    };
    const pick = score(c1) <= score(c2) ? c1 : c2;
    removeByNames(men, [m1.name, m2.name]);
    removeByNames(women, [f1.name, f2.name]);
    return pick;
  };

  let localPhase = phase;
  let phaseStall = 0;
  while (matches.length < targetCourts) {
    let created = false;

    if (localPhase === 'same') {
      // same 턴: 남복 우선, 다음 여복 (코트 수만큼 1매치씩 즉석 생성)
      if (men.length >= 4) {
        const pick = chooseBestSameMatch(men, 'M');
        if (pick) {
          removeByNames(men, pick.names);
          created = !!pushMatch(pick.home, pick.away);
          if (created) {
            maleTeamSet.add(teamKey(pick.home));
            maleTeamSet.add(teamKey(pick.away));
            maleMatchSet.add(matchKey(pick.home, pick.away));
          }
        }
      }
      if (!created && women.length >= 4) {
        const pick = chooseBestSameMatch(women, 'F');
        if (pick) {
          removeByNames(women, pick.names);
          created = !!pushMatch(pick.home, pick.away);
          if (created) {
            femaleTeamSet.add(teamKey(pick.home));
            femaleTeamSet.add(teamKey(pick.away));
            femaleMatchSet.add(matchKey(pick.home, pick.away));
          }
        }
      }
      localPhase = 'mixed';
      if (mixedRemaining <= 0) mixedRemaining = femaleCountBase;
      if (created) mixedStreak = 0;
    } else {
      // mixed 턴: 혼복 vs 혼복 1매치, 실패 시 보완 혼복 예외 허용
      if (mixedRemaining > 0 && allowMixed && men.length >= 2 && women.length >= 2) {
        const pick = chooseMixedPairMatch();
        if (pick) {
          created = !!pushMatch(pick.home, pick.away);
          if (created) {
            mixedRemaining -= 1;
            mixedStreak += 1;
            mixedTeamSet.add(teamKey(pick.home));
            mixedTeamSet.add(teamKey(pick.away));
            mixedMatchSet.add(matchKey(pick.home, pick.away));
          }
        }
      }

      if (!created && mixedRemaining > 0 && women.length % 2 === 1 && women.length >= 1 && men.length >= 1) {
        const w = women.shift();
        const m = popWorstMale();
        if (w && m) {
          const supportMixed = [m.name, w.name];
          let opp = null;
          let oppType = null;
          if (women.length >= 2) {
            opp = [women.shift().name, women.shift().name];
            oppType = 'F';
          } else if (men.length >= 2) {
            opp = [men.shift().name, men.shift().name];
            oppType = 'M';
          }
          if (opp && pushMatch(opp, supportMixed)) {
            created = true;
            mixedRemaining -= 1;
            mixedStreak += 1;
            supportMatchSet.add(matchKey(opp, supportMixed));
          } else {
            women.unshift(w);
            men.unshift(m);
            if (opp) {
              if (oppType === 'F') {
                women.unshift({ name: opp[1], gender: 'F' });
                women.unshift({ name: opp[0], gender: 'F' });
              } else {
                men.unshift({ name: opp[1], gender: 'M' });
                men.unshift({ name: opp[0], gender: 'M' });
              }
            }
          }
        }
      }

      const canDoSameNow = samePossibleFromPool;
      if (mixedRemaining <= 0) {
        localPhase = 'same';
        mixedRemaining = 0;
      } else if (canDoSameNow && mixedStreak >= 2) {
        // 혼복은 연속 최대 2경기, same 가능하면 즉시 복귀
        localPhase = 'same';
      } else {
        localPhase = 'mixed';
      }
    }

    if (created) phaseStall = 0;
    else phaseStall += 1;
    if (phaseStall >= 2) break;
  }

  options.phase = localPhase;
  options.mixedRemaining = Math.max(0, mixedRemaining);
  options.mixedStreak = Math.max(0, mixedStreak);
  options.history = {
    sameMaleMatchKeys: Array.from(maleMatchSet).slice(-200),
    sameFemaleMatchKeys: Array.from(femaleMatchSet).slice(-200),
    mixedMatchKeys: Array.from(mixedMatchSet).slice(-200),
    supportMatchKeys: Array.from(supportMatchSet).slice(-200),
    sameMaleTeamKeys: Array.from(maleTeamSet).slice(-200),
    sameFemaleTeamKeys: Array.from(femaleTeamSet).slice(-200),
    mixedTeamKeys: Array.from(mixedTeamSet).slice(-200),
  };
  return matches;
}

function roundEngineGenerateRoundRobinMatches(participants, options = {}) {
  const allowGenderBattle = options.allowGenderBattle === true;
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
      if (roundEngineIsBlockedGenderBattleMatch(a, b, allowGenderBattle)) continue;
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
    applyOne(Array.isArray(winner) ? winner[0] : winner, true);
    applyOne(Array.isArray(loser) ? loser[0] : loser, false);
  } else {
    winner.forEach(n => applyOne(n, true));
    loser.forEach(n => applyOne(n, false));
  }
}

function roundEngineApplyRoundBonus(participant, mode, bonus) {
  if (mode === 'single') {
    const name = Array.isArray(participant) ? participant[0] : participant;
    const p = players.find(pl => pl.name === name);
    if (p) {
      p.sScore = (p.sScore || 0) + bonus;
      p.wsScore = (p.wsScore || 0) + bonus;
      p.weekly = (p.weekly || 0) + bonus;
      p.score = (p.score || 0) + bonus;
    }
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
window.roundEngineBuildAutoDoubleMatches = roundEngineBuildAutoDoubleMatches;
window.roundEngineCalcRankingStandings = roundEngineCalcRankingStandings;
window.roundEngineSortRankingStandings = roundEngineSortRankingStandings;
window.roundEngineApplyRoundScore = roundEngineApplyRoundScore;
window.roundEngineApplyRoundBonus = roundEngineApplyRoundBonus;
window.roundEngineCalcStandings = roundEngineCalcStandings;
window.roundEngineSortStandings = roundEngineSortStandings;
