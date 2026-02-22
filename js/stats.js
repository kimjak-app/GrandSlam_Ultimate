  function ensure(p) {
    const fs=['score','wins','losses','last','dScore','dWins','dLosses','lastD','sScore','sWins','sLosses','lastS', 'weekly','wWins','wLosses','wdScore','wsScore','wdWins','wdLosses','wsWins','wsLosses','lastW','lastWD','lastWS',
      // ✅ v3.94: 혼복 필드 (Mixed Double)
      'mScore','mWins','mLosses','lastM'];
    fs.forEach(f=>{ if(p[f]===undefined) p[f]=0; });
    if (p.isGuest === undefined) p.isGuest = false;
    // ✅ v3.93: gender 정규화 — 'M'|'F' 외 값은 전부 'M'으로 보정
    if (p.gender !== 'M' && p.gender !== 'F') p.gender = 'M';
    // ✅ v3.949: 총무 면제 필드
    if (p.isTreasurer === undefined) p.isTreasurer = false;
    // ✅ v4.032: 회비 면제 필드
    if (p.isFeeExempt === undefined) p.isFeeExempt = false;
    // ✅ v4.0: level 정규화 — 미설정 시 'A'로 기본값
    if (!p.level || !['A','B','C','D'].includes(p.level)) p.level = 'A';
    // ✅ v4.0: attributes 껍데기 — 종목별 확장용
    if (!p.attributes) p.attributes = { sport: 'tennis', preferredPosition: null };
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
    // ✅ v4.0: level 필터 상태
    const levelFilter = window.levelRankTab || 'all';

    const baseList = (() => {
      if (filterMode === 'guest') {
        const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));
        const names = guests.map(p=>p.name);
        const agg = aggregateSeasonForNamesFromLog(names);
        return guests.map(p => Object.assign({}, p, agg[p.name] || {}));
      }
      let list;
      if (filterMode === 'all') list = [...players];
      // ✅ v3.92: 성별 필터
      else if (filterMode === 'male') list = players.filter(p => !p.isGuest && p.gender !== 'F');
      else if (filterMode === 'female') list = players.filter(p => !p.isGuest && p.gender === 'F');
      else list = players.filter(p => !p.isGuest);
      // ✅ v4.0: 급수 필터 (게스트 제외 탭에만 적용)
      if (levelFilter !== 'all' && filterMode !== 'guest') {
        list = list.filter(p => (p.level || 'A') === levelFilter);
      }
      return list;
    })();

    // ✅ v3.946: 해당 종목 경기 기록 없는 선수 제외 (0승0패 노출 방지)
    // 종합/주간 종합은 전체 포함, 종목별(단식/복식/혼복)은 1경기 이상만
    const isOverallKey = (scoreK === 'score' || scoreK === 'weekly');
    const filtered = isOverallKey
      ? baseList
      : baseList.filter(p => (p[winK]||0) + (p[lossK]||0) > 0);
    const calcRate = (p) => {
      const t = (p[winK]||0) + (p[lossK]||0);
      return t > 0 ? ((p[winK]||0) / t) : 0;
    };

    const wrSorted = [...filtered].sort((a,b) => calcRate(b) - calcRate(a) || (b[winK]||0) - (a[winK]||0));
    const wrRanks = {};
    let currentWrRank = 1;
    wrSorted.forEach((p, i) => {
      if (i > 0) {
        const prev = wrSorted[i-1];
        if (calcRate(p) !== calcRate(prev)) currentWrRank = i + 1;
      }
      wrRanks[p.name] = currentWrRank;
    });

    const sorted = [...filtered].sort((a,b) => (b[scoreK]||0) - (a[scoreK]||0) || calcRate(b) - calcRate(a));
    const table = $(tableId);
    if (!table) return;

    // ✅ v4.0: 경기 기록 없는 경우 빈 메시지
    if (sorted.length === 0) {
      table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">경기 기록 없음</td></tr></tbody>';
      return;
    }

    // ✅ v4.0: 테이블 min-width 설정 — 이름이 절대 잘리지 않고 오른쪽이 스크롤
    // 컨테이너 wrapper는 CSS에서 overflow-x:auto로 처리
    table.style.minWidth = '340px';
    table.innerHTML = `<thead><tr>
      <th style="width:40px; min-width:40px;">순위</th>
      <th style="min-width:110px; text-align:left; padding-left:10px;">이름</th>
      <th style="width:90px; min-width:90px;">승률</th>
      <th style="width:55px; min-width:55px;">승/패</th>
      <th style="width:60px; min-width:60px;">총점</th>
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
        ? '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px; color:#E8437A; vertical-align:middle; margin-right:2px;">female</span>'
        : '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px; color:#3A7BD5; vertical-align:middle; margin-right:2px;">male</span>';
      // ✅ v4.0: level 뱃지
      const lvBadge = `<span style="font-size:9px; background:#F0F0F0; color:#666; border-radius:3px; padding:1px 3px; margin-left:2px; vertical-align:middle;">${p.level||'A'}</span>`;
      // ✅ v4.03: 승률 1위 셀 하이라이트
      const isWrTop = wrRanks[p.name] === 1;
      const wrCellStyle = isWrTop
        ? `background:var(--aussie-blue); color:white; border-radius:6px; font-weight:600; white-space:nowrap;`
        : `white-space:nowrap;`;
      return `<tr>
        <td style="white-space:nowrap;">${rankIcon}</td>
        <td style="text-align:left; padding-left:10px; white-space:nowrap;">
          <div style="display:flex; align-items:center; gap:2px;">
            ${gIcon}<span style="font-weight:400;">${escapeHtml(shownName)}</span>${lvBadge}
            <span class="sub-info" style="margin-left:2px; white-space:nowrap;">(${lastShown}위)${df}</span>
          </div>
        </td>
        <td style="${wrCellStyle}" class="${isWrTop ? '' : 'sub-info'}">${(calcRate(p)*100).toFixed(1)}% (${wrRanks[p.name]}위)</td>
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
    // ✅ v3.947: matchLog 기반으로 혼복 필드 재계산 — players.mScore/mWins/mLosses 보정
    // (Sheets에서 불러온 players 배열에 혼복 필드가 없거나 0인 경우 대비)
    if (Array.isArray(players) && Array.isArray(matchLog)) {
      const getGender = (n) => { const p = players.find(x=>x.name===n); return p ? p.gender : 'M'; };
      const isMixedTeam = (arr) => {
        if (arr.length < 2) return false;
        const gs = arr.map(getGender);
        return gs.includes('M') && gs.includes('F');
      };
      // 초기화
      players.forEach(p => { p.mScore = 0; p.mWins = 0; p.mLosses = 0; });
      // matchLog 순회
      matchLog.forEach(m => {
        if (m.type !== 'double') return;
        const home = Array.isArray(m.home) ? m.home : [];
        const away = Array.isArray(m.away) ? m.away : [];
        const homeMixed = isMixedTeam(home);
        const awayMixed = isMixedTeam(away);
        if (!homeMixed && !awayMixed) return; // 혼복 경기 아님
        const homeWin = m.winner === 'home';
        [[home, homeMixed, homeWin], [away, awayMixed, !homeWin]].forEach(([arr, isMixed, isW]) => {
          if (!isMixed) return; // 혼성 팀에 속한 선수만 취득
          arr.forEach(n => {
            const p = players.find(x=>x.name===n);
            if (!p) return;
            const d = calcDeltas('double', isW);
            p.mScore += d.d;
            p.mWins  += isW ? 1 : 0;
            p.mLosses += isW ? 0 : 1;
          });
        });
      });
    }

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
    const secMixedM  = $('sec-mixed-male');
    const secMixedF  = $('sec-mixed-female');
    const secMixed   = { m: secMixedM, f: secMixedF }; // 편의용 래퍼
    const showMixed  = (m, f) => { if(secMixedM) secMixedM.style.display = m; if(secMixedF) secMixedF.style.display = f; };
    const secSingleM = $('sec-single-male');
    const secSingleF = $('sec-single-female');
    const gs         = $('guest-rank-section');

    if (tab === 'all') {
      // 전부 표시
      if(secDoubleM) secDoubleM.style.display = 'block';
      if(secDoubleF) secDoubleF.style.display = 'block';
      showMixed('block', 'block');
      if(secSingleM) secSingleM.style.display = 'block';
      if(secSingleF) secSingleF.style.display = 'block';
      if(gs)         gs.style.display         = 'block';

      renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
      renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
      renderMixedRankTable('seasonMixedTableM', 'male');
      renderMixedRankTable('seasonMixedTableF', 'female');
      renderPairRankTable('seasonPairTableM', 'male');
      renderPairRankTable('seasonPairTableF', 'female');
      renderPairRankTable('seasonMixedPairTable', 'mixed');
      renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');
      renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
      renderRankTable('guestSeasonTotalTable',  'score',  'wins',   'losses',  'last',  'guest');
      renderRankTable('guestSeasonDoubleTable', 'dScore', 'dWins',  'dLosses', 'lastD', 'guest');
      renderRankTable('guestSeasonSingleTable', 'sScore', 'sWins',  'sLosses', 'lastS', 'guest');

    } else if (tab === 'male') {
      // 남자 섹션만 표시
      if(secDoubleM) secDoubleM.style.display = 'block';
      if(secDoubleF) secDoubleF.style.display = 'none';
      showMixed('block', 'none');
      if(secSingleM) secSingleM.style.display = 'block';
      if(secSingleF) secSingleF.style.display = 'none';
      if(gs)         gs.style.display         = 'none';

      renderRankTable('seasonDoubleTableM', 'dScore', 'dWins', 'dLosses', 'lastD', 'male');
      renderMixedRankTable('seasonMixedTableM', 'male');
      renderPairRankTable('seasonPairTableM', 'male');
      renderRankTable('seasonSingleTableM', 'sScore', 'sWins', 'sLosses', 'lastS', 'male');

    } else if (tab === 'female') {
      // 여자 섹션만 표시
      if(secDoubleM) secDoubleM.style.display = 'none';
      if(secDoubleF) secDoubleF.style.display = 'block';
      showMixed('none', 'block');
      if(secSingleM) secSingleM.style.display = 'none';
      if(secSingleF) secSingleF.style.display = 'block';
      if(gs)         gs.style.display         = 'none';

      renderRankTable('seasonDoubleTableF', 'dScore', 'dWins', 'dLosses', 'lastD', 'female');
      renderMixedRankTable('seasonMixedTableF', 'female');
      renderPairRankTable('seasonPairTableF', 'female');
      renderRankTable('seasonSingleTableF', 'sScore', 'sWins', 'sLosses', 'lastS', 'female');
    }
  }

  // ✅ v3.946: 혼복 랭킹 렌더링 — 직접 필터된 list로 테이블 그림 (renderRankTable 미사용)
  function renderMixedRankTable(tableId, genderFilter) {
    const table = $(tableId);
    if (!table) return;

    // 혼복 경기 있는 선수만, 성별 필터 적용
    let list = players.filter(p => !p.isGuest && (p.mWins > 0 || p.mLosses > 0));
    if (genderFilter === 'male')   list = list.filter(p => p.gender !== 'F');
    if (genderFilter === 'female') list = list.filter(p => p.gender === 'F');

    if (list.length === 0) {
      table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">혼복 경기 기록 없음</td></tr></tbody>';
      return;
    }

    const calcRate = (p) => {
      const t = (p.mWins||0) + (p.mLosses||0);
      return t > 0 ? ((p.mWins||0) / t) : 0;
    };

    // 승률 순위 계산
    const wrSorted = [...list].sort((a,b) => calcRate(b) - calcRate(a) || (b.mWins||0) - (a.mWins||0));
    const wrRanks = {};
    let currentWrRank = 1;
    wrSorted.forEach((p, i) => {
      if (i > 0 && calcRate(p) !== calcRate(wrSorted[i-1])) currentWrRank = i + 1;
      wrRanks[p.name] = currentWrRank;
    });

    const sorted = [...list].sort((a,b) => (b.mScore||0) - (a.mScore||0) || calcRate(b) - calcRate(a));

    table.style.minWidth = '340px';
    table.innerHTML = `<thead><tr>
      <th style="width:40px; min-width:40px;">순위</th>
      <th style="min-width:110px; text-align:left; padding-left:10px;">이름</th>
      <th style="width:90px; min-width:90px;">승률</th>
      <th style="width:55px; min-width:55px;">승/패</th>
      <th style="width:60px; min-width:60px;">총점</th>
    </tr></thead><tbody></tbody>`;

    let currentRank = 1;
    table.querySelector('tbody').innerHTML = sorted.map((p, i) => {
      if (i > 0 && (sorted[i-1].mScore||0) !== (p.mScore||0)) currentRank = i + 1;
      const rankIcon = currentRank === 1 ? '<span class="material-symbols-outlined rank-1-icon">emoji_events</span>' : currentRank;
      const lastShown = (p.lastM && Number(p.lastM) > 0) ? Number(p.lastM) : currentRank;
      const df = (p.lastM && Number(p.lastM) > 0 && lastShown !== currentRank)
        ? (lastShown > currentRank
          ? `<span style="color:var(--up-red)">▲${lastShown - currentRank}</span>`
          : `<span style="color:var(--down-blue)">▼${currentRank - lastShown}</span>`)
        : '-';
      const gIcon = p.gender === 'F'
        ? '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px;color:#E8437A;vertical-align:middle;margin-right:2px;">female</span>'
        : '<span class="material-symbols-outlined gender-icon-inline" style="font-size:14px;color:#3A7BD5;vertical-align:middle;margin-right:2px;">male</span>';
      const lvBadge = `<span style="font-size:9px; background:#F0F0F0; color:#666; border-radius:3px; padding:1px 3px; margin-left:2px; vertical-align:middle;">${p.level||'A'}</span>`;
      // ✅ v4.03: 승률 1위 셀 하이라이트
      const isWrTop = wrRanks[p.name] === 1;
      const wrCellStyle = isWrTop
        ? `background:var(--aussie-blue); color:white; border-radius:6px; font-weight:600; white-space:nowrap;`
        : `white-space:nowrap;`;
      return `<tr>
        <td style="white-space:nowrap;">${rankIcon}</td>
        <td style="text-align:left; padding-left:10px; white-space:nowrap;">
          <div style="display:flex; align-items:center; gap:2px;">
            ${gIcon}<span style="font-weight:400;">${escapeHtml(displayName(p.name))}</span>${lvBadge}
            <span class="sub-info" style="margin-left:2px; white-space:nowrap;">(${lastShown}위)${df}</span>
          </div>
        </td>
        <td style="${wrCellStyle}" class="${isWrTop ? '' : 'sub-info'}">${(calcRate(p)*100).toFixed(1)}% (${wrRanks[p.name]}위)</td>
        <td style="font-size:11px; white-space:nowrap;">${p.mWins||0}/${p.mLosses||0}</td>
        <td class="point-text" style="white-space:nowrap;">${Number(p.mScore||0).toFixed(1)}</td>
      </tr>`;
    }).join('');

    setTimeout(() => applyAutofit(table), 0);
  }

  // ✅ v3.945: 복식/혼복 조합 랭킹 렌더링
  // mode: 'male'=남자복식, 'female'=여자복식, 'mixed'=혼복
  function renderPairRankTable(tableId, mode) {
    const table = $(tableId);
    if (!table) return;

    const getGender = (n) => { const p = players.find(x => x.name === n); return p ? p.gender : 'M'; };

    const pairMap = {}; // key: 'A&B' (정렬된 이름), value: {wins, losses}

    (matchLog || []).forEach(m => {
      if (m.type !== 'double') return;
      const home = Array.isArray(m.home) ? m.home : [];
      const away = Array.isArray(m.away) ? m.away : [];
      if (home.length < 2 || away.length < 2) return;

      const homeGenders = home.map(getGender);
      const awayGenders = away.map(getGender);
      const homeMixed = homeGenders.includes('M') && homeGenders.includes('F');
      const awayMixed = awayGenders.includes('M') && awayGenders.includes('F');

      const teams = [
        { arr: home, win: m.winner === 'home', isMixed: homeMixed, genders: homeGenders },
        { arr: away, win: m.winner === 'away', isMixed: awayMixed, genders: awayGenders }
      ];

      teams.forEach(({ arr, win, isMixed, genders }) => {
        // 모드 필터
        if (mode === 'male'   && (isMixed || genders.includes('F'))) return;
        if (mode === 'female' && (isMixed || !genders.every(g => g === 'F'))) return;
        if (mode === 'mixed'  && !isMixed) return;

        const key = [...arr].sort().join('&');
        if (!pairMap[key]) pairMap[key] = { names: arr, wins: 0, losses: 0 };
        if (win) pairMap[key].wins++; else pairMap[key].losses++;
      });
    });

    const list = Object.entries(pairMap)
      .map(([key, v]) => ({ key, names: v.names, wins: v.wins, losses: v.losses, total: v.wins + v.losses }))
      .filter(v => v.total >= 1)
      .sort((a, b) => {
        const ar = a.total > 0 ? a.wins / a.total : 0;
        const br = b.total > 0 ? b.wins / b.total : 0;
        return br - ar || b.wins - a.wins;
      });

    if (list.length === 0) {
      table.innerHTML = '<tbody><tr><td colspan="5" style="text-align:center; color:#999; font-size:12px; padding:12px;">조합 기록 없음</td></tr></tbody>';
      return;
    }

    // 승률 순위 계산 (기존 로직과 동일 방식)
    const wrSorted = [...list].sort((a, b) => {
      const ar = a.total > 0 ? a.wins / a.total : 0;
      const br = b.total > 0 ? b.wins / b.total : 0;
      return br - ar || b.wins - a.wins;
    });
    const wrRankMap = {};
    let wrRank = 1;
    wrSorted.forEach((v, i) => {
      if (i > 0) {
        const prev = wrSorted[i-1];
        const pr = prev.total > 0 ? prev.wins / prev.total : 0;
        const cr = v.total > 0 ? v.wins / v.total : 0;
        if (cr !== pr) wrRank = i + 1;
      }
      wrRankMap[v.key] = wrRank;
    });

    const mIcon = '<span class="material-symbols-outlined" style="font-size:12px;color:#3A7BD5;vertical-align:middle;">male</span>';
    const fIcon = '<span class="material-symbols-outlined" style="font-size:12px;color:#E8437A;vertical-align:middle;">female</span>';
    const nameIcon = (n) => getGender(n) === 'F' ? fIcon : mIcon;
    const dName = (n) => escapeHtml(displayName(n));

    let rank = 1;
    const rows = list.map((v, i) => {
      if (i > 0) {
        const pr = list[i-1].total > 0 ? list[i-1].wins / list[i-1].total : 0;
        const cr = v.total > 0 ? v.wins / v.total : 0;
        if (pr !== cr) rank = i + 1;
      }
      const rate = v.total > 0 ? ((v.wins / v.total) * 100).toFixed(1) : '0.0';
      const pairLabel = v.names.map(n => `${nameIcon(n)}${dName(n)}`).join(' & ');
      return `<tr>
        <td style="text-align:center; width:36px; min-width:36px; white-space:nowrap;">${rank}</td>
        <td style="text-align:left; padding-left:8px; white-space:nowrap;">${pairLabel}</td>
        <td style="text-align:center; white-space:nowrap; font-size:11px; color:#666;">${rate}% (${wrRankMap[v.key]}위)</td>
        <td style="text-align:center; font-size:11px; white-space:nowrap; min-width:48px;">${v.wins}/${v.losses}</td>
      </tr>`;
    }).join('');

    // ✅ v4.03: min-width 스크롤 방식 — 순위/승패 세워지지 않게 고정
    table.style.minWidth = '320px';
    table.innerHTML = `
      <thead><tr>
        <th style="width:36px; min-width:36px; white-space:nowrap;">순위</th>
        <th style="text-align:left; padding-left:8px;">조합</th>
        <th style="width:90px; min-width:90px; white-space:nowrap;">승률</th>
        <th style="width:48px; min-width:48px; white-space:nowrap;">승/패</th>
      </tr></thead>
      <tbody>${rows}</tbody>`;

    setTimeout(() => applyAutofit(table), 0);
  }

  // ✅ v3.945: 성별 랭킹 탭 전환
  function switchGenderRankTab(tab) {
    window.genderRankTab = tab;
    ['all','male','female'].forEach(t => {
      const btn = $('gender-rank-tab-' + t);
      if(btn) btn.className = (t === tab) ? 'gender-tab-btn active' : 'gender-tab-btn';
    });
    updateSeason();
    // ✅ v3.948: 탭 전환 시 차트도 성별 필터 적용해서 재렌더
    const currentRangeIdx = window.currentChartRangeIdx || 0;
    updateChartRange(currentRangeIdx);
  }

  // ✅ v4.0: 급수 랭킹 탭 전환
  function switchLevelRankTab(lvl) {
    window.levelRankTab = lvl;
    ['all','A','B','C'].forEach(t => {
      const btn = $('level-rank-tab-' + t);
      if(btn) btn.className = (t === lvl) ? 'gender-tab-btn active' : 'gender-tab-btn';
    });
    updateSeason();
  }

  function updateWeekly() {
    renderRankTable('weeklyTotalTable', 'weekly', 'wWins', 'wLosses', 'lastW');
    renderRankTable('weeklyDoubleTable', 'wdScore', 'wdWins', 'wdLosses', 'lastWD');
    renderRankTable('weeklySingleTable', 'wsScore', 'wsWins', 'wsLosses', 'lastWS');
  }

  function updateChartRange(rangeIdx) {
    // ✅ v3.948: 현재 rangeIdx 저장 (탭 전환 시 재사용)
    window.currentChartRangeIdx = rangeIdx;

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

    // ✅ v3.948: 성별 탭에 따라 members 필터
    const genderTab = window.genderRankTab || 'all';
    const members = players.filter(p => {
      if (p.isGuest) return false;
      if (genderTab === 'male')   return p.gender !== 'F';
      if (genderTab === 'female') return p.gender === 'F';
      return true;
    });
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
        winners.forEach(n => { if(cumScore[n] !== undefined) cumScore[n] += isDouble ? TENNIS_RULES.cumScore.double : TENNIS_RULES.cumScore.single; });
        losers.forEach(n  => { if(cumScore[n] !== undefined) cumScore[n] += isDouble ? (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.double.loss) : (TENNIS_RULES.scoring.participate + TENNIS_RULES.scoring.single.loss); });
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
    // ✅ v4.02: TENNIS_RULES 참조 (rules/tennis.js)
    const rule = TENNIS_RULES.scoring[type] || TENNIS_RULES.scoring.double;
    const earn = isWin
      ? TENNIS_RULES.scoring.participate + rule.win
      : TENNIS_RULES.scoring.participate + rule.loss;
    if (type === "double" || type === "mixed") return { total: earn, d: earn, s: 0.0 };
    return { total: earn, d: 0.0, s: earn };
  }

  function applyMatchToPlayers(type, homeArr, awayArr, winnerSide) {
    // ✅ v3.8206: 당일 게스트는 players 배열에 없으므로 자동으로 집계 제외됨
    const homeWin = winnerSide === "home";

    const getGender = (n) => { const p = players.find(x=>x.name===n); return p ? p.gender : 'M'; };

    // ✅ v3.941: 혼복 판별 — 한 팀이라도 남+여 조합이면 혼복으로 판정
    const isMixedTeam = (arr) => {
      if (arr.length < 2) return false;
      const genders = arr.map(getGender);
      return genders.includes('M') && genders.includes('F');
    };
    const homeMixed = type === 'double' && isMixedTeam(homeArr);
    const awayMixed = type === 'double' && isMixedTeam(awayArr);

    // ✅ v3.946: 이성간 단식 판별 — 종합점수만, sScore 미포함
    const isCrossSingle = type === 'single' && homeArr.length === 1 && awayArr.length === 1
      && getGender(homeArr[0]) !== getGender(awayArr[0]);

    // ✅ v3.946: 이성간 복식 판별(남팀 vs 여팀) — 종합점수만, dScore 미포함
    // 혼복(한 팀이라도 혼성)은 기존 로직 유지
    const isCrossDouble = type === 'double' && !homeMixed && !awayMixed
      && (() => {
        const hg = homeArr.map(getGender);
        const ag = awayArr.map(getGender);
        return (hg.every(g=>g==='M') && ag.every(g=>g==='F'))
            || (hg.every(g=>g==='F') && ag.every(g=>g==='M'));
      })();

    const apply = (ns, isW, isMyTeamMixed) => ns.forEach(n => {
      var p = players.find(x=>x.name==n);
      if(!p) return;
      const d = calcDeltas(type, isW);

      // 종합점수/승패는 이성간 포함 항상 반영
      p.score += d.total;
      p.wins += isW ? 1 : 0;
      p.losses += isW ? 0 : 1;

      if (type === "double") {
        // ✅ v3.946: 이성간 복식(남팀vs여팀)은 dScore 미포함
        if (!isCrossDouble) {
          p.dScore += d.d;
          p.dWins += isW ? 1 : 0;
          p.dLosses += isW ? 0 : 1;
        }
        // ✅ v3.941: 내 팀이 혼성이면 혼복 점수 취득
        if (isMyTeamMixed) {
          p.mScore += d.d;
          p.mWins += isW ? 1 : 0;
          p.mLosses += isW ? 0 : 1;
        }
      } else {
        // ✅ v3.946: 이성간 단식은 sScore 미포함
        if (!isCrossSingle) {
          p.sScore += d.s;
          p.sWins += isW ? 1 : 0;
          p.sLosses += isW ? 0 : 1;
        }
      }

      p.weekly += d.total;
      p.wWins += isW ? 1 : 0;
      p.wLosses += isW ? 0 : 1;

      if (type === "double") {
        if (!isCrossDouble) {
          p.wdScore += d.d;
          p.wdWins += isW ? 1 : 0;
          p.wdLosses += isW ? 0 : 1;
        }
      } else {
        if (!isCrossSingle) {
          p.wsScore += d.s;
          p.wsWins += isW ? 1 : 0;
          p.wsLosses += isW ? 0 : 1;
        }
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
      myGender,
      // ✅ v3.9492: 신규 데이터
      ...computeExtraStats(name, logs)
    };
  }

  // ✅ v3.9492: 신규 통계 계산 — 연속기록, 상대전적TOP3, 요일별승률, 월별활동
  function computeExtraStats(name, logs) {
    const KO_DAYS = ['일','월','화','수','목','금','토'];

    // 1. 최장 연승/연패
    let maxWinStreak = 0, maxLoseStreak = 0;
    let curW = 0, curL = 0;
    const allResults = [...logs].sort((a,b)=>(a.ts||0)-(b.ts||0))
      .map(l => didPlayerWin(l, name)).filter(v => v === true || v === false);
    allResults.forEach(win => {
      if (win) { curW++; curL = 0; maxWinStreak = Math.max(maxWinStreak, curW); }
      else     { curL++; curW = 0; maxLoseStreak = Math.max(maxLoseStreak, curL); }
    });

    // 2. 상대 전적 TOP3 (전체 상대, 많이 붙은 순)
    const oppAllMap = {};
    logs.forEach(l => {
      const win = didPlayerWin(l, name);
      if (win === null) return;
      getOpponentNames(l, name).forEach(op => {
        if (HIDDEN_PLAYERS.includes(op)) return;
        if (!oppAllMap[op]) oppAllMap[op] = { w:0, l:0 };
        if (win) oppAllMap[op].w++; else oppAllMap[op].l++;
      });
    });
    const top3Opp = Object.entries(oppAllMap)
      .sort((a,b) => (b[1].w+b[1].l) - (a[1].w+a[1].l))
      .slice(0, 3);

    // 3. 요일별 승률
    const weekdayMap = {};
    logs.forEach(l => {
      const win = didPlayerWin(l, name);
      if (win === null || !l.date) return;
      const day = new Date(l.date).getDay(); // 0=일
      if (!weekdayMap[day]) weekdayMap[day] = { w:0, l:0 };
      if (win) weekdayMap[day].w++; else weekdayMap[day].l++;
    });

    // 4. 월별 활동
    const monthMap = {};
    logs.forEach(l => {
      if (!l.date) return;
      const mo = l.date.slice(0,7); // 'YYYY-MM'
      if (!monthMap[mo]) monthMap[mo] = 0;
      monthMap[mo]++;
    });

    return { maxWinStreak, maxLoseStreak, top3Opp, weekdayMap, monthMap, KO_DAYS };
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

    // ✅ v3.9492: 신규 카드 렌더링

    // 연속 기록
    const mwEl = $('res-max-streak-win');
    const mlEl = $('res-max-streak-lose');
    if (mwEl) {
      mwEl.innerText = data.maxWinStreak > 0 ? data.maxWinStreak : '-';
      $('res-max-streak-win-sub').innerText = data.maxWinStreak > 0 ? `연승 (전체 기록)` : '기록 없음';
    }
    if (mlEl) {
      mlEl.innerText = data.maxLoseStreak > 0 ? data.maxLoseStreak : '-';
      $('res-max-streak-lose-sub').innerText = data.maxLoseStreak > 0 ? `연패 (전체 기록)` : '기록 없음';
    }

    // 상대 전적 TOP3
    const top3El = $('res-top3-opp');
    if (top3El) {
      if (data.top3Opp.length === 0) {
        top3El.innerHTML = '<span style="color:var(--text-gray);">경기 기록 없음</span>';
      } else {
        top3El.innerHTML = data.top3Opp.map(([op, s], i) => {
          const total = s.w + s.l;
          const rate = total > 0 ? Math.round(s.w / total * 100) : 0;
          const medal = ['🥇','🥈','🥉'][i] || '';
          const rateColor = rate >= 50 ? 'var(--wimbledon-sage)' : 'var(--up-red)';
          return `<div style="display:flex; justify-content:space-between; align-items:center; padding:2px 0;">
            <span>${medal} ${escapeHtml(displayName(op))}</span>
            <span style="color:${rateColor}; font-weight:bold;">${s.w}승${s.l}패 (${rate}%)</span>
          </div>`;
        }).join('');
      }
    }

    // 요일별 승률
    const wdEl = $('res-weekday');
    if (wdEl) {
      const days = [1,2,3,4,5,6,0]; // 월~일
      const bars = days.map(d => {
        const stat = data.weekdayMap[d];
        if (!stat || (stat.w + stat.l) === 0) return null;
        const total = stat.w + stat.l;
        const rate = Math.round(stat.w / total * 100);
        const barW = Math.max(4, rate);
        const barColor = rate >= 60 ? 'var(--wimbledon-sage)' : rate >= 40 ? 'var(--aussie-blue)' : 'var(--up-red)';
        return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
          <span style="width:16px; font-weight:bold;">${data.KO_DAYS[d]}</span>
          <div style="flex:1; background:#eee; border-radius:4px; height:12px; overflow:hidden;">
            <div style="width:${barW}%; background:${barColor}; height:100%; border-radius:4px;"></div>
          </div>
          <span style="font-size:11px; min-width:70px;">${rate}% (${stat.w}승${stat.l}패)</span>
        </div>`;
      }).filter(Boolean);
      wdEl.innerHTML = bars.length > 0 ? bars.join('') : '<span style="color:var(--text-gray);">경기 기록 없음</span>';
    }

    // 월별 활동
    const moEl = $('res-monthly');
    if (moEl) {
      const months = Object.entries(data.monthMap).sort((a,b) => a[0].localeCompare(b[0]));
      if (months.length === 0) {
        moEl.innerHTML = '<span style="color:var(--text-gray);">경기 기록 없음</span>';
      } else {
        const maxGames = Math.max(...months.map(([,v]) => v));
        moEl.innerHTML = months.map(([mo, cnt]) => {
          const label = mo.slice(2).replace('-','년 ') + '월';
          const barW = Math.max(4, Math.round(cnt / maxGames * 100));
          return `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="width:46px; font-size:11px;">${label}</span>
            <div style="flex:1; background:#eee; border-radius:4px; height:12px; overflow:hidden;">
              <div style="width:${barW}%; background:var(--aussie-blue); height:100%; border-radius:4px;"></div>
            </div>
            <span style="font-size:11px; min-width:30px;">${cnt}경기</span>
          </div>`;
        }).join('');
      }
    }
  }


  function viewStats(name) {
    const p = players.find(x => x.name === name);
    if(!p) return;

    $('welcome-msg').style.display = 'none';
    const report = $('stats-report');
    report.style.display = 'block';
    $('target-name-text').innerText = `${displayName(name)} (${p.level||'A'}조) 분석 리포트`;

    const data = computeStatsFromMatchLog(name);
    renderStatsHTML(name, data);

    report.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
