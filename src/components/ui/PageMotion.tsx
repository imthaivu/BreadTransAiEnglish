"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ReactNode, useState, useEffect } from "react";
import { MiluLoading } from "./LoadingSpinner";
import { cn } from "@/utils";

interface PageMotionProps {
  children: ReactNode;
  delay?: number;
  showLoading?: boolean;
}

const pageVariants = {
  initial: { opacity: 0, y: 15 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -15 },
};

const pageTransition = {
  type: "tween" as const,
  ease: "easeOut" as const,
  duration: 0.25, // Giảm duration để mượt hơn
};

export default function PageMotion({
  children,
  delay = 0,
  showLoading = false,
}: PageMotionProps) {
  const [isLoading, setIsLoading] = useState(showLoading);
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile - mobile-first approach
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    const handleResize = () => checkMobile();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (showLoading) {
      // Giảm loading time trên mobile
      const loadingTime = isMobile ? 500 : 1000;
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, loadingTime + delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [showLoading, delay, isMobile]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center">
        <MiluLoading fullScreen={false} />
      </div>
    );
  }

  const shouldReduceMotion = prefersReducedMotion || isMobile;
  const motionVariants = shouldReduceMotion 
    ? { initial: { opacity: 0 }, in: { opacity: 1 }, out: { opacity: 0 } }
    : pageVariants;
  const motionTransition = shouldReduceMotion
    ? { duration: 0.15, delay }
    : { ...pageTransition, delay };

  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={motionVariants}
      transition={motionTransition}
      className="w-full"
      style={{ 
        willChange: shouldReduceMotion ? "opacity" : "opacity, transform",
        // Tối ưu touch trên mobile
        touchAction: "pan-y"
      }}
    >
      {children}
    </motion.div>
  );
}

// Component cho fade in đơn giản - mobile-first
export function FadeIn({
  children,
  delay = 0,
  showLoading = false,
}: PageMotionProps) {
  const [isLoading, setIsLoading] = useState(showLoading);
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    const handleResize = () => checkMobile();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (showLoading) {
      const loadingTime = isMobile ? 400 : 800;
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, loadingTime + delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [showLoading, delay, isMobile]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center">
        <MiluLoading fullScreen={false} />
      </div>
    );
  }

  const shouldReduceMotion = prefersReducedMotion || isMobile;
  const duration = shouldReduceMotion ? 0.15 : 0.25;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay, ease: "easeOut" }}
      className="w-full"
      style={{ 
        willChange: "opacity",
        touchAction: "pan-y"
      }}
    >
      {children}
    </motion.div>
  );
}

// Component cho slide up - mobile-first với reduced motion
export function SlideUp({
  children,
  delay = 0,
  showLoading = false,
}: PageMotionProps) {
  const [isLoading, setIsLoading] = useState(showLoading);
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    const handleResize = () => checkMobile();
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (showLoading) {
      const loadingTime = isMobile ? 450 : 900;
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, loadingTime + delay * 1000);
      return () => clearTimeout(timer);
    }
  }, [showLoading, delay, isMobile]);

  if (isLoading) {
    return (
      <div className="w-full min-h-[400px] flex items-center justify-center">
        <MiluLoading fullScreen={false} />
      </div>
    );
  }

  const shouldReduceMotion = prefersReducedMotion || isMobile;
  const initialY = shouldReduceMotion ? 0 : (isMobile ? 15 : 30);
  const duration = shouldReduceMotion ? 0.15 : (isMobile ? 0.25 : 0.4);

  return (
    <motion.div
      initial={{ opacity: 0, y: initialY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
      className="w-full"
      style={{ 
        willChange: shouldReduceMotion ? "opacity" : "opacity, transform",
        touchAction: "pan-y"
      }}
    >
      {children}
    </motion.div>
  );
}

// Component cho stagger animation
export function StaggerContainer({ children, delay = 0 }: PageMotionProps) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      variants={{
        initial: { opacity: 0 },
        in: {
          opacity: 1,
          transition: {
            staggerChildren: 0.08, // Giảm stagger để nhanh hơn
            delayChildren: delay,
          },
        },
      }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

// Component cho stagger items
export function StaggerItem({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={cn("w-full", className)}
      variants={{
        initial: { opacity: 0, y: 20 },
        in: { opacity: 1, y: 0 },
      }}
      initial="initial"
      animate="in"
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{ willChange: "opacity, transform" }}
    >
      {children}
    </motion.div>
  );
}
