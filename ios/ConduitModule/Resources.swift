/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */

import Foundation
import PsiphonTunnel

enum ResourceFile {
    
    case psiphonConfig
    case embeddedServerEntries
    
    var url: URL {
        let fname = switch self {
        case .psiphonConfig: "ios_psiphon_config"
        case .embeddedServerEntries: "ios_embedded_server_entries"
        }
        if #available(iOS 16.0, *) {
            return Bundle.main.resourceURL!.appending(component: fname)
        } else {
            return Bundle.main.resourceURL!.appendingPathComponent(fname)
        }
    }
   
}

func getApplicationSupportDirectory() throws -> URL {
    // Retrieve the Application Support directory URL for the current user
    return try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
    )
}

/// Reads `psiphon_config` into a dictionary representings the JSON object.
func readPsiphonConfig() throws -> [String: Any?] {
    // Load the data from the file
    let data = try Data(contentsOf: ResourceFile.psiphonConfig.url)
    let json = try JSONSerialization.jsonObject(with: data, options: []) as! [String: Any?]
    return json
}

/// Returns `psiphon_config` with `DataRootDirectory` set.
func defaultPsiphonConfig() throws -> [String: Any?] {
    var config = try readPsiphonConfig()
    config["DataRootDirectory"] = try getApplicationSupportDirectory().filePath()
    return config
}

/// Returns a BCP-47 identifier in a minimalist form. Script and region may be omitted. For example, "zh-TW", "en".
func getLanguageMinimalIdentifier() -> String {
    if #available(iOS 16, *) {
        return Locale.current.language.minimalIdentifier
    } else {
        
        let locale = Locale.current
        if let languageCode = locale.languageCode, let regionCode = locale.regionCode {
            return "\(languageCode)-\(regionCode)"
        } else if let languageCode = locale.languageCode {
            return languageCode
        }
        return "en" // Default to English if languageCode is not available
    }
}

/// Returns client version from the main bundle (`CFBundleVersion` defined in `Info.plist` file).
func getClientVersion() -> String {
    Bundle.main.infoDictionary!["CFBundleVersion"] as! String
}

extension URL {
    
    /// Returns valid file path if this URL points to a local file.
    func filePath() throws -> String {
        guard self.isFileURL else {
            throw Err("URL is not file")
        }
        if #available(iOS 16.0, *) {
            return path(percentEncoded: false)
        } else {
            return path
        }
    }
    
    static func createFileURL(from url: URL, isDirectory: Bool) -> URL {
        let path = if #available(iOS 16.0, *) {
           url.path(percentEncoded: false)
        } else {
            url.path
        }
        return URL(fileURLWithPath: path, isDirectory: isDirectory, relativeTo: nil)
    }
    
}


// MARK: - tunnel-core

func noticesFilePath(dataRootDirectory: URL) -> URL {
    // Returned value is tagged _Nullable, but should never be nil.
    let url = PsiphonTunnel.noticesFilePath(dataRootDirectory)!
    return URL.createFileURL(from: url, isDirectory: false)
}

func olderNoticesFilePath(dataRootDirectory: URL) -> URL {
    // Returned value is tagged _Nullable, but should never be nil.
    let url = PsiphonTunnel.olderNoticesFilePath(dataRootDirectory)!
    return URL.createFileURL(from: url, isDirectory: false)
}
