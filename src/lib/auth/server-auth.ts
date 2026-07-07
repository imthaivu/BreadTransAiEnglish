import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export interface ServerSession {
  user: {
    id: string;
    phone?: string | null;
    role: string;
    name?: string | null;
    image?: string | null;
  };
}

/**
 * Verify Bearer ID token from the request (no Firestore read).
 */
export async function verifyRequestIdToken(
  request: NextRequest
): Promise<DecodedIdToken | null> {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }
    return await adminAuth().verifyIdToken(authHeader.substring(7));
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    return null;
  }
}

/**
 * Get server session from Firebase ID token in Authorization header
 * Replaces NextAuth's getServerSession
 */
export async function getServerSession(
  request: NextRequest
): Promise<ServerSession | null> {
  try {
    const authHeader = request.headers.get("authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const idToken = authHeader.substring(7);
    
    // Verify Firebase ID token
    const decodedToken = await adminAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Get user data from Firestore
    const userDoc = await adminDb().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();

    return {
      user: {
        id: uid,
        phone: userData?.phone || null,
        role: userData?.role || "student",
        name: userData?.displayName || null,
        image: userData?.avatarUrl || null,
      },
    };
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    return null;
  }
}

function sessionRoleFromClaims(decoded: DecodedIdToken): string {
  if (decoded.admin === true) return "admin";
  if (decoded.teacher === true) return "teacher";
  return "student";
}

/**
 * Check if user has admin access (custom claim `admin` on ID token).
 */
export async function checkAdminAccess(
  request: NextRequest
): Promise<{ authorized: boolean; error?: string; session?: ServerSession }> {
  const decoded = await verifyRequestIdToken(request);

  if (!decoded) {
    return { authorized: false, error: "Unauthorized" };
  }

  if (decoded.admin !== true) {
    return { authorized: false, error: "Forbidden: Admin access required" };
  }

  return {
    authorized: true,
    session: {
      user: {
        id: decoded.uid,
        phone: null,
        role: "admin",
        name: null,
        image: null,
      },
    },
  };
}

/**
 * Check if user has teacher or admin access (custom claims on ID token).
 */
export async function checkTeacherOrAdminAccess(
  request: NextRequest
): Promise<{ authorized: boolean; error?: string; session?: ServerSession }> {
  const decoded = await verifyRequestIdToken(request);

  if (!decoded) {
    return { authorized: false, error: "Unauthorized" };
  }

  if (decoded.teacher !== true && decoded.admin !== true) {
    return { authorized: false, error: "Forbidden: Teacher or admin access required" };
  }

  const role = sessionRoleFromClaims(decoded);

  return {
    authorized: true,
    session: {
      user: {
        id: decoded.uid,
        phone: null,
        role,
        name: null,
        image: null,
      },
    },
  };
}

