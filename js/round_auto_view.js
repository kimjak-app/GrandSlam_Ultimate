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
    courtCount: 1,
    selectedPlayers: [],
    turns: [],
    history: { partners: {}, opponents: {}, playedCount: {} },
    turnNo: 0,
    config: {
      levelFilter: ['A', 'B', 'C'],
      gender: 'all',
      allowMixed: true,
      allowGenderBattle: false,
      allowMixedVsSame: true,
      previewTurns: 1,
    },
    sessionStats: {},
    partnerHistory: {},
    nextMatchType: 'M',
    mixedStreak: 0,
    previewVariant: 0,
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

// ✅ v5.41: 대진표 이름에 성별 아이콘 붙이기
function roundAutoPlayerLabelWithGender(name, level) {
  const player = (typeof players !== 'undefined' ? players : []).find(p => p.name === name)
    || (roundAutoState?.guestPlayers || []).find(p => p.name === name);
  const icon = player
    ? (player.gender === 'F'
        ? '<span class="material-symbols-outlined" style="font-size:11px; color:#E8437A; vertical-align:middle; margin-right:2px;">female</span>'
        : '<span class="material-symbols-outlined" style="font-size:11px; color:#3A7BD5; vertical-align:middle; margin-right:2px;">male</span>')
    : '';
  return icon + roundAutoPlayerLabel(name, level);
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

  let hasCourtSeqFix = false;
  const courtSeqTracker = {};
  realTurns.forEach(turn => {
    (Array.isArray(turn?.matches) ? turn.matches : []).forEach(match => {
      const courtNo = Number(match?.courtNo) || 0;
      if (courtNo < 1) return;
      const existingSeq = Number(match?.courtGameSeq) || 0;
      if (existingSeq > 0) {
        courtSeqTracker[courtNo] = Math.max(courtSeqTracker[courtNo] || 0, existingSeq);
        return;
      }
      roundAutoAssignCourtGameSeq(match, courtSeqTracker);
      hasCourtSeqFix = true;
    });
  });
  if (hasCourtSeqFix) reasons.push('backfilled court game seq');

  // ✅ fix: match 레벨 런타임 메타 필드 정리 — Firebase 저장/로드 시 잔류 방지
  // nextCourtAssigned, _courtDoneInFlight 는 런타임 플래그로 영속화되면 안 됨
  const META_FIELDS_TO_CLEAN = ['nextCourtAssigned', '_courtDoneInFlight', '_plannerState', '_planningStats'];
  let hasMetaFix = false;
  [...realTurns, ...(previewTurn ? [previewTurn] : [])].forEach(turn => {
    (Array.isArray(turn?.matches) ? turn.matches : []).forEach(match => {
      META_FIELDS_TO_CLEAN.forEach(field => {
        if (field in match) {
          delete match[field];
          hasMetaFix = true;
        }
      });
    });
  });
  if (hasMetaFix) reasons.push('cleaned match meta fields');

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
      .sort((a, b) => a.rank - b.rank)
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

async function loadRoundAutoState() {
  try {
    const clubId = roundAutoGetSelectedClubId();
    const storageKey = roundAutoStorageKey(clubId);
    const initial = createRoundAutoInitialState();
    roundAutoLoadedClubId = clubId;

    // ✅ 3-1: Firebase 우선 로드 → 없으면 localStorage 폴백
    let raw = null;
    if (clubId && typeof _db !== 'undefined') {
      try {
        const doc = await _db.collection('clubs').doc(clubId)
          .collection('settings').doc('roundAutoState').get();
        if (doc.exists && doc.data().state) {
          raw = doc.data().state;
          // Firebase 데이터를 localStorage에도 동기화
          try { localStorage.setItem(storageKey, raw); } catch(e) {}
        }
      } catch (e) {
        console.warn('[round-auto] Firebase load failed, falling back to localStorage:', e);
      }
    }
    if (!raw) raw = localStorage.getItem(storageKey);

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
      previewVariant: Math.max(0, Number(parsed.previewVariant) || 0),
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
    if (typeof roundAutoState.config.allowMixedVsSame !== 'boolean') {
      roundAutoState.config.allowMixedVsSame = true;
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
    // ✅ fix: 저장 전 normalize — 호출부에서 normalize 누락돼도 메타 필드 차단 보장
    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    const clubId = roundAutoGetSelectedClubId();
    // ✅ 3-1: localStorage 동기 저장 (기존 동작 유지)
    localStorage.setItem(roundAutoStorageKey(clubId), JSON.stringify(roundAutoState));
    // ✅ 3-1: Firebase 백그라운드 저장 (fire-and-forget)
    if (clubId && typeof _db !== 'undefined') {
      _db.collection('clubs').doc(clubId)
        .collection('settings').doc('roundAutoState')
        .set({ state: JSON.stringify(roundAutoState), savedAt: Date.now() })
        .catch(e => console.warn('[round-auto] Firebase save failed:', e));
    }
  } catch (e) {
    console.warn('[round-auto] state save failed:', e);
  }
}

function roundAutoCloneSessionStats(source = roundAutoState.sessionStats) {
  return JSON.parse(JSON.stringify(source || {}));
}

function roundAutoCreateCourtGameSeqTracker(turns = roundAutoState.turns) {
  const tracker = {};
  (Array.isArray(turns) ? turns : []).forEach(turn => {
    if (turn?.status === 'preview') return;
    (Array.isArray(turn?.matches) ? turn.matches : []).forEach(match => {
      const courtNo = Number(match?.courtNo) || 0;
      const seq = Number(match?.courtGameSeq) || 0;
      if (courtNo < 1 || seq < 1) return;
      tracker[courtNo] = Math.max(tracker[courtNo] || 0, seq);
    });
  });
  return tracker;
}

function roundAutoAssignCourtGameSeq(match, tracker, preferredSeq) {
  if (!match) return match;
  const courtNo = Number(match?.courtNo) || 0;
  if (courtNo < 1) return match;
  const seqTracker = tracker && typeof tracker === 'object' ? tracker : {};
  const existingSeq = Number(preferredSeq || match.courtGameSeq) || 0;
  if (existingSeq > 0) {
    match.courtGameSeq = existingSeq;
    seqTracker[courtNo] = Math.max(seqTracker[courtNo] || 0, existingSeq);
    return match;
  }
  const nextSeq = (seqTracker[courtNo] || 0) + 1;
  match.courtGameSeq = nextSeq;
  seqTracker[courtNo] = nextSeq;
  return match;
}

function roundAutoBuildTurn(turnNo, status) {
  const simulatedStats = roundAutoCloneSessionStats();
  return roundAutoBuildTurnWithStats(turnNo, status, simulatedStats, false);
}


function roundAutoGetLiveMatchByCourt(activeTurn, courtNo) {
  if (!activeTurn || !Array.isArray(activeTurn.matches)) return null;
  const matches = activeTurn.matches
    .filter(m => Number(m?.courtNo) === Number(courtNo) && !m?.nextCourtAssigned)
    .sort((a, b) => (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0));
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const m = matches[i];
    if (m?.winner !== 'home' && m?.winner !== 'away') return m;
  }
  return null;
}

function roundAutoGetLiveCourtMatches(activeTurn) {
  const courtCount = Number(roundAutoState?.courtCount) || 1;
  const list = [];
  for (let courtNo = 1; courtNo <= courtCount; courtNo += 1) {
    const match = roundAutoGetLiveMatchByCourt(activeTurn, courtNo);
    if (match) list.push(match);
  }
  return list;
}

function roundAutoBuildSinglePreviewMatchForPool(availablePool, courtNo, turnNo, statsRef, plannerState) {
  if (!Array.isArray(availablePool) || !availablePool.length) return null;
  const isSingles = roundAutoIsSingles();
  const required = isSingles ? 2 : 4;
  if (availablePool.length < required) return null;

  if (isSingles) {
    const singles = roundAutoGenerateSinglesTurn(availablePool, 1, turnNo, statsRef) || [];
    const first = singles[0];
    if (!first) return null;
    return {
      ...first,
      id: `ra-preview-${turnNo}-${courtNo}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      turnNo,
      courtNo,
      previewForCourt: courtNo,
    };
  }

  const cycleOptions = {
    allowMixed: roundAutoState?.config?.allowMixed,
    allowGenderBattle: roundAutoAllowGenderBattle(),
    allowMixedVsSame: roundAutoState?.config?.allowMixedVsSame !== false,
    nextMatchType: plannerState?.nextMatchType || roundAutoState.nextMatchType || 'M',
    mixedStreak: Number(plannerState?.mixedStreak ?? roundAutoState.mixedStreak) || 0,
    variantIndex: 0,
    history: plannerState?.history || JSON.parse(JSON.stringify(roundAutoState.matchupHistory || {})),
    femaleCount: availablePool.filter(p => p?.gender === 'F').length,
    statsRef,
    turnNo,
  };
  const planned = roundEngineBuildAutoDoubleMatches(availablePool, 1, cycleOptions) || [];
  const first = planned[0];
  if (!first || !Array.isArray(first.home) || !Array.isArray(first.away)) return null;

  const activeNames = new Set([...(first.home || []), ...(first.away || [])]);
  const activePlayers = availablePool.filter(p => activeNames.has(p.name));
  roundAutoApplyTurnParticipation(activePlayers, availablePool, turnNo, statsRef);

  if (plannerState) {
    plannerState.nextMatchType = cycleOptions.nextMatchType || plannerState.nextMatchType || 'M';
    plannerState.mixedStreak = Number(cycleOptions.mixedStreak) || 0;
    plannerState.history = cycleOptions.history && typeof cycleOptions.history === 'object'
      ? cycleOptions.history
      : plannerState.history || {};
  }

  return {
    id: `ra-preview-${turnNo}-${courtNo}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    turnNo,
    courtNo,
    previewForCourt: courtNo,
    home: [first.home[0], first.home[1]],
    away: [first.away[0], first.away[1]],
    reasonTags: Array.isArray(first.reasonTags) ? first.reasonTags.slice(0, 3) : [],
    winner: null,
  };
}

// ✅ v5.8: 공용 preview queue — courtNo: 0(미귀속), 승격 시점에 courtNo 부여
// plannerStatsRef 루프 바깥 단일 누적, 전역 roundAutoState 건드리지 않음
function roundAutoBuildAllCourtPreviews(activeTurn, planningStatsSource, options = {}) {
  const courtCount = Math.max(1, Number(options.courtCount) || Number(roundAutoState?.courtCount) || 1);
  if (courtCount <= 1) return null;

  const eligiblePool = roundAutoGetSelectedEligiblePool();
  console.debug('[round-auto][preview-build-all]', {
    selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
    eligiblePoolLength: eligiblePool.length,
    courtCountUsed: courtCount,
    requiredPlayers: courtCount * (roundAutoIsSingles() ? 2 : 4),
  });
  const liveMatches = roundAutoGetLiveCourtMatches(activeTurn);
  const occupiedNames = new Set();
  liveMatches.forEach(match => {
    (Array.isArray(match.home) ? match.home : [match.home]).forEach(n => occupiedNames.add(n));
    (Array.isArray(match.away) ? match.away : [match.away]).forEach(n => occupiedNames.add(n));
  });

  let availablePool = eligiblePool.filter(p => !occupiedNames.has(p.name));
  if (!availablePool.length) return null;

  const previewTurnNo = (Number(activeTurn?.turnNo) || Number(roundAutoState?.turnNo) || 0) + 1;
  const previewMatches = [];

  // ✅ v5.82 핵심: plannerStatsRef / plannerState 루프 바깥에 단일 객체 — preview 간 출전균형 누적 보장
  const plannerStatsRef = roundAutoCloneSessionStats(planningStatsSource);
  const plannerState = {
    nextMatchType: roundAutoState.nextMatchType || 'M',
    mixedStreak: Number(roundAutoState.mixedStreak) || 0,
    history: JSON.parse(JSON.stringify(roundAutoState.matchupHistory || {})),
  };

  // ✅ v5.82: 큐(Queue) 목표 길이 정책 명시
  // 언제든 빈 코트가 생기면 즉시 투입할 수 있도록 기본적으로 '전체 코트 수'만큼의 대기열 버퍼를 확보한다.
  const targetQueueSize = courtCount;

  for (let i = 0; i < targetQueueSize; i += 1) {
    if (availablePool.length < (roundAutoIsSingles() ? 2 : 4)) break;
    // ✅ v5.82: courtNo: 0 — 공용 대기열 (승격 시점에 빈 코트 번호 부여)
    const previewMatch = roundAutoBuildSinglePreviewMatchForPool(
      availablePool, 0, previewTurnNo, plannerStatsRef, plannerState
    );
    if (!previewMatch) break;
    // plannerState 스냅샷 저장 (승격 시 전역 반영용)
    previewMatch._plannerState = {
      nextMatchType: plannerState.nextMatchType,
      mixedStreak: plannerState.mixedStreak,
      history: JSON.parse(JSON.stringify(plannerState.history || {})),
    };
    previewMatches.push(previewMatch);
    const used = new Set([...(previewMatch.home || []), ...(previewMatch.away || [])]);
    availablePool = availablePool.filter(p => !used.has(p.name));
  }

  if (!previewMatches.length) return null;
  return { turnNo: previewTurnNo, status: 'preview', matches: previewMatches };
}

async function roundAutoCommitSingleMatchToGlobalLog(activeTurn, match) {
  if (!activeTurn || !match) return false;
  if (match.committed) return true;
  if (match.winner !== 'home' && match.winner !== 'away') return false;

  const runCommit = async () => {
    roundAutoState._commitInFlight = true;
    const mode = roundAutoNormalizeEventType(match.matchType || roundAutoState.eventType || roundAutoState.mode);
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
      const winner = match.winner === 'home' ? match.home : match.away;
      const loser = match.winner === 'home' ? match.away : match.home;
      const logId = `${now}-${activeTurn.turnNo}-${match.courtNo || 0}-${Math.floor(Math.random() * 100000)}`;

      roundEngineApplyRoundScore(winner, loser, mode);

      const winnerTeam = mode === 'single'
        ? [Array.isArray(winner) ? winner[0] : winner]
        : (Array.isArray(winner) ? winner : [winner]);
      const loserTeam = mode === 'single'
        ? [Array.isArray(loser) ? loser[0] : loser]
        : (Array.isArray(loser) ? loser : [loser]);

      const entry = {
        id: logId,
        ts: now,
        date: ds,
        type: mode,
        home: winnerTeam,
        away: loserTeam,
        winner: 'home',
        memo: 'round_auto',
      };

      const ok = await pushWithMatchLogAppend([entry]);
      if (!ok) {
        players = playerSnapshot;
        computeAll();
        return false;
      }

      computeAll();
      match.committed = true;
      match.logId = entry.id;
      match.ts = now; // ✅ v5.82: 커밋 시각 기록 (코트 종료 순서 추적용)
      const decidedMatches = (activeTurn.matches || []).filter(m => m && (m.winner === 'home' || m.winner === 'away'));
      if (decidedMatches.length && decidedMatches.every(m => m.committed)) {
        activeTurn.committedTurn = true;
      }
      saveRoundAutoState();
      return true;
    } catch (e) {
      players = playerSnapshot;
      computeAll();
      console.error('[round-auto] commit single match failed:', e);
      return false;
    } finally {
      roundAutoState._commitInFlight = false;
    }
  };

  const queued = Promise.resolve(roundAutoState._commitQueue || Promise.resolve()).then(runCommit, runCommit);
  roundAutoState._commitQueue = queued.catch(() => false);
  return queued;
}

// ✅ v5.82: 공용 queue shift() + 승격 시 courtNo 동적 부여 + plannerState 전역 반영
// ✅ v5.86: 단일코트 — 승리팀 선택 즉시 다음 대진 자동 투입
// ✅ v5.862: 단일코트 자동 투입 — 미리보기는 대기 선수만으로 시도, 현재 경기 투입은 전체 인원으로
async function roundAutoHandleSingleCourtDone(matchId) {
  const activeTurn = (roundAutoState.turns || []).find(t => t?.status === 'active');
  if (!activeTurn) return;

  const match = (activeTurn.matches || []).find(m => m.id === matchId);
  if (!match || (match.winner !== 'home' && match.winner !== 'away')) return;

  // 1. 중복 실행 방지
  if (match._courtDoneInFlight) return;
  match._courtDoneInFlight = true;

  try {
    // 2. sessionStats 즉시 동기 업데이트 (다음 대진 생성 전에 반드시)
    // committed 는 실제 Firebase 커밋 성공 후 roundAutoCommitSingleMatchToGlobalLog 내부에서만 설정한다.
    match.ts = Date.now();
    const eligiblePool = roundAutoGetSelectedEligiblePool();
    const matchPlayerNames = new Set([
      ...(Array.isArray(match.home) ? match.home : [match.home]),
      ...(Array.isArray(match.away) ? match.away : [match.away]),
    ]);
    const activePlayers = eligiblePool.filter(p => matchPlayerNames.has(p.name));
    const statsRef = roundAutoState.sessionStats && typeof roundAutoState.sessionStats === 'object'
      ? roundAutoState.sessionStats : {};
    roundAutoApplyTurnParticipation(activePlayers, eligiblePool, activeTurn.turnNo, statsRef);
    roundAutoState.sessionStats = statsRef;

    // 3. 전체 인원으로 다음 대진 즉시 생성 후 현재 경기에 투입
    // (미리보기 유무 관계없이 전체 eligiblePool 기준으로 직접 생성)
    const isSingles = roundAutoIsSingles();
    const requiredCount = isSingles ? 2 : 4;
    const freshStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));

    // 전체 인원으로 다음 대진 직접 생성
    // roundAutoChooseFairSingleCourtSetup 반환: { activePlayers: [p,p,p,p], pairing: { home:[p,p], away:[p,p] } }
    let nextHome = null;
    let nextAway = null;

    if (eligiblePool.length >= requiredCount) {
      if (isSingles) {
        const singles = roundAutoGenerateSinglesTurn(eligiblePool, 1, activeTurn.turnNo, freshStats);
        if (singles && singles.length > 0) {
          nextHome = singles[0].home;
          nextAway = singles[0].away;
        }
      } else {
        const setup = roundAutoChooseFairSingleCourtSetup(eligiblePool, activeTurn.turnNo, freshStats);
        if (setup && setup.pairing) {
          nextHome = setup.pairing.home.map(p => p.name);
          nextAway = setup.pairing.away.map(p => p.name);
        }
      }
    }

    roundAutoState.turns = roundAutoState.turns.filter(t => t?.status !== 'preview');

    if (!nextHome || !nextAway) {
      // 인원 부족 — 투입 없음, 미리보기도 없음 (UI에서 생성 불가 표시)
    } else {
      // 3. 다음 경기 현재 활성 턴에 투입
      const newMatch = {
        id: `ra-${activeTurn.turnNo}-court1-next-${Date.now()}`,
        turnNo: activeTurn.turnNo,
        courtNo: 1,
        home: nextHome,
        away: nextAway,
        winner: null,
        committed: false,
        isNextCourt: true,
      };
      roundAutoAssignCourtGameSeq(newMatch, roundAutoCreateCourtGameSeqTracker());
      activeTurn.matches.push(newMatch);

      // 4. 미리보기: 방금 투입된 경기 참여자 제외한 대기 선수만으로 시도
      const newMatchPlayerNames = new Set([...nextHome, ...nextAway]);
      const waitingPool = eligiblePool.filter(p => !newMatchPlayerNames.has(p.name));

      if (waitingPool.length >= requiredCount) {
        const previewStats = JSON.parse(JSON.stringify(roundAutoState.sessionStats || {}));
        let previewHome = null;
        let previewAway = null;

        if (isSingles) {
          const previewSingles = roundAutoGenerateSinglesTurn(waitingPool, 1, activeTurn.turnNo + 1, previewStats);
          if (previewSingles && previewSingles.length > 0) {
            previewHome = previewSingles[0].home;
            previewAway = previewSingles[0].away;
          }
        } else {
          const previewSetup = roundAutoChooseFairSingleCourtSetup(waitingPool, activeTurn.turnNo + 1, previewStats);
          if (previewSetup && previewSetup.pairing) {
            previewHome = previewSetup.pairing.home.map(p => p.name);
            previewAway = previewSetup.pairing.away.map(p => p.name);
          }
        }

        if (previewHome && previewAway) {
          roundAutoState.turns.push({
            turnNo: activeTurn.turnNo + 1,
            status: 'preview',
            matches: [{
              id: `ra-preview-${activeTurn.turnNo + 1}-1`,
              turnNo: activeTurn.turnNo + 1,
              courtNo: 1,
              home: previewHome,
              away: previewAway,
              winner: null,
            }],
          });
        }
      }
      // 대기 선수 부족이면 미리보기 없음 — UI에서 "생성 불가" 표시
    }

    // 5. 정규화 및 렌더링
    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();

    // 6. 실제 Firebase 커밋 성공 후에만 committed=true가 설정되도록 await 한다.
    const committed = await roundAutoCommitSingleMatchToGlobalLog(activeTurn, match);
    if (!committed) {
      console.error('[round-auto] single court match commit skipped/failed:', matchId);
    }

  } finally {
    match._courtDoneInFlight = false;
  }
}

async function roundAutoHandleCourtDone(matchId) {
  const turns = roundAutoState.turns || [];
  const activeTurn = turns.find(t => t?.status === 'active');
  if (!activeTurn) return;
  const match = (activeTurn.matches || []).find(m => m?.id === matchId);
  if (!match) return;
  if (match.winner !== 'home' && match.winner !== 'away') return;
  if (match._courtDoneInFlight) return;

  match._courtDoneInFlight = true;
  try {
    // 1. 단일 매치 커밋 (직렬화 보장)
    const committed = await roundAutoCommitSingleMatchToGlobalLog(activeTurn, match);
    if (!committed) return;

    // 2. ✅ v5.82: 공용 대기열 첫 번째를 shift() → 빈 코트 번호를 이 시점에 부여
    const previewTurn = (roundAutoState.turns || []).find(t => t?.status === 'preview'); // ✅ v5.83: stale turns 참조 → 실시간 참조
    if (previewTurn && Array.isArray(previewTurn.matches) && previewTurn.matches.length > 0 && !match.nextCourtAssigned) {
      const pm = previewTurn.matches.shift(); // 공용 queue의 첫 번째 꺼냄

      const newMatch = {
        ...pm,
        id: `ra-live-${activeTurn.turnNo}-${match.courtNo}-${Date.now()}`,
        turnNo: activeTurn.turnNo,
        courtNo: match.courtNo,  // ✅ 빈 코트 번호를 승격 시점에 동적 부여
        winner: null,
        committed: false,
        isNextCourt: true,
        previewForCourt: undefined,
      };
      delete newMatch._plannerState; // 내부 메타 제거
      roundAutoAssignCourtGameSeq(newMatch, roundAutoCreateCourtGameSeqTracker());

      activeTurn.matches.push(newMatch);
      match.nextCourtAssigned = true;

      // ✅ v5.81: 승격된 경기의 실제 세션 참여/휴식 기록 반영
      const eligiblePool = roundAutoGetSelectedEligiblePool();
      const promotedNames = new Set([
        ...(Array.isArray(newMatch.home) ? newMatch.home : [newMatch.home]),
        ...(Array.isArray(newMatch.away) ? newMatch.away : [newMatch.away]),
      ]);
      const promotedPlayers = eligiblePool.filter(p => promotedNames.has(p.name));
      const statsRef = roundAutoState.sessionStats && typeof roundAutoState.sessionStats === 'object'
        ? roundAutoState.sessionStats
        : {};
      roundAutoApplyTurnParticipation(promotedPlayers, eligiblePool, activeTurn.turnNo, statsRef);
      roundAutoState.sessionStats = statsRef;

      // ✅ v5.81: 승격된 복식 경기의 파트너 히스토리도 실제 전역 상태에 반영
      if (!roundAutoIsSingles()
        && Array.isArray(newMatch.home) && newMatch.home.length === 2
        && Array.isArray(newMatch.away) && newMatch.away.length === 2) {
        const [a, b] = newMatch.home;
        const [c, d] = newMatch.away;
        roundAutoState.partnerHistory = roundAutoState.partnerHistory && typeof roundAutoState.partnerHistory === 'object'
          ? roundAutoState.partnerHistory
          : {};
        roundAutoState.partnerHistory[a] = [b, ...(roundAutoState.partnerHistory[a] || []).filter(x => x !== b)].slice(0, 4);
        roundAutoState.partnerHistory[b] = [a, ...(roundAutoState.partnerHistory[b] || []).filter(x => x !== a)].slice(0, 4);
        roundAutoState.partnerHistory[c] = [d, ...(roundAutoState.partnerHistory[c] || []).filter(x => x !== d)].slice(0, 4);
        roundAutoState.partnerHistory[d] = [c, ...(roundAutoState.partnerHistory[d] || []).filter(x => x !== c)].slice(0, 4);
      }

      // ✅ v5.8: 승격 시점에만 plannerState → 전역 roundAutoState 반영
      if (pm._plannerState) {
        const ps = pm._plannerState;
        if (ps.nextMatchType === 'M' || ps.nextMatchType === 'F' || ps.nextMatchType === 'X') {
          roundAutoState.nextMatchType = ps.nextMatchType;
        }
        roundAutoState.mixedStreak = Math.max(0, Number(ps.mixedStreak) || 0);
        if (ps.history && typeof ps.history === 'object') {
          roundAutoState.matchupHistory = ps.history;
        }
      }
    }

    // 3. 대기열 재생성
    roundAutoState.turns = (roundAutoState.turns || []).filter(t => t?.status !== 'preview');
    const rebuiltPreview = roundAutoBuildAllCourtPreviews(activeTurn);
    if (rebuiltPreview && Array.isArray(rebuiltPreview.matches) && rebuiltPreview.matches.length) {
      // ✅ v5.83 핵심: preview가 없어서 shift 못 했던 코트에 즉시 투입
      if (!match.nextCourtAssigned) {
        const pm2 = rebuiltPreview.matches.shift();
        if (pm2) {
          const newMatch2 = {
            ...pm2,
            id: `ra-live-${activeTurn.turnNo}-${match.courtNo}-${Date.now()}`,
            turnNo: activeTurn.turnNo,
            courtNo: match.courtNo,
            winner: null,
            committed: false,
            isNextCourt: true,
            previewForCourt: undefined,
          };
          delete newMatch2._plannerState;
          roundAutoAssignCourtGameSeq(newMatch2, roundAutoCreateCourtGameSeqTracker());
          activeTurn.matches.push(newMatch2);
          match.nextCourtAssigned = true;

          const eligiblePool2 = roundAutoGetSelectedEligiblePool();
          const promotedNames2 = new Set([
            ...(Array.isArray(newMatch2.home) ? newMatch2.home : [newMatch2.home]),
            ...(Array.isArray(newMatch2.away) ? newMatch2.away : [newMatch2.away]),
          ]);
          const promotedPlayers2 = eligiblePool2.filter(p => promotedNames2.has(p.name));
          const statsRef2 = roundAutoState.sessionStats && typeof roundAutoState.sessionStats === 'object'
            ? roundAutoState.sessionStats : {};
          roundAutoApplyTurnParticipation(promotedPlayers2, eligiblePool2, activeTurn.turnNo, statsRef2);
          roundAutoState.sessionStats = statsRef2;

          if (!roundAutoIsSingles()
            && Array.isArray(newMatch2.home) && newMatch2.home.length === 2
            && Array.isArray(newMatch2.away) && newMatch2.away.length === 2) {
            const [a, b] = newMatch2.home;
            const [c, d] = newMatch2.away;
            roundAutoState.partnerHistory = roundAutoState.partnerHistory || {};
            roundAutoState.partnerHistory[a] = [b, ...(roundAutoState.partnerHistory[a] || []).filter(x => x !== b)].slice(0, 4);
            roundAutoState.partnerHistory[b] = [a, ...(roundAutoState.partnerHistory[b] || []).filter(x => x !== a)].slice(0, 4);
            roundAutoState.partnerHistory[c] = [d, ...(roundAutoState.partnerHistory[c] || []).filter(x => x !== d)].slice(0, 4);
            roundAutoState.partnerHistory[d] = [c, ...(roundAutoState.partnerHistory[d] || []).filter(x => x !== c)].slice(0, 4);
          }
        }
      }
      // 남은 대기열 push
      if (rebuiltPreview.matches.length) {
        roundAutoState.turns.push(rebuiltPreview);
      }
    }

    const liveMatches = roundAutoGetLiveCourtMatches(activeTurn);
    if (!liveMatches.length) activeTurn.status = 'done';

    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();
  } finally {
    match._courtDoneInFlight = false;
  }
}

function roundAutoStartSession() {
  roundAutoSyncStateFromCurrentUI();
  roundAutoState.turns = (roundAutoState.turns || []).filter(turn => turn?.status !== 'preview');
  roundAutoState.previewVariant = 0;

  const activeTurnNo = (Number(roundAutoState.turnNo) || 0) + 1;
  const realStats = roundAutoCloneSessionStats();
  const activeTurn = roundAutoBuildTurnWithStats(activeTurnNo, 'active', realStats, true);
  if (!activeTurn) return null;

  const nextTurns = [activeTurn];
  if ((Number(roundAutoState.courtCount) || 1) <= 1) {
    const previewTurnNo = activeTurnNo + 1;
    const simulatedStats = roundAutoCloneSessionStats(activeTurn._planningStats);
    console.debug('[round-auto][preview-rebuild][start-session-single]', {
      selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
      eligiblePoolLength: roundAutoGetSelectedEligiblePool().length,
      courtCountUsed: Number(roundAutoState.courtCount) || 1,
      requiredPlayers: (Number(roundAutoState.courtCount) || 1) * (roundAutoIsSingles() ? 2 : 4),
    });
    const previewTurn = roundAutoBuildTurnWithStats(previewTurnNo, 'preview', simulatedStats, false);
    if (previewTurn) nextTurns.push(previewTurn);
  } else {
    console.debug('[round-auto][preview-rebuild][start-session-multi]', {
      selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
      eligiblePoolLength: roundAutoGetSelectedEligiblePool().length,
      courtCountUsed: Number(roundAutoState.courtCount) || 1,
      requiredPlayers: (Number(roundAutoState.courtCount) || 1) * (roundAutoIsSingles() ? 2 : 4),
    });
    const previewTurn = roundAutoBuildAllCourtPreviews(activeTurn, activeTurn._planningStats);
    if (previewTurn) nextTurns.push(previewTurn);
  }

  roundAutoState.turns = nextTurns;
  roundAutoState.turnNo = activeTurnNo;
  const normalized = roundAutoNormalizeTurnsState(roundAutoState);
  roundAutoState = normalized.state;
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  saveRoundAutoState();
  return activeTurn;
}

function roundAutoSyncStateFromCurrentUI() {
  const playerPool = document.getElementById('round-auto-player-pool');
  if (playerPool) {
    const selected = Array.from(playerPool.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
    roundAutoState.selectedPlayers = selected;
  }

  const courtInput = document.getElementById('round-auto-court-count');
  const typedCourt = Number(courtInput?.value);
  if (Number.isFinite(typedCourt) && typedCourt >= 1) {
    roundAutoState.courtCount = typedCourt;
  }
}

function roundAutoGetSelectedEligiblePool() {
  const clubMap = new Map(roundAutoGetClubPlayers().map(p => [p.name, {
    id: p.name,
    name: p.name,
    level: p.level || 'A',
    gender: p.gender || 'U',
    isGuest: false,
    rank: p.rank,
    dRank: p.dRank,
  }]));
  const guestMap = new Map((Array.isArray(roundAutoState.oneTimeGuests) ? roundAutoState.oneTimeGuests : []).map(g => [g.name, {
    id: g.id || g.name,
    name: g.name,
    level: g.level || 'A',
    gender: g.gender || 'U',
    isGuest: true,
    rank: g.rank,
    dRank: g.dRank,
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

function roundAutoRebuildSessionStatsBaseline(eligiblePool, completedTurns = []) {
  const statsRef = {};
  const normalizedTurns = Array.isArray(completedTurns) ? completedTurns : [];

  normalizedTurns
    .sort((a, b) => (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0))
    .forEach(turn => {
      const decidedMatches = (Array.isArray(turn?.matches) ? turn.matches : [])
        .filter(match => match && (match.winner === 'home' || match.winner === 'away'));
      if (!decidedMatches.length) return;

      const activeNames = new Set();
      decidedMatches.forEach(match => {
        (Array.isArray(match.home) ? match.home : [match.home]).forEach(name => activeNames.add(name));
        (Array.isArray(match.away) ? match.away : [match.away]).forEach(name => activeNames.add(name));
      });

      const activePlayers = (Array.isArray(eligiblePool) ? eligiblePool : []).filter(p => activeNames.has(p.name));
      if (!activePlayers.length) return;

      roundAutoApplyTurnParticipation(activePlayers, eligiblePool, Number(turn?.turnNo) || 0, statsRef);
    });

  return statsRef;
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


function roundAutoSortPoolByFairness(pool, statsRef, turnNo) {
  const list = Array.isArray(pool) ? pool.slice() : [];
  return list.sort((a, b) => {
    const sa = roundAutoEnsureSessionStats(a.name, statsRef);
    const sb = roundAutoEnsureSessionStats(b.name, statsRef);
    if (sa.played !== sb.played) return sa.played - sb.played;
    const aRestedLastTurn = sa.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    const bRestedLastTurn = sb.lastTurnPlayed !== (turnNo - 1) ? 1 : 0;
    if (bRestedLastTurn !== aRestedLastTurn) return bRestedLastTurn - aRestedLastTurn;
    if ((sb.restStreak || 0) !== (sa.restStreak || 0)) return (sb.restStreak || 0) - (sa.restStreak || 0);
    if ((sb.rested || 0) !== (sa.rested || 0)) return (sb.rested || 0) - (sa.rested || 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function roundAutoBuildFairPoolPrefixes(pool, requiredPlayers, statsRef, turnNo) {
  const sorted = roundAutoSortPoolByFairness(pool, statsRef, turnNo);
  const prefixes = [];
  for (let size = Math.max(requiredPlayers, 0); size <= sorted.length; size += 1) {
    prefixes.push(sorted.slice(0, size));
  }
  return prefixes;
}

function roundAutoBuildTurnWithStats(turnNo, status, statsRef, mutateRealStats, options = {}) {
  const isSingles = roundAutoIsSingles();
  const effectiveCourtCount = Math.max(1, Number(options.courtCount) || Number(roundAutoState.courtCount) || 1);
  const eligiblePool = Array.isArray(options.eligiblePool)
    ? options.eligiblePool
    : roundAutoGetSelectedEligiblePool();
  const requiredPlayers = effectiveCourtCount * (isSingles ? 2 : 4);
  console.debug('[round-auto][build-turn]', {
    turnNo,
    status,
    selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
    eligiblePoolLength: eligiblePool.length,
    courtCountUsed: effectiveCourtCount,
    requiredPlayers,
  });

  if (eligiblePool.length < requiredPlayers) {
    console.debug('[round-auto][shortage-alert]', {
      triggeredBy: 'roundAutoBuildTurnWithStats',
      turnNo,
      status,
      selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
      eligiblePoolLength: eligiblePool.length,
      courtCountUsed: effectiveCourtCount,
      requiredPlayers,
    });
    gsAlert('참가자 수가 부족합니다. 코트 수를 줄이거나 참가자를 더 선택해주세요.');
    return null;
  }

  let matches = [];

  if (isSingles) {
    matches = roundAutoGenerateSinglesTurn(eligiblePool, effectiveCourtCount, turnNo, statsRef) || [];
    if (!matches.length) return null;
  } else {
    const fairPoolCandidates = roundAutoBuildFairPoolPrefixes(eligiblePool, requiredPlayers, statsRef, turnNo);
    let planned = [];
    let selectedPlanningPool = eligiblePool;
    let selectedCycleOptions = null;

    for (const candidatePool of fairPoolCandidates) {
      const cycleOptions = {
        allowMixed: roundAutoState.config.allowMixed,
        allowGenderBattle: roundAutoAllowGenderBattle(),
        allowMixedVsSame: roundAutoState?.config?.allowMixedVsSame !== false,
        nextMatchType: (roundAutoState.nextMatchType === 'M' || roundAutoState.nextMatchType === 'F' || roundAutoState.nextMatchType === 'X')
          ? roundAutoState.nextMatchType
          : 'M',
        mixedStreak: Number(roundAutoState.mixedStreak) || 0,
        variantIndex: Math.max(0, Number(roundAutoState.previewVariant) || 0),
        history: roundAutoState.matchupHistory || {},
        femaleCount: candidatePool.filter(p => p?.gender === 'F').length,
        statsRef,
        turnNo,
      };
      const trial = roundEngineBuildAutoDoubleMatches(candidatePool, effectiveCourtCount, cycleOptions) || [];
      if (trial.length === effectiveCourtCount) {
        planned = trial;
        selectedPlanningPool = candidatePool;
        selectedCycleOptions = cycleOptions;
        break;
      }
    }

    if (!planned.length) return null;

    matches = planned.map((m, idx) => ({
      id: `ra-${turnNo}-${idx + 1}`,
      turnNo,
      courtNo: m.courtNo || (idx + 1),
      home: [m.home[0], m.home[1]],
      away: [m.away[0], m.away[1]],
      reasonTags: Array.isArray(m.reasonTags) ? m.reasonTags.slice(0, 3) : [],
      winner: null,
    }));
    if (mutateRealStats && selectedCycleOptions) {
      roundAutoState.nextMatchType = (selectedCycleOptions.nextMatchType === 'M' || selectedCycleOptions.nextMatchType === 'F' || selectedCycleOptions.nextMatchType === 'X')
        ? selectedCycleOptions.nextMatchType
        : 'M';
      roundAutoState.mixedStreak = Math.max(0, Number(selectedCycleOptions.mixedStreak) || 0);
      roundAutoState.matchupHistory = selectedCycleOptions.history && typeof selectedCycleOptions.history === 'object'
        ? selectedCycleOptions.history
        : {};
    }

    if (matches.length) {
      const activeNames = new Set();
      matches.forEach(m => {
        (Array.isArray(m.home) ? m.home : [m.home]).forEach(n => activeNames.add(n));
        (Array.isArray(m.away) ? m.away : [m.away]).forEach(n => activeNames.add(n));
      });
      const activePlayers = selectedPlanningPool.filter(p => activeNames.has(p.name));
      roundAutoApplyTurnParticipation(activePlayers, eligiblePool, turnNo, statsRef);
    }
  }

  if (!matches.length) {
    gsAlert('현재 옵션으로 생성 가능한 대진이 없습니다. 선수/팀 구성을 조정하거나 [남 vs 여 매치 허용]을 켜주세요.');
    return null;
  }

  if (status !== 'preview') {
    const courtSeqTracker = roundAutoCreateCourtGameSeqTracker();
    matches.forEach(match => roundAutoAssignCourtGameSeq(match, courtSeqTracker));
  }

  if (mutateRealStats) {
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

  return {
    turnNo,
    matches,
    status,
    _planningStats: roundAutoCloneSessionStats(statsRef),
  };
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

    // ✅ v5.4: 혼복vs남복/여복 허용 버튼
    let mixedVsSameWrap = document.getElementById('round-auto-mixed-vs-same-wrap');
    if (!mixedVsSameWrap) {
      mixedVsSameWrap = document.createElement('div');
      mixedVsSameWrap.id = 'round-auto-mixed-vs-same-wrap';
      mixedVsSameWrap.innerHTML = `
        <label for="round-auto-allow-mixed-vs-same" style="display:flex; align-items:center; gap:8px; font-size:13px; color:#333; font-weight:600; cursor:pointer;">
          <input id="round-auto-allow-mixed-vs-same" type="checkbox" />
          혼복 vs 남복/여복 매치 허용
        </label>
        <div style="font-size:12px; color:#666; margin-top:4px;">(혼복팀 vs 남복/여복팀 경기 가능. 특정 성별 인원이 부족할 때 경기 생성 가능성과 출전 균형에 유리합니다)</div>
      `;
      wrap.insertAdjacentElement('afterend', mixedVsSameWrap);
    }
    mixedVsSameWrap.style.cssText = 'margin-top:8px; margin-bottom:16px; padding:10px 12px; border:1px solid #E5E5EA; border-radius:12px; background:#FAFAFA;';

    const chk2 = document.getElementById('round-auto-allow-mixed-vs-same');
    if (chk2) {
      chk2.checked = roundAutoState?.config?.allowMixedVsSame !== false;
      chk2.onchange = () => {
        roundAutoState.config.allowMixedVsSame = !!chk2.checked;
        saveRoundAutoState();
      };
    }
  }
}
function roundAutoOpenAddGuestModal() {
  gsEditName('', ({ name, gender }) => {
    const cleanName = (name || '').trim();
    if (!cleanName) {
      gsAlert('이름을 입력해줘');
      return;
    }

    const clubNames = roundAutoGetClubPlayers().map(p => p.name);
    if (clubNames.includes(cleanName)) {
      gsAlert('기존 회원과 이름이 같아. 다른 이름으로 해줘');
      return;
    }

    const guestNames = (roundAutoState.oneTimeGuests || []).map(g => g.name);
    if (guestNames.includes(cleanName)) {
      gsAlert('이미 추가된 게스트야');
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
async function initRoundAutoPlayerPool() {
  const currentClubId = roundAutoGetSelectedClubId();
  // ✅ v5.122: 클럽 변경 시에만 재로드 — createInitialState 제거로 기록 리셋 방지
  // ✅ 3-1: loadRoundAutoState가 async이므로 await으로 호출
  if (roundAutoLoadedClubId !== currentClubId) {
    await loadRoundAutoState();
  }

  const courtInput = document.getElementById('round-auto-court-count');
  const courtTabs = document.querySelectorAll('#round-auto-court-tabs .court-tab-btn');
  const currentCount = roundAutoState.courtCount || 1;

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
  const existingNames = new Set([
    ...roundAutoGetClubPlayers().map(p => p.name),
    ...(Array.isArray(roundAutoState.oneTimeGuests) ? roundAutoState.oneTimeGuests : []).map(g => g.name),
  ]);
  const filteredSelectedPlayers = roundAutoState.selectedPlayers.filter(name => existingNames.has(name));
  const selectionChanged = filteredSelectedPlayers.length !== roundAutoState.selectedPlayers.length;
  if (selectionChanged) roundAutoState.selectedPlayers = filteredSelectedPlayers;

  const playerPool = document.getElementById('round-auto-player-pool');
  if (!playerPool) return;

  if (filteredClubPlayers.length === 0 && filteredGuests.length === 0) {
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
  const allRows = roundAutoComputeSessionStandings();
  if (!allRows.length) {
    gsAlert('오늘 성적 데이터가 없습니다. 먼저 승자를 선택해 주세요.');
    return;
  }

  // ✅ v5.124: 현재 체크된 selectedPlayers 기준으로 필터링 — 중간에 빠진 회원/게스트 제외
  const activeNames = new Set(roundAutoState.selectedPlayers || []);
  const rows = allRows.filter(row =>
    Array.isArray(row.players)
      ? row.players.every(name => activeNames.has(name))
      : activeNames.has(row.players)
  );

  if (rows.length < 2) {
    gsAlert('현재 참여 중인 인원이 부족해 미니 토너먼트를 생성할 수 없습니다. (최소 2팀/2명 필요)');
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

function roundAutoReasonText(match) {
  const tags = Array.isArray(match?.reasonTags) ? match.reasonTags.filter(Boolean).slice(0, 3) : [];
  if (!tags.length) return '';
  return tags.join(' · ');
}

// ✅ v5.90: 이 턴 재생성 — 결과 입력된 경기 보존, 미완료 경기만 재생성
function roundAutoRegenerateCurrentTurn() {
  gsConfirm('현재 턴 대진표를 재생성할까요?\n(미완료 경기만 재생성되며, 결과 입력된 경기는 유지됩니다)', ok => {
    if (!ok) return;
    roundAutoSyncStateFromCurrentUI();
    const turns = roundAutoState.turns || [];
    const activeIdx = turns.findIndex(t => t?.status === 'active');
    if (activeIdx < 0) { gsAlert('활성 턴이 없습니다.'); return; }
    const activeTurn = turns[activeIdx];
    const activeTurnNo = activeTurn.turnNo;
    const prevTurns = turns.slice(0, activeIdx).filter(t => t?.status !== 'preview');

    const doneMatches = (activeTurn.matches || []).filter(m => m.winner === 'home' || m.winner === 'away');
    const eligiblePool = roundAutoGetSelectedEligiblePool();
    const targetCourtCount = Math.max(1, Number(roundAutoState.courtCount) || 1);
    const baselineTurns = [
      ...prevTurns.filter(t => t?.status === 'done'),
      { turnNo: activeTurnNo, matches: doneMatches },
    ];
    const baselineStats = roundAutoRebuildSessionStatsBaseline(eligiblePool, baselineTurns);
    const planningStats = roundAutoCloneSessionStats(baselineStats);
    console.debug('[round-auto][regenerate-current-turn]', {
      selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
      eligiblePoolLength: eligiblePool.length,
      courtCountUsed: targetCourtCount,
      requiredPlayers: targetCourtCount * (roundAutoIsSingles() ? 2 : 4),
      targetCourtCount,
      replanningPoolLength: eligiblePool.length,
    });

    const rebuiltActive = roundAutoBuildTurnWithStats(activeTurnNo, 'active', planningStats, true, {
      eligiblePool,
      courtCount: targetCourtCount,
    });

    if (!rebuiltActive) {
      gsAlert('현재 인원으로 대진 생성이 불가능합니다. 참가자 설정을 확인해주세요.');
      return;
    }

    const preservedTurnsForSeq = [
      ...prevTurns.filter(t => t?.status === 'done'),
      { turnNo: activeTurnNo, status: 'active', matches: doneMatches },
    ];
    const preservedSeqTracker = roundAutoCreateCourtGameSeqTracker(preservedTurnsForSeq);
    const regenStamp = Date.now();
    const rebuiltMatches = (rebuiltActive.matches || []).map((match, idx) => {
      const cleanMatch = {
        ...match,
        id: `ra-regen-${activeTurnNo}-${Number(match?.courtNo) || (idx + 1)}-${regenStamp}-${idx + 1}`,
        committed: false,
        winner: null,
        nextCourtAssigned: false,
        ts: undefined,
        logId: undefined,
        _courtDoneInFlight: false,
      };
      delete cleanMatch.courtGameSeq;
      roundAutoAssignCourtGameSeq(cleanMatch, preservedSeqTracker);
      return cleanMatch;
    });
    const mergedMatches = [...doneMatches, ...rebuiltMatches];
    roundAutoState.sessionStats = roundAutoCloneSessionStats(baselineStats);

    const newActiveTurn = {
      ...activeTurn,
      matches: mergedMatches,
      status: 'active',
      _planningStats: rebuiltActive._planningStats || roundAutoCloneSessionStats(roundAutoState.sessionStats),
    };
    const simulatedStats = roundAutoCloneSessionStats(newActiveTurn._planningStats);
    console.debug('[round-auto][preview-rebuild][regenerate-current-turn]', {
      selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
      eligiblePoolLength: roundAutoGetSelectedEligiblePool().length,
      courtCountUsed: targetCourtCount,
      requiredPlayers: targetCourtCount * (roundAutoIsSingles() ? 2 : 4),
      targetCourtCount,
      replanningPoolLength: eligiblePool.length,
    });
    const previewTurn = targetCourtCount > 1
      ? roundAutoBuildAllCourtPreviews(newActiveTurn, simulatedStats, { courtCount: targetCourtCount })
      : roundAutoBuildTurnWithStats(activeTurnNo + 1, 'preview', simulatedStats, false, {
        courtCount: targetCourtCount,
      });
    roundAutoState.turns = previewTurn
      ? [...prevTurns, newActiveTurn, previewTurn]
      : [...prevTurns, newActiveTurn];
    roundAutoState.turnNo = activeTurnNo;
    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();
  });
}

function roundAutoRegeneratePreview() {
  roundAutoSyncStateFromCurrentUI();

  const activeTurn = (roundAutoState.turns || []).find(t => t?.status === 'active');
  if (!activeTurn) {
    roundAutoGenerateNextTurn();
    return;
  }

  roundAutoState.previewVariant = Math.max(0, Number(roundAutoState.previewVariant) || 0) + 1;
  const previewTurnNo = Number(activeTurn.turnNo || 0) + 1;
  const simulatedStats = roundAutoCloneSessionStats(activeTurn._planningStats);
  console.debug('[round-auto][preview-rebuild][regenerate-preview]', {
    selectedPlayersLength: Array.isArray(roundAutoState.selectedPlayers) ? roundAutoState.selectedPlayers.length : 0,
    eligiblePoolLength: roundAutoGetSelectedEligiblePool().length,
    courtCountUsed: Number(roundAutoState.courtCount) || 1,
    requiredPlayers: (Number(roundAutoState.courtCount) || 1) * (roundAutoIsSingles() ? 2 : 4),
  });
  const previewTurn = roundAutoBuildTurnWithStats(previewTurnNo, 'preview', simulatedStats, false);
  if (!previewTurn) return;

  const preservedTurns = (roundAutoState.turns || []).filter(t => t?.status !== 'preview');
  roundAutoState.turns = [...preservedTurns, previewTurn];

  const normalized = roundAutoNormalizeTurnsState(roundAutoState);
  roundAutoState = normalized.state;
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  saveRoundAutoState();
}

function roundAutoAssignNextToCourt(matchId, mode, previewCourtNo) {
  return roundAutoAssignNextCourt(matchId, mode, previewCourtNo);
}

async function roundAutoCommitTurnToGlobalLog(activeTurn) {
  if (!activeTurn || !Array.isArray(activeTurn.matches)) return false;
  const decided = activeTurn.matches
    .filter(match => match && (match.winner === 'home' || match.winner === 'away'))
    .sort((a, b) => (Number(a?.ts) || 0) - (Number(b?.ts) || 0) || (Number(a?.courtNo) || 0) - (Number(b?.courtNo) || 0));

  for (const match of decided) {
    const ok = await roundAutoCommitSingleMatchToGlobalLog(activeTurn, match);
    if (!ok) return false;
  }

  if (decided.length) {
    activeTurn.committedTurn = decided.every(match => match?.committed);
  }
  return true;
}

function roundAutoSetWinner(matchId, side) {
  const activeTurn = (roundAutoState.turns || []).find(turn => turn?.status === 'active');
  if (!activeTurn) return;
  const match = (activeTurn.matches || []).find(item => item?.id === matchId);
  if (!match) return;
  if (side !== 'home' && side !== 'away') return;
  if (match._courtDoneInFlight) return;

  const applyWinner = async () => {
    match.winner = side;
    match.ts = Date.now();
    roundAutoRenderMatches();
    saveRoundAutoState();

    if ((Number(roundAutoState.courtCount) || 1) <= 1) {
      await roundAutoHandleSingleCourtDone(matchId);
    } else {
      await roundAutoHandleCourtDone(matchId);
    }
  };

  applyWinner().catch(e => {
    console.error('[round-auto][setWinner] applyWinner failed:', e);
  });
}


function roundAutoBoardNormalizePlayers(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(item => typeof item === 'string' ? item : (item?.name || '')).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (value && typeof value === 'object') {
    if (Array.isArray(value.players)) return roundAutoBoardNormalizePlayers(value.players);
    if (Array.isArray(value.members)) return roundAutoBoardNormalizePlayers(value.members);
    if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
  }
  return [];
}

function roundAutoBoardExtractSidePlayers(match, side) {
  if (!match) return [];
  const altKeys = side === 'home'
    ? ['team1', 'left', 'a', 'player1', 'players1', 'homeTeam', 'homePlayers', 'teamA']
    : ['team2', 'right', 'b', 'player2', 'players2', 'awayTeam', 'awayPlayers', 'teamB'];
  const candidates = [match[side], ...altKeys.map(key => match[key])];
  for (const value of candidates) {
    const arr = roundAutoBoardNormalizePlayers(value);
    if (arr.length) return arr;
  }
  if (Array.isArray(match.players) && match.players.length) {
    const list = roundAutoBoardNormalizePlayers(match.players);
    if (roundAutoIsSingles()) return side === 'home' ? list.slice(0, 1) : list.slice(1, 2);
    return side === 'home' ? list.slice(0, 2) : list.slice(2, 4);
  }
  return [];
}

function roundAutoBoardRenderSideText(match, side) {
  const names = roundAutoBoardExtractSidePlayers(match, side);
  if (!names.length) return '';
  return names.map(name => roundAutoPlayerLabel(name, '')).join(roundAutoIsSingles() ? ' vs ' : ' / ');
}

function roundAutoBoardHasTeams(match) {
  return !!(roundAutoBoardRenderSideText(match, 'home') && roundAutoBoardRenderSideText(match, 'away'));
}

function roundAutoBoardGetTypeText(match) {
  const rawType = String(match?.matchType || match?.type || roundAutoGetEventType() || '').toLowerCase();
  const genderType = String(match?.genderType || match?.division || '').toLowerCase();
  if (rawType === 'single' || rawType === 'singles') return '단식';
  if (genderType === 'mixed') return '혼복';
  if (genderType === 'female' || genderType === 'women') return '여복';
  if (genderType === 'male' || genderType === 'men') return '남복';
  return rawType === 'double' || rawType === 'doubles' || !rawType ? '복식' : '경기';
}

function roundAutoEnsureForecastModal() {
  let modal = document.getElementById('round-auto-forecast-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'round-auto-forecast-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:760px; width:min(94vw, 760px);">
      <div class="modal-header" style="display:flex; align-items:center; justify-content:center; gap:10px; text-align:center;">
        <div style="font-weight:800; font-size:18px; color:#0f172a;">전체예상대진표</div>
      </div>
      <div class="modal-body" id="round-auto-forecast-modal-body" style="max-height:min(72vh, 760px); overflow:auto; background:#f8fafc;"></div>
      <div class="modal-footer" style="justify-content:space-between; gap:8px;">
        <div style="font-size:11px; color:#64748b; text-align:left; line-height:1.45; flex:1;">
          호주색은 승리 팀, 회색은 패배 팀. 현재 진행 중인 경기는 기본 색으로 표시돼.
        </div>
        <button type="button" class="modal-btn modal-btn-primary" onclick="roundAutoCloseForecastModal()">
          <span class="material-symbols-outlined btn-ico">done</span>확인
        </button>
      </div>
    </div>`;
  modal.addEventListener('click', evt => {
    if (evt.target === modal) roundAutoCloseForecastModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function roundAutoCloseForecastModal() {
  const modal = document.getElementById('round-auto-forecast-modal');
  if (modal) modal.classList.remove('active');
}

function roundAutoBuildForecastTurns(depth = 4) {
  const courtCount = Math.max(1, Number(roundAutoState?.courtCount) || 1);
  const turns = Array.isArray(roundAutoState?.turns) ? roundAutoState.turns : [];
  const realTurns = turns.filter(turn => turn?.status !== 'preview');
  const latestTurnNo = realTurns.reduce((max, turn) => Math.max(max, Number(turn?.turnNo) || 0), Number(roundAutoState?.turnNo) || 0);
  const courtSeqTracker = roundAutoCreateCourtGameSeqTracker(realTurns);
  const forecastTurns = [];
  const statsRef = roundAutoCloneSessionStats(roundAutoState?.sessionStats || {});
  const snapshot = {
    nextMatchType: roundAutoState?.nextMatchType,
    mixedStreak: roundAutoState?.mixedStreak,
    matchupHistory: JSON.parse(JSON.stringify(roundAutoState?.matchupHistory || {})),
    partnerHistory: JSON.parse(JSON.stringify(roundAutoState?.partnerHistory || {})),
    previewVariant: roundAutoState?.previewVariant,
  };
  const originalAlert = typeof gsAlert === 'function' ? gsAlert : null;

  try {
    if (typeof window !== 'undefined' && originalAlert) window.gsAlert = () => {};
    let nextTurnNo = latestTurnNo + 1;
    for (let i = 0; i < depth; i += 1) {
      const turn = roundAutoBuildTurnWithStats(nextTurnNo, 'preview', statsRef, true, { courtCount });
      if (!turn || !Array.isArray(turn.matches) || !turn.matches.length) break;
      turn.matches = turn.matches
        .filter(match => roundAutoBoardHasTeams(match))
        .map(match => {
          const cloned = JSON.parse(JSON.stringify(match));
          roundAutoAssignCourtGameSeq(cloned, courtSeqTracker);
          return cloned;
        });
      if (!turn.matches.length) break;
      forecastTurns.push(turn);
      nextTurnNo += 1;
    }
  } catch (err) {
    console.error('[round-auto][forecast-modal] forecast build failed:', err);
  } finally {
    if (typeof window !== 'undefined' && originalAlert) window.gsAlert = originalAlert;
    roundAutoState.nextMatchType = snapshot.nextMatchType;
    roundAutoState.mixedStreak = snapshot.mixedStreak;
    roundAutoState.matchupHistory = snapshot.matchupHistory;
    roundAutoState.partnerHistory = snapshot.partnerHistory;
    roundAutoState.previewVariant = snapshot.previewVariant;
  }

  return forecastTurns;
}

function roundAutoBuildCourtBoardData(options = {}) {
  const courtCount = Math.max(1, Number(roundAutoState?.courtCount) || 1);
  const minCardsPerCourt = Math.max(1, Number(options.minCardsPerCourt) || 5);
  const board = Array.from({ length: courtCount }, (_, idx) => ({ courtNo: idx + 1, matches: [] }));
  const turns = Array.isArray(roundAutoState?.turns) ? roundAutoState.turns : [];
  const realTurns = turns
    .filter(turn => turn?.status !== 'preview')
    .slice()
    .sort((a, b) => (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0));

  realTurns.forEach(turn => {
    (Array.isArray(turn?.matches) ? turn.matches : [])
      .filter(match => match && roundAutoBoardHasTeams(match) && Number(match?.courtNo) >= 1)
      .slice()
      .sort((a, b) => (Number(a?.courtGameSeq) || 0) - (Number(b?.courtGameSeq) || 0) || (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0))
      .forEach(match => {
        const courtNo = Number(match?.courtNo) || 0;
        if (courtNo < 1 || courtNo > courtCount) return;
        board[courtNo - 1].matches.push({
          ...JSON.parse(JSON.stringify(match)),
          boardStatus: (match.winner === 'home' || match.winner === 'away') ? 'done' : 'live',
        });
      });
  });

  const forecastTurns = roundAutoBuildForecastTurns(Math.max(minCardsPerCourt, 5));
  for (const turn of forecastTurns) {
    (Array.isArray(turn?.matches) ? turn.matches : []).forEach(match => {
      const courtNo = Number(match?.courtNo) || 0;
      if (courtNo < 1 || courtNo > courtCount) return;
      if (board[courtNo - 1].matches.length >= minCardsPerCourt) return;
      board[courtNo - 1].matches.push({
        ...JSON.parse(JSON.stringify(match)),
        boardStatus: 'forecast',
      });
    });
    if (board.every(court => court.matches.length >= minCardsPerCourt)) break;
  }

  return board.map(court => ({
    courtNo: court.courtNo,
    matches: court.matches.slice(0, Math.max(minCardsPerCourt, court.matches.length)),
  }));
}

function roundAutoRenderForecastModalBody(boardData) {
  const escapeHtml = value => roundAutoEscape(value == null ? '' : String(value));
  const getStatusChip = match => {
    if (match?.boardStatus === 'done') return { label: '완료', style: 'background:#64748b; color:#fff;' };
    if (match?.boardStatus === 'live') return { label: '진행중', style: 'background:var(--wimbledon-sage); color:#fff;' };
    return { label: '예정', style: 'background:var(--roland-clay); color:#fff;' };
  };
  const renderVersusLine = match => {
    const homeText = escapeHtml(roundAutoBoardRenderSideText(match, 'home') || '미정');
    const awayText = escapeHtml(roundAutoBoardRenderSideText(match, 'away') || '미정');
    const homeWinner = match?.winner === 'home';
    const awayWinner = match?.winner === 'away';
    const isDone = homeWinner || awayWinner;
    const renderTeamPill = (text, state) => {
      let bg = '#ffffff';
      let fg = '#0f172a';
      let border = '1px solid #e2e8f0';
      if (state === 'winner') {
        bg = 'var(--aussie-blue)';
        fg = '#ffffff';
        border = '1px solid var(--aussie-blue)';
      } else if (state === 'loser') {
        bg = '#e5e7eb';
        fg = '#6b7280';
        border = '1px solid #d1d5db';
      }
      return `<span style="display:inline-flex; align-items:center; max-width:100%; min-width:0; padding:8px 10px; border-radius:12px; background:${bg}; color:${fg}; border:${border}; font-size:13px; font-weight:800; line-height:1.35; white-space:normal; word-break:keep-all;">${text}</span>`;
    };
    const homeState = isDone ? (homeWinner ? 'winner' : 'loser') : 'normal';
    const awayState = isDone ? (awayWinner ? 'winner' : 'loser') : 'normal';
    return `
      <div style="display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:nowrap; min-width:0;">
        <div style="flex:1; min-width:0; text-align:right;">${renderTeamPill(homeText, homeState)}</div>
        <div style="flex:0 0 auto; font-size:12px; font-weight:900; color:#94a3b8; letter-spacing:0.02em;">vs</div>
        <div style="flex:1; min-width:0; text-align:left;">${renderTeamPill(awayText, awayState)}</div>
      </div>`;
  };
  const emptyHtml = `
    <div style="padding:18px 14px; border:1px dashed #cbd5e1; border-radius:14px; background:#fff; color:#94a3b8; font-size:12px; text-align:center;">
      아직 표시할 경기 없음
    </div>`;
  return `
    <div style="display:flex; flex-direction:column; gap:14px;">
      ${boardData.map(court => `
        <div class="team-box" style="padding:0; overflow:hidden; border-radius:16px; border:1px solid #dbe4ea; box-shadow:0 8px 22px rgba(15,23,42,0.05);">
          <div style="background:var(--wimbledon-sage); color:#fff; padding:12px 16px; font-size:15px; font-weight:800;">🎾 코트 ${court.courtNo}</div>
          <div style="padding:14px; display:flex; flex-direction:column; gap:12px; background:#f8fafc;">
            ${court.matches.length ? court.matches.map(match => {
              const chip = getStatusChip(match);
              const seq = Number(match?.courtGameSeq) || 0;
              return `
                <div style="padding:12px; border-radius:14px; background:#fff; border:1px solid #e5e7eb;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
                    <div style="font-size:13px; font-weight:800; color:#0f172a;">${seq > 0 ? `${seq}경기` : '예상 경기'} ${escapeHtml(roundAutoBoardGetTypeText(match))}</div>
                    <span style="font-size:11px; font-weight:800; padding:4px 9px; border-radius:999px; ${chip.style}">${chip.label}</span>
                  </div>
                  ${renderVersusLine(match)}
                </div>`;
            }).join('') : emptyHtml}
          </div>
        </div>`).join('')}
    </div>`;
}

function roundAutoOpenForecastModal() {
  const modal = roundAutoEnsureForecastModal();
  const body = document.getElementById('round-auto-forecast-modal-body');
  if (!body) return;
  const boardData = roundAutoBuildCourtBoardData({ minCardsPerCourt: 5 });
  body.innerHTML = roundAutoRenderForecastModalBody(boardData);
  modal.classList.add('active');
}

function roundAutoRenderMatches() {
  const list = document.getElementById('round-auto-match-list')
    || document.getElementById('roundAutoMatchList')
    || document.querySelector('#round-auto-match-list, #roundAutoMatchList');
  if (!list) return;

  const turns = Array.isArray(roundAutoState.turns) ? roundAutoState.turns : [];
  const activeTurn = turns.find(turn => turn?.status === 'active');
  const previewTurn = turns.find(turn => turn?.status === 'preview');
  const courtCount = Math.max(1, Number(roundAutoState.courtCount) || 1);
  const courtHeaderBg = 'var(--wimbledon-sage)';

  const escapeHtml = value => roundAutoEscape(value == null ? '' : String(value));
  const normalizePlayers = value => {
    if (Array.isArray(value)) {
      return value.filter(Boolean).map(item => typeof item === 'string' ? item : (item?.name || '')).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    if (value && typeof value === 'object') {
      if (Array.isArray(value.players)) return normalizePlayers(value.players);
      if (Array.isArray(value.members)) return normalizePlayers(value.members);
      if (typeof value.name === 'string' && value.name.trim()) return [value.name.trim()];
    }
    return [];
  };
  const extractSidePlayers = (match, side) => {
    if (!match) return [];
    const altKeys = side === 'home'
      ? ['team1', 'left', 'a', 'player1', 'players1', 'homeTeam', 'homePlayers', 'teamA']
      : ['team2', 'right', 'b', 'player2', 'players2', 'awayTeam', 'awayPlayers', 'teamB'];
    const candidates = [match[side], ...altKeys.map(key => match[key])];
    for (const value of candidates) {
      const arr = normalizePlayers(value);
      if (arr.length) return arr;
    }
    if (Array.isArray(match.players) && match.players.length) {
      const list2 = normalizePlayers(match.players);
      if (roundAutoIsSingles()) return side === 'home' ? list2.slice(0, 1) : list2.slice(1, 2);
      return side === 'home' ? list2.slice(0, 2) : list2.slice(2, 4);
    }
    return [];
  };
  const renderSideText = (match, side) => {
    const names = extractSidePlayers(match, side);
    if (!names.length) return '';
    return names.map(name => roundAutoPlayerLabel(name, '')).join(roundAutoIsSingles() ? ' vs ' : ' / ');
  };
  const hasTeams = match => !!(renderSideText(match, 'home') && renderSideText(match, 'away'));
  const getTypeText = match => {
    const rawType = String(match?.matchType || match?.type || roundAutoGetEventType() || '').toLowerCase();
    const genderType = String(match?.genderType || match?.division || '').toLowerCase();
    if (rawType === 'single' || rawType === 'singles') return '단식';
    if (genderType === 'mixed') return '혼복';
    if (genderType === 'female' || genderType === 'women') return '여복';
    if (genderType === 'male' || genderType === 'men') return '남복';
    return rawType === 'double' || rawType === 'doubles' || !rawType ? '복식' : '경기';
  };
  const statusInfo = match => {
    if (!match) return { label: '', style: 'background:#e5e7eb; color:#475569;' };
    if (match.winner === 'home' || match.winner === 'away') {
      return { label: '완료', style: 'background:#64748b; color:#fff;' };
    }
    return { label: '진행중', style: 'background:var(--wimbledon-sage); color:#fff;' };
  };
  const previewBadgeStyle = 'background:var(--roland-clay); color:#fff;';
  const pickLiveMatchForCourt = courtNo => {
    // ✅ v6.41: nextCourtAssigned 필터 제거 — 렌더 시점에 이 플래그로 경기를 제외하면
    // 진행중인 경기가 null로 처리돼 선수명 공백 버그 발생
    const matches = (activeTurn?.matches || [])
      .filter(match => Number(match?.courtNo) === Number(courtNo))
      .sort((a, b) => (Number(a?.courtGameSeq) || 0) - (Number(b?.courtGameSeq) || 0) || (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0));
    const unresolved = matches.filter(match => match?.winner !== 'home' && match?.winner !== 'away');
    return unresolved.find(hasTeams) || unresolved[0] || matches.find(hasTeams) || matches[0] || null;
  };
  const renderTeamButtons = (match, clickable) => {
    if (!match || !hasTeams(match)) {
      return '<div style="font-size:12px; color:#9ca3af; text-align:center; padding:8px 0;">배정된 경기 없음.</div>';
    }
    const homeText = escapeHtml(renderSideText(match, 'home'));
    const awayText = escapeHtml(renderSideText(match, 'away'));
    const homeSelected = match.winner === 'home';
    const awaySelected = match.winner === 'away';
    const btnTag = clickable ? 'button' : 'div';
    const disabledStyle = clickable ? '' : 'pointer-events:none; opacity:0.78; cursor:default;';
    const baseStyle = 'flex:1; min-height:40px; border-radius:10px; border:none; background:#d0846c; color:#fff; padding:10px 8px; font-size:12px; font-weight:700; text-align:center;';
    const homeStyle = baseStyle + (homeSelected ? ' background:var(--wimbledon-sage); color:#fff; border-color:var(--wimbledon-sage);' : '') + disabledStyle;
    const awayStyle = baseStyle + (awaySelected ? ' background:var(--wimbledon-sage); color:#fff; border-color:var(--wimbledon-sage);' : '') + disabledStyle;
    const homeClick = clickable ? `onclick="roundAutoSetWinner('${match.id}','home')"` : '';
    const awayClick = clickable ? `onclick="roundAutoSetWinner('${match.id}','away')"` : '';
    return `
      <div style="display:flex; align-items:center; gap:8px;">
        <${btnTag} class="${clickable ? 'opt-btn' : ''}" ${homeClick} style="${homeStyle}">${homeText}</${btnTag}>
        <div style="font-size:12px; font-weight:700; color:#94a3b8; flex-shrink:0;">vs</div>
        <${btnTag} class="${clickable ? 'opt-btn' : ''}" ${awayClick} style="${awayStyle}">${awayText}</${btnTag}>
      </div>`;
  };
  const renderCurrentCourtCard = courtNo => {
    const match = pickLiveMatchForCourt(courtNo);
    const label = match
      ? `게임${Number(match?.courtGameSeq) || 1} ${getTypeText(match)}`
      : '배정 없음';
    const badge = statusInfo(match);
    return `
      <div class="team-box" style="padding:0; margin-bottom:14px; overflow:hidden; border-radius:14px;">
        <div style="background:${courtHeaderBg}; color:#fff; padding:10px 14px; font-weight:800; font-size:14px;">🎾 코트 ${courtNo}</div>
        <div style="padding:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
            <div style="font-size:13px; font-weight:800; color:#0f172a;">${escapeHtml(label)}</div>
            ${badge.label ? `<span style="font-size:11px; font-weight:700; border-radius:999px; padding:4px 8px; ${badge.style}">${badge.label}</span>` : ''}
          </div>
          ${renderTeamButtons(match, !!match && hasTeams(match) && match.winner !== 'home' && match.winner !== 'away')}
        </div>
      </div>`;
  };
  const renderPreviewQueue = () => {
    const queueMatches = (previewTurn?.matches || []).filter(match => hasTeams(match));
    if (!queueMatches.length) {
      return `
        <div style="margin-bottom:10px; padding:12px; border:1px dashed #d1d5db; border-radius:10px; background:#f9fafb;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-size:12px; font-weight:700; color:#6b7280;">⏳ 가능한 미리보기 대전</div>
            <span style="font-size:11px; color:#fff; border-radius:999px; padding:2px 8px; ${previewBadgeStyle}">미리보기</span>
          </div>
          <div style="font-size:12px; color:#9ca3af; text-align:center; padding:8px 0;">인원 부족으로 생성 불가</div>
        </div>`;
    }
    const rows = queueMatches.map((match, idx) => {
      const reasonText = roundAutoReasonText(match);
      return `
      <div style="display:flex; gap:8px; align-items:flex-start; padding:8px 0; ${idx > 0 ? 'border-top:1px dashed #e5e7eb;' : ''}">
        <div style="min-width:48px; font-size:12px; font-weight:800; color:#334155;">${idx + 1}순위</div>
        <div style="flex:1;">
          <div style="font-size:12px; color:#0f172a; font-weight:700; line-height:1.45;">${escapeHtml(getTypeText(match))} / ${escapeHtml(renderSideText(match, 'home'))} vs ${escapeHtml(renderSideText(match, 'away'))}</div>
          ${reasonText ? `<div style="margin-top:4px; font-size:11px; color:#6b7280; line-height:1.4;"><span style="font-weight:700; color:#475569;">추천 이유</span><br>${escapeHtml(reasonText)}</div>` : ''}
        </div>
        <span style="font-size:11px; font-weight:700; border-radius:999px; padding:3px 8px; ${previewBadgeStyle}">예정</span>
      </div>`;
    }).join('');
    return `
      <div style="margin-bottom:10px; padding:12px; border:1px dashed #d1d5db; border-radius:10px; background:#f9fafb;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="font-size:12px; font-weight:700; color:#6b7280;">⏳ 가능한 미리보기 대전</div>
          <span style="font-size:11px; color:#fff; border-radius:999px; padding:2px 8px; ${previewBadgeStyle}">미리보기</span>
        </div>
        ${rows}
      </div>`;
  };

  if (!turns.length) {
    list.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">생성된 매치가 없습니다.</div>';
    return;
  }

  if (activeTurn) {
    if (courtCount >= 2) {
      const currentCards = [];
      for (let courtNo = 1; courtNo <= courtCount; courtNo += 1) currentCards.push(renderCurrentCourtCard(courtNo));
      list.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
            <div style="font-weight:700; font-size:13px; color:var(--wimbledon-sage);">이번 턴 대진표</div>
            <button type="button" class="btn-main" onclick="roundAutoOpenForecastModal()"
              style="width:auto; margin-top:0; background:var(--aussie-blue); font-size:12px; padding:8px 12px; white-space:nowrap; flex:0 0 auto;">
              📋 전체예상대진표
            </button>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <div style="font-size:11px; color:#64748b; font-weight:700;">코트별 독립 진행</div>
            <span style="font-size:11px; color:#fff; background:var(--wimbledon-sage); border-radius:999px; padding:3px 8px;">진행중</span>
          </div>
          ${currentCards.join('')}
          ${renderPreviewQueue()}
          <button type="button" class="btn-main" onclick="roundAutoRegenerateCurrentTurn()"
            style="width:100%; margin-top:8px; background:#b85c38; font-size:13px; padding:10px 12px;">
            🔄 현재 대진 재생성
          </button>
          <div style="font-size:11px; color:#999; text-align:center; margin-top:6px;">코트 수나 참가선수 변화가 있으면 재생성해주세요</div>
        </div>`;
      return;
    }

    list.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13px; color:var(--wimbledon-sage);">이번 턴 대진표</div>
          <button type="button" class="btn-main" onclick="roundAutoOpenForecastModal()"
            style="width:auto; margin-top:0; background:var(--aussie-blue); font-size:12px; padding:8px 12px; white-space:nowrap; flex:0 0 auto;">
            📋 전체예상대진표
          </button>
        </div>
        <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:8px;">
          <span style="font-size:11px; color:#fff; background:var(--wimbledon-sage); border-radius:999px; padding:3px 8px;">진행중</span>
        </div>
        ${renderCurrentCourtCard(1)}
        ${renderPreviewQueue()}
        <button type="button" class="btn-main" onclick="roundAutoRegenerateCurrentTurn()"
          style="width:100%; margin-top:8px; background:#b85c38; font-size:13px; padding:10px 12px;">
          🔄 현재 대진 재생성
        </button>
        <div style="font-size:11px; color:#999; text-align:center; margin-top:6px;">코트 수나 참가선수 변화가 있으면 재생성해주세요</div>
      </div>`;
      return;
  }

  list.innerHTML = '<div style="font-size:12px; color:#999; text-align:center; padding:10px;">생성된 매치가 없습니다.</div>';
}

async function roundAutoGenerateNextTurn() {
  roundAutoSyncStateFromCurrentUI();
  roundAutoState.turns = (roundAutoState.turns || []).filter(turn => turn?.status !== 'preview');

  const doneTurns = (roundAutoState.turns || []).filter(turn => turn?.status === 'done');
  if (doneTurns.length > 0 && Object.keys(roundAutoState.sessionStats || {}).length === 0) {
    roundAutoState.sessionStats = roundAutoRebuildSessionStatsBaseline(
      roundAutoGetSelectedEligiblePool(),
      doneTurns,
    );
    console.warn('[round-auto] sessionStats 재계산됨 (리셋 방지)');
  }

  const existingActive = (roundAutoState.turns || []).find(turn => turn?.status === 'active');
  if (existingActive) {
    const allDone = (existingActive.matches || []).every(match => match && (match.winner === 'home' || match.winner === 'away'));
    if (!allDone) {
      gsAlert('현재 진행 중인 턴의 승자를 먼저 선택해주세요.');
      return;
    }
    const committed = await roundAutoCommitTurnToGlobalLog(existingActive);
    if (!committed) return;
    existingActive.status = 'done';
  }

  const nextTurnNo = (Number(roundAutoState.turnNo) || 0) + 1;
  const realStats = roundAutoCloneSessionStats();
  const activeTurn = roundAutoBuildTurnWithStats(nextTurnNo, 'active', realStats, true);
  if (!activeTurn) return;

  const nextTurns = (roundAutoState.turns || []).filter(turn => turn?.status === 'done');
  nextTurns.push(activeTurn);

  if ((Number(roundAutoState.courtCount) || 1) <= 1) {
    const simulatedStats = roundAutoCloneSessionStats(activeTurn._planningStats);
    const previewTurn = roundAutoBuildTurnWithStats(nextTurnNo + 1, 'preview', simulatedStats, false);
    if (previewTurn) nextTurns.push(previewTurn);
  } else {
    const previewTurn = roundAutoBuildAllCourtPreviews(activeTurn, activeTurn._planningStats);
    if (previewTurn && Array.isArray(previewTurn.matches) && previewTurn.matches.length) nextTurns.push(previewTurn);
  }

  roundAutoState.turns = nextTurns;
  roundAutoState.turnNo = nextTurnNo;
  const normalized = roundAutoNormalizeTurnsState(roundAutoState);
  roundAutoState = normalized.state;
  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  saveRoundAutoState();
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

  // ✅ v5.91: selectedPlayers 전체 미리 등록 — 새로 투입된 선수도 0경기로 표시
  (roundAutoState.selectedPlayers || []).forEach(name => ensure(name));

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
// ========================================
// ✅ v5.31: 수동 모드 관련 함수들
// ========================================

// 수동 모드 상태 (라운드 자동생성 뷰 내 토글)
let roundAutoManualMode = false;
// 수동 배치 중인 코트별 선수 임시 저장
let roundAutoManualCourts = []; // [{ courtNo, players: [name, ...], matchType: 'double'|'single' }, ...]

function roundAutoSetMode(mode) {
  roundAutoManualMode = (mode === 'manual');

  const btnAuto = document.getElementById('round-auto-mode-auto');
  const btnManual = document.getElementById('round-auto-mode-manual');
  const manualSelect = document.getElementById('round-auto-manual-select');

  if (btnAuto) {
    btnAuto.style.background = roundAutoManualMode ? 'white' : 'var(--aussie-blue)';
    btnAuto.style.color = roundAutoManualMode ? 'var(--aussie-blue)' : 'white';
  }
  if (btnManual) {
    btnManual.style.background = roundAutoManualMode ? 'var(--aussie-blue)' : 'white';
    btnManual.style.color = roundAutoManualMode ? 'white' : 'var(--aussie-blue)';
  }

  // 수동 모드 진입 시 배치 UI 초기화 후 표시
  if (roundAutoManualMode) {
    roundAutoInitManualCourts();
    if (manualSelect) manualSelect.style.display = 'block';
  } else {
    if (manualSelect) manualSelect.style.display = 'none';
  }
}

function roundAutoGetEditableLiveMatchForCourt(courtNo) {
  const turns = Array.isArray(roundAutoState.turns) ? roundAutoState.turns : [];
  const activeTurn = turns.find(turn => turn?.status === 'active');
  if (!activeTurn) return null;
  const matches = (activeTurn.matches || [])
    .filter(match => Number(match?.courtNo) === Number(courtNo))
    .sort((a, b) => (Number(a?.courtGameSeq) || 0) - (Number(b?.courtGameSeq) || 0) || (Number(a?.turnNo) || 0) - (Number(b?.turnNo) || 0));
  const unresolved = matches.filter(match => match?.winner !== 'home' && match?.winner !== 'away');
  return unresolved[0] || null;
}

function roundAutoInitManualCourts() {
  const courtCount = Math.max(1, Number(roundAutoState.courtCount) || 1);
  let loadedFromCurrent = false;

  roundAutoManualCourts = Array.from({ length: courtCount }, (_, i) => {
    const courtNo = i + 1;
    const liveMatch = roundAutoGetEditableLiveMatchForCourt(courtNo);
    if (liveMatch) {
      const home = Array.isArray(liveMatch.home) ? liveMatch.home.filter(Boolean) : [];
      const away = Array.isArray(liveMatch.away) ? liveMatch.away.filter(Boolean) : [];
      const players = [...home, ...away];
      if (players.length) loadedFromCurrent = true;
      return {
        courtNo,
        players,
        matchType: String(liveMatch.matchType || '').toLowerCase() === 'single' ? 'single' : 'double',
      };
    }
    return {
      courtNo,
      players: [],
      matchType: 'double',
    };
  });

  roundAutoState._manualLoadedFromCurrent = loadedFromCurrent;
  roundAutoRenderManualCourts();
}

function roundAutoRenderManualCourts() {
  const container = document.getElementById('round-auto-manual-courts');
  if (!container) return;

  const eligiblePool = roundAutoGetSelectedEligiblePool();
  const assignedNames = new Set(roundAutoManualCourts.flatMap(c => c.players));

  // 미배치 선수 목록
  const unassigned = eligiblePool.filter(p => !assignedNames.has(p.name));

  let html = '';

  // 코트별 배치 현황
  roundAutoManualCourts.forEach(court => {
    const slots = court.players;
    const isDouble = court.matchType !== 'single';
    const maxPlayers = isDouble ? 4 : 2;
    const isFull = slots.length >= maxPlayers;

    const toggleBtn = (type, label) => {
      const active = court.matchType === type || (!court.matchType && type === 'double');
      return `<button onclick="roundAutoManualSetMatchType(${court.courtNo}, '${type}')"
        style="padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600; border:1px solid var(--aussie-blue);
               background:${active ? 'var(--aussie-blue)' : 'white'}; color:${active ? 'white' : 'var(--aussie-blue)'}; cursor:pointer;">${label}</button>`;
    };

    const playerTag = (name) =>
      `<span onclick="roundAutoManualRemovePlayer(${court.courtNo}, '${roundAutoEscape(name)}')"
        style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; background:var(--aussie-blue); color:white; border-radius:20px; font-size:12px; font-weight:600; cursor:pointer;">
        ${roundAutoEscape(roundAutoPlayerLabel(name, ''))}
        <span style="font-size:10px; opacity:0.8;">✕</span>
      </span>`;

    const courtInner = isFull
      ? (isDouble
          ? `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
               <div style="display:flex; gap:4px;">${slots.slice(0,2).map(playerTag).join('')}</div>
               <div style="font-size:13px; font-weight:700; color:#888;">vs</div>
               <div style="display:flex; gap:4px;">${slots.slice(2,4).map(playerTag).join('')}</div>
             </div>`
          : `<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
               ${playerTag(slots[0])}
               <div style="font-size:13px; font-weight:700; color:#888;">vs</div>
               ${playerTag(slots[1])}
             </div>`)
      : `<div style="display:flex; flex-wrap:wrap; gap:6px; min-height:32px;">
           ${slots.map(playerTag).join('')}
           ${!slots.length ? '<span style="font-size:11px; color:#bbb;">선수를 탭해서 배치하세요</span>' : ''}
         </div>`;

    html += `
      <div style="margin-bottom:10px; padding:8px; background:white; border-radius:10px; border:1px solid #ddd;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div style="font-size:12px; font-weight:700; color:var(--aussie-blue);">코트 ${court.courtNo} <span style="font-weight:400; color:#888;">(${slots.length}/${maxPlayers}명)</span></div>
          <div style="display:flex; gap:4px;">${toggleBtn('double','복식')}${toggleBtn('single','단식')}</div>
        </div>
        ${courtInner}
      </div>
    `;
  });

  const manualHint = roundAutoState._manualLoadedFromCurrent
    ? '현재 대진을 불러왔어요. 그대로 둘 코트는 두고, 바꿀 코트만 선수 태그를 눌러 수정하세요.'
    : '선수를 탭해서 코트에 배치하세요. 처음부터 수동 시작이면 코트 수만큼 빈 슬롯으로 시작합니다.';

  // 미배치 선수 풀
  html += `
    <div style="margin:2px 0 10px; padding:8px 10px; background:#eef6ff; border:1px solid #dbeafe; border-radius:10px; font-size:11px; color:#355070;">${manualHint}</div>
    <div style="margin-top:8px;">
      <div style="font-size:12px; color:#555; font-weight:600; margin-bottom:6px;">미배치 선수 <span style="color:#888; font-weight:400;">(탭하면 코트에 배치)</span></div>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${unassigned.length
          ? unassigned.map(p => `
              <span onclick="roundAutoManualAssignPlayer('${roundAutoEscape(p.name)}')"
                style="display:inline-flex; align-items:center; gap:3px; padding:5px 10px; background:#f3f4f6; border:1px solid #ddd; border-radius:20px; font-size:12px; cursor:pointer;">
                ${roundAutoEscape(roundAutoPlayerLabel(p.name, ''))}
              </span>
            `).join('')
          : '<span style="font-size:11px; color:#bbb;">모든 선수가 배치됨</span>'
        }
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// 선수를 첫 번째 빈 코트에 배치
function roundAutoManualAssignPlayer(name) {
  // 이미 배치된 경우 무시
  for (const court of roundAutoManualCourts) {
    if (court.players.includes(name)) return;
  }
  // 빈 슬롯 있는 첫 번째 코트에 배치
  for (const court of roundAutoManualCourts) {
    const maxPlayers = court.matchType === 'single' ? 2 : 4;
    if (court.players.length < maxPlayers) {
      court.players.push(name);
      roundAutoRenderManualCourts();
      return;
    }
  }
  gsAlert('모든 코트가 가득 찼습니다.');
}

// 코트에서 선수 제거
function roundAutoManualRemovePlayer(courtNo, name) {
  const court = roundAutoManualCourts.find(c => c.courtNo === courtNo);
  if (!court) return;
  court.players = court.players.filter(n => n !== name);
  roundAutoRenderManualCourts();
}

// ✅ v5.5: 완료된 코트에 다음 대진 배정
function roundAutoAssignNextCourt(matchId, mode, previewCourtNo) {
  const turns = roundAutoState.turns || [];
  const activeTurn = turns.find(t => t?.status === 'active');
  if (!activeTurn) return;

  const match = (activeTurn.matches || []).find(m => m.id === matchId);
  if (!match) return;

  const courtNo = match.courtNo;

  if (mode === 'preview') {
    // ✅ v5.52: previewCourtNo 지정 시 해당 코트 대진 선택, 없으면 동일 코트
    const previewTurn = turns.find(t => t?.status === 'preview');
    if (!previewTurn) {
      gsAlert('미리보기 대진이 없습니다. 직접 입력해주세요.');
      return;
    }
    const targetCourtNo = previewCourtNo != null ? Number(previewCourtNo) : courtNo;
    const previewMatch = (previewTurn.matches || []).find(m => m.courtNo === targetCourtNo);
    if (!previewMatch) {
      gsAlert(`미리보기에 코트${targetCourtNo} 대진이 없습니다. 직접 입력해주세요.`);
      return;
    }

    // 미리보기 대진을 현재 턴에 새 경기로 추가
    const newMatch = {
      ...previewMatch,
      id: `ra-next-${activeTurn.turnNo}-${courtNo}-${Date.now()}`,
      turnNo: activeTurn.turnNo,
      status: 'active',
      winner: null,
      isNextCourt: true,
    };
    roundAutoAssignCourtGameSeq(newMatch, roundAutoCreateCourtGameSeqTracker());
    activeTurn.matches.push(newMatch);
    match.nextCourtAssigned = true;

    // 미리보기에서 해당 코트 제거
    previewTurn.matches = (previewTurn.matches || []).filter(m => m.courtNo !== courtNo);

    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();

  } else if (mode === 'manual') {
    // 수동 입력 — 해당 코트만 수동 UI 열기
    roundAutoManualMode = true;
    roundAutoManualCourts = [{
      courtNo,
      players: [],
      matchType: 'double',
    }];

    // 수동 UI 표시
    const manualSelect = document.getElementById('round-auto-manual-select');
    if (manualSelect) {
      manualSelect.style.display = 'block';
      // 안내 문구 추가
      const hint = document.getElementById('round-auto-next-court-hint') || document.createElement('div');
      hint.id = 'round-auto-next-court-hint';
      hint.style.cssText = 'margin-bottom:10px; padding:8px 12px; background:#f0f7f0; border-radius:8px; font-size:12px; color:#2d7a2d; font-weight:600;';
      hint.textContent = `코트${courtNo} 다음 경기 선수를 선택하세요`;
      manualSelect.insertAdjacentElement('afterbegin', hint);
    }

    // 확정 버튼 동작을 코트 추가 모드로 변경
    roundAutoState._nextCourtMatchId = matchId;
    roundAutoRenderManualCourts();
    const modeAuto = document.getElementById('round-auto-mode-auto');
    const modeManual = document.getElementById('round-auto-mode-manual');
    if (modeAuto) { modeAuto.style.background = 'white'; modeAuto.style.color = 'var(--aussie-blue)'; }
    if (modeManual) { modeManual.style.background = 'var(--aussie-blue)'; modeManual.style.color = 'white'; }
  }
}

// ✅ v5.5: 코트별 단/복식 전환
function roundAutoManualSetMatchType(courtNo, matchType) {
  const court = roundAutoManualCourts.find(c => c.courtNo === courtNo);
  if (!court) return;
  court.matchType = matchType;
  if (matchType === 'single' && court.players.length > 2) {
    court.players = court.players.slice(0, 2);
  }
  roundAutoRenderManualCourts();
}

// 수동 대진 확정 → active 턴으로 생성
async function roundAutoConfirmManual() {
  const courtCount = roundAutoState.courtCount || 1;

  // ✅ v5.5: 코트 추가 모드 (다음 코트 수동 입력)
  if (roundAutoState._nextCourtMatchId) {
    const matchId = roundAutoState._nextCourtMatchId;
    delete roundAutoState._nextCourtMatchId;

    const turns = roundAutoState.turns || [];
    const activeTurn = turns.find(t => t?.status === 'active');
    if (!activeTurn) return;
    const origMatch = (activeTurn.matches || []).find(m => m.id === matchId);
    if (!origMatch) return;

    const court = roundAutoManualCourts[0];
    const required = court.matchType === 'single' ? 2 : 4;
    if (court.players.length !== required) {
      const typeName = court.matchType === 'single' ? '단식(2명)' : '복식(4명)';
      gsAlert(`${typeName} — ${required}명을 배치해주세요.`);
      return;
    }

    const isSingle = court.matchType === 'single';
    const newMatch = {
      id: `ra-next-${activeTurn.turnNo}-${court.courtNo}-${Date.now()}`,
      turnNo: activeTurn.turnNo,
      courtNo: court.courtNo,
      matchType: isSingle ? 'single' : 'double',
      home: isSingle ? [court.players[0]] : [court.players[0], court.players[1]],
      away: isSingle ? [court.players[1]] : [court.players[2], court.players[3]],
      winner: null,
      isNextCourt: true,
      manual: true,
    };
    roundAutoAssignCourtGameSeq(newMatch, roundAutoCreateCourtGameSeqTracker());
    activeTurn.matches.push(newMatch);
    origMatch.nextCourtAssigned = true;

    roundAutoManualMode = false;
    roundAutoManualCourts = [];
    roundAutoState._manualLoadedFromCurrent = false;
    const manualSelect = document.getElementById('round-auto-manual-select');
    if (manualSelect) manualSelect.style.display = 'none';
    const hint = document.getElementById('round-auto-next-court-hint');
    if (hint) hint.remove();

    const normalized = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalized.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();
    return;
  }

  // ✅ v5.5: 유효성 검사 — 단식 2명, 복식 4명
  for (const court of roundAutoManualCourts) {
    const required = court.matchType === 'single' ? 2 : 4;
    if (court.players.length !== required) {
      const typeName = court.matchType === 'single' ? '단식(2명)' : '복식(4명)';
      gsAlert(`코트 ${court.courtNo}는 ${typeName}입니다. ${required}명을 배치해주세요.`);
      return;
    }
  }

  // 기존 preview 턴 제거
  roundAutoState.turns = (roundAutoState.turns || []).filter(t => t?.status !== 'preview');

  const existingActive = roundAutoState.turns.find(t => t?.status === 'active');

  // ✅ v6.43: 현재 대진 불러온 상태(수동 전환) → 기존 active 턴의 미결 경기만 교체
  if (existingActive && roundAutoState._manualLoadedFromCurrent) {
    // committed(결과 확정)된 경기는 보존, 미결 경기만 수동 배치로 교체
    const committedMatches = (existingActive.matches || []).filter(
      m => m.winner === 'home' || m.winner === 'away'
    );
    const manualCourtSeqTrackerEdit = roundAutoCreateCourtGameSeqTracker();
    const replacedMatches = roundAutoManualCourts.map((court, idx) => {
      const isSingle = court.matchType === 'single';
      const newMatch = {
        id: `ra-m-edit-${existingActive.turnNo}-${idx + 1}-${Date.now()}`,
        turnNo: existingActive.turnNo,
        courtNo: court.courtNo,
        matchType: isSingle ? 'single' : 'double',
        home: isSingle ? [court.players[0]] : [court.players[0], court.players[1]],
        away: isSingle ? [court.players[1]] : [court.players[2], court.players[3]],
        winner: null,
        committed: false,
        manual: true,
      };
      roundAutoAssignCourtGameSeq(newMatch, manualCourtSeqTrackerEdit);
      return newMatch;
    });
    existingActive.matches = [...committedMatches, ...replacedMatches];

    // sessionStats: 교체된 경기 참여자 반영
    const editStatsRef = roundAutoCloneSessionStats();
    const editEligiblePool = roundAutoGetSelectedEligiblePool();
    const editActivePlayers = roundAutoManualCourts.flatMap(c => c.players)
      .map(name => editEligiblePool.find(p => p.name === name))
      .filter(Boolean);
    roundAutoApplyTurnParticipation(editActivePlayers, editEligiblePool, existingActive.turnNo, editStatsRef);
    roundAutoState.sessionStats = editStatsRef;

    roundAutoManualMode = false;
    roundAutoManualCourts = [];
    roundAutoState._manualLoadedFromCurrent = false;
    const manualSelectEdit = document.getElementById('round-auto-manual-select');
    if (manualSelectEdit) manualSelectEdit.style.display = 'none';

    const normalizedEdit = roundAutoNormalizeTurnsState(roundAutoState);
    roundAutoState = normalizedEdit.state;
    roundAutoRenderMatches();
    roundAutoRenderRanking();
    roundAutoRenderPersonalRanking();
    saveRoundAutoState();
    return;
  }

  // 현재 active 턴이 있으면 승자 확인 후 커밋 (신규 턴 시작)
  if (existingActive) {
    const allDone = (existingActive.matches || []).every(m => m.winner === 'home' || m.winner === 'away');
    if (!allDone) {
      gsAlert('현재 진행 중인 턴의 승자를 먼저 선택해주세요.');
      return;
    }
    await roundAutoCommitTurnToGlobalLog(existingActive);
    existingActive.status = 'done';
  }

  const newTurnNo = (roundAutoState.turnNo || 0) + 1;

  // ✅ v5.5: 단식 1vs1, 복식 2vs2
  const matches = roundAutoManualCourts.map((court, idx) => {
    const isSingle = court.matchType === 'single';
    return {
      id: `ra-m-${newTurnNo}-${idx + 1}`,
      turnNo: newTurnNo,
      courtNo: court.courtNo,
      matchType: isSingle ? 'single' : 'double',
      home: isSingle ? [court.players[0]] : [court.players[0], court.players[1]],
      away: isSingle ? [court.players[1]] : [court.players[2], court.players[3]],
      winner: null,
      manual: true,
    };
  });
  const manualCourtSeqTracker = roundAutoCreateCourtGameSeqTracker();
  matches.forEach(match => roundAutoAssignCourtGameSeq(match, manualCourtSeqTracker));

  // sessionStats 업데이트 (출전/휴식 기록 반영)
  const statsRef = roundAutoCloneSessionStats();
  const eligiblePool = roundAutoGetSelectedEligiblePool();
  const activePlayers = roundAutoManualCourts.flatMap(c => c.players)
    .map(name => eligiblePool.find(p => p.name === name))
    .filter(Boolean);
  roundAutoApplyTurnParticipation(activePlayers, eligiblePool, newTurnNo, statsRef);

  // partnerHistory 업데이트
  matches.forEach(m => {
    const [a, b] = m.home;
    const [c, d] = m.away;
    roundAutoState.partnerHistory[a] = [b, ...(roundAutoState.partnerHistory[a] || []).filter(x => x !== b)].slice(0, 4);
    roundAutoState.partnerHistory[b] = [a, ...(roundAutoState.partnerHistory[b] || []).filter(x => x !== a)].slice(0, 4);
    roundAutoState.partnerHistory[c] = [d, ...(roundAutoState.partnerHistory[c] || []).filter(x => x !== d)].slice(0, 4);
    roundAutoState.partnerHistory[d] = [c, ...(roundAutoState.partnerHistory[d] || []).filter(x => x !== c)].slice(0, 4);
  });

  // ✅ v5.32: matchupHistory 업데이트 — 자동 엔진이 수동 턴 조합을 인식하도록
  const history = roundAutoState.matchupHistory || {};
  const teamKey  = team => [...team].sort().join('|');
  const matchKey = (home, away) => [teamKey(home), teamKey(away)].sort().join('||');

  matches.forEach(m => {
    const hKey = teamKey(m.home);
    const aKey = teamKey(m.away);
    const gKey = matchKey(m.home, m.away);

    // 수동 턴 선수들의 성별 파악 → 어느 history 버킷에 넣을지 결정
    const eligPool = roundAutoGetSelectedEligiblePool();
    const getGender = name => {
      const p = eligPool.find(x => x.name === name);
      return p?.gender === 'F' ? 'F' : 'M';
    };
    const homeGenders = m.home.map(getGender);
    const awayGenders = m.away.map(getGender);
    const allGenders  = [...homeGenders, ...awayGenders];
    const maleCount   = allGenders.filter(g => g === 'M').length;
    const femaleCount = allGenders.filter(g => g === 'F').length;

    let bucket;
    if (femaleCount === 0)      bucket = 'sameMale';
    else if (maleCount === 0)   bucket = 'sameFemale';
    else                        bucket = 'mixed';

    if (!history[`${bucket}TeamKeys`])  history[`${bucket}TeamKeys`]  = [];
    if (!history[`${bucket}MatchKeys`]) history[`${bucket}MatchKeys`] = [];
    if (!history[`${bucket}TeamKeys`].includes(hKey))  history[`${bucket}TeamKeys`].push(hKey);
    if (!history[`${bucket}TeamKeys`].includes(aKey))  history[`${bucket}TeamKeys`].push(aKey);
    if (!history[`${bucket}MatchKeys`].includes(gKey)) history[`${bucket}MatchKeys`].push(gKey);

    // ✅ v5.32: nextMatchType — 수동 턴 후 같은 타입 유지, 자동 엔진이 가능 여부 판단
    const createdType = bucket === 'sameMale' ? 'M' : (bucket === 'sameFemale' ? 'F' : 'X');
    if (createdType === 'M') {
      roundAutoState.nextMatchType = 'M'; // 남복 유지 — 자동이 M 불가 시 F→X로 자연 fallback
      roundAutoState.mixedStreak   = 0;
    } else if (createdType === 'F') {
      roundAutoState.nextMatchType = 'F'; // 여복 유지 — 자동이 F 불가 시 X→M으로 자연 fallback
      roundAutoState.mixedStreak   = 0;
    } else {
      if ((roundAutoState.mixedStreak || 0) <= 0) {
        roundAutoState.nextMatchType = 'X';
        roundAutoState.mixedStreak   = 1;
      } else {
        roundAutoState.nextMatchType = 'M';
        roundAutoState.mixedStreak   = 2;
      }
    }
  });
  roundAutoState.matchupHistory = history;

  const newTurn = {
    turnNo: newTurnNo,
    matches,
    status: 'active',
    manual: true,
    _planningStats: roundAutoCloneSessionStats(statsRef),
  };
  roundAutoState.turns.push(newTurn);
  roundAutoState.turnNo = newTurnNo;
  roundAutoState.previewVariant = 0;

  // 다음 턴 미리보기 자동 생성
  const previewTurnNo = newTurnNo + 1;
  const simulatedStats = roundAutoCloneSessionStats(newTurn._planningStats);
  const previewTurn = roundAutoBuildTurnWithStats(previewTurnNo, 'preview', simulatedStats, false);
  if (previewTurn) roundAutoState.turns.push(previewTurn);

  const normalized = roundAutoNormalizeTurnsState(roundAutoState);
  roundAutoState = normalized.state;

  // 수동 배치 UI 숨기기 & 자동 모드로 복귀
  roundAutoManualMode = false;
  roundAutoManualCourts = [];
  roundAutoState._manualLoadedFromCurrent = false;
  const manualSelect = document.getElementById('round-auto-manual-select');
  if (manualSelect) manualSelect.style.display = 'none';
  const btnAuto = document.getElementById('round-auto-mode-auto');
  const btnManual = document.getElementById('round-auto-mode-manual');
  if (btnAuto) { btnAuto.style.background = 'var(--aussie-blue)'; btnAuto.style.color = 'white'; }
  if (btnManual) { btnManual.style.background = 'white'; btnManual.style.color = 'var(--aussie-blue)'; }

  roundAutoRenderMatches();
  roundAutoRenderRanking();
  roundAutoRenderPersonalRanking();
  saveRoundAutoState();
}

function roundAutoReset() {
  roundAutoState = createRoundAutoInitialState();
  // ✅ v5.635: 수동배치 상태도 함께 초기화
  roundAutoManualMode = false;
  roundAutoManualCourts = [];
  roundAutoState._manualLoadedFromCurrent = false;
  const manualSelect = document.getElementById('round-auto-manual-select');
  if (manualSelect) manualSelect.style.display = 'none';
  const clubId = roundAutoGetSelectedClubId();
  try {
    localStorage.removeItem(roundAutoStorageKey(clubId));
  } catch (e) {
    console.warn('[round-auto] state clear failed:', e);
  }
  // ✅ 3-1: Firebase에서도 삭제
  if (clubId && typeof _db !== 'undefined') {
    _db.collection('clubs').doc(clubId)
      .collection('settings').doc('roundAutoState')
      .delete()
      .catch(e => console.warn('[round-auto] Firebase reset failed:', e));
  }
  initRoundAutoPlayerPool();
}

function roundAutoViewOpen() {
  return showViewUI('round-auto');
}

window.roundAutoStorageKey = roundAutoStorageKey;
window.initRoundAutoPlayerPool = initRoundAutoPlayerPool;
window.roundAutoGenerateNextTurn = roundAutoGenerateNextTurn;
window.roundAutoRegenerateCurrentTurn = roundAutoRegenerateCurrentTurn;
window.roundAutoAssignNextCourt = roundAutoAssignNextCourt;
window.roundAutoManualSetMatchType = roundAutoManualSetMatchType;
window.roundAutoRegeneratePreview = roundAutoRegeneratePreview;
window.roundAutoSetWinner = roundAutoSetWinner;
window.roundAutoHandleSingleCourtDone = roundAutoHandleSingleCourtDone;
window.roundAutoRenderMatches = roundAutoRenderMatches;
window.roundAutoHandleCourtDone = roundAutoHandleCourtDone;
window.roundAutoStartSession = roundAutoStartSession;
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
// ✅ v5.31: 수동 모드
window.roundAutoSetMode = roundAutoSetMode;
window.roundAutoConfirmManual = roundAutoConfirmManual;
window.roundAutoManualAssignPlayer = roundAutoManualAssignPlayer;
window.roundAutoManualRemovePlayer = roundAutoManualRemovePlayer;


window.roundAutoOpenForecastModal = roundAutoOpenForecastModal;
window.roundAutoCloseForecastModal = roundAutoCloseForecastModal;


/* Forecast modal UI micro patch v3 */
(function(){
  try {
    var style = document.createElement('style');
    style.innerHTML = `
    .forecast-confirm-btn{
      width:50% !important;
      padding:10px 14px;
      margin:20px auto 0;
      display:block;
    }
    .forecast-desc{
      display:none !important;
    }
    `;
    document.head.appendChild(style);
  } catch (e) {}
})();
