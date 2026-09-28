/* Watanya storefront - talks to the Express API on the same origin. */
(function () {
  'use strict';

  // Normally same-origin. When index.html is opened directly from disk the
  // page origin is file://, where a relative '/api' would resolve to
  // file:///api and fail with "Failed to fetch", so point at the dev server.
  var API = location.protocol === 'file:'
    ? 'http://localhost:4000/api'
    : '/api';
  var LS = { access: 'watanya.access', refresh: 'watanya.refresh', user: 'watanya.user' };

  var state = {
    page: 1,
    limit: 12,
    totalPages: 1,
    total: 0,
    sort: 'best_selling',
    q: '',
    category: '',
    brand: '',
    color: '',
    min_rating: '',
    min_price: '',
    max_price: '',
    products: [],
    facets: null,
    user: null,
    cart: null,
    wishlist: new Set(),
    loading: false
  };

  var el = {};
  function byId(id) { return document.getElementById(id); }
  function cacheEls() {
    ['productList', 'stateBox', 'pager', 'resultsCount', 'sortSelect', 'catList', 'brandList',
     'colorList', 'ratingList', 'productSearch', 'searchBtn', 'priceMin', 'priceMax',
     'cartCount', 'wishlistCount', 'accountLabel', 'accountBtn', 'cartBtn', 'wishlistBtn',
     'authModal', 'cartModal', 'cartBody', 'toast', 'promoImg'].forEach(function (id) {
      el[id] = byId(id);
    });
  }

  /* ---------------- utils ---------------- */

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(n) { return Number(n || 0).toLocaleString('en-US'); }
  function parseNum(v) {
    if (v == null) return NaN;
    var s = String(v).replace(/[,\s]/g, '');
    return s === '' ? NaN : Number(s);
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  var toastTimer;
  function toast(msg, kind) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.className = 'toast' + (kind ? ' ' + kind : '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  /* ---------------- auth storage ---------------- */

  function getAccess() { try { return localStorage.getItem(LS.access); } catch (e) { return null; } }
  function getRefresh() { try { return localStorage.getItem(LS.refresh); } catch (e) { return null; } }

  function saveSession(data) {
    try {
      localStorage.setItem(LS.access, data.accessToken);
      if (data.refreshToken) localStorage.setItem(LS.refresh, data.refreshToken);
      if (data.user) localStorage.setItem(LS.user, JSON.stringify(data.user));
    } catch (e) { /* private mode */ }
    state.user = data.user || null;
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS.access);
      localStorage.removeItem(LS.refresh);
      localStorage.removeItem(LS.user);
    } catch (e) { /* ignore */ }
    state.user = null;
    state.cart = null;
    state.wishlist.clear();
  }

  function isAuthed() { return Boolean(getAccess()); }

  /* ---------------- api ---------------- */

  var refreshing = null;

  function api(method, path, body, opts) {
    opts = opts || {};
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var token = getAccess();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      if (res.status === 401 && !opts._retried && getRefresh()) {
        return refreshOnce().then(function (ok) {
          if (!ok) { clearSession(); throw apiError(res, null); }
          return api(method, path, body, { _retried: true });
        });
      }
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!res.ok) throw apiError(res, json);
        return json ? json.data : null;
      });
    });
  }

  function apiError(res, json) {
    var err = (json && json.error) || {};
    var e = new Error(err.message || 'حدث خطأ غير متوقع (' + res.status + ')');
    e.status = res.status;
    e.code = err.code;
    e.details = err.details;
    return e;
  }

  /** Single-flight refresh so parallel 401s trigger only one rotation. */
  function refreshOnce() {
    if (refreshing) return refreshing;
    var rt = getRefresh();
    if (!rt) return Promise.resolve(false);
    refreshing = fetch(API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    })
      .then(function (res) { return res.json().catch(function () { return null; }); })
      .then(function (json) {
        if (!json || !json.success || !json.data || !json.data.accessToken) return false;
        saveSession(json.data);
        return true;
      })
      .catch(function () { return false; })
      .then(function (ok) { refreshing = null; return ok; });
    return refreshing;
  }

  /* ---------------- query building ---------------- */

  function buildQuery(withFacets) {
    var p = new URLSearchParams();
    p.set('page', state.page);
    p.set('limit', state.limit);
    p.set('sort', state.sort);
    if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category);
    if (state.brand) p.set('brand', state.brand);
    if (state.color) p.set('color', state.color);
    if (state.min_rating) p.set('min_rating', state.min_rating);
    if (state.min_price !== '' && !isNaN(state.min_price)) p.set('min_price', state.min_price);
    if (state.max_price !== '' && !isNaN(state.max_price)) p.set('max_price', state.max_price);
    if (withFacets) p.set('with_facets', 'true');
    return p.toString();
  }

  /* ---------------- rendering ---------------- */

  function starSvg(on) {
    return '<svg class="' + (on ? '' : 'g') + '" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  }

  function starsFor(avg) {
    var full = Math.round(Number(avg || 0));
    var out = '';
    for (var i = 1; i <= 5; i++) out += starSvg(i <= full);
    return '<div class="stars">' + out + '</div>';
  }

  function productCard(p) {
    var img = p.primary_image || (p.images && p.images[0] && p.images[0].path) || '';
    var sale = p.discount_percent > 0
      ? '<span class="badge-sale">خصم ' + esc(p.discount_percent) + '%</span>' : '';
    var old = p.base_price > p.price ? '<span class="old">' + num(p.base_price) + '</span>' : '';
    var stock = Number(p.stock_quantity || 0);
    var stockLine = stock > 0
      ? '<span class="instock">متوفر (' + num(stock) + ')</span>'
      : '<span class="instock" style="color:#c0392b">نفدت الكمية</span>';
    var btnLabel = p.is_loanable ? 'متاح من خلال القرض' : 'أضف للسلة';
    var inCart = Number(p.cart_amount || 0) > 0;
    // Stays clickable while stock remains, so pressing it again bumps the quantity.
    var cartFull = inCart && Number(p.cart_amount) >= stock;
    var cartDisabled = stock <= 0 || cartFull;

    return '' +
      '<div class="card" data-id="' + esc(p.id) + '">' +
        '<div class="card-top">' +
          '<div class="card-body">' +
            (p.brand_name_ar ? '<div class="card-cat">' + esc(p.brand_name_ar) + '</div>' : '') +
            '<div class="card-title">' + esc(p.name_ar) + '</div>' +
            '<div class="card-price">' +
              '<span class="amount">' + num(p.price) + '</span>' +
              '<span class="curr">ريال</span>' + old + stockLine +
            '</div>' +
            '<div class="card-rating">' + starsFor(p.rating_avg) +
              '<span class="rnum">' + (Number(p.rating_avg || 0).toFixed(1)) + '</span>' +
              '<span class="rcount">(' + num(p.rating_count) + ')</span>' +
            '</div>' +
            '<div class="card-bottom">' +
              '<button class="add-to-cart' + (p.in_cart ? ' added' : '') + '"' +
                (cartDisabled ? ' disabled' : '') + ' data-action="add">' +
                '<svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.17 14.75l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4.25H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42a.25.25 0 0 1-.25-.25z"/></svg>' +
                (p.in_cart ? ' في السلة (' + num(p.cart_amount) + ')' : ' ' + btnLabel) +
              '</button>' +
              '<button class="heart-btn' + (p.in_wishlist ? ' liked' : '') + '" data-action="wish" aria-label="مفضلة">' +
                '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="card-img">' + sale +
            (img
              ? '<img src="' + esc(img) + '" alt="' + esc(p.name_ar) + '" loading="lazy" onerror="this.remove()">'
              : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderProducts() {
    if (el.productList) el.productList.innerHTML = state.products.map(productCard).join('');
    if (el.resultsCount) {
      el.resultsCount.textContent = state.total
        ? 'عرض ' + state.products.length + ' من ' + num(state.total) + ' منتج'
        : '';
    }
    renderPager();
  }

  function renderPager() {
    if (!el.pager) return;
    if (state.totalPages <= 1) { el.pager.hidden = true; el.pager.innerHTML = ''; return; }
    var html = '<button class="pg" data-page="' + (state.page - 1) + '"' +
      (state.page <= 1 ? ' disabled' : '') + '>السابق</button>';
    var from = Math.max(1, state.page - 2);
    var to = Math.min(state.totalPages, from + 4);
    from = Math.max(1, to - 4);
    for (var i = from; i <= to; i++) {
      html += '<button class="pg' + (i === state.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="pg" data-page="' + (state.page + 1) + '"' +
      (state.page >= state.totalPages ? ' disabled' : '') + '>التالي</button>';
    el.pager.innerHTML = html;
    el.pager.hidden = false;
  }

  function showState(kind, msg) {
    if (!el.stateBox) return;
    if (!msg) { el.stateBox.hidden = true; el.stateBox.innerHTML = ''; return; }
    el.stateBox.className = 'state-box ' + kind;
    el.stateBox.textContent = msg;
    el.stateBox.hidden = false;
  }

  /* ---------------- facets ---------------- */

  function radioRow(name, value, label, extra) {
    return '<li><span>' + esc(label) + (extra || '') + '</span>' +
      '<input type="radio" name="' + name + '" value="' + esc(value) + '"></li>';
  }

  function renderFacets(f) {
    if (!f) return;

    if (el.catList) {
      var cats = (f.categories || []).filter(function (c) { return c.parent_id === null || c.parent_id === undefined; });
      el.catList.innerHTML = radioRow('cat', '', 'الكل') +
        (cats.length ? cats : (f.categories || [])).slice(0, 12).map(function (c) {
          return radioRow('cat', c.slug, c.name_ar, ' <span class="fcnt">(' + c.product_count + ')</span>');
        }).join('');
    }

    if (el.brandList) {
      el.brandList.innerHTML = radioRow('brand', '', 'الكل') +
        (f.brands || []).slice(0, 12).map(function (b) {
          return radioRow('brand', b.slug, b.name_ar, ' <span class="fcnt">(' + b.product_count + ')</span>');
        }).join('');
    }

    if (el.colorList) {
      el.colorList.innerHTML =
        '<li><div class="color-left"><span>الكل</span></div><input type="radio" name="color" value=""></li>' +
        (f.colors || []).slice(0, 12).map(function (c) {
          return '<li><div class="color-left"><span class="color-dot" style="background:' + esc(c.hex) + '"></span>' +
            '<span>' + esc(c.name_ar) + '</span></div>' +
            '<input type="radio" name="color" value="' + esc(c.name_ar) + '"></li>';
        }).join('');
    }

    if (f.price && f.price.max) {
      var max = Math.ceil(f.price.max / 500) * 500;
      if (el.priceMin) { el.priceMin.placeholder = '0'; el.priceMin.max = max; }
      if (el.priceMax) { el.priceMax.placeholder = num(max); el.priceMax.max = max; }
      state.priceCeiling = max;
    }
  }

  /* ---------------- loaders ---------------- */

  function loadProducts() {
    state.loading = true;
    showState('loading', 'جارٍ تحميل المنتجات…');
    // Sent explicitly (rather than through api()) because this response carries
    // meta + facets alongside data, and the token is what populates the
    // in_cart / in_wishlist flags on each card.
    var headers = { Accept: 'application/json' };
    var token = getAccess();
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(API + '/products?' + buildQuery(true), { headers: headers })
      .then(function (r) {
        return r.json().then(function (j) {
          if (r.status === 401 && token && getRefresh()) {
            return refreshOnce().then(function (ok) {
              if (!ok) { clearSession(); throw apiError(r, j); }
              return loadProducts();
            });
          }
          if (!r.ok) throw apiError(r, j);
          return j;
        });
      })
      .then(function (json) {
        state.loading = false;
        var data = json.data || [];
        var meta = json.meta || {};
        state.products = data;
        state.page = Number(meta.page || 1);
        state.total = Number(meta.total || 0);
        state.totalPages = Number(meta.totalPages || 1);
        state.facets = json.facets || null;
        showState('');
        renderFacets(state.facets);
        renderProducts();
        if (data.length) {
          applyWishlistState();
        } else {
          showState('empty', 'لا توجد منتجات مطابقة لبحثك.');
        }
      })
      .catch(function (e) {
        state.loading = false;
        showState('error', e.message || 'تعذر تحميل المنتجات');
      });
  }

  function loadStorefront() {
    return api('GET', '/storefront').then(function (d) {
      var nav = document.querySelector('.nav-inner');
      if (!nav || !d) return;
      var cats = (d.categories || []).filter(function (c) { return !c.parent_id; }).slice(0, 8);

      // Replace the placeholder links outright rather than overwriting them by
      // index. The static markup and the category count do not have to agree,
      // and overwriting left a stale duplicate behind when the API returned
      // fewer categories than there were placeholders.
      var stale = Array.prototype.slice.call(nav.querySelectorAll('a'));
      stale.forEach(function (a) { a.parentNode.removeChild(a); });

      cats.forEach(function (c) {
        var a = document.createElement('a');
        a.href = '#';
        a.textContent = c.name_ar;
        a.dataset.slug = c.slug;
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          state.category = c.slug;
          state.page = 1;
          syncRadios();
          loadProducts();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        nav.appendChild(a);
      });
    }).catch(function () { /* nav is cosmetic */ });
  }

  /* ---------------- cart / wishlist ---------------- */

  function requireAuth(message) {
    if (isAuthed()) return true;
    toast(message || 'يجب تسجيل الدخول أولاً');
    openModal('authModal');
    return false;
  }

  function refreshBadges() {
    if (el.cartCount) {
      var n = state.cart && state.cart.items ? state.cart.items.length : 0;
      el.cartCount.textContent = n;
      el.cartCount.hidden = n === 0;
    }
    if (el.wishlistCount) {
      var w = state.wishlist.size;
      el.wishlistCount.textContent = w;
      el.wishlistCount.hidden = w === 0;
    }
    if (el.accountLabel) {
      el.accountLabel.textContent = state.user ? (state.user.full_name || 'حسابي') : 'تسجيل الدخول';
    }
  }

  function loadCart() {
    if (!isAuthed()) { refreshBadges(); return Promise.resolve(); }
    return api('GET', '/me/cart').then(function (c) {
      state.cart = c;
      refreshBadges();
      if (c && c.items) {
        c.items.forEach(function (i) { state.wishlist.delete('cart:' + i.product_id); });
      }
      return c;
    }).catch(function () { return null; });
  }

  function loadWishlist() {
    if (!isAuthed()) { state.wishlist.clear(); refreshBadges(); return Promise.resolve(); }
    return api('GET', '/me/wishlist').then(function (d) {
      // Endpoint returns { items, summary }, not a bare array.
      var items = (d && d.items) || [];
      state.wishlist = new Set(items.map(function (w) { return String(w.product_id); }));
      refreshBadges();
      applyWishlistState();
    }).catch(function () { /* ignore */ });
  }

  /** Reflect wishlist membership onto the currently rendered cards. */
  function applyWishlistState() {
    state.products.forEach(function (p) {
      p.in_wishlist = state.wishlist.has(String(p.id));
    });
  }

  function markCard(id, patch) {
    var card = el.productList && el.productList.querySelector('.card[data-id="' + id + '"]');
    if (!card) return;
    var p = state.products.filter(function (x) { return String(x.id) === String(id); })[0];
    if (p) Object.keys(patch).forEach(function (k) { p[k] = patch[k]; });
    if (patch.in_cart !== undefined || patch.cart_amount !== undefined) {
      var btn = card.querySelector('[data-action="add"]');
      if (btn && p) {
        var amount = Number(p.cart_amount || 0);
        var inCart = amount > 0;
        var stock = Number(p.stock_quantity || 0);
        btn.classList.toggle('added', inCart);
        // Only lock once the cart holds the whole stock for this product.
        btn.disabled = stock <= 0 || (inCart && amount >= stock);
        btn.lastChild.textContent = inCart ? ' في السلة (' + num(amount) + ')'
          : ' ' + (p.is_loanable ? 'متاح من خلال القرض' : 'أضف للسلة');
      }
    }
    if (patch.in_wishlist !== undefined) {
      var heart = card.querySelector('[data-action="wish"]');
      if (heart) heart.classList.toggle('liked', Boolean(patch.in_wishlist));
    }
  }

  function addToCart(id) {
    if (!requireAuth('سجّل الدخول لإضافة المنتجات إلى السلة')) return;
    var btn = el.productList && el.productList
      .querySelector('.card[data-id="' + id + '"] [data-action="add"]');
    // The server increments the existing line, so one press = one more unit.
    if (btn) btn.disabled = true;
    api('POST', '/me/cart/items', { product_id: Number(id), amount: 1 })
      .then(function (cart) {
        state.cart = cart;
        refreshBadges();
        var line = (cart.items || []).filter(function (i) {
          return String(i.product_id) === String(id);
        })[0];
        markCard(id, { in_cart: !!line, cart_amount: line ? Number(line.amount) : 0 });
        if (byId('cartModal') && !byId('cartModal').hidden) renderCart();
        toast('تمت الإضافة إلى السلة');
      })
      .catch(function (e) {
        var p = state.products.filter(function (x) { return String(x.id) === String(id); })[0];
        markCard(id, { in_cart: !!p, cart_amount: p ? Number(p.cart_amount || 0) : 0 });
        toast(e.message, 'error');
      });
  }

  function toggleWishlist(id) {
    if (!requireAuth('سجّل الدخول لحفظ المنتجات في المفضلة')) return;
    var key = String(id);
    var next = !state.wishlist.has(key);
    // The API takes the product id in the path and returns the new state.
    api('POST', '/me/wishlist/' + encodeURIComponent(id) + '/toggle')
      .then(function (res) {
        var inList = res && typeof res.in_wishlist === 'boolean' ? res.in_wishlist : next;
        if (inList) state.wishlist.add(key); else state.wishlist.delete(key);
        refreshBadges();
        markCard(id, { in_wishlist: inList });
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- cart panel ---------------- */

  function renderCart() {
    if (!el.cartBody) return;
    var c = state.cart;
    if (!c || !c.items || !c.items.length) {
      el.cartBody.innerHTML = '<p class="empty">السلة فارغة.</p>';
      return;
    }
    var rows = c.items.map(function (i) {
      return '<div class="cart-row" data-id="' + esc(i.product_id) + '">' +
        '<div class="cr-name">' + esc(i.name_ar) + '</div>' +
        '<div class="cr-qty">' +
          '<button data-cart="dec" aria-label="إنقاص">&minus;</button>' +
          '<span>' + esc(i.amount) + '</span>' +
          '<button data-cart="inc" aria-label="زيادة">+</button>' +
        '</div>' +
        '<div class="cr-price">' + num(i.line_total) + ' ريال</div>' +
        '<button class="cr-remove" data-cart="remove" aria-label="حذف">&times;</button>' +
      '</div>';
    }).join('');
    var s = c.summary || {};
    el.cartBody.innerHTML =
      '<div class="cart-lines">' + rows + '</div>' +
      '<div class="cart-totals">' +
        '<div><span>المجموع الفرعي</span><b>' + num(s.subtotal) + '</b></div>' +
        '<div><span>الشحن</span><b>' + num(s.shipping) + '</b></div>' +
        '<div><span>الضريبة</span><b>' + num(s.tax) + '</b></div>' +
        '<div class="grand"><span>الإجمالي</span><b>' + num(s.total) + ' ريال</b></div>' +
      '</div>' +
      '<h4 class="cart-sub">بيانات التوصيل</h4>' +
      '<div class="ship-grid">' +
        '<label>اسم المستلم' +
          '<input id="shipName" name="shipping_name" type="text" maxlength="120" autocomplete="name" required>' +
        '</label>' +
        '<label>رقم الجوال' +
          '<input id="shipPhone" name="shipping_phone" type="tel" maxlength="20" autocomplete="tel" required>' +
        '</label>' +
        '<label>المدينة' +
          '<input id="shipCity" name="shipping_city" type="text" maxlength="60" autocomplete="address-level2" required>' +
        '</label>' +
        '<label class="wide">العنوان' +
          '<input id="shipAddress" name="shipping_address" type="text" maxlength="255" autocomplete="street-address" required>' +
        '</label>' +
        '<label class="wide">ملاحظات للتوصيل (اختياري)' +
          '<input id="shipNotes" name="notes" type="text" maxlength="500">' +
        '</label>' +
      '</div>' +
      '<h4 class="cart-sub">طريقة الدفع</h4>' +
      '<label class="cart-pay">الدفع' +
        '<select id="cartPayment">' +
          '<option value="cod">الدفع عند الاستلام</option>' +
          '<option value="card">بطاقة ائتمانية</option>' +
          '<option value="loan">تمويل عبر القرض</option>' +
        '</select>' +
      '</label>' +
      '<button class="btn-primary" id="checkoutBtn">إتمام الطلب</button>';
  }

  function openModal(id) {
    var m = byId(id);
    if (m) m.hidden = false;
  }
  function closeModal(id) {
    var m = byId(id);
    if (m) m.hidden = true;
  }

  /* ---------------- checkout ---------------- */

  function checkout() {
    if (!requireAuth()) return;

    // The API accepts these as optional, but an order with no delivery details
    // cannot be fulfilled, so require them here before submitting.
    var f = {
      shipping_name: byId('shipName'),
      shipping_phone: byId('shipPhone'),
      shipping_city: byId('shipCity'),
      shipping_address: byId('shipAddress'),
    };
    var payload = { payment_method: (byId('cartPayment') || {}).value || 'cod' };
    var missing = null;
    Object.keys(f).forEach(function (k) {
      var v = f[k] ? String(f[k].value || '').trim() : '';
      if (!v && !missing) missing = f[k];
      if (v) payload[k] = v;
    });
    var notes = byId('shipNotes');
    if (notes && String(notes.value || '').trim()) payload.notes = String(notes.value).trim();

    if (missing) {
      missing.focus();
      toast('يرجى تعبئة بيانات التوصيل كاملة', 'error');
      return;
    }

    var btn = byId('checkoutBtn');
    if (btn) btn.disabled = true;
    api('POST', '/me/orders', payload)
      .then(function (order) {
        state.cart = null;
        refreshBadges();
        closeModal('cartModal');
        toast('تم إنشاء الطلب رقم ' + (order.order_number || order.id));
        loadProducts();
      })
      .catch(function (e) { toast(e.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ---------------- event wiring ---------------- */

  function syncRadios() {
    [['cat', state.category], ['brand', state.brand], ['color', state.color],
     ['rate', state.min_rating]].forEach(function (pair) {
      var name = pair[0], want = String(pair[1] == null ? '' : pair[1]);
      document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
        if (r.value === want) r.checked = true;
      });
    });
    if (el.colorList) {
      el.colorList.querySelectorAll('.color-dot').forEach(function (d, i) {
        var input = el.colorList.querySelectorAll('input[name="color"]')[i];
        d.classList.toggle('sel', Boolean(input && input.checked));
      });
    }
  }

  function onFilterChange(name, value, stateKey) {
    state[stateKey] = value;
    state.page = 1;
    syncRadios();
    loadProducts();
  }

  function wire() {
    /* sort */
    if (el.sortSelect) {
      el.sortSelect.addEventListener('change', function () {
        state.sort = this.value;
        state.page = 1;
        loadProducts();
      });
    }

    /* search */
    var runSearch = function () {
      state.q = (el.productSearch.value || '').trim();
      state.page = 1;
      loadProducts();
    };
    if (el.searchBtn) el.searchBtn.addEventListener('click', runSearch);
    if (el.productSearch) {
      el.productSearch.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runSearch();
      });
      el.productSearch.addEventListener('input', debounce(runSearch, 450));
    }

    /* sidebar radios (delegated: lists are re-rendered from facets) */
    ['cat', 'brand', 'color', 'rate'].forEach(function (name) {
      document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t || t.name !== name) return;
        if (name === 'cat') onFilterChange(name, t.value, 'category');
        else if (name === 'brand') onFilterChange(name, t.value, 'brand');
        else if (name === 'color') onFilterChange(name, t.value, 'color');
        else onFilterChange(name, t.value, 'min_rating');
      });
    });

    /* price */
    var priceChanged = debounce(function () {
      state.min_price = el.priceMin.value.trim();
      state.max_price = el.priceMax.value.trim();
      state.page = 1;
      loadProducts();
    }, 500);
    if (el.priceMin) el.priceMin.addEventListener('input', priceChanged);
    if (el.priceMax) el.priceMax.addEventListener('input', priceChanged);

    /* product list delegation */
    if (el.productList) {
      el.productList.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var card = btn.closest('.card');
        if (!card) return;
        var id = card.dataset.id;
        if (btn.dataset.action === 'add') addToCart(id);
        else if (btn.dataset.action === 'wish') toggleWishlist(id);
      });
    }

    /* pager */
    if (el.pager) {
      el.pager.addEventListener('click', function (e) {
        var b = e.target.closest('.pg');
        if (!b || b.disabled) return;
        state.page = Number(b.dataset.page);
        loadProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    /* header */
    if (el.accountBtn) {
      el.accountBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (isAuthed()) {
          if (confirm('تسجيل الخروج من الحساب؟')) {
            var rt = getRefresh();
            api('POST', '/auth/logout', rt ? { refresh_token: rt } : {}).catch(function () { });
            clearSession();
            refreshBadges();
            toast('تم تسجيل الخروج');
            loadProducts();
          }
        } else {
          openModal('authModal');
        }
      });
    }

    if (el.cartBtn) {
      el.cartBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!isAuthed()) { toast('سجّل الدخول لعرض السلة'); openModal('authModal'); return; }
        loadCart().then(function () { renderCart(); openModal('cartModal'); });
      });
    }

    if (el.wishlistBtn) {
      el.wishlistBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!isAuthed()) { toast('سجّل الدخول لعرض المفضلة'); openModal('authModal'); return; }
        api('GET', '/me/wishlist').then(function (d) {
          var items = (d && d.items) || [];
          state.wishlist = new Set(items.map(function (w) { return String(w.product_id); }));
          refreshBadges();
          applyWishlistState();
          renderProducts();
          toast('المفضلة: ' + items.length + ' منتج');
        }).catch(function (err) { toast(err.message, 'error'); });
      });
    }

    /* cart panel actions */
    if (el.cartBody) {
      el.cartBody.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cart]');
        if (b) {
          var row = b.closest('.cart-row');
          var id = Number(row.dataset.id);
          var item = state.cart.items.filter(function (i) { return Number(i.product_id) === id; })[0];
          if (!item) return;
          var next = item.amount;
          if (b.dataset.cart === 'inc') next = item.amount + 1;
          else if (b.dataset.cart === 'dec') next = item.amount - 1;
          else next = 0;
          return updateCart(id, next);
        }
        if (e.target.id === 'checkoutBtn') checkout();
      });
    }

    /* modals */
    document.addEventListener('click', function (e) {
      if (e.target.matches('[data-close]')) {
        var m = e.target.closest('.modal');
        if (m) m.hidden = true;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; });
      }
    });

    var tabs = document.querySelectorAll('#authModal .tab');
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.querySelectorAll('#authModal .auth-form').forEach(function (f) {
          f.hidden = f.dataset.pane !== t.dataset.tab;
        });
      });
    });

    document.querySelectorAll('#authModal .auth-form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = form.querySelector('[data-error]');
        if (err) err.hidden = true;
        var fd = new FormData(form);
        var payload = {};
        fd.forEach(function (v, k) { payload[k] = v; });
        var isLogin = form.dataset.pane === 'login';
        var req = isLogin
          ? api('POST', '/auth/login', { identifier: payload.identifier, password: payload.password })
          : api('POST', '/auth/register', {
              full_name: payload.full_name,
              email: payload.email,
              phone: payload.phone,
              password: payload.password
            });
        req.then(function (d) {
          saveSession(d);
          closeModal('authModal');
          form.reset();
          refreshBadges();
          toast(isLogin ? 'مرحباً بك' : 'تم إنشاء الحساب بنجاح');
          return Promise.all([loadCart(), loadWishlist()]).then(loadProducts);
        }).catch(function (e2) {
          if (err) { err.textContent = e2.message; err.hidden = false; }
        });
      });
    });

    /* reset filters */
    var reset = document.querySelector('.reset-btn');
    if (reset) {
      reset.addEventListener('click', function () {
        state.category = state.brand = state.color = state.min_rating = '';
        state.min_price = state.max_price = '';
        state.page = 1;
        if (el.priceMin) el.priceMin.value = '';
        if (el.priceMax) el.priceMax.value = '';
        if (el.productSearch) el.productSearch.value = '';
        state.q = '';
        syncRadios();
        loadProducts();
      });
    }

    /* "show more" expands the truncated facet lists */
    document.querySelectorAll('.show-more').forEach(function (more) {
      more.addEventListener('click', function () {
        var list = more.previousElementSibling;
        if (!list) return;
        var hidden = list.querySelectorAll('li:nth-child(n+9)');
        var willShow = hidden.length > 0;
        hidden.forEach(function (li) { li.style.display = willShow ? '' : 'none'; });
        more.textContent = willShow ? 'عرض أقل' : 'عرض المزيد';
      });
    });

    /* show more / collapse + mobile filter toggle + view toggle */
    var viewBtns = document.querySelectorAll('.view-btn');
    Array.prototype.forEach.call(viewBtns, function (btn, i) {
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(viewBtns, function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.card-top').forEach(function (top) {
          top.style.gridTemplateColumns = (i === 1 ? '200px' : '220px') + ' 1fr';
        });
      });
    });

    var ft = document.querySelector('.filter-toggle');
    if (ft) {
      ft.addEventListener('click', function () {
        var sb = document.querySelector('.sidebar');
        if (sb) sb.classList.toggle('open');
      });
    }
  }

  function updateCart(id, amount) {
    return api('PATCH', '/me/cart/items', { product_id: id, amount: amount })
      .then(function (cart) {
        state.cart = cart;
        refreshBadges();
        renderCart();
        loadProducts();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- boot ---------------- */

  function restoreUser() {
    try {
      var raw = localStorage.getItem(LS.user);
      if (raw) state.user = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  function boot() {
    cacheEls();
    restoreUser();
    wire();
    refreshBadges();
    loadStorefront();
    loadProducts();
    if (isAuthed()) {
      loadCart();
      loadWishlist();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
