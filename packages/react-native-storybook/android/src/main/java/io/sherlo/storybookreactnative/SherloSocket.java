package io.sherlo.storybookreactnative;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URI;
import java.util.LinkedList;

/**
 * The app's one WebSocket to whoever drives it (the runner, or the bundler in development).
 *
 * The wire format is WebSocketFrames, RFC 6455 written by hand over java.net.Socket, because an
 * Android release build refuses cleartext traffic through OkHttp, React Native's WebSocket and
 * fetch alike, and a plain Socket is not subject to that policy. This class is the connection's
 * life, and it dials loopback only.
 *
 * Every connection starts with a `hello`. After a drop it dials the same address again, for as
 * long as the process lives, and says `hello` again. Messages sent while it is down wait in order
 * behind that `hello`.
 */
public final class SherloSocket {

    /** Repeats SHERLO_PROTOCOL_VERSION from src/sealedCore/seam.ts. */
    public static final int SHERLO_PROTOCOL_VERSION = 1;

    /** How many `log` lines may wait while the socket is down; later ones are dropped. */
    static final int MAX_WAITING_LOG_LINES = 1000;

    private final long redialDelayMs;

    /** What the module knows when a connection opens, asked again on every connection. */
    public interface HelloVersions {
        String nativeVersion();

        /** Null while no JavaScript exists yet. */
        String jsVersion();
    }

    /** Called on the socket's reading thread with each text message the server sends. */
    public interface MessageListener {
        void onMessage(String messageText);
    }

    private static final class WaitingMessage {
        final String text;
        final boolean isLogLine;

        WaitingMessage(String text, boolean isLogLine) {
            this.text = text;
            this.isLogLine = isLogLine;
        }
    }

    private final URI address;
    private final HelloVersions helloVersions;
    private final MessageListener messageListener;

    private final Object lock = new Object();
    private final LinkedList<WaitingMessage> waitingMessages = new LinkedList<>();
    private int waitingLogLines = 0;
    private boolean stopped = false;
    private WebSocketFrames currentConnection = null;
    private Thread dialThread = null;

    public SherloSocket(String address, HelloVersions helloVersions, MessageListener messageListener) {
        this(address, helloVersions, messageListener, 250);
    }

    /** A test shortens the wait before dialing again. */
    SherloSocket(String address, HelloVersions helloVersions, MessageListener messageListener, long redialDelayMs) {
        this.address = URI.create(address);
        this.helloVersions = helloVersions;
        this.messageListener = messageListener;
        this.redialDelayMs = redialDelayMs;
    }

    /** True for a ws:// address on this device's own loopback; the only kind the socket dials. */
    public static boolean isLoopbackAddress(String address) {
        try {
            URI uri = URI.create(address);
            String host = uri.getHost();
            return "ws".equals(uri.getScheme())
                    && host != null
                    && ("127.0.0.1".equals(host) || "localhost".equals(host) || "[::1]".equals(host));
        } catch (IllegalArgumentException invalidAddress) {
            return false;
        }
    }

    /** Starts dialing. Does nothing for an address that is not loopback. */
    public void start() {
        synchronized (lock) {
            if (dialThread != null || stopped || !isLoopbackAddress(address.toString())) {
                return;
            }
            dialThread = new Thread(new Runnable() {
                @Override
                public void run() {
                    dialUntilStopped();
                }
            }, "SherloSocket-dial");
            dialThread.setDaemon(true);
            dialThread.start();
        }
    }

    /** Closes the connection and stops redialing. */
    public void stop() {
        synchronized (lock) {
            stopped = true;
            if (currentConnection != null) {
                currentConnection.close();
            }
            if (dialThread != null) {
                dialThread.interrupt();
            }
            lock.notifyAll();
        }
    }

    /** Sends one JSON message, or keeps it in order until the socket is back. */
    public void send(String messageJson) {
        synchronized (lock) {
            waitingMessages.addLast(new WaitingMessage(messageJson, false));
            lock.notifyAll();
        }
    }

    /** Like send, but a log line is dropped when too many already wait. */
    public void sendLogLine(String logLineJson) {
        synchronized (lock) {
            if (waitingLogLines >= MAX_WAITING_LOG_LINES) {
                return;
            }
            waitingLogLines++;
            waitingMessages.addLast(new WaitingMessage(logLineJson, true));
            lock.notifyAll();
        }
    }

    private void dialUntilStopped() {
        while (!isStopped()) {
            try {
                serve(WebSocketFrames.open(address));
            } catch (IOException connectionFailed) {
                // Nobody is listening yet, or the connection broke: dial again.
            }
            try {
                Thread.sleep(redialDelayMs);
            } catch (InterruptedException interrupted) {
                return;
            }
        }
    }

    private boolean isStopped() {
        synchronized (lock) {
            return stopped;
        }
    }

    /** Reads on this thread and writes on another, until the connection ends. */
    private void serve(final WebSocketFrames connection) {
        synchronized (lock) {
            if (stopped) {
                connection.close();
                return;
            }
            currentConnection = connection;
        }
        Thread writerThread = new Thread(new Runnable() {
            @Override
            public void run() {
                writeUntilConnectionEnds(connection);
            }
        }, "SherloSocket-write");
        writerThread.setDaemon(true);
        writerThread.start();
        try {
            connection.readTexts(new WebSocketFrames.TextListener() {
                @Override
                public void onText(String text) {
                    messageListener.onMessage(text);
                }
            });
        } catch (IOException connectionBroke) {
            // Falls through to close.
        } finally {
            connection.close();
            synchronized (lock) {
                currentConnection = null;
                lock.notifyAll();
            }
            try {
                writerThread.join();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void writeUntilConnectionEnds(WebSocketFrames connection) {
        try {
            connection.writeText(helloText());
            while (true) {
                WaitingMessage message = takeNextWaitingMessage(connection);
                if (message == null) {
                    return;
                }
                try {
                    connection.writeText(message.text);
                } catch (IOException writeFailed) {
                    putBackAsNext(message);
                    throw writeFailed;
                }
            }
        } catch (IOException connectionBroke) {
            connection.close();
        } catch (InterruptedException interrupted) {
            connection.close();
        }
    }

    /** Waits for a message; null once the connection has ended. */
    private WaitingMessage takeNextWaitingMessage(WebSocketFrames connection) throws InterruptedException {
        synchronized (lock) {
            while (!connection.isClosed() && waitingMessages.isEmpty()) {
                lock.wait();
            }
            if (connection.isClosed()) {
                return null;
            }
            WaitingMessage message = waitingMessages.removeFirst();
            if (message.isLogLine) {
                waitingLogLines--;
            }
            return message;
        }
    }

    private void putBackAsNext(WaitingMessage message) {
        synchronized (lock) {
            waitingMessages.addFirst(message);
            if (message.isLogLine) {
                waitingLogLines++;
            }
        }
    }

    private String helloText() {
        try {
            JSONObject hello = new JSONObject();
            hello.put("action", "hello");
            hello.put("protocolVersion", SHERLO_PROTOCOL_VERSION);
            hello.put("nativeVersion", helloVersions.nativeVersion());
            String jsVersion = helloVersions.jsVersion();
            hello.put("jsVersion", jsVersion == null ? JSONObject.NULL : jsVersion);
            return hello.toString();
        } catch (JSONException cannotHappen) {
            throw new IllegalStateException(cannotHappen);
        }
    }
}
