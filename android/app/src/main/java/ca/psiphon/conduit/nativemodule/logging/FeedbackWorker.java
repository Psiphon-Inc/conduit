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

package ca.psiphon.conduit.nativemodule.logging;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.work.RxWorker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeMap;

import ca.psiphon.PsiphonTunnel;
import ca.psiphon.conduit.R;
import ca.psiphon.conduit.nativemodule.Utils;
import io.reactivex.Completable;
import io.reactivex.Flowable;
import io.reactivex.Single;

public class FeedbackWorker extends RxWorker {
  private static final String TAG = FeedbackWorker.class.getSimpleName();
  private static final int METADATA_VERSION = 2;

  private final String feedbackId;
  private final long feedbackTimestamp;
  private final String inproxyId;
  private Thread shutdownHook;


  /**
   * @param appContext   The application {@link Context}
   * @param workerParams Parameters to setup the internal state of this worker
   */
  public FeedbackWorker(@NonNull Context appContext, @NonNull WorkerParameters workerParams) {
    super(appContext, workerParams);
    feedbackId = workerParams.getInputData().getString("feedbackId");
    feedbackTimestamp = workerParams.getInputData().getLong("feedbackTimestamp", 0);
    inproxyId = workerParams.getInputData().getString("inproxyId");
  }

  @Override
  public void onStopped() {
    MyLog.i(TAG, "Feedback upload " + feedbackId + " stopped by the system.");
    super.onStopped();
  }

  @NonNull
  @Override
  public Single<Result> createWork() {
    // Guard against the upload being retried indefinitely if it continues to exceed the max
    // execution time limit of 10 minutes.
    if (this.getRunAttemptCount() > 10) {
      MyLog.e(TAG, "FeedbackUpload: " + feedbackId + " failed, exceeded 10 attempts");
      return Single.just(Result.failure());
    }

    MyLog.i(TAG, "Feedback " + feedbackId + " starting upload, attempt " + this.getRunAttemptCount());


    return psiphonConfigJsonSingle()
            .flatMapCompletable(configJson -> {
              String feedbackData = createFeedbackData(getApplicationContext(), configJson,
                      feedbackId, feedbackTimestamp, inproxyId);
              return sendFeedback(getApplicationContext(), configJson.toString(), feedbackData);
            })
            .andThen(Flowable.just(Result.success()))
            .firstOrError()
            .doOnSuccess(__ -> {
              MyLog.i(TAG, "Feedback " + feedbackId + " upload succeeded");
              // delete the feedback logs files
              LogFileUtils.deleteFeedbackLogsFiles(getApplicationContext(), feedbackId);
            })
            .onErrorReturn(error -> {
              MyLog.w(TAG, "Feedback " + feedbackId + " upload failed: " + error.getMessage());
              return Result.failure();
            });
  }

  private Single<JSONObject> psiphonConfigJsonSingle() {
    return Single.create(emitter -> {
      try {
        String configString = Utils.readRawResourceFileAsString(getApplicationContext(),
                R.raw.psiphon_config);

        JSONObject configJson = new JSONObject(configString);

        if (!emitter.isDisposed()) {
          emitter.onSuccess(configJson);
        }
      } catch (IOException e) {
        if (!emitter.isDisposed()) {
          emitter.onError(e);
        }
      }
    });
  }

  private static @NonNull String createFeedbackData(Context context, JSONObject psiphonConfigJson,
          String feedbackId,
          long feedbackTimestamp,
          String inproxyId) throws JSONException, IOException, PackageManager.NameNotFoundException {
    // Top level json object
    JSONObject feedbackJsonObject = new JSONObject();

    // Metadata
    JSONObject metadata = new JSONObject();

    metadata.put("platform", "android");
    metadata.put("version", METADATA_VERSION);
    metadata.put("id", feedbackId);
    metadata.put("date!!timestamp", LogUtils.getRfc3339Timestamp(feedbackTimestamp));
    metadata.put("appName", "conduit");

    // Add the metadata to the top level json object
    feedbackJsonObject.put("Metadata", metadata);

    // System info
    JSONObject sysInfo = new JSONObject();

    // Build info to be added to system info
    JSONObject sysInfo_Build = new JSONObject();

    sysInfo_Build.put("BRAND", Build.BRAND);
    sysInfo_Build.put("SUPPORTED_ABIS", TextUtils.join(",", Build.SUPPORTED_ABIS));
    sysInfo_Build.put("MANUFACTURER", Build.MANUFACTURER);
    sysInfo_Build.put("MODEL", Build.MODEL);
    sysInfo_Build.put("DISPLAY", Build.DISPLAY);
    sysInfo_Build.put("TAGS", Build.TAGS);
    sysInfo_Build.put("VERSION__CODENAME", Build.VERSION.CODENAME);
    sysInfo_Build.put("VERSION__RELEASE", Build.VERSION.RELEASE);
    sysInfo_Build.put("VERSION__SDK_INT", Build.VERSION.SDK_INT);

    // Add build info to system info
    sysInfo.put("Build", sysInfo_Build);

    String language;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      language = context.getResources().getConfiguration().getLocales().get(0).getLanguage();
    } else {
      language = context.getResources().getConfiguration().locale.getLanguage();
    }
    sysInfo.put("language", language);
    sysInfo.put("networkTypeName", Utils.getNetworkTypeName(context));

    // Add system info to the top level json object
    feedbackJsonObject.put("SystemInformation", sysInfo);

    // Application info
    JSONObject applicationInfo = new JSONObject();
    applicationInfo.put("applicationId", context.getPackageName());

    PackageInfo packageInfo = context.getPackageManager()
            .getPackageInfo(context.getPackageName(), 0);
    String versionCodeString = String.valueOf(packageInfo.versionCode);

    applicationInfo.put("clientVersion", versionCodeString);

    // Add application info to the top level json object
    feedbackJsonObject.put("ApplicationInfo", applicationInfo);

    // Psiphon info
    JSONObject psiphonInfo = new JSONObject();

    psiphonInfo.put("PROPAGATION_CHANNEL_ID", psiphonConfigJson.optString("PropagationChannelId"));
    psiphonInfo.put("SPONSOR_ID", psiphonConfigJson.optString("SponsorId"));
    // Also add CLIENT_VERSION to Psiphon info for backward compatibility
    psiphonInfo.put("CLIENT_VERSION", versionCodeString);
    psiphonInfo.put("INPROXY_ID", inproxyId);


    // Add Psiphon information to the top level json object
    feedbackJsonObject.put("PsiphonInfo", psiphonInfo);

    // Add combined logs
    JSONArray combinedLogs = getCombinedLogsJsonArray(context, feedbackId);
    feedbackJsonObject.put("Logs", combinedLogs);

    return feedbackJsonObject.toString();
  }

  private static JSONArray getCombinedLogsJsonArray(Context context, String feedbackId) throws IOException {
    // TreeMap to hold JSONObjects with timestamps as keys, automatically sorted by timestamp
    // Note we are using a List to handle duplicate timestamps
    TreeMap<Date, List<JSONObject>> sortedLogMap = new TreeMap<>();

    // Read and add tunnel core logs
    String tunnelCoreFeedbackFilePath = new File(LogFileUtils.feedBackLogsDir(context),
            LogFileUtils.LOG_TUNNEL_CORE_PREFIX + feedbackId + LogFileUtils.LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();
    readLogsIntoMap(new File(tunnelCoreFeedbackFilePath), sortedLogMap, true);

    // Read and add app logs
    String appFeedbackFilePath = new File(LogFileUtils.feedBackLogsDir(context),
            LogFileUtils.LOG_APP_PREFIX + feedbackId + LogFileUtils.LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();
    readLogsIntoMap(new File(appFeedbackFilePath), sortedLogMap, false);

    // Convert the sorted map values to JSONArray
    JSONArray sortedCombinedLogs = new JSONArray();
    for (Map.Entry<Date, List<JSONObject>> entry : sortedLogMap.entrySet()) {
      for (JSONObject logEntry : entry.getValue()) {
        sortedCombinedLogs.put(logEntry);
      }
    }

    return sortedCombinedLogs;
  }

  private static void readLogsIntoMap(File file, TreeMap<Date, List<JSONObject>> logMap, boolean isTunnelCoreLog) throws IOException {
    if (!file.exists()) {
      return;
    }

    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try {
          // Parse each line as a JSON object
          JSONObject inputJsonObject = new JSONObject(line);

          JSONObject outputJsonObject = new JSONObject();
          String timestampStr = inputJsonObject.getString("timestamp");

          Date timestamp = LogUtils.parseRfc3339Timestamp(timestampStr);

          if (isTunnelCoreLog) {
            outputJsonObject.put("timestamp!!timestamp", timestampStr);
            outputJsonObject.put("category", "tunnel-core");
            outputJsonObject.put("data", inputJsonObject);
          } else {
            outputJsonObject.put("timestamp!!timestamp", timestampStr);
            outputJsonObject.put("category", inputJsonObject.getString("tag"));
            outputJsonObject.put("message", inputJsonObject.getString("message"));
            outputJsonObject.put("level", inputJsonObject.getString("level"));
          }

          // Handle duplicate timestamps by adding to a list
          List<JSONObject> logList = logMap.get(timestamp);
          if (logList == null) {
            logList = new ArrayList<>();
            logMap.put(timestamp, logList);
          }
          logList.add(outputJsonObject);

        } catch (JSONException | ParseException e) {
          MyLog.e(TAG, "Failed to parse log line: " + line + ": " + e);
        }
      }
    }
  }

  private Completable sendFeedback(Context context, String psiphonConfig, String feedbackData) {
    return Completable.create(emitter -> {
      // Note that PsiphonTunnelFeedback instance cannot be reused after
      // PsiphonTunnelFeedback.shutdown() is called.
      final PsiphonTunnel.PsiphonTunnelFeedback psiphonTunnelFeedback = new PsiphonTunnel.PsiphonTunnelFeedback();
      emitter.setCancellable(() -> {
        MyLog.i(TAG, "Feedback " + feedbackId + " disposed");
        psiphonTunnelFeedback.shutdown();
        // Remove the shutdown hook since the underlying resources have been cleaned up by
        // psiphonTunnelFeedback.shutdown().
        if (this.shutdownHook != null) {
          boolean removed = Runtime.getRuntime().removeShutdownHook(this.shutdownHook);
          if (!removed) {
            // Hook was either never registered or already de-registered
            MyLog.i(TAG, "shutdown hook not de-registered");
          }
          this.shutdownHook = null;
        }
      });

      // Create a shutdown hook which stops the feedback upload operation to ensure that any
      // underlying resources are cleaned up in the event that the JVM is shutdown. This is
      // required to prevent possible data store corruption.
      this.shutdownHook = new Thread() {
        @Override
        public void run() {
          super.run();
          psiphonTunnelFeedback.shutdown();
          MyLog.i(TAG, "shutdown hook done");
        }
      };
      Runtime.getRuntime().addShutdownHook(this.shutdownHook);

      psiphonTunnelFeedback.startSendFeedback(
              context,
              new PsiphonTunnel.HostFeedbackHandler() {
                public void sendFeedbackCompleted(java.lang.Exception e) {
                  if (!emitter.isDisposed()) {
                    MyLog.i(TAG, "Feedback " + feedbackId + " completed");
                    if (e != null) {
                      emitter.onError(e);
                      return;
                    }
                    // Complete. This is the last callback invoked by PsiphonTunnel.
                    emitter.onComplete();
                  } else {
                    if (e != null) {
                      MyLog.w(TAG, "Feedback " + feedbackId + " completed with error but emitter disposed: " + e);
                      return;
                    }
                    MyLog.i(TAG, "Feedback " + feedbackId + " completed but emitter disposed");
                  }
                }
              },
              new PsiphonTunnel.HostLogger() {},
              psiphonConfig, feedbackData, "", "", "");
    });
  }
}
