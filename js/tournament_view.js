// ========================================
// TOURNAMENT_VIEW.JS - 토너먼트 렌더링/DOM/UI
// ========================================

function tournamentViewInitTournament() {
  const members = players
    .filter(p => !p.isGuest)
    .map(p => Object.assign({}, p, { score: Number(getPlayerStats(p.name).score || 0) }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  const gIcon = p => p.gender === 'F'
    ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
    : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';

  let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';
  html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';
  members.forEach((p, i) => {
    html += `<input type="checkbox" id="tp${i}" class="p-chk" value="${escapeHtml(p.name)}" onclick="tourPick(this)">`;
    html += `<label for="tp${i}" class="p-label" style="min-width:80px; flex:0 0 auto;">${gIcon(p)}${escapeHtml(p.name)}<span class="p-rank">${i + 1}위</span></label>`;
  });
  html += '</div>';

  const divider = label => `
    <div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">
      <span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">${label}</span>
    </div>`;

  if (guests.length > 0) {
    html += divider('GUEST LIST');
    html += '<div class="player-pool">';
    guests.forEach((p, i) => {
      html += `<input type="checkbox" id="tgp${i}" class="p-chk" value="${escapeHtml(p.name)}" onclick="tourPick(this)">`;
      html += `<label for="tgp${i}" class="p-label guest-label" style="min-width:80px; flex:0 0 auto;">[G] ${escapeHtml(p.name)}</label>`;
    });
    html += '</div>';
  }

  if (oneTimePlayers.length > 0) {
    html += divider('<span style="color:var(--aussie-blue);">당일 게스트</span>');
    html += '<div class="player-pool">';
    oneTimePlayers.forEach((name, i) => {
      html += `<input type="checkbox" id="tp_ot${i}" class="p-chk" value="${escapeHtml(name)}" onclick="tourPick(this)">`;
      html += `<label for="tp_ot${i}" class="p-label day-guest-label" style="min-width:80px; flex:0 0 auto;">[당일] ${escapeHtml(name)}</label>`;
    });
    html += '</div>';
  }

  html += '</div>';
  $('pList').innerHTML = html;
}

function tournamentViewTourPick(cb) {
  try {
    const name = cb && cb.value;
    if (!name) { tournamentViewUpCnt(); return; }
    if (tMode === 'manual' && tType === 'double') {
      if (cb.checked) { if (!manualPickOrder.includes(name)) manualPickOrder.push(name); }
      else { manualPickOrder = manualPickOrder.filter(n => n !== name); }
    } else {
      if (!cb.checked) manualPickOrder = manualPickOrder.filter(n => n !== name);
    }
  } finally {
    tournamentViewUpCnt();
    tournamentViewRenderManualTeamsPreview();
  }
}

function tournamentViewUpCnt() {
  const checked = Array.from(document.querySelectorAll('.p-chk:checked')).map(el => el.value);
  if (tMode === 'manual' && tType === 'double') {
    if (!manualPickOrder.length) manualPickOrder = [...checked];
    const ordered = manualPickOrder.filter(n => checked.includes(n));
    const missing = checked.filter(n => !ordered.includes(n));
    selected = [...ordered, ...missing].map(n => ({ n }));
  } else {
    selected = checked.map(n => ({ n }));
  }
  $('cnt').innerText = selected.length;
}

function tournamentViewRenderManualTeamsPreview() {
  const box = $('manual-team-box');
  const list = $('manual-team-list');
  if (!box || !list) return;
  if (!(tMode === 'manual' && tType === 'double')) { box.style.display = 'none'; list.innerHTML = ''; return; }

  const names = (selected || []).map(x => x.n).filter(Boolean);
  if (!names.length) { box.style.display = 'none'; list.innerHTML = ''; return; }

  let html = '';
  for (let i = 0, teamNo = 1; i < names.length; i += 2, teamNo++) {
    const left = escapeHtml(displayName(names[i]));
    const right = names[i + 1] ? escapeHtml(displayName(names[i + 1])) : '<span class="bye">BYE</span>';
    html += `<div class="team-chip"><span class="chip-no">${teamNo}</span>${left}, ${right}</div>`;
  }
  list.innerHTML = html;
  box.style.display = 'block';
}

function tournamentViewSetOpt(k, v, el) {
  if (k === 'mode') {
    tMode = v;
    if (v === 'manual') manualPickOrder = Array.from(document.querySelectorAll('.p-chk:checked')).map(el => el.value);
  }
  if (k === 'type') tType = v;
  el.parentNode.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  tournamentViewUpCnt();
  tournamentViewRenderManualTeamsPreview();
}

function tournamentViewInitPointsAndRules() {
  pointsData = {};
  selected.forEach(p => pointsData[p.n] = { score: 1.0, win: 0, loss: 0, finalBonus: 0 });
  const rulesDiv = $('rules-display');
  if (!rulesDiv) return;
  rulesDiv.innerHTML = tType === 'single'
    ? `<div style="font-size:9px; line-height:1.5; color:#666;">🎾 <b>단식 점수</b><br>참가: <b>+1.0</b> · 승리: <b>+3.0</b> · 패배: <b>-0.5</b><br>🏆 우승(+3), 준우승(+2), 4강(+1), 8강(+0.5)</div>`
    : `<div style="font-size:9px; line-height:1.5; color:#666;">🎾 <b>복식 점수</b><br>참가: <b>+1.0</b> · 승리: <b>+2.0</b> · 패배: <b>-0.5</b><br>🏆 우승(+3), 준우승(+2), 4강(+1), 8강(+0.5)</div>`;
  tournamentViewUpdateScoreBoard();
}

function tournamentViewMakeBracket() {
  if (tType === 'single' && selected.length < 3) { gsAlert('최소 3명 필요!'); return; }
  if (tType === 'double' && selected.length < 4) { gsAlert('최소 4명 필요!'); return; }

  tourBuffer = []; tourCommitted = false; singlePrelim = null; pendingSingles = null;
  let pool = [...selected];

  if (tMode === 'rank') {
    const names = pool.map(x => x.n);
    const otNames = names.filter(n => oneTimePlayers.includes(n));
    pool = players
      .filter(p => names.includes(p.name))
      .map(p => Object.assign({}, p, { score: Number(getPlayerStats(p.name).score || 0) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map(p => ({ n: p.name }));
    otNames.forEach(n => pool.push({ n }));
  } else if (tMode === 'random') {
    pool.sort(() => Math.random() - 0.5);
  }

  let entities = [];

  if (tType === 'single') {
    if (pool.length > 8) {
      singlePrelim = { a: pool[7].n, b: pool[8].n, done: false };
      pendingSingles = { base7: pool.slice(0, 7).map(x => x.n), a: pool[7].n, b: pool[8].n };
      entities = [...pool.slice(0, 7), { n: '?' }];
    } else {
      entities = pool.slice(0, 8);
    }
  } else {
    if (tMode === 'manual') {
      for (let i = 0; i < pool.length; i += 2) {
        const p1 = pool[i], p2 = pool[i + 1];
        if (!p1) continue;
        entities.push({ n: p2 ? `${p1.n},${p2.n}` : `${p1.n},BYE` });
      }
    } else {
      const tc = Math.ceil(pool.length / 2);
      for (let i = 0; i < tc; i++) {
        const p1 = pool[i], p2 = pool[pool.length - 1 - i];
        entities.push({ n: p1 === p2 ? `${p1.n},BYE` : `${p1.n},${p2.n}` });
      }
    }
    entities.sort((a, b) => (b.n.includes('BYE') ? 1 : 0) - (a.n.includes('BYE') ? 1 : 0));
  }

  tournamentViewInitPointsAndRules();
  currentBracketSize = entities.length <= 4 ? 4 : 8;
  const fullList = [...entities];
  while (fullList.length < currentBracketSize) fullList.push({ n: 'BYE' });

  const matches = currentBracketSize === 4
    ? [{ p1: fullList[0], p2: fullList[3] }, { p1: fullList[1], p2: fullList[2] }]
    : [{ p1: fullList[0], p2: fullList[7] }, { p1: fullList[3], p2: fullList[4] }, { p1: fullList[1], p2: fullList[6] }, { p1: fullList[2], p2: fullList[5] }];

  tournamentViewRenderWingTree(matches);
  $('bracket-section').style.display = 'block';
  $('bracket-section').scrollIntoView({ behavior: 'smooth' });

  if (tType === 'single' && singlePrelim && !singlePrelim.done) {
    tournamentViewShowSinglePrelimUI(singlePrelim.a, singlePrelim.b);
  } else if (tType === 'double') {
    $('loser-bench').style.display = 'block';
    $('loser-bench').querySelector('h4').innerText = '🏃 패자 대기석 (클릭하여 대기팀에 투입)';
    $('loser-list').innerHTML = '<span style="color:#999; font-size:12px;">경기 결과 대기중...</span>';
  } else {
    $('loser-bench').style.display = 'none';
  }
  setTimeout(() => tournamentViewAutoResolveByes_FirstRoundOnly(currentBracketSize), 100);
}

function tournamentViewAutoResolveByes_FirstRoundOnly(size) {
  const startR = size === 4 ? 2 : 1;
  const matchCount = size / 2;
  for (let i = 0; i < matchCount; i++) {
    const m = document.querySelector(`#r${startR}-m${i}`);
    if (!m || m.classList.contains('final-stage')) continue;
    const t1 = m.querySelector('.team:first-child');
    const t2 = m.querySelector('.team:last-child');
    if (!t1 || !t2) continue;
    const a = (t1.innerText || '').trim();
    const b = (t2.innerText || '').trim();
    if (a.includes('?') || b.includes('?')) continue;
    if (b === 'BYE' && a !== 'BYE') t1.click();
    else if (a === 'BYE' && b !== 'BYE') t2.click();
  }
}

function tournamentViewRenderWingTree(matches) {
  const root = $('tree-root');
  root.innerHTML = '';
  if (matches.length === 2) {
    root.innerHTML = `
      <div class="column col-left">${tournamentViewGetMatchBoxHtml(0, matches[0], 2)}</div>
      <div class="column col-center">
        <div id="final-wrapper" style="width:100%; display:flex; flex-direction:column; align-items:center;">
          <div id="champ-display" class="champ-wrapper"><div class="champ-badge">🏆 <span id="champ-name"></span> 우승!</div></div>
          ${tournamentViewGetEmptyBoxHtml(0, 3, true)}
        </div>
      </div>
      <div class="column col-right">${tournamentViewGetMatchBoxHtml(1, matches[1], 2)}</div>`;
  } else {
    root.innerHTML = `
      <div class="column col-left">${tournamentViewGetMatchBoxHtml(0, matches[0], 1)}${tournamentViewGetMatchBoxHtml(1, matches[1], 1)}</div>
      <div class="column col-semi-left">${tournamentViewGetEmptyBoxHtml(0, 2)}</div>
      <div class="column col-center">
        <div id="final-wrapper" style="width:100%; display:flex; flex-direction:column; align-items:center;">
          <div id="champ-display" class="champ-wrapper"><div class="champ-badge">🏆 <span id="champ-name"></span> 우승!</div></div>
          ${tournamentViewGetEmptyBoxHtml(0, 3, true)}
        </div>
      </div>
      <div class="column col-semi-right">${tournamentViewGetEmptyBoxHtml(1, 2)}</div>
      <div class="column col-right">${tournamentViewGetMatchBoxHtml(2, matches[2], 1)}${tournamentViewGetMatchBoxHtml(3, matches[3], 1)}</div>`;
  }
}

function tournamentViewGetMatchBoxHtml(idx, m, round, isFinal = false) {
  const p1 = escapeHtml(m.p1.n), p2 = escapeHtml(m.p2.n);
  return `<div class="match-box ${isFinal ? 'final-stage' : ''}" id="r${round}-m${idx}">
    <div class="team" onclick="win(${round}, ${idx}, 1, '${p1.replace(/'/g, "&#39;")}', this)">${p1}</div>
    <div class="team" onclick="win(${round}, ${idx}, 2, '${p2.replace(/'/g, "&#39;")}', this)">${p2}</div>
  </div>`;
}

function tournamentViewGetEmptyBoxHtml(idx, round, isFinal = false) {
  return `<div class="match-box ${isFinal ? 'final-stage' : ''}" id="r${round}-m${idx}">
    <div class="team no-rank" id="r${round}-m${idx}-t1" style="color:#ccc;">?</div>
    <div class="team no-rank" id="r${round}-m${idx}-t2" style="color:#ccc;">?</div>
  </div>`;
}

function tournamentViewUpdateScoreBoard() {
  const sorted = Object.entries(pointsData)
    .filter(([n]) => n !== 'BYE')
    .sort((a, b) => (b[1].score + b[1].finalBonus) - (a[1].score + a[1].finalBonus));
  $('score-tbody').innerHTML = sorted.map(([n, d], i) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(n)}</td><td>${d.win}승 ${d.loss}패</td><td>${(d.score + d.finalBonus).toFixed(1)}</td></tr>`
  ).join('');
}

async function tournamentViewWin(round, matchIdx, teamIdx, name, el) {
  if (name.includes('BYE')) return;
  const p = el.parentNode;
  if (p.querySelector('.winner')) return;

  const t1El = p.querySelector('.team:first-child');
  const t2El = p.querySelector('.team:last-child');
  const teamA = (t1El?.innerText || '').trim();
  const teamB = (t2El?.innerText || '').trim();

  p.querySelectorAll('.team').forEach(t => t.classList.add('loser'));
  el.classList.remove('loser'); el.classList.add('winner');

  let loserName = '';
  p.querySelectorAll('.team').forEach(t => { if (t !== el) loserName = (t.innerText || '').trim(); });

  if (tType === 'double' && !loserName.includes('BYE') && loserName !== 'BYE') tournamentViewRegisterLosers(loserName);

  const scoring = TENNIS_RULES.scoring[tType === 'single' ? 'single' : 'double'];
  name.split(',').forEach(pn => { if (pointsData[pn]) { pointsData[pn].score += scoring.win; pointsData[pn].win++; } });
  if (!loserName.includes('BYE') && loserName !== 'BYE') {
    loserName.split(',').forEach(pn => { if (pointsData[pn]) { pointsData[pn].score += scoring.loss; pointsData[pn].loss++; } });
  }

  const bonus = TENNIS_RULES.tournamentBonus;
  if (currentBracketSize === 8) {
    if (round === 1) loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = bonus.quarterFinal; });
    else if (round === 2) loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = bonus.semiFinal; });
  } else if (currentBracketSize === 4 && round === 2) {
    loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = bonus.semiFinal; });
  }

  tournamentEngineBufferTournamentMatch(tType, teamA, teamB, name);

  if (p.classList.contains('final-stage') || round === 3) {
    $('champ-display').style.display = 'inline-flex';
    $('champ-name').innerText = name;
    name.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = bonus.champion; });
    loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = bonus.runnerUp; });
    tournamentViewUpdateScoreBoard();
    await tournamentEngineCommitTournamentIfNeeded();
    return;
  }

  const nr = round + 1;
  const nmi = round === 1 ? (matchIdx < 2 ? 0 : 1) : 0;
  const ntp = round === 1 ? (matchIdx % 2 === 0 ? 1 : 2) : (matchIdx === 0 ? 1 : 2);

  const target = $(`r${nr}-m${nmi}-t${ntp}`);
  if (target) { target.innerText = name; target.style.color = '#1C1C1E'; target.onclick = () => win(nr, nmi, ntp, name, target); }

  tournamentViewUpdateScoreBoard();
}

function tournamentViewRegisterLosers(teamName) {
  if (tType !== 'double') return;
  let listDiv = $('loser-list');
  if (listDiv.innerHTML.includes('대기중')) listDiv.innerHTML = '';
  teamName.split(',').forEach(n => {
    if (n === 'BYE') return;
    const chip = document.createElement('span');
    chip.className = 'loser-chip';
    chip.innerText = n;
    chip.onclick = () => injectPartner(n, chip);
    listDiv.appendChild(chip);
  });
}

function tournamentViewInjectPartner(name, chipElement) {
  for (const t of document.querySelectorAll('.team')) {
    const txt = (t.innerText || '').trim();
    if (txt.includes(',') && (txt.includes('BYE') || txt.includes('?'))) {
      const newName = txt.replace('BYE', name).replace('?', name).trim();
      t.innerHTML = `<span>${escapeHtml(newName)}</span>`;
      const pId = t.parentNode.id;
      const rd = parseInt(pId.split('-')[0].replace('r', ''));
      const mi = parseInt(pId.split('-')[1].replace('m', ''));
      const ti = t === t.parentNode.firstElementChild ? 1 : 2;
      t.onclick = () => win(rd, mi, ti, newName, t);
      chipElement.remove();
      setTimeout(() => tournamentViewAutoResolveByes_FirstRoundOnly(currentBracketSize), 50);
      return;
    }
  }
  gsAlert('파트너를 기다리는 팀이 없습니다.');
}

function tournamentViewShowSinglePrelimUI(a, b) {
  const bench = $('loser-bench');
  const list = $('loser-list');
  if (!bench || !list) return;
  bench.style.display = 'block';
  bench.querySelector('h4').innerText = '🎾 단식 예선 (8위 vs 9위) — 승자를 클릭하면 8강 진입';
  list.innerHTML = '';
  [a, b].forEach(n => {
    const chip = document.createElement('span');
    chip.className = 'loser-chip';
    chip.innerText = n;
    chip.onclick = () => resolveSinglePrelim(n);
    list.appendChild(chip);
  });
}

function tournamentViewResolveSinglePrelim(winnerName) {
  if (!singlePrelim || singlePrelim.done) return;
  const a = singlePrelim.a, b = singlePrelim.b;
  const loserName = winnerName === a ? b : a;
  const scoring = TENNIS_RULES.scoring.single;

  if (pointsData[winnerName]) { pointsData[winnerName].score += scoring.win; pointsData[winnerName].win++; }
  if (pointsData[loserName]) { pointsData[loserName].score += scoring.loss; pointsData[loserName].loss++; }

  tournamentEngineBufferTournamentMatch('single', a, b, winnerName);
  singlePrelim.done = true;

  if (pendingSingles) {
    const mainNames = [...pendingSingles.base7, winnerName].map(n => ({ n }));
    currentBracketSize = 8;
    const fullList = [...mainNames];
    while (fullList.length < 8) fullList.push({ n: 'BYE' });
    tournamentViewRenderWingTree([
      { p1: fullList[0], p2: fullList[7] }, { p1: fullList[3], p2: fullList[4] },
      { p1: fullList[1], p2: fullList[6] }, { p1: fullList[2], p2: fullList[5] },
    ]);
    $('loser-bench').style.display = 'none';
    $('loser-list').innerHTML = '';
  }
  tournamentViewUpdateScoreBoard();
}

function tournamentViewResetPage() {
  selected = []; pointsData = {}; tourBuffer = []; tourCommitted = false;
  singlePrelim = null; pendingSingles = null;
  document.querySelectorAll('.p-chk').forEach(c => c.checked = false);
  $('cnt').innerText = '0';
  $('bracket-section').style.display = 'none';
  $('setup-area').style.display = 'block';
  $('tree-root').innerHTML = '';
  $('loser-list').innerHTML = '';
  $('loser-bench').style.display = 'none';
  $('champ-display').style.display = 'none';
  $('score-tbody').innerHTML = '';
  document.getElementById('view-tournament')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
