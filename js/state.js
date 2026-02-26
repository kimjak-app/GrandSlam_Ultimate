// ========================================
// GRANDSLAM ULTIMATE — 전역 상태 및 설정
// ========================================

const AppEvents = new EventTarget();

// ========================================
// CONFIGURATION & GLOBAL VARIABLES
// ========================================

const ACTIVE_CLUB_KEY = 'grandslam_active_club_v2';

const CLUB_COLORS = ['#5D9C76', '#669DB3', '#D98C73', '#4A6B8A', '#C4A55A', '#C27C7C', '#8B7EB5', '#7A9E6D', '#6B7B99', '#3D5A4E'];

var currentClub = null;
var clubList = [];
var masterUnlocked = false;

var ADMIN_PIN = "";
var MASTER_PIN = ""; // 마스터 PIN 인증 성공 시 세션 캐싱

var _masterPinCallback = null;
var _gsAlertCallback = null;
var _gsConfirmCallback = null;
var _clubPinCallback = null;

// ========================================
// 다종목 확장 구조
// 점수 규칙 상수는 js/rules/tennis.js (TENNIS_RULES)
// ========================================

const DEFAULT_SPORT = "tennis";

const MATCH_TYPE = {
  INDIVIDUAL: "individual",
  PAIR: "pair",
  TEAM: "team"
};

// Player 객체 필드:
//   gender: 'M' | 'F'
//   level: 'A' | 'B' | 'C' (기본값 'A')
//   mScore/mWins/mLosses/lastM: 혼복 전용
//   attributes: 종목별 확장용 { sport, preferredPosition }
var players = [];
var matchLog = [];

// Single Game State
var mType = 'double';
var hT = [];
var aT = [];

// Chart & UI State
var chart = null;
var tabNow = 1;

// Practice Mode
var isPracticeMode = localStorage.getItem('grandslam_practice_mode') || 'real';

// Admin
let adminUnlocked = false;

// Round Mode State
var roundOpt = 'rank';
var roundMode = 'double';
var roundParticipants = [];
var roundMatches = [];

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

// 날씨 좌표 캐시
var weatherCoords = { lat: 37.48, lon: 126.86, name: '광명' };

// 기본 코트 정보
var defaultCourt = {
  name: "광명시민체육관 3번 코트",
  address: "경기도 광명시 오리로 613",
  time: "07:00 ~ 11:00",
  memo: ""
};

var courtNotices = [];
var announcements = [];

// 숨김 처리할 가상 플레이어 (랭킹/통계/풀에서 제외)
const HIDDEN_PLAYERS = ['1대2용', '1대2대결용'];

// 당일 게스트 (세션 내 존재, 순위/통계 제외)
var oneTimePlayers = [];

// 가상 1대2대결용 플레이어 객체
const VIRTUAL_1V2_PLAYER = { name: '1대2대결용', isGuest: true, isVirtual: true, score: 0, wins: 0, losses: 0, dScore: 0, dWins: 0, dLosses: 0, sScore: 0, sWins: 0, sLosses: 0, last: 0, lastD: 0, lastS: 0 };

var treasurerUnlocked = false;
var currentFinTab = 'income';
var financeData = [];
var feeData = {};
var monthlyFeeAmount = 0;
var courtPresets = [];

var _clubFormSaving = false;

// Mini Tournament State
var miniTournamentMatches = [];
var miniTournamentRound = 0;
var _gsEditNameCallback = null;

// Tournament - 단식 예선
let singlePrelim = null;
let pendingSingles = null;
