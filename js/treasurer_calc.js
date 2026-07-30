// ========================================
// TREASURER_CALC.JS - 총무 모드 계산/데이터 처리
// ========================================

function _getTreasurerCache() {
  if (!window.GS_STATE) window.GS_STATE = {};
  if (!GS_STATE.treasurerCache) GS_STATE.treasurerCache = {};
  return GS_STATE.treasurerCache;
}

function makeOneTimePlayerObj(name) {
  return {
    name, isGuest: true, isOneTime: true, score: 0, wins: 0, losses: 0,
    dScore: 0, dWins: 0, dLosses: 0, sScore: 0, sWins: 0, sLosses: 0,
    last: 0, lastD: 0, lastS: 0, weekly: 0, wWins: 0, wLosses: 0,
    wdScore: 0, wsScore: 0, wdWins: 0, wdLosses: 0, wsWins: 0, wsLosses: 0, lastW: 0, lastWD: 0, lastWS: 0
  };
}

// 특정 월에 해당 회원이 회비 납부 대상인지 판단
// dormantAt 기준: 휴면 시작월부터 면제, 이전 달은 납부 대상 유지
// 월 단위(YYYY-MM)로 비교 — 날짜 비교 시 월 중간 휴면처리 버그 방지
function _isFeeEligibleForMonth(p, yearStr, monthStr) {
  if (!p || p.isGuest || p.isTreasurer) return false;

  // ✅ v7.77 루트픽스:
  // 버튼을 누른 날짜가 아니라, 해당 월에 실제로 적용되는 회원 상태를 기준으로 회비 대상을 판단한다.
  // 예) 6월 30일에 7월 휴면/복귀 예약 → 6월 회계는 유지, 7월 회비표만 변경.
  const effectiveStatus = getMemberStatusForMonth(p, yearStr, monthStr);
  if (effectiveStatus === 'inactive' || effectiveStatus === 'dormant') return false;

  // isFeeExempt는 현재/해당월 정회원의 영구/수동 면제 전용 기준이다.
  if (p.isFeeExempt) return false;

  return effectiveStatus === 'active';
}


// ✅ v7.75 루트픽스: 월회비는 현재값 하나가 아니라 월별 적용 이력으로 판단한다.
// 예: 2026-01부터 80,000원, 2026-07부터 90,000원.
function _normalizeFeeRateHistory(history, fallbackAmount) {
  let list = Array.isArray(history) ? history : [];
  list = list
    .map(r => ({
      startYm: String(r?.startYm || '').slice(0, 7),
      amount: parseInt(r?.amount, 10) || 0,
    }))
    .filter(r => /^\d{4}-\d{2}$/.test(r.startYm) && r.amount > 0)
    .sort((a, b) => a.startYm.localeCompare(b.startYm));

  // v7.74 이전 클럽은 monthlyFeeAmount만 있으므로 과거 회비 기준으로 마이그레이션한다.
  // 1900-01은 모든 과거 월에 기존 회비가 적용되도록 하는 안전 기준점이다.
  const fallback = parseInt(fallbackAmount, 10) || 0;
  if (list.length === 0 && fallback > 0) list.push({ startYm: '1900-01', amount: fallback });

  // 같은 시작월이 중복되면 마지막 값을 채택한다.
  const byMonth = {};
  list.forEach(r => { byMonth[r.startYm] = r.amount; });
  return Object.keys(byMonth).sort().map(startYm => ({ startYm, amount: byMonth[startYm] }));
}

function _ensureFeeRateHistory(fallbackAmount) {
  feeRateHistory = _normalizeFeeRateHistory(feeRateHistory, fallbackAmount ?? monthlyFeeAmount);
  return feeRateHistory;
}

function _getCurrentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}


// ✅ v7.77: 회원 상태 변경 이력/예약 유틸리티
// 버튼을 누른 날과 실제 적용월을 분리해 휴면 예약·복귀 예약을 처리한다.
function _getLocalTodayStringForMemberStatus() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _addMonthsToYm(ym, delta) {
  const [y, m] = String(ym || _getCurrentYearMonth()).split('-').map(Number);
  const d = new Date(y, (m || 1) - 1 + Number(delta || 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _ymToFirstDate(ym) {
  return `${String(ym || _getCurrentYearMonth()).slice(0, 7)}-01`;
}

function _normalizeMemberStatusHistory(p) {
  if (!p) return [];
  let list = Array.isArray(p.memberStatusHistory) ? p.memberStatusHistory : [];
  list = list.map(r => {
      const type = String(r?.type || r?.status || '').trim();
      const startYm = String(r?.startYm || r?.startDate || r?.date || '').slice(0, 7);
      return { type, startYm };
    })
    .filter(r => ['active', 'dormant', 'inactive'].includes(r.type) && /^\d{4}-\d{2}$/.test(r.startYm));

  // 레거시 데이터 마이그레이션: 기존 dormantAt/restoreAt/leftAt도 월별 이력으로 읽는다.
  if (p.dormantAt && /^\d{4}-\d{2}/.test(String(p.dormantAt))) {
    list.push({ type: 'dormant', startYm: String(p.dormantAt).slice(0, 7) });
  }
  if (p.restoreAt && /^\d{4}-\d{2}/.test(String(p.restoreAt))) {
    list.push({ type: 'active', startYm: String(p.restoreAt).slice(0, 7) });
  }
  if (p.status === 'inactive' && p.leftAt && /^\d{4}-\d{2}/.test(String(p.leftAt))) {
    list.push({ type: 'inactive', startYm: String(p.leftAt).slice(0, 7) });
  }

  // 같은 적용월이 있으면 마지막 저장값을 채택한다.
  const byMonth = {};
  list.sort((a, b) => a.startYm.localeCompare(b.startYm)).forEach(r => { byMonth[r.startYm] = r.type; });
  const normalized = Object.keys(byMonth).sort().map(startYm => ({ startYm, type: byMonth[startYm] }));
  p.memberStatusHistory = normalized;
  return normalized;
}

function upsertMemberStatusHistory(p, type, startYm) {
  if (!p || !['active', 'dormant', 'inactive'].includes(type) || !/^\d{4}-\d{2}$/.test(String(startYm || ''))) return false;
  const history = _normalizeMemberStatusHistory(p).filter(r => r.startYm !== startYm);
  history.push({ type, startYm });
  history.sort((a, b) => a.startYm.localeCompare(b.startYm));
  p.memberStatusHistory = history;
  return true;
}

function getMemberStatusForMonth(p, yearStr, monthStr) {
  if (!p) return 'inactive';
  if (p.isGuest) return 'active';
  const targetYM = `${yearStr}-${String(monthStr).padStart(2, '0')}`;
  const history = _normalizeMemberStatusHistory(p);

  // 첫 이력 이전은 기본적으로 정회원으로 본다. 단 탈퇴만 있는 사람은 inactive 유지.
  let status = p.status === 'inactive' ? 'inactive' : 'active';
  history.forEach(r => { if (r.startYm <= targetYM) status = r.type; });
  return status || 'active';
}

function getMemberCurrentStatus(p) {
  const [y, m] = _getCurrentYearMonth().split('-');
  return getMemberStatusForMonth(p, y, m);
}

function getNextMemberStatusChange(p) {
  const currentYM = _getCurrentYearMonth();
  const history = _normalizeMemberStatusHistory(p);
  return history.find(r => r.startYm > currentYM) || null;
}

function getMemberScheduleLabel(p) {
  if (!p) return '';
  const current = getMemberCurrentStatus(p);
  const next = getNextMemberStatusChange(p);
  if (current === 'active' && next?.type === 'dormant') return `휴면 예정: ${_ymToFirstDate(next.startYm)}`;
  if (current === 'dormant' && next?.type === 'active') return `복귀 예정: ${_ymToFirstDate(next.startYm)}`;
  if (current === 'inactive' && next?.type === 'active') return `재가입 예정: ${_ymToFirstDate(next.startYm)}`;
  if (current === 'dormant') return p.dormantAt ? `휴면 시작: ${p.dormantAt}` : '휴면 처리됨';
  return '';
}

function applyMemberStatusSchedules(shouldPush) {
  let changed = false;
  (players || []).forEach(p => {
    if (!p || p.isGuest) return;
    const effective = getMemberCurrentStatus(p);
    if (effective && p.status !== effective) {
      p.status = effective;
      if (effective === 'active') p.isFeeExempt = false;
      changed = true;
    }
  });
  if (changed && shouldPush && typeof pushDataOnly === 'function') pushDataOnly();
  return changed;
}

function _getLatestFeeRate() {
  const history = _ensureFeeRateHistory(monthlyFeeAmount);
  if (history.length === 0) return { startYm: _getCurrentYearMonth(), amount: monthlyFeeAmount || 0 };
  return history[history.length - 1];
}

function upsertMonthlyFeeRate(startYm, amount) {
  if (!/^\d{4}-\d{2}$/.test(String(startYm || ''))) return false;
  amount = parseInt(amount, 10) || 0;
  if (amount <= 0) return false;
  _ensureFeeRateHistory(monthlyFeeAmount);
  feeRateHistory = feeRateHistory.filter(r => r.startYm !== startYm);
  feeRateHistory.push({ startYm, amount });
  feeRateHistory = _normalizeFeeRateHistory(feeRateHistory, monthlyFeeAmount);
  monthlyFeeAmount = amount;
  return true;
}

function getMonthlyFeeAmountForMonth(yearStr, monthStr) {
  const targetYM = `${yearStr}-${String(monthStr).padStart(2, '0')}`;
  const history = _ensureFeeRateHistory(monthlyFeeAmount);
  let amount = 0;
  history.forEach(r => { if (r.startYm <= targetYM) amount = r.amount; });
  return amount;
}

function syncFeeToFinance() {
  financeData = financeData.filter(f => !f.auto);
  _ensureFeeRateHistory(monthlyFeeAmount);

  const cache = _getTreasurerCache();
  const year = cache.feeYear || String(new Date().getFullYear());

  for (let m = 1; m <= 12; m++) {
    const monthStr  = String(m).padStart(2, '0');
    const key       = `${year}-${monthStr}`;
    const yearlyKey = `${year}-yearly`;
    const monthFeeAmount = getMonthlyFeeAmountForMonth(year, monthStr);
    if (!monthFeeAmount) continue;
    let paidCount = 0;
    players.forEach(p => {
      if (!_isFeeEligibleForMonth(p, year, monthStr)) return;
      const pf = feeData[p.name] || {};
      if (pf[key] === 'Y' || pf[yearlyKey] === 'Y') paidCount++;
    });
    if (paidCount > 0) {
      financeData.push({
        id: `auto-fee-${key}`, type: 'income', date: `${key}-01`,
        desc: `${m}월 회비 (${paidCount}명 × ${monthFeeAmount.toLocaleString()}원)`, amount: paidCount * monthFeeAmount, auto: true
      });
    }
  }
}

function _getDormantMemberNamesForMonth(yearStr, monthStr) {
  const monthLastDay = new Date(parseInt(yearStr), parseInt(monthStr), 0).toISOString().slice(0, 10);
  return (players || [])
    .filter(p =>
      p &&
      !p.isGuest &&
      !p.isTreasurer &&
      (!p.joinedAt || p.joinedAt <= monthLastDay) &&
      getMemberStatusForMonth(p, yearStr, monthStr) === 'dormant'
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => displayName(p.name));
}

function _buildFeeSection(ym) {
  const [year, month] = ym.split('-');
  const key = `${year}-${month}`, yearlyKey = `${year}-yearly`;
  const monthLastDay = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10);
  const dormantNames = _getDormantMemberNamesForMonth(year, month);
  const members = players.filter(p =>
    _isFeeEligibleForMonth(p, year, month) &&
    (!p.joinedAt || p.joinedAt <= monthLastDay)
  ).sort((a, b) => a.name.localeCompare(b.name));

  const paid = [], partial = [], unpaid = [];
  members.forEach(p => {
    const pf = feeData[p.name] || {};
    const status = (pf[yearlyKey] === 'Y' || pf[key] === 'Y') ? 'Y' : (pf[key] === 'P' ? 'P' : 'N');
    if (status === 'Y') paid.push(displayName(p.name));
    else if (status === 'P') partial.push(displayName(p.name));
    else unpaid.push(displayName(p.name));
  });
  const paidCount = paid.length + partial.length;
  const rate = members.length > 0 ? Math.round(paidCount / members.length * 100) : 0;
  let txt = `💰 회비 납부 현황 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  txt += `납부율: ${paidCount}/${members.length}명 (${rate}%)\n`;
  txt += `🟡 휴면 회원 (${dormantNames.length}명): ${dormantNames.join(', ') || '없음'}\n`;
  txt += `✅ 납부 (${paid.length}명): ${paid.join(', ') || '없음'}\n`;
  txt += `🟡 부분납 (${partial.length}명): ${partial.join(', ') || '없음'}\n`;
  txt += `❌ 미납 (${unpaid.length}명): ${unpaid.join(', ') || '없음'}`;
  const monthFeeAmount = getMonthlyFeeAmountForMonth(year, month);
  if (monthFeeAmount) {
    txt += `\n💵 월회비: ${monthFeeAmount.toLocaleString()}원`;
    txt += `\n💵 자동 합산 납부액: ${(paid.length * monthFeeAmount).toLocaleString()}원`;
    if (partial.length > 0) txt += `\nℹ️ 부분납 금액은 재정관리 수입 항목에서 별도 반영`;
  }
  return txt;
}

function _buildFinanceSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const monthIncomes  = financeData.filter(f => f.type === 'income'  && (f.date||'').startsWith(prefix));
  const monthExpenses = financeData.filter(f => f.type === 'expense' && (f.date||'').startsWith(prefix));
  const totalIncome   = financeData.filter(f => f.type === 'income' ).reduce((s,f) => s + f.amount, 0);
  const totalExpense  = financeData.filter(f => f.type === 'expense').reduce((s,f) => s + f.amount, 0);
  const mIncome  = monthIncomes .reduce((s,f) => s + f.amount, 0);
  const mExpense = monthExpenses.reduce((s,f) => s + f.amount, 0);

  let txt = `💳 수입/지출 내역 (${parseInt(month)}월)\n━━━━━━━━━━\n📥 수입 내역\n`;
  if (monthIncomes.length === 0) { txt += `  (내역 없음)\n`; }
  else { monthIncomes.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(f => { txt += `  • ${(f.date||'').slice(5).replace('-','/')} ${f.desc} ${f.amount.toLocaleString()}원\n`; }); }
  txt += `소계: ${mIncome.toLocaleString()}원\n\n📤 지출 내역\n`;
  if (monthExpenses.length === 0) { txt += `  (내역 없음)\n`; }
  else { monthExpenses.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(f => { txt += `  • ${(f.date||'').slice(5).replace('-','/')} ${f.desc}${f.category ? ` [${f.category}]` : ''} ${f.amount.toLocaleString()}원\n`; }); }
  txt += `소계: ${mExpense.toLocaleString()}원\n`;
  txt += `💵 ${parseInt(month)}월 잔액: ${(mIncome-mExpense) >= 0 ? '+' : ''}${(mIncome-mExpense).toLocaleString()}원\n`;
  txt += `━━━━━━━━━━\n📊 누계 (전체)\n`;
  txt += `  총 수입: ${totalIncome.toLocaleString()}원\n  총 지출: ${totalExpense.toLocaleString()}원\n`;
  txt += `  총 잔액: ${(totalIncome-totalExpense) >= 0 ? '+' : ''}${(totalIncome-totalExpense).toLocaleString()}원`;
  return txt;
}

function _buildAttendanceSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const countMap = {};
  (matchLog || []).forEach(m => {
    if (!(m.date||'').startsWith(prefix)) return;
    [...(m.home||[]), ...(m.away||[])].forEach(name => {
      if (!countMap[name]) countMap[name] = new Set();
      countMap[name].add(m.date);
    });
  });
  const sorted = Object.entries(countMap)
    .map(([name, days]) => ({ name, days: days.size }))
    .filter(x => players.find(p => p.name === x.name && !p.isGuest && (!p.status || p.status === 'active')))
    .sort((a, b) => b.days - a.days);

  let txt = `🏃 출석 순위 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  if (sorted.length === 0) { txt += `(경기 기록 없음)`; return txt; }
  sorted.forEach((x, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    txt += `${medal} ${displayName(x.name)} ${x.days}회\n`;
  });
  return txt.trimEnd();
}

function _buildRiskSection(ym) {
  const [year, month] = ym.split('-').map(Number);
  const warnings = [];

  const threeMonthsAgo = new Date(year, month - 4, 1);
  const activeNames = new Set();
  const hasMatchInRange = (matchLog || []).some(m => new Date(m.date||'') >= threeMonthsAgo);
  if (hasMatchInRange) {
    (matchLog || []).forEach(m => {
      if (new Date(m.date||'') >= threeMonthsAgo)
        [...(m.home||[]), ...(m.away||[])].forEach(n => activeNames.add(n));
    });
    const inactive = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && !activeNames.has(p.name));
    if (inactive.length > 0) warnings.push(`😴 3개월 이상 미출석: ${inactive.map(p => displayName(p.name)).join(', ')}`);
  }

  const allFeeMonths = new Set();
  Object.values(feeData).forEach(pf => Object.keys(pf).forEach(k => { if (/^\d{4}-\d{2}$/.test(k) && pf[k] === 'Y') allFeeMonths.add(k); }));
  const checkMonths = [];
  for (let i = 0; i < 2; i++) {
    let m = month - 1 - i, y = year;
    if (m <= 0) { m += 12; y--; }
    const k = `${y}-${String(m).padStart(2,'0')}`;
    if (allFeeMonths.has(k)) checkMonths.push(k);
  }
  if (checkMonths.length > 0) {
    const longUnpaid = players.filter(p => {
      if (p.isGuest || p.isTreasurer || p.isFeeExempt) return false;
      if (p.status === 'inactive' || p.status === 'dormant') return false;
      const pf = feeData[p.name] || {};
      if (pf[`${year}-yearly`] === 'Y') return false;
      return checkMonths.every(k => pf[k] !== 'Y' && pf[k] !== 'P');
    });
    if (longUnpaid.length > 0) warnings.push(`💸 2개월 이상 미납: ${longUnpaid.map(p => displayName(p.name)).join(', ')}`);
  }

  return `⚠️ 운영 위험 감지\n━━━━━━━━━━\n${warnings.length === 0 ? '✅ 이상 없음' : warnings.join('\n')}`;
}

function _buildGamesSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const monthGames = (matchLog||[]).filter(m => (m.date||'').startsWith(prefix));
  const doubles = monthGames.filter(m => (m.type||'double') === 'double').length;
  const singles = monthGames.filter(m => m.type === 'single').length;
  const mixed   = monthGames.filter(m => m.type === 'mixed').length;
  let txt = `🎾 경기 현황 (${parseInt(month)}월)\n━━━━━━━━━━\n총 경기: ${monthGames.length}게임\n`;
  if (doubles > 0) txt += `  복식: ${doubles}게임\n`;
  if (singles > 0) txt += `  단식: ${singles}게임\n`;
  if (mixed   > 0) txt += `  혼복: ${mixed}게임`;
  return txt.trimEnd();
}

function _buildWinrateSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const statMap = {};
  (matchLog||[]).forEach(m => {
    if (!(m.date||'').startsWith(prefix)) return;
    const process = (names, isWin) => (names||[]).forEach(name => {
      if (!statMap[name]) statMap[name] = { w: 0, l: 0 };
      isWin ? statMap[name].w++ : statMap[name].l++;
    });
    process(m.home, m.winner === 'home');
    process(m.away, m.winner !== 'home');
  });
  const ranked = Object.entries(statMap)
    .map(([name, s]) => ({ name, w: s.w, l: s.l, rate: (s.w+s.l) > 0 ? s.w/(s.w+s.l) : 0 }))
    .filter(x => players.find(p => p.name === x.name && !p.isGuest && (!p.status || p.status === 'active')) && (x.w+x.l) >= 3)
    .sort((a, b) => b.rate - a.rate || b.w - a.w)
    .slice(0, 3);

  let txt = `🏆 승률 TOP 3 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  if (ranked.length === 0) { txt += `(3경기 이상 참여 선수 없음)`; return txt; }
  ranked.forEach((x, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    txt += `${medal} ${displayName(x.name)} ${Math.round(x.rate*100)}% (${x.w}승 ${x.l}패)\n`;
  });
  return txt.trimEnd();
}

function _buildExchangeSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const exGames = (matchLog||[]).filter(m => (m.date||'').startsWith(prefix) && m.exchangeId);
  if (exGames.length === 0) return `🤝 교류전 결과 (${parseInt(month)}월)\n━━━━━━━━━━\n(교류전 없음)`;

  const groups = {};
  exGames.forEach(m => {
    const eid = m.exchangeId;
    if (!groups[eid]) groups[eid] = { clubBName: m.clubBName || '상대 클럽', winsA: 0, winsB: 0 };
    if (m.clubSideHome === 'A') { m.winner === 'home' ? groups[eid].winsA++ : groups[eid].winsB++; }
    else                        { m.winner === 'away' ? groups[eid].winsA++ : groups[eid].winsB++; }
  });

  const clubName = currentClub?.clubName || '우리 클럽';
  let txt = `🤝 교류전 결과 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  Object.values(groups).forEach(g => {
    const result = g.winsA > g.winsB ? '🏆 승' : g.winsA < g.winsB ? '😢 패' : '🤝 무';
    txt += `vs ${g.clubBName} ${result}\n${clubName} ${g.winsA}승 : ${g.winsB}승 ${g.clubBName}\n`;
  });
  return txt.trimEnd();
}

// window 전역 등록
window.makeOneTimePlayerObj = makeOneTimePlayerObj;
window.syncFeeToFinance = syncFeeToFinance;
window._isFeeEligibleForMonth = _isFeeEligibleForMonth;
window._getDormantMemberNamesForMonth = _getDormantMemberNamesForMonth;
window._buildFeeSection = _buildFeeSection;
window._buildFinanceSection = _buildFinanceSection;
window._buildAttendanceSection = _buildAttendanceSection;
window._buildRiskSection = _buildRiskSection;
window._buildGamesSection = _buildGamesSection;
window._buildWinrateSection = _buildWinrateSection;
window._buildExchangeSection = _buildExchangeSection;
window._getTreasurerCache = _getTreasurerCache;
window.getMemberStatusForMonth = getMemberStatusForMonth;
window.getMemberCurrentStatus = getMemberCurrentStatus;
window.getNextMemberStatusChange = getNextMemberStatusChange;
window.getMemberScheduleLabel = getMemberScheduleLabel;
window.upsertMemberStatusHistory = upsertMemberStatusHistory;
window.applyMemberStatusSchedules = applyMemberStatusSchedules;
window._addMonthsToYm = _addMonthsToYm;
window._ymToFirstDate = _ymToFirstDate;
