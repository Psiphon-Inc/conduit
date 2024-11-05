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

  public static String getRfc3339Timestamp(long timeMillis) {
    String formattedDate = rfc3339Formatter.format(new Date(timeMillis));

    // Adjust the timezone format from +0000 to Z to match RFC 3339 format
    if (formattedDate.endsWith("+0000")) {
      formattedDate = formattedDate.substring(0, formattedDate.length() - 5) + "Z";
    } else {
      // Insert a colon in the timezone offset for formats like +01:00, -05:00, etc.
      int offsetStart = formattedDate.length() - 5;
      formattedDate = formattedDate.substring(0, offsetStart) + ":" + formattedDate.substring(offsetStart + 1);
    }

    return formattedDate;
  }

  public static Date parseRfc3339Timestamp(String timestamp) throws ParseException {
    // Create a SimpleDateFormat with a pattern compatible with API 23
    // Replace "Z" with "+0000" for compatibility with the SimpleDateFormat pattern
    if (timestamp.endsWith("Z")) {
      timestamp = timestamp.substring(0, timestamp.length() - 1) + "+0000";
    }
    synchronized (rfc3339Formatter) {
      return rfc3339Formatter.parse(timestamp);
    }
  }
}
