/**
 * secureFiles — helpers for the private "secure-docs" storage bucket.
 *
 * Sensitive documents (proforma, PO, quotations, supplier docs, item attachments)
 * live in a private bucket and are never reachable through a public URL.
 * We store a stable reference (`secure-docs://<path>`) in the database and mint
 * a short-lived signed URL only when the user actually opens the file.
 */
import { supabase } from '@/integrations/supabase/client';

export const SECURE_BUCKET = 'secure-docs';
const SCHEME = `${SECURE_BUCKET}://`;
const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

/** True when the value is a reference to a file in the private bucket. */
export function isSecureRef(value?: string | null): boolean {
  return !!value && value.startsWith(SCHEME);
}

/** Build the stored reference for a path inside the private bucket. */
export function toSecureRef(path: string): string {
  return `${SCHEME}${path}`;
}

/** Extract the storage path from a stored reference. */
export function secureRefPath(value: string): string {
  return value.startsWith(SCHEME) ? value.slice(SCHEME.length) : value;
}

/** Upload a file to the private bucket and return its stored reference. */
export async function uploadSecureFile(path: string, file: Blob): Promise<string> {
  const { error } = await supabase.storage.from(SECURE_BUCKET).upload(path, file, {
    upsert: false,
  });
  if (error) throw error;
  return toSecureRef(path);
}

/** Remove a file from the private bucket (accepts a path or a stored reference). */
export async function removeSecureFile(value: string): Promise<void> {
  const { error } = await supabase.storage
    .from(SECURE_BUCKET)
    .remove([secureRefPath(value)]);
  if (error) throw error;
}

/**
 * Resolve a stored value to an openable URL.
 * Plain http(s) links (and legacy public URLs) are returned untouched.
 */
export async function resolveFileUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!isSecureRef(value)) return value;
  const { data, error } = await supabase.storage
    .from(SECURE_BUCKET)
    .createSignedUrl(secureRefPath(value), SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Open a stored value in a new tab, signing it first when needed. */
export async function openSecureFile(value?: string | null): Promise<void> {
  const url = await resolveFileUrl(value);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
