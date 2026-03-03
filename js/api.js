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

      // ✅ v4.84: 교류전 필드 보존 (normalizeMatchLog에서 날아가던 버그 수정)
      const entry = {
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
      // 교류전 관련 필드 — 있을 때만 포함
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
    // ✅ v4.036: 필수 필드 default 주입 / v4.6-fix: data로 저장 (오타 수정)
    const data = Object.assign({ sport: 'tennis' }, m);
    const ref = col.doc(_sanitizeDocId(data.id));
    batch.set(ref, data);
  });
  await batch.commit();
}

// ========================================
// SYNC (Firestore)
// ========================================

// ✅ v4.932: sync 큐 — 동시 다중 실행 방지
let _syncRunning = false;
let _pendingSyncClubId = null;

async function sync() {
  const requestedClubId = getActiveClubId() || 'default';
  if (_syncRunning) {
    _pendingSyncClubId = requestedClubId;
    return;
  }
  _syncRunning = true;
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
    // 1단계 — players 먼저 로드
    const rawPlayers = await _fsGetPlayers(clubId);

    // ✅ v4.932: 로드 완료 시점에 클럽이 바뀌었으면 결과 버림
    if ((getActiveClubId() || 'default') !== clubId) {
      $('loading-overlay').style.display = 'none';
      setStatus('');
      return;
    }

    players = (rawPlayers || []).map(ensure);
    matchLog = Array.isArray(matchLog) ? matchLog : [];
    try {
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'players', players } }));
    } catch (e) { }

    $('loading-overlay').style.display = 'none';
    setStatus(`<div style="color:#888; font-size:12px;">최근 경기 불러오는 중...</div>`);

    // 2단계 — matchLog 로드
    const rawLog = await _fsGetMatchLog(clubId);

    // ✅ v4.932: matchLog 완료 시점에도 클럽 체크
    if ((getActiveClubId() || 'default') !== clubId) {
      setStatus('');
      return;
    }

    matchLog = normalizeMatchLog(rawLog);

    updateSeason();
    updateWeekly();
    if (tabNow === 1) updateChartRange(0);
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();

    setStatus('');

    fetchFeeData().catch(e => console.warn('sync fetchFeeData error:', e));
    setTimeout(applyAutofitAllTables, 0);

    // ✅ v4.928: 데이터 완전 로드 후 → 해당 클럽에서 로그인 유저 복원 → renderHome()
    await _syncRestoreLoggedPlayer(clubId);

    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players, matchLog } }));

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

// ========================================
// PUSH (Firestore)
// ========================================

async function pushPayload(payload) {
  // ✅ v4.15: 저장 시도 시 권한(Auth) 검사 (VIP룸 자물쇠)
  if (typeof requireAuth === 'function') {
    // 글로벌 로그인이나 클럽 내 이름 연동이 안 되어 있다면?
    if (!currentUserAuth || !currentLoggedPlayer) {
      requireAuth(); // 부드럽게 권한 요구 모달 띄우기 (확인 시 로그인 창 열림)
      return false;  // 이번 저장은 강제 중단 (로그인 후 다시 누르도록 유도)
    }
  }

  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">저장 중...</div>`);
  try {
    const clubId = payload.clubId || (typeof getActiveClubId === 'function' ? getActiveClubId() : 'default');

    // 선수 저장
    if (Array.isArray(payload.data)) {
      await _fsSavePlayers(clubId, payload.data);
      players = payload.data.map(ensure);
    }

    // ✅ v4.6-fix: matchLogReset — Firestore matchLog 컬렉션 전체 삭제
    if (payload.matchLogReset === true) {
      const logCol = _clubRef(clubId).collection('matchLog');
      const snap = await logCol.get();
      if (!snap.empty) {
        // Firestore batch는 500개 제한 — 청크 단위로 삭제
        const chunkSize = 400;
        for (let i = 0; i < snap.docs.length; i += chunkSize) {
          const delBatch = _db.batch();
          snap.docs.slice(i, i + chunkSize).forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();
        }
      }
      matchLog = [];
    }

    // ✅ v4.88: 경기 저장 시 미승인 클럽 gameCount 체크 (총 20회 제한)
    if (Array.isArray(payload.matchLogAppend) && payload.matchLogAppend.length > 0) {
      // 미승인 클럽 체크
      const clubDoc = await _db.collection('clubs').doc(clubId).get();
      const clubInfo = clubDoc.exists ? clubDoc.data() : {};
      if (clubInfo.approved !== true) {
        const currentCount = clubInfo.gameCount || 0;
        if (currentCount >= 20) {
          const email = await getContactEmail();
          setStatus('');
          $('loading-overlay').style.display = 'none';
          gsAlert(`🔒 무료 체험 경기(20회)를 모두 사용했습니다.\n\n계속 사용하려면 총괄 관리자에게 문의하세요.\n📧 ${email}`);
          return false;
        }
        // gameCount 증가
        await _db.collection('clubs').doc(clubId).update({
          gameCount: firebase.firestore.FieldValue.increment(payload.matchLogAppend.length)
        });
      }
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
  return await pushCourtNotices();
}

// 공지사항 저장 (단건 — 하위호환용)
async function saveAnnouncement(announcement) {
  persistAnnouncementsLocal();
  return await pushAnnouncements();
}

// ✅ v3.83: 공지사항 전체 배열 저장 (Firestore)
async function pushAnnouncements() {
  persistAnnouncementsLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set(
      { announcements },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('pushAnnouncements error:', e);
    return false;
  }
}

// ✅ v3.83: 코트공지 전체 배열 저장 (Firestore)
async function pushCourtNotices() {
  persistCourtNoticesLocal();
  if (!currentClub) return false;
  try {
    await _clubRef(getActiveClubId()).collection('settings').doc('notices').set(
      { courtNotices },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn('pushCourtNotices error:', e);
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
    const [playerSnap, logSnap, noticeDoc, feeDoc, financeDoc, exchangeSnap] = await Promise.all([
      _clubRef(clubId).collection('players').get(),
      _clubRef(clubId).collection('matchLog').orderBy('ts', 'desc').limit(500).get(),
      _clubRef(clubId).collection('settings').doc('notices').get(),
      _clubRef(clubId).collection('settings').doc('feeData').get(),
      // ✅ v4.47: 재정 데이터 + 교류전 추가
      _clubRef(clubId).collection('settings').doc('financeData').get(),
      _clubRef(clubId).collection('exchanges').get(),
    ]);

    const backupData = {
      version: 'v4.47',
      exportedAt: new Date().toISOString(),
      clubId,
      clubName,
      players: playerSnap.docs.map(d => d.data()),
      matchLog: logSnap.docs.map(d => d.data()),
      courtNotices: noticeDoc.exists ? (noticeDoc.data().courtNotices || []) : [],
      announcements: noticeDoc.exists ? (noticeDoc.data().announcements || []) : [],
      feeData: feeDoc.exists ? (feeDoc.data().feeData || {}) : {},
      monthlyFeeAmount: feeDoc.exists ? (feeDoc.data().monthlyFeeAmount || 0) : 0,
      // ✅ v4.47: 신규 백업 항목
      financeData: financeDoc.exists ? (financeDoc.data().financeData || []) : [],
      exchanges: exchangeSnap.docs.map(d => ({ id: d.id, ...d.data() })),
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

// ✅ v4.6: importBackup — admin.js의 importBackupWithGuard 경로는 confirmAdminPin() 인증 완료 상태
// checkClubPin 이중 호출 제거 (비번 루프 버그 수정)
async function importBackup(file, { skipPinCheck = false } = {}) {
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
      `⚠️ 복원 확인\n\n백업 날짜: ${exportedAt}\n클럽: ${data.clubName || data.clubId || '현재 클럽'}\n선수: ${playerCount}명 / 경기: ${logCount}건\n\n현재 데이터가 모두 교체됩니다.\n계속하시겠습니까?`,
      async (ok) => {
        if (!ok) return;

        // ✅ v4.6: skipPinCheck=true(admin 경로)면 PIN 재확인 생략, 아니면 clubPin 확인
        const _doRestore = async () => {
          const overlay = $('loading-overlay');
          if (overlay) overlay.style.display = 'flex';
          try {
            // ✅ v4.6: clubId 누락 시 현재 활성 클럽으로 강제 연결
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

            // ✅ v4.47: financeData 복원 (없으면 빈 배열 — 하위 호환)
            const manualFinance = (data.financeData || []).filter(f => !f.auto);
            await _clubRef(clubId).collection('settings').doc('financeData').set({
              financeData: manualFinance,
            });
            financeData = manualFinance;

            // ✅ v4.47: exchanges 복원 (없으면 스킵 — 하위 호환)
            if (Array.isArray(data.exchanges) && data.exchanges.length > 0) {
              const exBatch = _db.batch();
              data.exchanges.forEach(ex => {
                const ref = _clubRef(clubId).collection('exchanges').doc(ex.id);
                exBatch.set(ref, ex);
              });
              await exBatch.commit();
            }

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
        };

        if (skipPinCheck) {
          // admin 경로: 이미 confirmAdminPin() 인증 완료 → PIN 재요구 없이 바로 복원
          await _doRestore();
        } else {
          // 직접 호출 경로: clubPin 확인 후 복원
          checkClubPin(async (passed) => {
            if (!passed) return;
            await _doRestore();
          });
        }
      }
    );
  } catch (e) {
    gsAlert('❌ 파일 읽기 실패\n\nJSON 형식이 올바르지 않습니다.');
  }
}

// ========================================
// ✅ v4.15: 액션 기반 Auth Guard (VIP룸 문지기 시스템)
// ========================================
let currentUserAuth = null;
let currentLoggedPlayer = null;

firebase.auth().onAuthStateChanged((user) => {
  const authOverlay = document.getElementById('auth-overlay');
  const logoutBtnWrap = document.getElementById('logout-btn-wrap');
  const loginStatusText = document.getElementById('login-status-text');
  if (user) {
    currentUserAuth = user;
    if (authOverlay) authOverlay.style.display = 'none';
    if (logoutBtnWrap) logoutBtnWrap.style.display = 'block';
    if (loginStatusText) {
      loginStatusText.textContent = '👤 로그인됨';
      loginStatusText.style.color = '#4CAF50';
      loginStatusText.style.cursor = 'pointer';
      loginStatusText.onclick = () => gsConfirm('로그아웃하시겠습니까?', ok => { if (ok) handleLogout(); });
    }
    // ✅ v4.932: 복원은 sync() → _doSync() → _syncRestoreLoggedPlayer() 에서 처리
  } else {
    currentUserAuth = null;
    currentLoggedPlayer = null;
    if (authOverlay) authOverlay.style.display = 'none'; // 눈팅을 위해 기본 숨김
    if (logoutBtnWrap) logoutBtnWrap.style.display = 'none';
    if (loginStatusText) {
      loginStatusText.textContent = '👤 비로그인';
      loginStatusText.style.color = '#888';
      loginStatusText.style.cursor = 'pointer';
      loginStatusText.onclick = () => requireAuth();
    }
  }
});

async function handleGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (error) {
    const errEl = document.getElementById('auth-error');
    if (errEl) { errEl.textContent = error.message; errEl.style.display = 'block'; }
  }
}

async function handleEmailLogin() {
  const email = document.getElementById('auth-email').value;
  const pwd = document.getElementById('auth-password').value;
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

// ✅ v4.928: sync() 완료 후 해당 클럽 로그인 유저 복원 → renderHome()
async function _syncRestoreLoggedPlayer(clubId) {
  if (!currentUserAuth || !clubId) {
    if (typeof renderHome === 'function') renderHome();
    return;
  }
  try {
    const playersRef = _clubRef(clubId).collection('players');
    // 1) uid로 연동된 선수 확인
    const snap = await playersRef.where('uid', '==', currentUserAuth.uid).get();
    if (!snap.empty) {
      currentLoggedPlayer = snap.docs[0].data();
      if (typeof renderHome === 'function') renderHome();
      return;
    }
    // 2) localStorage에 저장된 이름으로 복원
    const savedName = localStorage.getItem(`auth_name_${clubId}_${currentUserAuth.uid}`);
    if (savedName) {
      const doc = await playersRef.doc(savedName).get();
      if (doc.exists) {
        currentLoggedPlayer = doc.data();
        // ✅ v4.931: Firestore uid 없으면 자동 저장 (다른 기기/캐시 초기화 대응)
        if (!currentLoggedPlayer.uid) {
          playersRef.doc(savedName).update({
            uid: currentUserAuth.uid,
            email: currentUserAuth.email || ''
          }).catch(e => console.warn('[v4.931] uid 자동 저장 실패:', e));
          currentLoggedPlayer.uid = currentUserAuth.uid;
        }
        if (typeof renderHome === 'function') renderHome();
        return;
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

// ✅ v4.930: 라커룸 연결하기 버튼 핸들러
function doLockerLink() {
  requireAuth(() => {
    if (typeof renderHome === 'function') renderHome();
  });
}

function handleLogout() {
  firebase.auth().signOut();
}

// ✅ 핵심: 특정 액션(경기 추가, 저장 등)을 할 때만 호출하는 권한 체크 함수
async function requireAuth(onSuccess) {
  const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  if (!clubId) {
    gsAlert('소속 클럽을 먼저 선택하시면 실명 대조 및 로그인이 가능합니다.');
    return;
  }

  // 1. 로그인 안 된 상태
  if (!currentUserAuth) {
    gsConfirm('이 기능을 사용하려면 로그인이 필요합니다. 지금 로그인하시겠습니까?', (res) => {
      if (res) {
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay) authOverlay.style.display = 'flex';
      }
    });
    return;
  }

  try {
    const playersRef = _clubRef(clubId).collection('players');
    const snapshot = await playersRef.where('uid', '==', currentUserAuth.uid).get();

    // 2. 이미 해당 클럽에 연동된 경우
    if (!snapshot.empty) {
      currentLoggedPlayer = snapshot.docs[0].data();
      if (onSuccess) onSuccess();
      return;
    }
    // 3. 로그인은 했지만 클럽에 이름이 연동 안 된 경우
    // 로컬 스토리지에 저장된 이름이 있는지 먼저 확인
    const savedName = localStorage.getItem(`auth_name_${clubId}_${currentUserAuth.uid}`);
    if (savedName) {
      const playerDoc = await playersRef.doc(savedName).get();
      if (playerDoc.exists && playerDoc.data().uid === currentUserAuth.uid) {
        currentLoggedPlayer = playerDoc.data();
        if (onSuccess) onSuccess();
        return;
      }
    }
    // 현재 선수 목록/명단 미리 가져오기 (추천 리스트용)
    const allPlayersSnap = await playersRef.get();
    const rosterNames = (allPlayersSnap && allPlayersSnap.docs) ? allPlayersSnap.docs.map(doc => doc.id) : [];
    const currentPlayerNames = Array.isArray(players) ? players.map(p => p && p.name).filter(Boolean) : [];
    const allPlayerNames = currentPlayerNames.length ? currentPlayerNames : rosterNames;
    gsEditName('', async (enteredName) => {
      enteredName = (enteredName || '').trim();
      if (!enteredName) {
        gsAlert('정확한 실명을 입력하거나 목록에서 선택해 주세요.');
        return;
      }

      const isCurrentPlayer = currentPlayerNames.includes(enteredName);
      if (!isCurrentPlayer) {
        gsAlert('현재 선수 목록에 없는 이름입니다. 정확한 이름을 입력하거나 목록에서 선택해 주세요.');
        return;
      }

      const playerDoc = await playersRef.doc(enteredName).get();
      if (playerDoc.exists) {
        await playersRef.doc(enteredName).update({
          uid: currentUserAuth.uid,
          email: currentUserAuth.email || ''
        });
      }
      localStorage.setItem(`auth_name_${clubId}_${currentUserAuth.uid}`, enteredName);
      currentLoggedPlayer = playerDoc.exists ? playerDoc.data() : (players.find(p => p && p.name === enteredName) || { name: enteredName });
      currentLoggedPlayer.uid = currentUserAuth.uid;
      gsAlert(`반갑습니다, ${enteredName}님! 인증이 완료되었습니다.`);
      if (onSuccess) onSuccess();
    }, {
      title: "실명 대조",
      placeholder: "클럽 등록 실명을 입력하세요",
      suggestions: allPlayerNames
    });
    setTimeout(() => {
      const title = document.getElementById('gsEditNameTitle');
      if (title) title.textContent = '권한 확인을 위해 성함을 입력해 주세요';
    }, 150);

  } catch (e) {
    console.error("Auth Guard error: ", e);
    gsAlert('권한 확인 중 오류가 발생했습니다.');
  }
}

// ========================================
// ✅ v4.47: 재정 데이터 Firestore 저장/불러오기
// clubs/{clubId}/settings/financeData
// 기존 코드 무수정 — 순수 추가
// ========================================

async function fetchFinanceData() {
  if (!currentClub) return;
  const cid = getActiveClubId();
  try {
    const doc = await _clubRef(cid).collection('settings').doc('financeData').get();
    if (doc.exists) {
      const data = doc.data();
      // auto 항목은 syncFeeToFinance()가 재생성하므로 수동 항목만 복원
      const manual = (data.financeData || []).filter(f => !f.auto);
      financeData = manual;
      return;
    }
  } catch (e) {
    console.warn('fetchFinanceData Firestore error:', e);
  }
  // Firestore 실패 시 localStorage fallback
  try {
    const saved = localStorage.getItem('grandslam_finance_data_' + cid);
    financeData = saved ? JSON.parse(saved).filter(f => !f.auto) : [];
  } catch (e) {
    financeData = [];
  }
}

async function pushFinanceData() {
  const cid = getActiveClubId();
  // 수동 항목만 저장 (auto 항목은 syncFeeToFinance가 매번 재생성)
  const manual = financeData.filter(f => !f.auto);
  if (cid) {
    try { localStorage.setItem('grandslam_finance_data_' + cid, JSON.stringify(manual)); } catch (e) {}
  }
  if (!currentClub) return false;
  try {
    await _clubRef(cid).collection('settings').doc('financeData').set({ financeData: manual });
    return true;
  } catch (e) {
    console.warn('pushFinanceData error:', e);
    return false;
  }
}

async function clearFinanceData() {
  const cid = getActiveClubId();
  financeData = [];
  if (cid) {
    try { localStorage.removeItem('grandslam_finance_data_' + cid); } catch (e) {}
  }
  if (!currentClub) return;
  try {
    await _clubRef(cid).collection('settings').doc('financeData').delete();
  } catch (e) {
    console.warn('clearFinanceData error:', e);
  }
}
