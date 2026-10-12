import { query, queryOne } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';

/* ---------------- categories ---------------- */

export const listCategories = async ({ tree = true, withCounts = true, includeInactive = false } = {}) => {
  const countSub = withCounts
    ? `, (SELECT COUNT(*) FROM product_categories pc
         JOIN products p ON p.id = pc.product_id AND p.is_active = 1
        WHERE pc.category_id = c.id) AS product_count`
    : '';

  // The admin panel needs hidden rows too; the storefront never passes this.
  const rows = await query(
    `SELECT c.id, c.parent_id, c.name_ar, c.name_en, c.slug, c.image_path, c.sort_order, c.is_active
            ${countSub}
       FROM categories c
      ${includeInactive ? '' : 'WHERE c.is_active = 1'}
      ORDER BY c.sort_order ASC, c.name_ar ASC`
  );

  const shaped = rows.map((r) => ({
    id: Number(r.id),
    parent_id: r.parent_id === null ? null : Number(r.parent_id),
    name_ar: r.name_ar,
    name_en: r.name_en,
    slug: r.slug,
    image_path: r.image_path,
    sort_order: Number(r.sort_order),
    is_active: Boolean(r.is_active),
    ...(withCounts ? { product_count: Number(r.product_count) } : {}),
  }));

  if (!tree) return shaped;

  const byId = new Map(shaped.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id).children.push(node);
    else roots.push(node);
  }
  return roots;
};

export const getCategoryBySlug = async (slug) => {
  const row = await queryOne(
    `SELECT c.id, c.parent_id, c.name_ar, c.name_en, c.slug, c.image_path, c.is_active
            , (SELECT COUNT(*) FROM product_categories pc
                 JOIN products p ON p.id = pc.product_id AND p.is_active = 1
                WHERE pc.category_id = c.id) AS product_count
       FROM categories c
      WHERE c.slug = ? AND c.is_active = 1 LIMIT 1`,
    [slug]
  );
  if (!row) throw ApiError.notFound('الفئة غير موجودة');

  const children = await query(
    `SELECT c.id, c.parent_id, c.name_ar, c.name_en, c.slug,
            (SELECT COUNT(*) FROM product_categories pc
               JOIN products p ON p.id = pc.product_id AND p.is_active = 1
              WHERE pc.category_id = c.id) AS product_count
       FROM categories c
      WHERE c.parent_id = ? AND c.is_active = 1
      ORDER BY c.sort_order, c.name_ar`,
    [row.id]
  );

  return {
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    name_ar: row.name_ar,
    name_en: row.name_en,
    slug: row.slug,
    image_path: row.image_path,
    is_active: Boolean(row.is_active),
    product_count: Number(row.product_count),
    children: children.map((c) => ({
      id: Number(c.id),
      name_ar: c.name_ar,
      name_en: c.name_en,
      slug: c.slug,
      product_count: Number(c.product_count),
    })),
  };
};

export const createCategory = async (payload) => {
  const slug = await uniqueSlug(payload.name_en || payload.name_ar, async (candidate) =>
    Boolean(await queryOne('SELECT id FROM categories WHERE slug = ?', [candidate]))
  );
  if (payload.parent_id) {
    const parent = await queryOne('SELECT id FROM categories WHERE id = ?', [payload.parent_id]);
    if (!parent) throw ApiError.badRequest('الفئة الأم غير موجودة');
  }
  const result = await query(
    `INSERT INTO categories (parent_id, name_ar, name_en, slug, sort_order, is_active)
     VALUES (?,?,?,?,?,?)`,
    [
      payload.parent_id ?? null,
      payload.name_ar,
      payload.name_en ?? null,
      slug,
      payload.sort_order ?? 0,
      payload.is_active === false ? 0 : 1,
    ]
  );
  return { id: result.insertId, slug };
};

export const updateCategory = async (id, payload) => {
  const existing = await queryOne('SELECT id FROM categories WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('الفئة غير موجودة');

  if (payload.parent_id) {
    if (Number(payload.parent_id) === Number(id)) throw ApiError.badRequest('لا يمكن أن تكون الفئة أمها لنفسها');
    if (await queryOne('SELECT id FROM categories WHERE parent_id = ?', [id])) {
      throw ApiError.badRequest('لا يمكن نقل فئة لها فئات فرعية');
    }
  }

  const sets = [];
  const values = [];
  for (const key of ['name_ar', 'name_en', 'parent_id', 'sort_order', 'is_active']) {
    if (payload[key] === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(typeof payload[key] === 'boolean' ? (payload[key] ? 1 : 0) : payload[key]);
  }
  if (sets.length) await query(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);

  if (payload.name_ar || payload.name_en) {
    const newSlug = await uniqueSlug(payload.name_en || payload.name_ar || 'category', async (candidate) => {
      const row = await queryOne('SELECT id FROM categories WHERE slug = ?', [candidate]);
      return row && Number(row.id) !== Number(id);
    });
    await query('UPDATE categories SET slug = ? WHERE id = ?', [newSlug, id]);
  }

  return { id: Number(id) };
};

export const deleteCategory = async (id) => {
  const row = await queryOne('SELECT id FROM categories WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('الفئة غير موجودة');
  await query('DELETE FROM categories WHERE id = ?', [id]);
};

/* ---------------- brands ---------------- */

export const listBrands = async ({ withCounts = true, includeInactive = false } = {}) => {
  const countSub = withCounts
    ? `, (SELECT COUNT(*) FROM products p
          WHERE p.brand_id = b.id AND p.is_active = 1) AS product_count`
    : '';

  const rows = await query(
    `SELECT b.id, b.name_ar, b.name_en, b.slug, b.logo_path, b.is_active
            ${countSub}
       FROM brands b
      ${includeInactive ? '' : 'WHERE b.is_active = 1'}
      ORDER BY b.name_ar ASC`
  );
  return rows.map((b) => ({
    id: Number(b.id),
    name_ar: b.name_ar,
    name_en: b.name_en,
    slug: b.slug,
    logo_path: b.logo_path,
    is_active: Boolean(b.is_active),
    ...(withCounts ? { product_count: Number(b.product_count) } : {}),
  }));
};

export const getBrandBySlug = async (slug) => {
  const row = await queryOne('SELECT id, name_ar, name_en, slug, logo_path, is_active FROM brands WHERE slug = ? LIMIT 1', [slug]);
  if (!row) throw ApiError.notFound('الماركة غير موجودة');
  return {
    id: Number(row.id),
    name_ar: row.name_ar,
    name_en: row.name_en,
    slug: row.slug,
    logo_path: row.logo_path,
    is_active: Boolean(row.is_active),
  };
};

export const createBrand = async (payload) => {
  const slug = await uniqueSlug(payload.name_en || payload.name_ar, async (candidate) =>
    Boolean(await queryOne('SELECT id FROM brands WHERE slug = ?', [candidate]))
  );
  const result = await query('INSERT INTO brands (name_ar, name_en, slug, is_active) VALUES (?,?,?,?)', [
    payload.name_ar,
    payload.name_en ?? null,
    slug,
    payload.is_active === false ? 0 : 1,
  ]);
  return { id: result.insertId, slug };
};

export const updateBrand = async (id, payload) => {
  const existing = await queryOne('SELECT id FROM brands WHERE id = ?', [id]);
  if (!existing) throw ApiError.notFound('الماركة غير موجودة');
  const sets = [];
  const values = [];
  for (const key of ['name_ar', 'name_en', 'is_active']) {
    if (payload[key] === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(typeof payload[key] === 'boolean' ? (payload[key] ? 1 : 0) : payload[key]);
  }
  if (sets.length) await query(`UPDATE brands SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
  return { id: Number(id) };
};

export const deleteBrand = async (id) => {
  const row = await queryOne('SELECT id FROM brands WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('الماركة غير موجودة');
  await query('DELETE FROM brands WHERE id = ?', [id]);
};

export { slugify };
