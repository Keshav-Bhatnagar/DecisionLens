"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PortfolioPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/overview");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F0E6] dark:bg-[#181614] font-newsreader text-lg text-[#1d1d1b] dark:text-[#F0EAE1]">
      Redirecting to Executive Overview...
    </div>
  );
}
