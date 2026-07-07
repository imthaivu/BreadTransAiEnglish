"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";

const faqs = [
  {
    question: "Con tôi mất gốc có học lại được không?",
    answer:
      "Có. Chương trình bắt đầu từ đánh vần, phát âm chuẩn, từ vựng và ngữ pháp đơn giản nhất. Học sinh yếu vẫn theo được vì học từ nền tảng.",
  },
  {
    question: "Bao lâu thì con tôi cải thiện?",
    answer:
      "1 tháng: nắm lại kiến thức cơ bản. 3 tháng: điểm trên lớp bắt đầu cải thiện. 6 tháng: đạt mức khá nếu học đều mỗi ngày. Mục tiêu đầu tiên: vững chương trình trên trường.",
  },
  {
    question: "Có luyện nghe và nói không?",
    answer:
      "Có. Học sinh luyện phát âm chuẩn ngay từ đầu và nộp bài nói thường xuyên để được chỉnh lỗi. Sau khoảng 1 năm học nghiêm túc, có thể giao tiếp cơ bản.",
  },
  {
    question: "Sau này có thi được chứng chỉ quốc tế không?",
    answer:
      "Khi nền tảng vững và học liên tục 2–3 năm, học sinh có thể đủ khả năng thi các chứng chỉ như TOEIC hoặc IELTS.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 mb-1"
      aria-labelledby="faq-heading"
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="text-center mb-8"
      >
        <h2
          id="faq-heading"
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-800 mb-4"
        >
          Câu Hỏi Thường Gặp
        </h2>
        
      </motion.div>

      <div className="space-y-4">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
            viewport={{ once: true }}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full px-6 py-4 text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
              aria-expanded={openIndex === index}
              aria-controls={`faq-answer-${index}`}
            >
              <h3 className="text-lg md:text-xl font-semibold text-gray-800 pr-4">
                {faq.question}
              </h3>
              <FiChevronDown
                className={`w-5 h-5 text-gray-600 flex-shrink-0 transition-transform duration-300 ${
                  openIndex === index ? "transform rotate-180" : ""
                }`}
              />
            </button>
            <div
              id={`faq-answer-${index}`}
              className={`overflow-hidden transition-all duration-300 ${
                openIndex === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <div className="px-6 pb-4 text-gray-700 leading-relaxed">
                {faq.answer}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

