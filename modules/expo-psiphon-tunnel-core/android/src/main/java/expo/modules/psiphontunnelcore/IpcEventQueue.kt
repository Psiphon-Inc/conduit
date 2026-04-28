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

import android.os.Bundle
import android.os.Handler
import android.os.Looper

object IpcEventQueue {
    private const val MAX_PENDING_EVENTS = 100

    data class PendingIpcEvent(
        val eventType: String,
        val eventData: Bundle,
    )

    private val lock = Any()
    private val pendingEvents = ArrayDeque<PendingIpcEvent>()
    private val listeners = LinkedHashSet<() -> Unit>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var notificationPosted = false

    fun enqueue(eventType: String, eventData: Bundle) {
        val event = PendingIpcEvent(eventType, Bundle(eventData))
        var shouldPostNotification = false
        synchronized(lock) {
            if (pendingEvents.size >= MAX_PENDING_EVENTS) {
                pendingEvents.removeFirst()
            }
            pendingEvents.addLast(event)
            if (listeners.isNotEmpty() && !notificationPosted) {
                notificationPosted = true
                shouldPostNotification = true
            }
        }

        if (shouldPostNotification) {
            mainHandler.post {
                notifyListeners()
            }
        }
    }

    fun registerListener(listener: () -> Unit) {
        synchronized(lock) {
            listeners.add(listener)
        }
    }

    fun unregisterListener(listener: () -> Unit) {
        synchronized(lock) {
            listeners.remove(listener)
        }
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

    private fun notifyListeners() {
        val listenerSnapshot = synchronized(lock) {
            notificationPosted = false
            listeners.toList()
        }
        listenerSnapshot.forEach { listener -> listener() }
    }
}
