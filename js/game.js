// ========================================
// SINGLE GAME (단일게임)
// ========================================

async function save() {
  // 연습 모드 체크
  if (isPracticeMode === 'practice') {
    gsAlert("지금은 연습 모드입니다! 기록이 저장되지 않습니다. 🧪");
    return;
  }

  var hs = $('hS').value, as = $('aS').value;
  if (!hs || !as || hs == as) { gsAlert("점수 확인!"); return; }

  const max = (mType === 'double') ? 2 : 1;
  if (hT.length !== max || aT.length !== max) { gsAlert("팀 선택 먼저!"); return; }

  // ✅ v3.8206: HIDDEN_PLAYERS 실체화 (기존 호환 유지)
  [...hT, ...aT].forEach(name => {
    if (HIDDEN_PLAYERS.includes(name) && !players.find(p => p.name === name)) {
      players.push(ensure({ name, isGuest: true }));
    }
  });
  // ✅ v3.8206: 당일 게스트는 players에 추가하지 않음 — matchLog에만 기록

  snapshotLastRanks();

  const homeScore = parseInt(hs, 10);
  const awayScore = parseInt(as, 10);
  const homeWin = homeScore > awayScore;

  const { ts, ds } = nowISO();
  const logEntry = {
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts,
    date: ds,
    type: mType,
    home: [...hT],
    away: [...aT],
    hs: homeScore,
    as: awayScore,
    winner: homeWin ? "home" : "away"
  };

  // ✅ v4.6-fix: 저장 전에 메모리 스냅샷 저장 (실패 시 롤백용)
  const prevPlayers = players.map(p => Object.assign({}, p));
  const prevMatchLogLength = matchLog.length;

  applyMatchToPlayers(mType, [...hT], [...aT], logEntry.winner);
  matchLog.unshift(logEntry);

  const ok = await pushWithMatchLogAppend(logEntry);

  if (ok) {
    gsAlert("저장!");
  } else {
    // ✅ v4.6-fix: 저장 실패 시 메모리 롤백
    players.forEach((p, i) => { if (prevPlayers[i]) Object.assign(p, prevPlayers[i]); });
    matchLog = matchLog.slice(prevMatchLogLength > 0 ? 0 : 1);
    gsAlert("❌ 저장 실패! 다시 시도해주세요.");
    return;
  }

  $('hS').value = '';
  $('aS').value = '';
  hT = []; aT = [];
  $('hN').innerText = '';
  $('aN').innerText = '';
  renderPool();
  tab(1);
  renderStatsPlayerList();

  setTimeout(applyAutofitAllTables, 0);
}


// ✅ v3.8204: 이름 수정 모달 함수


function editP(oldName) {
  gsEditName(oldName, newName => {
    if (newName && newName.trim() && newName.trim() !== oldName) {
      const p = players.find(x => x.name === oldName);
      if (p) {
        p.name = newName.trim();
        matchLog.forEach(l => {
          if (Array.isArray(l.home)) l.home = l.home.map(n => n === oldName ? p.name : n);
          if (Array.isArray(l.away)) l.away = l.away.map(n => n === oldName ? p.name : n);
        });
        pushDataOnly(); updatePlayerList(); renderStatsPlayerList(); gsAlert("수정 완료!");
      }
    }
  });
}
function addP() {
  var n = $('pI').value.trim();
  if (n && !players.find(p => p.name == n)) {
    var isGuest = $('pIsGuest') ? $('pIsGuest').checked : false;
    // ✅ v3.92: 성별 선택 (라디오 버튼)
    var genderRadio = document.querySelector('input[name="pGender"]:checked');
    var gender = genderRadio ? genderRadio.value : 'M';
    // ✅ v4.0: 급수 선택
    var levelRadio = document.querySelector('input[name="pLevel"]:checked');
    var level = levelRadio ? levelRadio.value : 'A';
    players.push(ensure({ name: n, isGuest: isGuest, gender: gender, level: level }));
    pushDataOnly();
    $('pI').value = '';
    if ($('pIsGuest')) $('pIsGuest').checked = false;
    // ✅ v3.92: 성별 라디오 남자로 초기화
    var mRadio = document.querySelector('input[name="pGender"][value="M"]');
    if (mRadio) mRadio.checked = true;
    // ✅ v4.0: 급수 라디오 A급으로 초기화
    var aRadio = document.querySelector('input[name="pLevel"][value="A"]');
    if (aRadio) aRadio.checked = true;
    updatePlayerList();
    gsAlert(n + (isGuest ? ' (게스트) 등록!' : ' 등록!'));
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();
    setTimeout(applyAutofitAllTables, 0);
  }
}

function delP(n) {
  // ✅ v4.77: 회원 삭제는 총무 메뉴 > 회원 이력 관리에서 처리
  gsAlert('회원 탈퇴/삭제는\n총무 메뉴 > 회원 이력 관리에서\n처리해 주세요.');
}

function toggleGuest(n) {
  var p = players.find(x => x.name === n);
  if (!p) return;
  p.isGuest = !p.isGuest;
  pushDataOnly();
  updatePlayerList();
  renderStatsPlayerList();
  gsAlert(p.name + '은(는) 이제 ' + (p.isGuest ? '게스트' : '회원') + '입니다.');
}

// ✅ v4.0: 급수 순환 토글 A→B→C→A
async function toggleLevel(n) {
  var p = players.find(x => x.name === n);
  if (!p) return;
  const levels = ['A', 'B', 'C'];
  const cur = levels.indexOf(p.level || 'A');
  p.level = levels[(cur + 1) % levels.length];
  updatePlayerList();
  renderStatsPlayerList();
  await pushDataOnly();
  gsAlert(p.name + ' → ' + p.level + '로 변경됐습니다.');
}

// ✅ v3.94: async로 변경 — push 완료 후 UI 업데이트, race condition 방지
async function toggleGender(n) {
  var p = players.find(x => x.name === n);
  if (!p) return;
  p.gender = (p.gender === 'F') ? 'M' : 'F';
  // UI 즉시 반영
  updatePlayerList();
  renderPool();
  renderStatsPlayerList();
  // push 완료 후 알럿 (push 중 다른 액션으로 덮어쓰기 방지)
  await pushDataOnly();
  gsAlert(p.name + ' → ' + (p.gender === 'F' ? '여자(F)' : '남자(M)') + '로 변경됐습니다.');
}

function renderPool() {
  // ✅ v4.77: 탈퇴/휴면 회원 경기 풀에서 제외
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => (b.score || 0) - (a.score || 0));
  // ✅ v3.816: HIDDEN_PLAYERS 제외 (일반 게스트만), 1대2대결용은 별도 처리
  const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  // ✅ v3.8206: hint-1v2 제거 (당일게스트 기능으로 대체)
  const hint = $('hint-1v2');
  if (hint) hint.style.display = 'none';

  let html = '';

  // 1. 정식 회원 섹션
  html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';

  members.forEach((p, index) => {
    const isSelected = (window.hT && window.hT.includes(p.name)) || (window.aT && window.aT.includes(p.name));
    const chkId = `pool_p_${index}`;
    // ✅ v3.93: Material Symbols 아이콘
    const gIcon = (p.gender === 'F')
      ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
    html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${isSelected ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/\'/g, "&#39;")}')">`;
    html += `<label for="${chkId}" class="p-label">${gIcon}${escapeHtml(p.name)}<span class="p-rank">${index + 1}위</span></label>`;
  });
  html += '</div>';

  // 2. 게스트 섹션 (게스트가 있을 때만 표시)
  if (guests.length > 0) {
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
    html += '</div>';
    html += '<div class="player-pool">';
    guests.forEach((p, index) => {
      const isSelected = (window.hT && window.hT.includes(p.name)) || (window.aT && window.aT.includes(p.name));
      const chkId = `pool_g_${index}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${isSelected ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/\'/g, "&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label guest-label">[G] ${escapeHtml(p.name)}</label>`;
    });
    html += '</div>';
  }
  // ✅ v3.8207_1: 당일 게스트 섹션 (기본 회색, 선택 시 호주색)
  if (oneTimePlayers.length > 0) {
    html += '<div style="width:100%; margin:10px 0 8px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:var(--aussie-blue); font-weight:bold;">당일 게스트</span>';
    html += '</div>';
    html += '<div class="player-pool" style="margin-bottom:4px;">';
    oneTimePlayers.forEach((name, i) => {
      const isSelected = hT.includes(name) || aT.includes(name);
      const chkId = `pool_ot_${i}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(name)}" ${isSelected ? 'checked' : ''} onclick="pick('${escapeHtml(name).replace(/'/g, "&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label day-guest-label" style="position:relative; padding-right:22px;">[당일] ${escapeHtml(name)}<span onclick="event.preventDefault();event.stopPropagation();removeOneTimePlayer('${escapeHtml(name).replace(/'/g, "&#39;")}')" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:13px;color:#999;cursor:pointer;line-height:1;">✕</span></label>`;
    });
    html += '</div>';
  }

  const poolContainer = $('pP');
  if (poolContainer) {
    poolContainer.innerHTML = html;
  }
}

function pick(n) {
  var max = mType == 'double' ? 2 : 1;

  // ✅ 토글: 이미 선택된 선수면 다시 눌렀을 때 해제
  if (hT.includes(n)) {
    hT = hT.filter(x => x !== n);
  } else if (aT.includes(n)) {
    aT = aT.filter(x => x !== n);
  } else {
    // ✅ 빈자리에만 추가
    if (hT.length < max) hT.push(n);
    else if (aT.length < max) aT.push(n);
    else return;
  }

  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');

  // ⭐ 선택 카운트 업데이트
  updateRecordCount();

  // 선택 UI 반영
  renderPool();
}

// ⭐ 단일게임 선택 카운트 업데이트 함수
function updateRecordCount() {
  const cnt = $('record-cnt');
  if (cnt) {
    const total = hT.length + aT.length;
    cnt.textContent = total;
  }
}


function setM(t) {
  mType = t;
  $('m_db').className = t == 'double' ? 'type-btn selected' : 'type-btn';
  $('m_sg').className = t == 'single' ? 'type-btn selected' : 'type-btn';
  hT = []; aT = [];
  $('hN').innerText = '';
  $('aN').innerText = '';

  // ⭐ 카운트 리셋
  updateRecordCount();
  // ✅ v3.92: 복식 모드일 때 혼성 버튼 표시
  const mixedArea = $('mixed-double-btn-area');
  if (mixedArea) mixedArea.style.display = (t === 'double') ? 'block' : 'none';
  // ✅ v3.8201: 단식/복식 전환 시 1vs2용 버튼 상태 갱신
  renderPool();
}

// ✅ v3.92: 혼성 복식 자동 배치 (남1+여1 vs 남1+여1)
function autoMixedDouble() {
  if (mType !== 'double') { gsAlert('복식 모드에서만 사용 가능해요!'); return; }

  // ✅ v4.80: 탈퇴/휴면 회원 혼복 자동배치 풀에서 제외
  const pool = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const males = pool.filter(p => p.gender !== 'F').sort((a, b) => (b.score || 0) - (a.score || 0));
  const females = pool.filter(p => p.gender === 'F').sort((a, b) => (b.score || 0) - (a.score || 0));

  if (males.length < 2 || females.length < 2) {
    gsAlert('혼성 복식을 위해 남자 2명 이상, 여자 2명 이상이 필요해요.\n현재: 남자 ' + males.length + '명, 여자 ' + females.length + '명');
    return;
  }

  // 랭킹 기반 균형 배치: 남1위+여2위 vs 남2위+여1위
  const m1 = males[0], m2 = males[1];
  const f1 = females[0], f2 = females[1];

  hT = [m1.name, f2.name];
  aT = [m2.name, f1.name];

  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');

  // 풀에서 체크박스 동기화
  renderPool();

  gsAlert('혼성 자동 배치 완료!\n[남] ' + m1.name + ' + [여] ' + f2.name + '\nvs\n[남] ' + m2.name + ' + [여] ' + f1.name);
}

function updatePlayerList() {
  // ✅ v4.77: 탈퇴/휴면 회원 숨김
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
  const guests = players.filter(p => p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
  const all = [...members, ...guests];

  let rows = all.map(p => {
    const safeName = escapeHtml(p.name).replace(/'/g, "&#39;");
    const typeLabel = p.isGuest ? '<span style="color:var(--text-gray);">게스트</span>' : '회원';
    // ✅ v3.93: Material Symbols 아이콘 (이름 앞 인라인)
    const gIcon = (p.gender === 'F')
      ? '<span class="material-symbols-outlined" style="font-size:15px; color:#E8437A; vertical-align:middle; margin-right:3px;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:15px; color:#3A7BD5; vertical-align:middle; margin-right:3px;">male</span>';
    const gBtnIcon = (p.gender === 'F')
      ? '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">male</span>';
    // ✅ v4.0: 급수 뱃지 + 버튼
    const lv = p.level || 'A';
    const lvColor = lv === 'A' ? '#5D9C76' : lv === 'B' ? '#669DB3' : '#D98C73';
    const lvBadge = `<span style="font-size:10px; background:${lvColor}; color:white; border-radius:4px; padding:1px 5px; margin-left:4px; vertical-align:middle; font-weight:600;">${lv}</span>`;
    return `<tr>
        <td style="text-align:left; padding-left:10px; font-weight:400; max-width:none; white-space:nowrap; overflow:visible; text-overflow:clip;">${gIcon}${escapeHtml(displayName(p.name))}${lvBadge}</td>
        <td style="text-align:center; font-size:12px; width:50px;">${typeLabel}</td>
        <td style="text-align:right; padding-right:5px; width:180px; white-space:nowrap;">
          <button onclick="editP('${safeName}')" style="background:var(--aussie-blue); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:400;">수정</button>
          <button onclick="toggleGender('${safeName}')" style="background:${p.gender === 'F' ? '#E8437A' : '#3A7BD5'}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:400;">${gBtnIcon}</button>
          <button onclick="toggleLevel('${safeName}')" style="background:${lvColor}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:600;">${lv}</button>
          <button onclick="toggleGuest('${safeName}')" style="background:#8E8E93; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:400;">구분</button>
          <button onclick="delP('${safeName}')" style="background:var(--roland-clay); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:400;">삭제</button>
        </td>
      </tr>`;
  }).join('');

  document.querySelector('#pL tbody').innerHTML = rows;
}

async function resetScoresKeepPlayers() {
  checkClubPin(async ok => {
    if (!ok) return;
    players.forEach(p => {
      Object.keys(p).forEach(k => {
        if (k !== 'name' && k !== 'isGuest') p[k] = 0;
      });
    });
    matchLog = [];
    await pushPayload({ action: "save", data: players, matchLogAppend: [], matchLogReset: true });
    tab(1);
    renderStatsPlayerList();
    setTimeout(applyAutofitAllTables, 0);
  });
}

function resetWeeklyOnly() {
  checkClubPin(ok => {
    if (!ok) return;
    players.forEach(p => {
      ['weekly', 'wdScore', 'wsScore', 'wWins', 'wLosses', 'wdWins', 'wdLosses', 'wsWins', 'wsLosses', 'lastW', 'lastWD', 'lastWS'].forEach(f => p[f] = 0);
    });
    pushDataOnly();
    tab(2);
    setTimeout(applyAutofitAllTables, 0);
  });
}

async function adminResetAll() {
  checkClubPin(async ok => {
    if (!ok) return;
    gsConfirm("정말로 모든 데이터를 삭제하시겠습니까?\n\n• 선수 정보 및 경기 기록\n• 회원 가입/탈퇴 이력\n• 휴면 회원 정보\n\n⚠️ 이 작업은 되돌릴 수 없습니다.", async ok2 => {
      if (!ok2) return;
      players = [];
      matchLog = [];
      // ✅ v3.8205_3: GAS adminResetAll + adminPin + confirmText:DELETE 전송
      // — guardNonEmptyData_ 안전장치 우회, wipeAll_() 직접 실행
      const ok = await pushPayload({
        action: "adminResetAll",
        adminPin: ADMIN_PIN,
        confirmText: "DELETE"
      });
      if (ok) {
        updatePlayerList();
        renderStatsPlayerList();
        renderPool();
        hT = []; aT = [];
        $('hN').innerText = ''; $('aN').innerText = '';
        $('hS').value = ''; $('aS').value = '';
        gsAlert("전체 삭제 완료! ✅");
      } else {
        gsAlert("서버 삭제 실패 😵 관리자에게 문의하세요.");
      }
    });
  });
}

function switchView(v, b) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (b) b.classList.add('active');
  showView(v);
}

// ===== v3.5 구조 정리: Game/운영 허브 =====

function checkAdminAndShow(viewName) {
  if (viewName === 'player-mgmt' && !adminUnlocked) {
    checkClubPin(ok => {
      if (!ok) return;
      adminUnlocked = true;
      showView(viewName);
    });
    return;
  }
  showView(viewName);
}
function showView(v) {
  // ✅ v3.80: 'weather' 호출 하위호환 → 'home'으로 전환
  if (v === 'weather') v = 'home';

  // ✅ v4.032: treasurer 화면에서 다른 화면으로 나갈 때 자동 저장
  const currentVisible = document.querySelector('.app-screen[style*="display: block"], .app-screen[style*="display:block"]');
  if (currentVisible && currentVisible.id === 'view-treasurer' && v !== 'treasurer') {
    pushDataOnly().catch(e => console.warn('treasurer 자동저장 오류:', e));
  }

  document.querySelectorAll('.app-screen').forEach(el => el.style.display = 'none');
  const el = document.getElementById(`view-${v}`);
  if (el) el.style.display = 'block';
  // subviews에서도 표는 자동 보정
  setTimeout(applyAutofitAllTables, 0);

  // 기존 훅 유지
  if (v === 'tennis') sync();
  if (v === 'player-mgmt') { updatePlayerList(); }
  if (v === 'record') renderPool();
  if (v === 'ladder') renderLadderPlayerPool();
  if (v === 'tournament') initTournament();
  if (v === 'stats') renderStatsPlayerList();
  if (v === 'round') initRoundPlayerPool();
  if (v === 'club-mgmt') renderClubManageList();
  if (v === 'home') { loadCourtInfo(); loadNotices(); }
  if (v === 'treasurer') { resetTreasurerView(); }
  if (v === 'exchange' && typeof initExchangeView === 'function') initExchangeView();
}

function openSingleGame() {
  // 랭킹 화면의 '경기기록' 탭(s3)로 바로 이동
  showView('tennis');
  tab(3);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openPlayerManager() {
  // 랭킹 화면의 '선수관리' 탭(s4)로 바로 이동
  showView('tennis');
  tab(4);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openTournament() { showView('tournament'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openLadder() { showView('ladder'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

function comingSoon(name) {
  gsAlert(`${name}은(는) 다음 버전에서 오픈!`);
}

function toggleTournamentMode() {
  const btn = $('btnTourMode');
  if (isPracticeMode === 'practice') {
    checkClubPin(ok => {
      if (!ok) return;
      isPracticeMode = 'real';
      localStorage.setItem('grandslam_practice_mode', 'real');
      btn.innerText = "🟥 실전 모드 (모든 기록 반영 O)";
      btn.style.background = "#FF3B30";
      gsAlert("실전 모드 ON ✅\n모든 게임 기록이 정상 반영됩니다!");
    });
  } else {
    isPracticeMode = 'practice';
    localStorage.setItem('grandslam_practice_mode', 'practice');
    btn.innerText = "🟩 전체 게임 연습 모드 (기록반영 X)";
    btn.style.background = "#34C759";
    gsAlert("전체 게임 연습 모드 ON ✅\n단일게임/토너먼트 모두 기록이 반영되지 않습니다!");
  }
}

