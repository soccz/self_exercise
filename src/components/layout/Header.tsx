"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeaderProps {
    title?: string;
    showBack?: boolean;
    rightAction?: React.ReactNode;
    className?: string;
}

export function Header({ title, showBack, rightAction, className }: HeaderProps) {
    const router = useRouter();

    return (
        <header className={cn("sticky top-0 z-50 flex items-center h-14 px-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md", className)}>
            {showBack && (
                <button
                    onClick={() => router.back()}
                    className="p-1 -ml-2 mr-2 text-toss-grey-700 dark:text-gray-300 active:opacity-50"
                >
                    <ChevronLeft size={28} />
                </button>
            )}

            {title && (
                <h1 className="text-lg font-bold text-toss-grey-900 dark:text-white flex-1 truncate">
                    {title}
                </h1>
            )}

            {rightAction && (
                <div className="ml-auto">
                    {rightAction}
                </div>
            )}
        </header>
    );
}
