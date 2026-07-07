export interface VietQrBank {
  id: number;
  code: string;
  bin: string;
  shortName: string;
  name: string;
  logo: string;
  isTransfer: number;
}

export interface VietQrBanksResponse {
  code: string;
  desc: string;
  data: VietQrBank[];
}

export interface BankInfoData {
  bankQrUrl?: string;
  bankName?: string;
  bankBin?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
}
