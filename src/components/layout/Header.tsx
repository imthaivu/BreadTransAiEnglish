"use client";

import BackButton from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { NavigationList } from "@/constants";
import { useAuth } from "@/lib/auth/context";
import MagicDoor from "@/modules/home/components/MagicDoor";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AdmirationNotificationManager } from "@/components/notifications/AdmirationNotificationManager";

export default function Header() {
  const { session } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [showMagicDoor, setShowMagicDoor] = useState(false);
  const pathname = usePathname();

  // Close mobile menu when pressing Escape key
  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
        }
        if (isMoreMenuOpen) {
          setIsMoreMenuOpen(false);
        }
        if (showMagicDoor) {
          setShowMagicDoor(false);
        }
      }
    };

    if (
      isMobileMenuOpen ||
      isMoreMenuOpen ||
      showMagicDoor
    ) {
      document.addEventListener("keydown", handleEscapeKey);
    }

    return () => {
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [isMobileMenuOpen, isMoreMenuOpen, showMagicDoor]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isMoreMenuOpen) {
        const target = event.target as Element;
        if (!target.closest(".more-features-dropdown")) {
          setIsMoreMenuOpen(false);
        }
      }
    };

    if (isMoreMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMoreMenuOpen]);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Ẩn header khi đăng nhập thành công
  if (session?.user?.id) {
    return <AdmirationNotificationManager />;
  }

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Logo onCloseMobileMenu={closeMobileMenu} />
          {session?.user?.role === "admin" && NavigationList?.admin[0] && (
            <Link
              href={NavigationList.admin[0].href}
              className={`inline-flex items-center transition-all duration-200 px-3 py-1.5 rounded-lg ${
                pathname === NavigationList.admin[0].href
                  ? "text-primary  bg-primary/10 font-medium"
                  : "hover:text-primary hover: bg-primary/5"
              }`}
            >
              {NavigationList.admin[0].icon} {NavigationList.admin[0].label}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(!session?.user || !session?.user?.id) && (
            <div className="flex items-center gap-2">
              <Button onClick={() => setShowMagicDoor(true)}>Tham gia</Button>
            </div>
          )}

          {/* Mobile Menu Button */}
          {/* <button
            onClick={toggleMobileMenu}
            className="lg:hidden p-2 rounded-md transition-colors duration-200 text-foreground hover:text-primary hover:bg-border"
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
          </button> */}
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {/* <MobileMenu
        isMobileMenuOpen={isMobileMenuOpen}
        closeMobileMenu={closeMobileMenu}
        setShowMagicDoor={setShowMagicDoor}
        setShowLogoutConfirm={setShowLogoutConfirm}
      /> */}

      {/* Magic Door Modal */}
      <MagicDoor
        isOpen={showMagicDoor}
        onClose={() => setShowMagicDoor(false)}
        onLogin={() => {
          setShowMagicDoor(false);
        }}
      />

      {/* Admiration Notification Manager - handles toast notifications for new admirations */}
      <AdmirationNotificationManager />
    </header>
  );
}

// Logo Component
interface LogoProps {
  onCloseMobileMenu?: () => void;
}

function Logo({ onCloseMobileMenu }: LogoProps) {
  const logoContent = (
    <>
      <Image
        src="/assets/images/icon.ico"
        alt="Bread Translation"
        width={32}
        height={32}
        className="rounded-lg flex-shrink-0"
      />
      <span className="inline-block min-w-0 text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold tracking-tight whitespace-nowrap">
        BreadTrans
      </span>
    </>
  );

  return (
    <BackButton
      className="font-bold text-lg tracking-tight text-primary inline-flex items-center gap-2 min-w-0 max-w-full shrink"
      onClick={onCloseMobileMenu}
    >
      {logoContent}
    </BackButton>
  );
}

// Mobile Menu Component
// interface MobileMenuProps {
//   isMobileMenuOpen: boolean;
//   closeMobileMenu: () => void;
//   setShowMagicDoor: (show: boolean) => void;
//   setShowLogoutConfirm: (show: boolean) => void;
// }

// function MobileMenu({
//   isMobileMenuOpen,
//   closeMobileMenu,
//   setShowMagicDoor,
//   setShowLogoutConfirm,
// }: MobileMenuProps) {
//   const { role, session, profile } = useAuth();
//   const pathname = usePathname();

//   const navigationList = getNavigationByRole();

//   function getNavigationByRole() {
//     if (!role || role === "guest") {
//       return NavigationList.public;
//     }

//     switch (role) {
//       case "student":
//         return [...NavigationList.public, ...NavigationList.student];
//       case "teacher":
//         return NavigationList.teacher;
//       case "admin":
//         return NavigationList.admin;
//       default:
//         return NavigationList.public;
//     }
//   }

//   return (
//     <AnimatePresence>
//       {isMobileMenuOpen && (
//         <>
//           {/* Backdrop Overlay */}
//           <div
//             className="fixed inset-0 z-30 md:hidden"
//             onClick={closeMobileMenu}
//           />

//           {/* Menu Content */}
//           <motion.div
//             className="fixed top-16 left-0 right-0 z-40 lg:hidden shadow-lg bg-white border-t border-border"
//             initial={{ opacity: 0, y: -20 }}
//             animate={{ opacity: 1, y: 0 }}
//             exit={{ opacity: 0, y: -20 }}
//             transition={{ duration: 0.2, ease: "easeOut" }}
//           >
//             <div className="px-4 py-2 space-y-1">
//               {/* Navigation Links */}
//               {navigationList.map((item) => {
//                 const isActive = pathname === item.href;
//                 return (
//                   <Link
//                     key={item.href}
//                     href={item.href}
//                     onClick={closeMobileMenu}
//                     className={`flex items-center gap-3 px-3 py-2 text-sm md:text-base rounded-md transition-colors duration-200 ${
//                       isActive
//                         ? "text-primary  bg-primary/10 font-medium"
//                         : "text-foreground hover:text-primary hover:bg-border"
//                     }`}
//                   >
//                     {item.icon} {item.label}
//                   </Link>
//                 );
//               })}

//               {/* Divider */}
//               <div className="border-t border-border my-2"></div>

//               {/* User Actions */}
//               {!session?.user ? (
//                 <div className="space-y-2">
//                   <Button
//                     onClick={() => {
//                       setShowMagicDoor(true);
//                       closeMobileMenu();
//                     }}
//                     className="w-full justify-center"
//                   >
//                     Tham gia
//                   </Button>
//                 </div>
//               ) : (
//                 <div className="space-y-2">
//                   <Link
//                     href="/profile"
//                     onClick={closeMobileMenu}
//                     className="flex items-center gap-3 px-3 py-2 text-sm md:text-base text-foreground hover:text-primary hover:bg-border rounded-md transition-colors duration-200"
//                   >
//                     <FiUser />
//                     <span>
//                       {(profile as { displayName?: string; email?: string })
//                         ?.displayName ??
//                         (profile as { displayName?: string; email?: string })
//                           ?.email ??
//                         "Profile"}
//                     </span>

//                     {/* Role */}
//                     <span>- {translateRole(role as string)}</span>

//                     {/* Streak Count */}
//                     {profile?.streakCount && profile.streakCount > 0 && (
//                       <div
//                         className="flex items-center gap-1 text-orange-500 font-semibold"
//                         title={`Chuỗi ${profile.streakCount} ngày!`}
//                       >
//                         <FaFire />
//                         <span>{profile.streakCount}</span>
//                       </div>
//                     )}
//                   </Link>
//
// <Button
//   variant="outline"
//   onClick={() => {
//     setShowLogoutConfirm(true);
//     closeMobileMenu();
//   }}
//   className="w-full justify-center mt-2"
// >
//   <FiLogOut /> <span className="ml-2">Thoát</span>
// </Button>
