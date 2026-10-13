package io.sherlo.storybookreactnative;

import android.util.Base64;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;

/**
 * One open WebSocket client connection, RFC 6455 by hand over java.net.Socket: the handshake,
 * masked frames out, frames in. It knows nothing of what the messages mean.
 */
final class WebSocketFrames {

    /** Receives each text message the server sends, on the reading thread. */
    interface TextListener {
        void onText(String text);
    }

    static final Charset UTF_8 = Charset.forName("UTF-8");

    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final String HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final SecureRandom RANDOM = new SecureRandom();

    private static final int OPCODE_CONTINUATION = 0x0;
    private static final int OPCODE_TEXT = 0x1;
    private static final int OPCODE_CLOSE = 0x8;
    private static final int OPCODE_PING = 0x9;
    private static final int OPCODE_PONG = 0xA;

    private final Socket socket;
    private final DataInputStream input;
    private final BufferedOutputStream output;
    private final Object writeLock = new Object();
    private volatile boolean closed = false;

    private WebSocketFrames(Socket socket) throws IOException {
        this.socket = socket;
        this.input = new DataInputStream(new BufferedInputStream(socket.getInputStream(), 65536));
        this.output = new BufferedOutputStream(socket.getOutputStream(), 65536);
    }

    /** Connects and completes the handshake, or throws. */
    static WebSocketFrames open(URI address) throws IOException {
        int port = address.getPort() > 0 ? address.getPort() : 80;
        Socket socket = new Socket();
        try {
            socket.setTcpNoDelay(true);
            socket.connect(new InetSocketAddress(withoutBrackets(address.getHost()), port), CONNECT_TIMEOUT_MS);
            WebSocketFrames connection = new WebSocketFrames(socket);
            connection.shakeHands(address, port);
            return connection;
        } catch (IOException failed) {
            socket.close();
            throw failed;
        }
    }

    boolean isClosed() {
        return closed;
    }

    void close() {
        closed = true;
        try {
            socket.close();
        } catch (IOException alreadyClosed) {
            // Nothing left to release.
        }
    }

    void writeText(String text) throws IOException {
        writeFrame(OPCODE_TEXT, text.getBytes(UTF_8));
    }

    /** Reads frames until the server closes or the connection breaks. */
    void readTexts(TextListener textListener) throws IOException {
        ByteArrayOutputStream fragmentedText = new ByteArrayOutputStream();
        while (true) {
            int firstByte = input.readUnsignedByte();
            int secondByte = input.readUnsignedByte();
            boolean isFinal = (firstByte & 0x80) != 0;
            int opcode = firstByte & 0x0f;
            long length = secondByte & 0x7f;
            if (length == 126) {
                length = input.readUnsignedShort();
            } else if (length == 127) {
                length = input.readLong();
            }
            if (length < 0 || length > Integer.MAX_VALUE) {
                throw new IOException("frame too large: " + length);
            }
            if ((secondByte & 0x80) != 0) {
                input.readFully(new byte[4]); // a server never masks; skip the key if one comes
            }
            byte[] payload = new byte[(int) length];
            input.readFully(payload);

            if (opcode == OPCODE_CLOSE) {
                writeFrame(OPCODE_CLOSE, payload);
                return;
            } else if (opcode == OPCODE_PING) {
                writeFrame(OPCODE_PONG, payload);
            } else if (opcode == OPCODE_TEXT || opcode == OPCODE_CONTINUATION) {
                fragmentedText.write(payload);
                if (isFinal) {
                    String text = new String(fragmentedText.toByteArray(), UTF_8);
                    fragmentedText.reset();
                    textListener.onText(text);
                }
            }
            // A pong, or a binary frame the protocol never sends: nothing to do.
        }
    }

    /** A client frame is always final and always masked. */
    private void writeFrame(int opcode, byte[] payload) throws IOException {
        byte[] mask = new byte[4];
        RANDOM.nextBytes(mask);
        byte[] maskedPayload = new byte[payload.length];
        for (int index = 0; index < payload.length; index++) {
            maskedPayload[index] = (byte) (payload[index] ^ mask[index & 3]);
        }
        synchronized (writeLock) {
            output.write(0x80 | opcode);
            if (payload.length < 126) {
                output.write(0x80 | payload.length);
            } else if (payload.length < 65536) {
                output.write(0x80 | 126);
                output.write(payload.length >> 8);
                output.write(payload.length & 0xff);
            } else {
                output.write(0x80 | 127);
                long length = payload.length;
                for (int shift = 56; shift >= 0; shift -= 8) {
                    output.write((int) ((length >> shift) & 0xff));
                }
            }
            output.write(mask);
            output.write(maskedPayload);
            output.flush();
        }
    }

    private void shakeHands(URI address, int port) throws IOException {
        byte[] keyBytes = new byte[16];
        RANDOM.nextBytes(keyBytes);
        String key = Base64.encodeToString(keyBytes, Base64.NO_WRAP);
        String path = address.getRawPath() == null || address.getRawPath().isEmpty() ? "/" : address.getRawPath();
        String request = "GET " + path + " HTTP/1.1\r\n"
                + "Host: " + address.getHost() + ":" + port + "\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Key: " + key + "\r\n"
                + "Sec-WebSocket-Version: 13\r\n\r\n";
        output.write(request.getBytes(UTF_8));
        output.flush();

        String statusLine = readHeaderLine();
        if (!statusLine.contains(" 101")) {
            throw new IOException("handshake refused: " + statusLine);
        }
        String acceptedKey = null;
        String headerLine;
        while (!(headerLine = readHeaderLine()).isEmpty()) {
            if (headerLine.toLowerCase().startsWith("sec-websocket-accept:")) {
                acceptedKey = headerLine.substring(headerLine.indexOf(':') + 1).trim();
            }
        }
        if (!expectedAcceptedKey(key).equals(acceptedKey)) {
            throw new IOException("handshake answered with the wrong Sec-WebSocket-Accept");
        }
    }

    private static String expectedAcceptedKey(String key) throws IOException {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest((key + HANDSHAKE_GUID).getBytes(UTF_8));
            return Base64.encodeToString(digest, Base64.NO_WRAP);
        } catch (NoSuchAlgorithmException cannotHappen) {
            throw new IOException(cannotHappen);
        }
    }

    private String readHeaderLine() throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        while (true) {
            int next = input.read();
            if (next < 0) {
                throw new IOException("closed during handshake");
            }
            if (next == '\n') {
                return new String(line.toByteArray(), UTF_8);
            }
            if (next != '\r') {
                line.write(next);
            }
        }
    }

    private static String withoutBrackets(String host) {
        return host.startsWith("[") ? host.substring(1, host.length() - 1) : host;
    }
}
