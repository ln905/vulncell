// Mọi request đi qua /api (Vite proxy -> http://localhost:4000), kèm cookie phiên.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* body rỗng */
  }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
};

// Nối query params, bỏ các giá trị rỗng
export function buildQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, value);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}
