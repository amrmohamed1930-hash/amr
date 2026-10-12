/** Error carrying an HTTP status code. Thrown by services/controllers. */
export class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || defaultCode(status);
    this.details = details;
    this.expected = true;
  }

  static badRequest(msg = 'طلب غير صالح', opts) {
    return new ApiError(400, msg, { code: 'BAD_REQUEST', ...opts });
  }
  static unauthorized(msg = 'يجب تسجيل الدخول', opts) {
    return new ApiError(401, msg, { code: 'UNAUTHORIZED', ...opts });
  }
  static forbidden(msg = 'ليس لديك صلاحية للوصول', opts) {
    return new ApiError(403, msg, { code: 'FORBIDDEN', ...opts });
  }
  static notFound(msg = 'العنصر غير موجود', opts) {
    return new ApiError(404, msg, { code: 'NOT_FOUND', ...opts });
  }
  static conflict(msg = 'تعارض في البيانات', opts) {
    return new ApiError(409, msg, { code: 'CONFLICT', ...opts });
  }
  static unprocessable(msg = 'بيانات غير قابلة للمعالجة', opts) {
    return new ApiError(422, msg, { code: 'UNPROCESSABLE', ...opts });
  }
  static tooMany(msg = 'عدد كبير من الطلبات', opts) {
    return new ApiError(429, msg, { code: 'RATE_LIMITED', ...opts });
  }
  static internal(msg = 'خطأ في الخادم', opts) {
    return new ApiError(500, msg, { code: 'INTERNAL_ERROR', ...opts });
  }
}

const defaultCode = (status) =>
  ({
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE',
    429: 'RATE_LIMITED',
  })[status] || 'INTERNAL_ERROR';
