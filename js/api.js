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

      // ✅ A unique, stable matchId prevents duplicated appends from inflating stats.
      // Prefer explicit ids if present, otherwise derive a deterministic id from content.
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



async function sync() {
  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">데이터 불러오는 중...</div>`);
  try {
    // ✅ v3.79: clubId를 쿼리에 포함
    const clubParam = getActiveClubId() ? ('&clubId=' + encodeURIComponent(getActiveClubId())) : '';
    const r = await fetchWithTimeout(MASTER_GAS_URL + '?t=' + Date.now() + clubParam, {}, 15000);
    if (!r.ok) throw new Error("GAS GET 실패: " + r.status);
    const data = await r.json();

    if (Array.isArray(data)) {
      players = (data || []).map(ensure);
      matchLog = matchLog || [];
    } else {
      players = (data?.data || data?.players || []).map(ensure);
      matchLog = normalizeMatchLog(data?.matchLog || data?.logs || []);
    }

    // ✅ v3.816: '1대2용' → '1대2대결용' 이름 마이그레이션 (옵션B)
    migrate1v2Names();

    updateSeason();
    updateWeekly();
    if (tabNow === 1) updateChartRange(0);
    renderLadderPlayerPool();
    initTournament();
    renderStatsPlayerList();

    setStatus('');

    // ✅ v3.92: gs:state:changed 통합 이벤트 — 선수/경기 데이터 확정
    AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'data', players, matchLog } }));

    setTimeout(applyAutofitAllTables, 0);
  } catch (e) {
    setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">데이터 동기화 실패 😵‍💫</div>`);
  } finally {
    $('loading-overlay').style.display = 'none';
  }
}

// ✅ v3.816: '1대2용' → '1대2대결용' 마이그레이션 함수
function migrate1v2Names() {
  let changed = false;
  // players 배열에서 이름 변경
  players.forEach(p => {
    if (p.name === '1대2용') {
      p.name = '1대2대결용';
      changed = true;
    }
  });
  // matchLog에서 이름 변경
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
  // 변경됐으면 서버에 push (조용히)
  if (changed) {
    console.log('[v3.816] 1대2용 → 1대2대결용 마이그레이션 완료, 서버 저장 중...');
    pushPayload({ action: "save", data: players, matchLogAppend: [] }).catch(e => console.warn('migrate push error:', e));
  }
}

async function pushPayload(payload) {
  $('loading-overlay').style.display = 'flex';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">저장 중...</div>`);
  try {
    // ✅ v3.79: clubId를 payload에 포함
    if (getActiveClubId()) payload.clubId = getActiveClubId();
    const r = await fetchWithTimeout(MASTER_GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }, 15000);
    if (!r.ok) throw new Error("GAS POST 실패: " + r.status);

    let resp = null;
    try { resp = await r.json(); } catch (_) { }
    if (resp && typeof resp === "object") {
      if (Array.isArray(resp.data)) {
        // ✅ v3.941: GAS가 gender 필드를 직접 저장/반환하므로 ensure()만으로 충분
        players = resp.data.map(ensure);
      }
      if (Array.isArray(resp.matchLog)) matchLog = normalizeMatchLog(resp.matchLog);
    }
    setStatus('');

    setTimeout(applyAutofitAllTables, 0);

    return true;
  } catch (e) {
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
// v3.80: GAS 연동 - 코트공지 & 공지사항 로드
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
  try {
    const url = MASTER_GAS_URL + '?action=getCourtNotices&clubId=' + encodeURIComponent(getActiveClubId());
    const r = await fetchWithTimeout(url, {}, 12000);
    if (!r.ok) throw new Error('not ok');
    const resp = await r.json();
    if (resp.ok && Array.isArray(resp.notices)) {
      courtNotices = resp.notices;
      persistCourtNoticesLocal();
      // ✅ v3.92: gs:state:changed 통합 이벤트 — GAS 정상 로드 확정 후 1회
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'court', courtNotices } }));
      return;
    }
  } catch (e) {
    console.warn('fetchCourtNotices GAS error, using local:', e);
  }
  // GAS 실패시 localStorage에서 복원 (fallback)
  try { courtNotices = JSON.parse(localStorage.getItem(getLocalCourtKey())) || []; } catch (e) { courtNotices = []; }
  // ✅ v3.92: gs:state:changed 통합 이벤트 — fallback 확정 후 1회 (GAS 성공 경로와 상호 배타적)
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'court', courtNotices } }));
}

async function fetchAnnouncements() {
  if (!currentClub) return;
  try {
    const url = MASTER_GAS_URL + '?action=getAnnouncements&clubId=' + encodeURIComponent(getActiveClubId());
    const r = await fetchWithTimeout(url, {}, 12000);
    if (!r.ok) throw new Error('not ok');
    const resp = await r.json();
    if (resp.ok && Array.isArray(resp.announcements)) {
      announcements = resp.announcements;
      persistAnnouncementsLocal();
      // ✅ v3.92: gs:state:changed 통합 이벤트 — GAS 정상 로드 확정 후 1회
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'announcements', announcements } }));
      return;
    }
  } catch (e) {
    console.warn('fetchAnnouncements GAS error, using local:', e);
  }
  // GAS 실패시 localStorage에서 복원 (fallback)
  try { announcements = JSON.parse(localStorage.getItem(getLocalAnnouncementKey())) || []; } catch (e) { announcements = []; }
  // ✅ v3.92: gs:state:changed 통합 이벤트 — fallback 확정 후 1회 (GAS 성공 경로와 상호 배타적)
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'announcements', announcements } }));
}

// 코트공지 저장 (단건 — 하위호환용)
async function saveCourtNotice(notice) {
  persistCourtNoticesLocal(); // 항상 로컬 먼저
  // ✅ v3.83: 전체 배열을 GAS에 저장 (단건이 아니라 전체 동기화)
  return await pushCourtNoticesToGAS();
}

// 공지사항 저장 (단건 — 하위호환용)
async function saveAnnouncement(announcement) {
  persistAnnouncementsLocal(); // 항상 로컬 먼저
  // ✅ v3.83: 전체 배열을 GAS에 저장 (단건이 아니라 전체 동기화)
  return await pushAnnouncementsToGAS();
}

// ✅ v3.83: 공지사항 전체 배열을 GAS에 저장
async function pushAnnouncementsToGAS() {
  persistAnnouncementsLocal(); // 항상 로컬 먼저
  if (!currentClub) return false;
  try {
    const r = await fetchWithTimeout(MASTER_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveAnnouncements',
        clubId: getActiveClubId(),
        announcements: announcements
      })
    }, 12000);
    const resp = await r.json();
    return resp.ok || false;
  } catch (e) {
    console.warn('pushAnnouncementsToGAS error:', e);
    return false;
  }
}

// ✅ v3.83: 코트공지 전체 배열을 GAS에 저장
async function pushCourtNoticesToGAS() {
  persistCourtNoticesLocal(); // 항상 로컬 먼저
  if (!currentClub) return false;
  try {
    const r = await fetchWithTimeout(MASTER_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveCourtNotices',
        clubId: getActiveClubId(),
        notices: courtNotices
      })
    }, 12000);
    const resp = await r.json();
    return resp.ok || false;
  } catch (e) {
    console.warn('pushCourtNoticesToGAS error:', e);
    return false;
  }
}

// ✅ v3.83: 회비 데이터를 GAS에서 로드
async function fetchFeeData() {
  if (!currentClub) return;
  const cid = getActiveClubId();
  try {
    const url = MASTER_GAS_URL + '?action=getFeeData&clubId=' + encodeURIComponent(cid);
    const r = await fetchWithTimeout(url, {}, 12000);
    if (!r.ok) throw new Error('not ok');
    const resp = await r.json();
    if (resp.ok) {
      feeData = resp.feeData || {};
      monthlyFeeAmount = resp.monthlyFeeAmount || 0;
      // localStorage에도 캐시
      localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
      localStorage.setItem('grandslam_monthly_fee_' + cid, monthlyFeeAmount);
      // ✅ v3.92: gs:state:changed 통합 이벤트 — GAS 정상 로드 확정 후 1회
      AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'fee', feeData, monthlyFeeAmount } }));
      return;
    }
  } catch (e) {
    console.warn('fetchFeeData GAS error, using local:', e);
  }
  // GAS 실패 시 localStorage fallback
  try { feeData = JSON.parse(localStorage.getItem('grandslam_fee_data_' + cid)) || {}; } catch (e) { feeData = {}; }
  const savedFee = localStorage.getItem('grandslam_monthly_fee_' + cid);
  if (savedFee) monthlyFeeAmount = parseInt(savedFee) || 0;
  // ✅ v3.92: gs:state:changed 통합 이벤트 — fallback 확정 후 1회 (GAS 성공 경로와 상호 배타적)
  AppEvents.dispatchEvent(new CustomEvent('gs:state:changed', { detail: { type: 'fee', feeData, monthlyFeeAmount } }));
}

// ✅ v3.83: 회비 데이터를 GAS에 저장
async function pushFeeData() {
  const cid = getActiveClubId();
  // 항상 로컬 먼저
  if (cid) {
    localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
    localStorage.setItem('grandslam_monthly_fee_' + cid, monthlyFeeAmount);
  }
  if (!currentClub) return false;
  try {
    const r = await fetchWithTimeout(MASTER_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveFeeData',
        clubId: cid,
        feeData: feeData,
        monthlyFeeAmount: monthlyFeeAmount
      })
    }, 12000);
    const resp = await r.json();
    return resp.ok || false;
  } catch (e) {
    console.warn('pushFeeData error:', e);
    return false;
  }
}
