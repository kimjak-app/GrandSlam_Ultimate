// ========================================
// ✅ v4.6: 관리자 권한 분리 시스템 (v4.5 이원화 보완)
// js/admin.js
//
// 기능:
//   1. showAdminAuth(mode)       — 모드별 PIN 모달 표시
//   2. confirmAdminPin()         — PIN 검증 후 탭 컨테이너 열기
//   3. closeAdminPinModal()      — PIN 모달 닫기
//   4. masterBackup()            — 총괄관리자 전용: 전 클럽 JSON 백업 + Firestore 서버 백업
//   5. restoreMasterSelective()  — 마스터 백업 파일에서 선택 클럽만 복원
//   6. importBackup (override)   — 클럽 ID 세이프티 가드 적용한 일반 복원
//
// 의존성:
//   - api.js: _db, _clubRef, _fsSavePlayers, _fsAppendMatchLog, normalizeMatchLog
//   - state.js: players, matchLog, currentClub, currentClubId
//   - ui.js: gsAlert, gsConfirm
// ========================================

// ========================================
// 전역 상태
// ========================================
let _adminMode = null;           // 'master' | 'manager'
let _adminPinCallback = null;    // PIN 인증 후 실행할 콜백

// Firestore 마스터 설정 컬렉션 경로
const MASTER_CONFIG_REF = () => _db.collection('master_config').doc('global');

// ========================================
// 1. 모드 선택 → PIN 모달 표시
// ========================================

function showAdminAuth(mode) {
    // mode: 'master' | 'manager'
    _adminMode = mode;
    const modal = document.getElementById('admin-pin-modal');
    const titleEl = document.getElementById('admin-pin-title');
    const inputEl = document.getElementById('admin-pin-input');

    if (!modal) { gsAlert('PIN 모달을 찾을 수 없습니다.'); return; }

    if (titleEl) {
        titleEl.textContent = mode === 'master'
            ? '총괄관리자 비밀번호를 입력하세요'
            : '클럽 관리자 비밀번호를 입력하세요';
    }
    if (inputEl) inputEl.value = '';

    modal.style.display = 'flex';
    setTimeout(() => { if (inputEl) inputEl.focus(); }, 100);
}

function closeAdminPinModal() {
    const modal = document.getElementById('admin-pin-modal');
    if (modal) modal.style.display = 'none';
    _adminMode = null;
    _adminPinCallback = null;
    const inputEl = document.getElementById('admin-pin-input');
    if (inputEl) inputEl.value = '';
}

// ========================================
// 2. PIN 검증
// ========================================

async function confirmAdminPin() {
    const inputEl = document.getElementById('admin-pin-input');
    const enteredPin = (inputEl ? inputEl.value : '').trim();

    if (!enteredPin) { gsAlert('비밀번호를 입력해주세요.'); return; }

    if (_adminMode === 'master') {
        await _verifyMasterPin(enteredPin);
    } else {
        await _verifyManagerPin(enteredPin);
    }
}

async function _verifyMasterPin(entered) {
    // ✅ v4.5: Firestore master_config/global.masterPin 조회 (보안 강화)
    try {
        const doc = await MASTER_CONFIG_REF().get();
        if (!doc.exists) {
            gsAlert('⚠️ 보안 설정 오류\n\nFirestore에 master_config/global 문서가 없습니다.\n관리자에게 신고해주세요.');
            return;
        }
        const masterPin = doc.data().masterPin;
        if (!masterPin) {
            gsAlert('⚠️ 보안 설정 오류\n\nmasterPin 필드가 설정되지 않았습니다.');
            return;
        }
        if (entered !== String(masterPin)) {
            gsAlert('❌ 총괄관리자 비밀번호가 틀렸습니다.');
            return;
        }
        _openAdminTab('master');
    } catch (e) {
        console.error('[admin] _verifyMasterPin error:', e);
        gsAlert('인증 실패: ' + e.message);
    }
}

async function _verifyManagerPin(entered) {
    const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
    if (!clubId) { gsAlert('클럽을 먼저 선택해주세요.'); return; }

    // ✅ v4.5: Firestore clubs/{clubId}.adminPin 재확인
    try {
        const clubDoc = await _db.collection('clubs').doc(clubId).get();
        let correct = null;
        if (clubDoc.exists) correct = clubDoc.data().adminPin || null;

        if (!correct) {
            gsAlert('클럽 비밀번호가 설정되지 않았습니다.\n클럽 수정에서 관리자 비밀번호를 먼저 설정해주세요.');
            return;
        }
        if (entered !== String(correct)) {
            gsAlert('❌ 클럽 관리자 비밀번호가 틀렸습니다.');
            return;
        }
        _openAdminTab('manager');
    } catch (e) {
        console.error('[admin] _verifyManagerPin error:', e);
        gsAlert('인증 실패: ' + e.message);
    }
}

function _openAdminTab(mode) {
    closeAdminPinModal();

    // 다른 탭 숨기기
    const allTabs = ['master', 'manager'];
    allTabs.forEach(t => {
        const el = document.getElementById(`tab-${t}-admin`);
        if (el) el.style.display = 'none';
    });

    // 선택 탭 열기
    const target = document.getElementById(`tab-${mode}-admin`);
    if (target) {
        target.style.display = 'block';
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 총괄 탭 진입 시 UI 렌더링
    if (mode === 'master') _renderMasterAdminTab();
    if (mode === 'manager') _renderManagerAdminTab();
}

// ========================================
// 3. 총괄관리자 탭 렌더링
// ========================================

function _renderMasterAdminTab() {
    const el = document.getElementById('tab-master-admin');
    if (!el) return;
    el.innerHTML = `
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">verified_user</span>
        총괄관리자 메뉴
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <button class="btn-purple-main" onclick="masterBackup()"
          style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="material-symbols-outlined">cloud_download</span> 전체 클럽 마스터 백업
        </button>
        <div style="position:relative;">
          <input type="file" id="masterRestoreFileInput" accept=".json" style="display:none;"
            onchange="restoreMasterSelective(this.files[0]); this.value=''">
          <button class="btn-purple-main" onclick="document.getElementById('masterRestoreFileInput').click()"
            style="display:flex; align-items:center; justify-content:center; gap:8px; background:var(--roland-clay); width:100%;">
            <span class="material-symbols-outlined">folder_open</span> 선별 복원 (마스터 백업 파일)
          </button>
        </div>
      </div>
    </div>`;
}

// ========================================
// 4. 클럽관리자 탭 렌더링
// ========================================

function _renderManagerAdminTab() {
    const el = document.getElementById('tab-manager-admin');
    if (!el) return;
    const clubName = (currentClub && currentClub.clubName) ? currentClub.clubName : '현재 클럽';
    el.innerHTML = `
    <div class="section-card active" style="display:block; margin-top:14px;">
      <div class="sub-rank-title" style="margin-bottom:14px;">
        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:20px; margin-right:5px;">manage_accounts</span>
        클럽관리자 메뉴 — ${clubName}
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <button class="btn-purple-main" onclick="exportBackup()"
          style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <span class="material-symbols-outlined">save</span> 📥 이 클럽 백업 다운로드
        </button>
        <div style="position:relative;">
          <input type="file" id="managerRestoreFileInput" accept=".json" style="display:none;"
            onchange="importBackupWithGuard(this.files[0]); this.value=''">
          <button class="btn-purple-main" onclick="document.getElementById('managerRestoreFileInput').click()"
            style="display:flex; align-items:center; justify-content:center; gap:8px; background:var(--roland-clay); width:100%;">
            <span class="material-symbols-outlined">folder_open</span> 백업 파일 선택해서 복원
          </button>
        </div>
      </div>
    </div>`;
}

// ========================================
// 5. 총괄관리자 전용: 마스터 백업
// ========================================

async function masterBackup() {
    gsConfirm('모든 클럽의 데이터를 하나의 JSON 파일로 백업하고\nFirestore 서버에도 동시 저장합니다.\n계속하시겠습니까?', async (ok) => {
        if (!ok) return;
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';

        try {
            // 전체 클럽 목록 조회
            const clubsSnap = await _db.collection('clubs').get();
            if (clubsSnap.empty) { gsAlert('등록된 클럽이 없습니다.'); return; }

            const masterData = {
                version: 'v4.5-master',
                exportedAt: new Date().toISOString(),
                clubs: [],
            };

            // 각 클럽별 데이터 수집
            for (const clubDoc of clubsSnap.docs) {
                const clubId = clubDoc.id;
                const clubMeta = clubDoc.data();

                const [playerSnap, logSnap, noticeDoc, feeDoc] = await Promise.all([
                    _clubRef(clubId).collection('players').get(),
                    _clubRef(clubId).collection('matchLog').orderBy('ts', 'desc').limit(500).get(),
                    _clubRef(clubId).collection('settings').doc('notices').get(),
                    _clubRef(clubId).collection('settings').doc('feeData').get(),
                ]);

                masterData.clubs.push({
                    clubId,
                    clubName: clubMeta.clubName || clubMeta.name || clubId,
                    players: playerSnap.docs.map(d => d.data()),
                    matchLog: logSnap.docs.map(d => d.data()),
                    courtNotices: noticeDoc.exists ? (noticeDoc.data().courtNotices || []) : [],
                    announcements: noticeDoc.exists ? (noticeDoc.data().announcements || []) : [],
                    feeData: feeDoc.exists ? (feeDoc.data().feeData || {}) : {},
                    monthlyFeeAmount: feeDoc.exists ? (feeDoc.data().monthlyFeeAmount || 0) : 0,
                });
            }

            // Firestore 서버에도 백업 문서 저장
            const dateStr = new Date().toISOString().slice(0, 10);
            const backupId = `master-backup-${dateStr}`;
            await MASTER_CONFIG_REF().collection('backups').doc(backupId).set({
                exportedAt: masterData.exportedAt,
                clubCount: masterData.clubs.length,
                summary: masterData.clubs.map(c => ({ clubId: c.clubId, clubName: c.clubName, playerCount: c.players.length })),
            });

            // JSON 다운로드
            const json = JSON.stringify(masterData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `GrandSlam_MasterBackup_${dateStr}.json`;
            a.click();
            URL.revokeObjectURL(url);

            gsAlert(`✅ 마스터 백업 완료!\n\n클럽 수: ${masterData.clubs.length}개\n파일: GrandSlam_MasterBackup_${dateStr}.json\nFirestore 서버 백업 ID: ${backupId}`);
        } catch (e) {
            console.error('[admin] masterBackup error:', e);
            gsAlert('❌ 마스터 백업 실패\n\n' + e.message);
        } finally {
            if (overlay) overlay.style.display = 'none';
        }
    });
}

// ========================================
// 6. 선별적 복원 (마스터 백업 파일)
// ========================================

async function restoreMasterSelective(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const masterData = JSON.parse(text);

        if (!masterData.clubs || !Array.isArray(masterData.clubs)) {
            gsAlert('❌ 유효하지 않은 마스터 백업 파일입니다.\n(clubs 배열이 없습니다)');
            return;
        }

        // 클럽 선택 목록 생성
        const clubList = masterData.clubs;
        const clubListHtml = clubList.map((c, i) =>
            `<div style="margin-bottom:6px;">
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
          <input type="checkbox" value="${i}" style="width:16px; height:16px; cursor:pointer;">
          <span><b>${c.clubName || c.clubId}</b> — 선수 ${c.players.length}명 / 경기 ${c.matchLog.length}건</span>
        </label>
      </div>`
        ).join('');

        // gsConfirm 대신 커스텀 인라인 모달 생성
        const selModal = document.createElement('div');
        selModal.id = 'master-restore-modal';
        selModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:30000;display:flex;justify-content:center;align-items:center;';
        selModal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:28px 22px 20px;width:340px;max-width:92vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
        <div style="font-size:15px;font-weight:700;color:var(--text-dark);margin-bottom:6px;">🔍 복원할 클럽 선택</div>
        <div style="font-size:12px;color:#8E8E93;margin-bottom:14px;">백업 날짜: ${masterData.exportedAt ? masterData.exportedAt.slice(0, 10) : '알 수 없음'}</div>
        <div id="master-restore-club-list" style="margin-bottom:16px;">${clubListHtml}</div>
        <div style="display:flex;gap:10px;">
          <button onclick="_confirmMasterSelectiveRestore(window._masterRestoreData.exportedAt, window._masterRestoreData)"
            style="flex:1;padding:13px;background:var(--roland-clay);color:white;border:none;border-radius:12px;font-size:14px;font-weight:400;cursor:pointer;">선택 복원</button>
          <button onclick="document.getElementById('master-restore-modal').remove()"
            style="flex:1;padding:13px;background:#8E8E93;color:white;border:none;border-radius:12px;font-size:14px;font-weight:400;cursor:pointer;">취소</button>
        </div>
      </div>`;

        // 데이터를 window에 임시 저장 (인라인 onclick 접근용)
        window._masterRestoreData = masterData;
        document.body.appendChild(selModal);

    } catch (e) {
        gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
    }
}

async function _confirmMasterSelectiveRestore(exportedAt, masterData) {
    const checks = document.querySelectorAll('#master-restore-club-list input[type="checkbox"]:checked');
    if (checks.length === 0) { gsAlert('복원할 클럽을 1개 이상 선택해주세요.'); return; }

    const selectedIndices = Array.from(checks).map(c => parseInt(c.value));
    const selectedClubs = selectedIndices.map(i => masterData.clubs[i]);

    const modal = document.getElementById('master-restore-modal');
    if (modal) modal.remove();

    gsConfirm(
        `⚠️ 선별 복원 확인\n\n선택 클럽: ${selectedClubs.map(c => c.clubName || c.clubId).join(', ')}\n백업 날짜: ${exportedAt ? exportedAt.slice(0, 10) : '알 수 없음'}\n\n각 클럽의 현재 데이터가 모두 교체됩니다.\n계속하시겠습니까?`,
        async (ok) => {
            if (!ok) return;
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.style.display = 'flex';
            try {
                for (const clubData of selectedClubs) {
                    const clubId = clubData.clubId;

                    // 선수 복원
                    await _fsSavePlayers(clubId, clubData.players);

                    // matchLog 복원 (기존 삭제 후 재저장)
                    const logCol = _clubRef(clubId).collection('matchLog');
                    const oldSnap = await logCol.get();
                    const delBatch = _db.batch();
                    oldSnap.docs.forEach(d => delBatch.delete(d.ref));
                    await delBatch.commit();
                    if (clubData.matchLog.length > 0) {
                        await _fsAppendMatchLog(clubId, clubData.matchLog);
                    }

                    // notices 복원
                    await _clubRef(clubId).collection('settings').doc('notices').set({
                        courtNotices: clubData.courtNotices || [],
                        announcements: clubData.announcements || [],
                    });

                    // feeData 복원
                    await _clubRef(clubId).collection('settings').doc('feeData').set({
                        feeData: clubData.feeData || {},
                        monthlyFeeAmount: clubData.monthlyFeeAmount || 0,
                    });
                }

                gsAlert(`✅ 선별 복원 완료!\n\n복원 클럽: ${selectedClubs.length}개\n${selectedClubs.map(c => `• ${c.clubName || c.clubId}: 선수 ${c.players.length}명 / 경기 ${c.matchLog.length}건`).join('\n')}`);

                // 현재 접속 클럽 데이터를 즉시 갱신
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


// ========================================
// 7. ✅ v4.6: 클럽 ID 세이프티 가드 + clubId 누락 시 현재 클럽 강제 연결
// ========================================

async function importBackupWithGuard(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.players || !data.matchLog) {
            gsAlert('❌ 유효하지 않은 백업 파일입니다.');
            return;
        }

        const currentId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
        const fileClubId = data.clubId || null;

        // ✅ v4.6: clubId 누락 → 현재 클럽으로 강제 연결 (경고 없이 바로 진행)
        if (!fileClubId || !currentId || fileClubId === currentId) {
            importBackup(file, { skipPinCheck: true });
        } else {
            const currentName = (currentClub && currentClub.clubName) ? currentClub.clubName : currentId;
            gsConfirm(
                `⚠️ 클럽 ID 불일치 경고\n\n백업 파일 클럽: ${data.clubName || fileClubId}\n현재 접속 클럽: ${currentName}\n\n다른 클럽의 백업을 현재 클럽에 덮어씁니다.\n정말 계속하시겠습니까?`,
                (ok) => { if (ok) importBackup(file, { skipPinCheck: true }); }
            );
        }
    } catch (e) {
        gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
    }
}
