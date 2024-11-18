package ca.psiphon.conduit.nativemodule;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import ca.psiphon.conduit.nativemodule.logging.MyLog;

public class PackageHelper {

    private static final String TAG = PackageHelper.class.getSimpleName();

    // Map of trusted packages with their corresponding sets of SHA-256 signature hashes
    private static final Map<String, Set<String>> TRUSTED_PACKAGES = new HashMap<String, Set<String>>() {{
        // Psiphon Pro package and its signatures
        put("com.psiphon3.subscription", new HashSet<>(Arrays.asList(
                "76:DB:EF:15:F6:77:26:D4:51:A1:23:59:B8:57:9C:0D:7A:9F:63:5D:52:6A:A3:74:24:DF:13:16:32:F1:78:10"
                // Add additional valid signatures for the package as needed:
                // "THE:OTHER:SIGNATURE:HASH:HERE"
        )));
    }};

    // Debug mode configuration
    private static boolean DEBUG_MODE = false;
    private static final Map<String, Set<String>> DEBUG_TRUSTED_PACKAGES = new HashMap<>();

    // Enable or disable debug mode to allow additional debug signatures at runtime
    // Note: This should be disabled in production builds
    public static void enableDebugMode(boolean enable) {
        DEBUG_MODE = enable;
        if (!enable) {
            DEBUG_TRUSTED_PACKAGES.clear();
        }
        MyLog.i(TAG, "Debug mode " + (enable ? "enabled" : "disabled"));
    }

    // Add a trusted package with its signature for debug purposes at runtime
    // Note: This should be used only in debug mode with enableDebugMode(true)
    public static void addDebugTrustedSignature(String packageName, String signature) {
        if (!DEBUG_MODE) {
            MyLog.w(TAG, "Attempted to add debug signature while not in debug mode");
            return;
        }
        Set<String> signatures = DEBUG_TRUSTED_PACKAGES.get(packageName);
        if (signatures == null) {
            signatures = new HashSet<>();
            DEBUG_TRUSTED_PACKAGES.put(packageName, signatures);
        }
        signatures.add(signature);
        MyLog.i(TAG, "Added debug signature for package " + packageName);
    }

    // Get the expected signature for a package
    @NonNull
    public static Set<String> getExpectedSignaturesForPackage(String packageName) {
        Set<String> signatures = new HashSet<>();
        Set<String> trustedSigs = TRUSTED_PACKAGES.get(packageName);
        if (trustedSigs != null) {
            signatures.addAll(trustedSigs);
        }
        if (DEBUG_MODE) {
            Set<String> debugSigs = DEBUG_TRUSTED_PACKAGES.get(packageName);
            if (debugSigs != null) {
                signatures.addAll(debugSigs);
            }
        }
        return signatures;
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
                if (DEBUG_MODE && DEBUG_TRUSTED_PACKAGES.containsKey(packageName)) {
                    MyLog.w(TAG, "Package " + packageName + " verified using debug signature");
                }
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
                if (i > 0) sb.append(':');
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
}
