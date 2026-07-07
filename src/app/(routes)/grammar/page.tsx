"use client";

import { MiluLoading } from "@/components/ui/LoadingSpinner";
import PageMotion from "@/components/ui/PageMotion";
import { GrammarTopic } from "@/constants/grammar";
import {
  CONTENT_KIND_LABEL,
  ContentTopic,
} from "@/modules/admin/services/content.service";
import { useContentTopics } from "@/modules/admin/hooks/useContentManagement";
import { GrammarPlayerSection, TopicSelector } from "@/modules/grammar";
import { syncImmersiveLight } from "@/lib/homeUiStore";
import { useEffect, useMemo, useState } from "react";

/** Map ContentTopic -> GrammarTopic (cùng cấu trúc; chỉ giữ field GrammarModal cần). */
const toGrammarTopic = (topic: ContentTopic): GrammarTopic => ({
  id: topic.id,
  title: topic.title,
  exercises: topic.exercises.map((ex) => ({
    exerciseNo: ex.exerciseNo,
    subNo: ex.subNo,
    title: ex.title,
    video: ex.video,
  })),
});

export default function GrammarPage() {
  const grammarsQuery = useContentTopics("grammars");

  const topics = useMemo<GrammarTopic[]>(
    () => (grammarsQuery.data ?? []).map(toGrammarTopic),
    [grammarsQuery.data]
  );

  const [selectedTopic, setSelectedTopic] = useState<GrammarTopic | null>(null);

  // Khi chọn 1 chủ đề -> ẩn sidebar (như xem phim) nhưng giữ theme sáng.
  useEffect(() => {
    syncImmersiveLight(!!selectedTopic);
    return () => {
      syncImmersiveLight(false);
    };
  }, [selectedTopic]);

  const isLoading = grammarsQuery.isLoading || grammarsQuery.isFetching;

  return (
    <PageMotion showLoading={false}>
      <div className="bg-white min-h-screen">
        {isLoading ? (
          <div className="max-w-6xl mx-auto">
            <MiluLoading fullScreen={false} />
          </div>
        ) : selectedTopic ? (
          <div className="w-full">
            <GrammarPlayerSection
              topic={selectedTopic}
              onClose={() => setSelectedTopic(null)}
              autoPlayVideo={true}
            />
          </div>
        ) : topics.length === 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
              <p className="text-sm text-gray-500">
                Chưa có nội dung {CONTENT_KIND_LABEL.grammars.toLowerCase()}.
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto">
            <TopicSelector
              topics={topics}
              onTopicSelect={setSelectedTopic}
            />
          </div>
        )}
      </div>
    </PageMotion>
  );
}
