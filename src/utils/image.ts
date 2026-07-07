/**
 * Compress and resize image to reduce storage size
 * @param file - Original image file
 * @param maxWidth - Maximum width (default: 400)
 * @param maxHeight - Maximum height (default: 400)
 * @param quality - JPEG quality 0-1 (default: 0.85)
 * @returns Compressed File object
 */
export async function compressAndResizeImage(
  file: File,
  maxWidth: number = 400,
  maxHeight: number = 400,
  quality: number = 0.85
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (!file.type.startsWith("image/")) {
      reject(new Error("File phải là ảnh"));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          let sourceX = 0;
          let sourceY = 0;
          let sourceWidth = img.width;
          let sourceHeight = img.height;
          let canvasWidth = maxWidth;
          let canvasHeight = maxHeight;

          // If maxWidth === maxHeight, crop to square (1:1) from center
          if (maxWidth === maxHeight) {
            // Calculate square size from original image (use smaller dimension)
            const size = Math.min(img.width, img.height);
            
            // Calculate crop position (center crop)
            sourceX = (img.width - size) / 2;
            sourceY = (img.height - size) / 2;
            sourceWidth = size;
            sourceHeight = size;
            
            // Canvas will be the target square size
            canvasWidth = maxWidth;
            canvasHeight = maxHeight;
          } else {
            // For non-square output, maintain aspect ratio
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            canvasWidth = width;
            canvasHeight = height;
          }

          // Create canvas
          const canvas = document.createElement("canvas");
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("Không thể tạo canvas context"));
            return;
          }

          // Draw image on canvas with cropping if needed
          // If cropping to square, draw from sourceX, sourceY with sourceWidth x sourceHeight
          // Otherwise, draw the full image resized
          ctx.drawImage(
            img,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            canvasWidth,
            canvasHeight
          );

          // Convert to blob with compression
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Không thể nén ảnh"));
                return;
              }

              // Create new File object with original name but compressed data
              const compressedFile = new File(
                [blob],
                file.name,
                {
                  type: "image/jpeg", // Always use JPEG for better compression
                  lastModified: Date.now(),
                }
              );

              resolve(compressedFile);
            },
            "image/jpeg", // Always convert to JPEG for better compression
            quality
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("Không thể load ảnh"));
      };

      // Load image from file data
      if (e.target?.result) {
        img.src = e.target.result as string;
      }
    };

    reader.onerror = () => {
      reject(new Error("Không thể đọc file"));
    };

    // Read file as data URL
    reader.readAsDataURL(file);
  });
}

export type PreparedOcrImage = {
  mimeType: string;
  base64: string;
  previewUrl: string;
};

const OCR_MAX_BASE64_CHARS = 3_000_000;
const OCR_DIMENSION_STEPS = [2048, 1536, 1024] as const;
const OCR_QUALITY_STEPS = [0.85, 0.7, 0.5] as const;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new Error(
            "Không thể đọc ảnh. Thử chụp lại hoặc chuyển sang JPEG/PNG nếu đang dùng HEIC."
          )
        );
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error("Không thể đọc file"));
      }
    };
    reader.onerror = () => reject(new Error("Không thể đọc file"));
    reader.readAsDataURL(file);
  });
}

function resizeToMaxDimension(
  img: HTMLImageElement,
  maxDimension: number
): { width: number; height: number } {
  let { width, height } = img;
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Không thể nén ảnh"));
        else resolve(blob);
      },
      "image/jpeg",
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Không thể đọc ảnh đã nén"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resize and compress an image for OCR upload (preserves aspect ratio, outputs JPEG).
 */
export async function prepareImageForOcr(file: File): Promise<PreparedOcrImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File không phải là ảnh.");
  }

  const img = await loadImageFromFile(file);

  for (const maxDimension of OCR_DIMENSION_STEPS) {
    const { width, height } = resizeToMaxDimension(img, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không thể tạo canvas context");
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of OCR_QUALITY_STEPS) {
      const blob = await canvasToJpegBlob(canvas, quality);
      const dataUrl = await blobToDataUrl(blob);
      const base64 = dataUrl.split(",")[1] ?? "";
      if (base64.length <= OCR_MAX_BASE64_CHARS) {
        return {
          mimeType: "image/jpeg",
          base64,
          previewUrl: dataUrl,
        };
      }
    }
  }

  throw new Error(
    "Ảnh quá lớn sau khi nén. Vui lòng chọn ảnh nhỏ hơn hoặc chụp lại gần hơn."
  );
}

