/* Watanya storefront - talks to the Express API on the same origin. */
(function () {
  'use strict';

  // Normally same-origin. When index.html is opened directly from disk the
  // page origin is file://, where a relative '/api' would resolve to
  // file:///api and fail with "Failed to fetch", so point at the dev server.
  var API = location.protocol === 'file:'
    ? 'http://localhost:4000/api'
    : '/api';
  var LS = { access: 'watanya.access', refresh: 'watanya.refresh', user: 'watanya.user', lang: 'watanya.lang' };

  /* ---------------- i18n ---------------- */

  var lang = 'ar';
  try {
    var savedLang = localStorage.getItem(LS.lang);
    if (savedLang === 'en' || savedLang === 'ar') lang = savedLang;
  } catch (e) { /* private mode */ }

  var STRINGS = {
    ar: {
      'docTitle': 'الوطنية للتمويل',
      'lang.switch': 'تبديل اللغة',
      'top.currency': 'العملة: ر.س ▾',
      'top.phone': 'الدعم عبر الهاتف',
      'top.email': 'الدعم عبر البريد الإلكتروني',
      'top.help': 'مركز المساعدة',
      'logo': 'الوطنية<br>للتمويل',
      'search.ph': 'ابحث عن المنتجات',
      'search.aria': 'بحث',
      'hdr.wishlist': 'مفضلتي',
      'hdr.cart': 'السلة',
      'signin': 'تسجيل الدخول',
      'myAccount': 'حسابي',
      'nav.all': 'جميع الفئات',
      'nav.electronics': 'الإلكترونيات',
      'nav.mobiles': 'مبايلات',
      'nav.men': 'رجالية',
      'nav.women': 'نسائية',
      'nav.home': 'المنزل',
      'nav.beauty': 'الجمال والأزياء',
      'nav.kids': 'الأطفال و اللاعب',
      'nav.super': 'سوبر ماركات',
      'nav.deals': 'العروض',
      'crumb.home': 'الرئيسية',
      'crumb.sep': ' ‹ ',
      'crumb.electronics': 'الإلكترونيات والموبايلات',
      'crumb.mobiles': 'الموبايلات وملحقاتها',
      'crumb.smartphones': 'الهواتف الذكية',
      'f.category': 'الفئة',
      'f.brand': 'الماركة',
      'f.price': 'السعر',
      'f.color': 'اللون',
      'f.rating': 'التقييم',
      'f.all': 'الكل',
      'f.more': 'عرض المزيد',
      'f.less': 'عرض أقل',
      'f.from': 'من',
      'f.to': 'الى',
      'f.reset': 'إعادة ضبط',
      'res.filter': 'تصفية',
      'res.sortBy': 'ترتيب حسب:',
      'sort.best': 'الأكثر مبيعاً',
      'sort.priceAsc': 'السعر: من الأقل إلى الأعلى',
      'sort.priceDesc': 'السعر: من الأعلى إلى الأقل',
      'sort.rating': 'الأعلى تقييماً',
      'sort.newest': 'الأحدث',
      'sort.popular': 'الأكثر شهرة',
      'resultsCount': 'عرض {shown} من {total} منتج',
      'prev': 'السابق',
      'next': 'التالي',
      'loading': 'جارٍ تحميل المنتجات…',
      'empty': 'لا توجد منتجات مطابقة لبحثك.',
      'loadError': 'تعذر تحميل المنتجات',
      'unexpected': 'حدث خطأ غير متوقع ({status})',
      'sale': 'خصم',
      'inStock': 'متوفر',
      'outOfStock': 'نفدت الكمية',
      'viaLoan': 'متاح من خلال القرض',
      'addToCart': 'أضف للسلة',
      'inCart': 'في السلة',
      'curr': 'ريال',
      'wishAria': 'مفضلة',
      'requireAuth': 'يجب تسجيل الدخول أولاً',
      'signInAdd': 'سجّل الدخول لإضافة المنتجات إلى السلة',
      'addedToCart': 'تمت الإضافة إلى السلة',
      'signInWish': 'سجّل الدخول لحفظ المنتجات في المفضلة',
      'signInViewCart': 'سجّل الدخول لعرض السلة',
      'signInViewWish': 'سجّل الدخول لعرض المفضلة',
      'wishlistLabel': 'المفضلة: {n} منتج',
      'signedOut': 'تم تسجيل الخروج',
      'logoutConfirm': 'تسجيل الخروج من الحساب؟',
      'orderPlaced': 'تم إنشاء الطلب رقم {n}',
      'fillShipping': 'يرجى تعبئة بيانات التوصيل كاملة',
      'welcome': 'مرحباً بك',
      'accountCreated': 'تم إنشاء الحساب بنجاح',
      'cartEmpty': 'السلة فارغة.',
      'qtyDec': 'إنقاص',
      'qtyInc': 'زيادة',
      'remove': 'حذف',
      'subtotal': 'المجموع الفرعي',
      'shipping': 'الشحن',
      'tax': 'الضريبة',
      'total': 'الإجمالي',
      'delivery': 'بيانات التوصيل',
      'shipName': 'اسم المستلم',
      'shipPhone': 'رقم الجوال',
      'shipCity': 'المدينة',
      'shipAddress': 'العنوان',
      'shipNotes': 'ملاحظات للتوصيل (اختياري)',
      'payment': 'طريقة الدفع',
      'payLabel': 'الدفع',
      'payCod': 'الدفع عند الاستلام',
      'payCard': 'بطاقة ائتمانية',
      'payLoan': 'تمويل عبر القرض',
      'checkout': 'إتمام الطلب',
      'ft.helpTitle': 'نحن دايماً جاهزون لمساعدتك',
      'ft.helpText': 'تواصل معنا من خلال أي من قنوات الدعم التالية:',
      'ft.electronics': 'الإلكترونيات',
      'ft.mobiles': 'الهواتف المحمولة',
      'ft.laptops': 'أجهزة لابتوب',
      'ft.notebooks': 'أجهزة كمبيوتر المحمولة',
      'ft.tablets': 'التابلت',
      'ft.cameras': 'الكاميرات و الصور و تسجيل الفيديو',
      'ft.fashion': 'الأزياء',
      'ft.womenWear': 'أزياء نسائية',
      'ft.menWear': 'أزياء رجالية',
      'ft.kidsWear': 'أزياء أطفال',
      'ft.menWatch': 'ساعات بد رجالي',
      'ft.womenWatch': 'ساعات بد نسائي',
      'ft.kitchen': 'المطبخ والأجهزة المنزلية',
      'ft.kitchenDining': 'المطبخ و ودادات الطعام',
      'ft.cleaning': 'مستلزمات السير',
      'ft.bathroom': 'مستلزمات الحمام',
      'ft.homeDevices': '_device المنازل',
      'ft.office': 'الاجهزة المكتبية',
      'ft.tools': 'الادوات وتحسين المنزل',
      'ft.beauty': 'الجمال',
      'ft.liquidPerfume': 'العطور السائلة',
      'ft.perfume': 'عطور الرجاج',
      'ft.makeup': 'المكياج',
      'ft.skinCare': 'العناية بالبشرة',
      'ft.hairCare': 'العناية بالشعر',
      'ft.personalCare': 'العناية الشاملة',
      'ft.kids': 'الأطفال',
      'ft.kidsWearAcc': 'عباءات الأطفال واكسسواراتنا',
      'ft.kidsVideos': 'مقاطع الأطفال',
      'ft.kidsClothes': 'ملابس الأطفال',
      'ft.babyCare': 'مستلزمات الرضع والاطفال',
      'ft.bathCare': 'الاستحمام و العناية بالبشرة',
      'ft.toys': 'العاب الأطفال',
      'ft.brands': 'أفضل الماركات',
      'ft.apple': 'أبل',
      'ft.samsung': 'سامسونج',
      'ft.dell': 'ديل',
      'ft.rayfan': 'راي فان',
      'ft.tamfal': 'تمفال',
      'ft.union': 'يونيون بايرس',
      'ft.privacy': 'سياسة الخصوصية',
      'ft.terms': 'الشروط و الأحكام',
      'ft.returns': 'سياسة الاستبدال والاسترجاع',
      'ft.sitemap': 'خريطة الموقع',
      'ft.admin': 'لوحة تحكم المشرف',
      'ft.copyright': '© 2024 www.watanya.com. جميع الحقوق محفوظة.',
      'm.close': 'إغلاق',
      'm.loginTitle': 'تسجيل الدخول',
      'm.tabLogin': 'دخول',
      'm.tabRegister': 'حساب جديد',
      'm.identifier': 'البريد الإلكتروني أو رقم الجوال',
      'm.password': 'كلمة المرور',
      'm.loginBtn': 'دخول',
      'm.fullName': 'الاسم الكامل',
      'm.email': 'البريد الإلكتروني',
      'm.phone': 'رقم الجوال',
      'm.createBtn': 'إنشاء الحساب',
      'm.cartTitle': 'سلة التسوق'
    },
    en: {
      'docTitle': 'Watanya Finance',
      'lang.switch': 'Switch language',
      'top.currency': 'Currency: SAR ▾',
      'top.phone': 'Phone support',
      'top.email': 'Email support',
      'top.help': 'Help center',
      'logo': 'Watanya<br>Finance',
      'search.ph': 'Search products',
      'search.aria': 'Search',
      'hdr.wishlist': 'My Wishlist',
      'hdr.cart': 'Cart',
      'signin': 'Sign in',
      'myAccount': 'My account',
      'nav.all': 'All Categories',
      'nav.electronics': 'Electronics',
      'nav.mobiles': 'Mobiles',
      'nav.men': 'Men',
      'nav.women': 'Women',
      'nav.home': 'Home',
      'nav.beauty': 'Beauty & Fashion',
      'nav.kids': 'Kids & Toys',
      'nav.super': 'Supermarkets',
      'nav.deals': 'Deals',
      'crumb.home': 'Home',
      'crumb.sep': ' › ',
      'crumb.electronics': 'Electronics & Mobiles',
      'crumb.mobiles': 'Mobiles & Accessories',
      'crumb.smartphones': 'Smartphones',
      'f.category': 'Category',
      'f.brand': 'Brand',
      'f.price': 'Price',
      'f.color': 'Color',
      'f.rating': 'Rating',
      'f.all': 'All',
      'f.more': 'Show more',
      'f.less': 'Show less',
      'f.from': 'From',
      'f.to': 'To',
      'f.reset': 'Reset',
      'res.filter': 'Filter',
      'res.sortBy': 'Sort by:',
      'sort.best': 'Best selling',
      'sort.priceAsc': 'Price: Low to high',
      'sort.priceDesc': 'Price: High to low',
      'sort.rating': 'Top rated',
      'sort.newest': 'Newest',
      'sort.popular': 'Most popular',
      'resultsCount': 'Showing {shown} of {total} products',
      'prev': 'Previous',
      'next': 'Next',
      'loading': 'Loading products…',
      'empty': 'No products match your search.',
      'loadError': 'Could not load products',
      'unexpected': 'Something went wrong ({status})',
      'sale': 'Sale',
      'inStock': 'In stock',
      'outOfStock': 'Out of stock',
      'viaLoan': 'Available on finance',
      'addToCart': 'Add to cart',
      'inCart': 'In cart',
      'curr': 'SAR',
      'wishAria': 'Wishlist',
      'requireAuth': 'Please sign in first',
      'signInAdd': 'Sign in to add products to your cart',
      'addedToCart': 'Added to cart',
      'signInWish': 'Sign in to save products to your wishlist',
      'signInViewCart': 'Sign in to view your cart',
      'signInViewWish': 'Sign in to view your wishlist',
      'wishlistLabel': 'Wishlist: {n} items',
      'signedOut': 'Signed out',
      'logoutConfirm': 'Sign out of your account?',
      'orderPlaced': 'Order {n} placed',
      'fillShipping': 'Please fill in all delivery details',
      'welcome': 'Welcome back',
      'accountCreated': 'Account created successfully',
      'cartEmpty': 'Your cart is empty.',
      'qtyDec': 'Decrease quantity',
      'qtyInc': 'Increase quantity',
      'remove': 'Remove',
      'subtotal': 'Subtotal',
      'shipping': 'Shipping',
      'tax': 'Tax',
      'total': 'Total',
      'delivery': 'Delivery details',
      'shipName': 'Recipient name',
      'shipPhone': 'Mobile number',
      'shipCity': 'City',
      'shipAddress': 'Address',
      'shipNotes': 'Delivery notes (optional)',
      'payment': 'Payment method',
      'payLabel': 'Payment',
      'payCod': 'Cash on delivery',
      'payCard': 'Credit card',
      'payLoan': 'Financing via loan',
      'checkout': 'Place order',
      'ft.helpTitle': "We're always ready to help",
      'ft.helpText': 'Reach us through any of these support channels:',
      'ft.electronics': 'Electronics',
      'ft.mobiles': 'Mobile phones',
      'ft.laptops': 'Laptops',
      'ft.notebooks': 'Notebook computers',
      'ft.tablets': 'Tablets',
      'ft.cameras': 'Cameras, photos & video',
      'ft.fashion': 'Fashion',
      'ft.womenWear': "Women's fashion",
      'ft.menWear': "Men's fashion",
      'ft.kidsWear': "Kids' fashion",
      'ft.menWatch': "Men's watches",
      'ft.womenWatch': "Women's watches",
      'ft.kitchen': 'Kitchen & home appliances',
      'ft.kitchenDining': 'Kitchen & dining',
      'ft.cleaning': 'Cleaning supplies',
      'ft.bathroom': 'Bathroom essentials',
      'ft.homeDevices': 'Home devices',
      'ft.office': 'Office equipment',
      'ft.tools': 'Tools & home improvement',
      'ft.beauty': 'Beauty',
      'ft.liquidPerfume': 'Liquid perfumes',
      'ft.perfume': 'Perfumes',
      'ft.makeup': 'Makeup',
      'ft.skinCare': 'Skin care',
      'ft.hairCare': 'Hair care',
      'ft.personalCare': 'Personal care',
      'ft.kids': 'Kids',
      'ft.kidsWearAcc': "Kids' wear & accessories",
      'ft.kidsVideos': "Kids' videos",
      'ft.kidsClothes': "Kids' clothing",
      'ft.babyCare': 'Baby & toddler essentials',
      'ft.bathCare': 'Bath & skin care',
      'ft.toys': 'Kids toys',
      'ft.brands': 'Top brands',
      'ft.apple': 'Apple',
      'ft.samsung': 'Samsung',
      'ft.dell': 'Dell',
      'ft.rayfan': 'Ray Fan',
      'ft.tamfal': 'Tamfal',
      'ft.union': 'Union Bears',
      'ft.privacy': 'Privacy Policy',
      'ft.terms': 'Terms & Conditions',
      'ft.returns': 'Exchange & Returns Policy',
      'ft.sitemap': 'Site Map',
      'ft.admin': 'Admin Dashboard',
      'ft.copyright': '© 2024 www.watanya.com. All rights reserved.',
      'm.close': 'Close',
      'm.loginTitle': 'Sign in',
      'm.tabLogin': 'Sign in',
      'm.tabRegister': 'New account',
      'm.identifier': 'Email or mobile number',
      'm.password': 'Password',
      'm.loginBtn': 'Sign in',
      'm.fullName': 'Full name',
      'm.email': 'Email',
      'm.phone': 'Mobile number',
      'm.createBtn': 'Create account',
      'm.cartTitle': 'Shopping cart'
    }
  };

  function isRtl() { return lang !== 'en'; }

  /** Translation lookup; unknown keys fall back to the key itself. */
  function tr(key) {
    var table = STRINGS[lang] || STRINGS.ar;
    if (Object.prototype.hasOwnProperty.call(table, key)) return table[key];
    if (Object.prototype.hasOwnProperty.call(STRINGS.ar, key)) return STRINGS.ar[key];
    return key;
  }

  /** Translation with {name} placeholder substitution. */
  function tp(key, vars) {
    var s = tr(key);
    if (!vars) return s;
    Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }

  /** Picks the Arabic or English variant of an API-provided name. */
  function localized(ar, en) { return lang === 'en' && en ? en : ar; }

  /** Applies lang/dir/title plus every data-i18n hook in the static markup. */
  function applyStatic() {
    var html = document.documentElement;
    html.lang = lang;
    html.dir = isRtl() ? 'rtl' : 'ltr';
    document.title = tr('docTitle');
    document.querySelectorAll('[data-i18n]').forEach(function (n) {
      n.innerHTML = tr(n.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (n) {
      n.setAttribute('placeholder', tr(n.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (n) {
      n.setAttribute('aria-label', tr(n.getAttribute('data-i18n-aria')));
    });
    if (el.langToggle) {
      el.langToggle.textContent = isRtl() ? 'اللغة العربية ▾' : 'English ▾';
      el.langToggle.setAttribute('aria-label', tr('lang.switch'));
      el.langToggle.setAttribute('title', tr('lang.switch'));
    }
  }

  function setLang(next) {
    lang = next === 'en' ? 'en' : 'ar';
    try { localStorage.setItem(LS.lang, lang); } catch (e) { /* private mode */ }
    retranslate();
  }

  /** Re-renders everything that carries translatable text. */
  function retranslate() {
    applyStatic();
    renderNav();
    renderFacets(state.facets);
    renderPriceSlider();
    syncRadios();
    renderProducts();
    refreshBadges();
    paintState();
    if (el.cartBody && byId('cartModal') && !byId('cartModal').hidden) renderCart();
  }

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
    navCats: null,
    user: null,
    cart: null,
    wishlist: new Set(),
    loading: false,
    view: 'list'
  };

  var el = {};
  function byId(id) { return document.getElementById(id); }
  function cacheEls() {
    ['productList', 'stateBox', 'pager', 'resultsCount', 'sortSelect', 'catList', 'brandList',
     'colorList', 'ratingList', 'productSearch', 'searchBtn', 'priceMin', 'priceMax',
     'cartCount', 'wishlistCount', 'accountLabel', 'accountBtn', 'cartBtn', 'wishlistBtn',
      'authModal', 'cartModal', 'cartBody', 'toast', 'promoImg', 'langToggle'].forEach(function (id) {
      el[id] = byId(id);
    });
    el.priceSlider = document.querySelector('.price-slider');
    el.priceFill = document.querySelector('.price-fill');
    el.priceDotMin = document.querySelector('.price-dot.l');
    el.priceDotMax = document.querySelector('.price-dot.r');
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
    var e = new Error(err.message || tp('unexpected', { status: res.status }));
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
    // parseNum strips commas/spaces so typed values like "1,200" still filter.
    var minP = parseNum(state.min_price);
    var maxP = parseNum(state.max_price);
    if (!isNaN(minP)) p.set('min_price', minP);
    if (!isNaN(maxP)) p.set('max_price', maxP);
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
      ? '<span class="badge-sale">' + esc(tr('sale') + ' ' + p.discount_percent + '%') + '</span>' : '';
    var old = p.base_price > p.price ? '<span class="old">' + num(p.base_price) + '</span>' : '';
    var stock = Number(p.stock_quantity || 0);
    var stockLine = stock > 0
      ? '<span class="instock">' + esc(tr('inStock') + ' (' + num(stock) + ')') + '</span>'
      : '<span class="instock" style="color:#c0392b">' + esc(tr('outOfStock')) + '</span>';
    var btnLabel = p.is_loanable ? tr('viaLoan') : tr('addToCart');
    var inCart = Number(p.cart_amount || 0) > 0;
    // Stays clickable while stock remains, so pressing it again bumps the quantity.
    var cartFull = inCart && Number(p.cart_amount) >= stock;
    var cartDisabled = stock <= 0 || cartFull;
    var title = localized(p.name_ar, p.name_en);
    var brand = localized(p.brand_name_ar, p.brand_name_en);

    return '' +
      '<div class="card" data-id="' + esc(p.id) + '">' +
        '<div class="card-top">' +
          '<div class="card-body">' +
            (brand ? '<div class="card-cat">' + esc(brand) + '</div>' : '') +
            '<div class="card-title">' + esc(title) + '</div>' +
            '<div class="card-price">' +
              '<span class="amount">' + num(p.price) + '</span>' +
              '<span class="curr">' + esc(tr('curr')) + '</span>' + old + stockLine +
            '</div>' +
            '<div class="card-rating">' + starsFor(p.rating_avg) +
              '<span class="rnum">' + (Number(p.rating_avg || 0).toFixed(1)) + '</span>' +
              '<span class="rcount">(' + num(p.rating_count) + ')</span>' +
            '</div>' +
            '<div class="card-bottom">' +
              '<button class="add-to-cart' + (p.in_cart ? ' added' : '') + '"' +
                (cartDisabled ? ' disabled' : '') + ' data-action="add">' +
                '<svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.17 14.75l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4.25H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42a.25.25 0 0 1-.25-.25z"/></svg>' +
                (p.in_cart ? ' ' + tr('inCart') + ' (' + num(p.cart_amount) + ')' : ' ' + btnLabel) +
              '</button>' +
              '<button class="heart-btn' + (p.in_wishlist ? ' liked' : '') + '" data-action="wish" aria-label="' + esc(tr('wishAria')) + '">' +
                '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="card-img">' + sale +
            (img
              ? '<img src="' + esc(img) + '" alt="' + esc(title) + '" loading="lazy" onerror="this.remove()">'
              : '') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function applyViewClass() {
    if (!el.productList) return;
    el.productList.classList.toggle('view-grid', state.view === 'grid');
    el.productList.classList.toggle('view-list', state.view !== 'grid');
  }

  function renderProducts() {
    if (el.productList) {
      applyViewClass();
      el.productList.innerHTML = state.products.map(productCard).join('');
    }
    if (el.resultsCount) {
      el.resultsCount.textContent = state.total
        ? tp('resultsCount', { shown: state.products.length, total: num(state.total) })
        : '';
    }
    renderPager();
  }

  function renderPager() {
    if (!el.pager) return;
    if (state.totalPages <= 1) { el.pager.hidden = true; el.pager.innerHTML = ''; return; }
    var html = '<button class="pg" data-page="' + (state.page - 1) + '"' +
      (state.page <= 1 ? ' disabled' : '') + '>' + esc(tr('prev')) + '</button>';
    var from = Math.max(1, state.page - 2);
    var to = Math.min(state.totalPages, from + 4);
    from = Math.max(1, to - 4);
    for (var i = from; i <= to; i++) {
      html += '<button class="pg' + (i === state.page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    html += '<button class="pg" data-page="' + (state.page + 1) + '"' +
      (state.page >= state.totalPages ? ' disabled' : '') + '>' + esc(tr('next')) + '</button>';
    el.pager.innerHTML = html;
    el.pager.hidden = false;
  }

  // Remembers the last state so a language switch can repaint it.
  var lastState = { kind: '', key: '', vars: null };

  function showState(kind, key, vars) {
    lastState = { kind: kind || '', key: key || '', vars: vars || null };
    paintState();
  }

  function paintState() {
    if (!el.stateBox) return;
    if (!lastState.key) { el.stateBox.hidden = true; el.stateBox.innerHTML = ''; return; }
    el.stateBox.className = 'state-box ' + lastState.kind;
    el.stateBox.textContent = tp(lastState.key, lastState.vars);
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
      el.catList.innerHTML = radioRow('cat', '', tr('f.all')) +
        (cats.length ? cats : (f.categories || [])).slice(0, 12).map(function (c) {
          return radioRow('cat', c.slug, localized(c.name_ar, c.name_en),
            ' <span class="fcnt">(' + c.product_count + ')</span>');
        }).join('');
    }

    if (el.brandList) {
      el.brandList.innerHTML = radioRow('brand', '', tr('f.all')) +
        (f.brands || []).slice(0, 12).map(function (b) {
          return radioRow('brand', b.slug, localized(b.name_ar, b.name_en),
            ' <span class="fcnt">(' + b.product_count + ')</span>');
        }).join('');
    }

    if (el.colorList) {
      // The filter value stays the Arabic name (what the API matches on);
      // only the displayed label follows the language.
      el.colorList.innerHTML =
        '<li><div class="color-left"><span>' + esc(tr('f.all')) + '</span></div><input type="radio" name="color" value=""></li>' +
        (f.colors || []).slice(0, 12).map(function (c) {
          return '<li><div class="color-left"><span class="color-dot" style="background:' + esc(c.hex) + '"></span>' +
            '<span>' + esc(localized(c.name_ar, c.name_en)) + '</span></div>' +
            '<input type="radio" name="color" value="' + esc(c.name_ar) + '"></li>';
        }).join('');
    }

    if (f.price && f.price.max) {
      var max = Math.ceil(f.price.max / 500) * 500;
      if (el.priceMin) { el.priceMin.placeholder = '0'; el.priceMin.max = max; }
      if (el.priceMax) { el.priceMax.placeholder = num(max); el.priceMax.max = max; }
      state.priceCeiling = max;
      normalizePriceState();
      renderPriceSlider();
    }
  }

  /* ---------------- price slider ---------------- */

  function priceCeiling() { return state.priceCeiling || 50000; }

  // Reads the current min/max as numbers, clamped to the ceiling and ordered.
  function priceBounds() {
    var ceil = priceCeiling();
    var min = parseNum(state.min_price);
    var max = parseNum(state.max_price);
    if (isNaN(min)) min = 0;
    if (isNaN(max)) max = ceil;
    min = Math.max(0, Math.min(ceil, min));
    max = Math.max(0, Math.min(ceil, max));
    if (min > max) { var t = min; min = max; max = t; }
    return { min: min, max: max, ceil: ceil };
  }

  function normalizePriceState() {
    var b = priceBounds();
    state.min_price = b.min > 0 ? String(b.min) : '';
    state.max_price = b.max < b.ceil ? String(b.max) : '';
    // Leave a focused input alone so a background refresh can't clobber typing.
    if (el.priceMin && document.activeElement !== el.priceMin) {
      el.priceMin.value = b.min > 0 ? num(b.min) : '';
    }
    if (el.priceMax && document.activeElement !== el.priceMax) {
      el.priceMax.value = b.max < b.ceil ? num(b.max) : '';
    }
  }

  // Anchors the handles/fill to their prices. `commit` re-runs the query.
  function setPriceRange(min, max, commit) {
    var ceil = priceCeiling();
    min = Math.max(0, Math.min(ceil, Math.round(min)));
    max = Math.max(0, Math.min(ceil, Math.round(max)));
    if (min > max) { var t = min; min = max; max = t; }
    state.min_price = min > 0 ? String(min) : '';
    state.max_price = max < ceil ? String(max) : '';
    if (el.priceMin) el.priceMin.value = min > 0 ? num(min) : '';
    if (el.priceMax) el.priceMax.value = max < ceil ? num(max) : '';
    renderPriceSlider();
    if (commit) { state.page = 1; loadProducts(); }
  }

  function renderPriceSlider() {
    if (!el.priceSlider) return;
    var b = priceBounds();
    // One axis for both handles, measured from the side the zero price sits on:
    // the right edge in RTL (price grows leftward) and the left edge in LTR.
    var rtl = isRtl();
    var minPct = (b.min / b.ceil) * 100;
    var maxPct = (b.max / b.ceil) * 100;
    if (el.priceDotMin) {
      el.priceDotMin.style.left = rtl ? 'auto' : minPct + '%';
      el.priceDotMin.style.right = rtl ? minPct + '%' : 'auto';
      el.priceDotMin.style.transform = 'translate(' + (rtl ? '50%' : '-50%') + ',-50%)';
    }
    if (el.priceDotMax) {
      el.priceDotMax.style.left = rtl ? 'auto' : maxPct + '%';
      el.priceDotMax.style.right = rtl ? maxPct + '%' : 'auto';
      el.priceDotMax.style.transform = 'translate(' + (rtl ? '50%' : '-50%') + ',-50%)';
    }
    if (el.priceFill) {
      el.priceFill.style.right = rtl ? minPct + '%' : (100 - maxPct) + '%';
      el.priceFill.style.left = rtl ? (100 - maxPct) + '%' : minPct + '%';
    }
  }

  function wirePriceSlider() {
    if (!el.priceSlider) return;
    var dragging = null;
    var moved = false;
    var offset = 0;

    function cursorLeft(clientX) {
      var rect = el.priceSlider.getBoundingClientRect();
      if (!rect.width) return 0;
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    // Handle position as a fraction of the track measured from the left edge.
    // In RTL values grow leftward, so position = 1 - value / ceiling.
    function handleLeft() {
      var b = priceBounds();
      var frac = (dragging === 'min' ? b.min : b.max) / b.ceil;
      return isRtl() ? 1 - frac : frac;
    }

    function dragTo(clientX) {
      var b = priceBounds();
      var left = Math.min(1, Math.max(0, cursorLeft(clientX) - offset));
      var value = Math.round((isRtl() ? 1 - left : left) * b.ceil / 10) * 10;
      var min = dragging === 'min' ? Math.min(value, b.max) : b.min;
      var max = dragging === 'min' ? b.max : Math.max(value, b.min);
      if (min !== b.min || max !== b.max) moved = true;
      setPriceRange(min, max, false);
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      dragTo(e.clientX);
    }

    function onUp() {
      if (!dragging) return;
      dragging = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (moved) { state.page = 1; loadProducts(); }
      moved = false;
    }

    // `snap` jumps the handle to the cursor (track click); otherwise the grab
    // offset is kept so the handle doesn't jump out from under the pointer.
    function start(which, e, snap) {
      dragging = which;
      moved = false;
      offset = snap ? 0 : cursorLeft(e.clientX) - handleLeft();
      e.preventDefault();
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      dragTo(e.clientX);
    }

    if (el.priceDotMin) {
      el.priceDotMin.addEventListener('pointerdown', function (e) { start('min', e, false); });
    }
    if (el.priceDotMax) {
      el.priceDotMax.addEventListener('pointerdown', function (e) { start('max', e, false); });
    }

    // Clicking the track snaps the nearest handle to the cursor.
    el.priceSlider.addEventListener('pointerdown', function (e) {
      if (e.target !== el.priceSlider && e.target !== el.priceFill) return;
      var b = priceBounds();
      var f = cursorLeft(e.clientX);
      var minHandle = 1 - b.min / b.ceil;
      var maxHandle = 1 - b.max / b.ceil;
      start(Math.abs(f - minHandle) <= Math.abs(f - maxHandle) ? 'min' : 'max', e, true);
    });

    renderPriceSlider();
  }

  /* ---------------- loaders ---------------- */

  function loadProducts() {
    state.loading = true;
    showState('loading', 'loading');
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
        syncRadios();
        renderProducts();
        if (data.length) {
          applyWishlistState();
        } else {
          showState('empty', 'empty');
        }
      })
      .catch(function (e) {
        state.loading = false;
        showState('error', e.message || tr('loadError'));
      });
  }

  function loadStorefront() {
    return api('GET', '/storefront').then(function (d) {
      if (!d) return;
      // Keep the list so a language switch can rebuild the links with the
      // matching names; renderNav() is a no-op until this lands.
      state.navCats = (d.categories || []).filter(function (c) { return !c.parent_id; }).slice(0, 8);
      renderNav();
    }).catch(function () { /* nav is cosmetic */ });
  }

  function renderNav() {
    var nav = document.querySelector('.nav-inner');
    if (!nav || !state.navCats) return;

    // Replace the placeholder links outright rather than overwriting them by
    // index. The static markup and the category count do not have to agree,
    // and overwriting left a stale duplicate behind when the API returned
    // fewer categories than there were placeholders.
    var stale = Array.prototype.slice.call(nav.querySelectorAll('a'));
    stale.forEach(function (a) { a.parentNode.removeChild(a); });

    state.navCats.forEach(function (c) {
      var a = document.createElement('a');
      a.href = '#';
      a.textContent = localized(c.name_ar, c.name_en);
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
  }

  /* ---------------- cart / wishlist ---------------- */

  function requireAuth(message) {
    if (isAuthed()) return true;
    toast(message || tr('requireAuth'));
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
      el.accountLabel.textContent = state.user
        ? (state.user.full_name || tr('myAccount'))
        : tr('signin');
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
        btn.lastChild.textContent = inCart
          ? ' ' + tr('inCart') + ' (' + num(amount) + ')'
          : ' ' + (p.is_loanable ? tr('viaLoan') : tr('addToCart'));
      }
    }
    if (patch.in_wishlist !== undefined) {
      var heart = card.querySelector('[data-action="wish"]');
      if (heart) heart.classList.toggle('liked', Boolean(patch.in_wishlist));
    }
  }

  function addToCart(id) {
    if (!requireAuth(tr('signInAdd'))) return;
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
        toast(tr('addedToCart'));
      })
      .catch(function (e) {
        var p = state.products.filter(function (x) { return String(x.id) === String(id); })[0];
        markCard(id, { in_cart: !!p, cart_amount: p ? Number(p.cart_amount || 0) : 0 });
        toast(e.message, 'error');
      });
  }

  function toggleWishlist(id) {
    if (!requireAuth(tr('signInWish'))) return;
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
      el.cartBody.innerHTML = '<p class="empty">' + esc(tr('cartEmpty')) + '</p>';
      return;
    }
    var rows = c.items.map(function (i) {
      return '<div class="cart-row" data-id="' + esc(i.product_id) + '">' +
        '<div class="cr-name">' + esc(localized(i.name_ar, i.name_en)) + '</div>' +
        '<div class="cr-qty">' +
          '<button data-cart="dec" aria-label="' + esc(tr('qtyDec')) + '">&minus;</button>' +
          '<span>' + esc(i.amount) + '</span>' +
          '<button data-cart="inc" aria-label="' + esc(tr('qtyInc')) + '">+</button>' +
        '</div>' +
        '<div class="cr-price">' + num(i.line_total) + ' ' + esc(tr('curr')) + '</div>' +
        '<button class="cr-remove" data-cart="remove" aria-label="' + esc(tr('remove')) + '">&times;</button>' +
      '</div>';
    }).join('');
    var s = c.summary || {};
    el.cartBody.innerHTML =
      '<div class="cart-lines">' + rows + '</div>' +
      '<div class="cart-totals">' +
        '<div><span>' + esc(tr('subtotal')) + '</span><b>' + num(s.subtotal) + '</b></div>' +
        '<div><span>' + esc(tr('shipping')) + '</span><b>' + num(s.shipping) + '</b></div>' +
        '<div><span>' + esc(tr('tax')) + '</span><b>' + num(s.tax) + '</b></div>' +
        '<div class="grand"><span>' + esc(tr('total')) + '</span><b>' + num(s.total) + ' ' + esc(tr('curr')) + '</b></div>' +
      '</div>' +
      '<h4 class="cart-sub">' + esc(tr('delivery')) + '</h4>' +
      '<div class="ship-grid">' +
        '<label>' + esc(tr('shipName')) +
          '<input id="shipName" name="shipping_name" type="text" maxlength="120" autocomplete="name" required>' +
        '</label>' +
        '<label>' + esc(tr('shipPhone')) +
          '<input id="shipPhone" name="shipping_phone" type="tel" maxlength="20" autocomplete="tel" required>' +
        '</label>' +
        '<label>' + esc(tr('shipCity')) +
          '<input id="shipCity" name="shipping_city" type="text" maxlength="60" autocomplete="address-level2" required>' +
        '</label>' +
        '<label class="wide">' + esc(tr('shipAddress')) +
          '<input id="shipAddress" name="shipping_address" type="text" maxlength="255" autocomplete="street-address" required>' +
        '</label>' +
        '<label class="wide">' + esc(tr('shipNotes')) +
          '<input id="shipNotes" name="notes" type="text" maxlength="500">' +
        '</label>' +
      '</div>' +
      '<h4 class="cart-sub">' + esc(tr('payment')) + '</h4>' +
      '<label class="cart-pay">' + esc(tr('payLabel')) +
        '<select id="cartPayment">' +
          '<option value="cod">' + esc(tr('payCod')) + '</option>' +
          '<option value="card">' + esc(tr('payCard')) + '</option>' +
          '<option value="loan">' + esc(tr('payLoan')) + '</option>' +
        '</select>' +
      '</label>' +
      '<button class="btn-primary" id="checkoutBtn">' + esc(tr('checkout')) + '</button>';
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
      toast(tr('fillShipping'), 'error');
      return;
    }

    var btn = byId('checkoutBtn');
    if (btn) btn.disabled = true;
    api('POST', '/me/orders', payload)
      .then(function (order) {
        state.cart = null;
        refreshBadges();
        closeModal('cartModal');
        toast(tp('orderPlaced', { n: order.order_number || order.id }));
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
        r.checked = (r.value === want);
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
    /* language switch */
    if (el.langToggle) {
      el.langToggle.addEventListener('click', function () {
        setLang(isRtl() ? 'en' : 'ar');
      });
    }

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
      var ceil = priceCeiling();
      var min = parseNum(el.priceMin.value);
      var max = parseNum(el.priceMax.value);
      if (isNaN(min)) min = 0;
      if (isNaN(max)) max = ceil;
      setPriceRange(min, max, true);
    }, 500);
    if (el.priceMin) el.priceMin.addEventListener('input', priceChanged);
    if (el.priceMax) el.priceMax.addEventListener('input', priceChanged);
    wirePriceSlider();

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
          if (confirm(tr('logoutConfirm'))) {
            var rt = getRefresh();
            api('POST', '/auth/logout', rt ? { refresh_token: rt } : {}).catch(function () { });
            clearSession();
            refreshBadges();
            toast(tr('signedOut'));
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
        if (!isAuthed()) { toast(tr('signInViewCart')); openModal('authModal'); return; }
        loadCart().then(function () { renderCart(); openModal('cartModal'); });
      });
    }

    if (el.wishlistBtn) {
      el.wishlistBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!isAuthed()) { toast(tr('signInViewWish')); openModal('authModal'); return; }
        api('GET', '/me/wishlist').then(function (d) {
          var items = (d && d.items) || [];
          state.wishlist = new Set(items.map(function (w) { return String(w.product_id); }));
          refreshBadges();
          applyWishlistState();
          renderProducts();
          toast(tp('wishlistLabel', { n: items.length }));
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
          toast(isLogin ? tr('welcome') : tr('accountCreated'));
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
        renderPriceSlider();
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
        more.textContent = willShow ? tr('f.less') : tr('f.more');
      });
    });

    /* mobile filter toggle + list/grid view toggle */
    var viewBtns = document.querySelectorAll('.view-btn');
    function setView(mode) {
      state.view = mode === 'grid' ? 'grid' : 'list';
      Array.prototype.forEach.call(viewBtns, function (b, i) {
        var isGridBtn = i === 1;
        var active = isGridBtn === (state.view === 'grid');
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      applyViewClass();
    }
    Array.prototype.forEach.call(viewBtns, function (btn, i) {
      function activate() { setView(i === 1 ? 'grid' : 'list'); }
      btn.addEventListener('click', activate);
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          activate();
        }
      });
    });
    setView(state.view);

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
    applyStatic();
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
