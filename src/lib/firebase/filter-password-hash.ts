/**
 * Utility to filter out passwordHash from Firestore document data
 * This ensures passwordHash is never exposed to client-side code
 */

export function filterPasswordHash<T extends Record<string, unknown>>(
  data: T | undefined | null
): Omit<T, "passwordHash"> | null {
  if (!data) return null;
  
  const { passwordHash, ...filteredData } = data;
  
  // Log warning if passwordHash was present (should never happen in production)
  if (passwordHash && process.env.NODE_ENV === "development") {
    console.warn(
      "⚠️ SECURITY WARNING: passwordHash was found in Firestore document data. " +
      "This should never happen. Please check Firestore rules and client-side queries."
    );
  }
  
  return filteredData as Omit<T, "passwordHash">;
}

/**
 * Filter passwordHash from an array of documents
 */
export function filterPasswordHashFromArray<T extends Record<string, unknown>>(
  dataArray: T[]
): Array<Omit<T, "passwordHash">> {
  return dataArray.map((item) => filterPasswordHash(item)!).filter(Boolean);
}

