"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

let queryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute default
          gcTime: 5 * 60 * 1000, // 5 minutes garbage collection (formerly cacheTime)
          refetchOnWindowFocus: false, // Don't refetch on window focus by default
          retry: 1, // Only retry once on failure
        },
      },
    });
  }
  // Browser: use singleton pattern to keep the same query client
  // This ensures data is shared across all components and pages
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000, // 1 minute default
          gcTime: 5 * 60 * 1000, // 5 minutes garbage collection
          refetchOnWindowFocus: false, // Don't refetch on window focus by default
          retry: 1, // Only retry once on failure
        },
      },
    });
  }
  return queryClient;
}

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use useState to ensure the same query client instance is used
  // This is important for data sharing across the app
  const [client] = useState(() => getQueryClient());
  
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
