"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface MobileContainerProps {
    children: ReactNode;
    className?: string;
}

export function MobileContainer({ children, className }: MobileContainerProps) {
    return (
        <div className={cn("max-w-md mx-auto min-h-screen bg-white dark:bg-gray-900 shadow-xl overflow-hidden relative", className)}>
            {children}
        </div>
    );
}
