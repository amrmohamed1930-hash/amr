import { Router } from 'express';
import { config } from '../config/env.js';
import { ping } from '../config/db.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';
import { listCategories, listBrands } from '../services/taxonomy.service.js';

import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import taxonomyRoutes from './taxonomy.routes.js';
import shopRoutes from './shop.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', asyncHandler(async (_req, res) => {
  let db = 'down';
  try {
    db = (await ping()) ? 'up' : 'down';
  } catch {
    db = 'down';
  }
  res.status(db === 'up' ? 200 : 503).json({
    success: db === 'up',
    data: { status: db === 'up' ? 'ok' : 'degraded', db, uptime: process.uptime(), env: config.env },
  });
}));

router.get('/config', (_req, res) =>
  ok(res, {
    currency: config.store.currency,
    tax_rate: config.store.taxRate,
    free_shipping_threshold: config.store.freeShippingThreshold,
    shipping_flat_rate: config.store.shippingFlatRate,
    max_page_size: config.store.maxPageSize,
  })
);

// Storefront bootstrap: nav + config in one call for first paint.
router.get(
  '/storefront',
  asyncHandler(async (_req, res) => {
    const [categories, brands] = await Promise.all([listCategories(), listBrands()]);
    ok(res, {
      categories,
      brands,
      store: {
        currency: config.store.currency,
        tax_rate: config.store.taxRate,
        free_shipping_threshold: config.store.freeShippingThreshold,
        shipping_flat_rate: config.store.shippingFlatRate,
        max_page_size: config.store.maxPageSize,
      },
    });
  })
);

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/', taxonomyRoutes);
router.use('/me', shopRoutes);
router.use('/admin', adminRoutes);

export default router;
