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

import java.security.SecureRandom;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class LogUtils {
  static final SimpleDateFormat rfc3339Formatter;

  static {
    rfc3339Formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US);
    rfc3339Formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
  }

  public static String generateFeedbackId() {
    SecureRandom rnd = new SecureRandom();
    byte[] id = new byte[8];
    rnd.nextBytes(id);
    return byteArrayToHexString(id);
  }

  static String byteArrayToHexString(byte[] byteArray) {
    StringBuilder hexString = new StringBuilder();
    for (byte b : byteArray) {
      String hex = Integer.toHexString(0xFF & b);
      if (hex.length() == 1) {
        hexString.append('0');
      }
      hexString.append(hex);
    }
    return hexString.toString();
  }

  /**
   * Formats a given timestamp in milliseconds to an RFC 3339-compliant string.
   *
   * Workarounds:
   * - SimpleDateFormat in API 23 doesn't directly support the 'Z' UTC designator.
   *   We replace "+0000" with "Z" manually for UTC timestamps.
   * - RFC 3339 requires timezone offsets to include a colon (e.g., "+01:00" instead of "+0100").
   *   If the offset is not UTC, we insert a colon before the last two digits of the offset.
   *
   * Example:
   * Given timeMillis = 1731023755529 (equivalent to "2024-11-04T23:15:55.529Z" UTC):
   * - SimpleDateFormat outputs "2024-11-04T23:15:55.529+0000"
   * - This method converts "+0000" to "Z", yielding "2024-11-04T23:15:55.529Z"
   * - For non-UTC offsets like "+0100", it becomes "2024-11-04T23:15:55.529+01:00"
   */
  public static String getRfc3339Timestamp(long timeMillis) {
    String formattedDate = rfc3339Formatter.format(new Date(timeMillis));

    // Adjust the timezone format from "+0000" to "Z" to match RFC 3339 for UTC timestamps
    if (formattedDate.endsWith("+0000")) {
      formattedDate = formattedDate.substring(0, formattedDate.length() - 5) + "Z";
    } else {
      // Insert a colon in the timezone offset for formats like "+0100" to make it "+01:00"
      int offsetStart = formattedDate.length() - 5;
      formattedDate = formattedDate.substring(0, offsetStart) + ":" + formattedDate.substring(offsetStart + 1);
    }

    return formattedDate;
  }

  /**
   * Parses an RFC 3339-compliant timestamp string to a Date object.
   *
   * Workaround:
   * - SimpleDateFormat on API 23 and below doesn't support the 'X' pattern (used for timezone offsets with a colon).
   * - RFC 3339 UTC designator "Z" is also unsupported directly by SimpleDateFormat.
   * - To handle "Z" for UTC, this method replaces "Z" with "+0000" so that the SimpleDateFormat
   *   pattern "yyyy-MM-dd'T'HH:mm:ss.SSSZ" can interpret it as UTC.
   *
   * Example:
   * - For a timestamp like "2024-11-04T23:15:55.529Z":
   *   - This method replaces "Z" with "+0000", yielding "2024-11-04T23:15:55.529+0000"
   *   - SimpleDateFormat then correctly interprets this as UTC and parses it accordingly.
   * - For a timestamp like "2024-11-04T23:15:55.529+01:00":
   *   - No modification is needed; however, SimpleDateFormat does not support the colon in "+01:00"
   *   - This method will need to remove the colon in the offset if other time zones are a requirement.
   */
  public static Date parseRfc3339Timestamp(String timestamp) throws ParseException {
    // Replace "Z" with "+0000" for compatibility with the SimpleDateFormat pattern on API 23
    if (timestamp.endsWith("Z")) {
      timestamp = timestamp.substring(0, timestamp.length() - 1) + "+0000";
    }

    // Synchronize access to rfc3339Formatter to ensure thread safety
    synchronized (rfc3339Formatter) {
      return rfc3339Formatter.parse(timestamp);
    }
  }
}
