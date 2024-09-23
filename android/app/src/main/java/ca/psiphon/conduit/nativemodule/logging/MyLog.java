package ca.psiphon.conduit.nativemodule.logging;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.util.Log;

import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import ca.psiphon.conduit.BuildConfig;

public class MyLog {
  private static final ExecutorService executorService = Executors.newSingleThreadExecutor();
  private static WeakReference<Context> contextRef;
  static Uri CONTENT_URI;

  // Initialize with application context
  public static void init(Context context) {
    contextRef = new WeakReference<>(context.getApplicationContext());
  }

  public static void i(String tag, String msg) {
    log(tag, msg, Log.INFO);
  }

  public static void e(String tag, String msg) {
    log(tag, msg, Log.ERROR);
  }

  public static void d(String tag, String msg) {
    log(tag, msg, Log.DEBUG);
  }

  public static void w(String tag, String msg) {
    log(tag, msg, Log.WARN);
  }

  public static void v(String tag, String msg) {
    log(tag, msg, Log.VERBOSE);
  }

  private static void log(String tag, String msg, int level) {
    // Log to Logcat in debug mode
    if (BuildConfig.DEBUG) {
      Log.println(level, tag, msg);
    }
    // Skip logging to file if the level is DEBUG or VERBOSE
    if (level == Log.DEBUG || level == Log.VERBOSE) {
      return;
    }

    long now = System.currentTimeMillis();
    Context context = contextRef.get();
    if (context == null) {
      throw new IllegalStateException("MyLog context has been garbage collected or not initialized.");
    }

    if (CONTENT_URI == null) {
      CONTENT_URI = Uri.parse("content://" + context.getPackageName() + ".log/insert");
    }

    ContentValues values = new ContentValues();
    values.put("tag", tag);
    values.put("message", msg);
    values.put("level", level);
    values.put("timestamp", now);
    executorService.execute(() -> context.getContentResolver().insert(CONTENT_URI, values));
  }
}