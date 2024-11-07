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


#if canImport(Logging) && canImport(Puppy)
import Foundation
import Logging
import Puppy

/// Logs to both OSLog and Puppy.
public struct PsiphonLogHandler: LogHandler {
    
    public var logLevel: Logging.Logger.Level
    public var metadata: Logging.Logger.Metadata
    
    private let label: String
    private let puppy: Puppy
    private let osLogger: os.Logger
    private let metadataEncoder: JSONEncoder

    public init(subsystem: String, label: String, logLevel: Logging.Logger.Level, puppy: Puppy, metadata: Logging.Logger.Metadata = [:]) {
        self.label = label
        self.logLevel = logLevel
        self.puppy = puppy
        self.metadata = metadata
        self.osLogger = Logger(subsystem: subsystem, category: label)
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
        
        // Log with OSLog
        let osMsg = "\(message) metadata=\(String(describing: metadata)) source=\(source) file=\(file) function=\(function) line=\(line)"
        switch level {
        case .trace: osLogger.trace("\(osMsg, privacy: .public)")
        case .debug: osLogger.debug("\(osMsg, privacy: .public)")
        case .info: osLogger.info("\(osMsg, privacy: .public)")
        case .notice: osLogger.notice("\(osMsg, privacy: .public)")
        case .warning: osLogger.warning("\(osMsg, privacy: .public)")
        case .error: osLogger.error("\(osMsg, privacy: .public)")
        case .critical: osLogger.critical("\(osMsg, privacy: .public)")
        }
            
        // Log with Puppy
        do {
            let metadata = mergedMetadata(metadata)
            let data = try metadataEncoder.encode(metadata)
            let encodedMetadata = String(data: data, encoding: .utf8) ?? ""
            let swiftLogInfo = ["label": label, "source": source, "metadata": encodedMetadata]
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

