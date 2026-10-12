/* Watanya admin panel - signs in against POST /api/auth/admin/login.
   Plain ES5-style browser JavaScript, same as the storefront's script.js.
   Every table of the ER diagram has a tab here: products, categories,
   brands, customers, admins and carts (orders/price history included). */
(function () {
  'use strict';

  // Same file:// fallback as the storefront: a relative '/api' would resolve
  // to file:///api and fail when admin.html is opened straight from disk.
  var API = location.protocol === 'file:'
    ? 'http://localhost:4000/api'
    : '/api';

  // Deliberately separate keys from the storefront session
  // (watanya.access / .refresh / .user) so signing in here never overwrites a
  // customer login in the same browser, and vice versa.
  var LS = { access: 'watanya.admin.access', admin: 'watanya.admin.user' };

  var STATUSES = [
    ['pending', 'قيد المراجعة'],
    ['confirmed', 'مؤكد'],
    ['processing', 'قيد التجهيز'],
    ['shipped', 'تم الشحن'],
    ['delivered', 'تم التسليم'],
    ['cancelled', 'ملغي'],
    ['refunded', 'مسترجع']
  ];

  var PAYMENTS = { cod: 'الدفع عند الاستلام', card: 'بطاقة ائتمانية', loan: 'تمويل عبر القرض' };

  var STAT_CARDS = [
    ['revenue', 'إجمالي المبيعات', 'ريال'],
    ['orders', 'الطلبات النشطة'],
    ['products', 'المنتجات المعروضة'],
    ['customers', 'العملاء'],
    ['loan_orders', 'طلبات التمويل']
  ];

  var state = {
    admin: null,
    tab: 'dashboard',
    historyProductId: null,
    openCartId: null,
    orders: { page: 1, limit: 10, status: '', totalPages: 1, total: 0, items: [] },
    products: { page: 1, limit: 10, q: '', brand: '', active: '', totalPages: 1, total: 0, items: [] },
    customers: { page: 1, limit: 10, q: '', active: '', totalPages: 1, total: 0, items: [] },
    carts: { page: 1, limit: 10, q: '', totalPages: 1, total: 0, items: [] },
    categories: [],
    brands: [],
    adminAccounts: [],
    refsPromise: null
  };

  var el = {};
  function byId(id) { return document.getElementById(id); }
  function cacheEls() {
    ['adminLogin', 'adminLoginForm', 'adminPanel', 'adminName', 'adminSignout', 'adminTabs',
     'statGrid', 'orderStatus', 'ordersReload', 'ordersBody', 'ordersPager',
     'productQ', 'productBrand', 'productActive', 'productNew', 'productsBody', 'productsPager',
     'productEditor', 'productEditorTitle', 'productCancel', 'productEditForm', 'productBrandSelect',
     'productCats', 'productHistoryWrap', 'historyBody',
     'productImgBtn', 'productImgInput', 'productImgPreview',
     'categoryEditor', 'categoryEditorTitle', 'categoryCancel', 'categoryEditForm', 'categoryParent',
     'categoryNew', 'categoriesBody',
     'brandEditor', 'brandEditorTitle', 'brandCancel', 'brandEditForm', 'brandNew', 'brandsBody',
     'customerEditor', 'customerEditorTitle', 'customerCancel', 'customerEditForm',
     'customerQ', 'customerActive', 'customerNew', 'customersBody', 'customersPager',
     'adminEditor', 'adminEditorTitle', 'adminAccountCancel', 'adminEditForm',
     'adminAccountNew', 'adminsBody',
     'cartDetailCard', 'cartDetailTitle', 'cartDetailClose', 'cartLinesBody',
     'cartQ', 'cartsReload', 'cartsBody', 'cartsPager',
     'toast'].forEach(function (id) {
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

  /** MySQL DATETIME ("2026-01-02 03:04:05") -> "2026-01-02 03:04". */
  function fmtDate(v) {
    var s = String(v == null ? '' : v);
    return s.length >= 16 ? s.slice(0, 10) + ' ' + s.slice(11, 16) : s;
  }

  function statusLabel(value) {
    for (var i = 0; i < STATUSES.length; i++) {
      if (STATUSES[i][0] === value) return STATUSES[i][1];
    }
    return String(value == null ? '' : value);
  }

  function statusOptions(current) {
    return STATUSES.map(function (s) {
      return '<option value="' + s[0] + '"' + (s[0] === current ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
  }

  /** Trimming read of a form field. */
  function txt(form, name) {
    var e = form.elements[name];
    return e ? String(e.value || '').trim() : '';
  }
  /** Checked state of a form checkbox. */
  function cb(form, name) {
    var e = form.elements[name];
    return !!(e && e.checked);
  }

  /** Fills a form from a plain object (skips checkbox groups like category_ids). */
  function setForm(form, data) {
    form.reset();
    Object.keys(data).forEach(function (key) {
      var e = form.elements[key];
      if (!e || e.length > 1) return;
      if (e.type === 'checkbox') { e.checked = !!data[key]; return; }
      e.value = data[key] === null || data[key] === undefined ? '' : String(data[key]);
    });
  }

  /** Delegated listener: handler receives (matchedElement, event). */
  function on(node, selector, handler) {
    if (!node) return;
    node.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest(selector) : null;
      if (t && node.contains(t)) handler(t, e);
    });
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

  function loading(node) {
    if (node) node.innerHTML = '<p class="empty">جارٍ التحميل…</p>';
  }
  function failed(node, e) {
    if (node && isAuthed()) node.innerHTML = '<p class="empty">' + esc(e.message) + '</p>';
  }

  /** Shared pager renderer; click routing lives in pagerActions below. */
  function renderPager(node, page, totalPages) {
    if (!node) return;
    if (!totalPages || totalPages <= 1) { node.hidden = true; node.innerHTML = ''; return; }
    var html = '<button class="pg" data-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>السابق</button>';
    var start = Math.max(1, page - 3);
    var end = Math.min(totalPages, page + 3);
    if (start > 1) html += '<span class="pg-gap">&hellip;</span>';
    for (var i = start; i <= end; i++) {
      html += '<button class="pg' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    if (end < totalPages) html += '<span class="pg-gap">&hellip;</span>';
    html += '<button class="pg" data-page="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + '>التالي</button>';
    node.innerHTML = html;
    node.hidden = false;
  }

  function badge(isOn, onText, offText) {
    return '<span class="badge-status ' + (isOn ? 'on' : 'off') + '">' +
      (isOn ? onText : offText) + '</span>';
  }

  /* ---------------- session storage ---------------- */

  function getAccess() { try { return localStorage.getItem(LS.access); } catch (e) { return null; } }

  function saveSession(data) {
    try {
      localStorage.setItem(LS.access, data.accessToken);
      localStorage.setItem(LS.admin, JSON.stringify(data.admin || null));
    } catch (e) { /* private mode */ }
    state.admin = data.admin || null;
  }

  function restoreSession() {
    try {
      var raw = localStorage.getItem(LS.admin);
      state.admin = raw ? JSON.parse(raw) : null;
    } catch (e) { state.admin = null; }
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS.access);
      localStorage.removeItem(LS.admin);
    } catch (e) { /* ignore */ }
    state.admin = null;
  }

  function isAuthed() { return Boolean(getAccess()); }

  /* ---------------- api ---------------- */

  function apiError(res, json) {
    var err = (json && json.error) || {};
    var e = new Error(err.message || 'حدث خطأ غير متوقع (' + res.status + ')');
    e.status = res.status;
    e.code = err.code;
    e.details = err.details;
    return e;
  }

  /**
   * Returns { data, meta } so callers can page through list endpoints.
   * A 401/403 anywhere means the token is gone, expired or the admin was
   * deactivated: drop it and fall back to the sign-in card. `quiet` skips
   * that for the sign-in request itself, where a 401 is just a wrong password.
   */
  function api(method, path, body, quiet) {
    var headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var token = getAccess();
    if (token) headers.Authorization = 'Bearer ' + token;

    return fetch(API + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      if (res.status === 204) return { data: null, meta: null };
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!quiet && (res.status === 401 || res.status === 403)) {
          endSession(res.status === 401
            ? 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد'
            : 'لا تملك صلاحية الوصول، يرجى تسجيل الدخول من جديد');
        }
        if (!res.ok) throw apiError(res, json);
        return { data: json ? json.data : null, meta: json ? json.meta : null };
      });
    });
  }

  /* ---------------- views ---------------- */

  function showLogin() {
    if (el.adminPanel) el.adminPanel.hidden = true;
    if (el.adminLogin) el.adminLogin.hidden = false;
  }

  function showPanel() {
    if (el.adminLogin) el.adminLogin.hidden = true;
    if (el.adminPanel) el.adminPanel.hidden = false;
    if (el.adminName) {
      el.adminName.textContent = state.admin && state.admin.full_name ? state.admin.full_name : 'مشرف';
    }
  }

  /** Blanks every panel so nothing stale survives a sign-out. */
  function resetPanels() {
    if (el.statGrid) el.statGrid.innerHTML = '';
    if (el.ordersBody) el.ordersBody.innerHTML = '';
    if (el.ordersPager) { el.ordersPager.hidden = true; el.ordersPager.innerHTML = ''; }
    if (el.productsBody) el.productsBody.innerHTML = '';
    if (el.productsPager) { el.productsPager.hidden = true; el.productsPager.innerHTML = ''; }
    if (el.productEditor) el.productEditor.hidden = true;
    if (el.historyBody) el.historyBody.innerHTML = '';
    if (el.categoriesBody) el.categoriesBody.innerHTML = '';
    if (el.categoryEditor) el.categoryEditor.hidden = true;
    if (el.brandsBody) el.brandsBody.innerHTML = '';
    if (el.brandEditor) el.brandEditor.hidden = true;
    if (el.customersBody) el.customersBody.innerHTML = '';
    if (el.customersPager) { el.customersPager.hidden = true; el.customersPager.innerHTML = ''; }
    if (el.customerEditor) el.customerEditor.hidden = true;
    if (el.adminsBody) el.adminsBody.innerHTML = '';
    if (el.adminEditor) el.adminEditor.hidden = true;
    if (el.cartsBody) el.cartsBody.innerHTML = '';
    if (el.cartsPager) { el.cartsPager.hidden = true; el.cartsPager.innerHTML = ''; }
    if (el.cartDetailCard) el.cartDetailCard.hidden = true;
    if (el.cartLinesBody) el.cartLinesBody.innerHTML = '';
    state.historyProductId = null;
    state.openCartId = null;
    state.refsPromise = null;
    state.categories = [];
    state.brands = [];
    state.adminAccounts = [];
  }

  /** Drops the token and returns to the sign-in card. */
  function endSession(message) {
    clearSession();
    state.orders.items = [];
    state.products.items = [];
    state.customers.items = [];
    state.carts.items = [];
    resetPanels();
    showLogin();
    if (message) toast(message, 'error');
  }

  /* ---------------- tabs ---------------- */

  var TAB_LOADERS = {};

  function switchTab(name) {
    state.tab = name;
    var i, buttons = el.adminTabs ? el.adminTabs.querySelectorAll('.tab-btn') : [];
    for (i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-tab') === name);
    }
    var panels = document.querySelectorAll('.tab-panel');
    for (i = 0; i < panels.length; i++) {
      panels[i].hidden = panels[i].getAttribute('data-panel') !== name;
    }
    var loader = TAB_LOADERS[name];
    if (loader) loader();
  }

  /* ---------------- reference data (brands + categories) ---------------- */

  function loadRefs() {
    if (state.refsPromise) return state.refsPromise;
    state.refsPromise = Promise.all([
      api('GET', '/admin/categories'),
      api('GET', '/admin/brands')
    ]).then(function (r) {
      state.categories = r[0].data || [];
      state.brands = r[1].data || [];
      fillBrandSelects();
      fillCategoryParent();
      return true;
    }).catch(function (e) {
      state.refsPromise = null;
      if (isAuthed()) toast(e.message, 'error');
      return false;
    });
    return state.refsPromise;
  }

  /** Category/brand mutations invalidate the cached lists. */
  function resetRefs() { state.refsPromise = null; }

  function fillBrandSelects() {
    var optionHtml = function (b) {
      return '<option value="' + b.id + '">' + esc(b.name_ar) +
        (b.is_active ? '' : ' (مخفية)') + '</option>';
    };
    if (el.productBrand) {
      var keepFilter = el.productBrand.value;
      el.productBrand.innerHTML = '<option value="">كل الماركات</option>' +
        state.brands.map(optionHtml).join('');
      if (keepFilter) el.productBrand.value = keepFilter;
    }
    if (el.productBrandSelect) {
      var keepForm = el.productBrandSelect.value;
      el.productBrandSelect.innerHTML = '<option value="">بدون ماركة</option>' +
        state.brands.map(optionHtml).join('');
      if (keepForm) el.productBrandSelect.value = keepForm;
    }
  }

  function fillCategoryParent(excludeId) {
    if (!el.categoryParent) return;
    var keep = el.categoryParent.value;
    el.categoryParent.innerHTML = '<option value="">بدون (فئة رئيسية)</option>' +
      state.categories.filter(function (c) { return String(c.id) !== String(excludeId); })
        .map(function (c) {
          return '<option value="' + c.id + '">' + esc(c.name_ar) +
            (c.is_active ? '' : ' (مخفية)') + '</option>';
        }).join('');
    if (keep && keep !== String(excludeId)) el.categoryParent.value = keep;
  }

  function categoryDepth(cat) {
    var byId = {}, depth = 0, cursor = cat, guard = 0;
    state.categories.forEach(function (c) { byId[c.id] = c; });
    while (cursor && cursor.parent_id && byId[cursor.parent_id] && guard++ < 20) {
      depth++;
      cursor = byId[cursor.parent_id];
    }
    return depth;
  }

  function renderCategoryChecks(checkedIds) {
    if (!el.productCats) return;
    if (!state.categories.length) {
      el.productCats.innerHTML = '<p class="empty">لا توجد فئات بعد.</p>';
      return;
    }
    el.productCats.innerHTML = state.categories.map(function (c) {
      var on = checkedIds.indexOf(Number(c.id)) !== -1;
      return '<label class="check" style="padding-right:' + (categoryDepth(c) * 14) + 'px">' +
        '<input type="checkbox" value="' + c.id + '"' + (on ? ' checked' : '') + '> ' +
        esc(c.name_ar) + (c.is_active ? '' : ' <span class="muted">(مخفية)</span>') + '</label>';
    }).join('');
  }

  function checkedCategoryIds() {
    var out = [];
    if (!el.productCats) return out;
    var boxes = el.productCats.querySelectorAll('input:checked');
    for (var i = 0; i < boxes.length; i++) out.push(Number(boxes[i].value));
    return out;
  }

  /* ---------------- dashboard ---------------- */

  function renderStats(s) {
    if (!el.statGrid) return;
    var cards = STAT_CARDS.map(function (c) {
      return '<div class="stat"><span class="stat-label">' + esc(c[1]) + '</span>' +
        '<span class="stat-value">' + num(s[c[0]]) + '</span>' +
        (c[2] ? '<span class="stat-unit">' + c[2] + '</span>' : '') + '</div>';
    }).join('');

    var top = (s.top_sellers || []).map(function (t, i) {
      return '<li><span class="rank">' + (i + 1) + '</span>' +
        '<span class="ts-name">' + esc(t.name_ar) + '</span>' +
        '<span class="ts-units">' + num(t.units_sold) + ' قطعة</span>' +
        '<span class="ts-rev">' + num(t.revenue) + ' ريال</span></li>';
    }).join('');

    cards += '<div class="stat stat-wide"><span class="stat-label">الأكثر مبيعاً</span>' +
      (top ? '<ol class="top-list">' + top + '</ol>' : '<p class="empty">لا توجد مبيعات بعد.</p>') + '</div>';

    el.statGrid.innerHTML = cards;
  }

  function loadStats() {
    return api('GET', '/admin/stats').then(function (r) {
      renderStats(r.data || {});
    }).catch(function (e) {
      if (isAuthed()) toast(e.message, 'error');
    });
  }

  function loadDashboard() {
    return Promise.all([loadStats(), loadOrders()]);
  }

  /* ---------------- orders ---------------- */

  function renderOrders() {
    if (!el.ordersBody) return;
    var rows = state.orders.items;
    if (!rows.length) {
      el.ordersBody.innerHTML = '<p class="empty">لا توجد طلبات مطابقة.</p>';
      return;
    }
    el.ordersBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>رقم الطلب</th><th>العميل</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th>تغيير الحالة</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (o) {
        var c = o.customer || {};
        return '<tr>' +
          '<td><b>' + esc(o.order_number) + '</b><br><span class="muted">' + esc(fmtDate(o.placed_at)) + '</span></td>' +
          '<td>' + esc(c.name) + '<br><span class="muted">' + esc(c.phone) + '</span></td>' +
          '<td>' + num(o.total) + ' ريال</td>' +
          '<td>' + esc(PAYMENTS[o.payment_method] || o.payment_method) +
            (o.loan_requested ? ' <span class="tag-loan">تمويل</span>' : '') + '</td>' +
          '<td><span class="badge-status ' + esc(o.status) + '">' + esc(statusLabel(o.status)) + '</span></td>' +
          '<td><select class="status-select" data-order="' + esc(o.id) + '">' + statusOptions(o.status) + '</select></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadOrders() {
    if (!el.ordersBody) return Promise.resolve();
    if (!isAuthed()) { showLogin(); return Promise.resolve(); }
    loading(el.ordersBody);

    var p = new URLSearchParams();
    p.set('page', state.orders.page);
    p.set('limit', state.orders.limit);
    if (state.orders.status) p.set('status', state.orders.status);

    return api('GET', '/admin/orders?' + p.toString()).then(function (r) {
      var meta = r.meta || {};
      state.orders.items = r.data || [];
      state.orders.total = Number(meta.total || 0);
      state.orders.totalPages = Number(meta.totalPages || 1);
      state.orders.page = Number(meta.page || 1);
      renderOrders();
      renderPager(el.ordersPager, state.orders.page, state.orders.totalPages);
    }).catch(function (e) { failed(el.ordersBody, e); });
  }

  function changeOrderStatus(id, status) {
    api('PATCH', '/admin/orders/' + encodeURIComponent(id) + '/status', { status: status })
      .then(function () {
        toast('تم تحديث حالة الطلب ' + statusLabel(status));
        return Promise.all([loadOrders(), loadStats()]);
      })
      .catch(function (e) {
        // Re-render the row so the select snaps back to the stored status.
        toast(e.message, 'error');
        loadOrders();
      });
  }

  /* ---------------- products ---------------- */

  function renderProducts() {
    if (!el.productsBody) return;
    var rows = state.products.items;
    if (!rows.length) {
      el.productsBody.innerHTML = '<p class="empty">لا توجد منتجات مطابقة.</p>';
      return;
    }
    el.productsBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>المنتج</th><th>السعر</th><th>المخزون</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr>' +
          '<td><div class="cell-media">' +
            (p.primary_image
              ? '<img src="' + esc(p.primary_image) + '" alt="" onerror="this.remove()">'
              : '<span class="no-img"></span>') +
            '<div><b>' + esc(p.name_ar) + '</b><br>' +
            '<span class="muted">#' + esc(p.id) + ' &middot; ' + esc(p.slug) +
            (p.brand_name_ar ? ' &middot; ' + esc(p.brand_name_ar) : '') + '</span></div>' +
          '</div></td>' +
          '<td>' + num(p.price) + ' ريال' +
            (p.sale_price !== null ? '<br><span class="muted">أساسي ' + num(p.base_price) + '</span>' : '') + '</td>' +
          '<td>' + num(p.stock_quantity) + '</td>' +
          '<td>' + badge(p.is_active, 'معروض', 'مخفي') +
            (p.is_featured ? ' <span class="tag-loan">مميز</span>' : '') +
            (p.is_loanable ? ' <span class="tag-loan">تمويل</span>' : '') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-edit="' + esc(p.id) + '">تعديل</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(p.id) + '">حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadProducts() {
    if (!el.productsBody) return Promise.resolve();
    loading(el.productsBody);

    var p = new URLSearchParams();
    p.set('page', state.products.page);
    p.set('limit', state.products.limit);
    if (state.products.q) p.set('q', state.products.q);
    if (state.products.brand) p.set('brand', state.products.brand);
    if (state.products.active) p.set('active', state.products.active);

    return api('GET', '/admin/products?' + p.toString()).then(function (r) {
      var m = r.meta || {};
      state.products.items = r.data || [];
      state.products.page = Number(m.page || 1);
      state.products.totalPages = Number(m.totalPages || 1);
      state.products.total = Number(m.total || 0);
      renderProducts();
      renderPager(el.productsPager, state.products.page, state.products.totalPages);
    }).catch(function (e) { failed(el.productsBody, e); });
  }

  function closeProductEditor() {
    if (el.productEditor) el.productEditor.hidden = true;
    state.historyProductId = null;
  }

  /* ---------------- product images: upload + preview ---------------- */

  /** Hidden textarea is the single source of truth, one path per line. */
  function imageLines() {
    var form = el.productEditForm;
    if (!form || !form.elements['images']) return [];
    return String(form.elements['images'].value || '').split('\n')
      .map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function setImageLines(lines) {
    var form = el.productEditForm;
    if (form && form.elements['images']) form.elements['images'].value = lines.join('\n');
    renderImagePreviews();
  }

  function renderImagePreviews() {
    if (!el.productImgPreview) return;
    var lines = imageLines();
    if (!lines.length) {
      el.productImgPreview.hidden = true;
      el.productImgPreview.innerHTML = '';
      return;
    }
    el.productImgPreview.hidden = false;
    el.productImgPreview.innerHTML = lines.map(function (p, i) {
      return '<div class="img-chip">' +
        '<img src="' + esc(p) + '" alt="" onerror="this.remove()">' +
        (i === 0 ? '<span class="img-chip-tag">رئيسية</span>' : '') +
        '<button type="button" class="img-chip-x" data-img-remove="' + i + '" title="حذف الصورة">&times;</button>' +
      '</div>';
    }).join('');
  }

  /** POSTs the picked file to /admin/uploads and stores the returned path. */
  function uploadProductImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast('الملف المختار ليس صورة', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { toast('حجم الصورة يتجاوز 5 ميغابايت', 'error'); return; }

    var fd = new FormData();
    fd.append('image', file);
    var headers = {};
    var token = getAccess();
    if (token) headers.Authorization = 'Bearer ' + token;

    if (el.productImgBtn) el.productImgBtn.disabled = true;

    fetch(API + '/admin/uploads', { method: 'POST', headers: headers, body: fd })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          if (res.status === 401 || res.status === 403) {
            endSession(res.status === 401
              ? 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد'
              : 'لا تملك صلاحية الوصول، يرجى تسجيل الدخول من جديد');
          }
          if (!res.ok) throw apiError(res, json);
          return json ? json.data : null;
        });
      })
      .then(function (data) {
        if (!data || !data.path) return;
        var lines = imageLines();
        lines.push(data.path);
        setImageLines(lines);
        toast('تم رفع الصورة — لا تنسَ حفظ المنتج');
      })
      .catch(function (e) { toast(e.message || 'تعذر رفع الصورة', 'error'); })
      .finally(function () {
        if (el.productImgBtn) el.productImgBtn.disabled = false;
        if (el.productImgInput) el.productImgInput.value = '';
      });
  }

  function openProductEditor(id) {
    if (!el.productEditor || !el.productEditForm) return;
    var form = el.productEditForm;

    if (!id) {
      setForm(form, {
        id: '',
        name_ar: '', name_en: '', brand_id: '', stock_quantity: 0,
        description: '', base_price: '', sale_price: '',
        is_active: true, is_featured: false, is_loanable: false
      });
      form.elements['images'].value = '';
      renderImagePreviews();
      renderCategoryChecks([]);
      el.productEditorTitle.textContent = 'منتج جديد';
      el.productHistoryWrap.hidden = true;
      el.historyBody.innerHTML = '';
      state.historyProductId = null;
      el.productEditor.hidden = false;
      el.productEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    el.productEditor.hidden = false;
    el.productEditorTitle.textContent = 'تعديل المنتج #' + id;
    el.productEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    api('GET', '/admin/products/' + encodeURIComponent(id)).then(function (r) {
      var p = r.data;
      setForm(form, {
        id: p.id,
        name_ar: p.name_ar,
        name_en: p.name_en,
        brand_id: p.brand_id || '',
        stock_quantity: p.stock_quantity,
        description: p.description,
        base_price: p.base_price,
        sale_price: p.sale_price === null ? '' : p.sale_price,
        reason: '',
        is_active: p.is_active,
        is_featured: p.is_featured,
        is_loanable: p.is_loanable
      });
      // attachRelations orders images primary-first, so line 1 stays the hero.
      form.elements['images'].value = (p.images || []).map(function (i) { return i.path; }).join('\n');
      renderImagePreviews();
      renderCategoryChecks(p.category_ids || []);
      state.historyProductId = p.id;
      el.productHistoryWrap.hidden = false;
      loadHistory(p.id);
    }).catch(function (e) { toast(e.message, 'error'); });
  }

  function loadHistory(productId) {
    if (!el.historyBody) return;
    loading(el.historyBody);
    api('GET', '/admin/products/' + encodeURIComponent(productId) + '/price-history')
      .then(function (r) { renderHistory(r.data || []); })
      .catch(function (e) { failed(el.historyBody, e); });
  }

  function renderHistory(rows) {
    if (!el.historyBody) return;
    if (!rows.length) {
      el.historyBody.innerHTML = '<p class="empty">لا يوجد سجل أسعار.</p>';
      return;
    }
    el.historyBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>السعر السابق</th><th>السعر الجديد</th><th>السبب</th><th>بواسطة</th><th>التاريخ</th><th></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (h) {
        return '<tr>' +
          '<td>' + (h.old_price === null ? '—' : num(h.old_price)) + '</td>' +
          '<td>' + num(h.new_price) + '</td>' +
          '<td>' + esc(h.reason) + '</td>' +
          '<td>' + esc(h.changed_by_name) + '</td>' +
          '<td class="muted">' + esc(fmtDate(h.changed_at)) + '</td>' +
          '<td class="row-actions"><button class="btn-ghost btn-xs danger" data-del-history="' + esc(h.id) + '">حذف</button></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function saveProduct(e) {
    e.preventDefault();
    var form = el.productEditForm;
    if (!form) return;

    var id = txt(form, 'id');
    var nameAr = txt(form, 'name_ar');
    var basePrice = txt(form, 'base_price');
    if (nameAr.length < 3) { toast('اسم المنتج مطلوب (3 أحرف على الأقل)', 'error'); return; }
    if (basePrice === '' || isNaN(Number(basePrice))) { toast('السعر الأساسي مطلوب', 'error'); return; }

    var saleRaw = txt(form, 'sale_price');
    var brandRaw = txt(form, 'brand_id');
    var payload = {
      name_ar: nameAr,
      name_en: txt(form, 'name_en') || null,
      description: txt(form, 'description') || null,
      brand_id: brandRaw === '' ? null : Number(brandRaw),
      base_price: Number(basePrice),
      sale_price: saleRaw === '' ? null : Number(saleRaw),
      stock_quantity: Number(txt(form, 'stock_quantity') || 0),
      is_active: cb(form, 'is_active'),
      is_featured: cb(form, 'is_featured'),
      is_loanable: cb(form, 'is_loanable'),
      category_ids: checkedCategoryIds(),
      images: String(form.elements['images'].value || '')
        .split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
    };
    var reason = txt(form, 'reason');
    if (reason) payload.reason = reason;

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;

    var req = id
      ? api('PATCH', '/admin/products/' + encodeURIComponent(id), payload)
      : api('POST', '/admin/products', payload);

    req.then(function () {
      toast(id ? 'تم تحديث المنتج' : 'تم إنشاء المنتج');
      if (id) openProductEditor(id);
      else closeProductEditor();
      return loadProducts();
    })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deleteProduct(id) {
    if (!confirm('حذف المنتج #' + id + ' نهائياً مع صوره وفئاته وسجل أسعاره؟')) return;
    api('DELETE', '/admin/products/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف المنتج');
        if (String(state.historyProductId) === String(id)) closeProductEditor();
        return loadProducts();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  function deletePriceHistoryEntry(id) {
    if (!confirm('حذف هذا السطر من سجل الأسعار؟')) return;
    api('DELETE', '/admin/price-history/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف السطر من سجل الأسعار');
        if (state.historyProductId) loadHistory(state.historyProductId);
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- categories ---------------- */

  function renderCategories() {
    if (!el.categoriesBody) return;
    var rows = state.categories;
    if (!rows.length) {
      el.categoriesBody.innerHTML = '<p class="empty">لا توجد فئات.</p>';
      return;
    }
    var byId = {};
    rows.forEach(function (c) { byId[c.id] = c; });

    el.categoriesBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>#</th><th>الاسم</th><th>slug</th><th>الفئة الأب</th><th>الترتيب</th><th>المنتجات</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (c) {
        var parent = c.parent_id ? byId[c.parent_id] : null;
        return '<tr>' +
          '<td>' + esc(c.id) + '</td>' +
          '<td><b>' + esc(c.name_ar) + '</b>' + (c.name_en ? '<br><span class="muted">' + esc(c.name_en) + '</span>' : '') + '</td>' +
          '<td class="muted">' + esc(c.slug) + '</td>' +
          '<td>' + (parent ? esc(parent.name_ar) : '<span class="muted">—</span>') + '</td>' +
          '<td>' + esc(c.sort_order) + '</td>' +
          '<td>' + num(c.product_count) + '</td>' +
          '<td>' + badge(c.is_active, 'معروضة', 'مخفية') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-edit="' + esc(c.id) + '">تعديل</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(c.id) + '">حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function openCategoryEditor(id) {
    if (!el.categoryEditor || !el.categoryEditForm) return;
    var form = el.categoryEditForm;
    el.categoryEditor.hidden = false;

    if (!id) {
      setForm(form, { id: '', name_ar: '', name_en: '', parent_id: '', sort_order: 0, is_active: true });
      el.categoryEditorTitle.textContent = 'فئة جديدة';
      fillCategoryParent();
      el.categoryEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var cat = null;
    state.categories.forEach(function (c) { if (Number(c.id) === Number(id)) cat = c; });
    if (!cat) { toast('الفئة غير موجودة في القائمة', 'error'); return; }

    setForm(form, {
      id: cat.id,
      name_ar: cat.name_ar,
      name_en: cat.name_en,
      parent_id: cat.parent_id || '',
      sort_order: cat.sort_order,
      is_active: cat.is_active
    });
    el.categoryEditorTitle.textContent = 'تعديل الفئة #' + cat.id;
    fillCategoryParent(cat.id);
    el.categoryEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveCategory(e) {
    e.preventDefault();
    var form = el.categoryEditForm;
    var id = txt(form, 'id');
    var nameAr = txt(form, 'name_ar');
    if (nameAr.length < 2) { toast('اسم الفئة مطلوب', 'error'); return; }

    var parentRaw = txt(form, 'parent_id');
    var payload = {
      name_ar: nameAr,
      name_en: txt(form, 'name_en') || null,
      parent_id: parentRaw === '' ? null : Number(parentRaw),
      sort_order: Number(txt(form, 'sort_order') || 0),
      is_active: cb(form, 'is_active')
    };

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    var req = id
      ? api('PATCH', '/admin/categories/' + encodeURIComponent(id), payload)
      : api('POST', '/admin/categories', payload);

    req.then(function () {
      toast(id ? 'تم تحديث الفئة' : 'تم إنشاء الفئة');
      el.categoryEditor.hidden = true;
      resetRefs();
      return loadRefs().then(function () {
        renderCategories();
        renderCategoryChecks(checkedCategoryIds());
      });
    })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deleteCategory(id) {
    if (!confirm('حذف الفئة #' + id + '؟ سيتم أيضاً حذف تابعاتها وارتباطات منتجاتها.')) return;
    api('DELETE', '/admin/categories/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف الفئة');
        resetRefs();
        return loadRefs().then(renderCategories);
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- brands ---------------- */

  function renderBrands() {
    if (!el.brandsBody) return;
    var rows = state.brands;
    if (!rows.length) {
      el.brandsBody.innerHTML = '<p class="empty">لا توجد ماركات.</p>';
      return;
    }
    el.brandsBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>#</th><th>الاسم</th><th>slug</th><th>المنتجات</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (b) {
        return '<tr>' +
          '<td>' + esc(b.id) + '</td>' +
          '<td><b>' + esc(b.name_ar) + '</b>' + (b.name_en ? '<br><span class="muted">' + esc(b.name_en) + '</span>' : '') + '</td>' +
          '<td class="muted">' + esc(b.slug) + '</td>' +
          '<td>' + num(b.product_count) + '</td>' +
          '<td>' + badge(b.is_active, 'معروضة', 'مخفية') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-edit="' + esc(b.id) + '">تعديل</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(b.id) + '">حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function openBrandEditor(id) {
    if (!el.brandEditor || !el.brandEditForm) return;
    var form = el.brandEditForm;
    el.brandEditor.hidden = false;

    if (!id) {
      setForm(form, { id: '', name_ar: '', name_en: '', is_active: true });
      el.brandEditorTitle.textContent = 'ماركة جديدة';
      el.brandEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var brand = null;
    state.brands.forEach(function (b) { if (Number(b.id) === Number(id)) brand = b; });
    if (!brand) { toast('الماركة غير موجودة في القائمة', 'error'); return; }

    setForm(form, { id: brand.id, name_ar: brand.name_ar, name_en: brand.name_en, is_active: brand.is_active });
    el.brandEditorTitle.textContent = 'تعديل الماركة #' + brand.id;
    el.brandEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function saveBrand(e) {
    e.preventDefault();
    var form = el.brandEditForm;
    var id = txt(form, 'id');
    var nameAr = txt(form, 'name_ar');
    if (nameAr.length < 2) { toast('اسم الماركة مطلوب', 'error'); return; }

    var payload = {
      name_ar: nameAr,
      name_en: txt(form, 'name_en') || null,
      is_active: cb(form, 'is_active')
    };

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    var req = id
      ? api('PATCH', '/admin/brands/' + encodeURIComponent(id), payload)
      : api('POST', '/admin/brands', payload);

    req.then(function () {
      toast(id ? 'تم تحديث الماركة' : 'تم إنشاء الماركة');
      el.brandEditor.hidden = true;
      resetRefs();
      return loadRefs().then(function () {
        renderBrands();
        fillBrandSelects();
      });
    })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deleteBrand(id) {
    if (!confirm('حذف الماركة #' + id + '؟ ستصبح منتجاتها بدون ماركة.')) return;
    api('DELETE', '/admin/brands/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف الماركة');
        resetRefs();
        return loadRefs().then(renderBrands);
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- customers ---------------- */

  function renderCustomers() {
    if (!el.customersBody) return;
    var rows = state.customers.items;
    if (!rows.length) {
      el.customersBody.innerHTML = '<p class="empty">لا يوجد عملاء مطابقون.</p>';
      return;
    }
    el.customersBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>#</th><th>العميل</th><th>الجوال</th><th>المدينة</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr>' +
          '<td>' + esc(c.id) + '</td>' +
          '<td><b>' + esc(c.full_name) + '</b><br><span class="muted">' + esc(c.email) + '</span></td>' +
          '<td>' + esc(c.phone) + '</td>' +
          '<td>' + esc(c.city || '—') + '</td>' +
          '<td>' + badge(c.is_active, 'نشط', 'معطل') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-edit="' + esc(c.id) + '">تعديل</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(c.id) + '">حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadCustomers() {
    if (!el.customersBody) return Promise.resolve();
    loading(el.customersBody);

    var p = new URLSearchParams();
    p.set('page', state.customers.page);
    p.set('limit', state.customers.limit);
    if (state.customers.q) p.set('q', state.customers.q);
    if (state.customers.active) p.set('active', state.customers.active);

    return api('GET', '/admin/customers?' + p.toString()).then(function (r) {
      var m = r.meta || {};
      state.customers.items = r.data || [];
      state.customers.page = Number(m.page || 1);
      state.customers.totalPages = Number(m.totalPages || 1);
      state.customers.total = Number(m.total || 0);
      renderCustomers();
      renderPager(el.customersPager, state.customers.page, state.customers.totalPages);
    }).catch(function (e) { failed(el.customersBody, e); });
  }

  function openCustomerEditor(id) {
    if (!el.customerEditor || !el.customerEditForm) return;
    var form = el.customerEditForm;
    el.customerEditor.hidden = false;
    el.customerEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!id) {
      setForm(form, {
        id: '', full_name: '', email: '', phone: '', password: '',
        country: 'السعودية', city: '', district: '', street: '', building: '',
        is_active: true
      });
      form.elements['password'].placeholder = 'مطلوبة لإنشاء الحساب';
      el.customerEditorTitle.textContent = 'عميل جديد';
      return;
    }

    var row = null;
    state.customers.items.forEach(function (c) { if (Number(c.id) === Number(id)) row = c; });

    var fill = function (c) {
      setForm(form, {
        id: c.id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        password: '',
        country: c.country,
        city: c.city,
        district: c.district,
        street: c.street,
        building: c.building,
        is_active: c.is_active
      });
      form.elements['password'].placeholder = 'اتركها فارغة لعدم التغيير';
      el.customerEditorTitle.textContent = 'تعديل العميل #' + c.id;
    };

    if (row) fill(row);
    else api('GET', '/admin/customers/' + encodeURIComponent(id)).then(function (r) { fill(r.data); })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  function saveCustomer(e) {
    e.preventDefault();
    var form = el.customerEditForm;
    var id = txt(form, 'id');
    var payload = {
      full_name: txt(form, 'full_name'),
      email: txt(form, 'email'),
      phone: txt(form, 'phone'),
      country: txt(form, 'country'),
      city: txt(form, 'city'),
      district: txt(form, 'district'),
      street: txt(form, 'street'),
      building: txt(form, 'building'),
      is_active: cb(form, 'is_active')
    };
    var password = txt(form, 'password');
    if (password) payload.password = password;

    if (!payload.full_name || !payload.email || !payload.phone) {
      toast('الاسم والبريد والجوال مطلوبة', 'error'); return;
    }
    if (!id && !password) { toast('كلمة المرور مطلوبة عند إنشاء عميل جديد', 'error'); return; }

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    var req = id
      ? api('PATCH', '/admin/customers/' + encodeURIComponent(id), payload)
      : api('POST', '/admin/customers', payload);

    req.then(function () {
      toast(id ? 'تم تحديث العميل' : 'تم إنشاء العميل');
      el.customerEditor.hidden = true;
      return loadCustomers();
    })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deleteCustomer(id) {
    if (!confirm('حذف العميل #' + id + '؟ سيُحذف سلته ومفضّلته وعناوينه وطلباته نهائياً.')) return;
    api('DELETE', '/admin/customers/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف العميل');
        el.customerEditor.hidden = true;
        return loadCustomers();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- admin accounts ---------------- */

  function isSelf(id) {
    return state.admin && Number(state.admin.id) === Number(id);
  }

  function renderAdminAccounts() {
    if (!el.adminsBody) return;
    var rows = state.adminAccounts;
    if (!rows.length) {
      el.adminsBody.innerHTML = '<p class="empty">لا توجد حسابات.</p>';
      return;
    }
    el.adminsBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>#</th><th>المشرف</th><th>الجوال</th><th>الحالة</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (a) {
        var self = isSelf(a.id);
        return '<tr>' +
          '<td>' + esc(a.id) + '</td>' +
          '<td><b>' + esc(a.full_name) + '</b><br><span class="muted">' + esc(a.email) + '</span></td>' +
          '<td>' + esc(a.phone) + '</td>' +
          '<td>' + badge(a.is_active, 'نشط', 'معطل') + (self ? ' <span class="tag-loan">أنت</span>' : '') + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-edit="' + esc(a.id) + '">تعديل</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(a.id) + '"' +
              (self ? ' disabled title="لا يمكن حذف حسابك"' : '') + '>حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadAdminAccounts() {
    if (!el.adminsBody) return Promise.resolve();
    loading(el.adminsBody);
    return api('GET', '/admin/admins').then(function (r) {
      state.adminAccounts = r.data || [];
      renderAdminAccounts();
    }).catch(function (e) { failed(el.adminsBody, e); });
  }

  function openAdminEditor(id) {
    if (!el.adminEditor || !el.adminEditForm) return;
    var form = el.adminEditForm;
    el.adminEditor.hidden = false;
    el.adminEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!id) {
      setForm(form, { id: '', full_name: '', email: '', phone: '', password: '', is_active: true });
      form.elements['password'].placeholder = 'مطلوبة لإنشاء الحساب';
      form.elements['is_active'].disabled = false;
      el.adminEditorTitle.textContent = 'حساب مشرف جديد';
      return;
    }

    var row = null;
    state.adminAccounts.forEach(function (a) { if (Number(a.id) === Number(id)) row = a; });
    if (!row) { toast('الحساب غير موجود', 'error'); return; }

    setForm(form, {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      password: '',
      is_active: row.is_active
    });
    form.elements['password'].placeholder = 'اتركها فارغة لعدم التغيير';
    // The server refuses self-deactivation too; reflect it in the form.
    form.elements['is_active'].disabled = isSelf(row.id);
    el.adminEditorTitle.textContent = 'تعديل حساب المشرف #' + row.id + (isSelf(row.id) ? ' (حسابك)' : '');
  }

  function saveAdminAccount(e) {
    e.preventDefault();
    var form = el.adminEditForm;
    var id = txt(form, 'id');
    var payload = {
      full_name: txt(form, 'full_name'),
      email: txt(form, 'email'),
      phone: txt(form, 'phone'),
      is_active: cb(form, 'is_active')
    };
    var password = txt(form, 'password');
    if (password) payload.password = password;

    if (!payload.full_name || !payload.email || !payload.phone) {
      toast('الاسم والبريد والجوال مطلوبة', 'error'); return;
    }
    if (!id && !password) { toast('كلمة المرور مطلوبة عند إنشاء حساب', 'error'); return; }

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    var req = id
      ? api('PATCH', '/admin/admins/' + encodeURIComponent(id), payload)
      : api('POST', '/admin/admins', payload);

    req.then(function () {
      toast(id ? 'تم تحديث الحساب' : 'تم إنشاء الحساب');
      el.adminEditor.hidden = true;
      return loadAdminAccounts();
    })
      .catch(function (err) { toast(err.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  function deleteAdminAccount(id) {
    if (isSelf(id)) { toast('لا يمكنك حذف حسابك الذي سجّلت به', 'error'); return; }
    if (!confirm('حذف حساب المشرف #' + id + '؟')) return;
    api('DELETE', '/admin/admins/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف الحساب');
        el.adminEditor.hidden = true;
        return loadAdminAccounts();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- carts ---------------- */

  function renderCarts() {
    if (!el.cartsBody) return;
    var rows = state.carts.items;
    if (!rows.length) {
      el.cartsBody.innerHTML = '<p class="empty">لا توجد سلات مطابقة.</p>';
      return;
    }
    el.cartsBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>#</th><th>العميل</th><th>الأصناف</th><th>الإجمالي</th><th>آخر تحديث</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      rows.map(function (c) {
        return '<tr' + (Number(c.id) === Number(state.openCartId) ? ' class="row-active"' : '') + '>' +
          '<td>' + esc(c.id) + '</td>' +
          '<td><b>' + esc(c.customer.full_name) + '</b><br><span class="muted">' + esc(c.customer.email) + '</span></td>' +
          '<td>' + num(c.line_count) + ' سطر &middot; ' + num(c.units) + ' قطعة</td>' +
          '<td>' + num(c.total) + ' ريال</td>' +
          '<td class="muted">' + esc(fmtDate(c.updated_at)) + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs" data-open="' + esc(c.id) + '">فتح السلة</button>' +
            '<button class="btn-ghost btn-xs danger" data-del="' + esc(c.id) + '">حذف</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadCarts() {
    if (!el.cartsBody) return Promise.resolve();
    loading(el.cartsBody);

    var p = new URLSearchParams();
    p.set('page', state.carts.page);
    p.set('limit', state.carts.limit);
    if (state.carts.q) p.set('q', state.carts.q);

    return api('GET', '/admin/carts?' + p.toString()).then(function (r) {
      var m = r.meta || {};
      state.carts.items = r.data || [];
      state.carts.page = Number(m.page || 1);
      state.carts.totalPages = Number(m.totalPages || 1);
      state.carts.total = Number(m.total || 0);
      renderCarts();
      renderPager(el.cartsPager, state.carts.page, state.carts.totalPages);
    }).catch(function (e) { failed(el.cartsBody, e); });
  }

  function renderCartLines(cart) {
    if (!el.cartLinesBody) return;
    el.cartDetailTitle.textContent = 'سلة #' + cart.id + ' — ' + cart.customer.full_name;

    if (!cart.lines.length) {
      el.cartLinesBody.innerHTML = '<p class="empty">السلة فارغة.</p>';
      return;
    }
    el.cartLinesBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>المنتج</th><th>سعر الوحدة</th><th>الكمية</th><th>الإجمالي</th><th>إجراءات</th>' +
      '</tr></thead><tbody>' +
      cart.lines.map(function (l) {
        return '<tr>' +
          '<td><b>' + esc(l.product_name || 'منتج محذوف (#' + l.product_id + ')') + '</b><br>' +
            '<span class="muted">' + esc(l.product_slug || '') + '</span></td>' +
          '<td>' + num(l.price) + '</td>' +
          '<td><input class="line-qty" type="number" min="1" max="999" value="' + esc(l.amount) + '" data-line="' + esc(l.id) + '"></td>' +
          '<td>' + num(l.line_total) + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn-ghost btn-xs danger" data-del-line="' + esc(l.id) + '">حذف السطر</button>' +
          '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function openCart(id) {
    if (!el.cartDetailCard) return;
    state.openCartId = id;
    el.cartDetailCard.hidden = false;
    loading(el.cartLinesBody);
    el.cartDetailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    api('GET', '/admin/carts/' + encodeURIComponent(id)).then(function (r) {
      renderCartLines(r.data);
      renderCarts();
    }).catch(function (e) { failed(el.cartLinesBody, e); });
  }

  function closeCartDetail() {
    state.openCartId = null;
    if (el.cartDetailCard) el.cartDetailCard.hidden = true;
    if (el.cartLinesBody) el.cartLinesBody.innerHTML = '';
    renderCarts();
  }

  function updateCartLine(lineId, amount) {
    if (!state.openCartId) return;
    api('PATCH', '/admin/carts/' + encodeURIComponent(state.openCartId) +
      '/lines/' + encodeURIComponent(lineId), { amount: amount })
      .then(function (r) {
        renderCartLines(r.data);
        toast(amount === 0 ? 'تم حذف السطر' : 'تم تحديث الكمية');
        return loadCarts();
      })
      .catch(function (e) {
        toast(e.message, 'error');
        openCart(state.openCartId);
      });
  }

  function deleteCartLine(lineId) {
    if (!state.openCartId) return;
    if (!confirm('حذف هذا السطر من السلة؟')) return;
    api('DELETE', '/admin/carts/' + encodeURIComponent(state.openCartId) +
      '/lines/' + encodeURIComponent(lineId))
      .then(function (r) {
        renderCartLines(r.data);
        toast('تم حذف السطر');
        return loadCarts();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  function deleteCart(id) {
    if (!confirm('حذف السلة #' + id + ' بالكامل؟')) return;
    api('DELETE', '/admin/carts/' + encodeURIComponent(id))
      .then(function () {
        toast('تم حذف السلة');
        if (Number(state.openCartId) === Number(id)) closeCartDetail();
        return loadCarts();
      })
      .catch(function (e) { toast(e.message, 'error'); });
  }

  /* ---------------- sign in / out ---------------- */

  function signIn(identifier, password) {
    var form = el.adminLoginForm;
    var err = form.querySelector('[data-error]');
    var btn = form.querySelector('[type="submit"]');
    if (err) err.hidden = true;
    if (btn) btn.disabled = true;

    return api('POST', '/auth/admin/login', { identifier: identifier, password: password }, true)
      .then(function (r) {
        saveSession(r.data);
        form.reset();
        showPanel();
        toast('أهلاً ' + ((state.admin && state.admin.full_name) || 'بالمشرف'));
        switchTab('dashboard');
      })
      .catch(function (e) {
        if (err) { err.textContent = e.message; err.hidden = false; }
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ---------------- event wiring ---------------- */

  var pagerActions = {};

  function wire() {
    if (el.adminLoginForm) {
      el.adminLoginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(el.adminLoginForm);
        signIn(String(fd.get('identifier') || '').trim(), String(fd.get('password') || ''));
      });
    }

    if (el.adminSignout) {
      el.adminSignout.addEventListener('click', function () {
        // No admin logout endpoint: the customer /auth/logout revokes a refresh
        // token, and admin sessions never had one. Dropping the token locally
        // is the whole of it.
        clearSession();
        resetPanels();
        showLogin();
        toast('تم تسجيل الخروج');
      });
    }

    /* ---- tabs ---- */
    on(el.adminTabs, '.tab-btn', function (btn) { switchTab(btn.getAttribute('data-tab')); });

    /* ---- pagers ---- */
    document.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.pg') : null;
      if (!b || b.disabled) return;
      var pager = b.closest('.pager');
      var fn = pager && pagerActions[pager.id];
      if (fn) fn(Number(b.getAttribute('data-page')));
    });
    pagerActions.ordersPager = function (page) { state.orders.page = page; loadOrders(); };
    pagerActions.productsPager = function (page) { state.products.page = page; loadProducts(); };
    pagerActions.customersPager = function (page) { state.customers.page = page; loadCustomers(); };
    pagerActions.cartsPager = function (page) { state.carts.page = page; loadCarts(); };

    /* ---- orders ---- */
    if (el.orderStatus) {
      el.orderStatus.innerHTML = '<option value="">كل الحالات</option>' +
        STATUSES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('');
      el.orderStatus.addEventListener('change', function () {
        state.orders.status = this.value;
        state.orders.page = 1;
        loadOrders();
      });
    }
    if (el.ordersReload) {
      el.ordersReload.addEventListener('click', function () {
        state.orders.page = 1;
        loadOrders();
      });
    }
    if (el.ordersBody) {
      el.ordersBody.addEventListener('change', function (e) {
        var sel = e.target.closest('.status-select');
        if (!sel) return;
        changeOrderStatus(sel.getAttribute('data-order'), sel.value);
      });
    }

    /* ---- products ---- */
    if (el.productQ) {
      el.productQ.addEventListener('input', debounce(function () {
        state.products.q = el.productQ.value.trim();
        state.products.page = 1;
        loadProducts();
      }, 350));
    }
    if (el.productBrand) {
      el.productBrand.addEventListener('change', function () {
        state.products.brand = this.value;
        state.products.page = 1;
        loadProducts();
      });
    }
    if (el.productActive) {
      el.productActive.addEventListener('change', function () {
        state.products.active = this.value;
        state.products.page = 1;
        loadProducts();
      });
    }
    if (el.productNew) {
      el.productNew.addEventListener('click', function () { openProductEditor(null); });
    }
    if (el.productCancel) {
      el.productCancel.addEventListener('click', closeProductEditor);
    }
    if (el.productEditForm) {
      el.productEditForm.addEventListener('submit', saveProduct);
    }
    if (el.productImgBtn && el.productImgInput) {
      el.productImgBtn.addEventListener('click', function () { el.productImgInput.click(); });
      el.productImgInput.addEventListener('change', function () {
        uploadProductImage(this.files && this.files[0]);
      });
    }
    on(el.productImgPreview, 'button[data-img-remove]', function (b) {
      var lines = imageLines();
      lines.splice(Number(b.getAttribute('data-img-remove')) || 0, 1);
      setImageLines(lines);
    });
    on(el.productsBody, 'button[data-edit]', function (b) {
      openProductEditor(b.getAttribute('data-edit'));
    });
    on(el.productsBody, 'button[data-del]', function (b) {
      deleteProduct(b.getAttribute('data-del'));
    });
    on(el.historyBody, 'button[data-del-history]', function (b) {
      deletePriceHistoryEntry(b.getAttribute('data-del-history'));
    });

    /* ---- categories ---- */
    if (el.categoryNew) {
      el.categoryNew.addEventListener('click', function () { openCategoryEditor(null); });
    }
    if (el.categoryCancel) {
      el.categoryCancel.addEventListener('click', function () { el.categoryEditor.hidden = true; });
    }
    if (el.categoryEditForm) {
      el.categoryEditForm.addEventListener('submit', saveCategory);
    }
    on(el.categoriesBody, 'button[data-edit]', function (b) {
      openCategoryEditor(b.getAttribute('data-edit'));
    });
    on(el.categoriesBody, 'button[data-del]', function (b) {
      deleteCategory(b.getAttribute('data-del'));
    });

    /* ---- brands ---- */
    if (el.brandNew) {
      el.brandNew.addEventListener('click', function () { openBrandEditor(null); });
    }
    if (el.brandCancel) {
      el.brandCancel.addEventListener('click', function () { el.brandEditor.hidden = true; });
    }
    if (el.brandEditForm) {
      el.brandEditForm.addEventListener('submit', saveBrand);
    }
    on(el.brandsBody, 'button[data-edit]', function (b) {
      openBrandEditor(b.getAttribute('data-edit'));
    });
    on(el.brandsBody, 'button[data-del]', function (b) {
      deleteBrand(b.getAttribute('data-del'));
    });

    /* ---- customers ---- */
    if (el.customerQ) {
      el.customerQ.addEventListener('input', debounce(function () {
        state.customers.q = el.customerQ.value.trim();
        state.customers.page = 1;
        loadCustomers();
      }, 350));
    }
    if (el.customerActive) {
      el.customerActive.addEventListener('change', function () {
        state.customers.active = this.value;
        state.customers.page = 1;
        loadCustomers();
      });
    }
    if (el.customerNew) {
      el.customerNew.addEventListener('click', function () { openCustomerEditor(null); });
    }
    if (el.customerCancel) {
      el.customerCancel.addEventListener('click', function () { el.customerEditor.hidden = true; });
    }
    if (el.customerEditForm) {
      el.customerEditForm.addEventListener('submit', saveCustomer);
    }
    on(el.customersBody, 'button[data-edit]', function (b) {
      openCustomerEditor(b.getAttribute('data-edit'));
    });
    on(el.customersBody, 'button[data-del]', function (b) {
      deleteCustomer(b.getAttribute('data-del'));
    });

    /* ---- admin accounts ---- */
    if (el.adminAccountNew) {
      el.adminAccountNew.addEventListener('click', function () { openAdminEditor(null); });
    }
    if (el.adminAccountCancel) {
      el.adminAccountCancel.addEventListener('click', function () { el.adminEditor.hidden = true; });
    }
    if (el.adminEditForm) {
      el.adminEditForm.addEventListener('submit', saveAdminAccount);
    }
    on(el.adminsBody, 'button[data-edit]', function (b) {
      openAdminEditor(b.getAttribute('data-edit'));
    });
    on(el.adminsBody, 'button[data-del]', function (b) {
      deleteAdminAccount(b.getAttribute('data-del'));
    });

    /* ---- carts ---- */
    if (el.cartQ) {
      el.cartQ.addEventListener('input', debounce(function () {
        state.carts.q = el.cartQ.value.trim();
        state.carts.page = 1;
        loadCarts();
      }, 350));
    }
    if (el.cartsReload) {
      el.cartsReload.addEventListener('click', function () {
        state.carts.page = 1;
        loadCarts();
      });
    }
    if (el.cartDetailClose) {
      el.cartDetailClose.addEventListener('click', closeCartDetail);
    }
    on(el.cartsBody, 'button[data-open]', function (b) {
      openCart(b.getAttribute('data-open'));
    });
    on(el.cartsBody, 'button[data-del]', function (b) {
      deleteCart(b.getAttribute('data-del'));
    });
    on(el.cartLinesBody, 'button[data-del-line]', function (b) {
      deleteCartLine(b.getAttribute('data-del-line'));
    });
    if (el.cartLinesBody) {
      el.cartLinesBody.addEventListener('change', function (e) {
        var input = e.target.closest ? e.target.closest('.line-qty') : null;
        if (!input) return;
        var amount = Number(input.value);
        if (!Number.isInteger(amount) || amount < 1) {
          toast('أدخل كمية صحيحة (1 فأكثر) أو احذف السطر', 'error');
          openCart(state.openCartId);
          return;
        }
        updateCartLine(input.getAttribute('data-line'), amount);
      });
    }
  }

  /* ---------------- tab loaders (wired after functions exist) ---------------- */

  TAB_LOADERS.dashboard = loadDashboard;
  TAB_LOADERS.products = function () {
    loadRefs().then(function () { fillBrandSelects(); return loadProducts(); });
  };
  TAB_LOADERS.categories = function () {
    loadRefs().then(function () { fillCategoryParent(); renderCategories(); });
  };
  TAB_LOADERS.brands = function () {
    loadRefs().then(function () { fillBrandSelects(); renderBrands(); });
  };
  TAB_LOADERS.customers = loadCustomers;
  TAB_LOADERS.admins = loadAdminAccounts;
  TAB_LOADERS.carts = loadCarts;

  /* ---------------- boot ---------------- */

  function boot() {
    cacheEls();
    restoreSession();
    wire();

    if (!isAuthed()) { showLogin(); return; }

    showPanel();
    // A stored token can be revoked or belong to a deactivated admin,
    // so confirm it before showing anything but the sign-in card.
    api('GET', '/auth/admin/me')
      .then(function (r) {
        state.admin = r.data || state.admin;
        showPanel();
        switchTab('dashboard');
      })
      .catch(function (e) {
        // A 401/403 already sent us back to the sign-in card; anything left is
        // a transport problem worth surfacing.
        if (isAuthed()) toast(e.message, 'error');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
