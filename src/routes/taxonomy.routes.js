import { Router } from 'express';
import * as ctrl from '../controllers/catalog.controller.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validations/catalog.validation.js';
import { reviewListQuery } from '../validations/catalog.validation.js';

const router = Router();

/* ---------------- categories ---------------- */

router.get('/categories', ctrl.listCategories);
router.get('/categories/:slug', ctrl.categoryBySlug);

/* ---------------- brands ---------------- */

router.get('/brands', ctrl.listBrands);
router.get('/brands/:slug', ctrl.brandBySlug);

/* ---------------- reviews ---------------- */

router.get('/products/:id/reviews', validate({ params: idParam, query: reviewListQuery }), ctrl.productReviews);

export default router;
