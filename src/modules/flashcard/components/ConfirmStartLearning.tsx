import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface ConfirmStartLearningProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (showImage?: boolean) => void;
  mode: "flashcard" | "quiz";
}

export const ConfirmStartLearning = ({
  open,
  onClose,
  onConfirm,
  mode,
}: ConfirmStartLearningProps) => {
  const isFlashcardMode = mode === "flashcard";

  const handleConfirm = (showImage?: boolean) => {
    onConfirm(showImage);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isFlashcardMode ? "Xác nhận bắt đầu Flashcard" : "Xác nhận bắt đầu Quiz"}
      maxWidth="md"
      closeOnOverlayClick={false}
    >
      <div className="space-y-4">
        <p className="text-gray-700">
          {isFlashcardMode
            ? "Flashcard chỉ giúp ôn từ / phát âm mẫu, Không nên học từ mới qua Flashcard nhé. Hãy học từ mới qua bài đọc tiếng anh mỗi ngày ."
            : "Tôi đã đọc bài kĩ, và phát âm chuẩn bài này rồi."}
        </p>
        
        {isFlashcardMode && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 italic">
              * Lưu ý: Hình ảnh có thể gây chậm, nhưng dễ hình dung nghĩa hơn
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="bg-primary text-white w-full"
                onClick={() => handleConfirm(true)}
              >
                Flashcard có hình
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handleConfirm(false)}
              >
                Flashcard không hình
              </Button>
            </div>
          </div>
        )}

        {!isFlashcardMode && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              className="bg-primary text-white "
              onClick={() => handleConfirm()}
            >
              Xác nhận
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};

