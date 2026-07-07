"use client";

import { useMemo } from "react";
import { extractSpeakingScoreFromIssue } from "@/modules/speaking-upload/extractSpeakingScoreFromIssue";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { BookProgress } from "@/modules/flashcard/types";
import { FiUser } from "react-icons/fi";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";

export interface StudentSpeakingProgressData {
  studentId: string;
  studentName: string;
  notDone: number; // Chưa làm (đỏ) - <= maxLesson nhưng chưa có fileUrl
  notReached: number; // Chưa học tới (xám nhạt) - > maxLesson và chưa có fileUrl
  notPassed: number; // Đã chấm nhưng điểm < 7 (cam) — bao gồm cả "đã nộp nhưng chưa có nhận xét AI" (vì auto-evaluate sẽ xử lý sau)
  passed: number; // Đã nộp (xanh lá) - > 1 ngày
  recent: number; // Mới nộp (xanh dương) - today
  notDoneLessons: number[];
  notReachedLessons: number[];
  notPassedLessons: number[];
  passedLessons: number[];
  recentLessons: number[];
  needCompleteLessons: number[];
  listenedLessons: number[];
}

interface StudentSpeakingChartProps {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  bookProgress: BookProgress | undefined;
  allLessons: number[]; // Tất cả các bài của sách (ví dụ: 1 đến total)
  maxLesson: number; // Mốc đo - giá trị thanh kéo
  onClick?: () => void;
  isOnline?: boolean;
}

export function StudentSpeakingChart({
  studentId,
  studentName,
  avatarUrl,
  bookProgress,
  allLessons,
  maxLesson,
  onClick,
  isOnline,
}: StudentSpeakingChartProps) {
  
  const progressData = useMemo<StudentSpeakingProgressData>(() => {
    const notDoneLessons: number[] = [];
    const notReachedLessons: number[] = [];
    const notPassedLessons: number[] = [];
    const passedLessons: number[] = [];
    const recentLessons: number[] = [];
    const listenedLessons: number[] = [];
    let notPassed = 0;
    let passed = 0;
    let recent = 0;
    const needCompleteSet = new Set(bookProgress?.needSpeakings ?? []);
    const completedSpeakingSet = new Set(
      (bookProgress?.completedLessonsSpeaking ?? []) as number[]
    );

    const now = new Date();

    const parseSpeakingScore = (raw: unknown): number => {
      if (raw == null) return Number.NaN;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string" && raw.trim() !== "") {
        const n = Number(raw.replace(",", "."));
        return Number.isFinite(n) ? n : Number.NaN;
      }
      return Number.NaN;
    };

    const effectiveScoreFromLesson = (
      lesson: { speakingScore?: unknown; issueSpeaking?: string | null } | undefined
    ) => {
      if (!lesson) return Number.NaN;
      const issueSpeaking = lesson.issueSpeaking;
      let s = parseSpeakingScore(lesson.speakingScore);
      if (!Number.isFinite(s)) {
        s = extractSpeakingScoreFromIssue(
          typeof issueSpeaking === "string" ? issueSpeaking : undefined
        ) ?? Number.NaN;
      }
      return s;
    };

    allLessons.forEach((lessonId) => {
      const lessonData = bookProgress?.lessons?.[lessonId];
      const hasSpeakingSubmission = !!lessonData?.fileUrl || !!lessonData?.lastSubmitted;
      const listenCount = lessonData?.listenCount ?? 0;
      if (listenCount >= 1) {
        listenedLessons.push(lessonId);
      }

      // Bài nằm trong completedLessonsSpeaking: ưu tiên 3 trạng thái — đạt (≥7) / chưa đạt (<7) / chưa chấm (không có điểm từ field + issue)
      if (completedSpeakingSet.has(lessonId)) {
        const speakingScoreNum = effectiveScoreFromLesson(lessonData);
        if (Number.isFinite(speakingScoreNum) && speakingScoreNum >= 7) {
          if (lessonData?.lastSubmitted) {
            const submittedDate = lessonData.lastSubmitted.toDate();
            const isToday = submittedDate.getDate() === now.getDate() &&
              submittedDate.getMonth() === now.getMonth() &&
              submittedDate.getFullYear() === now.getFullYear();
            if (isToday) {
              recent++;
              recentLessons.push(lessonId);
            } else {
              passed++;
              passedLessons.push(lessonId);
            }
          } else {
            passed++;
            passedLessons.push(lessonId);
          }
        } else {
          notPassed++;
          notPassedLessons.push(lessonId);
        }
        return;
      }

      if (hasSpeakingSubmission) {
        const issueSpeaking = lessonData?.issueSpeaking;
        const hasIssueSpeaking = typeof issueSpeaking === "string" && issueSpeaking.trim().length > 0;
        let speakingScoreNum = parseSpeakingScore(lessonData?.speakingScore);
        if (!Number.isFinite(speakingScoreNum)) {
          const fromIssue = extractSpeakingScoreFromIssue(
            typeof issueSpeaking === "string" ? issueSpeaking : undefined
          );
          speakingScoreNum = fromIssue ?? Number.NaN;
        }

        // Điểm đã lưu (tay/đồng bộ) >= 7: coi là đạt, không cần nhận xét AI (tránh tô đỏ khi Done thủ công chỉ có speakingScore)
        if (Number.isFinite(speakingScoreNum) && speakingScoreNum >= 7) {
          if (lessonData?.lastSubmitted) {
            const submittedDate = lessonData.lastSubmitted.toDate();
            const isToday = submittedDate.getDate() === now.getDate() &&
              submittedDate.getMonth() === now.getMonth() &&
              submittedDate.getFullYear() === now.getFullYear();

            if (isToday) {
              recent++;
              recentLessons.push(lessonId);
            } else {
              passed++;
              passedLessons.push(lessonId);
            }
          } else {
            passed++;
            passedLessons.push(lessonId);
          }
          return;
        }

        if (!hasIssueSpeaking) {
          notPassed++;
          notPassedLessons.push(lessonId);
          return;
        }

        if (!Number.isFinite(speakingScoreNum) || speakingScoreNum < 7) {
          notPassed++;
          notPassedLessons.push(lessonId);
        }
        return;
      } else if (lessonId <= maxLesson) {
        notDoneLessons.push(lessonId);
      } else {
        notReachedLessons.push(lessonId);
      }
    });

    const needCompleteLessons = notDoneLessons.filter((lessonId) =>
      needCompleteSet.has(lessonId)
    );

    return {
      studentId,
      studentName,
      notDone: notDoneLessons.length,
      notReached: notReachedLessons.length,
      notPassed,
      passed,
      recent,
      notDoneLessons,
      notReachedLessons,
      notPassedLessons,
      passedLessons,
      recentLessons,
      needCompleteLessons,
      listenedLessons,
    };
  }, [studentId, studentName, bookProgress, allLessons, maxLesson]);

  // Tạo dữ liệu cho line chart - mỗi bài học là một điểm
  const lineChartData = useMemo(() => {
    const data: Array<{
      lessonId: number;
      status: "passed" | "notDone" | "notReached" | "recent" | "needComplete" | "listened" | "notPassed";
      color: string;
    }> = [];

    allLessons.forEach((lessonId) => {
      if (progressData.recentLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "recent",
          color: "#3b82f6", // Xanh dương - mới nộp today
        });
      } else if (progressData.passedLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "passed",
          color: "#10b981", // Xanh lá - đạt (> 5 ngày)
        });
      } else if (progressData.notPassedLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "notPassed",
          color: "#ea580c", // Cam đậm - đã chấm nhưng < 7
        });
      } else if (progressData.listenedLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "listened",
          color: "#eab308", // Vàng - nghe >= 1 lần (ưu tiên sau trạng thái đạt)
        });
      } else if (progressData.needCompleteLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "needComplete",
          color: "#93c5fd", // Xanh dương nhạt - đã giao Need Complete
        });
      } else if (progressData.notDoneLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "notDone",
          color: "#d1d5db", // Xám nhạt - chưa làm (trong phạm vi thanh kéo)
        });
      } else {
        data.push({
          lessonId,
          status: "notReached",
          color: "#9ca3af", // Xám nhạt - chưa tới
        });
      }
    });

    return data.sort((a, b) => a.lessonId - b.lessonId);
  }, [allLessons, progressData]);

  const totalLessonsDone = progressData.passed + progressData.recent;
  
  // Tính toán cho SVG circle với đường line bao quanh
  const radius = 40;
  const innerRadius = 32; // Bán kính hình tròn trắng bên trong
  const centerX = 50;
  const centerY = 50;
  
  // Tính toán các đoạn arc cho đường line bao quanh vòng tròn
  const arcSegments = useMemo(() => {
    if (lineChartData.length === 0) return [];
    
    const segments: Array<{
      startAngle: number;
      endAngle: number;
      color: string;
      lessonId: number;
    }> = [];
    
    const totalLessons = lineChartData.length;
    const anglePerLesson = (2 * Math.PI) / totalLessons;
    let currentAngle = -Math.PI / 2; // Bắt đầu từ trên cùng (-90 độ)
    
    lineChartData.forEach((item) => {
      const startAngle = currentAngle;
      const endAngle = currentAngle + anglePerLesson;
      
      segments.push({
        startAngle,
        endAngle,
        color: item.color,
        lessonId: item.lessonId,
      });
      
      currentAngle = endAngle;
    });
    
    return segments;
  }, [lineChartData]);
  
  // Helper function để vẽ sector (phần đầy đủ) với inner radius (hình tròn trắng bên trong)
  const createSectorPath = (startAngle: number, endAngle: number, outerRadius: number, innerRadius: number) => {
    // Điểm trên vòng tròn ngoài
    const outerStartX = centerX + outerRadius * Math.cos(startAngle);
    const outerStartY = centerY + outerRadius * Math.sin(startAngle);
    const outerEndX = centerX + outerRadius * Math.cos(endAngle);
    const outerEndY = centerY + outerRadius * Math.sin(endAngle);
    
    // Điểm trên vòng tròn trong
    const innerStartX = centerX + innerRadius * Math.cos(startAngle);
    const innerStartY = centerY + innerRadius * Math.sin(startAngle);
    const innerEndX = centerX + innerRadius * Math.cos(endAngle);
    const innerEndY = centerY + innerRadius * Math.sin(endAngle);
    
    let sweepAngle = endAngle - startAngle;
    if (sweepAngle < 0) {
      sweepAngle += 2 * Math.PI;
    }
    
    const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;
    
    return `M ${outerStartX} ${outerStartY} A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEndX} ${outerEndY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`;
  };

  return (
    <div
      className="flex flex-col items-center p-1 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-white"
      onClick={onClick}
    >
      {/* Circular Progress Chart with line segments */}
      <div className="relative w-32 h-32">
        <svg
          className="w-32 h-32"
          viewBox="0 0 100 100"
        >
          {/* Background circle */}
          <circle
            cx={centerX}
            cy={centerY}
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="2"
          />
          
          {/* Draw full sectors around the circle */}
          {arcSegments.map((segment, index) => {
            return (
              <path
                key={`segment-${segment.lessonId}-${index}`}
                d={createSectorPath(segment.startAngle, segment.endAngle, radius, innerRadius)}
                fill={segment.color}
                stroke={segment.color}
                strokeWidth="0.5"
                strokeLinejoin="round"
              />
            );
          })}
          
          {/* White circle bên trong để dễ nhìn số */}
          <circle
            cx={centerX}
            cy={centerY}
            r={innerRadius}
            fill="white"
            stroke="none"
          />
        </svg>
        
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-normal font-bold leading-tight flex items-center justify-center gap-1">
              <span className="text-gray-500">
                {progressData.notDone - progressData.needCompleteLessons.length}
              </span>
              <span className="text-gray-400">-</span>
              <span className="text-blue-400">{progressData.needCompleteLessons.length}</span>
            </div>
            {totalLessonsDone > 0 && (
              <div className="text-normal font-medium text-blue-600">
                {totalLessonsDone}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex flex-row items-center gap-2">
        <div className="relative w-6 h-6 rounded-full flex-shrink-0">
          <ProfileAvatarLink
            userId={studentId}
            stopPropagation
            className="block h-full w-full rounded-full overflow-hidden"
            ariaLabel={`Hồ sơ ${studentName}`}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={studentName} width={24} height={24} sizes="24px" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center">
                <FiUser className="w-3 h-3 text-primary" />
              </div>
            )}
          </ProfileAvatarLink>
          {isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full z-20"></div>
          )}
        </div>
        <span className="text-xs font-medium text-center truncate max-w-[80px]" title={studentName}>{studentName}</span>
      </div>
    </div>
  );
}
