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
#if canImport(ExpoModulesCore)
import ExpoModulesCore
import Foundation

public final class PsiphonTunnelCoreModule: Module {
  private var observingInproxyEvents = false

  public func definition() -> ModuleDefinition {
    Name("ExpoPsiphonTunnelCoreModule")

    Events("inproxyEvent", "ipcEvent")

    Function("logInfo") { (tag: String, message: String) in
      NSLog("INFO [\(tag)] \(message)")
    }

    Function("logError") { (tag: String, message: String) in
      NSLog("ERROR [\(tag)] \(message)")
    }

    Function("logWarn") { (tag: String, message: String) in
      NSLog("WARN [\(tag)] \(message)")
    }

    AsyncFunction("sendFeedback") { (_: String, promise: Promise) in
      promise.reject(Exception(
        name: "ERR_UNIMPLEMENTED",
        description: "Feedback upload is not implemented on iOS"
      ))
    }

    Function("emitCurrentInproxyState") {
      if observingInproxyEvents {
        sendUnimplementedInproxyEvent()
      }
    }

    AsyncFunction("toggleInProxy") { (_: [String: Any], promise: Promise) in
      promise.reject(Exception(name: "ERR_UNIMPLEMENTED", description: "In-proxy station mode is not implemented on iOS"))
    }

    AsyncFunction("paramsChanged") { (_: [String: Any], promise: Promise) in
      promise.reject(Exception(name: "ERR_UNIMPLEMENTED", description: "In-proxy station mode is not implemented on iOS"))
    }

    AsyncFunction("stopInProxy") { (promise: Promise) in
      promise.reject(Exception(name: "ERR_UNIMPLEMENTED", description: "In-proxy station mode is not implemented on iOS"))
    }

    OnStartObserving("inproxyEvent") {
      observingInproxyEvents = true
      sendUnimplementedInproxyEvent()
    }

    OnStopObserving("inproxyEvent") {
      observingInproxyEvents = false
    }

    OnStartObserving("ipcEvent") {
    }

    OnStopObserving("ipcEvent") {
    }
  }

  private func sendUnimplementedInproxyEvent() {
    sendEvent("inproxyEvent", [
      "type": "proxyError",
      "data": [
        "action": "unimplemented",
        "message": "In-proxy station mode is not implemented on iOS",
      ],
    ])
  }
}

#endif
