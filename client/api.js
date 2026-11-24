export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Taskflow-Request': '1', ...options.headers }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Could not connect to the server. Please try again.');
    error.status = response.status;
    if (response.status === 401 && path.startsWith('/tasks')) window.dispatchEvent(new Event('taskflow:session-expired'));
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
