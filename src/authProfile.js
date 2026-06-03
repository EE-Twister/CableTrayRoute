const AVATAR_PALETTE = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#4338ca', '#047857', '#0369a1'];

export function initialsForUser(user = '') {
  const source = String(user || '').trim();
  if (!source) return 'U';
  const label = source.includes('@') ? source.split('@')[0] : source;
  const parts = label.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

export function avatarColorForUser(user = '') {
  const source = String(user || 'user');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export function authProviderLabel(auth) {
  if (!auth) return 'Signed out';
  return auth.provider === 'supabase' ? 'Supabase account' : 'Server account';
}
