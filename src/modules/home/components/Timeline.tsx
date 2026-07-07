"use client";

import { motion } from "framer-motion";
import "./Timeline.css";

const timelineData = [
  {
    id: "month-1",
    title: "Sau 1 tháng",
    items: [
      "Nắm lại phát âm và ngữ pháp cơ bản.",
      "Đọc và hiểu được câu đơn giản.",
      "Không còn sợ môn tiếng Anh.",
    ],
  },
  {
    id: "month-3-6",
    title: "Sau 3–6 tháng",
    items: [
      "Điểm kiểm tra trên lớp cải thiện rõ ràng.",
      "Làm được phần lớn bài tập trong sách giáo khoa.",
      "Nghe và nói được câu giao tiếp cơ bản.",
    ],
  },
  {
    id: "year-1",
    title: "Sau 1 năm",
    items: [
      "Đạt mức khá hoặc giỏi nếu học đều.",
      "Nền tảng ngữ pháp và từ vựng vững.",
      "Giao tiếp chậm, rõ ràng trong tình huống quen thuộc.",
    ],
  },
  {
    id: "year-2-3",
    title: "Sau 2–3 năm",
    items: [
      "Làm tốt đề thi chuyển cấp hoặc đại học.",
      "Có nền tảng để ôn các chứng chỉ như TOEIC hoặc IELTS.",
    ],
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.6,
      ease: "easeOut" as const,
    },
  }),
};

export default function Timeline() {
  return (
    <section className="mb-8">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-4"
        >
          <h2 className="text-4xl font-black text-blue-900 mb-4">Lộ Trình Học Tiếng Anh</h2>
          
        </motion.div>

        <div className="timeline relative">
          {timelineData.map((item, index) => (
            <motion.div
              key={item.id}
              className={`card-about ${item.id} my-4 p-2 md:p-4`}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={index}
            >
              <h3 className="text-2xl font-bold text-blue-900 mb-4">
                {item.title}
              </h3>
              <ul className="space-y-2">
                {item.items.map((listItem, itemIndex) => (
                  <li
                    key={itemIndex}
                    className="text-blue-800 flex items-start gap-2"
                  >
                    <span className="text-blue-500 mt-1">✓</span>
                    <span>{listItem}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
