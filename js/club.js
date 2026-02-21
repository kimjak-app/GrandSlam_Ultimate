  // ========================================
  // v3.79: MULTI-CLUB MANAGEMENT (Master GAS)
  // GAS URL 하나로 통합, clubId로 라우팅
  // ========================================

  function getActiveClubId() {
    return currentClub ? currentClub.clubId : '';
  }

  function loadActiveClubId() {
    return localStorage.getItem(ACTIVE_CLUB_KEY) || '';
  }

  function saveActiveClubId(id) {
    localStorage.setItem(ACTIVE_CLUB_KEY, id || '');
  }

  // GAS에서 클럽 목록 불러오기
  async function fetchClubList() {
    try {
      const url = MASTER_GAS_URL + '?action=listClubs';
      const r = await fetchWithTimeout(url, {}, 12000);
      if (!r.ok) throw new Error('listClubs 실패: ' + r.status);
      const resp = await r.json();
      if (resp.ok && Array.isArray(resp.clubs)) {
        clubList = resp.clubs;
        return clubList;
      }
      throw new Error(resp.error || 'listClubs 응답 오류');
    } catch(e) {
      console.error('fetchClubList error:', e);
      clubList = [];
      return [];
    }
  }

  async function initClubSystem() {
    // 1) GAS에서 클럽 목록 가져오기
    await fetchClubList();
    
    // 2) 저장된 활성 클럽 복원
    const savedId = loadActiveClubId();
    const saved = clubList.find(c => c.clubId === savedId);
    const target = saved || clubList.find(c => c.isDefault) || clubList[0];
    
    if (target) {
      activateClub(target, false); // false = sync는 나중에
    }
    updateClubSelectorUI();
  }

  function activateClub(club, doSync) {
    // ✅ v3.818: currentClub 바꾸기 전에 이전 클럽 ID로 먼저 저장 (버그 수정)
    if(currentClub && currentClub.clubId) {
      localStorage.setItem('grandslam_fee_data_' + currentClub.clubId, JSON.stringify(feeData));
      // ✅ v3.83: GAS에도 저장 (비동기, 에러 무시)
      pushFeeData().catch(e => console.warn('activateClub pushFeeData error:', e));
    }

    currentClub = club;
    // ✅ v3.8204: localStorage 저장값 우선 참조 (브라우저 재시작 시에도 최신 비번 유지)
    const savedPin = localStorage.getItem('grandslam_admin_pin_' + club.clubId);
    ADMIN_PIN = savedPin || club.adminPin || '0707';
    saveActiveClubId(club.clubId);
    
    updateClubSelectorUI();
    updateClubThemeColor(club.color);
    updateWeatherCityForClub(club);

    // ✅ v3.81: 클럽 전환 시 총무 모드 리셋
    treasurerUnlocked = false;
    financeData = [];
    feeData = {};
    monthlyFeeAmount = 0;
    // ✅ v3.8191: 새 클럽 feeData + monthlyFeeAmount 즉시 복원
    const newCid = club.clubId;
    if(newCid) {
      const savedFeeData = localStorage.getItem('grandslam_fee_data_' + newCid);
      if(savedFeeData) { try { feeData = JSON.parse(savedFeeData); } catch(e) { feeData = {}; } }
      const savedFee = localStorage.getItem('grandslam_monthly_fee_' + newCid);
      if(savedFee) { monthlyFeeAmount = parseInt(savedFee) || 0; }
    }
    // ✅ v3.811: 클럽별 코트/공지 데이터 분리
    courtNotices = [];
    announcements = [];
    // ✅ v3.8207_2: 클럽 전환 시 당일 게스트 초기화 (다른 클럽에 노출되는 버그 수정)
    oneTimePlayers = [];
    
    if (doSync !== false) {
      players = [];
      matchLog = [];
      try { sync(); } catch(e) { console.error('Club sync error:', e); }
      // ✅ v3.80: 클럽 전환시 코트/공지 리로드
      fetchCourtNotices().then(() => loadCourtInfo()).catch(()=>{});
      fetchAnnouncements().then(() => loadNotices()).catch(()=>{});
    }
  }

  function updateClubSelectorUI() {
    const dot = $('clubDot');
    const nameText = $('clubNameText');
    if (!currentClub) return;
    if (dot) dot.style.background = currentClub.color || '#5D9C76';
    if (nameText) nameText.textContent = currentClub.clubName || '클럽 없음';
  }

  function updateClubThemeColor(color) {
    if (!color) return;
    document.documentElement.style.setProperty('--wimbledon-sage', color);
  }

  function updateWeatherCityForClub(club) {
    const cityInput = $('city');
    const headerBanner = document.querySelector('#view-home .header-banner');
    if (cityInput) cityInput.value = '';
    if (headerBanner && club.cityKo) {
      headerBanner.innerHTML = '<span class="material-symbols-outlined">wb_sunny</span>' + escapeHtml(club.cityKo) + ' 날씨';
    }
  }

  // --- 클럽 드롭다운 ---
  function openClubDropdown() {
    renderClubDropdownList();
    $('clubDropdown').classList.add('active');
  }

  function closeClubDropdown() {
    $('clubDropdown').classList.remove('active');
  }

  function renderClubDropdownList() {
    const container = $('clubDropdownList');
    if (!container) return;
    if (clubList.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; font-size:13px;">등록된 클럽이 없습니다.</div>';
      return;
    }
    container.innerHTML = clubList.map(function(c) {
      const isActive = currentClub && currentClub.clubId === c.clubId;
      return '<div class="club-item ' + (isActive ? 'active-club' : '') + '" onclick="switchClub(\'' + c.clubId + '\')">' +
        '<span class="club-item-dot" style="background:' + (c.color || '#5D9C76') + '"></span>' +
        '<div class="club-item-info">' +
          '<div class="club-item-name">' + escapeHtml(c.clubName) + (c.isDefault ? ' <span style="font-size:10px;color:#999;">(기본)</span>' : '') + '</div>' +
          '<div class="club-item-sub">' + escapeHtml(c.cityKo || c.city || '') + '</div>' +
        '</div>' +
        (isActive ? '<span class="material-symbols-outlined club-item-check">check_circle</span>' : '') +
      '</div>';
    }).join('');
  }

  async function switchClub(clubId) {
    const club = clubList.find(function(c){ return c.clubId === clubId; });
    if (!club) return;
    if (currentClub && currentClub.clubId === clubId) {
      closeClubDropdown();
      return;
    }
    closeClubDropdown();
    gsConfirm('"' + club.clubName + '"(으)로 전환하시겠습니까?\n데이터가 새로 불러와집니다.', ok => {
      if(!ok) return;
      activateClub(club, true);
      showView('weather');
    });
  }

  // --- 클럽 생성/수정 ---
  function openClubCreate() {
    checkMasterPin(ok => {
      if(!ok) return;
      closeClubDropdown();
      $('clubFormTitle').textContent = '새 클럽 추가';
      $('cfName').value = '';
      $('cfPin').value = '';
      $('cfCity').value = '';
      $('cfCityKo').value = '';
      $('cfEditId').value = '';
      renderColorChips('');
      if ($('cfGuideToggle')) $('cfGuideToggle').style.display = 'block';
      if ($('cfGuideBody')) $('cfGuideBody').style.display = 'none';
      if ($('cfGuideArrow')) $('cfGuideArrow').style.transform = '';
      $('clubFormModal').classList.add('active');
    });
  }

  function openClubEdit(clubId) {
    checkMasterPin(ok => {
      if(!ok) return;
      const club = clubList.find(function(c){ return c.clubId === clubId; });
      if (!club) return;
      closeClubDropdown();
      $('clubFormTitle').textContent = '클럽 수정';
      $('cfName').value = club.clubName || '';
      $('cfPin').value = club.adminPin || '';
      $('cfCity').value = club.city || '';
      $('cfCityKo').value = club.cityKo || '';
      $('cfEditId').value = club.clubId;
      renderColorChips(club.color || '');
      if ($('cfGuideToggle')) $('cfGuideToggle').style.display = 'none';
      $('clubFormModal').classList.add('active');
    });
  }

  function closeClubForm() {
    $('clubFormModal').classList.remove('active');
  }

  function toggleClubGuide() {
    const body = $('cfGuideBody');
    const arrow = $('cfGuideArrow');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
  }

  function renderColorChips(selectedColor) {
    const row = $('cfColorRow');
    if (!row) return;
    row.innerHTML = CLUB_COLORS.map(function(c) {
      return '<div class="club-color-chip ' + (c === selectedColor ? 'selected' : '') + '" ' +
        'style="background:' + c + '" data-color="' + c + '" ' +
        'onclick="selectClubColor(this)"></div>';
    }).join('');
  }

  function selectClubColor(el) {
    document.querySelectorAll('.club-color-chip').forEach(function(c){ c.classList.remove('selected'); });
    el.classList.add('selected');
  }

  function getSelectedColor() {
    const sel = document.querySelector('.club-color-chip.selected');
    return sel ? (sel.getAttribute('data-color') || CLUB_COLORS[0]) : CLUB_COLORS[0];
  }

  var _clubFormSaving = false; // ✅ 중복 저장 방지
  async function saveClubForm() {
    if (_clubFormSaving) return; // 이미 저장 중이면 무시
    const name = $('cfName').value.trim();
    const pin = String($('cfPin').value.trim());
    const city = $('cfCity').value.trim();
    const cityKo = $('cfCityKo').value.trim();
    const color = getSelectedColor();
    const editId = $('cfEditId').value;

    if (!name) { gsAlert('클럽 이름을 입력해주세요.'); return; }
    if (!pin) { gsAlert('관리자 비밀번호를 입력해주세요.'); return; }

    _clubFormSaving = true; // 잠금
    $('loading-overlay').style.display = 'flex';

    try {
      if (editId) {
        // 수정
        const payload = {
          action: 'updateClub', clubId: editId,
          clubName: name, adminPin: pin,
          city: city || 'Gwangmyeong', cityKo: cityKo || city || '도시', color: color
        };
        const r = await fetchWithTimeout(MASTER_GAS_URL, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        }, 15000);
        const resp = await r.json();
        if (!resp.ok) throw new Error(resp.error || '수정 실패');
        
        // ✅ v3.8204: 비번 변경 성공 시 localStorage에 즉시 저장 (브라우저 재시작 대비)
        localStorage.setItem('grandslam_admin_pin_' + editId, pin);
        await fetchClubList();
        if (currentClub && currentClub.clubId === editId) {
          const updated = clubList.find(function(c){ return c.clubId === editId; });
          if (updated) {
            activateClub(updated, true);
            // activateClub 이후에 덮어써야 최종 반영됨
            ADMIN_PIN = pin;
          }
        }
        gsAlert('클럽 정보가 수정되었습니다!');

      } else {
        // 새 클럽 생성 (자동 시트 생성!)
        const payload = {
          action: 'createClub', clubName: name, adminPin: pin,
          city: city || 'Gwangmyeong', cityKo: cityKo || city || '도시', color: color
        };
        const r = await fetchWithTimeout(MASTER_GAS_URL, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        }, 20000);
        const resp = await r.json();
        if (!resp.ok) throw new Error(resp.error || '생성 실패');
        
        await fetchClubList();
        gsAlert('"' + name + '" 클럽이 생성되었습니다!\n(Google Sheets가 자동으로 만들어졌습니다)', () => {
          if (resp.club) {
            gsConfirm('"' + name + '" 클럽으로 바로 전환하시겠습니까?', ok => {
              if(!ok) return;
              const newClub = clubList.find(function(c){ return c.clubId === resp.club.clubId; });
              if (newClub) { activateClub(newClub, true); showView('weather'); }
            });
          }
        });
      }
    } catch(e) {
      gsAlert('오류: ' + e.message);
    } finally {
      $('loading-overlay').style.display = 'none';
      _clubFormSaving = false; // ✅ 잠금 해제
    }

    closeClubForm();
    renderClubManageList();
  }

  async function deleteClub(clubId) {
    checkMasterPin(async ok => {
      if(!ok) return;
      const club = clubList.find(function(c){ return c.clubId === clubId; });
      if (!club) return;
      if (club.isDefault) { gsAlert('기본 클럽은 삭제할 수 없습니다.'); return; }
      if (currentClub && currentClub.clubId === clubId) {
        gsAlert('현재 활성화된 클럽은 삭제할 수 없습니다.\n다른 클럽으로 전환 후 삭제해주세요.');
        return;
      }
      gsConfirm('"' + club.clubName + '" 클럽을 삭제하시겠습니까?\n\n※ 앱 내 등록만 해제됩니다.\n※ Google Sheets 데이터는 보존됩니다.', async ok2 => {
        if(!ok2) return;
        $('loading-overlay').style.display = 'flex';
        try {
          const r = await fetchWithTimeout(MASTER_GAS_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'deleteClub', clubId: clubId })
          }, 12000);
          const resp = await r.json();
          if (!resp.ok) throw new Error(resp.error || '삭제 실패');
          await fetchClubList();
          renderClubManageList();
          gsAlert('클럽 등록이 해제되었습니다.');
        } catch(e) {
          gsAlert('오류: ' + e.message);
        } finally {
          $('loading-overlay').style.display = 'none';
        }
      });
    });
  }

  // --- 클럽 관리 화면 ---
  function renderClubManageList() {
    const container = $('clubManageList');
    if (!container) return;
    if (clubList.length === 0) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">클럽 목록을 불러오는 중...</div>';
      return;
    }
    container.innerHTML = clubList.map(function(c) {
      const isActive = currentClub && currentClub.clubId === c.clubId;
      return '<div class="club-card-manage" style="' + (isActive ? 'border-color:' + (c.color || '#5D9C76') + ';' : '') + '">' +
        '<span class="club-manage-dot" style="background:' + (c.color || '#5D9C76') + '"></span>' +
        '<div class="club-manage-info">' +
          '<div class="club-manage-name">' + escapeHtml(c.clubName) +
            (isActive ? ' <span style="font-size:11px;color:var(--wimbledon-sage);">(활성)</span>' : '') +
            (c.isDefault ? ' <span style="font-size:10px;color:#999;">(기본)</span>' : '') + 
          '</div>' +
          '<div class="club-manage-url">' + escapeHtml(c.cityKo || c.city || '') + '</div>' +
        '</div>' +
        '<div class="club-manage-actions">' +
          '<button class="club-manage-btn" style="background:var(--aussie-blue);" onclick="openClubEdit(\'' + c.clubId + '\')">수정</button>' +
          (!c.isDefault ? '<button class="club-manage-btn" style="background:var(--roland-clay);" onclick="deleteClub(\'' + c.clubId + '\')">삭제</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }



  // ========================================
  // v3.80: HOME - 코트 정보 시스템
  // ========================================


  function loadCourtInfo() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    
    // ✅ v3.811: 오늘 포함 가장 가까운 미래 공지 찾기
    const upcoming = courtNotices
      .filter(n => n.date >= todayStr)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    
    const notice = upcoming.length > 0 ? upcoming[0] : null;

    if(notice) {
      $('courtName').textContent = notice.courtName || '';
      // ✅ v3.9493: slots 배열 → 시간대별 줄바꿈 표시
      const slots = notice.slots || [{time: notice.time, court: notice.memo}];
      const slotsEl = $('courtSlots');
      if(slotsEl) {
        slotsEl.innerHTML = slots.map(s => {
          const t = s.time || '';
          const c = s.court || '';
          if(!t && !c) return '';
          return `<div style="display:flex; align-items:center; gap:6px;">` +
            (t ? `<span>${t}</span>` : '') +
            (c ? `<span style="font-size:12px; color:var(--wimbledon-sage); font-weight:400; background:rgba(93,156,118,0.1); padding:1px 7px; border-radius:8px;">${c}</span>` : '') +
            `</div>`;
        }).filter(Boolean).join('');
      }
      $('courtAddress').textContent = notice.address || '';
      
      // ✅ v3.816 호환: courtNumber/courtMemo 숨김 유지
      if($('courtNumber')) $('courtNumber').style.display = 'none';
      if($('courtMemo')) $('courtMemo').style.display = 'none';
      
      // 날짜가 오늘이 아니면 날짜 표시
      if(notice.date !== todayStr) {
        const dayNames = ['일','월','화','수','목','금','토'];
        const d = new Date(notice.date + 'T00:00:00');
        const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
        $('courtName').textContent = `[${notice.date.slice(5)}${dayStr}] ${notice.courtName || ''}`;
      }

      // 공지 있으면 카드 표시
      $('courtInfoCard').style.display = 'block';
      $('courtInfoContent').style.display = 'block';
      $('courtNoNotice').style.display = 'none';
    } else {
      // ✅ v3.817: 공지 없으면 빈 정보 대신 안내 메시지 (모든 클럽 동일)
      $('courtInfoCard').style.display = 'block';
      $('courtInfoContent').style.display = 'none';
      $('courtNoNotice').style.display = 'block';
    }
  }

  function openCourtMap() {
    const address = $('courtAddress').textContent;
    if(!address) return;
    const url = `https://map.naver.com/v5/search/${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  }

  // ========================================
  // v3.80: HOME - 공지사항 시스템
  // ========================================

  function loadNotices() {
    const listEl = $('noticeList');
    if(!listEl) return;

    // 삭제되지 않은 공지만 필터, 최대 5개
    const active = announcements
      .filter(a => !a.deleted)
      .sort((a,b) => {
        // 중요 공지 상단 고정
        if(a.isImportant && !b.isImportant) return -1;
        if(!a.isImportant && b.isImportant) return 1;
        // 등록일 최신순
        return (b.registeredDate || '').localeCompare(a.registeredDate || '');
      })
      .slice(0, 5);

    if(active.length === 0) {
      listEl.innerHTML = '<div class="notice-empty">등록된 공지가 없습니다.</div>';
      return;
    }

    listEl.innerHTML = active.map(a => {
      const importantClass = a.isImportant ? ' important' : '';
      const badge = a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : '';
      const dateStr = a.registeredDate ? a.registeredDate.replace(/-/g,'.') : '';
      const titleHtml = escapeHtml(a.title).replace(/\n/g, '<br>');
      return `
        <div class="notice-item${importantClass}">
          <div class="notice-title-row">
            ${badge}
            <span>${titleHtml}</span>
          </div>
          <div class="notice-date">${dateStr} 등록</div>
        </div>
      `;
    }).join('');
  }

  // ========================================
  // v3.80: HOME - 카톡 공유 시스템
  // ========================================

  function toggleShareDropdown() {
    const dd = $('shareDropdown');
    if(!dd) return;
    dd.classList.toggle('active');
    // 외부 클릭 시 닫기
    if(dd.classList.contains('active')) {
      setTimeout(() => {
        document.addEventListener('click', closeShareDropdownOnOutside, { once: true });
      }, 10);
    }
  }

  function closeShareDropdownOnOutside(e) {
    const dd = $('shareDropdown');
    const wrap = dd?.parentElement;
    if(wrap && !wrap.contains(e.target)) {
      dd.classList.remove('active');
    } else if(dd?.classList.contains('active')) {
      // 드롭다운 아이템 클릭이면 알아서 닫힘
    }
  }

  function shareContent(mode) {
    $('shareDropdown').classList.remove('active');

    const courtName = $('courtName')?.textContent || '';
    const courtTime = $('courtTime')?.textContent || '';
    const courtNumber = $('courtNumber')?.textContent || '';
    const courtAddress = $('courtAddress')?.textContent || '';
    const dateDisp = $('dateDisplay')?.textContent || '';

    // ✅ v3.816: 코트 번호가 있으면 시간 뒤에 붙여서 표시
    const courtTimeWithNum = courtNumber ? `${courtTime}  <${courtNumber}>` : courtTime;

    // 날씨 요약 생성
    let weatherSummary = '';
    const rows = $('tbody')?.querySelectorAll('tr');
    if(rows && rows.length > 0) {
      const temps = [];
      let weatherIcon = '☀️';
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if(cells.length >= 3) {
          const temp = parseFloat(cells[2].textContent);
          if(!isNaN(temp)) temps.push(temp);
          if(cells[1]) weatherIcon = cells[1].textContent.trim();
        }
      });
      if(temps.length > 0) {
        const minT = Math.min(...temps).toFixed(1);
        const maxT = Math.max(...temps).toFixed(1);
        weatherSummary = `${weatherIcon} 날씨: ${minT}~${maxT}°C`;
      }
    }

    let text = '';

    if(mode === 'weather' || mode === 'weather+court' || mode === 'all') {
      text += `🎾 ${dateDisp} 정보\n`;
      if(weatherSummary) text += `${weatherSummary}\n`;
    }

    if(mode === 'weather+court' || mode === 'all' || mode === 'text') {
      text += `📍 ${courtName}\n`;
      text += `⏰ ${courtTimeWithNum}\n`;
      if(courtAddress) text += `🗺️ ${courtAddress}\n`;
    }

    if(mode === 'all') {
      const activeNotices = announcements.filter(a => !a.deleted).slice(0, 5);
      if(activeNotices.length > 0) {
        text += `\n📢 공지사항\n`;
        activeNotices.forEach(a => {
          const prefix = a.isImportant ? '⭐ ' : '• ';
          text += `${prefix}${a.title}\n`;
        });
      }
    }

    if(mode === 'text') {
      text = `🎾 ${dateDisp} 정보\n`;
      text += `📍 ${courtName}\n`;
      text += `⏰ ${courtTimeWithNum}\n`;
      if(courtAddress) text += `🗺️ ${courtAddress}\n`;
      if(weatherSummary) text += `${weatherSummary}\n`;
    }

    // 클립보드에 복사
    if(navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text.trim()).then(() => {
        gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.');
      }).catch(() => {
        fallbackCopy(text.trim());
      });
    } else {
      fallbackCopy(text.trim());
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.');
    } catch(e) {
      gsAlert('복사 실패. 직접 선택하여 복사해주세요.');
    }
    document.body.removeChild(ta);
  }


  // ========================================
  // 코트 공지 관리 CRUD + 프리셋 + 슬롯 (v3.811)
  // ========================================

  function getCourtPresetKey() {
    return 'grandslam_court_presets_' + getActiveClubId();
  }

  function loadCourtPresets() {
    try {
      courtPresets = JSON.parse(localStorage.getItem(getCourtPresetKey())) || [];
    } catch(e) { courtPresets = []; }
    renderCourtPresetSelect();
  }

  function saveCourtPresetToStorage(preset) {
    const exists = courtPresets.find(p => p.name === preset.name);
    if(!exists) {
      courtPresets.push(preset);
      localStorage.setItem(getCourtPresetKey(), JSON.stringify(courtPresets));
    }
    renderCourtPresetSelect();
  }

  function renderCourtPresetSelect() {
    const sel = $('courtPresetSelect');
    if(!sel) return;
    sel.innerHTML = '<option value="">📌 저장된 코트 선택 (직접 입력)</option>';
    courtPresets.forEach((p, i) => {
      const slotsStr = (p.slots||[]).map(s=>s.time).filter(Boolean).join(', ');
      sel.innerHTML += `<option value="${i}">${escapeHtml(p.name)} ${slotsStr ? '(' + escapeHtml(slotsStr) + ')' : ''}</option>`;
    });
  }

  function applyCourtPreset() {
    const sel = $('courtPresetSelect');
    const idx = parseInt(sel.value);
    if(isNaN(idx) || !courtPresets[idx]) return;
    const p = courtPresets[idx];
    $('courtNoticeName').value = p.name || '';
    $('courtNoticeAddr').value = p.address || '';
    
    // 슬롯 복원
    const container = $('courtSlotRows');
    container.innerHTML = '';
    const slots = p.slots || [{time:'', court:''}];
    slots.forEach(s => {
      const row = document.createElement('div');
      row.className = 'court-slot-row';
      row.style.cssText = 'display:flex; gap:8px; margin-bottom:6px;';
      row.innerHTML = '<input type="text" class="w-input court-slot-time" placeholder="시간 (예: 07:00-11:00)" value="' + escapeHtml(s.time||'') + '" style="flex:1; padding:10px;" /><input type="text" class="w-input court-slot-court" placeholder="코트번호 (예: 11,12번)" value="' + escapeHtml(s.court||'') + '" style="flex:1; padding:10px;" />';
      container.appendChild(row);
    });
    updateAddSlotBtn();
  }

  function addCourtSlotRow() {
    const container = $('courtSlotRows');
    const rows = container.querySelectorAll('.court-slot-row');
    if(rows.length >= 3) return;
    const row = document.createElement('div');
    row.className = 'court-slot-row';
    row.style.cssText = 'display:flex; gap:8px; margin-bottom:6px;';
    row.innerHTML = '<input type="text" class="w-input court-slot-time" placeholder="시간 (예: 07:00-11:00)" style="flex:1; padding:10px;" /><input type="text" class="w-input court-slot-court" placeholder="코트번호 (예: 11,12번)" style="flex:1; padding:10px;" />';
    container.appendChild(row);
    updateAddSlotBtn();
  }

  function updateAddSlotBtn() {
    const rows = $('courtSlotRows').querySelectorAll('.court-slot-row');
    const btn = $('btnAddSlot');
    if(btn) btn.style.display = rows.length >= 3 ? 'none' : 'block';
  }

  function getSlotValues() {
    const rows = $('courtSlotRows').querySelectorAll('.court-slot-row');
    const slots = [];
    rows.forEach(row => {
      const time = row.querySelector('.court-slot-time').value.trim();
      const court = row.querySelector('.court-slot-court').value.trim();
      if(time || court) slots.push({ time, court });
    });
    return slots;
  }

  function addCourtNotice() {
    const date = $('courtNoticeDate').value;
    const name = $('courtNoticeName').value.trim();
    const addr = $('courtNoticeAddr').value.trim();
    const slots = getSlotValues();

    if(!date || !name) { gsAlert("날짜와 코트명은 필수입니다."); return; }

    const notice = {
      id: Date.now().toString(),
      date: date,
      courtName: name,
      address: addr,
      slots: slots.length > 0 ? slots : [{time:'', court:''}],
      time: slots.map(s=>s.time).filter(Boolean).join(' / '),
      memo: slots.map(s=>s.court).filter(Boolean).join(', ')
    };

    courtNotices.push(notice);
    saveCourtPresetToStorage({ name, address: addr, slots: notice.slots });
    $('courtNoticeDate').value = '';
    renderCourtNoticeList();
    loadCourtInfo();
    saveCourtNotice(notice);
  }

  function deleteCourtNotice(id) {
    gsConfirm('삭제할까요?', ok => {
      if(!ok) return;
      courtNotices = courtNotices.filter(n => n.id !== id);
      persistCourtNoticesLocal();
      renderCourtNoticeList();
      loadCourtInfo();
      // ✅ v3.83: GAS에도 저장
      pushCourtNoticesToGAS();
    });
  }

  function renderCourtNoticeList() {
    const list = $('courtNoticeList');
    const sorted = [...courtNotices].sort((a,b) => (a.date||'').localeCompare(b.date||''));

    if(sorted.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 코트 공지가 없습니다.</div>';
      return;
    }

    list.innerHTML = sorted.map(n => {
      const dayNames = ['일','월','화','수','목','금','토'];
      const d = new Date(n.date + 'T00:00:00');
      const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
      const slots = n.slots || [{time: n.time, court: n.memo}];
      const slotsHtml = slots.map(s => {
        const parts = [];
        if(s.time) parts.push('⏰ ' + escapeHtml(s.time));
        if(s.court) parts.push('🎾 ' + escapeHtml(s.court));
        return parts.length > 0 ? '<div style="font-size:12px; color:var(--text-gray); margin-top:2px;">' + parts.join(' &nbsp; ') + '</div>' : '';
      }).join('');
      
      return '<div class="crud-item"><div class="crud-item-header"><div>' +
        '<div style="font-size:14px; color:var(--text-dark);">' + escapeHtml(n.date) + dayStr + '</div>' +
        '<div style="font-size:15px; margin-top:4px;">' + escapeHtml(n.courtName) + '</div>' +
        slotsHtml +
        (n.address ? '<div style="font-size:12px; color:var(--text-gray);">📍 ' + escapeHtml(n.address) + '</div>' : '') +
        '</div><div class="crud-item-actions">' +
        '<button class="crud-btn crud-btn-del" onclick="deleteCourtNotice(\'' + n.id + '\')">삭제</button>' +
        '</div></div></div>';
    }).join('');
  }

  // ========================================
  // 공지사항 관리 CRUD (최대 5개)
  // ========================================

  function addAnnouncement() {
    const active = announcements.filter(a => !a.deleted);
    if(active.length >= 5) { gsAlert('공지는 최대 5개까지만 등록 가능합니다.'); return; }

    const title = $('announcementTitle').value.trim();
    const isImportant = $('announcementImportant').checked;

    if(!title) { gsAlert('공지 내용을 입력하세요.'); return; }

    const today = new Date().toISOString().slice(0,10);
    announcements.push({
      id: Date.now().toString(),
      title: title,
      isImportant: isImportant,
      registeredDate: today,
      deleted: false
    });

    $('announcementTitle').value = '';
    $('announcementImportant').checked = false;

    renderAnnouncementMgmtList();
    loadNotices();
    saveAnnouncement(announcements[announcements.length - 1]);
  }

  function deleteAnnouncement(id) {
    gsConfirm('삭제할까요?', ok => {
      if(!ok) return;
      const ann = announcements.find(a => a.id === id);
      if(ann) ann.deleted = true;
      persistAnnouncementsLocal();
      renderAnnouncementMgmtList();
      loadNotices();
      // ✅ v3.83: GAS에도 저장
      pushAnnouncementsToGAS();
    });
  }

  function renderAnnouncementMgmtList() {
    const list = $('announcementMgmtList');
    const active = announcements.filter(a => !a.deleted);

    if(active.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 공지가 없습니다.</div>';
      return;
    }

    list.innerHTML = active.map(a => {
      const titleHtml = escapeHtml(a.title).replace(/\n/g, '<br>');
      return `
        <div class="crud-item">
          <div class="crud-item-header">
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : ''}
                <span style="font-size:15px;">${titleHtml}</span>
              </div>
              <div style="font-size:11px; color:var(--text-gray); margin-top:4px;">${(a.registeredDate||'').replace(/-/g,'.')} 등록</div>
            </div>
            <div class="crud-item-actions">
              <button class="crud-btn crud-btn-del" onclick="deleteAnnouncement('${a.id}')">삭제</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ========================================
  // WEATHER SYSTEM (날씨) - v3.81: 한글 검색 지원
  // ========================================
  
  function openNaverWeather() {
    const cityKo = currentClub ? (currentClub.cityKo || '광명') : '광명';
    window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(cityKo + ' 날씨'), '_blank');
  }

  // ✅ v3.81: Geocoding API로 도시명 → 좌표 변환
  async function geocodeCity(cityName) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ko`;
      const r = await fetchWithTimeout(url, {}, 8000);
      if(!r.ok) return null;
      const data = await r.json();
      if(data.results && data.results.length > 0) {
        const res = data.results[0];
        return { lat: res.latitude, lon: res.longitude, name: res.name || cityName };
      }
      return null;
    } catch(e) {
      console.warn('geocodeCity error:', e);
      return null;
    }
  }

  async function loadWeather(d) {
    $('tbl').style.display = "none";
    $('dynamicTip').style.display = "none";
    $("tbody").innerHTML = "";
    setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">날씨 불러오는 중...</div>`);

    // ✅ v3.8204: 검색창 비어있으면 club.city fallback 사용
    const cityInputEl = $('city');
    const cityInput = (cityInputEl && cityInputEl.value.trim()) ? cityInputEl.value.trim() : (currentClub && currentClub.city ? currentClub.city : '');
    if(cityInput && cityInput !== weatherCoords.name) {
      const geo = await geocodeCity(cityInput);
      if(geo) {
        weatherCoords = geo;
        // ✅ v3.817: 헤더는 cityKo(한글) 우선, 없으면 geo.name
        const displayCityName = (currentClub && currentClub.cityKo) ? currentClub.cityKo : geo.name;
        const headerBanner = document.querySelector('#view-home .header-banner');
        if(headerBanner) headerBanner.innerHTML = '<span class="material-symbols-outlined">wb_sunny</span>' + escapeHtml(displayCityName) + ' 날씨';
      } else {
        setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">"${escapeHtml(cityInput)}" 검색 실패. 기존 위치로 표시합니다.</div>`);
      }
    }

    const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    $('dateDisplay').innerText = `${ds} ${['일','월','화','수','목','금','토'][d.getDay()]}요일`;
    $('dateDisplay').style.display = "block";

    try {
      const api = `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat}&longitude=${weatherCoords.lon}&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m&timezone=Asia/Seoul&start_date=${ds}&end_date=${ds}`;
      const r = await fetchWithTimeout(api, {}, 12000);
      if(!r.ok) throw new Error("Weather API 실패: " + r.status);
      const j = await r.json();
      if(!j || !j.hourly || !Array.isArray(j.hourly.time)) throw new Error("Weather 데이터 형식 이상");

      const WX = { 0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 61: "🌦️", 63: "🌧️", 71: "❄️", 80: "🚿" };
      const wanted = [];
      for (let i=0; i<j.hourly.time.length; i++) {
        const tStr = j.hourly.time[i];
        if(!tStr || typeof tStr !== "string") continue;
        const hhmm = tStr.split("T")[1];
        if(!hhmm) continue;
        const hh = parseInt(hhmm.slice(0,2), 10);
        if(hh >= weatherTimeRange.startH && hh <= weatherTimeRange.endH) wanted.push(i);
      }
      if(wanted.length === 0) throw new Error("05~12시 데이터 없음");

      let tR = 0, mW = 0, aT = 0;

      wanted.forEach((i) => {
        const timeStr = j.hourly.time[i];
        const hh = timeStr.split("T")[1].slice(0,2);
        const t = j.hourly.temperature_2m?.[i];
        const c = j.hourly.weather_code?.[i];
        const rn = j.hourly.precipitation?.[i];
        const w = j.hourly.wind_speed_10m?.[i];
        if([t,c,rn,w].some(v => v === undefined || v === null)) return;

        tR += rn;
        mW = Math.max(mW, w);
        aT += t;

        const icon = (rn > 0) ? "🌦️" : (WX[c] || "☁️");
        $("tbody").innerHTML += `<tr><td>${hh}시</td><td>${icon}</td><td>${t.toFixed(1)}°</td><td>${rn.toFixed(1)}</td><td>${w.toFixed(1)}</td></tr>`;
      });

      const count = $("tbody").querySelectorAll("tr").length;
      if(count === 0) throw new Error("표에 표시할 데이터가 없음");
      aT /= count;

      $("tipContent").innerText =
        (tR > 0) ? "💡 비 소식! 실내 코트 추천! ☔"
        : (mW >= 5) ? "💡 바람이 세요! 바람막이 준비하세요!💨"
        : (aT <= 5) ? `💡 현재 ${aT.toFixed(1)}도! 추워요. 뜨끈 커피 챙기세요☕`
        : "💡 테니스 치기 딱 좋은 날씨! 🎾";

      $("dynamicTip").style.display="block";
      $("tbl").style.display="table";
      setStatus('');
    } catch(e) {
      setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">날씨 로드 실패 😵‍💫</div>`);
    }
  }

  function getWed(o) {
    const d = new Date();
    d.setDate(d.getDate() + (3 - d.getDay() + 7) % 7 + o);
    return d;
  }

  // ✅ v3.811: 코트 공지 기반 다음 모임 날짜 찾기
  var weatherTimeRange = { startH: 5, endH: 12 };

  function getNextMeetingDates() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    
    // 오늘 포함 미래 코트 공지를 날짜순 정렬
    const futureDates = courtNotices
      .map(n => n.date)
      .filter(d => d >= todayStr)
      .sort()
      .filter((v,i,a) => a.indexOf(v) === i); // 중복 제거

    return futureDates;
  }

  function loadWeatherForNextMeeting(index) {
    const dates = getNextMeetingDates();
    
    if(dates.length > index) {
      const dateStr = dates[index];
      const d = new Date(dateStr + 'T12:00:00');
      
      // ✅ 해당 날짜의 코트 공지에서 시간대 파싱
      const dayNotices = courtNotices.filter(n => n.date === dateStr);
      let startH = 5, endH = 12; // 기본값
      
      if(dayNotices.length > 0) {
        const allSlots = dayNotices.flatMap(n => n.slots || [{time: n.time}]);
        let earliest = 24, latest = 0;
        allSlots.forEach(s => {
          if(!s.time) return;
          const m = s.time.match(/(\d{1,2}):?\d{0,2}\s*[-~]\s*(\d{1,2})/);
          if(m) {
            earliest = Math.min(earliest, parseInt(m[1]));
            latest = Math.max(latest, parseInt(m[2]));
          }
        });
        if(earliest < 24 && latest > 0) {
          startH = Math.max(0, earliest - 3);
          endH = Math.min(23, latest + 1);
        }
      }
      
      weatherTimeRange = { startH, endH };
      loadWeather(d);
    } else {
      // 코트 공지 없으면 기존 수요일 fallback
      weatherTimeRange = { startH: 5, endH: 12 };
      loadWeather(getWed(index * 7));
    }
    
    if($('btnRefresh')) $('btnRefresh').classList.toggle('active', index === 0);
    if($('btnNext')) $('btnNext').classList.toggle('active', index === 1);
  }
