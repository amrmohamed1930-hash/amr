import { query, queryOne, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildMeta } from '../utils/query.js';

/**
 * Recomputes denormalised rating columns after any review change.
 *
 * `conn` must be the caller's transaction connection. Running this on the
 * pool instead would deadlock: the open transaction already holds a lock on
 * the product row that a second connection cannot touch (ER_LOCK_WAIT_TIMEOUT).
 */
const refreshProductRating = async (conn, productId) => {
  const [[agg]] = await conn.execute(
    `SELECT COUNT(*) AS total, AVG(rating) AS avg_rating
       FROM reviews WHERE product_id = ? AND is_approved = 1`,
    [productId]
  );
  const total = Number(agg?.total || 0);
  const avg = total > 0 ? Number(Number(agg.avg_rating).toFixed(2)) : 0;
  await conn.execute('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?', [avg, total, productId]);
  return { total, avg };
};

export const createReview = async (customerId, { product_id, rating, title, comment }) => {
  const product = await queryOne('SELECT id, is_active FROM products WHERE id = ?', [product_id]);
  if (!product || !product.is_active) throw ApiError.notFound('المنتج غير موجود');

  const owned = await queryOne(
    `SELECT oi.id FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_id = ? AND oi.product_id = ? AND o.status = 'delivered'
      LIMIT 1`,
    [customerId, product_id]
  );

  return withTransaction(async (conn) => {
    const [existing] = await conn.execute(
      'SELECT id FROM reviews WHERE product_id = ? AND customer_id = ? FOR UPDATE',
      [product_id, customerId]
    );
    if (existing[0]) {
      throw ApiError.conflict('لقد قيّمت هذا المنتج مسبقاً، يمكنك تعديل تقييمك');
    }

    const [result] = await conn.execute(
      'INSERT INTO reviews (product_id, customer_id, rating, title, comment) VALUES (?,?,?,?,?)',
      [product_id, customerId, rating, title ?? null, comment ?? null]
    );

    const summary = await refreshProductRating(conn, product_id);
    const [[row]] = await conn.execute('SELECT id, created_at FROM reviews WHERE id = ?', [result.insertId]);
    const { id, created_at } = row;

    return {
      id: Number(id),
      product_id: Number(product_id),
      customer_id: Number(customerId),
      rating,
      title: title ?? null,
      comment: comment ?? null,
      is_verified_purchase: Boolean(owned),
      created_at,
      product_rating: summary,
    };
  });
};

export const updateMyReview = async (customerId, reviewId, patch) => {
  const existing = await queryOne('SELECT id, product_id FROM reviews WHERE id = ? AND customer_id = ?', [
    reviewId,
    customerId,
  ]);
  if (!existing) throw ApiError.notFound('التقييم غير موجود');

  const sets = [];
  const values = [];
  for (const key of ['rating', 'title', 'comment']) {
    if (patch[key] === undefined) continue;
    sets.push(`${key} = ?`);
    values.push(patch[key]);
  }

  // Read-modify-write plus the rating recompute must be atomic, otherwise two
  // concurrent updates can each write a stale average.
  return withTransaction(async (conn) => {
    if (sets.length) {
      await conn.execute(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, [...values, reviewId]);
    }
    const summary = await refreshProductRating(conn, existing.product_id);
    return { id: Number(reviewId), product_id: Number(existing.product_id), product_rating: summary };
  });
};

export const deleteMyReview = async (customerId, reviewId) => {
  const existing = await queryOne('SELECT id, product_id FROM reviews WHERE id = ? AND customer_id = ?', [
    reviewId,
    customerId,
  ]);
  if (!existing) throw ApiError.notFound('التقييم غير موجود');

  return withTransaction(async (conn) => {
    await conn.execute('DELETE FROM reviews WHERE id = ?', [reviewId]);
    return refreshProductRating(conn, existing.product_id);
  });
};

export const listProductReviews = async (productId, q) => {
  const exists = await queryOne('SELECT id FROM products WHERE id = ?', [productId]);
  if (!exists) throw ApiError.notFound('المنتج غير موجود');

  const page = parsePagination({ page: q.page, limit: q.limit });
  const where = ['r.product_id = ?', 'r.is_approved = 1'];
  const params = [productId];

  if (q.rating) {
    where.push('r.rating = ?');
    params.push(q.rating);
  }

  const whereSql = where.join(' AND ');
  const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM reviews r WHERE ${whereSql}`, params);
  const total = Number(totalRow?.total || 0);

  const rows = await query(
    `SELECT r.id, r.rating, r.title, r.comment, r.created_at,
            c.id AS customer_id, c.full_name AS customer_name,
            EXISTS (SELECT 1 FROM order_items oi
                      JOIN orders o ON o.id = oi.order_id
                     WHERE o.customer_id = r.customer_id AND oi.product_id = r.product_id
                       AND o.status = 'delivered') AS verified
       FROM reviews r
       JOIN customers c ON c.id = r.customer_id
      WHERE ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );

  const distribution = await query(
    `SELECT rating, COUNT(*) AS count FROM reviews
      WHERE product_id = ? AND is_approved = 1 GROUP BY rating ORDER BY rating DESC`,
    [productId]
  );

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distribution) dist[row.rating] = Number(row.count);

  return {
    data: rows.map((r) => ({
      id: Number(r.id),
      rating: Number(r.rating),
      title: r.title,
      comment: r.comment,
      customer: { id: Number(r.customer_id), name: r.customer_name },
      is_verified_purchase: Boolean(r.verified),
      created_at: r.created_at,
    })),
    meta: buildMeta(page, total),
    distribution: dist,
  };
};

/** Rating histogram used by the sidebar rating filter. */
export const ratingBreakdown = async (productId) => {
  const rows = await query(
    'SELECT rating, COUNT(*) AS count FROM reviews WHERE product_id = ? AND is_approved = 1 GROUP BY rating',
    [productId]
  );
  return Object.fromEntries(rows.map((r) => [Number(r.rating), Number(r.count)]));
};
