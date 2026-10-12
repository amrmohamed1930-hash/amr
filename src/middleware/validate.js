import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

const format = (error) => {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
};

/**
 * Validates and REPLACES req.body / req.query / req.params
 * with the parsed (coerced, stripped) result.
 *
 * query parsing note: Express 5 exposes req.query as a getter-only
 * property, so it is redefined rather than assigned.
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    if (schemas.params) req.params = schemas.params.parse(req.params ?? {});

    if (schemas.query) {
      const parsed = schemas.query.parse(req.query ?? {});
      Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return next(ApiError.unprocessable('البيانات المُرسلة غير صالحة', { details: format(err) }));
    }
    next(err);
  }
};
