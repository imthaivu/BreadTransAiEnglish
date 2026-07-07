"use client";

import { GrammarTopic } from "@/constants/grammar";
import { Input } from "@/components/ui/Input";
import { FiSearch } from "react-icons/fi";
import { useMemo, useState } from "react";

interface TopicSelectorProps {
  topics: GrammarTopic[];
  onTopicSelect: (topic: GrammarTopic) => void;
  className?: string;
}

// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export default function TopicSelector({
  topics,
  onTopicSelect,
  className = "",
}: TopicSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTopics = useMemo(() => {
    if (!searchQuery.trim()) return topics;
    const query = searchQuery.toLowerCase();
    const queryNoTones = removeVietnameseTones(query);
    
    return topics.filter((topic) => {
      const titleLower = topic.title.toLowerCase();
      const titleNoTones = removeVietnameseTones(titleLower);
      const topicId = topic.id.toString();
      
      return (
        titleLower.includes(query) ||
        titleNoTones.includes(queryNoTones) ||
        topicId.includes(query)
      );
    });
  }, [topics, searchQuery]);

  if (topics.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="text-center py-12">
          <h4 className="text-lg font-semibold text-gray-600 mb-2">
            Chưa có chủ đề nào
          </h4>
          <p className="text-gray-500">Đang tải dữ liệu ngữ pháp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} max-w-6xl mx-auto `}>
      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Tìm kiếm chủ đề ngữ pháp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        {searchQuery && (
          <p className="text-sm text-gray-500 mt-2">
            Tìm thấy {filteredTopics.length} chủ đề
          </p>
        )}
      </div>

      {/* Topics List - Compact Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filteredTopics.map((topic) => {
          const originalIndex = topics.findIndex((t) => t.id === topic.id);
          const isPhimTopic = topic.title.trimStart().startsWith("Phim");
          return (
            <button
              key={topic.id}
              onClick={() => onTopicSelect(topic)}
              className="text-left p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 hover:border-primary/30 transition-colors duration-150"
            >
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "flex-shrink-0 w-6 h-6 rounded text-xs font-semibold flex items-center justify-center",
                    isPhimTopic ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary",
                  ].join(" ")}
                >
                  {originalIndex + 1}
                </span>
                <span className="text-sm font-medium text-gray-800 line-clamp-2 flex-1">
                  {topic.title}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {filteredTopics.length === 0 && searchQuery && (
        <div className="text-center py-8 text-gray-500">
          Không tìm thấy chủ đề nào phù hợp
        </div>
      )}
    </div>
  );
}
