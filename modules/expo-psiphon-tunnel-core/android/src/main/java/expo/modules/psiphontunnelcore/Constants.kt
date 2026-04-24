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
 */
package expo.modules.psiphontunnelcore

object Constants {
    const val ONE_MB = 1 shl 20
    const val HALF_MB = 1 shl 19
    const val QUARTER_MB = 1 shl 18
    const val DATA_ROOT_DIRECTORY_NAME = "psiphon_data"

    const val INPROXY_PREFS = "PsiphonTunnelCoreInproxyPrefs"
    const val SERVICE_RUNNING_FLAG_KEY = "serviceRunning"
}
