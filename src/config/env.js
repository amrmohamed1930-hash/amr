import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env'), quiet: true });

const required = (key) => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${key} must be a number`);
  return parsed;
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: num('PORT', 4000),
  host: process.env.HOST || '0.0.0.0',
  publicUrl: process.env.API_PUBLIC_URL || 'http://localhost:4000',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:4000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num('DB_PORT', 3306),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: process.env.DB_NAME || 'watanya',
    connectionLimit: num('DB_CONNECTION_LIMIT', 10),
  },

  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    refreshExpiresDays: num('JWT_REFRESH_EXPIRES_DAYS', 30),
  },

  store: {
    currency: process.env.CURRENCY || 'SAR',
    freeShippingThreshold: num('FREE_SHIPPING_THRESHOLD', 200),
    shippingFlatRate: num('SHIPPING_FLAT_RATE', 25),
    taxRate: num('TAX_RATE', 0.15),
    maxPageSize: num('MAX_PAGE_SIZE', 60),
    defaultPageSize: num('DEFAULT_PAGE_SIZE', 12),
  },

  rateLimit: {
    windowMs: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: num('RATE_LIMIT_MAX', 300),
    authMax: num('AUTH_RATE_LIMIT_MAX', 20),
  },
};

if (isProd && config.jwt.secret.includes('change_me')) {
  throw new Error('JWT_SECRET must be changed before running in production');
}
