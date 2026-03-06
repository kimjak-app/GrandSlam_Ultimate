// ========================================
// ROUND_AUTO_VIEW.JS - 라운드 자동생성 뷰
// ========================================

const DEBUG = false;

function roundAutoStorageKey(clubId) {
  return `grandslam_round_auto_v1_${clubId || 'default'}`;
}

function createRoundAutoInitialState() {
  return {
    mode: 'double',
    eventType: 'double',
    courtCount: 2,
    selectedPlayers: [],
    turns: [],
    history: { partners: {}, opponents: {}, playedCount: {} },
    turnNo: 0,
    config: {
      levelFilter: ['A', 'B', 'C'],
      gender: 'all',
      allowMixed: true,
      allowGenderBattle: false,
      previewTurns: 1,
    },
    sessionStats: {},
    partnerHistory: {},
    nextMatchType: 'M',
    mixedStreak: 0,
    matchupHistory: {},
    oneTimeGuests: [],
    miniTournament: { matches: [], round: 0, matchupHistory: {} },
    modalRankedParticipants: [],
  };
}

let roundAutoState = createRoundAutoInitialState();
let roundAutoLoadedClubId = null;

function roundAutoGetSelectedClubId() {
  return typeof selectedClubId !== 'undefined' ? selectedClubId : null;
}

function roundAutoEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function roundAutoPlayerLabel(name, level) {
  const normalizedLevel = typeof level === 'string' ? level : '';
  if (typeof displayNameWithLevel === 'function') return displayNameWithLevel(name, normalizedLevel);
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

function roundAutoGetTurns({ includePreview = false } = {}) {
  const turns = Array.isArray(roundAutoState.turns) ? roundAutoState.turns : [];
  return includePreview ? turns : turns.filter(turn => turn?.status !== 'preview');
}

function roundAutoNormalizeTurnsState(inputState = roundAutoState) {
  const state = inputState && typeof inputState === 'object'
    ? inputState
    : createRoundAutoInitialState();
  const turns = Array.isArray(state.turns) ? [...state.turns] : [];
  const reasons = [];

  let previewTurn = null;
  const realTurns = [];
  turns.forEach(turn => {
    if (!turn) return;
    if (turn.status === 'preview') {
      if (!previewTurn || (Number(turn.turnNo) || 0) >= (Number(previewTurn.turnNo) || 0)) {
        if (previewTurn) reasons.push('removed extra preview');
        previewTurn = turn;
      } else {
        reasons.push('removed extra preview');
      }
      return;
    }
    realTurns.push(turn);
  });

  realTurns.sort((a, b) => (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0));
  const latestRealTurn = realTurns.length ? realTurns[realTurns.length - 1] : null;

  let hasStatusFix = false;
  realTurns.forEach(turn => {
    const targetStatus = latestRealTurn && turn === latestRealTurn ? 'active' : 'done';
    if (turn.status !== targetStatus) {
      hasStatusFix = true;
      turn.status = targetStatus;
    }
  });
  if (hasStatusFix) reasons.push('fixed active/done ordering');

  const normalizedTurns = previewTurn ? [...realTurns, previewTurn] : realTurns;
  const prevTurnNo = Number(state.turnNo) || 0;
  const nextTurnNo = latestRealTurn ? (Number(latestRealTurn.turnNo) || 0) : prevTurnNo;
  if (nextTurnNo !== prevTurnNo) reasons.push('synced turnNo with active turn');

  const didChange = reasons.length > 0
    || normalizedTurns.length !== turns.length
    || normalizedTurns.some((turn, idx) => turn !== turns[idx]);

  return {
    state: {
      ...state,
      turns: normalizedTurns,
      turnNo: nextTurnNo,
    },
    didChange,
    reasons,
  };
}

function roundAutoFlattenMatches({ includePreview = false } = {}) {
  return roundAutoGetTurns({ includePreview }).flatMap(turn => Array.isArray(turn.matches) ? turn.matches : []);
}

function roundAutoGetEventType() {
  return roundAutoNormalizeEventType(roundAutoState.eventType);
}

function roundAutoAllowGenderBattle() {
  return roundAutoState?.config?.allowGenderBattle === true;
}

function roundAutoCanScheduleGenderMatch(homeTeam, awayTeam) {
  return !roundEngineIsBlockedGenderBattleMatch(homeTeam, awayTeam, roundAutoAllowGenderBattle());
}

function roundAutoIsSingles() {
  return roundAutoGetEventType() === 'single';
}

function roundAutoNormalizeEventType(type) {
  if (type === 'single' || type === 'double') return type;
  if (type === 'singles') return 'single';
  if (type === 'doubles') return 'double';
  return 'double';
}

function roundAutoWarnInvalidEventType(context, value) {
  if (!DEBUG) return;
  if (value !== 'single' && value !== 'double') {
    console.warn(`[round-auto] invalid eventType at ${context}:`, value);
  }
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
  const levelFilter = Array.isArray(cfg.levelFilter)
    ? cfg.levelFilter
    : (Array.isArray(cfg.levels) ? cfg.levels : ['A', 'B', 'C']);
  return roundAutoGetClubPlayers().filter(p => {
    const levelOk = levelFilter.includes((p.level || 'A'));
    const genderOk = cfg.gender === 'all' || p.gender === cfg.gender;
    return levelOk && genderOk;
  });
}

function roundAutoGetFilteredGuests() {
  const cfg = roundAutoState.config || {};
  const levelFilter = Array.isArray(cfg.levelFilter)
    ? cfg.levelFilter
    : (Array.isArray(cfg.levels) ? cfg.levels : ['A', 'B', 'C']);
  const guests = Array.isArray(roundAutoState.oneTimeGuests) ? roundAutoState.oneTimeGuests : [];
  return guests.filter(g => {
    const guestLevel = g.level || 'A';
    const guestGender = g.gender || 'U';
    const levelOk = levelFilter.includes(guestLevel);
    const genderOk = cfg.gender === 'all' || guestGender === cfg.gender;
    return levelOk && genderOk;
  });
}

function loadRoundAutoState() {
  try {
    const clubId = roundAutoGetSelectedClubId();
    const storageKey = roundAutoStorageKey(clubId);
    const initial = createRoundAutoInitialState();
    roundAutoLoadedClubId = clubId;

    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      roundAutoState = initial;
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      roundAutoState = initial;
      return;
    }

    const storedEventType = roundAutoNormalizeEventType(parsed.eventType || parsed.mode);

    roundAutoState = {
      ...initial,
      ...parsed,
      eventType: storedEventType,
      mode: storedEventType,
      courtCount: Math.max(1, Number(parsed.courtCount) || initial.courtCount),
      selectedPlayers: Array.isArray(parsed.selectedPlayers) ? parsed.selectedPlayers : [],
      turns: Array.isArray(parsed.turns) ? parsed.turns : [],
      history: parsed.history && typeof parsed.history === 'object' ? parsed.history : initial.history,
      turnNo: Number(parsed.turnNo) || 0,
      config: { ...initial.config, ...(parsed.config || {}) },
      sessionStats: parsed.sessionStats && typeof parsed.sessionStats === 'object' ? parsed.sessionStats : {},
      partnerHistory: parsed.partnerHistory && typeof parsed.partnerHistory === 'object' ? parsed.partnerHistory : {},
      nextMatchType: (parsed.nextMatchType === 'M' || parsed.nextMatchType === 'F' || parsed.nextMatchType === 'X')
        ? parsed.nextMatchType
        : (parsed.cyclePhase === 'mixed' ? 'X' : initial.nextMatchType),
      mixedStreak: Math.max(0, Number(parsed.mixedStreak) || 0),
      matchupHistory: parsed.matchupHistory && typeof parsed.matchupHistory === 'object' ? parsed.matchupHistory : {},
      oneTimeGuests: Array.isArray(parsed.oneTimeGuests) ? parsed.oneTimeGuests : [],
    };

    if (!Array.isArray(roundAutoState.config.levelFilter)) {
      roundAutoState.config.levelFilter = Array.isArray(roundAutoState.config.levels)
        ? roundAutoState.config.levels
        : ['A', 'B', 'C'];
    }
    if (typeof roundAutoState.config.allowGenderBattle !== 'boolean') {
      roundAutoState.config.allowGenderBattle = false;
    }
    roundAutoState.config.previewTurns = 1;

    let shouldSave = false;

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
      shouldSave = true;
    }

    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    if (normalized.didChange) {
      shouldSave = true;
      if (DEBUG) console.debug('[round-auto] normalize on load:', normalized.reasons.join(', '));
    }

    if (shouldSave) saveRoundAutoState();
  } catch (e) {
    console.warn('[round-auto] state load failed:', e);
    roundAutoState = createRoundAutoInitialState();
  }
}

function saveRoundAutoState() {
  try {
    const clubId = roundAutoGetSelectedClubId();
    localStorage.setItem(roundAutoStorageKey(clubId), JSON.stringify(roundAutoState));
  } catch (e) {
    console.warn('[round-auto] state save failed:', e);
  }
}

function roundAutoBuildTurn(turnNo, status) {
  const simulatedStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
  return roundAutoBuildTurnWithStats(turnNo, status, simulatedStats, false);
}

function roundAutoGetSelectedEligiblePool() {
  const clubMap = new Map(roundAutoGetFilteredClubPlayers().map(p => [p.name, {
    id: p.name,
    name: p.name,
    level: p.level || 'A',
    gender: p.gender || 'U',
    isGuest: false,
  }]));
  const guestMap = new Map(roundAutoGetFilteredGuests().map(g => [g.name, {
    id: g.id || g.name,
    name: g.name,
    level: g.level || 'A',
    gender: g.gender || 'U',
    isGuest: true,
  }]));
  return (roundAutoState.selectedPlayers || [])
    .map(name => clubMap.get(name) || guestMap.get(name))
    .filter(Boolean);
}

function roundAutoEnsureSessionStats(playerName, statsRef) {
  if (!statsRef[playerName]) {
    statsRef[playerName] = { played: 0, rested: 0, lastTurnPlayed: null, restStreak: 0 };
  }
  return statsRef[playerName];
}

function roundAutoApplyTurnParticipation(activePlayers, eligiblePool, turnNo, statsRef) {
  const activeNames = new Set(activePlayers.map(p => p.name));
  activePlayers.forEach(p => {
    const stat = roundAutoEnsureSessionStats(p.name, statsRef);
    stat.played += 1;
    stat.lastTurnPlayed = turnNo;
    stat.restStreak = 0;
  });
  eligiblePool.forEach(p => {
    if (activeNames.has(p.name)) return;
    const stat = roundAutoEnsureSessionStats(p.name, statsRef);
    stat.rested += 1;
    stat.restStreak += 1;
  });
}

function roundAutoBuildHistoryMaps() {
  const partnerMap = new Map();
  const opponentMap = new Map();
  const add = (map, a, b) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    map.set(key, (map.get(key) || 0) + 1);
  };

  roundAutoGetTurns({ includePreview: false }).forEach(turn => {
    (turn.matches || []).forEach(match => {
      const home = Array.isArray(match.home) ? match.home : [match.home];
      const away = Array.isArray(match.away) ? match.away : [match.away];
      if (home.length !== 2 || away.length !== 2) return;
      add(partnerMap, home[0], home[1]);
      add(partnerMap, away[0], away[1]);
      home.forEach(h => away.forEach(a => add(opponentMap, h, a)));
    });
  });

  return { partnerMap, opponentMap };
}

function roundAutoChooseFairSingleCourtSetup(eligiblePool, turnNo, statsRef) {
  if (eligiblePool.length < 4) return null;

  const minPlayed = Math.min(...eligiblePool.map(p => roundAutoEnsureSessionStats(p.name, statsRef).played));
  const { partnerMap, opponentMap } = roundAutoBuildHistoryMaps();
  const combos = [];

  for (let i = 0; i < eligiblePool.length - 3; i += 1) {
    for (let j = i + 1; j < eligiblePool.length - 2; j += 1) {
      for (let k = j + 1; k < eligiblePool.length - 1; k += 1) {
        for (let l = k + 1; l < eligiblePool.length; l += 1) {
          combos.push([eligiblePool[i], eligiblePool[j], eligiblePool[k], eligiblePool[l]]);
        }
      }
    }
  }

  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const scoreCombo = (combo) => {
    const playedVals = combo.map(p => roundAutoEnsureSessionStats(p.name, statsRef).played);
    const atMinCount = playedVals.filter(v => v === minPlayed).length;
    const spread = Math.max(...playedVals) - Math.min(...playedVals);
    const restedLastTurn = combo.filter(p => {
      const st = roundAutoEnsureSessionStats(p.name, statsRef);
      return st.lastTurnPlayed !== (turnNo - 1);
    }).length;

    const [a, b, c, d] = combo;
    const pairings = [
      { home: [a, b], away: [c, d] },
      { home: [a, c], away: [b, d] },
      { home: [a, d], away: [b, c] },
    ];

    let bestPairing = null;
    pairings.forEach(p => {
      const homeNames = p.home.map(x => x.name);
      const awayNames = p.away.map(x => x.name);
      if (!roundAutoCanScheduleGenderMatch(homeNames, awayNames)) return;

      const partnerRepeat = (partnerMap.get(pairKey(p.home[0].name, p.home[1].name)) || 0)
        + (partnerMap.get(pairKey(p.away[0].name, p.away[1].name)) || 0);
      const opponentRepeat = p.home.reduce((sum, hp) => (
        sum + p.away.reduce((s2, ap) => s2 + (opponentMap.get(pairKey(hp.name, ap.name)) || 0), 0)
      ), 0);
      const current = { partnerRepeat, opponentRepeat };
      if (!bestPairing
        || current.partnerRepeat < bestPairing.partnerRepeat
        || (current.partnerRepeat === bestPairing.partnerRepeat && current.opponentRepeat < bestPairing.opponentRepeat)) {
        bestPairing = { ...current, pairing: p };
      }
    });

    return bestPairing ? { combo, atMinCount, spread, restedLastTurn, bestPairing } : null;
  };

  const scored = combos.map(scoreCombo).filter(Boolean);
  scored.sort((x, y) => {
    if (y.atMinCount !== x.atMinCount) return y.atMinCount - x.atMinCount;
    if (x.spread !== y.spread) return x.spread - y.spread;
    if (x.bestPairing.partnerRepeat !== y.bestPairing.partnerRepeat) return x.bestPairing.partnerRepeat - y.bestPairing.partnerRepeat;
    if (x.bestPairing.opponentRepeat !== y.bestPairing.opponentRepeat) return x.bestPairing.opponentRepeat - y.bestPairing.opponentRepeat;
    if (y.restedLastTurn !== x.restedLastTurn) return y.restedLastTurn - x.restedLastTurn;
    return Math.random() - 0.5;
  });

  const chosen = scored[0];
  if (!chosen) return null;

  return {
    activePlayers: chosen.combo,
    pairing: chosen.bestPairing.pairing,
  };
}

function roundAutoOpponentRepeatCount(aName, bName) {
  let count = 0;
  roundAutoGetTurns({ includePreview: false }).forEach(turn => {
    (turn.matches || []).forEach(match => {
      const home = Array.isArray(match.home) ? match.home : [match.home];
      const away = Array.isArray(match.away) ? match.away : [match.away];
      const aOppB = (home.includes(aName) && away.includes(bName)) || (home.includes(bName) && away.includes(aName));
      if (aOppB) count += 1;
    });
  });
  return count;
}

function roundAutoGenerateSinglesTurn(eligiblePool, courtCount, turnNo, statsRef) {
  const requiredPlayers = courtCount * 2;
  if (eligiblePool.length < requiredPlayers) return null;

  const minPlayed = Math.min(...eligiblePool.map(p => roundAutoEnsureSessionStats(p.name, statsRef).played));
  const combos = [];

  const choose = (start, picked) => {
    if (picked.length === requiredPlayers) {
      combos.push([...picked]);
      return;
    }
    for (let i = start; i < eligiblePool.length; i += 1) {
      picked.push(eligiblePool[i]);
      choose(i + 1, picked);
      picked.pop();
    }
  };
  choose(0, []);

  const buildBestSinglesPairing = (playersList) => {
    let best = null;

    const dfs = (remaining, acc, penalty) => {
      if (!remaining.length) {
        if (!best || penalty < best.penalty) best = { penalty, matches: [...acc] };
        return;
      }
      const first = remaining[0];
      for (let i = 1; i < remaining.length; i += 1) {
        const second = remaining[i];
        if (!roundAutoCanScheduleGenderMatch(first.name, second.name)) continue;
        const pairPenalty = roundAutoOpponentRepeatCount(first.name, second.name);
        const nextPenalty = penalty + pairPenalty;
        if (best && nextPenalty > best.penalty) continue;

        acc.push({ home: [first.name], away: [second.name] });
        const nextRemaining = remaining.filter((_, idx) => idx !== 0 && idx !== i);
        dfs(nextRemaining, acc, nextPenalty);
        acc.pop();
      }
    };

    dfs(playersList, [], 0);
    return best;
  };

  const scored = combos.map(combo => {
    const playedVals = combo.map(p => roundAutoEnsureSessionStats(p.name, statsRef).played);
    const atMinCount = playedVals.filter(v => v === minPlayed).length;
    const spread = Math.max(...playedVals) - Math.min(...playedVals);
    const bestPairing = buildBestSinglesPairing(combo);
    const restedLastTurn = combo.filter(p => roundAutoEnsureSessionStats(p.name, statsRef).lastTurnPlayed !== (turnNo - 1)).length;

    return {
      combo,
      matches: bestPairing ? bestPairing.matches : [],
      atMinCount,
      spread,
      opponentRepeatPenalty: bestPairing ? bestPairing.penalty : Number.POSITIVE_INFINITY,
      restedLastTurn,
    };
  });

  scored.sort((a, b) => {
    if (b.atMinCount !== a.atMinCount) return b.atMinCount - a.atMinCount;
    if (a.spread !== b.spread) return a.spread - b.spread;
    if (a.opponentRepeatPenalty !== b.opponentRepeatPenalty) return a.opponentRepeatPenalty - b.opponentRepeatPenalty;
    if (b.restedLastTurn !== a.restedLastTurn) return b.restedLastTurn - a.restedLastTurn;
    return Math.random() - 0.5;
  });

  const best = scored[0];
  if (!best) return null;

  roundAutoApplyTurnParticipation(best.combo, eligiblePool, turnNo, statsRef);

  return best.matches.map((m, idx) => ({
    id: `ra-${turnNo}-${idx + 1}`,
    turnNo,
    courtNo: idx + 1,
    home: m.home,
    away: m.away,
    winner: null,
  }));
}

function roundAutoBuildTurnWithStats(turnNo, status, statsRef, mutateRealStats) {
  const isSingles = roundAutoIsSingles();
  const requiredPlayers = roundAutoState.courtCount * (isSingles ? 2 : 4);
  const eligiblePool = roundAutoGetSelectedEligiblePool();

  if (eligiblePool.length < requiredPlayers) {
    alert('참가자 수가 부족합니다. 코트 수를 줄이거나 참가자를 더 선택해주세요.');
    return null;
  }

  let matches = [];

  if (isSingles) {
    matches = roundAutoGenerateSinglesTurn(eligiblePool, roundAutoState.courtCount, turnNo, statsRef) || [];
    if (!matches.length) return null;
  } else {
    const cycleOptions = {
      allowMixed: roundAutoState.config.allowMixed,
      allowGenderBattle: roundAutoAllowGenderBattle(),
      nextMatchType: (roundAutoState.nextMatchType === 'M' || roundAutoState.nextMatchType === 'F' || roundAutoState.nextMatchType === 'X')
        ? roundAutoState.nextMatchType
        : 'M',
      mixedStreak: Number(roundAutoState.mixedStreak) || 0,
      history: roundAutoState.matchupHistory || {},
      femaleCount: eligiblePool.filter(p => p?.gender === 'F').length,
      statsRef,
      turnNo,
    };
    const planned = roundEngineBuildAutoDoubleMatches(eligiblePool, roundAutoState.courtCount, cycleOptions);
    matches = planned.map((m, idx) => ({
      id: `ra-${turnNo}-${idx + 1}`,
      turnNo,
      courtNo: m.courtNo || (idx + 1),
      home: [m.home[0], m.home[1]],
      away: [m.away[0], m.away[1]],
      winner: null,
    }));
    if (mutateRealStats) {
      roundAutoState.nextMatchType = (cycleOptions.nextMatchType === 'M' || cycleOptions.nextMatchType === 'F' || cycleOptions.nextMatchType === 'X')
        ? cycleOptions.nextMatchType
        : 'M';
      roundAutoState.mixedStreak = Math.max(0, Number(cycleOptions.mixedStreak) || 0);
      roundAutoState.matchupHistory = cycleOptions.history && typeof cycleOptions.history === 'object'
        ? cycleOptions.history
        : {};
    }

    if (matches.length) {
      const activeNames = new Set();
      matches.forEach(m => {
        (Array.isArray(m.home) ? m.home : [m.home]).forEach(n => activeNames.add(n));
        (Array.isArray(m.away) ? m.away : [m.away]).forEach(n => activeNames.add(n));
      });
      const activePlayers = eligiblePool.filter(p => activeNames.has(p.name));
      roundAutoApplyTurnParticipation(activePlayers, eligiblePool, turnNo, statsRef);
    }
  }

  if (!matches.length) {
    alert('현재 옵션으로 생성 가능한 대진이 없습니다. 선수/팀 구성을 조정하거나 [남 vs 여 매치 허용]을 켜주세요.');
    return null;
  }

  if (mutateRealStats) {
    roundAutoState.sessionStats = statsRef;
    if (!isSingles) {
      matches.forEach(m => {
        const [a, b] = m.home;
        const [c, d] = m.away;
        roundAutoState.partnerHistory[a] = [b, ...(roundAutoState.partnerHistory[a] || []).filter(x => x !== b)].slice(0, 4);
        roundAutoState.partnerHistory[b] = [a, ...(roundAutoState.partnerHistory[b] || []).filter(x => x !== a)].slice(0, 4);
        roundAutoState.partnerHistory[c] = [d, ...(roundAutoState.partnerHistory[c] || []).filter(x => x !== d)].slice(0, 4);
        roundAutoState.partnerHistory[d] = [c, ...(roundAutoState.partnerHistory[d] || []).filter(x => x !== c)].slice(0, 4);
      });
    }
  }

  return { turnNo, matches, status };
}

function roundAutoRenderFilterUI() {
  const levelsWrap = document.getElementById('round-auto-level-filters');
  const genderBtns = document.querySelectorAll('#round-auto-gender-filters button[data-gender]');
  const mixedBtn = document.getElementById('round-auto-mixed-toggle');
  const eventBtns = document.querySelectorAll('#round-auto-event-type-toggle button[data-event-type]');
  if (!levelsWrap) return;

  levelsWrap.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.checked = (roundAutoState.config.levelFilter || []).includes(chk.value);
    chk.onchange = () => {
      const selected = Array.from(levelsWrap.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
      roundAutoState.config.levelFilter = selected.length ? selected : ['A', 'B', 'C'];
      saveRoundAutoState();
      initRoundAutoPlayerPool();
    };
  });

  genderBtns.forEach(btn => {
    const active = (roundAutoState.config.gender || 'all') === btn.dataset.gender;
    btn.style.background = active ? 'var(--wimbledon-sage)' : '#f3f4f6';
    btn.style.color = active ? '#fff' : '#333';
    btn.onclick = () => {
      roundAutoState.config.gender = btn.dataset.gender;
      saveRoundAutoState();
      initRoundAutoPlayerPool();
    };
  });

  eventBtns.forEach(btn => {
    const buttonType = roundAutoNormalizeEventType(btn.dataset.eventType);
    const active = roundAutoGetEventType() === buttonType;
    btn.style.background = active ? 'var(--wimbledon-sage)' : '#f3f4f6';
    btn.style.color = active ? '#fff' : '#333';
    btn.onclick = () => {
      const eventType = roundAutoNormalizeEventType(btn.dataset.eventType);
      roundAutoWarnInvalidEventType('event button click', btn.dataset.eventType);
      roundAutoState.eventType = eventType;
      roundAutoState.mode = eventType;
      saveRoundAutoState();
      roundAutoRenderFilterUI();
      roundAutoRenderMatches();
      roundAutoRenderRanking();
      roundAutoRenderPersonalRanking();
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

  if (mixedBtn) {
    let wrap = document.getElementById('round-auto-gender-battle-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'round-auto-gender-battle-wrap';
      wrap.innerHTML = `
        <label for="round-auto-allow-gender-battle" style="display:flex; align-items:center; gap:8px; font-size:13px; color:#333; font-weight:600; cursor:pointer;">
          <input id="round-auto-allow-gender-battle" type="checkbox" />
          남 vs 여 매치 허용
        </label>
        <div style="font-size:12px; color:#666; margin-top:4px;">(남자팀 vs 여자팀 경기 가능)</div>
      `;
      mixedBtn.parentNode.insertAdjacentElement('afterend', wrap);
    }
    wrap.style.cssText = 'margin-top:16px; margin-bottom:16px; padding:10px 12px; border:1px solid #E5E5EA; border-radius:12px; background:#FAFAFA;';

    const chk = document.getElementById('round-auto-allow-gender-battle');
    if (chk) {
      chk.checked = roundAutoAllowGenderBattle();
      chk.onchange = () => {
        roundAutoState.config.allowGenderBattle = !!chk.checked;
        saveRoundAutoState();
      };
    }
  }
}
function roundAutoOpenAddGuestModal() {
  gsEditName('', ({ name, gender }) => {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      alert('이름을 입력해줘');
      return;
    }

    const clubNames = roundAutoGetClubPlayers().map(p => p.name);
    if (clubNames.includes(cleanName)) {
      alert('기존 회원과 이름이 같아. 다른 이름으로 해줘');
      return;
    }

    const guestNames = (roundAutoState.oneTimeGuests || []).map(g => g.name);
    if (guestNames.includes(cleanName)) {
      alert('이미 추가된 게스트야');
      return;
    }

    const guestId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    roundAutoState.oneTimeGuests.push({
      id: guestId,
      name: cleanName,
      gender: gender || 'M',
      level: 'A',
      isGuest: true,
      source: 'guest',
      createdAt: Date.now(),
    });

    if (!roundAutoState.selectedPlayers.includes(cleanName)) {
      roundAutoState.selectedPlayers.push(cleanName);
    }

    saveRoundAutoState();
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
  const currentClubId = roundAutoGetSelectedClubId();
  if (roundAutoLoadedClubId !== currentClubId) {
    roundAutoState = createRoundAutoInitialState();
  }
  loadRoundAutoState();

  const courtInput = document.getElementById('round-auto-court-count');
  const courtTabs = document.querySelectorAll('#round-auto-court-tabs .court-tab-btn');
  const currentCount = roundAutoState.courtCount || 2;

  const applyCourtCount = (value, fromTab) => {
    roundAutoState.courtCount = value;
    saveRoundAutoState();
    // 탭 하이라이트 갱신
    courtTabs.forEach(btn => {
      const isActive = Number(btn.dataset.court) === value;
      btn.style.background = isActive ? 'var(--wimbledon-sage)' : '#f3f4f6';
      btn.style.color = isActive ? '#fff' : '#333';
    });
    // 직접입력 칸 — 탭에 없는 숫자면 표시, 탭 선택이면 비움
    if (courtInput) courtInput.value = fromTab ? '' : String(value);
  };

  // 초기 상태 반영
  applyCourtCount(currentCount, [1,2,3,4,5].includes(currentCount));

  courtTabs.forEach(btn => {
    btn.onclick = () => applyCourtCount(Number(btn.dataset.court), true);
  });

  if (courtInput) {
    courtInput.onchange = () => {
      const value = Math.max(1, Number(courtInput.value) || 1);
      applyCourtCount(value, false);
    };
  }

  roundAutoRenderFilterUI();

  const filteredClubPlayers = roundAutoGetFilteredClubPlayers();
  const filteredGuests = roundAutoGetFilteredGuests();
  const availableNames = [...filteredClubPlayers.map(p => p.name), ...filteredGuests.map(g => g.name)];
  const filteredSelectedPlayers = roundAutoState.selectedPlayers.filter(name => availableNames.includes(name));
  const selectionChanged = filteredSelectedPlayers.length !== roundAutoState.selectedPlayers.length;
  if (selectionChanged) roundAutoState.selectedPlayers = filteredSelectedPlayers;

  const playerPool = document.getElementById('round-auto-player-pool');
  if (!playerPool) return;

  if (availableNames.length === 0) {
    playerPool.innerHTML = '<div style="font-size:12px; color:#999;">조건에 맞는 참가자가 없습니다.</div>';
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    if (selectionChanged) saveRoundAutoState();
    return;
  }

  playerPool.innerHTML = `
    <div class="player-pool">
      ${filteredClubPlayers.map((player, idx) => {
    const id = `round-auto-player-${idx}`;
    const labelText = `${roundAutoGenderIcon(player)}${roundAutoPlayerLabel(player.name, player.level)}`;
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
        rankText: `${player.rank}`,
      });
    }
    return '';
  }).join('')}
    </div>
    <div id="round-auto-guests-wrap" style="margin-top:12px; border-top:1px dashed #ddd; padding-top:10px;">
      <div style="font-size:13px; font-weight:700; color:#666; margin-bottom:8px;">당일 게스트</div>
      <div class="player-pool" id="round-auto-guest-pool">
        ${filteredGuests.length ? filteredGuests.map((guest, idx) => {
    const id = `round-auto-guest-${idx}`;
    const checked = roundAutoState.selectedPlayers.includes(guest.name);
    return createPlayerOption({
      inputType: 'checkbox', nameAttr: 'round-auto-player', id, value: guest.name,
      checked, onClick: '', labelText: `${roundAutoGenderIcon(guest)}[당일] ${roundAutoPlayerLabel(guest.name, guest.level)}`,
      isGuest: true, showRank: false, rankText: ''
    });
  }).join('') : '<div style="font-size:12px; color:#999; white-space:nowrap;">당일 게스트가 없습니다.</div>'}
      </div>
    </div>
  `;

  playerPool.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.onchange = () => {
      const selected = Array.from(playerPool.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
      roundAutoState.selectedPlayers = selected;
      saveRoundAutoState();
    };
  });

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  if (selectionChanged) saveRoundAutoState();
}
function roundAutoDisplayParticipant(participant) {
  const names = Array.isArray(participant) ? participant : [participant];
  return roundAutoIsSingles()
    ? roundAutoPlayerLabel(names[0], findPlayerLevel(names[0]))
    : `${roundAutoPlayerLabel(names[0], findPlayerLevel(names[0]))} & ${roundAutoPlayerLabel(names[1], findPlayerLevel(names[1]))}`;
}

function roundAutoTeamKey(playersList) {
  return [...playersList].sort().join('|');
}

function roundAutoComputeSessionStandings() {
  const isDouble = !roundAutoIsSingles();
  const map = {};

  const ensure = (key, playersList) => {
    if (!map[key]) map[key] = { key, players: [...playersList], wins: 0, losses: 0, matches: 0 };
    return map[key];
  };

  roundAutoFlattenMatches({ includePreview: false }).forEach(match => {
    if (!match || (match.winner !== 'home' && match.winner !== 'away')) return;
    const homePlayers = Array.isArray(match.home) ? match.home : [match.home];
    const awayPlayers = Array.isArray(match.away) ? match.away : [match.away];
    const homeKey = isDouble ? roundAutoTeamKey(homePlayers) : homePlayers[0];
    const awayKey = isDouble ? roundAutoTeamKey(awayPlayers) : awayPlayers[0];

    const home = ensure(homeKey, homePlayers);
    const away = ensure(awayKey, awayPlayers);
    home.matches += 1;
    away.matches += 1;

    if (match.winner === 'home') {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  });

  return Object.values(map)
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || (b.matches - a.matches) || a.key.localeCompare(b.key));
}

function roundAutoParticipantToPlayers(participant) {
  const playersList = Array.isArray(participant) ? participant : [participant];
  return playersList.filter(Boolean);
}

function roundAutoPlayerStableKey(playerRef) {
  if (playerRef && typeof playerRef === 'object') {
    if (playerRef.id !== undefined && playerRef.id !== null && String(playerRef.id).trim()) {
      return `id:${String(playerRef.id).trim()}`;
    }
    if (playerRef.name && String(playerRef.name).trim()) {
      return `name:${String(playerRef.name).trim()}`;
    }
    return '';
  }
  const name = String(playerRef || '').trim();
  if (!name) return '';
  const found = Array.isArray(players) ? players.find(p => p && p.name === name) : null;
  if (found && found.id !== undefined && found.id !== null && String(found.id).trim()) {
    return `id:${String(found.id).trim()}`;
  }
  return `name:${name}`;
}

function roundAutoParticipantKeyNormalized(participant) {
  const keys = roundAutoParticipantToPlayers(participant)
    .map(roundAutoPlayerStableKey)
    .filter(Boolean)
    .sort();
  return keys.join('|');
}

function roundAutoParticipantsSharePlayer(a, b) {
  const aKeys = new Set(
    roundAutoParticipantToPlayers(a).map(roundAutoPlayerStableKey).filter(Boolean),
  );
  const bKeys = roundAutoParticipantToPlayers(b).map(roundAutoPlayerStableKey).filter(Boolean);
  return bKeys.some(key => aKeys.has(key));
}

function roundAutoMiniMatchupKey(home, away) {
  const homeKey = roundAutoParticipantKeyNormalized(home);
  const awayKey = roundAutoParticipantKeyNormalized(away);
  if (!homeKey || !awayKey) return '';
  return [homeKey, awayKey].sort().join('::');
}

function roundAutoValidateMiniMatch(home, away, usedPlayerKeysSet) {
  const homeKeys = roundAutoParticipantToPlayers(home).map(roundAutoPlayerStableKey).filter(Boolean);
  const awayKeys = roundAutoParticipantToPlayers(away).map(roundAutoPlayerStableKey).filter(Boolean);
  if (!homeKeys.length || !awayKeys.length) return false;

  const homeUnique = new Set(homeKeys);
  const awayUnique = new Set(awayKeys);
  if (homeUnique.size !== homeKeys.length) return false;
  if (awayUnique.size !== awayKeys.length) return false;
  for (const key of awayUnique) {
    if (homeUnique.has(key)) return false;
  }

  if (usedPlayerKeysSet && usedPlayerKeysSet.size) {
    for (const key of homeUnique) {
      if (usedPlayerKeysSet.has(key)) return false;
    }
    for (const key of awayUnique) {
      if (usedPlayerKeysSet.has(key)) return false;
    }
  }
  return true;
}

function roundAutoBuildMiniRoundMatches(rankedParticipants, matchupHistoryMap) {
  const list = Array.isArray(rankedParticipants) ? rankedParticipants : [];
  if (!list.length) return [];

  const deduped = [];
  const seenTeamKeys = new Set();
  list.forEach(participant => {
    const teamKey = roundAutoParticipantKeyNormalized(participant);
    if (!teamKey || seenTeamKeys.has(teamKey)) return;
    seenTeamKeys.add(teamKey);
    deduped.push(participant);
  });

  const usedPlayerKeys = new Set();
  const lockedIndex = new Set();
  const pairs = [];
  const history = matchupHistoryMap && typeof matchupHistoryMap === 'object' ? matchupHistoryMap : {};

  for (let i = 0; i < deduped.length; i += 1) {
    if (lockedIndex.has(i)) continue;
    const home = deduped[i];
    if (!roundAutoParticipantKeyNormalized(home)) continue;

    let best = null;
    for (let j = i + 1; j < deduped.length; j += 1) {
      if (lockedIndex.has(j)) continue;
      const away = deduped[j];
      if (!roundAutoParticipantKeyNormalized(away)) continue;
      if (roundAutoParticipantsSharePlayer(home, away)) continue;
      if (!roundAutoValidateMiniMatch(home, away, usedPlayerKeys)) continue;

      const matchupKey = roundAutoMiniMatchupKey(home, away);
      const seenCount = Number(history[matchupKey] || 0);
      const candidate = { i, j, home, away, seenCount };
      if (!best) {
        best = candidate;
        continue;
      }
      if (candidate.j < best.j) {
        best = candidate;
        continue;
      }
      if (candidate.j === best.j && candidate.seenCount < best.seenCount) {
        best = candidate;
      }
    }

    if (!best) continue;
    if (!roundAutoValidateMiniMatch(best.home, best.away, usedPlayerKeys)) continue;
    pairs.push({ home: best.home, away: best.away });
    lockedIndex.add(best.i);
    lockedIndex.add(best.j);
    roundAutoParticipantToPlayers(best.home).forEach(playerRef => {
      const key = roundAutoPlayerStableKey(playerRef);
      if (key) usedPlayerKeys.add(key);
    });
    roundAutoParticipantToPlayers(best.away).forEach(playerRef => {
      const key = roundAutoPlayerStableKey(playerRef);
      if (key) usedPlayerKeys.add(key);
    });
  }

  return pairs;
}

function roundAutoCloseMiniTournamentModal() {
  const modal = document.getElementById('round-auto-tournament-modal');
  if (modal) modal.classList.remove('active');
}

function roundAutoToggleModalParticipant(idx) {
  const checkbox = document.getElementById(`round-auto-modal-p-${idx}`);
  if (!checkbox) return;
  const item = checkbox.closest('.modal-participant-item');
  if (!item) return;
  checkbox.checked = !checkbox.checked;
  item.classList.toggle('selected', checkbox.checked);
  roundAutoUpdateModalCount();
}

function roundAutoUpdateModalCount() {
  const count = document.querySelectorAll('#round-auto-modal-participant-list .modal-checkbox:checked').length;
  const countSpan = document.getElementById('round-auto-modal-selected-count');
  if (countSpan) countSpan.textContent = count;
}

function roundAutoOpenMiniTournamentModal() {
  const rows = roundAutoComputeSessionStandings();
  if (!rows.length) {
    gsAlert('오늘 성적 데이터가 없습니다. 먼저 승자를 선택해 주세요.');
    return;
  }

  const list = document.getElementById('round-auto-modal-participant-list');
  const modal = document.getElementById('round-auto-tournament-modal');
  if (!list || !modal) {
    gsAlert('모달 UI를 찾을 수 없습니다.');
    return;
  }

  roundAutoState.modalRankedParticipants = rows.map(row => row.players);
  const recommended = roundAutoLargestPowerOfTwo(rows.length);

  list.innerHTML = rows.map((row, idx) => {
    const checked = idx < recommended ? 'checked' : '';
    const selected = idx < recommended ? 'selected' : '';
    return `
      <div class="modal-participant-item ${selected}" onclick="roundAutoToggleModalParticipant(${idx})">
        <input type="checkbox" class="modal-checkbox" id="round-auto-modal-p-${idx}" ${checked} onclick="event.stopPropagation(); roundAutoToggleModalParticipant(${idx})">
        <span class="modal-rank">${idx + 1}위</span>
        <span>${roundAutoEscape(roundAutoDisplayParticipant(row.players))}</span>
      </div>`;
  }).join('');

  roundAutoUpdateModalCount();
  modal.classList.add('active');
}

function roundAutoStartMiniTournamentFromModal() {
  const checkboxes = document.querySelectorAll('#round-auto-modal-participant-list .modal-checkbox:checked');
  if (checkboxes.length < 2) {
    gsAlert('최소 2명/팀을 선택해야 합니다.');
    return;
  }

  const selectedIndices = Array.from(checkboxes)
    .map(cb => Number(cb.id.replace('round-auto-modal-p-', '')))
    .sort((a, b) => a - b);

  const ranked = Array.isArray(roundAutoState.modalRankedParticipants) ? roundAutoState.modalRankedParticipants : [];
  const selectedParticipants = selectedIndices.map(i => ranked[i]).filter(Boolean);
  roundAutoCloseMiniTournamentModal();
  roundAutoStartMiniTournament(selectedParticipants);
}

function roundAutoStartMiniTournament(rankedParticipants) {
  if (!rankedParticipants || rankedParticipants.length === 0) {
    gsAlert('토너먼트를 시작할 수 없습니다. 참가자 데이터가 없습니다.');
    return;
  }

  const matchupHistory = {};
  const pairs = roundAutoBuildMiniRoundMatches(rankedParticipants, matchupHistory);
  if (!pairs.length) {
    gsAlert('토너먼트 1라운드에 유효한 대진을 만들 수 없습니다.');
    return;
  }

  const miniMatches = [];
  pairs.forEach((pair, idx) => {
    miniMatches.push({
      id: `RA-T-R1-M${idx + 1}`,
      round: 1,
      home: pair.home,
      away: pair.away,
      winner: null,
    });
    const key = roundAutoMiniMatchupKey(pair.home, pair.away);
    if (key) matchupHistory[key] = Number(matchupHistory[key] || 0) + 1;
  });

  roundAutoState.miniTournament = { matches: miniMatches, round: 1, matchupHistory };
  roundAutoRenderMatches();
  saveRoundAutoState();
}

function roundAutoSetMiniTournamentWinner(matchId, side) {
  const mini = roundAutoState.miniTournament || { matches: [], round: 0, matchupHistory: {} };
  const match = (mini.matches || []).find(m => m.id === matchId);
  if (!match || match.winner !== null) return;

  const winnerLabel = side === 'home' ? roundAutoDisplayParticipant(match.home) : roundAutoDisplayParticipant(match.away);
  gsConfirm(`승자를 ${winnerLabel}(으)로 확정할까요?`, ok => {
    if (!ok) return;

    match.winner = side;
    const currentRound = (mini.matches || []).filter(m => m.round === mini.round);
    const allFinished = currentRound.every(m => m.winner !== null);

    if (allFinished) {
      const winners = currentRound.map(m => m.winner === 'home' ? m.home : m.away);
      if (winners.length === 1) {
        gsAlert(`최종 우승: ${roundAutoDisplayParticipant(winners[0])}!\n\n미니 토너먼트가 종료되었습니다.`);
        roundAutoRenderMatches();
        saveRoundAutoState();
        return;
      }

      const history = mini.matchupHistory && typeof mini.matchupHistory === 'object' ? mini.matchupHistory : {};
      mini.matchupHistory = history;
      const nextPairs = roundAutoBuildMiniRoundMatches(winners, history);
      if (!nextPairs.length) {
        gsAlert('다음 라운드에 유효한 대진을 만들 수 없어 종료합니다.');
        roundAutoRenderMatches();
        saveRoundAutoState();
        return;
      }

      mini.round += 1;
      const nextMatches = nextPairs.map((pair, idx) => ({
        id: `RA-T-R${mini.round}-M${idx + 1}`,
        round: mini.round,
        home: pair.home,
        away: pair.away,
        winner: null,
      }));

      nextMatches.forEach(m => {
        const key = roundAutoMiniMatchupKey(m.home, m.away);
        if (key) history[key] = Number(history[key] || 0) + 1;
      });
      mini.matches.push(...nextMatches);
    }

    roundAutoRenderMatches();
    saveRoundAutoState();
  });
}
async function roundAutoGenerateNextTurn() {
  roundAutoState.turns = (roundAutoState.turns || []).filter(turn => turn?.status !== 'preview');

  if (!roundAutoState.turns.length) {
    const activeTurnNo = roundAutoState.turnNo + 1;
    const realStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
    const activeTurn = roundAutoBuildTurnWithStats(activeTurnNo, 'active', realStats, true);
    if (!activeTurn) return;

    const previewTurnNo = activeTurnNo + 1;
    const simulatedStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
    const previewTurn = roundAutoBuildTurnWithStats(previewTurnNo, 'preview', simulatedStats, false);
    roundAutoState.turns = previewTurn ? [activeTurn, previewTurn] : [activeTurn];
    roundAutoState.turnNo = activeTurnNo;
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

    await roundAutoCommitTurnToGlobalLog(activeTurn);

    activeTurn.status = 'done';
    const newActiveTurnNo = roundAutoState.turnNo + 1;
    const realStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
    const newActiveTurn = roundAutoBuildTurnWithStats(newActiveTurnNo, 'active', realStats, true);
    if (!newActiveTurn) return;
    roundAutoState.turns.push(newActiveTurn);

    const previewTurnNo = newActiveTurnNo + 1;
    const simulatedStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
    const previewTurn = roundAutoBuildTurnWithStats(previewTurnNo, 'preview', simulatedStats, false);
    if (previewTurn) roundAutoState.turns.push(previewTurn);
    roundAutoState.turnNo = newActiveTurnNo;
  }

  const normalized = roundAutoNormalizeTurnsState(roundAutoState);
  roundAutoState = normalized.state;
  if (normalized.didChange && DEBUG) {
    console.debug('[round-auto] normalize on next turn:', normalized.reasons.join(', '));
  }
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
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

  const activeTurn = (roundAutoState.turns || []).find(turn => turn?.status === 'active');
  if (activeTurn) {
    const isFullyDecided = (activeTurn.matches || []).every(m => m.winner === 'home' || m.winner === 'away');
    if (isFullyDecided) roundAutoCommitTurnToGlobalLog(activeTurn);
  }

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  saveRoundAutoState();
}

async function roundAutoCommitTurnToGlobalLog(activeTurn) {
  if (!activeTurn || !Array.isArray(activeTurn.matches)) return;
  if (activeTurn.committedTurn) return;
  if (roundAutoState._commitInFlight) return;

  const mode = roundAutoNormalizeEventType(roundAutoState.eventType || roundAutoState.mode);
  roundAutoWarnInvalidEventType('commit/applyScore', roundAutoState.eventType || roundAutoState.mode);
  const decidedUncommitted = activeTurn.matches.filter(m => {
    const decided = m && (m.winner === 'home' || m.winner === 'away');
    return decided && !m.committed;
  });
  if (!decidedUncommitted.length) {
    const decidedMatches = activeTurn.matches.filter(m => m && (m.winner === 'home' || m.winner === 'away'));
    if (decidedMatches.length && decidedMatches.every(m => m.committed)) {
      activeTurn.committedTurn = true;
      saveRoundAutoState();
    }
    return;
  }

  roundAutoState._commitInFlight = true;

  let didSnapshot = false;
  const ensureSnapshotLastRanks = () => {
    if (didSnapshot) return;
    snapshotLastRanks();
    didSnapshot = true;
  };

  const playerSnapshot = JSON.parse(JSON.stringify(players || []));

  try {
    ensureSnapshotLastRanks();

    const now = Date.now();
    const ds = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const newLogEntries = decidedUncommitted.map((match, idx) => {
      const winner = match.winner === 'home' ? match.home : match.away;
      const loser = match.winner === 'home' ? match.away : match.home;
      const logId = `${now}-${activeTurn.turnNo}-${match.courtNo || 0}-${idx}-${Math.floor(Math.random() * 100000)}`;

      roundEngineApplyRoundScore(winner, loser, mode);

      const winnerTeam = mode === 'single'
        ? [Array.isArray(winner) ? winner[0] : winner]
        : (Array.isArray(winner) ? winner : [winner]);
      const loserTeam = mode === 'single'
        ? [Array.isArray(loser) ? loser[0] : loser]
        : (Array.isArray(loser) ? loser : [loser]);

      return {
        id: logId,
        ts: now + idx,
        date: ds,
        type: mode,
        home: winnerTeam,
        away: loserTeam,
        winner: 'home',
        memo: 'round_auto',
      };
    });

    const ok = await pushWithMatchLogAppend(newLogEntries);
    if (!ok) {
      players = playerSnapshot;
      computeAll();
      return;
    }

    computeAll();

    decidedUncommitted.forEach((match, idx) => {
      match.committed = true;
      match.logId = newLogEntries[idx].id;
    });
    const decidedMatches = activeTurn.matches.filter(m => m && (m.winner === 'home' || m.winner === 'away'));
    if (decidedMatches.length && decidedMatches.every(m => m.committed)) {
      activeTurn.committedTurn = true;
    }
    saveRoundAutoState();
  } catch (e) {
    players = playerSnapshot;
    computeAll();
    console.error('[round-auto] commit turn failed:', e);
  } finally {
    roundAutoState._commitInFlight = false;
  }
}

function roundAutoRenderMatches() {
  const list = document.getElementById('round-auto-match-list');
  if (!list) return;

  const mini = roundAutoState.miniTournament || { matches: [], round: 0 };
  if (Array.isArray(mini.matches) && mini.round > 0 && mini.matches.length) {
    const currentRound = mini.matches.filter(m => m.round === mini.round);
    if (!currentRound.length) {
      list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-gray);">표시할 매치가 없습니다.</div>';
      return;
    }

    let html = `<div style="text-align:center; margin-bottom:20px; padding:15px; background:var(--wimbledon-sage); color:white; border-radius:12px; font-size:16px; font-weight:bold;">라운드 자동생성 미니 토너먼트 - Round ${mini.round}</div>`;
    currentRound.forEach(m => {
      const isFinished = m.winner !== null;
      const homeDisplay = roundAutoDisplayParticipant(m.home);

      if (m.isBye) {
        html += `
          <div class="team-box" style="margin-bottom:10px; padding:12px; opacity:0.7; background:linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);">
            <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id} - 부전승</div>
            <div style="text-align:center; padding:10px;">
              <span style="color:var(--wimbledon-sage); font-weight:700; font-size:15px;">✓ ${roundAutoEscape(homeDisplay)}</span>
              <div style="font-size:12px; color:var(--text-gray); margin-top:5px;">다음 라운드 자동 진출</div>
            </div>
          </div>`;
        return;
      }

      const awayDisplay = roundAutoDisplayParticipant(m.away);
      html += `
        <div class="team-box" style="margin-bottom:10px; padding:12px; ${isFinished ? 'opacity:0.5;' : ''}">
          <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button onclick="roundAutoSetMiniTournamentWinner('${m.id}', 'home')"
              class="opt-btn"
              style="flex:1; padding:10px; ${m.winner === 'home' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${roundAutoEscape(homeDisplay)}
            </button>
            <div style="font-size:14px; color:var(--text-gray);">vs</div>
            <button onclick="roundAutoSetMiniTournamentWinner('${m.id}', 'away')"
              class="opt-btn"
              style="flex:1; padding:10px; ${m.winner === 'away' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${roundAutoEscape(awayDisplay)}
            </button>
          </div>
        </div>`;
    });

    list.innerHTML = html;
    return;
  }

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
      const teamSeparator = roundAutoIsSingles() ? ' vs ' : ' & ';
      const home = Array.isArray(match.home) ? match.home.map(roundAutoPlayerLabel).join(teamSeparator) : roundAutoPlayerLabel(match.home);
      const away = Array.isArray(match.away) ? match.away.map(roundAutoPlayerLabel).join(teamSeparator) : roundAutoPlayerLabel(match.away);
      const disabled = turn.status === 'preview' ? 'opacity:0.8;' : '';
      const disableAttr = turn.status === 'preview' ? 'disabled' : '';
      return `
            <div class="team-box" style="padding:12px; margin-bottom:8px; ${disabled}">
              <div style="font-size:11px; color:#888; margin-bottom:8px;">코트 ${match.courtNo}</div>
              <div style="display:flex; gap:8px;">
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','home')" ${disableAttr}
                  style="flex:1; ${match.winner === 'home' ? 'background:var(--wimbledon-sage); color:white;' : ''}">${roundAutoEscape(home)}</button>
                <button class="opt-btn" onclick="roundAutoSetWinner('${match.id}','away')" ${disableAttr}
                  style="flex:1; ${match.winner === 'away' ? 'background:var(--wimbledon-sage); color:white;' : ''}">${roundAutoEscape(away)}</button>
              </div>
            </div>
          `;
    }).join('')}
      </div>
    `;
  }).join('');
}

function roundAutoComputePersonalStandings() {
  const mode = roundAutoNormalizeEventType(roundAutoState.eventType || roundAutoState.mode);
  const personalMap = {};

  const ensure = name => {
    if (!personalMap[name]) {
      personalMap[name] = { name, wins: 0, losses: 0, matches: 0, score: 0 };
    }
    return personalMap[name];
  };

  roundAutoFlattenMatches({ includePreview: false }).forEach(match => {
    if (!match || (match.winner !== 'home' && match.winner !== 'away')) return;
    const homePlayers = Array.isArray(match.home) ? match.home : [match.home];
    const awayPlayers = Array.isArray(match.away) ? match.away : [match.away];
    const winners = match.winner === 'home' ? homePlayers : awayPlayers;
    const losers = match.winner === 'home' ? awayPlayers : homePlayers;

    const winEarn = TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring[mode === 'single' ? 'single' : 'double'].win;
    const loseEarn = TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring[mode === 'single' ? 'single' : 'double'].loss;

    winners.forEach(name => {
      const s = ensure(name);
      s.wins += 1;
      s.matches += 1;
      s.score += winEarn;
    });
    losers.forEach(name => {
      const s = ensure(name);
      s.losses += 1;
      s.matches += 1;
      s.score += loseEarn;
    });
  });

  return Object.values(personalMap)
    .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || (b.score - a.score) || a.name.localeCompare(b.name));
}

function roundAutoRenderPersonalRanking() {
  const table = document.getElementById('round-auto-personal-rank-table');
  if (!table) return;

  const standings = roundAutoComputePersonalStandings();
  if (!standings.length) {
    table.innerHTML = '<div style="font-size:12px; color:#999;">승자 선택 후 표시됩니다.</div>';
    return;
  }

  table.innerHTML = `
    <table class="tennis-table">
      <thead>
        <tr><th>순위</th><th>선수</th><th>승</th><th>패</th><th>경기</th><th>획득점수</th></tr>
      </thead>
      <tbody>
        ${standings.map((s, idx) => {
          const level = findPlayerLevel ? findPlayerLevel(s.name) : '';
          return `
          <tr>
            <td>${idx + 1}</td>
            <td>${roundAutoEscape(roundAutoPlayerLabel(s.name, level))}</td>
            <td>${s.wins}</td>
            <td>${s.losses}</td>
            <td>${s.matches}</td>
            <td>${s.score % 1 === 0 ? s.score : s.score.toFixed(1)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function roundAutoRenderRanking() {
  const table = document.getElementById('round-auto-rank-table');
  if (!table) return;

  const standings = roundAutoComputeSessionStandings();

  if (!standings.length) {
    table.innerHTML = '<div style="font-size:12px; color:#999;">승자 선택 후 랭킹이 표시됩니다.</div>';
    return;
  }

  const label = roundAutoIsSingles() ? '선수' : '팀';
  table.innerHTML = `
    <table class="tennis-table">
      <thead>
        <tr><th>순위</th><th>${label}</th><th>승</th><th>패</th><th>경기</th></tr>
      </thead>
      <tbody>
        ${standings.map((s, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${roundAutoEscape(roundAutoDisplayParticipant(s.players))}</td>
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
    localStorage.removeItem(roundAutoStorageKey(roundAutoGetSelectedClubId()));
  } catch (e) {
    console.warn('[round-auto] state clear failed:', e);
  }
  initRoundAutoPlayerPool();
}

function roundAutoViewOpen() {
  return showViewUI('round-auto');
}

window.roundAutoStorageKey = roundAutoStorageKey;
window.initRoundAutoPlayerPool = initRoundAutoPlayerPool;
window.roundAutoGenerateNextTurn = roundAutoGenerateNextTurn;
window.roundAutoSetWinner = roundAutoSetWinner;
window.roundAutoRenderMatches = roundAutoRenderMatches;
window.roundAutoRenderRanking = roundAutoRenderRanking;
window.roundAutoRenderPersonalRanking = roundAutoRenderPersonalRanking;
window.roundAutoComputePersonalStandings = roundAutoComputePersonalStandings;
window.roundAutoReset = roundAutoReset;
window.roundAutoViewOpen = roundAutoViewOpen;
window.roundAutoOpenAddGuestModal = roundAutoOpenAddGuestModal;
window.roundAutoComputeSessionStandings = roundAutoComputeSessionStandings;
window.roundAutoOpenMiniTournamentModal = roundAutoOpenMiniTournamentModal;
window.roundAutoCloseMiniTournamentModal = roundAutoCloseMiniTournamentModal;
window.roundAutoToggleModalParticipant = roundAutoToggleModalParticipant;
window.roundAutoUpdateModalCount = roundAutoUpdateModalCount;
window.roundAutoStartMiniTournamentFromModal = roundAutoStartMiniTournamentFromModal;
window.roundAutoSetMiniTournamentWinner = roundAutoSetMiniTournamentWinner;
