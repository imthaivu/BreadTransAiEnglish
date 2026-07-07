"use client";

import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { FiRefreshCw, FiSave } from "react-icons/fi";
import {
  useGameSettings,
  useUpdateGameSettings,
} from "../hooks/useGameManagement";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_LABEL,
  GameId,
  GameSettings,
} from "../services/game.service";

interface FieldSpec {
  key: string;
  label: string;
  description: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
}

const FLAPPY_BIRD_FIELDS: FieldSpec[] = [
  {
    key: "gravity",
    label: "Trọng lực",
    description: "Tốc độ chim rơi xuống mỗi frame. Càng cao càng nặng.",
    min: 0.1,
    max: 1.0,
    step: 0.05,
  },
  {
    key: "jumpVelocity",
    label: "Lực nhảy",
    description:
      "Vận tốc dọc khi chạm/Space. Giá trị âm: càng âm thì nhảy càng cao.",
    min: -12,
    max: -2,
    step: 0.5,
  },
  {
    key: "pipeSpeed",
    label: "Tốc độ ống",
    description: "Tốc độ ống lướt sang trái.",
    unit: "px/frame",
    min: 1.0,
    max: 6.0,
    step: 0.25,
  },
  {
    key: "pipeSpawnInterval",
    label: "Khoảng cách giữa các ống",
    description: "Số frame giữa hai lần sinh ống. Càng lớn càng cách xa.",
    unit: "frame",
    min: 60,
    max: 220,
    step: 5,
  },
  {
    key: "pipeGap",
    label: "Khe hở dọc",
    description: "Khoảng trống giữa ống trên và ống dưới.",
    unit: "px",
    min: 100,
    max: 220,
    step: 5,
  },
  {
    key: "pipeWidth",
    label: "Bề ngang ống",
    description: "Độ rộng cột ống.",
    unit: "px",
    min: 30,
    max: 110,
    step: 2,
  },
  {
    key: "birdWidth",
    label: "Bề ngang chim",
    description: "Hộp va chạm theo chiều ngang.",
    unit: "px",
    min: 20,
    max: 60,
    step: 1,
  },
  {
    key: "birdHeight",
    label: "Chiều cao chim",
    description: "Hộp va chạm theo chiều dọc.",
    unit: "px",
    min: 16,
    max: 50,
    step: 1,
  },
  {
    key: "rainEnabled",
    label: "Bật hiệu ứng mưa & sấm sét",
    description:
      "1 = bật, 0 = tắt hoàn toàn. Khi tắt thì các tham số mưa bên dưới sẽ không có tác dụng.",
    min: 0,
    max: 1,
    step: 1,
  },
  {
    key: "rainStartChancePer10k",
    label: "Tần suất nổi mưa",
    description:
      "Xác suất bắt đầu một trận mưa mới mỗi frame, tính trên 10000. Số càng cao mưa càng đến dồn dập.",
    unit: "/10k",
    min: 0,
    max: 500,
    step: 1,
  },
  {
    key: "rainForecastFrames",
    label: "Thời gian dự báo trước mưa",
    description:
      "Số frame cảnh báo \"sắp mưa\" trước khi mưa thật rơi (60 frame ≈ 1 giây). Tối thiểu 60 frame khi bật mưa.",
    unit: "frame",
    min: 60,
    max: 600,
    step: 15,
  },
  {
    key: "rainMinDurationFrames",
    label: "Thời lượng mưa tối thiểu",
    description: "Số frame ngắn nhất của một trận mưa (60 frame ≈ 1 giây).",
    unit: "frame",
    min: 60,
    max: 2000,
    step: 30,
  },
  {
    key: "rainMaxDurationFrames",
    label: "Thời lượng mưa tối đa",
    description:
      "Số frame dài nhất một trận mưa có thể kéo dài. Phải ≥ thời lượng tối thiểu.",
    unit: "frame",
    min: 60,
    max: 4000,
    step: 30,
  },
  {
    key: "rainDropCount",
    label: "Số hạt mưa trên màn hình",
    description:
      "Mật độ hạt mưa cùng lúc. Càng cao càng nặng máy yếu, mặc định 80 là hợp lý.",
    unit: "hạt",
    min: 0,
    max: 300,
    step: 5,
  },
  {
    key: "wetDurationFrames",
    label: "Thời gian chim còn ướt",
    description:
      "Sau khi mưa tạnh, chim vẫn còn nặng thêm bao nhiêu frame này nữa rồi mới khô lại.",
    unit: "frame",
    min: 0,
    max: 1200,
    step: 30,
  },
  {
    key: "wetGravityMultiplier",
    label: "Hệ số trọng lực khi ướt",
    description:
      "Trọng lực sẽ được nhân hệ số này khi chim đang ướt. 1.0 = bình thường, 1.6 = nặng gấp rưỡi.",
    min: 1.0,
    max: 3.0,
    step: 0.05,
  },
  {
    key: "lightningChancePer10k",
    label: "Tần suất sấm chớp",
    description:
      "Xác suất chớp + tiếng sấm mỗi frame khi đang mưa, tính trên 10000.",
    unit: "/10k",
    min: 0,
    max: 500,
    step: 1,
  },
];

const SHELL_GAME_FIELDS: FieldSpec[] = [
  {
    key: "initialLives",
    label: "Số mạng ban đầu",
    description: "Số lượt đoán sai tối đa trước khi Game Over.",
    unit: "mạng",
    min: 1,
    max: 9,
    step: 1,
  },
  {
    key: "revealDurationMs",
    label: "Thời gian hé lộ bóng",
    description: "Bao lâu cốc nhấc lên để học sinh thấy bóng trước khi úp lại.",
    unit: "ms",
    min: 500,
    max: 4000,
    step: 100,
  },
  {
    key: "coverDurationMs",
    label: "Thời gian úp cốc",
    description: "Bao lâu cốc úp xuống trước khi bắt đầu tráo.",
    unit: "ms",
    min: 200,
    max: 3000,
    step: 100,
  },
  {
    key: "baseShufflesCount",
    label: "Số lần tráo ban đầu",
    description: "Số lần đảo cốc ở Cấp 1.",
    unit: "lần",
    min: 1,
    max: 15,
    step: 1,
  },
  {
    key: "baseSpeedMs",
    label: "Tốc độ tráo ban đầu",
    description: "Thời gian giữa hai lần đảo ở Cấp 1. Càng nhỏ càng nhanh.",
    unit: "ms",
    min: 150,
    max: 2000,
    step: 50,
  },
  {
    key: "shufflesPerLevel",
    label: "Số lần tráo cộng thêm mỗi cấp",
    description: "Mỗi lần lên cấp, số lần đảo cốc tăng thêm bao nhiêu.",
    unit: "lần",
    min: 0,
    max: 5,
    step: 1,
  },
  {
    key: "speedDecreasePerLevel",
    label: "Giảm tốc độ mỗi cấp",
    description:
      "Mỗi lần lên cấp, thời gian giữa hai lần đảo giảm bao nhiêu (game nhanh hơn).",
    unit: "ms",
    min: 0,
    max: 200,
    step: 10,
  },
  {
    key: "maxShuffles",
    label: "Giới hạn số lần tráo",
    description: "Trần số lần đảo cốc dù lên cấp bao nhiêu cũng không vượt.",
    unit: "lần",
    min: 5,
    max: 80,
    step: 1,
  },
  {
    key: "minSpeedMs",
    label: "Tốc độ tráo tối thiểu",
    description:
      "Sàn thời gian giữa hai lần đảo. Càng nhỏ thì game cấp cao càng khắc nghiệt.",
    unit: "ms",
    min: 50,
    max: 500,
    step: 10,
  },
];

const SKY_HIGH_FIELDS: FieldSpec[] = [
  {
    key: "maxSwingAngle",
    label: "Góc đung đưa tối đa",
    description:
      "Biên độ con lắc treo vali (radian). Càng lớn vali càng quét xa hơn, khó canh hơn.",
    unit: "rad",
    min: 0.3,
    max: 1.2,
    step: 0.05,
  },
  {
    key: "dropGravity",
    label: "Gia tốc rơi",
    description:
      "Gia tốc trọng trường tác động lên vali đang rơi. Càng lớn vali càng rơi nhanh.",
    unit: "px/frame²",
    min: 0.02,
    max: 0.1,
    step: 0.005,
  },
  {
    key: "perfectThreshold",
    label: "Ngưỡng thả hoàn hảo",
    description:
      "Khoảng cách lệch tối đa (pixel) để được tính là cú thả Perfect và bonus combo.",
    unit: "px",
    min: 3,
    max: 20,
    step: 0.5,
  },
  {
    key: "windCooldownMinFrames",
    label: "Thời gian nghỉ giữa các đợt gió",
    description:
      "Số frame tối thiểu sau khi gió tắt trước khi đợt gió mới bắt đầu.",
    unit: "frame",
    min: 100,
    max: 1500,
    step: 50,
  },
  {
    key: "windDurationMinFrames",
    label: "Thời lượng gió tối thiểu",
    description: "Số frame tối thiểu mỗi đợt gió thổi liên tục.",
    unit: "frame",
    min: 60,
    max: 1000,
    step: 30,
  },
  {
    key: "birdSpawnRatePer10k",
    label: "Tần suất xuất hiện chim Pierre",
    description:
      "Xác suất Pierre xuất hiện mỗi frame, tính trên 10000. Càng cao càng dễ va chạm.",
    unit: "/10k",
    min: 0,
    max: 200,
    step: 1,
  },
];

const CARO_FIELDS: FieldSpec[] = [
  {
    key: "boardSize",
    label: "Kích thước bàn cờ",
    description:
      "Số ô mỗi cạnh bàn cờ vuông. Truyền thống Việt Nam dùng 15×15.",
    unit: "ô",
    min: 9,
    max: 19,
    step: 1,
  },
  {
    key: "winLength",
    label: "Số ô liên tiếp để thắng",
    description:
      "Cần xếp bao nhiêu quân liên tiếp (ngang/dọc/chéo) để chiến thắng.",
    unit: "ô",
    min: 3,
    max: 6,
    step: 1,
  },
  {
    key: "aiThinkMinMs",
    label: "Tốc độ suy nghĩ tối thiểu (máy)",
    description:
      "Thời gian tối thiểu máy chờ trước khi đặt quân. Tạo cảm giác bút thật.",
    unit: "ms",
    min: 0,
    max: 2000,
    step: 50,
  },
  {
    key: "aiThinkMaxMs",
    label: "Tốc độ suy nghĩ tối đa (máy)",
    description:
      "Thời gian tối đa máy chờ. Phải lớn hơn hoặc bằng thời gian tối thiểu.",
    unit: "ms",
    min: 0,
    max: 3000,
    step: 50,
  },
  {
    key: "easyTopKMoves",
    label: "Top-K nước mở (Dễ)",
    description:
      "Ở cấp Dễ, máy có thể chọn ngẫu nhiên 1 trong K nước tốt nhất thay vì nước tối ưu.",
    unit: "nước",
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: "easyRandomChancePct",
    label: "Xác suất chơi ngẫu nhiên (Dễ)",
    description:
      "Cấp Dễ: tỷ lệ % máy chọn ngẫu nhiên trong Top-K. Còn lại chọn nước tốt nhất.",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: "mediumTopKMoves",
    label: "Top-K nước mở (Vừa)",
    description:
      "Tương tự cho cấp Vừa: số nước trong top để máy có thể chọn ngẫu nhiên.",
    unit: "nước",
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: "mediumRandomChancePct",
    label: "Xác suất chơi ngẫu nhiên (Vừa)",
    description:
      "Cấp Vừa: tỷ lệ % máy đi nước \"hơi yếu\" để vẫn tạo cảm giác thử thách dễ chịu.",
    unit: "%",
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: "historyMaxRecords",
    label: "Số trận lưu nhật ký",
    description:
      "Số trận tối đa hiển thị trong bảng \"Nhật Ký Học Tập\" dưới bàn cờ.",
    unit: "trận",
    min: 1,
    max: 50,
    step: 1,
  },
];

const GAME_TABS: { id: GameId; label: string; fields: FieldSpec[] }[] = [
  {
    id: "flappy-bird",
    label: GAME_LABEL["flappy-bird"],
    fields: FLAPPY_BIRD_FIELDS,
  },
  {
    id: "shell-game",
    label: GAME_LABEL["shell-game"],
    fields: SHELL_GAME_FIELDS,
  },
  {
    id: "caro",
    label: GAME_LABEL["caro"],
    fields: CARO_FIELDS,
  },
  {
    id: "sky-high",
    label: GAME_LABEL["sky-high"],
    fields: SKY_HIGH_FIELDS,
  },
];

const round = (value: number, step: number): number => {
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
};

export default function AdminGames() {
  const [activeGame, setActiveGame] = useState<GameId>("flappy-bird");
  const activeTab = useMemo(
    () => GAME_TABS.find((t) => t.id === activeGame) ?? GAME_TABS[0],
    [activeGame]
  );

  const defaults = DEFAULT_GAME_SETTINGS[activeGame];
  const { data: serverSettings, isLoading } = useGameSettings(activeGame);
  const updateMutation = useUpdateGameSettings(activeGame);

  const [draft, setDraft] = useState<GameSettings>(defaults);

  // Khi đổi tab game, reset draft về defaults / serverSettings của game đó.
  useEffect(() => {
    setDraft(serverSettings ?? defaults);
  }, [activeGame, serverSettings, defaults]);

  // Merge defaults để input luôn controlled (tránh draft thiếu key khi vừa đổi tab).
  const formValues = useMemo(
    () => ({ ...defaults, ...draft }),
    [defaults, draft]
  );

  const isDirty = useMemo(() => {
    const base = serverSettings ?? defaults;
    return activeTab.fields.some((f) => formValues[f.key] !== base[f.key]);
  }, [formValues, serverSettings, defaults, activeTab]);

  const handleChange = (key: string, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setDraft(defaults);
  };

  const handleSave = () => {
    updateMutation.mutate(formValues);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-4 sm:px-4 sm:py-5">
      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="mb-4 flex flex-col gap-1"
      >
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          Cấu hình game
        </h1>
        <p className="text-xs sm:text-sm text-gray-500">
          Thông số chơi được lưu trên Firestore. Học sinh sẽ nhận thay đổi ngay
          lần chơi kế tiếp.
        </p>
      </motion.header>

      {GAME_TABS.length > 1 && (
        <div className="mb-4 p-1 rounded-xl bg-gray-100">
          <div className="flex gap-1">
            {GAME_TABS.map(({ id, label }) => {
              const isActive = activeGame === id;
              return (
                <div key={id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => setActiveGame(id)}
                    className={`w-full text-center py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-white text-primary shadow-sm"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-800">
            {activeTab.label}
          </h2>
          {isLoading && (
            <span className="text-xs text-gray-400">Đang tải...</span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {activeTab.fields.map((field) => {
            const value = formValues[field.key];
            const defaultValue = defaults[field.key];
            const isChanged = value !== defaultValue;

            return (
              <div
                key={field.key}
                className="rounded-lg border border-gray-200 bg-gray-50/50 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-1 mb-1.5">
                  <label
                    htmlFor={`field-${field.key}`}
                    className="text-sm font-semibold text-gray-800"
                  >
                    {field.label}
                  </label>
                  <span className="text-xs text-gray-400">
                    Mặc định:{" "}
                    <span className="font-mono">{defaultValue}</span>
                    {field.unit ? ` ${field.unit}` : ""}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {field.description}
                </p>

                <div className="flex items-center gap-3">
                  <input
                    id={`field-${field.key}-range`}
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={value}
                    onChange={(e) =>
                      handleChange(
                        field.key,
                        round(Number(e.target.value), field.step)
                      )
                    }
                    className="flex-1 accent-primary"
                  />
                  <input
                    id={`field-${field.key}`}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={value}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next)) handleChange(field.key, next);
                    }}
                    className={`w-24 rounded-md border px-2 py-1.5 text-sm font-mono ${
                      isChanged
                        ? "border-primary/60 bg-primary/5"
                        : "border-gray-300 bg-white"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={updateMutation.isPending}
            className="inline-flex items-center gap-2"
          >
            <FiRefreshCw className="h-4 w-4" />
            Khôi phục mặc định
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="inline-flex items-center gap-2"
          >
            <FiSave className="h-4 w-4" />
            {updateMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </div>
    </div>
  );
}
