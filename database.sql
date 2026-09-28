-- ============================================================
-- الوطنية للتمويل | Watanya Finance - Store Database
-- MySQL 8.0+  (utf8mb4 / Arabic support)
-- Covers: categories, brands, products, product images,
-- customers + admins, cart, price history.
-- ============================================================

CREATE DATABASE IF NOT EXISTS watanya
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE watanya;

-- ------------------------------------------------------------
-- 1. CUSTOMERS (العملاء)
-- ------------------------------------------------------------
CREATE TABLE customers (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name        VARCHAR(120) NOT NULL,
    email            VARCHAR(190) NOT NULL UNIQUE,
    phone            VARCHAR(20)  NOT NULL UNIQUE,
    password_hash    VARCHAR(255) NOT NULL,
    country          VARCHAR(60)  NOT NULL DEFAULT 'السعودية',
    city             VARCHAR(60)  NOT NULL DEFAULT '',
    district         VARCHAR(90)  NULL,
    street           VARCHAR(190) NULL,
    building         VARCHAR(60)  NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 1b. ADMINS (المدراء)
-- ------------------------------------------------------------
CREATE TABLE admins (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name        VARCHAR(120) NOT NULL,
    email            VARCHAR(190) NOT NULL UNIQUE,
    phone            VARCHAR(20)  NOT NULL UNIQUE,
    password_hash    VARCHAR(255) NOT NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. CATEGORIES (جميع الفئات) - عودية (شجرة: أب / ابن)
-- ------------------------------------------------------------
CREATE TABLE categories (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    parent_id     INT UNSIGNED NULL,
    name_ar       VARCHAR(120) NOT NULL,
    name_en       VARCHAR(120) NULL,
    slug          VARCHAR(140) NOT NULL UNIQUE,
    image_path    VARCHAR(255) NULL,
    sort_order    INT          NOT NULL DEFAULT 0,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. BRANDS (الماركات)
-- ------------------------------------------------------------
CREATE TABLE brands (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name_ar    VARCHAR(120) NOT NULL,
    name_en    VARCHAR(120) NULL,
    slug       VARCHAR(140) NOT NULL UNIQUE,
    logo_path  VARCHAR(255) NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. PRODUCTS (المنتجات)
-- ------------------------------------------------------------
CREATE TABLE products (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    brand_id        INT UNSIGNED NULL,
    name_ar         VARCHAR(255) NOT NULL,
    name_en         VARCHAR(255) NULL,
    slug            VARCHAR(180) NOT NULL UNIQUE,
    description     TEXT         NULL,
    base_price      DECIMAL(12,2) NOT NULL,          -- السعر الأساسي
    sale_price      DECIMAL(12,2) NULL,              -- سعر العرض
    currency        CHAR(3)      NOT NULL DEFAULT 'SAR',
    rating_avg      DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    rating_count    INT UNSIGNED NOT NULL DEFAULT 0,
    stock_quantity  INT UNSIGNED NOT NULL DEFAULT 0,
    is_loanable     TINYINT(1)   NOT NULL DEFAULT 0, -- متاح من خلال القرض
    is_featured     TINYINT(1)   NOT NULL DEFAULT 0,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3b. PRICE HISTORY (سجل تغييرات السعر)
-- ------------------------------------------------------------
CREATE TABLE price_history (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id    INT UNSIGNED   NOT NULL,
    old_price     DECIMAL(12,2)  NULL,
    new_price     DECIMAL(12,2)  NOT NULL,
    changed_by    INT UNSIGNED   NULL,              -- admin الذي عدّل السعر
    reason        VARCHAR(190)   NULL,
    changed_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)  ON DELETE CASCADE,
    FOREIGN KEY (changed_by)  REFERENCES admins(id)   ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. PRODUCT <-> CATEGORY (منتج في عدة فئات)
-- ------------------------------------------------------------
CREATE TABLE product_categories (
    product_id  INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (product_id, category_id),
    FOREIGN KEY (product_id)  REFERENCES products(id)   ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. PRODUCT IMAGES (صور المنتج)
-- ------------------------------------------------------------
CREATE TABLE product_images (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id   INT UNSIGNED NOT NULL,
    image_path   VARCHAR(255) NOT NULL,
    is_primary   TINYINT(1)   NOT NULL DEFAULT 0,
    sort_order   INT          NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5b. CART (سلة التسوق)
-- ------------------------------------------------------------
CREATE TABLE cart_items (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT UNSIGNED NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cart_customer (customer_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5c. CART PRODUCT (منتجات السلة)
-- ------------------------------------------------------------
CREATE TABLE cart_product (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cart_item_id  INT UNSIGNED NOT NULL,
    product_id    INT UNSIGNED NOT NULL,
    amount        INT UNSIGNED NOT NULL DEFAULT 1,   -- الكمية
    price         DECIMAL(12,2) NOT NULL,             -- سعر الوحدة وقت الإضافة
    UNIQUE KEY uq_cart_product (cart_item_id, product_id),
    FOREIGN KEY (cart_item_id) REFERENCES cart_items(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- SEED: جميع الفئات (with Arabic names from the site)
-- ============================================================
INSERT INTO categories (id, parent_id, name_ar, name_en, slug, sort_order) VALUES
(1,  NULL, 'الإلكترونيات والموبايلات', 'Electronics & Mobiles', 'electronics', 1),
(2,  NULL, 'الأزياء',                 'Fashion',              'fashion',     2),
(3,  NULL, 'المنزل والأجهزة المنزلية', 'Home & Appliances',    'home',        3),
(4,  NULL, 'الجمال',                  'Beauty',               'beauty',      4),
(5,  NULL, 'الأطفال واللعب',          'Kids & Toys',          'kids',        5),
(6,  NULL, 'سوبر ماركت',              'Supermarket',          'supermarket', 6),
(7,  NULL, 'العروض',                  'Offers',               'offers',      7);

-- مستوى ثاني
INSERT INTO categories (id, parent_id, name_ar, name_en, slug, sort_order) VALUES
(10, 1, 'الموبايلات وملحقاتها', 'Mobiles & Accessories', 'mobiles',           1),
(11, 1, 'التلفزيونات والشاشات', 'TVs & Screens',         'tvs',               2),
(12, 1, 'سماعات الأذن',         'Headphones',            'headphones',        3),
(13, 1, 'الكاميرات والصور والفيديو', 'Cameras',          'cameras',           4),
(14, 1, 'أجهزة اللابتوب',       'Laptops',               'laptops',           5),
(15, 1, 'التابلت',              'Tablets',               'tablets',           6),
(20, 2, 'أزياء رجالية',         'Men Fashion',           'men',               1),
(21, 2, 'أزياء نسائية',         'Women Fashion',         'women',             2),
(22, 2, 'أزياء أطفال',          'Kids Fashion',          'kids-fashion',      3),
(23, 2, 'الساعات',              'Watches',               'watches',           4),
(30, 3, 'المطبخ وودادات الطعام', 'Kitchen & Dining',     'kitchen',           1),
(31, 3, 'مستلزمات الحمام',      'Bathroom',              'bathroom',          2),
(32, 3, 'الأجهزة المكتبية',     'Office',                'office',            3),
(33, 3, 'الأدوات وتحسين المنزل', 'Tools & Home Improv.', 'home-improvement',  4),
(40, 4, 'العطور',               'Perfumes',              'perfumes',          1),
(41, 4, 'المكياج',              'Makeup',                'makeup',            2),
(42, 4, 'العناية بالبشرة',      'Skincare',              'skincare',          3),
(43, 4, 'العناية بالشعر',       'Haircare',              'haircare',          4),
(50, 5, 'ملابس الأطفال',        'Kids Clothing',         'kids-clothing',     1),
(51, 5, 'الألعاب',              'Toys',                  'toys',              2),
(52, 5, 'مستلزمات الرضع',       'Baby Care',             'baby-care',         3);

-- مستوى ثالث (مثال فرعي)
INSERT INTO categories (id, parent_id, name_ar, name_en, slug, sort_order) VALUES
(100, 10, 'الهواتف الذكية', 'Smartphones', 'smartphones', 1),
(101, 13, 'كاميرات رقمية',  'Digital Cameras', 'digital-cameras', 1);

-- ============================================================
-- SEED: الماركات الظاهرة في الموقع
-- ============================================================
INSERT INTO brands (id, name_ar, name_en, slug) VALUES
(1, 'أبل',      'Apple',    'apple'),
(2, 'سامسونج',  'Samsung',  'samsung'),
(3, 'اتش تي سي','HTC',      'htc'),
(4, 'جيل',      'Gionee',   'gionee'),
(5, 'لينوفو',   'Lenovo',   'lenovo'),
(6, 'ديل',      'Dell',     'dell'),
(7, 'راي فان',  'Ray-Ban',  'ray-ban');

-- ============================================================
-- SEED: منتج تجريبي (ايفون 17 برو ماكس)
-- ============================================================
INSERT INTO products (id, brand_id, name_ar, slug, description, base_price, sale_price,
                      rating_avg, rating_count, stock_quantity, is_loanable, is_featured)
VALUES (1, 1,
        'جوال ايفون 17 برو ماكس 256 جيجا من ابل: شاشة 6.9',
        'iphone-17-pro-max-256',
        'شاشة 6.9 بوصة، كاميرا ثلاثية، متوفر بالتمويل.',
        6000.00, 5249.00,
        0.00, 0, 15, 1, 1);

INSERT INTO product_categories (product_id, category_id) VALUES (1, 100), (1, 10);

INSERT INTO product_images (id, product_id, image_path, is_primary) VALUES
(1, 1, 'uploads/iphone.png', 1);

-- ============================================================
-- SEED: المدراء
-- ============================================================
INSERT INTO admins (id, full_name, email, phone, password_hash) VALUES
(1, 'مدير المتجر', 'admin@watanya.com', '0500000002', '$2y$10$xxxxxxxxxxxxxxxxxxxxxxx');

-- ============================================================
-- SEED: سجل سعر المنتج (نزول من 6000 إلى 5249)
-- ============================================================
INSERT INTO price_history (id, product_id, old_price, new_price, changed_by, reason) VALUES
(1, 1, 6000.00, 5249.00, 1, 'عرض تخفيض');