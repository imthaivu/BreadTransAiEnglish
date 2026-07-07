"use client";

import { LearnChrome } from "@/components/layout/LearnChrome";
import { LearnSelectionProvider } from "@/components/layout/LearnSelectionProvider";
import { LearnTabProvider, useLearnTab } from "@/components/layout/LearnTabProvider";
import { useLearnSessionActive } from "@/lib/homeUiStore";
import type { LearnTabId } from "@/lib/learn-tabs";
import { RequireAuth } from "@/lib/auth/guard";
import { Suspense } from "react";
import dynamic from "next/dynamic";

const FlashcardPage = dynamic(
  () => import("@/modules/flashcard/screens/FlashcardScreen"),
  { ssr: true }
);

const SpeakingUploadPage = dynamic(
  () => import("@/modules/speaking-upload/screens/SpeakingUploadScreen"),
  { ssr: true }
);

function LearnPageSpinner() {
  return (
    <div className="flex justify-center items-center py-12">
      <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

function StoriesPageContent() {
  const { activeTab } = useLearnTab();
  const isLearnSessionActive = useLearnSessionActive();

  return (
    <main className="bg-gradient-to-br bg-white rounded-xl">
      {!isLearnSessionActive ? (
        <div className="max-w-6xl mx-auto lg:px-6 ">
          <LearnChrome />
        </div>
      ) : null}
      <div
        className={
          isLearnSessionActive
            ? "w-full"
            : "max-w-6xl mx-auto lg:px-6"
        }
      >
        <Suspense fallback={<LearnPageSpinner />}>
          {activeTab === "vocabulary" ? (
            <FlashcardPage key="vocabulary" />
          ) : (
            <SpeakingUploadPage key="speaking" />
          )}
        </Suspense>
      </div>
    </main>
  );
}

export function LearnStoriesPage({
  initialTab,
}: {
  initialTab?: LearnTabId;
}) {
  return (
    <RequireAuth>
      <Suspense fallback={<LearnPageSpinner />}>
        <LearnTabProvider initialTab={initialTab}>
          <LearnSelectionProvider>
            <StoriesPageContent />
          </LearnSelectionProvider>
        </LearnTabProvider>
      </Suspense>
    </RequireAuth>
  );
}

export default function StoriesPage() {
  return <LearnStoriesPage />;
}
