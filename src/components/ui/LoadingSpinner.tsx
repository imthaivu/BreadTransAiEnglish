"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useState } from "react";

// Milu themed loading - chỉ giữ lại 1 animation loading với câu cố định
// Mobile-first: giảm animation phức tạp trên mobile, tối ưu performance
export function MiluLoading({ 
  fullScreen = true 
}: { 
  fullScreen?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Giảm animation trên mobile hoặc khi user prefer reduced motion
  const shouldReduceMotion = prefersReducedMotion || isMobile;
  const animationDuration = shouldReduceMotion ? 0.8 : 1.2;
  const imageSize = isMobile ? 80 : 120;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`flex flex-col items-center justify-center text-center ${
        fullScreen 
          ? "fixed inset-0 z-50 bg-white/95" 
          : "w-full h-full"
      }`}
      style={{ 
        willChange: "opacity",
        // Tối ưu touch trên mobile
        touchAction: "none",
        WebkitTapHighlightColor: "transparent"
      }}
    >
      {/* Milu Animation - giảm animation trên mobile */}
      <motion.div
        className={`${isMobile ? "text-4xl" : "text-6xl"} mb-3 sm:mb-4`}
        animate={shouldReduceMotion ? {} : {
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1],
        }}
        transition={shouldReduceMotion ? {} : {
          duration: animationDuration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ willChange: shouldReduceMotion ? "auto" : "transform" }}
      >
        <Image
          src="/assets/images/doraemon.png"
          alt="Milu"
          width={imageSize}
          height={imageSize}
          priority
          sizes="(max-width: 768px) 80px, 120px"
        />
      </motion.div>

      {/* Loading Text - câu cố định, responsive font size */}
      <motion.h3
        className="text-base sm:text-xl font-semibold text-primary mb-2 px-4 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.15 }}
        style={{ willChange: "opacity" }}
      >
        Milu đang chuẩn bị bảo bối... ✨
      </motion.h3>

      {/* Loading Dots - đơn giản hơn trên mobile */}
      <div className="flex justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 bg-primary rounded-full"
            animate={shouldReduceMotion ? {
              opacity: [0.5, 1, 0.5],
            } : {
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: shouldReduceMotion ? 0.8 : 0.5,
              repeat: Infinity,
              delay: i * (shouldReduceMotion ? 0.2 : 0.15),
              ease: "easeInOut",
            }}
            style={{ willChange: shouldReduceMotion ? "opacity" : "transform, opacity" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Export default để tương thích với các import cũ
export default MiluLoading;
