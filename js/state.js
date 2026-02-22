  // ========================================
  // ✅ v3.90+: 이벤트 기반 아키텍처 — 전역 이벤트 버스
  // api.js에서 데이터 로드 완료 시 dispatch, main.js에서 listen 후 렌더링
  // ========================================
  const AppEvents = new EventTarget();

  // ========================================
  // CONFIGURATION & GLOBAL VARIABLES
  // ========================================
  
  // ✅ v3.79: 다중 클럽 시스템 (Master GAS 방식)
  // GAS URL은 하나! 모든 클럽이 같은 URL로 통신, clubId로 라우팅
  const MASTER_GAS_URL = "https://script.google.com/macros/s/AKfycbwaTBlyZRh6UbxupMkFWDvJtgtU-CeAXipk7cwKzZpyoi23Ua8x_1WkY_lyLXDN2dwytg/exec";
  const ACTIVE_CLUB_KEY = 'grandslam_active_club_v2';
  const MASTER_PIN = "0707"; // 총괄 마스터 비밀번호 (모든 클럽 접근 가능)
  
  const CLUB_COLORS = ['#5D9C76','#669DB3','#D98C73','#4A6B8A','#C4A55A','#C27C7C','#8B7EB5','#7A9E6D','#6B7B99','#3D5A4E'];

  // 현재 활성 클럽
  var currentClub = null;
  var clubList = [];
  var masterUnlocked = false; // 마스터 인증 상태
  
  // 하위 호환: 기존 코드가 참조하는 글로벌 변수
  var GAS_URL = MASTER_GAS_URL;
  var ADMIN_PIN = "0707";

  // ✅ v3.8204: 마스터 비번 확인 - 커스텀 모달 (prompt 대체)
  var _masterPinCallback = null;

  // ✅ v3.820: 커스텀 Alert (alert() 대체)
  var _gsAlertCallback = null;

  // ✅ v3.820: 커스텀 Confirm (confirm() 대체) - 콜백 방식
  var _gsConfirmCallback = null;

  // ✅ v3.8191: 클럽 관리자 비번 확인 - 커스텀 모달 (prompt 대체)
  var _clubPinCallback = null;

  // ========================================
  // ✅ v4.0: 다종목 확장 구조 — 씨앗 심기
  // UI는 테니스 전용 유지, 데이터 구조만 범용화
  // ========================================

  // 현재 앱의 기본 스포츠 종목
  const DEFAULT_SPORT = "tennis";

  // 점수 체계 객체 — 하드코딩 금지, 이 객체 참조
  const SCORING_RULES = {
    tennis: {
      winPoint: 3,
      drawPoint: 1,
      lossPoint: 0,
      genderSeparated: true,
      mixedAllowed: true,
      levelSeparated: true
    }
  };

  // matchType 범용 상수
  const MATCH_TYPE = {
    INDIVIDUAL: "individual",
    PAIR: "pair",
    TEAM: "team"
  };

  // Player & Match Data
  // ✅ v3.93: Player 객체 gender 필드 명세
  //   gender: 'M' | 'F'  (string, 단일 대문자)
  // ✅ v3.94: 혼복 전용 필드 mScore/mWins/mLosses/lastM
  // ✅ v4.0: level 필드 — 'A'|'B'|'C' (기본값 'A', ensure()에서 자동 정규화)
  //         attributes — 종목별 확장용 껍데기 { sport, preferredPosition }
  var players = [];      // 선수 목록
  var matchLog = [];     // 경기 기록 (MatchLog 누적 기반 통계)
  
  // Single Game State
  var mType = 'double';  // 경기 타입: 'single' or 'double'
  var hT = [];           // Home Team (단일게임용)
  var aT = [];           // Away Team (단일게임용)
  
  // Chart & UI State
  var chart = null;      // Chart.js 인스턴스
  var tabNow = 1;        // 현재 탭 번호

  // Practice Mode
  var isPracticeMode = localStorage.getItem('grandslam_practice_mode') || 'real';  // ✅ 기본값 'real', localStorage 연동

  // Admin
  let adminUnlocked = false;
  
  // Round Mode State
  var roundOpt = 'rank';         // 배치 방식: 'rank', 'random', 'manual'
  var roundMode = 'double';      // 경기 종목: 'single', 'double'
  var roundParticipants = [];    // 참가자 목록 (단식: 선수명, 복식: 팀 배열)
  var roundMatches = [];         // 전체 매치 목록
  var roundResults = [];         // 경기 결과 (winnerId, loserId 저장)

  // Tournament State
  let selected = [];
  let manualPickOrder = [];
  let tMode = 'rank';
  let tType = 'single';
  let pointsData = {};
  let currentBracketSize = 0;

  let tourBuffer = [];
  let tourCommitted = false;

  // Ladder State
  var ldP = [];
  var ladderLines = [];
  var winHistory = [];
  var finalMapping = [];
  var ladderGap = 0;

  // ✅ v3.81: 좌표 캐시 (도시명 → 위도/경도)
  var weatherCoords = { lat: 37.48, lon: 126.86, name: '광명' };

  // 기본 코트 정보 (ClubSettings에서 로드 가능)
  var defaultCourt = {
    name: "광명시민체육관 3번 코트",
    address: "경기도 광명시 오리로 613",
    time: "07:00 ~ 11:00",
    memo: ""
  };

  // 코트 공지 데이터 (GAS에서 로드)
  var courtNotices = [];
  // 공지사항 데이터 (GAS에서 로드)
  var announcements = [];

  // ✅ v3.816: 숨김 처리할 가상 플레이어 목록 (랭킹/통계/풀에서 보이지 않음)
  const HIDDEN_PLAYERS = ['1대2용', '1대2대결용'];

  // ✅ v3.8206: 당일 게스트 (세션 내에서만 존재, 순위/통계 제외)
  var oneTimePlayers = [];

  // ✅ v3.816: 가상 1대2대결용 플레이어 객체 (players 배열에 없어도 풀에 표시)
  const VIRTUAL_1V2_PLAYER = { name: '1대2대결용', isGuest: true, isVirtual: true, score:0, wins:0, losses:0, dScore:0, dWins:0, dLosses:0, sScore:0, sWins:0, sLosses:0, last:0, lastD:0, lastS:0 };

  var treasurerUnlocked = false;
  var currentFinTab = 'income';
  var financeData = []; // { id, type:'income'|'expense', date, desc, amount, auto:bool }
  var feeData = {};     // { '회원명': { '2026-01':'Y', ... } }
  var monthlyFeeAmount = 0; // 월회비 금액
  var courtPresets = []; // 코트 프리셋 [{name,address,time,memo}]

  var _clubFormSaving = false; // ✅ 중복 저장 방지

  // Mini Tournament State
  var miniTournamentMatches = [];
  var miniTournamentRound = 0;
  var _gsEditNameCallback = null;

  // Tournament - 단식 예선 관련
  let singlePrelim = null;
  let pendingSingles = null;
