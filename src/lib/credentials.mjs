// The ONE place that decides which emails and passwords are acceptable.
// The login endpoint and the create-admin script both use it, so an account made by the
// script can always log in.
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

/** Returns an error message (string) when the pair is not acceptable, otherwise null. */
export function checkNewCredentials(email, password) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That does not look like an email.';
  if (email.length > EMAIL_MAX) return `Email is too long (maximum ${EMAIL_MAX}).`;
  if (password.length < PASSWORD_MIN) return `Password is too short (minimum ${PASSWORD_MIN}).`;
  if (password.length > PASSWORD_MAX) return `Password is too long (maximum ${PASSWORD_MAX}).`;
  return null;
}
