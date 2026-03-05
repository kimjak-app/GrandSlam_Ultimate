// ========================================
// GAME_VIEW.JS - 게임 UI/DOM 처리
// ========================================

function renderPoolView() {
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => (b.score || 0) - (a.score || 0));
  const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  const hint = $('hint-1v2');
  if (hint) hint.style.display = 'none';

  const gIcon = p => p.gender === 'F'
    ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
    : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';

  const divider = label => `
    <div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">
      <span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">${label}</span>
    </div>`;

  let html = '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';
  members.forEach((p, i) => {
    const sel = (window.hT?.includes(p.name)) || (window.aT?.includes(p.name));
    const chkId = `pool_p_${i}`;
    html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/'/g, "&#39;")}')">`;
    html += `<label for="${chkId}" class="p-label">${gIcon(p)}${escapeHtml(p.name)}<span class="p-rank">${i + 1}위</span></label>`;
  });
  html += '</div>';

  if (guests.length > 0) {
    html += divider('GUEST LIST');
    html += '<div class="player-pool">';
    guests.forEach((p, i) => {
      const sel = (window.hT?.includes(p.name)) || (window.aT?.includes(p.name));
      const chkId = `pool_g_${i}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(p.name).replace(/'/g, "&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label guest-label">[G] ${escapeHtml(p.name)}</label>`;
    });
    html += '</div>';
  }

  if (oneTimePlayers.length > 0) {
    html += divider('<span style="color:var(--aussie-blue);">당일 게스트</span>');
    html += '<div class="player-pool" style="margin-bottom:4px;">';
    oneTimePlayers.forEach((name, i) => {
      const sel = hT.includes(name) || aT.includes(name);
      const chkId = `pool_ot_${i}`;
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(name)}" ${sel ? 'checked' : ''} onclick="pick('${escapeHtml(name).replace(/'/g, "&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label day-guest-label" style="position:relative; padding-right:22px;">[당일] ${escapeHtml(name)}<span onclick="event.preventDefault();event.stopPropagation();removeOneTimePlayer('${escapeHtml(name).replace(/'/g, "&#39;")}')" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:13px;color:#999;cursor:pointer;line-height:1;">✕</span></label>`;
    });
    html += '</div>';
  }

  const poolContainer = $('pP');
  if (poolContainer) poolContainer.innerHTML = html;
}

function updateRecordCountView() {
  const cnt = $('record-cnt');
  if (cnt) cnt.textContent = hT.length + aT.length;
}

function syncPickedTeamsView() {
  $('hN').innerText = hT.map(displayName).join(',');
  $('aN').innerText = aT.map(displayName).join(',');
  updateRecordCountView();
  renderPoolView();
}

function setMatchTypeView(t) {
  $('m_db').className = t === 'double' ? 'type-btn selected' : 'type-btn';
  $('m_sg').className = t === 'single' ? 'type-btn selected' : 'type-btn';
  const mixedArea = $('mixed-double-btn-area');
  if (mixedArea) mixedArea.style.display = t === 'double' ? 'block' : 'none';
}

function updatePlayerListView() {
  const members = players.filter(p => !p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));
  const guests = players.filter(p => p.isGuest && (!p.status || p.status === 'active')).sort((a, b) => a.name.localeCompare(b.name));

  const rows = [...members, ...guests].map(p => {
    const safe = escapeHtml(p.name).replace(/'/g, '&#39;');
    const typeLabel = p.isGuest ? '<span style="color:var(--text-gray);">게스트</span>' : '회원';
    const gIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:15px; color:#E8437A; vertical-align:middle; margin-right:3px;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:15px; color:#3A7BD5; vertical-align:middle; margin-right:3px;">male</span>';
    const gBtnIcon = p.gender === 'F'
      ? '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:14px; vertical-align:middle;">male</span>';
    const lv = p.level || 'A';
    const lvColor = lv === 'A' ? '#5D9C76' : lv === 'B' ? '#669DB3' : '#D98C73';
    const lvBadge = `<span style="font-size:10px; background:${lvColor}; color:white; border-radius:4px; padding:1px 5px; margin-left:4px; vertical-align:middle; font-weight:600;">${lv}</span>`;
    return `<tr>
      <td style="text-align:left; padding-left:10px; font-weight:400; white-space:nowrap;">${gIcon}${escapeHtml(displayName(p.name))}${lvBadge}</td>
      <td style="text-align:center; font-size:12px; width:50px;">${typeLabel}</td>
      <td style="text-align:right; padding-right:5px; width:180px; white-space:nowrap;">
        <button onclick="editP('${safe}')"       style="background:var(--aussie-blue); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">수정</button>
        <button onclick="toggleGender('${safe}')" style="background:${p.gender === 'F' ? '#E8437A' : '#3A7BD5'}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">${gBtnIcon}</button>
        <button onclick="toggleLevel('${safe}')"  style="background:${lvColor}; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px; font-weight:600;">${lv}</button>
        <button onclick="toggleGuest('${safe}')"  style="background:#8E8E93; color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">구분</button>
        <button onclick="delP('${safe}')"         style="background:var(--roland-clay); color:white; border:none; padding:6px 8px; border-radius:8px; font-size:11px;">삭제</button>
      </td>
    </tr>`;
  }).join('');
  document.querySelector('#pL tbody').innerHTML = rows;
}

function switchViewUI(v, b) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (b) b.classList.add('active');
  showView(v);
}

function showViewUI(v) {
  if (v === 'weather') v = 'home';

  const currentVisible = document.querySelector('.app-screen[style*="display: block"], .app-screen[style*="display:block"]');
  if (currentVisible?.id === 'view-treasurer' && v !== 'treasurer') {
    pushDataOnly().catch(e => console.warn('treasurer 자동저장 오류:', e));
  }

  document.querySelectorAll('.app-screen').forEach(el => el.style.display = 'none');
  const el = document.getElementById(`view-${v}`);
  if (el) el.style.display = 'block';
  setTimeout(applyAutofitAllTables, 0);

  if (v === 'tennis') sync();
  if (v === 'player-mgmt') updatePlayerList();
  if (v === 'record') renderPool();
  if (v === 'ladder') renderLadderPlayerPool();
  if (v === 'tournament') initTournament();
  if (v === 'stats') renderStatsPlayerList();
  if (v === 'round') initRoundPlayerPool();
  if (v === 'round-auto') initRoundAutoPlayerPool();
  if (v === 'club-mgmt') renderClubManageList();
  if (v === 'home') { loadCourtInfo(); loadNotices(); }
  if (v === 'treasurer') resetTreasurerView();
  if (v === 'exchange' && typeof initExchangeView === 'function') initExchangeView();
}

window.GameView = {
  renderPoolView,
  updateRecordCountView,
  syncPickedTeamsView,
  setMatchTypeView,
  updatePlayerListView,
  switchViewUI,
  showViewUI,
};
