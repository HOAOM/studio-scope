/**
 * StoredImage — <img> that resolves private-bucket references into signed URLs.
 * Drop-in replacement for <img src={storedValue} />.
 */
import { useFileUrl } from '@/lib/fileUrls';

interface StoredImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
}

export function StoredImage({ src, alt = '', ...rest }: StoredImageProps) {
  const resolved = useFileUrl(src);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} {...rest} />;
}
