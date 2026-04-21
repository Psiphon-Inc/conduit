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

import android.content.Context
import android.content.Intent
import android.os.Bundle

object IpcEventQueue {
    private const val MAX_PENDING_EVENTS = 100
    const val BROADCAST_ACTION_EVENT =
        "expo.modules.psiphontunnelcore.action.IPC_EVENT"

    data class PendingIpcEvent(
        val eventType: String,
        val eventData: Bundle,
    )

    private val lock = Any()
    private val pendingEvents = ArrayDeque<PendingIpcEvent>()

    fun enqueue(context: Context, eventType: String, eventData: Bundle) {
        val event = PendingIpcEvent(eventType, Bundle(eventData))
        synchronized(lock) {
            if (pendingEvents.size >= MAX_PENDING_EVENTS) {
                pendingEvents.removeFirst()
            }
            pendingEvents.addLast(event)
        }

        val intent = Intent(BROADCAST_ACTION_EVENT).apply {
            setPackage(context.packageName)
        }
        context.sendBroadcast(intent)
    }

    fun drainPending(): List<PendingIpcEvent> {
        synchronized(lock) {
            val drained = pendingEvents.map { event ->
                PendingIpcEvent(event.eventType, Bundle(event.eventData))
            }
            pendingEvents.clear()
            return drained
        }
    }
}
