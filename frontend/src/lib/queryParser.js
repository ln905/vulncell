// Bộ parse / compose cú pháp tìm kiếm kiểu HackerOne cho VulnCell.
//
// Ví dụ người dùng gõ (hoặc bấm panel filter sinh ra):
//   (severity:HIGH AND disclosed:true AND weakness:("Reflected XSS") AND bounty:>=213 AND bounty:<=1133) xss login
//
// Alias chấp nhận khi parse (lấy cảm hứng từ cú pháp HackerOne):
//   cwe / weakness            -> weakness
//   total_awarded_amount / bounty -> bounty (>, >=, <, <= hoặc =)
import { ALL_STATES, SEVERITIES, isDisclosed } from './stateMachine';

export { SEVERITIES };

const KEY_ALIASES = {
  weakness: 'weakness',
  cwe: 'weakness',
  bounty: 'bounty',
  total_awarded_amount: 'bounty',
  severity: 'severity',
  state: 'state',
  disclosed: 'disclosed',
};

// Tách chuỗi thành token { key, value }. Tôn trọng weakness:("giá trị có dấu cách")
function tokenize(input) {
  const s = String(input || '');
  const tokens = [];
  let i = 0;

  const isSep = (c) => c === undefined || /\s/.test(c) || c === ',' || c === '(' || c === ')';

  while (i < s.length) {
    const ch = s[i];

    // ngoặc và dấu phẩy chỉ để nhóm khi hiển thị
    if (/\s/.test(ch) || ch === ',' || ch === '(' || ch === ')') {
      i++;
      continue;
    }

    // bỏ từ nối AND / OR
    const word = /^[A-Za-z]+/.exec(s.slice(i, i + 10))?.[0] || '';
    if ((word === 'AND' || word === 'OR') && isSep(s[i + word.length])) {
      i += word.length;
      continue;
    }

    let key = '';
    while (i < s.length && s[i] !== ':' && !/[\s(),]/.test(s[i])) {
      key += s[i];
      i++;
    }

    // không có dấu ':' -> từ khóa tự do
    if (s[i] !== ':') {
      if (key) tokens.push({ key: null, value: key });
      continue;
    }
    i++; // bỏ ':'

    let value = '';
    if (s[i] === '(') {
      // dạng :("...") hoặc :('...')
      i++;
      const quote = s[i] === '"' || s[i] === "'" ? s[i] : null;
      if (quote) i++;
      while (i < s.length && s[i] !== (quote || ')')) {
        value += s[i];
        i++;
      }
      if (i < s.length) i++; // đóng quote
      if (s[i] === ')') i++; // đóng ngoặc
    } else {
      while (i < s.length && !/[\s(),]/.test(s[i])) {
        value += s[i];
        i++;
      }
    }

    tokens.push({ key: key.toLowerCase(), value });
  }

  return tokens;
}

export function emptyFilters() {
  return {
    q: '',
    disclosed: undefined,
    severity: undefined,
    state: undefined,
    weakness: undefined,
    bountyMin: undefined,
    bountyMax: undefined,
  };
}

export function parseQuery(input) {
  const filters = emptyFilters();
  const free = [];

  for (const { key, value } of tokenize(input)) {
    if (!key) {
      if (value) free.push(value);
      continue;
    }

    const k = KEY_ALIASES[key] || key;

    if (k === 'disclosed') {
      if (value === 'true' || value === 'false') filters.disclosed = value === 'true';
      else free.push(`${key}:${value}`);
    } else if (k === 'severity') {
      const v = value.toUpperCase();
      if (SEVERITIES.includes(v)) filters.severity = v;
      else free.push(`${key}:${value}`);
    } else if (k === 'state') {
      const v = value.toUpperCase();
      if (ALL_STATES.includes(v)) filters.state = v;
      else free.push(`${key}:${value}`);
    } else if (k === 'weakness') {
      if (value) filters.weakness = value;
    } else if (k === 'bounty') {
      const m = /^(>=|<=|>|<|=)?(\d+)$/.exec(value.replace(/\s/g, ''));
      if (m) {
        const n = Number(m[2]);
        const op = m[1];
        if (op === '>=' || op === '>') filters.bountyMin = n;
        else if (op === '<=' || op === '<') filters.bountyMax = n;
        else {
          filters.bountyMin = n;
          filters.bountyMax = n;
        }
      } else {
        free.push(`${key}:${value}`);
      }
    } else {
      free.push(`${key}:${value}`);
    }
  }

  // state cụ thể thắng disclosed (2 cái cùng chiều trạng thái)
  if (filters.state) filters.disclosed = undefined;

  filters.q = free.join(' ');
  return filters;
}

export function composeQueryText(filters) {
  const parts = [];

  if (filters.severity) parts.push(`severity:${filters.severity}`);
  if (filters.state) parts.push(`state:${filters.state}`);
  else if (filters.disclosed !== undefined) parts.push(`disclosed:${filters.disclosed}`);
  if (filters.weakness) parts.push(`weakness:("${filters.weakness}")`);
  if (filters.bountyMin !== undefined) parts.push(`bounty:>=${filters.bountyMin}`);
  if (filters.bountyMax !== undefined) parts.push(`bounty:<=${filters.bountyMax}`);

  const base = parts.length > 1 ? `(${parts.join(' AND ')})` : parts[0] || '';
  const q = (filters.q || '').trim();
  return [base, q].filter(Boolean).join(' ');
}

// Đổi filters -> query params gửi backend
export function toApiParams(filters) {
  return {
    q: filters.q || undefined,
    severity: filters.severity || undefined,
    state: filters.state || undefined,
    weakness: filters.weakness || undefined,
    bountyMin: filters.bountyMin,
    bountyMax: filters.bountyMax,
    disclosed: filters.state ? undefined : filters.disclosed,
  };
}

// Tab đang hiển thị (Disclosed / Undisclosed) suy ra từ filters
export function disclosedTab(filters) {
  if (filters.state) return isDisclosed(filters.state) ? 'disclosed' : 'undisclosed';
  return filters.disclosed === false ? 'undisclosed' : 'disclosed';
}

// Số filter đang bật (không tính disclosed vì tab đã thể hiện)
export function activeFilterCount(filters) {
  let n = 0;
  if (filters.severity) n++;
  if (filters.state) n++;
  if (filters.weakness) n++;
  if (filters.bountyMin !== undefined || filters.bountyMax !== undefined) n++;
  return n;
}
