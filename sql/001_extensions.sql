-- ============================================================
-- الوطنية للتمويل | Watanya Finance
-- Migration 001: extensions on top of database.sql
-- Adds: product colors, reviews, wishlist, refresh tokens,
--       addresses, orders, order_items, promo bar, perf indexes
-- Safe to run repeatedly (IF NOT EXISTS everywhere).
-- ============================================================

USE watanya;

-- ------------------------------------------------------------
-- 1. PRODUCT COLORS  (اللون - sidebar color filter)
-- Products have many colors; the sidebar filters on them.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_colors (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id  INT UNSIGNED NOT NULL,
    name_ar     VARCHAR(60)  NOT NULL,
    name_en     VARCHAR(60)  NULL,
    hex         CHAR(7)      NOT NULL DEFAULT '#cccccc',
    sort_order  INT          NOT NULL DEFAULT 0,
    UNIQUE KEY uq_product_color (product_id, name_ar),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. REVIEWS  (التقييمات)
-- One review per customer per product. Rating updates
-- products.rating_avg / rating_count via service layer.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id   INT UNSIGNED NOT NULL,
    customer_id  INT UNSIGNED NOT NULL,
    rating       TINYINT UNSIGNED NOT NULL,
    title        VARCHAR(160) NULL,
    comment      TEXT         NULL,
    is_approved  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_review (product_id, customer_id),
    KEY idx_review_product (product_id, is_approved),
    FOREIGN KEY (product_id)  REFERENCES products(id)  ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. WISHLIST  (مفضلتي)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id INT UNSIGNED NOT NULL,
    product_id  INT UNSIGNED NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wishlist (customer_id, product_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id)  REFERENCES products(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. REFRESH TOKENS  (JWT rotation / logout revocation)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id  INT UNSIGNED NOT NULL,
    token_hash   CHAR(64)     NOT NULL,
    expires_at   DATETIME     NOT NULL,
    revoked_at   DATETIME     NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token_hash (token_hash),
    KEY idx_token_customer (customer_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. ADDRESSES  (bookkeeping from customers table)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addresses (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id    INT UNSIGNED NOT NULL,
    label          VARCHAR(60)  NOT NULL DEFAULT 'المنزل',
    recipient_name VARCHAR(120) NOT NULL,
    phone          VARCHAR(20)  NOT NULL,
    country        VARCHAR(60)  NOT NULL DEFAULT 'السعودية',
    city           VARCHAR(60)  NOT NULL,
    district       VARCHAR(90)  NULL,
    street         VARCHAR(190) NULL,
    building       VARCHAR(60)  NULL,
    postal_code    VARCHAR(20)  NULL,
    is_default     TINYINT(1)   NOT NULL DEFAULT 0,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_address_customer (customer_id),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. ORDERS  (الطلبات)
-- loan_requested=1 mirrors "متاح من خلال القرض" financing flow.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_number    VARCHAR(32)  NOT NULL,
    customer_id     INT UNSIGNED NOT NULL,
    status          ENUM('pending','confirmed','processing','shipped','delivered','cancelled','refunded')
                    NOT NULL DEFAULT 'pending',
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    shipping        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    currency        CHAR(3)      NOT NULL DEFAULT 'SAR',
    payment_method  ENUM('cod','card','loan') NOT NULL DEFAULT 'cod',
    loan_requested  TINYINT(1)   NOT NULL DEFAULT 0,
    shipping_name   VARCHAR(120) NULL,
    shipping_phone  VARCHAR(20)  NULL,
    shipping_city   VARCHAR(60)  NULL,
    shipping_address VARCHAR(255) NULL,
    notes           VARCHAR(500) NULL,
    placed_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_number (order_number),
    KEY idx_order_customer (customer_id, placed_at),
    KEY idx_order_status (status),
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. ORDER ITEMS  (snapshot: name/price frozen at order time)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id     INT UNSIGNED NOT NULL,
    product_id   INT UNSIGNED NULL,
    product_name VARCHAR(255) NOT NULL,
    unit_price   DECIMAL(12,2) NOT NULL,
    quantity     INT UNSIGNED  NOT NULL DEFAULT 1,
    line_total   DECIMAL(12,2) NOT NULL,
    KEY idx_orderitem_order (order_id),
    FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. PROMO BARS  (sidebar promo image / site announcements)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_banners (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title_ar   VARCHAR(160) NULL,
    image_path VARCHAR(255) NULL,
    link_url   VARCHAR(255) NULL,
    placement  ENUM('sidebar','hero','footer') NOT NULL DEFAULT 'sidebar',
    sort_order INT          NOT NULL DEFAULT 0,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    starts_at  DATETIME     NULL,
    ends_at    DATETIME     NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. PERFORMANCE INDEXES for sidebar filtering / sorting
-- ------------------------------------------------------------
-- products is the hot table for: category join, brand, price range,
-- rating, is_loanable, is_featured, sort keys.
--
-- NOTE: MySQL 8 has no `CREATE INDEX IF NOT EXISTS` (that is MariaDB),
-- so add_if_missing() checks INFORMATION_SCHEMA and issues DDL only
-- when the index is absent. This keeps the migration re-runnable.
DROP PROCEDURE IF EXISTS add_if_missing;

DELIMITER $$
CREATE PROCEDURE add_if_missing(
    IN p_table  VARCHAR(64),
    IN p_index  VARCHAR(64),
    IN p_columns VARCHAR(512)
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME   = p_table
           AND INDEX_NAME   = p_index
    ) THEN
        SET @ddl = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

CALL add_if_missing('products',          'idx_products_price',    '`base_price`');
CALL add_if_missing('products',          'idx_products_rating',   '`rating_avg`');
CALL add_if_missing('products',          'idx_products_sales',    '`rating_count`');
CALL add_if_missing('products',          'idx_products_brand',    '`brand_id`');
CALL add_if_missing('products',          'idx_products_loan',     '`is_loanable`');
CALL add_if_missing('products',          'idx_products_featured', '`is_featured`, `is_active`');
CALL add_if_missing('products',          'idx_products_active',   '`is_active`, `created_at`');
CALL add_if_missing('categories',        'idx_cat_parent',        '`parent_id`, `sort_order`');
CALL add_if_missing('product_categories','idx_pc_category',       '`category_id`');
CALL add_if_missing('product_images',    'idx_img_product',       '`product_id`, `is_primary`');
CALL add_if_missing('price_history',     'idx_pricehist_product', '`product_id`, `changed_at`');
CALL add_if_missing('product_colors',    'idx_color_product',     '`product_id`');
CALL add_if_missing('product_colors',    'idx_color_name',        '`name_ar`');

DROP PROCEDURE add_if_missing;

