"use client";

import { useEffect } from "react";

export default function LoginRedirect() {
  useEffect(() => {
    window.location.replace("/auth");
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] text-[#6E655A] font-courier">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-[#7a4e10] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs uppercase tracking-wider font-bold">Opening DecisionLens Sign In...</span>
      </div>
    </div>
  );
}
