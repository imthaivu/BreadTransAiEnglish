import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface StatusDisplayProps {
  isLoading: boolean;
  booksError: Error | null;
  lessonWordsError: Error | null;
}

export const StatusDisplay = ({
  isLoading,
  booksError,
  lessonWordsError,
}: StatusDisplayProps) => {
  if (isLoading) {
    return (
      <Card className="p-4 mb-4 sm:p-6 sm:mb-6">
        <div className="text-center">
          <div className="text-blue-600 text-4xl mb-2">⏳</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Đang tải dữ liệu...
          </h3>
          <p className="text-gray-600">Vui lòng chờ trong giây lát</p>
        </div>
      </Card>
    );
  }

  if (booksError) {
    return (
      <Card className="p-4 mb-4 sm:p-6 sm:mb-6 border-red-200 bg-red-50">
        <div className="text-center">
          <div className="text-red-600 text-4xl mb-2">❌</div>
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Lỗi tải dữ liệu sách
          </h3>
          <p className="text-red-600 mb-4">
            {booksError.message || "Không thể tải danh sách sách"}
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            Thử lại
          </Button>
        </div>
      </Card>
    );
  }

  if (lessonWordsError) {
    return (
      <Card className="p-4 mb-4 sm:p-6 sm:mb-6 border-red-200 bg-red-50">
        <div className="text-center">
          <div className="text-red-600 text-4xl mb-2">❌</div>
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Lỗi tải từ vựng
          </h3>
          <p className="text-red-600 mb-4">
            {lessonWordsError.message || "Không thể tải từ vựng của lesson"}
          </p>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            Thử lại
          </Button>
        </div>
      </Card>
    );
  }

  return null;
};
