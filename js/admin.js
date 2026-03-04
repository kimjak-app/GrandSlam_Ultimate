// ========================================
// ADMIN.JS - 관리자 권한 시스템
//
// 기능:
//   showAdminAuth(mode)          — PIN 모달 표시
//   confirmAdminPin()            — PIN 검증
//   masterBackup()               — 전 클럽 JSON 백업
//   restoreMasterSelective(file) — 선택 클럽 복원
//   importBackupWithGuard(file)  — 클럽 ID 세이프티 가드
//
// 의존성: api.js, state.js, ui.js
// ========================================


// ----------------------------------------
// 전역 상태
// ----------------------------------------

let _adminMode       = null;
let _adminPinCallback = null;
let _allClubsCache   = [];
let _showUnapprovedOnly = false;

const MASTER_CONFIG_REF = () => _db.collection('master_config').doc('global');


// ----------------------------------------
// 1. PIN 모달
// ----------------------------------------

function showAdminAuth(mode) {
  _adminMode = mode;
  const modal   = document.getElementById('admin-pin-modal');
  const titleEl = document.getElementById('admin-pin-title');
  const inputEl = document.getElementById('admin-pin-input');
  if (!modal) { gsAlert('PIN 모달을 찾을 수 없습니다.'); return; }
  if (titleEl) titleEl.textContent = mode === 'master' ? '총괄관리자 비밀번호를 입력하세요' : '클럽 관리자 비밀번호를 입력하세요';
  if (inputEl) inputEl.value = '';
  modal.style.display = 'flex';
  setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
}

function closeAdminPinModal() {
  const modal   = document.getElementById('admin-pin-modal');
  const inputEl = document.getElementById('admin-pin-input');
  if (modal)   modal.style.display = 'none';
  if (inputEl) inputEl.value = '';
  _adminMode = null;
  _adminPinCallback = null;
}

async function confirmAdminPin() {
  const inputEl    = document.getElementById('admin-pin-input');
  const enteredPin = (inputEl ? inputEl.value : '').trim();
  if (!enteredPin) { gsAlert('비밀번호를 입력해주세요.'); return; }
  _adminMode === 'master' ? await _verifyMasterPin(enteredPin) : await _verifyManagerPin(enteredPin);
}

async function _verifyMasterPin(entered) {
  try {
    const doc = await MASTER_CONFIG_REF().get();
    if (!doc.exists) { gsAlert('⚠️ 보안 설정 오류\n\nFirestore에 master_config/global 문서가 없습니다.'); return; }
    const masterPin = doc.data().masterPin;
    if (!masterPin) { gsAlert('⚠️ 보안 설정 오류\n\nmasterPin 필드가 설정되지 않았습니다.'); return; }
    if (entered !== String(masterPin)) { gsAlert('❌ 총괄관리자 비밀번호가 틀렸습니다.'); return; }
    MASTER_PIN = String(masterPin);
    _openAdminTab('master');
  } catch (e) {
    console.error('[admin] _verifyMasterPin error:', e);
    gsAlert('인증 실패: ' + e.message);
  }
}

async function _verifyManagerPin(entered) {
  const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  if (!clubId) { gsAlert('클럽을 먼저 선택해주세요.'); return; }
  try {
    const clubDoc = await _db.collection('clubs').doc(clubId).get();
    const correct = clubDoc.exists ? (clubDoc.data().adminPin || null) : null;
    if (!correct) { gsAlert('클럽 비밀번호가 설정되지 않았습니다.\n클럽 수정에서 관리자 비밀번호를 먼저 설정해주세요.'); return; }
    if (entered !== String(correct)) { gsAlert('❌ 클럽 관리자 비밀번호가 틀렸습니다.'); return; }
    _openAdminTab('manager');
  } catch (e) {
    console.error('[admin] _verifyManagerPin error:', e);
    gsAlert('인증 실패: ' + e.message);
  }
}

function _openAdminTab(mode) {
  closeAdminPinModal();
  ['master', 'manager'].forEach(t => {
    const el = document.getElementById(`tab-${t}-admin`);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(`tab-${mode}-admin`);
  if (target) { target.style.display = 'block'; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (mode === 'master')  _renderMasterAdminTab();
  if (mode === 'manager') _renderManagerAdminTab();
}


// ----------------------------------------
// 2. 탭 렌더링
// ----------------------------------------

function _renderMasterAdminTab() {
  const el = document.getElementById('tab-master-admin');
  if (!el) return;
  el.innerHTML = `
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">verified_user</span>총괄관리자 메뉴
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <button class="btn-purple-main" onclick="masterBackup()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="material-symbols-outlined">cloud_download</span> 전체 클럽 마스터 백업
        </button>
        <div style="position:relative;">
          <input type="file" id="masterRestoreFileInput" accept=".json" style="display:none;" onchange="restoreMasterSelective(this.files[0]); this.value=''">
          <button class="btn-purple-main" onclick="document.getElementById('masterRestoreFileInput').click()" style="display:flex; align-items:center; justify-content:center; gap:8px; background:var(--roland-clay); width:100%;">
            <span class="material-symbols-outlined">folder_open</span> 선별 복원 (마스터 백업 파일)
          </button>
        </div>
        <button class="btn-purple-main" onclick="resetExchangeData()" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#8E44AD;">
          <span class="material-symbols-outlined">sync_problem</span> 교류전 기록 초기화
        </button>
      </div>
    </div>
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">approval</span>클럽 승인 관리
      </div>
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <input id="club-search-input" type="text" class="w-input" placeholder="클럽명 검색" style="flex:1; padding:8px 12px; font-size:13px;" oninput="_filterClubApprovalList()">
        <button id="btn-unapproved-only" onclick="_toggleUnapprovedFilter()" style="padding:8px 12px; border-radius:20px; border:2px solid #FF9500; background:white; color:#FF9500; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;">미승인만</button>
      </div>
      <div id="club-approval-list" style="font-size:13px; color:#888;">불러오는 중...</div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-purple-main" onclick="_loadClubApprovalList()" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:#3A7BD5;">
          <span class="material-symbols-outlined">refresh</span> 새로고침
        </button>
        <button class="btn-purple-main" onclick="approveAllExistingClubs()" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:#34C759;">
          <span class="material-symbols-outlined">done_all</span> 전체 일괄 승인
        </button>
      </div>
    </div>
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">mail</span>문의 이메일 설정
      </div>
      <input id="contact-email-input" type="email" class="w-input" placeholder="예: oropa@kakao.com" style="width:100%; padding:12px; font-size:15px; box-sizing:border-box; margin-bottom:8px;">
      <button class="btn-purple-main" onclick="_saveContactEmail()" style="width:100%; padding:12px; display:flex; align-items:center; justify-content:center; gap:6px;">
        <span class="material-symbols-outlined">save</span> 저장
      </button>
      <div id="contact-email-current" style="font-size:12px; color:#3A7BD5; margin-top:8px; text-align:center;"></div>
    </div>`;
  _loadClubApprovalList();
  _loadContactEmail();
}

function _renderManagerAdminTab() {
  const el = document.getElementById('tab-manager-admin');
  if (!el) return;
  const clubName = currentClub?.clubName || '현재 클럽';
  el.innerHTML = `
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">manage_accounts</span>클럽관리자 메뉴 — ${clubName}
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <button class="btn-purple-main" onclick="exportBackup()" style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="material-symbols-outlined">save</span> 📥 이 클럽 백업 다운로드
        </button>
        <div style="position:relative;">
          <input type="file" id="managerRestoreFileInput" accept=".json" style="display:none;" onchange="importBackupWithGuard(this.files[0]); this.value=''">
          <button class="btn-purple-main" onclick="document.getElementById('managerRestoreFileInput').click()" style="display:flex; align-items:center; justify-content:center; gap:8px; background:var(--roland-clay); width:100%;">
            <span class="material-symbols-outlined">folder_open</span> 백업 파일 선택해서 복원
          </button>
        </div>
      </div>
    </div>`;
}


// ----------------------------------------
// 3. 마스터 백업
// ----------------------------------------

async function masterBackup() {
  gsConfirm('모든 클럽의 데이터를 하나의 JSON 파일로 백업하고\nFirestore 서버에도 동시 저장합니다.\n계속하시겠습니까?', async ok => {
    if (!ok) return;
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
    try {
      const clubsSnap = await _db.collection('clubs').get();
      if (clubsSnap.empty) { gsAlert('등록된 클럽이 없습니다.'); return; }

      const masterData = { version: 'v4.5-master', exportedAt: new Date().toISOString(), clubs: [] };

      for (const clubDoc of clubsSnap.docs) {
        const clubId   = clubDoc.id;
        const clubMeta = clubDoc.data();
        const [playerSnap, logSnap, noticeDoc, feeDoc, financeDoc, exchangeSnap] = await Promise.all([
          _clubRef(clubId).collection('players').get(),
          _clubRef(clubId).collection('matchLog').orderBy('ts', 'desc').limit(500).get(),
          _clubRef(clubId).collection('settings').doc('notices').get(),
          _clubRef(clubId).collection('settings').doc('feeData').get(),
          _clubRef(clubId).collection('settings').doc('financeData').get(),
          _clubRef(clubId).collection('exchanges').get(),
        ]);
        masterData.clubs.push({
          clubId,
          clubName:        clubMeta.clubName || clubMeta.name || clubId,
          players:         playerSnap.docs.map(d => d.data()),
          matchLog:        logSnap.docs.map(d => d.data()),
          courtNotices:    noticeDoc.exists ? (noticeDoc.data().courtNotices  || []) : [],
          announcements:   noticeDoc.exists ? (noticeDoc.data().announcements || []) : [],
          feeData:         feeDoc.exists    ? (feeDoc.data().feeData          || {}) : {},
          monthlyFeeAmount: feeDoc.exists   ? (feeDoc.data().monthlyFeeAmount || 0)  : 0,
          financeData:     financeDoc.exists ? (financeDoc.data().financeData || []) : [],
          exchanges:       exchangeSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
      }

      const dateStr  = new Date().toISOString().slice(0, 10);
      const backupId = `master-backup-${dateStr}`;
      await MASTER_CONFIG_REF().collection('backups').doc(backupId).set({
        exportedAt: masterData.exportedAt,
        clubCount:  masterData.clubs.length,
        summary:    masterData.clubs.map(c => ({ clubId: c.clubId, clubName: c.clubName, playerCount: c.players.length })),
      });

      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(masterData, null, 2)], { type: 'application/json' }));
      a.download = `GrandSlam_MasterBackup_${dateStr}.json`;
      a.click();
      URL.revokeObjectURL(a.href);

      gsAlert(`✅ 마스터 백업 완료!\n\n클럽 수: ${masterData.clubs.length}개\n파일: GrandSlam_MasterBackup_${dateStr}.json\nFirestore 백업 ID: ${backupId}`);
    } catch (e) {
      console.error('[admin] masterBackup error:', e);
      gsAlert('❌ 마스터 백업 실패\n\n' + e.message);
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  });
}


// ----------------------------------------
// 4. 선별 복원
// ----------------------------------------

async function restoreMasterSelective(file) {
  if (!file) return;
  try {
    const masterData = JSON.parse(await file.text());
    if (!masterData.clubs || !Array.isArray(masterData.clubs)) {
      gsAlert('❌ 유효하지 않은 마스터 백업 파일입니다.\n(clubs 배열이 없습니다)'); return;
    }

    const clubListHtml = masterData.clubs.map((c, i) =>
      `<div style="margin-bottom:6px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" value="${i}" style="width:16px; height:16px; cursor:pointer;">
          <span><b>${c.clubName || c.clubId}</b> — 선수 ${c.players.length}명 / 경기 ${c.matchLog.length}건</span>
        </label>
      </div>`
    ).join('');

    const selModal = document.createElement('div');
    selModal.id = 'master-restore-modal';
    selModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:30000;display:flex;justify-content:center;align-items:center;';
    selModal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:28px 22px 20px;width:340px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:15px;font-weight:700;color:var(--text-dark);margin-bottom:6px;">🔍 복원할 클럽 선택</div>
        <div style="font-size:12px;color:#8E8E93;margin-bottom:14px;">백업 날짜: ${masterData.exportedAt ? masterData.exportedAt.slice(0,10) : '알 수 없음'}</div>
        <div id="master-restore-club-list" style="margin-bottom:16px;">${clubListHtml}</div>
        <div style="display:flex;gap:10px;">
          <button onclick="_confirmMasterSelectiveRestore(window._masterRestoreData)"
            style="flex:1;padding:13px;background:var(--roland-clay);color:white;border:none;border-radius:12px;font-size:14px;cursor:pointer;">선택 복원</button>
          <button onclick="document.getElementById('master-restore-modal').remove()"
            style="flex:1;padding:13px;background:#8E8E93;color:white;border:none;border-radius:12px;font-size:14px;cursor:pointer;">취소</button>
        </div>
      </div>`;

    window._masterRestoreData = masterData;
    document.body.appendChild(selModal);
  } catch (e) {
    gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
  }
}

async function _confirmMasterSelectiveRestore(masterData) {
  const checks = document.querySelectorAll('#master-restore-club-list input[type="checkbox"]:checked');
  if (!checks.length) { gsAlert('복원할 클럽을 1개 이상 선택해주세요.'); return; }

  const selectedClubs = Array.from(checks).map(c => masterData.clubs[parseInt(c.value)]);
  document.getElementById('master-restore-modal')?.remove();

  gsConfirm(
    `⚠️ 선별 복원 확인\n\n선택 클럽: ${selectedClubs.map(c => c.clubName || c.clubId).join(', ')}\n백업 날짜: ${masterData.exportedAt ? masterData.exportedAt.slice(0,10) : '알 수 없음'}\n\n각 클럽의 현재 데이터가 모두 교체됩니다.\n계속하시겠습니까?`,
    async ok => {
      if (!ok) return;
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.display = 'flex';
      try {
        for (const clubData of selectedClubs) {
          const clubId = clubData.clubId;
          await _fsSavePlayers(clubId, clubData.players);

          // matchLog 복원
          const logCol   = _clubRef(clubId).collection('matchLog');
          const oldSnap  = await logCol.get();
          const delBatch = _db.batch();
          oldSnap.docs.forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();
          if (clubData.matchLog.length > 0) await _fsAppendMatchLog(clubId, clubData.matchLog);

          await _clubRef(clubId).collection('settings').doc('notices').set({
            courtNotices: clubData.courtNotices || [], announcements: clubData.announcements || [],
          });
          await _clubRef(clubId).collection('settings').doc('feeData').set({
            feeData: clubData.feeData || {}, monthlyFeeAmount: clubData.monthlyFeeAmount || 0,
          });
          const manualFinance = (clubData.financeData || []).filter(f => !f.auto);
          await _clubRef(clubId).collection('settings').doc('financeData').set({ financeData: manualFinance });

          if (Array.isArray(clubData.exchanges) && clubData.exchanges.length > 0) {
            const exBatch = _db.batch();
            clubData.exchanges.forEach(ex => exBatch.set(_clubRef(clubId).collection('exchanges').doc(ex.id), ex));
            await exBatch.commit();
          }
        }
        gsAlert(`✅ 선별 복원 완료!\n\n복원 클럽: ${selectedClubs.length}개\n${selectedClubs.map(c => `• ${c.clubName || c.clubId}: 선수 ${c.players.length}명 / 경기 ${c.matchLog.length}건`).join('\n')}`);
        if (typeof sync === 'function') sync();
      } catch (e) {
        console.error('[admin] _confirmMasterSelectiveRestore error:', e);
        gsAlert('❌ 선별 복원 실패\n\n' + e.message);
      } finally {
        if (overlay) overlay.style.display = 'none';
        window._masterRestoreData = null;
      }
    }
  );
}


// ----------------------------------------
// 5. 클럽 ID 세이프티 가드
// ----------------------------------------

async function importBackupWithGuard(file) {
  if (!file) return;
  try {
    const data      = JSON.parse(await file.text());
    if (!data.players || !data.matchLog) { gsAlert('❌ 유효하지 않은 백업 파일입니다.'); return; }
    const currentId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
    const fileClubId = data.clubId || null;

    if (!fileClubId || !currentId || fileClubId === currentId) {
      importBackup(file, { skipPinCheck: true });
    } else {
      const currentName = currentClub?.clubName || currentId;
      gsConfirm(
        `⚠️ 클럽 ID 불일치 경고\n\n백업 파일 클럽: ${data.clubName || fileClubId}\n현재 접속 클럽: ${currentName}\n\n다른 클럽의 백업을 현재 클럽에 덮어씁니다.\n정말 계속하시겠습니까?`,
        ok => { if (ok) importBackup(file, { skipPinCheck: true }); }
      );
    }
  } catch (e) {
    gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
  }
}


// ----------------------------------------
// 6. 교류전 기록 초기화
// ----------------------------------------

async function resetExchangeData() {
  const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  if (!clubId) { gsAlert('활성 클럽이 없습니다.'); return; }

  gsConfirm(
    '⚠️ 교류전 기록 초기화\n\n현재 클럽의 모든 교류전 기록이 삭제됩니다.\n(exchanges 컬렉션 + 관련 matchLog 항목)\n\n선수 개인 통계(점수/승패)는 유지됩니다.\n계속하시겠습니까?',
    async ok => {
      if (!ok) return;
      try {
        const clubRef = _clubRef(clubId);

        // exchanges 전체 삭제
        const exSnap = await clubRef.collection('exchanges').get();
        for (let i = 0; i < exSnap.docs.length; i += 400) {
          const batch = _db.batch();
          exSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }

        // matchLog 중 exchangeId 있는 항목만 삭제
        const logSnap = await clubRef.collection('matchLog').get();
        const exLogs  = logSnap.docs.filter(d => d.data().exchangeId);
        for (let i = 0; i < exLogs.length; i += 400) {
          const batch = _db.batch();
          exLogs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
        matchLog = matchLog.filter(m => !m.exchangeId);
        if (typeof activeExchange !== 'undefined') activeExchange = null;

        gsAlert(`✅ 교류전 기록 초기화 완료!\n\n삭제된 교류전: ${exSnap.size}건\n삭제된 경기 기록: ${exLogs.length}건`);
      } catch (e) {
        console.error('[admin] resetExchangeData error:', e);
        gsAlert('❌ 초기화 실패\n\n' + e.message);
      }
    }
  );
}


// ----------------------------------------
// 7. 클럽 승인 관리
// ----------------------------------------

async function _loadClubApprovalList() {
  const el = document.getElementById('club-approval-list');
  if (!el) return;
  el.innerHTML = '<div style="color:#888; text-align:center; padding:10px;">불러오는 중...</div>';
  try {
    const snap = await _db.collection('clubs').get();
    _allClubsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _renderClubApprovalList();
  } catch (e) {
    el.innerHTML = '<p style="color:#FF3B30;">불러오기 실패</p>';
  }
}

function _renderClubApprovalList() {
  const el = document.getElementById('club-approval-list');
  if (!el) return;
  const searchVal = (document.getElementById('club-search-input')?.value || '').trim().toLowerCase();
  let list = _allClubsCache;
  if (_showUnapprovedOnly) list = list.filter(c => c.approved !== true);
  if (searchVal) list = list.filter(c => (c.clubName || c.name || c.id).toLowerCase().includes(searchVal));

  if (!list.length) { el.innerHTML = '<p style="color:#888; text-align:center; padding:10px;">해당 클럽 없음</p>'; return; }
  el.innerHTML = list.map(c => {
    const approved  = c.approved === true;
    const name      = c.clubName || c.name || c.id;
    return `<div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f0f0f0;">
      <div>
        <div style="font-weight:600; font-size:14px;">${name}</div>
        <div style="font-size:11px; color:#888;">총 경기: ${c.gameCount || 0}회 ${approved ? '· ✅ 승인됨' : '· ⏳ 미승인'}</div>
      </div>
      <button onclick="_toggleClubApproval('${c.id}', ${approved})"
        style="padding:7px 14px; border-radius:20px; border:none; cursor:pointer; font-size:12px; font-weight:600; background:${approved ? '#FF3B30' : '#34C759'}; color:white;">
        ${approved ? '승인 취소' : '승인'}
      </button>
    </div>`;
  }).join('');
}

function _filterClubApprovalList()  { _renderClubApprovalList(); }

function _toggleUnapprovedFilter() {
  _showUnapprovedOnly = !_showUnapprovedOnly;
  const btn = document.getElementById('btn-unapproved-only');
  if (btn) { btn.style.background = _showUnapprovedOnly ? '#FF9500' : 'white'; btn.style.color = _showUnapprovedOnly ? 'white' : '#FF9500'; }
  _renderClubApprovalList();
}

async function _toggleClubApproval(clubId, currentApproved) {
  const newVal = !currentApproved;
  gsConfirm(`이 클럽을 ${newVal ? '승인' : '승인 취소'}하시겠습니까?`, async ok => {
    if (!ok) return;
    try {
      await _db.collection('clubs').doc(clubId).update({ approved: newVal });
      gsAlert(`✅ ${newVal ? '승인' : '승인 취소'} 완료!`);
      _loadClubApprovalList();
    } catch (e) { gsAlert('처리 실패: ' + e.message); }
  });
}

async function approveAllExistingClubs() {
  gsConfirm('현재 등록된 모든 클럽을 일괄 승인하시겠습니까?', async ok => {
    if (!ok) return;
    try {
      const snap  = await _db.collection('clubs').get();
      const batch = _db.batch();
      snap.docs.forEach(d => { if (d.data().approved !== true) batch.update(d.ref, { approved: true }); });
      await batch.commit();
      gsAlert(`✅ ${snap.size}개 클럽 일괄 승인 완료!`);
      _loadClubApprovalList();
    } catch (e) { gsAlert('일괄 승인 실패: ' + e.message); }
  });
}


// ----------------------------------------
// 8. 문의 이메일
// ----------------------------------------

async function _loadContactEmail() {
  try {
    const doc   = await MASTER_CONFIG_REF().get();
    const email = doc.exists ? (doc.data().contactEmail || '') : '';
    const input = document.getElementById('contact-email-input');
    const curr  = document.getElementById('contact-email-current');
    if (input) input.value = email;
    if (curr)  curr.textContent = email ? `현재 설정: ${email}` : '설정된 이메일 없음';
  } catch (e) { console.warn('[admin] _loadContactEmail error:', e); }
}

async function _saveContactEmail() {
  const input = document.getElementById('contact-email-input');
  const email = (input ? input.value : '').trim();
  if (!email) { gsAlert('이메일 주소를 입력해주세요.'); return; }
  try {
    await MASTER_CONFIG_REF().set({ contactEmail: email }, { merge: true });
    const curr = document.getElementById('contact-email-current');
    if (curr) curr.textContent = `현재 설정: ${email}`;
    gsAlert('✅ 이메일 저장 완료!');
  } catch (e) { gsAlert('저장 실패: ' + e.message); }
}

async function getContactEmail() {
  try {
    const doc = await MASTER_CONFIG_REF().get();
    return doc.exists ? (doc.data().contactEmail || 'oropa@kakao.com') : 'oropa@kakao.com';
  } catch (e) { return 'oropa@kakao.com'; }
}


// ----------------------------------------
// window 전역 등록
// ----------------------------------------

window.showAdminAuth               = showAdminAuth;
window.closeAdminPinModal          = closeAdminPinModal;
window.confirmAdminPin             = confirmAdminPin;
window.masterBackup                = masterBackup;
window.restoreMasterSelective      = restoreMasterSelective;
window._confirmMasterSelectiveRestore = _confirmMasterSelectiveRestore;
window.importBackupWithGuard       = importBackupWithGuard;
window.resetExchangeData           = resetExchangeData;
window._loadClubApprovalList       = _loadClubApprovalList;
window._filterClubApprovalList     = _filterClubApprovalList;
window._toggleUnapprovedFilter     = _toggleUnapprovedFilter;
window._toggleClubApproval         = _toggleClubApproval;
window.approveAllExistingClubs     = approveAllExistingClubs;
window._saveContactEmail           = _saveContactEmail;
window.getContactEmail             = getContactEmail;
