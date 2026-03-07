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

/**
 * roundEngineBuildAutoDoubleMatches — 김작엔진 1.0
 *
 * @param {Array}  playersList  { name, gender, level, isGuest, rank? } 객체 배열
 * @param {number} courtCount   코트 수
 * @param {object} options      nextMatchType, mixedStreak, history, statsRef, turnNo, variantIndex,
 *                              allowMixed, allowGenderBattle
 * @returns {Array} [{ courtNo, matchType, home:[name,name], away:[name,name], reasonTags }]
 */
function roundEngineBuildAutoDoubleMatches(playersList, courtCount, options = {}) {

  // ── 0. 입력 정규화 ──────────────────────────────────────────────────────────
  const allowMixed        = options.allowMixed !== false;
  const allowGenderBattle = options.allowGenderBattle === true;
  const targetCourts      = Math.max(0, Number(courtCount) || 0);

  if (!Array.isArray(playersList) || playersList.length < 4 || targetCourts <= 0) return [];

  const statsRef     = (options.statsRef && typeof options.statsRef === 'object') ? options.statsRef : {};
  const turnNo       = Number(options.turnNo) || 0;
  const variantIndex = Math.max(0, Number(options.variantIndex) || 0);

  // history: 누적 팀/경기 조합 기록
  const normHistory    = (options.history && typeof options.history === 'object') ? options.history : {};
  const maleTeamSet    = new Set(Array.isArray(normHistory.sameMaleTeamKeys)    ? normHistory.sameMaleTeamKeys    : []);
  const femaleTeamSet  = new Set(Array.isArray(normHistory.sameFemaleTeamKeys)  ? normHistory.sameFemaleTeamKeys  : []);
  const mixedTeamSet   = new Set(Array.isArray(normHistory.mixedTeamKeys)       ? normHistory.mixedTeamKeys       : []);
  const maleMatchSet   = new Set(Array.isArray(normHistory.sameMaleMatchKeys)   ? normHistory.sameMaleMatchKeys   : []);
  const femaleMatchSet = new Set(Array.isArray(normHistory.sameFemaleMatchKeys) ? normHistory.sameFemaleMatchKeys : []);
  const mixedMatchSet  = new Set(Array.isArray(normHistory.mixedMatchKeys)      ? normHistory.mixedMatchKeys      : []);

  // 규칙 1-12/1-13: "세션 기준 첫 생성" 판단
  // turnNo <= 1 만으로는 세션 누적 구조에서 첫 턴을 잘못 건너뛸 수 있으므로,
  // history 6개 키가 모두 비어있는지를 기준으로 삼는다.
  const isFirstTurn = (
    maleTeamSet.size === 0 &&
    femaleTeamSet.size === 0 &&
    mixedTeamSet.size === 0 &&
    maleMatchSet.size === 0 &&
    femaleMatchSet.size === 0 &&
    mixedMatchSet.size === 0
  );

  const validType = t => t === 'M' || t === 'F' || t === 'X';
  let nextMatchType = validType(options.nextMatchType) ? options.nextMatchType : 'M';
  let mixedStreak   = Math.max(0, Number(options.mixedStreak) || 0);

  // ── 1. 헬퍼: 성별 조회 ────────────────────────────────────────────────────
  const getGender = (name) => {
    const inPool = playersList.find(p => p.name === name);
    if (inPool) return inPool.gender === 'F' ? 'F' : 'M';
    if (typeof players !== 'undefined') {
      const gp = (players || []).find(p => p.name === name);
      if (gp) return gp.gender === 'F' ? 'F' : 'M';
    }
    return 'M';
  };

  // ── 2. 헬퍼: 랭킹 조회 ───────────────────────────────────────────────────
  // 지난주 랭킹 우선 → 이번주 랭킹 → Infinity
  const getRank = (name) => {
    const sources = [];
    const inPool = playersList.find(p => p.name === name);
    if (inPool) sources.push(inPool);
    if (typeof players !== 'undefined') {
      const gp = (players || []).find(p => p.name === name);
      if (gp) sources.push(gp);
    }
    for (const src of sources) {
      const lw = Number(src.lastRank ?? src.dLastRank ?? src.prevRank);
      if (Number.isFinite(lw) && lw > 0) return lw;
    }
    for (const src of sources) {
      const cw = Number(src.dRank ?? src.rank);
      if (Number.isFinite(cw) && cw > 0) return cw;
    }
    return Infinity;
  };

  // ── 3. 헬퍼: statsRef ────────────────────────────────────────────────────
  const getStat = name =>
    statsRef[name] || { played: 0, restStreak: 0, lastTurnPlayed: -9999, consecutiveCount: 0 };

  // ── 4. 헬퍼: 키 생성 ─────────────────────────────────────────────────────
  const teamKey  = team       => [...team].sort().join('|');
  const matchKey = (home, away) => [teamKey(home), teamKey(away)].sort().join('||');

  // ── 5. 규칙 1-10: 휴식 우선순위 정렬 ─────────────────────────────────────
  // 1순위: 연속 휴식 횟수 많을수록 우선
  // 2순위: 직전 턴 미참가
  // 3순위: 총 참가 횟수 적을수록 우선
  const restPriority = (a, b) => {
    const sa = getStat(a.name), sb = getStat(b.name);
    const ra = Number(sa.restStreak) || 0, rb = Number(sb.restStreak) || 0;
    if (ra !== rb) return rb - ra;
    const aSkipped = sa.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    const bSkipped = sb.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    if (aSkipped !== bSkipped) return bSkipped - aSkipped;
    const ap = Number(sa.played) || 0, bp = Number(sb.played) || 0;
    if (ap !== bp) return ap - bp;
    return String(a.name).localeCompare(String(b.name));
  };

  // ── 6. 인원 파악 ─────────────────────────────────────────────────────────
  const genderCount = (pool) => ({
    males:   pool.filter(p => getGender(p.name) === 'M').length,
    females: pool.filter(p => getGender(p.name) === 'F').length,
  });

  // ── 규칙 4-2: 성별 불균형 감지 ───────────────────────────────────────────
  // 한 성별이 1명 이하면 불균형 → 성별 구분 없이 전체 풀 취급
  const isGenderImbalanced = (pool) => {
    const { males, females } = genderCount(pool);
    return females <= 1 || males <= 1;
  };

  // ── 7. 규칙 1-1~1-3: matchType 가능 여부 ─────────────────────────────────
  const canMakeType = (type, pool) => {
    // 규칙 4-2: 불균형이면 전체 풀 기준으로 4명 가능 여부만 체크
    if (isGenderImbalanced(pool)) return pool.length >= 4;
    const { males, females } = genderCount(pool);
    if (type === 'M') return males >= 4 || (males === 3 && females >= 1);
    if (type === 'F') return females >= 4 || (females === 3 && males >= 1);
    if (type === 'X') return allowMixed && males >= 2 && females >= 2;
    return false;
  };

  // ── 8. 규칙 1-6 / 1-7: 보충 선수 ─────────────────────────────────────────
  // 남복 부족 → 여자 최고랭커(rank 숫자 가장 낮음)
  // 여복 부족 → 남자 최저랭커(rank 숫자 가장 높음)
  const findSupplement = (type, pool, excludeNames) => {
    const excl = new Set(excludeNames);
    const avail = pool.filter(p => !excl.has(p.name));
    if (type === 'M') {
      const females = avail.filter(p => getGender(p.name) === 'F');
      if (!females.length) return null;
      // 여자가 한 명뿐이면 그 선수 사용 (규칙 1-6)
      return females.sort((a, b) => getRank(a.name) - getRank(b.name))[0];
    }
    if (type === 'F') {
      const males = avail.filter(p => getGender(p.name) === 'M');
      if (!males.length) return null;
      return males.sort((a, b) => getRank(b.name) - getRank(a.name))[0]; // 최저랭커
    }
    return null;
  };

  // ── 9. 후보 평가 객체 생성 ───────────────────────────────────────────────
  const buildEval = (home, away, type, histCtx) => {
    const names = [...home, ...away];
    if (new Set(names).size !== 4) return null;
    if (roundEngineIsBlockedGenderBattleMatch(home, away, allowGenderBattle)) return null;

    const hKey = teamKey(home), aKey = teamKey(away), gKey = matchKey(home, away);
    const tSet = type === 'M' ? histCtx.maleTeamSet   : (type === 'F' ? histCtx.femaleTeamSet : histCtx.mixedTeamSet);
    const mSet = type === 'M' ? histCtx.maleMatchSet  : (type === 'F' ? histCtx.femaleMatchSet : histCtx.mixedMatchSet);

    let longRestScore = 0, restedPrevCount = 0, consecutivePenalty = 0;
    let consecutiveExceed = 0, playedSum = 0;

    names.forEach(name => {
      const st = getStat(name);
      const rs = Number(st.restStreak) || 0;
      longRestScore      += rs >= 2 ? rs * 2 : rs;
      restedPrevCount    += st.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
      consecutivePenalty += st.lastTurnPlayed === (turnNo - 1) ? 1 : 0;
      consecutiveExceed  += (Number(st.consecutiveCount) || 0) >= 2 ? 1 : 0;
      playedSum          += Number(st.played) || 0;
    });

    const avgRank = team => team.reduce((s, n) => s + getRank(n), 0) / team.length;
    const rankGap = Math.abs(avgRank(home) - avgRank(away));

    return {
      type, home, away, names,
      homeKey: hKey, awayKey: aKey, gameKey: gKey,
      teamRepeatCount:    (tSet.has(hKey) ? 1 : 0) + (tSet.has(aKey) ? 1 : 0),
      matchupRepeatCount: mSet.has(gKey) ? 1 : 0,
      longRestScore, restedPrevCount, consecutivePenalty,
      consecutiveExceed, playedSum, rankGap,
      lex: `${hKey}||${aKey}`,
    };
  };

  // ── 10. 후보 비교: 우선순위 ──────────────────────────────────────────────
  const preferCandidate = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    // 연속 2회 초과자 최소화 (연속출전 제한)
    if (a.consecutiveExceed !== b.consecutiveExceed)
      return a.consecutiveExceed < b.consecutiveExceed ? a : b;
    // 오래 쉰 선수 우선 (규칙 1-10)
    if (a.longRestScore !== b.longRestScore)
      return a.longRestScore > b.longRestScore ? a : b;
    if (a.restedPrevCount !== b.restedPrevCount)
      return a.restedPrevCount > b.restedPrevCount ? a : b;
    // 연속 출전 패널티 최소화
    if (a.consecutivePenalty !== b.consecutivePenalty)
      return a.consecutivePenalty < b.consecutivePenalty ? a : b;
    // 새 팀 조합 우선 (규칙 1-8, 1-9, 1-14)
    if (a.teamRepeatCount !== b.teamRepeatCount)
      return a.teamRepeatCount < b.teamRepeatCount ? a : b;
    // 새 상대 조합 우선 (규칙 1-15)
    if (a.matchupRepeatCount !== b.matchupRepeatCount)
      return a.matchupRepeatCount < b.matchupRepeatCount ? a : b;
    // 랭크 균형
    if (a.rankGap !== b.rankGap)
      return a.rankGap < b.rankGap ? a : b;
    if (a.playedSum !== b.playedSum)
      return a.playedSum < b.playedSum ? a : b;
    return a.lex <= b.lex ? a : b;
  };

  // ── 11. 타입별 후보 수집 ─────────────────────────────────────────────────
  const gatherCandidates = (type, pool, strictNewTeams, histCtx) => {
    if (type === 'X' && !allowMixed) return [];
    const CAP = Math.min(pool.length, 14);
    const candidates = [];

    // 규칙 4-2: 성별 불균형이면 성별 구분 없이 전체 풀에서 4명 조합
    if (isGenderImbalanced(pool)) {
      const bucket = pool.slice(0, CAP);
      if (bucket.length < 4) return [];
      // 불균형 시 history는 maleTeamSet/maleMatchSet 기준으로 통일
      const tSet = histCtx.maleTeamSet;
      for (let i = 0; i < bucket.length - 3; i++) {
        for (let j = i + 1; j < bucket.length - 2; j++) {
          for (let k = j + 1; k < bucket.length - 1; k++) {
            for (let l = k + 1; l < bucket.length; l++) {
              const g = [bucket[i].name, bucket[j].name, bucket[k].name, bucket[l].name];
              const pairings = [
                [[g[0], g[1]], [g[2], g[3]]],
                [[g[0], g[2]], [g[1], g[3]]],
                [[g[0], g[3]], [g[1], g[2]]],
              ];
              pairings.forEach(([home, away]) => {
                if (strictNewTeams) {
                  const hk = teamKey(home), ak = teamKey(away);
                  if (tSet.has(hk) || tSet.has(ak)) return;
                }
                // 불균형 시 allowGenderBattle 무시 (규칙 4-2: 동일 조건)
                const names = [...home, ...away];
                if (new Set(names).size !== 4) return;
                const hKey = teamKey(home), aKey = teamKey(away), gKey = matchKey(home, away);
                let longRestScore = 0, restedPrevCount = 0, consecutivePenalty = 0;
                let consecutiveExceed = 0, playedSum = 0;
                names.forEach(name => {
                  const st = getStat(name);
                  const rs = Number(st.restStreak) || 0;
                  longRestScore      += rs >= 2 ? rs * 2 : rs;
                  restedPrevCount    += st.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
                  consecutivePenalty += st.lastTurnPlayed === (turnNo - 1) ? 1 : 0;
                  consecutiveExceed  += (Number(st.consecutiveCount) || 0) >= 2 ? 1 : 0;
                  playedSum          += Number(st.played) || 0;
                });
                const avgRank = team => team.reduce((s, n) => s + getRank(n), 0) / team.length;
                const rankGap = Math.abs(avgRank(home) - avgRank(away));
                candidates.push({
                  type: 'M', home, away, names,
                  homeKey: hKey, awayKey: aKey, gameKey: gKey,
                  teamRepeatCount:    (tSet.has(hKey) ? 1 : 0) + (tSet.has(aKey) ? 1 : 0),
                  matchupRepeatCount: histCtx.maleMatchSet.has(gKey) ? 1 : 0,
                  longRestScore, restedPrevCount, consecutivePenalty,
                  consecutiveExceed, playedSum, rankGap,
                  lex: `${hKey}||${aKey}`,
                });
              });
            }
          }
        }
      }
      return candidates;
    }

    if (type === 'M' || type === 'F') {
      let bucket = pool
        .filter(p => (type === 'M' ? getGender(p.name) === 'M' : getGender(p.name) === 'F'))
        .slice(0, CAP);

      // 보충 선수 (규칙 1-6 / 1-7)
      if (bucket.length === 3) {
        const supp = findSupplement(type, pool, bucket.map(p => p.name));
        if (supp) bucket = [...bucket, supp];
      }
      if (bucket.length < 4) return [];

      const tSet = type === 'M' ? histCtx.maleTeamSet : histCtx.femaleTeamSet;

      for (let i = 0; i < bucket.length - 3; i++) {
        for (let j = i + 1; j < bucket.length - 2; j++) {
          for (let k = j + 1; k < bucket.length - 1; k++) {
            for (let l = k + 1; l < bucket.length; l++) {
              const g = [bucket[i].name, bucket[j].name, bucket[k].name, bucket[l].name];
              const pairings = [
                [[g[0], g[1]], [g[2], g[3]]],
                [[g[0], g[2]], [g[1], g[3]]],
                [[g[0], g[3]], [g[1], g[2]]],
              ];
              pairings.forEach(([home, away]) => {
                if (strictNewTeams) {
                  const hk = teamKey(home), ak = teamKey(away);
                  if (tSet.has(hk) || tSet.has(ak)) return;
                }
                const ev = buildEval(home, away, type, histCtx);
                if (ev) candidates.push(ev);
              });
            }
          }
        }
      }
      return candidates;
    }

    // 혼복 (X)
    const men   = pool.filter(p => getGender(p.name) === 'M').slice(0, CAP);
    const women = pool.filter(p => getGender(p.name) === 'F').slice(0, CAP);
    if (men.length < 2 || women.length < 2) return [];

    for (let mi = 0; mi < men.length - 1; mi++) {
      for (let mj = mi + 1; mj < men.length; mj++) {
        for (let fi = 0; fi < women.length - 1; fi++) {
          for (let fj = fi + 1; fj < women.length; fj++) {
            const m1 = men[mi].name, m2 = men[mj].name;
            const f1 = women[fi].name, f2 = women[fj].name;
            const pairings = [
              [[m1, f1], [m2, f2]],
              [[m1, f2], [m2, f1]],
            ];
            pairings.forEach(([home, away]) => {
              if (strictNewTeams) {
                const hk = teamKey(home), ak = teamKey(away);
                if (histCtx.mixedTeamSet.has(hk) || histCtx.mixedTeamSet.has(ak)) return;
              }
              const ev = buildEval(home, away, 'X', histCtx);
              if (ev) candidates.push(ev);
            });
          }
        }
      }
    }
    return candidates;
  };

  const chooseBest = (type, pool, strictNewTeams, varOffset, histCtx) => {
    const cands = gatherCandidates(type, pool, strictNewTeams, histCtx);
    if (!cands.length) return null;
    const ranked = [...cands].sort((x, y) => preferCandidate(x, y) === x ? -1 : 1);
    const selectable = Math.min(5, ranked.length);
    const idx = selectable ? (Math.max(0, varOffset) % selectable) : 0;
    return ranked[idx] || ranked[0];
  };

  // ── 12. 규칙 1-1~1-5: 시도 순서 ─────────────────────────────────────────
  // 남복 가능 → 우선 / 여복 가능 → 다음 / 둘 다 불가 → 혼복
  // 혼복 2연속 허용 후 리셋
  // 규칙 4-2: 성별 불균형이면 타입 구분 없이 'M' 하나로 통일 (gatherCandidates가 전체 풀 처리)
  const getTypeOrder = (preferred, curMixedStreak, pool) => {
    if (isGenderImbalanced(pool)) return pool.length >= 4 ? ['M'] : [];

    const canM = canMakeType('M', pool);
    const canF = canMakeType('F', pool);
    const canX = canMakeType('X', pool);
    const mixedOk = allowMixed && canX && curMixedStreak < 2;

    let order;
    if (preferred === 'F')      order = ['F', 'X', 'M'];
    else if (preferred === 'X') order = ['X', 'M', 'F'];
    else                        order = ['M', 'F', 'X'];

    return order.filter(t => {
      if (t === 'M' && !canM) return false;
      if (t === 'F' && !canF) return false;
      if (t === 'X' && !mixedOk) return false;
      return true;
    });
  };

  // ── 13. history 갱신 ─────────────────────────────────────────────────────
  // 불균형(규칙 4-2) 시 type이 'M'으로 통일되어 들어오므로 자연스럽게 maleTeamSet 사용
  const persistHistory = (pick, histCtx) => {
    if (!pick) return;
    if (pick.type === 'M') {
      histCtx.maleTeamSet.add(pick.homeKey);
      histCtx.maleTeamSet.add(pick.awayKey);
      histCtx.maleMatchSet.add(pick.gameKey);
    } else if (pick.type === 'F') {
      histCtx.femaleTeamSet.add(pick.homeKey);
      histCtx.femaleTeamSet.add(pick.awayKey);
      histCtx.femaleMatchSet.add(pick.gameKey);
    } else {
      histCtx.mixedTeamSet.add(pick.homeKey);
      histCtx.mixedTeamSet.add(pick.awayKey);
      histCtx.mixedMatchSet.add(pick.gameKey);
    }
  };

  // ── 14. nextMatchType 리듬 갱신 ──────────────────────────────────────────
  // M → F → X → M... (가능한 타입만)
  const updateRhythm = (createdType, rhythm) => {
    if (createdType === 'M') {
      rhythm.nextMatchType = 'F';
      rhythm.mixedStreak   = 0;
    } else if (createdType === 'F') {
      rhythm.nextMatchType = 'X';
      rhythm.mixedStreak   = 0;
    } else {
      // 혼복: 규칙 1-4/1-5 처리
      if (rhythm.mixedStreak <= 0) {
        rhythm.nextMatchType = 'X';
        rhythm.mixedStreak   = 1;
      } else {
        rhythm.nextMatchType = 'M';
        rhythm.mixedStreak   = 2;
      }
    }
  };

  // ── 15. reasonTags 생성 ──────────────────────────────────────────────────
  const buildReasonTags = (pick, isFirstMatchRanked) => {
    if (isFirstMatchRanked) return ['첫 대진 랭킹 기반'];
    const tags = [];
    if ((pick.longRestScore || 0) > 0 || (pick.restedPrevCount || 0) >= 2) tags.push('오래 쉰 선수 우선');
    if ((pick.teamRepeatCount || 0) === 0) tags.push('파트너 반복 회피');
    else if ((pick.matchupRepeatCount || 0) === 0)                         tags.push('상대 반복 회피');
    if ((pick.rankGap || 0) <= 2) tags.push('랭크 균형');
    if ((pick.consecutivePenalty || 0) <= 1) tags.push('연속 출전 제한');
    if (!tags.length) tags.push('공정 출전 균형');
    return tags.slice(0, 3);
  };

  // ── 16. 규칙 1-12/1-13: 첫 턴 첫 경기 — 랭킹 기반 대진 ──────────────────
  // 첫 선수(최고랭커) 성별로 matchType 결정
  // home = (1위, 4위), away = (2위, 3위)
  const buildFirstTurnFirstMatch = (pool, histCtx, rhythm) => {
    // 최고랭커 찾기
    const sorted = [...pool].sort((a, b) => getRank(a.name) - getRank(b.name));
    if (!sorted.length) return null;

    const topPlayer = sorted[0];
    const topGender = getGender(topPlayer.name);

    // 최고랭커 성별에 따라 첫 시합 유형 결정 (규칙 1-12)
    let firstType = topGender === 'F' ? 'F' : 'M';

    // 해당 타입이 아예 불가능한 경우 혼복으로 폴백
    if (!canMakeType(firstType, pool)) {
      if (allowMixed && canMakeType('X', pool)) firstType = 'X';
      else if (canMakeType(firstType === 'M' ? 'F' : 'M', pool))
        firstType = firstType === 'M' ? 'F' : 'M';
      else return null;
    }

    // 해당 타입 선수 풀 구성 (보충 포함)
    // 규칙 4-2: 불균형이면 성별 필터 없이 전체 풀 사용
    let bucket;
    if (isGenderImbalanced(pool)) {
      bucket = [...pool];
    } else if (firstType === 'M') {
      bucket = pool.filter(p => getGender(p.name) === 'M');
      if (bucket.length === 3) {
        const supp = findSupplement('M', pool, bucket.map(p => p.name));
        if (supp) bucket = [...bucket, supp];
      }
    } else if (firstType === 'F') {
      bucket = pool.filter(p => getGender(p.name) === 'F');
      if (bucket.length === 3) {
        const supp = findSupplement('F', pool, bucket.map(p => p.name));
        if (supp) bucket = [...bucket, supp];
      }
    } else {
      // 혼복
      const men   = pool.filter(p => getGender(p.name) === 'M');
      const women = pool.filter(p => getGender(p.name) === 'F');
      if (men.length < 2 || women.length < 2) return null;
      bucket = [...men, ...women];
    }
    if (bucket.length < 4) return null;

    // 랭킹 정렬 후 1,4 vs 2,3 구성 (규칙 1-12/1-13)
    let home, away;
    if (firstType === 'X') {
      const men   = bucket.filter(p => getGender(p.name) === 'M').sort((a, b) => getRank(a.name) - getRank(b.name));
      const women = bucket.filter(p => getGender(p.name) === 'F').sort((a, b) => getRank(a.name) - getRank(b.name));
      if (men.length < 2 || women.length < 2) return null;
      // 남1+여2(낮은랭킹) vs 남2+여1(높은랭킹) → 균형 구성
      home = [men[0].name, women[1] ? women[1].name : women[0].name];
      away = [men[1].name, women[0].name];
    } else {
      const bSorted = [...bucket].sort((a, b) => getRank(a.name) - getRank(b.name));
      if (bSorted.length < 4) return null;
      // 1위 파트너 = 지난주 최저랭커 (4위), 상대 = 2위 + 3위 (규칙 1-12/1-13)
      home = [bSorted[0].name, bSorted[3].name];
      away = [bSorted[1].name, bSorted[2].name];
    }

    const allNames = [...home, ...away];
    if (new Set(allNames).size !== 4) return null;
    if (roundEngineIsBlockedGenderBattleMatch(home, away, allowGenderBattle)) return null;

    const hKey = teamKey(home), aKey = teamKey(away), gKey = matchKey(home, away);
    return {
      type: firstType, home, away, names: allNames,
      homeKey: hKey, awayKey: aKey, gameKey: gKey,
      teamRepeatCount:    0,
      matchupRepeatCount: 0,
      isFirstRanked: true,
    };
  };

  // ── 17. 코트 수별 플랜 생성 ──────────────────────────────────────────────
  const planForCourts = (courtsToUse) => {
    const localHist = {
      maleTeamSet:    new Set(maleTeamSet),
      femaleTeamSet:  new Set(femaleTeamSet),
      mixedTeamSet:   new Set(mixedTeamSet),
      maleMatchSet:   new Set(maleMatchSet),
      femaleMatchSet: new Set(femaleMatchSet),
      mixedMatchSet:  new Set(mixedMatchSet),
    };
    const rhythm    = { nextMatchType, mixedStreak };
    const usedNames = new Set();
    const matches   = [];

    // 휴식 우선순위로 정렬된 풀
    const sortedPool = [...playersList].filter(p => p && p.name).sort(restPriority);

    const getPool = () => sortedPool.filter(p => !usedNames.has(p.name));

    for (let courtIdx = 0; courtIdx < courtsToUse; courtIdx++) {
      const pool = getPool();
      if (pool.length < 4) break;

      let picked        = null;
      let isFirstRanked = false;

      // 규칙 1-12/1-13: 첫 턴의 첫 경기에만 랭킹 기반 대진 적용
      if (isFirstTurn && courtIdx === 0) {
        picked        = buildFirstTurnFirstMatch(pool, localHist, rhythm);
        isFirstRanked = !!picked;
      }

      // 랭킹 기반 대진 실패 또는 일반 경기 → 규칙 1-1~1-5 기반 타입 결정
      if (!picked) {
        const typeOrder = getTypeOrder(rhythm.nextMatchType, rhythm.mixedStreak, pool);
        const fallback  = typeOrder.length
          ? typeOrder
          : (['M', 'F', 'X'].filter(t => canMakeType(t, pool)));

        // strict(새 조합만) 먼저 시도, 실패 시 반복 허용 (규칙 1-14/1-15)
        for (const strict of [true, false]) {
          for (const t of fallback) {
            picked = chooseBest(t, pool, strict, variantIndex + courtIdx, localHist);
            if (picked) break;
          }
          if (picked) break;
        }
      }

      if (!picked) break;
      if (roundEngineIsBlockedGenderBattleMatch(picked.home, picked.away, allowGenderBattle)) continue;

      matches.push({
        courtNo:    matches.length + 1,
        matchType:  picked.type,
        home:       picked.home,
        away:       picked.away,
        reasonTags: buildReasonTags(picked, isFirstRanked),
      });

      picked.names.forEach(n => usedNames.add(n));
      persistHistory(picked, localHist);
      updateRhythm(picked.type, rhythm);
    }

    return {
      matches,
      success:       matches.length === courtsToUse,
      history:       localHist,
      nextMatchType: rhythm.nextMatchType,
      mixedStreak:   rhythm.mixedStreak,
    };
  };

  // ── 18. 코트 수 줄여가며 최선의 플랜 선택 ────────────────────────────────
  let finalPlan = null;
  for (let courts = targetCourts; courts >= 1; courts--) {
    const plan = planForCourts(courts);
    if (!plan.matches.length) continue;
    finalPlan = plan;
    if (plan.success) break;
  }

  // ── 19. options 뮤테이트 (round_auto_view.js가 읽어감) ───────────────────
  if (finalPlan) {
    nextMatchType = finalPlan.nextMatchType;
    mixedStreak   = finalPlan.mixedStreak;

    // localHist → 글로벌 Set 동기화
    maleTeamSet.clear();    finalPlan.history.maleTeamSet.forEach(v => maleTeamSet.add(v));
    femaleTeamSet.clear();  finalPlan.history.femaleTeamSet.forEach(v => femaleTeamSet.add(v));
    mixedTeamSet.clear();   finalPlan.history.mixedTeamSet.forEach(v => mixedTeamSet.add(v));
    maleMatchSet.clear();   finalPlan.history.maleMatchSet.forEach(v => maleMatchSet.add(v));
    femaleMatchSet.clear(); finalPlan.history.femaleMatchSet.forEach(v => femaleMatchSet.add(v));
    mixedMatchSet.clear();  finalPlan.history.mixedMatchSet.forEach(v => mixedMatchSet.add(v));
  }

  options.nextMatchType = nextMatchType;
  options.mixedStreak   = Math.max(0, mixedStreak);
  options.phase         = nextMatchType === 'X' ? 'mixed' : 'same';
  options.mixedRemaining = 0;
  options.history = {
    sameMaleTeamKeys:    Array.from(maleTeamSet).slice(-200),
    sameFemaleTeamKeys:  Array.from(femaleTeamSet).slice(-200),
    mixedTeamKeys:       Array.from(mixedTeamSet).slice(-200),
    sameMaleMatchKeys:   Array.from(maleMatchSet).slice(-200),
    sameFemaleMatchKeys: Array.from(femaleMatchSet).slice(-200),
    mixedMatchKeys:      Array.from(mixedMatchSet).slice(-200),
  };

  return finalPlan ? finalPlan.matches : [];
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
