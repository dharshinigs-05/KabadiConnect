import type { AuthUser } from '../middleware/auth.js';

export const mockTokens = new Map<string, AuthUser>();

export function registerMockToken(token: string, user: AuthUser): void {
  mockTokens.set(token, user);
}

export function clearMockTokens(): void {
  mockTokens.clear();
}

export function getMockOtpFromEnv(): string {
  return process.env.MOCK_OTP ?? '123456';
}
