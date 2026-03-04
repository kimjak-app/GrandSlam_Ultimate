// ========================================
// GAME.JS - 단일게임 + 선수 관리
// ========================================


// ----------------------------------------
// 1. 경기 저장
// ----------------------------------------

async function save() {
  if (isPracticeMode === 'practice') { gsAlert('지금은 연습 모드입니다! 기록이 저장되지 않습니다. 🧪'); return; }

  const hs = $('hS').value, as = $('aS').value;
  if (!hs || !as || hs == as) { gsAlert('점수 확인!'); return; }

  const max = mType === 'double' ? 2 : 1;
  if (hT.length !== max || aT.length !== max) { gsAlert('팀 선택 먼저!'); return; }

  // HIDDEN_PLAYERS 실체화
  [...hT, ...aT].forEach(name => {
    if (HIDDEN_PLAYERS.includes(name) && !players.find(p => p.name === name)) {
      players.push(ensure({ name, isGuest: true }));
    }
  });

  snapshotLastRanks();

  const homeScore = parseInt(hs, 10), awayScore = parseInt(as, 10);
  const { ts, ds } = nowISO();
  const logEntry = {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts, date: ds, type: mType,
    home: [...hT], away: [...aT],
    hs: homeScore, as: awayScore,
    winner: homeScore > awayScore ? 'home' : 'away',
  };

  // 저장 실패 시 롤백용 스냅샷
  const prevPlayers        = players.map(p => Object.assign({}, p));
  const prevMatchLogLength = matchLog.length;

  applyMatchToPlayers(mType, [...hT], [...aT], logEntry.winner);
  matchLog.unshift(logEntry);

  const ok = await pushWithMatchLogAppend(logEntry);
  if (ok) {
    gsAlert('저장!');
  } else {
    players.forEach((p, i) => { if (prevPlayers[i]) Object.assign(p, prevPlayers[i]); });
    matchLog = matchLog.slice(prevMatchLogLength > 0 ? 0 : 1);
    gsAlert('❌ 저장 실패! 다시 시도해주세요.');
    return;
  }

  $('hS').value = ''; $('aS').value = '';
  hT = []; aT = [];
  $('hN').innerText = ''; $('aN').innerText = '';
  renderPool();
  tab(1);
  renderStatsPlayerList();
  setTimeout(applyAutofitAllTables, 0);
}


// ----------------------------------------
// 2. 선수 관리 (추가 / 수정 / 삭제)
// ----------------------------------------

function editP(oldName) {
  gsEditName(oldName, newName => {
    if (!newName?.trim() || newName.trim() === oldName) return;
    const p = players.find(x => x.name === oldName);
    if (!p) return;
    p.name = newName.trim();
    matchLog.forEach(l => {
      if (Array.isArray(l.home)) l.home = l.home.map(n => n === oldName ? p.name : n);
      if (Array.isArray(l.away)) l.away = l.away.map(n => n === oldName ? p.name : n);
    });
    pushDataOnly(); updatePlayerList(); renderStatsPlayerList(); gsAlert('수정 완료!');
  });
}

function addP() {
  const n = $('pI').value.trim();
  if (!n || players.find(p => p.name === n)) return;

  const isGuest     = $('pIsGuest')?.checked || false;
  const genderRadio = document.querySelector('input[name="pGender"]:checked');
  const levelRadio  = document.querySelector('input[name="pLevel"]:checked');
  const gender      = genderRadio ? genderRadio.value : 'M';
  const level       = levelRadio  ? levelRadio.value  : 'A';

  players.push(ensure({ name: n, isGuest, gender, level }));
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
  const p = players.find(x => x.name === n);
  if (!p) return;
  p.isGuest = !p.isGuest;
  pushDataOnly(); updatePlayerList(); renderStatsPlayerList();
  gsAlert(`${p.name}은(는) 이제 ${p.isGuest ? '게스트' : '회원'}입니다.`);
}

async function toggleLevel(n) {
  const p = players.find(x => x.name === n);
  if (!p) return;
  const levels = ['A', 'B', 'C'];
  p.level = levels[(levels.indexOf(p.level || 'A') + 1) % levels.length];
  updatePlayerList(); renderStatsPlayerList();
  await pushDataOnly();
  gsAlert(`${p.name} → ${p.level}로 변경됐습니다.`);
}

async function toggleGender(n) {
  const p = players.find(x => x.name === n);
  if (!p) return;
  p.gender = p.gender === 'F' ? 'M' : 'F';
  updatePlayerList(); renderPool(); renderStatsPlayerList();
  await pushDataOnly();
  gsAlert(`${p.name} → ${p.gender === 'F' ? '여자(F)' : '남자(M)'}로 변경됐습니다.`);
}


// ----------------------------------------
// 3. 선수 풀 렌더링
// ----------------------------------------

function renderPool() {
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => (b.score || 0) - (a.score || 0));
  const guests  = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  const hint = $('hint-1v2');
  if (hint) hint.style.display = 'none';

  const gIcon = p => p.gender === 'F'
    ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
    : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';

  const divider = label => `
    <div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">
      <span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">${label}</span>
    </div>`;

  let html = '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';
  members.forEach((p, i) => {
    const sel   = (window.hT?.includes(p.name)) || (window.aT?.includes(p.name));
    const chkId = `pool_p_${i}`;
    html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/'/g,"&#39;")}')">`;
    html += `<label for="${chkId}" class="p-label">${gIcon(p)}${escapeHtml(p.name)}<span class="p-rank">${i + 1}위</span></label>`;
  });
  html += '</div>';

  if (guests.length > 0) {
    html += divider('GUEST LIST');
    html += '<div class="player-pool">';
    guests.forEach((p, i) => {
      const sel   = (window.hT?.includes(p.name)) || (window.aT?.includes(p.name));
      const chkId = `pool_g_${i}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/'/g,"&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label guest-label">[G] ${escapeHtml(p.name)}</label>`;
    });
    html += '</div>';
  }

  if (oneTimePlayers.length > 0) {
    html += divider('<span style="color:var(--aussie-blue);">당일 게스트</span>');
    html += '<div class="player-pool" style="margin-bottom:4px;">';
    oneTimePlayers.forEach((name, i) => {
      const sel   = hT.includes(name) || aT.includes(name);
      const chkId = `pool_ot_${i}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(name).replace(/'/g,"&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label day-guest-label" style="position:relative; padding-right:22px;">[당일] ${escapeHtml(name)}<span onclick="event.preventDefault();event.stopPropagation();removeOneTimePlayer('${escapeHtml(name).replace(/'/g,"&#39;")}')" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:13px;color:#999;cursor:pointer;line-height:1;">✕</span></label>`;
    });
    html += '</div>';
  }

  const poolContainer = $('pP');
  if (poolContainer) poolContainer.innerHTML = html;
}

function pick(n) {
  const max = mType === 'double' ? 2 : 1;
  if (hT.includes(n))      hT = hT.filter(x => x !== n);
  else if (aT.includes(n)) aT = aT.filter(x => x !== n);
  else if (hT.length < max) hT.push(n);
  else if (aT.length < max) aT.push(n);
  else return;

  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');
  updateRecordCount();
  renderPool();
}

function updateRecordCount() {
  const cnt = $('record-cnt');
  if (cnt) cnt.textContent = hT.length + aT.length;
}

function setM(t) {
  mType = t;
  $('m_db').className = t === 'double' ? 'type-btn selected' : 'type-btn';
  $('m_sg').className = t === 'single' ? 'type-btn selected' : 'type-btn';
  hT = []; aT = [];
  $('hN').innerText = ''; $('aN').innerText = '';
  updateRecordCount();
  const mixedArea = $('mixed-double-btn-area');
  if (mixedArea) mixedArea.style.display = t === 'double' ? 'block' : 'none';
  renderPool();
}

function autoMixedDouble() {
  if (mType !== 'double') { gsAlert('복식 모드에서만 사용 가능해요!'); return; }
  const pool    = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const males   = pool.filter(p => p.gender !== 'F').sort((a, b) => (b.score || 0) - (a.score || 0));
  const females = pool.filter(p => p.gender === 'F').sort((a, b) => (b.score || 0) - (a.score || 0));
  if (males.length < 2 || females.length < 2) {
    gsAlert(`혼성 복식을 위해 남자 2명 이상, 여자 2명 이상이 필요해요.\n현재: 남자 ${males.length}명, 여자 ${females.length}명`); return;
  }
  hT = [males[0].name, females[1].name];
  aT = [males[1].name, females[0].name];
  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');
  renderPool();
  gsAlert(`혼성 자동 배치 완료!\n[남] ${males[0].name} + [여] ${females[1].name}\nvs\n[남] ${males[1].name} + [여] ${females[0].name}`);
}


// ----------------------------------------
// 4. 선수 목록 렌더링
// ----------------------------------------

function updatePlayerList() {
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
  const guests  = players.filter(p => p.isGuest  && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));

  const rows = [...members, ...guests].map(p => {
    const safe    = escapeHtml(p.name).replace(/'/g, "&#39;");
    const typeLabel = p.isGuest ? '<span style="color:var(--text-gray);">게스트</span>' : '회원';
    const gIcon   = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:15px; color:#E8437A; vertical-align:middle; margin-right:3px;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:15px; color:#3A7BD5; vertical-align:middle; margin-right:3px;">male</span>';
    const gBtnIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">male</span>';
    const lv      = p.level || 'A';
    const lvColor = lv === 'A' ? '#5D9C76' : lv === 'B' ? '#669DB3' : '#D98C73';
    const lvBadge = `<span style="font-size:10px; background:${lvColor}; color:white; border-radius:4px; padding:1px 5px; margin-left:4px; vertical-align:middle; font-weight:600;">${lv}</span>`;
    return `<tr>
      <td style="text-align:left; padding-left:10px; font-weight:400; white-space:nowrap;">${gIcon}${escapeHtml(displayName(p.name))}${lvBadge}</td>
      <td style="text-align:center; font-size:12px; width:50px;">${typeLabel}</td>
      <td style="text-align:right; padding-right:5px; width:180px; white-space:nowrap;">
        <button onclick="editP('${safe}')"       style="background:var(--aussie-blue); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">수정</button>
        <button onclick="toggleGender('${safe}')" style="background:${p.gender === 'F' ? '#E8437A' : '#3A7BD5'}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">${gBtnIcon}</button>
        <button onclick="toggleLevel('${safe}')"  style="background:${lvColor}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:600;">${lv}</button>
        <button onclick="toggleGuest('${safe}')"  style="background:#8E8E93; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">구분</button>
        <button onclick="delP('${safe}')"         style="background:var(--roland-clay); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">삭제</button>
      </td>
    </tr>`;
  }).join('');
  document.querySelector('#pL tbody').innerHTML = rows;
}


// ----------------------------------------
// 5. 데이터 초기화
// ----------------------------------------

async function resetScoresKeepPlayers() {
  checkClubPin(async ok => {
    if (!ok) return;
    players.forEach(p => { Object.keys(p).forEach(k => { if (k !== 'name' && k !== 'isGuest') p[k] = 0; }); });
    matchLog = [];
    await pushPayload({ action: 'save', data: players, matchLogAppend: [], matchLogReset: true });
    tab(1); renderStatsPlayerList(); setTimeout(applyAutofitAllTables, 0);
  });
}

function resetWeeklyOnly() {
  checkClubPin(ok => {
    if (!ok) return;
    players.forEach(p => {
      ['weekly','wdScore','wsScore','wWins','wLosses','wdWins','wdLosses','wsWins','wsLosses','lastW','lastWD','lastWS'].forEach(f => p[f] = 0);
    });
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


// ----------------------------------------
// 6. 뷰 전환
// ----------------------------------------

function switchView(v, b) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (b) b.classList.add('active');
  showView(v);
}

function checkAdminAndShow(viewName) {
  if (viewName === 'player-mgmt' && !adminUnlocked) {
    checkClubPin(ok => { if (!ok) return; adminUnlocked = true; showView(viewName); });
    return;
  }
  showView(viewName);
}

function showView(v) {
  if (v === 'weather') v = 'home';

  // treasurer 화면에서 나갈 때 자동 저장
  const currentVisible = document.querySelector('.app-screen[style*="display: block"], .app-screen[style*="display:block"]');
  if (currentVisible?.id === 'view-treasurer' && v !== 'treasurer') {
    pushDataOnly().catch(e => console.warn('treasurer 자동저장 오류:', e));
  }

  document.querySelectorAll('.app-screen').forEach(el => el.style.display = 'none');
  const el = document.getElementById(`view-${v}`);
  if (el) el.style.display = 'block';
  setTimeout(applyAutofitAllTables, 0);

  if (v === 'tennis')      sync();
  if (v === 'player-mgmt') updatePlayerList();
  if (v === 'record')      renderPool();
  if (v === 'ladder')      renderLadderPlayerPool();
  if (v === 'tournament')  initTournament();
  if (v === 'stats')       renderStatsPlayerList();
  if (v === 'round')       initRoundPlayerPool();
  if (v === 'club-mgmt')   renderClubManageList();
  if (v === 'home')        { loadCourtInfo(); loadNotices(); }
  if (v === 'treasurer')   resetTreasurerView();
  if (v === 'exchange' && typeof initExchangeView === 'function') initExchangeView();
}

function openSingleGame()   { showView('tennis');     tab(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openPlayerManager(){ showView('tennis');     tab(4); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openTournament()   { showView('tournament'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openLadder()       { showView('ladder');     window.scrollTo({ top: 0, behavior: 'smooth' }); }
function comingSoon(name)   { gsAlert(`${name}은(는) 다음 버전에서 오픈!`); }

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


// ----------------------------------------
// window 전역 등록
// ----------------------------------------

window.save                  = save;
window.editP                 = editP;
window.addP                  = addP;
window.delP                  = delP;
window.toggleGuest           = toggleGuest;
window.toggleLevel           = toggleLevel;
window.toggleGender          = toggleGender;
window.renderPool            = renderPool;
window.pick                  = pick;
window.setM                  = setM;
window.autoMixedDouble       = autoMixedDouble;
window.updatePlayerList      = updatePlayerList;
window.resetScoresKeepPlayers = resetScoresKeepPlayers;
window.resetWeeklyOnly       = resetWeeklyOnly;
window.adminResetAll         = adminResetAll;
window.switchView            = switchView;
window.checkAdminAndShow     = checkAdminAndShow;
window.showView              = showView;
window.openSingleGame        = openSingleGame;
window.openPlayerManager     = openPlayerManager;
window.openTournament        = openTournament;
window.openLadder            = openLadder;
window.comingSoon            = comingSoon;
window.toggleTournamentMode  = toggleTournamentMode;
