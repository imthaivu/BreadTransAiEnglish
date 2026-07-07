"use client";

import { FaPlaneDeparture, FaWind } from "react-icons/fa";
import { FiAlertTriangle, FiClock, FiCompass, FiPlay, FiZap } from "react-icons/fi";

import { SKY_HIGH_KO_SCORE_GAP } from "../types";

interface HowToPlayProps {
  onStartGame: () => void;
}

const STEPS = [
  {
    icon: <FiCompass className="w-4 h-4 text-sky-500" />,
    title: "Xếp chồng vali",
    desc: "Nhấp màn hình hoặc nhấn Space để thả vali xuống đúng tâm.",
  },
  {
    icon: <FaWind className="w-4 h-4 text-amber-500" />,
    title: "Gió ngược chiều",
    desc: "Càng lên cao gió càng mạnh, làm lệch hướng vali đang rơi.",
  },
  {
    icon: <FaPlaneDeparture className="w-4 h-4 text-rose-500" />,
    title: "Tránh chim Pierre",
    desc: "Nếu vali va trúng Pierre sẽ bị hất văng mất kiểm soát.",
  },
  {
    icon: <FiAlertTriangle className="w-4 h-4 text-emerald-600" />,
    title: "Giữ thăng bằng",
    desc: "Thả thẳng tâm để Perfect và giảm độ nghiêng của tháp.",
  },
  {
    icon: <FiClock className="w-4 h-4 text-rose-500" />,
    title: "15 giây mỗi lượt thả",
    desc: "Phải thả vali trong 15 giây — hết giờ là thua lượt (tháp sập).",
  },
  {
    icon: <FiZap className="w-4 h-4 text-amber-500" />,
    title: "Knockout (đấu solo)",
    desc: `Dẫn đối thủ ${SKY_HIGH_KO_SCORE_GAP} vali hoặc đối thủ hết giờ thả → thắng ngay.`,
  },
];

export default function HowToPlay({ onStartGame }: HowToPlayProps) {
  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl p-5 shadow-sm border border-slate-200 font-sans text-slate-900">
      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">
        Cách chơi
      </h2>

      <ul className="space-y-2">
        {STEPS.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100"
          >
            <div className="mt-0.5 shrink-0">{step.icon}</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                {step.title}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {step.desc}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStartGame}
        className="mt-5 w-full py-3 bg-amber-400 hover:bg-amber-500 text-slate-900 font-black rounded-xl transition-colors flex items-center justify-center gap-2 text-sm uppercase tracking-wide shadow-sm"
      >
        <FiPlay className="w-4 h-4 fill-current" />
        Bắt đầu
      </button>
    </div>
  );
}
