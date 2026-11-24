import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const publicUser = user => ({ id: String(user.id || user._id), name: user.name, email: user.email });

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, expected] = encoded.split(':');
  const key = await derive(password, salt, 64, options);
  return timingSafeEqual(key, Buffer.from(expected, 'hex'));
}
export function readSession(req) {
  const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('taskflow_session='));
  const value = cookie?.slice('taskflow_session='.length);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function sessionOptions() {
  return { httpOnly: true, secure: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_MS };
}
