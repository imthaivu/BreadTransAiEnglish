export interface SidebarItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/admin",
  },
  {
    id: "users",
    label: "Tài khoản",
    href: "/admin/users",
  },
  {
    id: "students",
    label: "Học sinh",
    href: "/admin/students",
  },
  {
    id: "teachers",
    label: "Giáo viên",
    href: "/admin/teachers",
  },
  {
    id: "classes",
    label: "Lớp học",
    href: "/admin/classes",
  },
  {
    id: "content",
    label: "Nội dung",
    href: "/admin/content",
  },
];
