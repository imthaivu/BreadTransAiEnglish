import crypto from "crypto";

// Password hashing utility using Node.js crypto (scrypt)
// This is secure and doesn't require external dependencies

const SALT_LENGTH = 32; // 32 bytes = 256 bits
const KEY_LENGTH = 64; // 64 bytes = 512 bits
const SCRYPT_OPTIONS = {
  // Balanced cost for security and performance
  // cost: 16384 = ~64MB memory, ~50-100ms per hash
  // This is a good balance between security and system resources
  cost: 16384, // CPU/memory cost parameter (N)
  blockSize: 8, // Block size parameter (r)
  parallelization: 1, // Parallelization parameter (p)
};

/**
 * Hash a password using scrypt
 * Returns a string in format: salt:hash (both base64 encoded)
 */
export function hashPassword(password: string): string {
  // Generate random salt
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  // Hash password with salt using scrypt
  const hash = crypto.scryptSync(
    password,
    salt,
    KEY_LENGTH,
    SCRYPT_OPTIONS
  );
  
  // Return salt:hash as base64 strings
  return `${salt.toString("base64")}:${hash.toString("base64")}`;
}

/**
 * Verify a password against a hash
 * @param password - Plain text password to verify
 * @param hashedPassword - Hashed password in format salt:hash
 * @returns true if password matches, false otherwise
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  try {
    // Split salt and hash
    const [saltBase64, hashBase64] = hashedPassword.split(":");
    
    if (!saltBase64 || !hashBase64) {
      return false;
    }
    
    // Decode salt and hash from base64
    const salt = Buffer.from(saltBase64, "base64");
    const expectedHash = Buffer.from(hashBase64, "base64");
    
    // Hash the provided password with the same salt
    const actualHash = crypto.scryptSync(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_OPTIONS
    );
    
    // Compare hashes using timing-safe comparison
    return crypto.timingSafeEqual(expectedHash, actualHash);
  } catch (error) {
    console.error("Error verifying password:", error);
    return false;
  }
}

