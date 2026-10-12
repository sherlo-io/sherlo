package expo.modules.spikenet

import android.app.Application
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import com.facebook.react.ReactApplication
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.security.SecureRandom
import kotlin.concurrent.thread

private const val TAG = "SpikeNet"

/**
 * Spike bundle-reload: one native WebSocket held in a static, so it outlives a JS reload.
 * A text message "RELOAD" from the server reloads the JS bundle natively (ReactHost.reload);
 * every other message is handed to whichever JS context is current, as the "onMessage" event.
 */
private class HeldSocket(url: String) {
  private val socket = Socket()
  private val output: BufferedOutputStream
  private val input: DataInputStream
  private val random = SecureRandom()
  private val writeLock = Any()
  @Volatile var open = true

  init {
    val uri = URI(url)
    val port = if (uri.port > 0) uri.port else 80
    socket.tcpNoDelay = true
    socket.connect(InetSocketAddress(uri.host, port), 5000)
    output = BufferedOutputStream(socket.getOutputStream(), 65536)
    input = DataInputStream(BufferedInputStream(socket.getInputStream(), 65536))
    val key = Base64.encodeToString(ByteArray(16).also { random.nextBytes(it) }, Base64.NO_WRAP)
    val path = if (uri.rawPath.isNullOrEmpty()) "/" else uri.rawPath
    output.write(
      ("GET $path HTTP/1.1\r\nHost: ${uri.host}:$port\r\nUpgrade: websocket\r\n" +
        "Connection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n")
        .toByteArray(Charsets.US_ASCII)
    )
    output.flush()
    val statusLine = readLine()
    while (readLine().isNotEmpty()) { /* skip headers */ }
    if (!statusLine.contains(" 101")) throw IllegalStateException("handshake refused: $statusLine")
  }

  private fun readLine(): String {
    val bytes = ByteArrayOutputStream()
    while (true) {
      val value = input.read()
      if (value < 0) throw IllegalStateException("closed during handshake")
      if (value == '\n'.code) break
      if (value != '\r'.code) bytes.write(value)
    }
    return bytes.toString("US-ASCII")
  }

  fun send(text: String) = synchronized(writeLock) {
    val payload = text.toByteArray(Charsets.UTF_8)
    val mask = ByteArray(4).also { random.nextBytes(it) }
    output.write(0x81)
    when {
      payload.size < 126 -> output.write(0x80 or payload.size)
      payload.size < 65536 -> {
        output.write(0x80 or 126)
        output.write(payload.size shr 8)
        output.write(payload.size and 0xff)
      }
      else -> {
        output.write(0x80 or 127)
        val length = payload.size.toLong()
        for (shift in 56 downTo 0 step 8) output.write(((length shr shift) and 0xff).toInt())
      }
    }
    output.write(mask)
    for (index in payload.indices) payload[index] = (payload[index].toInt() xor mask[index and 3].toInt()).toByte()
    output.write(payload)
    output.flush()
  }

  /** Blocks on the socket, calling onText for every text message, until it closes. */
  fun readForever(onText: (String) -> Unit) {
    try {
      val message = ByteArrayOutputStream()
      while (true) {
        val first = input.readUnsignedByte()
        val second = input.readUnsignedByte()
        var length = (second and 0x7f).toLong()
        if (length == 126L) length = input.readUnsignedShort().toLong()
        else if (length == 127L) length = input.readLong()
        val frame = ByteArray(length.toInt())
        input.readFully(frame)
        val opcode = first and 0x0f
        if (opcode == 0x8) break
        if (opcode == 0x9 || opcode == 0xa) continue
        message.write(frame)
        if (first and 0x80 != 0) {
          onText(message.toString("UTF-8"))
          message.reset()
        }
      }
    } catch (error: Throwable) {
      Log.i(TAG, "socket read ended: $error")
    } finally {
      open = false
    }
  }
}

class SpikeNetModule : Module() {
  // A plain instance field: does the module object itself survive a reload?
  private var instanceValue: String? = null

  companion object {
    // Process-wide singletons: these survive anything short of the process dying.
    @Volatile private var application: Application? = null
    @Volatile private var current: SpikeNetModule? = null
    @Volatile private var held: HeldSocket? = null
    private val staticValues = mutableMapOf<String, String>()
    private val ticks = mutableMapOf<String, Long>()
    private val tickCounts = mutableMapOf<String, Int>()
    @Volatile private var contexts = 0
    @Volatile private var modulesCreated = 0
    @Volatile private var modulesDestroyed = 0
    @Volatile private var observing = 0
    @Volatile private var reloadRequestedAt = 0L
    @Volatile private var reloadsTriggered = 0
    @Volatile private var socketsOpened = 0

    private fun now() = SystemClock.elapsedRealtime()

    private fun triggerReload(reason: String) {
      val app = application as? ReactApplication ?: return
      reloadRequestedAt = now()
      reloadsTriggered += 1
      Handler(Looper.getMainLooper()).post {
        val host = app.reactHost
        Log.i(TAG, "reload via ReactHost.reload host=${host?.javaClass?.name}")
        host?.reload(reason)
      }
    }
  }

  private fun rssKb(): Long {
    val line = File("/proc/self/status").readLines().firstOrNull { it.startsWith("VmRSS:") } ?: return -1
    return line.filter { it.isDigit() }.toLong()
  }

  override fun definition() = ModuleDefinition {
    Name("SpikeNet")

    Events("onMessage")

    OnCreate {
      modulesCreated += 1
      application = appContext.reactContext?.applicationContext as? Application
      current = this@SpikeNetModule
    }

    OnDestroy {
      modulesDestroyed += 1
      if (current === this@SpikeNetModule) current = null
    }

    OnStartObserving { observing += 1 }
    OnStopObserving { observing -= 1 }

    Function("log") { message: String -> Log.i(TAG, message) }

    // Called once at the top of every JS context: numbers it, and says what the native side holds.
    Function("contextStarted") {
      contexts += 1
      current = this@SpikeNetModule
      val since = if (reloadRequestedAt > 0) now() - reloadRequestedAt else -1L
      mapOf(
        "ctx" to contexts,
        "pid" to Process.myPid(),
        "processAgeMs" to (now() - Process.getStartElapsedRealtime()),
        "msSinceReloadRequest" to since,
        "socketHeld" to (held?.open == true)
      )
    }

    Function("nativeState") {
      synchronized(staticValues) {
        mapOf(
          "staticValues" to staticValues.toMap(),
          "instanceValue" to instanceValue,
          "ticks" to ticks.mapValues { now() - it.value },
          "tickCounts" to tickCounts.toMap(),
          "contexts" to contexts,
          "modulesCreated" to modulesCreated,
          "modulesDestroyed" to modulesDestroyed,
          "observing" to observing,
          "reloadsTriggered" to reloadsTriggered,
          "socketsOpened" to socketsOpened,
          "socketHeld" to (held?.open == true),
          "msSinceReloadRequest" to (if (reloadRequestedAt > 0) now() - reloadRequestedAt else -1L),
          "pid" to Process.myPid()
        )
      }
    }

    Function("setStatic") { key: String, value: String ->
      synchronized(staticValues) { staticValues[key] = value }
    }

    Function("setInstance") { value: String -> instanceValue = value }

    Function("tick") { key: String ->
      synchronized(staticValues) {
        ticks[key] = now()
        tickCounts[key] = (tickCounts[key] ?: 0) + 1
      }
    }

    Function("memory") {
      val info = Debug.MemoryInfo()
      Debug.getMemoryInfo(info)
      mapOf("rssKb" to rssKb(), "pssKb" to info.totalPss)
    }

    // Reuses the held socket when one survived; otherwise opens it and starts its reader.
    AsyncFunction("connect") { url: String, promise: Promise ->
      thread {
        try {
          val existing = held
          if (existing != null && existing.open) {
            promise.resolve(mapOf("reused" to true))
            return@thread
          }
          val socket = HeldSocket(url)
          held = socket
          socketsOpened += 1
          thread(name = "spike-socket-reader") {
            socket.readForever { text ->
              if (text == "RELOAD") {
                triggerReload("spike: RELOAD over the held socket")
              } else {
                current?.sendEvent("onMessage", mapOf("text" to text))
              }
            }
          }
          promise.resolve(mapOf("reused" to false))
        } catch (error: Throwable) {
          promise.reject("E_CONNECT", error.toString(), error)
        }
      }
    }

    AsyncFunction("send") { text: String, promise: Promise ->
      thread {
        try {
          val socket = held ?: throw IllegalStateException("no socket")
          socket.send(text)
          promise.resolve(null)
        } catch (error: Throwable) {
          promise.reject("E_SEND", error.toString(), error)
        }
      }
    }

    Function("reload") { reason: String -> triggerReload(reason) }
  }
}
