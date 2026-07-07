"use client";

import { useState } from "react";
import MembersList from "./MembersList";
import { OverallProgressTable } from "./OverallProgressTable";
import { QuizResultManager } from "./QuizResultManager";
import { ClassProvider } from "../context/ClassContext";
import { FiBookOpen, FiUser, FiMic } from "react-icons/fi";

export type ClassDetailTab = "members" | "listening" | "quiz" | "speaking" | "lookup" | "overall";

export const CLASS_DETAIL_TABS: { id: ClassDetailTab; label: string; icon: React.ReactElement }[] = [
  {
    id: "members",
    label: "Thành viên",
    icon: <FiUser className="w-4 h-4" />
  },
  {
    id: "quiz",
    label: "Quiz",
    icon: <FiBookOpen className="w-4 h-4" />
  },
  {
    id: "overall",
    label: "Speaking",
    icon: <FiMic className="w-4 h-4" />
  },
];

export function ClassDetailTabContent({
  activeTab,
}: {
  activeTab: ClassDetailTab;
}) {
  return (
    <div className="space-y-4">
      {(() => {
        switch (activeTab) {
          case "members":
            return <MembersList />;
          case "overall":
            return <OverallProgressTable />;
          case "quiz":
            return <QuizResultManager />;
          default:
            return (
              <p className="p-4 text-muted">
                Phần này đang được phát triển. Vui lòng quay lại sau.
              </p>
            );
        }
      })()}
    </div>
  );
}

export function ClassDetail({ classId }: { classId: string }) {
  const [activeTab, setActiveTab] = useState<ClassDetailTab>("members");

  return (
    <ClassProvider classId={classId}>
      <div className="container mx-auto">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-6 overflow-hidden">
          <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
            <div className="flex min-w-max w-full">
              {CLASS_DETAIL_TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap flex-1 min-w-0 relative ${isActive
                      ? "text-primary bg-primary/10"
                      : "text-gray-600 hover:text-primary hover:bg-gray-50"
                      }`}
                  >
                    <span className={`transition-colors ${isActive ? "text-primary" : "text-gray-400"}`}>
                      {tab.icon}
                    </span>
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <ClassDetailTabContent activeTab={activeTab} />
        </div>
      </div>
    </ClassProvider>
  );
}
