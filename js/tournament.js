// ========================================
// TOURNAMENT SYSTEM (토너먼트)
// ========================================


// singlePrelim, pendingSingles → state.js에서 선언됨

function initTournament() {
  const members = players.filter(p => !p.isGuest).sort((a, b) => (b.score || 0) - (a.score || 0));
  // ✅ v3.816: HIDDEN_PLAYERS 제외
  const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

  let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';

  // 1. 정식 회원 섹션
  html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
  html += '<div class="player-pool" style="margin-bottom:20px;">';
  members.forEach((p, i) => {
    // ✅ v3.93: Material Symbols 아이콘
    const gIcon = (p.gender === 'F')
      ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
      : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
    html += `<input type="checkbox" id="tp${i}" class="p-chk" value="${escapeHtml(p.name)}" onclick="tourPick(this)">`;
    html += `<label for="tp${i}" class="p-label" style="min-width:80px; flex:0 0 auto;">${gIcon}${escapeHtml(p.name)}<span class="p-rank">${i + 1}위</span></label>`;
  });
  html += '</div>';

  // 2. 게스트 섹션 (게스트가 있을 때만 출력, ✅ v3.818: 1대2대결용 버튼 제외)
  if (guests.length > 0) {
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
    html += '</div>';

    html += '<div class="player-pool">';
    guests.forEach((p, i) => {
      html += `<input type="checkbox" id="tgp${i}" class="p-chk" value="${escapeHtml(p.name)}" onclick="tourPick(this)">`;
      html += `<label for="tgp${i}" class="p-label guest-label" style="min-width:80px; flex:0 0 auto;">[G] ${escapeHtml(p.name)}</label>`;
    });
    html += '</div>';
  }

  // ✅ v3.8206: 당일 게스트 섹션
  if (oneTimePlayers.length > 0) {
    html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
    html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:var(--aussie-blue); font-weight:bold;">당일 게스트</span>';
    html += '</div>';
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



function tourPick(cb) {
  try {
    const name = cb && cb.value;
    if (!name) { upCnt(); return; }

    // ✅ 지정선택(복식)일 때만 클릭 순서를 기록
    if (tMode === 'manual' && tType === 'double') {
      if (cb.checked) {
        if (!manualPickOrder.includes(name)) manualPickOrder.push(name);
      } else {
        manualPickOrder = manualPickOrder.filter(n => n !== name);
      }
    } else {
      // 다른 모드에서는 체크/해제에 따라만 동기화 (순서 데이터는 굳이 유지할 필요 없음)
      if (!cb.checked) {
        manualPickOrder = manualPickOrder.filter(n => n !== name);
      }
    }
  } finally {
    upCnt();
    renderManualTeamsPreview();
  }
}

function upCnt() {
  const checkedEls = Array.from(document.querySelectorAll('.p-chk:checked'));
  const checked = checkedEls.map(el => el.value);

  if (tMode === 'manual' && tType === 'double') {
    // 클릭 순서대로 2명씩 팀이 묶이도록, 체크된 항목은 manualPickOrder 기준으로 정렬
    // (혹시 중간에 누락/재정렬이 생기면 checked 기반으로 보정)
    if (!manualPickOrder.length) manualPickOrder = [...checked];
    const ordered = manualPickOrder.filter(n => checked.includes(n));
    const missing = checked.filter(n => !ordered.includes(n));
    selected = [...ordered, ...missing].map(n => ({ n }));
  } else {
    selected = checked.map(n => ({ n }));
  }

  $('cnt').innerText = selected.length;
}

// ✅ v3.693: 지정선택(복식) 팀 미리보기 렌더
function renderManualTeamsPreview() {
  const box = $('manual-team-box');
  const list = $('manual-team-list');
  if (!box || !list) return;

  // 지정선택 + 복식일 때만 노출
  if (!(tMode === 'manual' && tType === 'double')) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  // 현재 선택 순서(선택된 선수들) 가져오기
  const names = (selected || []).map(x => x.n).filter(Boolean);
  if (!names.length) {
    box.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  let html = '';
  let teamNo = 1;
  for (let i = 0; i < names.length; i += 2) {
    const a = names[i];
    const b = names[i + 1];

    const left = escapeHtml(displayName(a));
    const right = b ? escapeHtml(displayName(b)) : '<span class="bye">BYE</span>';

    html += `<div class="team-chip"><span class="chip-no">${teamNo}</span>${left}, ${right}</div>`;
    teamNo++;
  }

  list.innerHTML = html;
  box.style.display = 'block';
}


function setOpt(k, v, el) {
  if (k === 'mode') {
    tMode = v;
    if (v === 'manual') {
      // ✅ 현재 체크된 선수들을 "지정선택" 기본 순서로 세팅
      manualPickOrder = Array.from(document.querySelectorAll('.p-chk:checked')).map(el => el.value);
    }
  }
  if (k === 'type') {
    tType = v;
    // 단식에서는 지정선택을 강제할 이유가 없으니, 선택은 유지하되 동작은 복식에서만 적용됨
  }
  el.parentNode.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  upCnt();
  renderManualTeamsPreview();
}

function initPointsAndRules() {
  pointsData = {};
  const rulesDiv = $('rules-display');
  selected.forEach(p => pointsData[p.n] = { score: 1.0, win: 0, loss: 0, finalBonus: 0 });

  if (tType === 'single')
    rulesDiv.innerHTML = `<div style="font-size: 9px; line-height: 1.5; color: #666;">🎾 <b>단식 점수 (실제 경기 기준)</b><br>- 참가: <b>+1.0</b> (토너먼트당 1회)<br>- 승리: <b>+3.0</b><br>- 패배: <b>-0.5</b><br>🏆 <b>진출 보너스</b>: 우승(+3), 준우승(+2), 4강(+1), 8강(+0.5)</div>`;
  else
    rulesDiv.innerHTML = `<div style="font-size: 9px; line-height: 1.5; color: #666;">🎾 <b>복식 점수 (실제 경기 기준)</b><br>- 참가: <b>+1.0</b> (토너먼트당 1회)<br>- 승리: <b>+2.0</b><br>- 패배: <b>-0.5</b><br>🏆 <b>진출 보너스</b>: 우승(+3), 준우승(+2), 4강(+1), 8강(+0.5)</div>`;

  updateScoreBoard();
}

function makeBracket() {
  if (tType === 'single' && selected.length < 3) { gsAlert("최소 3명 필요!"); return; }
  if (tType === 'double' && selected.length < 4) { gsAlert("최소 4명 필요!"); return; }

  tourBuffer = [];
  tourCommitted = false;
  singlePrelim = null;
  pendingSingles = null;

  let pool = [...selected];

  if (tMode === 'rank') {
    let names = pool.map(x => x.n);
    // ✅ v3.8207: 당일 게스트(임시참가자)는 players에 없으므로 별도 보존 후 뒤에 붙임
    const otNames = names.filter(n => oneTimePlayers.includes(n));
    pool = players
      .filter(p => names.includes(p.name))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map(p => ({ n: p.name }));
    otNames.forEach(n => pool.push({ n }));
  } else if (tMode === 'random') {
    pool.sort(() => Math.random() - 0.5);
  } else {
    // manual(지정선택): 현재 선택 순서 그대로 사용
  }

  let entities = [];

  if (tType === 'single') {
    if (pool.length > 8) {
      const main7 = pool.slice(0, 7);
      const playInA = pool[7];
      const playInB = pool[8];

      singlePrelim = { a: playInA.n, b: playInB.n, done: false };

      entities = [...main7, { n: "?" }];

      pendingSingles = {
        base7: main7.map(x => x.n),
        a: playInA.n,
        b: playInB.n
      };
    } else {
      entities = pool.slice(0, 8);
    }
  } else {
    // ✅ 복식 팀 구성
    if (tMode === 'manual') {
      // 지정선택: 클릭(체크)한 순서대로 2명씩 팀 구성
      for (let i = 0; i < pool.length; i += 2) {
        const p1 = pool[i];
        const p2 = pool[i + 1];
        if (!p1) continue;
        entities.push({ n: p2 ? `${p1.n},${p2.n}` : `${p1.n},BYE` });
      }
    } else {
      // 랭킹반영/무작위: 기존 방식(앞/뒤에서 짝지어 균형)
      let teamCount = Math.ceil(pool.length / 2);
      for (let i = 0; i < teamCount; i++) {
        let p1 = pool[i];
        let p2 = pool[pool.length - 1 - i];
        entities.push({ n: (p1 === p2) ? `${p1.n},BYE` : `${p1.n},${p2.n}` });
      }
    }
    // BYE는 뒤로 보내서 보기 좋게 정렬
    entities.sort((a, b) => (b.n.includes('BYE') ? 1 : 0) - (a.n.includes('BYE') ? 1 : 0));
  }

  initPointsAndRules();

  currentBracketSize = entities.length <= 4 ? 4 : 8;
  let fullList = [...entities];
  while (fullList.length < currentBracketSize) fullList.push({ n: 'BYE' });

  let matches =
    currentBracketSize === 4
      ? [{ p1: fullList[0], p2: fullList[3] }, { p1: fullList[1], p2: fullList[2] }]
      : [
        { p1: fullList[0], p2: fullList[7] },
        { p1: fullList[3], p2: fullList[4] },
        { p1: fullList[1], p2: fullList[6] },
        { p1: fullList[2], p2: fullList[5] }
      ];

  renderWingTree(matches);
  $('bracket-section').style.display = 'block';
  $('bracket-section').scrollIntoView({ behavior: 'smooth' });

  if (tType === 'single' && singlePrelim && !singlePrelim.done) {
    showSinglePrelimUI(singlePrelim.a, singlePrelim.b);
  } else if (tType === 'double') {
    $('loser-bench').style.display = 'block';
    $('loser-bench').querySelector('h4').innerText = '🏃 패자 대기석 (클릭하여 대기팀에 투입)';
    $('loser-list').innerHTML = '<span style="color:#999; font-size:12px;">경기 결과 대기중...</span>';
  } else {
    $('loser-bench').style.display = 'none';
  }

  setTimeout(() => autoResolveByes_FirstRoundOnly(currentBracketSize), 100);
}

function autoResolveByes_FirstRoundOnly(size) {
  const startR = (size === 4) ? 2 : 1;
  const matchCount = size / 2;

  for (let i = 0; i < matchCount; i++) {
    const m = document.querySelector(`#r${startR}-m${i}`);
    if (!m) continue;
    if (m.classList.contains('final-stage')) continue;

    const t1 = m.querySelector('.team:first-child');
    const t2 = m.querySelector('.team:last-child');
    if (!t1 || !t2) continue;

    const a = (t1.innerText || "").trim();
    const b = (t2.innerText || "").trim();

    if (a.includes('?') || b.includes('?')) continue;

    if (b === 'BYE' && a !== 'BYE') t1.click();
    else if (a === 'BYE' && b !== 'BYE') t2.click();
  }
}

function renderWingTree(matches) {
  const root = $('tree-root');
  root.innerHTML = '';
  if (matches.length === 2) {
    root.innerHTML = `
        <div class="column col-left">${getMatchBoxHtml(0, matches[0], 2)}</div>
        <div class="column col-center">
          <div id="final-wrapper" style="width:100%; display:flex; flex-direction:column; align-items:center;">
            <div id="champ-display" class="champ-wrapper"><div class="champ-badge">🏆 <span id="champ-name"></span> 우승!</div></div>
            ${getEmptyBoxHtml(0, 3, true)}
          </div>
        </div>
        <div class="column col-right">${getMatchBoxHtml(1, matches[1], 2)}</div>
      `;
  } else {
    root.innerHTML = `
        <div class="column col-left">
          ${getMatchBoxHtml(0, matches[0], 1)}${getMatchBoxHtml(1, matches[1], 1)}
        </div>
        <div class="column col-semi-left">${getEmptyBoxHtml(0, 2)}</div>
        <div class="column col-center">
          <div id="final-wrapper" style="width:100%; display:flex; flex-direction:column; align-items:center;">
            <div id="champ-display" class="champ-wrapper"><div class="champ-badge">🏆 <span id="champ-name"></span> 우승!</div></div>
            ${getEmptyBoxHtml(0, 3, true)}
          </div>
        </div>
        <div class="column col-semi-right">${getEmptyBoxHtml(1, 2)}</div>
        <div class="column col-right">
          ${getMatchBoxHtml(2, matches[2], 1)}${getMatchBoxHtml(3, matches[3], 1)}
        </div>
      `;
  }
}

function getMatchBoxHtml(idx, m, round, isFinal = false) {
  const p1 = escapeHtml(m.p1.n), p2 = escapeHtml(m.p2.n);
  return `<div class="match-box ${isFinal ? 'final-stage' : ''}" id="r${round}-m${idx}">
      <div class="team" onclick="win(${round}, ${idx}, 1, '${p1.replace(/'/g, "&#39;")}', this)">${p1}</div>
      <div class="team" onclick="win(${round}, ${idx}, 2, '${p2.replace(/'/g, "&#39;")}', this)">${p2}</div>
    </div>`;
}

function getEmptyBoxHtml(idx, round, isFinal = false) {
  return `<div class="match-box ${isFinal ? 'final-stage' : ''}" id="r${round}-m${idx}">
      <div class="team no-rank" id="r${round}-m${idx}-t1" style="color:#ccc;">?</div>
      <div class="team no-rank" id="r${round}-m${idx}-t2" style="color:#ccc;">?</div>
    </div>`;
}

function parseTeamToPlayers(teamName) {
  const t = String(teamName || "").trim();
  if (!t || t === 'BYE' || t.includes('?')) return [];
  return t.split(',').map(s => s.trim()).filter(x => x && x !== 'BYE' && x !== '?');
}

function bufferTournamentMatch(type, teamA, teamB, winnerTeamName) {
  if (teamA === 'BYE' || teamB === 'BYE') return;
  if (teamA.includes('?') || teamB.includes('?')) return;

  const homeArr = parseTeamToPlayers(teamA);
  const awayArr = parseTeamToPlayers(teamB);
  if (homeArr.length === 0 || awayArr.length === 0) return;

  const { ts, ds } = nowISO();
  const winnerSide = (winnerTeamName === teamA) ? "home" : "away";

  tourBuffer.push({
    id: `${ts}-${Math.floor(Math.random() * 100000)}`,
    ts,
    date: ds,
    type,
    home: homeArr,
    away: awayArr,
    hs: 0,
    as: 0,
    winner: winnerSide,
    memo: "tournament"
  });
}

async function commitTournamentIfNeeded() {
  if (!currentUserAuth || !currentLoggedPlayer) { requireAuth(() => commitTournamentIfNeeded()); return; }
  if (isPracticeMode !== 'real') return;
  if (tourCommitted) return;
  if (!tourBuffer.length) return;

  // ✅ v4.93: 주간 리셋 제거 — matchLog 기반으로 변경됨
  snapshotLastRanks();

  tourBuffer.forEach(le => {
    applyMatchToPlayers(le.type, le.home, le.away, le.winner);
    matchLog.unshift(le);
  });

  const ok = await pushWithMatchLogAppend(tourBuffer);
  tourCommitted = ok;

  if (ok) {
    gsAlert(`토너먼트 결과 반영 완료 ✅\n(경기 ${tourBuffer.length}건 MatchLog 누적됨)`);
    updateSeason(); updateWeekly();
    renderStatsPlayerList();
    setTimeout(applyAutofitAllTables, 0);
  } else {
    gsAlert("토너먼트 결과 반영 실패 😵‍💫\n(네트워크/GAS 상태 확인 필요)");
  }
}

function showSinglePrelimUI(a, b) {
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
    chip.onclick = function () { resolveSinglePrelim(n); };
    list.appendChild(chip);
  });
}

function resolveSinglePrelim(winnerName) {
  if (!singlePrelim || singlePrelim.done) return;
  const a = singlePrelim.a;
  const b = singlePrelim.b;
  const loserName = (winnerName === a) ? b : a;

  if (pointsData[winnerName]) { pointsData[winnerName].score += TENNIS_RULES.scoring.single.win; pointsData[winnerName].win++; }
  if (pointsData[loserName]) { pointsData[loserName].score += TENNIS_RULES.scoring.single.loss; pointsData[loserName].loss++; }

  bufferTournamentMatch('single', a, b, winnerName);

  singlePrelim.done = true;

  if (pendingSingles) {
    const mainNames = [...pendingSingles.base7, winnerName].map(n => ({ n }));
    currentBracketSize = 8;

    let fullList = [...mainNames];
    while (fullList.length < currentBracketSize) fullList.push({ n: 'BYE' });

    const matches = [
      { p1: fullList[0], p2: fullList[7] },
      { p1: fullList[3], p2: fullList[4] },
      { p1: fullList[1], p2: fullList[6] },
      { p1: fullList[2], p2: fullList[5] }
    ];

    renderWingTree(matches);

    $('loser-bench').style.display = 'none';
    $('loser-list').innerHTML = '';
  }

  updateScoreBoard();
}

window.win = async function (round, matchIdx, teamIdx, name, el) {
  if (name.includes('BYE')) return;

  const p = el.parentNode;
  if (p.querySelector('.winner')) return;

  const t1El = p.querySelector('.team:first-child');
  const t2El = p.querySelector('.team:last-child');
  const teamA = (t1El?.innerText || "").trim();
  const teamB = (t2El?.innerText || "").trim();

  p.querySelectorAll('.team').forEach(t => t.classList.add('loser'));
  el.classList.remove('loser');
  el.classList.add('winner');

  let loserName = '';
  p.querySelectorAll('.team').forEach(t => { if (t !== el) loserName = (t.innerText || "").trim(); });

  if (tType === 'double' && !loserName.includes('BYE') && loserName !== 'BYE') registerLosers(loserName);

  // ✅ v4.02: TENNIS_RULES 참조 (rules/tennis.js)
  const winEarn = TENNIS_RULES.scoring[tType === 'single' ? 'single' : 'double'].win;
  const lossEarn = TENNIS_RULES.scoring[tType === 'single' ? 'single' : 'double'].loss;

  name.split(',').forEach(pn => {
    if (pointsData[pn]) { pointsData[pn].score += winEarn; pointsData[pn].win++; }
  });

  if (!loserName.includes('BYE') && loserName !== 'BYE') loserName.split(',').forEach(pn => {
    if (pointsData[pn]) { pointsData[pn].score += lossEarn; pointsData[pn].loss++; }
  });

  if (currentBracketSize === 8) {
    if (round === 1) loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = TENNIS_RULES.tournamentBonus.quarterFinal; });
    else if (round === 2) loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = TENNIS_RULES.tournamentBonus.semiFinal; });
  } else if (currentBracketSize === 4) {
    if (round === 2) loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = TENNIS_RULES.tournamentBonus.semiFinal; });
  }

  bufferTournamentMatch(tType, teamA, teamB, name);

  if (p.classList.contains('final-stage') || round === 3) {
    $('champ-display').style.display = 'inline-flex';
    $('champ-name').innerText = name;
    name.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = TENNIS_RULES.tournamentBonus.champion; });
    loserName.split(',').forEach(pn => { if (pointsData[pn]) pointsData[pn].finalBonus = TENNIS_RULES.tournamentBonus.runnerUp; });
    updateScoreBoard();
    await commitTournamentIfNeeded();
    return;
  }

  let nr = round + 1, nmi, ntp;
  if (round === 1) {
    nmi = (matchIdx < 2) ? 0 : 1;
    ntp = (matchIdx % 2 === 0) ? 1 : 2;
  } else {
    nmi = 0;
    ntp = (matchIdx === 0) ? 1 : 2;
  }

  const target = $(`r${nr}-m${nmi}-t${ntp}`);
  if (target) {
    target.innerText = name;
    target.style.color = '#1C1C1E';
    target.onclick = function () { win(nr, nmi, ntp, name, this); };
  }

  updateScoreBoard();
}

function updateScoreBoard() {
  const sorted = Object.entries(pointsData)
    .filter(([n]) => n !== 'BYE')
    .sort((a, b) => (b[1].score + b[1].finalBonus) - (a[1].score + a[1].finalBonus));
  $('score-tbody').innerHTML = sorted.map(([n, d], i) => `
      <tr><td>${i + 1}</td><td>${escapeHtml(n)}</td><td>${d.win}승 ${d.loss}패</td><td>${(d.score + d.finalBonus).toFixed(1)}</td></tr>
    `).join('');
}

function registerLosers(teamName) {
  if (tType !== 'double') return;
  let listDiv = $('loser-list');
  if (listDiv.innerHTML.includes('대기중')) listDiv.innerHTML = '';
  teamName.split(',').forEach(n => {
    if (n === 'BYE') return;
    let chip = document.createElement('span');
    chip.className = 'loser-chip';
    chip.innerText = n;
    chip.onclick = function () { injectPartner(n, this); };
    listDiv.appendChild(chip);
  });
}

function injectPartner(name, chipElement) {
  let teams = document.querySelectorAll('.team');
  let found = false;

  for (let t of teams) {
    let txt = (t.innerText || "").trim();
    if (txt.includes(',') && (txt.includes('BYE') || txt.includes('?'))) {
      let newName = txt.replace('BYE', name).replace('?', name).trim();
      t.innerHTML = `<span>${escapeHtml(newName)}</span>`;
      let pId = t.parentNode.id;
      let rd = parseInt(pId.split('-')[0].replace('r', '')), mi = parseInt(pId.split('-')[1].replace('m', ''));
      let ti = (t === t.parentNode.firstElementChild) ? 1 : 2;
      t.onclick = function () { win(rd, mi, ti, newName, this); };
      chipElement.remove();
      found = true;

      setTimeout(() => autoResolveByes_FirstRoundOnly(currentBracketSize), 50);
      break;
    }
  }
  if (!found) gsAlert("파트너를 기다리는 팀이 없습니다.");
}

function resetPage() {
  selected = [];
  pointsData = {};
  tourBuffer = [];
  tourCommitted = false;

  singlePrelim = null;
  pendingSingles = null;

  document.querySelectorAll('.p-chk').forEach(c => c.checked = false);
  $('cnt').innerText = "0";
  $('bracket-section').style.display = 'none';
  $('setup-area').style.display = 'block';
  $('tree-root').innerHTML = '';
  $('loser-list').innerHTML = '';
  $('loser-bench').style.display = 'none';
  $('champ-display').style.display = 'none';
  $('score-tbody').innerHTML = '';
  const v = document.getElementById('view-tournament');
  if (v) v.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
