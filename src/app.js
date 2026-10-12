import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { ApiError } from './utils/ApiError.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '..');

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; CSP here would just break the static frontend.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin/curl requests arrive without an Origin header.
        if (!origin) return callback(null, true);
        if (config.clientOrigins.includes(origin)) return callback(null, true);
        // Opening index.html straight from disk makes the page origin
        // file://, which browsers report as the literal string "null".
        // Allowed in development only; a sandboxed iframe or any local file
        // could otherwise make credentialed cross-origin calls.
        if (!config.isProd && origin === 'null') return callback(null, true);
        callback(ApiError.forbidden(`أصل غير مسموح به: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!config.isProd) {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  app.get('/api', (_req, res) =>
    res.json({
      success: true,
      data: {
        name: 'Watanya Store API',
        version: '1.0.0',
        health: '/api/health',
        storefront: '/api/storefront',
      },
    })
  );

  app.use('/api', apiLimiter, routes);

  /* ---------------- static frontend ---------------- */
  // The project root also holds .env and database.sql, so the whole directory
  // is never mounted. Only the handful of files the page actually needs are
  // served, by explicit name.
  const FRONTEND_FILES = new Map([
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/admin.html', 'admin.html'],
    ['/admin.js', 'admin.js'],
    ['/er.html', 'er.html'],
    ['/style.css', 'style.css'],
    ['/script.js', 'script.js'],
  ]);

  const sendFrontendFile = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const target = FRONTEND_FILES.get(req.path);
    if (!target) return next();
    res.sendFile(path.join(PUBLIC_DIR, target), (err) => err && next());
  };

  // Product images live in /uploads and are referenced by DB rows.
  app.use('/uploads', express.static(path.join(PUBLIC_DIR, 'uploads'), { fallthrough: true }));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'uploads'), { fallthrough: true }));

  // RegExp rather than '*' so this stays valid on Express 5.
  app.get(/.*/, sendFrontendFile);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
