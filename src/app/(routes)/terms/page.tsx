"use client";

import { motion } from "framer-motion";
import { FiFileText, FiMail } from "react-icons/fi";

export default function TermsPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16 text-gray-800">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-16"
      >
        <div className="inline-flex items-center gap-2 text-blue-600 mb-3">
          <FiFileText className="w-7 h-7" />
          <span className="uppercase tracking-wider font-semibold text-sm">
            Breadtrans English
          </span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Điều khoản sử dụng
        </h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Bằng việc truy cập và sử dụng nền tảng, bạn đồng ý tuân thủ các điều
          khoản dưới đây. Vui lòng đọc kỹ để hiểu rõ quyền và nghĩa vụ của mình.
        </p>
      </motion.header>

      {/* Content */}
      <motion.div
        className="space-y-10 prose prose-gray max-w-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.15 }}
      >
        <section>
          <h2>1. Giới thiệu</h2>
          <p>
            Bằng việc truy cập hoặc sử dụng Breadtrans English, bạn đồng ý tuân
            theo các điều khoản sau. Nếu bạn không đồng ý, vui lòng không sử dụng
            dịch vụ.
          </p>
        </section>

        <section>
          <h2>2. Quyền và trách nhiệm người dùng</h2>
          <ul>
            <li>Không chia sẻ tài khoản với người khác.</li>
            <li>
              Không phát tán thông tin sai lệch, nội dung vi phạm pháp luật hoặc
              thuần phong mỹ tục.
            </li>
            <li>
              Không can thiệp, tấn công, hay truy cập trái phép hệ thống của nền
              tảng.
            </li>
            <li>
              Không sao chép, bán lại, hoặc thương mại hóa học liệu khi chưa có
              quyền.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Quyền và trách nhiệm của Breadtrans</h2>
          <ul>
            <li>
              Cung cấp nền tảng học tập, có thể miễn phí hoặc trả phí tùy chức
              năng.
            </li>
            <li>
              Có quyền tạm dừng hoặc chấm dứt tài khoản nếu phát hiện vi phạm điều
              khoản.
            </li>
            <li>
              Có thể thay đổi nội dung hoặc tính năng mà không cần báo trước. Chúng
              tôi sẽ thông báo nếu thay đổi ảnh hưởng đáng kể đến người dùng.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Nội dung học tập</h2>
          <p>
            Tất cả học liệu được Breadtrans biên soạn chỉ dùng cho mục đích học
            tập cá nhân. Người dùng không được phép tái xuất bản, sao chép hoặc
            thương mại hóa nếu chưa được chấp thuận bằng văn bản.
          </p>
        </section>

        <section>
          <h2>5. Giới hạn trách nhiệm</h2>
          <p>
            Breadtrans không chịu trách nhiệm cho thiệt hại gián tiếp do lỗi kết
            nối, dịch vụ bên thứ ba, hoặc việc sử dụng nội dung. Kết quả học tập
            phụ thuộc vào nỗ lực cá nhân; chúng tôi không đảm bảo kết quả tuyệt
            đối.
          </p>
        </section>

        <section>
          <h2>6. Quyền sở hữu trí tuệ</h2>
          <p>
            Logo, giao diện, nội dung và mã nguồn là tài sản của Breadtrans. Mọi
            hành vi sao chép, chỉnh sửa, hoặc sử dụng lại phải được cho phép bằng
            văn bản.
          </p>
        </section>

        <section>
          <h2>7. Liên hệ</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <p className="mb-3">Mọi thắc mắc hoặc phản hồi, vui lòng liên hệ:</p>
            <ul>
              <li className="flex items-center gap-2">
                <FiMail className="w-5 h-5 text-blue-500" />
                <a
                  href="mailto:breadtransenglish@gmail.com"
                  className="hover:underline"
                >
                  breadtransenglish@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </section>
      </motion.div>

      {/* Footer */}
      <footer className="text-center text-sm text-gray-500 mt-20">
        © {new Date().getFullYear()} Breadtrans English. All rights reserved.
      </footer>
    </main>
  );
}
