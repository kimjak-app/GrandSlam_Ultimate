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

function _clubRef(clubId) {
  return _db.collection('clubs').doc(clubId || 'default');
}

async function _fsGetPlayers(clubId) {
  const snap = await _clubRef(clubId).collection('players').get();
  return snap.docs.map(d => d.data());
}

// ✅ v4.036: orderBy('ts','desc').limit(500) — 인덱스 필요 (ts 필드, 내림차순)
async function _fsGetMatchLog(clubId) {
  const snap = await _clubRef(clubId).collection('matchLog')
    .orderBy('ts', 'desc')
    .limit(500)
    .get();
  return snap.docs.map(d => d.data());
}

async function _fsSavePlayers(clubId, playerArr) {
  const col = _clubRef(clubId).collection('players');
  const batch = _db.batch();
  playerArr.forEach(p => {
    // ✅ v4.036: 필수 필드 default 주입
    const data = Object.assign({ sport: 'tennis', level: 'C', attributes: {} }, p);
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

    const [rawPlayers, rawLog] = await Promise.all([
      _fsGetPlayers(clubId),
      _fsGetMatchLog(clubId)
    ]);

    players = (rawPlayers || []).map(ensure);
    matchLog = normalizeMatchLog(rawLog);

    // ✅ v3.816: '1대2용' → '1대2대결용' 마이그레이션
    migrate1v2Names();

    updateSeason();
    updateWeekly();
    if (tabNow === 1) updateChartRange(0);
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();

    setStatus('');

    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players, matchLog } }));

    fetchFeeData().catch(e => console.warn('sync fetchFeeData error:', e));

    setTimeout(applyAutofitAllTables, 0);
  } catch (e) {
    console.error('sync error:', e);
    setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">데이터 동기화 실패 😵‍💫</div>`);
  } finally {
    $('loading-overlay').style.display = 'none';
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
