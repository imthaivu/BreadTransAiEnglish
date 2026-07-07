"use client";

import { off, onValue } from "firebase/database";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { presenceRootRef } from "./paths";
import type { RtdbPresence } from "./types";

export type PresenceMap = Record<string, RtdbPresence>;

const GlobalPresenceContext = createContext<PresenceMap>({});

/**
 * Một listener duy nhất trên `/presence` cung cấp map presence cho cả app.
 * Tạm dừng khi tab ẩn để tiết kiệm tài nguyên; tự subscribe lại khi quay lại.
 */
export function GlobalPresenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [map, setMap] = useState<PresenceMap>({});
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const start = () => {
      if (unsubRef.current) return;
      const r = presenceRootRef();
      const cb = onValue(
        r,
        (snap) => {
          setMap((snap.val() as PresenceMap | null) ?? {});
        },
        () => setMap({})
      );
      unsubRef.current = () => off(r, "value", cb);
    };

    const stop = () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) start();
      else stop();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (typeof document === "undefined" || !document.hidden) start();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, []);

  return (
    <GlobalPresenceContext.Provider value={map}>
      {children}
    </GlobalPresenceContext.Provider>
  );
}

export function useGlobalPresenceMap(): PresenceMap {
  return useContext(GlobalPresenceContext);
}
