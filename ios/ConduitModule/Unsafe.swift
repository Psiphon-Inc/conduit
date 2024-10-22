/*
 * Copyright (c) 2024, Psiphon Inc.
 * All rights reserved.
 */

import Foundation

final class Box<T> {
    var value: T?
    init(value: T? = nil) {
        self.value = value
    }
}

func unsafeWait<T>(_ f: @escaping () async -> T) -> T {
    let box = Box<T>()
    let sema = DispatchSemaphore(value: 0)
    Task { [sema, box, f] in
        box.value = await f()
        sema.signal()
    }
    sema.wait()
    switch box.value {
    case .some(let value): return value
    case .none: fatalError("value not set")
    }
}

func unsafeWait<ResultType>(_ f: @escaping () async throws -> ResultType) throws -> ResultType {
    let box = Box<Result<ResultType, Error>>()
    let sema = DispatchSemaphore(value: 0)
    Task { [sema, box, f] in
        do {
            box.value = .success(try await f())
        } catch {
            box.value = .failure(error)
        }
        sema.signal()
    }
    sema.wait()
    switch box.value {
    case let .success(resultType):
        return resultType
    case let .failure(error):
        throw error
    case .none:
        fatalError("value not set")
    }
}
