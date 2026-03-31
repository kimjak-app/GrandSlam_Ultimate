// ========================================
// ROUND_AUTO_LEVEL_ENGINE.JS
// ✅ v7.09: 최근 3턴 파트너 차등 페널티 + v7.08 누적 경기 수 균형 보호층
//
// 설계 원칙:
// - 기존 round_engine.js 코드 일절 수정 없음
// - 토글 ON일 때만 이 파일의 함수가 실행됨
// - 토글 OFF면 기존 roundEngineBuildAutoDoubleMatches() 그대로
//
// 버킷 우선순위: A → B → C
// 코트 역할: 1코트~(n-1)코트 = 강버킷(A+B), 마지막 코트 = 약버킷(C+B하위)
// 혼복: 잔여 인원 처리 방식 (레벨 제약 없이 중복 최소화만)
// 당일 게스트: B등급 취급
// 전원 같은 등급: 토글 ON이어도 기존 엔진으로 fallback
//
// v7.08 변경사항:
// - 누적 경기 수 균형 최우선 보호층 추가 (minPlayedBonus, playedGapPenalty)
// - preferCandidate 우선순위 재편: 경기 수 균형 → 기존 품질 순위
// - balanceMode: maxPlayed - minPlayed >= 2 이면 minPlayed 그룹 우선 선발
// - 코트 버킷 구성 시 과다 출전 선수(minPlayed+2 이상) 뒤로 밀기
// ========================================

// ── 헬퍼: 선수 등급 조회 ──────────────────────────────────────────────────
function levelEngineGetLevel(name, playersList) {
  // playersList에서 먼저 찾기
  const inPool = playersList.find(p => p.name === name);
  if (inPool) {
    // 당일 게스트(isOneTimeGuest)는 B 취급
    if (inPool.isOneTimeGuest) return 'B';
    const lv = (inPool.level || '').toUpperCase();
    if (lv === 'A' || lv === 'B' || lv === 'C') return lv;
    return 'B'; // 등급 없으면 B 취급
  }
  // 전역 players에서 찾기
  if (typeof players !== 'undefined') {
    const gp = (players || []).find(p => p.name === name);
    if (gp) {
      const lv = (gp.level || '').toUpperCase();
      if (lv === 'A' || lv === 'B' || lv === 'C') return lv;
    }
  }
  return 'B';
}

// ── 헬퍼: 성별 조회 ──────────────────────────────────────────────────────
function levelEngineGetGender(name, playersList) {
  const inPool = playersList.find(p => p.name === name);
  if (inPool) return inPool.gender === 'F' ? 'F' : 'M';
  if (typeof players !== 'undefined') {
    const gp = (players || []).find(p => p.name === name);
    if (gp) return gp.gender === 'F' ? 'F' : 'M';
  }
  return 'M';
}

// ── 헬퍼: 랭킹 조회 ──────────────────────────────────────────────────────
function levelEngineGetRank(name, playersList) {
  const src = playersList.find(p => p.name === name)
    || (typeof players !== 'undefined' ? (players || []).find(p => p.name === name) : null);
  if (!src) return Infinity;
  const v = Number(src.dRank ?? src.rank);
  return (Number.isFinite(v) && v > 0) ? v : Infinity;
}

// ── 헬퍼: 출전 통계 조회 ─────────────────────────────────────────────────
function levelEngineGetStat(name, statsRef, turnNo) {
  const st = (statsRef && statsRef[name]) || { played: 0, restStreak: 0, lastTurnPlayed: -9999, consecutiveCount: 0 };
  return st;
}

// ── 헬퍼: 전원 같은 등급 여부 판별 ──────────────────────────────────────
function levelEngineAllSameLevel(playersList) {
  const levels = playersList.map(p => levelEngineGetLevel(p.name, playersList));
  const uniqueLevels = new Set(levels);
  return uniqueLevels.size <= 1;
}

// ── 헬퍼: 팀키 / 매치키 생성 ─────────────────────────────────────────────
function levelEngineTeamKey(team) {
  return [...team].sort().join('|');
}
function levelEngineMatchKey(home, away) {
  return [levelEngineTeamKey(home), levelEngineTeamKey(away)].sort().join('||');
}

// ── 헬퍼: 버킷 분류 ──────────────────────────────────────────────────────
// 강버킷: A, B (B 중 랭킹 상위)
// 약버킷: C, B (B 중 랭킹 하위)
function levelEngineBuildBuckets(playersList, statsRef, turnNo) {
  const aPlayers = playersList.filter(p => levelEngineGetLevel(p.name, playersList) === 'A');
  const bPlayers = playersList.filter(p => levelEngineGetLevel(p.name, playersList) === 'B');
  const cPlayers = playersList.filter(p => levelEngineGetLevel(p.name, playersList) === 'C');

  // B를 랭킹 기준으로 상위/하위 분리
  const bSorted = [...bPlayers].sort((a, b) => levelEngineGetRank(a.name, playersList) - levelEngineGetRank(b.name, playersList));
  const bHalf = Math.ceil(bSorted.length / 2);
  const bUpper = bSorted.slice(0, bHalf);  // 상위 B → 강버킷
  const bLower = bSorted.slice(bHalf);     // 하위 B → 약버킷

  return {
    strong: [...aPlayers, ...bUpper],  // 강버킷: A + B상위
    weak:   [...cPlayers, ...bLower],  // 약버킷: C + B하위
    aPlayers, bPlayers, cPlayers, bUpper, bLower,
  };
}

// ── 헬퍼: 출전 균형 정렬 (쉰 사람 우선) ─────────────────────────────────
function levelEngineSortByRest(pool, statsRef, turnNo) {
  return [...pool].sort((a, b) => {
    const sa = levelEngineGetStat(a.name, statsRef, turnNo);
    const sb = levelEngineGetStat(b.name, statsRef, turnNo);
    const ra = Number(sa.restStreak) || 0, rb = Number(sb.restStreak) || 0;
    if (ra !== rb) return rb - ra;
    const aSkipped = sa.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    const bSkipped = sb.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    if (aSkipped !== bSkipped) return bSkipped - aSkipped;
    const ap = Number(sa.played) || 0, bp = Number(sb.played) || 0;
    if (ap !== bp) return ap - bp;
    return String(a.name).localeCompare(String(b.name));
  });
}

// ── 후보 평가: 팀/매치 중복 및 출전 균형 점수 ───────────────────────────
function levelEngineBuildEval(home, away, matchType, histSets, statsRef, turnNo, playersList, partnerHistory) {
  const names = [...home, ...away];
  if (new Set(names).size !== 4) return null;

  const hKey = levelEngineTeamKey(home);
  const aKey = levelEngineTeamKey(away);
  const gKey = levelEngineMatchKey(home, away);

  // ✅ v7.02: Set을 매번 생성하지 않고 histSets 직접 참조
  const teamRepeat =
    (histSets.sameMaleTeamSet.has(hKey) || histSets.sameFemaleTeamSet.has(hKey) || histSets.mixedTeamSet.has(hKey) ? 1 : 0) +
    (histSets.sameMaleTeamSet.has(aKey) || histSets.sameFemaleTeamSet.has(aKey) || histSets.mixedTeamSet.has(aKey) ? 1 : 0);
  const matchRepeat =
    histSets.sameMaleMatchSet.has(gKey) || histSets.sameFemaleMatchSet.has(gKey) || histSets.mixedMatchSet.has(gKey) ? 1 : 0;

  // ✅ v7.06: 팀 내 등급 다양성 가점 — AB vs AB 우선 (AA vs BB 억제)
  const teamDiversity = (team) => {
    const levels = team.map(n => levelEngineGetLevel(n, playersList));
    const hasA = levels.includes('A');
    const hasB = levels.includes('B');
    const hasC = levels.includes('C');
    if (hasA && (hasB || hasC)) return 1;
    if (!hasA && !hasB && hasC) return -1;
    return 0;
  };
  const mixBonus = teamDiversity(home) + teamDiversity(away);
  // ✅ v7.09: 최근 3턴 파트너 차등 페널티 (직전=3, 2턴전=2, 3턴전=1)
  let recentPartnerPenalty = 0;
  if (partnerHistory) {
    const partnerPenaltyScore = (a, b) => {
      const hist = partnerHistory[a] || [];
      const idx = hist.indexOf(b);
      if (idx === 0) return 3; // 직전 턴
      if (idx === 1) return 2; // 2턴 전
      if (idx === 2) return 1; // 3턴 전
      return 0;
    };
    recentPartnerPenalty += partnerPenaltyScore(home[0], home[1]);
    recentPartnerPenalty += partnerPenaltyScore(away[0], away[1]);
  }

  let longRestScore = 0, restedPrevCount = 0, consecutivePenalty = 0;
  let consecutiveExceed = 0, playedSum = 0;

  names.forEach(name => {
    const st = levelEngineGetStat(name, statsRef, turnNo);
    const rs = Number(st.restStreak) || 0;
    longRestScore      += rs >= 2 ? rs * 2 : rs;
    restedPrevCount    += st.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    consecutivePenalty += st.lastTurnPlayed === (turnNo - 1) ? 1 : 0;
    consecutiveExceed  += (Number(st.consecutiveCount) || 0) >= 2 ? 1 : 0;
    playedSum          += Number(st.played) || 0;
  });

  const avgRank = team => team.reduce((s, n) => s + levelEngineGetRank(n, playersList), 0) / team.length;
  const rankGap = Math.abs(avgRank(home) - avgRank(away));

  // ✅ v7.08: playedGapPenalty — 누적 경기 수 편차 보정
  // 전체 풀의 minPlayed 기준으로 편차가 클수록 강한 페널티
  const allPlayed = Object.values(statsRef).map(s => Number(s.played) || 0);
  const minPlayed = allPlayed.length > 0 ? Math.min(...allPlayed) : 0;
  let playedGapPenalty = 0;
  names.forEach(name => {
    const st = levelEngineGetStat(name, statsRef, turnNo);
    const gap = (Number(st.played) || 0) - minPlayed;
    if (gap >= 2) playedGapPenalty += gap * 2; // 편차 2 이상이면 강한 페널티
    else if (gap >= 1) playedGapPenalty += gap; // 편차 1은 약한 페널티
  });
  // minPlayed 선수 포함 여부 → 강한 우대 (음수 페널티 = 보너스)
  let minPlayedBonus = 0;
  names.forEach(name => {
    const st = levelEngineGetStat(name, statsRef, turnNo);
    if ((Number(st.played) || 0) === minPlayed) minPlayedBonus += 3;
  });

  return {
    matchType, home, away, names,
    homeKey: hKey, awayKey: aKey, gameKey: gKey,
    teamRepeatCount:       teamRepeat,
    matchupRepeatCount:    matchRepeat,
    recentPartnerPenalty,  // ✅ v7.05
    mixBonus,              // ✅ v7.06: AB vs AB 우선
    longRestScore, restedPrevCount, consecutivePenalty,
    consecutiveExceed, playedSum, rankGap,
    playedGapPenalty,      // ✅ v7.08: 누적 편차 페널티
    minPlayedBonus,        // ✅ v7.08: minPlayed 선수 우대 보너스
    lex: `${hKey}||${aKey}`,
  };
}

// ── 후보 비교 ────────────────────────────────────────────────────────────
function levelEnginePreferCandidate(a, b) {
  if (!a) return b;
  if (!b) return a;
  // ✅ v7.08: 누적 경기 수 균형 — 최우선 보호층
  // minPlayed 선수 포함 보너스: 많을수록 우선
  if ((a.minPlayedBonus || 0) !== (b.minPlayedBonus || 0))
    return (a.minPlayedBonus || 0) > (b.minPlayedBonus || 0) ? a : b;
  // playedGapPenalty: 작을수록 우선 (편차 큰 선수 억제)
  if ((a.playedGapPenalty || 0) !== (b.playedGapPenalty || 0))
    return (a.playedGapPenalty || 0) < (b.playedGapPenalty || 0) ? a : b;
  // ── 기존 우선순위 (경기 수 균형 보호층 아래) ──
  // ✅ v7.10: recentPartnerPenalty 2번째 레이어로 상향 — 경기 수 균형 직후 판정
  if ((a.recentPartnerPenalty || 0) !== (b.recentPartnerPenalty || 0))
    return (a.recentPartnerPenalty || 0) < (b.recentPartnerPenalty || 0) ? a : b;
  if (a.consecutiveExceed !== b.consecutiveExceed)
    return a.consecutiveExceed < b.consecutiveExceed ? a : b;
  if (a.longRestScore !== b.longRestScore)
    return a.longRestScore > b.longRestScore ? a : b;
  if (a.restedPrevCount !== b.restedPrevCount)
    return a.restedPrevCount > b.restedPrevCount ? a : b;
  if (a.consecutivePenalty !== b.consecutivePenalty)
    return a.consecutivePenalty < b.consecutivePenalty ? a : b;
  // ✅ v7.06: AB vs AB 팀 구성 우선 — 팀 내 강약 혼합 선호
  if ((a.mixBonus || 0) !== (b.mixBonus || 0))
    return (a.mixBonus || 0) > (b.mixBonus || 0) ? a : b;
  if (a.teamRepeatCount !== b.teamRepeatCount)
    return a.teamRepeatCount < b.teamRepeatCount ? a : b;
  if (a.matchupRepeatCount !== b.matchupRepeatCount)
    return a.matchupRepeatCount < b.matchupRepeatCount ? a : b;
  if (a.rankGap !== b.rankGap)
    return a.rankGap < b.rankGap ? a : b;
  if (a.playedSum !== b.playedSum)
    return a.playedSum < b.playedSum ? a : b;
  // ✅ v7.03: 약코트 여성 보정 — 최종 tiebreaker
  if ((a.weakBonus || 0) !== (b.weakBonus || 0))
    return (a.weakBonus || 0) > (b.weakBonus || 0) ? a : b;
  return a.lex <= b.lex ? a : b;
}

// ── 약코트 여성 포함 보정 점수 계산 ─────────────────────────────────────
// ✅ v7.03: A안 — 마지막 tiebreaker용 약한 가점 (기존 공정성 뼈대 절대 불변)
// candidate: buildEval 결과 객체
// context: { statsRef, turnNo, playersList, weakBucketNames }
function levelEngineBuildWeakCourtGenderBonus(candidate, context) {
  const { statsRef, turnNo, playersList, weakBucketNames } = context;
  const getG    = name => levelEngineGetGender(name, playersList);
  const getLv   = name => levelEngineGetLevel(name, playersList);
  const getStat = name => levelEngineGetStat(name, statsRef, turnNo);

  const names   = candidate.names || [...candidate.home, ...candidate.away];
  const females = names.filter(n => getG(n) === 'F');
  const isMenOnly = females.length === 0;

  // 약버킷에 여성이 아예 없으면 보정 무효
  const weakFemaleExists = (weakBucketNames || []).some(n => getG(n) === 'F');
  if (!weakFemaleExists) return 0;

  let bonus = 0;

  // 여성 포함 가점
  if (females.length >= 1) bonus += 1;
  if (females.length >= 2) bonus += 1;

  // 여C / 여B하위 가점
  females.forEach(n => {
    const lv = getLv(n);
    if (lv === 'C') bonus += 1;
    else if (lv === 'B' && (weakBucketNames || []).includes(n)) bonus += 1;
  });

  // 오래 쉰 여성 / 직전 턴 미참가 여성 가점
  females.forEach(n => {
    const st = getStat(n);
    if ((Number(st.restStreak) || 0) >= 2) bonus += 1;
    if (st.lastTurnPlayed !== (turnNo - 1)) bonus += 1;
  });

  // 남복 페널티 (여성 후보 있는데 남복만 구성)
  if (isMenOnly) bonus -= 1;

  if (DEBUG) {
    console.debug('[weak-court-bias]', {
      names,
      femaleCount: females.length,
      isMenOnly,
      bonus,
    });
  }

  return bonus;
}

// ── 코트 1개 분량 대진 생성 (성별 기반) ──────────────────────────────────
// bucket: 이 코트에 배정된 선수 풀
// matchType: 'M' | 'F' | 'X'
function levelEngineBuildOneCourtMatch(bucket, matchType, histSets, statsRef, turnNo, playersList, usedNames, variantIndex, isWeakCourt, weakBucketNames, partnerHistory) {
  const available = bucket.filter(p => !usedNames.has(p.name));
  if (available.length < 4) return null;

  const weakCtx = isWeakCourt
    ? { statsRef, turnNo, playersList, weakBucketNames: weakBucketNames || [] }
    : null;

  // 후보에 weakBonus 주입하는 헬퍼
  const withWeakBonus = (ev) => {
    if (!ev || !weakCtx) return ev;
    ev.weakBonus = levelEngineBuildWeakCourtGenderBonus(ev, weakCtx);
    return ev;
  };

  const getG = name => levelEngineGetGender(name, playersList);
  const candidates = [];

  if (matchType === 'M') {
    let men = available.filter(p => getG(p.name) === 'M');
    // 남자 3명이면 여자 최대 3명 후보에서 보충 (history 걸릴 경우 대안 확보)
    if (men.length === 3) {
      const women = available.filter(p => getG(p.name) === 'F' && !men.find(m => m.name === p.name));
      if (women.length) {
        const suppCandidates = [...women]
          .sort((a, b) => levelEngineGetRank(b.name, playersList) - levelEngineGetRank(a.name, playersList))
          .slice(0, 3); // 최대 3명 후보
        men = [...men, ...suppCandidates];
      }
    }
    if (men.length < 4) return null;
    const pool = men.slice(0, Math.min(men.length, 10));
    for (let i = 0; i < pool.length - 3; i++)
      for (let j = i+1; j < pool.length - 2; j++)
        for (let k = j+1; k < pool.length - 1; k++)
          for (let l = k+1; l < pool.length; l++) {
            const g = [pool[i].name, pool[j].name, pool[k].name, pool[l].name];
            [[g[0],g[1]],[g[0],g[2]],[g[0],g[3]]].forEach((homeP, pi) => {
              const awayP = g.filter(n => !homeP.includes(n));
              const ev = levelEngineBuildEval(homeP, awayP, 'M', histSets, statsRef, turnNo, playersList, partnerHistory);
              if (ev) candidates.push(withWeakBonus(ev));
            });
          }
  } else if (matchType === 'F') {
    let women = available.filter(p => getG(p.name) === 'F');
    if (women.length === 3) {
      const men = available.filter(p => getG(p.name) === 'M' && !women.find(w => w.name === p.name));
      if (men.length) {
        const suppCandidates = [...men]
          .sort((a, b) => levelEngineGetRank(b.name, playersList) - levelEngineGetRank(a.name, playersList))
          .slice(0, 3); // 최대 3명 후보
        women = [...women, ...suppCandidates];
      }
    }
    if (women.length < 4) return null;
    const pool = women.slice(0, Math.min(women.length, 10));
    for (let i = 0; i < pool.length - 3; i++)
      for (let j = i+1; j < pool.length - 2; j++)
        for (let k = j+1; k < pool.length - 1; k++)
          for (let l = k+1; l < pool.length; l++) {
            const g = [pool[i].name, pool[j].name, pool[k].name, pool[l].name];
            [[g[0],g[1]],[g[0],g[2]],[g[0],g[3]]].forEach((homeP) => {
              const awayP = g.filter(n => !homeP.includes(n));
              const ev = levelEngineBuildEval(homeP, awayP, 'F', histSets, statsRef, turnNo, playersList, partnerHistory);
              if (ev) candidates.push(withWeakBonus(ev));
            });
          }
  } else {
    // 혼복: 잔여 인원 처리 — 레벨 제약 없이 중복 최소화만
    const men   = available.filter(p => getG(p.name) === 'M').slice(0, 8);
    const women = available.filter(p => getG(p.name) === 'F').slice(0, 8);
    if (men.length < 2 || women.length < 2) return null;
    for (let mi = 0; mi < men.length - 1; mi++)
      for (let mj = mi+1; mj < men.length; mj++)
        for (let fi = 0; fi < women.length - 1; fi++)
          for (let fj = fi+1; fj < women.length; fj++) {
            const m1 = men[mi].name, m2 = men[mj].name;
            const f1 = women[fi].name, f2 = women[fj].name;
            [[m1,f1],[m1,f2]].forEach((homeP) => {
              const awayP = [m1,m2,f1,f2].filter(n => !homeP.includes(n));
              const ev = levelEngineBuildEval(homeP, awayP, 'X', histSets, statsRef, turnNo, playersList, partnerHistory);
              if (ev) candidates.push(withWeakBonus(ev));
            });
          }
  }

  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => levelEnginePreferCandidate(a, b) === a ? -1 : 1);
  const selectable = Math.min(5, ranked.length);
  const idx = selectable ? (Math.max(0, variantIndex) % selectable) : 0;
  return ranked[idx] || ranked[0];
}

// ── history Set에 직접 추가 (최근성 갱신: delete → add로 순서 최신화) ──
function levelEnginePersistHistory(pick, histSets) {
  if (!pick) return;
  const type = pick.matchType;
  // ✅ v7.04: delete → add 패턴으로 최근성 갱신 (중복 제거 + 최신 순서 유지)
  const refresh = (set, key) => { set.delete(key); set.add(key); };
  if (type === 'M') {
    refresh(histSets.sameMaleTeamSet, pick.homeKey);
    refresh(histSets.sameMaleTeamSet, pick.awayKey);
    refresh(histSets.sameMaleMatchSet, pick.gameKey);
  } else if (type === 'F') {
    refresh(histSets.sameFemaleTeamSet, pick.homeKey);
    refresh(histSets.sameFemaleTeamSet, pick.awayKey);
    refresh(histSets.sameFemaleMatchSet, pick.gameKey);
  } else {
    refresh(histSets.mixedTeamSet, pick.homeKey);
    refresh(histSets.mixedTeamSet, pick.awayKey);
    refresh(histSets.mixedMatchSet, pick.gameKey);
  }
}

// ── 성별 타입 결정: 해당 풀에서 가능한 타입 선택 ────────────────────────
// 남복 우선 → 여복 → 혼복 순 (A급 혼복 최소화 원칙)
function levelEngineChooseMatchType(bucket, usedNames, allowMixed) {
  const available = bucket.filter(p => !usedNames.has(p.name));
  const getG = name => levelEngineGetGender(name, bucket);
  const men   = available.filter(p => getG(p.name) === 'M');
  const women = available.filter(p => getG(p.name) === 'F');

  const canMale   = men.length >= 3;   // 남3+보충1 or 남4 이상
  const canFemale = women.length >= 3; // 여3+보충1 or 여4 이상
  const canMixed  = allowMixed && men.length >= 2 && women.length >= 2;

  // 남복 우선
  if (canMale && men.length >= 4) return 'M';
  if (canFemale && women.length >= 4) return 'F';
  if (canMale) return 'M';
  if (canFemale) return 'F';
  if (canMixed) return 'X';
  return null;
}

// ── 혼복 타입 결정: 잔여 인원 처리용 ────────────────────────────────────
function levelEngineChooseMixedType(remaining, allowMixed) {
  // ✅ v7.0 수정④: remaining 객체의 gender를 먼저 참조 (당일 게스트 성별 오판 방지)
  const getG = p => {
    if (p && p.gender) return p.gender === 'F' ? 'F' : 'M';
    if (typeof players !== 'undefined') {
      const found = (players || []).find(pl => pl.name === (p.name || p));
      if (found) return found.gender === 'F' ? 'F' : 'M';
    }
    return 'M';
  };
  const men   = remaining.filter(p => getG(p) === 'M');
  const women = remaining.filter(p => getG(p) === 'F');
  if (men.length >= 4) return 'M';
  if (women.length >= 4) return 'F';
  if (allowMixed && men.length >= 2 && women.length >= 2) return 'X';
  return null;
}

// ── 메인 함수: 등급별 대진 생성 ──────────────────────────────────────────
/**
 * levelEngineBuildLevelMatches
 * @param {Array}  playersList  선수 목록 { name, gender, level, isOneTimeGuest, rank, dRank }
 * @param {number} courtCount   코트 수
 * @param {object} options      history, statsRef, turnNo, variantIndex, allowMixed
 * @returns {Array} [{ courtNo, matchType, home, away, reasonTags }]
 */
function levelEngineBuildLevelMatches(playersList, courtCount, options = {}) {
  const allowMixed      = options.allowMixed !== false;
  const statsRef        = options.statsRef || {};
  const turnNo          = Number(options.turnNo) || 0;
  const variantIndex    = Math.max(0, Number(options.variantIndex) || 0);
  const targetCourts    = Math.max(0, Number(courtCount) || 0);
  // ✅ v7.05: partnerHistory 참조 — 직전 파트너 반복 회피에 사용
  const partnerHistory  = options.partnerHistory || {};

  // ✅ v7.02: deep copy 제거 — Set 기반으로 교체 (성능 최적화)
  // 기존 배열을 Set으로 한 번만 읽고, 새 항목은 Set에 직접 추가
  const srcH = options.history || {};
  const histSets = {
    sameMaleTeamSet:    new Set(srcH.sameMaleTeamKeys    || []),
    sameFemaleTeamSet:  new Set(srcH.sameFemaleTeamKeys  || []),
    mixedTeamSet:       new Set(srcH.mixedTeamKeys       || []),
    sameMaleMatchSet:   new Set(srcH.sameMaleMatchKeys   || []),
    sameFemaleMatchSet: new Set(srcH.sameFemaleMatchKeys || []),
    mixedMatchSet:      new Set(srcH.mixedMatchKeys      || []),
  };

  if (!Array.isArray(playersList) || playersList.length < 4 || targetCourts <= 0) return [];

  // 전원 같은 등급이면 기존 엔진 fallback (이 함수를 호출한 곳에서 처리)
  if (levelEngineAllSameLevel(playersList)) return null;

  // 버킷 분류
  const buckets = levelEngineBuildBuckets(playersList, statsRef, turnNo);

  // 출전 균형 기준으로 각 버킷 정렬
  const strongSorted = levelEngineSortByRest(buckets.strong, statsRef, turnNo);
  const weakSorted   = levelEngineSortByRest(buckets.weak,   statsRef, turnNo);
  const allSorted    = levelEngineSortByRest(playersList,    statsRef, turnNo);

  // ✅ v7.08: 균형 보호층 — minPlayed 그룹 계산
  const allPlayed = playersList.map(p => Number((statsRef[p.name] || {}).played) || 0);
  const minPlayed = Math.min(...allPlayed);
  const maxPlayed = Math.max(...allPlayed);
  const playedGap = maxPlayed - minPlayed;
  // 편차 2 이상이면 균형 보호모드 ON
  const balanceMode = playedGap >= 2;
  // minPlayed 그룹: 최소 경기 수 선수들
  const minPlayedGroup = new Set(
    playersList
      .filter(p => (Number((statsRef[p.name] || {}).played) || 0) <= minPlayed + (balanceMode ? 0 : 1))
      .map(p => p.name)
  );

  // ✅ v7.06: 여자 선수 풀 분리 (코트 복수일 때 마지막 코트 선점용)
  const getG   = name => levelEngineGetGender(name, playersList);
  const getLv  = name => levelEngineGetLevel(name, playersList);
  const femaleSorted = levelEngineSortByRest(
    playersList.filter(p => getG(p.name) === 'F'), statsRef, turnNo
  );
  const maleSorted = levelEngineSortByRest(
    playersList.filter(p => getG(p.name) === 'M'), statsRef, turnNo
  );

  const usedNames = new Set();
  const matches   = [];

  // ✅ v7.06: 코트 역할 결정
  // 코트 1개: 기존 리듬 유지 (female_pref 없음)
  // 코트 2개 이상: 마지막 코트 = female_pref (여자 선점)
  const femaleCourtIdx = targetCourts >= 2 ? targetCourts - 1 : -1;
  const femaleCount = femaleSorted.length;

  // ✅ v7.07: 여복 조합 소진 감지 — teamSet + matchSet 둘 다 확인
  const hasFreshFemaleCandidate = (fPool) => {
    const names = fPool.map(p => p.name);
    if (names.length < 4) return false;
    for (let i = 0; i < names.length - 1; i++)
      for (let j = i + 1; j < names.length; j++) {
        const tKey = levelEngineTeamKey([names[i], names[j]]);
        if (!histSets.sameFemaleTeamSet.has(tKey)) return true; // 새 팀 조합 있음
      }
    // 팀 조합은 소진됐지만 매치 조합 여부도 확인
    for (let i = 0; i < names.length - 3; i++)
      for (let j = i+1; j < names.length - 2; j++)
        for (let k = j+1; k < names.length - 1; k++)
          for (let l = k+1; l < names.length; l++) {
            const g = [names[i], names[j], names[k], names[l]];
            const pairings = [
              [[g[0],g[1]],[g[2],g[3]]],
              [[g[0],g[2]],[g[1],g[3]]],
              [[g[0],g[3]],[g[1],g[2]]],
            ];
            for (const [h, a] of pairings) {
              const mKey = levelEngineMatchKey(h, a);
              if (!histSets.sameFemaleMatchSet.has(mKey)) return true;
            }
          }
    return false; // 완전 소진
  };

  // ✅ v7.07: 여자 최하위 1명 제외 (여자 5명 이상 + 코트 복수)
  // 최하위 판별: 등급(C→B→A) 우선, 같은 등급이면 dRank 큰 숫자
  // 직전 턴 대기자 재제외 방지: 같은 등급군 안에서 restStreak 많은 쪽 보호
  const femaleReserved = new Set();
  const maleCount = maleSorted.length;
  const isFemaleGTE = femaleCount >= maleCount; // 여자 수 ≥ 남자 수 예외

  if (femaleCourtIdx >= 0 && femaleCount >= 3 && !isFemaleGTE) {
    // 여복 조합 소진됐으면 여복 코트 고정 해제
    const femalePool = femaleSorted.slice(0, Math.min(femaleCount, 5));
    const freshExists = hasFreshFemaleCandidate(femalePool);

    if (freshExists) {
      if (femaleCount >= 5) {
        // 최하위 1명 제외: 등급 낮을수록, dRank 높을수록, restStreak 적을수록 제외 우선
        const levelOrder = { 'C': 0, 'B': 1, 'A': 2 };
        const sorted = [...femaleSorted].sort((a, b) => {
          const la = levelOrder[getLv(a.name)] ?? 1;
          const lb = levelOrder[getLv(b.name)] ?? 1;
          if (la !== lb) return la - lb; // 등급 낮은 쪽 먼저
          const ra = levelEngineGetRank(a.name, playersList);
          const rb = levelEngineGetRank(b.name, playersList);
          if (ra !== rb) return rb - ra; // dRank 큰 쪽(약한 쪽) 먼저
          // 직전 대기자 보호: restStreak 많은 쪽은 제외 우선순위 낮춤
          const sa = levelEngineGetStat(a.name, statsRef, turnNo);
          const sb = levelEngineGetStat(b.name, statsRef, turnNo);
          return (Number(sa.restStreak) || 0) - (Number(sb.restStreak) || 0);
        });
        const excluded = sorted[0]; // 최하위 1명 대기
        const fPool = femaleSorted.filter(p => p.name !== excluded.name).slice(0, 4);
        fPool.forEach(p => femaleReserved.add(p.name));
      } else {
        // 여자 3~4명: 전원 예약
        femaleSorted.slice(0, 4).forEach(p => femaleReserved.add(p.name));
      }

      // 여자 3명이면 남C 우선 보충, 없으면 남B하위
      if (femaleCount === 3) {
        const cMales = maleSorted.filter(p => getLv(p.name) === 'C');
        const bLowerMales = maleSorted.filter(p =>
          getLv(p.name) === 'B' && buckets.bLower.find(b => b.name === p.name)
        );
        const supp = cMales[0] || bLowerMales[bLowerMales.length - 1];
        if (supp) femaleReserved.add(supp.name);
      }
    }
    // freshExists === false → 여복 조합 소진 → 여복 코트 고정 해제 (femaleReserved 비어있음)
  } else if (femaleCourtIdx >= 0 && femaleCount >= 3 && isFemaleGTE) {
    // 여자 수 ≥ 남자 수: 고정 해제, 자유 배치
  }

  // ✅ v7.06: 코트 배정 순서 — 마지막 코트(여복) 먼저 처리 후 나머지 코트 순서대로
  const courtOrder = femaleCourtIdx >= 0
    ? [femaleCourtIdx, ...Array.from({ length: targetCourts - 1 }, (_, i) => i)]
    : Array.from({ length: targetCourts }, (_, i) => i);

  for (const courtIdx of courtOrder) {
    const isFemaleCourt = courtIdx === femaleCourtIdx && femaleCourtIdx >= 0;
    const isWeakCourt   = isFemaleCourt; // 약코트 보정도 유지

    // 코트 버킷 결정
    let courtBucket;
    if (isFemaleCourt) {
      // 여복 코트: 예약된 여자 선수들 + 보충 남자
      const reserved = allSorted.filter(p => femaleReserved.has(p.name) && !usedNames.has(p.name));
      if (reserved.length < 4) {
        // 예약 선수 부족 → 전체에서 여자 우선 보충
        const extra = allSorted.filter(p =>
          !usedNames.has(p.name) && !reserved.find(r => r.name === p.name)
        );
        courtBucket = [...reserved, ...extra];
      } else {
        courtBucket = reserved;
      }
    } else {
      // 남자 코트: 여복 예약 선수 제외한 강버킷 우선
      let available = strongSorted.filter(p =>
        !usedNames.has(p.name) && !femaleReserved.has(p.name)
      );
      // ✅ v7.08: balanceMode에서 과다 출전 선수(minPlayed+2 이상) 뒤로 밀기
      if (balanceMode) {
        const priority = available.filter(p => minPlayedGroup.has(p.name));
        const others   = available.filter(p => !minPlayedGroup.has(p.name));
        available = [...priority, ...others];
      }
      if (available.length >= 4) {
        courtBucket = available;
      } else {
        let extra = allSorted.filter(p =>
          !usedNames.has(p.name) &&
          !femaleReserved.has(p.name) &&
          !available.find(a => a.name === p.name)
        );
        if (balanceMode) {
          const ep = extra.filter(p => minPlayedGroup.has(p.name));
          const eo = extra.filter(p => !minPlayedGroup.has(p.name));
          extra = [...ep, ...eo];
        }
        courtBucket = [...available, ...extra];
      }
    }

    if (courtBucket.filter(p => !usedNames.has(p.name)).length < 4) continue;

    // 성별 타입 결정
    let matchType;
    if (isFemaleCourt) {
      // ✅ v7.07: 여복 코트 F→X fallback
      matchType = 'F';
      const fAvail = courtBucket.filter(p => !usedNames.has(p.name));
      const fWomen = fAvail.filter(p => getG(p.name) === 'F');
      if (fWomen.length < 3) {
        // 여자 부족 → 혼복으로 fallback
        const fMen = fAvail.filter(p => getG(p.name) === 'M');
        matchType = (fWomen.length >= 2 && fMen.length >= 2) ? 'X' : null;
      }
    } else {
      matchType = levelEngineChooseMatchType(courtBucket, usedNames, allowMixed);
    }
    if (!matchType) {
      matchType = levelEngineChooseMixedType(courtBucket.filter(p => !usedNames.has(p.name)), allowMixed);
    }
    if (!matchType) continue;

    // 대진 생성
    const pick = levelEngineBuildOneCourtMatch(
      courtBucket, matchType, histSets, statsRef, turnNo, playersList, usedNames,
      variantIndex + courtIdx,
      isWeakCourt,
      isWeakCourt ? buckets.weak.map(p => p.name) : [],
      partnerHistory
    );
    if (!pick) continue;

    matches.push({
      courtNo:    courtIdx + 1,
      matchType:  pick.matchType,
      home:       pick.home,
      away:       pick.away,
      reasonTags: [
        '등급별 대진 우선',
        pick.teamRepeatCount === 0 ? '파트너 반복 회피' : '공정 출전 균형',
        ...(isFemaleCourt ? ['여복 코트 선점'] : []),
        ...(isWeakCourt && (pick.weakBonus || 0) > 0 ? ['약코트 여성 균형'] : []),
      ],
    });

    pick.names.forEach(n => usedNames.add(n));
    levelEnginePersistHistory(pick, histSets);
  }

  // 코트 번호 순서대로 정렬
  matches.sort((a, b) => a.courtNo - b.courtNo);

  // ✅ v7.02: Set → 배열로 변환해서 options.history 동기화 (최대 200개 유지)
  if (options.history !== undefined) {
    const toArr = (set) => Array.from(set).slice(-200);
    options.history.sameMaleTeamKeys    = toArr(histSets.sameMaleTeamSet);
    options.history.sameFemaleTeamKeys  = toArr(histSets.sameFemaleTeamSet);
    options.history.mixedTeamKeys       = toArr(histSets.mixedTeamSet);
    options.history.sameMaleMatchKeys   = toArr(histSets.sameMaleMatchSet);
    options.history.sameFemaleMatchKeys = toArr(histSets.sameFemaleMatchSet);
    options.history.mixedMatchKeys      = toArr(histSets.mixedMatchSet);
  }

  return matches.length > 0 ? matches : null;
}

window.levelEngineBuildLevelMatches = levelEngineBuildLevelMatches;
window.levelEngineAllSameLevel      = levelEngineAllSameLevel;
