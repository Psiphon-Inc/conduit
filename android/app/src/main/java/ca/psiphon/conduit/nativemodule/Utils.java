package ca.psiphon.conduit.nativemodule;

import android.content.Context;
import android.content.res.Resources;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.TreeSet;

import ca.psiphon.conduit.R;

public class Utils {

  /**
   * Reads the contents of a raw resource file as a string.
   *
   * @param context the application context.
   * @param resourceId the resource identifier of the raw resource file to read.
   * @return A string containing the entire content of the file.
   * @throws IOException if an I/O error occurs.
   * @throws Resources.NotFoundException if the resource is not found.
   */
  public static String readRawResourceFileAsString(Context context, int resourceId) throws IOException, Resources.NotFoundException {
    StringBuilder content = new StringBuilder();
    // Open the raw resource file use try-with-resources to ensure the stream is closed
    try (InputStream inputStream = context.getResources().openRawResource(resourceId);
         BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        content.append(line);
        content.append('\n'); // Preserve line breaks if needed
      }
    }
      return content.toString();
  }

  /**
   * Retrieves the embedded server entries as a string from a raw resource.
   *
   * @param context the application context.
   * @return A string containing the embedded server entries.
   */
  static String getEmbeddedServers(Context context) {
    try {
      return readRawResourceFileAsString(context, R.raw.embedded_server_entries);
    } catch (IOException | Resources.NotFoundException e) {
      // Log the error and crash the app
      Log.e(ConduitModule.NAME, "Failed to read embedded server entries file", e);
      throw new IllegalStateException(e);
    }
  }

  /**
   * Serializes a list of strings into a single string using a comma as a delimiter.
   *
   * @param items the list of strings to serialize.
   * @return a serialized string representation of the list.
   */

  static @NonNull String serializeList(List<String> items) {
    if (items == null) {
      return "";
    }
    return String.join(",", items);
  }

  /**
   * Deserializes a string back into a list of strings using a comma as a delimiter.
   *
   * @param serializedItems the string to deserialize.
   * @return a list of strings.
   */
  static @NonNull List<String> deserializeList(String serializedItems) {
    if (serializedItems == null || serializedItems.isEmpty()) {
      return new ArrayList<>();
    }
    String[] itemsArray = serializedItems.split(",");
    return new ArrayList<>(Arrays.asList(itemsArray));
  }

  /**
   * Extracts region data from embedded server entries.
   *
   * @param context the application context.
   * @return A list of regions extracted from the embedded servers.
   */
  static @NonNull List<String> egressRegionsFromEmbeddedServers(Context context) {
    String embeddedServersString = getEmbeddedServers(context);

    // Split the server entry string into lines
    String[] lines = embeddedServersString.split("\n");

    // Use the TreeSet to automatically sort and remove duplicates
    TreeSet<String> egressRegionsSet = new TreeSet<>(String::compareToIgnoreCase);

    int lineNum = 0;
    for (String line : lines) {
      lineNum++;

      // trim the line and check if it is empty, skip if so
      line = line.trim();
      if (line.isEmpty()) {
        continue;
      }

      String decoded = hexDecode(line);
      if (decoded == null) {
        throw new IllegalArgumentException("Failed to hex decode line: " + lineNum);
      }

      // Skip past legacy format (4 space delimited fields) to the JSON config
      String[] parts = decoded.split(" ", 5);
      String json = parts.length == 5 ? parts[4] : null;
      if (json == null) {
        throw new IllegalArgumentException("Failed to extract JSON from line: " + lineNum);
      }
      try {
        JSONObject jsonObject = new JSONObject(json);
        egressRegionsSet.add(jsonObject.getString("region"));
      } catch (JSONException e) {
        throw new IllegalArgumentException("Failed to parse JSON from line: " + lineNum, e);
      }
    }

    return new ArrayList<>(egressRegionsSet);
  }

  /**
   * Decodes a hexadecimal string into its equivalent string representation.
   *
   * @param s the hexadecimal string to decode.
   * @return The decoded string, or null if the input is malformed (not an even length).
   */
  private static String hexDecode(String s) {
    int length = s.length();
    if (length % 2 != 0) return null;

    StringBuilder decoded = new StringBuilder();
    for (int i = 0; i < length; i += 2) {
      int decimal = Integer.parseInt(s.substring(i, i + 2), 16);
      decoded.append((char) decimal);
    }
    return decoded.toString();
  }

  public static String getNetworkTypeName(Context context) {
    ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    NetworkInfo networkInfo = connectivityManager.getActiveNetworkInfo();
    return networkInfo == null ? "" : networkInfo.getTypeName();
  }
}
