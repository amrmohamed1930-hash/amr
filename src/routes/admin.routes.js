import { Router } from 'express';
import * as ctrl from '../controllers/catalog.controller.js';
import * as shop from '../controllers/shop.controller.js';
import * as admin from '../controllers/admin.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { uploadImage } from '../middleware/upload.js';
import {
  productCreateBody,
  productUpdateBody,
  categoryBody,
  categoryUpdateBody,
  brandBody,
  brandUpdateBody,
  orderUpdateStatusBody,
  orderListQuery,
  idParam,
} from '../validations/catalog.validation.js';
import {
  adminProductListQuery,
  customerListQuery,
  customerCreateBody,
  customerUpdateBody,
  adminAccountBody,
  adminAccountUpdateBody,
  cartListQuery,
  cartLineBody,
  cartLineParams,
} from '../validations/admin.validation.js';
import { z } from 'zod';

const router = Router();
router.use(authenticateAdmin); // single guard for the whole admin surface

/* ---------------- dashboard ---------------- */

router.get('/stats', shop.dashboard);

/* ---------------- full catalog lists (hidden rows included) ---------------- */

router.get('/products', validate({ query: adminProductListQuery }), admin.listAllProducts);
router.get('/categories', admin.listAllCategories);
router.get('/brands', admin.listAllBrands);

/* ---------------- uploads ---------------- */

router.post('/uploads', uploadImage, admin.uploadProductImage);

/* ---------------- products ---------------- */

router.post('/products', validate({ body: productCreateBody }), ctrl.createProduct);
router.get('/products/:id', validate({ params: idParam }), ctrl.adminProductById);
router.patch('/products/:id', validate({ params: idParam, body: productUpdateBody }), ctrl.updateProduct);
router.delete('/products/:id', validate({ params: idParam }), ctrl.deleteProduct);
router.get('/products/:id/price-history', validate({ params: idParam }), ctrl.priceHistory);
router.delete('/price-history/:id', validate({ params: idParam }), admin.deletePriceHistoryEntry);

/* ---------------- categories ---------------- */

router.post('/categories', validate({ body: categoryBody }), ctrl.createCategory);
router.patch('/categories/:id', validate({ params: idParam, body: categoryUpdateBody }), ctrl.updateCategory);
router.delete('/categories/:id', validate({ params: idParam }), ctrl.deleteCategory);

/* ---------------- brands ---------------- */

router.post('/brands', validate({ body: brandBody }), ctrl.createBrand);
router.patch('/brands/:id', validate({ params: idParam, body: brandUpdateBody }), ctrl.updateBrand);
router.delete('/brands/:id', validate({ params: idParam }), ctrl.deleteBrand);

/* ---------------- customers ---------------- */

router.get('/customers', validate({ query: customerListQuery }), admin.listCustomers);
router.post('/customers', validate({ body: customerCreateBody }), admin.createCustomer);
router.get('/customers/:id', validate({ params: idParam }), admin.getCustomer);
router.patch('/customers/:id', validate({ params: idParam, body: customerUpdateBody }), admin.updateCustomer);
router.delete('/customers/:id', validate({ params: idParam }), admin.deleteCustomer);

/* ---------------- admin accounts ---------------- */

router.get('/admins', admin.listAdminAccounts);
router.post('/admins', validate({ body: adminAccountBody }), admin.createAdminAccount);
router.patch('/admins/:id', validate({ params: idParam, body: adminAccountUpdateBody }), admin.updateAdminAccount);
router.delete('/admins/:id', validate({ params: idParam }), admin.deleteAdminAccount);

/* ---------------- carts ---------------- */

router.get('/carts', validate({ query: cartListQuery }), admin.listCarts);
router.get('/carts/:id', validate({ params: idParam }), admin.getCart);
router.patch('/carts/:id/lines/:lineId', validate({ params: cartLineParams, body: cartLineBody }), admin.updateCartLine);
router.delete('/carts/:id/lines/:lineId', validate({ params: cartLineParams }), admin.deleteCartLine);
router.delete('/carts/:id', validate({ params: idParam }), admin.deleteCart);

/* ---------------- orders ---------------- */

router.get('/orders', validate({ query: orderListQuery }), shop.listAllOrders);
router.patch('/orders/:id/status', validate({ params: idParam, body: orderUpdateStatusBody }), shop.updateOrderStatus);

/* ---------------- review moderation ---------------- */

router.patch(
  '/reviews/:id',
  validate({ params: idParam, body: z.object({ is_approved: z.coerce.boolean() }) }),
  ctrl.moderateReview
);

export default router;
