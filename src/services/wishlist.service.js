import { query, queryOne } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { money } from '../utils/query.js';

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

export const listWishlist = async (customerId) => {
  const rows = await query(
    `SELECT w.id, w.created_at, p.id AS product_id, p.name_ar, p.slug,
            p.stock_quantity, p.is_loanable,
            COALESCE(p.sale_price, p.base_price) AS price,
            (SELECT image_path FROM product_images pi
              WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1) AS image
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
      WHERE w.customer_id = ? AND p.is_active = 1
      ORDER BY w.id DESC`,
    [customerId]
  );

  const items = rows.map((r) => ({
    id: Number(r.id),
    product_id: Number(r.product_id),
    name_ar: r.name_ar,
    slug: r.slug,
    image: r.image,
    price: money(r.price),
    in_stock: Number(r.stock_quantity) > 0,
    is_loanable: Boolean(r.is_loanable),
    added_at: r.created_at,
  }));

  return {
    items,
    summary: { count: items.length, total_value: money(items.reduce((s, i) => s + i.price, 0)) },
  };
};

export const addToWishlist = async (customerId, productId) => {
  const product = await queryOne('SELECT id, is_active FROM products WHERE id = ?', [productId]);
  if (!product || !product.is_active) throw ApiError.notFound('المنتج غير موجود');

  // INSERT IGNORE keeps this idempotent - re-liking is a no-op, not an error.
  await query('INSERT IGNORE INTO wishlist_items (customer_id, product_id) VALUES (?, ?)', [customerId, productId]);
  return { product_id: Number(productId), in_wishlist: true };
};

export const removeFromWishlist = async (customerId, productId) => {
  const result = await query('DELETE FROM wishlist_items WHERE customer_id = ? AND product_id = ?', [
    customerId,
    productId,
  ]);
  if (!result.affectedRows) throw ApiError.notFound('المنتج غير موجود في المفضلة');
  return { product_id: Number(productId), in_wishlist: false };
};

/** Flips membership and reports the resulting state. */
export const toggleWishlist = async (customerId, productId) => {
  const existing = await queryOne('SELECT id FROM wishlist_items WHERE customer_id = ? AND product_id = ?', [
    customerId,
    productId,
  ]);
  if (existing) {
    await query('DELETE FROM wishlist_items WHERE id = ?', [existing.id]);
    return { product_id: Number(productId), in_wishlist: false };
  }
  return addToWishlist(customerId, productId);
};

export const isWishlisted = async (customerId, productIds) => {
  if (!productIds.length) return [];
  const rows = await query(
    `SELECT product_id FROM wishlist_items
      WHERE customer_id = ? AND product_id IN (${placeholders(productIds.length)})`,
    [customerId, ...productIds]
  );
  return rows.map((r) => Number(r.product_id));
};
