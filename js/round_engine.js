// ========================================
// ROUND_ENGINE.JS - round logic/data handling
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
  const statsRef = options.statsRef && typeof options.statsRef === 'object' ? options.statsRef : {};
  const turnNo = Number(options.turnNo) || 0;
  const normHistory = options.history && typeof options.history === 'object' ? options.history : {};
  const variantIndex = Math.max(0, Number(options.variantIndex) || 0);
  const getStat = name => statsRef[name] || { played: 0, restStreak: 0, lastTurnPlayed: -9999 };

  const maleMatchSet = new Set(Array.isArray(normHistory.sameMaleMatchKeys) ? normHistory.sameMaleMatchKeys : []);
  const femaleMatchSet = new Set(Array.isArray(normHistory.sameFemaleMatchKeys) ? normHistory.sameFemaleMatchKeys : []);
  const mixedMatchSet = new Set(Array.isArray(normHistory.mixedMatchKeys) ? normHistory.mixedMatchKeys : []);
  const maleTeamSet = new Set(Array.isArray(normHistory.sameMaleTeamKeys) ? normHistory.sameMaleTeamKeys : []);
  const femaleTeamSet = new Set(Array.isArray(normHistory.sameFemaleTeamKeys) ? normHistory.sameFemaleTeamKeys : []);
  const mixedTeamSet = new Set(Array.isArray(normHistory.mixedTeamKeys) ? normHistory.mixedTeamKeys : []);

  const isType = t => t === 'M' || t === 'F' || t === 'X';
  let nextMatchType = isType(options.nextMatchType)
    ? options.nextMatchType
    : (options.phase === 'mixed' ? 'X' : 'M');
  let mixedStreak = Math.max(0, Number(options.mixedStreak) || 0);
  if (mixedStreak >= 2 && nextMatchType === 'X') nextMatchType = 'M';

  const teamKey = team => [...team].sort().join('|');
  const matchKey = (a, b) => [teamKey(a), teamKey(b)].sort().join('||');

  const restPriority = (a, b) => {
    const sa = getStat(a.name);
    const sb = getStat(b.name);
    const aRestStreak = Number(sa.restStreak) || 0;
    const bRestStreak = Number(sb.restStreak) || 0;
    if (aRestStreak !== bRestStreak) return bRestStreak - aRestStreak;
    const aRestedPrev = sa.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    const bRestedPrev = sb.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    if (aRestedPrev !== bRestedPrev) return bRestedPrev - aRestedPrev;
    if ((sa.played || 0) !== (sb.played || 0)) return (sa.played || 0) - (sb.played || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  };

  const buildEval = (home, away, type, historyCtx) => {
    const names = [...home, ...away];
    const uniq = new Set(names);
    if (uniq.size !== 4) return null;
    if (roundEngineIsBlockedGenderBattleMatch(home, away, allowGenderBattle)) return null;

    const tSet = type === 'M' ? historyCtx.maleTeamSet : (type === 'F' ? historyCtx.femaleTeamSet : historyCtx.mixedTeamSet);
    const mSet = type === 'M' ? historyCtx.maleMatchSet : (type === 'F' ? historyCtx.femaleMatchSet : historyCtx.mixedMatchSet);
    const homeKey = teamKey(home);
    const awayKey = teamKey(away);
    const gameKey = matchKey(home, away);

    let longRestScore = 0;
    let restedPrevCount = 0;
    let consecutivePenalty = 0;
    let playedSum = 0;
    let rankGap = 0;

    const avgRank = team => {
      const rankSum = team.reduce((sum, name) => {
        const p = players.find(pl => pl?.name === name);
        const raw = Number(p?.dRank ?? p?.rank);
        const fallback = Number(getStat(name).played) || 0;
        return sum + (Number.isFinite(raw) && raw > 0 ? raw : fallback);
      }, 0);
      return rankSum / Math.max(1, team.length);
    };
    rankGap = Math.abs(avgRank(home) - avgRank(away));

    names.forEach(name => {
      const st = getStat(name);
      const restStreak = Number(st.restStreak) || 0;
      const played = Number(st.played) || 0;
      longRestScore += restStreak >= 2 ? (restStreak * 2) : restStreak;
      if (st.lastTurnPlayed !== (turnNo - 1)) restedPrevCount += 1;
      if (st.lastTurnPlayed === (turnNo - 1)) consecutivePenalty += 1;
      playedSum += played;
    });

    return {
      type,
      home,
      away,
      names,
      homeKey,
      awayKey,
      gameKey,
      teamRepeatCount: (tSet.has(homeKey) ? 1 : 0) + (tSet.has(awayKey) ? 1 : 0),
      matchupRepeatCount: mSet.has(gameKey) ? 1 : 0,
      longRestScore,
      restedPrevCount,
      consecutivePenalty,
      playedSum,
      rankGap,
      lex: `${homeKey}||${awayKey}`,
    };
  };

  const preferCandidate = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    if (a.longRestScore !== b.longRestScore) return a.longRestScore > b.longRestScore ? a : b;
    if (a.restedPrevCount !== b.restedPrevCount) return a.restedPrevCount > b.restedPrevCount ? a : b;
    if (a.consecutivePenalty !== b.consecutivePenalty) return a.consecutivePenalty < b.consecutivePenalty ? a : b;
    if (a.teamRepeatCount !== b.teamRepeatCount) return a.teamRepeatCount < b.teamRepeatCount ? a : b;
    if (a.matchupRepeatCount !== b.matchupRepeatCount) return a.matchupRepeatCount < b.matchupRepeatCount ? a : b;
    if (a.rankGap !== b.rankGap) return a.rankGap < b.rankGap ? a : b;
    if (a.playedSum !== b.playedSum) return a.playedSum < b.playedSum ? a : b;
    return a.lex <= b.lex ? a : b;
  };

  const gatherTypeCandidates = (type, pool, strictNewTeams, historyCtx) => {
    if (type === 'X' && !allowMixed) return [];
    const cap = Math.min(pool.length, 12);
    const candidates = [];

    if (type === 'M' || type === 'F') {
      const bucket = pool.filter(p => type === 'M' ? (p.gender !== 'F') : (p.gender === 'F')).slice(0, cap);
      if (bucket.length < 4) return [];
      const tSet = type === 'M' ? historyCtx.maleTeamSet : historyCtx.femaleTeamSet;
      for (let i = 0; i < bucket.length - 3; i += 1) {
        for (let j = i + 1; j < bucket.length - 2; j += 1) {
          for (let k = j + 1; k < bucket.length - 1; k += 1) {
            for (let l = k + 1; l < bucket.length; l += 1) {
              const g = [bucket[i].name, bucket[j].name, bucket[k].name, bucket[l].name];
              const pairings = [
                [[g[0], g[1]], [g[2], g[3]]],
                [[g[0], g[2]], [g[1], g[3]]],
                [[g[0], g[3]], [g[1], g[2]]],
              ];
              pairings.forEach(([home, away]) => {
                const hKey = teamKey(home);
                const aKey = teamKey(away);
                if (strictNewTeams && (tSet.has(hKey) || tSet.has(aKey))) return;
                const evald = buildEval(home, away, type, historyCtx);
                if (evald) candidates.push(evald);
              });
            }
          }
        }
      }
      return candidates;
    }

    const men = pool.filter(p => p.gender !== 'F').slice(0, cap);
    const women = pool.filter(p => p.gender === 'F').slice(0, cap);
    if (men.length < 2 || women.length < 2) return [];

    for (let mi = 0; mi < men.length - 1; mi += 1) {
      for (let mj = mi + 1; mj < men.length; mj += 1) {
        for (let fi = 0; fi < women.length - 1; fi += 1) {
          for (let fj = fi + 1; fj < women.length; fj += 1) {
            const m1 = men[mi].name, m2 = men[mj].name;
            const f1 = women[fi].name, f2 = women[fj].name;
            const pairings = [
              [[m1, f1], [m2, f2]],
              [[m1, f2], [m2, f1]],
            ];
            pairings.forEach(([home, away]) => {
              const hKey = teamKey(home);
              const aKey = teamKey(away);
              if (strictNewTeams && (historyCtx.mixedTeamSet.has(hKey) || historyCtx.mixedTeamSet.has(aKey))) return;
              const evald = buildEval(home, away, 'X', historyCtx);
              if (evald) candidates.push(evald);
            });
          }
        }
      }
    }
    return candidates;
  };

  const chooseCandidateForType = (type, pool, strictNewTeams, variantOffset, historyCtx) => {
    const cands = gatherTypeCandidates(type, pool, strictNewTeams, historyCtx);
    if (!cands.length) return null;
    const ranked = cands.sort((x, y) => (preferCandidate(x, y) === x ? -1 : 1));
    const selectable = Math.min(5, ranked.length);
    const idx = selectable ? (Math.max(0, Number(variantOffset) || 0) % selectable) : 0;
    return ranked[idx] || ranked[0];
  };

  const getTypeTryOrder = preferredType => {
    const base = preferredType === 'F'
      ? ['F', 'X', 'M']
      : (preferredType === 'X' ? ['X', 'M', 'F'] : ['M', 'F', 'X']);
    return base.filter((t, idx, arr) => arr.indexOf(t) === idx);
  };

  const sanitizeTypeOrder = (order, currentMixedStreak) => order.filter(t => {
    if (t === 'X' && !allowMixed) return false;
    if (t === 'X' && currentMixedStreak >= 2) return false;
    return true;
  });

  const persistHistory = (pick, historyCtx) => {
    if (!pick) return;
    const maleTeamRef = historyCtx.maleTeamSet;
    const femaleTeamRef = historyCtx.femaleTeamSet;
    const mixedTeamRef = historyCtx.mixedTeamSet;
    const maleMatchRef = historyCtx.maleMatchSet;
    const femaleMatchRef = historyCtx.femaleMatchSet;
    const mixedMatchRef = historyCtx.mixedMatchSet;

    if (pick.type === 'M') {
      maleTeamRef.add(pick.homeKey);
      maleTeamRef.add(pick.awayKey);
      maleMatchRef.add(pick.gameKey);
    } else if (pick.type === 'F') {
      femaleTeamRef.add(pick.homeKey);
      femaleTeamRef.add(pick.awayKey);
      femaleMatchRef.add(pick.gameKey);
    } else {
      mixedTeamRef.add(pick.homeKey);
      mixedTeamRef.add(pick.awayKey);
      mixedMatchRef.add(pick.gameKey);
    }
  };

  const updateRhythmState = (createdType, rhythmState) => {
    if (createdType === 'M') {
      rhythmState.nextMatchType = 'F';
      rhythmState.mixedStreak = 0;
      return;
    }
    if (createdType === 'F') {
      rhythmState.nextMatchType = 'X';
      rhythmState.mixedStreak = 0;
      return;
    }
    if (rhythmState.mixedStreak <= 0) {
      rhythmState.nextMatchType = 'X';
      rhythmState.mixedStreak = 1;
    } else {
      rhythmState.nextMatchType = 'M';
      rhythmState.mixedStreak = 2;
    }
  };

  const buildReasonTags = (pick) => {
    const tags = [];
    if ((pick.longRestScore || 0) > 0 || (pick.restedPrevCount || 0) >= 2) tags.push('오래 쉰 선수 우선');
    if ((pick.teamRepeatCount || 0) === 0) tags.push('파트너 반복 회피');
    else if ((pick.matchupRepeatCount || 0) === 0) tags.push('상대 반복 회피');
    if ((pick.rankGap || 0) <= 2) tags.push('랭크 균형');
    if ((pick.consecutivePenalty || 0) <= 1) tags.push('연속 출전 제한');
    if (!tags.length) tags.push('공정 출전 균형');
    return tags.slice(0, 3);
  };

  const planForCourtCount = (courtCountToUse) => {
    const localHistory = {
      maleMatchSet: new Set(maleMatchSet),
      femaleMatchSet: new Set(femaleMatchSet),
      mixedMatchSet: new Set(mixedMatchSet),
      maleTeamSet: new Set(maleTeamSet),
      femaleTeamSet: new Set(femaleTeamSet),
      mixedTeamSet: new Set(mixedTeamSet),
    };
    const rhythm = { nextMatchType, mixedStreak };
    const sortedPool = [...playersList].filter(p => p?.name).sort(restPriority);
    const activePool = sortedPool.slice(0, Math.min(sortedPool.length, courtCountToUse * 4));
    const usedNames = new Set();
    const matches = [];

    const getRemainingPool = () => activePool.filter(p => !usedNames.has(p.name));

    for (let courtIdx = 0; courtIdx < courtCountToUse; courtIdx += 1) {
      const pool = getRemainingPool();
      if (pool.length < 4) break;

      const preferredType = rhythm.nextMatchType;
      let tryOrder = sanitizeTypeOrder(getTypeTryOrder(preferredType), rhythm.mixedStreak);
      if (!tryOrder.length) tryOrder = sanitizeTypeOrder(['M', 'F', 'X'], rhythm.mixedStreak);

      let picked = null;
      for (let i = 0; i < tryOrder.length; i += 1) {
        picked = chooseCandidateForType(tryOrder[i], pool, true, variantIndex + courtIdx, localHistory);
        if (picked) break;
      }
      if (!picked) {
        for (let i = 0; i < tryOrder.length; i += 1) {
          picked = chooseCandidateForType(tryOrder[i], pool, false, variantIndex + courtIdx, localHistory);
          if (picked) break;
        }
      }
      if (!picked) break;
      if (roundEngineIsBlockedGenderBattleMatch(picked.home, picked.away, allowGenderBattle)) continue;

      matches.push({
        courtNo: matches.length + 1,
        matchType: picked.type,
        home: picked.home,
        away: picked.away,
        reasonTags: buildReasonTags(picked),
      });
      picked.names.forEach(name => usedNames.add(name));
      persistHistory(picked, localHistory);
      updateRhythmState(picked.type, rhythm);
    }

    return {
      matches,
      success: matches.length === courtCountToUse,
      history: localHistory,
      nextMatchType: rhythm.nextMatchType,
      mixedStreak: rhythm.mixedStreak,
    };
  };

  let finalPlan = null;
  for (let courts = targetCourts; courts >= 1; courts -= 1) {
    const plan = planForCourtCount(courts);
    if (!plan.matches.length) continue;
    finalPlan = plan;
    if (plan.success) break;
  }

  const matches = finalPlan ? finalPlan.matches : [];
  if (finalPlan) {
    nextMatchType = finalPlan.nextMatchType;
    mixedStreak = finalPlan.mixedStreak;
    maleMatchSet.clear(); finalPlan.history.maleMatchSet.forEach(v => maleMatchSet.add(v));
    femaleMatchSet.clear(); finalPlan.history.femaleMatchSet.forEach(v => femaleMatchSet.add(v));
    mixedMatchSet.clear(); finalPlan.history.mixedMatchSet.forEach(v => mixedMatchSet.add(v));
    maleTeamSet.clear(); finalPlan.history.maleTeamSet.forEach(v => maleTeamSet.add(v));
    femaleTeamSet.clear(); finalPlan.history.femaleTeamSet.forEach(v => femaleTeamSet.add(v));
    mixedTeamSet.clear(); finalPlan.history.mixedTeamSet.forEach(v => mixedTeamSet.add(v));
  }

  options.nextMatchType = nextMatchType;
  options.phase = nextMatchType === 'X' ? 'mixed' : 'same';
  options.mixedRemaining = 0;
  options.mixedStreak = Math.max(0, mixedStreak);
  options.history = {
    sameMaleMatchKeys: Array.from(maleMatchSet).slice(-200),
    sameFemaleMatchKeys: Array.from(femaleMatchSet).slice(-200),
    mixedMatchKeys: Array.from(mixedMatchSet).slice(-200),
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
