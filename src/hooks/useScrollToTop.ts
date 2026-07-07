import { useEffect } from "react";

export default function useScrollToTop() {
  function scrollToTop() {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  useEffect(() => {
    scrollToTop();
  }, []);
}
