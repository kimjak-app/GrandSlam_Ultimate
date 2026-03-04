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
  gsAlert(`${p.name}은(는) 이제 ${p.isGuest ? '게스트' : '회원'}입니다.`);
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
  const picked = GameEngine.pickTeams(n, mType, hT, aT);
  if (!picked.changed) return;
  hT = picked.homeTeam;
  aT = picked.awayTeam;
  GameView.syncPickedTeamsView();
}

function updateRecordCount() {
  GameView.updateRecordCountView();
}

function setM(t) {
  mType = t;
  hT = [];
  aT = [];
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
