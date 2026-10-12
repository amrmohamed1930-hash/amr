import { ApiError } from '../utils/ApiError.js';

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`المسار غير موجود: ${req.method} ${req.originalUrl}`));
};

/* eslint-disable no-unused-vars */
// Express identifies the error handler by its 4-arg signature.
export const errorHandler = (err, req, res, _next) => {
  const isExpected = err instanceof ApiError || err.expected === true;

  if (!isExpected) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  // MySQL duplicate key
  if (err?.code === 'ER_DUP_ENTRY') {
    err = ApiError.conflict('هذه البيانات موجودة مسبقاً');
  }
  // MySQL bad enum / truncated value
  if (err?.code === 'ER_WARN_DATA_OUT_OF_RANGE' || err?.code === 'ER_DATA_TOO_LONG') {
    err = ApiError.unprocessable('القيمة المُرسلة غير صالحة');
  }
  // Malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    err = ApiError.badRequest('صيغة JSON غير صالحة');
  }

  const status = err.status || 500;
  const body = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isExpected || status < 500 ? err.message : 'حدث خطأ غير متوقع',
    },
  };

  if (err.details) body.error.details = err.details;
  if (!config_isProd() && !isExpected) body.error.stack = err.stack;

  res.status(status).json(body);
};

const config_isProd = () => process.env.NODE_ENV === 'production';
