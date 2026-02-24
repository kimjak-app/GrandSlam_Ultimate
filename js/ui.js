function checkMasterPin(callback) {
  if (masterUnlocked) { if (callback) callback(true); return; }
  _masterPinCallback = callback || null;
  const modal = $('clubPinModal');
  // 모달 타이틀 텍스트 변경
  const titleEl = modal.querySelector('div[style*="font-size:15px"]');
  if (titleEl) titleEl.textContent = '총괄 관리자 비밀번호를 입력하세요';
  modal.dataset.mode = 'master';
  modal.style.display = 'flex';
  $('clubPinInput').value = '';
  setTimeout(() => $('clubPinInput').focus(), 100);
}

// ✅ v3.820: 커스텀 Alert (alert() 대체)
var _gsAlertCallback = null;
function gsAlert(msg, cb) {
  $('gsAlertMsg').textContent = msg;
  $('gsAlertModal').style.display = 'flex';
  _gsAlertCallback = cb || null;
}
function gsAlertClose() {
  $('gsAlertModal').style.display = 'none';
  if (_gsAlertCallback) { _gsAlertCallback(); _gsAlertCallback = null; }
}

// ✅ v3.820: 커스텀 Confirm (confirm() 대체) - 콜백 방식
var _gsConfirmCallback = null;
function gsConfirm(msg, cb) {
  $('gsConfirmMsg').textContent = msg;
  $('gsConfirmModal').style.display = 'flex';
  _gsConfirmCallback = cb || null;
}
function gsConfirmResolve(result) {
  $('gsConfirmModal').style.display = 'none';
  if (_gsConfirmCallback) { _gsConfirmCallback(result); _gsConfirmCallback = null; }
}

// ✅ v3.8191: 클럽 관리자 비번 확인 - 커스텀 모달 (prompt 대체)
var _clubPinCallback = null;

function checkClubPin(callback) {
  if (masterUnlocked) { callback(true); return; }
  _clubPinCallback = callback;
  const modal = $('clubPinModal');
  modal.style.display = 'flex';
  $('clubPinInput').value = '';
  setTimeout(() => $('clubPinInput').focus(), 100);
}

function confirmClubPin() {
  const input = $('clubPinInput').value;
  const modal = $('clubPinModal');
  const isMasterMode = modal.dataset.mode === 'master';
  modal.style.display = 'none';
  modal.dataset.mode = '';
  $('clubPinInput').value = '';

  // 모달 타이틀 원래대로 복원
  const titleEl = modal.querySelector('div[style*="font-size:15px"]');
  if (titleEl) titleEl.textContent = '관리자 비밀번호를 입력하세요';

  if (isMasterMode) {
    // 마스터 PIN 확인
    if (input === MASTER_PIN) { masterUnlocked = true; if (_masterPinCallback) _masterPinCallback(true); }
    else { if (input !== '') gsAlert('비밀번호가 틀렸습니다!'); if (_masterPinCallback) _masterPinCallback(false); }
    _masterPinCallback = null;
  } else {
    // 클럽 관리자 PIN 확인
    if (input === MASTER_PIN) { masterUnlocked = true; if (_clubPinCallback) _clubPinCallback(true); }
    else if (input === ADMIN_PIN) { if (_clubPinCallback) _clubPinCallback(true); }
    else { if (input !== '') gsAlert('비밀번호가 틀렸습니다!'); if (_clubPinCallback) _clubPinCallback(false); }
    _clubPinCallback = null;
  }
}

function cancelClubPin() {
  const modal = $('clubPinModal');
  modal.style.display = 'none';
  modal.dataset.mode = '';
  $('clubPinInput').value = '';
  // 모달 타이틀 원래대로 복원
  const titleEl = modal.querySelector('div[style*="font-size:15px"]');
  if (titleEl) titleEl.textContent = '관리자 비밀번호를 입력하세요';
  if (_masterPinCallback) { _masterPinCallback(false); _masterPinCallback = null; }
  if (_clubPinCallback) { _clubPinCallback(false); _clubPinCallback = null; }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
}

// ✅ v3.692: 공통 선수 옵션(UI) 생성기 (checkbox/radio 공용)
function createPlayerOption({ inputType, nameAttr, id, value, checked, onClick, labelText, isGuest, showRank, rankText }) {
  const safeValue = escapeHtml(value);
  const checkedAttr = checked ? "checked" : "";
  const onClickAttr = onClick ? `onclick="${onClick}"` : "";
  const guestClass = isGuest ? " guest-label" : "";
  const rankHtml = showRank ? `<span class="p-rank">${escapeHtml(rankText || "")}</span>` : "";
  return `
      <input type="${inputType}" name="${escapeHtml(nameAttr)}" id="${escapeHtml(id)}" class="p-chk" value="${safeValue}" ${checkedAttr} ${onClickAttr}>
      <label for="${escapeHtml(id)}" class="p-label${guestClass}">${labelText}${rankHtml}</label>
    `;
}


function displayName(name) {
  return escapeHtml(name);
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function gsEditName(defaultVal, cb, options) {
  const inputEl = $('gsEditNameInput');
  inputEl.value = defaultVal || '';
  if (options && options.placeholder) inputEl.placeholder = options.placeholder;
  $('gsEditNameModal').style.display = 'flex';
  _gsEditNameCallback = cb || null;

  // ✅ v4.23: 실시간 추천 리스트
  let suggestionsEl = $('gsEditNameSuggestions');
  if (!suggestionsEl) {
    suggestionsEl = document.createElement('div');
    suggestionsEl.id = 'gsEditNameSuggestions';
    suggestionsEl.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; max-height:120px; overflow-y:auto;';
    inputEl.parentNode.insertBefore(suggestionsEl, inputEl.nextSibling);
  }
  suggestionsEl.innerHTML = '';

  const names = (options && options.suggestions) ? options.suggestions : [];
  function renderSuggestions(query) {
    const filtered = query
      ? names.filter(n => n.includes(query))
      : names;
    suggestionsEl.innerHTML = filtered.map(n =>
      `<button type="button" onclick="document.getElementById('gsEditNameInput').value='${n.replace(/'/g, "\\'")}'; document.getElementById('gsEditNameSuggestions').querySelectorAll('button').forEach(b=>b.style.background='#f0f0f0'); this.style.background='#d0e8ff';"
          style="padding:5px 10px; border:1px solid #ddd; border-radius:20px; background:#f0f0f0; font-size:12px; cursor:pointer; white-space:nowrap;">${n}</button>`
    ).join('');
  }
  renderSuggestions('');

  inputEl.oninput = () => renderSuggestions(inputEl.value.trim());

  setTimeout(() => { inputEl.select(); inputEl.focus(); }, 100);
}
function gsEditNameConfirm() {
  const val = $('gsEditNameInput').value;
  $('gsEditNameModal').style.display = 'none';
  if (_gsEditNameCallback) { _gsEditNameCallback(val); _gsEditNameCallback = null; }
}
function gsEditNameCancel() {
  $('gsEditNameModal').style.display = 'none';
  _gsEditNameCallback = null;
}

function setStatus(html) {
  const el = $('status');
  if (!el) return;
  el.innerHTML = html || '';
}


function applyAutofit(scopeEl) {
  const root = scopeEl || document;
  const cells = root.querySelectorAll('[data-autofit="1"]');
  cells.forEach(el => {
    if (!el) return;

    el.classList.add('autofit-cell');
    el.classList.remove('wrap-mode');

    const over = (el.scrollWidth > el.clientWidth + 1);
    if (over) {
      el.classList.add('wrap-mode'); // 2줄 허용 + 글자 살짝 축소
    }
  });
}

function applyAutofitAllTables() {
  document.querySelectorAll('.tennis-table').forEach(t => applyAutofit(t));
}

