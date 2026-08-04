import jwt from 'jsonwebtoken';
import { config } from '../config';
import { createSignedUrl } from '../lib/storage';

/**
 * Photos are never publicly addressable. A caller that has passed an
 * authorisation check is handed a URL that stops working after 60 seconds.
 *
 * With Supabase the URL is a storage signed URL. In local development there is
 * no Supabase, so a short lived signed token is issued for /api/images/:token
 * instead, which keeps the frontend identical in both modes.
 */
const TTL_SECONDS = 60;

export async function photoUrl(objectKey: string, apiBaseUrl: string): Promise<string> {
  if (config.storage.useSupabase) {
    const signed = await createSignedUrl(objectKey, TTL_SECONDS);
    if (signed) return signed;
  }
  const token = jwt.sign({ k: objectKey }, config.jwt.secret, {
    expiresIn: TTL_SECONDS,
    audience: 'costume-competition-image',
  });
  return `${apiBaseUrl}/api/images/${token}`;
}

export function verifyPhotoToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      audience: 'costume-competition-image',
    });
    if (typeof payload === 'string') return null;
    const key = (payload as { k?: unknown }).k;
    return typeof key === 'string' ? key : null;
  } catch {
    return null;
  }
}
