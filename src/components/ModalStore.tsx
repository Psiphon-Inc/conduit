/*
 * Copyright (c) 2025, Psiphon Inc.
 * All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */
import React from "react";
import { Modal, Platform, View } from "react-native";

interface ModalActions {
    /** Replace the current modal (clears stack). */
    openModal: (view: React.ReactNode) => void;
    /** Close the entire modal (clears stack). */
    closeModal: () => void;
    /** Push a new view on top of the current one; popModal returns to it. */
    pushModal: (view: React.ReactNode) => void;
    /** Pop back to the previous view, or close if the stack is empty. */
    popModal: () => void;
    isOpen: boolean;
}

interface ModalInternalContext extends ModalActions {
    stack: React.ReactNode[];
}

const ModalContext = React.createContext<ModalInternalContext | null>(null);

export function useModal(): ModalActions {
    const ctx = React.useContext(ModalContext);
    if (!ctx) {
        throw new Error("useModal must be used within a ModalProvider");
    }
    return ctx;
}

/**
 * Provides modal open/close/push/pop actions. Does NOT render the modal
 * itself — place a <ModalHost /> deeper in the tree where all app contexts
 * are available so modal content can access them.
 */
export function ModalProvider({ children }: { children: React.ReactNode }) {
    const [stack, setStack] = React.useState<React.ReactNode[]>([]);

    const openModal = React.useCallback((view: React.ReactNode) => {
        setStack([view]);
    }, []);

    const closeModal = React.useCallback(() => {
        setStack([]);
    }, []);

    const pushModal = React.useCallback((view: React.ReactNode) => {
        setStack((prev) => [...prev, view]);
    }, []);

    const popModal = React.useCallback(() => {
        setStack((prev) => {
            if (prev.length <= 1) {
                return [];
            }
            return prev.slice(0, -1);
        });
    }, []);

    const isOpen = stack.length > 0;

    const value = React.useMemo<ModalInternalContext>(
        () => ({ openModal, closeModal, pushModal, popModal, isOpen, stack }),
        [openModal, closeModal, pushModal, popModal, isOpen, stack],
    );

    return (
        <ModalContext.Provider value={value}>{children}</ModalContext.Provider>
    );
}

/**
 * Renders the actual modal. Place this inside the innermost provider
 * so modal content inherits all app contexts (ConduitActions, etc.).
 */
export function ModalHost() {
    const ctx = React.useContext(ModalContext);
    if (!ctx) {
        return null;
    }

    const topView =
        ctx.stack.length > 0 ? ctx.stack[ctx.stack.length - 1] : null;

    return (
        <Modal
            animationType="fade"
            visible={ctx.stack.length > 0}
            transparent={true}
            statusBarTranslucent={Platform.OS === "android"}
            onRequestClose={() => {}}
        >
            <View style={{ flex: 1, backgroundColor: "transparent" }}>
                {topView}
            </View>
        </Modal>
    );
}
