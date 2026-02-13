"use client";

import { Home, PlusCircle, BarChart2, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUI } from "@/lib/ui/context";

const NAV_ITEMS = [
    { label: "홈", icon: Home, href: "/" },
    { label: "기록", icon: PlusCircle, href: "/log" },
    { label: "분석", icon: BarChart2, href: "/analytics" },
    { label: "내 정보", icon: User, href: "/profile" },
];

export function BottomNav() {
    const pathname = usePathname();
    const { openLogger } = useUI();

    return (
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 border-t border-toss-grey-100 dark:border-gray-800 pb-safe z-40">
            <div className="flex justify-around items-center h-16">
                {NAV_ITEMS.map((item) => {
                    const isActive = pathname === item.href;
                    const isAction = item.label === "기록";

                    return (
                        <Link
                            key={item.href}
                            href={isAction ? "#" : item.href}
                            onClick={(e) => {
                                if (isAction) {
                                    e.preventDefault();
                                    openLogger();
                                }
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                isActive ? "text-toss-grey-900 dark:text-white" : "text-toss-grey-400"
                            )}
                        >
                            <item.icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
