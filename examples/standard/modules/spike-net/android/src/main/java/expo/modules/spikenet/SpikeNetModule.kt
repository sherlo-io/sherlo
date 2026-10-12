package expo.modules.spikenet

import android.os.Process
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.security.SecureRandom
import java.util.concurrent.CompletableFuture
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

private const val TAG = "SpikeNet"
private const val PREFS = "SpikeNetPrefs"
private const val PREF_RESTART_MARK = "restartMark"

/** Spike release-connection: two native WebSocket clients behind one tiny interface. */
private interface Client {
  fun sendAndReceive(text: String): String
  fun close()
}

/** A hand-rolled RFC 6455 client over java.net.Socket (not subject to the cleartext policy). */
private class RawSocketClient(url: String) : Client {
  private val socket = Socket()
  private val output: BufferedOutputStream
  private val input: DataInputStream
  private val random = SecureRandom()

  init {
    val uri = URI(url)
    val port = if (uri.port > 0) uri.port else 80
    socket.tcpNoDelay = true
    socket.soTimeout = 30000
    socket.connect(InetSocketAddress(uri.host, port), 5000)
    output = BufferedOutputStream(socket.getOutputStream(), 65536)
    input = DataInputStream(BufferedInputStream(socket.getInputStream(), 65536))
    val keyBytes = ByteArray(16).also { random.nextBytes(it) }
    val key = Base64.encodeToString(keyBytes, Base64.NO_WRAP)
    val path = if (uri.rawPath.isNullOrEmpty()) "/" else uri.rawPath
    val request = "GET $path HTTP/1.1\r\nHost: ${uri.host}:$port\r\nUpgrade: websocket\r\n" +
      "Connection: Upgrade\r\nSec-WebSocket-Key: $key\r\nSec-WebSocket-Version: 13\r\n\r\n"
    output.write(request.toByteArray(Charsets.US_ASCII))
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

  override fun sendAndReceive(text: String): String {
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
      if (opcode == 0x8) throw IllegalStateException("server closed")
      if (opcode == 0x9 || opcode == 0xa) continue
      message.write(frame)
      if (first and 0x80 != 0) return message.toString("UTF-8")
    }
  }

  override fun close() {
    try { socket.close() } catch (_: Throwable) {}
  }
}

/** OkHttp's WebSocket, which React Native's own JS WebSocket uses on Android. */
private class OkHttpClientWs(url: String) : Client {
  private val messages = LinkedBlockingQueue<Any>()
  private val opened = CompletableFuture<Unit>()
  private val webSocket: WebSocket

  init {
    val client = OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
    webSocket = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) { opened.complete(Unit) }
      override fun onMessage(webSocket: WebSocket, text: String) { messages.put(text) }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        opened.completeExceptionally(t)
        messages.put(t)
      }
    })
    try {
      opened.get(10, TimeUnit.SECONDS)
    } catch (e: java.util.concurrent.ExecutionException) {
      throw e.cause ?: e
    }
  }

  override fun sendAndReceive(text: String): String {
    if (!webSocket.send(text)) throw IllegalStateException("okhttp send refused")
    val next = messages.poll(30, TimeUnit.SECONDS) ?: throw IllegalStateException("okhttp echo timeout")
    if (next is Throwable) throw next
    return next as String
  }

  override fun close() {
    webSocket.close(1000, null)
  }
}

private fun describe(error: Throwable): String {
  val parts = mutableListOf<String>()
  var current: Throwable? = error
  while (current != null && parts.size < 4) {
    parts.add("${current.javaClass.name}: ${current.message}")
    current = current.cause
  }
  return parts.joinToString(" <- ")
}

class SpikeNetModule : Module() {
  private var client: Client? = null

  override fun definition() = ModuleDefinition {
    Name("SpikeNet")

    Function("log") { message: String ->
      Log.i(TAG, message)
    }

    // What this process was launched with, and whether the SDK's restart was marked just before.
    Function("launchInfo") {
      val activity = appContext.currentActivity
      val intent = activity?.intent
      val prefs = appContext.reactContext!!.getSharedPreferences(PREFS, 0)
      val mark = prefs.getLong(PREF_RESTART_MARK, 0L)
      prefs.edit().remove(PREF_RESTART_MARK).commit()
      val sinceMark = if (mark > 0) System.currentTimeMillis() - mark else -1L
      mapOf(
        "platform" to "android",
        "pid" to Process.myPid(),
        "processAgeMs" to (SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()),
        "activity" to (activity?.javaClass?.name ?: "none"),
        "intentAction" to (intent?.action ?: "none"),
        "intentExtraKeys" to (intent?.extras?.keySet()?.joinToString(",") ?: ""),
        "sherloAddress" to intent?.getStringExtra("sherloAddress"),
        "msSinceRestartMark" to sinceMark
      )
    }

    Function("markRestart") {
      val prefs = appContext.reactContext!!.getSharedPreferences(PREFS, 0)
      prefs.edit().putLong(PREF_RESTART_MARK, System.currentTimeMillis()).commit()
    }

    AsyncFunction("open") { kind: String, url: String, promise: Promise ->
      thread {
        try {
          client?.close()
          client = null
          val started = SystemClock.elapsedRealtimeNanos()
          client = when (kind) {
            "raw" -> RawSocketClient(url)
            "okhttp" -> OkHttpClientWs(url)
            else -> throw IllegalArgumentException("unknown kind $kind")
          }
          promise.resolve((SystemClock.elapsedRealtimeNanos() - started) / 1e6)
        } catch (error: Throwable) {
          Log.i(TAG, "open $kind $url failed: ${describe(error)}")
          promise.reject("E_OPEN", describe(error), error)
        }
      }
    }

    AsyncFunction("echo") { text: String, promise: Promise ->
      thread {
        try {
          val current = client ?: throw IllegalStateException("not open")
          val started = SystemClock.elapsedRealtimeNanos()
          val reply = current.sendAndReceive(text)
          val nativeMs = (SystemClock.elapsedRealtimeNanos() - started) / 1e6
          promise.resolve(mapOf("length" to reply.length, "nativeMs" to nativeMs))
        } catch (error: Throwable) {
          promise.reject("E_ECHO", describe(error), error)
        }
      }
    }

    Function("close") {
      client?.close()
      client = null
    }
  }
}
