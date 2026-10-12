import * as products from '../services/product.service.js';
import * as taxonomy from '../services/taxonomy.service.js';
import * as admins from '../services/admin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/respond.js';
import { ApiError } from '../utils/ApiError.js';

/* ============================================================
   Full catalog lists (hidden rows included)
   ============================================================ */

export const listAllProducts = asyncHandler(async (req, res) => {
  const result = await products.listProducts(req.query);
  ok(res, result.data, result.meta);
});

export const listAllCategories = asyncHandler(async (_req, res) => {
  ok(res, await taxonomy.listCategories({ tree: false, includeInactive: true }));
});

export const listAllBrands = asyncHandler(async (_req, res) => {
  ok(res, await taxonomy.listBrands({ includeInactive: true }));
});

/* ============================================================
   Customers
   ============================================================ */

export const listCustomers = asyncHandler(async (req, res) => {
  const result = await admins.listCustomers(req.query);
  ok(res, result.data, result.meta);
});

export const createCustomer = asyncHandler(async (req, res) => {
  created(res, await admins.createCustomer(req.body));
});

export const getCustomer = asyncHandler(async (req, res) => {
  ok(res, await admins.getCustomer(req.params.id));
});

export const updateCustomer = asyncHandler(async (req, res) => {
  ok(res, await admins.updateCustomer(req.params.id, req.body));
});

export const deleteCustomer = asyncHandler(async (req, res) => {
  await admins.deleteCustomer(req.params.id);
  noContent(res);
});

/* ============================================================
   Admin accounts
   ============================================================ */

export const listAdminAccounts = asyncHandler(async (_req, res) => {
  ok(res, await admins.listAdmins());
});

export const createAdminAccount = asyncHandler(async (req, res) => {
  created(res, await admins.createAdmin(req.body));
});

export const updateAdminAccount = asyncHandler(async (req, res) => {
  ok(res, await admins.updateAdmin(req.params.id, req.body, req.user.id));
});

export const deleteAdminAccount = asyncHandler(async (req, res) => {
  await admins.deleteAdmin(req.params.id, req.user.id);
  noContent(res);
});

/* ============================================================
   Carts
   ============================================================ */

export const listCarts = asyncHandler(async (req, res) => {
  const result = await admins.listCarts(req.query);
  ok(res, result.data, result.meta);
});

export const getCart = asyncHandler(async (req, res) => {
  ok(res, await admins.getCart(req.params.id));
});

export const updateCartLine = asyncHandler(async (req, res) => {
  ok(res, await admins.updateCartLine(req.params.id, req.params.lineId, req.body.amount));
});

export const deleteCartLine = asyncHandler(async (req, res) => {
  ok(res, await admins.deleteCartLine(req.params.id, req.params.lineId));
});

export const deleteCart = asyncHandler(async (req, res) => {
  await admins.deleteCart(req.params.id);
  noContent(res);
});

/* ============================================================
   Uploads
   ============================================================ */

/** POST /admin/uploads -> { path: "uploads/xxx.png", url: "/uploads/xxx.png" } */
export const uploadProductImage = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('لم يتم إرسال أي ملف');
  const rel = `uploads/${req.file.filename}`;
  created(res, { path: rel, url: `/${rel}` });
});

/* ============================================================
   Price history
   ============================================================ */

export const deletePriceHistoryEntry = asyncHandler(async (req, res) => {
  await admins.deletePriceHistoryEntry(req.params.id);
  noContent(res);
});
