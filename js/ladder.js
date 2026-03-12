  // ========================================
  // LADDER GAME (사다리게임)
  // ========================================
  
  function renderLadderPlayerPool() {
    const members = players.filter(p => !p.isGuest).sort((a,b)=>(b.score||0)-(a.score||0));
    // ✅ v3.816: HIDDEN_PLAYERS 제외
    const guests = players.filter(p => p.isGuest && !HIDDEN_PLAYERS.includes(p.name));

    // ✅ v4.037: 랭킹 계산
    let rankMap = {};
    try { rankMap = computeRanksByScoreOnly('score', 'wins', 'losses'); } catch(e) {}

    let html = '<div style="border: 2px solid #E5E5EA; border-radius: 15px; padding: 15px; background: white; margin-bottom: 30px;">';

    // 1. 정식 회원 섹션
    html += '<div style="font-size:12px; color:#666; margin-bottom:8px; font-weight:bold; text-align:left; padding-left:5px;">정식 회원</div>';
    html += '<div class="player-pool" style="margin-bottom:20px;">';
    members.forEach((p, i) => {
      const chkId = `ladder_p_${i}`;
      const isChecked = ldP.includes(p.name);
      const rank = rankMap[p.name] || (i + 1);
      const gIcon = (p.gender === 'F')
        ? '<span class="material-symbols-outlined" style="font-size:12px; color:#E8437A; vertical-align:middle;">female</span>'
        : '<span class="material-symbols-outlined" style="font-size:12px; color:#3A7BD5; vertical-align:middle;">male</span>';
      html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${isChecked ? 'checked' : ''} onclick="tkL('${escapeHtml(p.name).replace(/'/g,"&#39;")}')">`;
      html += `<label for="${chkId}" class="p-label">${gIcon}${escapeHtml(p.name)}<span class="p-rank">${rank}위</span></label>`;
    });
    html += '</div>';

    // 2. 게스트 섹션 (게스트가 있을 때만 출력, ✅ v3.818: 1대2대결용 버튼 제외)
    if (guests.length > 0) {
      html += '<div style="width:100%; margin:10px 0 15px; border-top:1px dashed #ddd; position:relative;">';
      html += '<span style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:#fff; padding:0 10px; font-size:11px; color:#999; font-weight:bold;">GUEST LIST</span>';
      html += '</div>';
      html += '<div class="player-pool">';
      guests.forEach((p, i) => {
        const chkId = `ladder_g_${i}`;
        const isChecked = ldP.includes(p.name);
        html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(p.name)}" ${isChecked ? 'checked' : ''} onclick="tkL('${escapeHtml(p.name).replace(/'/g,"&#39;")}')">`;
        html += `<label for="${chkId}" class="p-label guest-label">[G] ${escapeHtml(p.name)}</label>`;
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
        const chkId = `ladder_ot_${i}`;
        const isChecked = ldP.includes(name);
        html += `<input type="checkbox" id="${chkId}" class="p-chk" value="${escapeHtml(name)}" ${isChecked ? 'checked' : ''} onclick="tkL('${escapeHtml(name).replace(/'/g,"&#39;")}')">`;
        html += `<label for="${chkId}" class="p-label day-guest-label" style="position:relative; padding-right:22px;">[당일] ${escapeHtml(name)}</label>`;
      });
      html += '</div>';
    }
    html += '</div>';

    $('ladder-player-pool').innerHTML = html;
    $('ladder-punish-list').innerHTML = ldP.map((_, i) => `<input type="text" class="w-input l-punish" placeholder="벌칙 ${i+1} (미입력 시 패스)">`).join('');
  }


  function tkL(n) {
    ldP.includes(n) ? ldP = ldP.filter(x=>x!==n) : ldP.push(n);
    renderLadderPlayerPool();
  }

  function initLadderGame() {
    if(ldP.length < 2) { gsAlert("선수를 선택해줘!"); return; }
    finalMapping = Array.from(document.querySelectorAll('.l-punish')).map(i => i.value.trim() || "패스").sort(() => Math.random() - 0.5);
    winHistory = [];
    $('ladder-final-msg').style.display = 'none';
    $('ladder-setup-view').style.display = 'none';
    $('ladder-game-view').style.display = 'block';

    const cvs = $('ladderCanvas');
    const ctx = cvs.getContext('2d');
    cvs.width = 600;
    cvs.height = 550;

    ladderGap = (cvs.width - 80) / (ldP.length - 1);
    ladderLines = [];

    // v5.634: 균형 잡힌 가로선 생성 — 열 쌍별 목표 개수 보장
    const ROWS = 12;
    const colPairs = ldP.length - 1;
    const targetPerPair = Math.max(4, Math.round(ROWS * 0.55));

    for (let i = 0; i < colPairs; i++) {
      const rowIndices = Array.from({ length: ROWS }, (_, r) => r);
      for (let k = rowIndices.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [rowIndices[k], rowIndices[j]] = [rowIndices[j], rowIndices[k]];
      }
      const chosen = rowIndices.slice(0, targetPerPair).sort((a, b) => a - b);
      chosen.forEach(r => {
        const conflict = ladderLines.some(l =>
          l.row === r && (l.from === i - 1 || l.from === i + 1)
        );
        if (!conflict) {
          ladderLines.push({
            x: 40 + (i * ladderGap),
            y: 130 + (r * 30) + (Math.random() * 5),
            from: i, to: i + 1, row: r
          });
        }
      });
    }

    drawLadderBase(ctx, cvs);

    cvs.onclick = (e) => {
      const rect = cvs.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (cvs.width / rect.width);
      const y = (e.clientY - rect.top) * (cvs.height / rect.height);
      if(y < 110) {
        let idx = Math.round((x - 40) / ladderGap);
        if(idx >= 0 && idx < ldP.length && !winHistory.some(w => w.name === ldP[idx])) stL(ctx, idx);
      }
    };
  }

  function drawLadderBase(ctx, cvs) {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 3;

    ldP.forEach((name, i) => {
      const x = 40 + (i * ladderGap);
      ctx.beginPath();
      ctx.moveTo(x, 80);
      ctx.lineTo(x, 480);
      ctx.stroke();

      ctx.fillStyle = '#1c1c1e';
      ctx.font = '400 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name.substring(0,3), x, 65);

      ctx.fillStyle = finalMapping[i] === "패스" ? "#8e8e93" : "#FF3B30";
      ctx.fillText(finalMapping[i], x, 510);
    });

    ctx.beginPath();
    ladderLines.forEach(l => {
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + ladderGap, l.y);
    });
    ctx.stroke();
  }

  function stL(ctx, sIdx) {
    let cX = sIdx, cY = 80;
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 6;
    const sL = [...ladderLines].sort((a,b) => a.y - b.y);

    const tm = setInterval(() => {
      const absX = 40 + (cX * ladderGap);
      if(cY >= 480) {
        clearInterval(tm);
        const res = finalMapping[cX];
        winHistory.push({ name: ldP[sIdx], result: res });

        if(res !== "패스") {
          $('ladder-final-msg').style.display = 'block';
          $('congrats-content').innerHTML = winHistory
            .filter(w => w.result !== "패스")
            .map(w => `🎉 <b>${escapeHtml(w.name)}님</b>, <b>${escapeHtml(w.result)}</b> 감사합니다! 🎉`)
            .join('<br>');
        }
        gsAlert(`${ldP[sIdx]}님 결과: ${res}`);
        return;
      }

      let nY = cY + 6, mv = false;
      for(let l of sL) {
        if(l.y > cY && l.y < nY + 2) {
          if(l.from === cX) {
            ctx.beginPath();
            ctx.moveTo(absX, cY);
            ctx.lineTo(absX, l.y);
            ctx.lineTo(absX + ladderGap, l.y);
            ctx.stroke();
            cX++; cY = l.y + 1; mv = true; break;
          } else if(l.to === cX) {
            ctx.beginPath();
            ctx.moveTo(absX, cY);
            ctx.lineTo(absX, l.y);
            ctx.lineTo(absX - ladderGap, l.y);
            ctx.stroke();
            cX--; cY = l.y + 1; mv = true; break;
          }
        }
      }
      if(!mv) {
        ctx.beginPath();
        ctx.moveTo(absX, cY);
        ctx.lineTo(absX, nY);
        ctx.stroke();
        cY = nY;
      }
    }, 15);
  }

  function resetLadderGame() {
    ldP = [];
    winHistory = [];
    $('ladder-setup-view').style.display='block';
    $('ladder-game-view').style.display='none';
    renderLadderPlayerPool();
  }
