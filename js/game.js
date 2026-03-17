// ========================================
// GAME.JS - bridge (backward compatibility)
// 기존 외부 호출/HTML onclick 함수명을 유지하고
// 구현은 game_engine.js / game_view.js로 위임한다.
// ========================================

async function save() {
  const hs = $('hS').value;
  const as = $('aS').value;
  const msg = GameEngine.validateSaveInput(isPracticeMode, hs, as, mType, hT, aT);
  if (msg) { gsAlert(msg); return; }

  GameEngine.materializeHiddenPlayers([...hT, ...aT]);
  snapshotLastRanks();

  const logEntry = GameEngine.createMatchLogEntry(mType, hT, aT, hs, as);
  const snapshot = GameEngine.snapshotSaveState();
  GameEngine.applyMatchAndAppendLog(mType, hT, aT, logEntry.winner, logEntry);

  const ok = await pushWithMatchLogAppend(logEntry);
  if (!ok) {
    GameEngine.rollbackSaveState(snapshot);
    gsAlert('❌ 저장 실패! 다시 시도해주세요.');
    return;
  }

  gsAlert('저장!');
  $('hS').value = '';
  $('aS').value = '';
  hT = [];
  aT = [];
  $('hN').innerText = '';
  $('aN').innerText = '';
  renderPool();
  tab(1);
  renderStatsPlayerList();
  setTimeout(applyAutofitAllTables, 0);
}

// ✅ v5.63: 간편 방식 모드 전환 (기본: 간편)
let gameInputMode = 'simple'; // 'score' | 'simple'

// ✅ v5.631: 코트수 및 멀티코트 팀 데이터
let gameCourtCount = 1;
// courtTeams[i] = { home: [], away: [], winner: null }
let courtTeams = [{ home: [], away: [], winner: null }];

function setGameCourtCount(n) {
  gameCourtCount = n;
  // 코트수 탭 UI 업데이트
  document.querySelectorAll('.game-court-tab-btn').forEach(btn => {
    const active = Number(btn.dataset.court) === n;
    btn.style.background = active ? 'var(--wimbledon-sage)' : '';
    btn.style.color = active ? 'white' : '';
  });
  // courtTeams 재초기화
  courtTeams = Array.from({ length: n }, () => ({ home: [], away: [], winner: null }));
  hT = []; aT = [];
  if ($('hN')) $('hN').innerText = '';
  if ($('aN')) $('aN').innerText = '';
  GameView.syncPickedTeamsView();
}

function getCourtPickMax() {
  return mType === 'double' ? 2 : 1;
}

// 선택 순서대로 코트별 팀 배정
function pickMultiCourt(name) {
  const max = getCourtPickMax(); // 팀당 최대 인원
  const perCourt = max * 2; // 코트당 총 인원

  // 이미 선택된 선수면 제거
  for (let i = 0; i < courtTeams.length; i++) {
    const ct = courtTeams[i];
    if (ct.home.includes(name)) { ct.home = ct.home.filter(x => x !== name); updateFlatTeams(); GameView.syncPickedTeamsView(); return; }
    if (ct.away.includes(name)) { ct.away = ct.away.filter(x => x !== name); updateFlatTeams(); GameView.syncPickedTeamsView(); return; }
  }

  // 빈 슬롯에 순서대로 채우기
  for (let i = 0; i < courtTeams.length; i++) {
    const ct = courtTeams[i];
    if (ct.home.length < max) { ct.home.push(name); break; }
    if (ct.away.length < max) { ct.away.push(name); break; }
  }

  updateFlatTeams();
  GameView.syncPickedTeamsView();
}

// hT/aT는 코트1 기준 유지 (기존 점수방식 호환)
function updateFlatTeams() {
  if (gameCourtCount === 1) {
    hT = courtTeams[0].home;
    aT = courtTeams[0].away;
  } else {
    // 멀티코트: hT/aT는 참고용으로 전체 합산
    hT = courtTeams.flatMap(ct => ct.home);
    aT = courtTeams.flatMap(ct => ct.away);
  }
}

function setGameMode(mode) {
  gameInputMode = mode;
  const scoreMode = $('game-score-mode');
  const simpleMode = $('game-simple-mode');
  const scoreBtn = $('mode-score-btn');
  const simpleBtn = $('mode-simple-btn');
  const courtNotice = $('score-mode-court-notice');
  if (mode === 'score') {
    if (scoreMode) scoreMode.style.display = 'block';
    if (simpleMode) simpleMode.style.display = 'none';
    if (scoreBtn) { scoreBtn.style.background = 'var(--wimbledon-sage)'; scoreBtn.style.color = 'white'; }
    if (simpleBtn) { simpleBtn.style.background = 'white'; simpleBtn.style.color = 'var(--wimbledon-sage)'; }
    // ✅ v5.635: 점수 방식은 코트 1개만 지원
    if (gameCourtCount > 1) {
      setGameCourtCount(1);
    }
    if (courtNotice) courtNotice.style.display = gameCourtCount > 1 ? 'block' : 'none';
  } else {
    if (scoreMode) scoreMode.style.display = 'none';
    if (simpleMode) simpleMode.style.display = 'block';
    if (scoreBtn) { scoreBtn.style.background = 'white'; scoreBtn.style.color = 'var(--wimbledon-sage)'; }
    if (simpleBtn) { simpleBtn.style.background = 'var(--wimbledon-sage)'; simpleBtn.style.color = 'white'; }
    if (courtNotice) courtNotice.style.display = 'none';
    updateSimpleTeamsUI();
  }
}

function updateSimpleTeamsUI() {
  const container = $('game-simple-courts');
  if (!container) return;

  const gIcon = name => {
    const p = players.find(pl => pl.name === name);
    if (!p) return '';
    return p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:12px;color:#E8437A;vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:12px;color:#3A7BD5;vertical-align:middle;">male</span>';
  };
  const teamLabel = (names) => names.length
    ? names.map(n => displayName(n)).join(' / ')
    : '-';

  // ✅ v6.44: 코트카드 스타일을 라운드 자동생성 UI와 통일
  let html = '';
  for (let i = 0; i < gameCourtCount; i++) {
    const ct = courtTeams[i] || { home: [], away: [], winner: null };
    const max = mType === 'double' ? 2 : 1;
    const homeReady = ct.home.length === max;
    const awayReady = ct.away.length === max;
    const canClick = homeReady && awayReady;
    const baseBtn = 'flex:1; min-height:40px; border-radius:10px; border:none; background:#d0846c; color:#fff; padding:10px 8px; font-size:13px; font-weight:700; text-align:center;';
    const homeStyle = baseBtn + (ct.winner === 'home' ? ' background:var(--wimbledon-sage);' : '') + (homeReady ? '' : ' opacity:0.4;');
    const awayStyle = baseBtn + (ct.winner === 'away' ? ' background:var(--wimbledon-sage);' : '') + (awayReady ? '' : ' opacity:0.4;');
    html += `
      <div style="padding:0; margin-bottom:14px; overflow:hidden; border-radius:14px; border:1px solid #e5e7eb;">
        <div style="background:var(--wimbledon-sage); color:#fff; padding:10px 14px; font-weight:800; font-size:14px;">🎾 코트 ${i + 1}</div>
        <div style="padding:12px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <button onclick="saveSimpleImmediate(${i},'home')"
              class="opt-btn" style="${homeStyle}"
              ${canClick ? '' : 'disabled'}>${teamLabel(ct.home)}</button>
            <div style="font-size:12px; font-weight:700; color:#94a3b8; flex-shrink:0;">vs</div>
            <button onclick="saveSimpleImmediate(${i},'away')"
              class="opt-btn" style="${awayStyle}"
              ${canClick ? '' : 'disabled'}>${teamLabel(ct.away)}</button>
          </div>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

// ✅ v5.632: 이긴 팀 누르면 즉시 저장, 해당 코트만 초기화
async function saveSimpleImmediate(courtIdx, side) {
  const ct = courtTeams[courtIdx];
  if (!ct) return;
  const h = ct.home;
  const a = ct.away;
  const hs = side === 'home' ? '1' : '0';
  const as = side === 'away' ? '1' : '0';

  const msg = GameEngine.validateSaveInput(isPracticeMode, hs, as, mType, h, a);
  if (msg) { gsAlert(msg); return; }

  GameEngine.materializeHiddenPlayers([...h, ...a]);
  snapshotLastRanks();

  const logEntry = GameEngine.createMatchLogEntry(mType, h, a, hs, as);
  const snapshot = GameEngine.snapshotSaveState();
  GameEngine.applyMatchAndAppendLog(mType, h, a, logEntry.winner, logEntry);

  const ok = await pushWithMatchLogAppend(logEntry);
  if (!ok) {
    GameEngine.rollbackSaveState(snapshot);
    gsAlert('❌ 저장 실패! 다시 시도해주세요.');
    return;
  }

  // 해당 코트만 초기화
  courtTeams[courtIdx] = { home: [], away: [], winner: null };
  updateFlatTeams();

  // 진행중인 코트 선수 제외하고 풀 갱신
  renderPool();
  updateSimpleTeamsUI();
  renderStatsPlayerList();
  setTimeout(applyAutofitAllTables, 0);
}


function editP(oldName) {
  gsEditName(oldName, newName => {
    if (!newName?.trim() || newName.trim() === oldName) return;
    if (!GameEngine.renamePlayerEverywhere(oldName, newName)) return;
    pushDataOnly(); updatePlayerList(); renderStatsPlayerList(); gsAlert('수정 완료!');
  });
}

function addP() {
  const n = $('pI').value.trim();
  const isGuest = $('pIsGuest')?.checked || false;
  const genderRadio = document.querySelector('input[name="pGender"]:checked');
  const levelRadio = document.querySelector('input[name="pLevel"]:checked');
  const gender = genderRadio ? genderRadio.value : 'M';
  const level = levelRadio ? levelRadio.value : 'A';

  if (!GameEngine.createPlayer(n, isGuest, gender, level)) return;

  pushDataOnly();
  $('pI').value = '';
  if ($('pIsGuest')) $('pIsGuest').checked = false;
  document.querySelector('input[name="pGender"][value="M"]')?.setAttribute('checked', true);
  document.querySelector('input[name="pLevel"][value="A"]')?.setAttribute('checked', true);

  updatePlayerList(); renderLadderPlayerPool(); initTournament(); renderStatsPlayerList();
  gsAlert(n + (isGuest ? ' (게스트) 등록!' : ' 등록!'));
  setTimeout(applyAutofitAllTables, 0);
}

function delP() {
  gsAlert('회원 탈퇴/삭제는\n총무 메뉴 > 회원 이력 관리에서\n처리해 주세요.');
}

function toggleGuest(n) {
  const p = GameEngine.toggleGuestState(n);
  if (!p) return;
  pushDataOnly(); updatePlayerList(); renderStatsPlayerList();
  gsAlert(`${p.name}은(는) 이제 ${p.isGuest ? '준회원' : '정회원'}입니다.`);
}

async function toggleLevel(n) {
  const p = GameEngine.cycleLevel(n);
  if (!p) return;
  updatePlayerList(); renderStatsPlayerList();
  await pushDataOnly();
  gsAlert(`${p.name} → ${p.level}로 변경됐습니다.`);
}

async function toggleGender(n) {
  const p = GameEngine.flipGender(n);
  if (!p) return;
  updatePlayerList(); renderPool(); renderStatsPlayerList();
  await pushDataOnly();
  gsAlert(`${p.name} → ${p.gender === 'F' ? '여자(F)' : '남자(M)'}로 변경됐습니다.`);
}

function renderPool() {
  GameView.renderPoolView();
}

function pick(n) {
  // ✅ v5.632: 코트수 무관 pickMultiCourt 통일 (코트1 이름 미표시 버그 수정)
  pickMultiCourt(n);
}

function updateRecordCount() {
  GameView.updateRecordCountView();
}

function setM(t) {
  mType = t;
  hT = [];
  aT = [];
  courtTeams = Array.from({ length: gameCourtCount }, () => ({ home: [], away: [], winner: null }));
  $('hN').innerText = '';
  $('aN').innerText = '';
  updateRecordCount();
  GameView.setMatchTypeView(t);
  renderPool();
}

function autoMixedDouble() {
  if (mType !== 'double') { gsAlert('복식 모드에서만 사용 가능해요!'); return; }
  const result = GameEngine.autoMixedDoubleTeams();
  if (!result.ok) { gsAlert(result.message); return; }
  hT = result.homeTeam;
  aT = result.awayTeam;
  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');
  renderPool();
  gsAlert(result.message);
}

function updatePlayerList() {
  GameView.updatePlayerListView();
}

async function resetScoresKeepPlayers() {
  checkClubPin(async ok => {
    if (!ok) return;
    GameEngine.resetAllScoresKeepPlayersData();
    await pushPayload({ action: 'save', data: players, matchLogAppend: [], matchLogReset: true });
    tab(1); renderStatsPlayerList(); setTimeout(applyAutofitAllTables, 0);
  });
}

function resetWeeklyOnly() {
  checkClubPin(ok => {
    if (!ok) return;
    GameEngine.resetWeeklyOnlyData();
    pushDataOnly(); tab(2); setTimeout(applyAutofitAllTables, 0);
  });
}

async function adminResetAll() {
  checkClubPin(async ok => {
    if (!ok) return;
    gsConfirm('정말로 모든 데이터를 삭제하시겠습니까?\n\n• 선수 정보 및 경기 기록\n• 회원 가입/탈퇴 이력\n• 휴면 회원 정보\n\n⚠️ 이 작업은 되돌릴 수 없습니다.', async ok2 => {
      if (!ok2) return;
      players = []; matchLog = [];
      const ok3 = await pushPayload({ action: 'adminResetAll', adminPin: ADMIN_PIN, confirmText: 'DELETE' });
      if (ok3) {
        updatePlayerList(); renderStatsPlayerList(); renderPool();
        hT = []; aT = [];
        $('hN').innerText = ''; $('aN').innerText = '';
        $('hS').value = ''; $('aS').value = '';
        gsAlert('전체 삭제 완료! ✅');
      } else {
        gsAlert('서버 삭제 실패 😵 관리자에게 문의하세요.');
      }
    });
  });
}

function switchView(v, b) {
  GameView.switchViewUI(v, b);
}

function checkAdminAndShow(viewName) {
  if (viewName === 'player-mgmt' && !adminUnlocked) {
    checkClubPin(ok => { if (!ok) return; adminUnlocked = true; showView(viewName); });
    return;
  }
  showView(viewName);
}

function showView(v) {
  GameView.showViewUI(v);
}

function openSingleGame() { showView('tennis'); tab(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openPlayerManager() { showView('tennis'); tab(4); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openTournament() { showView('tournament'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openLadder() { showView('ladder'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function comingSoon(name) { gsAlert(`${name}은(는) 다음 버전에서 오픈!`); }

function toggleTournamentMode() {
  const btn = $('btnTourMode');
  if (isPracticeMode === 'practice') {
    checkClubPin(ok => {
      if (!ok) return;
      isPracticeMode = 'real';
      localStorage.setItem('grandslam_practice_mode', 'real');
      btn.innerText = '🟥 실전 모드 (모든 기록 반영 O)';
      btn.style.background = '#FF3B30';
      gsAlert('실전 모드 ON ✅\n모든 게임 기록이 정상 반영됩니다!');
    });
  } else {
    isPracticeMode = 'practice';
    localStorage.setItem('grandslam_practice_mode', 'practice');
    btn.innerText = '🟩 전체 게임 연습 모드 (기록반영 X)';
    btn.style.background = '#34C759';
    gsAlert('전체 게임 연습 모드 ON ✅\n단일게임/토너먼트 모두 기록이 반영되지 않습니다!');
  }
}

window.save = save;
window.saveSimpleImmediate = saveSimpleImmediate;
window.setGameMode = setGameMode;
window.setGameCourtCount = setGameCourtCount;
window.updateSimpleTeamsUI = updateSimpleTeamsUI;
window.editP = editP;
window.addP = addP;
window.delP = delP;
window.toggleGuest = toggleGuest;
window.toggleLevel = toggleLevel;
window.toggleGender = toggleGender;
window.renderPool = renderPool;
window.pick = pick;
window.setM = setM;
window.autoMixedDouble = autoMixedDouble;
window.updatePlayerList = updatePlayerList;
window.resetScoresKeepPlayers = resetScoresKeepPlayers;
window.resetWeeklyOnly = resetWeeklyOnly;
window.adminResetAll = adminResetAll;
window.switchView = switchView;
window.checkAdminAndShow = checkAdminAndShow;
window.showView = showView;
window.openSingleGame = openSingleGame;
window.openPlayerManager = openPlayerManager;
window.openTournament = openTournament;
window.openLadder = openLadder;
window.comingSoon = comingSoon;
window.toggleTournamentMode = toggleTournamentMode;
