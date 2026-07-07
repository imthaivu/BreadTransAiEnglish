"use client";

import { Input, InputProps } from "@/components/ui/Input";
import { cn } from "@/utils";
import PasteButton from "./PasteButton";

type PasteInputProps = Omit<InputProps, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Cắt khoảng trắng đầu/cuối sau khi dán. Mặc định false. */
  trimOnPaste?: boolean;
  /** Slot bên trái (vd: icon search). Sẽ tự thêm padding-left phù hợp. */
  leftSlot?: React.ReactNode;
  /** Class cho container. `className` vẫn áp lên Input như cũ. */
  containerClassName?: string;
  /** Ẩn nút paste. Mặc định false. */
  hidePasteButton?: boolean;
};

export default function PasteInput({
  value,
  onValueChange,
  className,
  containerClassName,
  trimOnPaste = false,
  leftSlot,
  hidePasteButton = false,
  disabled,
  ...rest
}: PasteInputProps) {
  return (
    <div className={cn("relative w-full", containerClassName)}>
      {leftSlot ? (
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {leftSlot}
        </div>
      ) : null}
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
        className={cn(
          leftSlot ? "pl-10" : "",
          hidePasteButton ? "" : "pr-11",
          className
        )}
        {...rest}
      />
      {hidePasteButton ? null : (
        <PasteButton
          onPaste={onValueChange}
          trimOnPaste={trimOnPaste}
          disabled={disabled}
        />
      )}
    </div>
  );
}
