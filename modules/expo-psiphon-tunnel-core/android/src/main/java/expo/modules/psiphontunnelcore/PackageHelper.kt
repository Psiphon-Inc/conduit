/*
 * Copyright (c) 2026, Psiphon Inc.
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
 */
package expo.modules.psiphontunnelcore

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

object PackageHelper {
    private const val SIGNATURES_JSON_FILE = "trusted_signatures.json"

    private val trustedPackages: Map<String, Set<String>> = mapOf(
        // Psiphon and Psiphon Pro
        "com.psiphon3" to setOf(
            "76DBEF15F67726D451A12359B8579C0D7A9F635D526AA37424DF131632F17810",
        ),
        "com.psiphon3.subscription" to setOf(
            "76DBEF15F67726D451A12359B8579C0D7A9F635D526AA37424DF131632F17810",
        ),
        // Ryve
        "network.ryve.app" to setOf(
            "AE2E20B1DC5372C2607358A3BA461E1CA4306FA174FF57427A1CF52B343FAEA0",
        ),
    )

    private val runtimeTrustedPackages = ConcurrentHashMap<String, Set<String>>()

    fun verifyTrustedCallingUid(context: Context, uid: Int): Boolean {
        val packageManager = context.packageManager
        val packages = packageManager.getPackagesForUid(uid) ?: return false
        if (packages.isEmpty()) {
            return false
        }

        return packages.any { packageName ->
            verifyTrustedPackage(packageManager, packageName)
        }
    }

    fun verifyTrustedPackage(packageManager: PackageManager, packageName: String): Boolean {
        val expected = expectedSignaturesForPackage(packageName)
        if (expected.isEmpty()) {
            return false
        }

        val packageInfo = getPackageInfo(packageManager, packageName) ?: return false
        val actual = packageSignaturesSha256(packageInfo)
        return actual.any { signature -> expected.contains(signature) }
    }

    fun describeCallingUid(context: Context, uid: Int): String {
        val packageManager = context.packageManager
        val packages = packageManager.getPackagesForUid(uid)
        if (packages.isNullOrEmpty()) {
            return "uid=$uid packages=[]"
        }

        val packageDescriptions = packages.map { packageName ->
            val signatures = getPackageInfo(packageManager, packageName)
                ?.let { packageSignaturesSha256(it) }
                ?: emptySet()
            val signatureText = if (signatures.isEmpty()) {
                "none"
            } else {
                signatures.joinToString(",")
            }
            "$packageName($signatureText)"
        }

        return "uid=$uid packages=[${packageDescriptions.joinToString(";")}]"
    }

    private fun getPackageInfo(
        packageManager: PackageManager,
        packageName: String,
    ): PackageInfo? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageManager.getPackageInfo(
                    packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
            }
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }

    private fun packageSignaturesSha256(packageInfo: PackageInfo): Set<String> {
        val signatures: Array<Signature> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo?.apkContentsSigners ?: return emptySet()
        } else {
            @Suppress("DEPRECATION")
            packageInfo.signatures ?: return emptySet()
        }

        return signatures.mapNotNull { signature ->
            signature.toByteArray().takeIf { it.isNotEmpty() }?.let { cert ->
                val digest = MessageDigest.getInstance("SHA-256").digest(cert)
                val out = StringBuilder(digest.size * 2)
                digest.forEach { byte ->
                    out.append(String.format("%02X", byte))
                }
                out.toString()
            }
        }.toSet()
    }

    fun configureRuntimeTrustedSignatures(signatures: Map<String, Set<String>>) {
        runtimeTrustedPackages.clear()
        signatures.forEach { (pkg, sigs) ->
            runtimeTrustedPackages[pkg] = Collections.unmodifiableSet(sigs.toSet())
        }
    }

    fun readTrustedSignaturesFromFile(context: Context): Map<String, Set<String>> {
        val file = File(context.filesDir, SIGNATURES_JSON_FILE)
        if (!file.exists()) {
            return emptyMap()
        }

        return try {
            val json = JSONObject(file.readText())
            val output = mutableMapOf<String, Set<String>>()
            val keys = json.keys()
            while (keys.hasNext()) {
                val packageName = keys.next()
                val signaturesJson = json.optJSONArray(packageName) ?: JSONArray()
                val signatures = mutableSetOf<String>()
                for (i in 0 until signaturesJson.length()) {
                    val signature = signaturesJson.optString(i).trim().uppercase()
                    if (signature.isNotEmpty()) {
                        signatures.add(signature)
                    }
                }
                if (signatures.isNotEmpty()) {
                    output[packageName] = signatures
                }
            }
            output
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun saveTrustedSignaturesToFile(context: Context, signatures: Map<String, Set<String>>) {
        val finalFile = File(context.filesDir, SIGNATURES_JSON_FILE)
        val tempFile = File(context.filesDir, "$SIGNATURES_JSON_FILE.tmp")
        val json = JSONObject()
        signatures.forEach { (pkg, sigs) ->
            json.put(pkg, JSONArray(sigs.toList()))
        }

        synchronized(this) {
            tempFile.writeText(json.toString())
            if (finalFile.exists()) {
                finalFile.delete()
            }
            tempFile.renameTo(finalFile)
        }
    }

    fun parseTrustedSignaturesJson(jsonString: String?): Map<String, Set<String>> {
        if (jsonString.isNullOrBlank()) {
            return emptyMap()
        }

        return try {
            parseTrustedSignaturesObject(JSONObject(jsonString))
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun mergeTrustedSignatures(vararg signatureMaps: Map<String, Set<String>>): Map<String, Set<String>> {
        val merged = mutableMapOf<String, MutableSet<String>>()
        signatureMaps.forEach { signatureMap ->
            signatureMap.forEach { (packageName, signatures) ->
                if (signatures.isEmpty()) {
                    return@forEach
                }
                merged.getOrPut(packageName) { mutableSetOf() }.addAll(signatures)
            }
        }
        return merged.mapValues { (_, signatures) -> signatures.toSet() }
    }

    fun parseTrustedAppsFromApplicationParameters(params: JSONObject): Map<String, Set<String>> {
        val trustedApps = params.optJSONObject("AndroidTrustedApps") ?: return emptyMap()
        return parseTrustedSignaturesObject(trustedApps)
    }

    private fun parseTrustedSignaturesObject(trustedApps: JSONObject): Map<String, Set<String>> {
        val signatures = mutableMapOf<String, Set<String>>()
        val keys = trustedApps.keys()

        while (keys.hasNext()) {
            val packageName = keys.next()
            val values = trustedApps.optJSONArray(packageName) ?: continue
            val signatureSet = mutableSetOf<String>()
            for (i in 0 until values.length()) {
                val signature = values.optString(i).trim().uppercase()
                if (signature.isNotEmpty()) {
                    signatureSet.add(signature)
                }
            }
            if (signatureSet.isNotEmpty()) {
                signatures[packageName] = signatureSet
            }
        }

        return signatures
    }

    private fun expectedSignaturesForPackage(packageName: String): Set<String> {
        val output = mutableSetOf<String>()
        trustedPackages[packageName]?.let { output.addAll(it) }
        runtimeTrustedPackages[packageName]?.let { output.addAll(it) }
        return output
    }

}
