// ========================================
// ✅ v5.0: 교류전 (Exchange Match) 시스템
// js/exchange.js
//
// Firestore 컬렉션 구조:
//   clubs/{clubId}/exchanges/{exchangeId}   ← 교류전 객체
//   clubs/{clubId}/matchLog/{matchId}       ← 기존 경로 유지 (exchangeId 필드 추가)
//
// 의존성:
//   - api.js: _clubRef(), getActiveClubId(), pushWithMatchLogAppend()
//   - game.js: calculatePoint 없음 → 여기서 자체 정의
//   - state.js: players, matchLog, currentClub
// ========================================

// ========================================
// LANG 상수 (i18n 레이어 — UI 표시용)
// 저장값은 영문 고정, UI만 한글
// ========================================
const EXCHANGE_LANG = {
  // status
  ongoing: '진행중',
  finished: '완료',
  // victoryMode
  wins: '데이비스컵 방식',
  score: '총점 방식',
  // matchCategory
  singles: '단식',
  doubles: '복식',
  // resultType
  normal: '정상경기',
  forfeit: '기권승',
  cancelled: '경기취소',
};

// ========================================
// 전역 상태
// ========================================
let activeExchange = null;        // 현재 진행 중인 교류전 객체
let isSimulation = false;          // 시뮬레이션 모드 여부
let exchangeGuestsA = [];         // 클럽A 당일 게스트 [{name, gender}]
let exchangeGuestsB = [];         // 클럽B 당일 게스트 [{name, gender}]
let exchangeClubBPlayers = [];    // 클럽B 정식 선수 목록
let exchangeCurrentTab = 'game';  // 'game' | 'ranking' | 'stats' | 'history'

// ========================================
// FIRESTORE 헬퍼
// ========================================

function _exchangeColRef(clubId) {
  return _clubRef(clubId || getActiveClubId()).collection('exchanges');
}

function _exchangeRef(exchangeId, clubId) {
  return _exchangeColRef(clubId).doc(exchangeId);
}

// ========================================
// 1. 교류전 생성 / 종료
// ========================================

async function createExchange(config) {
  // config: { clubBId, clubBName, isClubBTemp, victoryMode, handicapEnabled }
  const clubId = getActiveClubId();
  const { ts, ds } = nowISO();
  const id = `ex-${ts}-${Math.floor(Math.random() * 100000)}`;

  const exchange = {
    id,
    clubAId: clubId,
    clubBId: config.clubBId || null,
    clubBName: config.clubBName,
    isClubBTemp: config.isClubBTemp || false,
    victoryMode: config.victoryMode,   // 'wins' | 'score'
    handicapEnabled: config.handicapEnabled,
    status: 'ongoing',
    gameIds: [],
    scoreA: 0,
    scoreB: 0,
    winsA: 0,
    winsB: 0,
    singlesWinsA: 0,
    singlesWinsB: 0,
    doublesWinsA: 0,
    doublesWinsB: 0,
    singlesLossA: 0,
    singlesLossB: 0,
    doublesLossA: 0,
    doublesLossB: 0,
    seasonId: 'season1',   // UI 미노출 — 미래 시즌 확장용
    createdAt: ts,
    date: ds,
    finishedAt: null,
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

async function finishExchange() {
  if (isSimulation) {
    gsConfirm('시뮬레이션을 종료하시겠습니까?\n종료 후에는 점수 수정이 불가능합니다.', (ok) => {
      if (!ok) return;
      activeExchange = null;
      isSimulation = false;
      if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
      if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
      if ($('ex-scoreboard')) $('ex-scoreboard').style.display = 'none';
      initExchangeView();
    });
    return;
  }
  if (!activeExchange) return;
  gsConfirm('교류전을 종료하시겠습니까?\n종료 후에는 점수 수정이 불가능합니다.', async (ok) => {
    if (!ok) return;
    const { ts } = nowISO();
    try {
      await _exchangeRef(activeExchange.id).update({
        status: 'finished',
        finishedAt: ts,
      });
      activeExchange.status = 'finished';
      activeExchange.finishedAt = ts;
      activeExchange = null;
      if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
      if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
      if ($('ex-scoreboard')) $('ex-scoreboard').style.display = 'none';
      gsAlert('교류전이 종료되었습니다!');
      showView('game');
    } catch (e) {
      console.error('[exchange] finishExchange error:', e);
      gsAlert('종료 처리 실패 😵');
    }
  });
}

async function fetchActiveExchange(clubId) {
  try {
    const snap = await _exchangeColRef(clubId)
      .where('status', '==', 'ongoing')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!snap.empty) {
      activeExchange = snap.docs[0].data();
      return activeExchange;
    }
    return null;
  } catch (e) {
    console.error('[exchange] fetchActiveExchange error:', e);
    return null;
  }
}

async function fetchExchangeHistory(clubId) {
  try {
    const snap = await _exchangeColRef(clubId)
      .where('status', '==', 'finished')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.error('[exchange] fetchExchangeHistory error:', e);
    return [];
  }
}

// ========================================
// 2. 점수 계산 엔진
// ========================================

function calculateExchangePoint(isWin, matchCount, isHandicapEnabled) {
  if (!isWin) return 0.3;                          // 패배: 고정
  if (!isHandicapEnabled) return 1.0;              // 핸디캡 OFF: 승리 1.0
  if (matchCount <= 2) return 1.0;                 // 1~2번째: 1.0
  const score = 1.0 - (matchCount - 2) * 0.2;     // 3번째~: 0.2씩 차감
  return Math.max(score, 0.2);                     // 최저 0.2
}

function getPlayerExchangeMatchCount(exchangeId, playerName) {
  // 해당 교류전에서 선수의 현재까지 출전 횟수 (경기취소 제외)
  return matchLog.filter(g =>
    g.exchangeId === exchangeId &&
    g.resultType !== 'cancelled' &&
    ([...(g.home || []), ...(g.away || [])].includes(playerName))
  ).length;
}

function calcExchangePoints(logEntry, exchange) {
  // 경기 하나의 선수별 점수 계산
  const { home, away, winner, resultType } = logEntry;
  const zeroHome = (home || []).map(() => 0);
  const zeroAway = (away || []).map(() => 0);

  if (resultType === 'cancelled') return { home: zeroHome, away: zeroAway };

  const isHandicap = exchange.handicapEnabled;
  const homeWin = winner === 'home';

  const pts = (names, isWin) => (names || []).map(name => {
    if (resultType === 'forfeit') return isWin ? 1.0 : 0;
    const count = getPlayerExchangeMatchCount(exchange.id, name) + 1; // +1 = 이번 경기 포함
    return calculateExchangePoint(isWin, count, isHandicap);
  });

  return {
    home: pts(home, homeWin),
    away: pts(away, !homeWin),
  };
}

// ========================================
// 3. 집계 엔진 (Aggregator)
// ========================================

async function updateExchangeAggregate(exchange, logEntry, points) {
  if (logEntry.resultType === 'cancelled') return; // 경기취소 집계 제외

  const homeIsA = logEntry.clubSideHome === 'A'; // 'A' | 'B'
  const homeTotal = (points.home || []).reduce((a, b) => a + b, 0);
  const awayTotal = (points.away || []).reduce((a, b) => a + b, 0);

  const deltaA = homeIsA ? homeTotal : awayTotal;
  const deltaB = homeIsA ? awayTotal : homeTotal;
  const homeWin = logEntry.winner === 'home';
  const aWin = (homeIsA && homeWin) || (!homeIsA && !homeWin);
  const isSingles = logEntry.matchCategory === 'singles';

  const update = {
    scoreA: firebase.firestore.FieldValue.increment(deltaA),
    scoreB: firebase.firestore.FieldValue.increment(deltaB),
    winsA: firebase.firestore.FieldValue.increment(aWin ? 1 : 0),
    winsB: firebase.firestore.FieldValue.increment(aWin ? 0 : 1),
    gameIds: firebase.firestore.FieldValue.arrayUnion(logEntry.id),
  };

  // 단식/복식 세부 집계
  if (isSingles) {
    update.singlesWinsA = firebase.firestore.FieldValue.increment(aWin ? 1 : 0);
    update.singlesWinsB = firebase.firestore.FieldValue.increment(aWin ? 0 : 1);
    update.singlesLossA = firebase.firestore.FieldValue.increment(aWin ? 0 : 1);
    update.singlesLossB = firebase.firestore.FieldValue.increment(aWin ? 1 : 0);
  } else {
    update.doublesWinsA = firebase.firestore.FieldValue.increment(aWin ? 1 : 0);
    update.doublesWinsB = firebase.firestore.FieldValue.increment(aWin ? 0 : 1);
    update.doublesLossA = firebase.firestore.FieldValue.increment(aWin ? 0 : 1);
    update.doublesLossB = firebase.firestore.FieldValue.increment(aWin ? 1 : 0);
  }

  try {
    await _exchangeRef(exchange.id).update(update);
    // 로컬 activeExchange도 즉시 반영
    activeExchange.scoreA += deltaA;
    activeExchange.scoreB += deltaB;
    if (aWin) { activeExchange.winsA++; } else { activeExchange.winsB++; }
  } catch (e) {
    console.error('[exchange] updateExchangeAggregate error:', e);
  }
}

// ========================================
// 4. 경기 저장 (game.js save() 에서 호출)
// ========================================

async function saveExchangeGame(baseLogEntry, matchCategory, resultType, clubSideHome) {
  // baseLogEntry: game.js save()에서 만든 기존 logEntry
  // matchCategory: 'singles' | 'doubles'
  // resultType: 'normal' | 'forfeit' | 'cancelled'
  // clubSideHome: 'A' | 'B' (홈팀이 클럽A인지 B인지)

  if (!activeExchange) return false;

  const logEntry = {
    ...baseLogEntry,
    exchangeId: activeExchange.id,
    matchCategory,
    resultType,
    clubSideHome,
    clubAId: activeExchange.clubAId,
    clubBId: activeExchange.clubBId,
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

// ========================================
// 5. 핸디캡 미리보기 (선수 선택 직후 호출)
// ========================================

function getExchangePlayerHint(playerName) {
  if (!activeExchange) return '';
  const count = getPlayerExchangeMatchCount(activeExchange.id, playerName) + 1;
  const pt = calculateExchangePoint(true, count, activeExchange.handicapEnabled);

  if (count >= 3 && activeExchange.handicapEnabled) {
    return `⚠ ${playerName} (${count}번째 출전) — 승리 시 ${pt}점 (핸디캡 적용)`;
  }
  return `${playerName} (${count}번째 출전) — 승리 시 ${pt}점`;
}

// ========================================
// 6. 당일 게스트 관리 (교류전 전용)
// ========================================

function addExchangeGuest(side, name, gender) {
  // side: 'A' | 'B'
  const guest = { name: name.trim(), gender, isGuest: true };
  if (side === 'A') {
    if (!exchangeGuestsA.find(g => g.name === guest.name)) exchangeGuestsA.push(guest);
  } else {
    if (!exchangeGuestsB.find(g => g.name === guest.name)) exchangeGuestsB.push(guest);
  }
  renderExchangePlayerPool(side);
}

function removeExchangeGuest(side, name) {
  if (side === 'A') exchangeGuestsA = exchangeGuestsA.filter(g => g.name !== name);
  else exchangeGuestsB = exchangeGuestsB.filter(g => g.name !== name);
  renderExchangePlayerPool(side);
}

// ========================================
// 7. 통계 집계 (교류전 전용)
// ========================================

function getExchangeStatsForPlayer(playerName) {
  // matchLog에서 exchangeId 있는 게임만 필터
  const exGames = matchLog.filter(g =>
    g.exchangeId &&
    g.resultType !== 'cancelled' &&
    ([...(g.home || []), ...(g.away || [])].includes(playerName))
  );

  let singleWin = 0, singleLoss = 0, doubleWin = 0, doubleLoss = 0;
  const vsClubs = {}; // { clubName: { win, loss } }

  exGames.forEach(g => {
    const inHome = (g.home || []).includes(playerName);
    const isWin = (inHome && g.winner === 'home') || (!inHome && g.winner === 'away');
    const isSingles = g.matchCategory === 'singles';

    if (isSingles) { isWin ? singleWin++ : singleLoss++; }
    else { isWin ? doubleWin++ : doubleLoss++; }

    // 상대 클럽 전적
    const opponentClubId = inHome ? g.clubBId : g.clubAId;
    if (opponentClubId) {
      if (!vsClubs[opponentClubId]) vsClubs[opponentClubId] = { win: 0, loss: 0 };
      isWin ? vsClubs[opponentClubId].win++ : vsClubs[opponentClubId].loss++;
    }
  });

  return { singleWin, singleLoss, doubleWin, doubleLoss, vsClubs };
}

// ========================================
// 8. 렌더링 함수들
// ========================================

function openExchange() {
  showView('exchange');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  initExchangeView();
}

async function initExchangeView() {
  const clubId = getActiveClubId();
  await fetchActiveExchange(clubId);
  switchExchangeTab(activeExchange ? 'game' : 'game');
  renderExchangeView();
}

function switchExchangeTab(tab) {
  exchangeCurrentTab = tab;
  ['game', 'ranking', 'stats', 'history'].forEach(t => {
    const btn = $(`ex-tab-${t}`);
    const view = $(`ex-view-${t}`);
    if (btn) btn.classList.toggle('active', t === tab);
    if (view) view.style.display = t === tab ? 'block' : 'none';
  });

  if (tab === 'ranking') renderExchangeRanking();
  if (tab === 'stats') renderExchangeStatsView();
  if (tab === 'history') renderExchangeHistory();
}

function renderExchangeView() {
  if (activeExchange && activeExchange.status === 'ongoing') {
    if ($('ex-start-area')) $('ex-start-area').style.display = 'none';
    if ($('ex-game-area')) $('ex-game-area').style.display = 'block';
    if ($('ex-scoreboard')) $('ex-scoreboard').style.display = 'block';
    renderExchangeScoreBar();
    renderExchangePlayerPool('A');
    // 클럽B — 등록 클럽이면 Firestore 로드, 당일팀이면 게스트만
    if (activeExchange && !activeExchange.isClubBTemp && activeExchange.clubBId) {
      loadClubBPlayers(activeExchange.clubBId);
    } else {
      renderExchangePlayerPool('B');
    }
    // 클럽 라벨 업데이트
    if ($('ex-club-label-a') && typeof currentClub !== 'undefined' && currentClub) {
      $('ex-club-label-a').textContent = currentClub.clubName + ' 선수';
    }
    if ($('ex-club-label-b') && activeExchange) {
      $('ex-club-label-b').textContent = activeExchange.clubBName + ' 선수';
    }
    // 가이드 문구 기본값(정상경기) 즉시 노출
    const _guideEl = $('ex-result-guide');
    if (_guideEl) {
      const _mode = activeExchange.victoryMode || 'wins';
      const _guides = {
        wins: { normal: '승리 팀에 1승을 추가합니다. (점수는 기록용)' },
        score: { normal: '양 팀의 득점을 합산하여 전체 스코어에 반영합니다.' },
      };
      _guideEl.textContent = (_guides[_mode] || _guides.wins).normal;
    }
  } else {
    if ($('ex-start-area')) $('ex-start-area').style.display = 'block';
    if ($('ex-game-area')) $('ex-game-area').style.display = 'none';
  }
}

function renderExchangeScoreBar() {
  // 전광판 업데이트
  if (!activeExchange) return;
  const ex = activeExchange;
  const clubAName = currentClub ? (currentClub.clubName || currentClub.name || '홈 클럽') : '홈 클럽';
  const clubBName = ex.clubBName || '원정 클럽';

  // 점수
  const scoreA = ex.victoryMode === 'score' ? ex.scoreA.toFixed(1) : ex.winsA;
  const scoreB = ex.victoryMode === 'score' ? ex.scoreB.toFixed(1) : ex.winsB;

  if ($('ex-score-a')) $('ex-score-a').textContent = scoreA;
  if ($('ex-score-b')) $('ex-score-b').textContent = scoreB;
  if ($('ex-club-name-a')) $('ex-club-name-a').textContent = clubAName;
  if ($('ex-club-name-b')) $('ex-club-name-b').textContent = clubBName;
  if ($('ex-detail-a')) $('ex-detail-a').textContent =
    `단식 ${ex.singlesWinsA}승${ex.singlesLossA}패 | 복식 ${ex.doublesWinsA}승${ex.doublesLossA}패`;
  if ($('ex-detail-b')) $('ex-detail-b').textContent =
    `단식 ${ex.singlesWinsB}승${ex.singlesLossB}패 | 복식 ${ex.doublesWinsB}승${ex.doublesLossB}패`;
  if ($('ex-mode-badge')) $('ex-mode-badge').textContent =
    EXCHANGE_LANG[ex.victoryMode] + (ex.handicapEnabled ? ' · 핸디캡' : '');

  // 득점 애니메이션
  animateScoreUpdate('ex-score-a');
  animateScoreUpdate('ex-score-b');
}

function animateScoreUpdate(elId) {
  const el = $(elId);
  if (!el) return;
  el.classList.remove('score-flash');
  void el.offsetWidth; // reflow
  el.classList.add('score-flash');
}

function renderExchangePlayerPool(side) {
  const el = $(`ex-pool-${side}`);
  if (!el) return;

  const isA = side === 'A';
  const clubPlayers = isA ? (players || []) : exchangeClubBPlayers;
  const guests = isA ? exchangeGuestsA : exchangeGuestsB;

  // 정식 선수 — p-label 스타일 (checkbox + label)
  let html = '';
  clubPlayers.forEach((p, idx) => {
    const gIcon = p.gender === 'F'
      ? '<span style="font-size:12px;color:#E8437A;vertical-align:middle;">♀</span>'
      : '<span style="font-size:12px;color:#3A7BD5;vertical-align:middle;">♂</span>';
    const rank = idx + 1;
    const chkId = `ex-chk-${side}-${p.name}`;
    html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${p.name}"`;
    html += ` onclick="exchangePickPlayer('${side}', '${p.name}')">`;
    html += `<label for="${chkId}" class="p-label">`;
    html += `${gIcon}${p.name}<span class="p-rank">${rank}위</span>`;
    html += `</label>`;
  });

  // 게스트 선수
  guests.forEach(p => {
    const gIcon = p.gender === 'F'
      ? '<span style="font-size:12px;color:#E8437A;vertical-align:middle;">♀</span>'
      : '<span style="font-size:12px;color:#3A7BD5;vertical-align:middle;">♂</span>';
    const chkId = `ex-chk-${side}-g-${p.name}`;
    html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${p.name}"`;
    html += ` onclick="exchangePickPlayer('${side}', '${p.name}')">`;
    html += `<label for="${chkId}" class="p-label day-guest-label">`;
    html += `[당일] ${gIcon}${p.name}`;
    html += `</label>`;
  });

  el.innerHTML = html;
}

// 클럽B 선수 Firestore에서 로드
async function loadClubBPlayers(clubBId) {
  if (!clubBId) { exchangeClubBPlayers = []; return; }
  try {
    exchangeClubBPlayers = await _fsGetPlayers(clubBId);
    renderExchangePlayerPool('B');
    // 클럽B 라벨 업데이트
    const label = $('ex-club-label-b');
    if (label && activeExchange) label.textContent = activeExchange.clubBName + ' 선수';
  } catch (e) {
    console.error('[exchange] loadClubBPlayers error:', e);
    exchangeClubBPlayers = [];
  }
}

function renderExchangeRanking() {
  // TODO: 교류전 개인/클럽 랭킹 렌더링
  // 기존 renderRankTable() 패턴 재사용
}

function renderExchangeStatsView() {
  // TODO: 교류전 통계 화면 렌더링
  // getExchangeStatsForPlayer() 호출
}

async function renderExchangeHistory() {
  const clubId = getActiveClubId();
  const history = await fetchExchangeHistory(clubId);
  const el = $('ex-history-list');
  if (!el) return;

  if (!history.length) {
    el.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">교류전 기록이 없습니다.</p>';
    return;
  }

  el.innerHTML = history.map(ex => `
    <div class="ex-history-item">
      <div class="ex-history-date">${ex.date}</div>
      <div class="ex-history-teams">
        <strong>${currentClub ? currentClub.name : '홈'}</strong>
        vs ${ex.clubBName}
      </div>
      <div class="ex-history-score">
        ${ex.victoryMode === 'score'
      ? `${ex.scoreA.toFixed(1)} : ${ex.scoreB.toFixed(1)}점`
      : `${ex.winsA}승 : ${ex.winsB}승`}
      </div>
      <div class="ex-history-mode">${EXCHANGE_LANG[ex.victoryMode]}</div>
    </div>
  `).join('');
}

// ========================================
// 9. 설정 모달 (교류전 시작 시)
// ========================================

function openExchangeSetupModal() {
  const modal = $('ex-setup-modal');
  if (modal) modal.style.display = 'flex';
  renderClubSearchInModal(); // 기존 클럽 검색 알고리즘 재사용
}

function closeExchangeSetupModal() {
  const modal = $('ex-setup-modal');
  if (modal) modal.style.display = 'none';
}

async function confirmExchangeSetup() {
  const clubBName = ($('ex-setup-club-b-name') || {}).value || '';
  if (!clubBName.trim()) { gsAlert('상대 클럽을 선택하거나 입력해주세요.'); return; }

  const victoryMode = document.querySelector('input[name="ex-victory-mode"]:checked')?.value || 'wins';
  const handicapEnabled = ($('ex-handicap-toggle') || {}).checked || false;

  closeExchangeSetupModal();
  await createExchange({
    clubBName: clubBName.trim(),
    clubBId: exSetupSelectedClubId || null,
    isClubBTemp: !exSetupSelectedClubId,
    victoryMode,
    handicapEnabled,
  });
}

// 설정 모달 내 클럽 검색 (기존 알고리즘 재사용)
let exSetupSelectedClubId = null;

function renderClubSearchInModal() {
  // 기존 클럽 리스트 검색 로직 재사용
  // clubList 전역 변수 활용
  exSetupSelectedClubId = null;
}

function searchClubInModal(keyword) {
  const q = (keyword || '').trim().toLowerCase();
  const filtered = (clubList || []).filter(c =>
    !q || (c.clubName || '').toLowerCase().includes(q)
  );
  renderClubSearchResults(filtered, 'ex-club-search-results');
}

function filterClubByRegion(elBtn, region) {
  // 지역 버튼 활성화
  document.querySelectorAll('.ex-region-chip').forEach(b => b.classList.remove('active'));
  if (elBtn) elBtn.classList.add('active');
  const filtered = (clubList || []).filter(c =>
    (c.region1 || '').includes(region)
  );
  renderClubSearchResults(filtered, 'ex-club-region-results');
}

function renderClubSearchResults(list, containerId) {
  const el = $(containerId || 'ex-club-search-results');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p style="color:#888; padding:12px; text-align:center;">검색 결과가 없습니다.</p>';
    return;
  }
  el.innerHTML = list.map(c => `
    <div class="ex-club-result-item" onclick="selectExchangeClubB('${c.clubId}', '${c.clubName}')">
      <strong>${c.clubName}</strong>
      <span class="ex-club-result-region">${c.region1 || ''} ${c.region2 || ''}</span>
    </div>
  `).join('');
}

function selectExchangeClubB(clubId, clubName) {
  exSetupSelectedClubId = clubId;
  if ($('ex-setup-club-b-name')) $('ex-setup-club-b-name').value = clubName;
  document.querySelectorAll('.ex-club-result-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('strong')?.textContent === clubName);
  });
}

// ========================================
// 10. 당일 게스트 추가 모달 (기존 확장)
// ========================================

function openExchangeGuestModal(side) {
  // side: 'A' | 'B'
  const modal = $('ex-guest-modal');
  if (modal) {
    modal.dataset.side = side;
    modal.style.display = 'flex';
    if ($('ex-guest-name')) $('ex-guest-name').value = '';
    // 성별 초기화
    const mRadio = document.querySelector('input[name="ex-guest-gender"][value="M"]');
    if (mRadio) mRadio.checked = true;
  }
}

function closeExchangeGuestModal() {
  const modal = $('ex-guest-modal');
  if (modal) modal.style.display = 'none';
}

function confirmExchangeGuest() {
  const modal = $('ex-guest-modal');
  if (!modal) return;
  const side = modal.dataset.side;
  const name = ($('ex-guest-name') || {}).value?.trim();
  const genderRadio = document.querySelector('input[name="ex-guest-gender"]:checked');
  const gender = genderRadio ? genderRadio.value : 'M';

  if (!name) { gsAlert('이름을 입력해주세요.'); return; }
  addExchangeGuest(side, name, gender);
  closeExchangeGuestModal();
}

// ========================================
// 경기 선수 선택 & 힌트
// ========================================

let exPickedHome = [];
let exPickedAway = [];
let exMatchCategory = 'singles'; // 'singles' | 'doubles'

function exchangePickPlayer(side, name) {
  const max = exMatchCategory === 'doubles' ? 2 : 1;
  const target = side === 'A' ? exPickedHome : exPickedAway;

  if (target.includes(name)) {
    const idx = target.indexOf(name);
    target.splice(idx, 1);
  } else {
    if (target.length >= max) {
      // 초과 시 기존 선택 해제
      const removed = target.shift();
      const oldChk = document.getElementById(`ex-chk-${side}-${removed}`) ||
        document.getElementById(`ex-chk-${side}-g-${removed}`);
      if (oldChk) oldChk.checked = false;
    }
    target.push(name);
    // 핸디캡 힌트
    const hint = getExchangePlayerHint(name);
    showExchangeHint(side, hint);
  }

  // checkbox 상태 동기화
  const allPicked = side === 'A' ? exPickedHome : exPickedAway;
  const pool = $(`ex-pool-${side}`);
  if (pool) {
    pool.querySelectorAll('.p-chk').forEach(chk => {
      chk.checked = allPicked.includes(chk.value);
    });
  }
  renderExchangePickedPlayers();
}

function showExchangeHint(side, msg) {
  const el = $(`ex-hint-${side}`);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function renderExchangePickedPlayers() {
  if ($('ex-picked-home')) $('ex-picked-home').textContent = exPickedHome.join(' + ') || '선택 없음';
  if ($('ex-picked-away')) $('ex-picked-away').textContent = exPickedAway.join(' + ') || '선택 없음';
}

function setExMatchCategory(category) {
  exMatchCategory = category;
  exPickedHome = [];
  exPickedAway = [];
  renderExchangePickedPlayers();
  // 버튼 활성화
  ['singles', 'doubles'].forEach(c => {
    const btn = $(`ex-cat-${c}`);
    if (btn) btn.classList.toggle('active', c === category);
  });
}

// ========================================
// 경기 결과 저장 (교류전 전용 save)
// ========================================

async function saveExchangeResult() {
  // ✅ v4.6-fix: 인증 체크
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveExchangeResult()); return; }

  const hs = ($('ex-score-home') || {}).value;
  const as = ($('ex-score-away') || {}).value;
  if (!hs || !as || hs == as) { gsAlert('점수를 확인해주세요!'); return; }

  const max = exMatchCategory === 'doubles' ? 2 : 1;
  if (exPickedHome.length !== max || exPickedAway.length !== max) {
    gsAlert('선수를 모두 선택해주세요!');
    return;
  }

  const homeScore = parseInt(hs, 10);
  const awayScore = parseInt(as, 10);
  const homeWin = homeScore > awayScore;
  const { ts, ds } = nowISO();
  const resultType = document.querySelector('input[name="ex-result-type"]:checked')?.value || 'normal';

  const logEntry = {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts, date: ds,
    type: exMatchCategory === 'doubles' ? 'double' : 'single',
    home: [...exPickedHome],
    away: [...exPickedAway],
    hs: homeScore,
    as: awayScore,
    winner: homeWin ? 'home' : 'away',
  };

  // 기존 개인 통계도 함께 적용
  applyMatchToPlayers(logEntry.type, [...exPickedHome], [...exPickedAway], logEntry.winner);

  if (isSimulation) {
    // 시뮬레이션 — Firestore 저장 없이 로컬 집계만
    const pts = calcExchangePoints(logEntry, activeExchange);
    updateExchangeAggregateLocal(pts);
    renderExchangeScoreBar();
    gsAlert('✅ 시뮬레이션 저장! (실제 데이터 반영 안됨)');
  } else {
    const ok = await saveExchangeGame(logEntry, exMatchCategory, resultType, 'A');
    if (!ok) return;
    // ✅ v4.6-fix: matchLog 저장 후 players 점수도 Firestore에 반영
    await pushDataOnly();
    gsAlert('저장!');
  }
  exPickedHome = [];
  exPickedAway = [];
  $('ex-score-home').value = '';
  $('ex-score-away').value = '';
  renderExchangePickedPlayers();
  showExchangeHint('A', '');
  showExchangeHint('B', '');
}

// ========================================
// 시뮬레이션 모드
// ========================================
function startExchangeSimulation() {
  gsConfirm('시뮬레이션 모드로 시작할까요?\nFirestore에 저장되지 않습니다.', ok => {
    if (!ok) return;
    isSimulation = true;
    activeExchange = {
      id: 'sim-' + Date.now(),
      clubAId: getActiveClubId(),
      clubBId: 'sim-club-b',
      clubBName: '상대클럽 (시뮬)',
      isClubBTemp: true,
      victoryMode: 'wins',
      handicapEnabled: false,
      status: 'ongoing',
      scoreA: 0, scoreB: 0,
      winsA: 0, winsB: 0,
      singlesWinsA: 0, singlesWinsB: 0,
      doublesWinsA: 0, doublesWinsB: 0,
      singlesLossA: 0, singlesLossB: 0,
      doublesLossA: 0, doublesLossB: 0,
      gameIds: [],
    };
    exchangeGuestsB = [
      { name: '상대1', gender: 'M' },
      { name: '상대2', gender: 'M' },
      { name: '상대3', gender: 'F' },
    ];
    renderExchangeView();
    // 상단에 시뮬레이션 배지 표시
    const badge = document.getElementById('ex-mode-badge');
    if (badge) badge.textContent = '🔧 시뮬레이션 모드';
  });
}

// 로컬 집계 (시뮬레이션 전용)
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
    if (exMatchCategory === 'singles') ex.singlesWinsA++;
    else ex.doublesWinsA++;
    ex.singlesLossB += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesLossB += exMatchCategory === 'doubles' ? 1 : 0;
  } else {
    ex.winsB++;
    if (exMatchCategory === 'singles') ex.singlesWinsB++;
    else ex.doublesWinsB++;
    ex.singlesLossA += exMatchCategory === 'singles' ? 1 : 0;
    ex.doublesLossA += exMatchCategory === 'doubles' ? 1 : 0;
  }
}
