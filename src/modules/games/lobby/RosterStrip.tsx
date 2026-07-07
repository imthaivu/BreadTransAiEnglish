"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { encodeDragPayload, INVITE_DND_TYPE } from "./dnd";
import type { SimplePlayer } from "./invitations";
import { useAuth } from "@/lib/auth/context";
import { vietnameseShortDisplayName } from "@/utils/vietnameseShortName";
import { useRoster, type RosterEntry } from "./useRoster";

export interface RosterStripProps {
  /**
   * Touch/pen DnD: invoked when the user releases the dragged avatar over a
   * `[data-invite-drop-target="<gameId>"]` element. Desktop mouse DnD vẫn dùng
   * native HTML5 events (dataTransfer + `onDrop` trên target).
   */
  onTouchInviteDrop?: (gameId: string, player: SimplePlayer) => void;
  /**
   * Cập nhật trạng thái drop target hiện tại trong khi kéo (mobile) — host có
   * thể dùng để highlight card giống đường viền cam ở desktop.
   */
  onTouchDragOver?: (gameId: string | null) => void;
}

/**
 * Horizontal strip of classmate avatars. Online classmates are draggable onto
 * a game card to send a play invitation; offline ones are greyed out.
 *
 * Trên mobile, HTML5 native drag-and-drop không hoạt động — component này tự
 * triển khai cơ chế kéo dùng PointerEvent + portal floating preview. Long-press
 * kích hoạt drag khi pointer kiểu `touch`/`pen`; pointer kiểu `mouse` rơi về
 * native HTML5 DnD để dùng được trên desktop bình thường.
 */
export function RosterStrip({
  onTouchInviteDrop,
  onTouchDragOver,
}: RosterStripProps = {}) {
  const { profile } = useAuth();
  const { roster, isLoading } = useRoster();
  const isTeacher = profile?.role === "teacher";

  if (isLoading) {
    return (
      <div className="mb-3 flex gap-2 overflow-x-auto px-0.5 py-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-slate-200"
          />
        ))}
      </div>
    );
  }

  if (roster.length === 0) return null;

  return (
    <div className="mb-3">
      <p className="mb-1.5 px-0.5 text-xs font-semibold text-slate-500">
          Kéo bạn online vào game nhận 35 
          <span className="inline-flex items-center">
          <img
          src="/assets/images/dorayaki.png"
          alt="Bánh mì"
          width={18}
          height={18}
          className="drop-shadow-sm"
        />
        </span>
      </p>
      <div className="flex gap-3 overflow-x-auto px-0.5 py-1">
        {roster.map((entry) => (
          <RosterAvatar
            key={entry.id}
            entry={entry}
            onTouchInviteDrop={onTouchInviteDrop}
            onTouchDragOver={onTouchDragOver}
          />
        ))}
      </div>
    </div>
  );
}

interface RosterAvatarProps {
  entry: RosterEntry;
  onTouchInviteDrop?: (gameId: string, player: SimplePlayer) => void;
  onTouchDragOver?: (gameId: string | null) => void;
}

function RosterAvatar({
  entry,
  onTouchInviteDrop,
  onTouchDragOver,
}: RosterAvatarProps) {
  const draggable = entry.online;

  /** Vị trí floating preview khi kéo bằng touch/pen. null = không kéo. */
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(
    null
  );
  /** Cleanup function của lượt kéo hiện tại — gọi khi unmount giữa chừng. */
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cleanupRef.current?.();
    },
    []
  );

  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      INVITE_DND_TYPE,
      encodeDragPayload({
        id: entry.id,
        name: entry.name,
        avatarUrl: entry.avatarUrl,
      })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!draggable) return;
    // Desktop dùng native HTML5 DnD; chỉ tự xử lý cho touch/pen.
    if (e.pointerType === "mouse") return;

    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;
    let lastTargetId: string | null = null;

    const findTarget = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const card = (el as Element).closest<HTMLElement>(
        "[data-invite-drop-target]"
      );
      return card?.getAttribute("data-invite-drop-target") ?? null;
    };

    const activate = (x: number, y: number) => {
      activated = true;
      setTouchPos({ x, y });
      try {
        navigator.vibrate?.(15);
      } catch {
        // ignore
      }
    };

    const onMove = (ev: PointerEvent) => {
      if (!activated) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // Bỏ qua jitter rất nhỏ — chờ đến khi user thực sự di chuyển ngón tay.
        if (Math.abs(dx) + Math.abs(dy) < 6) return;
        // Di chuyển dọc nhiều hơn ngang → bắt đầu drag (game cards nằm bên
        // dưới avatar). Di chuyển ngang chủ yếu → user đang scroll strip,
        // huỷ drag để browser handle scroll bình thường.
        if (Math.abs(dy) > Math.abs(dx)) {
          activate(ev.clientX, ev.clientY);
          ev.preventDefault();
        } else {
          cleanup();
        }
        return;
      }
      ev.preventDefault();
      setTouchPos({ x: ev.clientX, y: ev.clientY });
      const targetId = findTarget(ev.clientX, ev.clientY);
      if (targetId !== lastTargetId) {
        lastTargetId = targetId;
        onTouchDragOver?.(targetId);
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (activated) {
        const targetId = findTarget(ev.clientX, ev.clientY);
        cleanup();
        if (targetId) {
          onTouchInviteDrop?.(targetId, {
            id: entry.id,
            name: entry.name,
            avatarUrl: entry.avatarUrl,
          });
        }
      } else {
        cleanup();
      }
    };

    const onCancel = () => cleanup();

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      cleanupRef.current = null;
      if (activated) {
        setTouchPos(null);
        onTouchDragOver?.(null);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    cleanupRef.current = cleanup;
  };

  return (
    <>
      <div className="flex w-14 shrink-0 flex-col items-center gap-1">
        <div
          draggable={draggable}
          onDragStart={handleDragStart}
          onPointerDown={handlePointerDown}
          title={
            draggable
              ? `Kéo để mời ${entry.name}`
              : `${entry.name} đang offline`
          }
          // `touch-action: none` để pointer events liên tục flow trong lúc
          // kéo (không bị browser cancel để pan scroll). Vùng avatar nhỏ
          // (48px), user vẫn scroll trang được bằng cách chạm ngoài avatar.
          style={{ touchAction: draggable ? "none" : undefined }}
          className={`relative h-12 w-12 select-none ${
            draggable ? "cursor-grab active:cursor-grabbing" : "opacity-40"
          } ${touchPos ? "ring-2 ring-amber-400 rounded-full" : ""}`}
        >
          {entry.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={entry.avatarUrl}
              alt={entry.name}
              draggable={false}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow pointer-events-none"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500 text-sm font-bold text-white ring-2 ring-white shadow pointer-events-none">
              {entry.name.charAt(0).toUpperCase()}
            </div>
          )}
          {entry.online && (
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500 pointer-events-none" />
          )}
        </div>
        <span
          className="w-full truncate text-center text-[10px] text-slate-600"
          title={entry.name}
        >
          {vietnameseShortDisplayName(entry.name)}
        </span>
      </div>

      {touchPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[10000]"
            style={{
              left: touchPos.x - 28,
              top: touchPos.y - 28,
              transform: "scale(1.15)",
              transformOrigin: "center",
            }}
          >
            {entry.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.avatarUrl}
                alt=""
                draggable={false}
                className="h-14 w-14 rounded-full object-cover ring-4 ring-amber-400 shadow-2xl"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-base font-bold text-white ring-4 ring-amber-400 shadow-2xl">
                {entry.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
