/* Watanya admin panel - signs in against POST /api/auth/admin/login.
   Plain ES5-style browser JavaScript, same as the storefront's script.js. */
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
  var LS = { access: 'watanya.admin.access', admin: 'watanya.admin.user', exp: 'watanya.admin.exp' };

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
    exp: 0,
    product: null,
    orders: { page: 1, limit: 10, status: '', totalPages: 1, total: 0, items: [] }
  };

  var el = {};
  function byId(id) { return document.getElementById(id); }
  function cacheEls() {
    ['adminLogin', 'adminLoginForm', 'adminPanel', 'adminName', 'adminSession', 'adminSignout',
     'statGrid', 'orderStatus', 'ordersReload', 'ordersBody', 'ordersPager', 'productForm',
     'productBody', 'priceForm', 'historyBody', 'toast'].forEach(function (id) {
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

  var toastTimer;
  function toast(msg, kind) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.className = 'toast' + (kind ? ' ' + kind : '');
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  /* ---------------- session storage ---------------- */

  function getAccess() { try { return localStorage.getItem(LS.access); } catch (e) { return null; } }

  function saveSession(data) {
    // The admin endpoint issues an access token only - there is no refresh
    // token - so expiresIn is the hard end of the session.
    var expiresIn = Number(data.expiresIn || 0);
    try {
      localStorage.setItem(LS.access, data.accessToken);
      localStorage.setItem(LS.admin, JSON.stringify(data.admin || null));
      localStorage.setItem(LS.exp, String(Date.now() + expiresIn * 1000));
    } catch (e) { /* private mode */ }
    state.admin = data.admin || null;
    state.exp = Date.now() + expiresIn * 1000;
  }

  function restoreSession() {
    try {
      var raw = localStorage.getItem(LS.admin);
      state.admin = raw ? JSON.parse(raw) : null;
      state.exp = Number(localStorage.getItem(LS.exp) || 0);
    } catch (e) { state.admin = null; }
  }

  function clearSession() {
    try {
      localStorage.removeItem(LS.access);
      localStorage.removeItem(LS.admin);
      localStorage.removeItem(LS.exp);
    } catch (e) { /* ignore */ }
    state.admin = null;
    state.exp = 0;
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

  /** Drops the token and returns to the sign-in card. */
  function endSession(message) {
    clearSession();
    state.product = null;
    state.orders.items = [];
    stopSessionTimer();
    if (el.statGrid) el.statGrid.innerHTML = '';
    if (el.ordersBody) el.ordersBody.innerHTML = '';
    if (el.ordersPager) { el.ordersPager.hidden = true; el.ordersPager.innerHTML = ''; }
    if (el.productBody) el.productBody.innerHTML = '';
    if (el.historyBody) el.historyBody.innerHTML = '';
    if (el.priceForm) el.priceForm.hidden = true;
    showLogin();
    if (message) toast(message, 'error');
  }

  /* ---------------- session countdown ---------------- */

  var sessionTimer = null;

  function stopSessionTimer() {
    if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  }

  function startSessionTimer() {
    stopSessionTimer();
    if (!state.exp || !el.adminSession) return;
    sessionTimer = setInterval(function () {
      if (!el.adminSession) return;
      var left = Math.max(0, Math.round((state.exp - Date.now()) / 1000));
      if (left <= 0) {
        endSession('انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد');
        return;
      }
      var s = left % 60;
      el.adminSession.textContent = 'تنتهي الجلسة خلال ' + Math.floor(left / 60) + ':' + (s < 10 ? '0' + s : s);
      el.adminSession.className = 'admin-session' + (left <= 120 ? ' warn' : '');
    }, 1000);
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

  function renderOrdersPager() {
    if (!el.ordersPager) return;
    var o = state.orders;
    if (o.totalPages <= 1) { el.ordersPager.hidden = true; el.ordersPager.innerHTML = ''; return; }
    var html = '<button class="pg" data-page="' + (o.page - 1) + '"' + (o.page <= 1 ? ' disabled' : '') + '>السابق</button>';
    for (var i = 1; i <= o.totalPages; i++) {
      html += '<button class="pg' + (i === o.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="pg" data-page="' + (o.page + 1) + '"' + (o.page >= o.totalPages ? ' disabled' : '') + '>التالي</button>';
    el.ordersPager.innerHTML = html;
    el.ordersPager.hidden = false;
  }

  function loadOrders() {
    if (!el.ordersBody) return Promise.resolve();
    if (!isAuthed()) { showLogin(); return Promise.resolve(); }
    el.ordersBody.innerHTML = '<p class="empty">جارٍ التحميل…</p>';

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
      renderOrdersPager();
    }).catch(function (e) {
      if (isAuthed()) {
        el.ordersBody.innerHTML = '<p class="empty">' + esc(e.message) + '</p>';
      }
    });
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

  /* ---------------- single product ---------------- */

  function renderProduct() {
    if (!el.productBody) return;
    var p = state.product;
    if (!p) {
      el.productBody.innerHTML = '<p class="empty">أدخل رقم منتج لعرض تفاصيله وإدارة سعره.</p>';
      if (el.priceForm) el.priceForm.hidden = true;
      if (el.historyBody) el.historyBody.innerHTML = '';
      return;
    }

    el.productBody.innerHTML =
      '<div class="product-head">' +
        (p.primary_image
          ? '<img src="' + esc(p.primary_image) + '" alt="" onerror="this.remove()">'
          : '<span class="no-img"></span>') +
        '<div>' +
          '<div class="product-name">' + esc(p.name_ar) + '</div>' +
          '<div class="muted">#' + esc(p.id) + ' &middot; ' + esc(p.slug) +
            (p.brand_name_ar ? ' &middot; ' + esc(p.brand_name_ar) : '') + '</div>' +
          '<div class="muted">المخزون: ' + num(p.stock_quantity) +
            ' &middot; ' + (p.is_active ? 'معروض' : 'مخفي') +
            (p.is_featured ? ' &middot; مميز' : '') +
            (p.is_loanable ? ' &middot; قابل للتمويل' : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="product-prices">' +
        '<span>السعر الحالي <b>' + num(p.price) + ' ريال</b></span>' +
        '<span>الأساسي <b>' + num(p.base_price) + '</b></span>' +
        '<span>البيع <b>' + (p.sale_price === null ? '—' : num(p.sale_price)) + '</b></span>' +
      '</div>';

    if (el.priceForm) {
      el.priceForm.hidden = false;
      el.priceForm.elements.base_price.value = p.base_price;
      el.priceForm.elements.sale_price.value = p.sale_price === null ? '' : p.sale_price;
    }
  }

  function renderHistory(rows) {
    if (!el.historyBody) return;
    var list = rows || [];
    if (!list.length) {
      el.historyBody.innerHTML = '<p class="empty">لا يوجد سجل أسعار.</p>';
      return;
    }
    el.historyBody.innerHTML =
      '<table class="admin-table"><thead><tr>' +
        '<th>السعر السابق</th><th>السعر الجديد</th><th>السبب</th><th>بواسطة</th><th>التاريخ</th>' +
      '</tr></thead><tbody>' +
      list.map(function (h) {
        return '<tr>' +
          '<td>' + (h.old_price === null ? '—' : num(h.old_price)) + '</td>' +
          '<td>' + num(h.new_price) + '</td>' +
          '<td>' + esc(h.reason) + '</td>' +
          '<td>' + esc(h.changed_by_name) + '</td>' +
          '<td class="muted">' + esc(fmtDate(h.changed_at)) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function loadProduct(id) {
    state.product = null;
    renderProduct();
    if (el.historyBody) el.historyBody.innerHTML = '<p class="empty">جارٍ التحميل…</p>';

    return api('GET', '/admin/products/' + encodeURIComponent(id))
      .then(function (r) {
        state.product = r.data;
        renderProduct();
        return api('GET', '/admin/products/' + encodeURIComponent(id) + '/price-history');
      })
      .then(function (r) {
        renderHistory(r.data);
      })
      .catch(function (e) {
        if (isAuthed()) {
          if (el.historyBody) el.historyBody.innerHTML = '';
          toast(e.message, 'error');
        }
      });
  }

  function savePrice() {
    var p = state.product;
    if (!p || !el.priceForm) return;
    var form = el.priceForm;
    var payload = {
      base_price: Number(form.elements.base_price.value),
      reason: String(form.elements.reason.value || '').trim() || undefined
    };
    var sale = String(form.elements.sale_price.value).trim();
    payload.sale_price = sale === '' ? null : Number(sale);

    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    api('PATCH', '/admin/products/' + encodeURIComponent(p.id), payload)
      .then(function (r) {
        state.product = r.data;
        renderProduct();
        form.elements.reason.value = '';
        toast('تم تحديث السعر');
        return loadProduct(p.id);
      })
      .catch(function (e) { toast(e.message, 'error'); })
      .finally(function () { if (btn) btn.disabled = false; });
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
        startSessionTimer();
        toast('أهلاً ' + ((state.admin && state.admin.full_name) || 'بالمشرف'));
        return Promise.all([loadStats(), loadOrders()]);
      })
      .catch(function (e) {
        if (err) { err.textContent = e.message; err.hidden = false; }
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }

  /* ---------------- event wiring ---------------- */

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
        // is the whole of it - the JWT simply expires on its own.
        clearSession();
        stopSessionTimer();
        state.product = null;
        state.orders.items = [];
        if (el.statGrid) el.statGrid.innerHTML = '';
        if (el.ordersBody) el.ordersBody.innerHTML = '';
        if (el.ordersPager) { el.ordersPager.hidden = true; el.ordersPager.innerHTML = ''; }
        if (el.productBody) el.productBody.innerHTML = '';
        if (el.historyBody) el.historyBody.innerHTML = '';
        if (el.priceForm) el.priceForm.hidden = true;
        showLogin();
        toast('تم تسجيل الخروج');
      });
    }

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
        changeOrderStatus(sel.dataset.order, sel.value);
      });
    }

    if (el.ordersPager) {
      el.ordersPager.addEventListener('click', function (e) {
        var b = e.target.closest('.pg');
        if (!b || b.disabled) return;
        state.orders.page = Number(b.dataset.page);
        loadOrders();
      });
    }

    if (el.productForm) {
      el.productForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = String(new FormData(el.productForm).get('id') || '').trim();
        if (!/^\d+$/.test(id)) { toast('أدخل رقماً صحيحاً للمنتج', 'error'); return; }
        loadProduct(id);
      });
    }

    if (el.priceForm) {
      el.priceForm.addEventListener('submit', function (e) {
        e.preventDefault();
        savePrice();
      });
    }
  }

  /* ---------------- boot ---------------- */

  function boot() {
    cacheEls();
    restoreSession();
    wire();

    if (!isAuthed()) { showLogin(); return; }

    showPanel();
    startSessionTimer();
    // A stored token can be expired, revoked or belong to a deactivated admin,
    // so confirm it before showing anything but the sign-in card.
    api('GET', '/auth/admin/me')
      .then(function (r) {
        state.admin = r.data || state.admin;
        showPanel();
        return Promise.all([loadStats(), loadOrders()]);
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
