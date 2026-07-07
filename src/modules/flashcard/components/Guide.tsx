"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useState } from "react";

export const Guide = () => {
  const [showGuideModal, setShowGuideModal] = useState(false);

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
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            Chọn <strong>sách</strong> và <strong>bài</strong>, rồi bấm{" "}
            <strong>Test</strong> hoặc <strong>Ôn</strong> để học.
          </p>

          <div>
            <p className="font-semibold mb-1">Danh sách từ</p>
            <p>
              Nhấn từ để nghe phát âm. Tab <strong>Vocabs</strong> /{" "}
              <strong>Script</strong> đổi giữa từ vựng và bài đọc. Bật{" "}
              <strong>Ảnh</strong> để xem minh họa.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">Ôn</p>
            <p>
              Lật thẻ xem nghĩa. Kéo{" "}
              <strong className="text-green-600">phải</strong> = biết,{" "}
              <strong className="text-red-600">trái</strong> = chưa biết. Phím{" "}
              <kbd className="px-1 py-0.5 text-xs bg-gray-100 border rounded">→</kbd>{" "}
              /{" "}
              <kbd className="px-1 py-0.5 text-xs bg-gray-100 border rounded">←</kbd>.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">Test (5 vòng)</p>
            <p>
              Ghép cặp → Ghép câu → Trắc nghiệm → Ráp câu Việt → Ráp câu Anh.
              Trả lời sai sẽ lưu từ cần ôn; trả lời đúng giảm dần. Trên 10 từ
              cần ôn, hệ thống ưu tiên ôn lại trước.
            </p>
          </div>

          <div className="pt-2 text-right">
            <Button onClick={() => setShowGuideModal(false)}>Đã hiểu</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
