/**
 * Extract storage object path from a Firebase Storage download URL.
 */
export function extractStoragePathFromURL(fileURL: string): string | null {
  try {
    const urlObj = new URL(fileURL);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(\?|$)/);
    if (pathMatch && pathMatch[1]) {
      let decodedPath = decodeURIComponent(pathMatch[1]);
      if (decodedPath.includes("%")) {
        decodedPath = decodeURIComponent(decodedPath);
      }
      return decodedPath;
    }
    return null;
  } catch (error) {
    console.error("Error extracting storage path from URL:", error, fileURL);
    return null;
  }
}

/** True when URL points to this app's Firebase Storage bucket. */
export function isFirebaseStorageUrl(url: string): boolean {
  return /firebasestorage\.googleapis\.com|\.firebasestorage\.app/.test(url);
}
