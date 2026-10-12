import ExpoModulesCore
import Foundation
import Network
import React
import os

// Spike bundle-reload: one native WebSocket held in a static, so it outlives a JS reload.
// A text message "RELOAD" from the server reloads the JS bundle natively
// (RCTTriggerReloadCommandListeners, the call the SDK's own iOS restart makes); every other
// message is handed to whichever JS context is current, as the "onMessage" event.

private let logger = Logger(subsystem: "io.sherlo.spike", category: "SpikeNet")

private func monotonicMs() -> Double {
  Double(DispatchTime.now().uptimeNanoseconds) / 1e6
}

private final class HeldSocket {
  private let connection: NWConnection
  private let queue = DispatchQueue(label: "spike.held")
  private(set) var open = false

  init(url: URL, opened: @escaping (Error?) -> Void, onText: @escaping (String) -> Void) {
    let options = NWProtocolWebSocket.Options()
    options.autoReplyPing = true
    let parameters = NWParameters.tcp
    parameters.defaultProtocolStack.applicationProtocols.insert(options, at: 0)
    connection = NWConnection(to: .url(url), using: parameters)
    var reported = false
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        self?.open = true
        if !reported { reported = true; opened(nil); self?.receive(onText) }
      case .failed(let error), .waiting(let error):
        self?.open = false
        if !reported { reported = true; opened(error) }
        self?.connection.cancel()
      case .cancelled:
        self?.open = false
      default:
        break
      }
    }
    connection.start(queue: queue)
  }

  private func receive(_ onText: @escaping (String) -> Void) {
    connection.receiveMessage { [weak self] data, _, _, error in
      if error != nil { self?.open = false; return }
      if let data = data, let text = String(data: data, encoding: .utf8), !text.isEmpty { onText(text) }
      self?.receive(onText)
    }
  }

  func send(_ text: String, _ done: @escaping (Error?) -> Void) {
    let metadata = NWProtocolWebSocket.Metadata(opcode: .text)
    let context = NWConnection.ContentContext(identifier: "text", metadata: [metadata])
    connection.send(content: text.data(using: .utf8), contentContext: context, isComplete: true,
                    completion: .contentProcessed { error in done(error) })
  }
}

public class SpikeNetModule: Module {
  // A plain instance field: does the module object itself survive a reload?
  private var instanceValue: String?

  // Process-wide singletons: these survive anything short of the process dying.
  private static let lock = NSLock()
  private static weak var current: SpikeNetModule?
  private static var held: HeldSocket?
  private static var staticValues: [String: String] = [:]
  private static var ticks: [String: Double] = [:]
  private static var tickCounts: [String: Int] = [:]
  private static var contexts = 0
  private static var modulesCreated = 0
  private static var modulesDestroyed = 0
  private static var observing = 0
  private static var reloadRequestedAt: Double = 0
  private static var reloadsTriggered = 0
  private static var socketsOpened = 0

  private static func triggerReload(_ reason: String) {
    reloadRequestedAt = monotonicMs()
    reloadsTriggered += 1
    DispatchQueue.main.async {
      RCTTriggerReloadCommandListeners(reason)
    }
  }

  private static func memory() -> [String: Any] {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    if result != KERN_SUCCESS { return ["rssKb": -1, "footprintKb": -1] }
    return ["rssKb": Int(info.resident_size / 1024), "footprintKb": Int(info.phys_footprint / 1024)]
  }

  public func definition() -> ModuleDefinition {
    Name("SpikeNet")

    Events("onMessage")

    OnCreate {
      SpikeNetModule.modulesCreated += 1
      SpikeNetModule.current = self
    }

    OnDestroy {
      SpikeNetModule.modulesDestroyed += 1
    }

    OnStartObserving { SpikeNetModule.observing += 1 }
    OnStopObserving { SpikeNetModule.observing -= 1 }

    Function("log") { (message: String) in
      logger.log("\(message, privacy: .public)")
    }

    // Called once at the top of every JS context: numbers it, and says what the native side holds.
    Function("contextStarted") { () -> [String: Any] in
      SpikeNetModule.contexts += 1
      SpikeNetModule.current = self
      let mark = SpikeNetModule.reloadRequestedAt
      return [
        "ctx": SpikeNetModule.contexts,
        "pid": Int(getpid()),
        "processAgeMs": (Date().timeIntervalSince1970 - SpikeNetModule.processStart) * 1000,
        "msSinceReloadRequest": mark > 0 ? monotonicMs() - mark : -1,
        "socketHeld": SpikeNetModule.held?.open == true
      ]
    }

    Function("nativeState") { () -> [String: Any] in
      SpikeNetModule.lock.lock()
      defer { SpikeNetModule.lock.unlock() }
      let now = monotonicMs()
      let mark = SpikeNetModule.reloadRequestedAt
      return [
        "staticValues": SpikeNetModule.staticValues,
        "instanceValue": self.instanceValue.map { $0 as Any } ?? NSNull(),
        "ticks": SpikeNetModule.ticks.mapValues { now - $0 },
        "tickCounts": SpikeNetModule.tickCounts,
        "contexts": SpikeNetModule.contexts,
        "modulesCreated": SpikeNetModule.modulesCreated,
        "modulesDestroyed": SpikeNetModule.modulesDestroyed,
        "observing": SpikeNetModule.observing,
        "reloadsTriggered": SpikeNetModule.reloadsTriggered,
        "socketsOpened": SpikeNetModule.socketsOpened,
        "socketHeld": SpikeNetModule.held?.open == true,
        "msSinceReloadRequest": mark > 0 ? now - mark : -1,
        "pid": Int(getpid())
      ]
    }

    Function("setStatic") { (key: String, value: String) in
      SpikeNetModule.lock.lock()
      SpikeNetModule.staticValues[key] = value
      SpikeNetModule.lock.unlock()
    }

    Function("setInstance") { (value: String) in
      self.instanceValue = value
    }

    Function("tick") { (key: String) in
      SpikeNetModule.lock.lock()
      SpikeNetModule.ticks[key] = monotonicMs()
      SpikeNetModule.tickCounts[key, default: 0] += 1
      SpikeNetModule.lock.unlock()
    }

    Function("memory") { () -> [String: Any] in
      SpikeNetModule.memory()
    }

    // Reuses the held socket when one survived; otherwise opens it and starts its reader.
    AsyncFunction("connect") { (urlString: String, promise: Promise) in
      if let existing = SpikeNetModule.held, existing.open {
        promise.resolve(["reused": true])
        return
      }
      guard let url = URL(string: urlString) else {
        promise.reject("E_CONNECT", "bad url \(urlString)")
        return
      }
      var resolved = false
      SpikeNetModule.held = HeldSocket(url: url, opened: { error in
        if resolved { return }
        resolved = true
        if let error = error {
          promise.reject("E_CONNECT", "\(error)")
        } else {
          SpikeNetModule.socketsOpened += 1
          promise.resolve(["reused": false])
        }
      }, onText: { text in
        if text == "RELOAD" {
          SpikeNetModule.triggerReload("spike: RELOAD over the held socket")
        } else {
          SpikeNetModule.current?.sendEvent("onMessage", ["text": text])
        }
      })
    }

    AsyncFunction("send") { (text: String, promise: Promise) in
      guard let socket = SpikeNetModule.held else {
        promise.reject("E_SEND", "no socket")
        return
      }
      socket.send(text) { error in
        if let error = error { promise.reject("E_SEND", "\(error)") } else { promise.resolve(nil) }
      }
    }

    Function("reload") { (reason: String) in
      SpikeNetModule.triggerReload(reason)
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
