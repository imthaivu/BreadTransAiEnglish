import "firebase-admin/auth";

/** Custom ID token claims set via syncRoleCustomClaims / Admin SDK */
declare module "firebase-admin/auth" {
  interface DecodedIdToken {
    admin?: boolean;
    teacher?: boolean;
  }
}
