import { z } from 'zod';
import { slugParam } from './common.validation.js';

export { idParam, slugParam } from './common.validation.js';

const trimmed = z.string().trim();

/* ---------------- products ---------------- */

/** Sort keys exposed to the frontend, mapped to safe SQL in the service. */
export const productSort = z.enum([
  'best_selling',
  'price_asc',
  'price_desc',
  'rating_desc',
  'newest',
  'popular',
  'name_asc',
  'name_desc',
]);

const productListQuery = z.object({
  // sidebar filters
  category: z.union([trimmed, z.array(trimmed)]).optional(),
  brand: z.union([trimmed, z.array(trimmed)]).optional(),
  color: z.union([trimmed, z.array(trimmed)]).optional(),
  min_price: z.coerce.number().min(0, 'السعر الأدنى غير صالح').optional(),
  max_price: z.coerce.number().min(0, 'السعر الأعلى غير صالح').optional(),
  min_rating: z.coerce.number().min(0).max(5).optional(),
  loanable: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  in_stock: z.coerce.boolean().optional(),
  on_sale: z.coerce.boolean().optional(),
  q: trimmed.max(120).optional(),

  // paging / sorting
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  sort: productSort.default('best_selling'),
  include: trimmed.optional(), // reserved: extra relations

  // facets for the sidebar
  with_facets: z.coerce.boolean().default(false),
});

export const productList = productListQuery;

export const productBySlug = slugParam;

export const productCreateBody = z.object({
  name_ar: trimmed.min(3, 'اسم المنتج مطلوب').max(255),
  name_en: trimmed.max(255).nullish(),
  brand_id: z.coerce.number().int().positive().nullish(),
  description: trimmed.max(5000).nullish(),
  base_price: z.coerce.number().min(0, 'السعر الأساسي مطلوب'),
  sale_price: z.coerce.number().min(0).nullish(),
  // NOTE: everything below is deliberately optional without a .default().
  // This object is also used (via .partial()) for PATCH, and in Zod v4 a
  // .default() still fires there - which would silently reset omitted fields
  // (stock, flags, category_ids, images, colors) on every partial update.
  // The create path fills the same defaults in the service instead.
  stock_quantity: z.coerce.number().int().min(0).optional(),
  is_loanable: z.coerce.boolean().optional(),
  is_featured: z.coerce.boolean().optional(),
  is_active: z.coerce.boolean().optional(),
  category_ids: z.array(z.coerce.number().int().positive()).optional(),
  colors: z
    .array(
      z.object({
        name_ar: trimmed.min(1).max(60),
        name_en: trimmed.max(60).optional(),
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'كود اللون غير صالح').default('#cccccc'),
      })
    )
    .optional(),
  images: z.array(trimmed.max(255)).optional(),
});

export const productUpdateBody = productCreateBody
  .partial()
  // Free-text reason for the price_history row the service writes on a change.
  .extend({ reason: trimmed.max(190).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

export const productPriceBody = z.object({
  base_price: z.coerce.number().min(0, 'السعر الأساسي مطلوب').optional(),
  sale_price: z.coerce.number().min(0).nullish(),
  reason: trimmed.max(190).optional(),
});

/* ---------------- categories / brands ---------------- */

export const categoryBody = z.object({
  name_ar: trimmed.min(2, 'اسم الفئة مطلوب').max(120),
  name_en: trimmed.max(120).nullish(),
  parent_id: z.coerce.number().int().positive().nullish(),
  // No .default() here: categoryUpdateBody derives from this object, and
  // Zod v4 applies defaults even after .partial() (see productCreateBody).
  sort_order: z.coerce.number().int().optional(),
  is_active: z.coerce.boolean().optional(),
});

export const categoryUpdateBody = categoryBody
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

export const brandBody = z.object({
  name_ar: trimmed.min(2, 'اسم الماركة مطلوب').max(120),
  name_en: trimmed.max(120).nullish(),
  is_active: z.coerce.boolean().optional(),
});

export const brandUpdateBody = brandBody
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

/* ---------------- cart ---------------- */

export const cartAddBody = z.object({
  product_id: z.coerce.number().int().positive('رقم المنتج غير صالح'),
  amount: z.coerce.number().int().min(1).max(99).default(1),
});

export const cartUpdateBody = z.object({
  product_id: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().min(0).max(99), // 0 removes the line
});

/* ---------------- reviews ---------------- */

export const reviewCreateBody = z.object({
  product_id: z.coerce.number().int().positive('رقم المنتج غير صالح'),
  rating: z.coerce.number().int().min(1, 'التقييم من 1 إلى 5').max(5),
  title: trimmed.max(160).optional(),
  comment: trimmed.max(3000).optional(),
});

export const reviewListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  with_images: z.coerce.boolean().default(false),
});

/* ---------------- orders ---------------- */

export const orderCreateBody = z.object({
  payment_method: z.enum(['cod', 'card', 'loan']).default('cod'),
  loan_requested: z.coerce.boolean().default(false),
  shipping_name: trimmed.max(120).optional(),
  shipping_phone: trimmed.max(20).optional(),
  shipping_city: trimmed.max(60).optional(),
  shipping_address: trimmed.max(255).optional(),
  notes: trimmed.max(500).optional(),
  // optional: buy these specific quantities instead of the whole cart
  items: z
    .array(z.object({ product_id: z.coerce.number().int().positive(), amount: z.coerce.number().int().min(1).max(99) }))
    .optional(),
});

export const orderUpdateStatusBody = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
});

export const orderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
});

/* ---------------- misc ---------------- */

export const searchQuery = z.object({
  q: trimmed.min(1, 'اكتب كلمة للبحث'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
