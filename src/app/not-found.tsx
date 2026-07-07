"use client";

import { Button } from "@/components/ui/Button";
import PageMotion from "@/components/ui/PageMotion";
import { FiHome } from "react-icons/fi";
import Link from "next/link";

export default function NotFound() {
  return (
    <PageMotion showLoading={false}>
      <div className="bg-white min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="text-9xl font-bold text-gray-200 mb-4">404</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Trang không tìm thấy
          </h1>
          <p className="text-gray-500 mb-8">
            Xin lỗi, trang bạn đang tìm kiếm không tồn tại, đã bị đổi tên hoặc tạm thời không khả dụng.
          </p>
          <Link href="/">
            <Button
              variant="primary"
              className="flex items-center justify-center gap-2 px-8 py-3 mx-auto"
            >
              <FiHome className="w-5 h-5" />
              Về trang chủ
            </Button>
          </Link>
        </div>
      </div>
    </PageMotion>
  );
}
