// ========================================
// API.JS - Firestore 데이터 레이어
//
// Firestore 컬렉션 구조:
//   clubs/{clubId}/players           (선수 1명 = 문서 1개)
//   clubs/{clubId}/matchLog          (경기 1건 = 문서 1개)
//   clubs/{clubId}/settings/notices  (courtNotices, announcements)
//   clubs/{clubId}/settings/feeData  (feeData, monthlyFeeAmount)
//   clubs/{clubId}/settings/financeData
//   clubs/{clubId}/exchanges/{id}
// ========================================


// ----------------------------------------
// 1. 유틸리티
// ----------------------------------------

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function normalizeMatchLog(arr) {
  if (!Array.isArray(arr)) return [];

  const norm = arr.filter(Boolean).map(x => {
    const home = Array.isArray(x.home) ? x.home
      : (typeof x.home === 'string' ? x.home.split(',').map(s => s.trim()).filter(Boolean) : []);
    const away = Array.isArray(x.away) ? x.away
      : (typeof x.away === 'string' ? x.away.split(',').map(s => s.trim()).filter(Boolean) : []);
    const type   = x.type || x.mType || 'double';
    const hs     = Number(x.hs ?? x.homeScore ?? x.hS ?? 0);
    const as     = Number(x.as ?? x.awayScore ?? x.aS ?? 0);
    const winner = x.winner || '';
    const ts     = Number(x.ts || x.timestamp || x.time || Date.now());

    let id = x.id || x._id || x.matchId || x.mid || '';
    if (!id) {
      id = `${ts}-${type}-${home.join('|')}__${away.join('|')}-${hs}-${as}-${winner}`;
    }

    const entry = { id, ts, date: x.date || x.ds || '', type, home, away, hs, as, winner, memo: x.memo || '' };

    // 교류전 필드 — 있을 때만 포함
    if (x.exchangeId)    entry.exchangeId    = x.exchangeId;
    if (x.matchCategory) entry.matchCategory = x.matchCategory;
    if (x.resultType)    entry.resultType    = x.resultType;
    if (x.clubSideHome)  entry.clubSideHome  = x.clubSideHome;
    if (x.clubAId)       entry.clubAId       = x.clubAId;
    if (x.clubBId)       entry.clubBId       = x.clubBId;
    if (x.clubBName)     entry.clubBName     = x.clubBName;
    if (x.pointsHome)    entry.pointsHome    = x.pointsHome;
    if (x.pointsAway)    entry.pointsAway    = x.pointsAway;
    return entry;
  });

  // id 기준 중복 제거 (최신 ts 유지)
  const byId = new Map();
  norm.forEach(m => {
    const prev = byId.get(m.id);
    if (!prev || Number(m.ts) >= Number(prev.ts)) byId.set(m.id, m);
  });
  return Array.from(byId.values()).sort((a, b) => Number(b.ts) - Number(a.ts));
}

// Firestore doc id 금지 문자 치환
function _sanitizeDocId(id) {
  return String(id)
    .replace(/\//g,  '_')
    .replace(/\.\./g, '_')
    .replace(/^\./, '_')
    .replace(/\s+/g, '_');
}


// ----------------------------------------
// 2. Firestore 헬퍼
// ----------------------------------------

let _matchLogLastDoc   = null;
let _matchLogExhausted = false;
const _matchLogPageSize = 500;

function _clubRef(clubId) {
  return _db.collection('clubs').doc(clubId || 'default');
}

async function _fsGetPlayers(clubId) {
  const snap = await _clubRef(clubId).collection('players').get();
  return snap.docs.map(d => d.data());
}

async function _fsGetMatchLog(clubId) {
  _matchLogLastDoc   = null;
  _matchLogExhausted = false;
  const snap = await _clubRef(clubId).collection('matchLog')
    .orderBy('ts', 'desc').limit(_matchLogPageSize).get();
  if (snap.empty) { _matchLogExhausted = true; return []; }
  _matchLogLastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < _matchLogPageSize) _matchLogExhausted = true;
  return snap.docs.map(d => d.data());
}

async function _fsGetMatchLogMore(clubId) {
  if (_matchLogExhausted || !_matchLogLastDoc) return [];
  const snap = await _clubRef(clubId).collection('matchLog')
    .orderBy('ts', 'desc').startAfter(_matchLogLastDoc).limit(_matchLogPageSize).get();
  if (snap.empty) { _matchLogExhausted = true; return []; }
  _matchLogLastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < _matchLogPageSize) _matchLogExhausted = true;
  return snap.docs.map(d => d.data());
}

async function _fsSavePlayers(clubId, playerArr) {
  const col   = _clubRef(clubId).collection('players');
  const batch = _db.batch();
  playerArr.forEach(p => {
    const data = Object.assign({ sport: 'tennis', level: 'A', attributes: {} }, p);
    batch.set(col.doc(_sanitizeDocId(data.name)), data);
  });
  // 삭제된 선수 제거
  const snap  = await col.get();
  const names = new Set(playerArr.map(p => _sanitizeDocId(p.name)));
  snap.docs.forEach(d => { if (!names.has(d.id)) batch.delete(d.ref); });
  await batch.commit();
}

async function _fsAppendMatchLog(clubId, entries) {
  const col   = _clubRef(clubId).collection('matchLog');
  const batch = _db.batch();
  entries.forEach(m => {
    batch.set(col.doc(_sanitizeDocId(m.id)), Object.assign({ sport: 'tennis' }, m));
  });
  await batch.commit();
}


// ----------------------------------------
// 3. Sync (Firestore → 메모리)
// ----------------------------------------

let _syncRunning      = false;
let _pendingSyncClubId = null;

async function sync() {
  const requestedClubId = getActiveClubId() || 'default';
  if (_syncRunning) { _pendingSyncClubId = requestedClubId; return; }
  _syncRunning       = true;
  _pendingSyncClubId = null;
  await _doSync(requestedClubId);
  _syncRunning = false;
  if (_pendingSyncClubId && _pendingSyncClubId !== requestedClubId) {
    _pendingSyncClubId = null;
    await sync();
  }
}

async function _doSync(clubId) {
  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">데이터 불러오는 중...</div>`);
  try {
    // 1단계: players 로드
    const rawPlayers = await _fsGetPlayers(clubId);
    if ((getActiveClubId() || 'default') !== clubId) {
      $('loading-overlay').style.display = 'none'; setStatus(''); return;
    }
    players  = (rawPlayers || []).map(ensure);
    matchLog = []; // 클럽 전환 시 이전 matchLog 즉시 초기화
    try { AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'players', players } })); } catch (e) {}

    $('loading-overlay').style.display = 'none';
    setStatus(`<div style="color:#888; font-size:12px;">최근 경기 불러오는 중...</div>`);

    // 2단계: matchLog 로드
    const rawLog = await _fsGetMatchLog(clubId);
    if ((getActiveClubId() || 'default') !== clubId) { setStatus(''); return; }

    matchLog = normalizeMatchLog(rawLog);
    updateSeason();
    updateWeekly();
    if (tabNow === 1) updateChartRange(0);
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();
    setStatus('');

    fetchFeeData().catch(e => console.warn('sync fetchFeeData error:', e));
    fetchMvpHistory().catch(e => console.warn('sync fetchMvpHistory error:', e));
    setTimeout(applyAutofitAllTables, 0);

    await _syncRestoreLoggedPlayer(clubId);
    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players, matchLog } }));

  } catch (e) {
    console.error(e);
    setStatus(`<div style="color:#d33; font-weight:bold;">❌ 데이터 로딩 실패: ${e.message}</div>`);
    $('loading-overlay').style.display = 'none';
  }
}


// ----------------------------------------
// 4. matchLog 더보기
// ----------------------------------------

async function loadMoreMatchLog() {
  try {
    const clubId = getActiveClubId() || 'default';
    setStatus(`<div style="color:#888; font-size:12px;">이전 기록 불러오는 중...</div>`);

    const more = await _fsGetMatchLogMore(clubId);
    const btn  = document.getElementById('btn-load-more-log');

    if (!more || more.length === 0) {
      setStatus('');
      if (btn) { btn.textContent = '더 불러올 기록 없음'; btn.disabled = true; btn.style.opacity = 0.55; }
      return;
    }

    matchLog = normalizeMatchLog(matchLog.concat(more));
    if (typeof updateSeason === 'function')          updateSeason();
    if (typeof updateWeekly === 'function')          updateWeekly();
    if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList();
    if (typeof renderHome === 'function')            renderHome();
    setStatus('');
    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players } }));

    if (_matchLogExhausted && btn) {
      btn.textContent = '더 불러올 기록 없음'; btn.disabled = true; btn.style.opacity = 0.55;
    }
  } catch (e) {
    console.error(e);
    setStatus(`<div style="color:#d33; font-weight:bold;">❌ 더보기 실패: ${e.message}</div>`);
  }
}


// ----------------------------------------
// 5. Push (메모리 → Firestore)
// ----------------------------------------

async function pushPayload(payload) {
  if (typeof requireAuth === 'function' && (!currentUserAuth || !currentLoggedPlayer)) {
    requireAuth();
    return false;
  }

  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">저장 중...</div>`);
  try {
    const clubId = payload.clubId || (typeof getActiveClubId === 'function' ? getActiveClubId() : 'default');

    if (Array.isArray(payload.data)) {
      await _fsSavePlayers(clubId, payload.data);
      players = payload.data.map(ensure);
    }

    // matchLog 전체 초기화
    if (payload.matchLogReset === true) {
      const logCol = _clubRef(clubId).collection('matchLog');
      const snap   = await logCol.get();
      if (!snap.empty) {
        for (let i = 0; i < snap.docs.length; i += 400) {
          const delBatch = _db.batch();
          snap.docs.slice(i, i + 400).forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();
        }
      }
      matchLog = [];
    }

    // matchLog 추가
    if (Array.isArray(payload.matchLogAppend) && payload.matchLogAppend.length > 0) {
      // 미승인 클럽 gameCount 체크
      const clubDoc  = await _db.collection('clubs').doc(clubId).get();
      const clubInfo = clubDoc.exists ? clubDoc.data() : {};
      if (clubInfo.approved !== true) {
        if ((clubInfo.gameCount || 0) >= 20) {
          const email = await getContactEmail();
          setStatus('');
          $('loading-overlay').style.display = 'none';
          gsAlert(`🔒 무료 체험 경기(20회)를 모두 사용했습니다.\n\n계속 사용하려면 총괄 관리자에게 문의하세요.\n📧 ${email}`);
          return false;
        }
        await _db.collection('clubs').doc(clubId).update({
          gameCount: firebase.firestore.FieldValue.increment(payload.matchLogAppend.length)
        });
      }
      const normalized = normalizeMatchLog(payload.matchLogAppend);
      await _fsAppendMatchLog(clubId, normalized);
      // 로컬 반영 (dedupe)
      const byId = new Map(matchLog.map(m => [m.id, m]));
      normalized.forEach(m => byId.set(m.id, m));
      matchLog = Array.from(byId.values()).sort((a, b) => Number(b.ts) - Number(a.ts));
    }

    await pushMvpHistory();
    setStatus('');
    setTimeout(applyAutofitAllTables, 0);
    return true;
  } catch (e) {
    console.error('pushPayload error:', e);
    setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">저장 실패 😵‍💫</div>`);
    return false;
  } finally {
    $('loading-overlay').style.display = 'none';
  }
}

async function pushDataOnly() {
  return await pushPayload({ action: 'saveDataOnly', data: players });
}

async function pushWithMatchLogAppend(logEntries) {
  const arr = Array.isArray(logEntries) ? logEntries : [logEntries];
  return await pushPayload({ action: 'save', data: players, matchLogAppend: arr });
}


// ----------------------------------------
// 6. 코트공지 / 공지사항
// ----------------------------------------

function getLocalCourtKey()        { return 'grandslam_court_notices_' + getActiveClubId(); }
function getLocalAnnouncementKey() { return 'grandslam_announcements_' + getActiveClubId(); }
function getLocalMvpHistoryKey()   { return 'grandslam_mvp_history_' + getActiveClubId(); }

function persistMvpHistoryLocal() {
  try { localStorage.setItem(getLocalMvpHistoryKey(), JSON.stringify(mvpHistory || { monthly: {}, weekly: {} })); } catch (e) {}
}

async function fetchMvpHistory() {
  if (!currentClub) return;
  const cid = getActiveClubId();
  try {
    const doc = await _clubRef(cid).collection('settings').doc('mvpHistory').get();
    if (doc.exists) {
      const data = doc.data() || {};
      mvpHistory = {
        monthly: (data.monthly && typeof data.monthly === 'object') ? data.monthly : {},
        weekly: (data.weekly && typeof data.weekly === 'object') ? data.weekly : {},
      };
      persistMvpHistoryLocal();
      try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) {}
      return;
    }
  } catch (e) { console.warn('fetchMvpHistory error:', e); }
  try {
    mvpHistory = JSON.parse(localStorage.getItem(getLocalMvpHistoryKey())) || { monthly: {}, weekly: {} };
  } catch (e) { mvpHistory = { monthly: {}, weekly: {} }; }
  try { if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList(); } catch (e) {}
}

async function pushMvpHistory() {
  const cid = getActiveClubId();
  if (!currentClub || !cid) return false;
  try {
    await _clubRef(cid).collection('settings').doc('mvpHistory').set({
      monthly: (mvpHistory && mvpHistory.monthly) ? mvpHistory.monthly : {},
      weekly: (mvpHistory && mvpHistory.weekly) ? mvpHistory.weekly : {},
    });
    persistMvpHistoryLocal();
    return true;
  } catch (e) {
    console.warn('pushMvpHistory error:', e);
    return false;
  }
}

function persistCourtNoticesLocal() {
  try { localStorage.setItem(getLocalCourtKey(), JSON.stringify(courtNotices)); } catch (e) {}
}
function persistAnnouncementsLocal() {
  try { localStorage.setItem(getLocalAnnouncementKey(), JSON.stringify(announcements)); } catch (e) {}
}

async function _fetchNoticesDoc(clubId) {
  try {
    const doc = await _clubRef(clubId).collection('settings').doc('notices').get();
    return doc.exists ? doc.data() : null;
  } catch (e) { return null; }
}

async function fetchCourtNotices() {
  if (!currentClub) return;
  const data = await _fetchNoticesDoc(getActiveClubId());
  if (data?.courtNotices) {
    courtNotices = data.courtNotices;
    persistCourtNoticesLocal();
  } else {
    try { courtNotices = JSON.parse(localStorage.getItem(getLocalCourtKey())) || []; } catch (e) { courtNotices = []; }
  }
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'court', courtNotices } }));
}

async function fetchAnnouncements() {
  if (!currentClub) return;
  const data = await _fetchNoticesDoc(getActiveClubId());
  if (data?.announcements) {
    announcements = data.announcements;
    persistAnnouncementsLocal();
  } else {
    try { announcements = JSON.parse(localStorage.getItem(getLocalAnnouncementKey())) || []; } catch (e) { announcements = []; }
  }
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'announcements', announcements } }));
}

// 단건 저장 (하위호환용)
async function saveCourtNotice()    { persistCourtNoticesLocal();    return await pushCourtNotices(); }
async function saveAnnouncement()   { persistAnnouncementsLocal();   return await pushAnnouncements(); }

async function pushAnnouncements() {
  persistAnnouncementsLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set({ announcements }, { merge: true });
    return true;
  } catch (e) { console.warn('pushAnnouncements error:', e); return false; }
}

async function pushCourtNotices() {
  persistCourtNoticesLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set({ courtNotices }, { merge: true });
    return true;
  } catch (e) { console.warn('pushCourtNotices error:', e); return false; }
}


// ----------------------------------------
// 7. 회비 데이터
// ----------------------------------------

async function fetchFeeData() {
  if (!currentClub) return;
  const cid = getActiveClubId();
  try {
    const doc = await _clubRef(cid).collection('settings').doc('feeData').get();
    if (doc.exists) {
      const data = doc.data();
      feeData = data.feeData || {};
      monthlyFeeAmount = data.monthlyFeeAmount || 0;
      localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
      localStorage.setItem('grandslam_monthly_fee_' + cid, monthlyFeeAmount);
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'fee', feeData, monthlyFeeAmount } }));
      return;
    }
  } catch (e) { console.warn('fetchFeeData Firestore error, using local:', e); }
  try { feeData = JSON.parse(localStorage.getItem('grandslam_fee_data_' + cid)) || {}; } catch (e) { feeData = {}; }
  const savedFee = localStorage.getItem('grandslam_monthly_fee_' + cid);
  if (savedFee) monthlyFeeAmount = parseInt(savedFee) || 0;
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'fee', feeData, monthlyFeeAmount } }));
}

async function pushFeeData() {
  const cid = getActiveClubId();
  if (cid) {
    localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
    localStorage.setItem('grandslam_monthly_fee_' + cid, monthlyFeeAmount);
  }
  if (!currentClub) return false;
  try {
    await _clubRef(cid).collection('settings').doc('feeData').set({ feeData, monthlyFeeAmount });
    return true;
  } catch (e) { console.warn('pushFeeData error:', e); return false; }
}


// ----------------------------------------
// 8. 재정 데이터
// ----------------------------------------

async function fetchFinanceData() {
  if (!currentClub) return;
  const cid = getActiveClubId();
  try {
    const doc = await _clubRef(cid).collection('settings').doc('financeData').get();
    if (doc.exists) {
      financeData = (doc.data().financeData || []).filter(f => !f.auto);
      return;
    }
  } catch (e) { console.warn('fetchFinanceData Firestore error:', e); }
  try {
    const saved = localStorage.getItem('grandslam_finance_data_' + cid);
    financeData = saved ? JSON.parse(saved).filter(f => !f.auto) : [];
  } catch (e) { financeData = []; }
}

async function pushFinanceData() {
  const cid    = getActiveClubId();
  const manual = financeData.filter(f => !f.auto);
  if (cid) {
    try { localStorage.setItem('grandslam_finance_data_' + cid, JSON.stringify(manual)); } catch (e) {}
  }
  if (!currentClub) return false;
  try {
    await _clubRef(cid).collection('settings').doc('financeData').set({ financeData: manual });
    return true;
  } catch (e) { console.warn('pushFinanceData error:', e); return false; }
}

async function clearFinanceData() {
  const cid = getActiveClubId();
  financeData = [];
  if (cid) { try { localStorage.removeItem('grandslam_finance_data_' + cid); } catch (e) {} }
  if (!currentClub) return;
  try {
    await _clubRef(cid).collection('settings').doc('financeData').delete();
  } catch (e) { console.warn('clearFinanceData error:', e); }
}


// ----------------------------------------
// 9. 백업 / 복원
// ----------------------------------------

async function exportBackup() {
  const btn = document.getElementById('backupExportBtn');
  if (btn) { btn.disabled = true; btn.textContent = '백업 중...'; }
  try {
    const clubId   = getActiveClubId() || 'default';
    const clubName = currentClub?.name || clubId;

    const [playerSnap, logSnap, noticeDoc, feeDoc, financeDoc, exchangeSnap, mvpDoc] = await Promise.all([
      _clubRef(clubId).collection('players').get(),
      _clubRef(clubId).collection('matchLog').orderBy('ts', 'desc').limit(500).get(),
      _clubRef(clubId).collection('settings').doc('notices').get(),
      _clubRef(clubId).collection('settings').doc('feeData').get(),
      _clubRef(clubId).collection('settings').doc('financeData').get(),
      _clubRef(clubId).collection('exchanges').get(),
      _clubRef(clubId).collection('settings').doc('mvpHistory').get(),
    ]);

    const backupData = {
      version: 'v4.47', exportedAt: new Date().toISOString(), clubId, clubName,
      players:          playerSnap.docs.map(d => d.data()),
      matchLog:         logSnap.docs.map(d => d.data()),
      courtNotices:     noticeDoc.exists ? (noticeDoc.data().courtNotices   || []) : [],
      announcements:    noticeDoc.exists ? (noticeDoc.data().announcements  || []) : [],
      feeData:          feeDoc.exists    ? (feeDoc.data().feeData           || {}) : {},
      monthlyFeeAmount: feeDoc.exists    ? (feeDoc.data().monthlyFeeAmount  || 0)  : 0,
      financeData:      financeDoc.exists ? (financeDoc.data().financeData  || []) : [],
      exchanges:        exchangeSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      mvpHistory:       mvpDoc.exists ? (mvpDoc.data() || { monthly: {}, weekly: {} }) : { monthly: {}, weekly: {} },
    };

    const blob    = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const dateStr = new Date().toISOString().slice(0, 10);
    const a       = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GrandSlam_${clubName}_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    gsAlert(`✅ 백업 완료!\n\n파일: GrandSlam_${clubName}_${dateStr}.json\n선수 ${backupData.players.length}명 / 경기 ${backupData.matchLog.length}건 포함`);
  } catch (e) {
    console.error('exportBackup error:', e);
    gsAlert('❌ 백업 실패\n\n' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 백업 다운로드'; }
  }
}

async function importBackup(file, { skipPinCheck = false } = {}) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.players || !data.matchLog) { gsAlert('❌ 유효하지 않은 백업 파일입니다.'); return; }

    const exportedAt = data.exportedAt ? data.exportedAt.slice(0, 10) : '알 수 없음';
    gsConfirm(
      `⚠️ 복원 확인\n\n백업 날짜: ${exportedAt}\n클럽: ${data.clubName || data.clubId || '현재 클럽'}\n선수: ${data.players.length}명 / 경기: ${data.matchLog.length}건\n\n현재 데이터가 모두 교체됩니다.\n계속하시겠습니까?`,
      async ok => {
        if (!ok) return;
        if (skipPinCheck) {
          await _doRestore(data);
        } else {
          checkClubPin(async passed => { if (passed) await _doRestore(data); });
        }
      }
    );
  } catch (e) {
    gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
  }
}

async function _doRestore(data) {
  const overlay = $('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  try {
    const clubId = getActiveClubId() || 'default';

    // 선수 복원
    await _fsSavePlayers(clubId, data.players);
    players = data.players.map(ensure);

    // matchLog 복원 (기존 삭제 후 재저장)
    const logCol  = _clubRef(clubId).collection('matchLog');
    const oldSnap = await logCol.get();
    const delBatch = _db.batch();
    oldSnap.docs.forEach(d => delBatch.delete(d.ref));
    await delBatch.commit();
    if (data.matchLog.length > 0) await _fsAppendMatchLog(clubId, data.matchLog);
    matchLog = normalizeMatchLog(data.matchLog);

    // notices 복원
    await _clubRef(clubId).collection('settings').doc('notices').set({
      courtNotices: data.courtNotices || [], announcements: data.announcements || [],
    });
    courtNotices  = data.courtNotices  || [];
    announcements = data.announcements || [];

    // feeData 복원
    await _clubRef(clubId).collection('settings').doc('feeData').set({
      feeData: data.feeData || {}, monthlyFeeAmount: data.monthlyFeeAmount || 0,
    });
    feeData          = data.feeData          || {};
    monthlyFeeAmount = data.monthlyFeeAmount || 0;

    // financeData 복원 (수동 항목만)
    const manualFinance = (data.financeData || []).filter(f => !f.auto);
    await _clubRef(clubId).collection('settings').doc('financeData').set({ financeData: manualFinance });
    financeData = manualFinance;

    // mvpHistory 복원
    await _clubRef(clubId).collection('settings').doc('mvpHistory').set({
      monthly: data.mvpHistory?.monthly || {},
      weekly: data.mvpHistory?.weekly || {},
    });
    mvpHistory = {
      monthly: data.mvpHistory?.monthly || {},
      weekly: data.mvpHistory?.weekly || {},
    };

    // exchanges 복원
    if (Array.isArray(data.exchanges) && data.exchanges.length > 0) {
      const exBatch = _db.batch();
      data.exchanges.forEach(ex => exBatch.set(_clubRef(clubId).collection('exchanges').doc(ex.id), ex));
      await exBatch.commit();
    }

    // UI 갱신
    updateSeason(); updateWeekly();
    renderLadderPlayerPool(); initTournament(); renderStatsPlayerList();
    loadCourtInfo(); loadNotices();

    gsAlert(`✅ 복원 완료!\n선수 ${data.players.length}명 / 경기 ${data.matchLog.length}건 복원되었습니다.`);
  } catch (e) {
    console.error('importBackup error:', e);
    gsAlert('❌ 복원 실패\n\n' + e.message);
  } finally {
    if (overlay) overlay.style.display = 'none';
  }
}


// ----------------------------------------
// 10. Auth
// ----------------------------------------

let currentUserAuth    = null;
let currentLoggedPlayer = null;

firebase.auth().onAuthStateChanged(user => {
  const authOverlay    = document.getElementById('auth-overlay');
  const logoutBtnWrap  = document.getElementById('logout-btn-wrap');
  const loginStatusText = document.getElementById('login-status-text');

  if (user) {
    currentUserAuth = user;
    if (authOverlay)    authOverlay.style.display   = 'none';
    if (logoutBtnWrap)  logoutBtnWrap.style.display = 'block';
    if (loginStatusText) {
      loginStatusText.textContent  = '👤 로그인됨';
      loginStatusText.style.color  = '#4CAF50';
      loginStatusText.style.cursor = 'pointer';
      loginStatusText.onclick = () => gsConfirm('로그아웃하시겠습니까?', ok => { if (ok) handleLogout(); });
    }
  } else {
    currentUserAuth = null; currentLoggedPlayer = null;
    if (authOverlay)    authOverlay.style.display   = 'none';
    if (logoutBtnWrap)  logoutBtnWrap.style.display = 'none';
    if (loginStatusText) {
      loginStatusText.textContent  = '👤 비로그인';
      loginStatusText.style.color  = '#888';
      loginStatusText.style.cursor = 'pointer';
      loginStatusText.onclick = () => requireAuth();
    }
  }
});

async function handleGoogleLogin() {
  try {
    await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
  } catch (error) {
    const errEl = document.getElementById('auth-error');
    if (errEl) { errEl.textContent = error.message; errEl.style.display = 'block'; }
  }
}

async function handleEmailLogin() {
  const email = document.getElementById('auth-email').value;
  const pwd   = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  if (!email || !pwd) {
    if (errEl) { errEl.textContent = '이메일과 비밀번호를 모두 입력해줘.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pwd);
  } catch (error) {
    if (errEl) { errEl.textContent = '로그인 실패: ' + error.message; errEl.style.display = 'block'; }
  }
}

async function _syncRestoreLoggedPlayer(clubId) {
  if (!currentUserAuth || !clubId) {
    if (typeof renderHome === 'function') renderHome(); return;
  }
  try {
    const playersRef = _clubRef(clubId).collection('players');
    // 1) uid로 연동된 선수 확인
    const snap = await playersRef.where('uid', '==', currentUserAuth.uid).get();
    if (!snap.empty) { currentLoggedPlayer = snap.docs[0].data(); if (typeof renderHome === 'function') renderHome(); return; }
    // 2) localStorage에 저장된 이름으로 복원
    const savedName = localStorage.getItem(`auth_name_${clubId}_${currentUserAuth.uid}`);
    if (savedName) {
      const doc = await playersRef.doc(savedName).get();
      if (doc.exists) {
        currentLoggedPlayer = doc.data();
        if (!currentLoggedPlayer.uid) {
          playersRef.doc(savedName).update({ uid: currentUserAuth.uid, email: currentUserAuth.email || '' })
            .catch(e => console.warn('[uid 자동저장 실패]', e));
          currentLoggedPlayer.uid = currentUserAuth.uid;
        }
        if (typeof renderHome === 'function') renderHome(); return;
      }
    }
    // 3) 해당 클럽에 없음
    currentLoggedPlayer = null;
    if (typeof renderHome === 'function') renderHome();
  } catch (e) {
    console.warn('[_syncRestoreLoggedPlayer] error:', e);
    currentLoggedPlayer = null;
    if (typeof renderHome === 'function') renderHome();
  }
}

function doLockerLink() { requireAuth(() => { if (typeof renderHome === 'function') renderHome(); }); }
function handleLogout() { firebase.auth().signOut(); }

async function requireAuth(onSuccess) {
  const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  if (!clubId) { gsAlert('소속 클럽을 먼저 선택하시면 실명 대조 및 로그인이 가능합니다.'); return; }

  if (!currentUserAuth) {
    gsConfirm('이 기능을 사용하려면 로그인이 필요합니다. 지금 로그인하시겠습니까?', res => {
      if (res) { const el = document.getElementById('auth-overlay'); if (el) el.style.display = 'flex'; }
    });
    return;
  }

  try {
    const playersRef = _clubRef(clubId).collection('players');
    // 1) uid 연동 확인
    const snapshot = await playersRef.where('uid', '==', currentUserAuth.uid).get();
    if (!snapshot.empty) { currentLoggedPlayer = snapshot.docs[0].data(); if (onSuccess) onSuccess(); return; }
    // 2) localStorage 캐시 확인
    const savedName = localStorage.getItem(`auth_name_${clubId}_${currentUserAuth.uid}`);
    if (savedName) {
      const playerDoc = await playersRef.doc(savedName).get();
      if (playerDoc.exists && playerDoc.data().uid === currentUserAuth.uid) {
        currentLoggedPlayer = playerDoc.data(); if (onSuccess) onSuccess(); return;
      }
    }
    // 3) 이름 입력 요청
    const allPlayerNames = Array.isArray(players) ? players.map(p => p?.name).filter(Boolean) : [];
    gsEditName('', async enteredName => {
      enteredName = (enteredName || '').trim();
      if (!enteredName) { gsAlert('정확한 실명을 입력하거나 목록에서 선택해 주세요.'); return; }
      if (!allPlayerNames.includes(enteredName)) { gsAlert('현재 선수 목록에 없는 이름입니다. 정확한 이름을 입력하거나 목록에서 선택해 주세요.'); return; }

      const playerDoc = await playersRef.doc(enteredName).get();
      if (playerDoc.exists) {
        await playersRef.doc(enteredName).update({ uid: currentUserAuth.uid, email: currentUserAuth.email || '' });
      }
      localStorage.setItem(`auth_name_${clubId}_${currentUserAuth.uid}`, enteredName);
      currentLoggedPlayer = playerDoc.exists ? playerDoc.data() : (players.find(p => p?.name === enteredName) || { name: enteredName });
      currentLoggedPlayer.uid = currentUserAuth.uid;
      gsAlert(`반갑습니다, ${enteredName}님! 인증이 완료되었습니다.`);
      if (onSuccess) onSuccess();
    }, { title: '실명 대조', placeholder: '클럽 등록 실명을 입력하세요', suggestions: allPlayerNames });
    setTimeout(() => {
      const title = document.getElementById('gsEditNameTitle');
      if (title) title.textContent = '권한 확인을 위해 성함을 입력해 주세요';
    }, 150);
  } catch (e) {
    console.error('Auth Guard error:', e);
    gsAlert('권한 확인 중 오류가 발생했습니다.');
  }
}


// ----------------------------------------
// window 전역 등록
// ----------------------------------------

window.sync               = sync;
window.loadMoreMatchLog   = loadMoreMatchLog;
window.exportBackup       = exportBackup;
window.importBackup       = importBackup;
window.handleGoogleLogin  = handleGoogleLogin;
window.handleEmailLogin   = handleEmailLogin;
window.handleLogout       = handleLogout;
window.doLockerLink       = doLockerLink;
window.requireAuth        = requireAuth;
window.pushDataOnly       = pushDataOnly;
window.pushFeeData        = pushFeeData;
window.pushFinanceData    = pushFinanceData;
window.fetchFeeData       = fetchFeeData;
window.fetchFinanceData   = fetchFinanceData;
window.fetchCourtNotices  = fetchCourtNotices;
window.fetchAnnouncements = fetchAnnouncements;
window.pushCourtNotices   = pushCourtNotices;
window.pushAnnouncements  = pushAnnouncements;
window.clearFinanceData   = clearFinanceData;
