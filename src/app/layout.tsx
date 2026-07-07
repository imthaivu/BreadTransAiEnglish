import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { AppDataProvider } from "@/components/providers/AppDataProvider";
import { AuthProvider } from "@/lib/auth/context";
import { PresenceProvider } from "@/components/presence/PresenceProvider";
import { GlobalPresenceProvider } from "@/modules/presence";
import { MultiplayerProvider } from "@/modules/games/lobby";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "../styles/globals.css";

import { AppNav, Footer, Header, ContactPopup } from "@/components/layout";
import MainContent from "@/components/layout/MainContent";
import "@/styles/swiper-custom.css";
import "swiper/css";
import "swiper/css/effect-coverflow";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { SITE_CONFIG } from "@/constants/site.config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.url),
  title: {
    default: "BreadTrans - Nền tảng học tiếng Anh hiệu quả cho học sinh Việt Nam",
    template: "%s | BreadTrans",
  },
  description:
    "BreadTrans - Bảo bối bánh mì chuyển ngữ giúp học sinh Việt Nam học tiếng Anh hiệu quả từ lớp 6 đến lớp 12. Học từ vựng, ngữ pháp, phát âm qua flashcard, quiz và video tương tác. Luyện nói hàng ngày, nhận feedback từ giáo viên. Nền tảng giáo dục trực tuyến hàng đầu cho học sinh mất gốc tiếng Anh.",
  keywords: [
    "học tiếng Anh",
    "tiếng Anh online",
    "flashcard tiếng Anh",
    "học từ vựng",
    "ngữ pháp tiếng Anh",
    "phát âm tiếng Anh",
    "học tiếng Anh cho học sinh",
    "BreadTrans",
    "bánh mì chuyển ngữ",
    "giáo dục trực tuyến",
    "học tiếng Anh miễn phí",
    "tiếng Anh lớp 6-12",
    "học tiếng Anh giao tiếp",
    "khóa học tiếng Anh online",
    "luyện nói tiếng Anh",
    "học tiếng Anh hiệu quả",
    "tiếng Anh cho học sinh cấp 2",
    "tiếng Anh cho học sinh cấp 3",
    "học tiếng Anh mất gốc",
    "bảng xếp hạng tiếng Anh",
    "quiz tiếng Anh",
    "video học tiếng Anh",
    "học tiếng Anh qua flashcard",
    "phương pháp học tiếng Anh",
    "nền tảng học tiếng Anh",
  ],
  authors: [{ name: "BreadTrans" }],
  creator: "BreadTrans",
  publisher: "BreadTrans",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/assets/images/icon.png",
    apple: "/assets/images/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "vi_VN",
    url: SITE_CONFIG.url,
    siteName: "BreadTrans",
    title: "BreadTrans - Nền tảng học tiếng Anh hiệu quả cho học sinh Việt Nam",
    description:
      "Bảo bối bánh mì chuyển ngữ giúp học sinh Việt Nam học tiếng Anh hiệu quả từ lớp 6 đến lớp 12. Học từ vựng, ngữ pháp, phát âm qua flashcard, quiz và video tương tác. Luyện nói hàng ngày, nhận feedback từ giáo viên.",
    images: [
      {
        url: "/assets/images/bread-trans.png",
        width: 500,
        height: 750,
        alt: "BreadTrans - Bảo bối bánh mì chuyển ngữ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BreadTrans - Nền tảng học tiếng Anh hiệu quả",
    description:
      "Bảo bối bánh mì chuyển ngữ giúp học sinh Việt Nam học tiếng Anh hiệu quả",
    images: ["/assets/images/bread-trans.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add Google Search Console verification when available
    // google: "your-google-verification-code",
  },
  alternates: {
    canonical: SITE_CONFIG.url,
  },
  other: {
    google: "notranslate",
    translate: "no",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi-VN" className="notranslate no-translate" translate="no" data-scroll-behavior="smooth">
      <head>
        {/* Mobile-first viewport optimization */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <meta name="google" content="notranslate" />
        <meta name="translate" content="no" />
        <meta httpEquiv="Content-Language" content="vi-VN" />
        {/* Mobile optimizations */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900 notranslate min-h-screen flex flex-col`}
      >
        <ReactQueryProvider>
          <AuthProvider>
            <AppDataProvider>
            <PresenceProvider>
              <GlobalPresenceProvider>
              <MultiplayerProvider>
              <Header />
              <Suspense fallback={null}>
                <AppNav />
              </Suspense>

              <MainContent>
                {children}
              </MainContent>
              <Footer />
              <ContactPopup />
              <Toaster position="bottom-left" />
              </MultiplayerProvider>
              </GlobalPresenceProvider>
            </PresenceProvider>
            </AppDataProvider>
          </AuthProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
