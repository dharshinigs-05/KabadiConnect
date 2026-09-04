export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function badRequest(message: string, code = 'VALIDATION_ERROR'): AppError {
  return new AppError(400, code, message);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}

export function notFound(message = 'Resource not found'): AppError {
  return new AppError(404, 'NOT_FOUND', message);
}

export function conflict(message: string, code = 'CONFLICT'): AppError {
  return new AppError(409, code, message);
}

export function internal(message = 'Internal server error'): AppError {
  return new AppError(500, 'INTERNAL_ERROR', message);
}

export function externalService(message: string): AppError {
  return new AppError(502, 'EXTERNAL_SERVICE_ERROR', message);
}
