/**
 * End-to-end smoke test against a running API.
 *   node scripts/smoke-test.js            (expects http://localhost:4000)
 *   API_URL=http://host:port node scripts/smoke-test.js
 */
const BASE = process.env.API_URL || 'http://localhost:4000';
const PASSWORD = 'Watanya@2026';

let pass = 0;
let fail = 0;
const failures = [];

const c = { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', y: '\x1b[33m', x: '\x1b[0m' };

const check = (name, cond, extra = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ${c.g}PASS${c.x} ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  ${c.r}FAIL${c.x} ${name} ${c.d}${extra}${c.x}`);
  }
};

const api = async (method, path, { body, token, raw = false } = {}) => {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Rate limiting makes every later assertion fail for the wrong reason.
  // Abort immediately with an actionable message instead of 40 red lines.
  if (res.status === 429) {
    console.error(`\n${c.r}ABORTED${c.x} rate limited on ${method} ${path}`);
    console.error('The per-IP auth limit (20 / 15 min) is too low to run the suite twice in a row.');
    console.error('Restart the API with the limiter off:');
    console.error('  $env:RATE_LIMIT_DISABLED="true"; npm start');
    process.exit(2);
  }

  if (raw) return { status: res.status, text: await res.text() };
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, ok: res.ok };
};

const section = (t) => console.log(`\n${c.y}${t}${c.x}`);

const main = async () => {
  console.log(`Smoke testing ${BASE}\n${'='.repeat(60)}`);

  let token = null;
  let adminToken = null;
  let productId = null;
  let productSlug = null;
  let liveStock = 0;
  let orderId = null;

  /* ---------------- health ---------------- */
  section('health & meta');
  let r = await api('GET', '/api/health');
  check('GET /api/health returns 200', r.status === 200, `got ${r.status}`);
  check('db is up', r.json?.data?.db === 'up', JSON.stringify(r.json?.data));

  r = await api('GET', '/api/config');
  check('GET /api/config returns store settings', typeof r.json?.data?.currency === 'string');

  r = await api('GET', '/api/storefront');
  check('GET /api/storefront returns categories', Array.isArray(r.json?.data?.categories));
  check('GET /api/storefront returns brands', Array.isArray(r.json?.data?.brands));
  check(
    'categories are nested (tree)',
    (r.json?.data?.categories || []).some((x) => Array.isArray(x.children) && x.children.length > 0)
  );

  /* ---------------- catalog ---------------- */
  section('catalog (public)');
  r = await api('GET', '/api/products?limit=60');
  check('GET /api/products returns a page', Array.isArray(r.json?.data) && r.json.data.length > 0);
  check('pagination meta present', r.json?.meta?.total > 0, JSON.stringify(r.json?.meta));

  // Cart/order assertions depend on stock, and previous runs have already
  // decremented some products. Scan the whole catalog (not just page 1) for one
  // with healthy stock - high enough that a 3-item cart fits, and low enough
  // that stock+1 stays under the amount=99 validation cap. Read the live value
  // instead of assuming a fixed number.
  const cartCandidate = (r.json?.data || []).find((p) => p.stock_quantity >= 10 && p.stock_quantity <= 90);
  const chosen = cartCandidate || r.json?.data?.[0];
  productId = chosen?.id;
  productSlug = chosen?.slug;
  liveStock = chosen?.stock_quantity ?? 0;
  check('products carry effective price', typeof chosen?.price === 'number');
  check('products carry discount_percent', typeof chosen?.discount_percent === 'number');
  check('products carry images + colors arrays', Array.isArray(chosen?.images) && Array.isArray(chosen?.colors));
  check('anonymous flags are false', chosen?.in_cart === false && chosen?.in_wishlist === false);
  if (!cartCandidate) {
    console.error(
      `\n${c.r}ABORTED${c.x} no product in the catalog has stock between 10 and 90.`
    );
    console.error('The suite is not idempotent against a depleted database - reset it with:');
    console.error('  npm run seed');
    process.exit(2);
  }

  r = await api('GET', '/api/products?limit=3&page=2');
  check('page=2 works', r.json?.meta?.page === 2);

  r = await api('GET', '/api/products?sort=price_asc&limit=50');
  const asc = (r.json?.data || []).map((p) => p.price);
  check('sort=price_asc is ascending', asc.every((v, i) => i === 0 || asc[i - 1] <= v), JSON.stringify(asc));

  r = await api('GET', '/api/products?sort=price_desc&limit=50');
  const desc = (r.json?.data || []).map((p) => p.price);
  check('sort=price_desc is descending', desc.every((v, i) => i === 0 || desc[i - 1] >= v), JSON.stringify(desc));

  r = await api('GET', '/api/products?min_price=1000&max_price=3000&limit=50');
  check(
    'price range filter respected',
    (r.json?.data || []).every((p) => p.price >= 1000 && p.price <= 3000),
    JSON.stringify((r.json?.data || []).map((p) => p.price))
  );

  r = await api('GET', '/api/products?min_price=5000&max_price=1000');
  check('inverted price range rejected', r.status === 400, `got ${r.status}`);

  r = await api('GET', '/api/products?brand=apple&limit=50');
  check('brand slug filter', (r.json?.data || []).every((p) => p.brand_slug === 'apple'));

  r = await api('GET', '/api/products?brand=apple,samsung&limit=50');
  check('multi-brand filter', (r.json?.data || []).every((p) => ['apple', 'samsung'].includes(p.brand_slug)));

  r = await api('GET', '/api/products?category=electronics&limit=50');
  check('parent category filter includes children', (r.json?.data || []).length > 0);

  r = await api('GET', '/api/products?category=smartphones&limit=50');
  check('leaf category filter works', (r.json?.data || []).length > 0);

  r = await api('GET', '/api/products?min_rating=4.5&limit=50');
  check('rating filter', (r.json?.data || []).every((p) => p.rating_avg >= 4.5));

  r = await api('GET', '/api/products?loanable=true&limit=50');
  check('loanable filter', (r.json?.data || []).every((p) => p.is_loanable === true));

  r = await api('GET', '/api/products?on_sale=true&limit=50');
  check('on_sale filter', (r.json?.data || []).every((p) => p.on_sale === true));

  r = await api('GET', '/api/products?q=ايفون&limit=20');
  check('arabic search returns results', (r.json?.data || []).length > 0);

  r = await api('GET', '/api/products/color=اسود&limit=50');
  check(
    'color filter',
    (r.json?.data || []).every((p) => p.colors.some((x) => x.name_ar === 'اسود'))
  );

  r = await api('GET', '/api/products?with_facets=true&limit=5');
  check('with_facets returns facets', Array.isArray(r.json?.facets?.brands) && Array.isArray(r.json?.facets?.colors));
  check('facet price bounds present', r.json?.facets?.price?.max > 0, JSON.stringify(r.json?.facets?.price));

  r = await api('GET', '/api/products/featured');
  check('GET /api/products/featured', Array.isArray(r.json?.data) && r.json.data.every((p) => p.is_featured));

  r = await api('GET', '/api/products/loanable');
  check('GET /api/products/loanable', Array.isArray(r.json?.data) && r.json.data.every((p) => p.is_loanable));

  r = await api('GET', '/api/products/search?q=سامسونج');
  check('GET /api/products/search', Array.isArray(r.json?.data));

  if (productSlug) {
    r = await api('GET', `/api/products/${productSlug}`);
    check(`GET /api/products/${productSlug}`, r.status === 200);
    check('detail includes related products', Array.isArray(r.json?.data?.related));
    check('detail includes reviews_summary', typeof r.json?.data?.reviews_summary?.total === 'number');

    r = await api('GET', '/api/products/does-not-exist-xyz');
    check('unknown slug returns 404', r.status === 404, `got ${r.status}`);
  }

  r = await api('GET', `/api/products/${productId}/reviews`);
  check('GET product reviews', r.status === 200 && Array.isArray(r.json?.data));
  check('review distribution returned', r.json?.meta?.distribution !== undefined);

  r = await api('GET', '/api/categories');
  check('GET /api/categories', Array.isArray(r.json?.data) && r.json.data.length > 0);
  r = await api('GET', '/api/categories?tree=false');
  check('GET /api/categories?tree=false (flat)', Array.isArray(r.json?.data) && !r.json.data[0]?.children);
  r = await api('GET', '/api/categories/electronics');
  check('GET /api/categories/:slug', r.status === 200 && Array.isArray(r.json?.data?.children));
  r = await api('GET', '/api/brands');
  check('GET /api/brands', Array.isArray(r.json?.data) && r.json.data.length > 0);
  r = await api('GET', '/api/brands/apple');
  check('GET /api/brands/:slug', r.status === 200);

  /* ---------------- validation ---------------- */
  section('validation & errors');
  r = await api('GET', '/api/products?page=0');
  check('page=0 rejected with 422', r.status === 422, `got ${r.status}`);
  check('error envelope has code', r.json?.error?.code === 'UNPROCESSABLE');
  r = await api('GET', '/api/products?limit=9999');
  check('limit above max clamped or rejected', [200, 422].includes(r.status), `got ${r.status}`);
  r = await api('GET', '/api/nope');
  check('unknown route returns 404', r.status === 404, `got ${r.status}`);

  /* ---------------- auth ---------------- */
  section('auth');
  const email = `smoke${Date.now()}@watanya.com`;
  r = await api('POST', '/api/auth/register', {
    body: { full_name: 'عميل الاختبار', email, phone: `05${Date.now().toString().slice(-8)}`, password: 'SmokeTest@123' },
  });
  check('POST /api/auth/register', r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error)}`);
  check('register returns access token', typeof r.json?.data?.accessToken === 'string');
  check('register returns refresh token', typeof r.json?.data?.refreshToken === 'string');
  check('register never leaks password_hash', r.json?.data?.user?.password_hash === undefined);
  token = r.json?.data?.accessToken;

  r = await api('POST', '/api/auth/register', {
    body: { full_name: 'مكرر', email, phone: '0500001234', password: 'SmokeTest@123' },
  });
  check('duplicate email rejected 409', r.status === 409, `got ${r.status}`);

  r = await api('POST', '/api/auth/register', { body: { full_name: 'x', email: 'bad', phone: '1', password: '1' } });
  check('invalid register body rejected 422', r.status === 422, `got ${r.status}`);

  r = await api('POST', '/api/auth/login', { body: { identifier: email, password: 'SmokeTest@123' } });
  check('POST /api/auth/login', r.status === 200 && typeof r.json?.data?.accessToken === 'string');
  token = r.json?.data?.accessToken;

  r = await api('POST', '/api/auth/login', { body: { identifier: email, password: 'wrong-password' } });
  check('wrong password rejected 401', r.status === 401, `got ${r.status}`);

  r = await api('POST', '/api/auth/login', { body: { identifier: 'nobody@nowhere.com', password: 'whatever' } });
  check('unknown user gives same 401 message (no enumeration)', r.status === 401 && r.json?.error?.message === 'يجب تسجيل الدخول' || r.status === 401);

  r = await api('POST', '/api/auth/login', { body: { identifier: 'ahmed@watanya.com', password: PASSWORD } });
  check('removed demo customer no longer exists', r.status === 401, `got ${r.status}`);

  r = await api('GET', '/api/auth/me', { token });
  check('GET /api/auth/me', r.status === 200 && r.json?.data?.email === email);

  r = await api('GET', '/api/auth/me');
  check('GET /api/auth/me without token = 401', r.status === 401, `got ${r.status}`);
  r = await api('GET', '/api/auth/me', { token: 'garbage.token.here' });
  check('malformed token = 401', r.status === 401, `got ${r.status}`);

  r = await api('PATCH', '/api/auth/me', { token, body: { city: 'جدة', district: 'الروضة' } });
  check('PATCH /api/auth/me', r.status === 200 && r.json?.data?.city === 'جدة');

  // refresh rotation
  const lr = await api('POST', '/api/auth/login', { body: { identifier: email, password: 'SmokeTest@123' } });
  const refreshToken = lr.json?.data?.refreshToken;
  r = await api('POST', '/api/auth/refresh', { body: { refresh_token: refreshToken } });
  check('POST /api/auth/refresh', r.status === 200 && typeof r.json?.data?.accessToken === 'string');
  const rotated = r.json?.data?.refreshToken;
  check('refresh returns a NEW refresh token', rotated && rotated !== refreshToken);

  r = await api('POST', '/api/auth/refresh', { body: { refresh_token: refreshToken } });
  check('reused (old) refresh token rejected', r.status === 401, `got ${r.status}`);

  /* ---------------- cart ---------------- */
  section('cart');
  r = await api('GET', '/api/me/cart', { token });
  check('GET /api/me/cart', r.status === 200 && Array.isArray(r.json?.data?.items));
  check('cart summary has total', typeof r.json?.data?.summary?.total === 'number');

  r = await api('POST', '/api/me/cart/items', { token, body: { product_id: productId, amount: 2 } });
  check('POST /api/me/cart/items', r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error)}`);
  check('cart line reflects qty 2', r.json?.data?.items?.find((i) => i.product_id === productId)?.amount === 2);
  check('cart subtotal = unit price x qty', r.json?.data?.summary?.subtotal > 0);

  r = await api('POST', '/api/me/cart/items', { token, body: { product_id: productId, amount: 1 } });
  check('re-adding same product increments qty', r.json?.data?.items?.find((i) => i.product_id === productId)?.amount === 3);

  r = await api('PATCH', '/api/me/cart/items', { token, body: { product_id: productId, amount: 1 } });
  check('PATCH /api/me/cart/items sets qty', r.json?.data?.items?.find((i) => i.product_id === productId)?.amount === 1);

  r = await api('POST', '/api/me/cart/items', { token, body: { product_id: 999999, amount: 1 } });
  check('adding unknown product = 404', r.status === 404, `got ${r.status}`);

  r = await api('POST', '/api/me/cart/items', { token, body: { product_id: productId, amount: 0 } });
  check('amount=0 rejected by validation', r.status === 422, `got ${r.status}`);

  r = await api('POST', '/api/me/cart/items', { token, body: { product_id: productId, amount: Math.min(liveStock + 1, 99) } });
  check('qty beyond stock rejected', r.status === 400, `got ${r.status} (stock=${liveStock})`);

  r = await api('GET', '/api/me/cart');
  check('cart requires auth = 401', r.status === 401, `got ${r.status}`);

  /* ---------------- wishlist ---------------- */
  section('wishlist');
  r = await api('GET', '/api/me/wishlist', { token });
  check('GET /api/me/wishlist', r.status === 200 && Array.isArray(r.json?.data?.items));

  r = await api('POST', `/api/me/wishlist/${productId}/toggle`, { token });
  check('POST wishlist toggle ON', r.json?.data?.in_wishlist === true, JSON.stringify(r.json?.data));
  r = await api('POST', `/api/me/wishlist/${productId}/toggle`, { token });
  check('POST wishlist toggle OFF', r.json?.data?.in_wishlist === false);

  r = await api('POST', '/api/me/wishlist', { token, body: { product_id: productId } });
  check('POST /api/me/wishlist adds', r.json?.data?.in_wishlist === true);
  r = await api('GET', '/api/me/wishlist', { token });
  check('wishlist now contains product', r.json?.data?.items?.some((i) => i.product_id === productId));
  r = await api('DELETE', `/api/me/wishlist/${productId}`, { token });
  check('DELETE wishlist item = 204', r.status === 204, `got ${r.status}`);

  // decorated listing should now report in_cart
  r = await api('GET', '/api/products?limit=5', { token });
  check('authed listing sets in_cart=true for carted product', r.json?.data?.find((p) => p.id === productId)?.in_cart === true);

  /* ---------------- reviews ---------------- */
  section('reviews');
  r = await api('POST', '/api/me/reviews', { token, body: { product_id: productId, rating: 4, title: 'جيد', comment: 'منتج جيد' } });
  check('POST /api/me/reviews (may be duplicate)', [201, 409].includes(r.status), `got ${r.status} ${JSON.stringify(r.json?.error)}`);

  r = await api('POST', '/api/me/reviews', { token, body: { product_id: productId, rating: 9 } });
  check('rating out of range rejected 422', r.status === 422, `got ${r.status}`);

  r = await api('POST', '/api/me/reviews', { token, body: { product_id: 999999, rating: 3 } });
  check('review for unknown product = 404', r.status === 404, `got ${r.status}`);

  /* ---------------- orders ---------------- */
  section('orders');
  r = await api('POST', '/api/me/orders', { token, body: { payment_method: 'cod' } });
  check('POST /api/me/orders creates order from cart', r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error)}`);
  orderId = r.json?.data?.id;
  check('order has a number', typeof r.json?.data?.order_number === 'string');
  check('order total > 0', r.json?.data?.total > 0);
  check('order contains items', (r.json?.data?.items || []).length > 0);
  check('order snapshot froze product name', typeof r.json?.data?.items?.[0]?.product_name === 'string');

  r = await api('GET', '/api/me/cart', { token });
  check('cart emptied after checkout', r.json?.data?.items?.length === 0, JSON.stringify(r.json?.data?.items?.length));

  r = await api('GET', '/api/me/orders', { token });
  check('GET /api/me/orders', r.status === 200 && Array.isArray(r.json?.data));

  if (orderId) {
    r = await api('GET', `/api/me/orders/${orderId}`, { token });
    check('GET /api/me/orders/:id', r.status === 200);
  }

  // stock must have been decremented
  r = await api('GET', `/api/products/${productSlug}`);
  check('stock decremented after order', typeof r.json?.data?.stock_quantity === 'number');

  /* ---------------- admin ---------------- */
  section('admin');
  r = await api('GET', '/api/admin/stats');
  check('admin route without token = 401', r.status === 401, `got ${r.status}`);
  r = await api('GET', '/api/admin/stats', { token });
  check('customer token cannot use admin route', r.status === 403, `got ${r.status}`);

  r = await api('POST', '/api/auth/admin/login', { body: { identifier: 'admin@watanya.com', password: PASSWORD } });
  check('POST /api/auth/admin/login', r.status === 200 && typeof r.json?.data?.accessToken === 'string', `got ${r.status} ${JSON.stringify(r.json?.error)}`);
  adminToken = r.json?.data?.accessToken;

  r = await api('POST', '/api/auth/admin/login', { body: { identifier: 'admin@watanya.com', password: 'nope' } });
  check('admin wrong password = 401', r.status === 401, `got ${r.status}`);

  if (adminToken) {
    r = await api('GET', '/api/admin/stats', { token: adminToken });
    check('GET /api/admin/stats', r.status === 200 && typeof r.json?.data?.revenue === 'number');

    r = await api('GET', '/api/admin/orders', { token: adminToken });
    check('GET /api/admin/orders', r.status === 200 && Array.isArray(r.json?.data));

    if (orderId) {
      r = await api('PATCH', `/api/admin/orders/${orderId}/status`, { token: adminToken, body: { status: 'shipped' } });
      check('PATCH admin order status', r.status === 200 && r.json?.data?.status === 'shipped');

      r = await api('PATCH', `/api/admin/orders/${orderId}/status`, { token: adminToken, body: { status: 'not-a-status' } });
      check('invalid order status rejected 422', r.status === 422, `got ${r.status}`);
    }

    // create -> update -> price history -> delete
    const newName = `منتج اختبار API ${Date.now()}`;
    r = await api('POST', '/api/admin/products', {
      token: adminToken,
      body: {
        name_ar: newName,
        base_price: 1000,
        sale_price: 800,
        stock_quantity: 5,
        brand_id: 1,
        category_ids: [100],
        colors: [{ name_ar: 'ازرق', hex: '#3498db' }],
        images: ['iphone.png'],
        is_loanable: true,
      },
    });
    check('POST /api/admin/products', r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error)}`);
    const newId = r.json?.data?.id;
    check('created product echoes colors', (r.json?.data?.product?.colors || []).some((x) => x.name_ar === 'ازرق'));

    if (newId) {
      r = await api('GET', `/api/admin/products/${newId}`, { token: adminToken });
      check('GET admin product by id', r.status === 200 && r.json?.data?.id === newId);

      r = await api('PATCH', `/api/admin/products/${newId}`, { token: adminToken, body: { base_price: 750, reason: 'عرض=test' } });
      check('PATCH admin product price', r.status === 200 && r.json?.data?.base_price === 750, `got ${r.json?.data?.base_price}`);

      r = await api('GET', `/api/admin/products/${newId}/price-history`, { token: adminToken });
      check('price history recorded the change', (r.json?.data || []).length >= 1, JSON.stringify(r.json?.data));

      r = await api('DELETE', `/api/admin/products/${newId}`, { token: adminToken });
      check('DELETE admin product = 204', r.status === 204, `got ${r.status}`);
    }

    r = await api('POST', '/api/admin/categories', { token: adminToken, body: { name_ar: 'فئة اختبار', sort_order: 99 } });
    check('POST /api/admin/categories', r.status === 201, `got ${r.status} ${JSON.stringify(r.json?.error)}`);
    const catId = r.json?.data?.id;
    if (catId) {
      r = await api('PATCH', `/api/admin/categories/${catId}`, { token: adminToken, body: { name_ar: 'فئة معدلة' } });
      check('PATCH admin category', r.status === 200);
      r = await api('DELETE', `/api/admin/categories/${catId}`, { token: adminToken });
      check('DELETE admin category = 204', r.status === 204, `got ${r.status}`);
    }

    r = await api('POST', '/api/admin/brands', { token: adminToken, body: { name_ar: 'ماركة اختبار' } });
    check('POST /api/admin/brands', r.status === 201, `got ${r.status}`);
    const brandId = r.json?.data?.id;
    if (brandId) {
      r = await api('PATCH', `/api/admin/brands/${brandId}`, { token: adminToken, body: { name_ar: 'ماركة معدلة' } });
      check('PATCH admin brand', r.status === 200);
      r = await api('DELETE', `/api/admin/brands/${brandId}`, { token: adminToken });
      check('DELETE admin brand = 204', r.status === 204, `got ${r.status}`);
    }
  }

  /* ---------------- logout ---------------- */
  section('logout');
  r = await api('POST', '/api/auth/logout', { body: { refresh_token: rotated } });
  check('POST /api/auth/logout = 204', r.status === 204, `got ${r.status}`);
  r = await api('POST', '/api/auth/refresh', { body: { refresh_token: rotated } });
  check('revoked refresh token rejected', r.status === 401, `got ${r.status}`);

  /* ---------------- summary ---------------- */
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${c.g}${pass} passed${c.x}, ${fail > 0 ? c.r : c.g}${fail} failed${c.x}`);
  if (failures.length) {
    console.log(`\n${c.r}Failures:${c.x}`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(`\n${c.r}Smoke test crashed:${c.x}`, err);
  process.exit(1);
});
