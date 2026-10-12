import { query, queryOne, withTransaction } from '../config/db.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken, refreshExpiryDate } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';

const CUSTOMER_COLS = `id, full_name, email, phone, country, city, district, street, building, is_active, created_at`;

const publicUser = (row) => ({
  id: Number(row.id),
  full_name: row.full_name,
  email: row.email,
  phone: row.phone,
  country: row.country,
  city: row.city,
  district: row.district,
  street: row.street,
  building: row.building,
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
});

const publicAdmin = (row) => ({
  id: Number(row.id),
  full_name: row.full_name,
  email: row.email,
  phone: row.phone,
  is_active: Boolean(row.is_active),
});

/**
 * Issues an access + refresh pair and persists the refresh token hash.
 * The role is stamped onto the payload explicitly - DB rows have no `role`
 * column, and a missing claim makes every role guard reject the token.
 */
const issueTokens = async (user, role) => {
  const principal = { id: Number(user.id), role };
  const accessToken = signAccessToken(principal);
  const refreshToken = signRefreshToken(principal);
  await query(
    'INSERT INTO refresh_tokens (customer_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, hashToken(refreshToken), refreshExpiryDate()]
  );
  return { accessToken, refreshToken };
};

export const register = async ({ full_name, email, phone, password, city }) => {
  const existing = await queryOne(
    'SELECT id FROM customers WHERE email = ? OR phone = ? LIMIT 1',
    [email.toLowerCase(), phone]
  );
  if (existing) {
    throw ApiError.conflict('البريد الإلكتروني أو رقم الجوال مستخدم مسبقاً');
  }

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO customers (full_name, email, phone, password_hash, city)
     VALUES (?, ?, ?, ?, ?)`,
    [full_name, email.toLowerCase(), phone, passwordHash, city || '']
  );

  const user = await queryOne(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, [result.insertId]);
  const tokens = await issueTokens({ id: user.id }, 'customer');
  return { user: publicUser(user), ...tokens };
};

export const login = async ({ identifier, password }) => {
  const isEmail = identifier.includes('@');
  const user = await queryOne(
    `SELECT ${CUSTOMER_COLS}, password_hash FROM customers
      WHERE ${isEmail ? 'email' : 'phone'} = ? LIMIT 1`,
    [isEmail ? identifier.toLowerCase() : identifier]
  );

  // Same message for unknown user and wrong password - no account enumeration.
  const invalid = ApiError.unauthorized('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  if (!user) {
    // Burn comparable time to avoid a user-enumeration timing side channel.
    await verifyPassword(password, '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12');
    throw invalid;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) throw invalid;
  if (!user.is_active) throw ApiError.forbidden('تم تعطيل الحساب، تواصل مع الدعم');

  delete user.password_hash;
  const tokens = await issueTokens(user, 'customer');
  return { user: publicUser(user), ...tokens };
};

/** Rotates a refresh token: revokes the old one, issues a new pair. */
export const refresh = async (refreshToken) => {
  const payload = verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      `SELECT id, customer_id FROM refresh_tokens
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1
        FOR UPDATE`,
      [tokenHash]
    );
    const stored = rows[0];
    if (!stored) throw ApiError.unauthorized('جلسة التحديث غير صالحة، يرجى تسجيل الدخول');

    await conn.execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [stored.id]);

    const [users] = await conn.execute(
      `SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ? AND is_active = 1 LIMIT 1`,
      [payload.sub]
    );
    const user = users[0];
    if (!user) throw ApiError.unauthorized('الحساب غير موجود أو معطل');

    const accessToken = signAccessToken({ id: Number(user.id), role: 'customer' });
    const nextRefresh = signRefreshToken({ id: Number(user.id), role: 'customer' });
    await conn.execute(
      'INSERT INTO refresh_tokens (customer_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, hashToken(nextRefresh), refreshExpiryDate()]
    );

    return { user: publicUser(user), accessToken, refreshToken: nextRefresh };
  });
};

export const logout = async (refreshToken) => {
  if (!refreshToken) return;
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [
    hashToken(refreshToken),
  ]);
};

export const logoutAll = async (customerId) => {
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE customer_id = ? AND revoked_at IS NULL', [
    customerId,
  ]);
};

export const getProfile = async (id) => {
  const user = await queryOne(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, [id]);
  if (!user) throw ApiError.notFound('الحساب غير موجود');
  return publicUser(user);
};

export const updateProfile = async (id, patch) => {
  const allowed = ['full_name', 'phone', 'city', 'country', 'district', 'street', 'building'];
  const entries = Object.entries(patch).filter(([k, v]) => allowed.includes(k) && v !== undefined);
  if (!entries.length) throw ApiError.badRequest('لا توجد حقول صالحة للتحديث');

  if (patch.phone) {
    const clash = await queryOne('SELECT id FROM customers WHERE phone = ? AND id <> ?', [patch.phone, id]);
    if (clash) throw ApiError.conflict('رقم الجوال مستخدم في حساب آخر');
  }

  const sets = entries.map(([k]) => `\`${k}\` = ?`).join(', ');
  await query(`UPDATE customers SET ${sets} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
  return getProfile(id);
};

export const changePassword = async (id, { current_password, new_password }) => {
  const row = await queryOne('SELECT password_hash FROM customers WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('الحساب غير موجود');

  const valid = await verifyPassword(current_password, row.password_hash);
  if (!valid) throw ApiError.badRequest('كلمة المرور الحالية غير صحيحة');

  await query('UPDATE customers SET password_hash = ? WHERE id = ?', [await hashPassword(new_password), id]);
  // Changing a password invalidates every other session.
  await logoutAll(id);
};

/* ---------------- admin auth ---------------- */

export const adminLogin = async ({ identifier, password }) => {
  const isEmail = identifier.includes('@');
  const admin = await queryOne(
    `SELECT id, full_name, email, phone, password_hash, is_active FROM admins
      WHERE ${isEmail ? 'email' : 'phone'} = ? LIMIT 1`,
    [isEmail ? identifier.toLowerCase() : identifier]
  );

  const invalid = ApiError.unauthorized('بيانات دخول المشرف غير صحيحة');
  if (!admin) {
    await verifyPassword(password, '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12');
    throw invalid;
  }
  if (!(await verifyPassword(password, admin.password_hash))) throw invalid;
  if (!admin.is_active) throw ApiError.forbidden('تم تعطيل حساب المشرف');

  delete admin.password_hash;
  const accessToken = signAccessToken({ id: Number(admin.id), role: 'admin' });
  return { admin: publicAdmin(admin), accessToken };
};
