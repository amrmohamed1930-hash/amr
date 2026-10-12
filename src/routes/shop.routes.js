import { Router } from 'express';
import * as ctrl from '../controllers/shop.controller.js';
import * as wishlistCtrl from '../controllers/catalog.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { z } from 'zod';
import {
  cartAddBody,
  cartUpdateBody,
  reviewCreateBody,
  orderCreateBody,
  orderListQuery,
  idParam,
} from '../validations/catalog.validation.js';

const router = Router();
router.use(authenticate); // every route below needs a customer token

/* ---------------- cart ---------------- */

router.get('/cart', ctrl.getCart);
router.post('/cart/items', validate({ body: cartAddBody }), ctrl.addItem);
router.post('/cart/items/bulk', validate({ body: z.object({ items: z.array(cartAddBody).min(1) }) }), ctrl.addMany);
router.patch('/cart/items', validate({ body: cartUpdateBody }), ctrl.updateItem);
router.delete('/cart/items/:id', validate({ params: idParam }), ctrl.removeItem);
router.delete('/cart', ctrl.clear);

/* ---------------- wishlist ---------------- */

router.get('/wishlist', wishlistCtrl.getWishlist);
router.post(
  '/wishlist',
  validate({ body: z.object({ product_id: z.coerce.number().int().positive() }) }),
  wishlistCtrl.addWishlist
);
router.post('/wishlist/:id/toggle', validate({ params: idParam }), wishlistCtrl.toggleWishlist);
router.delete('/wishlist/:id', validate({ params: idParam }), wishlistCtrl.removeWishlist);

/* ---------------- reviews ---------------- */

router.post('/reviews', validate({ body: reviewCreateBody }), ctrl.createReview);
router.patch(
  '/reviews/:id',
  validate({
    params: idParam,
    body: reviewCreateBody.partial().omit({ product_id: true }),
  }),
  ctrl.updateReview
);
router.delete('/reviews/:id', validate({ params: idParam }), ctrl.deleteReview);

/* ---------------- orders ---------------- */

router.get('/orders', validate({ query: orderListQuery }), ctrl.listMyOrders);
router.post('/orders', validate({ body: orderCreateBody }), ctrl.createOrder);
router.get('/orders/:id', validate({ params: idParam }), ctrl.getMyOrder);
router.post('/orders/:id/cancel', validate({ params: idParam }), ctrl.cancelOrder);

export default router;
