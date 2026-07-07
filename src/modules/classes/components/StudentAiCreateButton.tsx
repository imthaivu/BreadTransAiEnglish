"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CreateSpeakingModal } from "@/modules/ai/components/CreateSpeakingModal";
import { CreateWritingModal } from "@/modules/ai/components/CreateWritingModal";
import {
  createSpeakingItem,
  generateText,
  ocrImage,
  saveWritingItem,
} from "@/modules/ai/services";
import { useState } from "react";
import toast from "react-hot-toast";
import { FiCpu, FiEdit3, FiMic } from "react-icons/fi";

type StudentAiCreateButtonProps = {
  studentId: string;
  studentName: string;
  classId: string;
};

export function StudentAiCreateButton({
  studentId,
  studentName,
  classId,
}: StudentAiCreateButtonProps) {
  const [chooserOpen, setChooserOpen] = useState(false);
  const [speakingOpen, setSpeakingOpen] = useState(false);
  const [writingOpen, setWritingOpen] = useState(false);

  const target = { targetUserId: studentId, classId };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        type="button"
        title={`Tạo bài AI cho ${studentName}`}
        aria-label={`Tạo bài AI cho ${studentName}`}
        className="h-7 w-7 p-0 min-w-0 shrink-0 hover:bg-violet-50 dark:hover:bg-violet-900/20"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setChooserOpen(true);
        }}
      >
        <FiCpu className="h-3.5 w-3.5 text-violet-600" />
      </Button>

      <Modal
        open={chooserOpen}
        onClose={() => setChooserOpen(false)}
        title="Tạo bài bằng AI"
        subtitle={`Cho học sinh: ${studentName}`}
        maxWidth="sm"
      >
        <div className="flex flex-col gap-3 py-1">
          <Button
            type="button"
            variant="primary"
            className="inline-flex items-center justify-center gap-2"
            onClick={() => {
              setChooserOpen(false);
              setSpeakingOpen(true);
            }}
          >
            <FiMic className="h-4 w-4" />
            Tạo bài nói
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="inline-flex items-center justify-center gap-2"
            onClick={() => {
              setChooserOpen(false);
              setWritingOpen(true);
            }}
          >
            <FiEdit3 className="h-4 w-4" />
            Tạo bài viết
          </Button>
        </div>
      </Modal>

      <CreateSpeakingModal
        open={speakingOpen}
        onClose={() => setSpeakingOpen(false)}
        canCreate
        onCreate={async (params) => {
          const item = await createSpeakingItem({ ...params, ...target });
          toast.success(`Đã tạo bài nói cho ${studentName}.`);
          return item;
        }}
        onOcr={(mimeType, base64) => ocrImage({ mimeType, base64, ...target })}
        onGenerateText={(params) => generateText({ ...params, ...target })}
      />

      <CreateWritingModal
        open={writingOpen}
        onClose={() => setWritingOpen(false)}
        canCreate
        onSave={async (params) => {
          const item = await saveWritingItem({ ...params, ...target });
          toast.success(`Đã tạo bài viết cho ${studentName}.`);
          return item;
        }}
        onOcr={(mimeType, base64) => ocrImage({ mimeType, base64, ...target })}
        onGenerateText={(params) => generateText({ ...params, ...target })}
      />
    </>
  );
}
