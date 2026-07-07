/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { MdOutlineDragIndicator } from "react-icons/md";
import { ReactNode, useCallback, useState } from "react";

export interface AdminTableColumn<T = any> {
  key: string;
  title: ReactNode;
  width?: string;
  render?: (value: any, record: T, index: number) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface AdminTableProps<T = any> {
  columns: AdminTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey?: string | ((record: T) => string);
  onRowClick?: (record: T, index: number) => void;
  selectedRows?: string[];
  onSelectRow?: (record: T, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  showCheckbox?: boolean;
  className?: string;
  /** Kéo icon ⋮⋮ trên header để đổi thứ tự cột */
  columnReorder?: boolean;
  onColumnOrderChange?: (orderedKeys: string[]) => void;
  /** Ô header/body gọn hơn (padding nhỏ, chữ nhỏ) */
  dense?: boolean;
}

export default function AdminTable<T = any>({
  columns,
  data,
  loading = false,
  emptyMessage = "Không có dữ liệu",
  rowKey = "id",
  onRowClick,
  selectedRows = [],
  onSelectRow,
  onSelectAll,
  showCheckbox = false,
  className = "",
  columnReorder = false,
  onColumnOrderChange,
  dense = false,
}: AdminTableProps<T>) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const thCell = dense
    ? "px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 normal-case tracking-normal whitespace-nowrap"
    : "px-3 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
  const tdCell = dense
    ? "px-2 py-1.5 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
    : "px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap text-sm md:text-base text-gray-900";
  const tdCheckbox = dense
    ? "px-2 py-1.5 whitespace-nowrap"
    : "px-3 sm:px-4 md:px-6 py-3 sm:py-4 whitespace-nowrap";
  const loadingEmptyPad = dense
    ? "px-2 py-6 text-left"
    : "px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-left";
  const emptyMsgPad = dense
    ? "px-2 py-6 text-center text-sm text-gray-500"
    : "px-3 sm:px-4 md:px-6 py-8 sm:py-12 text-center text-xs sm:text-sm text-gray-500";

  const reorderColumnKeys = useCallback(
    (fromKey: string, toKey: string) => {
      if (!onColumnOrderChange || fromKey === toKey) return;
      const keys = columns.map((c) => c.key);
      const fromIdx = keys.indexOf(fromKey);
      const toIdx = keys.indexOf(toKey);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...keys];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      onColumnOrderChange(next);
    },
    [columns, onColumnOrderChange]
  );

  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === "function") {
      return rowKey(record);
    }
    return (record as any)[rowKey] || index.toString();
  };

  const isRowSelected = (record: T): boolean => {
    const key = getRowKey(record, 0);
    return selectedRows.includes(key);
  };

  const isAllSelected = (): boolean => {
    return data.length > 0 && selectedRows.length === data.length;
  };

  const isIndeterminate = (): boolean => {
    return selectedRows.length > 0 && selectedRows.length < data.length;
  };

  const handleRowClick = (record: T, index: number) => {
    if (onRowClick) {
      onRowClick(record, index);
    }
  };

  const handleSelectRow = (record: T, checked: boolean) => {
    if (onSelectRow) {
      onSelectRow(record, checked);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (onSelectAll) {
      onSelectAll(checked);
    }
  };

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {showCheckbox && (
                <th className={thCell}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-primary shadow-sm focus:ring-primary"
                    checked={isAllSelected()}
                    ref={(input) => {
                      if (input) input.indeterminate = isIndeterminate();
                    }}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${thCell} ${column.className || ""} ${columnReorder && dragOverKey === column.key ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                  style={{ width: column.width }}
                  onDragOver={
                    columnReorder && onColumnOrderChange
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverKey(column.key);
                        }
                      : undefined
                  }
                  onDrop={
                    columnReorder && onColumnOrderChange
                      ? (e) => {
                          e.preventDefault();
                          setDragOverKey(null);
                          const fromKey = e.dataTransfer.getData("application/x-admin-column-key");
                          reorderColumnKeys(fromKey, column.key);
                        }
                      : undefined
                  }
                >
                  <div className="inline-flex max-w-none items-center gap-1 whitespace-nowrap">
                    {columnReorder && onColumnOrderChange && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Kéo để đổi vị trí cột"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/x-admin-column-key", column.key);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragOverKey(null)}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-grab active:cursor-grabbing touch-none shrink-0 rounded p-0.5 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        <MdOutlineDragIndicator className={dense ? "w-3 h-3" : "w-3.5 h-3.5"} aria-hidden />
                      </span>
                    )}
                    <span className="shrink-0">{column.title}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (showCheckbox ? 1 : 0)}
                  className={loadingEmptyPad}
                >
                  <div className="flex items-center justify-center">
                    <div
                      className={`animate-spin rounded-full border-b-2 border-primary ${dense ? "h-6 w-6" : "h-8 w-8"}`}
                    />
                    <span className={`ml-2 text-gray-600 ${dense ? "text-sm" : "text-xs sm:text-sm"}`}>
                      Đang tải...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showCheckbox ? 1 : 0)}
                  className={emptyMsgPad}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((record, index) => (
                <tr
                  key={getRowKey(record, index)}
                  className={`hover:bg-gray-50 ${
                    onRowClick ? "cursor-pointer" : ""
                  }`}
                  onClick={() => handleRowClick(record, index)}
                >
                  {showCheckbox && (
                    <td className={tdCheckbox}>
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary shadow-sm focus:ring-primary"
                        checked={isRowSelected(record)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectRow(record, e.target.checked);
                        }}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${tdCell} ${column.className || ""}`}
                    >
                      {column.render
                        ? column.render(
                            (record as any)[column.key],
                            record,
                            index
                          )
                        : (record as any)[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
