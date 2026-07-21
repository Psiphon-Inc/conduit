/*
 * Copyright (c) 2026, Psiphon Inc.
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
import { SoundEffect } from "@/src/sound/types";

// Metro bundles mp3 files by default (mp3 is in the default assetExts).
// On native the require result is a numeric asset module ID; on web it may
// resolve to a URI string or an object with a `uri` field (handled in
// player.web.ts).
export const soundAssets: Record<SoundEffect, number> = {
    stationGoingLive: require("@/assets/audio/station_going_live.mp3"),
    stationGoingOffline: require("@/assets/audio/station_going_offline.mp3"),
    warningAlert: require("@/assets/audio/warning_alert.mp3"),
    successConfirm: require("@/assets/audio/success_confirm.mp3"),
    copyToClipboard: require("@/assets/audio/copy_to_clipboard.mp3"),
};
