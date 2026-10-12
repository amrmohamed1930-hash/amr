import { query, queryOne } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { hashPassword } from '../utils/password.js';
import { parsePagination, buildMeta, toBool } from '../utils/query.js';

/* ============================================================
   Customers (customers)
   ============================================================ */

const CUSTOMER_COLS =
  'id, full_name, email, phone, country, city, district, street, building, is_active, created_at, updated_at';

const shapeCustomer = (row) => ({
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
  updated_at: row.updated_at,
});

export const listCustomers = async (q = {}) => {
  const page = parsePagination(q);
  const where = [];
  const params = [];

  if (q.q) {
    const like = `%${q.q}%`;
    where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR city LIKE ?)');
    params.push(like, like, like, like);
  }
  const active = toBool(q.active);
  if (active !== undefined) {
    where.push('is_active = ?');
    params.push(active ? 1 : 0);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM customers ${whereSql}`, params);
  const rows = await query(
    `SELECT ${CUSTOMER_COLS} FROM customers ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );

  return { data: rows.map(shapeCustomer), meta: buildMeta(page, Number(totalRow?.total || 0)) };
};

export const getCustomer = async (id) => {
  const row = await queryOne(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, [id]);
  if (!row) throw ApiError.notFound('العميل غير موجود');
  return shapeCustomer(row);
};

export const createCustomer = async (payload) => {
  const clash = await queryOne('SELECT id FROM customers WHERE email = ? OR phone = ? LIMIT 1', [
    payload.email.toLowerCase(),
    payload.phone,
  ]);
  if (clash) throw ApiError.conflict('البريد الإلكتروني أو رقم الجوال مستخدم مسبقاً');

  const result = await query(
    `INSERT INTO customers (full_name, email, phone, password_hash, country, city, district, street, building, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.full_name,
      payload.email.toLowerCase(),
      payload.phone,
      await hashPassword(payload.password),
      payload.country ?? 'السعودية',
      payload.city ?? '',
      payload.district ?? null,
      payload.street ?? null,
      payload.building ?? null,
      payload.is_active === false ? 0 : 1,
    ]
  );
  return getCustomer(result.insertId);
};

export const updateCustomer = async (id, patch) => {
  await getCustomer(id);

  if (patch.email) {
    const clash = await queryOne('SELECT id FROM customers WHERE email = ? AND id <> ?', [patch.email, id]);
    if (clash) throw ApiError.conflict('البريد الإلكتروني مستخدم في حساب آخر');
  }
  if (patch.phone) {
    const clash = await queryOne('SELECT id FROM customers WHERE phone = ? AND id <> ?', [patch.phone, id]);
    if (clash) throw ApiError.conflict('رقم الجوال مستخدم في حساب آخر');
  }

  const sets = [];
  const values = [];
  for (const key of ['full_name', 'email', 'phone', 'country', 'city', 'district', 'street', 'building']) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(key === 'email' ? patch[key].toLowerCase() : patch[key]);
  }
  if (patch.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(patch.is_active ? 1 : 0);
  }
  if (patch.password) {
    sets.push('password_hash = ?');
    values.push(await hashPassword(patch.password));
  }
  if (sets.length) await query(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);

  return getCustomer(id);
};

export const deleteCustomer = async (id) => {
  await getCustomer(id);
  await query('DELETE FROM customers WHERE id = ?', [id]);
};

/* ============================================================
   Admin accounts (admins)
   ============================================================ */

const ADMIN_COLS = 'id, full_name, email, phone, is_active, created_at, updated_at';

const shapeAdmin = (row) => ({
  id: Number(row.id),
  full_name: row.full_name,
  email: row.email,
  phone: row.phone,
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const listAdmins = async () =>
  (await query(`SELECT ${ADMIN_COLS} FROM admins ORDER BY id ASC`)).map(shapeAdmin);

const getAdminRow = async (id) => {
  const row = await queryOne(`SELECT ${ADMIN_COLS} FROM admins WHERE id = ?`, [id]);
  if (!row) throw ApiError.notFound('حساب المشرف غير موجود');
  return row;
};

export const createAdmin = async (payload) => {
  const clash = await queryOne('SELECT id FROM admins WHERE email = ? OR phone = ? LIMIT 1', [
    payload.email.toLowerCase(),
    payload.phone,
  ]);
  if (clash) throw ApiError.conflict('البريد الإلكتروني أو رقم الجوال مستخدم مسبقاً');

  const result = await query(
    'INSERT INTO admins (full_name, email, phone, password_hash, is_active) VALUES (?,?,?,?,?)',
    [
      payload.full_name,
      payload.email.toLowerCase(),
      payload.phone,
      await hashPassword(payload.password),
      payload.is_active === false ? 0 : 1,
    ]
  );
  return shapeAdmin(await getAdminRow(result.insertId));
};

export const updateAdmin = async (id, patch, actingAdminId) => {
  const current = await getAdminRow(id);

  // An admin must not lock themselves out of the panel they are using.
  if (Number(id) === Number(actingAdminId) && patch.is_active === false) {
    throw ApiError.badRequest('لا يمكنك تعطيل حسابك الذي سجّلت به');
  }
  if (patch.email && patch.email.toLowerCase() !== current.email) {
    const clash = await queryOne('SELECT id FROM admins WHERE email = ? AND id <> ?', [patch.email, id]);
    if (clash) throw ApiError.conflict('البريد الإلكتروني مستخدم في حساب آخر');
  }
  if (patch.phone && patch.phone !== current.phone) {
    const clash = await queryOne('SELECT id FROM admins WHERE phone = ? AND id <> ?', [patch.phone, id]);
    if (clash) throw ApiError.conflict('رقم الجوال مستخدم في حساب آخر');
  }

  const sets = [];
  const values = [];
  for (const key of ['full_name', 'email', 'phone']) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(key === 'email' ? patch[key].toLowerCase() : patch[key]);
  }
  if (patch.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(patch.is_active ? 1 : 0);
  }
  if (patch.password) {
    sets.push('password_hash = ?');
    values.push(await hashPassword(patch.password));
  }
  if (sets.length) await query(`UPDATE admins SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);

  return shapeAdmin(await getAdminRow(id));
};

export const deleteAdmin = async (id, actingAdminId) => {
  if (Number(id) === Number(actingAdminId)) {
    throw ApiError.badRequest('لا يمكنك حذف حسابك الذي سجّلت به');
  }
  await getAdminRow(id);

  const others = await queryOne('SELECT COUNT(*) AS total FROM admins WHERE is_active = 1 AND id <> ?', [id]);
  if (Number(others?.total || 0) === 0) {
    throw ApiError.badRequest('لا يمكن حذف آخر حساب مشرف نشط');
  }
  await query('DELETE FROM admins WHERE id = ?', [id]);
};

/* ============================================================
   Carts (cart_items + cart_product)
   ============================================================ */

export const listCarts = async (q = {}) => {
  const page = parsePagination(q);
  const where = [];
  const params = [];

  if (q.q) {
    const like = `%${q.q}%`;
    where.push('(cu.full_name LIKE ? OR cu.email LIKE ? OR cu.phone LIKE ?)');
    params.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total FROM cart_items ci JOIN customers cu ON cu.id = ci.customer_id ${whereSql}`,
    params
  );
  const rows = await query(
    `SELECT ci.id, ci.customer_id, cu.full_name, cu.email, cu.phone,
            ci.created_at, ci.updated_at,
            (SELECT COUNT(*) FROM cart_product cp WHERE cp.cart_item_id = ci.id) AS line_count,
            (SELECT IFNULL(SUM(cp.amount), 0) FROM cart_product cp WHERE cp.cart_item_id = ci.id) AS units,
            (SELECT IFNULL(SUM(cp.amount * cp.price), 0) FROM cart_product cp WHERE cp.cart_item_id = ci.id) AS total
       FROM cart_items ci
       JOIN customers cu ON cu.id = ci.customer_id
       ${whereSql}
      ORDER BY ci.updated_at DESC, ci.id DESC
      LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );

  return {
    data: rows.map((r) => ({
      id: Number(r.id),
      customer: {
        id: Number(r.customer_id),
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
      },
      line_count: Number(r.line_count),
      units: Number(r.units),
      total: Math.round(Number(r.total) * 100) / 100,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    meta: buildMeta(page, Number(totalRow?.total || 0)),
  };
};

const getCartRow = async (id) => {
  const row = await queryOne(
    `SELECT ci.id, ci.customer_id, cu.full_name, cu.email, cu.phone, ci.created_at, ci.updated_at
       FROM cart_items ci JOIN customers cu ON cu.id = ci.customer_id
      WHERE ci.id = ?`,
    [id]
  );
  if (!row) throw ApiError.notFound('السلة غير موجودة');
  return row;
};

export const getCart = async (id) => {
  const row = await getCartRow(id);
  const lines = await query(
    `SELECT cp.id, cp.product_id, cp.amount, cp.price,
            p.name_ar AS product_name, p.slug AS product_slug, p.stock_quantity
       FROM cart_product cp
       LEFT JOIN products p ON p.id = cp.product_id
      WHERE cp.cart_item_id = ?
      ORDER BY cp.id ASC`,
    [id]
  );

  return {
    id: Number(row.id),
    customer: {
      id: Number(row.customer_id),
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    lines: lines.map((l) => ({
      id: Number(l.id),
      product_id: Number(l.product_id),
      product_name: l.product_name,
      product_slug: l.product_slug,
      stock_quantity: l.stock_quantity === null ? null : Number(l.stock_quantity),
      amount: Number(l.amount),
      price: Math.round(Number(l.price) * 100) / 100,
      line_total: Math.round(Number(l.amount) * Number(l.price) * 100) / 100,
    })),
  };
};

const getCartLine = async (cartId, lineId) => {
  const row = await queryOne('SELECT id FROM cart_product WHERE id = ? AND cart_item_id = ?', [lineId, cartId]);
  if (!row) throw ApiError.notFound('سطر السلة غير موجود');
  return row;
};

export const updateCartLine = async (cartId, lineId, amount) => {
  await getCartRow(cartId);
  await getCartLine(cartId, lineId);

  // Mirrors the storefront: amount 0 removes the line.
  if (amount === 0) {
    await query('DELETE FROM cart_product WHERE id = ?', [lineId]);
  } else {
    await query('UPDATE cart_product SET amount = ? WHERE id = ?', [amount, lineId]);
  }
  return getCart(cartId);
};

export const deleteCartLine = async (cartId, lineId) => {
  await getCartRow(cartId);
  await getCartLine(cartId, lineId);
  await query('DELETE FROM cart_product WHERE id = ?', [lineId]);
  return getCart(cartId);
};

export const deleteCart = async (id) => {
  await getCartRow(id);
  await query('DELETE FROM cart_items WHERE id = ?', [id]);
};

/* ============================================================
   Price history (price_history)
   ============================================================ */

export const deletePriceHistoryEntry = async (id) => {
  const row = await queryOne('SELECT id FROM price_history WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('سجل السعر غير موجود');
  await query('DELETE FROM price_history WHERE id = ?', [id]);
};
