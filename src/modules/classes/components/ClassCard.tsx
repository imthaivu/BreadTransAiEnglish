"use client";

import { Button } from "@/components/ui/Button";
import { IClass } from "@/types";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { FiEdit, FiHeart, FiThumbsUp, FiX } from "react-icons/fi";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useUpdateClassLinks, useClassMemberPresence, useSendAdmiration } from "../hooks";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth/context";
import { getAllUserInfoFromLocalStorage } from "../api/presence";
import { AdmirationNotificationsContent } from "./AdmirationNotificationsContent";
import { useAdmirationsReceived } from "../hooks-admiration";
import { ProfileAvatarLink } from "@/components/ui/ProfileAvatarLink";

export function ClassCard({
  classItem,
  onUpdateClick,
}: {
  classItem: IClass;
  onUpdateClick?: () => void;
}) {
  const router = useRouter();
  const zaloLink = classItem?.links?.zalo;
  const meetLink = classItem?.links?.meet;
  const [noteProcess, setNoteProcess] = useState(classItem.noteProcess || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isCardActive, setIsCardActive] = useState(false);
  const [openReactionForId, setOpenReactionForId] = useState<string | null>(null);
  const [reactionMenuPosition, setReactionMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const nameRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [userInfoCache, setUserInfoCache] = useState<Record<string, { name: string; avatarUrl: string }>>({});
  
  const { mutateAsync: updateLinks, isPending } = useUpdateClassLinks();
  
  // Get current user (ClassCard dùng bởi giáo viên - chỉ GV mới gửi admiration cho học sinh)
  const { session, profile } = useAuth();
  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.name || profile?.displayName || "";
  const isCurrentUserTeacher = profile?.role === "teacher" || profile?.role === "admin";
  
  // Get presence for class members (online từ global RTDB presence)
  const { isOnline } = useClassMemberPresence(classItem.id);

  // Admirations received (inline, uses localStorage for fast display)
  const { items: admirationItems, isLoading: admirationLoading } = useAdmirationsReceived(currentUserId || undefined);
  
  // Send admiration mutation
  const { mutate: sendAdmiration, isPending: isSendingAdmiration } = useSendAdmiration();
  
  // Reactions cho ngưỡng mộ: haha +0, like +1, tim +1, wow +3
  const reactions = [
    {
      key: "haha" as const,
      label: "Haha",
      value: 0,
      color: "text-yellow-500",
      render: () => <span className="text-base leading-none">😂</span>,
    },
    {
      key: "like" as const,
      label: "Like",
      value: 1,
      color: "text-blue-500",
      render: () => <FiThumbsUp className="w-4 h-4" />,
    },
    {
      key: "heart" as const,
      label: "Tim",
      value: 1,
      color: "text-pink-500",
      render: () => <FiHeart className="w-4 h-4 fill-pink-500" />,
    },
    {
      key: "wow" as const,
      label: "Wow",
      value: 3,
      color: "text-orange-500",
      render: () => <span className="text-base leading-none">😱</span>,
    },
  ];
  
  // Load cache từ localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const allUserInfo = getAllUserInfoFromLocalStorage();
      const cache: Record<string, { name: string; avatarUrl: string }> = {};
      Object.entries(allUserInfo).forEach(([userId, info]) => {
        cache[userId] = {
          name: info.name,
          avatarUrl: info.avatarUrl || "",
        };
      });
      setUserInfoCache(cache);
    } catch (error) {
      console.error("Error loading user info cache:", error);
    }
  }, []);
  
  // Lấy studentIds từ class document
  const classStudentData = useMemo(() => {
    const students = (classItem.students || []) as Array<{studentId: string; name: string; avatarUrl?: string}>;
    if (students.length === 0) return { ids: [] as string[], studentMap: new Map<string, string>(), studentInfo: new Map<string, { name: string; avatarUrl: string }>() };
    
    const ids = students.map(s => s.studentId);
    const studentMap = new Map<string, string>();
    const studentInfo = new Map<string, { name: string; avatarUrl: string }>();
    students.forEach(s => {
      studentMap.set(s.studentId, s.name);
      studentInfo.set(s.studentId, { name: s.name, avatarUrl: s.avatarUrl || "" });
    });
    return { ids, studentMap, studentInfo };
  }, [classItem.students]);
  
  // Lấy teachers từ class document
  const classTeacherData = useMemo(() => {
    const teachers = (classItem.teachers || []) as Array<{ id: string; name: string; avatarUrl?: string }>;
    return teachers.map(t => ({
      id: t.id,
      name: t.name || "Giáo viên",
      avatarUrl: t.avatarUrl || "",
    }));
  }, [classItem.teachers]);
  
  // Members (students + teachers) từ class document; online tính qua isOnline().
  const membersFromPresence = useMemo(() => {
    const students = classStudentData.ids.map((studentId) => {
      const info = classStudentData.studentInfo?.get(studentId);
      const cachedInfo = userInfoCache[studentId];
      return {
        id: studentId,
        name:
          info?.name ||
          classStudentData.studentMap.get(studentId) ||
          cachedInfo?.name ||
          "Học sinh",
        avatarUrl: info?.avatarUrl || cachedInfo?.avatarUrl || "",
        role: "student" as const,
      };
    });

    const teachers = classTeacherData.map((teacher) => {
      const cachedInfo = userInfoCache[teacher.id];
      return {
        id: teacher.id,
        name: teacher.name || cachedInfo?.name || "Giáo viên",
        avatarUrl: teacher.avatarUrl || cachedInfo?.avatarUrl || "",
        role: "teacher" as const,
      };
    });

    return [...students, ...teachers];
  }, [classStudentData, classTeacherData, userInfoCache]);
  
  // Filter members by online status
  const { onlineMembers, offlineMembers } = useMemo(() => {
    const online: typeof membersFromPresence = [];
    const offline: typeof membersFromPresence = [];
    
    membersFromPresence.forEach((member) => {
      if (isOnline(member.id)) {
        online.push(member);
      } else {
        offline.push(member);
      }
    });
    
    return { onlineMembers: online, offlineMembers: offline };
  }, [membersFromPresence, isOnline]);
  
  // Danh sách thành viên cho UI dạng stories (students + teachers)
  const storyMembers = useMemo(() => {
    const members = [
      ...onlineMembers.map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        role: m.role,
      })),
      ...offlineMembers.map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        role: m.role,
      })),
    ];
    
    if (!currentUserId) return members;
    
    return members.sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return 0;
    });
  }, [onlineMembers, offlineMembers, currentUserId]);
  
  // Helper functions
  const getLastWord = (name: string): string => {
    if (!name) return "?";
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/);
    return words[words.length - 1] || trimmed;
  };
  
  const getLastWordInitial = (name: string): string => {
    const lastWord = getLastWord(name);
    return lastWord.charAt(0).toUpperCase();
  };
  
  // Update reaction menu position
  useEffect(() => {
    if (!openReactionForId) return;
    
    const updatePosition = () => {
      const element = nameRefs.current[openReactionForId];
      if (element) {
        const rect = element.getBoundingClientRect();
        setReactionMenuPosition({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 6,
        });
      }
    };
    
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [openReactionForId]);
  
  // Close menu when clicking outside
  useEffect(() => {
    if (!openReactionForId) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const element = nameRefs.current[openReactionForId];
      if (element && !element.contains(target) && !target.closest('[data-reaction-menu]')) {
        setOpenReactionForId(null);
        setReactionMenuPosition(null);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openReactionForId]);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only navigate if clicking on the card itself, not on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button, a, textarea, input')) {
      return;
    }
    router.push(`/classes/${classItem.id}`);
  };

  const handleCardMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target.closest('button, a, textarea, input')) {
      setIsCardActive(true);
    }
  };

  const handleCardMouseUp = () => {
    setIsCardActive(false);
  };

  const handleCardMouseLeave = () => {
    setIsCardActive(false);
  };

  // Sync state when classItem changes
  useEffect(() => {
    setNoteProcess(classItem.noteProcess || "");
    setIsEditing(false);
  }, [classItem.noteProcess]);

  const displayNoteProcess = noteProcess || "hi, iam milu";
  const hasChanges = noteProcess !== (classItem.noteProcess || "");

  const handleUpdateProgress = async () => {
    try {
      await updateLinks({
        classId: classItem.id,
        links: {
          zalo: zaloLink,
          meet: meetLink,
        },
        noteProcess: noteProcess,
      });
      toast.success("Cập nhật quá trình học tập thành công!");
      setIsEditing(false);
    } catch (error) {
      toast.error("Đã có lỗi xảy ra. Vui lòng thử lại.");
    }
  };

  return (
    <div
      onClick={handleCardClick}
      onMouseDown={handleCardMouseDown}
      onMouseUp={handleCardMouseUp}
      onMouseLeave={handleCardMouseLeave}
      className={`bg-white border rounded-xl overflow-hidden shadow-md hover:shadow-lg hover:bg-gray-50 transition-all duration-200 flex flex-col h-full cursor-pointer ${
        isCardActive ? 'bg-primary/10 border-primary/20' : 'border-gray-200'
      }`}
    >
      <div className={`p-5 flex-grow transition-colors ${
        isCardActive ? 'bg-primary/10' : ''
      }`}>
        <h3 className="text-2xl font-bold text-black mb-2 transition-colors">
          {classItem.name}
        </h3>
      </div>
      <div className={`border-t p-2 transition-colors ${
        isCardActive ? 'bg-primary/10 border-gray-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="grid grid-cols-1 gap-4">
          {/* Thành viên - hiển thị dạng stories */}
          <div className="space-y-2 overflow-visible">
            <div className="flex gap-3 overflow-x-auto overflow-y-visible pb-1 pt-5">
              {/* Avatar lớp với noteProcess - luôn hiển thị, mặc định "hi, iam milu" khi trống */}
              <div className="flex flex-col items-center gap-0.5 w-14 sm:w-16 flex-shrink-0 relative">
                <div className="relative flex flex-col items-center gap-0.5">
                  <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-visible flex items-center justify-center">
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-gray-100">
                      <Image
                        src="/assets/images/doraemon.png"
                        alt={classItem.name}
                        fill
                        sizes="(max-width: 640px) 40px, 44px"
                        className="object-cover rounded-full"
                      />
                    </div>
                    {/* Message bubble cho noteProcess */}
                    <div
                      className="absolute -top-5 -left-1 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md z-10 max-w-[80px] truncate cursor-pointer hover:bg-blue-600 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={displayNoteProcess}
                    >
                      {displayNoteProcess.length > 50 ? displayNoteProcess.substring(0, 50) + "..." : displayNoteProcess}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 justify-center w-full">
                  <span className="text-[11px] text-gray-700 truncate">
                    {classItem.name.length > 6 ? classItem.name.substring(0, 6) + "..." : classItem.name}
                  </span>
                </div>
              </div>
              
              {storyMembers.length === 0 ? (
                <p className="text-sm text-gray-400 italic flex items-center">
                  Chưa có thành viên
                </p>
              ) : (
                <>
                  {storyMembers.map((member) => {
                  const online = isOnline(member.id);
                  const isTeacher = member.role === "teacher";
                  const displayName = member.name || (isTeacher ? "Giáo viên" : "Học sinh");
                  const lastWord = getLastWord(displayName);
                  const lastWordInitial = getLastWordInitial(displayName);
                  const cachedInfo = userInfoCache[member.id];
                  const avatarUrl = member.avatarUrl || cachedInfo?.avatarUrl || "";
                  const isCurrentUser = currentUserId === member.id;
                  const canSendAdmiration = isCurrentUserTeacher && !isCurrentUser && member.role === "student" && !isSendingAdmiration;

                  return (
                    <div
                      key={member.id}
                      className="flex flex-col items-center gap-0.5 w-14 sm:w-16 flex-shrink-0"
                      title={displayName}
                    >
                      <div className="relative flex flex-col items-center gap-0.5">
                        <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-visible flex items-center justify-center">
                          <ProfileAvatarLink
                            userId={member.id}
                            className="relative block w-full h-full rounded-full overflow-hidden bg-gray-100"
                            ariaLabel={`Hồ sơ ${displayName}`}
                          >
                            {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={displayName}
                                fill
                                sizes="(max-width: 640px) 40px, 44px"
                                className="object-cover rounded-full"
                              />
                            ) : (
                              <span className="text-xs font-bold text-gray-700 flex items-center justify-center w-full h-full">
                                {lastWordInitial}
                              </span>
                            )}
                          </ProfileAvatarLink>
                          {online && (
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full z-[1]"></div>
                          )}
                        </div>
                      </div>

                      {canSendAdmiration ? (
                        <div className="relative flex flex-col items-center overflow-visible">
                          <div 
                            ref={(el) => {
                              nameRefs.current[member.id] = el;
                            }}
                            className="flex items-center gap-1 justify-center w-full cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openReactionForId === member.id) {
                                setOpenReactionForId(null);
                                setReactionMenuPosition(null);
                              } else {
                                const element = nameRefs.current[member.id];
                                if (element) {
                                  const rect = element.getBoundingClientRect();
                                  setReactionMenuPosition({
                                    x: rect.left + rect.width / 2,
                                    y: rect.bottom + 6,
                                  });
                                }
                                setOpenReactionForId(member.id);
                              }
                            }}
                            title="Tặng ngưỡng mộ (donate) cho học sinh"
                          >
                            <span className="text-[11px] truncate text-gray-700">
                              {lastWord}
                            </span>
                            {isTeacher && (
                              <span className="text-[8px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                GV
                              </span>
                            )}
                            <FiHeart className="w-2.5 h-2.5 flex-shrink-0 text-pink-500 fill-pink-500" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-center w-full">
                          <span className="text-[11px] text-gray-700 truncate">
                            {lastWord}
                          </span>
                          {isTeacher && (
                            <span className="text-[8px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                              GV
                            </span>
                          )}
                          <FiHeart className="w-2.5 h-2.5 text-pink-500 fill-pink-500 flex-shrink-0" />
                        </div>
                      )}
                    </div>
                  );
                  })}
                </>
              )}
            </div>
          </div>
          
          {/* Modal edit noteProcess */}
          {isEditing && (
            <div
              className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-32"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (e.target === e.currentTarget) {
                  setIsEditing(false);
                  setNoteProcess(classItem.noteProcess || "");
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <div
                className="bg-white rounded-lg p-4 max-w-md w-full shadow-xl relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Nút X đóng ở góc trên phải */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(false);
                    setNoteProcess(classItem.noteProcess || "");
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute top-3 right-3 text-red-500 hover:text-red-700 transition-colors"
                  title="Đóng"
                >
                  <FiX className="w-5 h-5" />
                </button>
                
                <div className="flex items-start gap-3 mb-3 pr-6">
                  <div className="relative w-10 h-10 flex-shrink-0 rounded-full overflow-hidden bg-gray-100">
                    <Image
                      src="/assets/images/doraemon.png"
                      alt={classItem.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-gray-900 mb-2">
                      {classItem.name}
                    </div>
              <textarea
                value={noteProcess}
                onChange={(e) => {
                  setNoteProcess(e.target.value);
                }}
                onFocus={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      placeholder="Viết ghi chú về quá trình học tập..."
                      rows={4}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-y"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUpdateProgress();
                }}
                    onMouseDown={(e) => e.stopPropagation()}
                disabled={isPending || !hasChanges}
                    className="flex items-center gap-1 text-xs"
                  >
                    {isPending ? "Đang lưu..." : "Xong"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Message */}
          <div className="pt-3 border-t border-dashed border-gray-200">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Message
            </h4>
            <div className="flex flex-col gap-2">
              <div
                className="rounded-lg border border-blue-100 bg-blue-50/50 p-2"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                
                <AdmirationNotificationsContent
                  items={admirationItems}
                  isLoading={admirationLoading}
                  userInfoCache={userInfoCache}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {zaloLink ? (
              <div className="relative">
                <a
                  href={zaloLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-blue-600 bg-blue-50 font-semibold rounded-xl hover:bg-blue-100 transition-colors w-full"
                  title="Mở nhóm Zalo"
                >
                  <Image
                    src={"/assets/images/zalo.png"}
                    alt="Zalo"
                    width={24}
                    height={24}
                  />
                  <span>Zalo</span>
                </a>
                {onUpdateClick && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateClick();
                    }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 min-w-[20px] min-h-[20px] p-0 rounded-full flex items-center justify-center bg-gray-300 text-gray-600 hover:bg-gray-400 transition-colors shadow-sm border-2 border-white z-10"
                    title="Chỉnh sửa link Zalo"
                  >
                    <FiEdit className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              onUpdateClick ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateClick();
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-colors cursor-pointer w-full"
                  title="Thêm link Zalo"
                >
                  <Image
                    src={"/assets/images/zalo.png"}
                    alt="Zalo"
                    width={24}
                    height={24}
                  />
                  <span>Add Zalo</span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 font-semibold rounded-xl border border-red-200 w-full">
                  <Image
                    src={"/assets/images/zalo.png"}
                    alt="Zalo"
                    width={24}
                    height={24}
                  />
                  <span>Add Zalo</span>
                </div>
              )
            )}

            {meetLink ? (
              <div className="relative">
                <a
                  href={meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-yellow-50 font-semibold rounded-xl hover:bg-yellow-100 transition-colors w-full"
                  title="Mở link Google Meet"
                >
                  <Image
                    src={"/assets/images/meet.png"}
                    alt="Google Meet"
                    width={24}
                    height={24}
                  />
                  <span>Meet</span>
                </a>
                {onUpdateClick && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateClick();
                    }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 min-w-[20px] min-h-[20px] p-0 rounded-full flex items-center justify-center bg-gray-300 text-gray-600 hover:bg-gray-400 transition-colors shadow-sm border-2 border-white z-10"
                    title="Chỉnh sửa link Meet"
                  >
                    <FiEdit className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              onUpdateClick ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateClick();
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-colors cursor-pointer w-full"
                  title="Thêm link Meet"
                >
                  <Image
                    src={"/assets/images/meet.png"}
                    alt="Google Meet"
                    width={24}
                    height={24}
                  />
                  <span>Add Meet</span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-red-50 font-semibold rounded-xl border border-red-200 w-full">
                  <Image
                    src={"/assets/images/meet.png"}
                    alt="Google Meet"
                    width={24}
                    height={24}
                  />
                  <span>Add Meet</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Reaction Menu Portal */}
      {typeof window !== "undefined" &&
        openReactionForId &&
        reactionMenuPosition &&
        (() => {
          const member = storyMembers.find((m) => m.id === openReactionForId);
          if (!member) return null;
          const isCurrentUser = currentUserId === member.id;
          const canSend = isCurrentUserTeacher && !isCurrentUser && member.role === "student" && !isSendingAdmiration;
          
          return createPortal(
            <div
              data-reaction-menu
              className="fixed z-[9999] pointer-events-none"
              style={{
                left: `${reactionMenuPosition.x}px`,
                top: `${reactionMenuPosition.y}px`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="flex items-center gap-1 rounded-full bg-white shadow-xl border border-gray-200 px-2 py-1 pointer-events-auto">
                {reactions.map((reaction) => (
                  <button
                    key={reaction.key}
                    disabled={!canSend}
                    onClick={() => {
                      if (!currentUserId || !currentUserName) return;
                      sendAdmiration({
                        fromStudentId: currentUserId,
                        fromStudentName: currentUserName,
                        fromStudentAvatarUrl: profile?.avatarUrl || "",
                        fromUserRole: profile?.role,
                        toStudentId: member.id,
                        toStudentName: member.name || (member.role === "teacher" ? "Giáo viên" : "Học sinh"),
                        classId: classItem.id,
                        reactionType: reaction.key,
                        reactionValue: reaction.value,
                      });
                      setOpenReactionForId(null);
                      setReactionMenuPosition(null);
                    }}
                    className={`flex flex-col items-center justify-center px-1 ${
                      canSend
                        ? "hover:bg-gray-50"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <span className={reaction.color}>
                      {reaction.render()}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          );
        })()}

    </div>
  );
}
