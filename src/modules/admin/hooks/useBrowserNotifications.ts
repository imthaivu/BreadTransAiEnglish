"use client";

import { useEffect, useState, useCallback } from "react";

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export function useBrowserNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSupported, setIsSupported] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isMounted || typeof window === "undefined") {
      return false;
    }

    if (!isSupported || !("Notification" in window)) {
      console.warn("Browser notifications are not supported");
      return false;
    }

    if (permission === "granted") {
      return true;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return false;
    }
  }, [isSupported, permission, isMounted]);

  const showNotification = useCallback(
    async (options: NotificationOptions): Promise<void> => {
      if (!isMounted || typeof window === "undefined") {
        return;
      }

      if (!isSupported || !("Notification" in window)) {
        console.warn("Browser notifications are not supported");
        return;
      }

      // Request permission if not granted
      if (permission !== "granted") {
        const granted = await requestPermission();
        if (!granted) {
          console.warn("Notification permission not granted");
          return;
        }
      }

      try {
        const notificationOptions: NotificationOptions = {
          icon: options.icon || "/favicon.ico",
          badge: options.badge || "/favicon.ico",
          tag: options.tag || "default",
          requireInteraction: options.requireInteraction || false,
          ...options,
        };

        const notification = new Notification(options.title, notificationOptions);

        // Auto-close after 5 seconds if not requireInteraction
        if (!notificationOptions.requireInteraction) {
          setTimeout(() => {
            notification.close();
          }, 5000);
        }

        // Handle click
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (error) {
        console.error("Error showing notification:", error);
      }
    },
    [isSupported, permission, requestPermission, isMounted]
  );

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
  };
}

