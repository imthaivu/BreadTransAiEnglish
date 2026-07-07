"use client";

import { Button } from "@/components/ui/Button";
import { db } from "@/lib/firebase/client";
import { collection, doc } from "firebase/firestore";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiFilm, FiUploadCloud } from "react-icons/fi";
import {
  cloneExternalThumbnail,
  crawlEpisodeSubtitles,
  ImportMovieInput,
  MovieDifficulty,
  MovieVariant,
} from "../services/content.service";
import { AdminModal } from "./common";

interface MovieImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (movies: ImportMovieInput[]) => Promise<unknown> | unknown;
  isSubmitting?: boolean;
}

const EXPECTED_COLUMNS =
  "typeOfMovie · name · episode · level · link · thumbnail · linkPhim";

/** Bỏ dấu tiếng Việt + khoảng trắng để so khớp tên cột linh hoạt. */
function normalizeKey(value: string): string {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  typeofmovie: "type",
  type: "type",
  loai: "type",
  loaiphim: "type",
  kind: "type",
  name: "name",
  ten: "name",
  tenphim: "name",
  title: "name",
  episode: "episode",
  tap: "episode",
  ep: "episode",
  sotap: "episode",
  level: "level",
  dokho: "level",
  difficulty: "level",
  link: "link",
  video: "link",
  url: "link",
  linkvideo: "link",
  thumbnail: "thumbnail",
  thumb: "thumbnail",
  anh: "thumbnail",
  poster: "thumbnail",
  linkphim: "linkphim",
  linkfilm: "linkphim",
  sourcelink: "linkphim",
  studyphim: "linkphim",
};

type RawRow = Record<string, string>;

function resolveVariant(raw: string): MovieVariant {
  const n = normalizeKey(raw);
  if (
    n.includes("multi") ||
    n.includes("series") ||
    n.includes("bo") ||
    n.includes("nhieu")
  ) {
    return "series";
  }
  return "single";
}

function resolveDifficulty(raw: string): MovieDifficulty | undefined {
  const n = normalizeKey(raw);
  if (!n) return undefined;
  if (n.includes("easy") || n.includes("de") || n === "1") return "easy";
  if (n.includes("medium") || n.includes("vua") || n === "2") return "medium";
  if (n.includes("hard") || n.includes("kho") || n === "3") return "hard";
  return undefined;
}

const DIFFICULTY_LABEL: Record<MovieDifficulty, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

interface ParseOutput {
  movies: ImportMovieInput[];
  warnings: string[];
}

/** Gom các dòng excel thành danh sách phim (phim bộ gộp theo tên). */
function buildMovies(rows: RawRow[]): ParseOutput {
  const warnings: string[] = [];
  const groups = new Map<
    string,
    {
      title: string;
      variant: MovieVariant;
      difficulty?: MovieDifficulty;
      thumbnail?: string;
      rows: { episode: number; row: RawRow }[];
    }
  >();

  rows.forEach((row, index) => {
    const title = (row.name ?? "").trim();
    const link = (row.link ?? "").trim();
    if (!title && !link) return; // dòng trống
    if (!title) {
      warnings.push(`Dòng ${index + 2}: thiếu tên phim — bỏ qua.`);
      return;
    }
    if (!link) {
      warnings.push(`Dòng ${index + 2}: thiếu link video — bỏ qua.`);
      return;
    }

    const variant = resolveVariant(row.type ?? "");
    const key = `${variant}||${normalizeKey(title)}`;
    const episode = Number((row.episode ?? "").toString().trim()) || 0;

    const existing = groups.get(key);
    if (existing) {
      existing.rows.push({ episode, row });
      if (!existing.difficulty) {
        existing.difficulty = resolveDifficulty(row.level ?? "");
      }
      if (!existing.thumbnail && (row.thumbnail ?? "").trim()) {
        existing.thumbnail = (row.thumbnail ?? "").trim();
      }
    } else {
      groups.set(key, {
        title,
        variant,
        difficulty: resolveDifficulty(row.level ?? ""),
        thumbnail: (row.thumbnail ?? "").trim() || undefined,
        rows: [{ episode, row }],
      });
    }
  });

  const movies: ImportMovieInput[] = [];
  for (const group of groups.values()) {
    const sorted = [...group.rows].sort(
      (a, b) => a.episode - b.episode
    );
    const sourceRows =
      group.variant === "single" ? sorted.slice(0, 1) : sorted;

    if (group.variant === "single" && sorted.length > 1) {
      warnings.push(
        `"${group.title}": phim lẻ có ${sorted.length} dòng — chỉ dùng dòng đầu.`
      );
    }

    const episodes = sourceRows.map((entry, i) => {
      const epNum = entry.episode > 0 ? entry.episode : i + 1;
      const sourceLink = (entry.row.linkphim ?? "").trim();
      return {
        exerciseNo: i + 1,
        video: (entry.row.link ?? "").trim(),
        subtitles: {},
        sourceLink: sourceLink || undefined,
        sourceEpisode: epNum,
      };
    });

    movies.push({
      title: group.title,
      variant: group.variant,
      difficulty: group.difficulty,
      thumbnail: group.thumbnail,
      episodes,
    });
  }

  return { movies, warnings };
}

async function parseWorkbook(buffer: ArrayBuffer): Promise<ParseOutput> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("File không có sheet nào.");
  }
  const sheet = wb.Sheets[sheetName];
  const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (rawJson.length === 0) {
    throw new Error("Sheet không có dữ liệu.");
  }

  const rows: RawRow[] = rawJson.map((rawRow) => {
    const mapped: RawRow = {};
    for (const [header, value] of Object.entries(rawRow)) {
      const canonical = HEADER_ALIASES[normalizeKey(header)];
      if (canonical) mapped[canonical] = value == null ? "" : String(value);
    }
    return mapped;
  });

  return buildMovies(rows);
}

async function crawlSubtitlesForImport(
  movies: ImportMovieInput[],
  onProgress: (msg: string) => void
): Promise<ImportMovieInput[]> {
  const tasks: { movieIdx: number; epIdx: number; link: string; episode: number }[] =
    [];
  movies.forEach((movie, movieIdx) => {
    movie.episodes.forEach((ep, epIdx) => {
      const link = ep.sourceLink?.trim();
      if (!link) return;
      tasks.push({
        movieIdx,
        epIdx,
        link,
        episode: ep.sourceEpisode ?? ep.exerciseNo,
      });
    });
  });

  if (tasks.length === 0) return movies;

  const next = movies.map((m) => ({
    ...m,
    episodes: m.episodes.map((ep) => ({ ...ep })),
  }));

  for (let i = 0; i < tasks.length; i += 1) {
    const { movieIdx, epIdx, link, episode } = tasks[i];
    onProgress(`Đang cào sub ${i + 1}/${tasks.length}...`);
    try {
      const subs = await crawlEpisodeSubtitles(link, episode);
      next[movieIdx].episodes[epIdx].subtitles = subs;
    } catch (err) {
      console.warn(`Import crawl failed ep ${episode}:`, err);
    }
  }

  return next;
}

/** Tải thumbnail từ web ngoài về Firebase, thay link cũ bằng link hệ thống. */
async function cloneThumbnailsForImport(
  movies: ImportMovieInput[],
  onProgress: (msg: string) => void
): Promise<ImportMovieInput[]> {
  const next = movies.map((movie) => ({
    ...movie,
    id: movie.id?.trim() || doc(collection(db, "movies")).id,
  }));

  const targets: number[] = [];
  next.forEach((movie, idx) => {
    const thumb = movie.thumbnail?.trim();
    if (thumb && /^https?:\/\//i.test(thumb)) targets.push(idx);
  });

  if (targets.length === 0) return next;

  for (let i = 0; i < targets.length; i += 1) {
    const idx = targets[i];
    onProgress(`Đang tải ảnh ${i + 1}/${targets.length}...`);
    try {
      const cloned = await cloneExternalThumbnail(
        next[idx].thumbnail!.trim(),
        next[idx].id
      );
      if (cloned) next[idx].thumbnail = cloned;
    } catch (err) {
      console.warn(`Import clone thumbnail failed "${next[idx].title}":`, err);
    }
  }

  return next;
}

export default function MovieImportDialog({
  isOpen,
  onClose,
  onImport,
  isSubmitting = false,
}: MovieImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [movies, setMovies] = useState<ImportMovieInput[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState("");

  const reset = () => {
    setFileName("");
    setMovies([]);
    setWarnings([]);
    setParsing(false);
    setCrawling(false);
    setCrawlProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    if (isSubmitting || crawling) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setMovies([]);
    setWarnings([]);
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseWorkbook(buffer);
      setMovies(result.movies);
      setWarnings(result.warnings);
      if (result.movies.length === 0) {
        toast.error("Không tìm thấy phim hợp lệ trong file.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Đọc file thất bại.";
      toast.error(msg);
      reset();
      setFileName(file.name);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (movies.length === 0) {
      toast.error("Chưa có phim để nhập.");
      return;
    }
    setCrawling(true);
    setCrawlProgress("");
    try {
      const withThumbs = await cloneThumbnailsForImport(movies, setCrawlProgress);
      const withSubs = await crawlSubtitlesForImport(withThumbs, setCrawlProgress);
      await onImport(withSubs);
      reset();
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Nhập phim thất bại.";
      toast.error(msg);
    } finally {
      setCrawling(false);
      setCrawlProgress("");
    }
  };

  const totalEpisodes = movies.reduce((s, m) => s + m.episodes.length, 0);

  return (
    <AdminModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Nhập nhanh phim từ Excel"
      subtitle={EXPECTED_COLUMNS}
      size="xl"
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Huỷ
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              isSubmitting || parsing || crawling || movies.length === 0
            }
          >
            {isSubmitting || crawling
              ? crawling
                ? crawlProgress || "Đang cào sub..."
                : "Đang nhập..."
              : movies.length > 0
                ? `Nhập ${movies.length} phim`
                : "Nhập"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting || parsing || crawling}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
        >
          <FiUploadCloud className="h-8 w-8 text-primary" />
          <span className="text-sm font-medium text-gray-700">
            {parsing
              ? "Đang đọc file..."
              : fileName || "Bấm để chọn file Excel (.xlsx, .xls, .csv)"}
          </span>
          <span className="text-xs text-gray-500">
            Cột: {EXPECTED_COLUMNS}
          </span>
        </button>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-medium text-gray-700">Mẹo định dạng file:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <span className="font-medium">typeOfMovie</span>:{" "}
              <code>single</code> (phim lẻ) hoặc <code>multi</code> (phim bộ).
            </li>
            <li>
              Phim bộ: mỗi tập 1 dòng, cùng <span className="font-medium">name</span>,
              khác <span className="font-medium">episode</span> (1, 2, 3...).
            </li>
            <li>
              <span className="font-medium">level</span>: dễ/vừa/khó (hoặc
              easy/medium/hard).
            </li>
            <li>
              <span className="font-medium">link</span>: link video YouTube (phát
              trong app).
            </li>
            <li>
              <span className="font-medium">linkPhim</span>: link studyphim.vn
              (hệ thống tự cào eng/vn/pronounce khi nhập).
            </li>
            <li>
              <span className="font-medium">thumbnail</span>: dán link ảnh web
              ngoài — hệ thống tự tải về Storage và thay bằng link nội bộ.
            </li>
          </ul>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-700">
              <FiAlertTriangle className="h-4 w-4" />
              Cảnh báo ({warnings.length})
            </div>
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-700">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {movies.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-800">
              Xem trước: {movies.length} phim · {totalEpisodes} tập
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-100 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Tên phim</th>
                    <th className="px-3 py-2">Loại</th>
                    <th className="px-3 py-2">Độ khó</th>
                    <th className="px-3 py-2 text-right">Số tập</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {movies.map((m, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FiFilm className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                          <span className="font-medium text-gray-800">
                            {m.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {m.variant === "single" ? "Phim lẻ" : "Phim bộ"}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {m.difficulty ? DIFFICULTY_LABEL[m.difficulty] : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {m.episodes.length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
