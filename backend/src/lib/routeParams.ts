import { badRequest } from '../errors/AppError.js';

export function routeParam(value: string | string[] | undefined, name = 'id'): string {
  if (Array.isArray(value)) {
    return value[0];
  }
  if (!value) {
    throw badRequest(`Missing route parameter: ${name}`);
  }
  return value;
}
