import { query, queryOne, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';
import { money } from '../utils/query.js';

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

/**
 * Gets (or lazily creates) the single cart row for a customer.
 * Pass `conn` when called inside a transaction so the read/insert participate
 * in it - on a different pooled connection the new row is invisible and two
 * concurrent callers can each create a separate cart.
 */
const getOrCreateCart = async (customerId, conn) => {
  if (conn) {
    const [existingRows] = await conn.execute('SELECT id FROM cart_items WHERE customer_id = ?', [customerId]);
    if (existingRows[0]) return Number(existingRows[0].id);
    const [insertResult] = await conn.execute('INSERT INTO cart_items (customer_id) VALUES (?)', [customerId]);
    return insertResult.insertId;
  }
  const existing = await queryOne('SELECT id FROM cart_items WHERE customer_id = ?', [customerId]);
  if (existing) return Number(existing.id);
  const result = await query('INSERT INTO cart_items (customer_id) VALUES (?)', [customerId]);
  return result.insertId;
};

const activePrice = 'COALESCE(p.sale_price, p.base_price)';

/**
 * Builds the cart payload. `conn` must be supplied when called inside an open
 * transaction, otherwise uncommitted cart_product rows are not yet visible and
 * the caller gets a stale cart back.
 */
const buildCart = async (cartId, conn) => {
  const rows = conn
    ? (await conn.execute(
        `SELECT cp.id, cp.product_id, cp.amount, cp.price AS locked_price,
                p.name_ar, p.name_en, p.slug, p.stock_quantity, p.is_active, p.is_loanable,
                ${activePrice} AS current_price,
                (SELECT image_path FROM product_images pi
                  WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1) AS image
           FROM cart_product cp
           JOIN products p ON p.id = cp.product_id
          WHERE cp.cart_item_id = ?
          ORDER BY cp.id DESC`,
        [cartId]
      ))[0]
    : await query(
        `SELECT cp.id, cp.product_id, cp.amount, cp.price AS locked_price,
                p.name_ar, p.name_en, p.slug, p.stock_quantity, p.is_active, p.is_loanable,
                ${activePrice} AS current_price,
                (SELECT image_path FROM product_images pi
                  WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order, pi.id LIMIT 1) AS image
           FROM cart_product cp
           JOIN products p ON p.id = cp.product_id
          WHERE cp.cart_item_id = ?
          ORDER BY cp.id DESC`,
        [cartId]
      );

  const items = rows.map((r) => {
    const currentPrice = money(r.current_price);
    const qty = Number(r.amount);
    const lineTotal = money(currentPrice * qty);
    return {
      id: Number(r.id),
      product_id: Number(r.product_id),
      name_ar: r.name_ar,
      name_en: r.name_en,
      slug: r.slug,
      image: r.image,
      amount: qty,
      unit_price: currentPrice,
      price_changed: money(r.locked_price) !== currentPrice,
      added_price: money(r.locked_price),
      line_total: lineTotal,
      stock_quantity: Number(r.stock_quantity),
      in_stock: Number(r.stock_quantity) > 0,
      available: r.is_active ? Number(r.stock_quantity) > 0 : false,
      is_loanable: Boolean(r.is_loanable),
    };
  });

  // Summaries use live prices so the cart never shows a stale total.
  const subtotal = money(items.reduce((sum, i) => sum + i.line_total, 0));
  const unavailableCount = items.filter((i) => !i.available).length;
  // Savings = drop between the price captured at add-time and now.
  const savings = money(
    Math.max(
      0,
      items.reduce((sum, i) => sum + (i.added_price - i.unit_price) * i.amount, 0)
    )
  );

  const shipping =
    subtotal === 0 || subtotal >= config.store.freeShippingThreshold ? 0 : money(config.store.shippingFlatRate);
  const tax = money(subtotal * config.store.taxRate);
  const total = money(subtotal + shipping + tax);

  return {
    id: Number(cartId),
    items,
    summary: {
      item_count: items.length,
      total_quantity: items.reduce((s, i) => s + i.amount, 0),
      subtotal,
      savings,
      shipping,
      tax: money(tax),
      tax_rate: config.store.taxRate,
      total,
      currency: config.store.currency,
      free_shipping_threshold: config.store.freeShippingThreshold,
      free_shipping_remaining: money(Math.max(0, config.store.freeShippingThreshold - subtotal)),
      unavailable_count: unavailableCount,
    },
  };
};

export const getCart = async (customerId) => {
  const cartId = await getOrCreateCart(customerId);
  return buildCart(cartId);
};

export const addToCart = async (customerId, { product_id, amount }) => {
  const product = await queryOne(
    'SELECT id, stock_quantity, is_active FROM products WHERE id = ?',
    [product_id]
  );
  if (!product || !product.is_active) throw ApiError.notFound('المنتج غير موجود');

  const stock = Number(product.stock_quantity);
  if (stock <= 0) throw ApiError.badRequest('المنتج غير متوفر في المخزون');

  return withTransaction(async (conn) => {
    const cartId = await getOrCreateCart(customerId, conn);
    const [existingRows] = await conn.execute(
      'SELECT id, amount FROM cart_product WHERE cart_item_id = ? AND product_id = ? FOR UPDATE',
      [cartId, product_id]
    );

    const requested = Number(amount) + (existingRows[0] ? Number(existingRows[0].amount) : 0);
    if (requested > stock) {
      throw ApiError.badRequest(`الكمية المتاحة ${stock} فقط`);
    }

    if (existingRows[0]) {
      await conn.execute('UPDATE cart_product SET amount = ? WHERE id = ?', [requested, existingRows[0].id]);
    } else {
      // Snapshot the price at add-time; the cart recalculates from live prices.
      // Table must be aliased `p` because activePrice references p.sale_price.
      const [priceRows] = await conn.execute(
        `SELECT ${activePrice} AS price_at_add FROM products p WHERE p.id = ?`,
        [product_id]
      );
      await conn.execute(
        'INSERT INTO cart_product (cart_item_id, product_id, amount, price) VALUES (?,?,?,?)',
        [cartId, product_id, amount, priceRows[0].price_at_add]
      );
    }

    return buildCart(cartId, conn);
  });
};

export const updateCartItem = async (customerId, { product_id, amount }) => {
  const cartId = await getOrCreateCart(customerId);
  const existing = await queryOne(
    'SELECT id, amount FROM cart_product WHERE cart_item_id = ? AND product_id = ?',
    [cartId, product_id]
  );
  if (!existing) throw ApiError.notFound('المنتج غير موجود في السلة');

  if (Number(amount) === 0) {
    await query('DELETE FROM cart_product WHERE id = ?', [existing.id]);
    return buildCart(cartId);
  }

  const stock = await queryOne('SELECT stock_quantity FROM products WHERE id = ?', [product_id]);
  const available = Number(stock?.stock_quantity || 0);
  if (Number(amount) > available) {
    throw ApiError.badRequest(`الكمية المتاحة ${available} فقط`);
  }

  await query('UPDATE cart_product SET amount = ? WHERE id = ?', [amount, existing.id]);
  return buildCart(cartId);
};

export const removeFromCart = async (customerId, productId) => {
  const cartId = await getOrCreateCart(customerId);
  await query('DELETE FROM cart_product WHERE cart_item_id = ? AND product_id = ?', [cartId, productId]);
  return buildCart(cartId);
};

export const clearCart = async (customerId) => {
  const cartId = await getOrCreateCart(customerId);
  await query('DELETE FROM cart_product WHERE cart_item_id = ?', [cartId]);
  return buildCart(cartId);
};

/** Merge key = product_id + preferred color, matching the sidebar color filter. */
export const addMany = async (customerId, entries) => {
  const productIds = entries.map((e) => e.product_id);
  if (!productIds.length) return getCart(customerId);

  const products = await query(
    `SELECT id, stock_quantity, is_active, ${activePrice} AS price
       FROM products WHERE id IN (${placeholders(productIds.length)})`,
    productIds
  );
  const map = new Map(products.map((p) => [Number(p.id), p]));

  for (const entry of entries) {
    const product = map.get(entry.product_id);
    if (!product || !product.is_active) throw ApiError.notFound(`المنتج ${entry.product_id} غير موجود`);
    if (Number(product.stock_quantity) <= 0) throw ApiError.badRequest('أحد المنتجات غير متوفر');
  }

  return withTransaction(async (conn) => {
    const cartId = await getOrCreateCart(customerId, conn);
    for (const entry of entries) {
      const product = map.get(entry.product_id);
      const [rows] = await conn.execute(
        'SELECT id, amount FROM cart_product WHERE cart_item_id = ? AND product_id = ? FOR UPDATE',
        [cartId, entry.product_id]
      );
      const current = rows[0] ? Number(rows[0].amount) : 0;
      const next = Math.min(current + Number(entry.amount), Number(product.stock_quantity));
      if (next <= 0) continue;

      if (rows[0]) {
        await conn.execute('UPDATE cart_product SET amount = ? WHERE id = ?', [next, rows[0].id]);
      } else {
        await conn.execute(
          'INSERT INTO cart_product (cart_item_id, product_id, amount, price) VALUES (?,?,?,?)',
          [cartId, entry.product_id, next, product.price]
        );
      }
    }
    return buildCart(cartId, conn);
  });
};
