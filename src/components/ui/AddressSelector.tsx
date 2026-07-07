"use client";

import { useState, useEffect, useMemo } from "react";

interface AddressData {
  "Tỉnh Thành Phố": string;
  "Mã TP": number;
  "Quận Huyện": string;
  "Mã QH": number;
  "Phường Xã": string;
  "Mã PX": number;
  "Cấp": string;
  "Tên Tiếng Anh": string | null;
}

interface AddressSelectorProps {
  value?: string;
  onChange: (address: string) => void;
  label?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function AddressSelector({
  value = "",
  onChange,
  label = "Địa chỉ",
  className = "",
  required = false,
  disabled = false,
}: AddressSelectorProps) {
  const [data, setData] = useState<AddressData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTinh, setSelectedTinh] = useState<string>("");
  const [selectedQuanHuyen, setSelectedQuanHuyen] = useState<string>("");
  const [selectedPhuongXa, setSelectedPhuongXa] = useState<string>("");

  // Load data from JSON file
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch("/data/TinhHuyenXa2021.json");
        const jsonData: AddressData[] = await response.json();
        setData(jsonData);
        setLoading(false);
      } catch (error) {
        console.error("Error loading address data:", error);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Parse existing address value to populate dropdowns
  useEffect(() => {
    if (value && data.length > 0) {
      // Try to parse address format: "Phường/Xã, Quận/Huyện, Tỉnh/Thành phố"
      const parts = value.split(",").map((p) => p.trim());
      if (parts.length === 3) {
        const [phuongXa, quanHuyen, tinh] = parts;
        
        // Find matching entries
        const matchingEntry = data.find(
          (item) =>
            item["Phường Xã"] === phuongXa &&
            item["Quận Huyện"] === quanHuyen &&
            item["Tỉnh Thành Phố"] === tinh
        );

        if (matchingEntry) {
          setSelectedTinh(matchingEntry["Tỉnh Thành Phố"]);
          setSelectedQuanHuyen(matchingEntry["Quận Huyện"]);
          setSelectedPhuongXa(matchingEntry["Phường Xã"]);
        }
      }
    }
  }, [value, data]);

  // Get unique provinces
  const provinces = useMemo(() => {
    const unique = new Set(data.map((item) => item["Tỉnh Thành Phố"]));
    return Array.from(unique).sort();
  }, [data]);

  // Get districts for selected province
  const districts = useMemo(() => {
    if (!selectedTinh) return [];
    const unique = new Set(
      data
        .filter((item) => item["Tỉnh Thành Phố"] === selectedTinh)
        .map((item) => item["Quận Huyện"])
    );
    return Array.from(unique).sort();
  }, [data, selectedTinh]);

  // Get wards for selected province and district
  const wards = useMemo(() => {
    if (!selectedTinh || !selectedQuanHuyen) return [];
    const unique = new Set(
      data
        .filter(
          (item) =>
            item["Tỉnh Thành Phố"] === selectedTinh &&
            item["Quận Huyện"] === selectedQuanHuyen
        )
        .map((item) => item["Phường Xã"])
    );
    return Array.from(unique).sort();
  }, [data, selectedTinh, selectedQuanHuyen]);

  // Handle province change
  const handleTinhChange = (tinh: string) => {
    setSelectedTinh(tinh);
    setSelectedQuanHuyen("");
    setSelectedPhuongXa("");
    onChange("");
  };

  // Handle district change
  const handleQuanHuyenChange = (quanHuyen: string) => {
    setSelectedQuanHuyen(quanHuyen);
    setSelectedPhuongXa("");
    onChange("");
  };

  // Handle ward change
  const handlePhuongXaChange = (phuongXa: string) => {
    setSelectedPhuongXa(phuongXa);
    if (selectedTinh && selectedQuanHuyen && phuongXa) {
      // Format: "Phường/Xã, Quận/Huyện, Tỉnh/Thành phố"
      const address = `${phuongXa}, ${selectedQuanHuyen}, ${selectedTinh}`;
      onChange(address);
    }
  };

  if (loading) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="mt-1 text-sm text-gray-500">Đang tải dữ liệu địa chỉ...</div>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm md:text-base font-medium text-slate-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mt-1">
        {/* Tỉnh/Thành phố */}
        <div>
          <select
            value={selectedTinh}
            onChange={(e) => handleTinhChange(e.target.value)}
            disabled={disabled}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary px-3 sm:px-4 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            required={required}
          >
            <option value="">Chọn Tỉnh/TP</option>
            {provinces.map((tinh) => (
              <option key={tinh} value={tinh}>
                {tinh}
              </option>
            ))}
          </select>
        </div>

        {/* Quận/Huyện */}
        <div>
          <select
            value={selectedQuanHuyen}
            onChange={(e) => handleQuanHuyenChange(e.target.value)}
            disabled={disabled || !selectedTinh}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary px-3 sm:px-4 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            required={required && selectedTinh ? true : false}
          >
            <option value="">Chọn Quận/Huyện</option>
            {districts.map((quanHuyen) => (
              <option key={quanHuyen} value={quanHuyen}>
                {quanHuyen}
              </option>
            ))}
          </select>
        </div>

        {/* Phường/Xã */}
        <div>
          <select
            value={selectedPhuongXa}
            onChange={(e) => handlePhuongXaChange(e.target.value)}
            disabled={disabled || !selectedQuanHuyen}
            className="w-full rounded-md border-slate-300 shadow-sm focus:border-primary focus:ring-primary px-3 sm:px-4 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            required={required && selectedQuanHuyen ? true : false}
          >
            <option value="">Chọn Phường/Xã</option>
            {wards.map((phuongXa) => (
              <option key={phuongXa} value={phuongXa}>
                {phuongXa}
              </option>
            ))}
          </select>
        </div>
      </div>
      
    </div>
  );
}

