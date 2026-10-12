import { z } from 'zod';

/** Numeric primary key, coerced from the path string. */
export const idParam = z.object({ id: z.coerce.number().int().positive() });

/** URL slug, used by product/category/brand detail routes. */
export const slugParam = z.object({ slug: z.string().trim().min(1, 'المعرف مطلوب') });
