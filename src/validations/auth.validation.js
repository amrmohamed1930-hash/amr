import { z } from 'zod';

export { idParam, slugParam } from './common.validation.js';

const email = z.string().trim().min(5, 'البريد الإلكتروني مطلوب').email('صيغة البريد الإلكتروني غير صحيحة');
const password = z.string().min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل').max(72, 'كلمة المرور طويلة جداً');
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s]{7,20}$/, 'رقم الجوال غير صالح');

export const registerBody = z.object({
  full_name: z.string().trim().min(3, 'الاسم مطلوب').max(120),
  email,
  phone,
  password,
  city: z.string().trim().max(60).optional(),
});

export const loginBody = z.object({
  // Accepts either email or phone as the identifier.
  identifier: z.string().trim().min(3, 'أدخل البريد الإلكتروني أو رقم الجوال'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export const refreshBody = z.object({
  refresh_token: z.string().min(10, 'توكن التحديث مطلوب'),
});

export const updateProfileBody = z
  .object({
    full_name: z.string().trim().min(3, 'الاسم مطلوب').max(120).optional(),
    phone: phone.optional(),
    city: z.string().trim().max(60).optional(),
    country: z.string().trim().max(60).optional(),
    district: z.string().trim().max(90).optional(),
    street: z.string().trim().max(190).optional(),
    building: z.string().trim().max(60).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'لا توجد حقول للتحديث' });

export const changePasswordBody = z.object({
  current_password: z.string().min(1, 'كلمة المرور الحالية مطلوبة'),
  new_password: password,
});

export const adminLoginBody = z.object({
  identifier: z.string().trim().min(3, 'أدخل البريد الإلكتروني أو رقم الجوال'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});
