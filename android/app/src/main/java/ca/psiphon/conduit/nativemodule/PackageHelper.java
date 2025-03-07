package ca.psiphon.conduit.nativemodule;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import ca.psiphon.conduit.nativemodule.logging.MyLog;

public class PackageHelper {

    private static final String TAG = PackageHelper.class.getSimpleName();
    private static final String SIGNATURES_JSON_FILE = "trusted_signatures.json";

    // Unmodifiable map of trusted packages with their corresponding sets of SHA-256 signature hashes
    private static final Map<String, Set<String>> TRUSTED_PACKAGES;
    static {
        Map<String, Set<String>> map = new HashMap<>();
        // Psiphon Pro package and its signatures as SHA-256 hashes using uppercase hex encoding, continuous (no separator)
        map.put("com.psiphon3.subscription", Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
                "76DBEF15F67726D451A12359B8579C0D7A9F635D526AA37424DF131632F17810"
                // Add additional valid signatures for the package as needed:
                // "THEOTHERSIGNATUREHASHHERE"
        ))));
        // Ryve package and its signatures as SHA-256 hashes using uppercase hex encoding, continuous (no separator)
        // app ID: network.ryve.app
        // SHA256: AE:2E:20:B1:DC:53:72:C2:60:73:58:A3:BA:46:1E:1C:A4:30:6F:A1:74:FF:57:42:7A:1C:F5:2B:34:3F:AE:A0
        map.put("network.ryve.app", Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
                "AE2E20B1DC5372C2607358A3BA461E1CA4306FA174FF57427A1CF52B343FAEA0"
                // Add additional valid signatures for the package as needed:
                // "THEOTHERSIGNATUREHASHHERE"
        ))));
        TRUSTED_PACKAGES = Collections.unmodifiableMap(map);
    }

    private static final ConcurrentHashMap<String, Set<String>> RUNTIME_TRUSTED_PACKAGES = new ConcurrentHashMap<>();

    // Get the expected signature for a package
    @NonNull
    public static Set<String> getExpectedSignaturesForPackage(String packageName) {
        Set<String> signatures = new HashSet<>();
        Set<String> trustedSigs = TRUSTED_PACKAGES.get(packageName);
        if (trustedSigs != null) {
            signatures.addAll(trustedSigs);
        }
        Set<String> runtimeSigs = RUNTIME_TRUSTED_PACKAGES.get(packageName);
        if (runtimeSigs != null) {
            signatures.addAll(runtimeSigs);
        }
        return Collections.unmodifiableSet(signatures);
    }

    // Verify if a package is trusted
    public static boolean verifyTrustedPackage(PackageManager packageManager, String packageName) {
        Set<String> expectedSignatures = getExpectedSignaturesForPackage(packageName);
        if (expectedSignatures.isEmpty()) {
            MyLog.w(TAG, "No trusted signatures found for package " + packageName);
            return false;
        }

        try {
            PackageInfo packageInfo;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
            } else {
                packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
            }

            String actualSignature = getPackageSignature(packageInfo);
            if (actualSignature != null && expectedSignatures.contains(actualSignature)) {
                return true;
            } else {
                MyLog.w(TAG, "Verification failed for package " + packageName + ", signature mismatch");
                return false;
            }
        } catch (PackageManager.NameNotFoundException e) {
            MyLog.w(TAG, "Verification failed for package " + packageName + ", package not found");
            return false;
        }
    }

    // Get the SHA-256 signature hash of a package
    @Nullable
    private static String getPackageSignature(PackageInfo packageInfo) {
        try {
            Signature[] signatures;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                signatures = packageInfo.signingInfo.getApkContentsSigners();
            } else {
                signatures = packageInfo.signatures;
            }

            byte[] cert = signatures[0].toByteArray();
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(cert);

            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < digest.length; i++) {
                sb.append(String.format("%02X", digest[i]));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }

    // Check if a package is installed
    public static boolean isPackageInstalled(PackageManager packageManager, String packageName) {
        try {
            packageManager.getPackageInfo(packageName, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    // Save the map of package signatures to a file
    // Avoid calling this method from different processes simultaneously to ensure single-writer safety
    public static synchronized void saveTrustedSignaturesToFile(Context context, Map<String, Set<String>> signatures) {
        File tempFile = new File(context.getFilesDir(), "trusted_signatures_temp.json");
        File finalFile = new File(context.getFilesDir(), SIGNATURES_JSON_FILE);
        try (FileWriter writer = new FileWriter(tempFile)) {
            // Convert the map to JSON object where values are JSON arrays
            JSONObject jsonObject = new JSONObject();
            for (Map.Entry<String, Set<String>> entry : signatures.entrySet()) {
                jsonObject.put(entry.getKey(), new JSONArray(entry.getValue()));
            }
            writer.write(jsonObject.toString());
            // Rename temp file to final file atomically
            if (!tempFile.renameTo(finalFile)) {
                throw new IOException("Failed to rename temp file to final file.");
            }
        } catch (IOException | JSONException e) {
            MyLog.e(TAG, "Failed to save trusted signatures: " + e);
        }
    }

    // Read the map of package signatures from a file, can be called from any process
    public static Map<String, Set<String>> readTrustedSignaturesFromFile(Context context) {
        File file = new File(context.getFilesDir(), SIGNATURES_JSON_FILE);
        Map<String, Set<String>> signatures = new HashMap<>();

        if (file.exists()) {
            try (FileReader reader = new FileReader(file);
                 BufferedReader bufferedReader = new BufferedReader(reader)) {
                StringBuilder builder = new StringBuilder();
                String line;
                while ((line = bufferedReader.readLine()) != null) {
                    builder.append(line);
                }

                // Convert the JSON string back to a map
                JSONObject jsonObject = new JSONObject(builder.toString());
                Iterator<String> keys = jsonObject.keys();
                while (keys.hasNext()) {
                    String packageName = keys.next();
                    JSONArray signatureArray = jsonObject.getJSONArray(packageName);
                    Set<String> signatureSet = new HashSet<>();
                    for (int i = 0; i < signatureArray.length(); i++) {
                        signatureSet.add(signatureArray.getString(i));
                    }
                    signatures.put(packageName, signatureSet);
                }
            } catch (IOException | JSONException e) {
                MyLog.e(TAG, "Failed to read trusted signatures: " + e);
            }
        }
        return signatures;
    }

    // Load runtime trusted signatures configuration
    // Make sure the map is immutable and the sets are unmodifiable
    public static void configureRuntimeTrustedSignatures(Map<String, Set<String>> signatures) {
        RUNTIME_TRUSTED_PACKAGES.clear();
        for (Map.Entry<String, Set<String>> entry : signatures.entrySet()) {
            RUNTIME_TRUSTED_PACKAGES.put(
                    entry.getKey(),
                    Collections.unmodifiableSet(new HashSet<>(entry.getValue()))
            );
        }
        MyLog.i(TAG, "Loaded runtime signatures for " + signatures.size() + " packages");
    }
}
