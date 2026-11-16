// The ONE place that decides which emails and passwords are acceptable.
// The login endpoint and the create-admin script both use it, so an account made by the
// script can always log in.
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;
// Owners (restaurant staff) get a lighter rule than the super admin, who can see everything.
export const OWNER_PASSWORD_MIN = 8;

// Same rule the browser applies to <input type="email"> (HTML standard): ASCII letters, digits and
// a few symbols before the @. If the script accepted more, it could create an account that the
// login form refuses to submit.
const EMAIL_PATTERN =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** True if the email is acceptable (same rule as the login form). */
export function isValidEmail(email) {
  return email.length <= EMAIL_MAX && EMAIL_PATTERN.test(email);
}

/** Returns an error message (string) when the pair is not acceptable, otherwise null. */
export function checkNewCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email)) return 'That does not look like an email (use English letters and digits).';
  if (email.length > EMAIL_MAX) return `Email is too long (maximum ${EMAIL_MAX}).`;
  if (password.length < PASSWORD_MIN) return `Password is too short (minimum ${PASSWORD_MIN}).`;
  if (password.length > PASSWORD_MAX) return `Password is too long (maximum ${PASSWORD_MAX}).`;
  return null;
}

/** Owner sign-up password rule: returns 'short' / 'long' when not acceptable, otherwise null. */
export function checkOwnerPassword(password) {
  if (password.length < OWNER_PASSWORD_MIN) return 'short';
  if (password.length > PASSWORD_MAX) return 'long';
  return null;
}
