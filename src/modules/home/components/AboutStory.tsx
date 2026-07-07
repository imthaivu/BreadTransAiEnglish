"use client";

import { SafeImage as Image } from "@/components/ui/SafeImage";
import { StaggerContainer, StaggerItem } from "@/components/ui/PageMotion";
import { motion } from "framer-motion";

export default function AboutStory() {
  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 overflow-hidden rounded-2xl mb-8" aria-labelledby="about-story-heading">
      <StaggerContainer>
        {/* Header Section */}
        <StaggerItem>
          <div className="relative text-center py-3 max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="mb-6 relative"
            >
              <div className="relative">
                <Image
                  src="/assets/images/bread-trans.png"
                  alt="BreadTrans - Bảo bối bánh mì chuyển ngữ - Nền tảng học tiếng Anh online hiệu quả cho học sinh Việt Nam"
                  width={500}
                  height={750}
                  className="mx-auto shadow-2xl rounded-2xl transform transition-transform duration-300 hover:scale-105 w-full max-w-[280px] sm:max-w-[350px] md:max-w-[400px] lg:max-w-[500px]"
                  priority
                />
              </div>
            </motion.div>
            <motion.h1
              id="about-story-heading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold bg-gradient-to-r from-gray-800 via-blue-700 to-purple-700 bg-clip-text text-transparent mb-2 px-2"
            >
              BreadTrans 
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed px-2"
            >
              &quot;Bảo bối bánh mì chuyển ngữ&quot; đến từ tương lai 
            </motion.p>
          </div>
        </StaggerItem>

        {/* Story Section */}
        <StaggerItem>
          <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-12 md:py-16">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              viewport={{ once: true, margin: "-100px" }}
              className="relative group"
            >
              <div className="relative bg-gradient-to-br from-blue-50 via-indigo-50 to-amber-50 rounded-2xl p-4 sm:p-8 md:p-10 lg:p-12 shadow-xl border border-blue-100/50">
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  viewport={{ once: true }}
                  className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-800 mb-6 sm:mb-10 md:mb-12 flex flex-row items-center gap-2 sm:gap-4"
                >
                  <span className="text-4xl sm:text-5xl md:text-6xl flex-shrink-0" aria-hidden="true">🍞</span>
                  <span className="bg-gradient-to-r from-blue-700 via-purple-700 to-amber-700 bg-clip-text text-transparent">
                    Câu chuyện về BreadTrans
                  </span>
                </motion.h2>
                
                <div className="space-y-6 sm:space-y-8 text-gray-700 text-sm sm:text-base md:text-lg lg:text-xl leading-relaxed">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    viewport={{ once: true }}
                    className="relative pl-4 sm:pl-6 border-l-4 border-amber-400 bg-white/50 rounded-r-lg p-4 sm:p-6 shadow-md"
                  >
                    <p>
                      <strong className="text-amber-800 font-bold text-lg sm:text-xl">Bánh mì Chuyển ngữ</strong> là một bảo bối đến từ thế kỷ 22, sinh ra để giúp học sinh Việt Nam thoát mất gốc tiếng Anh nhanh chóng. Phương pháp học tiếng Anh online hiệu quả với flashcard, quiz và video tương tác.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4 }}
                    viewport={{ once: true }}
                    className="relative pl-4 sm:pl-6 border-l-4 border-orange-400 bg-white/50 rounded-r-lg p-4 sm:p-6 shadow-md"
                  >
                    <p>
                      <strong className="text-orange-800 font-bold text-lg sm:text-xl">Mỗi &ldquo;miếng bánh&rdquo;</strong> là một bài học được thiết kế giúp bạn học tiếng Anh tự nhiên như ăn bánh, không cần nhồi nhét. Bạn chỉ cần thưởng thức và kiến thức sẽ tự nhiên thấm vào tâm trí.
                    </p>
                  </motion.div>

                  

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    viewport={{ once: true }}
                    className="relative pl-4 sm:pl-6 border-l-4 border-blue-400 bg-white/50 rounded-r-lg p-4 sm:p-6 shadow-md"
                  >
                    <p>
                      <strong className="text-blue-800 font-bold text-lg sm:text-xl">Nhờ trải nghiệm nhẹ nhàng và thú vị,</strong> học sinh dần yêu thích học tiếng Anh, học lâu mà không chán. Mỗi bài học đều được thiết kế để tạo ra trải nghiệm vui vẻ.
                    </p>
                  </motion.div>
                  
                </div>
              </div>
            </motion.div>
          </div>
        </StaggerItem>
      </StaggerContainer>
    </section>
  );
}

