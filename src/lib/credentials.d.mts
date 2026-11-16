export const EMAIL_MAX: number;
export const PASSWORD_MIN: number;
export const PASSWORD_MAX: number;
export const OWNER_PASSWORD_MIN: number;
export function checkOwnerPassword(password: string): 'short' | 'long' | null;
export function checkNewCredentials(email: string, password: string): string | null;
export function isValidEmail(email: string): boolean;
