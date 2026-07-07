import { Modal } from "@/components/ui/Modal";
import { ReviewWord } from "../types";
import { Button } from "@/components/ui/Button";

interface ReviewWordsModalProps {
  open: boolean;
  onClose: () => void;
  reviewWords: ReviewWord[];
  onSpeak?: (text: string) => void;
}

export const ReviewWordsModal = ({
  open,
  onClose,
  reviewWords,
}: ReviewWordsModalProps) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Các từ cần ôn (${reviewWords.length})`}
      maxWidth="lg"
    >
      <div className="max-h-[60vh] overflow-y-auto">
        {reviewWords.length > 0 ? (
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Từ
                </th>
                <th scope="col" className="px-4 py-3">
                  IPA
                </th>
                <th scope="col" className="px-4 py-3">
                  Nghĩa
                </th>
                <th scope="col" className="px-4 py-3 text-center">
                  Số lần
                </th>
              </tr>
            </thead>
            <tbody>
              {reviewWords.map((word) => (
                <tr key={word.word} className="bg-white border-b">
                  <td
                    scope="row"
                    className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap"
                  >
                    {word.word}
                  </td>
                  <td className="px-4 py-3">{word.ipa}</td>
                  <td className="px-4 py-3">{word.mean}</td>
                  <td className="px-4 py-3 text-center font-bold text-gray-900">
                    {word.needReview}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-center text-gray-500 py-8">
            🎉 Chúc mừng! Bạn không có từ nào cần ôn lại.
          </p>
        )}
      </div>
      <div className="pt-4 text-right">
        <Button onClick={onClose}>Đóng</Button>
      </div>
    </Modal>
  );
};
