// ========================================
// CLUB.JS - 클럽 관리 / 코트 / 공지 / 날씨
// ========================================


// ----------------------------------------
// 1. 클럽 ID 관리
// ----------------------------------------

function getActiveClubId() {
  return (currentClub && currentClub.clubId)
    ? currentClub.clubId
    : (localStorage.getItem('selectedClubId') || 'tov');
}

function loadActiveClubId() {
  return localStorage.getItem('selectedClubId')
    || localStorage.getItem(ACTIVE_CLUB_KEY)
    || 'tov';
}

function saveActiveClubId(id) {
  localStorage.setItem('selectedClubId', id || '');
  localStorage.setItem(ACTIVE_CLUB_KEY, id || '');
}


// ----------------------------------------
// 2. 즐겨찾기 / 최근 클럽
// ----------------------------------------

const PINNED_CLUBS_KEY = 'grandslam_pinned_clubs_v1';
const RECENT_CLUBS_KEY = 'grandslam_recent_clubs_v1';

function _loadIdArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch (e) { return []; }
}

function _saveIdArray(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) { }
}

function loadPinnedClubIds() { return _loadIdArray(PINNED_CLUBS_KEY); }
function loadRecentClubIds()  { return _loadIdArray(RECENT_CLUBS_KEY); }

function togglePinnedClub(clubId) {
  if (!clubId) return;
  const pinned = loadPinnedClubIds();
  const idx = pinned.indexOf(String(clubId));
  if (idx >= 0) pinned.splice(idx, 1);
  else pinned.unshift(String(clubId));
  _saveIdArray(PINNED_CLUBS_KEY, pinned.slice(0, 30));
  renderClubDropdownList();
}

function pushRecentClub(clubId) {
  if (!clubId) return;
  const id = String(clubId);
  const recent = loadRecentClubIds().filter(x => x !== id);
  recent.unshift(id);
  _saveIdArray(RECENT_CLUBS_KEY, recent.slice(0, 5));
}


// ----------------------------------------
// 3. 클럽 목록 로드
// ----------------------------------------

async function fetchClubList() {
  try {
    const snap = await _db.collection('clubs').get();
    clubList = snap.docs.map(d => d.data()).filter(c => c.clubId);
    return clubList;
  } catch (e) {
    console.error('fetchClubList error:', e);
    clubList = [];
    return [];
  }
}


// ----------------------------------------
// 4. 지역 헬퍼
// ----------------------------------------

const DEFAULT_COUNTRY = 'KR';

function _safeVal(v) { return (v === undefined || v === null) ? '' : String(v); }
function _trim(v) { return _safeVal(v).trim(); }

function ensureClubRegionFieldsObject(clubObj) {
  const countryCode = _trim(clubObj.countryCode || DEFAULT_COUNTRY) || DEFAULT_COUNTRY;
  const region1  = _trim(clubObj.region1  || '미지정') || '미지정';
  const region2  = _trim(clubObj.region2  || '미지정') || '미지정';
  const regionKey = _trim(clubObj.regionKey) || buildRegionKey(countryCode, region1, region2);
  return { countryCode, region1, region2, regionKey };
}

async function ensureClubsHaveRegionFields() {
  try {
    if (!_db) return;
    const missing = clubList.filter(c => !c.regionKey || !c.region1 || !c.region2 || !c.countryCode);
    if (missing.length === 0) return;
    for (const c of missing) {
      const patch = ensureClubRegionFieldsObject(c);
      await _db.collection('clubs').doc(c.clubId).set(patch, { merge: true });
    }
    await fetchClubList();
  } catch (e) {
    console.warn('ensureClubsHaveRegionFields error:', e);
  }
}

function getClubRegionLabel(c) {
  const r1 = _trim(c.region1);
  const r2 = _trim(c.region2);
  if (!r1 && !r2) return '';
  if ((r1 === '미지정' && r2 === '미지정') || (!r1 && !r2)) return '지역 미지정';
  if (r1 && r2) return `${r1} ${r2}`;
  return r1 || r2;
}

function initRegionSelects() {
  const fr1 = $('clubFilterRegion1');
  const fr2 = $('clubFilterRegion2');
  if (fr1 && fr1.options.length <= 1) {
    const r1s = getRegion1List(DEFAULT_COUNTRY);
    fr1.innerHTML = '<option value="__ALL__">전체</option>' +
      '<option value="미지정">미지정(설정 필요)</option>' +
      r1s.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }
  if (fr2 && fr2.options.length <= 1) {
    fr2.innerHTML = '<option value="__ALL__">전체</option>';
    fr2.disabled = true;
  }

  const cr1 = $('cfRegion1');
  const cr2 = $('cfRegion2');
  if (cr1 && cr1.options.length <= 1) {
    const r1s = getRegion1List(DEFAULT_COUNTRY);
    cr1.innerHTML = '<option value="">시/도 선택</option>' +
      r1s.map(r => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  }
  if (cr2 && cr2.options.length <= 1) {
    cr2.innerHTML = '<option value="">시/군/구 선택</option>';
  }
}

function onClubFilterRegion1Change() {
  const r1 = _trim($('clubFilterRegion1')?.value);
  const r2Sel = $('clubFilterRegion2');
  if (!r2Sel) return;

  if (!r1 || r1 === '__ALL__') {
    r2Sel.innerHTML = '<option value="__ALL__">전체</option>';
    r2Sel.value = '__ALL__';
    r2Sel.disabled = true;
    renderClubDropdownList();
    return;
  }

  const list = (r1 === '미지정') ? ['미지정'] : (getRegion2List(DEFAULT_COUNTRY, r1) || []);
  r2Sel.disabled = false;
  r2Sel.innerHTML = '<option value="__ALL__">전체</option>' +
    (list || []).filter(x => Boolean(x) && x !== '직접입력…')
               .map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  r2Sel.value = '__ALL__';
  renderClubDropdownList();
}

function onClubFormRegion1Change() {
  const r1 = _trim($('cfRegion1')?.value);
  const r2Sel = $('cfRegion2');
  const custom = $('cfRegion2Custom');
  if (!r2Sel) return;
  const list = r1 ? getRegion2List(DEFAULT_COUNTRY, r1) : [];
  r2Sel.innerHTML = '<option value="">시/군/구 선택</option>' +
    (list || ['직접입력…']).filter(Boolean).map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
  if (custom) { custom.style.display = 'none'; custom.value = ''; }
}

function onClubFormRegion2Change() {
  const v = _trim($('cfRegion2')?.value);
  const custom = $('cfRegion2Custom');
  if (!custom) return;
  if (v === '직접입력…') {
    custom.style.display = 'block';
    setTimeout(() => { try { custom.focus(); } catch (e) { } }, 50);
  } else {
    custom.style.display = 'none';
    custom.value = '';
  }
}

window.togglePinnedClub          = togglePinnedClub;
window.getActiveClubId           = getActiveClubId;
window.initClubSystem            = initClubSystem;
window.switchClub                = switchClub;
window.openClubDropdown          = openClubDropdown;
window.closeClubDropdown         = closeClubDropdown;
window.openClubCreate            = openClubCreate;
window.openClubEdit              = openClubEdit;
window.closeClubForm             = closeClubForm;
window.saveClubForm              = saveClubForm;
window.deleteClub                = deleteClub;
window.toggleClubGuide           = toggleClubGuide;
window.onClubFilterRegion1Change = onClubFilterRegion1Change;
window.onClubFormRegion1Change   = onClubFormRegion1Change;
window.onClubFormRegion2Change   = onClubFormRegion2Change;
window.openNaverWeather          = openNaverWeather;
window.openCourtMap              = openCourtMap;
window.shareContent              = shareContent;
window.toggleShareDropdown       = toggleShareDropdown;
window.addCourtSlotRow           = addCourtSlotRow;
window.addCourtNotice            = addCourtNotice;
window.deleteCourtNotice         = deleteCourtNotice;
window.applyCourtPreset          = applyCourtPreset;
window.addAnnouncement           = addAnnouncement;
window.deleteAnnouncement        = deleteAnnouncement;
window.loadWeatherForNextMeeting = loadWeatherForNextMeeting;


// ----------------------------------------
// 5. 클럽 시스템 초기화 / 전환
// ----------------------------------------

async function initClubSystem() {
  await fetchClubList();
  await ensureClubsHaveRegionFields();

  const savedId = loadActiveClubId();
  const saved   = clubList.find(c => c.clubId === savedId);
  const target  = saved || clubList.find(c => c.isDefault) || clubList[0];

  if (target) activateClub(target, true);
  updateClubSelectorUI();
  initRegionSelects();
}

function activateClub(club, doSync) {
  if (currentClub && currentClub.clubId) {
    localStorage.setItem('grandslam_fee_data_' + currentClub.clubId, JSON.stringify(feeData));
    pushFeeData().catch(e => console.warn('activateClub pushFeeData error:', e));
  }

  currentClub = club;
  const savedPin = localStorage.getItem('grandslam_admin_pin_' + club.clubId);
  ADMIN_PIN = savedPin || club.adminPin || '0707';
  saveActiveClubId(club.clubId);
  pushRecentClub(club.clubId);

  updateClubSelectorUI();
  updateClubThemeColor(club.color);
  updateWeatherCityForClub(club);

  // 총무 모드 리셋
  treasurerUnlocked = false;
  financeData = [];
  feeData = {};
  monthlyFeeAmount = 0;

  // 새 클럽 feeData 복원
  const newCid = club.clubId;
  if (newCid) {
    const savedFeeData = localStorage.getItem('grandslam_fee_data_' + newCid);
    if (savedFeeData) { try { feeData = JSON.parse(savedFeeData); } catch (e) { feeData = {}; } }
    const savedFee = localStorage.getItem('grandslam_monthly_fee_' + newCid);
    if (savedFee) { monthlyFeeAmount = parseInt(savedFee) || 0; }
  }

  // 클럽 전환 시 데이터 즉시 초기화
  if (typeof currentLoggedPlayer !== 'undefined') currentLoggedPlayer = null;
  players = [];
  matchLog = [];
  courtNotices = [];
  announcements = [];
  oneTimePlayers = [];

  if (doSync !== false) {
    try { sync(); } catch (e) { console.error('Club sync error:', e); }
    fetchCourtNotices().then(() => loadCourtInfo()).catch(() => { });
    fetchAnnouncements().then(() => loadNotices()).catch(() => { });
  }
}

function updateClubSelectorUI() {
  const dot      = $('clubDot');
  const nameText = $('clubNameText');
  if (!currentClub) return;
  if (dot)      dot.style.background = currentClub.color || '#5D9C76';
  if (nameText) nameText.textContent = currentClub.clubName || '클럽 없음';
}

function updateClubThemeColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--wimbledon-sage', color);
}

function updateWeatherCityForClub(club) {
  const cityInput   = $('city');
  const headerBanner = document.querySelector('#view-home .header-banner');
  if (cityInput) cityInput.value = '';
  if (headerBanner && club.cityKo) {
    headerBanner.innerHTML = '<span class="material-symbols-outlined">wb_sunny</span>' + escapeHtml(club.cityKo) + ' 날씨';
  }
}

async function switchClub(clubId) {
  const club = clubList.find(c => c.clubId === clubId);
  if (!club) return;
  if (currentClub && currentClub.clubId === clubId) { closeClubDropdown(); return; }
  closeClubDropdown();
  gsConfirm(`"${club.clubName}"(으)로 전환하시겠습니까?\n데이터가 새로 불러와집니다.`, ok => {
    if (!ok) return;
    activateClub(club, true);
    if (typeof showView === 'function') showView('weather');
  });
}


// ----------------------------------------
// 6. 클럽 드롭다운
// ----------------------------------------

function openClubDropdown() {
  initRegionSelects();
  renderClubDropdownList();
  $('clubDropdown').classList.add('active');
}

function closeClubDropdown() {
  $('clubDropdown').classList.remove('active');
}

function renderClubDropdownList() {
  const container = $('clubDropdownList');
  if (!container) return;

  const filterR1 = _trim($('clubFilterRegion1')?.value);
  const filterR2 = _trim($('clubFilterRegion2')?.value);
  const q = _trim($('clubFilterSearch')?.value).toLowerCase();

  if (clubList.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; font-size:13px;">등록된 클럽이 없습니다.</div>';
    return;
  }

  const pinnedIds  = loadPinnedClubIds();
  const recentIds  = loadRecentClubIds();
  const byId       = new Map(clubList.map(c => [String(c.clubId), c]));
  const pinnedClubs = pinnedIds.map(id => byId.get(String(id))).filter(Boolean);
  const recentClubs = recentIds.map(id => byId.get(String(id))).filter(Boolean);
  const qMatch = (c) => !q || (_trim(c.clubName) || '').toLowerCase().includes(q);
  const pinnedSet  = new Set(pinnedClubs.map(c => String(c.clubId)));
  const recentOnly = recentClubs.filter(c => !pinnedSet.has(String(c.clubId)));
  const used = new Set([...pinnedClubs, ...recentOnly].map(c => String(c.clubId)));

  let main = clubList.slice();
  if (filterR1 && filterR1 !== '__ALL__') main = main.filter(c => _trim(c.region1) === filterR1);
  if (filterR2 && filterR2 !== '__ALL__') main = main.filter(c => _trim(c.region2) === filterR2);
  if (q) main = main.filter(qMatch);
  main = main.filter(c => !used.has(String(c.clubId)));

  const sectionTitle = (icon, text) =>
    `<div style="margin:10px 0 6px; color:#777; font-size:12px; font-weight:700; display:flex; align-items:center; gap:6px;">` +
    `<span class="material-symbols-outlined" style="font-size:16px; color:#777;">${icon}</span>${escapeHtml(text)}</div>`;

  const clubItemHtml = (c) => {
    const isActive  = currentClub && currentClub.clubId === c.clubId;
    const isPinned  = pinnedSet.has(String(c.clubId));
    const regionLabel = getClubRegionLabel(c);
    return `<div class="club-item ${isActive ? 'active-club' : ''}" onclick="switchClub('${c.clubId}')">` +
      `<span class="club-item-dot" style="background:${c.color || '#5D9C76'}"></span>` +
      `<div class="club-item-info">` +
      `<div class="club-item-name">${escapeHtml(c.clubName)}${c.isDefault ? ' <span style="font-size:10px;color:#999;">(기본)</span>' : ''}</div>` +
      `<div class="club-item-sub">${escapeHtml(regionLabel)}${regionLabel ? ' · ' : ''}${escapeHtml(c.cityKo || c.city || '')}</div>` +
      `</div>` +
      `<span class="material-symbols-outlined" title="즐겨찾기" onclick="event.stopPropagation();togglePinnedClub('${c.clubId}');" ` +
      `style="font-size:20px; color:${isPinned ? '#C4A55A' : '#b0b0b0'}; margin-left:auto; padding:6px; border-radius:10px; cursor:pointer;">${isPinned ? 'star' : 'star_border'}</span>` +
      (isActive ? '<span class="material-symbols-outlined club-item-check">check_circle</span>' : '') +
      `</div>`;
  };

  let html = '';
  const pinnedShown = pinnedClubs.filter(qMatch);
  if (pinnedShown.length) { html += sectionTitle('star', '즐겨찾기'); html += pinnedShown.map(clubItemHtml).join(''); }

  const recentShown = recentOnly.filter(qMatch);
  if (recentShown.length) { html += sectionTitle('history', '최근'); html += recentShown.map(clubItemHtml).join(''); }

  if (!pinnedShown.length && !recentShown.length && main.length === 0) {
    container.innerHTML = '<div style="padding:18px; text-align:center; color:#999; font-size:13px;">조건에 맞는 클럽이 없습니다.</div>';
    return;
  }

  if (main.length) {
    if (pinnedShown.length || recentShown.length) html += '<div style="height:10px;"></div>';
    html += main.map(clubItemHtml).join('');
  }

  container.innerHTML = html || '<div style="padding:18px; text-align:center; color:#999; font-size:13px;">조건에 맞는 클럽이 없습니다.</div>';
}


// ----------------------------------------
// 7. 클럽 생성 / 수정 / 삭제
// ----------------------------------------

function openClubCreate() {
  if (!currentUserAuth) { gsAlert('클럽을 추가하려면 먼저 로그인해주세요.'); return; }
  closeClubDropdown();
  $('clubFormTitle').textContent = '새 클럽 추가';
  ['cfName', 'cfPin', 'cfCity', 'cfCityKo'].forEach(id => { $( id).value = ''; });
  if ($('cfRegion1')) $('cfRegion1').value = '';
  if ($('cfRegion2')) $('cfRegion2').innerHTML = '<option value="">시/군/구 선택</option>';
  if ($('cfRegion2Custom')) { $('cfRegion2Custom').style.display = 'none'; $('cfRegion2Custom').value = ''; }
  $('cfEditId').value = '';
  renderColorChips('');
  if ($('cfGuideToggle')) $('cfGuideToggle').style.display = 'block';
  if ($('cfGuideBody'))   $('cfGuideBody').style.display = 'none';
  if ($('cfGuideArrow'))  $('cfGuideArrow').style.transform = '';
  initRegionSelects();
  $('clubFormModal').classList.add('active');
}

function openClubEdit(clubId) {
  checkMasterPin(ok => {
    if (!ok) return;
    const club = clubList.find(c => c.clubId === clubId);
    if (!club) return;
    closeClubDropdown();
    $('clubFormTitle').textContent = '클럽 수정';
    $('cfName').value   = club.clubName || '';
    $('cfPin').value    = club.adminPin || '';
    $('cfCity').value   = club.city     || '';
    $('cfCityKo').value = club.cityKo   || '';
    initRegionSelects();
    const regionPatch = ensureClubRegionFieldsObject(club);
    if ($('cfRegion1')) { $('cfRegion1').value = regionPatch.region1; onClubFormRegion1Change(); }
    if ($('cfRegion2')) { $('cfRegion2').value = regionPatch.region2; onClubFormRegion2Change(); }
    $('cfEditId').value = club.clubId;
    renderColorChips(club.color || '');
    if ($('cfGuideToggle')) $('cfGuideToggle').style.display = 'none';
    $('clubFormModal').classList.add('active');
  });
}

function closeClubForm() {
  $('clubFormModal').classList.remove('active');
}

function toggleClubGuide() {
  const body  = $('cfGuideBody');
  const arrow = $('cfGuideArrow');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function renderColorChips(selectedColor) {
  const row = $('cfColorRow');
  if (!row) return;
  row.innerHTML = CLUB_COLORS.map(c =>
    `<div class="club-color-chip ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="selectClubColor(this)"></div>`
  ).join('');
}

function selectClubColor(el) {
  document.querySelectorAll('.club-color-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

function getSelectedColor() {
  const sel = document.querySelector('.club-color-chip.selected');
  return sel ? (sel.getAttribute('data-color') || CLUB_COLORS[0]) : CLUB_COLORS[0];
}

var _clubFormSaving = false;

async function saveClubForm() {
  if (_clubFormSaving) return;

  const name   = $('cfName').value.trim();
  const pin    = String($('cfPin').value.trim());
  const city   = $('cfCity').value.trim();
  const cityKo = $('cfCityKo').value.trim();
  const color  = getSelectedColor();
  const editId = $('cfEditId').value;

  const region1 = _trim($('cfRegion1')?.value) || '미지정';
  let region2   = _trim($('cfRegion2')?.value) || '미지정';
  if (region2 === '직접입력…') region2 = _trim($('cfRegion2Custom')?.value) || '미지정';
  const countryCode = DEFAULT_COUNTRY;
  const regionKey   = buildRegionKey(countryCode, region1 || '미지정', region2 || '미지정');

  if (!name) { gsAlert('클럽 이름을 입력해주세요.'); return; }
  if (!pin)  { gsAlert('관리자 비밀번호를 입력해주세요.'); return; }

  _clubFormSaving = true;
  $('loading-overlay').style.display = 'flex';

  try {
    if (editId) {
      await _db.collection('clubs').doc(editId).update({
        clubName: name, adminPin: pin,
        city: city || 'Gwangmyeong', cityKo: cityKo || city || '도시',
        color, countryCode, region1, region2, regionKey
      });
      localStorage.setItem('grandslam_admin_pin_' + editId, pin);
      await fetchClubList();
      if (currentClub && currentClub.clubId === editId) {
        const updated = clubList.find(c => c.clubId === editId);
        if (updated) { activateClub(updated, true); ADMIN_PIN = pin; }
      }
      gsAlert('클럽 정보가 수정되었습니다!');
    } else {
      const newId = 'club_' + Date.now();
      await _db.collection('clubs').doc(newId).set({
        clubId: newId, clubName: name, adminPin: pin,
        city: city || 'Gwangmyeong', cityKo: cityKo || city || '도시',
        color, isDefault: false, sport: 'tennis', createdAt: Date.now(),
        countryCode, region1, region2, regionKey,
        approved: false, gameCount: 0
      });
      await fetchClubList();
      gsAlert(`"${name}" 클럽이 생성되었습니다!`, () => {
        gsConfirm(`"${name}" 클럽으로 바로 전환하시겠습니까?`, ok => {
          if (!ok) return;
          const newClub = clubList.find(c => c.clubId === newId);
          if (newClub) { activateClub(newClub, true); showView('weather'); }
        });
      });
    }
  } catch (e) {
    gsAlert('오류: ' + e.message);
  } finally {
    $('loading-overlay').style.display = 'none';
    _clubFormSaving = false;
  }

  closeClubForm();
  renderClubManageList();
}

async function deleteClub(clubId) {
  checkMasterPin(async ok => {
    if (!ok) return;
    const club = clubList.find(c => c.clubId === clubId);
    if (!club) return;
    if (currentClub && currentClub.clubId === clubId) {
      gsAlert('현재 활성화된 클럽은 삭제할 수 없습니다.\n다른 클럽으로 전환 후 삭제해주세요.');
      return;
    }
    gsConfirm(`"${club.clubName}" 클럽을 삭제하시겠습니까?\n\n※ 앱 내 등록만 해제됩니다.`, async ok2 => {
      if (!ok2) return;
      $('loading-overlay').style.display = 'flex';
      try {
        await _db.collection('clubs').doc(clubId).delete();
        if (localStorage.getItem('selectedClubId') === clubId) localStorage.removeItem('selectedClubId');
        if (localStorage.getItem('grandslam_active_club_v2') === clubId) localStorage.removeItem('grandslam_active_club_v2');
        await fetchClubList();
        const defaultClub = clubList.find(c => c.isDefault) || clubList[0];
        if (defaultClub) saveActiveClubId(defaultClub.clubId);
        gsAlert('클럽 등록이 해제되었습니다.\n페이지를 새로고침합니다.');
        setTimeout(() => location.reload(), 1000);
      } catch (e) {
        gsAlert('오류: ' + e.message);
        $('loading-overlay').style.display = 'none';
      }
    });
  });
}

function renderClubManageList() {
  const container = $('clubManageList');
  if (!container) return;
  if (clubList.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">클럽 목록을 불러오는 중...</div>';
    return;
  }
  container.innerHTML = clubList.map(c => {
    const isActive    = currentClub && currentClub.clubId === c.clubId;
    const regionLabel = getClubRegionLabel(c);
    const needsRegion = regionLabel === '지역 미지정';
    return `<div class="club-card-manage" style="${isActive ? `border-color:${c.color || '#5D9C76'};` : ''}">` +
      `<span class="club-manage-dot" style="background:${c.color || '#5D9C76'}"></span>` +
      `<div class="club-manage-info">` +
      `<div class="club-manage-name">${escapeHtml(c.clubName)}` +
      (isActive ? ' <span style="font-size:11px;color:var(--wimbledon-sage);">(활성)</span>' : '') +
      (c.isDefault ? ' <span style="font-size:10px;color:#999;">(기본)</span>' : '') +
      `</div><div class="club-manage-url">` +
      (needsRegion ? '<span style="display:inline-block;font-size:11px;color:#d32f2f;background:rgba(211,47,47,0.08);padding:2px 8px;border-radius:999px;margin-right:6px;">지역 설정 필요</span>' : '') +
      `${escapeHtml(regionLabel)}${regionLabel ? ' · ' : ''}${escapeHtml(c.cityKo || c.city || '')}` +
      `</div></div>` +
      `<div class="club-manage-actions">` +
      `<button class="club-manage-btn" style="background:var(--aussie-blue);" onclick="openClubEdit('${c.clubId}')">수정</button>` +
      (!c.isDefault ? `<button class="club-manage-btn" style="background:var(--roland-clay);" onclick="deleteClub('${c.clubId}')">삭제</button>` : '') +
      `</div></div>`;
  }).join('');
}


// ----------------------------------------
// 8. 코트 정보
// ----------------------------------------

function loadCourtInfo() {
  const todayStr  = new Date().toISOString().slice(0, 10);
  const upcoming  = courtNotices.filter(n => n.date >= todayStr).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const notice    = upcoming.length > 0 ? upcoming[0] : null;

  if (notice) {
    const slots = notice.slots || [{ time: notice.time, court: notice.memo }];
    $('courtName').textContent = notice.courtName || '';

    const slotDisplay = $('courtSlotDisplay');
    if (slotDisplay) {
      slotDisplay.innerHTML = slots.filter(s => s.time || s.court).map(s => {
        const courtBadge = s.court
          ? `<span style="margin-left:8px; font-size:13px; color:var(--wimbledon-sage); font-weight:400; background:rgba(93,156,118,0.1); padding:2px 8px; border-radius:8px;">${escapeHtml(s.court)}</span>`
          : '';
        return `<div style="display:flex; align-items:center;">${escapeHtml(s.time || '')}${courtBadge}</div>`;
      }).join('');
    }

    $('courtAddress').textContent = notice.address || '';
    $('courtMemo').style.display = 'none';

    if (notice.date !== todayStr) {
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const d = new Date(notice.date + 'T00:00:00');
      const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
      $('courtName').textContent = `[${notice.date.slice(5)}${dayStr}] ${notice.courtName || ''}`;
    }

    $('courtInfoCard').style.display    = 'block';
    $('courtInfoContent').style.display = 'block';
    $('courtNoNotice').style.display    = 'none';
  } else {
    $('courtInfoCard').style.display    = 'block';
    $('courtInfoContent').style.display = 'none';
    $('courtNoNotice').style.display    = 'block';
  }
}

function openCourtMap() {
  const address = $('courtAddress').textContent;
  if (!address) return;
  window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`, '_blank');
}


// ----------------------------------------
// 9. 공지사항
// ----------------------------------------

function loadNotices() {
  const listEl = $('noticeList');
  if (!listEl) return;

  const active = announcements
    .filter(a => !a.deleted)
    .sort((a, b) => {
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      return (b.registeredDate || '').localeCompare(a.registeredDate || '');
    })
    .slice(0, 5);

  if (active.length === 0) {
    listEl.innerHTML = '<div class="notice-empty">등록된 공지가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = active.map(a => {
    const badge   = a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : '';
    const dateStr = a.registeredDate ? a.registeredDate.replace(/-/g, '.') : '';
    return `<div class="notice-item${a.isImportant ? ' important' : ''}">
      <div class="notice-title-row">${badge}<span>${escapeHtml(a.title).replace(/\n/g, '<br>')}</span></div>
      <div class="notice-date">${dateStr} 등록</div>
    </div>`;
  }).join('');
}


// ----------------------------------------
// 10. 카톡 공유
// ----------------------------------------

function toggleShareDropdown() {
  const dd = $('shareDropdown');
  if (!dd) return;
  dd.classList.toggle('active');
  if (dd.classList.contains('active')) {
    setTimeout(() => { document.addEventListener('click', closeShareDropdownOnOutside, { once: true }); }, 10);
  }
}

function closeShareDropdownOnOutside(e) {
  const dd   = $('shareDropdown');
  const wrap = dd?.parentElement;
  if (wrap && !wrap.contains(e.target)) dd.classList.remove('active');
}

function shareContent(mode) {
  $('shareDropdown').classList.remove('active');

  const courtName    = $('courtName')?.textContent || '';
  const courtAddress = $('courtAddress')?.textContent || '';
  const dateDisp     = $('dateDisplay')?.textContent || '';

  const slotRows = $('courtSlotDisplay')?.querySelectorAll('div') || [];
  const courtTimeWithNum = Array.from(slotRows).map(r => r.textContent.trim()).filter(Boolean).join(' / ');

  let weatherSummary = '';
  const rows = $('tbody')?.querySelectorAll('tr');
  if (rows && rows.length > 0) {
    const temps = [];
    let weatherIcon = '☀️';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const temp = parseFloat(cells[2].textContent);
        if (!isNaN(temp)) temps.push(temp);
        if (cells[1]) weatherIcon = cells[1].textContent.trim();
      }
    });
    if (temps.length > 0) {
      weatherSummary = `${weatherIcon} 날씨: ${Math.min(...temps).toFixed(1)}~${Math.max(...temps).toFixed(1)}°C`;
    }
  }

  let text = '';
  if (mode === 'weather' || mode === 'weather+court' || mode === 'all') {
    text += `🎾 ${dateDisp} 정보\n`;
    if (weatherSummary) text += `${weatherSummary}\n`;
  }
  if (mode === 'weather+court' || mode === 'all' || mode === 'text') {
    text += `📍 ${courtName}\n⏰ ${courtTimeWithNum}\n`;
    if (courtAddress) text += `🗺️ ${courtAddress}\n`;
  }
  if (mode === 'all') {
    const activeNotices = announcements.filter(a => !a.deleted).slice(0, 5);
    if (activeNotices.length > 0) {
      text += `\n📢 공지사항\n`;
      activeNotices.forEach(a => { text += `${a.isImportant ? '⭐ ' : '• '}${a.title}\n`; });
    }
  }
  if (mode === 'text') {
    text = `🎾 ${dateDisp} 정보\n📍 ${courtName}\n⏰ ${courtTimeWithNum}\n`;
    if (courtAddress) text += `🗺️ ${courtAddress}\n`;
    if (weatherSummary) text += `${weatherSummary}\n`;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text.trim()).then(() => gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.')).catch(() => fallbackCopy(text.trim()));
  } else {
    fallbackCopy(text.trim());
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.'); }
  catch (e) { gsAlert('복사 실패. 직접 선택하여 복사해주세요.'); }
  document.body.removeChild(ta);
}


// ----------------------------------------
// 11. 코트 공지 CRUD
// ----------------------------------------

function getCourtPresetKey() { return 'grandslam_court_presets_' + getActiveClubId(); }

function loadCourtPresets() {
  try { courtPresets = JSON.parse(localStorage.getItem(getCourtPresetKey())) || []; }
  catch (e) { courtPresets = []; }
  renderCourtPresetSelect();
}

function saveCourtPresetToStorage(preset) {
  if (!courtPresets.find(p => p.name === preset.name)) {
    courtPresets.push(preset);
    localStorage.setItem(getCourtPresetKey(), JSON.stringify(courtPresets));
  }
  renderCourtPresetSelect();
}

function renderCourtPresetSelect() {
  const sel = $('courtPresetSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">📌 저장된 코트 선택 (직접 입력)</option>' +
    courtPresets.map((p, i) => {
      const slotsStr = (p.slots || []).map(s => s.time).filter(Boolean).join(', ');
      return `<option value="${i}">${escapeHtml(p.name)}${slotsStr ? ' (' + escapeHtml(slotsStr) + ')' : ''}</option>`;
    }).join('');
}

function applyCourtPreset() {
  const sel = $('courtPresetSelect');
  const idx = parseInt(sel.value);
  if (isNaN(idx) || !courtPresets[idx]) return;
  const p = courtPresets[idx];
  $('courtNoticeName').value = p.name    || '';
  $('courtNoticeAddr').value = p.address || '';

  const container = $('courtSlotRows');
  container.innerHTML = '';
  (p.slots || [{ time: '', court: '' }]).forEach(s => {
    container.appendChild(_makeSlotRow(s));
  });
  updateAddSlotBtn();
}

function _makeSlotRow(s = {}) {
  const [tStart, tEnd] = (s.time || '').split('-');
  const row = document.createElement('div');
  row.className = 'court-slot-row';
  row.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-bottom:8px;';
  row.innerHTML =
    `<div style="display:flex; gap:6px; align-items:center;">` +
    `<input type="time" class="w-input court-slot-time-start" value="${escapeHtml((tStart || '').trim())}" style="flex:1; padding:10px;" />` +
    `<span style="font-size:14px; color:#999; flex-shrink:0;">~</span>` +
    `<input type="time" class="w-input court-slot-time-end" value="${escapeHtml((tEnd || '').trim())}" style="flex:1; padding:10px;" /></div>` +
    `<input type="text" class="w-input court-slot-court" placeholder="코트번호 (예: 11,12번)" value="${escapeHtml(s.court || '')}" style="width:100%; padding:10px; box-sizing:border-box;" />`;
  return row;
}

function addCourtSlotRow() {
  const container = $('courtSlotRows');
  if (container.querySelectorAll('.court-slot-row').length >= 5) return;
  container.appendChild(_makeSlotRow());
  updateAddSlotBtn();
}

function updateAddSlotBtn() {
  const rows = $('courtSlotRows').querySelectorAll('.court-slot-row');
  const btn  = $('btnAddSlot');
  if (btn) btn.style.display = rows.length >= 5 ? 'none' : 'block';
}

function getSlotValues() {
  const rows  = $('courtSlotRows').querySelectorAll('.court-slot-row');
  const slots = [];
  rows.forEach(row => {
    const tStart = row.querySelector('.court-slot-time-start')?.value.trim() || '';
    const tEnd   = row.querySelector('.court-slot-time-end')?.value.trim()   || '';
    const time   = tStart && tEnd ? tStart + '-' + tEnd : (tStart || tEnd);
    const court  = row.querySelector('.court-slot-court').value.trim();
    if (time || court) slots.push({ time, court });
  });
  return slots;
}

function addCourtNotice() {
  const date  = $('courtNoticeDate').value;
  const name  = $('courtNoticeName').value.trim();
  const addr  = $('courtNoticeAddr').value.trim();
  const slots = getSlotValues();

  if (!date || !name) { gsAlert('날짜와 코트명은 필수입니다.'); return; }

  const notice = {
    id: Date.now().toString(), date, courtName: name, address: addr,
    slots: slots.length > 0 ? slots : [{ time: '', court: '' }],
    time: slots.map(s => s.time).filter(Boolean).join(' / '),
    memo: slots.map(s => s.court).filter(Boolean).join(', ')
  };

  courtNotices.push(notice);
  saveCourtPresetToStorage({ name, address: addr, slots: notice.slots });
  $('courtNoticeDate').value = '';
  renderCourtNoticeList();
  loadCourtInfo();
  saveCourtNotice(notice);
}

function deleteCourtNotice(id) {
  gsConfirm('삭제할까요?', ok => {
    if (!ok) return;
    courtNotices = courtNotices.filter(n => n.id !== id);
    persistCourtNoticesLocal();
    renderCourtNoticeList();
    loadCourtInfo();
    pushCourtNotices();
  });
}

function renderCourtNoticeList() {
  const list   = $('courtNoticeList');
  const sorted = [...courtNotices].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 코트 공지가 없습니다.</div>';
    return;
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  list.innerHTML = sorted.map(n => {
    const d      = new Date(n.date + 'T00:00:00');
    const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
    const slots  = n.slots || [{ time: n.time, court: n.memo }];
    const slotsHtml = slots.map(s => {
      const parts = [];
      if (s.time)  parts.push('⏰ ' + escapeHtml(s.time));
      if (s.court) parts.push('🎾 ' + escapeHtml(s.court));
      return parts.length > 0 ? `<div style="font-size:12px; color:var(--text-gray); margin-top:2px;">${parts.join(' &nbsp; ')}</div>` : '';
    }).join('');

    return `<div class="crud-item"><div class="crud-item-header"><div>` +
      `<div style="font-size:14px; color:var(--text-dark);">${escapeHtml(n.date)}${dayStr}</div>` +
      `<div style="font-size:15px; margin-top:4px;">${escapeHtml(n.courtName)}</div>` +
      slotsHtml +
      (n.address ? `<div style="font-size:12px; color:var(--text-gray);">📍 ${escapeHtml(n.address)}</div>` : '') +
      `</div><div class="crud-item-actions">` +
      `<button class="crud-btn crud-btn-del" onclick="deleteCourtNotice('${n.id}')">삭제</button>` +
      `</div></div></div>`;
  }).join('');
}


// ----------------------------------------
// 12. 공지사항 CRUD
// ----------------------------------------

function addAnnouncement() {
  const active = announcements.filter(a => !a.deleted);
  if (active.length >= 5) { gsAlert('공지는 최대 5개까지만 등록 가능합니다.'); return; }

  const title       = $('announcementTitle').value.trim();
  const isImportant = $('announcementImportant').checked;
  if (!title) { gsAlert('공지 내용을 입력하세요.'); return; }

  announcements.push({
    id: Date.now().toString(), title, isImportant,
    registeredDate: new Date().toISOString().slice(0, 10), deleted: false
  });

  $('announcementTitle').value = '';
  $('announcementImportant').checked = false;
  renderAnnouncementMgmtList();
  loadNotices();
  saveAnnouncement(announcements[announcements.length - 1]);
}

function deleteAnnouncement(id) {
  gsConfirm('삭제할까요?', ok => {
    if (!ok) return;
    const ann = announcements.find(a => a.id === id);
    if (ann) ann.deleted = true;
    persistAnnouncementsLocal();
    renderAnnouncementMgmtList();
    loadNotices();
    pushAnnouncements();
  });
}

function renderAnnouncementMgmtList() {
  const list   = $('announcementMgmtList');
  const active = announcements.filter(a => !a.deleted);

  if (active.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 공지가 없습니다.</div>';
    return;
  }

  list.innerHTML = active.map(a => `
    <div class="crud-item">
      <div class="crud-item-header">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : ''}
            <span style="font-size:15px;">${escapeHtml(a.title).replace(/\n/g, '<br>')}</span>
          </div>
          <div style="font-size:11px; color:var(--text-gray); margin-top:4px;">${(a.registeredDate || '').replace(/-/g, '.')} 등록</div>
        </div>
        <div class="crud-item-actions">
          <button class="crud-btn crud-btn-del" onclick="deleteAnnouncement('${a.id}')">삭제</button>
        </div>
      </div>
    </div>`).join('');
}


// ----------------------------------------
// 13. 날씨
// ----------------------------------------

function openNaverWeather() {
  const cityKo = currentClub ? (currentClub.cityKo || '광명') : '광명';
  window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(cityKo + ' 날씨'), '_blank');
}

async function geocodeCity(cityName) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ko`;
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.results?.length > 0) {
      const res = data.results[0];
      return { lat: res.latitude, lon: res.longitude, name: res.name || cityName };
    }
    return null;
  } catch (e) {
    console.warn('geocodeCity error:', e);
    return null;
  }
}

async function loadWeather(d) {
  $('tbl').style.display   = 'none';
  $('dynamicTip').style.display = 'none';
  $('tbody').innerHTML = '';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">날씨 불러오는 중...</div>`);

  const cityInputEl = $('city');
  const cityInput   = (cityInputEl?.value.trim()) ? cityInputEl.value.trim() : (currentClub?.city || '');

  if (cityInput && cityInput !== weatherCoords.name) {
    const geo = await geocodeCity(cityInput);
    if (geo) {
      weatherCoords = geo;
      const displayCityName = currentClub?.cityKo || geo.name;
      const headerBanner = document.querySelector('#view-home .header-banner');
      if (headerBanner) headerBanner.innerHTML = '<span class="material-symbols-outlined">wb_sunny</span>' + escapeHtml(displayCityName) + ' 날씨';
    } else {
      setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">"${escapeHtml(cityInput)}" 검색 실패. 기존 위치로 표시합니다.</div>`);
    }
  }

  const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('dateDisplay').innerText = `${ds} ${['일','월','화','수','목','금','토'][d.getDay()]}요일`;
  $('dateDisplay').style.display = 'block';

  try {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat}&longitude=${weatherCoords.lon}&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m&timezone=Asia/Seoul&start_date=${ds}&end_date=${ds}`;
    const r = await fetchWithTimeout(api, {}, 12000);
    if (!r.ok) throw new Error('Weather API 실패: ' + r.status);
    const j = await r.json();
    if (!j?.hourly?.time || !Array.isArray(j.hourly.time)) throw new Error('Weather 데이터 형식 이상');

    const WX = { 0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️', 45:'🌫️', 61:'🌦️', 63:'🌧️', 71:'❄️', 80:'🚿' };
    const wanted = [];
    j.hourly.time.forEach((tStr, i) => {
      if (!tStr) return;
      const hh = parseInt(tStr.split('T')[1]?.slice(0, 2), 10);
      if (hh >= weatherTimeRange.startH && hh <= weatherTimeRange.endH) wanted.push(i);
    });
    if (wanted.length === 0) throw new Error('시간대 데이터 없음');

    let tR = 0, mW = 0, aT = 0;
    wanted.forEach(i => {
      const tStr = j.hourly.time[i];
      const hh   = tStr.split('T')[1].slice(0, 2);
      const t = j.hourly.temperature_2m?.[i];
      const c = j.hourly.weather_code?.[i];
      const rn = j.hourly.precipitation?.[i];
      const w = j.hourly.wind_speed_10m?.[i];
      if ([t, c, rn, w].some(v => v == null)) return;
      tR += rn; mW = Math.max(mW, w); aT += t;
      const icon = rn > 0 ? '🌦️' : (WX[c] || '☁️');
      $('tbody').innerHTML += `<tr><td>${hh}시</td><td>${icon}</td><td>${t.toFixed(1)}°</td><td>${rn.toFixed(1)}</td><td>${w.toFixed(1)}</td></tr>`;
    });

    const count = $('tbody').querySelectorAll('tr').length;
    if (count === 0) throw new Error('표에 표시할 데이터 없음');
    aT /= count;

    $('tipContent').innerText = tR > 0
      ? '💡 비 소식! 실내 코트 추천! ☔'
      : mW >= 5 ? '💡 바람이 세요! 바람막이 준비하세요!💨'
      : aT <= 5 ? `💡 현재 ${aT.toFixed(1)}도! 추워요. 뜨끈 커피 챙기세요☕`
      : '💡 테니스 치기 딱 좋은 날씨! 🎾';

    $('dynamicTip').style.display = 'block';
    $('tbl').style.display = 'table';
    setStatus('');
  } catch (e) {
    setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">날씨 로드 실패 😵‍💫</div>`);
  }
}

function getWed(o) {
  const d = new Date();
  d.setDate(d.getDate() + (3 - d.getDay() + 7) % 7 + o);
  return d;
}

var weatherTimeRange = { startH: 5, endH: 12 };

function getNextMeetingDates() {
  const todayStr = new Date().toISOString().slice(0, 10);
  return courtNotices
    .map(n => n.date)
    .filter(d => d >= todayStr)
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i);
}

function loadWeatherForNextMeeting(index) {
  const dates = getNextMeetingDates();

  if (dates.length > index) {
    const dateStr = dates[index];
    const d = new Date(dateStr + 'T12:00:00');

    const dayNotices = courtNotices.filter(n => n.date === dateStr);
    let startH = 5, endH = 12;

    if (dayNotices.length > 0) {
      const allSlots = dayNotices.flatMap(n => n.slots || [{ time: n.time }]);
      let earliest = 24, latest = 0;
      allSlots.forEach(s => {
        if (!s.time) return;
        const m = s.time.match(/(\d{1,2}):?\d{0,2}\s*[-~]\s*(\d{1,2})/);
        if (m) {
          earliest = Math.min(earliest, parseInt(m[1]));
          latest   = Math.max(latest,   parseInt(m[2]));
        }
      });
      if (earliest < 24 && latest > 0) {
        startH = Math.max(0, earliest - 3);
        endH   = Math.min(23, latest + 1);
      }
    }

    weatherTimeRange = { startH, endH };
    loadWeather(d);
  } else {
    weatherTimeRange = { startH: 5, endH: 12 };
    loadWeather(getWed(index * 7));
  }

  if ($('btnRefresh')) $('btnRefresh').classList.toggle('active', index === 0);
  if ($('btnNext'))    $('btnNext').classList.toggle('active',    index === 1);
}
