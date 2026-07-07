"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchVietQrBanks } from "./client";

const STALE_MS = 24 * 60 * 60 * 1000;

export function useVietQrBanks(enabled = true) {
  return useQuery({
    queryKey: ["vietqr", "banks"],
    queryFn: fetchVietQrBanks,
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    enabled,
  });
}
