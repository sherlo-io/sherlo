import ExpoModulesCore
import Foundation
import Network
import os

// Spike release-connection: two native WebSocket clients behind one tiny interface.
private protocol SpikeClient: AnyObject {
  func sendAndReceive(_ text: String, _ done: @escaping (Result<Int, Error>) -> Void)
  func close()
}

private struct SpikeError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

private func describe(_ error: Error) -> String {
  let nsError = error as NSError
  var text = "\(type(of: error)) domain=\(nsError.domain) code=\(nsError.code): \(nsError.localizedDescription)"
  if let underlying = nsError.userInfo[NSUnderlyingErrorKey] as? NSError {
    text += " <- domain=\(underlying.domain) code=\(underlying.code): \(underlying.localizedDescription)"
  }
  text += " (\(String(describing: error)))"
  return text
}

/// The first result wins: a send and a receive can both fail for one exchange.
private func once<T>(_ done: @escaping (T) -> Void) -> (T) -> Void {
  let lock = NSLock()
  var called = false
  return { value in
    lock.lock()
    let first = !called
    called = true
    lock.unlock()
    if first { done(value) }
  }
}

/// Network.framework's own WebSocket (outside App Transport Security).
private final class NWClient: SpikeClient {
  private let connection: NWConnection
  private let queue = DispatchQueue(label: "spike.nw")

  init(url: URL, opened: @escaping (Error?) -> Void) {
    let options = NWProtocolWebSocket.Options()
    options.autoReplyPing = true
    options.maximumMessageSize = 16 * 1024 * 1024
    let parameters = NWParameters.tcp
    parameters.defaultProtocolStack.applicationProtocols.insert(options, at: 0)
    connection = NWConnection(to: .url(url), using: parameters)
    var reported = false
    connection.stateUpdateHandler = { [weak connection] state in
      if reported { return }
      switch state {
      case .ready:
        reported = true
        opened(nil)
      case .failed(let error):
        reported = true
        opened(SpikeError(message: "NWConnection failed: \(error) (\(error.debugDescription))"))
      case .waiting(let error):
        reported = true
        connection?.cancel()
        opened(SpikeError(message: "NWConnection waiting: \(error) (\(error.debugDescription))"))
      default:
        break
      }
    }
    connection.start(queue: queue)
  }

  func sendAndReceive(_ text: String, _ done: @escaping (Result<Int, Error>) -> Void) {
    let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
    let context = NWConnection.ContentContext(identifier: "text", metadata: [metadata])
    connection.send(content: text.data(using: .utf8), contentContext: context, isComplete: true,
                    completion: .contentProcessed { error in
      if let error = error { done(.failure(SpikeError(message: "send: \(error)"))) }
    })
    receiveText(done)
  }

  private func receiveText(_ done: @escaping (Result<Int, Error>) -> Void) {
    connection.receiveMessage { [weak self] data, context, _, error in
      if let error = error { done(.failure(SpikeError(message: "receive: \(error)"))); return }
      let metadata = context?.protocolMetadata(definition: NWProtocolWebSocket.definition) as? NWProtocolWebSocket.Metadata
      if let opcode = metadata?.opcode, opcode != .text && opcode != .binary {
        self?.receiveText(done)
        return
      }
      done(.success(data?.count ?? 0))
    }
  }

  func close() { connection.cancel() }
}

/// URLSessionWebSocketTask, which App Transport Security governs.
private final class URLSessionClient: SpikeClient {
  private let task: URLSessionWebSocketTask

  init(url: URL, opened: @escaping (Error?) -> Void) {
    task = URLSession.shared.webSocketTask(with: url)
    task.maximumMessageSize = 16 * 1024 * 1024
    task.resume()
    // URLSession gives no "open" callback; prove the connection with one echo.
    sendAndReceive("hello urlsession") { result in
      switch result {
      case .success: opened(nil)
      case .failure(let error): opened(error)
      }
    }
  }

  func sendAndReceive(_ text: String, _ done: @escaping (Result<Int, Error>) -> Void) {
    task.send(.string(text)) { error in
      if let error = error { done(.failure(error)) }
    }
    task.receive { result in
      switch result {
      case .success(.string(let reply)): done(.success(reply.utf8.count))
      case .success(.data(let reply)): done(.success(reply.count))
      case .success: done(.success(0))
      case .failure(let error): done(.failure(error))
      }
    }
  }

  func close() { task.cancel(with: .normalClosure, reason: nil) }
}

private let restartMarkKey = "SpikeNetRestartMark"
private let logger = Logger(subsystem: "io.sherlo.spike", category: "SpikeNet")

public class SpikeNetModule: Module {
  private var client: SpikeClient?

  public func definition() -> ModuleDefinition {
    Name("SpikeNet")

    Function("log") { (message: String) in
      logger.log("\(message, privacy: .public)")
      NSLog("SpikeNet %@", message)
    }

    // What this process was launched with, and whether the SDK's restart was marked just before.
    Function("launchInfo") { () -> [String: Any?] in
      let defaults = UserDefaults.standard
      let mark = defaults.double(forKey: restartMarkKey)
      defaults.removeObject(forKey: restartMarkKey)
      let sinceMark = mark > 0 ? (Date().timeIntervalSince1970 - mark) * 1000 : -1
      let arguments = ProcessInfo.processInfo.arguments
      var fromArguments: String?
      if let index = arguments.firstIndex(of: "-sherloAddress"), index + 1 < arguments.count {
        fromArguments = arguments[index + 1]
      }
      return [
        "platform": "ios",
        "pid": Int(getpid()),
        "processAgeMs": (Date().timeIntervalSince1970 - SpikeNetModule.processStart) * 1000,
        "arguments": arguments.dropFirst().joined(separator: " "),
        "sherloAddress": fromArguments,
        "sherloAddressFromDefaults": defaults.string(forKey: "sherloAddress"),
        "msSinceRestartMark": sinceMark
      ]
    }

    Function("markRestart") {
      UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: restartMarkKey)
    }

    AsyncFunction("open") { (kind: String, urlString: String, promise: Promise) in
      self.client?.close()
      self.client = nil
      guard let url = URL(string: urlString) else {
        promise.reject("E_OPEN", "bad url \(urlString)")
        return
      }
      let started = DispatchTime.now().uptimeNanoseconds
      let opened: (Error?) -> Void = once { error in
        if let error = error {
          let text = describe(error)
          NSLog("SpikeNet open %@ %@ failed: %@", kind, urlString, text)
          promise.reject("E_OPEN", text)
        } else {
          promise.resolve(Double(DispatchTime.now().uptimeNanoseconds - started) / 1e6)
        }
      }
      switch kind {
      case "nw": self.client = NWClient(url: url, opened: opened)
      case "urlsession": self.client = URLSessionClient(url: url, opened: opened)
      default: promise.reject("E_OPEN", "unknown kind \(kind)")
      }
    }

    AsyncFunction("echo") { (text: String, promise: Promise) in
      guard let client = self.client else {
        promise.reject("E_ECHO", "not open")
        return
      }
      let started = DispatchTime.now().uptimeNanoseconds
      client.sendAndReceive(text, once { result in
        switch result {
        case .success(let length):
          promise.resolve([
            "length": length,
            "nativeMs": Double(DispatchTime.now().uptimeNanoseconds - started) / 1e6
          ])
        case .failure(let error):
          promise.reject("E_ECHO", describe(error))
        }
      })
    }

    Function("close") {
      self.client?.close()
      self.client = nil
    }
  }

  static let processStart: TimeInterval = {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    sysctl(&mib, 4, &info, &size, nil, 0)
    let start = info.kp_proc.p_starttime
    return TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1e6
  }()
}
