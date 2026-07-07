"use client";

import { motion } from "framer-motion";
import { FiGlobe, FiMail, FiPhone, FiShield } from "react-icons/fi";

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-gray-800">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 text-primary-600 mb-3">
          <FiShield className="w-6 h-6 text-blue-600" />
          <span className="uppercase tracking-widest text-sm font-medium text-blue-600">
            Breadtrans English
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-2 text-gray-900">
          Chính sách bảo mật
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Chúng tôi cam kết bảo vệ quyền riêng tư và dữ liệu cá nhân của bạn.
        </p>
      </motion.header>

      {/* Content */}
      <section className="prose prose-gray max-w-none">
        <motion.article
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.2 }}
          className="space-y-10"
        >
          <div>
            <h2>1. Giới thiệu</h2>
            <p>
              Breadtrans English cam kết bảo vệ quyền riêng tư của người dùng.
              Chính sách này mô tả cách chúng tôi thu thập, sử dụng và bảo vệ
              thông tin của bạn khi sử dụng dịch vụ.
            </p>
          </div>

          <div>
            <h2>2. Thông tin thu thập</h2>
            <ul>
              <li>
                <strong>Tài khoản:</strong> email, tên hiển thị, mật khẩu (mã hoá).
              </li>
              <li>
                <strong>Dữ liệu học tập:</strong> từ đã học, điểm, tiến độ, thành tích.
              </li>
              <li>
                <strong>Dữ liệu kỹ thuật:</strong> IP, trình duyệt, cookie, thiết bị, dữ liệu phân tích.
              </li>
              <li>
                Chúng tôi không thu thập thông tin nhạy cảm như CMND, số thẻ ngân hàng hoặc y tế.
              </li>
            </ul>
          </div>

          <div>
            <h2>3. Mục đích sử dụng thông tin</h2>
            <ul>
              <li>Nâng cao trải nghiệm học tập cá nhân hoá.</li>
              <li>Gửi thông báo, cập nhật và hỗ trợ nếu bạn đồng ý.</li>
              <li>Bảo mật tài khoản, xử lý sự cố và hỗ trợ kỹ thuật.</li>
            </ul>
          </div>

          <div>
            <h2>4. Lưu trữ & bảo vệ dữ liệu</h2>
            <p>
              Dữ liệu được lưu trữ an toàn trên máy chủ đáng tin cậy với các
              biện pháp bảo mật như mã hoá và kiểm soát truy cập. Chúng tôi chỉ
              chia sẻ dữ liệu trong các trường hợp:
            </p>
            <ul>
              <li>Được bạn cho phép trước;</li>
              <li>Có yêu cầu pháp lý hợp lệ;</li>
              <li>Hoặc để bảo vệ quyền lợi hợp pháp của nền tảng.</li>
            </ul>
            <p>
              Bạn có thể yêu cầu xoá tài khoản hoặc dữ liệu cá nhân qua thông tin liên hệ bên dưới.
            </p>
          </div>

          <div>
            <h2>5. Cookie & phân tích</h2>
            <p>
              Trang web có thể sử dụng cookie hoặc công cụ phân tích (như Google Analytics)
              để cải thiện trải nghiệm. Bạn có thể tắt cookie trong trình duyệt,
              tuy nhiên một số tính năng có thể bị hạn chế.
            </p>
          </div>

          <div>
            <h2>6. Quyền của người dùng</h2>
            <ul>
              <li>Xem và chỉnh sửa thông tin cá nhân trong Hồ sơ.</li>
              <li>Yêu cầu xoá dữ liệu cá nhân hoặc đóng tài khoản.</li>
              <li>Từ chối nhận email quảng bá (mỗi email có tùy chọn hủy).</li>
            </ul>
          </div>

          <div>
            <h2>7. Liên hệ</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
              <p className="mb-3">Nếu bạn có câu hỏi, vui lòng liên hệ:</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <FiMail className="w-5 h-5 text-blue-500" />
                  <a href="mailto:breadtransenglish@gmail.com" className="hover:underline">
                    breadtransenglish@gmail.com
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <FiPhone className="w-5 h-5 text-blue-500" />
                  <a href="tel:0377180010" className="hover:underline">
                    0377 180 010
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <FiGlobe className="w-5 h-5 text-blue-500" />
                  <a href="https://breadtrans.com" target="_blank" className="hover:underline">
                    breadtrans.com
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div>
            <h2>8. Cập nhật chính sách</h2>
            <p>
              Chính sách có thể thay đổi theo thời gian. Phiên bản mới sẽ được đăng tại đây
              và có hiệu lực ngay khi công bố. Nếu có thay đổi quan trọng,
              chúng tôi sẽ thông báo qua kênh phù hợp.
            </p>
          </div>
        </motion.article>
      </section>

      {/* Footer */}
      <footer className="text-center text-sm text-gray-500 mt-16">
        © {new Date().getFullYear()} Breadtrans English. All rights reserved.
      </footer>
    </main>
  );
}
