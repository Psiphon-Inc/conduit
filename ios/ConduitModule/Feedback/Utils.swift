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
import Network

/// Returns interface type of the current NWPath.
func getCurrentNetworkType() async -> String {
    return await withCheckedContinuation { continuation in
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { path in
            let activeInterface = path.availableInterfaces.first {
                path.usesInterfaceType($0.type)
            }
            if let activeInterface {
                continuation.resume(returning: "\(activeInterface.type)")
            } else {
                continuation.resume(returning: "(unknown)")
            }
            monitor.cancel()
        }
        monitor.start(queue: .global())
    }
}
