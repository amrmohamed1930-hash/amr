import { query, queryOne, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { parseList, toInt, toFloat, toBool, parsePagination, buildMeta, money } from '../utils/query.js';
import { slugify, uniqueSlug } from '../utils/slugify.js';

/* ============================================================
   Query building helpers
   ============================================================ */

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

/** Recursively collects a category and every descendant id. */
const categoryTreeIds = async (rootId) => {
  const rows = await query(
    `WITH RECURSIVE tree AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id FROM categories c
          INNER JOIN tree t ON c.parent_id = t.id
    )
     SELECT id FROM tree`,
    [rootId]
  );
  return rows.map((r) => Number(r.id));
};

/** Resolves a category token (numeric id or slug) to its full subtree. */
const resolveCategoryIds = async (tokens) => {
  const ids = [];
  const slugs = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) ids.push(Number(token));
    else slugs.push(token);
  }
  if (slugs.length) {
    const rows = await query(`SELECT id FROM categories WHERE slug IN (${placeholders(slugs.length)})`, slugs);
    ids.push(...rows.map((r) => Number(r.id)));
  }
  const out = new Set();
  for (const id of ids) {
    if (!id) continue;
    const tree = await categoryTreeIds(id);
    tree.forEach((t) => out.add(t));
  }
  return [...out];
};

const resolveBrandIds = async (tokens) => {
  const ids = [];
  const slugs = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) ids.push(Number(token));
    else slugs.push(token);
  }
  if (slugs.length) {
    const rows = await query(`SELECT id FROM brands WHERE slug IN (${placeholders(slugs.length)})`, slugs);
    ids.push(...rows.map((r) => Number(r.id)));
  }
  return ids;
};

/**
 * Translates validated query params into SQL WHERE fragments + params.
 * Uses COALESCE(sale_price, base_price) so "on sale" items sort/filter
 * on the price the customer actually pays.
 */
const buildProductWhere = async (q) => {
  const where = [];
  const params = [];
  const joins = [];

  // The public query schema has no include_inactive (validate strips unknown
  // keys), so hidden products can only be listed through the admin schema.
  if (!toBool(q.include_inactive)) {
    where.push('p.is_active = 1');
  } else {
    const active = toBool(q.active);
    where.push(active === undefined ? '1 = 1' : `p.is_active = ${active ? 1 : 0}`);
  }

  const categories = parseList(q.category);
  if (categories.length) {
    const ids = await resolveCategoryIds(categories);
    if (!ids.length) return { where: ['1 = 0'], params, joins };
    joins.push(
      `INNER JOIN product_categories pc ON pc.product_id = p.id
        AND pc.category_id IN (${placeholders(ids.length)})`
    );
    where.push(`EXISTS (SELECT 1 FROM product_categories pc2
                         WHERE pc2.product_id = p.id
                           AND pc2.category_id IN (${placeholders(ids.length)}))`);
    params.push(...ids, ...ids);
  }

  const brands = parseList(q.brand);
  if (brands.length) {
    const ids = await resolveBrandIds(brands);
    if (!ids.length) return { where: ['1 = 0'], params, joins };
    where.push(`p.brand_id IN (${placeholders(ids.length)})`);
    params.push(...ids);
  }

  const colors = parseList(q.color);
  if (colors.length) {
    where.push(
      `EXISTS (SELECT 1 FROM product_colors pcl
                 WHERE pcl.product_id = p.id
                   AND pcl.name_ar IN (${placeholders(colors.length)}))`
    );
    params.push(...colors);
  }

  const minPrice = toFloat(q.min_price);
  const maxPrice = toFloat(q.max_price);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    throw ApiError.badRequest('السعر الأدنى يجب أن يكون أقل من السعر الأعلى');
  }
  if (minPrice !== null) {
    where.push('COALESCE(p.sale_price, p.base_price) >= ?');
    params.push(minPrice);
  }
  if (maxPrice !== null) {
    where.push('COALESCE(p.sale_price, p.base_price) <= ?');
    params.push(maxPrice);
  }

  const minRating = toFloat(q.min_rating);
  if (minRating !== null) {
    where.push('p.rating_avg >= ?');
    params.push(minRating);
  }

  if (toBool(q.loanable) === true) where.push('p.is_loanable = 1');
  if (toBool(q.featured) === true) where.push('p.is_featured = 1');
  if (toBool(q.in_stock) === true) where.push('p.stock_quantity > 0');
  if (toBool(q.on_sale) === true) {
    where.push('p.sale_price IS NOT NULL AND p.sale_price < p.base_price');
  }

  const search = q.q ? String(q.q).trim() : '';
  if (search) {
    const like = `%${search}%`;
    where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR p.description LIKE ? OR b.name_ar LIKE ? OR b.name_en LIKE ?)');
    params.push(like, like, like, like, like);
  }

  return { where, params, joins };
};

const SORT_MAP = {
  best_selling: 'p.rating_count DESC, p.rating_avg DESC, p.id DESC',
  popular: 'p.rating_count DESC, p.id DESC',
  price_asc: 'COALESCE(p.sale_price, p.base_price) ASC, p.id DESC',
  price_desc: 'COALESCE(p.sale_price, p.base_price) DESC, p.id DESC',
  rating_desc: 'p.rating_avg DESC, p.rating_count DESC, p.id DESC',
  newest: 'p.created_at DESC, p.id DESC',
  name_asc: 'p.name_ar ASC',
  name_desc: 'p.name_ar DESC',
};

const PRODUCT_SELECT = `
  SELECT
    p.id, p.name_ar, p.name_en, p.slug, p.description,
    p.base_price, p.sale_price, p.currency,
    COALESCE(p.sale_price, p.base_price) AS price,
    CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.base_price
         THEN ROUND((p.base_price - p.sale_price) / p.base_price * 100)
         ELSE 0 END AS discount_percent,
    p.rating_avg, p.rating_count, p.stock_quantity,
    p.is_loanable, p.is_featured, p.is_active,
    p.created_at, p.updated_at,
    b.id AS brand_id, b.name_ar AS brand_name_ar, b.name_en AS brand_name_en, b.slug AS brand_slug
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id`;

const attachRelations = async (rows, { withColors = true, withImages = true } = {}) => {
  if (!rows.length) return rows;
  const ids = rows.map((r) => Number(r.id));

  const grouped = (list, key = 'product_id') => {
    const map = new Map(ids.map((id) => [id, []]));
    for (const item of list) {
      const k = Number(item[key]);
      if (map.has(k)) map.get(k).push(item);
    }
    return map;
  };

  const [colors, images] = await Promise.all([
    withColors
      ? query(
          `SELECT id, product_id, name_ar, name_en, hex FROM product_colors
            WHERE product_id IN (${placeholders(ids.length)}) ORDER BY sort_order, id`,
          ids
        )
      : [],
    withImages
      ? query(
          `SELECT id, product_id, image_path, is_primary FROM product_images
            WHERE product_id IN (${placeholders(ids.length)}) ORDER BY is_primary DESC, sort_order, id`,
          ids
        )
      : [],
  ]);

  const colorsBy = grouped(colors);
  const imagesBy = grouped(images);

  return rows.map((row) => {
    const imgs = (imagesBy.get(Number(row.id)) || []).map((i) => ({
      id: Number(i.id),
      path: i.image_path,
      is_primary: Boolean(i.is_primary),
    }));
    return {
      ...row,
      id: Number(row.id),
      brand_id: row.brand_id === null ? null : Number(row.brand_id),
      price: money(row.price),
      base_price: money(row.base_price),
      sale_price: row.sale_price === null ? null : money(row.sale_price),
      rating_avg: Number(row.rating_avg),
      rating_count: Number(row.rating_count),
      stock_quantity: Number(row.stock_quantity),
      is_loanable: Boolean(row.is_loanable),
      is_featured: Boolean(row.is_featured),
      is_active: Boolean(row.is_active),
      on_sale: row.sale_price !== null && Number(row.sale_price) < Number(row.base_price),
      images: imgs,
      primary_image: imgs.find((i) => i.is_primary)?.path ?? imgs[0]?.path ?? null,
      colors: (colorsBy.get(Number(row.id)) || []).map((c) => ({
        id: Number(c.id),
        name_ar: c.name_ar,
        name_en: c.name_en,
        hex: c.hex,
      })),
    };
  });
};

/* ============================================================
   Facets - powers the sidebar option lists with live counts
   ============================================================ */

const buildFacets = async (base) => {
  const { where, params } = base;
  const whereSql = where.join(' AND ');

  const [categories, brands, colors, range, ratingBuckets] = await Promise.all([
    query(
      `SELECT c.id, c.name_ar, c.name_en, c.parent_id, c.slug, COUNT(DISTINCT p.id) AS product_count
         FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         JOIN products p ON p.id = pc.product_id AND p.is_active = 1
        WHERE ${whereSql}
        GROUP BY c.id, c.name_ar, c.name_en, c.parent_id, c.slug
        ORDER BY product_count DESC, c.sort_order ASC, c.name_ar ASC`,
      params
    ),
    query(
      `SELECT b.id, b.name_ar, b.name_en, b.slug, COUNT(DISTINCT p.id) AS product_count
         FROM brands b
         JOIN products p ON p.brand_id = b.id
        WHERE ${whereSql}
        GROUP BY b.id, b.name_ar, b.name_en, b.slug
        ORDER BY product_count DESC, b.name_ar ASC`,
      params
    ),
    query(
      `SELECT pc.name_ar, pc.name_en, MIN(pc.hex) AS hex, COUNT(DISTINCT p.id) AS product_count
         FROM product_colors pc
         JOIN products p ON p.id = pc.product_id
        WHERE ${whereSql}
        GROUP BY pc.name_ar, pc.name_en
        ORDER BY product_count DESC, pc.name_ar ASC`,
      params
    ),
    queryOne(
      `SELECT MIN(COALESCE(p.sale_price, p.base_price)) AS min_price,
              MAX(COALESCE(p.sale_price, p.base_price)) AS max_price
         FROM products p WHERE ${whereSql}`,
      params
    ),
    query(
      `SELECT FLOOR(p.rating_avg) AS bucket, COUNT(*) AS product_count
         FROM products p
        WHERE ${whereSql} AND p.rating_avg > 0
        GROUP BY bucket ORDER BY bucket DESC`,
      params
    ),
  ]);

  return {
    categories: categories.map((c) => ({
      id: Number(c.id),
      name_ar: c.name_ar,
      name_en: c.name_en,
      parent_id: c.parent_id === null ? null : Number(c.parent_id),
      slug: c.slug,
      product_count: Number(c.product_count),
    })),
    brands: brands.map((b) => ({
      id: Number(b.id),
      name_ar: b.name_ar,
      name_en: b.name_en,
      slug: b.slug,
      product_count: Number(b.product_count),
    })),
    colors: colors.map((c) => ({
      name_ar: c.name_ar,
      name_en: c.name_en,
      hex: c.hex,
      product_count: Number(c.product_count),
    })),
    price: {
      min: range?.min_price === null || range?.min_price === undefined ? 0 : money(range.min_price),
      max: range?.max_price === null || range?.max_price === undefined ? 0 : money(range.max_price),
    },
    rating_buckets: ratingBuckets.map((r) => ({ bucket: Number(r.bucket), product_count: Number(r.product_count) })),
  };
};

/* ============================================================
   Public service API
   ============================================================ */

export const listProducts = async (q) => {
  const { where, params, joins } = await buildProductWhere(q);
  const whereSql = where.join(' AND ');
  const joinSql = joins.join('\n');
  const page = parsePagination(q);

  const orderBy = SORT_MAP[q.sort] || SORT_MAP.best_selling;

  const totalRow = await queryOne(
    `SELECT COUNT(*) AS total
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       ${joinSql}
      WHERE ${whereSql}`,
    params
  );
  const total = Number(totalRow?.total || 0);

  const rows = await query(
    `${PRODUCT_SELECT}
     ${joinSql}
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );

  const data = await attachRelations(rows);

  const result = { data, meta: buildMeta(page, total) };
  if (toBool(q.with_facets)) result.facets = await buildFacets({ where: ['p.is_active = 1'], params: [] });
  return result;
};

export const getProductBySlug = async (slug) => {
  const row = await queryOne(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.is_active = 1 LIMIT 1`, [slug]);
  if (!row) throw ApiError.notFound('المنتج غير موجود');

  const [product] = await attachRelations([row]);

  const [categoryRows, reviewAgg] = await Promise.all([
    query(
      `SELECT c.id, c.name_ar, c.slug, c.parent_id
         FROM product_categories pc
         JOIN categories c ON c.id = pc.category_id
        WHERE pc.product_id = ?`,
      [product.id]
    ),
    queryOne(
      `SELECT COUNT(*) AS total, AVG(rating) AS avg_rating
         FROM reviews WHERE product_id = ? AND is_approved = 1`,
      [product.id]
    ),
  ]);

  // Related items: same primary category, excluding this product.
  const relatedRows = await query(
    `${PRODUCT_SELECT}
      WHERE p.is_active = 1 AND p.id <> ?
        AND EXISTS (SELECT 1 FROM product_categories pc
                     JOIN product_categories mine ON mine.category_id = pc.category_id
                    WHERE mine.product_id = ? AND pc.product_id = p.id)
      ORDER BY p.rating_avg DESC, p.id DESC
      LIMIT 8`,
    [product.id, product.id]
  );

  return {
    ...product,
    categories: categoryRows.map((c) => ({
      id: Number(c.id),
      name_ar: c.name_ar,
      slug: c.slug,
      parent_id: c.parent_id === null ? null : Number(c.parent_id),
    })),
    reviews_summary: {
      total: Number(reviewAgg?.total || 0),
      avg_rating: reviewAgg?.avg_rating === null || reviewAgg?.avg_rating === undefined
        ? 0
        : Number(Number(reviewAgg.avg_rating).toFixed(2)),
    },
    related: await attachRelations(relatedRows),
  };
};

export const getFeatured = async (limit = 8) =>
  attachRelations(
    await query(
      `${PRODUCT_SELECT} WHERE p.is_active = 1 AND p.is_featured = 1
       ORDER BY p.rating_avg DESC, p.id DESC LIMIT ?`,
      [limit]
    )
  );

export const getLoanable = async (limit = 8) =>
  attachRelations(
    await query(
      `${PRODUCT_SELECT} WHERE p.is_active = 1 AND p.is_loanable = 1
       ORDER BY p.rating_avg DESC, p.id DESC LIMIT ?`,
      [limit]
    )
  );

export const search = async (q) => {
  const limit = toInt(q.limit, 8) || 8;
  const like = `%${q.q}%`;
  const rows = await query(
    `${PRODUCT_SELECT}
      WHERE p.is_active = 1
        AND (p.name_ar LIKE ? OR p.name_en LIKE ? OR b.name_ar LIKE ? OR b.name_en LIKE ?)
      ORDER BY p.rating_count DESC, p.rating_avg DESC LIMIT ?`,
    [like, like, like, like, limit]
  );
  return attachRelations(rows);
};

/* ============================================================
   Admin mutations
   ============================================================ */

export const createProduct = async (payload, adminId) => {
  const slug = await uniqueSlug(payload.name_ar, async (candidate) =>
    Boolean(await queryOne('SELECT id FROM products WHERE slug = ?', [candidate]))
  );

  return withTransaction(async (conn) => {
    const [res] = await conn.execute(
      `INSERT INTO products
         (brand_id, name_ar, name_en, slug, description, base_price, sale_price,
          stock_quantity, is_loanable, is_featured, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.brand_id ?? null,
        payload.name_ar,
        payload.name_en ?? null,
        slug,
        payload.description ?? null,
        payload.base_price,
        payload.sale_price ?? null,
        payload.stock_quantity ?? 0,
        payload.is_loanable ? 1 : 0,
        payload.is_featured ? 1 : 0,
        payload.is_active === false ? 0 : 1,
      ]
    );
    const productId = res.insertId;

    for (const categoryId of payload.category_ids ?? []) {
      await conn.execute('INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)', [
        productId,
        categoryId,
      ]);
    }

    let colorOrder = 0;
    for (const color of payload.colors ?? []) {
      await conn.execute(
        'INSERT INTO product_colors (product_id, name_ar, name_en, hex, sort_order) VALUES (?,?,?,?,?)',
        [productId, color.name_ar, color.name_en ?? null, color.hex, colorOrder++]
      );
    }

    let imageOrder = 0;
    for (const imagePath of payload.images ?? []) {
      await conn.execute(
        'INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?,?,?,?)',
        [productId, imagePath, imageOrder === 0 ? 1 : 0, imageOrder]
      );
      imageOrder += 1;
    }

    if (payload.sale_price) {
      await conn.execute(
        'INSERT INTO price_history (product_id, old_price, new_price, changed_by, reason) VALUES (?,?,?,?,?)',
        [productId, payload.base_price, payload.sale_price, adminId ?? null, 'عند الإنشاء']
      );
    }

    return { id: productId, slug };
  });
};

export const updateProduct = async (id, payload, adminId) => {
  const current = await queryOne(
    'SELECT id, base_price, sale_price FROM products WHERE id = ?',
    [id]
  );
  if (!current) throw ApiError.notFound('المنتج غير موجود');

  await withTransaction(async (conn) => {
    const sets = [];
    const values = [];
    for (const key of [
      'brand_id',
      'name_ar',
      'name_en',
      'description',
      'base_price',
      'sale_price',
      'stock_quantity',
      'is_loanable',
      'is_featured',
      'is_active',
    ]) {
      if (payload[key] === undefined) continue;
      sets.push(`${key} = ?`);
      values.push(typeof payload[key] === 'boolean' ? (payload[key] ? 1 : 0) : payload[key]);
    }

    if (sets.length) {
      await conn.execute(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
    }

    // Price change -> log history
    const newBase = payload.base_price ?? Number(current.base_price);
    const newSale = payload.sale_price === undefined ? current.sale_price : payload.sale_price;
    const oldEff = Number(current.sale_price ?? current.base_price);
    const newEff = Number(newSale ?? newBase);
    if (oldEff !== newEff) {
      await conn.execute(
        'INSERT INTO price_history (product_id, old_price, new_price, changed_by, reason) VALUES (?,?,?,?,?)',
        [id, oldEff, newEff, adminId ?? null, payload.reason ?? 'تحديث يدوي']
      );
    }

    if (Array.isArray(payload.category_ids)) {
      await conn.execute('DELETE FROM product_categories WHERE product_id = ?', [id]);
      for (const categoryId of payload.category_ids) {
        await conn.execute('INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)', [
          id,
          categoryId,
        ]);
      }
    }

    if (Array.isArray(payload.colors)) {
      await conn.execute('DELETE FROM product_colors WHERE product_id = ?', [id]);
      let order = 0;
      for (const color of payload.colors) {
        await conn.execute(
          'INSERT INTO product_colors (product_id, name_ar, name_en, hex, sort_order) VALUES (?,?,?,?,?)',
          [id, color.name_ar, color.name_en ?? null, color.hex, order++]
        );
      }
    }

    if (Array.isArray(payload.images)) {
      await conn.execute('DELETE FROM product_images WHERE product_id = ?', [id]);
      let order = 0;
      for (const imagePath of payload.images) {
        await conn.execute(
          'INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?,?,?,?)',
          [id, imagePath, order === 0 ? 1 : 0, order++]
        );
      }
    }
  });

  return getProductByIdOrThrow(id);
};

const getProductByIdOrThrow = async (id) => {
  const row = await queryOne(`${PRODUCT_SELECT} WHERE p.id = ? LIMIT 1`, [id]);
  if (!row) throw ApiError.notFound('المنتج غير موجود');
  const [product] = await attachRelations([row]);
  // The admin editor needs the junction rows to pre-check the categories.
  const catRows = await query('SELECT category_id FROM product_categories WHERE product_id = ?', [id]);
  product.category_ids = catRows.map((r) => Number(r.category_id));
  return product;
};

export const getProductById = getProductByIdOrThrow;

export const deleteProduct = async (id) => {
  const row = await queryOne('SELECT id FROM products WHERE id = ?', [id]);
  if (!row) throw ApiError.notFound('المنتج غير موجود');
  await query('DELETE FROM products WHERE id = ?', [id]);
};

export const getPriceHistory = async (productId) => {
  const exists = await queryOne('SELECT id FROM products WHERE id = ?', [productId]);
  if (!exists) throw ApiError.notFound('المنتج غير موجود');
  const rows = await query(
    `SELECT ph.id, ph.old_price, ph.new_price, ph.reason, ph.changed_at,
            a.full_name AS changed_by_name
       FROM price_history ph
       LEFT JOIN admins a ON a.id = ph.changed_by
      WHERE ph.product_id = ?
      ORDER BY ph.changed_at DESC, ph.id DESC`,
    [productId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    old_price: r.old_price === null ? null : money(r.old_price),
    new_price: money(r.new_price),
    reason: r.reason,
    changed_by_name: r.changed_by_name,
    changed_at: r.changed_at,
  }));
};

export { buildProductWhere, attachRelations, PRODUCT_SELECT, resolveCategoryIds, placeholders };
