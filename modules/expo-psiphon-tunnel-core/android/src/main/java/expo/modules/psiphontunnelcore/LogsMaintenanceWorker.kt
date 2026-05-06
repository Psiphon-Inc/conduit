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
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class LogsMaintenanceWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    companion object {
        private const val TAG_WORK = "LogsMaintenanceWorker"
        private const val REPEAT_INTERVAL_HOURS = 6L
        private val DELETE_LOGS_AFTER_MILLIS = TimeUnit.HOURS.toMillis(REPEAT_INTERVAL_HOURS)

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<LogsMaintenanceWorker>(
                REPEAT_INTERVAL_HOURS,
                TimeUnit.HOURS,
            ).build()

            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(
                    TAG_WORK,
                    ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
                    request,
                )
        }
    }

    override fun doWork(): Result {
        FeedbackWorker.cleanupOldFeedbackFiles(
            applicationContext,
            System.currentTimeMillis() - DELETE_LOGS_AFTER_MILLIS,
        )
        return Result.success()
    }
}
