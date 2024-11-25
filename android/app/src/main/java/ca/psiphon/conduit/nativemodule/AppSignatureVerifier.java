package ca.psiphon.conduit.nativemodule;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

import ca.psiphon.conduit.nativemodule.logging.MyLog;

public class AppSignatureVerifier {
    private static final String TAG = AppSignatureVerifier.class.getSimpleName();

    private final PackageManager packageManager;

    public AppSignatureVerifier(Context context) {
        this.packageManager = context.getPackageManager();
    }

    // Verifies the signature for the given package name.
    // Note: caching was considered but deemed unnecessary for a small number of apps (1-3),
    // so signatures are checked directly from the package info.
    public String getSignatureHash(String packageName) {
        try {
            PackageInfo packageInfo;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) { // API 28 and above
                packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
            } else { // API 27 and below
                packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES);
            }

            return getSignatureHashFromPackageInfo(packageInfo);
        } catch (PackageManager.NameNotFoundException e) {
            MyLog.w(TAG, "Package not found: " + packageName);
            return null;
        }
    }

    public String getSignatureHashFromPackageInfo(PackageInfo packageInfo) {
        Signature[] signatures;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) { // API 28 and above
            if (packageInfo.signingInfo != null) {
                signatures = packageInfo.signingInfo.getApkContentsSigners(); // Use signingInfo for API 28+
            } else {
                return null;
            }
        } else {
            signatures = packageInfo.signatures; // Use signatures for API 27 and below
        }

        if (signatures != null && signatures.length > 0) {
            return hashSignature(signatures[0]);
        }
        return null;
    }

    private String hashSignature(Signature signature) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(signature.toByteArray());

            // Convert byte array to a hex string with colons
            StringBuilder hexString = new StringBuilder();
            for (int i = 0; i < hashBytes.length; i++) {
                String hex = Integer.toHexString(0xff & hashBytes[i]);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex.toUpperCase());

                // Add colon between bytes, but not after the last one
                if (i < hashBytes.length - 1) {
                    hexString.append(':');
                }
            }

            return hexString.toString(); // Return hex format with colons
        } catch (NoSuchAlgorithmException e) {
            MyLog.w(TAG, "Failed to hash signature: " + e.getMessage());
            return null;
        }
    }

    public boolean isSignatureValid(String packageName, String expectedHash) {
        String actualHash = getSignatureHash(packageName);
        return expectedHash != null && expectedHash.equals(actualHash);
    }
}
