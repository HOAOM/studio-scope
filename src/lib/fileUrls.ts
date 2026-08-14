/**
 * fileUrls — resolve stored file references into short-lived signed URLs.
 *
 * Both storage buckets are private:
 *  - `item-files`  : item imagery, avatars, message attachments
 *  - `secure-docs` : sensitive documents (see src/lib/secureFiles.ts)
 *
 * Historical rows store the old public-style URL
 * (`.../storage/v1/object/public/item-files/<path>`). We keep writing that same
 * shape so nothing in the database has to be migrated, and translate it to a
 * signed URL at read time. External http(s) links are returned untouched.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSecureRef, resolveFileUrl as resolveSecureUrl } from '@/lib/secureFiles';

export const ITEM_BUCKET = 'item-files';
const PUBLIC_MARKER = `/storage/v1/object/public/${ITEM_BUCKET}/`;
const SIGN_MARKER = `/storage/v1/object/sign/${ITEM_BUCKET}/`;
const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour

/** Extract the object path when the value points at the item-files bucket. */
export function itemFilePath(value?: string | null): string | null {
  if (!value) return null;
  const idx = value.indexOf(PUBLIC_MARKER);
  if (idx === -1) return null;
  return decodeURIComponent(value.slice(idx + PUBLIC_MARKER.length).split('?')[0]);
}

/** True when the value is already a usable (signed or external) URL. */
function isAlreadySigned(value: string) {
  return value.includes(SIGN_MARKER);
}

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Resolve any stored file value into an openable URL.
 * Returns the input unchanged for external links.
 */
export async function resolveFileUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (isSecureRef(value)) return resolveSecureUrl(value);
  if (isAlreadySigned(value)) return value;

  const path = itemFilePath(value);
  if (!path) return value;

  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from(ITEM_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  cache.set(path, {
    url: data.signedUrl,
    expires: Date.now() + (SIGNED_TTL_SECONDS - 60) * 1000,
  });
  return data.signedUrl;
}

/** Open a stored file in a new tab, signing it first when needed. */
export async function openFile(value?: string | null): Promise<void> {
  const url = await resolveFileUrl(value);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

/** React hook: resolves a stored file value to a displayable URL. */
export function useFileUrl(value?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!value) return undefined;
    return itemFilePath(value) || isSecureRef(value) ? undefined : value;
  });

  useEffect(() => {
    let active = true;
    if (!value) {
      setUrl(undefined);
      return;
    }
    resolveFileUrl(value).then((resolved) => {
      if (active) setUrl(resolved ?? undefined);
    });
    return () => {
      active = false;
    };
  }, [value]);

  return url;
}
