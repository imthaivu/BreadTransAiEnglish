import type { IClass } from "@/modules/admin/type";
import {
  mergePendingFromClasses,
  countPendingByClassId,
  type PendingSpeakingItem,
} from "../utils/pending-speaking";

export type { PendingSpeakingItem };

export function getTeacherPendingSpeakingEvaluations(
  classes: IClass[] | undefined
): PendingSpeakingItem[] {
  if (!classes?.length) return [];
  return mergePendingFromClasses(classes);
}

export function getPendingCountByClass(
  classes: IClass[] | undefined,
  classId: string
): number {
  if (!classes?.length || !classId) return 0;
  return countPendingByClassId(classes, classId);
}
