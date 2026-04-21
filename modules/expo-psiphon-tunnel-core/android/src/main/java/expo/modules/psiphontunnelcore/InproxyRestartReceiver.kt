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

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class InproxyRestartReceiver : BroadcastReceiver() {
    private val tag = "InproxyRestartReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        if (Utils.getServiceRunningFlag(context)) {
            Log.i(tag, "Restarting inproxy foreground service after $action")
            InproxyForegroundService.startWithLastParams(context)
        }
    }
}
