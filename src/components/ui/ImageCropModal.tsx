"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ImageCropModalProps {
  open: boolean;
  onClose: () => void;
  imageFile: File | null;
  onCrop: (croppedFile: File) => void;
  aspectRatio?: number; // 1 = square, default
  outputSize?: number; // Output size in pixels, default 400
}

export function ImageCropModal({
  open,
  onClose,
  imageFile,
  onCrop,
  outputSize = 400,
}: ImageCropModalProps) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [isPortrait, setIsPortrait] = useState(false); // true = dọc, false = ngang
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const cropSize = 300; // Kích thước cố định của vùng crop

  // Load image when file changes
  useEffect(() => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
        setImageLoaded(false);
      };
      reader.readAsDataURL(imageFile);
    }
  }, [imageFile]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open && imageSrc) {
      setPosition({ x: 0, y: 0 });
    }
  }, [open, imageSrc]);

  // Handle image load - tính toán scale và hướng ảnh
  const handleImageLoad = () => {
    if (!imageRef.current || !containerRef.current) return;
    
    setImageLoaded(true);
    const img = imageRef.current;

    // Xác định ảnh dọc hay ngang
    const isImgPortrait = img.naturalHeight > img.naturalWidth;
    setIsPortrait(isImgPortrait);
    
    let scale: number;
    let initialX = 0;
    let initialY = 0;
    
    if (isImgPortrait) {
      // Ảnh dọc: scale để chiều rộng ảnh = đúng cropSize (bắt sát mép crop)
      scale = cropSize / img.naturalWidth;
      initialY = 0; // Ở giữa theo chiều dọc
    } else {
      // Ảnh ngang: scale để chiều cao ảnh = đúng cropSize (bắt sát mép crop)
      scale = cropSize / img.naturalHeight;
      initialX = 0; // Ở giữa theo chiều ngang
    }
    
    setImageScale(scale);
    setPosition({ x: initialX, y: initialY });
  };

  // Handle mouse/touch events for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current || !imageRef.current) return;
    
    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();

    // Tính kích thước ảnh sau khi scale
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // Tính giới hạn di chuyển
    const maxX = (imgDisplayWidth - cropSize) / 2;
    const maxY = (imgDisplayHeight - cropSize) / 2;
    const minX = -(imgDisplayWidth - cropSize) / 2;
    const minY = -(imgDisplayHeight - cropSize) / 2;
    
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    
    // Nếu ảnh dọc: chỉ cho phép di chuyển Y (lên xuống)
    // Nếu ảnh ngang: chỉ cho phép di chuyển X (trái phải)
    setPosition({
      x: isPortrait ? 0 : Math.max(minX, Math.min(maxX, newX)),
      y: isPortrait ? Math.max(minY, Math.min(maxY, newY)) : 0,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // Touch events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    isDragging.current = true;
    dragStart.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !containerRef.current || !imageRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    
    const img = imageRef.current;
    const imgRect = img.getBoundingClientRect();

    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    const maxX = (imgDisplayWidth - cropSize) / 2;
    const maxY = (imgDisplayHeight - cropSize) / 2;
    const minX = -(imgDisplayWidth - cropSize) / 2;
    const minY = -(imgDisplayHeight - cropSize) / 2;
    
    const newX = touch.clientX - dragStart.current.x;
    const newY = touch.clientY - dragStart.current.y;
    
    setPosition({
      x: isPortrait ? 0 : Math.max(minX, Math.min(maxX, newX)),
      y: isPortrait ? Math.max(minY, Math.min(maxY, newY)) : 0,
    });
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  // Perform crop
  const handleCrop = () => {
    if (!imageRef.current || !imageSrc || !containerRef.current) return;

    const img = imageRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Get container and image dimensions
    const containerRect = containerRef.current.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    
    // Crop area luôn ở center của container
    const cropCenterX = containerRect.width / 2;
    const cropCenterY = containerRect.height / 2;
    
    // Ảnh được đặt ở center container, sau đó translate bởi position.x, position.y
    // Vị trí center của ảnh trong container coordinates
    const imgCenterX = containerRect.width / 2 + position.x;
    const imgCenterY = containerRect.height / 2 + position.y;
    
    // Kích thước ảnh sau khi scale (trong display coordinates)
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // Vị trí top-left của ảnh trong container coordinates
    const imgLeft = imgCenterX - imgDisplayWidth / 2;
    const imgTop = imgCenterY - imgDisplayHeight / 2;
    
    // Vị trí crop area trong container coordinates (relative to image top-left)
    const cropLeftInContainer = cropCenterX - cropSize / 2;
    const cropTopInContainer = cropCenterY - cropSize / 2;
    
    // Vị trí crop area relative to image (trong display coordinates)
    const cropLeftRelativeToImage = cropLeftInContainer - imgLeft;
    const cropTopRelativeToImage = cropTopInContainer - imgTop;
    
    // Convert to natural image coordinates
    const scaleX = img.naturalWidth / imgDisplayWidth;
    const scaleY = img.naturalHeight / imgDisplayHeight;
    
    // Calculate crop area in natural image coordinates
    let cropX = cropLeftRelativeToImage * scaleX;
    let cropY = cropTopRelativeToImage * scaleY;
    let cropWidth = cropSize * scaleX;
    let cropHeight = cropSize * scaleY;
    
    // Đảm bảo không crop vượt quá kích thước ảnh
    cropX = Math.max(0, Math.min(cropX, img.naturalWidth - cropWidth));
    cropY = Math.max(0, Math.min(cropY, img.naturalHeight - cropHeight));
    
    // Đảm bảo cropWidth và cropHeight không vượt quá kích thước ảnh
    if (cropX + cropWidth > img.naturalWidth) {
      cropWidth = img.naturalWidth - cropX;
    }
    if (cropY + cropHeight > img.naturalHeight) {
      cropHeight = img.naturalHeight - cropY;
    }

    // Fill canvas với màu trắng trước (tránh viền đen)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, outputSize, outputSize);

    // Direct crop
    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      outputSize,
      outputSize
    );

    // Convert to blob and create file
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const croppedFile = new File([blob], imageFile?.name || "cropped.jpg", {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          onCrop(croppedFile);
          onClose();
        }
      },
      "image/jpeg",
      0.92
    );
  };

  if (!imageSrc) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cắt ảnh"
      maxWidth="lg"
      closeOnOverlayClick={false}
    >
      <div className="p-4 space-y-4 max-h-[85vh] flex flex-col">
        {/* Crop Container */}
        <div
          ref={containerRef}
          className="relative w-full h-[300px] sm:h-[350px] bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-300 flex-shrink-0"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Image */}
          {imageSrc && (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop preview"
              className="absolute"
              style={{
                left: "50%",
                top: "50%",
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${imageScale})`,
                transformOrigin: "center center",
                transition: isDragging.current ? "none" : "transform 0.1s",
                maxWidth: "none",
                maxHeight: "none",
                width: imageLoaded && imageRef.current ? `${imageRef.current.naturalWidth}px` : "auto",
                height: imageLoaded && imageRef.current ? `${imageRef.current.naturalHeight}px` : "auto",
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
          )}

          {/* Crop Overlay */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Dark overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle, transparent ${cropSize / 2}px, rgba(0, 0, 0, 0.4) ${cropSize / 2}px)`,
              }}
            />
            
            {/* Crop Border - đơn giản hơn */}
            <div
              className="absolute border border-white"
              style={{
                width: `${cropSize}px`,
                height: `${cropSize}px`,
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
              }}
            />
          </div>

          {/* Drag area */}
          <div
            className="absolute inset-0 cursor-move"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            style={{
              clipPath: `circle(${cropSize / 2}px at 50% 50%)`,
            }}
          />
        </div>

        {/* Instructions */}
        <p className="text-xs sm:text-sm text-gray-600 text-center flex-shrink-0">
          {isPortrait 
            ? "Kéo ảnh lên xuống để chọn vùng cắt" 
            : "Kéo ảnh trái phải để chọn vùng cắt"}
        </p>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleCrop}>
            Xác nhận
          </Button>
        </div>
      </div>
    </Modal>
  );
}
