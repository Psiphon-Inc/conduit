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


import Foundation
import Puppy
import Logging

struct JSONLogFormatter : LogFormattable {
    
    let jsonEncoder: JSONEncoder = JSONEncoder()
   
    func formatMessage(_ level: LogLevel, message: String, tag: String, function: String,
                       file: String, line: UInt, swiftLogInfo: [String: String],
                       label: String, date: Date, threadID: UInt64) -> String {
        
        let category = swiftLogInfo["label"]! // Category must always be set.
        
        do {
            var metadata: GenericJSON? = nil
            if let metadataString = swiftLogInfo["metadata"] {
                // TODO: Puppy API limits us to encoding and decoding metadata.
                let jsonObj = try JSONSerialization.jsonObject(with: metadataString.data(using: .utf8)!)
                metadata = try GenericJSON(jsonObj)
            }
            
            let log = Log(
                timestamp: date,
                level: FeedbackLogLevel(from: level),
                category: category,
                message: message,
                data: metadata
            )
            
            let jsonData = try self.jsonEncoder.encode(log)
            guard let logString = String(data: jsonData, encoding: .utf8) else {
                throw Err("Failed to convert JSON data to String")
            }
            return logString
            
        } catch {
            os_log(.fault, "Failed to encode log")
            return "Error formatting log: \(String(describing: error))"
        }
    }
}


/// Manages an instance of Puppy as backend for swift-log.
enum AppLogger {
    
    #if DEBUG
    static let minLogLevel = Logging.Logger.Level.trace
    #else
    static let minLogLevel = Logging.Logger.Level.info
    #endif
    
    static let subsystem: String = Bundle.main.bundleIdentifier!
    private static let maxArchivedCount: UInt8 = 2
    
    private static let baseFileURL = {
        var appSupportDir = try getApplicationSupportDirectory()
        if #available(iOS 16.0, *) {
            appSupportDir.append(components: Self.subsystem, "appLogs", "app.log")
        } else {
            appSupportDir.appendPathComponent(Self.subsystem)
            appSupportDir.appendPathComponent("appLogs")
            appSupportDir.appendPathComponent("app.log")
        }
        
        return appSupportDir.absoluteURL
    }
    
    static func initializePuppy() -> Puppy {
        var puppy = Puppy()

        let fileLogger = try! FileRotationLogger(
            "\(AppLogger.subsystem).log.file", // DispatchQueue label
            logLevel: Self.minLogLevel.toPuppy(),
            logFormat: JSONLogFormatter(),
            fileURL: AppLogger.baseFileURL(),
            filePermission: "600",
            rotationConfig: RotationConfig(
                suffixExtension: .numbering,
                maxFileSize: 100 * 1024,
                maxArchivedFilesCount: AppLogger.maxArchivedCount
            )
        )
        
        puppy.add(fileLogger)
        return puppy
    }
    
    static func readLogs() throws -> ([Log], [ParseError]) {
       
        var files = [URL]()
        for i in 0...maxArchivedCount {
            var fileURL = try! baseFileURL()
            if i > 0 {
                fileURL = fileURL.appendingPathExtension("\(i)")
            }
            files.append(fileURL)
        }

        return try readLogFiles(withLogType: Log.self, paths: files, transform: { $0 })
    }
    
}
