import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ApiError } from '../utils/ApiError.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Same folder express.static serves at /uploads (see app.js).
export const UPLOAD_DIR = path.resolve(HERE, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, base + ext);
  },
});

const single = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) || !String(file.mimetype).startsWith('image/')) {
      return cb(ApiError.badRequest('صيغة الصورة غير مدعومة (png, jpg, gif, webp, avif, svg)'));
    }
    cb(null, true);
  },
}).single('image');

/** Wraps multer so its errors surface as clean ApiError responses. */
export const uploadImage = (req, res, next) => {
  single(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(ApiError.badRequest('حجم الصورة يتجاوز 5 ميغابايت'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('اسم الحقل يجب أن يكون image'));
    }
    next(err);
  });
};
