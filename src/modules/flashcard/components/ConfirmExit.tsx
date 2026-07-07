import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface ConfirmExitProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmExit = ({ open, onClose, onConfirm }: ConfirmExitProps) => {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Xác nhận"
      maxWidth="md"
    >
      <div className="space-y-4">
        <p className="text-gray-700">
          Bạn có chắc chắn muốn Kết thúc?
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            Kết thúc
          </Button>
        </div>
      </div>
    </Modal>
  );
};
