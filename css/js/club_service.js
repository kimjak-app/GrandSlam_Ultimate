// ----------------------------------------
// 8. 코트 정보
// ----------------------------------------

function loadCourtInfo() {
  const todayStr  = new Date().toISOString().slice(0, 10);
  const upcoming  = courtNotices.filter(n => n.date >= todayStr).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const notice    = upcoming.length > 0 ? upcoming[0] : null;

  if (notice) {
    const slots = notice.slots || [{ time: notice.time, court: notice.memo }];
    $('courtName').textContent = notice.courtName || '';

    const slotDisplay = $('courtSlotDisplay');
    if (slotDisplay) {
      slotDisplay.innerHTML = slots.filter(s => s.time || s.court).map(s => {
        const courtBadge = s.court
          ? `<span style="margin-left:8px; font-size:13px; color:var(--wimbledon-sage); font-weight:400; background:rgba(93,156,118,0.1); padding:2px 8px; border-radius:8px;">${escapeHtml(s.court)}</span>`
          : '';
        return `<div style="display:flex; align-items:center;">${escapeHtml(s.time || '')}${courtBadge}</div>`;
      }).join('');
    }

    $('courtAddress').textContent = notice.address || '';
    $('courtMemo').style.display = 'none';

    if (notice.date !== todayStr) {
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      const d = new Date(notice.date + 'T00:00:00');
      const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
      $('courtName').textContent = `[${notice.date.slice(5)}${dayStr}] ${notice.courtName || ''}`;
    }

    $('courtInfoCard').style.display    = 'block';
    $('courtInfoContent').style.display = 'block';
    $('courtNoNotice').style.display    = 'none';
  } else {
    $('courtInfoCard').style.display    = 'block';
    $('courtInfoContent').style.display = 'none';
    $('courtNoNotice').style.display    = 'block';
  }
}

function openCourtMap() {
  const address = $('courtAddress').textContent;
  if (!address) return;
  window.open(`https://map.naver.com/v5/search/${encodeURIComponent(address)}`, '_blank');
}


// ----------------------------------------
// 9. 공지사항
// ----------------------------------------

function loadNotices() {
  const listEl = $('noticeList');
  if (!listEl) return;

  const active = announcements
    .filter(a => !a.deleted)
    .sort((a, b) => {
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      return (b.registeredDate || '').localeCompare(a.registeredDate || '');
    })
    .slice(0, 5);

  if (active.length === 0) {
    listEl.innerHTML = '<div class="notice-empty">등록된 공지가 없습니다.</div>';
    return;
  }

  listEl.innerHTML = active.map(a => {
    const badge   = a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : '';
    const dateStr = a.registeredDate ? a.registeredDate.replace(/-/g, '.') : '';
    return `<div class="notice-item${a.isImportant ? ' important' : ''}">
      <div class="notice-title-row">${badge}<span>${escapeHtml(a.title).replace(/\n/g, '<br>')}</span></div>
      <div class="notice-date">${dateStr} 등록</div>
    </div>`;
  }).join('');
}


// ----------------------------------------
// 10. 카톡 공유
// ----------------------------------------

function toggleShareDropdown() {
  const dd = $('shareDropdown');
  if (!dd) return;
  dd.classList.toggle('active');
  if (dd.classList.contains('active')) {
    setTimeout(() => { document.addEventListener('click', closeShareDropdownOnOutside, { once: true }); }, 10);
  }
}

function closeShareDropdownOnOutside(e) {
  const dd   = $('shareDropdown');
  const wrap = dd?.parentElement;
  if (wrap && !wrap.contains(e.target)) dd.classList.remove('active');
}

function shareContent(mode) {
  $('shareDropdown').classList.remove('active');

  const courtName    = $('courtName')?.textContent || '';
  const courtAddress = $('courtAddress')?.textContent || '';
  const dateDisp     = $('dateDisplay')?.textContent || '';

  const slotRows = $('courtSlotDisplay')?.querySelectorAll('div') || [];
  const courtTimeWithNum = Array.from(slotRows).map(r => r.textContent.trim()).filter(Boolean).join(' / ');

  let weatherSummary = '';
  const rows = $('tbody')?.querySelectorAll('tr');
  if (rows && rows.length > 0) {
    const temps = [];
    let weatherIcon = '☀️';
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        const temp = parseFloat(cells[2].textContent);
        if (!isNaN(temp)) temps.push(temp);
        if (cells[1]) weatherIcon = cells[1].textContent.trim();
      }
    });
    if (temps.length > 0) {
      weatherSummary = `${weatherIcon} 날씨: ${Math.min(...temps).toFixed(1)}~${Math.max(...temps).toFixed(1)}°C`;
    }
  }

  let text = '';
  if (mode === 'weather' || mode === 'weather+court' || mode === 'all') {
    text += `🎾 ${dateDisp} 정보\n`;
    if (weatherSummary) text += `${weatherSummary}\n`;
  }
  if (mode === 'weather+court' || mode === 'all' || mode === 'text') {
    text += `📍 ${courtName}\n⏰ ${courtTimeWithNum}\n`;
    if (courtAddress) text += `🗺️ ${courtAddress}\n`;
  }
  if (mode === 'all') {
    const activeNotices = announcements.filter(a => !a.deleted).slice(0, 5);
    if (activeNotices.length > 0) {
      text += `\n📢 공지사항\n`;
      activeNotices.forEach(a => { text += `${a.isImportant ? '⭐ ' : '• '}${a.title}\n`; });
    }
  }
  if (mode === 'text') {
    text = `🎾 ${dateDisp} 정보\n📍 ${courtName}\n⏰ ${courtTimeWithNum}\n`;
    if (courtAddress) text += `🗺️ ${courtAddress}\n`;
    if (weatherSummary) text += `${weatherSummary}\n`;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text.trim()).then(() => gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.')).catch(() => fallbackCopy(text.trim()));
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
  try { document.execCommand('copy'); gsAlert('📋 클립보드에 복사되었습니다!\n카카오톡에 붙여넣기 하세요.'); }
  catch (e) { gsAlert('복사 실패. 직접 선택하여 복사해주세요.'); }
  document.body.removeChild(ta);
}


// ----------------------------------------
// 11. 코트 공지 CRUD
// ----------------------------------------

function getCourtPresetKey() { return 'grandslam_court_presets_' + getActiveClubId(); }

function loadCourtPresets() {
  try { courtPresets = JSON.parse(localStorage.getItem(getCourtPresetKey())) || []; }
  catch (e) { courtPresets = []; }
  renderCourtPresetSelect();
}

function saveCourtPresetToStorage(preset) {
  if (!courtPresets.find(p => p.name === preset.name)) {
    courtPresets.push(preset);
    localStorage.setItem(getCourtPresetKey(), JSON.stringify(courtPresets));
  }
  renderCourtPresetSelect();
}

function renderCourtPresetSelect() {
  const sel = $('courtPresetSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">📌 저장된 코트 선택 (직접 입력)</option>' +
    courtPresets.map((p, i) => {
      const slotsStr = (p.slots || []).map(s => s.time).filter(Boolean).join(', ');
      return `<option value="${i}">${escapeHtml(p.name)}${slotsStr ? ' (' + escapeHtml(slotsStr) + ')' : ''}</option>`;
    }).join('');
}

function applyCourtPreset() {
  const sel = $('courtPresetSelect');
  const idx = parseInt(sel.value);
  if (isNaN(idx) || !courtPresets[idx]) return;
  const p = courtPresets[idx];
  $('courtNoticeName').value = p.name    || '';
  $('courtNoticeAddr').value = p.address || '';

  const container = $('courtSlotRows');
  container.innerHTML = '';
  (p.slots || [{ time: '', court: '' }]).forEach(s => {
    container.appendChild(_makeSlotRow(s));
  });
  updateAddSlotBtn();
}

function _makeSlotRow(s = {}) {
  const [tStart, tEnd] = (s.time || '').split('-');
  const row = document.createElement('div');
  row.className = 'court-slot-row';
  row.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-bottom:8px;';
  row.innerHTML =
    `<div style="display:flex; gap:6px; align-items:center;">` +
    `<input type="time" class="w-input court-slot-time-start" value="${escapeHtml((tStart || '').trim())}" style="flex:1; padding:10px;" />` +
    `<span style="font-size:14px; color:#999; flex-shrink:0;">~</span>` +
    `<input type="time" class="w-input court-slot-time-end" value="${escapeHtml((tEnd || '').trim())}" style="flex:1; padding:10px;" /></div>` +
    `<input type="text" class="w-input court-slot-court" placeholder="코트번호 (예: 11,12번)" value="${escapeHtml(s.court || '')}" style="width:100%; padding:10px; box-sizing:border-box;" />`;
  return row;
}

function addCourtSlotRow() {
  const container = $('courtSlotRows');
  if (container.querySelectorAll('.court-slot-row').length >= 5) return;
  container.appendChild(_makeSlotRow());
  updateAddSlotBtn();
}

function updateAddSlotBtn() {
  const rows = $('courtSlotRows').querySelectorAll('.court-slot-row');
  const btn  = $('btnAddSlot');
  if (btn) btn.style.display = rows.length >= 5 ? 'none' : 'block';
}

function getSlotValues() {
  const rows  = $('courtSlotRows').querySelectorAll('.court-slot-row');
  const slots = [];
  rows.forEach(row => {
    const tStart = row.querySelector('.court-slot-time-start')?.value.trim() || '';
    const tEnd   = row.querySelector('.court-slot-time-end')?.value.trim()   || '';
    const time   = tStart && tEnd ? tStart + '-' + tEnd : (tStart || tEnd);
    const court  = row.querySelector('.court-slot-court').value.trim();
    if (time || court) slots.push({ time, court });
  });
  return slots;
}

function addCourtNotice() {
  const date  = $('courtNoticeDate').value;
  const name  = $('courtNoticeName').value.trim();
  const addr  = $('courtNoticeAddr').value.trim();
  const slots = getSlotValues();

  if (!date || !name) { gsAlert('날짜와 코트명은 필수입니다.'); return; }

  const notice = {
    id: Date.now().toString(), date, courtName: name, address: addr,
    slots: slots.length > 0 ? slots : [{ time: '', court: '' }],
    time: slots.map(s => s.time).filter(Boolean).join(' / '),
    memo: slots.map(s => s.court).filter(Boolean).join(', ')
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
    if (!ok) return;
    courtNotices = courtNotices.filter(n => n.id !== id);
    persistCourtNoticesLocal();
    renderCourtNoticeList();
    loadCourtInfo();
    pushCourtNotices();
  });
}

function renderCourtNoticeList() {
  const list   = $('courtNoticeList');
  const sorted = [...courtNotices].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 코트 공지가 없습니다.</div>';
    return;
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  list.innerHTML = sorted.map(n => {
    const d      = new Date(n.date + 'T00:00:00');
    const dayStr = isNaN(d.getTime()) ? '' : ` (${dayNames[d.getDay()]})`;
    const slots  = n.slots || [{ time: n.time, court: n.memo }];
    const slotsHtml = slots.map(s => {
      const parts = [];
      if (s.time)  parts.push('⏰ ' + escapeHtml(s.time));
      if (s.court) parts.push('🎾 ' + escapeHtml(s.court));
      return parts.length > 0 ? `<div style="font-size:12px; color:var(--text-gray); margin-top:2px;">${parts.join(' &nbsp; ')}</div>` : '';
    }).join('');

    return `<div class="crud-item"><div class="crud-item-header"><div>` +
      `<div style="font-size:14px; color:var(--text-dark);">${escapeHtml(n.date)}${dayStr}</div>` +
      `<div style="font-size:15px; margin-top:4px;">${escapeHtml(n.courtName)}</div>` +
      slotsHtml +
      (n.address ? `<div style="font-size:12px; color:var(--text-gray);">📍 ${escapeHtml(n.address)}</div>` : '') +
      `</div><div class="crud-item-actions">` +
      `<button class="crud-btn crud-btn-del" onclick="deleteCourtNotice('${n.id}')">삭제</button>` +
      `</div></div></div>`;
  }).join('');
}


// ----------------------------------------
// 12. 공지사항 CRUD
// ----------------------------------------

function addAnnouncement() {
  const active = announcements.filter(a => !a.deleted);
  if (active.length >= 5) { gsAlert('공지는 최대 5개까지만 등록 가능합니다.'); return; }

  const title       = $('announcementTitle').value.trim();
  const isImportant = $('announcementImportant').checked;
  if (!title) { gsAlert('공지 내용을 입력하세요.'); return; }

  announcements.push({
    id: Date.now().toString(), title, isImportant,
    registeredDate: new Date().toISOString().slice(0, 10), deleted: false
  });

  $('announcementTitle').value = '';
  $('announcementImportant').checked = false;
  renderAnnouncementMgmtList();
  loadNotices();
  saveAnnouncement(announcements[announcements.length - 1]);
}

function deleteAnnouncement(id) {
  gsConfirm('삭제할까요?', ok => {
    if (!ok) return;
    const ann = announcements.find(a => a.id === id);
    if (ann) ann.deleted = true;
    persistAnnouncementsLocal();
    renderAnnouncementMgmtList();
    loadNotices();
    pushAnnouncements();
  });
}

function renderAnnouncementMgmtList() {
  const list   = $('announcementMgmtList');
  const active = announcements.filter(a => !a.deleted);

  if (active.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-gray); font-size:13px;">등록된 공지가 없습니다.</div>';
    return;
  }

  list.innerHTML = active.map(a => `
    <div class="crud-item">
      <div class="crud-item-header">
        <div>
          <div style="display:flex; align-items:center; gap:6px;">
            ${a.isImportant ? '<span class="notice-badge">⭐ 중요</span>' : ''}
            <span style="font-size:15px;">${escapeHtml(a.title).replace(/\n/g, '<br>')}</span>
          </div>
          <div style="font-size:11px; color:var(--text-gray); margin-top:4px;">${(a.registeredDate || '').replace(/-/g, '.')} 등록</div>
        </div>
        <div class="crud-item-actions">
          <button class="crud-btn crud-btn-del" onclick="deleteAnnouncement('${a.id}')">삭제</button>
        </div>
      </div>
    </div>`).join('');
}


// ----------------------------------------
// 13. 날씨
// ----------------------------------------

function openNaverWeather() {
  const cityKo = currentClub ? (currentClub.cityKo || '광명') : '광명';
  window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(cityKo + ' 날씨'), '_blank');
}

async function geocodeCity(cityName) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=ko`;
    const r = await fetchWithTimeout(url, {}, 8000);
    if (!r.ok) return null;
    const data = await r.json();
    if (data.results?.length > 0) {
      const res = data.results[0];
      return { lat: res.latitude, lon: res.longitude, name: res.name || cityName };
    }
    return null;
  } catch (e) {
    console.warn('geocodeCity error:', e);
    return null;
  }
}

async function loadWeather(d) {
  $('tbl').style.display   = 'none';
  $('dynamicTip').style.display = 'none';
  $('tbody').innerHTML = '';
  setStatus(`<div style="color:#888; font-size:12px; margin-bottom:10px;">날씨 불러오는 중...</div>`);

  const cityInputEl = $('city');
  const cityInput   = (cityInputEl?.value.trim()) ? cityInputEl.value.trim() : (currentClub?.city || '');

  if (cityInput && cityInput !== weatherCoords.name) {
    const geo = await geocodeCity(cityInput);
    if (geo) {
      weatherCoords = geo;
      const displayCityName = currentClub?.cityKo || geo.name;
      const headerBanner = document.querySelector('#view-home .header-banner');
      if (headerBanner) headerBanner.innerHTML = '<span class="material-symbols-outlined">wb_sunny</span>' + escapeHtml(displayCityName) + ' 날씨';
    } else {
      setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">"${escapeHtml(cityInput)}" 검색 실패. 기존 위치로 표시합니다.</div>`);
    }
  }

  const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('dateDisplay').innerText = `${ds} ${['일','월','화','수','목','금','토'][d.getDay()]}요일`;
  $('dateDisplay').style.display = 'block';

  try {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${weatherCoords.lat}&longitude=${weatherCoords.lon}&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m&timezone=Asia/Seoul&start_date=${ds}&end_date=${ds}`;
    const r = await fetchWithTimeout(api, {}, 12000);
    if (!r.ok) throw new Error('Weather API 실패: ' + r.status);
    const j = await r.json();
    if (!j?.hourly?.time || !Array.isArray(j.hourly.time)) throw new Error('Weather 데이터 형식 이상');

    const WX = { 0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️', 45:'🌫️', 61:'🌦️', 63:'🌧️', 71:'❄️', 80:'🚿' };
    const wanted = [];
    j.hourly.time.forEach((tStr, i) => {
      if (!tStr) return;
      const hh = parseInt(tStr.split('T')[1]?.slice(0, 2), 10);
      if (hh >= weatherTimeRange.startH && hh <= weatherTimeRange.endH) wanted.push(i);
    });
    if (wanted.length === 0) throw new Error('시간대 데이터 없음');

    let tR = 0, mW = 0, aT = 0;
    wanted.forEach(i => {
      const tStr = j.hourly.time[i];
      const hh   = tStr.split('T')[1].slice(0, 2);
      const t = j.hourly.temperature_2m?.[i];
      const c = j.hourly.weather_code?.[i];
      const rn = j.hourly.precipitation?.[i];
      const w = j.hourly.wind_speed_10m?.[i];
      if ([t, c, rn, w].some(v => v == null)) return;
      tR += rn; mW = Math.max(mW, w); aT += t;
      const icon = rn > 0 ? '🌦️' : (WX[c] || '☁️');
      $('tbody').innerHTML += `<tr><td>${hh}시</td><td>${icon}</td><td>${t.toFixed(1)}°</td><td>${rn.toFixed(1)}</td><td>${w.toFixed(1)}</td></tr>`;
    });

    const count = $('tbody').querySelectorAll('tr').length;
    if (count === 0) throw new Error('표에 표시할 데이터 없음');
    aT /= count;

    $('tipContent').innerText = tR > 0
      ? '💡 비 소식! 실내 코트 추천! ☔'
      : mW >= 5 ? '💡 바람이 세요! 바람막이 준비하세요!💨'
      : aT <= 5 ? `💡 현재 ${aT.toFixed(1)}도! 추워요. 뜨끈 커피 챙기세요☕`
      : '💡 테니스 치기 딱 좋은 날씨! 🎾';

    $('dynamicTip').style.display = 'block';
    $('tbl').style.display = 'table';
    setStatus('');
  } catch (e) {
    setStatus(`<div style="color:#ff3b30; font-size:12px; margin-bottom:10px;">날씨 로드 실패 😵‍💫</div>`);
  }
}

function getWed(o) {
  const d = new Date();
  d.setDate(d.getDate() + (3 - d.getDay() + 7) % 7 + o);
  return d;
}

var weatherTimeRange = { startH: 5, endH: 12 };

function getNextMeetingDates() {
  const todayStr = new Date().toISOString().slice(0, 10);
  return courtNotices
    .map(n => n.date)
    .filter(d => d >= todayStr)
    .sort()
    .filter((v, i, a) => a.indexOf(v) === i);
}

function loadWeatherForNextMeeting(index) {
  const dates = getNextMeetingDates();

  if (dates.length > index) {
    const dateStr = dates[index];
    const d = new Date(dateStr + 'T12:00:00');

    const dayNotices = courtNotices.filter(n => n.date === dateStr);
    let startH = 5, endH = 12;

    if (dayNotices.length > 0) {
      const allSlots = dayNotices.flatMap(n => n.slots || [{ time: n.time }]);
      let earliest = 24, latest = 0;
      allSlots.forEach(s => {
        if (!s.time) return;
        const m = s.time.match(/(\d{1,2}):?\d{0,2}\s*[-~]\s*(\d{1,2})/);
        if (m) {
          earliest = Math.min(earliest, parseInt(m[1]));
          latest   = Math.max(latest,   parseInt(m[2]));
        }
      });
      if (earliest < 24 && latest > 0) {
        startH = Math.max(0, earliest - 3);
        endH   = Math.min(23, latest + 1);
      }
    }

    weatherTimeRange = { startH, endH };
    loadWeather(d);
  } else {
    weatherTimeRange = { startH: 5, endH: 12 };
    loadWeather(getWed(index * 7));
  }

  if ($('btnRefresh')) $('btnRefresh').classList.toggle('active', index === 0);
  if ($('btnNext'))    $('btnNext').classList.toggle('active',    index === 1);
}

window.openNaverWeather          = openNaverWeather;
window.openCourtMap              = openCourtMap;
window.shareContent              = shareContent;
window.toggleShareDropdown       = toggleShareDropdown;
window.addCourtSlotRow           = addCourtSlotRow;
window.addCourtNotice            = addCourtNotice;
window.deleteCourtNotice         = deleteCourtNotice;
window.applyCourtPreset          = applyCourtPreset;
window.addAnnouncement           = addAnnouncement;
window.deleteAnnouncement        = deleteAnnouncement;
window.loadWeatherForNextMeeting = loadWeatherForNextMeeting;
