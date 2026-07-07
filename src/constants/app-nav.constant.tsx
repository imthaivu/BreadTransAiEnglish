import { FiCpu, FiEdit3, FiGrid, FiHome, FiLayers, FiUser } from "react-icons/fi";

export const APP_NAV_ITEMS = [
  { href: "/", label: "Home", icon: FiHome },
  { href: "/grammar", label: "Grammar", icon: FiEdit3 },
  { href: "/learn", label: "Learn", icon: FiGrid },
  { href: "/ai", label: "AI", icon: FiCpu },
  { href: "/classes", label: "Lớp học", icon: FiLayers },
  { href: "/profile", label: "Hồ sơ", icon: FiUser },
] as const;
