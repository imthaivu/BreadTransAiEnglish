"use client";

import { useMemo } from "react";
import { FiCopy } from "react-icons/fi";
import { MdQrCode2 } from "react-icons/md";
import { SafeImage } from "@/components/ui/SafeImage";
import { findBankFromInitial, hasBankInfo, resolveBankQrUrl } from "@/lib/vietqr/client";
import { useVietQrBanks } from "@/lib/vietqr/useVietQrBanks";
import type { BankInfoData } from "@/lib/vietqr/types";

interface BankInfoDisplayProps {
  info: BankInfoData;
  onCopyAccount?: (accountNumber: string) => void;
  className?: string;
  emptyMessage?: string;
}

export function BankInfoDisplay({
  info,
  onCopyAccount,
  className = "",
  emptyMessage = "Học sinh chưa cập nhật thông tin thanh toán",
}: BankInfoDisplayProps) {
  const show = hasBankInfo(info);
  const { data: banks = [] } = useVietQrBanks(show);

  const bank = useMemo(
    () => findBankFromInitial(banks, { bankBin: info.bankBin, bankName: info.bankName }),
    [banks, info.bankBin, info.bankName]
  );

  const qrUrl = useMemo(() => resolveBankQrUrl(info), [info]);
  const displayBankName = bank?.shortName ?? info.bankName?.trim();

  if (!show) {
    return (
      <div
        className={`rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-center text-xs text-gray-400 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-start ${className}`}
    >
      <div className="relative h-52 w-52 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {qrUrl ? (
          <SafeImage
            src={qrUrl}
            alt="Mã QR chuyển khoản"
            fill
            sizes="208px"
            unoptimized
            className="object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-gray-400">
            <MdQrCode2 className="h-10 w-10" />
            <span className="text-xs">Chưa đủ thông tin để tạo QR</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {displayBankName && (
          <div className="flex items-center gap-2">
            {bank?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bank.logo}
                alt=""
                className="h-6 w-6 shrink-0 rounded object-contain"
              />
            ) : null}
            <span className="font-semibold text-gray-800">{displayBankName}</span>
          </div>
        )}

        {info.bankAccountNumber?.trim() && (
          onCopyAccount ? (
            <button
              type="button"
              onClick={() => onCopyAccount(info.bankAccountNumber!.trim())}
              className="flex items-center gap-1.5 font-mono font-medium text-blue-600 hover:text-blue-700"
              title="Copy số tài khoản"
            >
              {info.bankAccountNumber.trim()}
              <FiCopy className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="font-mono font-medium text-gray-800">
              {info.bankAccountNumber.trim()}
            </div>
          )
        )}

        {info.bankAccountName?.trim() && (
          <div className="uppercase text-gray-600">{info.bankAccountName.trim()}</div>
        )}

        {qrUrl && (
          <p className="text-xs text-gray-500">Mã VietQR — quét để chuyển khoản</p>
        )}
      </div>
    </div>
  );
}
