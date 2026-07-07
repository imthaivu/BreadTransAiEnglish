import { ReactNode } from "react";
import type { Metadata } from "next";
import { SITE_CONFIG } from "@/constants/site.config";
import { FeatureRoutesChrome } from "@/components/layout/FeatureRoutesChrome";

export const metadata: Metadata = {
  title: "BreadTrans - Bánh mì chuyển ngữ",
  description:
    "BreadTrans giúp học sinh luyện nói tiếng Anh hàng ngày, nhận feedback từ giáo viên.",
  keywords: [
    "học tiếng Anh online",
    "khóa học tiếng Anh",
    "học tiếng Anh cho học sinh",
    "tiếng Anh lớp 6-12",
    "flashcard tiếng Anh",
    "luyện nói tiếng Anh",
    "học từ vựng tiếng Anh",
    "ngữ pháp tiếng Anh",
    "phát âm tiếng Anh",
    "BreadTrans",
  ],
  openGraph: {
    title: "BreadTrans - Bánh mì chuyển ngữ",
    description:
      "BreadTrans giúp học sinh Việt Nam từ lớp 6 đến lớp 12 học tiếng Anh hiệu quả. Học từ vựng, ngữ pháp, phát âm qua flashcard, quiz và video tương tác. Luyện nói hàng ngày, nhận feedback từ giáo viên.",
    url: SITE_CONFIG.url,
    images: [
      {
        url: SITE_CONFIG.getAssetUrl("/assets/images/bread-trans.png"),
        width: 500,
        height: 750,
        alt: "BreadTrans - Bảo bối bánh mì chuyển ngữ - Nền tảng học tiếng Anh online",
      },
    ],
  },
  alternates: {
    canonical: SITE_CONFIG.url,
  },
};

interface RoutesLayoutProps {
  children: ReactNode;
}

export default function RoutesLayout({ children }: RoutesLayoutProps) {
  return <FeatureRoutesChrome>{children}</FeatureRoutesChrome>;
}
