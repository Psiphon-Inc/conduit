package ca.psiphon.conduit.nativemodule.logging;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * LogsMaintenanceWorker is a periodic worker responsible for maintaining feedback files
 * within the application. This worker periodically deletes feedback files that are older
 * than a specified duration (DELETE_LOGS_AFTER_MILLIS) to free up space and ensure that
 * feedback files storage does not grow indefinitely.
 *
 * This worker is scheduled to run every REPEAT_INTERVAL_HOURS hours using WorkManager.
 * If there is an existing work request with the same unique name, it will cancel and
 * re-enqueue the new work request.
 */

public class LogsMaintenanceWorker extends Worker {
  static String TAG_WORK = LogsMaintenanceWorker.class.getSimpleName();
  static int REPEAT_INTERVAL_HOURS = 6;
  static long HOUR_IN_MS = 1000 * 60 * 60;

  static long DELETE_LOGS_AFTER_MILLIS = REPEAT_INTERVAL_HOURS * HOUR_IN_MS;


  static public void schedule(Context context) {
    PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
      LogsMaintenanceWorker.class, REPEAT_INTERVAL_HOURS, TimeUnit.HOURS)
      .build();

    WorkManager.getInstance(context.getApplicationContext())
      .enqueueUniquePeriodicWork(TAG_WORK,
        ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
        workRequest);
  }

  public LogsMaintenanceWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
    super(context, workerParams);
  }

  @NonNull
  @Override
  public Result doWork() {
    long cutOffTime = System.currentTimeMillis() - DELETE_LOGS_AFTER_MILLIS;
    LogFileUtils.deleteFeedbackLogsOlderThan(getApplicationContext(), cutOffTime);
    return Result.success();
  }
}
