"use client";

import { createContext, useContext, ReactNode } from "react";
import { useClassMembers, useClassDetails, useClassMemberPresence } from "../hooks";
import { IClassMember, IClass } from "@/types";
import { useAuth } from "@/lib/auth/context";

interface ClassContextType {
    classId: string;
    members: IClassMember[] | undefined;
    isLoadingMembers: boolean;
    refetchMembers: () => void;

    classDetails: IClass | undefined;
    isLoadingDetails: boolean;
    refetchDetails: () => void;

    isOnline: (studentId: string) => boolean;
}

const ClassContext = createContext<ClassContextType | undefined>(undefined);

export function ClassProvider({ classId, children }: { classId: string; children: ReactNode }) {
    const { session } = useAuth();

    const {
        data: members,
        isLoading: isLoadingMembers,
        refetch: refetchMembers
    } = useClassMembers(classId);

    const {
        data: classDetails,
        isLoading: isLoadingDetails,
        refetch: refetchDetails
    } = useClassDetails(classId, session?.user.id || "");

    const { isOnline } = useClassMemberPresence(classId);

    const value: ClassContextType = {
        classId,
        members,
        isLoadingMembers,
        refetchMembers,

        classDetails: (classDetails as IClass) || undefined,
        isLoadingDetails,
        refetchDetails,

        isOnline,
    };

    return <ClassContext.Provider value={value}>{children}</ClassContext.Provider>;
}

export function useClassContext() {
    const context = useContext(ClassContext);
    if (context === undefined) {
        throw new Error("useClassContext must be used within a ClassProvider");
    }
    return context;
}
