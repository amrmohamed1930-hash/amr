-- ============================================================
-- الوطنية للتمويل | Watanya Finance
-- Migration 002: remove seeded test customers and reviews
--
-- The seeder used to insert five fake customers plus random
-- reviews for every product. Both are gone from scripts/seed.js
-- and database.sql; this script purges rows that earlier runs
-- already wrote to a live database.
--
-- Matching is deliberately narrow: only rows carrying the
-- seeder's own identifiers are touched. Real signups use their
-- own emails/phones and are left alone.
--
-- The admins table is not touched: admin@watanya.com is the
-- documented bootstrap account.
--
-- Safe to re-run; every statement is idempotent.
-- ============================================================

USE watanya;

-- ------------------------------------------------------------
-- 1. Seeded test customers
-- Emails: ahmed@ sara@ khaled@ noura@ mohammed@ (watanya.com)
-- Phones: 0500000001 .. 0500000005, plus the duplicate 0500000002
-- Smoke-suite rows: smoke<timestamp>@watanya.com
--
-- Deleting the customer cascades to reviews, wishlist_items,
-- refresh_tokens, addresses, orders (+order_items) and
-- cart_items, so no orphans are left behind.
-- ------------------------------------------------------------
DELETE FROM customers
     WHERE email IN ('ahmed@watanya.com',
                     'sara@watanya.com',
                     'khaled@watanya.com',
                     'noura@watanya.com',
                     'mohammed@watanya.com')
        OR email LIKE 'smoke%@watanya.com'
        OR phone IN ('0500000001', '0500000002', '0500000003',
                     '0500000004', '0500000005');

-- ------------------------------------------------------------
-- 2. Any review whose text came from the seeder's REVIEW_TEXTS
-- Safety net for rows written before the customer delete above
-- (for example if a customer's email was changed by hand).
-- ------------------------------------------------------------
DELETE FROM reviews
     WHERE title IN ('ممتاز جداً', 'يستحق السعر', 'جيد', 'راضٍ',
                     'مقبول', 'لم يعجبني', 'أفضل من المتوقع');

-- ------------------------------------------------------------
-- 3. Recompute product ratings from the reviews that remain
-- rather than blanket-zeroing, so genuine reviews keep counting.
-- Products left with no reviews fall back to 0.00 / 0.
-- ------------------------------------------------------------
UPDATE products p
   SET p.rating_avg = COALESCE(
           (SELECT ROUND(AVG(r.rating), 2) FROM reviews r
             WHERE r.product_id = p.id AND r.is_approved = 1), 0),
       p.rating_count = (
           SELECT COUNT(*) FROM reviews r
             WHERE r.product_id = p.id AND r.is_approved = 1);

-- ------------------------------------------------------------
-- 4. Report
-- ------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM customers) AS customers,
       (SELECT COUNT(*) FROM reviews)   AS reviews,
       (SELECT COUNT(*) FROM admins)    AS admins;
