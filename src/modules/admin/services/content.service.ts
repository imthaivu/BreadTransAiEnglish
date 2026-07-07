import { FirebaseError } from "firebase/app";
import { db, getFirebaseAuth, storage } from "@/lib/firebase/client";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadString,
} from "firebase/storage";
import {
  extractStoragePathFromURL,
  isFirebaseStorageUrl,
} from "@/utils/firebase-storage";
import { compressAndResizeImage } from "@/utils/image";
import { getYouTubeThumbnailUrl } from "@/utils/youtube";
export interface ContentExercise {
  exerciseNo: number;
  subNo?: number;
  title: string;
  video: string;
  /** Link phim nguồn (studyphim.vn) để cào lại phụ đề. */
  sourceLink?: string;
}

export type MovieVariant = "single" | "series";

export type MovieDifficulty = "easy" | "medium" | "hard";

export const MOVIE_DIFFICULTIES: { id: MovieDifficulty; label: string }[] = [
  { id: "easy", label: "Dễ" },
  { id: "medium", label: "Vừa" },
  { id: "hard", label: "Khó" },
];

export interface ContentTopic {
  id: string;
  title: string;
  order?: number;
  variant?: MovieVariant;
  difficulty?: MovieDifficulty;
  thumbnail?: string;
  video?: string;
  /** Link phim nguồn (studyphim.vn) cho phim lẻ / cào lại phụ đề. */
  sourceLink?: string;
  exercises: ContentExercise[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type ContentKind = "grammars" | "movies" | "music";

export const CONTENT_KINDS: ContentKind[] = ["grammars", "movies", "music"];

export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
  grammars: "Ngữ pháp",
  movies: "Phim",
  music: "Nhạc",
};

export const MUSIC_LIBRARY_DOC_ID = "library";
export const MOVIES_LIBRARY_DOC_ID = "library";

export interface MusicSong {
  title: string;
  video: string;
  thumbnail?: string;
}

export interface MusicLibrary {
  id: string;
  songs: MusicSong[];
  updatedAt?: Date;
}

type MovieVariantSource = Pick<
  ContentTopic,
  "variant" | "video" | "exercises"
>;

/** Resolve movie variant with backward compat for legacy docs. */
export function getMovieVariant(topic: MovieVariantSource): MovieVariant {
  if (topic.variant === "single" || topic.variant === "series") {
    return topic.variant;
  }
  if (topic.video?.trim() && topic.exercises.length === 0) return "single";
  return "series";
}

const movieLibraryRef = () => doc(db, "movies", MOVIES_LIBRARY_DOC_ID);

const parseExercises = (raw: unknown): ContentExercise[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((ex) => {
    const row = ex as ContentExercise;
    const parsed: ContentExercise = {
      exerciseNo: Number(row.exerciseNo) || 0,
      title: String(row.title ?? ""),
      video: String(row.video ?? ""),
    };
    if (row.subNo !== undefined && row.subNo !== null) {
      const subNo = Number(row.subNo);
      if (Number.isFinite(subNo)) parsed.subNo = subNo;
    }
    if (row.sourceLink) parsed.sourceLink = String(row.sourceLink);
    return parsed;
  });
};

const exerciseToStored = (ex: ContentExercise): Record<string, unknown> => {
  const stored: Record<string, unknown> = {
    exerciseNo: ex.exerciseNo,
    title: ex.title,
    video: ex.video,
  };
  if (ex.subNo !== undefined && ex.subNo !== null && Number.isFinite(ex.subNo)) {
    stored.subNo = ex.subNo;
  }
  if (ex.sourceLink?.trim()) stored.sourceLink = ex.sourceLink.trim();
  return stored;
};

const sortTopics = (topics: ContentTopic[]): ContentTopic[] =>
  [...topics].sort(
    (a, b) =>
      (a.order ?? 999_999) - (b.order ?? 999_999) ||
      a.title.localeCompare(b.title, "vi")
  );

const parseMovieTopics = (raw: unknown): ContentTopic[] => {
  if (!Array.isArray(raw)) return [];
  const topics: ContentTopic[] = [];
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const createdAt = row.createdAt as { toDate?: () => Date } | undefined;
    const updatedAt = row.updatedAt as { toDate?: () => Date } | undefined;
    topics.push({
      id,
      title: String(row.title ?? ""),
      order: typeof row.order === "number" ? row.order : undefined,
      variant: row.variant as MovieVariant | undefined,
      difficulty: row.difficulty as MovieDifficulty | undefined,
      thumbnail: row.thumbnail ? String(row.thumbnail) : undefined,
      video: row.video ? String(row.video) : undefined,
      sourceLink: row.sourceLink ? String(row.sourceLink) : undefined,
      exercises: parseExercises(row.exercises),
      createdAt: createdAt?.toDate?.(),
      updatedAt: updatedAt?.toDate?.(),
    });
  }
  return sortTopics(topics);
};

const topicToStored = (topic: ContentTopic): Record<string, unknown> => {
  const now = new Date();
  const stored: Record<string, unknown> = {
    id: topic.id,
    title: topic.title,
    order: typeof topic.order === "number" ? topic.order : null,
    exercises: (topic.exercises ?? []).map(exerciseToStored),
    // serverTimestamp() không được dùng trong phần tử mảng Firestore
    updatedAt: now,
    createdAt: topic.createdAt ?? now,
  };
  if (topic.variant) stored.variant = topic.variant;
  if (topic.difficulty) stored.difficulty = topic.difficulty;
  if (topic.thumbnail?.trim()) stored.thumbnail = topic.thumbnail.trim();
  if (topic.video?.trim()) stored.video = topic.video.trim();
  if (topic.sourceLink?.trim()) stored.sourceLink = topic.sourceLink.trim();
  return stored;
};

/** Đọc toàn bộ phim từ doc duy nhất `movies/library` (1 read). */
const getMovieLibraryTopics = async (): Promise<ContentTopic[]> => {
  const snap = await getDoc(movieLibraryRef());
  if (!snap.exists()) return [];
  return parseMovieTopics(snap.data().topics);
};

const withMovieLibrary = async <T>(
  mutator: (topics: ContentTopic[]) => {
    topics: ContentTopic[];
    result: T;
  }
): Promise<T> => {
  return runTransaction(db, async (tx) => {
    const libRef = movieLibraryRef();
    const snap = await tx.get(libRef);
    const topics = parseMovieTopics(snap.exists() ? snap.data()?.topics : []);
    const { topics: nextTopics, result } = mutator(topics);
    tx.set(
      libRef,
      {
        topics: nextTopics.map(topicToStored),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return result;
  });
};

const deleteLegacyMovieDocs = async (): Promise<void> => {
  const snap = await getDocs(collection(db, "movies"));
  const legacyDocs = snap.docs.filter((d) => d.id !== MOVIES_LIBRARY_DOC_ID);
  if (legacyDocs.length === 0) return;

  const CHUNK = 400;
  for (let i = 0; i < legacyDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const docSnap of legacyDocs.slice(i, i + CHUNK)) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
  }
};

const applyMovieTopicUpdate = (
  current: ContentTopic,
  data: UpdateContentTopicData
): ContentTopic => {
  const next: ContentTopic = { ...current };
  if (typeof data.title === "string") next.title = data.title.trim();
  if (data.order !== undefined) {
    next.order = data.order === null ? undefined : data.order;
  }
  if (data.variant !== undefined) next.variant = data.variant;
  if (data.difficulty !== undefined) next.difficulty = data.difficulty;
  if (data.thumbnail !== undefined) {
    next.thumbnail = data.thumbnail?.trim() || undefined;
  }
  if (data.video !== undefined) {
    next.video = data.video?.trim() || undefined;
  }
  if (data.sourceLink !== undefined) {
    next.sourceLink = data.sourceLink?.trim() || undefined;
  }
  if (Array.isArray(data.exercises)) next.exercises = data.exercises;
  return next;
};

/** Lấy toàn bộ topics cho 1 loại nội dung. Sắp xếp theo `order` rồi đến `title`. */
export const getContentTopics = async (
  kind: ContentKind
): Promise<ContentTopic[]> => {
  // Nhạc dùng 1 doc duy nhất music/library — xem getMusicLibrary()
  if (kind === "music") return [];
  if (kind === "movies") return getMovieLibraryTopics();

  const ref = collection(db, kind);
  try {
    const snap = await getDocs(query(ref, orderBy("order", "asc")));
    return snap.docs.map(mapTopic);
  } catch {
    const snap = await getDocs(ref);
    return snap.docs
      .map(mapTopic)
      .sort(
        (a, b) =>
          (a.order ?? 999_999) - (b.order ?? 999_999) ||
          a.title.localeCompare(b.title, "vi")
      );
  }
};

const parseMusicSongs = (raw: unknown): MusicSong[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const title = String((s as MusicSong).title ?? "").trim();
      const video = String((s as MusicSong).video ?? "").trim();
      const thumbnail = (s as MusicSong).thumbnail
        ? String((s as MusicSong).thumbnail).trim()
        : "";
      if (!title && !video) return null;
      return {
        title: title || video,
        video,
        ...(thumbnail ? { thumbnail } : {}),
      };
    })
    .filter((s): s is MusicSong => s !== null);
};

const deleteLegacyMusicDocs = async (): Promise<void> => {
  const snap = await getDocs(collection(db, "music"));
  const legacyDocs = snap.docs.filter((d) => d.id !== MUSIC_LIBRARY_DOC_ID);
  if (legacyDocs.length === 0) return;

  const CHUNK = 400;
  for (let i = 0; i < legacyDocs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const docSnap of legacyDocs.slice(i, i + CHUNK)) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
  }
};

const mapTopic = (snap: {
  id: string;
  data: () => Record<string, unknown>;
}): ContentTopic => {
  const data = snap.data() as {
    title?: string;
    order?: number;
    variant?: MovieVariant;
    difficulty?: MovieDifficulty;
    thumbnail?: string;
    video?: string;
    sourceLink?: string;
    exercises?: ContentExercise[];
    createdAt?: { toDate: () => Date };
    updatedAt?: { toDate: () => Date };
  };
  return {
    id: snap.id,
    title: data.title ?? "",
    order: typeof data.order === "number" ? data.order : undefined,
    variant: data.variant,
    difficulty: data.difficulty,
    thumbnail: data.thumbnail ? String(data.thumbnail) : undefined,
    video: data.video ? String(data.video) : undefined,
    sourceLink: data.sourceLink ? String(data.sourceLink) : undefined,
    exercises: Array.isArray(data.exercises)
      ? data.exercises.map((ex) => ({
          exerciseNo: Number(ex.exerciseNo) || 0,
          subNo:
            ex.subNo === undefined || ex.subNo === null
              ? undefined
              : Number(ex.subNo),
          title: String(ex.title ?? ""),
          video: String(ex.video ?? ""),
          ...(ex.sourceLink ? { sourceLink: String(ex.sourceLink) } : {}),
        }))
      : [],
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  };
};

/** Đọc toàn bộ bài hát từ doc duy nhất `music/library`. */
export const getMusicLibrary = async (): Promise<MusicLibrary> => {
  const libraryRef = doc(db, "music", MUSIC_LIBRARY_DOC_ID);
  const librarySnap = await getDoc(libraryRef);

  if (!librarySnap.exists()) {
    return { id: MUSIC_LIBRARY_DOC_ID, songs: [] };
  }

  const data = librarySnap.data();
  return {
    id: MUSIC_LIBRARY_DOC_ID,
    songs: parseMusicSongs(data.songs),
    updatedAt: data.updatedAt?.toDate?.(),
  };
};

/** Ghi toàn bộ bài vào `music/library` và xóa mọi doc nhạc cũ khác. */
export const setMusicLibrary = async (songs: MusicSong[]): Promise<void> => {
  const ref = doc(db, "music", MUSIC_LIBRARY_DOC_ID);
  const normalized = songs.map((s) => ({
    title: s.title.trim(),
    video: s.video.trim(),
    ...(s.thumbnail?.trim() ? { thumbnail: s.thumbnail.trim() } : {}),
  }));
  await setDoc(
    ref,
    { songs: normalized, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await deleteLegacyMusicDocs();
};

export interface CreateContentTopicData {
  /** ID phim đã sinh trước (upload thumbnail / phụ đề trước khi lưu). */
  id?: string;
  title: string;
  order?: number;
  variant?: MovieVariant;
  difficulty?: MovieDifficulty;
  thumbnail?: string;
  video?: string;
  sourceLink?: string;
  exercises?: ContentExercise[];
}

export const createContentTopic = async (
  kind: ContentKind,
  data: CreateContentTopicData
): Promise<string> => {
  if (kind === "music") {
    throw new Error(
      "Nhạc lưu chung 1 doc music/library. Dùng quản lý tab Nhạc."
    );
  }
  if (kind === "movies") {
    const newId = data.id?.trim() || doc(collection(db, "movies")).id;
    const createdId = await withMovieLibrary((topics) => {
      const order =
        typeof data.order === "number" ? data.order : topics.length + 1;
      const newTopic: ContentTopic = {
        id: newId,
        title: data.title.trim(),
        order,
        variant: data.variant,
        difficulty: data.difficulty,
        thumbnail: data.thumbnail?.trim() || undefined,
        video: data.video?.trim() || undefined,
        sourceLink: data.sourceLink?.trim() || undefined,
        exercises: data.exercises ?? [],
      };
      return {
        topics: sortTopics([...topics, newTopic]),
        result: newId,
      };
    });
    await deleteLegacyMovieDocs();
    return createdId;
  }
  const payload: Record<string, unknown> = {
    title: data.title.trim(),
    order: typeof data.order === "number" ? data.order : null,
    exercises: data.exercises ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (data.variant) payload.variant = data.variant;
  if (data.difficulty) payload.difficulty = data.difficulty;
  if (data.thumbnail?.trim()) payload.thumbnail = data.thumbnail.trim();
  if (data.video?.trim()) payload.video = data.video.trim();
  const ref = await addDoc(collection(db, kind), payload);
  return ref.id;
};

export interface ImportMovieEpisode {
  exerciseNo: number;
  video: string;
  subtitles: EpisodeSubtitles;
  /** Link studyphim để cào sub (import Excel). */
  sourceLink?: string;
  sourceEpisode?: number;
}

export interface ImportMovieInput {
  /** ID phim sinh trước khi clone thumbnail / ghi library. */
  id?: string;
  title: string;
  variant: MovieVariant;
  difficulty?: MovieDifficulty;
  thumbnail?: string;
  /** Với phim lẻ chỉ có 1 phần tử. */
  episodes: ImportMovieEpisode[];
}

export interface BulkImportResult {
  created: number;
  episodes: number;
}

/**
 * Nhập nhiều phim cùng lúc (phim lẻ + phim bộ) trong 1 transaction cho doc
 * `movies/library`, sau đó ghi phụ đề từng tập lên Storage.
 */
export const bulkCreateMovies = async (
  movies: ImportMovieInput[]
): Promise<BulkImportResult> => {
  const valid = movies.filter(
    (m) => m.title.trim() && m.episodes.some((ep) => ep.video.trim())
  );
  if (valid.length === 0) return { created: 0, episodes: 0 };

  const prepared = valid.map((movie) => ({
    id: movie.id?.trim() || doc(collection(db, "movies")).id,
    movie,
  }));

  await withMovieLibrary((topics) => {
    let maxOrder = topics.reduce(
      (m, t) => (typeof t.order === "number" && t.order > m ? t.order : m),
      0
    );
    const newTopics: ContentTopic[] = prepared.map(({ id, movie }) => {
      maxOrder += 1;
      const episodes = movie.episodes.filter((ep) => ep.video.trim());
      const firstVideo = episodes[0]?.video.trim() ?? "";
      const thumbnail =
        movie.thumbnail?.trim() ||
        getYouTubeThumbnailUrl(firstVideo) ||
        undefined;
      if (movie.variant === "single") {
        return {
          id,
          title: movie.title.trim(),
          order: maxOrder,
          variant: "single",
          difficulty: movie.difficulty,
          thumbnail,
          video: firstVideo,
          sourceLink: episodes[0]?.sourceLink?.trim() || undefined,
          exercises: [],
        };
      }
      return {
        id,
        title: movie.title.trim(),
        order: maxOrder,
        variant: "series",
        difficulty: movie.difficulty,
        thumbnail,
        exercises: episodes.map((ep, i) => ({
          exerciseNo: i + 1,
          title: `Tập ${i + 1}`,
          video: ep.video.trim(),
          ...(ep.sourceLink?.trim()
            ? { sourceLink: ep.sourceLink.trim() }
            : {}),
        })),
      };
    });
    return {
      topics: sortTopics([...topics, ...newTopics]),
      result: undefined,
    };
  });
  await deleteLegacyMovieDocs();

  let episodeCount = 0;
  await Promise.all(
    prepared.map(async ({ id, movie }) => {
      const episodes = movie.episodes.filter((ep) => ep.video.trim());
      await Promise.all(
        episodes.map((ep, i) => {
          const exerciseNo = i + 1;
          episodeCount += 1;
          return setEpisodeSubtitles(
            id,
            getEpisodeKey(exerciseNo, movie.variant),
            ep.subtitles,
            { exerciseNo }
          );
        })
      );
    })
  );

  return { created: prepared.length, episodes: episodeCount };
};

export interface UpdateContentTopicData {
  title?: string;
  order?: number | null;
  variant?: MovieVariant;
  difficulty?: MovieDifficulty;
  thumbnail?: string | null;
  video?: string | null;
  sourceLink?: string | null;
  exercises?: ContentExercise[];
}

export const updateContentTopic = async (
  kind: ContentKind,
  topicId: string,
  data: UpdateContentTopicData
): Promise<void> => {
  if (kind === "movies") {
    await withMovieLibrary((topics) => {
      const idx = topics.findIndex((t) => t.id === topicId);
      if (idx === -1) {
        throw new Error("Không tìm thấy phim.");
      }
      const next = [...topics];
      next[idx] = applyMovieTopicUpdate(topics[idx], data);
      return { topics: sortTopics(next), result: undefined };
    });
    await deleteLegacyMovieDocs();
    return;
  }
  const ref = doc(db, kind, topicId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (typeof data.title === "string") payload.title = data.title.trim();
  if (data.order !== undefined) payload.order = data.order;
  if (data.variant !== undefined) payload.variant = data.variant;
  if (data.difficulty !== undefined) payload.difficulty = data.difficulty;
  if (data.thumbnail !== undefined) payload.thumbnail = data.thumbnail;
  if (data.video !== undefined) payload.video = data.video;
  if (Array.isArray(data.exercises)) payload.exercises = data.exercises;
  await updateDoc(ref, payload);
};

const collectMovieStorageExtraPaths = (
  topicId: string,
  thumbnail?: string
): string[] => {
  const prefix = `movies/${topicId}/`;
  const extraPaths: string[] = [];
  if (!thumbnail?.trim() || !isFirebaseStorageUrl(thumbnail)) {
    return extraPaths;
  }
  const path = extractStoragePathFromURL(thumbnail.trim());
  if (path && path.startsWith("movies/") && !path.startsWith(prefix)) {
    extraPaths.push(path);
  }
  return extraPaths;
};

const deleteMovieStorageViaApi = async (
  movieId: string,
  extraPaths: string[] = []
): Promise<void> => {
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error("Cần đăng nhập để xóa file phim.");
  }

  const idToken = await user.getIdToken();
  const res = await fetch(
    `/api/admin/movies/${encodeURIComponent(movieId)}/storage`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ extraPaths }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status} khi xóa storage phim`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* use raw text */
    }
    throw new Error(message);
  }
};

export const deleteContentTopic = async (
  kind: ContentKind,
  topicId: string
): Promise<void> => {
  if (kind === "movies") {
    const topics = await getMovieLibraryTopics();
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) {
      throw new Error("Không tìm thấy phim.");
    }

    const extraPaths = collectMovieStorageExtraPaths(
      topicId,
      topic.thumbnail
    );
    await deleteMovieStorageViaApi(topicId, extraPaths);

    await withMovieLibrary((libraryTopics) => {
      const next = libraryTopics.filter((t) => t.id !== topicId);
      if (next.length === libraryTopics.length) {
        throw new Error("Không tìm thấy phim.");
      }
      return { topics: sortTopics(next), result: undefined };
    });
    await deleteLegacyMovieDocs();
    return;
  }
  await deleteDoc(doc(db, kind, topicId));
};

/** Ghi đè toàn bộ exercises của 1 topic (đơn giản cho admin sửa list). */
export const setContentTopicExercises = async (
  kind: ContentKind,
  topicId: string,
  exercises: ContentExercise[]
): Promise<void> => {
  if (kind === "movies") {
    await updateContentTopic(kind, topicId, { exercises });
    return;
  }
  const ref = doc(db, kind, topicId);
  await setDoc(
    ref,
    { exercises, updatedAt: serverTimestamp() },
    { merge: true }
  );
};

/** Batch update `order` cho nhiều topic (dùng cho drag-and-drop). */
export const setContentTopicsOrder = async (
  kind: ContentKind,
  items: { id: string; order: number }[]
): Promise<void> => {
  if (items.length === 0) return;
  if (kind === "movies") {
    const orderMap = new Map(items.map((it) => [it.id, it.order]));
    await withMovieLibrary((topics) => {
      const reordered = sortTopics(
        topics.map((t) => ({
          ...t,
          order: orderMap.get(t.id) ?? t.order,
        }))
      ).map((t, i) => ({
        ...t,
        order: orderMap.get(t.id) ?? i + 1,
      }));
      return { topics: reordered, result: undefined };
    });
    await deleteLegacyMovieDocs();
    return;
  }
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + CHUNK)) {
      batch.update(doc(db, kind, item.id), {
        order: item.order,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
};

/**
 * Upload ảnh thumbnail phim lên Storage (nén + resize 16:9) và trả về URL công khai.
 * Đường dẫn: `movies/{movieId}/thumbnail-{timestamp}.jpg`.
 */
export const uploadMovieThumbnail = async (
  file: File,
  movieId?: string
): Promise<string> => {
  const compressed = await compressAndResizeImage(file, 640, 360, 0.85);
  const id = movieId?.trim() || doc(collection(db, "movies")).id;
  const path = `movies/${id}/thumbnail-${Date.now()}.jpg`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, compressed, {
    contentType: "image/jpeg",
  });
  return getDownloadURL(fileRef);
};

/**
 * Clone ảnh thumbnail từ URL web ngoài về Firebase Storage và trả về URL mới.
 * Nếu URL đã trỏ về Storage của hệ thống thì giữ nguyên.
 */
export const cloneExternalThumbnail = async (
  url: string,
  movieId?: string
): Promise<string> => {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  if (isFirebaseStorageUrl(trimmed)) return trimmed;

  const res = await fetch(`/api/proxy-image?url=${encodeURIComponent(trimmed)}`);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const file = new File([blob], "thumbnail.jpg", { type });
  return uploadMovieThumbnail(file, movieId);
};

export type SubtitleType = "eng" | "vn" | "pronounce";

export const SUBTITLE_TYPES: { id: SubtitleType; label: string }[] = [
  { id: "eng", label: "Sub ENG" },
  { id: "vn", label: "Sub VN" },
  { id: "pronounce", label: "Sub Pronounce" },
];

export interface EpisodeSubtitles {
  eng?: string;
  vn?: string;
  pronounce?: string;
}

export function getEpisodeKey(
  exerciseNo: number,
  variant?: MovieVariant
): string {
  return variant === "single" ? "1" : String(exerciseNo);
}

const subtitleStoragePath = (
  movieId: string,
  episodeKey: string,
  type: SubtitleType
) => `movies/${movieId}/episodes/${episodeKey}/${type}.srt`;

const subtitleStorageRef = (
  movieId: string,
  episodeKey: string,
  type: SubtitleType
) => ref(storage, subtitleStoragePath(movieId, episodeKey, type));

const isStorageNotFound = (error: unknown): boolean => {
  if (error instanceof FirebaseError) {
    return error.code === "storage/object-not-found";
  }
  return false;
};

/**
 * Tải phụ đề qua URL công khai (getDownloadURL + fetch).
 * Không dùng getBytes(): API đó cần CORS riêng trên bucket, dễ lỗi
 * trong khi mở cùng URL trên trình duyệt vẫn được.
 */
const readSubtitleFile = async (
  movieId: string,
  episodeKey: string,
  type: SubtitleType
): Promise<string | undefined> => {
  const path = subtitleStoragePath(movieId, episodeKey, type);
  try {
    const url = await getDownloadURL(
      subtitleStorageRef(movieId, episodeKey, type)
    );
    const res = await fetch(url);
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} khi tải ${path}`);
    }
    const content = (await res.text()).trim();
    return content || undefined;
  } catch (error) {
    if (isStorageNotFound(error)) return undefined;
    if (error instanceof FirebaseError) {
      throw new Error(`${error.code}: ${error.message} (${path})`);
    }
    throw error;
  }
};

/** Cào phụ đề 3 loại từ studyphim.vn qua API server-side. */
export const crawlEpisodeSubtitles = async (
  link: string,
  episode = 1
): Promise<EpisodeSubtitles> => {
  const res = await fetch(
    `/api/crawl-subtitles?link=${encodeURIComponent(link.trim())}&episode=${episode}`
  );
  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* use raw text */
    }
    throw new Error(message);
  }
  return (await res.json()) as EpisodeSubtitles;
};

/** Lazy-load phụ đề 3 loại cho 1 tập phim. */
export const getEpisodeSubtitles = async (
  movieId: string,
  episodeKey: string
): Promise<EpisodeSubtitles> => {
  try {
    const res = await fetch(
      `/api/subtitles?movieId=${encodeURIComponent(movieId)}&episodeKey=${encodeURIComponent(episodeKey)}`
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status} when fetching subtitles`);
    }
    return await res.json();
  } catch (error) {
    console.error("Error fetching subtitles via local proxy api:", error);
    throw error;
  }
};

export interface SetEpisodeSubtitlesMeta {
  exerciseNo?: number;
}

/** Ghi phụ đề 3 loại lên Firebase Storage. */
export const setEpisodeSubtitles = async (
  movieId: string,
  episodeKey: string,
  data: EpisodeSubtitles,
  _meta?: SetEpisodeSubtitlesMeta
): Promise<void> => {
  const types: SubtitleType[] = ["eng", "vn", "pronounce"];
  await Promise.all(
    types.map(async (type) => {
      const content = data[type]?.trim() ?? "";
      const fileRef = subtitleStorageRef(movieId, episodeKey, type);
      if (content) {
        await uploadString(fileRef, content, "raw", {
          contentType: "text/plain; charset=utf-8",
        });
        return;
      }
      try {
        await deleteObject(fileRef);
      } catch (error) {
        if (!isStorageNotFound(error)) throw error;
      }
    })
  );
};

/** Xóa toàn bộ file phụ đề của 1 tập. */
export const deleteEpisodeSubtitles = async (
  movieId: string,
  episodeKey: string
): Promise<void> => {
  const types: SubtitleType[] = ["eng", "vn", "pronounce"];
  await Promise.all(
    types.map(async (type) => {
      try {
        await deleteObject(subtitleStorageRef(movieId, episodeKey, type));
      } catch (error) {
        if (!isStorageNotFound(error)) throw error;
      }
    })
  );
};

export interface RenormalizeSubtitlesResult {
  movies: number;
  episodes: number;
  filesChanged: number;
}

/**
 * Chuẩn hoá toàn bộ file SRT phim trên Storage qua API server (Admin SDK).
 * Đọc/ghi trực tiếp file .srt — không cào lại từ linkPhim/sourceLink.
 */
export const renormalizeAllMovieSubtitles = async (
  onProgress?: (msg: string) => void
): Promise<RenormalizeSubtitlesResult> => {
  onProgress?.("Đang quét và chuẩn hoá phụ đề trên Storage...");

  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new Error("Cần đăng nhập để chuẩn hoá phụ đề.");
  }

  const idToken = await user.getIdToken();
  const res = await fetch("/api/admin/renormalize-subtitles", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      /* use raw text */
    }
    throw new Error(message);
  }

  return (await res.json()) as RenormalizeSubtitlesResult;
};
