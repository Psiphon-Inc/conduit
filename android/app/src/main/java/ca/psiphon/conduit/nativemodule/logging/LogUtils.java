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
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class LogUtils {
  static SimpleDateFormat rfc3339Formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ",
    Locale.US);

  static {
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
      formattedDate = formattedDate.substring(0,
        formattedDate.length() - 2) + ":" + formattedDate.substring(formattedDate.length() - 2);
    }

    return formattedDate;
  }


}
