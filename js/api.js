// ========================================
// ✅ v4.036: 데이터 안정성 강화
// ✅ v4.035: Firestore 마이그레이션
// 함수 시그니처 100% 유지 — 내부 구현만 GAS→Firestore 교체
// Firestore 컬렉션 구조:
//   clubs/{clubId}/players      (선수 1명 = 문서 1개, doc id = name)
//   clubs/{clubId}/matchLog     (경기 1건 = 문서 1개, doc id = match.id)
//   clubs/{clubId}/settings/notices  (courtNotices, announcements)
//   clubs/{clubId}/settings/feeData  (feeData, monthlyFeeAmount)
// ========================================

// ========================================
// UTILITY FUNCTIONS
// ========================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function normalizeMatchLog(arr) {
  if (!Array.isArray(arr)) return [];
  const norm = arr
    .filter(Boolean)
    .map(x => {
      const home = Array.isArray(x.home) ? x.home
        : (typeof x.home === "string" ? x.home.split(",").map(s => s.trim()).filter(Boolean) : []);
      const away = Array.isArray(x.away) ? x.away
        : (typeof x.away === "string" ? x.away.split(",").map(s => s.trim()).filter(Boolean) : []);
      const type = x.type || x.mType || "double";
      const hs = Number(x.hs ?? x.homeScore ?? x.hS ?? 0);
      const as = Number(x.as ?? x.awayScore ?? x.aS ?? 0);
      const winner = x.winner || "";
      const ts = Number(x.ts || x.timestamp || x.time || Date.now());

      let id = x.id || x._id || x.matchId || x.mid || "";
      if (!id) {
        const hKey = home.join("|");
        const aKey = away.join("|");
        id = `${ts}-${type}-${hKey}__${aKey}-${hs}-${as}-${winner}`;
      }

      return {
        id,
        ts,
        date: x.date || x.ds || "",
        type,
        home,
        away,
        hs,
        as,
        winner,
        memo: x.memo || ""
      };
    });

  // ✅ Dedupe by id (keep the most recent ts)
  const byId = new Map();
  norm.forEach(m => {
    const prev = byId.get(m.id);
    if (!prev || Number(m.ts) >= Number(prev.ts)) byId.set(m.id, m);
  });

  return Array.from(byId.values()).sort((a, b) => Number(b.ts) - Number(a.ts));
}

// ========================================
// ✅ v4.036: Firestore 헬퍼
//   - doc id sanitize (/, ., .. → _)
//   - Player default 주입 (sport, level, attributes)
//   - Match default 주입 (sport)
//   - matchLog orderBy('ts','desc').limit(500)
// ========================================

// ✅ v4.036: Firestore doc id 금지 문자 치환
function _sanitizeDocId(id) {
  return String(id)
    .replace(/\//g, '_')   // 슬래시 금지
    .replace(/\.\./g, '_') // '..' 금지
    .replace(/^\./, '_')   // 선행 '.' 금지
    .replace(/\s+/g, '_'); // 공백 치환
}

// ========================================
// ✅ v4.10: matchLog 페이지네이션 (모바일 초기 로딩 최적화)
// - 첫 로딩: 최근 N개만
// - 더보기: startAfter 커서 기반으로 N개씩 추가 로딩
// ========================================
let _matchLogLastDoc = null;
let _matchLogExhausted = false;
let _matchLogPageSize = 500;

function _clubRef(clubId) {
  return _db.collection('clubs').doc(clubId || 'default');
}

async function _fsGetPlayers(clubId) {
  const snap = await _clubRef(clubId).collection('players').get();
  return snap.docs.map(d => d.data());
}

// ✅ v4.036: orderBy('ts','desc').limit(500) — 인덱스 필요 (ts 필드, 내림차순)
// ✅ v4.10: 첫 로딩은 최근 N개만 (orderBy+limit)
async function _fsGetMatchLog(clubId) {
  _matchLogLastDoc = null;
  _matchLogExhausted = false;

  const snap = await _clubRef(clubId).collection('matchLog')
    .orderBy('ts', 'desc')
    .limit(_matchLogPageSize)
    .get();

  if (snap.empty) {
    _matchLogExhausted = true;
    return [];
  }

  _matchLogLastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < _matchLogPageSize) _matchLogExhausted = true;

  return snap.docs.map(d => d.data());
}

// ✅ v4.10: 더보기(이전 기록) — 페이지 추가 로딩
async function _fsGetMatchLogMore(clubId) {
  if (_matchLogExhausted) return [];
  if (!_matchLogLastDoc) return [];

  const snap = await _clubRef(clubId).collection('matchLog')
    .orderBy('ts', 'desc')
    .startAfter(_matchLogLastDoc)
    .limit(_matchLogPageSize)
    .get();

  if (snap.empty) {
    _matchLogExhausted = true;
    return [];
  }

  _matchLogLastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < _matchLogPageSize) _matchLogExhausted = true;

  return snap.docs.map(d => d.data());
}

async function _fsSavePlayers(clubId, playerArr) {
  const col = _clubRef(clubId).collection('players');
  const batch = _db.batch();
  playerArr.forEach(p => {
    // ✅ v4.036: 필수 필드 default 주입
    const data = Object.assign({ sport: 'tennis', level: 'A', attributes: {} }, p);
    const docId = _sanitizeDocId(data.name);
    const ref = col.doc(docId);
    batch.set(ref, data);
  });
  // 삭제된 선수 제거
  const snap = await col.get();
  const names = new Set(playerArr.map(p => _sanitizeDocId(p.name)));
  snap.docs.forEach(d => {
    if (!names.has(d.id)) batch.delete(d.ref);
  });
  await batch.commit();
}

async function _fsAppendMatchLog(clubId, entries) {
  const col = _clubRef(clubId).collection('matchLog');
  const batch = _db.batch();
  entries.forEach(m => {
    // ✅ v4.036: 필수 필드 default 주입
    const data = Object.assign({ sport: 'tennis' }, m);
    const ref = col.doc(_sanitizeDocId(data.id));
    batch.set(ref, m);
  });
  await batch.commit();
}

// ========================================
// SYNC (Firestore)
// ========================================

async function sync() {
  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">데이터 불러오는 중...</div>`);
  try {
    const clubId = getActiveClubId() || 'default';

    // ========================================
    // ✅ v4.10: 1단계 — players 먼저 로드해서 '즉시 렌더'
    // (랭킹/명단 기반 화면을 먼저 띄워서 모바일 체감 개선)
    // ========================================
    const rawPlayers = await _fsGetPlayers(clubId);
    players = (rawPlayers || []).map(ensure);

    // matchLog는 아직 없음(또는 이전 값) — 일단 비워두고 빠르게 렌더
    matchLog = Array.isArray(matchLog) ? matchLog : [];
    try {
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'players', players } }));
    } catch (e) { }

    // ✅ overlay는 players만 받아도 일단 내려서 사용자 체감 속도 확보
    $('loading-overlay').style.display = 'none';
    setStatus(`<div style="color:#888; font-size:12px;">최근 경기 불러오는 중...</div>`);

    // ========================================
    // ✅ v4.10: 2단계 — matchLog는 최근 N개만 로드 (페이지네이션)
    // ========================================
    const rawLog = await _fsGetMatchLog(clubId);
    matchLog = normalizeMatchLog(rawLog);

    // ✅ v3.816: '1대2용' → '1대2대결용' 마이그레이션
    migrate1v2Names();

    // 기존 흐름 유지 (통계/사다리/토너먼트 등)
    updateSeason();
    updateWeekly();
    if (tabNow === 1) updateChartRange(0);
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();

    setStatus('');

    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players, matchLog } }));

    // ✅ v4.12: fetchFeeData 복구 (채코치 패치에서 누락)
    fetchFeeData().catch(e => console.warn('sync fetchFeeData error:', e));

    // ✅ v4.12: applyAutofitAllTables 복구 (채코치 패치에서 누락)
    setTimeout(applyAutofitAllTables, 0);

  } catch (e) {
    console.error(e);
    setStatus(`<div style="color:#d33; font-weight:bold;">❌ 데이터 로딩 실패: ${e.message}</div>`);
    $('loading-overlay').style.display = 'none';
  }
}

// ========================================
// ✅ v4.10: matchLog 더보기 (이전 기록 추가 로딩)
// - stats 화면 버튼에서 호출
// ========================================
async function loadMoreMatchLog() {
  try {
    const clubId = getActiveClubId() || 'default';
    setStatus(`<div style="color:#888; font-size:12px;">이전 기록 불러오는 중...</div>`);

    const more = await _fsGetMatchLogMore(clubId);
    if (!more || more.length === 0) {
      setStatus('');
      const btn = document.getElementById('btn-load-more-log');
      if (btn) {
        btn.textContent = '더 불러올 기록 없음';
        btn.disabled = true;
        btn.style.opacity = 0.55;
      }
      return;
    }

    matchLog = normalizeMatchLog(matchLog.concat(more));

    // matchLog가 늘었으니 시즌/주간/통계 재계산
    if (typeof updateSeason === 'function') updateSeason();
    if (typeof updateWeekly === 'function') updateWeekly();
    if (typeof renderStatsPlayerList === 'function') renderStatsPlayerList();
    if (typeof renderHome === 'function') renderHome();

    setStatus('');

    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players } }));

    // 더보기 끝났으면 버튼 비활성
    if (_matchLogExhausted) {
      const btn = document.getElementById('btn-load-more-log');
      if (btn) {
        btn.textContent = '더 불러올 기록 없음';
        btn.disabled = true;
        btn.style.opacity = 0.55;
      }
    }

  } catch (e) {
    console.error(e);
    setStatus(`<div style="color:#d33; font-weight:bold;">❌ 더보기 실패: ${e.message}</div>`);
  }
}

// ✅ v3.816: '1대2용' → '1대2대결용' 마이그레이션 함수
function migrate1v2Names() {
  let changed = false;
  players.forEach(p => {
    if (p.name === '1대2용') {
      p.name = '1대2대결용';
      changed = true;
    }
  });
  if (matchLog && matchLog.length > 0) {
    matchLog.forEach(log => {
      ['home', 'away', 'winner', 'loser'].forEach(key => {
        if (Array.isArray(log[key])) {
          log[key] = log[key].map(n => n === '1대2용' ? '1대2대결용' : n);
        } else if (log[key] === '1대2용') {
          log[key] = '1대2대결용';
          changed = true;
        }
      });
    });
  }
  if (changed) {
    console.log('[v3.816] 1대2용 → 1대2대결용 마이그레이션 완료, 서버 저장 중...');
    pushPayload({ action: "save", data: players, matchLogAppend: [] }).catch(e => console.warn('migrate push error:', e));
  }
}

// ========================================
// PUSH (Firestore)
// ========================================

async function pushPayload(payload) {
  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">저장 중...</div>`);
  try {
    const clubId = payload.clubId || getActiveClubId() || 'default';

    // 선수 저장
    if (Array.isArray(payload.data)) {
      await _fsSavePlayers(clubId, payload.data);
      players = payload.data.map(ensure);
    }

    // 경기 기록 추가
    if (Array.isArray(payload.matchLogAppend) && payload.matchLogAppend.length > 0) {
      const normalized = normalizeMatchLog(payload.matchLogAppend);
      await _fsAppendMatchLog(clubId, normalized);
      // 로컬 matchLog에도 반영 (dedupe)
      const byId = new Map(matchLog.map(m => [m.id, m]));
      normalized.forEach(m => byId.set(m.id, m));
      matchLog = Array.from(byId.values()).sort((a, b) => Number(b.ts) - Number(a.ts));
    }

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
  return await pushPayload({ action: "saveDataOnly", data: players });
}

async function pushWithMatchLogAppend(logEntries) {
  const arr = Array.isArray(logEntries) ? logEntries : [logEntries];
  return await pushPayload({ action: "save", data: players, matchLogAppend: arr });
}

// ========================================
// v3.80: 코트공지 & 공지사항
// v3.811: localStorage fallback + 클럽별 분리 저장
// ========================================

function getLocalCourtKey() { return 'grandslam_court_notices_' + getActiveClubId(); }
function getLocalAnnouncementKey() { return 'grandslam_announcements_' + getActiveClubId(); }

function persistCourtNoticesLocal() {
  try { localStorage.setItem(getLocalCourtKey(), JSON.stringify(courtNotices)); } catch (e) { }
}
function persistAnnouncementsLocal() {
  try { localStorage.setItem(getLocalAnnouncementKey(), JSON.stringify(announcements)); } catch (e) { }
}

async function fetchCourtNotices() {
  if (!currentClub) return;
  const clubId = getActiveClubId();
  try {
    const doc = await _clubRef(clubId).collection('settings').doc('notices').get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.courtNotices)) {
        courtNotices = data.courtNotices;
        persistCourtNoticesLocal();
        AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'court', courtNotices } }));
        return;
      }
    }
  } catch (e) {
    console.warn('fetchCourtNotices Firestore error, using local:', e);
  }
  try { courtNotices = JSON.parse(localStorage.getItem(getLocalCourtKey())) || []; } catch (e) { courtNotices = []; }
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'court', courtNotices } }));
}

async function fetchAnnouncements() {
  if (!currentClub) return;
  const clubId = getActiveClubId();
  try {
    const doc = await _clubRef(clubId).collection('settings').doc('notices').get();
    if (doc.exists) {
      const data = doc.data();
      if (Array.isArray(data.announcements)) {
        announcements = data.announcements;
        persistAnnouncementsLocal();
        AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'announcements', announcements } }));
        return;
      }
    }
  } catch (e) {
    console.warn('fetchAnnouncements Firestore error, using local:', e);
  }
  try { announcements = JSON.parse(localStorage.getItem(getLocalAnnouncementKey())) || []; } catch (e) { announcements = []; }
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'announcements', announcements } }));
}

// 코트공지 저장 (단건 — 하위호환용)
async function saveCourtNotice(notice) {
  persistCourtNoticesLocal();
  return await pushCourtNoticesToGAS();
}

// 공지사항 저장 (단건 — 하위호환용)
async function saveAnnouncement(announcement) {
  persistAnnouncementsLocal();
  return await pushAnnouncementsToGAS();
}

// ✅ v3.83: 공지사항 전체 배열 저장 (Firestore)
async function pushAnnouncementsToGAS() {
  persistAnnouncementsLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set(
      { announcements },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('pushAnnouncementsToGAS error:', e);
    return false;
  }
}

// ✅ v3.83: 코트공지 전체 배열 저장 (Firestore)
async function pushCourtNoticesToGAS() {
  persistCourtNoticesLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set(
      { courtNotices },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('pushCourtNoticesToGAS error:', e);
    return false;
  }
}

// ✅ v3.83: 회비 데이터 로드 (Firestore)
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
  } catch (e) {
    console.warn('fetchFeeData Firestore error, using local:', e);
  }
  try { feeData = JSON.parse(localStorage.getItem('grandslam_fee_data_' + cid)) || {}; } catch (e) { feeData = {}; }
  const savedFee = localStorage.getItem('grandslam_monthly_fee_' + cid);
  if (savedFee) monthlyFeeAmount = parseInt(savedFee) || 0;
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'fee', feeData, monthlyFeeAmount } }));
}

// ✅ v3.83: 회비 데이터 저장 (Firestore)
async function pushFeeData() {
  const cid = getActiveClubId();
  if (cid) {
    localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
    localStorage.setItem('grandslam_monthly_fee_' + cid, monthlyFeeAmount);
  }
  if (!currentClub) return false;
  try {
    await _clubRef(cid).collection('settings').doc('feeData').set({
      feeData,
      monthlyFeeAmount
    });
    return true;
  } catch (e) {
    console.warn('pushFeeData error:', e);
    return false;
  }
}

// ========================================
// ✅ v4.1: 데이터 백업 / 복원
// ========================================

async function exportBackup() {
  const btn = document.getElementById('backupExportBtn');
  if (btn) { btn.disabled = true; btn.textContent = '백업 중...'; }
  try {
    const clubId = getActiveClubId() || 'default';
    const clubName = (currentClub && currentClub.name) ? currentClub.name : clubId;

    // Firestore에서 최신 데이터 직접 읽기
    const [playerSnap, logSnap, noticeDoc, feeDoc] = await Promise.all([
      _clubRef(clubId).collection('players').get(),
      _clubRef(clubId).collection('matchLog').orderBy('ts', 'desc').limit(500).get(),
      _clubRef(clubId).collection('settings').doc('notices').get(),
      _clubRef(clubId).collection('settings').doc('feeData').get(),
    ]);

    const backupData = {
      version: 'v4.1',
      exportedAt: new Date().toISOString(),
      clubId,
      clubName,
      players: playerSnap.docs.map(d => d.data()),
      matchLog: logSnap.docs.map(d => d.data()),
      courtNotices: noticeDoc.exists ? (noticeDoc.data().courtNotices || []) : [],
      announcements: noticeDoc.exists ? (noticeDoc.data().announcements || []) : [],
      feeData: feeDoc.exists ? (feeDoc.data().feeData || {}) : {},
      monthlyFeeAmount: feeDoc.exists ? (feeDoc.data().monthlyFeeAmount || 0) : 0,
    };

    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `GrandSlam_${clubName}_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);

    gsAlert(`✅ 백업 완료!\n\n파일: GrandSlam_${clubName}_${dateStr}.json\n선수 ${backupData.players.length}명 / 경기 ${backupData.matchLog.length}건 포함`);
  } catch (e) {
    console.error('exportBackup error:', e);
    gsAlert('❌ 백업 실패\n\n' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 백업 다운로드'; }
  }
}

async function importBackup(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // 기본 유효성 검사
    if (!data.players || !data.matchLog) {
      gsAlert('❌ 유효하지 않은 백업 파일입니다.');
      return;
    }

    const playerCount = data.players.length;
    const logCount = data.matchLog.length;
    const exportedAt = data.exportedAt ? data.exportedAt.slice(0, 10) : '알 수 없음';

    gsConfirm(
      `⚠️ 복원 확인\n\n백업 날짜: ${exportedAt}\n클럽: ${data.clubName || data.clubId}\n선수: ${playerCount}명 / 경기: ${logCount}건\n\n현재 데이터가 모두 교체됩니다.\n계속하시겠습니까?`,
      async (ok) => {
        if (!ok) return;
        // 관리자 비번 확인
        checkClubPin(async (passed) => {
          if (!passed) return;
          const overlay = $('loading-overlay');
          if (overlay) overlay.style.display = 'flex';
          try {
            const clubId = getActiveClubId() || 'default';

            // 선수 복원
            await _fsSavePlayers(clubId, data.players);
            players = data.players.map(ensure);

            // matchLog 복원 (기존 삭제 후 재저장)
            const logCol = _clubRef(clubId).collection('matchLog');
            const oldSnap = await logCol.get();
            const delBatch = _db.batch();
            oldSnap.docs.forEach(d => delBatch.delete(d.ref));
            await delBatch.commit();
            if (data.matchLog.length > 0) {
              await _fsAppendMatchLog(clubId, data.matchLog);
            }
            matchLog = normalizeMatchLog(data.matchLog);

            // notices 복원
            await _clubRef(clubId).collection('settings').doc('notices').set({
              courtNotices: data.courtNotices || [],
              announcements: data.announcements || [],
            });
            courtNotices = data.courtNotices || [];
            announcements = data.announcements || [];

            // feeData 복원
            await _clubRef(clubId).collection('settings').doc('feeData').set({
              feeData: data.feeData || {},
              monthlyFeeAmount: data.monthlyFeeAmount || 0,
            });
            feeData = data.feeData || {};
            monthlyFeeAmount = data.monthlyFeeAmount || 0;

            // UI 갱신
            updateSeason();
            updateWeekly();
            renderLadderPlayerPool();
            initTournament();
            renderStatsPlayerList();
            loadCourtInfo();
            loadNotices();

            gsAlert(`✅ 복원 완료!\n선수 ${playerCount}명 / 경기 ${logCount}건 복원되었습니다.`);
          } catch (e) {
            console.error('importBackup error:', e);
            gsAlert('❌ 복원 실패\n\n' + e.message);
          } finally {
            if (overlay) overlay.style.display = 'none';
          }
        });
      }
    );
  } catch (e) {
    gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
  }
}
