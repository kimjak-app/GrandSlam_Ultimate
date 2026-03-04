// ========================================
// EXCHANGE_ENGINE.JS - 교류전 데이터/계산 엔진
// ========================================

const EXCHANGE_LANG = {
  ongoing: '진행중', finished: '완료',
  wins: '데이비스컵 방식', score: '총점 방식',
  singles: '단식', doubles: '복식',
  normal: '정상경기', forfeit: '기권승', cancelled: '경기취소',
};

let activeExchange        = null;
let isSimulation          = false;
let exchangeGuestsA       = [];
let exchangeGuestsB       = [];
let exchangeClubBPlayers  = [];
let exchangeCurrentTab    = 'game';
let exPickedHome          = [];
let exPickedAway          = [];
let exMatchCategory       = 'singles';
let exSetupSelectedClubId = null;

function _exchangeColRef(clubId) {
  return _clubRef(clubId || getActiveClubId()).collection('exchanges');
}

function _exchangeRef(exchangeId, clubId) {
  return _exchangeColRef(clubId).doc(exchangeId);
}

async function createExchange(config) {
  const clubId = getActiveClubId();
  const { ts, ds } = nowISO();
  const id = `ex-${ts}-${Math.floor(Math.random() * 100000)}`;

  const exchange = {
    id, clubAId: clubId,
    clubBId: config.clubBId || null,
    clubBName: config.clubBName,
    isClubBTemp: config.isClubBTemp || false,
    victoryMode: config.victoryMode,
    handicapEnabled: config.handicapEnabled,
    status: 'ongoing',
    gameIds: [],
    scoreA: 0, scoreB: 0,
    winsA: 0, winsB: 0,
    singlesWinsA: 0, singlesWinsB: 0,
    doublesWinsA: 0, doublesWinsB: 0,
    singlesLossA: 0, singlesLossB: 0,
    doublesLossA: 0, doublesLossB: 0,
    seasonId: 'season1',
    createdAt: ts, date: ds, finishedAt: null,
  };

  try {
    await _exchangeRef(id, clubId).set(exchange);
    activeExchange = exchange;
    renderExchangeView();
    return exchange;
  } catch (e) {
    console.error('[exchange] createExchange error:', e);
    gsAlert('교류전 생성 실패 😵');
    return null;
  }
}

async function fetchActiveExchange(clubId) {
  try {
    const snap = await _exchangeColRef(clubId)
      .where('status', '==', 'ongoing').orderBy('createdAt', 'desc').limit(1).get();
    activeExchange = snap.empty ? null : snap.docs[0].data();
    return activeExchange;
  } catch (e) {
    console.error('[exchange] fetchActiveExchange error:', e);
    return null;
  }
}

async function fetchExchangeHistory(clubId) {
  try {
    const snap = await _exchangeColRef(clubId)
      .where('status', '==', 'finished').orderBy('createdAt', 'desc').limit(20).get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.error('[exchange] fetchExchangeHistory error:', e);
    return [];
  }
}

function calculateExchangePoint(isWin, matchCount, isHandicapEnabled) {
  if (!isWin) return 0.3;
  if (!isHandicapEnabled) return 1.0;
  if (matchCount <= 2) return 1.0;
  return Math.max(1.0 - (matchCount - 2) * 0.2, 0.2);
}

function getPlayerExchangeMatchCount(exchangeId, playerName) {
  return matchLog.filter(g =>
    g.exchangeId === exchangeId &&
    g.resultType !== 'cancelled' &&
    [...(g.home || []), ...(g.away || [])].includes(playerName)
  ).length;
}

function calcExchangePoints(logEntry, exchange) {
  const { home, away, winner, resultType } = logEntry;
  const zero = arr => (arr || []).map(() => 0);
  if (resultType === 'cancelled') return { home: zero(home), away: zero(away) };

  const homeWin = winner === 'home';
  const pts = (names, isWin) => (names || []).map(name => {
    if (resultType === 'forfeit') return isWin ? 1.0 : 0;
    const count = getPlayerExchangeMatchCount(exchange.id, name) + 1;
    return calculateExchangePoint(isWin, count, exchange.handicapEnabled);
  });
  return { home: pts(home, homeWin), away: pts(away, !homeWin) };
}

async function updateExchangeAggregate(exchange, logEntry, points) {
  if (logEntry.resultType === 'cancelled') return;

  const homeIsA   = logEntry.clubSideHome === 'A';
  const homeTotal = (points.home || []).reduce((a, b) => a + b, 0);
  const awayTotal = (points.away || []).reduce((a, b) => a + b, 0);
  const deltaA    = homeIsA ? homeTotal : awayTotal;
  const deltaB    = homeIsA ? awayTotal : homeTotal;
  const homeWin   = logEntry.winner === 'home';
  const aWin      = (homeIsA && homeWin) || (!homeIsA && !homeWin);
  const isSingles = logEntry.matchCategory === 'singles';

  const FV = firebase.firestore.FieldValue;
  const update = {
    scoreA: FV.increment(deltaA), scoreB: FV.increment(deltaB),
    winsA:  FV.increment(aWin ? 1 : 0), winsB: FV.increment(aWin ? 0 : 1),
    gameIds: FV.arrayUnion(logEntry.id),
  };

  if (isSingles) {
    update.singlesWinsA = FV.increment(aWin ? 1 : 0);
    update.singlesWinsB = FV.increment(aWin ? 0 : 1);
    update.singlesLossA = FV.increment(aWin ? 0 : 1);
    update.singlesLossB = FV.increment(aWin ? 1 : 0);
  } else {
    update.doublesWinsA = FV.increment(aWin ? 1 : 0);
    update.doublesWinsB = FV.increment(aWin ? 0 : 1);
    update.doublesLossA = FV.increment(aWin ? 0 : 1);
    update.doublesLossB = FV.increment(aWin ? 1 : 0);
  }

  try {
    await _exchangeRef(exchange.id).update(update);
    activeExchange.scoreA += deltaA;
    activeExchange.scoreB += deltaB;
    if (aWin) activeExchange.winsA++; else activeExchange.winsB++;
  } catch (e) {
    console.error('[exchange] updateExchangeAggregate error:', e);
  }
}

async function saveExchangeGame(baseLogEntry, matchCategory, resultType, clubSideHome) {
  if (!activeExchange) return false;

  const logEntry = {
    ...baseLogEntry,
    exchangeId: activeExchange.id, matchCategory, resultType, clubSideHome,
    clubAId: activeExchange.clubAId, clubBId: activeExchange.clubBId,
    clubBName: activeExchange.clubBName || '',
  };

  const points = calcExchangePoints(logEntry, activeExchange);
  logEntry.pointsHome = points.home;
  logEntry.pointsAway = points.away;

  const ok = await pushWithMatchLogAppend(logEntry);
  if (ok) {
    await updateExchangeAggregate(activeExchange, logEntry, points);
    renderExchangeScoreBar();
  }
  return ok;
}

function getExchangePlayerHint(playerName) {
  if (!activeExchange) return '';
  const count = getPlayerExchangeMatchCount(activeExchange.id, playerName) + 1;
  const pt = calculateExchangePoint(true, count, activeExchange.handicapEnabled);
  if (count >= 3 && activeExchange.handicapEnabled) {
    return `⚠ ${playerName} (${count}번째 출전) — 승리 시 ${pt}점 (핸디캡 적용)`;
  }
  return `${playerName} (${count}번째 출전) — 승리 시 ${pt}점`;
}

function getExchangeStatsForPlayer(playerName) {
  const exGames = matchLog.filter(g =>
    g.exchangeId && g.resultType !== 'cancelled' &&
    [...(g.home || []), ...(g.away || [])].includes(playerName)
  );

  let singleWin = 0, singleLoss = 0, doubleWin = 0, doubleLoss = 0;
  const vsClubs = {};

  exGames.forEach(g => {
    const inHome = (g.home || []).includes(playerName);
    const isWin = (inHome && g.winner === 'home') || (!inHome && g.winner === 'away');
    const isSingles = g.matchCategory === 'singles';
    if (isSingles) { isWin ? singleWin++ : singleLoss++; }
    else { isWin ? doubleWin++ : doubleLoss++; }

    const opponentName = inHome ? (g.clubBName || g.clubBId || '상대 클럽') : (g.clubBName || g.clubAId || '상대 클럽');
    if (opponentName) {
      if (!vsClubs[opponentName]) vsClubs[opponentName] = { win: 0, loss: 0 };
      isWin ? vsClubs[opponentName].win++ : vsClubs[opponentName].loss++;
    }
  });

  return { singleWin, singleLoss, doubleWin, doubleLoss, vsClubs };
}

function updateExchangeAggregateLocal(pts) {
  if (!activeExchange) return;
  const ex = activeExchange;
  const homeTotal = (pts.home || []).reduce((a, b) => a + b, 0);
  const awayTotal = (pts.away || []).reduce((a, b) => a + b, 0);
  const homeWin = homeTotal > awayTotal;
  ex.scoreA += homeTotal;
  ex.scoreB += awayTotal;
  if (homeWin) {
    ex.winsA++;
    ex.singlesWinsA += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesWinsA += exMatchCategory === 'doubles' ? 1 : 0;
    ex.singlesLossB += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesLossB += exMatchCategory === 'doubles' ? 1 : 0;
  } else {
    ex.winsB++;
    ex.singlesWinsB += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesWinsB += exMatchCategory === 'doubles' ? 1 : 0;
    ex.singlesLossA += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesLossA += exMatchCategory === 'doubles' ? 1 : 0;
  }
}
