import type { BankInfoData, VietQrBank, VietQrBanksResponse } from "./types";

const BANKS_API = "https://api.vietqr.io/v2/banks";

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function fetchVietQrBanks(): Promise<VietQrBank[]> {
  const res = await fetch(BANKS_API);
  if (!res.ok) throw new Error("Không tải được danh sách ngân hàng");
  const json = (await res.json()) as VietQrBanksResponse;
  if (json.code !== "00" || !Array.isArray(json.data)) {
    throw new Error(json.desc || "Danh sách ngân hàng không hợp lệ");
  }
  return json.data
    .filter((b) => b.isTransfer === 1)
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "vi"));
}

export function findBankFromInitial(
  banks: VietQrBank[],
  initial: { bankBin?: string; bankName?: string }
): VietQrBank | null {
  if (!banks.length) return null;
  if (initial.bankBin) {
    const byBin = banks.find((b) => b.bin === initial.bankBin);
    if (byBin) return byBin;
  }
  if (!initial.bankName?.trim()) return null;
  const key = normalizeSearchText(initial.bankName);
  return (
    banks.find((b) => normalizeSearchText(b.shortName) === key) ??
    banks.find((b) => normalizeSearchText(b.code) === key) ??
    banks.find((b) => normalizeSearchText(b.name).includes(key)) ??
    null
  );
}

export function filterBanks(banks: VietQrBank[], query: string): VietQrBank[] {
  const q = normalizeSearchText(query);
  if (!q) return banks;
  return banks.filter(
    (b) =>
      normalizeSearchText(b.shortName).includes(q) ||
      normalizeSearchText(b.name).includes(q) ||
      normalizeSearchText(b.code).includes(q) ||
      b.bin.includes(q)
  );
}

export function buildVietQrImageUrl({
  bin,
  accountNo,
  accountName,
}: {
  bin: string;
  accountNo: string;
  accountName?: string;
}): string {
  const no = accountNo.trim();
  if (!bin || !no) return "";
  const base = `https://img.vietqr.io/image/${bin}-${encodeURIComponent(no)}-compact.png`;
  const name = accountName?.trim();
  if (!name) return base;
  return `${base}?accountName=${encodeURIComponent(name)}`;
}

export function hasBankInfo(info: BankInfoData): boolean {
  return !!(
    info.bankQrUrl?.trim() ||
    info.bankBin?.trim() ||
    info.bankName?.trim() ||
    info.bankAccountNumber?.trim() ||
    info.bankAccountName?.trim()
  );
}

/** Ưu tiên URL đã lưu; nếu không có thì dựng lại từ BIN + STK (VietQR). */
export function resolveBankQrUrl(info: BankInfoData): string {
  const saved = info.bankQrUrl?.trim();
  if (saved) return saved;
  const bin = info.bankBin?.trim();
  const accountNo = info.bankAccountNumber?.trim();
  if (!bin || !accountNo) return "";
  return buildVietQrImageUrl({
    bin,
    accountNo,
    accountName: info.bankAccountName?.trim() || undefined,
  });
}
