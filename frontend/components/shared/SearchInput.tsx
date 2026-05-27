"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  defaultValue?: string;
  className?: string;
}

export function SearchInput({ defaultValue = "", className }: SearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      router.push(`/search?q=${encodeURIComponent(value.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} role="search" className={cn("relative flex items-center", className)}>
      <Search
        className="pointer-events-none absolute left-4 size-4 text-[#767676]"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search for organic vegetables, fruits..."
        className="h-11 w-full rounded-full border border-[#efe8e4] bg-[#faf3ef] pl-11 pr-24 text-sm font-medium text-[#23403d] placeholder:text-[#767676] focus:border-[#23403d] focus:outline-none focus:ring-1 focus:ring-[#23403d]"
        aria-label="Search products"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="absolute right-[85px] inline-flex size-6 items-center justify-center rounded-full text-[#767676] hover:text-[#ec6e55]"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
      <button 
        type="submit"
        className="absolute right-1.5 h-8 rounded-full bg-[#23403d] px-5 text-xs font-bold text-white transition-colors hover:bg-[#ec6e55]"
      >
        Search
      </button>
    </form>
  );
}
