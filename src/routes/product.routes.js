import { Router } from 'express';
import * as ctrl from '../controllers/catalog.controller.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { productList, productBySlug, searchQuery } from '../validations/catalog.validation.js';

const router = Router();

// Literal paths must be declared before /:slug, otherwise Express matches them as a slug.
router.get('/search', validate({ query: searchQuery }), ctrl.searchProducts);
router.get('/featured', optionalAuth, validate({ query: productList }), ctrl.featuredDecorated);
router.get('/loanable', optionalAuth, validate({ query: productList }), ctrl.loanableDecorated);

router.get('/', optionalAuth, validate({ query: productList }), ctrl.listDecorated);

router.get('/:slug', optionalAuth, validate({ params: productBySlug }), ctrl.bySlug);

export default router;

