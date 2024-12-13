/*
 * Copyright (c) 2024, Psiphon Inc.
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

import { base64url } from "@scure/base";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Platform,
    Pressable,
    Share,
    Text,
} from "react-native";

import { useInproxyCompartmentId } from "@/src/auth/hooks";
import { wrapError } from "@/src/common/errors";
import { jsonObjectToUint8Array, timedLog } from "@/src/common/utils";
import { PAIRING_LINK_URL } from "@/src/constants";
import { useConduitName } from "@/src/hooks";
import { useInproxyContext } from "@/src/inproxy/context";
import {
    InproxyPairingData,
    InproxyPairingDataSchema,
} from "@/src/inproxy/types";
import { palette, sharedStyles as ss } from "@/src/styles";

export function SharePairingLink() {
    const { t } = useTranslation();
    const { logErrorToDiagnostic } = useInproxyContext();

    const conduitCompartmentId = useInproxyCompartmentId();
    const conduitName = useConduitName();

    function formatShareData(): string | Error {
        if (conduitCompartmentId.isPending || conduitName.isPending) {
            // Shouldn't be possible as we don't render the Pressable that
            // invokes this function until these are set.
            return new Error(
                "Trying to format sharing data before data is ready",
            );
        }
        const inproxyPairingData = InproxyPairingDataSchema.safeParse({
            v: "1",
            data: {
                id: conduitCompartmentId.data,
                name: conduitName.data,
            },
        } as InproxyPairingData);
        if (!inproxyPairingData.success) {
            return wrapError(
                inproxyPairingData.error,
                "Could not load inproxy pairing data",
            );
        }
        return base64url.encode(
            jsonObjectToUint8Array(inproxyPairingData.data),
        );
    }

    function formatSharingLink(data: string): string | Error {
        return `${PAIRING_LINK_URL}/${data}`;
    }

    async function onShare(): Promise<void> {
        let sharingData = formatShareData();
        if (sharingData instanceof Error) {
            logErrorToDiagnostic(
                wrapError(sharingData, "Error formatting sharing data"),
            );
            return;
        }

        let sharingLink = formatSharingLink(sharingData);
        if (sharingLink instanceof Error) {
            logErrorToDiagnostic(
                wrapError(sharingLink, "Error formatting sharing link"),
            );
            return;
        }
        let message = t("SHARE_PAIRING_DATA_MESSAGE_I18N.string");

        // Android doesn't support a dedicated URL field, so we include the link in the message
        if (Platform.OS === "android") {
            message = `${message} ${sharingLink}`;
        }

        try {
            const result = await Share.share({
                message: message,
                url: sharingLink,
                title: t("SHARE_I18N.string"),
            });
            // Android also doesn't leave any information on this result object
            timedLog(
                `Shared pairing link ${result.action}: ${result.activityType}`,
            );
        } catch (error: any) {
            logErrorToDiagnostic(
                wrapError(error, "Failed to share pairing data"),
            );
        }
    }

    if (conduitCompartmentId.isPending || conduitName.isPending) {
        return <ActivityIndicator size={"small"} color={palette.white} />;
    }

    return (
        <Pressable
            style={[ss.rounded10, ss.padded, ss.whiteBg]}
            onTouchStart={onShare}
        >
            <Text style={[ss.boldFont, ss.centeredText, ss.blackText]}>
                {t("SHARE_PAIRING_LINK_I18N.string")}
            </Text>
        </Pressable>
    );
}
