  // ========================================
  // v3.81: TREASURER MODE (총무 모드)
  // ========================================

  function makeOneTimePlayerObj(name) {
    return { name, isGuest: true, isOneTime: true, score:0, wins:0, losses:0,
      dScore:0, dWins:0, dLosses:0, sScore:0, sWins:0, sLosses:0,
      last:0, lastD:0, lastS:0, weekly:0, wWins:0, wLosses:0,
      wdScore:0, wsScore:0, wdWins:0, wdLosses:0, wsWins:0, wsLosses:0, lastW:0, lastWD:0, lastWS:0 };
  }

  function addOneTimePlayer() {
    gsEditName('', name => {
      name = (name || '').trim();
      if (!name) return;
      if (players.find(p => p.name === name) || oneTimePlayers.includes(name)) {
        gsAlert('이미 있는 이름이에요!'); return;
      }
      oneTimePlayers.push(name);
      renderPool(); initTournament(); renderLadderPlayerPool();
      try { initRoundPlayerPool(); } catch(e) {}
    });
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
    try { initRoundPlayerPool(); } catch(e) {}
  }

  // ✅ v3.816: 클럽별 1대2대결용 활성화 여부 (localStorage 저장)
  function getUse1v2Key() { return 'grandslam_use1v2_' + getActiveClubId(); }
  function isUse1v2() { return localStorage.getItem(getUse1v2Key()) === 'Y'; }
  function setUse1v2(val) { localStorage.setItem(getUse1v2Key(), val ? 'Y' : 'N'); }

  // ✅ v3.816: 가상 1대2대결용 플레이어 객체 (players 배열에 없어도 풀에 표시)
  // VIRTUAL_1V2_PLAYER → state.js에서 선언됨
  // ========================================

  function enterTreasurer() {
    showView('treasurer');
  }

  function resetTreasurerView() {
    if(treasurerUnlocked) {
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
    if(pin === MASTER_PIN || pin === ADMIN_PIN) {
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
    // ✅ v3.816: 1대2대결용 토글 상태 렌더링
    render1v2Toggle();
  }

  // ✅ v3.816: 1대2대결용 토글 상태 업데이트
  function render1v2Toggle() {
    const track = $('use1v2Track');
    const thumb = $('use1v2Thumb');
    if(!track || !thumb) return;
    const active = isUse1v2();
    track.style.background = active ? 'var(--wimbledon-sage)' : '#ccc';
    thumb.style.transform = active ? 'translateX(22px)' : 'translateX(0)';
  }

  // ✅ v3.816: 1대2대결용 토글 클릭
  function toggle1v2() {
    setUse1v2(!isUse1v2());
    render1v2Toggle();
    // 게임 풀 즉시 갱신
    renderPool();
    renderLadderPlayerPool();
    initTournament();
    try { initRoundPlayerPool(); } catch(e) {}
    gsAlert(isUse1v2() ? '✅ [1vs2]용이 게임 풀에 표시됩니다.' : '❌ [1vs2]용이 숨겨집니다.');
  }

  function hideTreasurerSections() {
    ['treasurer-fee','treasurer-finance','treasurer-court-mgmt','treasurer-notice-mgmt'].forEach(id => {
      const el = $(id);
      if(el) el.style.display = 'none';
    });
  }

  function showTreasurerSection(section) {
    $('treasurer-main').style.display = 'none';
    hideTreasurerSections();
    const el = $('treasurer-' + section);
    if(el) el.style.display = 'block';

    if(section === 'fee') { initFeeTable(); }
    if(section === 'finance') { initFinance(); }
    if(section === 'court-mgmt') { loadCourtPresets(); renderCourtNoticeList(); }
    if(section === 'notice-mgmt') { renderAnnouncementMgmtList(); }
  }

  // ========================================
  // 회비 납부 현황
  // ========================================

  function initFeeTable() {
    const sel = $('feeYear');
    const curYear = new Date().getFullYear();
    sel.innerHTML = '';
    for(let y = curYear; y >= curYear - 2; y--) {
      sel.innerHTML += `<option value="${y}" ${y===curYear?'selected':''}>${y}년</option>`;
    }
    // 월회비 복원
    const savedFee = localStorage.getItem('grandslam_monthly_fee_' + getActiveClubId());
    if(savedFee) { monthlyFeeAmount = parseInt(savedFee) || 0; }
    $('monthlyFeeAmount').value = monthlyFeeAmount || '';
    // ✅ v3.816: 회비 납부 현황 localStorage 복원 (clubId 있을 때만)
    const cid = getActiveClubId();
    if(cid) {
      const savedFeeData = localStorage.getItem('grandslam_fee_data_' + cid);
      if(savedFeeData) {
        try { feeData = JSON.parse(savedFeeData); } catch(e) { feeData = {}; }
      }
    }
    syncFeeToFinance(); // ✅ v3.8191: 복원 후 재정 연동 즉시 갱신
    renderFeeTable();
  }

  function saveMonthlyFee() {
    monthlyFeeAmount = parseInt($('monthlyFeeAmount').value) || 0;
    localStorage.setItem('grandslam_monthly_fee_' + getActiveClubId(), monthlyFeeAmount);
    syncFeeToFinance(); // 재정 연동 재계산
  }

  function renderFeeTable() {
    const year = $('feeYear').value;
    const curMonth = new Date().getMonth() + 1;
    const curYear = new Date().getFullYear();
    const members = players.filter(p => !p.isGuest).sort((a,b) => a.name.localeCompare(b.name));

    let headHtml = '<tr><th>회원</th>';
    for(let m = 1; m <= 12; m++) {
      const isCur = (parseInt(year) === curYear && m === curMonth);
      headHtml += `<th class="${isCur ? 'fee-current-month' : ''}">${m}월</th>`;
    }
    headHtml += '</tr>';
    $('feeHead').innerHTML = headHtml;

    let bodyHtml = '';
    members.forEach(p => {
      const pFee = feeData[p.name] || {};
      bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))}</td>`;
      for(let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2,'0')}`;
        const paid = pFee[key] === 'Y';
        const isCur = (parseInt(year) === curYear && m === curMonth);
        const cellClass = (!paid ? ' fee-unpaid' : '') + (isCur ? ' fee-current-month' : '');
        bodyHtml += `<td class="fee-check${cellClass}" onclick="toggleFee('${escapeHtml(p.name)}','${key}')">${paid ? '✅' : '❌'}</td>`;
      }
      bodyHtml += '</tr>';
    });
    $('feeBody').innerHTML = bodyHtml;
  }

  function toggleFee(name, key) {
    if(!feeData[name]) feeData[name] = {};
    feeData[name][key] = (feeData[name][key] === 'Y') ? 'N' : 'Y';
    // ✅ v3.816: 변경 즉시 localStorage에 저장 (clubId 있을 때만)
    const cid = getActiveClubId();
    if(cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
    renderFeeTable();
    syncFeeToFinance();
  }

  // ✅ 완납/해제 버튼 (연/월)
  function feeSetAll(value, scope) {
    const year = $('feeYear').value;
    const curMonth = new Date().getMonth() + 1;
    const members = players.filter(p => !p.isGuest);

    if(scope === 'year') {
      // 1~12월 전체
      members.forEach(p => {
        if(!feeData[p.name]) feeData[p.name] = {};
        for(let m = 1; m <= 12; m++) {
          const key = `${year}-${String(m).padStart(2,'0')}`;
          feeData[p.name][key] = value;
        }
      });
    } else {
      // 현재 월만
      const key = `${year}-${String(curMonth).padStart(2,'0')}`;
      members.forEach(p => {
        if(!feeData[p.name]) feeData[p.name] = {};
        feeData[p.name][key] = value;
      });
    }
    renderFeeTable();
    syncFeeToFinance();
    // ✅ v3.816: 완납/해제 후 localStorage 저장 (clubId 있을 때만)
    const cid = getActiveClubId();
    if(cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
  }

  // ✅ 회비 → 재정 수입 자동 연동
  function syncFeeToFinance() {
    // 기존 자동 항목 제거
    financeData = financeData.filter(f => !f.auto);

    if(!monthlyFeeAmount) return;

    // ✅ v3.819: feeYear가 숨겨진 화면(재정관리)에서도 올바른 연도 사용
    const feeYearEl = $('feeYear');
    const year = (feeYearEl && feeYearEl.value) ? feeYearEl.value : String(new Date().getFullYear());

    for(let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2,'0')}`;
      let paidCount = 0;
      Object.values(feeData).forEach(pf => { if(pf[key] === 'Y') paidCount++; });
      if(paidCount > 0) {
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
    const key = `${year}-${String(curMonth).padStart(2,'0')}`;
    const members = players.filter(p => !p.isGuest).sort((a,b) => a.name.localeCompare(b.name));

    const paid = [];
    const unpaid = [];
    members.forEach(p => {
      const pFee = feeData[p.name] || {};
      if(pFee[key] === 'Y') paid.push(displayName(p.name));
      else unpaid.push(displayName(p.name));
    });

    let text = `📋 ${year}년 ${curMonth}월 회비 납부 현황\n`;
    text += `━━━━━━━━━━\n`;
    text += `✅ 납부 (${paid.length}명): ${paid.join(', ') || '없음'}\n`;
    text += `❌ 미납 (${unpaid.length}명): ${unpaid.join(', ') || '없음'}\n`;
    if(monthlyFeeAmount) {
      text += `━━━━━━━━━━\n`;
      text += `💰 월회비: ${monthlyFeeAmount.toLocaleString()}원\n`;
      text += `📥 납부액: ${(paid.length * monthlyFeeAmount).toLocaleString()}원`;
    }

    if(navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => gsAlert('📋 복사 완료! 카톡에 붙여넣기 하세요.'));
    } else { fallbackCopy(text); }
  }


  // ========================================
  // 재정 관리
  // ========================================

  function initFinance() {
    const today = new Date().toISOString().slice(0,10);
    $('finDate').value = today;
    $('finDesc').value = '';
    $('finAmount').value = '';
    // ✅ v3.8191: feeData + monthlyFeeAmount 복원 확실히 보장 (모든 클럽 공통)
    const cid = getActiveClubId();
    if(cid) {
      const savedFeeData = localStorage.getItem('grandslam_fee_data_' + cid);
      if(savedFeeData) { try { feeData = JSON.parse(savedFeeData); } catch(e) { feeData = {}; } }
      const savedFee = localStorage.getItem('grandslam_monthly_fee_' + cid);
      if(savedFee) { monthlyFeeAmount = parseInt(savedFee) || 0; }
    }
    syncFeeToFinance();
    setFinanceTab('income');
    renderFinanceList();
  }

  function setFinanceTab(tab) {
    currentFinTab = tab;
    $('finTabIncome').classList.toggle('active', tab === 'income');
    $('finTabExpense').classList.toggle('active', tab === 'expense');
    renderFinanceList();
  }

  function addFinanceItem() {
    const date = $('finDate').value;
    const desc = $('finDesc').value.trim();
    const amount = parseInt($('finAmount').value);

    if(!desc) { gsAlert('내용을 입력하세요.'); return; }
    if(!amount || amount <= 0) { gsAlert('금액을 입력하세요.'); return; }

    financeData.push({
      id: Date.now().toString(),
      type: currentFinTab,
      date: date,
      desc: desc,
      amount: amount,
      auto: false
    });

    $('finDesc').value = '';
    $('finAmount').value = '';
    renderFinanceList();
  }

  function deleteFinanceItem(id) {
    gsConfirm('삭제할까요?', ok => {
      if(!ok) return;
      financeData = financeData.filter(f => f.id !== id);
      renderFinanceList();
    });
  }

  function renderFinanceList() {
    const filtered = financeData.filter(f => f.type === currentFinTab)
      .sort((a,b) => {
        // 자동 항목 위로
        if(a.auto && !b.auto) return -1;
        if(!a.auto && b.auto) return 1;
        return (b.date || '').localeCompare(a.date || '');
      });

    const area = $('financeListArea');
    if(filtered.length === 0) {
      area.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">${currentFinTab === 'income' ? '수입' : '지출'} 내역이 없습니다.</div>`;
    } else {
      area.innerHTML = filtered.map(f => {
        const dateShort = (f.date || '').slice(5).replace('-','/');
        const amtClass = f.type === 'income' ? 'income' : 'expense';
        const prefix = f.type === 'income' ? '+' : '-';
        const autoStyle = f.auto ? 'opacity:0.7; background:rgba(93,156,118,0.06);' : '';
        const autoTag = f.auto ? '<span style="font-size:10px; color:var(--wimbledon-sage); margin-left:4px;">[자동]</span>' : '';
        const delBtn = f.auto ? '' : `<span class="material-symbols-outlined fi-del" onclick="deleteFinanceItem('${f.id}')">close</span>`;
        return `
          <div class="finance-item" style="${autoStyle}">
            <span class="fi-date">${dateShort}</span>
            <span class="fi-desc">${escapeHtml(f.desc)}${autoTag}</span>
            <span class="fi-amount ${amtClass}">${prefix}${f.amount.toLocaleString()}원</span>
            ${delBtn}
          </div>
        `;
      }).join('');
    }

    // 합계 계산
    const totalIncome = financeData.filter(f => f.type === 'income').reduce((s,f) => s + f.amount, 0);
    const totalExpense = financeData.filter(f => f.type === 'expense').reduce((s,f) => s + f.amount, 0);
    const balance = totalIncome - totalExpense;

    $('fsTotalIncome').textContent = totalIncome.toLocaleString() + '원';
    $('fsTotalExpense').textContent = totalExpense.toLocaleString() + '원';
    $('fsBalance').textContent = balance.toLocaleString() + '원';
    $('fsBalance').style.color = balance >= 0 ? 'var(--wimbledon-sage)' : 'var(--up-red)';
  }

  function copyFinanceStatus() {
    const incomes = financeData.filter(f => f.type === 'income').sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const expenses = financeData.filter(f => f.type === 'expense').sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const totalIncome = incomes.reduce((s,f) => s + f.amount, 0);
    const totalExpense = expenses.reduce((s,f) => s + f.amount, 0);
    const balance = totalIncome - totalExpense;

    let text = `💰 재정 현황\n━━━━━━━━━━\n`;

    if(incomes.length > 0) {
      text += `📥 수입\n`;
      incomes.forEach(f => {
        const dateShort = (f.date || '').slice(5).replace('-','/');
        const tag = f.auto ? ' [자동]' : '';
        text += `• ${dateShort} ${f.desc}${tag} ${f.amount.toLocaleString()}원\n`;
      });
      text += `소계: ${totalIncome.toLocaleString()}원\n\n`;
    }

    if(expenses.length > 0) {
      text += `📤 지출\n`;
      expenses.forEach(f => {
        const dateShort = (f.date || '').slice(5).replace('-','/');
        text += `• ${dateShort} ${f.desc} ${f.amount.toLocaleString()}원\n`;
      });
      text += `소계: ${totalExpense.toLocaleString()}원\n\n`;
    }

    text += `━━━━━━━━━━\n`;
    text += `💵 잔액: ${balance.toLocaleString()}원`;

    if(navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => gsAlert('📋 복사 완료! 카톡에 붙여넣기 하세요.'));
    } else { fallbackCopy(text); }
  }

