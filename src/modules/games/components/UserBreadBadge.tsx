"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { useEffect, useMemo, useState } from "react";
import { MdQrCode2 } from "react-icons/md";
import toast from "react-hot-toast";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/auth/context";
import { getDb } from "@/lib/firebase/client";
import { collectValidTickets } from "@/lib/games/ticket-utils";
import { formatRemainingTime } from "@/utils/presenceRelativeTime";
import { buildVietQrImageUrl, findBankFromInitial } from "@/lib/vietqr/client";
import { useVietQrBanks } from "@/lib/vietqr/useVietQrBanks";
import type { VietQrBank } from "@/lib/vietqr/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { BankPicker } from "./BankPicker";

interface UserBreadBadgeProps {
  /** Variant phối màu: dùng "dark" cho overlay sáng/canvas, "light" cho nền tối */
  variant?: "dark" | "light";
  className?: string;
  /** Chỉ hiển thị một phần: "ticket" (vé) hoặc "bread" (bánh). Mặc định cả hai. */
  only?: "ticket" | "bread";
}

/**
 * Badge hiển thị số bánh mì và/hoặc số vé game của user đang đăng nhập.
 * Dùng overlay góc các game / hub game. Ẩn khi chưa đăng nhập.
 */
export function UserBreadBadge({
  variant = "dark",
  className = "",
  only,
}: UserBreadBadgeProps) {
  const { profile } = useAuth();
  const [bankOpen, setBankOpen] = useState(false);
  if (!profile) return null;

  const total = profile.totalBanhRan ?? 0;
  // 100 bánh = 15k → 1 bánh = 0.15k
  const moneyK = Number((total * 0.15).toFixed(1));
  const tickets = collectValidTickets(profile);
  const ticketCount = tickets.length;
  const nextExpiresAt = tickets[0]?.expiresAt ?? null;
  const ticketRemaining = nextExpiresAt ? formatRemainingTime(nextExpiresAt) : null;

  // Vé chỉ hiện ở hub (only="ticket"); khi vào game không mang theo vé.
  const showTicket = only === "ticket" && ticketCount > 0;
  const showBread = only !== "ticket";
  // Chỉ hub game (only="bread") mới hiện đầy đủ tiền + nút ngân hàng.
  // Khi vào game thực tế (mặc định) chỉ mang theo số lượng bánh.
  const showRewardDetails = only === "bread";

  // Khi chỉ có vé mà người dùng chưa có vé nào → không render gì.
  if (only === "ticket" && !showTicket) return null;

  const palette =
    variant === "light"
      ? "bg-white/90 border-slate-200 text-slate-900"
      : "bg-slate-950/75 border-white/10 text-white";

  const ticketPalette =
    variant === "light"
      ? "bg-amber-100 text-amber-800 ring-amber-200"
      : "bg-amber-500/20 text-amber-200 ring-amber-400/30";

  const compact = showRewardDetails;

  const compactText = "text-[11px] font-semibold tabular-nums";

  const breadContent = showBread && (
    <span className={`inline-flex items-center leading-none ${compact ? "gap-1" : "gap-1.5"}`}>
      <Image
        src="/assets/images/dorayaki.png"
        alt="Bánh mì"
        width={compact ? 14 : 18}
        height={compact ? 14 : 18}
        className="drop-shadow-sm"
      />
      <span
        className={
          compact ? compactText : "font-extrabold tabular-nums text-xs sm:text-sm"
        }
      >
        {total}
      </span>
      {showRewardDetails && (
        <>
          <span className="opacity-30">·</span>
          <span className={`${compactText} text-emerald-500`}>{moneyK}k</span>
        </>
      )}
    </span>
  );

  const hubHover =
    variant === "light"
      ? "cursor-pointer hover:bg-slate-50"
      : "cursor-pointer hover:bg-white/10";

  const hubBadge = (
    <button
      type="button"
      onClick={() => setBankOpen(true)}
      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 shadow-sm backdrop-blur-sm transition-colors ${palette} ${hubHover} ${className}`}
      title="Ngân hàng nhận tiền"
      aria-label={`Bạn có ${total} bánh — bấm xem ngân hàng`}
    >
      {breadContent}
      <MdQrCode2 className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
    </button>
  );

  const staticBadge = (
    <div
      className={`inline-flex items-center rounded-full border shadow-sm backdrop-blur-sm select-none pointer-events-none gap-2 px-2.5 py-1.5 shadow-md ${palette} ${className}`}
      aria-label={`Bạn có ${total} bánh mì và ${ticketCount} vé game`}
    >
      {showTicket && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ring-1 ${ticketPalette}`}
          title={ticketRemaining ? `Vé sớm nhất hết hạn ${ticketRemaining}` : undefined}
        >
          {ticketCount} Vé
          {ticketRemaining && (
            <span className="font-semibold opacity-80">· {ticketRemaining}</span>
          )}
        </span>
      )}
      {breadContent}
    </div>
  );

  return (
    <>
      {compact ? hubBadge : staticBadge}

      {bankOpen && (
        <BankInfoModal
          open={bankOpen}
          onClose={() => setBankOpen(false)}
          uid={profile.uid}
          initial={{
            bankQrUrl: profile.bankQrUrl,
            bankName: profile.bankName,
            bankBin: profile.bankBin,
            bankAccountNumber: profile.bankAccountNumber,
            bankAccountName: profile.bankAccountName,
          }}
        />
      )}
    </>
  );
}

type BankInfoModalProps = {
  open: boolean;
  onClose: () => void;
  uid: string;
  initial: {
    bankQrUrl?: string;
    bankName?: string;
    bankBin?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
  };
};

function BankInfoModal({ open, onClose, uid, initial }: BankInfoModalProps) {
  const { refetchProfile } = useAuth();
  const { data: banks = [], isLoading: banksLoading, isError: banksError } = useVietQrBanks(open);

  const [selectedBank, setSelectedBank] = useState<VietQrBank | null>(null);
  const [accountNumber, setAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [accountName, setAccountName] = useState(initial.bankAccountName ?? "");
  const [saving, setSaving] = useState(false);
  const [debouncedPreview, setDebouncedPreview] = useState("");

  useEffect(() => {
    if (!open || !banks.length) return;
    const matched = findBankFromInitial(banks, {
      bankBin: initial.bankBin,
      bankName: initial.bankName,
    });
    setSelectedBank(matched);
    setAccountNumber(initial.bankAccountNumber ?? "");
    setAccountName(initial.bankAccountName ?? "");
  }, [open, banks, initial.bankBin, initial.bankName, initial.bankAccountNumber, initial.bankAccountName]);

  const previewUrl = useMemo(() => {
    if (!selectedBank || !accountNumber.trim()) return "";
    return buildVietQrImageUrl({
      bin: selectedBank.bin,
      accountNo: accountNumber.trim(),
      accountName: accountName.trim() || undefined,
    });
  }, [selectedBank, accountNumber, accountName]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPreview(previewUrl), 300);
    return () => clearTimeout(t);
  }, [previewUrl]);

  const canSave = !!selectedBank && !!accountNumber.trim() && !!previewUrl;

  async function handleSave() {
    if (!selectedBank || !previewUrl) return;
    setSaving(true);
    const toastId = toast.loading("Đang lưu thông tin...");
    try {
      await updateDoc(doc(getDb(), "users", uid), {
        bankQrUrl: previewUrl,
        bankName: selectedBank.shortName,
        bankBin: selectedBank.bin,
        bankAccountNumber: accountNumber.trim(),
        bankAccountName: accountName.trim().toUpperCase(),
      });

      refetchProfile();
      toast.success("Đã lưu thông tin ngân hàng", { id: toastId });
      onClose();
    } catch (error) {
      console.error("[BankInfo] save failed:", error);
      toast.error("Lưu thất bại, vui lòng thử lại", { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ngân hàng nhận tiền" maxWidth="sm">
      <div className="space-y-4 p-2 sm:p-4">
        {banksError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Không tải được danh sách ngân hàng. Vui lòng thử lại sau.
          </p>
        )}

        <BankPicker
          banks={banks}
          value={selectedBank}
          onChange={setSelectedBank}
          loading={banksLoading}
          disabled={banksError}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Số tài khoản</label>
          <input
            type="text"
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Nhập số tài khoản"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tên người nhận</label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="VD: NGUYEN VAN A"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-primary focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="relative flex h-52 w-52 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
            {debouncedPreview ? (
              <Image
                src={debouncedPreview}
                alt="Mã QR chuyển khoản"
                fill
                sizes="208px"
                unoptimized
                className="object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 px-4 text-center text-slate-400">
                <MdQrCode2 className="h-10 w-10" />
                <span className="text-xs font-medium">
                  {selectedBank && accountNumber.trim()
                    ? "Đang tạo mã QR..."
                    : "Chọn ngân hàng và nhập STK để xem QR"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default UserBreadBadge;
