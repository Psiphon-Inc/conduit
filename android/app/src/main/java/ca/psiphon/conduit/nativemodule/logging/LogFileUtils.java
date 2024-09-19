package ca.psiphon.conduit.nativemodule.logging;
import android.content.Context;


import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

import ca.psiphon.conduit.nativemodule.ConduitModule;
import psi.Psi;

public class LogFileUtils {
  private static final String TAG = LogFileUtils.class.getSimpleName();
  private static final String FEEDBACK_DIR = "feedback";
  public static final String LOG_APP_PREFIX = "app.";
  public static final String LOG_TUNNEL_CORE_PREFIX = "tunnelcore.";
  public static final String LOG_FEEDBACK_FILE_EXTENSION = ".feedback";


  public static void createFeedbackLogs(Context context, String feedbackId) {
    createTunnelCoreFeedbackFile(context, feedbackId);
    createAppFeedbackFile(context, feedbackId);
  }

  private static void createAppFeedbackFile(Context context, String feedbackId) {
    try {
      String dataRootPath = ConduitModule.dataRootDirectory(context).getAbsolutePath();
      File dataDir = new File(dataRootPath);

      // Get all log files, excluding lock files
      File[] logFiles = dataDir.listFiles(
              (dir, name) -> name.startsWith(LoggingContentProvider.LOG_FILE_NAME) && !name.endsWith(".lck"));

      if (logFiles == null || logFiles.length == 0) {
        MyLog.i(TAG, "No app log files found to include in feedback " + feedbackId);
        return;
      }

      // Extract file paths
      String[] logFilePaths = new String[logFiles.length];
      for (int i = 0; i < logFiles.length; i++) {
        logFilePaths[i] = logFiles[i].getAbsolutePath();
      }

      File feedbackDir = feedBackLogsDir(context);
      if (!feedbackDir.exists()) {
        feedbackDir.mkdirs();
      }

      String feedbackLogFilePath = new File(feedbackDir, LOG_APP_PREFIX + feedbackId + LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();

      mergeLogFiles(feedbackLogFilePath, logFilePaths);
    } catch (IOException e) {
      MyLog.e(TAG, "Failed to create app feedback log: " + e);
    }
  }

  private static void createTunnelCoreFeedbackFile(Context context, String feedbackId) {
    try {
      String dataRootPath = ConduitModule.dataRootDirectory(context).getAbsolutePath();
      String filePath = Psi.oldNoticesFilePath(dataRootPath);

      List<String> existingLogFiles = new ArrayList<>();
      if (new File(filePath).exists()) {
        existingLogFiles.add(filePath);
      }

      filePath = Psi.noticesFilePath(dataRootPath);
      if (new File(filePath).exists()) {
        existingLogFiles.add(filePath);
      }

      if (existingLogFiles.isEmpty()) {
        MyLog.w(TAG, "No tunnel core notice files found to include in feedback " + feedbackId);
        return;
      }

      File feedbackDir = feedBackLogsDir(context);
      if (!feedbackDir.exists()) {
        feedbackDir.mkdirs();
      }

      String feedbackLogFilePath = new File(feedbackDir, LOG_TUNNEL_CORE_PREFIX + feedbackId + LOG_FEEDBACK_FILE_EXTENSION).getAbsolutePath();

      mergeLogFiles(feedbackLogFilePath, existingLogFiles.toArray(new String[0]));
    } catch (IOException e) {
      MyLog.e(TAG, "Failed to create tunnel core log:" + e);
    }
  }

  private static void mergeLogFiles(String outputFilePath, String... inputFilePaths) throws IOException {
    File outputFile = new File(outputFilePath);

    // Convert input file paths to files and sort them by last modified time (oldest first)
    File[] inputFiles = new File[inputFilePaths.length];
    int count = 0;

    // Create File objects and filter existing ones
    for (String path : inputFilePaths) {
      File file = new File(path);
      if (file.exists()) {
        inputFiles[count++] = file;
      }
    }

    // Resize the array to contain only the existing files
    inputFiles = Arrays.copyOf(inputFiles, count);

    // Sort the files by last modified time (oldest first)
    Arrays.sort(inputFiles, (f1, f2) -> Long.compare(f1.lastModified(), f2.lastModified()));

    List<FileLock> locks = new ArrayList<>();
    List<FileInputStream> inputStreams = new ArrayList<>();
    List<FileChannel> channels = new ArrayList<>();

    try (FileOutputStream fos = new FileOutputStream(outputFile, true);
         FileChannel outputChannel = fos.getChannel()) {

      // Acquire locks on all input files
      for (File inputFile : inputFiles) {
        FileInputStream fis = new FileInputStream(inputFile);
        FileChannel inputChannel = fis.getChannel();
        FileLock lock = inputChannel.lock(0L, Long.MAX_VALUE, true);
        locks.add(lock);
        inputStreams.add(fis);
        channels.add(inputChannel);
      }

      // Copy content of each input file to the output file
      for (FileChannel inputChannel : channels) {
        inputChannel.transferTo(0, inputChannel.size(), outputChannel);
      }

    } catch (IOException e) {
      MyLog.e(TAG, "Failed to write to output file: " + outputFilePath + " " + e);
      throw e;
    } finally {
      // Release all locks and close all channels
      for (FileLock lock : locks) {
        if (lock != null && lock.isValid()) {
          try {
            lock.release();
          } catch (IOException e) {
            MyLog.e(TAG, "Failed to release lock: " + e);
          }
        }
      }
      for (FileChannel channel : channels) {
        if (channel != null && channel.isOpen()) {
          try {
            channel.close();
          } catch (IOException e) {
            MyLog.e(TAG, "Failed to close channel: " + e);
          }
        }
      }
      for (FileInputStream fis : inputStreams) {
        try {
          fis.close();
        } catch (IOException e) {
          MyLog.e(TAG, "Failed to close FileInputStream: " + e);
        }
      }
    }
  }

  public static File feedBackLogsDir(Context context) {
    return new File(ConduitModule.dataRootDirectory(context), FEEDBACK_DIR);
  }

  public static void deleteFeedbackLogsFiles(Context context, String feedbackId) {
    File feedbackDir = feedBackLogsDir(context);
    File[] feedbackFiles = feedbackDir.listFiles((dir, name) ->
            name.startsWith(LOG_APP_PREFIX + feedbackId) ||
                    name.startsWith(LOG_TUNNEL_CORE_PREFIX + feedbackId));
    if (feedbackFiles != null) {
      for (File feedbackFile : feedbackFiles) {
        if (!feedbackFile.delete()) {
          MyLog.e(TAG, "Failed to delete feedback file: " + feedbackFile.getAbsolutePath());
        }
      }
    }
  }

  public static void deleteFeedbackLogsOlderThan(Context context, long cutoffTimeInMillis) {
    File feedbackDir = feedBackLogsDir(context);
    if (feedbackDir.exists() && feedbackDir.isDirectory()) {
      File[] files = feedbackDir.listFiles();
      if (files != null) {
        for (File file : files) {
          if (file.isFile() && file.lastModified() < cutoffTimeInMillis) {
            try {
              if (file.delete()) {
                MyLog.i(TAG, "Deleted feedback file: " + file.getName());
              } else {
                MyLog.e(TAG, "Failed to delete feedback file: " + file.getName());
              }
            } catch (Exception e) {
              MyLog.e(TAG, "Exception while deleting feedback file: " + file.getName() + ": " + e.getMessage());
            }
          }
        }
      }
    }
  }
}
