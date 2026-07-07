import type { GrammarExercise, GrammarTopic } from "@/constants/grammar";
import type { WatchTrackingViewItem } from "@/modules/classes/services";
import { getMovieVariant } from "@/modules/admin/services/content.service";

export function sortMovieExercises(topic: GrammarTopic): GrammarExercise[] {
  return [...topic.exercises].sort(
    (a, b) =>
      a.exerciseNo - b.exerciseNo || (a.subNo ?? 0) - (b.subNo ?? 0)
  );
}

function findWatchView(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic,
  exercise: GrammarExercise
): WatchTrackingViewItem | undefined {
  const byMeta = views.find(
    (v) =>
      v.mediaType === "movie" &&
      v.topicId === topic.id &&
      v.exerciseNo === exercise.exerciseNo &&
      (v.subNo ?? 0) === (exercise.subNo ?? 0)
  );
  if (byMeta) return byMeta;

  if (!exercise.video) return undefined;
  return views.find(
    (v) => v.mediaType === "movie" && v.videoUrl === exercise.video
  );
}

/** Hoàn thành khi watch_tracking ghi ≥ 70% thời lượng (cùng rule parseWatchTrackingItem). */
export function isEpisodeCompleted(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic,
  exercise: GrammarExercise
): boolean {
  return findWatchView(views, topic, exercise)?.isCompleted === true;
}

export function isTopicFullyCompleted(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic
): boolean {
  const variant = getMovieVariant(topic);
  if (variant === "single") {
    const exercise = topic.exercises[0];
    if (!exercise) return false;
    return isEpisodeCompleted(views, topic, exercise);
  }
  const exercises = sortMovieExercises(topic);
  if (exercises.length === 0) return false;
  return exercises.every((ex) => isEpisodeCompleted(views, topic, ex));
}

/** Phim tại `topicIndex` mở khi đã xem hết mọi phim đứng trước (theo thứ tự admin). */
export function isTopicUnlocked(
  views: readonly WatchTrackingViewItem[],
  orderedTopics: readonly GrammarTopic[],
  topicIndex: number
): boolean {
  if (topicIndex <= 0) return true;
  for (let i = 0; i < topicIndex; i++) {
    if (!isTopicFullyCompleted(views, orderedTopics[i])) return false;
  }
  return true;
}

/** Phim chưa hoàn thành đầu tiên đứng trước `topicIndex` (dùng cho gợi ý mở khóa). */
export function getBlockingTopicTitle(
  views: readonly WatchTrackingViewItem[],
  orderedTopics: readonly GrammarTopic[],
  topicIndex: number
): string | null {
  if (topicIndex <= 0) return null;
  for (let i = 0; i < topicIndex; i++) {
    if (!isTopicFullyCompleted(views, orderedTopics[i])) {
      return orderedTopics[i].title;
    }
  }
  return null;
}

export function findExerciseListIndex(
  topic: GrammarTopic,
  exercise: Pick<GrammarExercise, "exerciseNo" | "subNo">
): number {
  return topic.exercises.findIndex(
    (ex) =>
      ex.exerciseNo === exercise.exerciseNo &&
      (ex.subNo ?? 0) === (exercise.subNo ?? 0)
  );
}

/** Tập tại `episodeListIndex` mở khi đã xem hết các tập trước (theo watch_tracking). */
export function isEpisodeUnlocked(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic,
  episodeListIndex: number
): boolean {
  if (episodeListIndex <= 0) return true;
  if (isTopicFullyCompleted(views, topic)) return true;

  const exercise = topic.exercises[episodeListIndex];
  if (!exercise) return false;

  const sorted = sortMovieExercises(topic);
  const sortedPos = sorted.findIndex(
    (ex) =>
      ex.exerciseNo === exercise.exerciseNo &&
      (ex.subNo ?? 0) === (exercise.subNo ?? 0)
  );
  if (sortedPos <= 0) return true;

  for (let i = 0; i < sortedPos; i++) {
    if (!isEpisodeCompleted(views, topic, sorted[i])) return false;
  }
  return true;
}

export function getDefaultEpisodeListIndex(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic
): number {
  const exercises = sortMovieExercises(topic);
  if (exercises.length === 0) return 0;
  if (isTopicFullyCompleted(views, topic)) return 0;

  for (const exercise of exercises) {
    if (!isEpisodeCompleted(views, topic, exercise)) {
      const idx = findExerciseListIndex(topic, exercise);
      return idx >= 0 ? idx : 0;
    }
  }
  return 0;
}

export function resolveEpisodeListIndex(
  views: readonly WatchTrackingViewItem[],
  topic: GrammarTopic,
  preferred?: Pick<GrammarExercise, "exerciseNo" | "subNo"> | null
): number {
  if (preferred) {
    const idx = findExerciseListIndex(topic, preferred);
    if (idx >= 0 && isEpisodeUnlocked(views, topic, idx)) return idx;
  }
  return getDefaultEpisodeListIndex(views, topic);
}
