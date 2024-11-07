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

/*
 The MIT License (MIT)

 Copyright (c) 2020-2023 Koichi Yokota

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */


import Foundation

#if canImport(Logging)
import Logging

public struct OSLogger: LogHandler {

    public var metadata: Logging.Logger.Metadata
    public var logLevel: Logging.Logger.Level
    public let label: String
    public let queue: DispatchQueue
    private let osLog: os.Logger
    
    public init(subsystem: String, label: String, logLevel: Logging.Logger.Level = .trace) {
        self.metadata = [:]
        self.label = label
        self.queue = DispatchQueue(label: label)
        self.logLevel = logLevel
        self.osLog = os.Logger(subsystem: subsystem, category: label)
    }
    
    public subscript(metadataKey key: String) -> Logging.Logger.Metadata.Value? {
        get {
            return metadata[key]
        }
        set(newValue) {
            metadata[key] = newValue
        }
    }
    
    public func log(
        level: Logging.Logger.Level,
        message: Logging.Logger.Message,
        metadata: Logging.Logger.Metadata?,
        source: String, file: String, function: String, line: UInt)
    {
        let osMsg: String
        if let metadata = metadata {
            osMsg = "\(message) \(String(describing: metadata))"
        } else {
            osMsg = "\(message)"
        }
    
        self.osLog.log(level: logType(level), "\(osMsg, privacy: .public)")
    }
    
    private func logType(_ level: Logging.Logger.Level) -> OSLogType {
        switch level {
        case .trace:
            // `OSLog` doesn't have `trace`, so use `debug` instead.
            return .debug
        case .debug:
            return .debug
        case .info:
            return .info
        case .notice:
            // `OSLog` doesn't have `notice`, so use `info` instead.
            return .info
        case .warning:
            // `OSLog` doesn't have `warning`, so use `default` instead.
            return .default
        case .error:
            return .error
        case .critical:
            // `OSLog` doesn't have `critical`, so use `.fault` instead.
            return .fault
        }
    }
}

#endif // canImport(Logging)

#if canImport(Logging) && canImport(Puppy)
import Logging
import Puppy

/// Logs to both OSLog and Puppy.
public struct PsiphonLogHandler: LogHandler {
    
    public var logLevel: Logging.Logger.Level
    public var metadata: Logging.Logger.Metadata
    
    private let label: String
    private let puppy: Puppy
    private let metadataEncoder: JSONEncoder

    public init(label: String, logLevel: Logging.Logger.Level, puppy: Puppy, metadata: Logging.Logger.Metadata = [:]) {
        self.label = label
        self.logLevel = logLevel
        self.puppy = puppy
        self.metadata = metadata
        self.metadataEncoder = JSONEncoder()
    }
    
    public subscript(metadataKey key: String) -> Logging.Logger.Metadata.Value? {
        get {
            return metadata[key]
        }
        set(newValue) {
            metadata[key] = newValue
        }
    }

    public func log(
        level: Logging.Logger.Level,
        message: Logging.Logger.Message,
        metadata: Logging.Logger.Metadata?,
        source: String, file: String, function: String, line: UInt) 
    {
        
        // Log with Puppy
        do {
            let metadata = mergedMetadata(metadata)
            let encodedMetadata = try metadataEncoder.encode(metadata)
            var swiftLogInfo = ["label": label, "source": source]
            
            if let encodedMetadata = String(data: encodedMetadata, encoding: .utf8) {
                swiftLogInfo["metadata"] = encodedMetadata
            }
            puppy.logMessage(level.toPuppy(), message: "\(message)", tag: "swiftlog", function: function, file: file, line: line, swiftLogInfo: swiftLogInfo)
        } catch {
            os_log(.fault, "failed to encode metadata")
        }
        
    }

    private func mergedMetadata(_ metadata: Logging.Logger.Metadata?) -> Logging.Logger.Metadata {
        var mergedMetadata: Logging.Logger.Metadata
        if let metadata = metadata {
            mergedMetadata = self.metadata.merging(metadata, uniquingKeysWith: { _, new in new })
        } else {
            mergedMetadata = self.metadata
        }
        return mergedMetadata
    }
    
}

extension Logging.Logger.MetadataValue : Encodable {
    
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .stringConvertible(let stringConvertible):
            try container.encode(stringConvertible.description)
        case .string(let string):
            try container.encode(string)
        case .array(let array):
            try container.encode(array)
        case .dictionary(let dict):
            try container.encode(dict)
        }
    }
    
}

extension Logging.Logger.Level {
    
    func toPuppy() -> LogLevel {
        switch self {
        case .trace:
            return .trace
        case .debug:
            return .debug
        case .info:
            return .info
        case .notice:
            return .notice
        case .warning:
            return .warning
        case .error:
            return .error
        case .critical:
            return .critical
        }
    }
    
}

#endif // canImport(Logging) & canImport(Puppy)

