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

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.util.Log;

import java.lang.ref.WeakReference;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import ca.psiphon.conduit.BuildConfig;

public class MyLog {
    private final static String TAG = MyLog.class.getSimpleName();
    private static final ExecutorService executorService = Executors.newSingleThreadExecutor();
    private static WeakReference<Context> contextRef;
    private static final AtomicBoolean isInitialized = new AtomicBoolean(false);
    private static volatile Uri CONTENT_URI;
    private static final Object initLock = new Object();

    // Initialize with application context
    public static void init(Context context) {
        // If already initialized and we have a valid context, do nothing
        if (isInitialized.get() && contextRef != null && contextRef.get() != null) {
            return;
        }
        // Only initialize if we have a valid context
        if (context != null) {
            synchronized (initLock) {
                // Double check the initialization state
                if (!isInitialized.get() || contextRef == null || contextRef.get() == null) {
                    contextRef = new WeakReference<>(context.getApplicationContext());
                    // Also build the insert URI
                    CONTENT_URI = Uri.parse("content://" + context.getPackageName() + ".log/insert");
                    isInitialized.set(true);
                }
            }
        }
    }

    // Retry configuration
    private static final int MAX_RETRIES = 3;
    private static final long[] RETRY_DELAYS_MS = {100, 500, 1000}; // Exponential backoff
    private static final Set<Integer> RETRYABLE_LOG_LEVELS =
            new HashSet<>(Arrays.asList(Log.ERROR, Log.WARN, Log.INFO));

    private static void log(String tag, String msg, int level) {
        // Log to Logcat in debug mode
        if (BuildConfig.DEBUG) {
            Log.println(level, tag, msg);
        }
        // Skip logging to file if the level is DEBUG or VERBOSE
        if (level == Log.DEBUG || level == Log.VERBOSE) {
            return;
        }

        // Capture the context and insert uri and check for initialization
        final Context context;
        final Uri uri;

        // Synchronize on initLock to prevent race conditions between init and log calls
        synchronized (initLock) {
            context = (contextRef != null) ? contextRef.get() : null;
            uri = CONTENT_URI;

            // Check if we are properly initialized
            if (!isInitialized.get() || context == null) {
                throw new IllegalStateException(
                        String.format(Locale.US,
                                "MyLog not properly initialized. Context: %s, Initialized: %b, URI: %s",
                                context == null ? "null" : "valid",
                                isInitialized.get(),
                                uri == null ? "null" : uri.toString()
                        )
                );
            }
        }

        final ContentValues values = new ContentValues();
        values.put("tag", tag);
        values.put("message", msg);
        values.put("level", level);
        values.put("timestamp", System.currentTimeMillis());
        executorService.execute(() -> insertWithRetry(context, uri, values, level, 0));
    }

    private static void insertWithRetry(Context context, Uri uri, ContentValues values, int level, int attempt) {
        try {
            Uri result = context.getContentResolver().insert(uri, values);

            // Check if the insert was successful
            if (result != null) {
                return;
            }
            throw new IllegalStateException("Insert returned null result");
        } catch (Exception e) {
            // Log any failures to logcat
            Log.e(TAG, String.format(Locale.US, "Insert failed (attempt %d): %s", attempt + 1, e.getMessage()));

            // Handle retry logic
            if (shouldRetry(attempt, level)) {
                scheduleRetry(context, uri, values, level, attempt + 1);
                return;
            }

            // No more retries left make sure ERROR logs still get to logcat
            if (level >= Log.ERROR) {
                Log.e(values.getAsString("tag"), values.getAsString("message"));
            }
        }
    }

    private static boolean shouldRetry(int attempt, int level) {
        return attempt < MAX_RETRIES && RETRYABLE_LOG_LEVELS.contains(level);
    }

    private static void scheduleRetry(Context context, Uri uri, ContentValues values, int level, int nextAttempt) {
        long delay = RETRY_DELAYS_MS[nextAttempt - 1];

        executorService.execute(() -> {
            try {
                Thread.sleep(delay);
                insertWithRetry(context, uri, values, level, nextAttempt);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                // If interrupted, make sure ERROR logs still get to logcat
                if (level >= Log.ERROR) {
                    Log.e(values.getAsString("tag"), values.getAsString("message"));
                }
            }
        });
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
}
