import { AdminLayout } from "@/modules/admin";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayoutWrapper({ children }: AdminLayoutProps) {
  return <AdminLayout>{children}</AdminLayout>;
}
