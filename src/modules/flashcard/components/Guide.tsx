"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useState } from "react";

export const Guide = () => {
  const [showGuideModal, setShowGuideModal] = useState(false);

  const gradeMaps = [
    { label: "Lớp 6", startValue: 1, count: 7 },
    { label: "Lớp 7", startValue: 8, count: 7 },
    { label: "Lớp 8", startValue: 15, count: 7 },
    { label: "Lớp 9", startValue: 22, count: 7 },
    { label: "Lớp 10", startValue: 29, count: 9 },
    { label: "Lớp 11", startValue: 38, count: 9 },
    { label: "Lớp 12", startValue: 47, count: 9 },
  ];

  const maxUnitCount = Math.max(...gradeMaps.map((g) => g.count));

  return (
    <>
      <div className="text-center md:py-2">
        <Button
          variant="ghost"
          onClick={() => setShowGuideModal(true)}
          className="text-blue-600 hover:text-blue-800"
        >
          <span className="mr-2">💡</span>
          Xem hướng dẫn
        </Button>
      </div>

      <Modal
        open={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        title="Hướng dẫn sử dụng"
      >
        <div className="space-y-4 text-gray-700">
          <div>
            <h4 className="font-semibold text-lg mb-2">Bắt đầu</h4>
            <p className="text-sm">
              Chọn sách, chọn bài học, chọn chế độ và bắt đầu học.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-lg mb-2">🃏 Flashcard</h4>
            <p className="text-sm mb-2">
              Nhấp vào thẻ để xem nghĩa. Kéo sang{" "}
              <strong className="text-green-600">phải</strong> nếu biết, sang{" "}
              <strong className="text-red-600">trái</strong> nếu chưa biết.
            </p>
            <p className="text-sm text-gray-600">
              Phím tắt: <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">←</kbd>{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">→</kbd>
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-lg mb-2">🧠 Trắc nghiệm</h4>
            <p className="text-sm mb-2">
              Chọn câu trả lời đúng trước khi hết thời gian.
            </p>
            <strong>Sách giáo khoa Right On - Bright:</strong>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border border-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border border-gray-200 px-2 py-1 text-left">
                      .
                    </th>
                    {gradeMaps.map((grade) => (
                      <th
                        key={grade.label}
                        className="border border-gray-200 px-2 py-1 text-left"
                      >
                        {grade.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxUnitCount }).map((_, idx) => (
                    <tr key={`unit-${idx}`}>
                      <td className="border border-gray-200 px-2 py-1 font-medium">
                        Unit {idx}
                      </td>
                      {gradeMaps.map((grade) => {
                        const value =
                          idx < grade.count ? grade.startValue + idx : null;
                        return (
                          <td
                            key={`${grade.label}-unit-${idx}`}
                            className="border border-gray-200 px-2 py-1"
                          >
                            {value ?? "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-2 sm:pt-4 text-right">
            <Button onClick={() => setShowGuideModal(false)}>Đã hiểu</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
