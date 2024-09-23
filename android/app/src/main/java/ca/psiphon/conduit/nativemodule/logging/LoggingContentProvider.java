package ca.psiphon.conduit.nativemodule.logging;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
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

  private static Logger logger;

  @Override
  public boolean onCreate() {
    return true;
  }

  private void initializeLogger() {
    logger = Logger.getLogger(LoggingContentProvider.class.getName());
    logger.setLevel(Level.ALL);
    logger.setUseParentHandlers(false);
    // delete all existing handlers if any
    for (var handler : logger.getHandlers()) {
      logger.removeHandler(handler);
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
    }
  }

  @Override
  public Uri insert(@NonNull Uri uri, ContentValues values) {
    if (logger == null) {
      initializeLogger();
    }

    String tag = values.getAsString("tag");
    String message = values.getAsString("message");
    int level = values.getAsInteger("level");

    LogRecord record = new LogRecord(intToLevel(level), message);
    record.setLoggerName(tag);
    record.setMillis(values.getAsLong("timestamp"));

    logger.log(record);

    return uri;
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
