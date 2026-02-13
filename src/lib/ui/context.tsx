"use client";

import { createContext, useContext, useState } from "react";
import type { ToastItem, ToastType } from "@/components/ui/Toast";

interface UIContextType {
    isLoggerOpen: boolean;
    isProfileEditorOpen: boolean;
    isUnlockOpen: boolean;
    toasts: ToastItem[];
    openLogger: () => void;
    closeLogger: () => void;
    openProfileEditor: () => void;
    closeProfileEditor: () => void;
    openUnlock: () => void;
    closeUnlock: () => void;
    pushToast: (type: ToastType, message: string) => void;
}

const UIContext = createContext<UIContextType>({
    isLoggerOpen: false,
    isProfileEditorOpen: false,
    isUnlockOpen: false,
    toasts: [],
    openLogger: () => { },
    closeLogger: () => { },
    openProfileEditor: () => { },
    closeProfileEditor: () => { },
    openUnlock: () => { },
    closeUnlock: () => { },
    pushToast: () => { },
});

export function UIContextProvider({ children }: { children: React.ReactNode }) {
    const [isLoggerOpen, setIsLoggerOpen] = useState(false);
    const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
    const [isUnlockOpen, setIsUnlockOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const openLogger = () => setIsLoggerOpen(true);
    const closeLogger = () => setIsLoggerOpen(false);

    const openProfileEditor = () => setIsProfileEditorOpen(true);
    const closeProfileEditor = () => setIsProfileEditorOpen(false);

    const openUnlock = () => setIsUnlockOpen(true);
    const closeUnlock = () => setIsUnlockOpen(false);

    const pushToast = (type: ToastType, message: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const item: ToastItem = { id, type, message };
        setToasts((prev) => [item, ...prev].slice(0, 3));
        window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 2600);
    };

    return (
        <UIContext.Provider value={{ isLoggerOpen, isProfileEditorOpen, isUnlockOpen, toasts, openLogger, closeLogger, openProfileEditor, closeProfileEditor, openUnlock, closeUnlock, pushToast }}>
            {children}
        </UIContext.Provider>
    );
}

export const useUI = () => useContext(UIContext);
