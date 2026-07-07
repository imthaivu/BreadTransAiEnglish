interface ImageCache {
  [word: string]: string | null; // null means failed to load
}

class ImagePreloader {
  private cache: ImageCache = {};
  private loadingPromises: Map<string, Promise<string | null>> = new Map();
  private loadedImages: Set<string> = new Set(); // Track loaded image URLs to prevent memory leaks
  private maxCacheSize = 50; // Maximum number of images to keep in memory

  /**
   * Fetch image URL from Pexels API thông qua proxy API route để tránh CORS
   */
  private async fetchImageUrl(word: string): Promise<string | null> {
    try {
      // Gọi API route proxy thay vì gọi trực tiếp Pexels API
      const res = await fetch(
        `/api/images/pexels?query=${encodeURIComponent(word)}`
      );

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data.imageUrl || null;
    } catch (error) {
      console.error(`Failed to fetch image for "${word}":`, error);
      return null;
    }
  }

  /**
   * Preload an image by creating an Image object
   */
  private preloadImage(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.loadedImages.has(url)) {
        resolve();
        return;
      }

      const img = new Image();
      img.onload = () => {
        this.loadedImages.add(url);
        resolve();
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });
  }

  /**
   * Get image URL for a word (from cache or fetch)
   */
  async getImageUrl(word: string): Promise<string | null> {
    // Check cache first
    if (this.cache[word] !== undefined) {
      return this.cache[word];
    }

    // Check if already loading
    if (this.loadingPromises.has(word)) {
      return this.loadingPromises.get(word)!;
    }

    // Start fetching
    const promise = this.fetchImageUrl(word);
    this.loadingPromises.set(word, promise);

    const result = await promise;
    this.cache[word] = result;
    this.loadingPromises.delete(word);

    // Preload the image if URL exists
    if (result) {
      try {
        await this.preloadImage(result);
      } catch (error) {
        console.error(`Failed to preload image for "${word}":`, error);
      }
    }

    // Clean up old cache entries if cache is too large
    this.cleanupCache();

    return result;
  }

  /**
   * Preload images for multiple words
   */
  async preloadWords(words: string[]): Promise<void> {
    const promises = words.map((word) => this.getImageUrl(word));
    await Promise.allSettled(promises);
  }

  /**
   * Clean up old cache entries to prevent memory overflow
   */
  private cleanupCache(): void {
    const entries = Object.entries(this.cache);
    if (entries.length <= this.maxCacheSize) {
      return;
    }

    // Remove oldest entries (simple FIFO - remove first entries)
    const toRemove = entries.length - this.maxCacheSize;
    for (let i = 0; i < toRemove; i++) {
      const [word] = entries[i];
      delete this.cache[word];
    }
  }

  /**
   * Clear all cache (useful for cleanup)
   */
  clearCache(): void {
    this.cache = {};
    this.loadedImages.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get cached image URL without fetching
   */
  getCachedImageUrl(word: string): string | null | undefined {
    return this.cache[word];
  }
}

// Singleton instance
export const imagePreloader = new ImagePreloader();

// For use outside React components
export { ImagePreloader };

