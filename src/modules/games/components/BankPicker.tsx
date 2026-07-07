"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronDown, FiX } from "react-icons/fi";
import { filterBanks } from "@/lib/vietqr/client";
import type { VietQrBank } from "@/lib/vietqr/types";

interface BankPickerProps {
  banks: VietQrBank[];
  value: VietQrBank | null;
  onChange: (bank: VietQrBank | null) => void;
  loading?: boolean;
  disabled?: boolean;
}

export function BankPicker({
  banks,
  value,
  onChange,
  loading = false,
  disabled = false,
}: BankPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterBanks(banks, query), [banks, query]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function selectBank(bank: VietQrBank) {
    onChange(bank);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    onChange(null);
    setQuery("");
    setOpen(true);
  }

  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        Chọn ngân hàng
      </label>

      {value && !open ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.logo}
            alt=""
            className="h-5 w-5 shrink-0 rounded object-contain"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {value.shortName}
          </span>
          <button
            type="button"
            onClick={() => !disabled && setOpen(true)}
            disabled={disabled}
            className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
          >
            Đổi
          </button>
          <button
            type="button"
            onClick={() => !disabled && clearSelection()}
            disabled={disabled}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Bỏ chọn ngân hàng"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              disabled={disabled}
              placeholder="Tìm Vietcombank, MB, ACB..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-9 text-sm focus:border-primary focus:ring-2 focus:ring-primary disabled:bg-slate-50"
              autoComplete="off"
            />
            <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {open && (
            <ul
              className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">Không tìm thấy ngân hàng</li>
              ) : (
                filtered.map((bank) => (
                  <li key={bank.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value?.id === bank.id}
                      onClick={() => selectBank(bank)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bank.logo}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {bank.shortName}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{bank.name}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
