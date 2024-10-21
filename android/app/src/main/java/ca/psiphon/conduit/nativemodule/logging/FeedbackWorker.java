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

import ca.psiphon.PsiphonTunnel;
import ca.psiphon.conduit.R;
import ca.psiphon.conduit.nativemodule.Utils;
import io.reactivex.Completable;
import io.reactivex.Flowable;
import io.reactivex.Single;

public class FeedbackWorker extends RxWorker {
  private static final String TAG = FeedbackWorker.class.getSimpleName();
  private static final int METADATA_VERSION = 1;

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
    metadata.put("inproxyID", inproxyId);

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


    // Add Psiphon information to the top level json object
    feedbackJsonObject.put("PsiphonInfo", psiphonInfo);

    // Read tunnel core logs
    JSONArray tunnelCoreLogs = getTunnelCoreLogsJsonArray(context, feedbackId);
    feedbackJsonObject.put("TunnelCoreLogs", tunnelCoreLogs);

    // Read app logs
    JSONArray appLogs = getAppLogsJsonArray(context, feedbackId);
    feedbackJsonObject.put("AppLogs", appLogs);

    return feedbackJsonObject.toString();
  }

  private static JSONArray getTunnelCoreLogsJsonArray(Context context, String feedbackId) throws IOException {
    String tunnelCoreFeedbackFilePath = new File(LogFileUtils.feedBackLogsDir(context),
            LogFileUtils.LOG_TUNNEL_CORE_PREFIX + feedbackId + LogFileUtils.LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();

    File file = new File(tunnelCoreFeedbackFilePath);
    if (!file.exists()) {
      return new JSONArray();
    }

    JSONArray jsonArray = new JSONArray();

    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try {
          // Each line is a JSON object
          JSONObject jsonObject = new JSONObject(line);
          // Only map `timestamp` to `timestamp!!timestamp`
          // The rest of the keys are left as is
          // Note that the `timestamp` for tunnel core notices is already in RFC3339 format
          jsonObject.put("timestamp!!timestamp", jsonObject.getString("timestamp"));
          // remove `timestamp` key
          jsonObject.remove("timestamp");
          jsonArray.put(jsonObject);
        } catch (JSONException e) {
          MyLog.e(TAG, "Failed to parse app log line: " + line + ": " + e);
        }
      }
    }

    return jsonArray;
  }

  private static JSONArray getAppLogsJsonArray(Context context, String feedbackId) throws IOException {
    String appFeedbackFilePath = new File(LogFileUtils.feedBackLogsDir(context),
            LogFileUtils.LOG_APP_PREFIX + feedbackId + LogFileUtils.LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();

    File file = new File(appFeedbackFilePath);
    if (!file.exists()) {
      return new JSONArray();
    }

    JSONArray jsonArray = new JSONArray();

    try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
      String line;
      while ((line = reader.readLine()) != null) {
        try {
          // Each line is a JSON object
          JSONObject input = new JSONObject(line);
          // Map the object to the expected format:
          //
        /*
            {
              <optional>"data": {
                  <any applicable structured data>
              },
              "message": "<tag>: <message>",
              "level": "<level>",
              "timestamp!!timestamp": "<timestamp>",
            }
         */

          JSONObject data = input.optJSONObject("data");
          String tag = input.getString("tag");
          String message = input.getString("message");
          String level = input.getString("level");
          // The `timestamp` for app logs is already in RFC3339 format
          String timestamp = input.getString("timestamp");

          JSONObject output = new JSONObject();
          // Optional data
          if (data != null) {
            output.put("data", data);
          }
          output.put("message", tag + ": " + message);
          output.put("level", level);
          output.put("timestamp!!timestamp", timestamp);

          jsonArray.put(output);
        } catch (JSONException e) {
          MyLog.e(TAG, "Failed to parse tunnel core log line: " + line + ": " + e);
        }
      }
    }
    return jsonArray;
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
