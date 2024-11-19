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

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.UriMatcher;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.logging.FileHandler;
import java.util.logging.Formatter;
import java.util.logging.Level;
import java.util.logging.LogRecord;
import java.util.logging.Logger;

import ca.psiphon.conduit.nativemodule.ConduitModule;
import ca.psiphon.conduit.nativemodule.Constants;

public class LoggingContentProvider extends ContentProvider {
    final static String TAG = LoggingContentProvider.class.getSimpleName();

    public static final String LOG_FILE_NAME = "conduit_log";
    private static final int LOG_FILE_SIZE = Constants.QUARTER_MB;
    private static final int LOG_FILE_COUNT = 2;

    // URI matching constants
    private static final String AUTHORITY_SUFFIX = ".log";
    private static final String PATH_INSERT_LOGS = "insert";
    private static final int MATCH_INSERT = 1;

    private static final UriMatcher uriMatcher = new UriMatcher(UriMatcher.NO_MATCH);
    private volatile Logger logger;
    private final Object loggerLock = new Object();

    @Override
    public boolean onCreate() {
        String authority = getContext().getPackageName() + AUTHORITY_SUFFIX;
        uriMatcher.addURI(authority, PATH_INSERT_LOGS, MATCH_INSERT);
        return true;
    }

    private Logger getLogger() {
        Logger result = logger;
        if (result == null) {
            synchronized (loggerLock) {
                result = logger;
                if (result == null) {
                    initializeLogger();
                    result = logger;
                }
            }
        }
        return result;
    }

    private void initializeLogger() {
        logger = Logger.getLogger(LoggingContentProvider.class.getName());
        logger.setLevel(Level.ALL);
        logger.setUseParentHandlers(false);

        // Clean up any existing handlers
        for (var handler : logger.getHandlers()) {
            try {
                handler.close();
                logger.removeHandler(handler);
            } catch (Exception e) {
                Log.e(TAG, "Error cleaning up handler", e);
            }
        }

        try {
            File dataDir = ConduitModule.dataRootDirectory(getContext());
            // Set up the FileHandler
            FileHandler fileHandler = new FileHandler(
                    new File(dataDir, LOG_FILE_NAME).getAbsolutePath(),
                    LOG_FILE_SIZE,
                    LOG_FILE_COUNT,
                    true
            );
            fileHandler.setFormatter(new JsonFormatter());
            fileHandler.setLevel(Level.ALL);
            logger.addHandler(fileHandler);
        } catch (IOException e) {
            Log.e(TAG, "Failed to initialize logger", e);
            throw new IllegalStateException("Logger initialization failed", e);
        }
    }

    @Override
    public Uri insert(@NonNull Uri uri, ContentValues values) {
        // Validate URI
        if (uriMatcher.match(uri) != MATCH_INSERT) {
            throw new IllegalArgumentException("Unknown URI: " + uri);
        }

        // Validate input
        if (values == null) {
            throw new IllegalArgumentException("ContentValues cannot be null");
        }

        String tag = values.getAsString("tag");
        String message = values.getAsString("message");
        Integer level = values.getAsInteger("level");
        Long timestamp = values.getAsLong("timestamp");

        if (tag == null || message == null || level == null || timestamp == null) {
            throw new IllegalArgumentException(
                    String.format(Locale.US, "Missing required fields. tag: %s, message: %s, level: %s, timestamp: %s",
                            tag != null ? "present" : "missing",
                            message != null ? "present" : "missing",
                            level != null ? "present" : "missing",
                            timestamp != null ? "present" : "missing"
                    )
            );
        }

        Logger currentLogger = getLogger();
        synchronized (loggerLock) {
            LogRecord record = new LogRecord(intToLevel(level), message);
            record.setLoggerName(tag);
            record.setMillis(timestamp);
            currentLogger.log(record);
            return uri;
        }
    }

    private static Level intToLevel(int level) {
        return switch (level) {
            case Log.VERBOSE -> Level.FINEST;
            case Log.DEBUG -> Level.FINE;
            case Log.INFO -> Level.INFO;
            case Log.WARN -> Level.WARNING;
            case Log.ERROR -> Level.SEVERE;
            default -> throw new IllegalArgumentException("Invalid log level: " + level);
        };
    }

    private static String levelToString(Level level) {
        if (level == Level.FINEST) {
            return "Verbose";
        } else if (level == Level.FINE) {
            return "Debug";
        } else if (level == Level.INFO) {
            return "Info";
        } else if (level == Level.WARNING) {
            return "Warning";
        } else if (level == Level.SEVERE) {
            return "Error";
        } else {
            throw new IllegalArgumentException("Invalid log level: " + level);
        }
    }

    @Override
    public Cursor query(@NonNull Uri uri, String[] projection, String selection,
            String[] selectionArgs,
            String sortOrder) {
        throw new UnsupportedOperationException("Not implemented");
    }

    @Override
    public String getType(@NonNull Uri uri) {
        throw new UnsupportedOperationException("Not implemented");
    }

    @Override
    public int delete(@NonNull Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("Not implemented");
    }

    @Override
    public int update(@NonNull Uri uri, ContentValues values, String selection,
            String[] selectionArgs) {
        throw new UnsupportedOperationException("Not implemented");
    }

    @Override
    public void shutdown() {
        synchronized (loggerLock) {
            if (logger != null) {
                for (var handler : logger.getHandlers()) {
                    try {
                        handler.close();
                        logger.removeHandler(handler);
                    } catch (Exception e) {
                        Log.e(TAG, "Error closing handler during shutdown", e);
                    }
                }
                logger = null;
            }
        }
        super.shutdown();
    }

    // Custom formatter to format logs as JSON, mimic the format of the tunnel core notices output
    private static class JsonFormatter extends Formatter {
        @Override
        public String format(LogRecord record) {
            JSONObject json = new JSONObject();
            try {
                json.put("tag", record.getLoggerName());
                json.put("message", record.getMessage());
                json.put("level", levelToString(record.getLevel()));
                json.put("timestamp", LogUtils.getRfc3339Timestamp(record.getMillis()));
            } catch (JSONException e) {
                Log.e(TAG, "Failed to format log record", e);
            }
            return json + "\n";
        }
    }
}
