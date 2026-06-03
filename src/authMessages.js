import { SupabaseRequestError } from './supabaseBackend.js';

export function isAccountExistsError(err) {
  if (!(err instanceof SupabaseRequestError) || err.status < 400 || err.status >= 500) {
    return false;
  }
  return /already\s+(?:exists|registered|been registered)|user\s+already/i.test(err.message || '');
}

export function authFailureMessage(err, fallback) {
  if (err instanceof SupabaseRequestError && err.status === 429) {
    const retry = err.retryAfterSeconds;
    if (Number.isFinite(retry) && retry > 0) {
      return `Supabase is rate limiting signup requests. Wait ${retry} seconds, then try again.`;
    }
    return 'Supabase is rate limiting signup requests. Wait about a minute, then try again.';
  }
  if (isAccountExistsError(err)) {
    return 'An account already exists for this email. Use Sign in, or reset the password if you do not remember it.';
  }
  if (err instanceof SupabaseRequestError && err.status >= 400 && err.status < 500 && err.message) {
    return err.message;
  }
  return fallback;
}
