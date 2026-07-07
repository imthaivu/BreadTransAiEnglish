"use client";

import { cn } from "@/utils";
import { AnimatePresence, motion } from "framer-motion";
import { FiX } from "react-icons/fi";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  hideCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
  showHeader?: boolean;
  overlayClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  right,
  children,
  maxWidth = "5xl",
  hideCloseButton = false,
  closeOnOverlayClick = true,
  className = "",
  showHeader = true,
  overlayClassName = "",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const maxWidthClass = useMemo(() => {
    switch (maxWidth) {
      case "sm":
        return "max-w-sm";
      case "md":
        return "max-w-xl";
      case "lg":
        return "max-w-2xl";
      case "xl":
        return "max-w-3xl";
      default:
        return "max-w-3xl";
    }
  }, [maxWidth]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30",
            overlayClassName || ""
          )}
          style={{ zIndex: overlayClassName?.includes("z-") ? undefined : 10000 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            if (closeOnOverlayClick) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "relative z-10 w-full max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col",
              maxWidthClass,
              className || ""
            )}
          style={{ zIndex: className?.includes("z-") ? undefined : 10001 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            {showHeader && (
              <div className="sticky top-0 z-10 border-b border-border bg-white px-4 py-3 sm:px-5 sm:py-3.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    {title && (
                      <div className="truncate text-lg md:text-xl font-semibold text-slate-900">
                        {title}
                      </div>
                    )}
                    {subtitle && (
                      <div className="truncate text-xs text-slate-500 sm:text-sm">
                        {subtitle}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {right}
                    {!hideCloseButton && (
                      <Button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md p-2 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onClick={onClose}
                        aria-label="Close modal"
                        variant="outline"
                      >
                        <FiX size={24} className="text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
