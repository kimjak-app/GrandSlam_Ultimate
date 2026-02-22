  // ========================================
  // ROUND MODE FUNCTIONS
  // ========================================

  function openRound() {
    // 라운드 화면 진입
    showView('round');

    // 랭킹/순위 계산이 깨져도 라운드 선수명단은 무조건 뜨게 (방어)
    try {
      snapshotLastRanks();
      const rankMap = computeRanksByScoreOnly('score', 'wins', 'losses');
      players.forEach(p => { p.rank = rankMap[p.name] || p.rank || '-'; });
    } catch (e) {
      console.warn('[round] rank compute failed:', e);
    }

    initRoundPlayerPool();
  }

  function setRoundOpt(opt) {
    roundOpt = opt;
    ['rank', 'random', 'manual'].forEach(o => {
      const btn = $(`round-opt-${o}`);
      if(o === opt) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    
    // 지정선택 + 복식이면 팀 미리보기 표시
    if(opt === 'manual' && roundMode === 'double') {
      updateRoundManualTeamPreview();
    } else {
      $('round-manual-team-box').style.display = 'none';
    }
    
    checkRoundGenButton();
  }

  function setRoundMode(mode) {
    roundMode = mode;
    ['single', 'double'].forEach(m => {
      const btn = $(`round-mode-${m}`);
      if(m === mode) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    
    // 단식일 때는 배치 방식 비활성화 (어차피 풀리그)
    const optBtns = ['round-opt-rank', 'round-opt-random', 'round-opt-manual'];
    if(mode === 'single') {
      optBtns.forEach(id => {
        const btn = $(id);
        if(btn) {
          btn.disabled = true;
          btn.style.opacity = '0.4';
          btn.style.cursor = 'not-allowed';
        }
      });
    } else {
      optBtns.forEach(id => {
        const btn = $(id);
        if(btn) {
          btn.disabled = false;
          btn.style.opacity = '';
          btn.style.cursor = 'pointer';
        }
      });
    }
    
    // 지정선택 + 복식이면 팀 미리보기 표시
    if(roundOpt === 'manual' && mode === 'double') {
      updateRoundManualTeamPreview();
    } else {
      $('round-manual-team-box').style.display = 'none';
    }
    
    checkRoundGenButton();
  }

  function initRoundPlayerPool() {
    const pList = $('round-pList');
    if(!pList) return;

    // ⭐ 수정: UI 초기화 - 설정 화면만 표시, 랭킹/대진표는 완전히 숨김
    const setupArea = $('round-setup-area');
    const matchArea = $('round-match-area');
    
    if(setupArea) setupArea.style.display = 'block';
    if(matchArea) matchArea.style.display = 'none';  // 완전히 숨김
    
    // 미니 토너먼트 데이터 초기화
    miniTournamentMatches = [];
    miniTournamentRound = 0;

    // 1) 순위 계산(안전) + 멤버 정렬(점수 높은 순)
    let rankMap = {};
    try {
      rankMap = computeRanksByScoreOnly('score', 'wins', 'losses');
    } catch(e) {
      console.warn('[round] computeRanksByScoreOnly failed:', e);
      rankMap = {};
    }

    const members = players.filter(p => !p.isGuest)
      .sort((a,b) => ((b?.score)||0) - ((a?.score)||0));

    // rank 필드도 미리 세팅 (다른 곳에서 쓸 수도 있으니까)
    members.forEach((p, idx) => { p.rank = rankMap[p.name] || p.rank || (idx+1); });

    // ✅ v3.816: HIDDEN_PLAYERS 제외
    const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

    let html = '<div class="player-pool">';

    // 2) 회원 버튼
    members.forEach((p, idx) => {
      const rankStr = `${p.rank || (idx+1)}위`;
      // ✅ v3.93: Material Symbols 아이콘
      const gIcon = (p.gender === 'F')
        ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
        : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
      html += createPlayerOption({
        inputType: 'checkbox',
        nameAttr: 'round-player',
        id: `round-p-${p.name}`,
        value: p.name,
        checked: false,
        onClick: 'updateRoundCount(); checkRoundGenButton();',
        labelText: gIcon + displayName(p.name),
        isGuest: false,
        showRank: true,
        rankText: rankStr
      });
    });

    // 3) 게스트 버튼 (✅ v3.818: 1대2대결용 버튼 제외)
    if(guests.length > 0) {
      html += '</div>';
      html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
      html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
      html += '</div>';
      html += '<div class="player-pool">';
      guests.forEach(p => {
        html += createPlayerOption({
          inputType: 'checkbox',
          nameAttr: 'round-player',
          id: `round-p-${p.name}`,
          value: p.name,
          checked: false,
          onClick: 'updateRoundCount(); checkRoundGenButton();',
          labelText: displayName(p.name),
          isGuest: true,
          showRank: true,
          rankText: 'G'
        });
      });
    }

    // ✅ v3.8207: 당일 게스트 섹션
    if (oneTimePlayers.length > 0) {
      html += '</div>';
      html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
      html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:white; padding:0 10px; font-size:11px; color:var(--aussie-blue); font-weight:bold;">당일 게스트</span>';
      html += '</div>';
      html += '<div class="player-pool">';
      oneTimePlayers.forEach((name, i) => {
        html += createPlayerOption({
          inputType: 'checkbox',
          nameAttr: 'round-player',
          id: `round-ot-${i}`,
          value: name,
          checked: false,
          onClick: 'updateRoundCount(); checkRoundGenButton();',
          labelText: '[당일] ' + displayName(name),
          isGuest: true,
          showRank: false,
          rankText: ''
        });
      });
    }

    html += '</div>';
    pList.innerHTML = html;
    
    // ⭐ 렌더링 후 카운트 자동 업데이트
    updateRoundCount();
  }

  function renderRoundPlayerList() {
    // 기존 호출부 호환용
    initRoundPlayerPool();
  }

    
  function updateRoundCount() {
    const checked = document.querySelectorAll('input[name="round-player"]:checked');
    $('round-cnt').innerText = checked.length;
    
    if(roundOpt === 'manual' && roundMode === 'double') {
      updateRoundManualTeamPreview();
    }
  }

  function updateRoundManualTeamPreview() {
    const box = $('round-manual-team-box');
    const list = $('round-manual-team-list');
    const checked = Array.from(document.querySelectorAll('input[name="round-player"]:checked')).map(c => c.value);
    
    if(checked.length < 4 || checked.length % 2 !== 0) {
      box.style.display = 'none';
      return;
    }
    
    box.style.display = 'block';
    let html = '';
    for(let i = 0; i < checked.length; i += 2) {
      const teamNo = (i/2) + 1;
      html += `<div class="team-chip"><span class="chip-no">${teamNo}</span>${displayName(checked[i])} & ${displayName(checked[i+1])}</div>`;
    }
    list.innerHTML = html;
  }

  function checkRoundGenButton() {
    const checked = document.querySelectorAll('input[name="round-player"]:checked');
    const btn = $('round-gen-btn');
    
    let minCount = roundMode === 'single' ? 3 : 4;
    if(roundMode === 'double' && checked.length % 2 !== 0) {
      btn.style.opacity = '0.6';
      btn.style.background = 'var(--roland-clay)';
      return;
    }
    
    if(checked.length >= minCount) {
      btn.style.opacity = '1';
      btn.style.background = 'var(--aussie-blue)';
    } else {
      btn.style.opacity = '0.6';
      btn.style.background = 'var(--roland-clay)';
    }
  }

  function generateRoundSchedule() {
    const checked = Array.from(document.querySelectorAll('input[name="round-player"]:checked')).map(c => c.value);
    
    // ✅ 라운드 생성 버튼 클릭 시 기존 매치 강제 초기화
    roundMatches = [];
    roundResults = [];
    
    if(roundMode === 'single' && checked.length < 3) {
      gsAlert('단식은 최소 3명 이상 필요합니다.');
      return;
    }
    
    if(roundMode === 'double') {
      if(checked.length < 4) {
        gsAlert('복식은 최소 4명(2팀) 이상 필요합니다.');
        return;
      }
      if(checked.length % 2 !== 0) {
        gsAlert('복식은 짝수 인원이 필요합니다.');
        return;
      }
    }
    
    // 참가자 구성
    if(roundMode === 'single') {
      roundParticipants = [...checked];
    } else {
      // 복식: 팀 구성
      let teams = [];
      if(roundOpt === 'rank') {
        // 랭킹순으로 정렬 후 순서대로 팀 구성
        const sorted = checked.sort((a, b) => {
          const pA = players.find(p => p.name === a);
          const pB = players.find(p => p.name === b);
          return (pA.rank || 999) - (pB.rank || 999);
        });
        for(let i = 0; i < sorted.length; i += 2) {
          teams.push([sorted[i], sorted[i+1]]);
        }
      } else if(roundOpt === 'random') {
        const shuffled = shuffleArray([...checked]);
        for(let i = 0; i < shuffled.length; i += 2) {
          teams.push([shuffled[i], shuffled[i+1]]);
        }
      } else {
        // manual: 선택 순서대로
        for(let i = 0; i < checked.length; i += 2) {
          teams.push([checked[i], checked[i+1]]);
        }
      }
      roundParticipants = teams;
    }
    
    // 매치 생성 (Round Robin - Circle Method)
    roundMatches = generateRoundRobinMatches(roundParticipants);
    roundResults = [];
    
    // UI 전환
    $('round-setup-area').style.display = 'none';
    $('round-match-area').style.display = 'block';
    
    renderRoundMatches();
    updateRoundRanking();
  }

  function generateRoundRobinMatches(participants) {
    let items = [...participants];

    // 홀수면 BYE 추가(매치 생성 시 BYE는 자동 스킵)
    if(items.length % 2 === 1) {
      items.push('BYE');
    }

    const matches = [];
    const seen = new Set();
    const keyOf = (p) => Array.isArray(p) ? p.join('&') : String(p);

    for(let i = 0; i < items.length; i++) {
      for(let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        if(a === 'BYE' || b === 'BYE') continue;

        const aKey = keyOf(a);
        const bKey = keyOf(b);

        // 고유 키(선수이름1-선수이름2)로 중복 안전장치
        const id = `${aKey}-${bKey}`;
        const idRev = `${bKey}-${aKey}`;
        if(seen.has(id) || seen.has(idRev)) continue;
        seen.add(id);

        matches.push({
          id,
          round: 1,
          home: a,
          away: b,
          winner: null
        });
      }
    }

    return matches;
  }

  function renderRoundMatches() {
    const list = $('round-match-list');
    let html = '';
    
    roundMatches.forEach(m => {
      const isFinished = m.winner !== null;
      const homeDisplay = roundMode === 'single' ? displayName(m.home) : `${displayName(m.home[0])} & ${displayName(m.home[1])}`;
      const awayDisplay = roundMode === 'single' ? displayName(m.away) : `${displayName(m.away[0])} & ${displayName(m.away[1])}`;
      
      html += `
        <div class="team-box" style="margin-bottom:10px; padding:12px; ${isFinished ? 'opacity:0.5;' : ''}">
          <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button onclick="setRoundWinner('${m.id}', 'home')" 
              class="opt-btn" 
              style="flex:1; padding:10px; ${m.winner === 'home' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${homeDisplay}
            </button>
            <div style="font-size:14px; color:var(--text-gray);">vs</div>
            <button onclick="setRoundWinner('${m.id}', 'away')" 
              class="opt-btn" 
              style="flex:1; padding:10px; ${m.winner === 'away' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${awayDisplay}
            </button>
          </div>
        </div>
      `;
    });
    
    list.innerHTML = html || '<div style="text-align:center; color:#ccc; padding:20px;">매치가 없습니다.</div>';
  }

  function setRoundWinner(matchId, side) {
    const match = roundMatches.find(m => m.id === matchId);
    if(!match) return;
    
    match.winner = side;
    renderRoundMatches();
    updateRoundRanking();
    checkRoundSaveButton();
  }

  function updateRoundRanking() {
    // 순위 계산 (Kimjak Algorithm)
    const standings = {};
    
    // 참가자 초기화
    roundParticipants.forEach(p => {
      const key = roundMode === 'single' ? p : p.join('&');
      standings[key] = {
        name: p,
        wins: 0,
        losses: 0,
        matches: 0,
        points: 0,
        h2h: {} // head to head
      };
    });
    
    // 경기 결과 반영
    roundMatches.forEach(m => {
      if(m.winner === null) return;
      
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
      
      standings[homeKey].matches++;
      standings[awayKey].matches++;
      
      if(m.winner === 'home') {
        standings[homeKey].wins++;
        standings[awayKey].losses++;
        standings[homeKey].h2h[awayKey] = (standings[homeKey].h2h[awayKey] || 0) + 1;
      } else {
        standings[awayKey].wins++;
        standings[homeKey].losses++;
        standings[awayKey].h2h[homeKey] = (standings[awayKey].h2h[homeKey] || 0) + 1;
      }
    });
    
    // ⭐ 추가: 미니 토너먼트 경기 결과 반영 (승리당 +1점만, 부전승 포함)
    if(miniTournamentMatches && miniTournamentMatches.length > 0) {
      miniTournamentMatches.forEach(m => {
        if(m.winner === null) return;  // 아직 결과 없는 경기만 제외
        
        const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
        const awayKey = m.away ? (roundMode === 'single' ? m.away : m.away.join('&')) : null;
        
        // 미니 토너먼트는 승/패 카운트 올리지 않고 점수만 별도 추가
        if(m.winner === 'home' && standings[homeKey]) {
          standings[homeKey].miniWins = (standings[homeKey].miniWins || 0) + 1;
        }
        if(m.winner === 'away' && awayKey && standings[awayKey]) {
          standings[awayKey].miniWins = (standings[awayKey].miniWins || 0) + 1;
        }
      });
    }
    
    // 승률 및 점수 계산
    Object.values(standings).forEach(s => {
      s.winRate = s.matches > 0 ? s.wins / s.matches : 0;
      // ✅ v4.02: TENNIS_RULES 참조 (rules/tennis.js)
      const matchType = roundMode === 'single' ? 'single' : 'double';
      const winPoint  = getRoundWinPoint(matchType);
      const losePoint = getRoundLosePoint(matchType);
      // 라운드 로빈 점수 + 미니 토너먼트 점수(승리당 +1점)
      s.points = 1 + (s.wins * winPoint) + (s.losses * losePoint) + ((s.miniWins || 0) * 1);
    });
    
    // 정렬 (Kimjak Algorithm)
    // 1. 다승 2. 승률 3. 승자승(2인 동률만) 4. 최소패 5. 경기수 6. 시즌랭킹
    const sorted = Object.values(standings).sort((a, b) => {
      // 1. 다승
      if(b.wins !== a.wins) return b.wins - a.wins;
      
      // 2. 승률
      if(Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
      
      // 3. 승자승 (2인 동률만)
      const tiedGroup = Object.values(standings).filter(s => 
        Math.abs(s.wins - a.wins) < 0.001 && Math.abs(s.winRate - a.winRate) < 0.001
      );
      if(tiedGroup.length === 2) {
        const aKey = roundMode === 'single' ? a.name : a.name.join('&');
        const bKey = roundMode === 'single' ? b.name : b.name.join('&');
        if(a.h2h[bKey] > 0) return -1;
        if(b.h2h[aKey] > 0) return 1;
      }
      
      // 4. 최소패
      if(a.losses !== b.losses) return a.losses - b.losses;
      
      // 5. 경기수
      if(b.matches !== a.matches) return b.matches - a.matches;
      
      // 6. 시즌랭킹 (단식 선택시 단식랭킹, 복식 선택시 복식랭킹)
      if(roundMode === 'single') {
        const pA = players.find(p => p.name === a.name);
        const pB = players.find(p => p.name === b.name);
        const rankA = pA ? (pA.sRank || 999) : 999;
        const rankB = pB ? (pB.sRank || 999) : 999;
        return rankA - rankB;
      } else {
        // 복식은 두 선수의 평균 복식랭킹
        const getAvgDoubleRank = (team) => {
          const p1 = players.find(p => p.name === team[0]);
          const p2 = players.find(p => p.name === team[1]);
          const r1 = p1 ? (p1.dRank || 999) : 999;
          const r2 = p2 ? (p2.dRank || 999) : 999;
          return (r1 + r2) / 2;
        };
        return getAvgDoubleRank(a.name) - getAvgDoubleRank(b.name);
      }
    });
    
    // 순위 테이블 렌더링
    const table = $('round-rank-table');
    let html = `
      <table class="tennis-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>${roundMode === 'single' ? '선수' : '팀'}</th>
            <th>승패</th>
            <th>승률</th>
            <th>총점</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    sorted.forEach((s, idx) => {
      const nameDisplay = roundMode === 'single' ? displayName(s.name) : `${displayName(s.name[0])} & ${displayName(s.name[1])}`;
      html += `
        <tr>
          <td>${idx + 1}</td>
          <td>${nameDisplay}</td>
          <td>${s.wins}-${s.losses}</td>
          <td>${(s.winRate * 100).toFixed(0)}%</td>
          <td>${s.points.toFixed(1)}</td>
        </tr>
      `;
    });
    
    html += '</tbody></table>';
    table.innerHTML = html;
  }

  function checkRoundSaveButton() {
    const finishedMatches = roundMatches.filter(m => m.winner !== null).length;
    const totalMatches = roundMatches.length;
    const saveBtn = $('round-save-btn');
    const tourBtn = $('round-tournament-btn');
    
    // 조기 종료 허용: 1경기 이상 완료 시 저장 가능
    if(finishedMatches > 0) {
      saveBtn.style.opacity = '1';
      saveBtn.style.background = 'var(--aussie-blue)';
      
      // 토너먼트 전환도 1경기 이상 완료 시 가능
      tourBtn.style.opacity = '1';
      tourBtn.style.background = 'var(--aussie-blue)';
    } else {
      saveBtn.style.opacity = '0.6';
      saveBtn.style.background = 'var(--roland-clay)';
      
      tourBtn.style.opacity = '0.6';
      tourBtn.style.background = 'var(--roland-clay)';
    }
  }

  function saveRoundResults() {
    const finishedMatches = roundMatches.filter(m => m.winner !== null);
    
    if(finishedMatches.length === 0) {
      gsAlert('완료된 경기가 없습니다.');
      return;
    }
    
    if(isPracticeMode === 'practice') {
      gsAlert('⚠️ 현재 연습 모드입니다. 기록이 반영되지 않습니다.');
      return;
    }
    
    gsConfirm(`${finishedMatches.length}경기의 결과를 저장하시겠습니까?`, ok => {
      if(!ok) return;

      // ✅ v3.945: 이번 주 첫 게임 저장 시 주간 랭킹 리셋
      if (typeof checkAndResetWeeklyOnSave === 'function') checkAndResetWeeklyOnSave();

    // 순위 계산
    const standings = {};
    roundParticipants.forEach(p => {
      const key = roundMode === 'single' ? p : p.join('&');
      standings[key] = { name: p, wins: 0, losses: 0, matches: 0, points: 0 };
    });
    
    finishedMatches.forEach(m => {
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
      
      standings[homeKey].matches++;
      standings[awayKey].matches++;
      
      if(m.winner === 'home') {
        standings[homeKey].wins++;
        standings[awayKey].losses++;
      } else {
        standings[awayKey].wins++;
        standings[homeKey].losses++;
      }
    });
    
    // 승률 계산
    Object.values(standings).forEach(s => {
      s.winRate = s.matches > 0 ? s.wins / s.matches : 0;
    });
    
    // 정렬
    const sorted = Object.values(standings).sort((a, b) => {
      if(b.wins !== a.wins) return b.wins - a.wins;
      if(Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
      if(a.losses !== b.losses) return a.losses - b.losses;
      return b.matches - a.matches;
    });
    
    // 점수 부여
    // 1위: +5, 2위: +4, 3위: +3, 4위: +2.5, 5-8위: +1.5, 9위 이하: +0.1
    sorted.forEach((s, idx) => {
      let bonus = TENNIS_RULES.roundBonus[5];
      if(idx === 0) bonus = TENNIS_RULES.roundBonus[0];
      else if(idx === 1) bonus = TENNIS_RULES.roundBonus[1];
      else if(idx === 2) bonus = TENNIS_RULES.roundBonus[2];
      else if(idx === 3) bonus = TENNIS_RULES.roundBonus[3];
      else if(idx < 8) bonus = TENNIS_RULES.roundBonus[4];
      
      // ✅ v4.02: TENNIS_RULES 참조 (rules/tennis.js)
      const matchType = roundMode === 'single' ? 'single' : 'double';
      const winPoint  = getRoundWinPoint(matchType);
      const losePoint = getRoundLosePoint(matchType);
      
      s.points = 1 + (s.wins * winPoint) + (s.losses * losePoint) + bonus;
    });
    
    // MatchLog 및 점수 반영
    finishedMatches.forEach(m => {
      const winner = m.winner === 'home' ? m.home : m.away;
      const loser = m.winner === 'home' ? m.away : m.home;
      
      const log = {
        date: new Date().toISOString().split('T')[0],
        type: roundMode,
        winner: roundMode === 'single' ? [winner] : winner,
        loser: roundMode === 'single' ? [loser] : loser
      };
      
      matchLog.push(log);
      
      // 점수 반영
      if(roundMode === 'single') {
        const wp = players.find(p => p.name === winner);
        const lp = players.find(p => p.name === loser);
        
        if(wp) {
          wp.sWins = (wp.sWins || 0) + 1;
          wp.sScore = (wp.sScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.win); // 참여+승리
        }
        if(lp) {
          lp.sLosses = (lp.sLosses || 0) + 1;
          lp.sScore = (lp.sScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.loss); // 참여+패배
        }
      } else {
        winner.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) {
            p.dWins = (p.dWins || 0) + 1;
            p.dScore = (p.dScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.win); // 참여+승리
          }
        });
        loser.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) {
            p.dLosses = (p.dLosses || 0) + 1;
            p.dScore = (p.dScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.loss); // 참여+패배
          }
        });
      }
    });
    
    // 순위 보너스 적용
    sorted.forEach((s, idx) => {
      let bonus = TENNIS_RULES.roundBonus[5];
      if(idx === 0) bonus = 5;
      else if(idx === 1) bonus = 4;
      else if(idx === 2) bonus = 3;
      else if(idx === 3) bonus = TENNIS_RULES.roundBonus[3];
      else if(idx < 8) bonus = TENNIS_RULES.roundBonus[4];
      
      if(roundMode === 'single') {
        const p = players.find(pl => pl.name === s.name);
        if(p) p.sScore = (p.sScore || 0) + bonus;
      } else {
        s.name.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) p.dScore = (p.dScore || 0) + bonus;
        });
      }
    });
    
    // 조기 종료 선수에게 최소 보너스
    roundParticipants.forEach(participant => {
      const key = roundMode === 'single' ? participant : participant.join('&');
      const stat = standings[key];
      
      if(stat && stat.matches === 0) {
        if(roundMode === 'single') {
          const p = players.find(pl => pl.name === participant);
          if(p) p.sScore = (p.sScore || 0) + TENNIS_RULES.roundBonus[5];
        } else {
          participant.forEach(name => {
            const p = players.find(pl => pl.name === name);
            if(p) p.dScore = (p.dScore || 0) + TENNIS_RULES.roundBonus[5];
          });
        }
      }
    });
    
    // 재계산
    computeAll();
    
    // 저장
    sync();
    
    gsAlert('라운드 결과가 저장되었습니다!');
    showView('game');
    }); // gsConfirm end
  }

  function resetRound() {
    gsConfirm('라운드를 초기화하시겠습니까?', ok => {
      if(!ok) return;
    
    roundParticipants = [];
    roundMatches = [];
    roundResults = [];
    miniTournamentMatches = [];
    miniTournamentRound = 0;
    
    $('round-setup-area').style.display = 'block';
    $('round-match-area').style.display = 'none';
    
    // ✅ 랭킹판/대진표 영역도 깨끗하게 비우고 다시 그릴 준비
    const rankTable = $('round-rank-table');
    const matchList = $('round-match-list');
    if(rankTable) rankTable.innerHTML = '';
    if(matchList) matchList.innerHTML = '';
    
    // ⭐ 카운트 리셋 추가
    const cntSpan = $('round-cnt');
    if(cntSpan) cntSpan.textContent = '0';

    renderRoundPlayerList();
    }); // gsConfirm end
  }

  function convertRoundToTournament() {
    const finishedMatches = roundMatches.filter(m => m.winner !== null);
    
    if(finishedMatches.length === 0) {
      gsAlert('완료된 경기가 없습니다.');
      return;
    }
    
    // 현재까지의 경기 저장
    if(isPracticeMode !== 'practice') {
      saveRoundDataToLog(finishedMatches);
    }
    
    // 순위 계산
    const standings = {};
    roundParticipants.forEach(p => {
      const key = roundMode === 'single' ? p : p.join('&');
      standings[key] = { name: p, wins: 0, losses: 0, matches: 0, winRate: 0 };
    });
    
    finishedMatches.forEach(m => {
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
      
      standings[homeKey].matches++;
      standings[awayKey].matches++;
      
      if(m.winner === 'home') {
        standings[homeKey].wins++;
        standings[awayKey].losses++;
      } else {
        standings[awayKey].wins++;
        standings[homeKey].losses++;
      }
    });
    
    Object.values(standings).forEach(s => {
      s.winRate = s.matches > 0 ? s.wins / s.matches : 0;
    });
    
    const sorted = Object.values(standings).sort((a, b) => {
      if(b.wins !== a.wins) return b.wins - a.wins;
      if(Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
      if(a.losses !== b.losses) return a.losses - b.losses;
      return b.matches - a.matches;
    });
    
    const rankedParticipants = sorted.map(s => s.name);
    
    // ⭐ 모달 열기
    openTournamentModal(rankedParticipants);
  }

  // ========================================
  // 모달 관련 함수들
  // ========================================
  
  function openTournamentModal(rankedParticipants) {
    const modal = $('tournament-modal');
    const list = $('modal-participant-list');
    
    if(!modal || !list) {
      console.error('Modal elements not found');
      return;
    }
    
    // 참가자 목록 렌더링
    let html = '';
    rankedParticipants.forEach((participant, idx) => {
      const rank = idx + 1;
      const displayText = roundMode === 'single' 
        ? displayName(participant) 
        : `${displayName(participant[0])} & ${displayName(participant[1])}`;
      
      // 기본 선택: 상위 4명/팀
      const checked = idx < 4 ? 'checked' : '';
      const selectedClass = idx < 4 ? 'selected' : '';
      
      html += `
        <div class="modal-participant-item ${selectedClass}" onclick="toggleModalParticipant(${idx})">
          <input type="checkbox" class="modal-checkbox" id="modal-p-${idx}" ${checked} onclick="event.stopPropagation(); toggleModalParticipant(${idx})">
          <span class="modal-rank">${rank}위</span>
          <span>${displayText}</span>
        </div>
      `;
    });
    
    list.innerHTML = html;
    
    // 선택 카운트 업데이트
    updateModalCount();
    
    // 모달 표시
    modal.classList.add('active');
  }
  
  function toggleModalParticipant(idx) {
    const checkbox = $(`modal-p-${idx}`);
    if(!checkbox) return;
    
    const item = checkbox.closest('.modal-participant-item');
    if(!item) return;
    
    checkbox.checked = !checkbox.checked;
    
    if(checkbox.checked) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
    
    updateModalCount();
  }
  
  function updateModalCount() {
    const checkboxes = document.querySelectorAll('#modal-participant-list .modal-checkbox');
    const count = Array.from(checkboxes).filter(cb => cb.checked).length;
    const countSpan = $('modal-selected-count');
    if(countSpan) countSpan.textContent = count;
  }
  
  function closeTournamentModal() {
    const modal = $('tournament-modal');
    if(modal) modal.classList.remove('active');
  }
  
  function startTournamentFromModal() {
    // 선택된 참가자 수집
    const checkboxes = document.querySelectorAll('#modal-participant-list .modal-checkbox:checked');
    
    if(checkboxes.length < 2) {
      gsAlert('최소 2명/팀을 선택해야 합니다.');
      return;
    }
    
    const selectedIndices = Array.from(checkboxes).map(cb => {
      return parseInt(cb.id.replace('modal-p-', ''));
    }).sort((a, b) => a - b);
    
    // 순위 계산 (다시)
    const finishedMatches = roundMatches.filter(m => m.winner !== null);
    const standings = {};
    roundParticipants.forEach(p => {
      const key = roundMode === 'single' ? p : p.join('&');
      standings[key] = { name: p, wins: 0, losses: 0, matches: 0, winRate: 0 };
    });
    
    finishedMatches.forEach(m => {
      const homeKey = roundMode === 'single' ? m.home : m.home.join('&');
      const awayKey = roundMode === 'single' ? m.away : m.away.join('&');
      
      standings[homeKey].matches++;
      standings[awayKey].matches++;
      
      if(m.winner === 'home') {
        standings[homeKey].wins++;
        standings[awayKey].losses++;
      } else {
        standings[awayKey].wins++;
        standings[homeKey].losses++;
      }
    });
    
    Object.values(standings).forEach(s => {
      s.winRate = s.matches > 0 ? s.wins / s.matches : 0;
    });
    
    const sorted = Object.values(standings).sort((a, b) => {
      if(b.wins !== a.wins) return b.wins - a.wins;
      if(Math.abs(b.winRate - a.winRate) > 0.001) return b.winRate - a.winRate;
      if(a.losses !== b.losses) return a.losses - b.losses;
      return b.matches - a.matches;
    });
    
    const rankedParticipants = sorted.map(s => s.name);
    
    // 선택된 인덱스로 참가자 필터링
    const selectedParticipants = selectedIndices.map(i => rankedParticipants[i]);
    
    // 모달 닫기
    closeTournamentModal();
    
    // DOM 요소 확인
    const setupArea = $('round-setup-area');
    const matchArea = $('round-match-area');
    const matchList = $('round-match-list');
    const rankTable = $('round-rank-table');
    
    if(!matchArea || !matchList) {
      gsAlert('토너먼트 영역을 찾을 수 없습니다.');
      return;
    }
    
    // setup-area 숨기기
    if(setupArea) setupArea.style.display = 'none';
    
    // match-area 보이기
    matchArea.style.display = 'block';
    
    // 랭킹판 계속 표시
    if(rankTable) {
      const rankTitle = rankTable.previousElementSibling;
      if(rankTitle?.classList?.contains('tour-section-title')) {
        rankTitle.style.display = 'block';
      }
      rankTable.style.display = 'block';
    }
    try{ if(typeof updateRoundRanking==='function') updateRoundRanking(); }catch(e){ console.warn('[round] updateRoundRanking failed:', e); }
    
    // match-list 초기화
    matchList.innerHTML = '';
    
    // 토너먼트 시작
    setTimeout(() => startRoundMiniTournament(selectedParticipants), 100);
  }

  // 라운드 데이터 저장 헬퍼 함수
  function saveRoundDataToLog(finishedMatches) {
    finishedMatches.forEach(m => {
      const winner = m.winner === 'home' ? m.home : m.away;
      const loser = m.winner === 'home' ? m.away : m.home;
      
      const log = {
        date: new Date().toISOString().split('T')[0],
        type: roundMode,
        winner: roundMode === 'single' ? [winner] : winner,
        loser: roundMode === 'single' ? [loser] : loser
      };
      
      matchLog.push(log);
      
      // 점수 반영
      if(roundMode === 'single') {
        const wp = players.find(p => p.name === winner);
        const lp = players.find(p => p.name === loser);
        
        if(wp) {
          wp.sWins = (wp.sWins || 0) + 1;
          wp.sScore = (wp.sScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.win);
        }
        if(lp) {
          lp.sLosses = (lp.sLosses || 0) + 1;
          lp.sScore = (lp.sScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.loss);
        }
      } else {
        winner.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) {
            p.dWins = (p.dWins || 0) + 1;
            p.dScore = (p.dScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.win);
          }
        });
        loser.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) {
            p.dLosses = (p.dLosses || 0) + 1;
            p.dScore = (p.dScore || 0) + (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.loss);
          }
        });
      }
    });
    
    computeAll();
    sync();
  }

  // 미니 토너먼트 상태

  function startRoundMiniTournament(rankedParticipants) {
    if(!rankedParticipants || rankedParticipants.length === 0) {
      gsAlert('토너먼트를 시작할 수 없습니다. 참가자 데이터가 없습니다.');
      return;
    }
    
    const n = rankedParticipants.length;
    
    // 2의 거듭제곱 계산
    let bracketSize = 2;
    while(bracketSize < n) bracketSize *= 2;
    
    // 부전승 수 계산
    const byeCount = bracketSize - n;
    
    // 첫 라운드 매치 생성 (부전승 시스템 적용)
    miniTournamentMatches = [];
    let matchCount = 0;
    
    for(let i = 0; i < bracketSize / 2; i++) {
      const highIdx = i;
      const lowIdx = bracketSize - 1 - i;
      
      const high = highIdx < n ? rankedParticipants[highIdx] : null;
      const low = lowIdx < n ? rankedParticipants[lowIdx] : null;
      
      // 둘 다 있으면 매치 생성
      if(high !== null && low !== null) {
        matchCount++;
        miniTournamentMatches.push({
          id: `T-R1-M${matchCount}`,
          round: 1,
          home: high,
          away: low,
          winner: null
        });
      }
      // 한 명만 있으면 부전승 (자동 승리)
      else if(high !== null && low === null) {
        matchCount++;
        miniTournamentMatches.push({
          id: `T-R1-M${matchCount}`,
          round: 1,
          home: high,
          away: null,  // 부전승 표시
          winner: 'home',  // 자동 승리
          isBye: true  // 부전승 플래그
        });
        
        // ⭐ 부전승 시 즉시 +1점 부여 (상위 랭커 특전)
        if(isPracticeMode !== 'practice') {
          if(roundMode === 'single') {
            const p = players.find(pl => pl.name === high);
            if(p) p.sScore = (p.sScore || 0) + 1;
          } else {
            high.forEach(name => {
              const p = players.find(pl => pl.name === name);
              if(p) p.dScore = (p.dScore || 0) + 1;
            });
          }
          // 즉시 저장 및 재계산
          computeAll();
          sync();
        }
      }
    }
    
    miniTournamentRound = 1;
    renderMiniTournament();
    
    // 랭킹 업데이트 (부전승 점수 반영)
    try{ if(typeof updateRoundRanking==='function') updateRoundRanking(); }catch(e){ console.warn('[round] updateRoundRanking failed:', e); }
    
    // 부전승 안내 메시지
    if(byeCount > 0) {
      setTimeout(() => {
        gsAlert(`💡 ${byeCount}명/팀이 부전승으로 다음 라운드에 자동 진출합니다.\n상위 랭커에게 부전승이 배정됩니다.`);
      }, 500);
    }
  }

  function renderMiniTournament() {
    const list = $('round-match-list');
    if(!list) return;
    
    const currentRound = miniTournamentMatches.filter(m => m.round === miniTournamentRound);
    
    if(currentRound.length === 0) {
      list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-gray);">표시할 매치가 없습니다.</div>';
      return;
    }
    
    let html = `<div style="text-align:center; margin-bottom:20px; padding:15px; background:var(--wimbledon-sage); color:white; border-radius:12px; font-size:16px; font-weight:bold;">🏆 라운드 미니 토너먼트 - Round ${miniTournamentRound}</div>`;
    
    currentRound.forEach(m => {
      const isFinished = m.winner !== null;
      const isBye = m.isBye || false;
      
      // 부전승 처리
      if(isBye) {
        const homeDisplay = roundMode === 'single' ? displayName(m.home) : `${displayName(m.home[0])} & ${displayName(m.home[1])}`;
        html += `
          <div class="team-box" style="margin-bottom:10px; padding:12px; opacity:0.7; background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);">
            <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id} - 부전승</div>
            <div style="text-align:center; padding:10px;">
              <span style="color:var(--wimbledon-sage); font-weight:700; font-size:15px;">
                ✓ ${homeDisplay}
              </span>
              <div style="font-size:12px; color:var(--text-gray); margin-top:5px;">다음 라운드 자동 진출</div>
            </div>
          </div>
        `;
        return;
      }
      
      // 일반 매치
      const homeDisplay = roundMode === 'single' ? displayName(m.home) : `${displayName(m.home[0])} & ${displayName(m.home[1])}`;
      const awayDisplay = roundMode === 'single' ? displayName(m.away) : `${displayName(m.away[0])} & ${displayName(m.away[1])}`;
      
      html += `
        <div class="team-box" style="margin-bottom:10px; padding:12px; ${isFinished ? 'opacity:0.5;' : ''}">
          <div style="font-size:11px; color:var(--text-gray); margin-bottom:8px;">${m.id}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button onclick="setMiniTournamentWinner('${m.id}', 'home')" 
              class="opt-btn" 
              style="flex:1; padding:10px; ${m.winner === 'home' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${homeDisplay}
            </button>
            <div style="font-size:14px; color:var(--text-gray);">vs</div>
            <button onclick="setMiniTournamentWinner('${m.id}', 'away')" 
              class="opt-btn" 
              style="flex:1; padding:10px; ${m.winner === 'away' ? 'background:var(--wimbledon-sage); opacity:1;' : 'opacity:0.7;'}">
              ${awayDisplay}
            </button>
          </div>
        </div>
      `;
    });
    
    list.innerHTML = html;
  }

  function setMiniTournamentWinner(matchId, side) {
    const match = miniTournamentMatches.find(m => m.id === matchId);
    if(!match || match.winner !== null) return;
    
    match.winner = side;
    const winner = side === 'home' ? match.home : match.away;
    
    // 이벤트성 점수 - 승리당 +1점만 (김작 가산점 룰)
    if(isPracticeMode !== 'practice') {
      if(roundMode === 'single') {
        const p = players.find(pl => pl.name === winner);
        if(p) p.sScore = (p.sScore || 0) + 1;
      } else {
        winner.forEach(name => {
          const p = players.find(pl => pl.name === name);
          if(p) p.dScore = (p.dScore || 0) + 1;
        });
      }
    }
    
    
    // ✅ 점수 반영 즉시 상단 랭킹판 실시간 업데이트
    try{ if(typeof updateRoundRanking==='function') updateRoundRanking(); }catch(e){ console.warn('[round] updateRoundRanking failed:', e); }
    // 현재 라운드의 모든 매치가 끝났는지 확인
    const currentRound = miniTournamentMatches.filter(m => m.round === miniTournamentRound);
    const allFinished = currentRound.every(m => m.winner !== null);
    
    if(allFinished) {
      // 승자들로 다음 라운드 생성
      const winners = currentRound.map(m => m.winner === 'home' ? m.home : m.away);
      
      if(winners.length === 1) {
        // 우승자 결정
        const champion = winners[0];
        const champDisplay = roundMode === 'single' ? displayName(champion) : `${displayName(champion[0])} & ${displayName(champion[1])}`;
        
        if(isPracticeMode !== 'practice') {
          computeAll();
          sync();
        }
        
        gsAlert(`🏆 우승: ${champDisplay}!\n\n미니 토너먼트가 종료되었습니다.`);
        return;
      }
      
      // 다음 라운드 생성
      miniTournamentRound++;
      const nextMatches = [];
      for(let i = 0; i < winners.length; i += 2) {
        nextMatches.push({
          id: `T-R${miniTournamentRound}-M${(i/2) + 1}`,
          round: miniTournamentRound,
          home: winners[i],
          away: winners[i + 1],
          winner: null
        });
      }
      miniTournamentMatches.push(...nextMatches);
    }
    
    renderMiniTournament();
  }


