import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  BulkImportResult,
  ContentKind,
  ContentTopic,
  CreateContentTopicData,
  EpisodeSubtitles,
  ImportMovieInput,
  MusicLibrary,
  MusicSong,
  UpdateContentTopicData,
  RenormalizeSubtitlesResult,
  bulkCreateMovies,
  createContentTopic,
  deleteContentTopic,
  getContentTopics,
  getEpisodeSubtitles,
  getMusicLibrary,
  renormalizeAllMovieSubtitles,
  setContentTopicsOrder,
  setEpisodeSubtitles,
  setMusicLibrary,
  updateContentTopic,
} from "../services/content.service";

export const contentKeys = {
  all: ["content"] as const,
  list: (kind: ContentKind) => [...contentKeys.all, kind, "list"] as const,
  musicLibrary: () => [...contentKeys.all, "music", "library"] as const,
  episodeSubtitles: (movieId: string, episodeKey: string) =>
    [
      ...contentKeys.all,
      "movies",
      movieId,
      "episodes",
      episodeKey,
      "subtitles",
    ] as const,
};

export const useContentTopics = (kind: ContentKind, enabled = true) => {
  return useQuery<ContentTopic[]>({
    queryKey: contentKeys.list(kind),
    queryFn: () => getContentTopics(kind),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useCreateContentTopic = (kind: ContentKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateContentTopicData) => createContentTopic(kind, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.list(kind) });
      toast.success("Đã tạo chủ đề.");
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Tạo chủ đề thất bại.";
      toast.error(msg);
    },
  });
};

export const useBulkImportMovies = () => {
  const queryClient = useQueryClient();
  return useMutation<BulkImportResult, unknown, ImportMovieInput[]>({
    mutationFn: (movies: ImportMovieInput[]) => bulkCreateMovies(movies),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: contentKeys.list("movies") });
      toast.success(
        `Đã nhập ${result.created} phim (${result.episodes} tập).`
      );
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Nhập phim thất bại.";
      toast.error(msg);
    },
  });
};

export const useUpdateContentTopic = (kind: ContentKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      topicId,
      data,
    }: {
      topicId: string;
      data: UpdateContentTopicData;
    }) => updateContentTopic(kind, topicId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.list(kind) });
      toast.success("Đã lưu thay đổi.");
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Cập nhật thất bại.";
      toast.error(msg);
    },
  });
};

export const useDeleteContentTopic = (kind: ContentKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => deleteContentTopic(kind, topicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.list(kind) });
      toast.success("Đã xoá chủ đề.");
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Xoá chủ đề thất bại.";
      toast.error(msg);
    },
  });
};

export const useReorderContentTopics = (kind: ContentKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: { id: string; order: number }[]) =>
      setContentTopicsOrder(kind, items),
    // Optimistic: cập nhật cache ngay để UI mượt, rollback khi lỗi
    onMutate: async (items) => {
      await queryClient.cancelQueries({ queryKey: contentKeys.list(kind) });
      const prev = queryClient.getQueryData<ContentTopic[]>(
        contentKeys.list(kind)
      );
      if (prev) {
        const orderMap = new Map(items.map((it) => [it.id, it.order]));
        const next = [...prev]
          .map((t) => ({ ...t, order: orderMap.get(t.id) ?? t.order }))
          .sort(
            (a, b) =>
              (a.order ?? 999_999) - (b.order ?? 999_999) ||
              a.title.localeCompare(b.title, "vi")
          );
        queryClient.setQueryData(contentKeys.list(kind), next);
      }
      return { prev };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(contentKeys.list(kind), ctx.prev);
      }
      const msg =
        error instanceof Error ? error.message : "Đổi thứ tự thất bại.";
      toast.error(msg);
    },
    onSuccess: () => {
      toast.success("Đã đổi thứ tự.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.list(kind) });
    },
  });
};

export const useMusicLibrary = (enabled = true) => {
  return useQuery<MusicLibrary>({
    queryKey: contentKeys.musicLibrary(),
    queryFn: getMusicLibrary,
    enabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useUpdateMusicLibrary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (songs: MusicSong[]) => setMusicLibrary(songs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contentKeys.musicLibrary() });
      toast.success("Đã lưu danh sách nhạc.");
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Lưu nhạc thất bại.";
      toast.error(msg);
    },
  });
};

export const useRenormalizeMovieSubtitles = () => {
  const queryClient = useQueryClient();
  return useMutation<
    RenormalizeSubtitlesResult,
    unknown,
    ((msg: string) => void) | undefined
  >({
    mutationFn: (onProgress) => renormalizeAllMovieSubtitles(onProgress),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: [...contentKeys.all, "movies"],
      });
      toast.success(
        `Đã chuẩn hoá ${result.filesChanged} file phụ đề (${result.episodes} tập / ${result.movies} phim).`
      );
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : "Chuẩn hoá phụ đề thất bại.";
      toast.error(msg);
    },
  });
};

export const useEpisodeSubtitles = (
  movieId: string | undefined,
  episodeKey: string | undefined,
  enabled = false
) => {
  return useQuery<EpisodeSubtitles>({
    queryKey: contentKeys.episodeSubtitles(movieId ?? "", episodeKey ?? ""),
    queryFn: () => getEpisodeSubtitles(movieId!, episodeKey!),
    enabled: Boolean(movieId && episodeKey && enabled),
    staleTime: 5 * 60 * 1000,
  });
};

export const useSaveEpisodeSubtitles = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      movieId,
      episodeKey,
      data,
      meta,
    }: {
      movieId: string;
      episodeKey: string;
      data: EpisodeSubtitles;
      meta?: { exerciseNo?: number };
    }) => setEpisodeSubtitles(movieId, episodeKey, data, meta),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: contentKeys.episodeSubtitles(vars.movieId, vars.episodeKey),
      });
    },
    onError: (error: unknown) => {
      const msg =
        error instanceof Error ? error.message : "Lưu phụ đề thất bại.";
      toast.error(msg);
    },
  });
};
