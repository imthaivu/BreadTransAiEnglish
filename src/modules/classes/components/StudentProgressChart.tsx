"use client";

import { useMemo } from "react";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { BookProgress } from "@/modules/flashcard/types";
import { FiUser } from "react-icons/fi";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";

interface StudentProgressData {
  studentId: string;
  studentName: string;
  notDone: number; // Chưa làm (đỏ) - đã học tới nhưng chưa làm
  notReached: number; // Chưa học tới (xám nhạt) - chưa đến bài đó
  notPassed: number; // Chưa đạt < 90% (cam)
  passed: number; // Đạt >= 90% (xanh lá) - > 1 ngày
  recent: number; // Đạt >= 90% (xanh dương) - today
  notDoneLessons: number[]; // Danh sách bài chưa làm (đã học tới)
  notReachedLessons: number[]; // Danh sách bài chưa học tới
  notPassedLessons: Array<{ lessonId: number; accuracy: number }>; // Danh sách bài chưa đạt với accuracy
  passedLessons: number[]; // Danh sách bài đạt > 1 ngày
  recentLessons: number[]; // Danh sách bài đạt <= 1 ngày
  needCompleteLessons: number[]; // Bài chưa làm nhưng đã được giao Need Complete
}

interface StudentProgressChartProps {
  studentId: string;
  studentName: string;
  avatarUrl?: string;
  bookProgress: BookProgress | undefined;
  allLessons: number[]; // Tất cả các bài từ 1 đến maxLesson (mốc đo)
  maxLesson: number; // Mốc đo - bài làm nhiều nhất trong lớp
  notReachedLessons?: number[]; // Các bài chưa học tới (sau maxLesson)
  onClick?: () => void;
  isOnline?: boolean;
}

export function StudentProgressChart({
  studentId,
  studentName,
  avatarUrl,
  bookProgress,
  allLessons,
  notReachedLessons = [],
  onClick,
  isOnline,
}: StudentProgressChartProps) {
  const progressData = useMemo<StudentProgressData>(() => {
    const notDoneLessons: number[] = []; // Đã học tới nhưng chưa làm (từ 1 đến maxLesson)
    const notReachedLessons: number[] = []; // Chưa học tới (sau maxLesson)
    const notPassedLessons: Array<{ lessonId: number; accuracy: number }> = [];
    const passedLessons: number[] = []; // Đạt nhưng > 1 ngày
    const recentLessons: number[] = []; // Đạt <= 1 ngày
    let passed = 0;
    let recent = 0;
    const needCompleteSet = new Set(bookProgress?.needQuizs ?? []);

    const now = new Date();

    // Lặp qua tất cả các bài từ 1 đến maxLesson (mốc đo)
    allLessons.forEach((lessonId) => {
      const lessonData = bookProgress?.lessons?.[lessonId];
      
      if (bookProgress?.completedLessons?.includes(lessonId)) {
        // >= 90% = đạt
        if (lessonData?.lastAttempt) {
            const attemptDate = lessonData.lastAttempt.toDate();
            const isToday = attemptDate.getDate() === now.getDate() && 
                            attemptDate.getMonth() === now.getMonth() && 
                            attemptDate.getFullYear() === now.getFullYear();
            
            if (isToday) {
                recent++;
                recentLessons.push(lessonId);
            } else {
                passed++;
                passedLessons.push(lessonId);
            }
        } else {
           // Fallback nếu không có lastAttempt
           passed++;
           passedLessons.push(lessonId);
        }
      } else if (lessonData && 'lastAccuracy' in lessonData && typeof lessonData.lastAccuracy === 'number' && lessonData.lastAccuracy < 90) {
        // Có bài trong lessons, KHÔNG CÓ trong completedLessons VÀ field lastAccuracy tồn tại thực sự là số và < 90 = chưa đạt (cam)
        // Dù lastAttempt bao nhiêu ngày vẫn là cam
        notPassedLessons.push({
          lessonId,
          accuracy: lessonData.lastAccuracy,
        });
      } else {
        // Còn lại (chưa có trong completedLessons VÀ không có lastAccuracy hoặc lastAccuracy >= 90 mà chưa được cập nhật completedLessons) = chưa làm (đỏ)
        notDoneLessons.push(lessonId);
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
      notPassed: notPassedLessons.length,
      passed,
      recent,
      notDoneLessons,
      notReachedLessons,
      notPassedLessons,
      passedLessons,
      recentLessons,
      needCompleteLessons,
    };
  }, [studentId, studentName, bookProgress, allLessons]);

  // Tạo dữ liệu cho line chart - mỗi bài học là một điểm
  const lineChartData = useMemo(() => {
    const data: Array<{
      lessonId: number;
      status: "passed" | "notPassed" | "notDone" | "notReached" | "recent" | "needComplete";
      color: string;
    }> = [];

    // Tạo set để kiểm tra nhanh các bài chưa học tới
    const notReachedSet = new Set(notReachedLessons);

    // Thêm các bài từ 1 đến maxLesson
    allLessons.forEach((lessonId) => {
      // Kiểm tra xem bài này có phải là bài chưa học tới không
      if (notReachedSet.has(lessonId)) {
        data.push({
          lessonId,
          status: "notReached",
          color: "#9ca3af", // Xám nhạt - chưa học tới
        });
        return;
      }

      const lessonData = bookProgress?.lessons?.[lessonId];
      
      if (progressData.recentLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "recent",
          color: "#3b82f6", // Xanh dương - đạt today
        });
      } else if (progressData.passedLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "passed",
          color: "#10b981", // Xanh lá - đạt (> 5 ngày)
        });
      } else if (lessonData && 'lastAccuracy' in lessonData && typeof lessonData.lastAccuracy === 'number' && lessonData.lastAccuracy < 90) {
        data.push({
          lessonId,
          status: "notPassed",
          color: "#ea580c", // Cam đậm - chưa đạt
        });
      } else if (progressData.needCompleteLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "needComplete",
          color: "#93c5fd", // Xanh dương nhạt - đã giao Need Complete
        });
      } else {
        data.push({
          lessonId,
          status: "notDone",
          color: "#d1d5db", // Xám nhạt - đã học tới nhưng chưa làm
        });
      }
    });

    // Thêm các bài chưa học tới (sau maxLesson) - nếu có
    notReachedLessons.forEach((lessonId) => {
      // Chỉ thêm nếu chưa có trong allLessons
      if (!allLessons.includes(lessonId)) {
        data.push({
          lessonId,
          status: "notReached",
          color: "#9ca3af", // Xám nhạt - chưa học tới
        });
      }
    });

    // Sắp xếp theo lessonId
    return data.sort((a, b) => a.lessonId - b.lessonId);
  }, [bookProgress, allLessons, notReachedLessons, progressData.needCompleteLessons]);

  // Tính tổng số bài đã làm và đạt (>= 90%)
  const totalLessonsDone = progressData.passed + progressData.recent;
  
  // Tính toán cho SVG circle với đường line bao quanh
  const radius = 40;
  const innerRadius = 32; // Bán kính hình tròn trắng bên trong (tăng lên để chart mỏng lại)
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
    
    // Tính góc chênh lệch
    let sweepAngle = endAngle - startAngle;
    if (sweepAngle < 0) {
      sweepAngle += 2 * Math.PI;
    }
    
    // Nếu góc > 180 độ, cần dùng large arc flag
    const largeArcFlag = sweepAngle > Math.PI ? 1 : 0;
    
    // Vẽ sector dạng donut: bắt đầu từ điểm ngoài, vẽ arc ngoài, line vào trong, arc trong ngược lại, đóng lại
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
          
          {/* Draw full sectors around the circle - vẽ các phần đầy đủ (donut shape) */}
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
        
        {/* Center text - hiển thị số bài chưa làm - chưa đạt */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-normal font-bold leading-tight flex items-center justify-center gap-1">
              <span className="text-gray-500">
                {progressData.notDone - progressData.needCompleteLessons.length}
              </span>
              <span className="text-gray-400">-</span>
              <span className="text-blue-400">{progressData.needCompleteLessons.length}</span>
              <span className="text-gray-400">-</span>
              <span className="text-orange-700">{progressData.notPassed}</span>
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

// Export type for use in parent component
export type { StudentProgressData };

