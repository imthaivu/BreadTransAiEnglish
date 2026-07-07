export * from "./user.service";
export * from "./student.service";
export * from "./class.service";
export * from "./teacher.service";
export * from "./content.service";
// flashcard.service is server-only (uses firebase-admin) and should only be imported directly in API routes
// Do not export it here to prevent client-side bundling issues