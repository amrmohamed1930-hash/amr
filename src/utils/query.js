import { config } from '../config/env.js';

/**
 * Parses a comma-separated list query param into trimmed, non-empty values.
 * Accepts both `?brand=a,b` and repeated `?brand=a&brand=b`.
 */
export const parseList = (value) => {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
};

export const toInt = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
};

export const toFloat = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number.parseFloat(String(value));
  return Number.isNaN(n) ? fallback : n;
};

export const toBool = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
};

/** Normalises ?page=&limit= into safe SQL LIMIT/OFFSET. */
export const parsePagination = (queryObj) => {
  const requested = toInt(queryObj.page, 1) ?? 1;
  const requestedLimit = toInt(queryObj.limit, config.store.defaultPageSize) ?? config.store.defaultPageSize;
  const page = Math.max(1, requested);
  const limit = Math.min(Math.max(1, requestedLimit), config.store.maxPageSize);
  return { page, limit, offset: (page - 1) * limit };
};

export const buildMeta = ({ page, limit }, total) => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

/** Rounds money to 2 decimals to avoid float drift. */
export const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
