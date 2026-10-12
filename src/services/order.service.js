import { query, queryOne, withTransaction } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { config } from '../config/env.js';
import { money, parsePagination, buildMeta } from '../utils/query.js';

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');
const activePrice = 'COALESCE(p.sale_price, p.base_price)';

const generateOrderNumber = () => {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, '0');
  return `WTN-${stamp}-${rand}`;
};

const shapeOrder = (row, items) => ({
  id: Number(row.id),
  order_number: row.order_number,
  customer_id: Number(row.customer_id),
  status: row.status,
  subtotal: money(row.subtotal),
  discount: money(row.discount),
  shipping: money(row.shipping),
  total: money(row.total),
  currency: row.currency,
  payment_method: row.payment_method,
  loan_requested: Boolean(row.loan_requested),
  shipping_details: {
    name: row.shipping_name,
    phone: row.shipping_phone,
    city: row.shipping_city,
    address: row.shipping_address,
  },
  notes: row.notes,
  placed_at: row.placed_at,
  updated_at: row.updated_at,
  ...(items ? { items } : {}),
});

/**
 * Groups order_items by order_id. Pass `conn` when called inside an open
 * transaction, otherwise the just-inserted items are not yet committed and
 * invisible on another pooled connection.
 */
const loadItems = async (orderIds, conn) => {
  if (!orderIds.length) return new Map();
  const sql = `SELECT id, order_id, product_id, product_name, unit_price, quantity, line_total
       FROM order_items WHERE order_id IN (${placeholders(orderIds.length)}) ORDER BY id`;
  const rows = conn ? (await conn.execute(sql, orderIds))[0] : await query(sql, orderIds);
  const map = new Map();
  for (const r of rows) {
    const key = Number(r.order_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: Number(r.id),
      product_id: r.product_id === null ? null : Number(r.product_id),
      product_name: r.product_name,
      unit_price: money(r.unit_price),
      quantity: Number(r.quantity),
      line_total: money(r.line_total),
    });
  }
  return map;
};

const ORDER_SELECT = `
  SELECT o.*, c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
    FROM orders o
    JOIN customers c ON c.id = o.customer_id`;

/**
 * Converts the cart (or an explicit item list) into an order.
 * Re-validates price and stock at commit time inside the transaction so
 * concurrent checkouts cannot oversell or lock in a stale price.
 */
export const createOrder = async (customerId, payload) => {
  const requested = payload.items
    ? payload.items.map((i) => ({ product_id: i.product_id, amount: i.amount }))
    : null;

  return withTransaction(async (conn) => {
    // 1. Lock the cart row so parallel checkouts serialise.
    const [cartRows] = await conn.execute('SELECT id FROM cart_items WHERE customer_id = ? FOR UPDATE', [customerId]);
    if (!cartRows[0]) {
      if (!requested) throw ApiError.badRequest('السلة فارغة');
    }
    const cartId = cartRows[0] ? Number(cartRows[0].id) : null;

    // 2. Resolve the lines to order.
    let lines;
    if (requested) {
      lines = requested;
    } else {
      const [cp] = await conn.execute('SELECT product_id, amount FROM cart_product WHERE cart_item_id = ?', [cartId]);
      if (!cp.length) throw ApiError.badRequest('السلة فارغة');
      lines = cp.map((r) => ({ product_id: Number(r.product_id), amount: Number(r.amount) }));
    }

    if (!lines.length) throw ApiError.badRequest('لا توجد منتجات للطلب');

    // 3. Lock every product row and validate price + stock.
    // Alias `p` because activePrice references p.sale_price.
    const ids = lines.map((l) => l.product_id);
    const [productRows] = await conn.execute(
      `SELECT p.id, p.name_ar, p.stock_quantity, p.is_active, p.is_loanable, ${activePrice} AS price
         FROM products p WHERE p.id IN (${placeholders(ids.length)}) FOR UPDATE`,
      ids
    );
    const map = new Map(productRows.map((p) => [Number(p.id), p]));
    if (map.size !== new Set(ids).size) throw ApiError.notFound('أحد المنتجات غير موجود');

    let subtotal = 0;
    const priced = [];
    for (const line of lines) {
      const product = map.get(Number(line.product_id));
      if (!product.is_active) throw ApiError.badRequest(`المنتج "${product.name_ar}" غير متاح حالياً`);
      const stock = Number(product.stock_quantity);
      if (stock < line.amount) {
        throw ApiError.badRequest(`الكمية المتاحة من "${product.name_ar}" هي ${stock} فقط`);
      }
      const unitPrice = money(product.price);
      subtotal = money(subtotal + unitPrice * line.amount);
      priced.push({ product: map.get(Number(line.product_id)), unitPrice, amount: line.amount });
    }

    const shipping = subtotal >= config.store.freeShippingThreshold ? 0 : money(config.store.shippingFlatRate);
    const tax = money(subtotal * config.store.taxRate);
    const total = money(subtotal + shipping + tax);

    // 4. Insert the order.
    const orderNumber = generateOrderNumber();
    const [orderResult] = await conn.execute(
      `INSERT INTO orders
         (order_number, customer_id, subtotal, shipping, total, currency,
          payment_method, loan_requested,
          shipping_name, shipping_phone, shipping_city, shipping_address, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orderNumber,
        customerId,
        subtotal,
        shipping,
        total,
        config.store.currency,
        payload.payment_method,
        payload.loan_requested ? 1 : 0,
        payload.shipping_name ?? null,
        payload.shipping_phone ?? null,
        payload.shipping_city ?? null,
        payload.shipping_address ?? null,
        payload.notes ?? null,
      ]
    );
    const orderId = orderResult.insertId;

    // 5. Insert line items and decrement stock.
    for (const line of priced) {
      await conn.execute(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES (?,?,?,?,?,?)`,
        [orderId, line.product.id, line.product.name_ar, line.unitPrice, line.amount, money(line.unitPrice * line.amount)]
      );
      await conn.execute('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [
        line.amount,
        line.product.id,
      ]);
    }

    // 6. Clear the cart only when the order came from the cart.
    if (cartId && !requested) {
      await conn.execute('DELETE FROM cart_product WHERE cart_item_id = ?', [cartId]);
    }

    // conn.execute resolves to [rows, fields], so the row needs a second destructure.
    const [orderRows] = await conn.execute(`${ORDER_SELECT} WHERE o.id = ?`, [orderId]);
    const itemsMap = await loadItems([orderId], conn);

    return shapeOrder(orderRows[0], itemsMap.get(Number(orderId)) || []);
  });
};

export const listMyOrders = async (customerId, q) => {
  const page = parsePagination(q);
  const where = ['o.customer_id = ?'];
  const params = [customerId];
  if (q.status) {
    where.push('o.status = ?');
    params.push(q.status);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM orders o WHERE ${whereSql}`, params);
  const total = Number(totalRow?.total || 0);

  const rows = await query(
    `${ORDER_SELECT} WHERE ${whereSql} ORDER BY o.placed_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );
  const itemsMap = await loadItems(rows.map((r) => Number(r.id)));

  return {
    data: rows.map((r) => shapeOrder(r, itemsMap.get(Number(r.id)) || [])),
    meta: buildMeta(page, total),
  };
};

export const getMyOrder = async (customerId, orderId) => {
  const row = await queryOne(`${ORDER_SELECT} WHERE o.id = ? AND o.customer_id = ?`, [orderId, customerId]);
  if (!row) throw ApiError.notFound('الطلب غير موجود');
  const itemsMap = await loadItems([orderId]);
  return shapeOrder(row, itemsMap.get(Number(orderId)) || []);
};

export const cancelMyOrder = async (customerId, orderId) => {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute(
      'SELECT id, status FROM orders WHERE id = ? AND customer_id = ? FOR UPDATE',
      [orderId, customerId]
    );
    const order = rows[0];
    if (!order) throw ApiError.notFound('الطلب غير موجود');

    const cancellable = ['pending', 'confirmed', 'processing'];
    if (!cancellable.includes(order.status)) {
      throw ApiError.badRequest('لا يمكن إلغاء الطلب في هذه الحالة');
    }

    // Return the reserved stock to inventory.
    const [items] = await conn.execute('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
    for (const item of items) {
      if (item.product_id) {
        await conn.execute('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [
          item.quantity,
          item.product_id,
        ]);
      }
    }

    await conn.execute('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId]);
    return { id: Number(orderId), status: 'cancelled' };
  });
};

/* ---------------- admin ---------------- */

export const listAllOrders = async (q) => {
  const page = parsePagination(q);
  const where = [];
  const params = [];
  if (q.status) {
    where.push('o.status = ?');
    params.push(q.status);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRow = await queryOne(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  const total = Number(totalRow?.total || 0);

  const rows = await query(
    `${ORDER_SELECT} ${whereSql} ORDER BY o.placed_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, page.limit, page.offset]
  );
  const itemsMap = await loadItems(rows.map((r) => Number(r.id)));

  return {
    data: rows.map((r) => ({
      ...shapeOrder(r, itemsMap.get(Number(r.id)) || []),
      customer: {
        id: Number(r.customer_id),
        name: r.customer_name,
        email: r.customer_email,
        phone: r.customer_phone,
      },
    })),
    meta: buildMeta(page, total),
  };
};

export const updateOrderStatus = async (orderId, status) => {
  const row = await queryOne('SELECT id, status FROM orders WHERE id = ?', [orderId]);
  if (!row) throw ApiError.notFound('الطلب غير موجود');
  if (row.status === status) return { id: Number(orderId), status };
  await query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
  return { id: Number(orderId), status };
};

export const getDashboardStats = async () => {
  const [products, orders, customers, revenue, loans, topSellers] = await Promise.all([
    queryOne('SELECT COUNT(*) AS c FROM products WHERE is_active = 1'),
    queryOne("SELECT COUNT(*) AS c FROM orders WHERE status <> 'cancelled'"),
    queryOne('SELECT COUNT(*) AS c FROM customers WHERE is_active = 1'),
    queryOne("SELECT COALESCE(SUM(total), 0) AS s FROM orders WHERE status IN ('confirmed','processing','shipped','delivered')"),
    queryOne("SELECT COUNT(*) AS c FROM orders WHERE loan_requested = 1 AND status <> 'cancelled'"),
    query(
      `SELECT p.id, p.name_ar, p.slug, SUM(oi.quantity) AS sold, SUM(oi.line_total) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
         JOIN products p ON p.id = oi.product_id
        GROUP BY p.id, p.name_ar, p.slug
        ORDER BY sold DESC LIMIT 5`
    ),
  ]);

  return {
    products: Number(products.c),
    orders: Number(orders.c),
    customers: Number(customers.c),
    revenue: money(revenue.s),
    loan_orders: Number(loans.c),
    top_sellers: topSellers.map((t) => ({
      product_id: Number(t.id),
      name_ar: t.name_ar,
      slug: t.slug,
      units_sold: Number(t.sold),
      revenue: money(t.revenue),
    })),
  };
};
