"use client";

import { motion } from "framer-motion";
import { SafeImage as Image } from "@/components/ui/SafeImage";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { FiPhone } from "react-icons/fi";
import { useAuth } from "@/lib/auth/context";

export default function ContactPopup() {
  const pathname = usePathname();
  const { session } = useAuth();
  const zaloRef = useRef<HTMLButtonElement>(null);
  const phoneRef = useRef<HTMLButtonElement>(null);

  // Only show on homepage
  if (pathname !== "/") return null;

  // Ẩn popup khi đã đăng nhập
  if (session?.user) {
    return null;
  }

  const openZaloChat = () => {
    window.open("https://zalo.me/0377180010", "_blank");
  };

  const callPhone = () => {
    window.open("tel:0377180010", "_self");
  };

  return (
    <>
      {/* Contact Buttons Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 2 }}
        className="fixed bottom-18 right-2 z-40 flex flex-col gap-3"
      >
        {/* Zalo Button */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 2.2 }}
          className="flex justify-end"
        >
          <button
            ref={zaloRef}
            onClick={openZaloChat}
            className=" bg-primary text-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group relative"
          >
            <Image
              src="/assets/images/zalo.png"
              alt="Zalo"
              width={32}
              height={32}
              className="rounded-lg"
            />
          </button>
        </motion.div>

        {/* Phone Button */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 2.4 }}
          className="flex items-center gap-1"
        >
          {/* Phone Number */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 2.6 }}
            className="bg-white rounded-lg px-3 py-2 shadow-lg border border-gray-200 hidden md:block"
          >
            <p className="text-sm font-medium text-gray-800">0377180010</p>
          </motion.div>

          {/* Call Button */}
          <button
            ref={phoneRef}
            onClick={callPhone}
            className="bg-green-500 hover:bg-green-600 text-white p-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group relative"
          >
            <FiPhone size={32} />
          </button>
        </motion.div>
      </motion.div>
    </>
  );
}
