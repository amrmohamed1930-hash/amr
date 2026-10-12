import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate, authenticateAdmin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  registerBody,
  loginBody,
  refreshBody,
  updateProfileBody,
  changePasswordBody,
  adminLoginBody,
} from '../validations/auth.validation.js';

const router = Router();

/* ---------------- customer auth ---------------- */

router.post('/register', authLimiter, validate({ body: registerBody }), ctrl.register);
router.post('/login', authLimiter, validate({ body: loginBody }), ctrl.login);
router.post('/refresh', authLimiter, validate({ body: refreshBody }), ctrl.refresh);
router.post('/logout', ctrl.logout);

router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, validate({ body: updateProfileBody }), ctrl.updateMe);
router.post('/change-password', authenticate, validate({ body: changePasswordBody }), ctrl.changePassword);
router.post('/logout-all', authenticate, ctrl.logoutAll);

/* ---------------- admin auth ---------------- */

router.post('/admin/login', authLimiter, validate({ body: adminLoginBody }), ctrl.adminLogin);
router.get('/admin/me', authenticateAdmin, ctrl.adminMe);

export default router;
