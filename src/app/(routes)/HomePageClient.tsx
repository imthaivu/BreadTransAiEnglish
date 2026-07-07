"use client";

import { useAuth } from "@/lib/auth/context";
import { UserRole } from "@/lib/auth/types";
import { FAQSection, Timeline } from "@/modules/home/components";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SITE_CONFIG } from "@/constants/site.config";
import {
  ContentThumbnailGrid,
  GrammarPlayerExerciseRef,
  MoviePlayerSection,
  ThumbnailGridItem,
  MusicPlayerSection,
} from "@/modules/grammar";
import {
  useContentTopics,
  useMusicLibrary,
} from "@/modules/admin/hooks/useContentManagement";
import {
  CONTENT_KIND_LABEL,
  ContentTopic,
  getMovieVariant,
  MusicSong,
} from "@/modules/admin/services/content.service";
import { GrammarTopic } from "@/constants/grammar";
import { resolveThumbnail } from "@/utils/youtube";
import { MiluLoading } from "@/components/ui/LoadingSpinner";
import {
  syncMovieImmersive,
  syncImmersiveLight,
} from "@/lib/homeUiStore";
import React from "react";
import toast from "react-hot-toast";
import {
  getBlockingTopicTitle,
  isTopicUnlocked,
  resolveEpisodeListIndex,
} from "@/modules/grammar/utils/movieProgress";
import { useStudentMovieWatchTracking } from "@/modules/grammar/hooks/useStudentMovieWatchTracking";

type HomeTabId = "movies" | "music";

const HOME_TABS: { id: HomeTabId; label: string; icon: string }[] = [
  { id: "movies", label: "Movie", icon: "🎬" },
  { id: "music", label: "Singing", icon: "🎵" },
];

type HomeTabUrlParam = "movies" | "music";

const tabFromUrlParam = (param: string | null): HomeTabId => {
  if (param === "music") return "music";
  return "movies";
};

const resolveHomeTabFromUrl = (params: URLSearchParams): HomeTabId => {
  if (params.has("song")) return "music";
  return tabFromUrlParam(params.get("tab"));
};

const tabToUrlParam = (tab: HomeTabId): HomeTabUrlParam => tab;

const parseExerciseFromUrl = (
  ep: string | null,
  sub: string | null
): GrammarPlayerExerciseRef | null => {
  if (!ep) return null;
  const exerciseNo = Number.parseInt(ep, 10);
  if (!Number.isFinite(exerciseNo)) return null;
  const subNo = sub ? Number.parseInt(sub, 10) : undefined;
  return {
    exerciseNo,
    subNo: Number.isFinite(subNo) ? subNo : undefined,
  };
};

const toGrammarTopic = (topic: ContentTopic): GrammarTopic => {
  const variant = getMovieVariant(topic);
  if (variant === "single") {
    const video = topic.video ?? topic.exercises[0]?.video ?? "";
    return {
      id: topic.id,
      title: topic.title,
      variant: "single",
      thumbnail: topic.thumbnail,
      video,
      exercises: [
        {
          exerciseNo: 1,
          title: topic.title,
          video,
        },
      ],
    };
  }
  return {
    id: topic.id,
    title: topic.title,
    variant: getMovieVariant(topic),
    thumbnail: topic.thumbnail,
    video: topic.video,
    exercises: topic.exercises.map((ex) => ({
      exerciseNo: ex.exerciseNo,
      subNo: ex.subNo,
      title: ex.title,
      video: ex.video,
    })),
  };
};

const songToGrammarTopic = (song: MusicSong, index: number): GrammarTopic => ({
  id: `music-${index}`,
  title: song.title,
  exercises: [
    {
      exerciseNo: 1,
      title: song.title,
      video: song.video,
    },
  ],
});

const movieToThumbnailItem = (topic: ContentTopic): ThumbnailGridItem => {
  const variant = getMovieVariant(topic);
  const grammarTopic = toGrammarTopic(topic);
  let thumbnailUrl: string | null = topic.thumbnail ?? null;
  if (!thumbnailUrl) {
    if (variant === "single" && topic.video) {
      thumbnailUrl = resolveThumbnail(topic.video);
    } else {
      const first = topic.exercises.find((ex) => ex.video);
      thumbnailUrl = first ? resolveThumbnail(first.video) : null;
    }
  }
  const episodeCount = variant === "single" ? 1 : topic.exercises.length;
  return {
    id: topic.id,
    title: topic.title,
    thumbnailUrl,
    variant,
    difficulty: topic.difficulty,
    episodeCount,
    topic: grammarTopic,
  };
};

const songToThumbnailItem = (song: MusicSong, index: number): ThumbnailGridItem => ({
  id: `music-${index}`,
  title: song.title,
  thumbnailUrl: resolveThumbnail(song.video, song.thumbnail),
  topic: songToGrammarTopic(song, index),
});

class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Home] section render error:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function HomePageInner() {
  // Add structured data for SEO
  useEffect(() => {
    // Educational Organization Schema
    const organizationData = {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: "BreadTrans",
      alternateName: "Bảo bối bánh mì chuyển ngữ",
      url: SITE_CONFIG.url,
      logo: SITE_CONFIG.getAssetUrl("/assets/images/bread-trans.png"),
      description:
        "Nền tảng học tiếng Anh hiệu quả cho học sinh Việt Nam. Học từ vựng, ngữ pháp, phát âm qua flashcard, quiz và video tương tác.",
      address: {
        "@type": "PostalAddress",
        addressCountry: "VN",
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: "breadtransenglish@gmail.com",
        telephone: "+84377180010",
        contactType: "Customer Service",
      },
      sameAs: [
        // Add social media links when available
      ],
      offers: {
        "@type": "Offer",
        price: "",
        priceCurrency: "VND",
        description: "Học phí ",
        availability: "https://schema.org/InStock",
      },
    };

    // WebSite Schema with SearchAction
    const websiteData = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "BreadTrans",
      url: SITE_CONFIG.url,
      description:
        "Nền tảng học tiếng Anh online hiệu quả cho học sinh Việt Nam từ lớp 6 đến lớp 12",
      inLanguage: "vi-VN",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_CONFIG.url}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };

    // Course Schema
    const courseData = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: "Khóa học tiếng Anh online BreadTrans",
      description:
        "Khóa học tiếng Anh online cho học sinh từ lớp 6 đến lớp 12. Bao gồm 8 buổi ngữ pháp + 8 buổi thực tế, quay video hàng ngày để sửa lỗi phát âm.",
      provider: {
        "@type": "EducationalOrganization",
        name: "BreadTrans",
        url: SITE_CONFIG.url,
      },
      offers: {
        "@type": "Offer",
        price: "1600000",
        priceCurrency: "VND",
        availability: "https://schema.org/InStock",
        priceValidUntil: "2025-12-31",
      },
      educationalLevel: "Secondary",
      teaches: [
        "Tiếng Anh giao tiếp",
        "Ngữ pháp tiếng Anh",
        "Từ vựng tiếng Anh",
        "Phát âm tiếng Anh",
      ],
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        reviewCount: "150",
        bestRating: "5",
        worstRating: "1",
      },
    };

    // FAQ Schema - Tăng SEO mạnh
    const faqData = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Con tôi mất gốc có học lại được không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Có. Chương trình bắt đầu từ đánh vần, phát âm chuẩn, từ vựng và ngữ pháp đơn giản nhất. Học sinh yếu vẫn theo được vì học từ nền tảng.",
          },
        },
        {
          "@type": "Question",
          name: "Bao lâu thì con tôi cải thiện?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "1 tháng: nắm lại kiến thức cơ bản. 3 tháng: điểm trên lớp bắt đầu cải thiện. 6 tháng: đạt mức khá nếu học đều mỗi ngày. Mục tiêu đầu tiên: vững chương trình trên trường.",
          },
        },
        {
          "@type": "Question",
          name: "Có luyện nghe và nói không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Có. Học sinh luyện phát âm chuẩn ngay từ đầu và nộp bài nói thường xuyên để được chỉnh lỗi. Sau khoảng 1 năm học nghiêm túc, có thể giao tiếp cơ bản.",
          },
        },
        {
          "@type": "Question",
          name: "Sau này có thi được chứng chỉ quốc tế không?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Khi nền tảng vững và học liên tục 2–3 năm, học sinh có thể đủ khả năng thi các chứng chỉ như TOEIC hoặc IELTS.",
          },
        },
      ],
    };

    // HowTo Schema - Lộ trình học
    const howToData = {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Cách học tiếng Anh hiệu quả với BreadTrans",
      description: "Hướng dẫn chi tiết cách học tiếng Anh hiệu quả cho học sinh Việt Nam từ lớp 6 đến lớp 12",
      image: SITE_CONFIG.getAssetUrl("/assets/images/bread-trans.png"),
      totalTime: "P1Y",
      estimatedCost: {
        "@type": "MonetaryAmount",
        currency: "VND",
        value: "19200000",
      },
      step: [
        {
          "@type": "HowToStep",
          position: 1,
          name: "Đăng ký tài khoản",
          text: "Truy cập breadtrans.edu.vn và đăng ký tài khoản học tiếng Anh online",
        },
        {
          "@type": "HowToStep",
          position: 2,
          name: "Học từ vựng qua Flashcard",
          text: "Sử dụng tính năng Flashcard/Quiz để học từ vựng tiếng Anh hiệu quả mỗi ngày",
        },
        {
          "@type": "HowToStep",
          position: 3,
          name: "Học ngữ pháp qua video",
          text: "Xem video bài giảng ngữ pháp tiếng Anh từ lớp 6 đến lớp 12",
        },
        {
          "@type": "HowToStep",
          position: 4,
          name: "Luyện nói hàng ngày",
          text: "Quay video nói tiếng Anh hàng ngày và nhận feedback từ giáo viên để sửa lỗi phát âm",
        },
        {
          "@type": "HowToStep",
          position: 5,
          name: "Theo dõi tiến độ",
          text: "Xem tiến độ học tập và nhận phản hồi từ giáo viên trong lớp học",
        },
      ],
    };

    // ItemList Schema - Menu items
    const itemListData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Các tính năng học tiếng Anh tại BreadTrans",
      description: "Danh sách các tính năng và công cụ học tiếng Anh online tại BreadTrans",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Flashcard / Trắc nghiệm",
          description: "Học từ vựng tiếng Anh hiệu quả qua flashcard và quiz tương tác",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Nộp bài nói",
          description: "Luyện nói tiếng Anh hàng ngày và nhận feedback từ giáo viên",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Trọn bộ ngữ pháp 6-12",
          description: "Học ngữ pháp tiếng Anh qua video bài giảng từ lớp 6 đến lớp 12",
        },
        {
          "@type": "ListItem",
          position: 4,
          name: "Vào lớp học",
          description: "Tham gia lớp học trực tuyến với giáo viên và bạn bè",
        },
        {
          "@type": "ListItem",
          position: 5,
          name: "Bảng xếp hạng",
          description: "Thi đua và xem thứ hạng trong lớp học",
        },
      ],
    };

    // Organization với AggregateRating
    const organizationWithRating = {
      ...organizationData,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        reviewCount: "150",
        bestRating: "5",
        worstRating: "1",
      },
      foundingDate: "2020",
      numberOfEmployees: {
        "@type": "QuantitativeValue",
        value: "10",
      },
    };

    const scripts = [
      { id: "org-schema", data: organizationWithRating },
      { id: "website-schema", data: websiteData },
      { id: "course-schema", data: courseData },
      { id: "faq-schema", data: faqData },
      { id: "howto-schema", data: howToData },
      { id: "itemlist-schema", data: itemListData },
    ];

    scripts.forEach(({ id, data }) => {
      const script = document.createElement("script");
      script.id = id;
      script.type = "application/ld+json";
      script.text = JSON.stringify(data);
      document.head.appendChild(script);
    });

    return () => {
      scripts.forEach(({ id }) => {
        const script = document.getElementById(id);
        if (script) {
          document.head.removeChild(script);
        }
      });
    };
  }, []);

  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const restoredFromUrlRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (session?.user?.role === "admin") {
      router.replace("/admin");
    }
  }, [authLoading, session?.user?.role, router]);

  const isLoggedIn = !!session?.user;
  const isTeacher = session?.user?.role === "teacher";
  const isStudent = session?.user?.role === UserRole.STUDENT;
  const studentId = isStudent ? session?.user?.id : undefined;
  const movieWatchTrackingQuery = useStudentMovieWatchTracking(studentId);
  const movieWatchViews = movieWatchTrackingQuery.data ?? [];
  const movieTrackingReady =
    !isStudent || !movieWatchTrackingQuery.isLoading;
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const pendingHomeTabRef = useRef<HomeTabId | null>(null);
  const [activeHomeTab, setActiveHomeTab] = useState<HomeTabId>(() => {
    if (typeof window !== "undefined") {
      return resolveHomeTabFromUrl(new URLSearchParams(window.location.search));
    }
    return "movies";
  });
  const [selectedContentTopic, setSelectedContentTopic] =
    useState<GrammarTopic | null>(null);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [autoPlayVideo, setAutoPlayVideo] = useState(false);
  const [initialExercise, setInitialExercise] =
    useState<GrammarPlayerExerciseRef | null>(null);
  /** Bài hát đang phát — giống selectedContentTopic của phim, không phụ thuộc useSearchParams. */
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);

  const readCurrentHomeParams = useCallback(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const replaceHomeUrl = useCallback(
    (
      mutate: (params: URLSearchParams) => void,
      options?: { push?: boolean }
    ) => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const before = params.toString();
      mutate(params);
      const after = params.toString();
      if (before === after) return;
      const safePath = pathname || "/";
      const next = after ? `${safePath}?${after}` : safePath;
      if (options?.push) {
        window.history.pushState(window.history.state, "", next);
        router.push(next, { scroll: false });
      } else {
        window.history.replaceState(window.history.state, "", next);
        router.replace(next, { scroll: false });
      }
    },
    [pathname, router]
  );

  const musicQueryEnabled = isLoggedIn && activeHomeTab === "music";
  const moviesQuery = useContentTopics("movies", isLoggedIn && activeHomeTab === "movies");
  const musicLibraryQuery = useMusicLibrary(musicQueryEnabled);

  const [musicAutoplay, setMusicAutoplay] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.has("song");
    }
    return false;
  });

  const activeSongIndex = selectedSongIndex ?? 0;

  const handleMusicSongSelect = useCallback(
    (index: number) => {
      setSelectedSongIndex(index);
      setMusicAutoplay(true);
      replaceHomeUrl((params) => {
        params.set("tab", "music");
        params.set("song", String(index));
        params.delete("movie");
        params.delete("ep");
        params.delete("sub");
      });
    },
    [replaceHomeUrl]
  );

  // Đồng bộ tab từ URL khi back/forward; không ghi đè khi user vừa bấm tab.
  useEffect(() => {
    const tab = resolveHomeTabFromUrl(new URLSearchParams(searchParams.toString()));
    if (pendingHomeTabRef.current !== null) {
      if (pendingHomeTabRef.current === tab) {
        pendingHomeTabRef.current = null;
      } else {
        return;
      }
    }
    setActiveHomeTab(tab);
  }, [searchParams]);

  // bfcache: đọc lại tab từ URL thật.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      pendingHomeTabRef.current = null;
      setActiveHomeTab(
        resolveHomeTabFromUrl(new URLSearchParams(window.location.search))
      );
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Reset music khi rời tab Singing.
  useEffect(() => {
    if (activeHomeTab !== "music") {
      setMusicAutoplay(false);
      setSelectedSongIndex(null);
    }
  }, [activeHomeTab]);

  const orderedMovieTopics = useMemo<GrammarTopic[]>(
    () => (moviesQuery.data ?? []).map(toGrammarTopic),
    [moviesQuery.data]
  );

  const movieThumbnailItems = useMemo<ThumbnailGridItem[]>(() => {
    const topics = moviesQuery.data ?? [];
    const allItems = topics.map((topic) => movieToThumbnailItem(topic));
    if (!isStudent) return allItems;

    const unlockedItems: ThumbnailGridItem[] = [];
    let nearestLocked: ThumbnailGridItem | null = null;

    for (let index = 0; index < allItems.length; index += 1) {
      const item = allItems[index];

      if (!movieTrackingReady) {
        if (index === 0) unlockedItems.push({ ...item, locked: false });
        if (index === 1) {
          const firstTitle = orderedMovieTopics[0]?.title;
          nearestLocked = {
            ...item,
            locked: true,
            unlockHint: firstTitle
              ? `Hoàn thành phim «${firstTitle}» để mở khóa phim mới`
              : "Hoàn thành phim trước để mở khóa phim mới",
          };
        }
        continue;
      }

      const unlocked = isTopicUnlocked(movieWatchViews, orderedMovieTopics, index);
      if (unlocked) {
        unlockedItems.push({ ...item, locked: false });
        continue;
      }

      if (!nearestLocked) {
        const blockingTitle = getBlockingTopicTitle(
          movieWatchViews,
          orderedMovieTopics,
          index
        );
        nearestLocked = {
          ...item,
          locked: true,
          unlockHint: blockingTitle
            ? `Hoàn thành phim «${blockingTitle}» để mở khóa phim mới`
            : "Hoàn thành phim trước để mở khóa phim mới",
        };
      }
      break;
    }

    return nearestLocked ? [...unlockedItems, nearestLocked] : unlockedItems;
  }, [
    moviesQuery.data,
    orderedMovieTopics,
    movieWatchViews,
    isStudent,
    movieTrackingReady,
  ]);

  const musicThumbnailItems = useMemo<ThumbnailGridItem[]>(
    () =>
      (musicLibraryQuery.data?.songs ?? []).map((song, index) =>
        songToThumbnailItem(song, index)
      ),
    [musicLibraryQuery.data]
  );

  const isContentTab = activeHomeTab === "movies" || activeHomeTab === "music";
  const isContentLoading =
    isContentTab &&
    (activeHomeTab === "movies"
      ? moviesQuery.isLoading || moviesQuery.isFetching
      : musicLibraryQuery.isLoading && !musicLibraryQuery.data);

  const contentThumbnailItems =
    activeHomeTab === "movies" ? movieThumbnailItems : musicThumbnailItems;

  const handleExerciseChange = useCallback(
    (exercise: GrammarPlayerExerciseRef | null) => {
      if (activeHomeTab !== "movies" || !selectedContentTopic) return;
      replaceHomeUrl((params) => {
        if (!exercise) {
          params.delete("ep");
          params.delete("sub");
          return;
        }
        params.set("ep", String(exercise.exerciseNo));
        if (exercise.subNo != null) {
          params.set("sub", String(exercise.subNo));
        } else {
          params.delete("sub");
        }
      });
    },
    [activeHomeTab, selectedContentTopic, replaceHomeUrl]
  );

  const handleContentItemSelect = (item: ThumbnailGridItem) => {
    if (!item.topic) return;
    if (activeHomeTab === "movies" && isStudent) {
      const topicIndex = orderedMovieTopics.findIndex((t) => t.id === item.id);
      if (
        topicIndex < 0 ||
        !isTopicUnlocked(movieWatchViews, orderedMovieTopics, topicIndex)
      ) {
        const blockingTitle = getBlockingTopicTitle(
          movieWatchViews,
          orderedMovieTopics,
          topicIndex
        );
        toast.error(
          blockingTitle
            ? `Hoàn thành phim «${blockingTitle}» để mở khóa phim mới`
            : "Hoàn thành phim trước để mở khóa phim mới"
        );
        return;
      }
    }
    setSelectedContentTopic(item.topic);
    setInitialExercise(null);
    setAutoPlayVideo(
      activeHomeTab === "music" || item.variant === "single"
    );
    if (activeHomeTab === "music") {
      const match = /^music-(\d+)$/.exec(item.id);
      if (match) {
        const index = Number.parseInt(match[1], 10);
        if (Number.isFinite(index) && index >= 0) {
          setSelectedSongIndex(index);
        }
      }
      setMusicAutoplay(true);
    }
    setIsContentModalOpen(true);
    replaceHomeUrl((params) => {
      params.set("tab", tabToUrlParam(activeHomeTab));
      params.delete("ep");
      params.delete("sub");
      if (activeHomeTab === "movies") {
        params.set("movie", item.id);
        params.delete("song");
      } else if (activeHomeTab === "music") {
        const match = /^music-(\d+)$/.exec(item.id);
        if (match) params.set("song", match[1]);
        params.delete("movie");
      }
    });
  };

  const handleCloseContentModal = () => {
    const closingMusicPlayer =
      activeHomeTab === "music" && selectedSongIndex != null;
    setIsContentModalOpen(false);
    setSelectedContentTopic(null);
    setAutoPlayVideo(false);
    setInitialExercise(null);
    setMusicAutoplay(false);
    setSelectedSongIndex(null);
    replaceHomeUrl((params) => {
      if (closingMusicPlayer) {
        params.set("tab", "music");
      }
      params.delete("movie");
      params.delete("song");
      params.delete("ep");
      params.delete("sub");
    });
  };

  const handleHomeTabChange = (tabId: HomeTabId) => {
    pendingHomeTabRef.current = tabId;
    setActiveHomeTab(tabId);
    setSelectedContentTopic(null);
    setSelectedSongIndex(null);
    setIsContentModalOpen(false);
    setInitialExercise(null);
    replaceHomeUrl((params) => {
      params.set("tab", tabToUrlParam(tabId));
      params.delete("movie");
      params.delete("song");
      params.delete("ep");
      params.delete("sub");
    });
  };

  // Khôi phục modal phim/nhạc từ URL sau F5 (một lần khi data đã load).
  useEffect(() => {
    if (!isLoggedIn || restoredFromUrlRef.current) return;

    const movieId =
      readCurrentHomeParams().get("movie") ?? searchParams.get("movie");
    const songParam =
      readCurrentHomeParams().get("song") ?? searchParams.get("song");

    if (activeHomeTab === "movies" && movieId) {
      if (moviesQuery.isLoading || moviesQuery.isFetching) return;

      const item = movieThumbnailItems.find((i) => i.id === movieId);
      restoredFromUrlRef.current = true;
      if (!item?.topic || item.locked) return;

      const exercise = parseExerciseFromUrl(
        searchParams.get("ep"),
        searchParams.get("sub")
      );
      const episodeListIndex = isStudent
        ? resolveEpisodeListIndex(movieWatchViews, item.topic, exercise)
        : item.topic.exercises.findIndex(
            (ex) =>
              exercise &&
              ex.exerciseNo === exercise.exerciseNo &&
              (ex.subNo ?? 0) === (exercise.subNo ?? 0)
          );
      const resolvedExercise =
        episodeListIndex >= 0 ? item.topic.exercises[episodeListIndex] : null;
      setSelectedContentTopic(item.topic);
      setInitialExercise(
        resolvedExercise
          ? {
              exerciseNo: resolvedExercise.exerciseNo,
              subNo: resolvedExercise.subNo,
            }
          : exercise
      );
      setAutoPlayVideo(
        item.variant === "single" || !!resolvedExercise || !!exercise
      );
      setIsContentModalOpen(true);
      return;
    }

    if (
      (activeHomeTab === "music" ||
        resolveHomeTabFromUrl(readCurrentHomeParams()) === "music") &&
      songParam
    ) {
      if (musicLibraryQuery.isLoading && !musicLibraryQuery.data) return;

      const index = Number.parseInt(songParam, 10);
      const songCount = musicLibraryQuery.data?.songs?.length ?? 0;
      restoredFromUrlRef.current = true;
      if (!Number.isFinite(index) || index < 0 || index >= songCount) return;

      setSelectedSongIndex(index);
      setMusicAutoplay(true);
      return;
    }

    if (activeHomeTab === "music" || songParam) {
      restoredFromUrlRef.current = true;
      return;
    }

    restoredFromUrlRef.current = true;
  }, [
    isLoggedIn,
    isStudent,
    movieWatchViews,
    movieWatchTrackingQuery.isLoading,
    activeHomeTab,
    searchParams,
    moviesQuery.isLoading,
    moviesQuery.isFetching,
    movieThumbnailItems,
    musicLibraryQuery.isLoading,
    musicLibraryQuery.data,
    readCurrentHomeParams,
  ]);

  const isMoviePlaying =
    activeHomeTab === "movies" && !!selectedContentTopic;
  const isMusicPlaying =
    activeHomeTab === "music" && selectedSongIndex != null;

  useEffect(() => {
    syncMovieImmersive(isMoviePlaying && isLoggedIn);
    return () => {
      syncMovieImmersive(false);
    };
  }, [isMoviePlaying, isLoggedIn]);

  // Music: ẩn sidebar + 4 tab Home khi đang nghe 1 bài (giữ theme sáng).
  useEffect(() => {
    syncImmersiveLight(isMusicPlaying && isLoggedIn);
    return () => {
      syncImmersiveLight(false);
    };
  }, [isMusicPlaying, isLoggedIn]);

  // Scroll to top khi quay về menu từ tính năng
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const prevPath = prevPathnameRef.current;
    const currentPath = pathname;

    // Kiểm tra nếu đang ở trang chủ và trước đó là một tính năng
    if (currentPath === "/" && prevPath && prevPath !== "/") {
      // Kiểm tra nếu prevPath là một tính năng (không phải trang chủ, admin, hoặc các route đặc biệt)
      const isFeaturePage = !prevPath.startsWith("/admin") && 
                           prevPath !== "/" && 
                           prevPath !== "/terms" &&
                           prevPath !== "/privacy";
      
      if (isFeaturePage) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }

    // Lưu pathname hiện tại cho lần render tiếp theo
    prevPathnameRef.current = currentPath;
  }, [pathname]);

  return (
    <>
      {!isLoggedIn && (
        <>
                
          {/* Learning Path Timeline */}
          <SectionErrorBoundary
            fallback={
              <section aria-label="Lộ trình học tiếng Anh" className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
                  Lộ trình học đang tạm gián đoạn trên thiết bị này. Bạn vẫn có thể bấm <strong>Tham gia</strong> để vào học.
                </div>
              </section>
            }
          >
            <section aria-label="Lộ trình học tiếng Anh">
              <Timeline />
            </section>
          </SectionErrorBoundary>

          

          {/* FAQ Section */}
          <SectionErrorBoundary
            fallback={
              <section aria-label="Câu hỏi thường gặp" className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 pb-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-700">
                  Nội dung FAQ đang tạm ẩn do lỗi hiển thị. Vui lòng thử tải lại trang hoặc cập nhật Safari.
                </div>
              </section>
            }
          >
            <section aria-label="Câu hỏi thường gặp">
              <FAQSection />
            </section>
          </SectionErrorBoundary>
        </>
      )}
      {isLoggedIn && (
        <section aria-label="Home" className="rounded-xl">
          <div
            className={`${
              isMoviePlaying
                ? "w-full max-w-none px-0 py-0"
                : activeHomeTab === "music"
                  ? "max-w-[1440px] px-1 sm:px-3 lg:px-4"
                  : "max-w-6xl lg:px-6"
            } mx-auto`}
          >
            {!isMoviePlaying && !isMusicPlaying && (
              <div className="mb-3 grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                {HOME_TABS.map((tab) => {
                  const isActive = activeHomeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleHomeTabChange(tab.id)}
                      className={`w-full min-w-0 truncate rounded-lg px-3 py-1.5 text-center text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                      aria-pressed={isActive}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {isContentLoading ? (
              <MiluLoading fullScreen={false} />
            ) : activeHomeTab === "movies" && selectedContentTopic ? (
              <MoviePlayerSection
                topic={selectedContentTopic}
                onClose={handleCloseContentModal}
                autoPlayVideo={autoPlayVideo}
                initialExercise={initialExercise}
                onExerciseChange={handleExerciseChange}
              />
            ) : isMusicPlaying ? (
              <MusicPlayerSection
                songs={musicLibraryQuery.data?.songs ?? []}
                activeSongIndex={activeSongIndex}
                onSongSelect={handleMusicSongSelect}
                autoPlay={musicAutoplay}
                onClose={handleCloseContentModal}
              />
            ) : contentThumbnailItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
                <p className="text-sm text-gray-500">
                  Chưa có nội dung {CONTENT_KIND_LABEL[activeHomeTab].toLowerCase()}.
                </p>
              </div>
            ) : (
              <ContentThumbnailGrid
                items={contentThumbnailItems}
                onSelect={handleContentItemSelect}
                groupByVariant={activeHomeTab === "movies"}
                searchPlaceholder={
                  activeHomeTab === "music"
                    ? "Tìm kiếm bài hát..."
                    : "Tìm kiếm phim..."
                }
                emptyMessage={`Chưa có nội dung ${CONTENT_KIND_LABEL[activeHomeTab].toLowerCase()}`}
              />
            )}
          </div>
        </section>
      )}

    </>
  );
}

export default function HomePageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <HomePageInner />
    </Suspense>
  );
}
