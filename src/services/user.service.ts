import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";

export interface UpdateUserPhoneData {
  userId: string;
  phone: string;
}

/**
 * Update user's phone number
 */
export const updateUserPhone = async ({
  userId,
  phone,
}: UpdateUserPhoneData): Promise<void> => {
  try {
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, {
      phone: phone.trim(),
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error("Error updating user phone:", error);
    throw new Error("Không thể cập nhật số điện thoại");
  }
};
