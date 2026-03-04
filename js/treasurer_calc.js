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

function syncFeeToFinance() {
  financeData = financeData.filter(f => !f.auto);
  if (!monthlyFeeAmount) return;

  const cache = _getTreasurerCache();
  const year = cache.feeYear || String(new Date().getFullYear());
  const nonTreasurerNames = new Set(
    players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt &&
                        (!p.status || p.status === 'active' || p.status === 'dormant'))
           .map(p => p.name)
  );

  for (let m = 1; m <= 12; m++) {
    const key       = `${year}-${String(m).padStart(2, '0')}`;
    const yearlyKey = `${year}-yearly`;
    let paidCount = 0;
    Object.entries(feeData).forEach(([name, pf]) => {
      if (!nonTreasurerNames.has(name)) return;
      if (pf[key] === 'Y' || pf[yearlyKey] === 'Y') paidCount++;
    });
    if (paidCount > 0) {
      financeData.push({
        id: `auto-fee-${key}`, type: 'income', date: `${key}-01`,
        desc: `${m}월 회비 (${paidCount}명)`, amount: paidCount * monthlyFeeAmount, auto: true
      });
    }
  }
}

function _buildFeeSection(ym) {
  const [year, month] = ym.split('-');
  const key = `${year}-${month}`, yearlyKey = `${year}-yearly`;
  const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt &&
                                       (!p.status || p.status === 'active' || p.status === 'dormant'))
                         .sort((a, b) => a.name.localeCompare(b.name));
  const paid = [], unpaid = [];
  members.forEach(p => {
    const pf = feeData[p.name] || {};
    (pf[key] === 'Y' || pf[yearlyKey] === 'Y') ? paid.push(displayName(p.name)) : unpaid.push(displayName(p.name));
  });
  const rate = members.length > 0 ? Math.round(paid.length / members.length * 100) : 0;
  let txt = `💰 회비 납부 현황 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  txt += `납부율: ${paid.length}/${members.length}명 (${rate}%)\n`;
  txt += `✅ 납부 (${paid.length}명): ${paid.join(', ') || '없음'}\n`;
  txt += `❌ 미납 (${unpaid.length}명): ${unpaid.join(', ') || '없음'}`;
  if (monthlyFeeAmount) txt += `\n💵 납부액: ${(paid.length * monthlyFeeAmount).toLocaleString()}원`;
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
      return checkMonths.every(k => pf[k] !== 'Y');
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
window._buildFeeSection = _buildFeeSection;
window._buildFinanceSection = _buildFinanceSection;
window._buildAttendanceSection = _buildAttendanceSection;
window._buildRiskSection = _buildRiskSection;
window._buildGamesSection = _buildGamesSection;
window._buildWinrateSection = _buildWinrateSection;
window._buildExchangeSection = _buildExchangeSection;
window._getTreasurerCache = _getTreasurerCache;
