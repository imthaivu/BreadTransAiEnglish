import { NextResponse } from "next/server";

export async function POST() {
  // Registration is disabled - users can only be created by admins
  return NextResponse.json(
    {
      success: false,
      error: "Đăng ký tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để được tạo tài khoản.",
    },
    { status: 403 }
  );
}
