const HttpError = require('../lib/httpError');

const DISCLOSED_STATES = ['RESOLVED', 'DUPLICATE', 'INFORMATIVE', 'NOT_APPLICABLE', 'SPAM'];
const ALL_STATES = ['NONE', 'PENDING', 'TRIAGED', ...DISCLOSED_STATES];

// Nhóm disclosed nhưng KHÔNG spam — dùng cho hiển thị công khai
// (SPAM là riêng tư: chỉ chủ nick và admin thấy)
const PUBLIC_STATES = DISCLOSED_STATES.filter((s) => s !== 'SPAM');

// Chỉ đi tiến, không quay ngược (theo đặc tả). Report tạo mới luôn là PENDING.
// PENDING -> SPAM là làn đường tắt cho spam rõ ràng, bỏ qua triage.
const ALLOWED_TRANSITIONS = {
  NONE: ['PENDING', 'TRIAGED', 'SPAM'],
  PENDING: ['TRIAGED', 'SPAM'],
  TRIAGED: [...DISCLOSED_STATES],
};

// Điểm cộng/trừ cho reporter khi report vào nhóm disclosed
const POINTS_BY_STATE = {
  RESOLVED: 7,
  DUPLICATE: 2,
  INFORMATIVE: 0,
  NOT_APPLICABLE: -5,
  SPAM: -10,
};

const SEVERITY_STATES = new Set(['TRIAGED', ...DISCLOSED_STATES]); // "state >= TRIAGED"
const BOUNTY_STATES = new Set(['RESOLVED']);

function isDisclosed(state) {
  return DISCLOSED_STATES.includes(state);
}

// Ném HttpError 400 nếu hành động vi phạm state machine / rule severity / bounty.
function assertActionAllowed(report, { newState, severity, bountyAmount }) {
  if (isDisclosed(report.state)) {
    throw new HttpError(400, 'Report is closed and no longer accepts new activities');
  }

  const stateAfter = newState || report.state;

  if (newState) {
    if (!ALL_STATES.includes(newState)) {
      throw new HttpError(400, `Unknown state: ${newState}`);
    }
    const allowed = ALLOWED_TRANSITIONS[report.state] || [];
    if (!allowed.includes(newState)) {
      throw new HttpError(400, `Invalid state transition: ${report.state} -> ${newState}`);
    }
  }

  if (severity && !SEVERITY_STATES.has(stateAfter)) {
    throw new HttpError(400, 'Severity can only be set when the report is TRIAGED or disclosed');
  }

  if (bountyAmount !== undefined && bountyAmount !== null && !BOUNTY_STATES.has(stateAfter)) {
    throw new HttpError(400, 'Bounty can only be awarded when the report is RESOLVED');
  }
}

function pointsForState(state) {
  return POINTS_BY_STATE[state] ?? null;
}

module.exports = {
  DISCLOSED_STATES,
  PUBLIC_STATES,
  ALL_STATES,
  ALLOWED_TRANSITIONS,
  POINTS_BY_STATE,
  isDisclosed,
  assertActionAllowed,
  pointsForState,
};
