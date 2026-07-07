/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { Button } from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { ReactNode, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { AddressSelector } from "@/components/ui/AddressSelector";
import PasteButton from "./PasteButton";

export interface AdminFormField {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "select" | "textarea" | "number" | "date" | "checkbox" | "address";
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  validation?: {
    required?: string;
    pattern?: {
      value: RegExp;
      message: string;
    };
    minLength?: {
      value: number;
      message: string;
    };
    maxLength?: {
      value: number;
      message: string;
    };
    min?: {
      value: number;
      message: string;
    };
    max?: {
      value: number;
      message: string;
    };
  };
  after?:
    | ReactNode
    | ((helpers: {
        setValue: (name: string, value: any) => void;
        getValues: (name?: string) => any;
        watch: (name?: string) => any;
      }) => ReactNode);
}

export interface AdminFormProps {
  fields: (AdminFormField | AdminFormField[])[];
  defaultValues?: Record<string, any>;
  onSubmit: (data: any) => void;
  submitText?: string;
  cancelText?: string;
  onCancel?: () => void;
  isLoading?: boolean;
  className?: string;
  children?:
    | ReactNode
    | ((helpers: {
        setValue: (name: string, value: any) => void;
        getValues: (name?: string) => any;
        watch: (name?: string) => any;
      }) => ReactNode);
}

export default function AdminForm({
  fields,
  defaultValues = {},
  onSubmit,
  submitText = "Lưu",
  cancelText = "Hủy",
  onCancel,
  isLoading = false,
  className = "",
  children,
}: AdminFormProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    getValues,
    watch,
  } = useForm({
    defaultValues: {
      ...defaultValues,
      ...fields.flat().reduce((acc, field) => {
        if (field.defaultValue !== undefined) {
          acc[field.name] = field.defaultValue;
        }
        return acc;
      }, {} as Record<string, any>),
    },
  });

  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const renderField = (field: AdminFormField) => {
    const commonProps = {
      placeholder: field.placeholder,
      className:
        "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent",
    };

    const errorClass = errors[field.name]
      ? "border-red-300 focus:ring-red-500"
      : "";

    return (
      <Controller
        key={field.name}
        name={field.name}
        control={control}
        rules={{
          required: field.required
            ? field.validation?.required || `${field.label} là bắt buộc`
            : false,
          ...field.validation,
        }}
        render={({ field: controllerField }) => {
          switch (field.type) {
            case "select":
              return (
                <div>
                  <select
                    {...controllerField}
                    {...commonProps}
                    className={`${commonProps.className} ${errorClass}`}
                  >
                    <option value="">Chọn {field.label.toLowerCase()}</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            case "textarea":
              return (
                <div>
                  <div className="relative">
                    <textarea
                      {...controllerField}
                      {...commonProps}
                      rows={field.rows || 3}
                      className={`${commonProps.className} pr-11 ${errorClass} resize-vertical`}
                    />
                    <PasteButton
                      onPaste={(text) => controllerField.onChange(text)}
                      className="absolute right-1 top-1 translate-y-0"
                    />
                  </div>
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            case "number":
              return (
                <div>
                  <input
                    {...controllerField}
                    {...commonProps}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    className={`${commonProps.className} ${errorClass}`}
                  />
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            case "date":
              return (
                <div>
                  <input
                    {...controllerField}
                    {...commonProps}
                    type="date"
                    className={`${commonProps.className} ${errorClass}`}
                  />
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            case "checkbox":
              return (
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={controllerField.value || false}
                      onChange={(e) => controllerField.onChange(e.target.checked)}
                      onBlur={controllerField.onBlur}
                      name={controllerField.name}
                      ref={controllerField.ref}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    />
                    <span className="text-sm md:text-base text-gray-700">
                      {field.label}
                    </span>
                  </label>
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            case "address":
              return (
                <div>
                  <AddressSelector
                    value={controllerField.value || ""}
                    onChange={controllerField.onChange}
                    label={field.label}
                    required={field.required}
                  />
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );

            default:
              return (
                <div>
                  <div className="relative">
                    <input
                      {...controllerField}
                      {...commonProps}
                      type={field.type}
                      className={`${commonProps.className} pr-11 ${errorClass}`}
                    />
                    <PasteButton
                      onPaste={(text) => controllerField.onChange(text)}
                      trimOnPaste
                    />
                  </div>
                  {errors[field.name] && (
                    <p className="mt-1 text-sm md:text-base text-red-600">
                      {errors[field.name]?.message as string}
                    </p>
                  )}
                </div>
              );
          }
        }}
      />
    );
  };

  const renderFieldWithLabel = (field: AdminFormField) => (
    <div key={field.name}>
      {field.type !== "checkbox" && field.type !== "address" && (
        <label
          htmlFor={field.name}
          className="block text-sm md:text-base font-medium text-gray-700 mb-1"
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {renderField(field)}
      {typeof field.after === "function"
        ? field.after({ setValue, getValues, watch })
        : field.after}
    </div>
  );

  return (
    <>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={`space-y-4 ${className}`}
      >
        {fields.map((fieldItem, index) => {
          if (Array.isArray(fieldItem)) {
            const rowClassName =
              fieldItem.length >= 3
                ? "grid grid-cols-1 sm:grid-cols-3 gap-4"
                : "grid grid-cols-1 sm:grid-cols-2 gap-4";
            return (
              <div key={`row-${index}`} className={rowClassName}>
                {fieldItem.map((f) => renderFieldWithLabel(f))}
              </div>
            );
          }
          return renderFieldWithLabel(fieldItem);
        })}

        {typeof children === "function"
          ? children({ setValue, getValues, watch })
          : children}

        <div className="flex justify-end space-x-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelText}
            </Button>
          )}
          <Button
            variant="primary"
            type="button"
            disabled={isLoading}
            onClick={() => setShowConfirm(true)}
          >
            {isLoading ? "Đang lưu..." : submitText}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        title="Xác nhận"
        isOpen={showConfirm}
        message="Bạn có chắc chắn muốn gửi biểu mẫu này không?"
        onClose={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          handleSubmit(onSubmit)();
        }}
        confirmText="Xác nhận"
        cancelText="Hủy"
      />
    </>
  );
}
