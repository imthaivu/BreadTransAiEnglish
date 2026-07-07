import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { controlStyles } from "@/styles/control-styles";
import { useEffect } from "react";

interface Book {
  value: string;
  label: string;
}

interface FlashcardControlsProps {
  isPlaying: boolean;
  selectedBook: string | null;
  setSelectedBook: (bookId: string) => void;
  booksList: Book[];
  onShowLessonModal: () => void;
  selectedLessons: number[];
  onStartQuiz: () => void;
  onStartFlashcard: () => void;
}

const FLASHCARD_LAST_BOOK_KEY = "flashcard_lastSelectedBook";

const canStart = (
  isPlaying: boolean,
  selectedBook: string | null,
  selectedLessons: number[]
) => !isPlaying && !!selectedBook && selectedLessons.length > 0;

const startButtonClass = `${controlStyles.base} ${controlStyles.button} w-full whitespace-nowrap`;

export const FlashcardControls = ({
  isPlaying,
  selectedBook,
  setSelectedBook,
  booksList,
  onShowLessonModal,
  selectedLessons,
  onStartQuiz,
  onStartFlashcard,
}: FlashcardControlsProps) => {
  const startEnabled = canStart(isPlaying, selectedBook, selectedLessons);

  // Load saved book from localStorage on mount
  useEffect(() => {
    if (!selectedBook && booksList.length > 0) {
      const savedBook = localStorage.getItem(FLASHCARD_LAST_BOOK_KEY);
      if (savedBook) {
        const bookExists = booksList.some((book) => book.value === savedBook);
        if (bookExists) {
          setSelectedBook(savedBook);
        }
      }
    }
  }, [booksList, selectedBook, setSelectedBook]);

  // Save selected book to localStorage when it changes
  useEffect(() => {
    if (selectedBook) {
      localStorage.setItem(FLASHCARD_LAST_BOOK_KEY, selectedBook);
    }
  }, [selectedBook]);

  return (
    <Card className="border-none shadow-none">
      <div className="grid grid-cols-2 gap-2 md:grid md:grid-cols-4 md:gap-4 md:items-stretch">
        {/* Book Selection */}
        <div className="flex items-center min-w-0">
          <select
            value={selectedBook || ""}
            onChange={(e) => setSelectedBook(e.target.value)}
            className={`${controlStyles.base} ${controlStyles.select}`}
            disabled={isPlaying}
          >
            <option value="">Chọn sách</option>
            {booksList.map((book) => (
              <option key={book.value} value={book.value}>
                {book.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lesson Selection */}
        <div className="flex items-center min-w-0">
          <Button
            onClick={onShowLessonModal}
            variant="outline"
            className={`${controlStyles.button} ${controlStyles.base}`}
            disabled={isPlaying || !selectedBook}
          >
            {selectedLessons.length > 0
              ? `${selectedLessons.length} bài`
              : "Chọn bài"}
          </Button>
        </div>

        {/* Quiz + Flashcard — cùng nhóm, chia đều 50/50 */}
        <div className="col-span-2 grid grid-cols-2 gap-2 min-w-0">
          <Button
            onClick={onStartQuiz}
            variant="primary"
            className={startButtonClass}
            disabled={!startEnabled}
          >
            Quiz
          </Button>
          <Button
            onClick={onStartFlashcard}
            variant="primary"
            className={startButtonClass}
            disabled={!startEnabled}
          >
            Flashcard
          </Button>
        </div>
      </div>
    </Card>
  );
};
