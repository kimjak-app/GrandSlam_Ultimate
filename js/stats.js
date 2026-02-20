  function ensure(p) {
    const fs=['score','wins','losses','last','dScore','dWins','dLosses','lastD','sScore','sWins','sLosses','lastS', 'weekly','wWins','wLosses','wdScore','wsScore','wdWins','wdLosses','wsWins','wsLosses','lastW','lastWD','lastWS',
      // ✅ v3.94: 혼복 필드 (Mixed Double)
      'mScore','mWins','mLosses','lastM'];
    fs.forEach(f=>{ if(p[f]===undefined) p[f]=0; });
    if (p.isGuest === undefined) p.isGuest = false;
    // ✅ v3.93: gender 정규화 — 'M'|'F' 외 값은 전부 'M'으로 보정
    if (p.gender !== 'M' && p.gender !== 'F') p.gender = 'M';
    if(!p.name) p.name = "NONAME";
    return p;
  }

  function tab(n) {
    tabNow = n;
    for (let i = 1; i <= 2; i++) {
      if ($('s' + i)) $('s' + i).style.display = (i == n ? 'block' : 'none');
      if ($('t' + i)) $('t' + i).className = (i == n ? 'tab-btn active' : 'tab-btn');
    }
    if (n == 1) { updateSeason(); updateChartRange(0); }
    if (n == 2) updateWeekly();
    setTimeout(applyAutofitAllTables, 0);
  }

  
  function calcRateByKeys(p, winK, lossK){
    const t = (p[winK]||0) + (p[lossK]||0);
    return t > 0 ? ((p[winK]||0) / t) : 0;
  }

  function computeRanksByScoreOnly(scoreK, winK, lossK){
    const sorted = [...players].sort((a,b) => (b[scoreK]||0) - (a[scoreK]||0) || calcRateByKeys(b,winK,lossK) - calcRateByKeys(a,winK,lossK));
    const ranks = {};
    let currentRank = 1;
    sorted.forEach((p, i) => {
      if(i > 0){
        const prev = sorted[i-1];
        if((p[scoreK]||0) !== (prev[scoreK]||0)) currentRank = i + 1;
      }
      ranks[p.name] = currentRank;
    });
    return ranks;
  }

  function snapshotLastRanks(){
    if(!Array.isArray(players) || players.length === 0) return;

    const maps = {
      last:   computeRanksByScoreOnly('score',  'wins',  'losses'),
      lastD:  computeRanksByScoreOnly('dScore', 'dWins', 'dLosses'),
      lastS:  computeRanksByScoreOnly('sScore', 'sWins', 'sLosses'),
      lastW:  computeRanksByScoreOnly('weekly', 'wWins', 'wLosses'),
      lastWD: computeRanksByScoreOnly('wdScore','wdWins','wdLosses'),
      lastWS: computeRanksByScoreOnly('wsScore','wsWins','wsLosses'),
      // ✅ v3.94: 혼복 스냅샷
      lastM:  computeRanksByScoreOnly('mScore', 'mWins', 'mLosses'),
    };

    players.forEach(p=>{
      p.last   = maps.last[p.name]   || p.last   || 0;
      p.lastD  = maps.lastD[p.name]  || p.lastD  || 0;
      p.lastS  = maps.lastS[p.name]  || p.lastS  || 0;
      p.lastW  = maps.lastW[p.name]  || p.lastW  || 0;
      p.lastWD = maps.lastWD[p.name] || p.lastWD || 0;
      p.lastWS = maps.lastWS[p.name] || p.lastWS || 0;
      p.lastM  = maps.lastM[p.name]  || p.lastM  || 0;
    });
  }

  // round/tournament 등에서 호출하는 공용 재계산 훅 (예전 computeAll() 호환)
  function computeAll() {
    // 정의된 함수만 안전하게 실행 (ReferenceError/SyntaxError 방지)
    if (typeof updateSeason === 'function') updateSeason();
    if (typeof updateWeekly === 'function') updateWeekly();
    if (typeof updateRankList === 'function') updateRankList();
    if (typeof updateChart === 'function') updateChart();
  }


  function aggregateSeasonForNamesFromLog(nameList){
    const set = new Set(nameList || []);
    const out = {};
    (nameList||[]).forEach(n=>{
      out[n]={score:0,wins:0,losses:0,dScore:0,dWins:0,dLosses:0,sScore:0,sWins:0,sLosses:0};
    });
    (matchLog||[]).forEach(m=>{
      const type = (m.type||"double");
      const winner = m.winner || "";
      const home = Array.isArray(m.home) ? m.home : [];
      const away = Array.isArray(m.away) ? m.away : [];

      const applyOne = (name, isHomeSide) => {
        if(!set.has(name)) return;
        const isWin = (winner === (isHomeSide ? "home" : "away"));
        const d = calcDeltas(type, isWin);
        const s = out[name];

        s.score += d.total;
        s.wins += isWin ? 1 : 0;
        s.losses += isWin ? 0 : 1;

        if(type === "double"){
          s.dScore += d.d;
          s.dWins += isWin ? 1 : 0;
          s.dLosses += isWin ? 0 : 1;
        } else {
          s.sScore += d.s;
          s.sWins += isWin ? 1 : 0;
          s.sLosses += isWin ? 0 : 1;
        }
      };

      home.forEach(n=>applyOne(n,true));
      away.forEach(n=>applyOne(n,false));
    });
    return out;
  }

function renderRankTable(tableId, scoreK, winK, lossK, lastK, filterMode) {
    const baseList = (() => {
      if (filterMode === 'guest') {
        // ✅ v3.816: HIDDEN_PLAYERS는 게스트 랭킹에서도 제외
        const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));
        const names = guests.map(p=>p.name);
        const agg = aggregateSeasonForNamesFromLog(names);
        // Merge computed season stats into the current player objects (keeps last-rank fields)
        return guests.map(p => Object.assign({}, p, agg[p.name] || {}));
      }
      if (filterMode === 'all') return [...players];
      // ✅ v3.92: 성별 필터
      if (filterMode === 'male') return players.filter(p => !p.isGuest && p.gender !== 'F');
      if (filterMode === 'female') return players.filter(p => !p.isGuest && p.gender === 'F');
      // 기본: 정식 회원(게스트가 아닌 선수)만 랭킹에 포함
      return players.filter(p => !p.isGuest);
    })();
    const calcRate = (p) => {
      const t = (p[winK]||0) + (p[lossK]||0);
      return t > 0 ? ((p[winK]||0) / t) : 0;
    };

    const wrSorted = [...baseList].sort((a,b) => calcRate(b) - calcRate(a) || (b[winK]||0) - (a[winK]||0));
    const wrRanks = {};
    let currentWrRank = 1;
    wrSorted.forEach((p, i) => {
      if (i > 0) {
        const prev = wrSorted[i-1];
        if (calcRate(p) !== calcRate(prev)) currentWrRank = i + 1;
      }
      wrRanks[p.name] = currentWrRank;
    });

    const sorted = [...baseList].sort((a,b) => (b[scoreK]||0) - (a[scoreK]||0) || calcRate(b) - calcRate(a));
    const table = $(tableId);

    table.innerHTML = `<thead><tr>
      <th style="width:11%;">순위</th>
      <th style="width:34%;">이름</th>
      <th style="width:24%;">승률</th>
      <th style="width:12%;">승/패</th>
      <th style="width:19%;">총점</th>
    </tr></thead><tbody></tbody>`;

    let currentRank = 1;
    table.querySelector('tbody').innerHTML = sorted.map((p, i) => {
      if (i > 0) {
        const prev = sorted[i-1];
        if ((p[scoreK]||0) !== (prev[scoreK]||0)) currentRank = i + 1;
      }

      const rankIcon = (currentRank === 1) ? '<span class="material-symbols-outlined rank-1-icon">emoji_events</span>' : currentRank;
      const lastShown = (p[lastK] && Number(p[lastK]) > 0) ? Number(p[lastK]) : currentRank;

      let df =
        (p[lastK] && Number(p[lastK]) > 0 && lastShown !== currentRank)
        ? (lastShown > currentRank ? `<span style="color:var(--up-red)">▲${lastShown - currentRank}</span>` : `<span style="color:var(--down-blue)">▼${currentRank - lastShown}</span>`)
        : '-';

      const shownName = displayName(p.name);
      // ✅ v3.93: 이름 셀 인라인 아이콘 — Material Symbols, 컬럼 없이 이름 앞에만
      const gIcon = (p.gender === 'F')
        ? '<span class="material-symbols-outlined" style="font-size:14px; color:#E8437A; vertical-align:middle; margin-right:2px;">female</span>'
        : '<span class="material-symbols-outlined" style="font-size:14px; color:#3A7BD5; vertical-align:middle; margin-right:2px;">male</span>';
      return `<tr>
        <td>${rankIcon}</td>
        <td style="text-align:left; padding-left:10px; overflow:hidden;">
          <div data-autofit="1" class="autofit-cell" style="display:flex; align-items:center; gap:4px;">
            ${gIcon}<span style="font-weight:400; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(shownName)}</span>
            <span data-autofit="1" class="sub-info autofit-cell" style="margin-left:0;">(${lastShown}위)${df}</span>
          </div>
        </td>
        <td data-autofit="1" class="sub-info autofit-cell">${(calcRate(p)*100).toFixed(1)}% (${wrRanks[p.name]}위)</td>
        <td style="font-size:11px; white-space:nowrap;">${(p[winK]||0)}/${(p[lossK]||0)}</td>
        <td class="point-text" style="white-space:nowrap;">${Number(p[scoreK]||0).toFixed(1)}</td>
      </tr>`;
    }).join('');

    setTimeout(()=>applyAutofit(table), 0);
  }

  // ========================================
  // RANKING SYSTEM
  // ========================================

  function updateSeason() {
    const tab = window.genderRankTab || 'all';

    // ✅ v3.942: 종합 순위표 — 탭에 따라 필터 적용
    if (tab === 'all') {
      renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last');
    } else if (tab === 'male') {
      renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last', 'male');
    } else if (tab === 'female') {
      renderRankTable('seasonTable', 'score', 'wins', 'losses', 'last', 'female');
    }

    // 복식 섹션 show/hide
    const secDoubleM = $('sec-double-male');
    const secDoubleF = $('sec-double-female');
    const secMixed   = $('sec-mixed');
    const secSingleM = $('sec-single-male');
    const secSingleF = $('sec-single-female');
    const gs         = $('guest-rank-section');

    if (tab === 'all') {
      // 전부 표시
      if(secDoubleM) secDoubleM.style.display = 'block';
      if(secDoubleF) secDoubleF.style.display = 'block';
      if(secMixed)   secMixed.style.display   = 'block';
      if(secSingleM) secSingleM.style.display = 'block';
      if(secSingleF) secSingleF.style.display = 'block';
      if(gs)         gs.style.display         = 'block';

      renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
      renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
      renderMixedRankTable('seasonMixedTable');
      renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');
      renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
      renderRankTable('guestSeasonTotalTable',  'score',  'wins',   'losses',  'last',  'guest');
      renderRankTable('guestSeasonDoubleTable', 'dScore', 'dWins',  'dLosses', 'lastD', 'guest');
      renderRankTable('guestSeasonSingleTable', 'sScore', 'sWins',  'sLosses', 'lastS', 'guest');

    } else if (tab === 'male') {
      // 남자 섹션만 표시
      if(secDoubleM) secDoubleM.style.display = 'block';
      if(secDoubleF) secDoubleF.style.display = 'none';
      if(secMixed)   secMixed.style.display   = 'none';
      if(secSingleM) secSingleM.style.display = 'block';
      if(secSingleF) secSingleF.style.display = 'none';
      if(gs)         gs.style.display         = 'none';

      renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
      renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');

    } else if (tab === 'female') {
      // 여자 섹션만 표시
      if(secDoubleM) secDoubleM.style.display = 'none';
      if(secDoubleF) secDoubleF.style.display = 'block';
      if(secMixed)   secMixed.style.display   = 'none';
      if(secSingleM) secSingleM.style.display = 'none';
      if(secSingleF) secSingleF.style.display = 'block';
      if(gs)         gs.style.display         = 'none';

      renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
      renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
    }
  }

  // ✅ v3.94: 혼복 랭킹 렌더링 — mScore/mWins/mLosses 필드 기반
  function renderMixedRankTable(tableId) {
    const table = $(tableId);
    if (!table) return;
    // 혼복 경기가 한 번이라도 있는 선수만 표시
    const list = players.filter(p => !p.isGuest && (p.mWins > 0 || p.mLosses > 0));
    if (list.length === 0) {
      table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">혼복 경기 기록 없음</td></tr></tbody>';
      return;
    }
    renderRankTable(tableId, 'mScore', 'mWins', 'mLosses', 'lastM');
  }

  // ✅ v3.94: 성별 랭킹 탭 전환
  function switchGenderRankTab(tab) {
    window.genderRankTab = tab;
    ['all','male','female'].forEach(t => {
      const btn = $('gender-rank-tab-' + t);
      if(btn) btn.className = (t === tab) ? 'gender-tab-btn active' : 'gender-tab-btn';
    });
    updateSeason();
  }

  function updateWeekly() {
    renderRankTable('weeklyTotalTable', 'weekly', 'wWins', 'wLosses', 'lastW');
    renderRankTable('weeklyDoubleTable', 'wdScore', 'wdWins', 'wdLosses', 'lastWD');
    renderRankTable('weeklySingleTable', 'wsScore', 'wsWins', 'wsLosses', 'lastWS');
  }

  function updateChartRange(rangeIdx) {
    document.querySelectorAll('.chart-nav .chart-btn').forEach((b,i) => b.className = i===rangeIdx ? 'chart-btn active' : 'chart-btn');

    const emptyChart = () => {
      if(chart) chart.destroy();
      chart = new Chart($('seasonChart').getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    };

    // ✅ v3.818: 경기 기록 없으면 빈 차트
    if (!matchLog || matchLog.length === 0) { emptyChart(); return; }

    // 유효한 날짜 모두 수집 (중복 제거, 정렬)
    const allDates = [...new Set(
      matchLog
        .filter(m => m.date && m.date.length >= 10)
        .map(m => m.date.slice(0,10))
    )].sort();

    if (allDates.length === 0) { emptyChart(); return; }

    // 범위별 월 필터
    const monthRanges = [[2,3],[4,5],[6,7],[8,9],[10,11],[12,1]];
    const [startMonth, endMonth] = monthRanges[rangeIdx];

    const filteredDates = allDates.filter(d => {
      const m = parseInt(d.slice(5,7));
      return startMonth <= endMonth ? (m >= startMonth && m <= endMonth) : (m >= startMonth || m <= endMonth);
    });

    if (filteredDates.length === 0) { emptyChart(); return; }

    // ✅ v3.818: 날짜별 누적 점수로 순위 계산
    const members = players.filter(p => !p.isGuest);
    const colors = ['#FF3B30','#007AFF','#34C759','#FF9500','#AF52DE','#5856D6','#FF2D55','#5AC8FA','#FFCC00'];

    // 각 선수 누적 점수 초기화
    const cumScore = {};
    members.forEach(p => { cumScore[p.name] = 0; });

    // matchLog를 날짜 오름차순으로 정렬
    const sortedLog = [...matchLog].filter(m => m.date && m.date.length >= 10)
      .sort((a,b) => a.date.localeCompare(b.date));

    // 날짜별 순위 스냅샷 { 'YYYY-MM-DD': { 선수명: 순위 } }
    const rankSnapshots = {};
    let logIdx = 0;

    allDates.forEach(dateStr => {
      // 해당 날짜까지의 경기 반영
      while(logIdx < sortedLog.length && sortedLog[logIdx].date.slice(0,10) <= dateStr) {
        const log = sortedLog[logIdx];
        const homeWin = log.winner === 'home';
        const winners = homeWin ? (log.home || []) : (log.away || []);
        const losers  = homeWin ? (log.away || []) : (log.home || []);
        const isDouble = log.type === 'double';
        winners.forEach(n => { if(cumScore[n] !== undefined) cumScore[n] += isDouble ? 3.0 : 4.0; });
        losers.forEach(n  => { if(cumScore[n] !== undefined) cumScore[n] += isDouble ? 0.3 : 0.5; });
        logIdx++;
      }
      // 현재 누적 점수로 순위 계산
      const sorted = [...members].sort((a,b) => (cumScore[b.name]||0) - (cumScore[a.name]||0));
      const snap = {};
      sorted.forEach((p,i) => { snap[p.name] = i + 1; });
      rankSnapshots[dateStr] = snap;
    });

    // 표시용 라벨 (MM/DD)
    const labels = filteredDates.map(d => `${parseInt(d.slice(5,7))}/${parseInt(d.slice(8,10))}`);

    const datasets = members.map((p, i) => ({
      label: p.name,
      data: filteredDates.map(d => rankSnapshots[d] ? (rankSnapshots[d][p.name] || null) : null),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length],
      pointRadius: 5,
      borderWidth: 2,
      spanGaps: true,
      clip: false
    }));

    if(chart) chart.destroy();
    chart = new Chart($('seasonChart').getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 50, bottom: 20, left: 10, right: 10 } },
        scales: {
          y: { reverse: true, min: 1, max: Math.max(members.length + 1, 10), ticks: { stepSize: 1, autoSkip: false }, grid: { color: '#eee' } },
          x: { grid: { display: false } }
        },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } }
        }
      }
    });
  }

  
  function nowISO() {
    const d = new Date();
    const ds = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    return { ts: d.getTime(), ds };
  }

  function calcDeltas(type, isWin) {
    if (type === "double") return isWin ? { total: 3.0, d: 3.0, s: 0.0 } : { total: 0.3, d: 0.3, s: 0.0 };
    return isWin ? { total: 4.0, d: 0.0, s: 4.0 } : { total: 0.5, d: 0.0, s: 0.5 };
  }

  function applyMatchToPlayers(type, homeArr, awayArr, winnerSide) {
    // ✅ v3.8206: 당일 게스트는 players 배열에 없으므로 자동으로 집계 제외됨
    const homeWin = winnerSide === "home";

    // ✅ v3.941: 혼복 판별 — 한 팀이라도 남+여 조합이면 혼복으로 판정
    // (남+남 vs 남+여, 여+여 vs 남+여 등 모두 혼복으로 처리)
    // 혼복 점수는 실제로 혼성 팀에 속한 선수만 취득
    const isMixedTeam = (arr) => {
      if (arr.length < 2) return false;
      const genders = arr.map(n => { const p = players.find(x=>x.name===n); return p ? p.gender : 'M'; });
      return genders.includes('M') && genders.includes('F');
    };
    const homeMixed = type === 'double' && isMixedTeam(homeArr);
    const awayMixed = type === 'double' && isMixedTeam(awayArr);

    const apply = (ns, isW, isMyTeamMixed) => ns.forEach(n => {
      var p = players.find(x=>x.name==n);
      if(!p) return;
      const d = calcDeltas(type, isW);

      p.score += d.total;
      p.wins += isW ? 1 : 0;
      p.losses += isW ? 0 : 1;

      if (type === "double") {
        p.dScore += d.d;
        p.dWins += isW ? 1 : 0;
        p.dLosses += isW ? 0 : 1;
        // ✅ v3.941: 내 팀이 혼성이면 혼복 점수 취득
        if (isMyTeamMixed) {
          p.mScore += d.d;
          p.mWins += isW ? 1 : 0;
          p.mLosses += isW ? 0 : 1;
        }
      } else {
        p.sScore += d.s;
        p.sWins += isW ? 1 : 0;
        p.sLosses += isW ? 0 : 1;
      }

      p.weekly += d.total;
      p.wWins += isW ? 1 : 0;
      p.wLosses += isW ? 0 : 1;

      if (type === "double") {
        p.wdScore += d.d;
        p.wdWins += isW ? 1 : 0;
        p.wdLosses += isW ? 0 : 1;
      } else {
        p.wsScore += d.s;
        p.wsWins += isW ? 1 : 0;
        p.wsLosses += isW ? 0 : 1;
      }
    });

    if(homeWin) { apply(homeArr, true, homeMixed); apply(awayArr, false, awayMixed); }
    else { apply(awayArr, true, awayMixed); apply(homeArr, false, homeMixed); }
  }


  // ========================================
  // STATISTICS (통계)
  // ========================================
  
  function renderStatsPlayerList() {
    const members = players.filter(p => !p.isGuest).sort((a,b)=>(b.score||0)-(a.score||0));
    // ✅ v3.816: HIDDEN_PLAYERS 제외
    const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

    let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';

    // 1. 정식 회원 섹션
    html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
    html += '<div class="player-pool" style="margin-bottom:20px;">';
    members.forEach((p, i) => {
      // ✅ v3.93: Material Symbols 아이콘
      const gIcon = (p.gender === 'F')
        ? '<span class="material-symbols-outlined" style="font-size:13px; color:#E8437A; vertical-align:middle;">female</span>'
        : '<span class="material-symbols-outlined" style="font-size:13px; color:#3A7BD5; vertical-align:middle;">male</span>';
      html += createPlayerOption({ inputType:"radio", nameAttr:"statsPick", id:`stat_p_${i}`, value:p.name, checked:false, onClick:`viewStats('${escapeHtml(p.name).replace(/'/g,"&#39;")}')`, labelText:`${gIcon}${escapeHtml(displayName(p.name))}`, isGuest:false, showRank:true, rankText:`${i+1}위` });
    });
    html += '</div>';

    // 2. 게스트 섹션 (게스트가 있을 때만 출력)
    if (guests.length > 0) {
      html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
      html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
      html += '</div>';

      html += '<div class="player-pool">';
      guests.forEach((p, i) => {
        html += createPlayerOption({ inputType:"radio", nameAttr:"statsPick", id:`stat_g_${i}`, value:p.name, checked:false, onClick:`viewStats('${escapeHtml(p.name).replace(/'/g,"&#39;")}')`, labelText:`[G] ${escapeHtml(displayName(p.name))}`, isGuest:true, showRank:false });
      });
      html += '</div>';
    }

    html += '</div>';

    $('stats-pList').innerHTML = html;
  }


  function isInTeam(teamArr, name) {
    return Array.isArray(teamArr) && teamArr.includes(name);
  }

  function getOpponentNames(log, name) {
    const homeHas = isInTeam(log.home, name);
    const awayHas = isInTeam(log.away, name);
    if (!homeHas && !awayHas) return [];
    return homeHas ? (log.away || []) : (log.home || []);
  }

  function getPartnerNames(log, name) {
    if (log.type !== "double") return [];
    const homeHas = isInTeam(log.home, name);
    const awayHas = isInTeam(log.away, name);
    if (!homeHas && !awayHas) return [];
    const team = homeHas ? (log.home || []) : (log.away || []);
    return team.filter(n => n !== name);
  }

  function didPlayerWin(log, name) {
    const homeHas = isInTeam(log.home, name);
    const awayHas = isInTeam(log.away, name);
    if (!homeHas && !awayHas) return null;
    if (log.winner === "home") return homeHas;
    if (log.winner === "away") return awayHas;
    const hs = Number(log.hs ?? 0), as = Number(log.as ?? 0);
    if (hs === as) return null;
    const homeWin = hs > as;
    return homeWin ? homeHas : awayHas;
  }

  function rateText(w,l) {
    const t = (w||0)+(l||0);
    return t>0 ? (((w||0)/t)*100).toFixed(1) : "0.0";
  }

  function pickBestByRule(map, preferHigh=true) {
    const entries = Object.entries(map);
    if (entries.length === 0) return null;

    entries.sort((a,b)=>{
      const A=a[1], B=b[1];
      const Ar = (A.w+A.l)>0 ? A.w/(A.w+A.l) : 0; // 내 승률
      const Br = (B.w+B.l)>0 ? B.w/(B.w+B.l) : 0;

      if (preferHigh) {
        if (Br !== Ar) return Br - Ar;                 // 승률 높은 순
        if (B.w !== A.w) return B.w - A.w;             // 승 수 많은 순
        if (B.totalGames !== A.totalGames) return B.totalGames - A.totalGames; // 표본 큰 순
      } else {
        if (Ar !== Br) return Ar - Br;                 // 내 승률 낮은 순
        if (B.totalGames !== A.totalGames) return B.totalGames - A.totalGames; // 표본 큰 순
        if (B.l !== A.l) return B.l - A.l;             // 내가 더 많이 진 상대 우선
      }
      return a[0].localeCompare(b[0]);
    });

    return { name: entries[0][0], stat: entries[0][1] };
  }

  
  // ✅ v3.692: 통계 계산(데이터/HTML 준비) - matchLog 기반
  function computeStatsFromMatchLog(name) {
    const logs = normalizeMatchLog(matchLog)
      .filter(l => isInTeam(l.home, name) || isInTeam(l.away, name))
      .sort((a,b)=>(b.ts||0)-(a.ts||0));

    const recent = logs.slice(0,10);
    const recentResults = recent
      .map(l => didPlayerWin(l, name))
      .filter(v => v === true || v === false);

    const displayResults = recentResults.slice().reverse();

    const dotsHTML =
      (displayResults.length ? displayResults : Array.from({length:10},()=>false))
        .slice(0,10)
        .map(win => `<div class="form-dot ${win?'win-dot':'loss-dot'}"></div>`)
        .join('');

    let streak = 0;
    let lastResult = displayResults.length ? displayResults[displayResults.length - 1] : null;

    if (lastResult !== null) {
      for (let i = displayResults.length - 1; i >= 0; i--) {
        if (displayResults[i] === lastResult) streak++;
        else break;
      }
    }

    // 하단 전적표(단/복/종합) - matchLog 실시간 재집계
    let sWins = 0, sLosses = 0, sScore = 0;
    let dWins = 0, dLosses = 0, dScore = 0;

    logs.forEach(l => {
      const win = didPlayerWin(l, name);
      if (win === null) return;

      const t = (l.type === "double") ? "double" : "single";
      const d = calcDeltas(t, win);

      if (t === "double") {
        dScore += (d.d || 0);
        if (win) dWins++; else dLosses++;
      } else {
        sScore += (d.s || 0);
        if (win) sWins++; else sLosses++;
      }
    });

    const totalWins = sWins + dWins;
    const totalLosses = sLosses + dLosses;
    const totalPt = (Number(sScore) + Number(dScore)).toFixed(1);

    const tableHTML = `
      <tr><td>단식 전적</td><td>${rateText(sWins, sLosses)}%</td><td>${sWins}승 ${sLosses}패</td><td>${Number(sScore).toFixed(1)}</td></tr>
      <tr><td>복식 전적</td><td>${rateText(dWins, dLosses)}%</td><td>${dWins}승 ${dLosses}패</td><td>${Number(dScore).toFixed(1)}</td></tr>
    `;
    const footHTML = `
      <tr style="background:#f9f9f9; font-weight: bold; border-top: 2px solid var(--wimbledon-sage);">
        <td>종합 전적</td><td>${rateText(totalWins, totalLosses)}%</td><td>${totalWins}승 ${totalLosses}패</td>
        <td style="color:var(--wimbledon-sage);">${totalPt} pt</td>
      </tr>
    `;

    // 상대/파트너/천적 맵
    const singleOppMap = {};
    const partnerMap = {};
    const doubleEnemyMap = {};
    // ✅ v3.942: 이성간 단식, 혼복 파트너/천적 맵
    const crossSingleOppMap = {};   // 이성간 단식 상대
    const mixedPartnerMap = {};     // 혼복 파트너 (이성)
    const mixedEnemyMap = {};       // 혼복 상대 전체
    const mixedEnemyMMap = {};      // 혼복 남자 천적용
    const mixedEnemyFMap = {};      // 혼복 여자 천적용

    const myGender = (() => { const p = players.find(x=>x.name===name); return p ? p.gender : 'M'; })();
    const getGender = (n) => { const p = players.find(x=>x.name===n); return p ? p.gender : 'M'; };

    logs.forEach(l => {
      const win = didPlayerWin(l, name);
      if (win === null) return;

      if (l.type === "single") {
        const opps = getOpponentNames(l, name);
        opps.forEach(op => {
          if(HIDDEN_PLAYERS.includes(op)) return;
          // ✅ v3.943: 동성 단식만 집계
          if (getGender(op) === myGender) {
            if(!singleOppMap[op]) singleOppMap[op] = { w:0, l:0, totalGames:0 };
            if(win) singleOppMap[op].w++; else singleOppMap[op].l++;
            singleOppMap[op].totalGames++;
          }
          // 이성간 단식
          if (getGender(op) !== myGender) {
            if(!crossSingleOppMap[op]) crossSingleOppMap[op] = { w:0, l:0, totalGames:0 };
            if(win) crossSingleOppMap[op].w++; else crossSingleOppMap[op].l++;
            crossSingleOppMap[op].totalGames++;
          }
        });
      }

      if (l.type === "double") {
        const homeHas = isInTeam(l.home, name);
        const myTeam = homeHas ? (l.home||[]) : (l.away||[]);
        const myTeamGenders = myTeam.map(getGender);
        const isMyTeamMixed = myTeamGenders.includes('M') && myTeamGenders.includes('F');

        const partners = getPartnerNames(l, name);
        partners.forEach(pt => {
          if(HIDDEN_PLAYERS.includes(pt)) return;
          // ✅ v3.943: 동성 파트너만 복식 파트너 맵에 집계
          if (getGender(pt) === myGender) {
            if(!partnerMap[pt]) partnerMap[pt] = { w:0, l:0, totalGames:0 };
            if(win) partnerMap[pt].w++; else partnerMap[pt].l++;
            partnerMap[pt].totalGames++;
          }
          // 혼복 파트너 (이성 파트너만)
          if (isMyTeamMixed && getGender(pt) !== myGender) {
            if(!mixedPartnerMap[pt]) mixedPartnerMap[pt] = { w:0, l:0, totalGames:0 };
            if(win) mixedPartnerMap[pt].w++; else mixedPartnerMap[pt].l++;
            mixedPartnerMap[pt].totalGames++;
          }
        });

        const opps = getOpponentNames(l, name);
        opps.forEach(op => {
          if(HIDDEN_PLAYERS.includes(op)) return;
          // ✅ v3.943: 동성 상대만 복식 천적 맵에 집계
          if (getGender(op) === myGender) {
            if(!doubleEnemyMap[op]) doubleEnemyMap[op] = { w:0, l:0, totalGames:0 };
            if(win) doubleEnemyMap[op].w++; else doubleEnemyMap[op].l++;
            doubleEnemyMap[op].totalGames++;
          }
          // 혼복 상대 (내 팀이 혼복이거나 상대 팀이 혼복인 경우)
          const oppTeam = homeHas ? (l.away||[]) : (l.home||[]);
          const oppTeamGenders = oppTeam.map(getGender);
          const isOppTeamMixed = oppTeamGenders.includes('M') && oppTeamGenders.includes('F');
          if (isMyTeamMixed || isOppTeamMixed) {
            if(!mixedEnemyMap[op]) mixedEnemyMap[op] = { w:0, l:0, totalGames:0 };
            if(win) mixedEnemyMap[op].w++; else mixedEnemyMap[op].l++;
            mixedEnemyMap[op].totalGames++;
            if (getGender(op) === 'M') {
              if(!mixedEnemyMMap[op]) mixedEnemyMMap[op] = { w:0, l:0, totalGames:0 };
              if(win) mixedEnemyMMap[op].w++; else mixedEnemyMMap[op].l++;
              mixedEnemyMMap[op].totalGames++;
            } else {
              if(!mixedEnemyFMap[op]) mixedEnemyFMap[op] = { w:0, l:0, totalGames:0 };
              if(win) mixedEnemyFMap[op].w++; else mixedEnemyFMap[op].l++;
              mixedEnemyFMap[op].totalGames++;
            }
          }
        });
      }
    });

    const sBestRaw = pickBestByRule(singleOppMap, true);
    const sBest = (sBestRaw && sBestRaw.stat.w >= 1) ? sBestRaw : null;
    const sWorst = pickBestByRule(singleOppMap, false);

    // ✅ v3.942: 이성간 단식 분석
    const crossBestRaw = pickBestByRule(crossSingleOppMap, true);
    const crossBest = (crossBestRaw && crossBestRaw.stat.w >= 1) ? crossBestRaw : null;
    const crossWorstRaw = pickBestByRule(crossSingleOppMap, false);
    const crossWorst = (crossWorstRaw && crossWorstRaw.stat.l >= 1) ? crossWorstRaw : null;

    // ✅ v3.8205_4: 최고 파트너 — 승 1개 이상인 파트너 중 승률 최고
    const dBestPartnerRaw = pickBestByRule(partnerMap, true);
    const dBestPartner = (dBestPartnerRaw && dBestPartnerRaw.stat.w >= 1) ? dBestPartnerRaw : null;

    // ✅ v3.8205_4: 분발 파트너 — 승 0개이거나 승률 최저, 최고 파트너와 다른 사람
    const dWorstPartnerRaw = pickBestByRule(partnerMap, false);
    const dWorstPartner = (() => {
      if (!dWorstPartnerRaw) return null;
      const s = dWorstPartnerRaw.stat;
      const hasloss = s.l >= 1;
      const diffFromBest = !dBestPartner || dWorstPartnerRaw.name !== dBestPartner.name;
      return (hasloss && diffFromBest) ? dWorstPartnerRaw : null;
    })();

    // ✅ v3.942: 혼복 파트너 분석
    const mixedBestPartnerRaw = pickBestByRule(mixedPartnerMap, true);
    const mixedBestPartner = (mixedBestPartnerRaw && mixedBestPartnerRaw.stat.w >= 1) ? mixedBestPartnerRaw : null;
    const mixedWorstPartnerRaw = pickBestByRule(mixedPartnerMap, false);
    const mixedWorstPartner = (() => {
      if (!mixedWorstPartnerRaw) return null;
      const diffFromBest = !mixedBestPartner || mixedWorstPartnerRaw.name !== mixedBestPartner.name;
      return (mixedWorstPartnerRaw.stat.l >= 1 && diffFromBest) ? mixedWorstPartnerRaw : null;
    })();

    // ✅ v3.8202: 라이벌(천적) - 상대에게 패가 1개 이상일 때만 표시
    const dEnemies = Object.entries(doubleEnemyMap)
      .filter(([,s]) => s.l >= 1)
      .sort((a,b)=>{
        const Ar=(a[1].w+a[1].l)>0?a[1].w/(a[1].w+a[1].l):0, Br=(b[1].w+b[1].l)>0?b[1].w/(b[1].w+b[1].l):0;
        return Ar-Br || b[1].totalGames-a[1].totalGames;
      });
    const dE1 = dEnemies[0], dE2 = dEnemies[1];

    // ✅ v3.942: 혼복 남자 천적 / 여자 천적
    const mixedEnemyMList = Object.entries(mixedEnemyMMap)
      .filter(([,s]) => s.l >= 1)
      .sort((a,b)=>{ const Ar=a[1].w/(a[1].w+a[1].l)||0, Br=b[1].w/(b[1].w+b[1].l)||0; return Ar-Br||b[1].totalGames-a[1].totalGames; });
    const mixedEnemyFList = Object.entries(mixedEnemyFMap)
      .filter(([,s]) => s.l >= 1)
      .sort((a,b)=>{ const Ar=a[1].w/(a[1].w+a[1].l)||0, Br=b[1].w/(b[1].w+b[1].l)||0; return Ar-Br||b[1].totalGames-a[1].totalGames; });
    const mixedEnemyM = mixedEnemyMList[0] || null;
    const mixedEnemyF = mixedEnemyFList[0] || null;

    // ✅ v3.8202: 단식 라이벌(천적) - 패가 1개 이상일 때만
    const sWorstFiltered = (() => {
      if (!sWorst) return null;
      return sWorst.stat.l >= 1 ? sWorst : null;
    })();

    return {
      logs, dotsHTML, displayResults, streak, lastResult,
      sWins, sLosses, sScore, dWins, dLosses, dScore, totalWins, totalLosses, totalPt,
      tableHTML, footHTML,
      sBest, sWorst: sWorstFiltered,
      crossBest, crossWorst,
      dBestPartner, dWorstPartner,
      mixedBestPartner, mixedWorstPartner,
      mixedEnemyM, mixedEnemyF,
      dE1, dE2,
      myGender
    };
  }

  // ✅ v3.692: 통계 렌더(화면 반영)
  function renderStatsHTML(name, data) {
    // 최근 폼(점)
    $('form-dots').innerHTML = data.dotsHTML;

    // 조언 박스
    const adviceBox = $('advice-box');
    const adviceText = $('res-advice');

    if (data.lastResult === true && data.streak >= 2) {
      adviceBox.style.background = "var(--wimbledon-sage)";
      adviceText.innerHTML = `🔥 최근 ${data.streak}연승 스타트! 지금 폼이 좋습니다. <br>리턴 한 번만 더 붙이면 거의 끝입니다.`;
    } else if (data.lastResult === false && data.streak >= 2) {
      adviceBox.style.background = "var(--up-red)";
      adviceText.innerHTML = `😰 최근 ${data.streak}연패… 하지만 이럴 때 한 번만 끊으면 바로 반등합니다. <br>첫 2게임은 ‘실수 최소’ 모드로 가는 게 좋습니다.`;
    } else {
      adviceBox.style.background = "var(--aussie-blue)";
      adviceText.innerHTML = `🎾 최근 폼이 조금 출렁입니다. <br>서브/리턴 중 하나만 안정시키면 연승 흐름이 잡힙니다.`;
    }

    // 하단 전적표
    $('res-table').innerHTML = data.tableHTML;
    $('res-foot').innerHTML = data.footHTML;

    // 상단 분석(최고/최악/파트너/천적)
    const isValid = (obj) => obj && (obj.w + obj.l) > 0;

    $('res-s-best').innerText = (data.sBest && isValid(data.sBest.stat)) ? displayName(data.sBest.name) : "-";
    $('res-s-best-sub').innerText = (data.sBest && isValid(data.sBest.stat)) ? `${data.sBest.stat.w}승 ${data.sBest.stat.l}패` : "0승 0패";

    $('res-s-worst').innerText = (data.sWorst && isValid(data.sWorst.stat)) ? displayName(data.sWorst.name) : "-";
    $('res-s-worst-sub').innerText = (data.sWorst && isValid(data.sWorst.stat)) ? `${data.sWorst.stat.w}승 ${data.sWorst.stat.l}패` : "0승 0패";

    // ✅ v3.942: 이성간 단식 카드
    const crossBestEl = $('res-cross-best');
    const crossWorstEl = $('res-cross-worst');
    if (crossBestEl) {
      crossBestEl.innerText = (data.crossBest && isValid(data.crossBest.stat)) ? displayName(data.crossBest.name) : "-";
      $('res-cross-best-sub').innerText = (data.crossBest && isValid(data.crossBest.stat)) ? `${data.crossBest.stat.w}승 ${data.crossBest.stat.l}패` : "0승 0패";
    }
    if (crossWorstEl) {
      crossWorstEl.innerText = (data.crossWorst && isValid(data.crossWorst.stat)) ? displayName(data.crossWorst.name) : "-";
      $('res-cross-worst-sub').innerText = (data.crossWorst && isValid(data.crossWorst.stat)) ? `${data.crossWorst.stat.w}승 ${data.crossWorst.stat.l}패` : "0승 0패";
    }

    $('res-d-partner').innerText = (data.dBestPartner && isValid(data.dBestPartner.stat)) ? displayName(data.dBestPartner.name) : "-";
    $('res-d-partner-sub').innerText = (data.dBestPartner && isValid(data.dBestPartner.stat)) ? `${data.dBestPartner.stat.w}승 ${data.dBestPartner.stat.l}패` : "0승 0패";

    $('res-d-partner-worst').innerText = (data.dWorstPartner && isValid(data.dWorstPartner.stat)) ? displayName(data.dWorstPartner.name) : "-";
    $('res-d-partner-worst-sub').innerText = (data.dWorstPartner && isValid(data.dWorstPartner.stat)) ? `${data.dWorstPartner.stat.w}승 ${data.dWorstPartner.stat.l}패` : "0승 0패";

    // ✅ v3.942: 혼복 파트너/천적 카드
    const mBestEl = $('res-mixed-partner');
    const mWorstEl = $('res-mixed-partner-worst');
    const mEnemyMEl = $('res-mixed-enemy-m');
    const mEnemyFEl = $('res-mixed-enemy-f');
    if (mBestEl) {
      mBestEl.innerText = (data.mixedBestPartner && isValid(data.mixedBestPartner.stat)) ? displayName(data.mixedBestPartner.name) : "-";
      $('res-mixed-partner-sub').innerText = (data.mixedBestPartner && isValid(data.mixedBestPartner.stat)) ? `${data.mixedBestPartner.stat.w}승 ${data.mixedBestPartner.stat.l}패` : "0승 0패";
    }
    if (mWorstEl) {
      mWorstEl.innerText = (data.mixedWorstPartner && isValid(data.mixedWorstPartner.stat)) ? displayName(data.mixedWorstPartner.name) : "-";
      $('res-mixed-partner-worst-sub').innerText = (data.mixedWorstPartner && isValid(data.mixedWorstPartner.stat)) ? `${data.mixedWorstPartner.stat.w}승 ${data.mixedWorstPartner.stat.l}패` : "0승 0패";
    }
    if (mEnemyMEl) {
      mEnemyMEl.innerText = (data.mixedEnemyM && isValid(data.mixedEnemyM[1])) ? displayName(data.mixedEnemyM[0]) : "-";
      $('res-mixed-enemy-m-sub').innerText = (data.mixedEnemyM && isValid(data.mixedEnemyM[1])) ? `${data.mixedEnemyM[1].w}승 ${data.mixedEnemyM[1].l}패` : "0승 0패";
    }
    if (mEnemyFEl) {
      mEnemyFEl.innerText = (data.mixedEnemyF && isValid(data.mixedEnemyF[1])) ? displayName(data.mixedEnemyF[0]) : "-";
      $('res-mixed-enemy-f-sub').innerText = (data.mixedEnemyF && isValid(data.mixedEnemyF[1])) ? `${data.mixedEnemyF[1].w}승 ${data.mixedEnemyF[1].l}패` : "0승 0패";
    }

    $('res-d-enemy1').innerText = (data.dE1 && isValid(data.dE1[1])) ? displayName(data.dE1[0]) : "-";
    $('res-d-enemy1-sub').innerText = (data.dE1 && isValid(data.dE1[1])) ? `${data.dE1[1].w}승 ${data.dE1[1].l}패` : "0승 0패";

    $('res-d-enemy2').innerText = (data.dE2 && isValid(data.dE2[1])) ? displayName(data.dE2[0]) : "-";
    $('res-d-enemy2-sub').innerText = (data.dE2 && isValid(data.dE2[1])) ? `${data.dE2[1].w}승 ${data.dE2[1].l}패` : "0승 0패";
  }


  function viewStats(name) {
    const p = players.find(x => x.name === name);
    if(!p) return;

    $('welcome-msg').style.display = 'none';
    const report = $('stats-report');
    report.style.display = 'block';
    $('target-name-text').innerText = `${displayName(name)} 분석 리포트`;

    const data = computeStatsFromMatchLog(name);
    renderStatsHTML(name, data);

    report.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
