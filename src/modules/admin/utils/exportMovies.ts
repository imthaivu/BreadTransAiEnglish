import {
  ContentTopic,
  getMovieVariant,
} from "../services/content.service";

const EXPORT_HEADERS = [
  "typeOfMovie",
  "name",
  "episode",
  "level",
  "link",
  "thumbnail",
  "linkPhim",
] as const;

export type MovieExportRow = Record<(typeof EXPORT_HEADERS)[number], string | number>;

function buildExportRows(topics: ContentTopic[]): MovieExportRow[] {
  const rows: MovieExportRow[] = [];

  for (const topic of topics) {
    const variant = getMovieVariant(topic);
    const typeOfMovie = variant === "single" ? "single" : "multi";
    const level = topic.difficulty ?? "";
    const thumbnail = topic.thumbnail?.trim() ?? "";

    if (variant === "single") {
      const link =
        topic.video?.trim() || topic.exercises[0]?.video?.trim() || "";
      const linkPhim =
        topic.sourceLink?.trim() ||
        topic.exercises[0]?.sourceLink?.trim() ||
        "";
      rows.push({
        typeOfMovie,
        name: topic.title,
        episode: 1,
        level,
        link,
        thumbnail,
        linkPhim,
      });
      continue;
    }

    const sorted = [...topic.exercises].sort(
      (a, b) => a.exerciseNo - b.exerciseNo
    );
    const episodes =
      sorted.length > 0
        ? sorted
        : [{ exerciseNo: 1, title: "", video: "" }];

    episodes.forEach((ex, i) => {
      rows.push({
        typeOfMovie,
        name: topic.title,
        episode: ex.exerciseNo > 0 ? ex.exerciseNo : i + 1,
        level,
        link: ex.video?.trim() ?? "",
        thumbnail: i === 0 ? thumbnail : "",
        linkPhim: ex.sourceLink?.trim() || topic.sourceLink?.trim() || "",
      });
    });
  }

  return rows;
}

/** Tải file .xlsx danh sách phim (định dạng khớp import). */
export async function downloadMoviesXlsx(topics: ContentTopic[]): Promise<void> {
  const rows = buildExportRows(topics);
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...EXPORT_HEADERS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Phim");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `phim-${date}.xlsx`);
}
