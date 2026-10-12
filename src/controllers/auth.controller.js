import * as auth from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/respond.js';
import { ApiError } from '../utils/ApiError.js';

export const register = asyncHandler(async (req, res) => {
  const result = await auth.register(req.body);
  created(res, result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await auth.login(req.body);
  ok(res, result);
});

export const refresh = asyncHandler(async (req, res) => {
  const result = await auth.refresh(req.body.refresh_token);
  ok(res, result);
});

export const logout = asyncHandler(async (req, res) => {
  await auth.logout(req.body?.refresh_token);
  noContent(res);
});

export const logoutAll = asyncHandler(async (req, res) => {
  await auth.logoutAll(req.user.id);
  noContent(res);
});

export const me = asyncHandler(async (req, res) => {
  ok(res, await auth.getProfile(req.user.id));
});

export const updateMe = asyncHandler(async (req, res) => {
  ok(res, await auth.updateProfile(req.user.id, req.body));
});

export const changePassword = asyncHandler(async (req, res) => {
  await auth.changePassword(req.user.id, req.body);
  ok(res, { message: 'تم تغيير كلمة المرور، يرجى تسجيل الدخول من جديد' });
});

/* ---------------- admin ---------------- */

export const adminLogin = asyncHandler(async (req, res) => {
  const result = await auth.adminLogin(req.body);
  ok(res, result);
});

export const adminMe = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') throw ApiError.forbidden();
  ok(res, req.user);
});
