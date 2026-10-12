import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { ApiError } from './ApiError.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role, type: 'access' }, config.jwt.secret);

/**
 * Refresh tokens MUST be unique per issuance.
 *
 * JWT `iat` only has one-second resolution, so two logins for the same user
 * inside the same second would otherwise serialise to identical bytes, collide
 * on the refresh_tokens.token_hash unique key, and make rotation hand back the
 * very token it just revoked. A random `jti` guarantees uniqueness.
 */
export const signRefreshToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role, type: 'refresh', jti: crypto.randomUUID() }, config.jwt.refreshSecret, {
    expiresIn: `${config.jwt.refreshExpiresDays}d`,
  });

export const verifyAccessToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    if (payload.type !== 'access') throw ApiError.unauthorized('نوع التوكن غير صالح');
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('انتهت صلاحية الجلسة');
    throw ApiError.unauthorized('توكن الدخول غير صالح');
  }
};

export const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret);
    if (payload.type !== 'refresh') throw ApiError.unauthorized('نوع التوكن غير صالح');
    return payload;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('انتهت صلاحية جلسة التحديث');
    throw ApiError.unauthorized('توكن التحديث غير صالح');
  }
};

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const refreshExpiryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + config.jwt.refreshExpiresDays);
  return d;
};
