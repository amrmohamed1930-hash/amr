/**
 * Seeds the database with realistic Arabic catalog data.
 * Idempotent: re-running updates nothing and inserts no duplicates.
 *
 *   npm run db:seed
 */
import { query, queryOne, closePool } from '../src/config/db.js';
import { hashPassword } from '../src/utils/password.js';
import { slugify } from '../src/utils/slugify.js';

const DEMO_PASSWORD = 'Watanya@2026';

const BRANDS = [
  { name_ar: 'أبل', name_en: 'Apple', slug: 'apple' },
  { name_ar: 'سامسونج', name_en: 'Samsung', slug: 'samsung' },
  { name_ar: 'اتش تي سي', name_en: 'HTC', slug: 'htc' },
  { name_ar: 'جيل', name_en: 'Gionee', slug: 'gionee' },
  { name_ar: 'لينوفو', name_en: 'Lenovo', slug: 'lenovo' },
  { name_ar: 'ديل', name_en: 'Dell', slug: 'dell' },
  { name_ar: 'راي فان', name_en: 'Ray-Ban', slug: 'ray-ban' },
  { name_ar: 'شاومي', name_en: 'Xiaomi', slug: 'xiaomi' },
  { name_ar: 'ال جي', name_en: 'LG', slug: 'lg' },
  { name_ar: 'سوني', name_en: 'Sony', slug: 'sony' },
];

const COLORS = {
  'اسود': { hex: '#1a1a1a', en: 'Black' },
  'ابيض': { hex: '#f5f5f5', en: 'White' },
  'احمر': { hex: '#e74c3c', en: 'Red' },
  'اخضر': { hex: '#95a5a6', en: 'Green' },
  'ازرق': { hex: '#3498db', en: 'Blue' },
  'اصفر': { hex: '#f39c12', en: 'Yellow' },
  'وردي': { hex: '#e91e63', en: 'Pink' },
  'فضي': { hex: '#bdc3c7', en: 'Silver' },
  'ذهبي': { hex: '#d4af37', en: 'Gold' },
  'بنفسجي': { hex: '#9b59b6', en: 'Purple' },
};

// category slugs resolved from the base seed
const PRODUCTS = [
  {
    name: 'جوال ايفون 17 برو ماكس 256 جيجا من ابل: شاشة 6.9',
    // Matches the slug shipped in database.sql so the original row is
    // updated in place instead of creating a near-duplicate.
    slug: 'iphone-17-pro-max-256',
    brand: 'apple', cats: ['smartphones', 'mobiles', 'electronics'],
    base: 6000, sale: 5249, stock: 15, loan: true, featured: true,
    colors: ['اسود', 'فضي', 'اخضر'],
    desc: 'شاشة Super Retina XDR بحجم 6.9 بوصة، كاميرا ثلاثية بzoom بصري 5x، هيكل تيتانيوم، متوفر بالتمويل.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال ايفون 17 برو 128 جيجا من ابل: شاشة 6.3',
    brand: 'apple', cats: ['smartphones', 'mobiles'],
    base: 4999, sale: 4399, stock: 22, loan: true, featured: true,
    colors: ['اسود', 'ابيض', 'اخضر'],
    desc: 'شاشة 6.3 بوصة، معالج A19 Pro، كاميرا ثلاثية، تصميم تيتانيوم خفيف.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال ايفون 17 128 جيجا من ابل',
    brand: 'apple', cats: ['smartphones', 'mobiles'],
    base: 3999, sale: null, stock: 30, loan: true, featured: false,
    colors: ['اسود', 'ابيض', 'وردي'],
    desc: 'أداء قوي مع معالج A19 وشاشة 6.1 بوصة وكاميرا مزدوجة.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال سامسونج جالكسي S25 الترا 512 جيجا: شاشة 6.8',
    brand: 'samsung', cats: ['smartphones', 'mobiles'],
    base: 6499, sale: 5899, stock: 12, loan: true, featured: true,
    colors: ['اسود', 'فضي', 'بنفسجي'],
    desc: 'قلم S Pen مدمج، شاشة Dynamic AMOLED، كاميرا رباعية 200 ميجابكسل، شحن 45 واط.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال سامسونج جالكسي A56 128 جيجا: شاشة 6.6',
    brand: 'samsung', cats: ['smartphones', 'mobiles'],
    base: 1899, sale: 1699, stock: 45, loan: true, featured: false,
    colors: ['اسود', 'ابيض', 'اخضر'],
    desc: 'خيار اقتصادي ممتاز، شاشة Super AMOLED وكاميرا ثلاثية مستقرة.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال شاومي ريدمي نوت 14 برو 256 جيجا',
    brand: 'xiaomi', cats: ['smartphones', 'mobiles'],
    base: 1499, sale: 1299, stock: 60, loan: true, featured: false,
    colors: ['اسود', 'بنفسجي'],
    desc: 'معالج Snapdragon 7s، كاميرا 200 ميجابكسل، بطارية 5000 مللي أمبير.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'جوال لينوفو K14 128 جيجا بشاشة 6.5',
    brand: 'lenovo', cats: ['mobiles'],
    base: 899, sale: 749, stock: 80, loan: false, featured: false,
    colors: ['اسود', 'ازرق'],
    desc: 'سعر ممتاز مقابل أداء جيد، بطارية تدوم طوال اليوم.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'سماعة ابل ايربودز برو الجيل الثاني',
    brand: 'apple', cats: ['headphones', 'electronics'],
    base: 1099, sale: 949, stock: 120, loan: false, featured: true,
    colors: ['ابيض'],
    desc: 'عزل ضوضاء نشط، صوت مكاني، مقاومة للماء والعرق.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'سماعة سامسونج جالكسي بادز 3 برو',
    brand: 'samsung', cats: ['headphones'],
    base: 899, sale: null, stock: 95, loan: false, featured: false,
    colors: ['اسود', 'فضي'],
    desc: 'عزل ضوضاء محسن، 360 درجة صوت، علبة شحن لاسلكية.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'سماعة لينوفو THINKPLUS Dirtbusters لاسلكية',
    brand: 'lenovo', cats: ['headphones'],
    base: 349, sale: 279, stock: 200, loan: false, featured: false,
    colors: ['اسود', 'ابيض'],
    desc: 'مقاومة للماء IPX5، 40 ساعة تشغيل، سعر مناسب.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'تلفزيون ال جي الترا 4K 65 بوصة',
    brand: 'lg', cats: ['tvs', 'electronics'],
    base: 4299, sale: 3799, stock: 18, loan: true, featured: true,
    colors: ['اسود'],
    desc: 'دقة 4K، معالج α5، نظام webOS، دعم Alexa و Google Assistant.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'تلفزيون سامسونج نيو QN85D 75 بوصة 4K',
    brand: 'samsung', cats: ['tvs'],
    base: 5999, sale: 5299, stock: 9, loan: true, featured: false,
    colors: ['اسود', 'فضي'],
    desc: 'تقنية Neo QLED، معدل تحديث 120Hz، صوت Dolby Atmos.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'لابتوب ديل XPS 15 بمعالج Core i9 ورام 32 جيجا',
    brand: 'dell', cats: ['laptops', 'electronics'],
    base: 7999, sale: 7299, stock: 14, loan: true, featured: true,
    colors: ['فضي', 'اسود'],
    desc: 'شاشة OLED 3.5K، كرت رسوميات RTX 4060، هيكل ألمنيوم.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'لابتوب لينوفو ليجن 5 برو 16 جيجا 512 جيجا SSD',
    brand: 'lenovo', cats: ['laptops'],
    base: 4599, sale: 4099, stock: 25, loan: true, featured: false,
    colors: ['اسود', 'فضي'],
    desc: 'معالج Ryzen 7، شاشة 16 بوصة 165Hz، مناسب للألعاب والعمل.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'تابلت سامسونج جالكسي تاب S9 FE 128 جيجا بقلم',
    brand: 'samsung', cats: ['tablets', 'electronics'],
    base: 2799, sale: 2499, stock: 33, loan: true, featured: false,
    colors: ['ابيض', 'فضي'],
    desc: 'شاشة 10.9 بوصة، قلم S Pen مرفق، مقاومة للماء IP68.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'كاميرا سوني ألفا A7 IV بدون مرآة 33 ميجابكسل',
    brand: 'sony', cats: ['cameras', 'digital-cameras', 'electronics'],
    base: 8999, sale: 8299, stock: 7, loan: true, featured: true,
    colors: ['اسود', 'فضي'],
    desc: 'مستشعر كامل الإطار 33 ميجابكسل، تثبيت 5 محاور، فيديو 4K 60fps.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'كاميرا ديتال شاومي Redmi Note 13 Pro 200 ميجابكسل',
    brand: 'xiaomi', cats: ['cameras', 'digital-cameras'],
    base: 1299, sale: 1099, stock: 40, loan: false, featured: false,
    colors: ['اسود', 'بنفسجي'],
    desc: 'كاميرا 200 ميجابكسل، شاشة AMOLED 120Hz، بطارية 5000 مللي أمبير.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'نظارة شمسية راي فان جينيروز Expolymer',
    brand: 'ray-ban', cats: ['watches'],
    base: 1399, sale: 1199, stock: 55, loan: false, featured: false,
    colors: ['اسود', 'ذهبي', 'احمر'],
    desc: 'عدسات بولارايزد، حماية UV400، خفيف ومريح للاستخدام اليومي.',
    img: 'uploads/iphone.png',
  },
  {
    name: 'ساعة ذكية راي فان ميتا سمارت جلاس 2',
    brand: 'ray-ban', cats: ['watches', 'kids-fashion'],
    base: 2199, sale: 1999, stock: 26, loan: true, featured: true,
    colors: ['اسود', 'بني'],
    desc: 'كاميرا 12 ميجابكسل، مكالمات Hands Free، عدسات Ray-Ban Stories.',
    img: 'uploads/iphone.png',
  },
];

const run = async () => {
  console.log('[seed] start');

  /* ---- brands ---- */
  const brandIds = new Map();
  for (const b of BRANDS) {
    await query(
      `INSERT INTO brands (name_ar, name_en, slug) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE name_ar = VALUES(name_ar), name_en = VALUES(name_en)`,
      [b.name_ar, b.name_en, b.slug]
    );
    const row = await queryOne('SELECT id FROM brands WHERE slug = ?', [b.slug]);
    brandIds.set(b.slug, Number(row.id));
  }
  console.log(`[seed] brands: ${brandIds.size}`);

  /* ---- category slug -> id ---- */
  const catRows = await query('SELECT id, slug FROM categories');
  const catIds = new Map(catRows.map((c) => [c.slug, Number(c.id)]));
  console.log(`[seed] categories resolved: ${catIds.size}`);

  /* ---- products ---- */
  let created = 0;
  for (const p of PRODUCTS) {
    const slug = p.slug || slugify(p.name);
    const existing = await queryOne('SELECT id FROM products WHERE slug = ?', [slug]);

    // Shared scalars, ordered to match `cols` below.
    const cols = 'brand_id, name_ar, name_en, description, base_price, sale_price, rating_avg, rating_count, stock_quantity, is_loanable, is_featured, is_active';
    const vals = [
      brandIds.get(p.brand) ?? null,
      p.name,
      p.brand === 'apple' ? p.name.replace(/جوال/, 'Apple') : null,
      p.desc,
      p.base,
      p.sale,
      0,
      0,
      p.stock,
      p.loan ? 1 : 0,
      p.featured ? 1 : 0,
      1,
    ];
    const marks = '?,?,?,?,?,?,?,?,?,?,?,?';

    let productId;
    if (existing) {
      productId = Number(existing.id);
      // Same column order as `cols` - do not reorder one without the other.
      await query(
        `UPDATE products SET brand_id=?, name_ar=?, name_en=?, description=?,
           base_price=?, sale_price=?, rating_avg=?, rating_count=?, stock_quantity=?,
           is_loanable=?, is_featured=?, is_active=?
         WHERE id = ?`,
        [...vals, productId]
      );
    } else {
      const res = await query(
        `INSERT INTO products (slug, ${cols}) VALUES (?, ${marks})`,
        [slug, ...vals]
      );
      productId = res.insertId;
      created += 1;
    }

    // categories
    await query('DELETE FROM product_categories WHERE product_id = ?', [productId]);
    for (const catSlug of p.cats) {
      const cid = catIds.get(catSlug);
      if (cid) {
        await query('INSERT IGNORE INTO product_categories (product_id, category_id) VALUES (?,?)', [productId, cid]);
      }
    }

    // colors
    const colorCount = await queryOne('SELECT COUNT(*) AS c FROM product_colors WHERE product_id = ?', [productId]);
    if (Number(colorCount.c) === 0) {
      let order = 0;
      for (const name of p.colors) {
        const meta = COLORS[name] || { hex: '#cccccc', en: name };
        await query(
          'INSERT IGNORE INTO product_colors (product_id, name_ar, name_en, hex, sort_order) VALUES (?,?,?,?,?)',
          [productId, name, meta.en, meta.hex, order++]
        );
      }
    }

    // image
    const imgCount = await queryOne('SELECT COUNT(*) AS c FROM product_images WHERE product_id = ?', [productId]);
    if (Number(imgCount.c) === 0) {
      await query(
        'INSERT INTO product_images (product_id, image_path, is_primary, sort_order) VALUES (?,?,1,0)',
        [productId, p.img]
      );
    }

    // price history trail
    const histCount = await queryOne('SELECT COUNT(*) AS c FROM price_history WHERE product_id = ?', [productId]);
    if (Number(histCount.c) === 0 && p.sale) {
      await query(
        'INSERT INTO price_history (product_id, old_price, new_price, changed_by, reason) VALUES (?,?,?,1,?)',
        [productId, p.base, p.sale, 'عرض تخفيض']
      );
    }
  }
  console.log(`[seed] products: ${PRODUCTS.length} (${created} newly inserted)`);

  /* ---- admin with a real bcrypt hash ---- */
  const hash = await hashPassword(DEMO_PASSWORD);
  await query(
    `INSERT INTO admins (full_name, email, phone, password_hash)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash)`,
    ['مدير المتجر', 'admin@watanya.com', '0500009999', hash]
  );
  console.log('[seed] admin: 1 (password: ' + DEMO_PASSWORD + ')');

  /* ---- promo banners ---- */
  const promoCount = await queryOne('SELECT COUNT(*) AS c FROM promo_banners');
  if (Number(promoCount.c) === 0) {
    await query(
      `INSERT INTO promo_banners (title_ar, image_path, link_url, placement, sort_order)
       VALUES (?,?,?, 'sidebar', 1)`,
      ['عروض特殊性 على دبيونات لا تفوت!', 'uploads/iphone.png', '/categories/offers']
    );
    console.log('[seed] promo banner: 1');
  }

  /* ---- final summary ---- */
  const stats = await queryOne(
    `SELECT (SELECT COUNT(*) FROM products)    AS products,
            (SELECT COUNT(*) FROM categories)  AS categories,
            (SELECT COUNT(*) FROM brands)      AS brands,
            (SELECT COUNT(*) FROM customers)   AS customers,
            (SELECT COUNT(*) FROM reviews)     AS reviews,
            (SELECT COUNT(*) FROM product_colors) AS colors`
  );
  console.log('[seed] done:', stats);
  console.log(`\n[seed] admin login -> email: admin@watanya.com password: ${DEMO_PASSWORD}`);
};

run()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] FAILED:', err);
    await closePool();
    process.exit(1);
  });
