//
// Copyright (c) 2024, Psiphon Inc.
// All rights reserved.
//


import Foundation

struct ParseError: Error {
    let message: String
}

/// Parses `data` as JSON Lines text format (newline-delimited diagnostic JSON lines).
func parseJSONLines<T: Decodable>(
    _ type: T.Type,
    data: String
) -> ([T], [ParseError]) {
    
    var entries = [T]()
    var parseErrors = [ParseError]()
    
    let decoder = JSONDecoder()
    
    for logLine in data.components(separatedBy: "\n") {
        
        guard !logLine.isEmpty else  {
            continue
        }
        
        guard let data = logLine.data(using: .utf8) else {
            fatalError()
        }
        
        do {
            entries.append(try decoder.decode(type, from: data))
        } catch {
            parseErrors.append(
                ParseError(
                    message: "failed to parse '\(logLine): \(error)'"))
        }
    }
    
    return (entries, parseErrors)
}

/// Reads logs from `paths` of type `T` and converts to `DiagnosticEntry` using the `transform` function.
/// Paths that do not exist are ignored.
/// The returned `DiagnosticEntry` array is sorted by timestamp in ascending order.
func readDiagnosticLogFiles<T: Decodable>(
    _ type: T.Type,
    paths: [URL],
    transform: (T) throws -> DiagnosticEntry
) throws -> ([DiagnosticEntry], [ParseError]) {
    
    var diagnosticEntries = [DiagnosticEntry]()
    var parseErrors = [ParseError]()
    
    for path in paths {
        
        // Ignore paths that don't exist.
        if !FileManager.default.fileExists(atPath: try path.filePath()) {
            Logger.conduitModule.info("No diagnostic file at path: \(path, privacy: .private)")
            continue
        }
        
        let data = try Data(contentsOf: path)
        let (entries, errs) = parseJSONLines(T.self, data: String(data: data, encoding: .utf8)!)
        
        diagnosticEntries.append(contentsOf: try entries.map(transform))
        parseErrors.append(contentsOf: errs)
        
    }
    
    // Sorts the entries by timestamp in ascending order.
    diagnosticEntries.sort {
        $0.timestamp < $1.timestamp
    }
    
    return (diagnosticEntries, parseErrors)
    
}
