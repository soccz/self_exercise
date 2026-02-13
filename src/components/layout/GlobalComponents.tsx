"use client";

import { useUI } from "@/lib/ui/context";
import { WorkoutLogger } from "@/components/workout/WorkoutLogger";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { ToastStack } from "@/components/ui/Toast";
import { AppUnlock } from "@/components/security/AppUnlock";

export function GlobalComponents() {
    const { isLoggerOpen, closeLogger, isProfileEditorOpen, closeProfileEditor, toasts, isUnlockOpen, closeUnlock } = useUI();

    return (
        <>
            <WorkoutLogger isOpen={isLoggerOpen} onClose={closeLogger} />
            <ProfileEditor isOpen={isProfileEditorOpen} onClose={closeProfileEditor} />
            <AppUnlock isOpen={isUnlockOpen} onClose={closeUnlock} />
            <ToastStack items={toasts} />
        </>
    );
}
