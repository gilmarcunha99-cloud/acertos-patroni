const jwt = require('jsonwebtoken');
const MAX_AGE = 7 * 24 * 3600;
const secret = () => process.env.SESSION_SECRET;

function cookieFor(userId) {
  const token = jwt.sign({ id: userId }, secret(), { expiresIn: MAX_AGE });
  return `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}
const clearCookie = () => 'sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';

function userIdFrom(headers) {
  const m = /(?:^|;\s*)sid=([^;]+)/.exec((headers && headers.cookie) || '');
  if (!m) return null;
  try { return jwt.verify(m[1], secret()).id; } catch { return null; }
}

module.exports = { cookieFor, clearCookie, userIdFrom };
