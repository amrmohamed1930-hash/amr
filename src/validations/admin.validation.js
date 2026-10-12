import { z } from 'zod';
import { productSort } from './catalog.validation.js';

export { idParam } from './common.validation.js';

const trimmed = z.string().trim();

const email = z.string().trim().min(5, 'البريد الإلكتروني مطلوب').email('صيغة البريد الإلكتروني غير صحيحة');
const password = z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').max(72, 'كلمة المرور طويلة جداً');
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{7,20}$/, 'رقم الجوال غير صالح');

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(60).default(20);
const activeFlag = z.enum(['0', '1']);

/* ---------------- products / taxonomy lists ---------------- */

/**
 * Admin product list. `include_inactive` defaults to true here (and is not
 * even present on the public schema, so it can never be injected there):
 * the panel needs hidden products too, optionally narrowed by `active`.
 */
export const adminProductListQuery = z.object({
  q: trimmed.max(120).optional(),
  brand: z.union([trimmed, z.array(trimmed)]).optional(),
  category: z.union([trimmed, z.array(trimmed)]).optional(),
  include_inactive: z.coerce.boolean().default(true),
  active: activeFlag.optional(),
  page,
  limit,
  sort: productSort.default('newest'),
});

/* ---------------- customers ---------------- */

export const customerListQuery = z.object({
  q: trimmed.max(120).optional(),
  active: activeFlag.optional(),
  page,
  limit,
});

export const customerCreateBody = z.object({
  full_name: trimmed.min(2, 'الاسم مطلوب').max(120),
  email,
  phone,
  password,
  country: trimmed.max(60).optional(),
  city: trimmed.max(60).optional(),
  district: trimmed.max(90).optional(),
  street: trimmed.max(190).optional(),
  building: trimmed.max(60).optional(),
  // No .default(): Zod v4 fires defaults even through .partial(), which would
  // turn a partial admin PATCH into an implicit re-activation.
  is_active: z.coerce.boolean().optional(),
});

export const customerUpdateBody = z
  .object({
    full_name: trimmed.min(2, 'الاسم مطلوب').max(120),
    email,
    phone,
    country: trimmed.max(60),
    city: trimmed.max(60),
    district: trimmed.max(90),
    street: trimmed.max(190),
    building: trimmed.max(60),
    is_active: z.coerce.boolean(),
    // Optional reset: absent / empty means "leave the password alone".
    password: z.union([password, z.literal('')]).optional(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

/* ---------------- admin accounts ---------------- */

export const adminAccountBody = z.object({
  full_name: trimmed.min(2, 'الاسم مطلوب').max(120),
  email,
  phone,
  password,
  // optional (not .default(true)) - see customerCreateBody.
  is_active: z.coerce.boolean().optional(),
});

export const adminAccountUpdateBody = adminAccountBody
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

/* ---------------- carts ---------------- */

export const cartListQuery = z.object({
  q: trimmed.max(120).optional(),
  page,
  limit,
});

export const cartLineParams = z.object({
  id: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

/** 0 removes the line, mirroring the storefront cart behaviour. */
export const cartLineBody = z.object({
  amount: z.coerce.number().int().min(0).max(999),
});
