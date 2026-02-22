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
    // ✅ v4.032: 회비 면제 설정 등 변경사항 저장
    pushDataOnly();
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

    if(section === 'fee') { initFeeTable(); renderTreasurerPicker(); renderFeeExemptPicker(); }
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
    // ✅ v3.83: GAS에서 회비 데이터 로드 (localStorage는 fallback)
    fetchFeeData().then(() => {
      $('monthlyFeeAmount').value = monthlyFeeAmount || '';
      syncFeeToFinance();
      renderFeeTable();
    });
  }

  function saveMonthlyFee() {
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
    const members = players.filter(p => !p.isGuest).sort((a,b) => a.name.localeCompare(b.name));

    // ✅ v3.949: 납부율 요약 — 총무 제외한 현재 월 납부 현황
    const summaryEl = $('feeSummary');
    if (summaryEl) {
      const key = `${year}-${String(curMonth).padStart(2,'0')}`;
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
    for(let m = 1; m <= 12; m++) {
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
        for(let m = 1; m <= 12; m++) {
          const isCur = (parseInt(year) === curYear && m === curMonth);
          bodyHtml += `<td class="fee-check${isCur ? ' fee-current-month' : ''}" style="color:var(--wimbledon-sage); font-size:11px;">면제</td>`;
        }
        bodyHtml += '</tr>';
        return;
      }

      // ✅ v4.032: 회비 면제 행 — 체크 불가, "면제" 표시
      if (p.isFeeExempt) {
        bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))} <span style="font-size:10px; color:#FF9500;">[면제]</span></td>`;
        for(let m = 1; m <= 12; m++) {
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
      bodyHtml += `<tr><td>${escapeHtml(displayName(p.name))}<button style="${yearlyBtnStyle}" onclick="toggleYearlyFee('${escapeHtml(p.name).replace(/'/g,"&#39;")}')">${isYearly ? '연납✓' : '연납'}</button></td>`;
      for(let m = 1; m <= 12; m++) {
        const key = `${year}-${String(m).padStart(2,'0')}`;
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
    if(!feeData[name]) feeData[name] = {};
    feeData[name][key] = (feeData[name][key] === 'Y') ? 'N' : 'Y';
    // ✅ v3.816: 변경 즉시 localStorage에 저장 (clubId 있을 때만)
    const cid = getActiveClubId();
    if(cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
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
    const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt);

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
    // ✅ v3.83: GAS에도 저장
    pushFeeData();
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
      // ✅ v3.949: 총무 제외하여 납부 인원 계산
      // ✅ v4.032: 회비 면제 회원도 제외
      const nonTreasurerNames = new Set(players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt).map(p => p.name));
      Object.entries(feeData).forEach(([name, pf]) => {
        if (!nonTreasurerNames.has(name)) return;
        // ✅ v3.9491: 연납자(yearly='Y')도 납부로 집계
        const yearlyKey = `${year}-yearly`;
        if (pf[key] === 'Y' || pf[yearlyKey] === 'Y') paidCount++;
      });
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
    // ✅ v3.949: 총무 제외
    // ✅ v4.032: 회비 면제 회원도 제외
    const members = players.filter(p => !p.isGuest && !p.isTreasurer && !p.isFeeExempt).sort((a,b) => a.name.localeCompare(b.name));

    const paid = [];
    const unpaid = [];
    members.forEach(p => {
      const pFee = feeData[p.name] || {};
      // ✅ v3.9491: 연납자(yearly='Y')도 납부로 표시
      const yearlyKey = `${year}-yearly`;
      if(pFee[key] === 'Y' || pFee[yearlyKey] === 'Y') paid.push(displayName(p.name));
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
    const members = players.filter(p => !p.isGuest).sort((a,b) => a.name.localeCompare(b.name));
    let html = `<div style="margin-bottom:8px; font-size:13px; color:var(--text-gray);">현재 총무: <strong style="color:var(--wimbledon-sage);">${current ? escapeHtml(displayName(current.name)) : '없음'}</strong></div>`;
    html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    members.forEach(p => {
      const isT = p.isTreasurer;
      html += `<button onclick="toggleTreasurer('${escapeHtml(p.name).replace(/'/g,"&#39;")}')"
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
    const members = players.filter(p => !p.isGuest).sort((a,b) => a.name.localeCompare(b.name));
    let html = `<div style="margin-bottom:8px; font-size:13px; color:var(--text-gray);">면제 회원: <strong style="color:#FF9500;">${exempted.length > 0 ? exempted.map(p => escapeHtml(displayName(p.name))).join(', ') : '없음'}</strong></div>`;
    html += `<div style="display:flex; flex-wrap:wrap; gap:6px;">`;
    members.forEach(p => {
      const isE = !!p.isFeeExempt;
      const safeName = escapeHtml(p.name).replace(/'/g,"&#39;");
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
    if(cid) localStorage.setItem('grandslam_fee_data_' + cid, JSON.stringify(feeData));
    renderFeeTable();
    syncFeeToFinance();
    pushFeeData();
  }

  function addFinanceItem() {
    const date = $('finDate').value;
    const desc = $('finDesc').value.trim();
    const amount = parseInt($('finAmount').value);
    // ✅ v3.949: 지출 카테고리
    const catEl = $('finCategory');
    const category = (catEl && currentFinTab === 'expense') ? catEl.value : '';

    if(!desc) { gsAlert('내용을 입력하세요.'); return; }
    if(!amount || amount <= 0) { gsAlert('금액을 입력하세요.'); return; }

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
        // ✅ v3.949: 카테고리 표시
        const catStr = f.category ? ` [${f.category}]` : '';
        text += `• ${dateShort} ${f.desc}${catStr} ${f.amount.toLocaleString()}원\n`;
      });
      text += `소계: ${totalExpense.toLocaleString()}원\n\n`;
    }

    text += `━━━━━━━━━━\n`;
    text += `💵 잔액: ${balance.toLocaleString()}원`;

    if(navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => gsAlert('📋 복사 완료! 카톡에 붙여넣기 하세요.'));
    } else { fallbackCopy(text); }
  }

