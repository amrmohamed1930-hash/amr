import * as products from '../services/product.service.js';
import * as taxonomy from '../services/taxonomy.service.js';
import * as reviews from '../services/review.service.js';
import * as wishlist from '../services/wishlist.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/respond.js';
import { ApiError } from '../utils/ApiError.js';
import { toInt } from '../utils/query.js';
import { query } from '../config/db.js';

/* ============================================================
   Products - public
   ============================================================ */

export const list = asyncHandler(async (req, res) => {
  const result = await products.listProducts(req.query);
  ok(res, result.data, result.meta);
});

export const bySlug = asyncHandler(async (req, res) => {
  ok(res, await products.getProductBySlug(req.params.slug));
});

export const featured = asyncHandler(async (req, res) => {
  ok(res, await products.getFeatured(toInt(req.query.limit, 8)));
});

export const loanable = asyncHandler(async (req, res) => {
  ok(res, await products.getLoanable(toInt(req.query.limit, 8)));
});
export const searchProducts = asyncHandler(async (req, res) => {
  ok(res, await products.search(req.query));
});

/**
 * Attaches per-product `in_wishlist` / `in_cart` flags for the
 * current user, so the heart and cart icons render correctly.
 */
const decorate = async (req, data) => {
  if (!req.user) {
    for (const p of data) {
      p.in_wishlist = false;
      p.in_cart = false;
      p.cart_amount = 0;
    }
    return data;
  }

  const ids = data.map((p) => p.id);
  const inClause = ids.length ? ids.map(() => '?').join(',') : 'NULL';

  const [wishlisted, carted] = await Promise.all([
    wishlist.isWishlisted(req.user.id, ids),
    query(
      `SELECT cp.product_id, cp.amount FROM cart_product cp
         JOIN cart_items ci ON ci.id = cp.cart_item_id
        WHERE ci.customer_id = ? AND cp.product_id IN (${inClause})`,
      [req.user.id, ...ids]
    ).then((rows) => rows.map((r) => [Number(r.product_id), Number(r.amount)])),
  ]);

  const w = new Set(wishlisted);
  const c = new Map(carted);
  for (const p of data) {
    p.in_wishlist = w.has(p.id);
    p.cart_amount = c.get(p.id) || 0;
    p.in_cart = p.cart_amount > 0;
  }
  return data;
};

export const listDecorated = asyncHandler(async (req, res) => {
  const result = await products.listProducts(req.query);
  const data = await decorate(req, result.data);
  // Facets ride along in the envelope when requested, so the sidebar
  // renders from a single request instead of four.
  if (result.facets) {
    return res.json({ success: true, data, meta: result.meta, facets: result.facets });
  }
  ok(res, data, result.meta);
});

export const featuredDecorated = asyncHandler(async (req, res) => {
  ok(res, await decorate(req, await products.getFeatured(toInt(req.query.limit, 8))));
});

export const loanableDecorated = asyncHandler(async (req, res) => {
  ok(res, await decorate(req, await products.getLoanable(toInt(req.query.limit, 8))));
});

export const priceHistory = asyncHandler(async (req, res) => {
  ok(res, await products.getPriceHistory(toInt(req.params.id)));
});

/* ============================================================
   Categories / brands - public
   ============================================================ */

export const listCategories = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.listCategories({ tree: req.query.tree !== 'false' }));
});

export const categoryBySlug = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.getCategoryBySlug(req.params.slug));
});

export const listBrands = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.listBrands());
});

export const brandBySlug = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.getBrandBySlug(req.params.slug));
});

/* ============================================================
   Reviews - public read
   ============================================================ */

export const productReviews = asyncHandler(async (req, res) => {
  const result = await reviews.listProductReviews(toInt(req.params.id), req.query);
  ok(res, result.data, { ...result.meta, distribution: result.distribution });
});

/* ============================================================
   Wishlist - authenticated customer
   ============================================================ */

export const getWishlist = asyncHandler(async (req, res) => {
  ok(res, await wishlist.listWishlist(req.user.id));
});

export const addWishlist = asyncHandler(async (req, res) => {
  created(res, await wishlist.addToWishlist(req.user.id, toInt(req.body.product_id ?? req.params.id)));
});

export const removeWishlist = asyncHandler(async (req, res) => {
  await wishlist.removeFromWishlist(req.user.id, toInt(req.params.id));
  noContent(res);
});

export const toggleWishlist = asyncHandler(async (req, res) => {
  ok(res, await wishlist.toggleWishlist(req.user.id, toInt(req.params.id)));
});

/* ============================================================
   Admin - products
   ============================================================ */

export const createProduct = asyncHandler(async (req, res) => {
  const result = await products.createProduct(req.body, req.user.id);
  created(res, { ...result, product: await products.getProductById(result.id) });
});

export const updateProduct = asyncHandler(async (req, res) => {
  ok(res, await products.updateProduct(toInt(req.params.id), req.body, req.user.id));
});

export const deleteProduct = asyncHandler(async (req, res) => {
  await products.deleteProduct(toInt(req.params.id));
  noContent(res);
});

export const adminProductById = asyncHandler(async (req, res) => {
  ok(res, await products.getProductById(toInt(req.params.id)));
});

/* ============================================================
   Admin - taxonomy
   ============================================================ */

export const createCategory = asyncHandler(async (req, res) => {
  created(res, await taxonomy.createCategory(req.body));
});

export const updateCategory = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.updateCategory(toInt(req.params.id), req.body));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await taxonomy.deleteCategory(toInt(req.params.id));
  noContent(res);
});

export const createBrand = asyncHandler(async (req, res) => {
  created(res, await taxonomy.createBrand(req.body));
});

export const updateBrand = asyncHandler(async (req, res) => {
  ok(res, await taxonomy.updateBrand(toInt(req.params.id), req.body));
});

export const deleteBrand = asyncHandler(async (req, res) => {
  await taxonomy.deleteBrand(toInt(req.params.id));
  noContent(res);
});

/* ============================================================
   Admin - review moderation
   ============================================================ */

export const moderateReview = asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const approved = req.body.is_approved === undefined ? true : Boolean(req.body.is_approved);
  if (!Number.isInteger(id)) throw ApiError.badRequest('رقم التقييم غير صالح');
  await query('UPDATE reviews SET is_approved = ? WHERE id = ?', [approved ? 1 : 0, id]);
  ok(res, { id, is_approved: approved });
});
