import { createApp } from './app.js';

export async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/api`, close: () => new Promise(resolve => server.close(resolve)) };
}
export async function startStore(store) { return listen(createApp(store)); }
export function client(base) {
  let cookie = '';
  return {
    get cookie() { return cookie; }, set cookie(value) { cookie = value; },
    async request(url, method = 'GET', body, headers = {}) {
      const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Taskflow-Request': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    }
  };
}
export const signup = (agent, email = 'alice@example.test', name = 'Alice') => agent.request('/auth/signup', 'POST', { name, email, password: 'A-private-test-password' });
