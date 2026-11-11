"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OverviewRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portfolio");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F0E6] dark:bg-[#181614] font-newsreader text-base text-[#1d1d1b] dark:text-[#F0EAE1]">
      Redirecting to Decision Portfolio...
    </div>
  );
}
