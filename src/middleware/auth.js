import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { queryOne } from '../config/db.js';

// customers carries address columns; admins does not.
const COLUMNS = {
  customer: 'id, full_name, email, phone, city, country, is_active',
  admin: 'id, full_name, email, phone, is_active',
};
const TABLES = { customer: 'customers', admin: 'admins' };

/**
 * Requires a valid access token.
 * Loads the user row on every request so deleted/deactivated
 * accounts stop working immediately (no stale JWT window).
 */
const buildAuthenticate = (role) => async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('يجب إرسال توكن الدخول');
    }

    const payload = verifyAccessToken(token);
    if (payload.role !== role) {
      throw ApiError.forbidden('هذا المسار متاح لنوع مستخدم آخر');
    }

    const user = await queryOne(
      `SELECT ${COLUMNS[role]} FROM ${TABLES[role]} WHERE id = ? LIMIT 1`,
      [payload.sub]
    );

    if (!user) throw ApiError.unauthorized('الحساب غير موجود');
    if (!user.is_active) throw ApiError.forbidden('تم تعطيل الحساب، تواصل مع الدعم');

    req.user = { ...user, id: Number(user.id), role };
    req.tokenPayload = payload;
    next();
  } catch (err) {
    next(err);
  }
};

export const authenticate = buildAuthenticate('customer');
export const authenticateAdmin = buildAuthenticate('admin');

/**
 * Attaches req.user when a token is present but never rejects.
 * Used on public endpoints so the frontend can render
 * "added to cart" state without a second round trip.
 */
export const optionalAuth = async (req, _res, next) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) {
      const payload = verifyAccessToken(token);
      const role = payload.role === 'admin' ? 'admin' : 'customer';
      const user = await queryOne(
        `SELECT ${COLUMNS[role]} FROM ${TABLES[role]} WHERE id = ? LIMIT 1`,
        [payload.sub]
      );
      if (user?.is_active) {
        req.user = { ...user, id: Number(user.id), role };
      }
    }
  } catch {
    /* anonymous request - continue */
  }
  next();
};
