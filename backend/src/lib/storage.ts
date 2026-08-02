import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { logger } from './logger';
import { serverError } from './errors';

/**
 * The bucket is private. Nothing here ever produces a permanent public URL;
 * callers get a short lived signed URL only after an authorisation check.
 */
let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.storage.supabaseUrl, config.storage.supabaseServiceKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function buildObjectKey(studentId: string, extension: string): string {
  // Random key: the student's original filename is never used, and keys cannot
  // be guessed from a student's identity alone.
  return `submissions/${studentId}/${crypto.randomBytes(16).toString('hex')}.${extension}`;
}

const localPath = (key: string) => path.join(config.storage.localDir, key);

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!config.storage.useSupabase) {
    const target = localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return;
  }
  const { error } = await supabase()
    .storage.from(config.storage.bucket)
    .upload(key, body, { contentType, upsert: false });
  if (error) {
    logger.error({ err: error, key }, 'storage upload failed');
    throw serverError('Could not store the uploaded image.');
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (!config.storage.useSupabase) {
    await fs.rm(localPath(key), { force: true });
    return;
  }
  const { error } = await supabase().storage.from(config.storage.bucket).remove([key]);
  if (error) logger.warn({ err: error, key }, 'storage delete failed');
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!config.storage.useSupabase) {
    try {
      return { body: await fs.readFile(localPath(key)), contentType: 'application/octet-stream' };
    } catch {
      return null;
    }
  }
  const { data, error } = await supabase().storage.from(config.storage.bucket).download(key);
  if (error || !data) return null;
  return {
    body: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || 'application/octet-stream',
  };
}

/**
 * @param seconds how long the URL stays valid. Kept deliberately short.
 */
export async function createSignedUrl(key: string, seconds = 60): Promise<string | null> {
  if (!config.storage.useSupabase) return null;
  const { data, error } = await supabase()
    .storage.from(config.storage.bucket)
    .createSignedUrl(key, seconds);
  if (error || !data) {
    logger.error({ err: error, key }, 'could not create signed url');
    return null;
  }
  return data.signedUrl;
}
