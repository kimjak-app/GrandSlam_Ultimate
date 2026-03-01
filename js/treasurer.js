// ========================================
// v3.81: TREASURER MODE (총무 모드)
// ========================================

function makeOneTimePlayerObj(name) {
  return {
    name, isGuest: true, isOneTime: true, score: 0, wins: 0, losses: 0,
    dScore: 0, dWins: 0, dLosses: 0, sScore: 0, sWins: 0, sLosses: 0,
    last: 0, lastD: 0, lastS: 0, weekly: 0, wWins: 0, wLosses: 0,
    wdScore: 0, wsScore: 0, wdWins: 0, wdLosses: 0, wsWins: 0, wsLosses: 0, lastW: 0, lastWD: 0, lastWS: 0
  };
}

function addOneTimePlayer() {
  // ✅ v4.91: 휴면 회원 추천 포함, 탈퇴 회원 게스트 허용
  const suggestions = players
    .filter(p => !p.isGuest && p.status !== 'inactive')
    .map(p => p.name);

  gsEditName('', name => {
    name = (name || '').trim();
    if (!name) return;
    if (oneTimePlayers.includes(name)) { gsAlert('이미 있는 이름이에요!'); return; }

    const existing = players.find(p => p.name === name);
    if (existing) {
      if (!existing.status || existing.status === 'active') {
        gsAlert('이미 정식 회원이에요! 풀에서 직접 선택해주세요.'); return;
      }
      if (existing.status === 'dormant') {
        // ✅ v4.91: 휴면 회원 — 정식 회원 객체로 처리, 기록 정식 반영
        oneTimePlayers.push(name);
        renderPool(); initTournament(); renderLadderPlayerPool();
        try { initRoundPlayerPool(); } catch (e) { }
        gsAlert(`💤 ${name} (휴면) 회원을 당일 참여자로 추가했어요.\n경기 기록은 정식 회원 기록에 반영됩니다.`);
        return;
      }
      if (existing.status === 'inactive') {
        // ✅ v4.91: 탈퇴 회원 — 게스트로 참여 허용 (B안: 게스트 참여 기록만 반영)
        // oneTimePlayers에 추가하되 isGuest:true 임시 객체를 players에 주입
        if (!players.find(p => p.name === name && p.isGuest)) {
          players.push({ name, isGuest: true, gender: existing.gender || 'M', score: 0, wins: 0, losses: 0, _exMember: true });
        }
        oneTimePlayers.push(name);
        renderPool(); initTournament(); renderLadderPlayerPool();
        try { initRoundPlayerPool(); } catch (e) { }
        gsAlert(`🚪 ${name} (탈퇴) 회원을 당일 게스트로 추가했어요.\n게스트 참여 기록만 반영됩니다.`);
        return;
      }
    }

    // 순수 외부 게스트
    oneTimePlayers.push(name);
    renderPool(); initTournament(); renderLadderPlayerPool();
    try { initRoundPlayerPool(); } catch (e) { }
  }, { title: '당일 참여자 추가', placeholder: '이름을 입력하세요', suggestions });
}
function removeOneTimePlayer(name) {
  oneTimePlayers = oneTimePlayers.filter(n => n !== name);
  // 각 게임 선택 배열에서도 제거
  hT = hT.filter(n => n !== name);
  aT = aT.filter(n => n !== name);
  ldP = ldP.filter(n => n !== name);
  selected = selected.filter(n => n !== name);
  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');
  renderPool(); initTournament(); renderLadderPlayerPool();
  try { initRoundPlayerPool(); } catch (e) { }
}

// ========================================

async function enterTreasurer() {
  // ✅ v4.88: 미승인 클럽 총무 기능 잠금
  const clubId = typeof getActiveClubId === 'function' ? getActiveClubId() : null;
  if (clubId) {
    try {
      const doc = await _db.collection('clubs').doc(clubId).get();
      const info = doc.exists ? doc.data() : {};
      if (info.approved !== true) {
        const email = typeof getContactEmail === 'function' ? await getContactEmail() : 'oropa@kakao.com';
        gsAlert(`🔒 총무 기능은 승인된 클럽에서만 사용할 수 있습니다.\n\n총괄 관리자에게 승인을 요청하세요.\n📧 ${email}`);
        return;
      }
    } catch (e) { console.warn('[treasurer] approved check error:', e); }
  }
  showView('treasurer');
}

function resetTreasurerView() {
  if (treasurerUnlocked) {
    showTreasurerMenu();
  } else {
    $('treasurer-pin-screen').style.display = 'block';
    $('treasurer-main').style.display = 'none';
    hideTreasurerSections();
    $('treasurerPinInput').value = '';
    setTimeout(() => $('treasurerPinInput').focus(), 100);
  }
}

function verifyTreasurerPin() {
  const pin = $('treasurerPinInput').value;
  if (pin && (pin === ADMIN_PIN || (MASTER_PIN && pin === MASTER_PIN))) {
    treasurerUnlocked = true;
    showTreasurerMenu();
  } else {
    gsAlert('비밀번호가 틀렸습니다.');
    $('treasurerPinInput').value = '';
    $('treasurerPinInput').focus();
  }
}

function showTreasurerMenu() {
  $('treasurer-pin-screen').style.display = 'none';
  $('treasurer-main').style.display = 'block';
  hideTreasurerSections();
  // ✅ v4.032: 회비 면제 설정 등 변경사항 저장
  pushDataOnly();
}

function hideTreasurerSections() {
  ['treasurer-fee', 'treasurer-finance', 'treasurer-court-mgmt', 'treasurer-notice-mgmt', 'treasurer-report', 'treasurer-member-history', 'treasurer-record-reset'].forEach(id => { // ✅ v4.921
    const el = $(id);
    if (el) el.style.display = 'none';
  });
}

function showTreasurerSection(section) {
  $('treasurer-main').style.display = 'none';
  hideTreasurerSections();
  const el = $('treasurer-' + section);
  if (el) el.style.display = 'block';

  if (section === 'fee') { initFeeTable(); renderTreasurerPicker(); renderFeeExemptPicker(); }
  if (section === 'finance') { initFinance(); }
  if (section === 'court-mgmt') { loadCourtPresets(); renderCourtNoticeList(); }
  if (section === 'notice-mgmt') { renderAnnouncementMgmtList(); }
}

// ========================================
// 회비 납부 현황
// ========================================

function initFeeTable() {
  const sel = $('feeYear');
  const curYear = new Date().getFullYear();
  sel.innerHTML = '';
  for (let y = curYear; y >= curYear - 2; y--) {
    sel.innerHTML += `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}년</option>`;
  }
  // ✅ v3.83: GAS에서 회비 데이터 로드 (localStorage는 fallback)
  fetchFeeData().then(() => {
    $('monthlyFeeAmount').value = monthlyFeeAmount || '';
    syncFeeToFinance();
    renderFeeTable();
  });
}

function saveMonthlyFee() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => saveMonthlyFee()); return; }
  monthlyFeeAmount = parseInt($('monthlyFeeAmount').value) || 0;
  localStorage.setItem('grandslam_monthly_fee_' + getActiveClubId(), monthlyFeeAmount);
  syncFeeToFinance(); // 재정 연동 재계산
  // ✅ v3.83: GAS에도 저장
  pushFeeData();
}

function renderFeeTable() {
  const year = $('feeYear').value;
  const curMonth = new Date().getMonth() + 1;
  const curYear = new Date().getFullYear();
  // ✅ v4.79: 탈퇴 회원 회비 테이블 제외
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active' || p.status === 'dormant')).sort((a, b) => a.name.localeCompare(b.name));

  // ✅ v3.949: 납부율 요약 — 총무 제외한 현재 월 납부 현황
  const summaryEl = $('feeSummary');
  if (summaryEl) {
    const key = `${year}-${String(curMonth).padStart(2, '0')}`;
    const targets = members.filter(p => !p.isTreasurer && !p.isFeeExempt);
    // ✅ v3.9491: 연납자(yearly='Y')도 납부로 집계
    const yearlyKey = `${year}-yearly`;
    const paidCount = targets.filter(p => {
      const pf = feeData[p.name] || {};
      return pf[key] === 'Y' || pf[yearlyKey] === 'Y';
    }).length;
    summaryEl.textContent = `📊 ${curMonth}월 납부 현황: ${paidCount}/${targets.length}명`;
  }

  let headHtml = '<tr><th>회원</th>';
  for (let m = 1; m <= 12; m++) {
    const isCur = (parseInt(year) === curYear && m === curMonth);
    headHtml += `<th class="${isCur ? 'fee-current-month' : ''}">${m}월</th>`;
  }
  headHtml += '</tr>';
  $('feeHead').innerHTML = headHtml;

  let bodyHtml = '';
  members.forEach(p => {
    const pFee = feeData[p.name] || {};

    // ✅ v3.949: 총무 면제 행 — 체크 불가, "면제" 표시
    if (p.isTreasurer) {
      bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))} <span style="font-size:10px; color:var(--wimbledon-sage);">[총무]</span></td>`;
      for (let m = 1; m <= 12; m++) {
        const isCur = (parseInt(year) === curYear && m === curMonth);
        bodyHtml += `<td class="fee-check${isCur ? ' fee-current-month' : ''}" style="color:var(--wimbledon-sage); font-size:11px;">면제</td>`;
      }
      bodyHtml += '</tr>';
      return;
    }

    // ✅ v4.032: 회비 면제 행 — 체크 불가, "면제" 표시
    if (p.isFeeExempt) {
      bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))} <span style="font-size:10px; color:#FF9500;">[면제]</span></td>`;
      for (let m = 1; m <= 12; m++) {
        const isCur = (parseInt(year) === curYear && m === curMonth);
        bodyHtml += `<td class="fee-check${isCur ? ' fee-current-month' : ''}" style="color:#FF9500; font-size:11px;">면제</td>`;
      }
      bodyHtml += '</tr>';
      return;
    }

    // ✅ v3.949: 연납 자동 체크 — yearly 키가 'Y'면 전월 자동 완료 표시
    const isYearly = pFee[`${year}-yearly`] === 'Y';

    const yearlyBtnStyle = isYearly
      ? 'font-size:10px; color:#fff; background:var(--wimbledon-sage); border:none; border-radius:8px; padding:1px 5px; margin-left:3px; cursor:pointer;'
      : 'font-size:10px; color:var(--wimbledon-sage); background:none; border:1px solid var(--wimbledon-sage); border-radius:8px; padding:1px 5px; margin-left:3px; cursor:pointer;';
    bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))}<button style="${yearlyBtnStyle}" onclick="toggleYearlyFee('${escapeHtml(p.name).replace(/'/g, "&#39;")}')">${isYearly ? '연납✓' : '연납'}</button></td>`;
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      const paid = isYearly || pFee[key] === 'Y';
      const isCur = (parseInt(year) === curYear && m === curMonth);
      const cellClass = (!paid ? ' fee-unpaid' : '') + (isCur ? ' fee-current-month' : '');
      const autoStyle = isYearly ? ' opacity:0.75;' : '';
      const clickHandler = isYearly ? '' : `onclick="toggleFee('${escapeHtml(p.name)}','${key}')"`;
      bodyHtml += `<td class="fee-check${cellClass}" style="${autoStyle}" ${clickHandler}>${paid ? '✅' : '❌'}</td>`;
    }
    bodyHtml += '</tr>';
  });
  $('feeBody').innerHTML = bodyHtml;
}

function toggleFee(name, key) {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => toggleFee(name, key)); return; }
  if (!feeData[name]) feeData[name] = {};
  feeData[name][key] = (feeData[name][key] === 'Y') ? 'N' : 'Y';
  // ✅ v3.816: 변경 즉시 localStorage에 저장 (clubId 있을 때만)
  const cid = getActiveClubId();
  if (cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
  renderFeeTable();
  syncFeeToFinance();
  // ✅ v3.83: GAS에도 저장
  pushFeeData();
}

// ✅ 완납/해제 버튼 (연/월)
function feeSetAll(value, scope) {
  const year = $('feeYear').value;
  const curMonth = new Date().getMonth() + 1;
  // ✅ v3.949: 총무 제외
  // ✅ v4.032: 회비 면제 회원도 제외
  // ✅ v4.81: 탈퇴 회원 제외
  const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt && (!p.status || p.status === 'active' || p.status === 'dormant'));

  if (scope === 'year') {
    // 1~12월 전체
    members.forEach(p => {
      if (!feeData[p.name]) feeData[p.name] = {};
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2, '0')}`;
        feeData[p.name][key] = value;
      }
    });
  } else {
    // 현재 월만
    const key = `${year}-${String(curMonth).padStart(2, '0')}`;
    members.forEach(p => {
      if (!feeData[p.name]) feeData[p.name] = {};
      feeData[p.name][key] = value;
    });
  }
  renderFeeTable();
  syncFeeToFinance();
  // ✅ v3.816: 완납/해제 후 localStorage 저장 (clubId 있을 때만)
  const cid = getActiveClubId();
  if (cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
  // ✅ v3.83: GAS에도 저장
  pushFeeData();
}

// ✅ 회비 → 재정 수입 자동 연동
function syncFeeToFinance() {
  // 기존 자동 항목 제거
  financeData = financeData.filter(f => !f.auto);

  if (!monthlyFeeAmount) return;

  // ✅ v3.819: feeYear가 숨겨진 화면(재정관리)에서도 올바른 연도 사용
  const feeYearEl = $('feeYear');
  const year = (feeYearEl && feeYearEl.value) ? feeYearEl.value : String(new Date().getFullYear());

  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    let paidCount = 0;
    // ✅ v3.949: 총무 제외하여 납부 인원 계산
    // ✅ v4.032: 회비 면제 회원도 제외
    // ✅ v4.82: 탈퇴 회원 자동 재정 집계 제외
    const nonTreasurerNames = new Set(players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt && (!p.status || p.status === 'active' || p.status === 'dormant')).map(p => p.name));
    Object.entries(feeData).forEach(([name, pf]) => {
      if (!nonTreasurerNames.has(name)) return;
      // ✅ v3.9491: 연납자(yearly='Y')도 납부로 집계
      const yearlyKey = `${year}-yearly`;
      if (pf[key] === 'Y' || pf[yearlyKey] === 'Y') paidCount++;
    });
    if (paidCount > 0) {
      financeData.push({
        id: `auto-fee-${key}`,
        type: 'income',
        date: `${key}-01`,
        desc: `${m}월 회비 (${paidCount}명)`,
        amount: paidCount * monthlyFeeAmount,
        auto: true
      });
    }
  }
}

function copyFeeStatus() {
  const year = $('feeYear').value;
  const curMonth = new Date().getMonth() + 1;
  const key = `${year}-${String(curMonth).padStart(2, '0')}`;
  // ✅ v3.949: 총무 제외
  // ✅ v4.032: 회비 면제 회원도 제외
  // ✅ v4.81: 탈퇴 회원 제외
  const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt && (!p.status || p.status === 'active' || p.status === 'dormant')).sort((a, b) => a.name.localeCompare(b.name));

  const paid = [];
  const unpaid = [];
  members.forEach(p => {
    const pFee = feeData[p.name] || {};
    // ✅ v3.9491: 연납자(yearly='Y')도 납부로 표시
    const yearlyKey = `${year}-yearly`;
    if (pFee[key] === 'Y' || pFee[yearlyKey] === 'Y') paid.push(displayName(p.name));
    else unpaid.push(displayName(p.name));
  });

  let text = `📋 ${year}년 ${curMonth}월 회비 납부 현황\n`;
  text += `━━━━━━━━━━\n`;
  text += `✅ 납부 (${paid.length}명): ${paid.join(', ') || '없음'}\n`;
  text += `❌ 미납 (${unpaid.length}명): ${unpaid.join(', ') || '없음'}\n`;
  if (monthlyFeeAmount) {
    text += `━━━━━━━━━━\n`;
    text += `💰 월회비: ${monthlyFeeAmount.toLocaleString()}원\n`;
    text += `📥 납부액: ${(paid.length * monthlyFeeAmount).toLocaleString()}원`;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => gsAlert('📋 복사 완료! 카톡에 붙여넣기 하세요.'));
  } else { fallbackCopy(text); }
}


// ========================================
// 재정 관리
// ========================================

function initFinance() {
  const today = new Date().toISOString().slice(0, 10);
  $('finDate').value = today;
  $('finDesc').value = '';
  $('finAmount').value = '';
  // ✅ v3.83: GAS에서 회비 데이터 로드 (localStorage는 fallback)
  fetchFeeData().then(() => {
    syncFeeToFinance();
    setFinanceTab('income');
    renderFinanceList();
  });
}

function setFinanceTab(tab) {
  currentFinTab = tab;
  $('finTabIncome').classList.toggle('active', tab === 'income');
  $('finTabExpense').classList.toggle('active', tab === 'expense');
  // ✅ v3.949: 지출일 때만 카테고리 표시
  const catRow = $('finCategoryRow');
  if (catRow) catRow.style.display = tab === 'expense' ? 'flex' : 'none';
  renderFinanceList();
}

// ✅ v3.949: 총무 지정/해제
function toggleTreasurer(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  // 기존 총무 해제 후 새로 지정 (한 명만)
  players.forEach(x => { x.isTreasurer = false; });
  p.isTreasurer = true;
  pushDataOnly();
  renderTreasurerPicker();
  renderFeeTable();
  gsAlert(`${displayName(name)}님이 총무로 지정됐습니다.`);
}

function clearTreasurer() {
  players.forEach(x => { x.isTreasurer = false; });
  pushDataOnly();
  renderTreasurerPicker();
  renderFeeTable();
  gsAlert('총무 면제가 해제됐습니다.');
}

function renderTreasurerPicker() {
  const el = $('treasurerPickerArea');
  if (!el) return;
  const current = players.find(p => p.isTreasurer);
  const members = players.filter(p => !p.isGuest).sort((a, b) => a.name.localeCompare(b.name));
  let html = `<div style="margin-bottom:8px; font-size:13px; color:var(--text-gray);">현재 총무: <strong style="color:var(--wimbledon-sage);">${current ? escapeHtml(displayName(current.name)) : '없음'}</strong></div>`;
  html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
  members.forEach(p => {
    const isT = p.isTreasurer;
    html += `<button onclick="toggleTreasurer('${escapeHtml(p.name).replace(/'/g, "&#39;")}')"
        style="padding:6px 12px; border-radius:20px; border:2px solid ${isT ? 'var(--wimbledon-sage)' : '#ddd'}; background:${isT ? 'var(--wimbledon-sage)' : '#fff'}; color:${isT ? '#fff' : 'var(--text-dark)'}; font-size:13px; cursor:pointer;">
        ${isT ? '✓ ' : ''}${escapeHtml(displayName(p.name))}
      </button>`;
  });
  html += `</div>`;
  if (current) {
    html += `<button onclick="clearTreasurer()" style="margin-top:8px; font-size:12px; color:var(--up-red); background:none; border:none; cursor:pointer;">✕ 총무 면제 해제</button>`;
  }
  el.innerHTML = html;
}

// ✅ v3.949: 연납 토글

// ✅ v4.032: 회비 면제 피커 렌더링
function renderFeeExemptPicker() {
  const el = $('feeExemptPickerArea');
  if (!el) return;
  const exempted = players.filter(p => !p.isGuest && p.isFeeExempt);
  const members = players.filter(p => !p.isGuest).sort((a, b) => a.name.localeCompare(b.name));
  let html = `<div style="margin-bottom:8px; font-size:13px; color:var(--text-gray);">면제 회원: <strong style="color:#FF9500;">${exempted.length > 0 ? exempted.map(p => escapeHtml(displayName(p.name))).join(', ') : '없음'}</strong></div>`;
  html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
  members.forEach(p => {
    const isE = !!p.isFeeExempt;
    const safeName = escapeHtml(p.name).replace(/'/g, "&#39;");
    html += `<button onclick="toggleFeeExempt('${safeName}')"
        style="padding:6px 12px; border-radius:20px; border:2px solid ${isE ? '#FF9500' : '#ddd'}; background:${isE ? '#FF9500' : '#fff'}; color:${isE ? '#fff' : 'var(--text-dark)'}; font-size:13px; cursor:pointer;">
        ${isE ? '&#10003; ' : ''}${escapeHtml(displayName(p.name))}
      </button>`;
  });
  html += `</div>`;
  if (exempted.length > 0) {
    html += `<button onclick="clearFeeExempt()" style="margin-top:8px; font-size:12px; color:var(--up-red); background:none; border:none; cursor:pointer;">&#10005; 전체 면제 해제</button>`;
  }
  el.innerHTML = html;
}

// ✅ v4.032: 회비 면제 토글
function toggleFeeExempt(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  p.isFeeExempt = !p.isFeeExempt;
  const cid = getActiveClubId();
  if (cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
  renderFeeExemptPicker();
  renderFeeTable();
  syncFeeToFinance();
}

// ✅ v4.032: 회비 면제 전체 해제
function clearFeeExempt() {
  players.forEach(x => { x.isFeeExempt = false; });
  pushDataOnly();
  renderFeeExemptPicker();
  renderFeeTable();
  syncFeeToFinance();
  gsAlert('회비 면제가 전체 해제됐습니다.');
}

function toggleYearlyFee(name) {
  const year = $('feeYear').value;
  const key = `${year}-yearly`;
  if (!feeData[name]) feeData[name] = {};
  feeData[name][key] = (feeData[name][key] === 'Y') ? 'N' : 'Y';
  const cid = getActiveClubId();
  if (cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
  renderFeeTable();
  syncFeeToFinance();
  pushFeeData();
}

function addFinanceItem() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => addFinanceItem()); return; }
  const date = $('finDate').value;
  const desc = $('finDesc').value.trim();
  const amount = parseInt($('finAmount').value);
  // ✅ v3.949: 지출 카테고리
  const catEl = $('finCategory');
  const category = (catEl && currentFinTab === 'expense') ? catEl.value : '';

  if (!desc) { gsAlert('내용을 입력하세요.'); return; }
  if (!amount || amount <= 0) { gsAlert('금액을 입력하세요.'); return; }

  financeData.push({
    id: Date.now().toString(),
    type: currentFinTab,
    date: date,
    desc: desc,
    amount: amount,
    category: category,
    auto: false
  });

  $('finDesc').value = '';
  $('finAmount').value = '';
  renderFinanceList();
}

function deleteFinanceItem(id) {
  gsConfirm('삭제할까요?', ok => {
    if (!ok) return;
    financeData = financeData.filter(f => f.id !== id);
    renderFinanceList();
  });
}

function renderFinanceList() {
  const filtered = financeData.filter(f => f.type === currentFinTab)
    .sort((a, b) => {
      // 자동 항목 위로
      if (a.auto && !b.auto) return -1;
      if (!a.auto && b.auto) return 1;
      return (b.date || '').localeCompare(a.date || '');
    });

  const area = $('financeListArea');
  if (filtered.length === 0) {
    area.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">${currentFinTab === 'income' ? '수입' : '지출'} 내역이 없습니다.</div>`;
  } else {
    area.innerHTML = filtered.map(f => {
      const dateShort = (f.date || '').slice(5).replace('-', '/');
      const amtClass = f.type === 'income' ? 'income' : 'expense';
      const prefix = f.type === 'income' ? '+' : '-';
      const autoStyle = f.auto ? 'opacity:0.7; background:rgba(93,156,118,0.06);' : '';
      const autoTag = f.auto ? '<span style="font-size:10px; color:var(--wimbledon-sage); margin-left:4px;">[자동]</span>' : '';
      // ✅ v3.949: 지출 카테고리 태그
      const catTag = (!f.auto && f.category) ? `<span style="font-size:10px; color:#888; margin-left:4px; background:#f0f0f0; padding:1px 5px; border-radius:8px;">${escapeHtml(f.category)}</span>` : '';
      const delBtn = f.auto ? '' : `<span class="material-symbols-outlined fi-del" onclick="deleteFinanceItem('${f.id}')">close</span>`;
      return `
          <div class="finance-item" style="${autoStyle}">
            <span class="fi-date">${dateShort}</span>
            <span class="fi-desc">${escapeHtml(f.desc)}${autoTag}${catTag}</span>
            <span class="fi-amount ${amtClass}">${prefix}${f.amount.toLocaleString()}원</span>
            ${delBtn}
          </div>
        `;
    }).join('');
  }

  // 합계 계산
  const totalIncome = financeData.filter(f => f.type === 'income').reduce((s, f) => s + f.amount, 0);
  const totalExpense = financeData.filter(f => f.type === 'expense').reduce((s, f) => s + f.amount, 0);
  const balance = totalIncome - totalExpense;

  $('fsTotalIncome').textContent = totalIncome.toLocaleString() + '원';
  $('fsTotalExpense').textContent = totalExpense.toLocaleString() + '원';
  $('fsBalance').textContent = balance.toLocaleString() + '원';
  $('fsBalance').style.color = balance >= 0 ? 'var(--wimbledon-sage)' : 'var(--up-red)';
}

function copyFinanceStatus() {
  const incomes = financeData.filter(f => f.type === 'income').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const expenses = financeData.filter(f => f.type === 'expense').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totalIncome = incomes.reduce((s, f) => s + f.amount, 0);
  const totalExpense = expenses.reduce((s, f) => s + f.amount, 0);
  const balance = totalIncome - totalExpense;

  let text = `💰 재정 현황\n━━━━━━━━━━\n`;

  if (incomes.length > 0) {
    text += `📥 수입\n`;
    incomes.forEach(f => {
      const dateShort = (f.date || '').slice(5).replace('-', '/');
      const tag = f.auto ? ' [자동]' : '';
      text += `• ${dateShort} ${f.desc}${tag} ${f.amount.toLocaleString()}원\n`;
    });
    text += `소계: ${totalIncome.toLocaleString()}원\n\n`;
  }

  if (expenses.length > 0) {
    text += `📤 지출\n`;
    expenses.forEach(f => {
      const dateShort = (f.date || '').slice(5).replace('-', '/');
      // ✅ v3.949: 카테고리 표시
      const catStr = f.category ? ` [${f.category}]` : '';
      text += `• ${dateShort} ${f.desc}${catStr} ${f.amount.toLocaleString()}원\n`;
    });
    text += `소계: ${totalExpense.toLocaleString()}원\n\n`;
  }

  text += `━━━━━━━━━━\n`;
  text += `💵 잔액: ${balance.toLocaleString()}원`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => gsAlert('📋 복사 완료! 카톡에 붙여넣기 하세요.'));
  } else { fallbackCopy(text); }
}


// ========================================
// ✅ v4.47: 재정 데이터 자동 저장 트리거
// addFinanceItem / deleteFinanceItem 이후 호출
// 기존 함수 무수정 — 오버라이드 방식
// ========================================

// 기존 addFinanceItem을 감싸는 래퍼
const _origAddFinanceItem = addFinanceItem;
window.addFinanceItem = function() {
  _origAddFinanceItem();
  // 저장은 비동기지만 UI 블로킹 없이 백그라운드로
  setTimeout(() => pushFinanceData(), 0);
};

// 기존 deleteFinanceItem을 감싸는 래퍼
const _origDeleteFinanceItem = deleteFinanceItem;
window.deleteFinanceItem = function(id) {
  _origDeleteFinanceItem(id);
  setTimeout(() => pushFinanceData(), 300); // confirm 콜백 이후 저장
};

// ✅ 재정 데이터 전체 초기화
function confirmClearFinanceData() {
  gsConfirm('⚠️ 재정 데이터를 전체 삭제할까요?\n\n수입/지출 내역이 모두 사라집니다.\n이 작업은 되돌릴 수 없습니다.', async (ok) => {
    if (!ok) return;
    await clearFinanceData();
    syncFeeToFinance();
    renderFinanceList();
    gsAlert('✅ 재정 데이터가 초기화되었습니다.');
  });
}

// ✅ v4.47: showTreasurerSection 'finance' 진입 시 fetchFinanceData 선행 호출
// initFinance 내부 수정 없이, showTreasurerSection 오버라이드로 처리
const _origShowTreasurerSection = showTreasurerSection;
window.showTreasurerSection = function(section) {
  if (section === 'finance') {
    fetchFinanceData().then(() => {
      _origShowTreasurerSection(section);
    });
  } else if (section === 'report') {
    _origShowTreasurerSection(section);
    // 이번 달로 기본 설정
    const el = document.getElementById('reportMonth');
    if (el && !el.value) el.value = new Date().toISOString().slice(0, 7);
    initReportSettings();
  } else if (section === 'member-history') {
    _origShowTreasurerSection(section);
    window._memberHistoryTab = 'active';
    renderMemberHistoryTabs('active');
  } else {
    _origShowTreasurerSection(section);
  }
};

// ========================================
// ✅ v4.76: 월간 운영 리포트
// ========================================

// 리포트 체크박스 설정 저장/불러오기
function saveReportSettings() {
  const settings = {
    fee:        !!document.getElementById('rpt-fee')?.checked,
    finance:    !!document.getElementById('rpt-finance')?.checked,
    attendance: !!document.getElementById('rpt-attendance')?.checked,
    risk:       !!document.getElementById('rpt-risk')?.checked,
    games:      !!document.getElementById('rpt-games')?.checked,
    winrate:    !!document.getElementById('rpt-winrate')?.checked,
    exchange:   !!document.getElementById('rpt-exchange')?.checked,
  };
  try { localStorage.setItem('grandslam_report_settings_' + getActiveClubId(), JSON.stringify(settings)); } catch(e) {}
}

function loadReportSettings() {
  try {
    const saved = localStorage.getItem('grandslam_report_settings_' + getActiveClubId());
    return saved ? JSON.parse(saved) : null;
  } catch(e) { return null; }
}

function initReportSettings() {
  const saved = loadReportSettings();
  // 저장값 없으면 기본값: 전부 체크
  const defaults = { fee: true, finance: true, attendance: true, risk: true, games: true, winrate: true, exchange: true };
  const cfg = saved || defaults;
  ['fee','finance','attendance','risk','games','winrate','exchange'].forEach(key => {
    const el = document.getElementById('rpt-' + key);
    if (el) el.checked = !!cfg[key];
  });
}

// ── 리포트 데이터 계산 함수들 ──────────────────

function _getReportMonth() {
  const sel = document.getElementById('reportMonth');
  return sel ? sel.value : new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

// 💰 회비 납부 현황
function _buildFeeSection(ym) {
  const [year, month] = ym.split('-');
  const key = `${year}-${month}`;
  const yearlyKey = `${year}-yearly`;
  // ✅ v4.81: 탈퇴 회원 제외
  const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt && (!p.status || p.status === 'active' || p.status === 'dormant'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const paid = [], unpaid = [];
  members.forEach(p => {
    const pf = feeData[p.name] || {};
    (pf[key] === 'Y' || pf[yearlyKey] === 'Y') ? paid.push(displayName(p.name)) : unpaid.push(displayName(p.name));
  });
  const total = members.length;
  const rate = total > 0 ? Math.round(paid.length / total * 100) : 0;
  let txt = `💰 회비 납부 현황 (${parseInt(month)}월)\n`;
  txt += `━━━━━━━━━━\n`;
  txt += `납부율: ${paid.length}/${total}명 (${rate}%)\n`;
  txt += `✅ 납부 (${paid.length}명): ${paid.join(', ') || '없음'}\n`;
  txt += `❌ 미납 (${unpaid.length}명): ${unpaid.join(', ') || '없음'}`;
  if (monthlyFeeAmount) txt += `\n💵 납부액: ${(paid.length * monthlyFeeAmount).toLocaleString()}원`;
  return txt;
}

// 💰 수입/지출 내역
function _buildFinanceSection(ym) {
  const prefix = ym + '-'; // 'YYYY-MM-'
  const monthIncomes  = financeData.filter(f => f.type === 'income'  && (f.date || '').startsWith(prefix));
  const monthExpenses = financeData.filter(f => f.type === 'expense' && (f.date || '').startsWith(prefix));
  const totalIncome   = financeData.filter(f => f.type === 'income' ).reduce((s,f) => s + f.amount, 0);
  const totalExpense  = financeData.filter(f => f.type === 'expense').reduce((s,f) => s + f.amount, 0);
  const mIncome  = monthIncomes .reduce((s,f) => s + f.amount, 0);
  const mExpense = monthExpenses.reduce((s,f) => s + f.amount, 0);
  const [, month] = ym.split('-');

  let txt = `💳 수입/지출 내역 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  txt += `📥 수입 내역\n`;
  if (monthIncomes.length === 0) { txt += `  (내역 없음)\n`; }
  else { monthIncomes.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(f => { txt += `  • ${(f.date||'').slice(5).replace('-','/')} ${f.desc} ${f.amount.toLocaleString()}원\n`; }); }
  txt += `소계: ${mIncome.toLocaleString()}원\n\n`;
  txt += `📤 지출 내역\n`;
  if (monthExpenses.length === 0) { txt += `  (내역 없음)\n`; }
  else { monthExpenses.sort((a,b)=>(a.date||'').localeCompare(b.date||'')).forEach(f => { const cat = f.category ? ` [${f.category}]` : ''; txt += `  • ${(f.date||'').slice(5).replace('-','/')} ${f.desc}${cat} ${f.amount.toLocaleString()}원\n`; }); }
  txt += `소계: ${mExpense.toLocaleString()}원\n`;
  txt += `💵 ${parseInt(month)}월 잔액: ${(mIncome - mExpense) >= 0 ? '+' : ''}${(mIncome - mExpense).toLocaleString()}원\n`;
  txt += `━━━━━━━━━━\n`;
  txt += `📊 누계 (전체)\n`;
  txt += `  총 수입: ${totalIncome.toLocaleString()}원\n`;
  txt += `  총 지출: ${totalExpense.toLocaleString()}원\n`;
  txt += `  총 잔액: ${(totalIncome - totalExpense) >= 0 ? '+' : ''}${(totalIncome - totalExpense).toLocaleString()}원`;
  return txt;
}

// 🏢 출석 순위
function _buildAttendanceSection(ym) {
  const prefix = ym + '-';
  const countMap = {};
  (matchLog || []).forEach(m => {
    if (!(m.date || '').startsWith(prefix)) return;
    const allNames = [...(m.home || []), ...(m.away || [])];
    allNames.forEach(name => {
      if (!countMap[name]) countMap[name] = new Set();
      countMap[name].add(m.date); // 날짜 기준 중복 제거
    });
  });
  const [, month] = ym.split('-');
  const sorted = Object.entries(countMap)
    .map(([name, days]) => ({ name, days: days.size }))
    // ✅ v4.81: 탈퇴 회원 제외
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

// ⚠️ 운영 위험 감지
function _buildRiskSection(ym) {
  const [year, month] = ym.split('-').map(Number);
  const warnings = [];

  // ✅ v4.92: 실제 데이터가 있는 달만 체크 (클럽 창설 전 달 제외)

  // 미출석: matchLog에 기록 있는 달만 유효한 달로 간주
  const threeMonthsAgo = new Date(year, month - 4, 1);
  const activeNames = new Set();
  const hasMatchInRange = (matchLog || []).some(m => new Date(m.date || '') >= threeMonthsAgo);
  if (hasMatchInRange) {
    (matchLog || []).forEach(m => {
      const d = new Date(m.date || '');
      if (d >= threeMonthsAgo) {
        [...(m.home||[]), ...(m.away||[])].forEach(n => activeNames.add(n));
      }
    });
    // ✅ v4.79: 탈퇴/휴면 회원 미출석 경고 제외
    const inactive = players.filter(p => !p.isGuest && (!p.status || p.status === 'active') && !activeNames.has(p.name));
    if (inactive.length > 0) warnings.push(`😴 3개월 이상 미출석: ${inactive.map(p => displayName(p.name)).join(', ')}`);
  }

  // 미납: feeData에 누군가 납부 기록이 있는 달만 유효한 달로 간주
  const allFeeMonths = new Set();
  Object.values(feeData).forEach(pf => Object.keys(pf).forEach(k => { if (/^\d{4}-\d{2}$/.test(k) && pf[k] === 'Y') allFeeMonths.add(k); }));
  const checkMonths = [];
  for (let i = 0; i < 2; i++) {
    let m = month - 1 - i, y = year;
    if (m <= 0) { m += 12; y--; }
    const k = `${y}-${String(m).padStart(2,'0')}`;
    if (allFeeMonths.has(k)) checkMonths.push(k); // 실제 데이터 있는 달만 추가
  }
  if (checkMonths.length > 0) {
    const longUnpaid = players.filter(p => {
      // ✅ v4.79: 탈퇴/휴면 회원 미납 경고 제외
      if (p.isGuest || p.isTreasurer || p.isFeeExempt) return false;
      if (p.status === 'inactive' || p.status === 'dormant') return false;
      const pf = feeData[p.name] || {};
      const yearlyKey = `${year}-yearly`;
      if (pf[yearlyKey] === 'Y') return false;
      return checkMonths.every(k => pf[k] !== 'Y');
    });
    if (longUnpaid.length > 0) warnings.push(`💸 2개월 이상 미납: ${longUnpaid.map(p => displayName(p.name)).join(', ')}`);
  }

  let txt = `⚠️ 운영 위험 감지\n━━━━━━━━━━\n`;
  txt += warnings.length === 0 ? `✅ 이상 없음` : warnings.join('\n');
  return txt;
}

// 🎾 이달 총 경기 수
function _buildGamesSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const monthGames = (matchLog || []).filter(m => (m.date || '').startsWith(prefix));
  const doubles = monthGames.filter(m => (m.type || 'double') === 'double').length;
  const singles = monthGames.filter(m => m.type === 'single').length;
  const mixed   = monthGames.filter(m => m.type === 'mixed').length;
  let txt = `🎾 경기 현황 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  txt += `총 경기: ${monthGames.length}게임\n`;
  if (doubles > 0) txt += `  복식: ${doubles}게임\n`;
  if (singles > 0) txt += `  단식: ${singles}게임\n`;
  if (mixed   > 0) txt += `  혼복: ${mixed}게임`;
  return txt.trimEnd();
}

// 🏆 승률 TOP 3
function _buildWinrateSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  const statMap = {};
  (matchLog || []).forEach(m => {
    if (!(m.date || '').startsWith(prefix)) return;
    const homeWin = m.winner === 'home';
    const process = (names, isWin) => (names || []).forEach(name => {
      if (!statMap[name]) statMap[name] = { w: 0, l: 0 };
      isWin ? statMap[name].w++ : statMap[name].l++;
    });
    process(m.home, homeWin);
    process(m.away, !homeWin);
  });
  const ranked = Object.entries(statMap)
    .map(([name, s]) => ({ name, w: s.w, l: s.l, rate: (s.w + s.l) > 0 ? s.w / (s.w + s.l) : 0 }))
    // ✅ v4.81: 탈퇴 회원 제외
    .filter(x => players.find(p => p.name === x.name && !p.isGuest && (!p.status || p.status === 'active')) && (x.w + x.l) >= 3)
    .sort((a, b) => b.rate - a.rate || b.w - a.w)
    .slice(0, 3);

  let txt = `🏆 승률 TOP 3 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  if (ranked.length === 0) { txt += `(3경기 이상 참여 선수 없음)`; return txt; }
  ranked.forEach((x, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const pct = Math.round(x.rate * 100);
    txt += `${medal} ${displayName(x.name)} ${pct}% (${x.w}승 ${x.l}패)\n`;
  });
  return txt.trimEnd();
}

// 🤝 교류전 결과
function _buildExchangeSection(ym) {
  const prefix = ym + '-';
  const [, month] = ym.split('-');
  // exchanges는 백업/Firestore에서 로드된 전역 변수가 없으므로 matchLog 기반으로 교류전 경기만 필터
  const exGames = (matchLog || []).filter(m => (m.date || '').startsWith(prefix) && m.exchangeId);
  if (exGames.length === 0) return `🤝 교류전 결과 (${parseInt(month)}월)\n━━━━━━━━━━\n(교류전 없음)`;

  // exchangeId 기준으로 그룹핑
  const groups = {};
  exGames.forEach(m => {
    const eid = m.exchangeId;
    if (!groups[eid]) groups[eid] = { clubBName: m.clubBName || '상대 클럽', winsA: 0, winsB: 0, date: m.date };
    if (m.clubSideHome === 'A') { m.winner === 'home' ? groups[eid].winsA++ : groups[eid].winsB++; }
    else                        { m.winner === 'away' ? groups[eid].winsA++ : groups[eid].winsB++; }
  });

  // ✅ v4.83: clubName 필드명 수정
  const clubName = (currentClub && currentClub.clubName) ? currentClub.clubName : '우리 클럽';
  let txt = `🤝 교류전 결과 (${parseInt(month)}월)\n━━━━━━━━━━\n`;
  Object.values(groups).forEach(g => {
    const result = g.winsA > g.winsB ? '🏆 승' : g.winsA < g.winsB ? '😢 패' : '🤝 무';
    txt += `vs ${g.clubBName} ${result}\n${clubName} ${g.winsA}승 : ${g.winsB}승 ${g.clubBName}\n`;
  });
  return txt.trimEnd();
}

// ── 리포트 생성 & 복사 ──────────────────

function generateMonthlyReport() {
  saveReportSettings();
  syncFeeToFinance(); // ✅ v4.92: 리포트 생성 전 회비→재정 동기화
  const ym = _getReportMonth();
  const [year, month] = ym.split('-');
  // ✅ v4.83: clubName 필드명 수정
  const clubName = (currentClub && currentClub.clubName) ? currentClub.clubName : '클럽';

  const sections = [];
  sections.push(`📋 ${clubName} ${year}년 ${parseInt(month)}월 운영 리포트\n${'═'.repeat(20)}`);

  if (document.getElementById('rpt-fee')?.checked)        sections.push(_buildFeeSection(ym));
  if (document.getElementById('rpt-finance')?.checked)    sections.push(_buildFinanceSection(ym));
  if (document.getElementById('rpt-attendance')?.checked) sections.push(_buildAttendanceSection(ym));
  if (document.getElementById('rpt-risk')?.checked)       sections.push(_buildRiskSection(ym));
  if (document.getElementById('rpt-games')?.checked)      sections.push(_buildGamesSection(ym));
  if (document.getElementById('rpt-winrate')?.checked)    sections.push(_buildWinrateSection(ym));
  if (document.getElementById('rpt-exchange')?.checked)   sections.push(_buildExchangeSection(ym));

  if (sections.length === 1) { gsAlert('항목을 하나 이상 선택하세요.'); return; }

  const text = sections.join('\n\n');
  const previewEl = document.getElementById('reportPreview');
  if (previewEl) { previewEl.style.display = 'block'; previewEl.textContent = text; }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => gsAlert('📋 리포트가 클립보드에 복사됐어요!\n카톡에 붙여넣기 하세요.'));
  } else { fallbackCopy(text); }
}

// ========================================
// ✅ v4.77: 회원 이력 관리
// ========================================

function showMemberHistory() {
  showTreasurerSection('member-history');
}

function renderMemberHistoryTabs(tab) {
  window._memberHistoryTab = tab || 'active';
  const activeBtn = document.getElementById('mh-tab-active');
  const inactiveBtn = document.getElementById('mh-tab-inactive');
  if (activeBtn) activeBtn.style.background = tab === 'active' ? 'var(--wimbledon-sage)' : '#E5E5EA';
  if (activeBtn) activeBtn.style.color = tab === 'active' ? '#fff' : 'var(--text-dark)';
  if (inactiveBtn) inactiveBtn.style.background = tab === 'inactive' ? 'var(--roland-clay)' : '#E5E5EA';
  if (inactiveBtn) inactiveBtn.style.color = tab === 'inactive' ? '#fff' : 'var(--text-dark)';
  tab === 'active' ? renderActiveMemberList() : renderInactiveMemberList();
}

// 정회원 + 휴면 탭
function renderActiveMemberList() {
  const el = document.getElementById('mh-list');
  if (!el) return;
  const actives  = players.filter(p => !p.isGuest && (!p.status || p.status === 'active'));
  const dormants = players.filter(p => !p.isGuest && p.status === 'dormant');
  let html = '';

  if (actives.length > 0) {
    html += `<div style="font-size:12px; font-weight:700; color:var(--text-gray); margin:8px 0 6px;">🟢 정회원 (${actives.length}명)</div>`;
    actives.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
      const joined = p.joinedAt ? `가입: ${p.joinedAt}` : '가입일 미등록';
      const safe = escapeHtml(p.name).replace(/'/g, "&#39;");
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#F9F9F9; border-radius:12px; margin-bottom:6px;">
          <div>
            <div style="font-size:14px; font-weight:600;">${escapeHtml(displayName(p.name))}</div>
            <div style="font-size:11px; color:var(--text-gray); margin-top:2px;">${joined}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="editJoinDate('${safe}')" style="padding:5px 9px; background:#E5E5EA; border:none; border-radius:8px; font-size:11px; cursor:pointer;">📅 가입일</button>
            <button onclick="setDormant('${safe}')" style="padding:5px 9px; background:#FF9500; color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">😴 휴면</button>
            <button onclick="setInactive('${safe}')" style="padding:5px 9px; background:var(--roland-clay); color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">탈퇴</button>
          </div>
        </div>`;
    });
  }

  if (dormants.length > 0) {
    html += `<div style="font-size:12px; font-weight:700; color:#FF9500; margin:12px 0 6px;">🟡 휴면 (${dormants.length}명)</div>`;
    dormants.sort((a,b) => a.name.localeCompare(b.name)).forEach(p => {
      const since = p.dormantAt ? `휴면 시작: ${p.dormantAt}` : '휴면 처리됨';
      const safe = escapeHtml(p.name).replace(/'/g, "&#39;");
      html += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#FFF8EE; border-radius:12px; margin-bottom:6px;">
          <div>
            <div style="font-size:14px; font-weight:600;">${escapeHtml(displayName(p.name))}</div>
            <div style="font-size:11px; color:#FF9500; margin-top:2px;">${since}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button onclick="restoreActive('${safe}')" style="padding:5px 9px; background:var(--wimbledon-sage); color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">✅ 복귀</button>
            <button onclick="setInactive('${safe}')" style="padding:5px 9px; background:var(--roland-clay); color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">탈퇴</button>
          </div>
        </div>`;
    });
  }

  if (actives.length === 0 && dormants.length === 0) html = '<div style="text-align:center; padding:20px; color:var(--text-gray);">회원이 없습니다.</div>';
  el.innerHTML = html;
}

// 탈퇴 회원 탭
function renderInactiveMemberList() {
  const el = document.getElementById('mh-list');
  if (!el) return;
  const inactives = players.filter(p => !p.isGuest && p.status === 'inactive');
  if (inactives.length === 0) {
    el.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray);">탈퇴 회원이 없습니다.</div>';
    return;
  }
  let html = `<div style="font-size:12px; font-weight:700; color:var(--roland-clay); margin:8px 0 6px;">🔴 탈퇴 회원 (${inactives.length}명)</div>`;
  inactives.sort((a,b) => (b.leftAt||'').localeCompare(a.leftAt||'')).forEach(p => {
    const left = p.leftAt ? `탈퇴: ${p.leftAt}` : '탈퇴일 미등록';
    const reason = p.leftReason ? ` · ${p.leftReason}` : '';
    const safe = escapeHtml(p.name).replace(/'/g, "&#39;");
    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#FFF2F2; border-radius:12px; margin-bottom:6px;">
        <div>
          <div style="font-size:14px; font-weight:600; color:#888;">${escapeHtml(displayName(p.name))}</div>
          <div style="font-size:11px; color:var(--roland-clay); margin-top:2px;">${left}${reason}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button onclick="restoreActive('${safe}')" style="padding:5px 9px; background:var(--wimbledon-sage); color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">🔄 재가입</button>
          <button onclick="permanentDelete('${safe}')" style="padding:5px 9px; background:#333; color:#fff; border:none; border-radius:8px; font-size:11px; cursor:pointer;">🗑 영구삭제</button>
        </div>
      </div>`;
  });
  el.innerHTML = html;
}

// 가입일 수정
function editJoinDate(name) {
  // ✅ v4.78: 달력 팝업 방식으로 변경
  const p = players.find(x => x.name === name);
  if (!p) return;
  const today = new Date().toISOString().slice(0, 10);
  const current = p.joinedAt || today; // 미등록이면 오늘, 기존값 있으면 그대로

  // 기존 모달 있으면 제거
  const existing = document.getElementById('joinDateModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'joinDateModal';
  modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); }; // ✅ v4.83: 배경 클릭 시 닫기
  modal.innerHTML = `
    <div style="background:#fff; border-radius:20px; padding:24px; width:300px; box-shadow:0 8px 32px rgba(0,0,0,0.18);" onclick="event.stopPropagation()">
      <div style="font-size:16px; font-weight:700; margin-bottom:6px;">📅 가입일 설정</div>
      <div style="font-size:13px; color:var(--text-gray); margin-bottom:16px;">${escapeHtml(displayName(name))}</div>
      <input type="date" id="joinDateInput" value="${current}"
        style="width:100%; padding:12px; border:2px solid #E5E5EA; border-radius:12px; font-size:16px; box-sizing:border-box; margin-bottom:16px;" />
      <div style="display:flex; gap:8px;">
        <button onclick="document.getElementById('joinDateModal').remove()"
          style="flex:1; padding:12px; border:2px solid #E5E5EA; background:#fff; border-radius:12px; font-size:14px; cursor:pointer;">취소</button>
        <button onclick="_confirmJoinDate('${escapeHtml(name).replace(/'/g,"&#39;")}')"
          style="flex:1; padding:12px; background:var(--wimbledon-sage); color:#fff; border:none; border-radius:12px; font-size:14px; font-weight:600; cursor:pointer;">저장</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function _confirmJoinDate(name) {
  const val = document.getElementById('joinDateInput')?.value;
  const modal = document.getElementById('joinDateModal');
  if (modal) modal.remove();
  if (!val) return;
  const p = players.find(x => x.name === name);
  if (!p) return;
  p.joinedAt = val;
  pushDataOnly();
  renderActiveMemberList();
}

// 휴면 처리
function setDormant(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  gsConfirm(`${displayName(name)}님을 휴면 처리할까요?\n\n• 랭킹에서 제외됩니다\n• 회비가 자동 면제됩니다`, ok => {
    if (!ok) return;
    p.status = 'dormant';
    p.dormantAt = new Date().toISOString().slice(0, 10);
    p.isFeeExempt = true;
    pushDataOnly();
    renderActiveMemberList();
    renderFeeTable();
    gsAlert(`${displayName(name)}님이 휴면 처리됐습니다.`);
  });
}

// 탈퇴 처리
function setInactive(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  gsEditName('', reason => {
    p.status = 'inactive';
    p.leftAt = new Date().toISOString().slice(0, 10);
    p.leftReason = (reason || '').trim() || '';
    p.isFeeExempt = true;
    pushDataOnly();
    renderMemberHistoryTabs(window._memberHistoryTab || 'active');
    gsAlert(`${displayName(name)}님이 탈퇴 처리됐습니다.`);
  }, { title: `${displayName(name)} 탈퇴 처리`, placeholder: '탈퇴 사유 (선택 입력)' });
}

// 정회원 복귀 (휴면→활성, 탈퇴→재가입)
function restoreActive(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  const label = p.status === 'inactive' ? '재가입' : '복귀';
  gsConfirm(`${displayName(name)}님을 ${label} 처리할까요?\n\n• 정회원으로 복귀됩니다\n• 회비 면제가 해제됩니다`, ok => {
    if (!ok) return;
    p.status = 'active';
    p.isFeeExempt = false;
    p.dormantAt = null;
    pushDataOnly();
    renderMemberHistoryTabs(window._memberHistoryTab || 'active');
    renderFeeTable();
    gsAlert(`${displayName(name)}님이 ${label} 처리됐습니다.`);
  });
}

// 영구삭제 — 총무 PIN 재확인 후 기존 경기 기록까지 완전 삭제
function permanentDelete(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  gsConfirm(`⚠️ 영구삭제 확인\n\n${displayName(name)}님의 모든 데이터를 삭제합니다.\n• 회원 정보 삭제\n• 경기 기록에서 이름 제거\n\n이 작업은 되돌릴 수 없습니다.\n계속하시겠습니까?`, ok => {
    if (!ok) return;
    // ✅ v4.79: PIN 확인 로직 안전하게 수정
    gsEditName('', pin => {
      pin = (pin || '').trim();
      const masterOk = (typeof MASTER_PIN !== 'undefined' && MASTER_PIN && pin === MASTER_PIN);
      const adminOk  = (typeof ADMIN_PIN  !== 'undefined' && ADMIN_PIN  && pin === ADMIN_PIN);
      if (!pin || (!masterOk && !adminOk)) {
        gsAlert('비밀번호가 틀렸습니다.'); return;
      }
      _doPermanentDelete(name);
    }, { title: '총무 PIN 확인', placeholder: 'PIN 입력' });
  });
}

async function _doPermanentDelete(name) {
  const clubId = getActiveClubId();

  // players에서 제거
  players = players.filter(p => p.name !== name);

  // matchLog 메모리 업데이트 + Firestore 반영
  // ✅ v4.79: 이름만 [탈퇴]로 대체 후 변경된 문서만 Firestore에 업데이트
  const affected = [];
  matchLog = matchLog.map(m => {
    const newHome = (m.home || []).map(n => n === name ? '[탈퇴]' : n);
    const newAway = (m.away || []).map(n => n === name ? '[탈퇴]' : n);
    const changed = JSON.stringify(newHome) !== JSON.stringify(m.home) ||
                    JSON.stringify(newAway) !== JSON.stringify(m.away);
    const updated = { ...m, home: newHome, away: newAway };
    if (changed) affected.push(updated);
    return updated;
  });

  // 변경된 matchLog 문서만 Firestore 배치 업데이트
  if (affected.length > 0) {
    try {
      const col = _clubRef(clubId).collection('matchLog');
      const chunkSize = 400;
      for (let i = 0; i < affected.length; i += chunkSize) {
        const batch = _db.batch();
        affected.slice(i, i + chunkSize).forEach(m => {
          batch.set(col.doc(_sanitizeDocId(m.id)), m);
        });
        await batch.commit();
      }
    } catch(e) {
      console.warn('permanentDelete matchLog Firestore 업데이트 오류:', e);
    }
  }

  // feeData에서 제거
  if (feeData[name]) delete feeData[name];

  await pushDataOnly();
  await pushFeeData();

  renderMemberHistoryTabs('inactive');
  updatePlayerList();
  renderLadderPlayerPool();
  renderStatsPlayerList();
  gsAlert(`✅ ${name}님의 데이터가 영구삭제됐습니다.`);
}
