"use client";

import { StaggerContainer, StaggerItem } from "@/components/ui/PageMotion";
import { motion } from "framer-motion";
import { FiUser, FiBook, FiAward, FiShield, FiCheckCircle, FiAlertCircle, FiGift } from "react-icons/fi";

export default function RulesAndBenefits() {
  const studentRules = [
    "Đọc bài và làm flashcard mỗi ngày",
    "Nghe và nộp bài nói tiếng anh mỗi ngày",
    "Nghe lời giáo viên",
  ];

  const studentBenefits = [
    
    {
      icon: <FiAward className="w-6 h-6" />,
      title: "Được công nhận",
      description: "Được giáo viên khen, thưởng bánh, nhận sao và thăng hạng khi hoàn thành bài học",
    },
    {
      icon: <FiUser className="w-6 h-6" />,
      title: "Được nhận nhiều quà hơn",
      description: "Khi học sinh chăm chỉ làm bài, nghe lời, thi được điểm cao thì xứng đáng được tặng nhiều quà hơn",
    },
    {
      icon: <FiShield className="w-6 h-6" />,
      title: "Quyền lợi trạng thái học tập",
      description: "Ngoan: được voucher giảm giá. Tập trung: được miễn phí vận chuyển",
    },
    {
      icon: <FiGift className="w-6 h-6" />,
      title: "Quà tặng đặc biệt",
      description: "Được nhận quà tặng đặc biệt vào sinh nhật, lì xì tết, quà Giáng sinh, sau khi thi học kì đạt kết quả tốt,... nếu có trạng thái Ngoan/Tập trung hoặc streak tốt",
    },
    
  ];

  const teacherRules = [
    "Chuẩn bị bài kĩ trước mỗi buổi học",
    "Giữ giờ giấc & kỷ luật lớp học",
    "Theo dõi tiến độ, nhắc nhở học sinh làm bài tập",
    "Động viên, nhắc nhở học sinh yếu nhẹ nhàng"
  ];

  const teacherBenefits = [
   
    {
      icon: <FiAward className="w-6 h-6" />,
      title: "Ghi nhận đóng góp",
      description: "Được công nhận cho những đóng góp giáo dục",
    },
    {
      icon: <FiBook className="w-6 h-6" />,
      title: "Thưởng thêm thu nhập",
      description: "Khi học sinh kiểm tra, thi được điểm cao thì giáo viên được thưởng thêm thu nhập",
    },
   
  ];

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 overflow-hidden rounded-2xl mb-8" aria-labelledby="rules-benefits-heading">
      <StaggerContainer>
        {/* Header Section */}
        <StaggerItem>
          <div className="relative text-center py-4 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
            <motion.h1
              id="rules-benefits-heading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-3xl  font-bold bg-gradient-to-r from-indigo-800 via-purple-700 to-pink-700 bg-clip-text text-transparent px-2"
            >
              Quy Tắc & Quyền Lợi
            </motion.h1>
           
          </div>
        </StaggerItem>

        {/* Students Section */}
        <StaggerItem>
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              viewport={{ once: true, margin: "-100px" }}
              className="relative group"
            >
              <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-4 sm:p-8 md:p-10 lg:p-12 shadow-xl border border-blue-100/50">
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                  viewport={{ once: true }}
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-6 sm:mb-8 flex items-center gap-3"
                >
                  <FiUser className="text-blue-600" />
                  <span className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent">
                    Dành Cho Học Sinh
                  </span>
                </motion.h2>

                {/* Rules */}
                <div className="mb-8 sm:mb-10">
                  <motion.h3
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    viewport={{ once: true }}
                    className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2"
                  >
                    <FiAlertCircle className="text-amber-600" />
                    <span>Quy Tắc</span>
                  </motion.h3>
                  <div className="space-y-3 sm:space-y-4">
                    {studentRules.map((rule, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                        viewport={{ once: true }}
                        className="flex items-start gap-3 bg-white/70 rounded-lg p-3 sm:p-4 shadow-md"
                      >
                        <FiCheckCircle className="text-green-600 flex-shrink-0 mt-1" />
                        <p className="text-sm sm:text-base md:text-lg text-gray-700 leading-relaxed">
                          {rule}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Benefits */}
                <div>
                  <motion.h3
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    viewport={{ once: true }}
                    className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2"
                  >
                    <FiAward className="text-amber-600" />
                    <span>Quyền Lợi</span>
                  </motion.h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {studentBenefits.map((benefit, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
                        viewport={{ once: true }}
                        className="bg-white/70 rounded-xl p-4 sm:p-6 shadow-md hover:shadow-lg transition-shadow duration-300"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg text-white">
                            {benefit.icon}
                          </div>
                          <h4 className="text-lg sm:text-xl font-bold text-gray-800">
                            {benefit.title}
                          </h4>
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                          {benefit.description}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </StaggerItem>

        {/* Teachers Section */}
        <StaggerItem>
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              viewport={{ once: true, margin: "-100px" }}
              className="relative group"
            >
              <div className="relative bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 rounded-2xl p-4 sm:p-8 md:p-10 lg:p-12 shadow-xl border border-purple-100/50">
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                  viewport={{ once: true }}
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-800 mb-6 sm:mb-8 flex items-center gap-3"
                >
                  <FiBook className="text-purple-600" />
                  <span className="bg-gradient-to-r from-purple-700 via-pink-700 to-amber-700 bg-clip-text text-transparent">
                    Dành Cho Giáo Viên
                  </span>
                </motion.h2>

                {/* Rules */}
                <div className="mb-8 sm:mb-10">
                  <motion.h3
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    viewport={{ once: true }}
                    className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2"
                  >
                    <FiAlertCircle className="text-amber-600" />
                    <span>Quy Tắc</span>
                  </motion.h3>
                  <div className="space-y-3 sm:space-y-4">
                    {teacherRules.map((rule, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                        viewport={{ once: true }}
                        className="flex items-start gap-3 bg-white/70 rounded-lg p-3 sm:p-4 shadow-md"
                      >
                        <FiCheckCircle className="text-green-600 flex-shrink-0 mt-1" />
                        <p className="text-sm sm:text-base md:text-lg text-gray-700 leading-relaxed">
                          {rule}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Benefits */}
                <div>
                  <motion.h3
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    viewport={{ once: true }}
                    className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center gap-2"
                  >
                    <FiAward className="text-amber-600" />
                    <span>Quyền Lợi</span>
                  </motion.h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {teacherBenefits.map((benefit, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.9 + index * 0.1 }}
                        viewport={{ once: true }}
                        className="bg-white/70 rounded-xl p-4 sm:p-6 shadow-md hover:shadow-lg transition-shadow duration-300"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg text-white">
                            {benefit.icon}
                          </div>
                          <h4 className="text-lg sm:text-xl font-bold text-gray-800">
                            {benefit.title}
                          </h4>
                        </div>
                        <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                          {benefit.description}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </section>
  );
}

