// Thin wrapper around the REST API. Same-origin in production (Express serves
// the build); in dev Vite proxies /api to the backend.
const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // Tasks
  getTasks: () => request('/tasks'),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // Assignees
  getAssignees: () => request('/assignees'),
  createAssignee: (name) => request('/assignees', { method: 'POST', body: JSON.stringify({ name }) }),
  updateAssignee: (id, name) =>
    request(`/assignees/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteAssignee: (id) => request(`/assignees/${id}`, { method: 'DELETE' }),
};
