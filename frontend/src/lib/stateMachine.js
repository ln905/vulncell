// Bản sao logic state machine của backend (services/stateMachine.js)
// để UI ẩn/hiện đúng lựa chọn — backend vẫn là nơi kiểm tra cuối cùng.

export const SEVERITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const DISCLOSED_STATES = ['RESOLVED', 'DUPLICATE', 'INFORMATIVE', 'NOT_APPLICABLE', 'SPAM'];

export const ALL_STATES = ['NONE', 'PENDING', 'TRIAGED', ...DISCLOSED_STATES];

export const ALLOWED_TRANSITIONS = {
  NONE: ['PENDING', 'TRIAGED', 'SPAM'],
  PENDING: ['TRIAGED', 'SPAM'],
  TRIAGED: [...DISCLOSED_STATES],
};

export function isDisclosed(state) {
  return DISCLOSED_STATES.includes(state);
}

export function severityAllowed(stateAfter) {
  return stateAfter === 'TRIAGED' || isDisclosed(stateAfter);
}

export function bountyAllowed(stateAfter) {
  return stateAfter === 'RESOLVED';
}
