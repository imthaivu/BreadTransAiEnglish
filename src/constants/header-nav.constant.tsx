import { UserRole } from "@/lib/auth/types";
import {
  FiBookOpen,
  FiEdit3,
  FiHome,
  FiLayers,
  FiUploadCloud,
} from "react-icons/fi";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  role?: UserRole[];
}

export const NavigationList = {
  public: [
    { href: "/", label: "Trang chủ", icon: <FiHome /> },
    { href: "/grammar", label: "Ngữ pháp", icon: <FiEdit3 /> },
    { href: "/flashcard", label: "Flashcard", icon: <FiBookOpen /> },
  ],
  student: [
    {
      href: "/classes",
      label: "Tên lớp",
      icon: <FiLayers />,
      role: ["student"],
    },
    {
      href: "/speaking-upload",
      label: "Nộp bài nói",
      icon: <FiUploadCloud />,
      role: ["student"],
    },
  ],
  teacher: [
    {
      href: "/classes",
      label: "Tên lớp",
      icon: <FiLayers />,
      role: ["teacher"],
    },
  ],
  admin: [
    {
      href: "/admin",
      label: "Admin",
      icon: <FiLayers />,
      role: ["admin"],
    },
  ],
};

// export const allNav: NavItem[] = [
//   { href: "/", label: "Trang chủ", icon: <FiHome /> },
//   { href: "/streamline", label: "Streamline", icon: <FiStar /> },
// ];

// export const moreFeatures: NavItem[] = [
//   {
//     href: "/lessons1000",
//     label: "1000 Bài luyện đọc/nghe",
//     icon: <FiLayers />,
//   },
//   { href: "/grammar", label: "Ngữ pháp", icon: <FiEdit3 /> },
//   { href: "/flashcard", label: "Flashcard", icon: <FiBookOpen /> },
// ];

// export const roleNav: NavItem[] = [
//   {
//     href: "/admin",
//     label: "Admin",
//     icon: <FiLayers />,
//     role: ["admin"],
//   },
//   {
//     href: "/classes",
//     label: "Lớp học",
//     icon: <FiLayers />,
//     role: ["teacher", "student"],
//   },
//   {
//     href: "/speaking-upload",
//     label: "Nộp bài nói",
//     icon: <FiUploadCloud />,
//     role: ["student"],
//   },
// ];
