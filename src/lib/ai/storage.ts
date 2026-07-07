import { randomUUID } from "crypto";
import { adminStorage } from "@/lib/firebase/admin";

export async function uploadMp3ToStorage(
  storagePath: string,
  mp3Buffer: Buffer
): Promise<{ downloadUrl: string; audioPath: string }> {
  const bucket = adminStorage().bucket();
  const file = bucket.file(storagePath);
  const token = randomUUID();

  await file.save(mp3Buffer, {
    contentType: "audio/mpeg",
    resumable: false,
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? bucket.name;
  const encodedPath = encodeURIComponent(storagePath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;

  return { downloadUrl, audioPath: storagePath };
}

export async function deleteStorageObject(storagePath: string): Promise<void> {
  try {
    const bucket = adminStorage().bucket();
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.warn("[ai-storage] delete failed:", storagePath, error);
  }
}
