import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';

// express-rate-limit v8 requires IPv6-safe keying; without the helper
// every IPv6 client could get a fresh bucket and bypass the limit.
const keyByIp = (req) => ipKeyGenerator(req.ip);

// Escape hatch for local development, load tests and the smoke suite,
// where a fixed per-IP budget would otherwise produce false failures.
// Never enable this in production.
const disabled = String(process.env.RATE_LIMIT_DISABLED || '').toLowerCase() === 'true';
const skip = () => disabled;

const make = (max, message) =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: keyByIp,
    skip,
    message: { success: false, error: { code: 'RATE_LIMITED', message } },
  });

if (disabled) {
  console.warn('[rateLimit] DISABLED via RATE_LIMIT_DISABLED=true - do not use in production');
}

export const apiLimiter = make(config.rateLimit.max, 'عدد كبير من الطلبات، يرجى المحاولة لاحقاً');
export const authLimiter = make(config.rateLimit.authMax, 'محاولات كثيرة، يرجى المحاولة بعد قليل');
