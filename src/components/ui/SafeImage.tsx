"use client";

import NextImage, { type ImageProps } from "next/image";
import { useCallback, useState } from "react";

/**
 * Same as `next/image`, but if the default loader fails (e.g. Vercel Image
 * Optimization 402), retries with the original URL via `unoptimized`.
 */
export function SafeImage({
  onError,
  unoptimized,
  ...props
}: ImageProps) {
  const [fallbackToOrigin, setFallbackToOrigin] = useState(false);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      if (!unoptimized) {
        setFallbackToOrigin(true);
      }
      onError?.(e);
    },
    [onError, unoptimized]
  );

  const useOrigin = Boolean(unoptimized) || fallbackToOrigin;

  return (
    <NextImage
      {...props}
      key={useOrigin ? "img-origin-fallback" : "img-vercel-opt"}
      unoptimized={useOrigin}
      onError={handleError}
    />
  );
}
