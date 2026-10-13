package io.sherlo.storybookreactnative;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** A WebSocket server on loopback, just enough to talk to SherloSocket from a test. */
final class LoopbackWebSocketServer {
    private static final Charset UTF_8 = Charset.forName("UTF-8");
    private static final String HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    private final ServerSocket listening;
    private final BlockingQueue<String> textsReceived = new LinkedBlockingQueue<>();
    private final BlockingQueue<Socket> connections = new LinkedBlockingQueue<>();

    LoopbackWebSocketServer() throws IOException {
        listening = new ServerSocket(0, 5, InetAddress.getByName("127.0.0.1"));
        Thread acceptThread = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptConnections();
            }
        });
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    String address() {
        return "ws://127.0.0.1:" + listening.getLocalPort() + "/sherlo/line";
    }

    /**
     * This server under a host that is not one of the loopback names SherloSocket recognises
     * (an IPv4-mapped IPv6 address): it stands in for a bundler on 10.0.2.2 or a LAN address.
     */
    String addressUnderAnotherHost() {
        return "ws://[::ffff:127.0.0.1]:" + listening.getLocalPort() + "/sherlo/line";
    }

    /** The next text a client sent on any connection, or null after four seconds. */
    String nextTextReceived() throws InterruptedException {
        return textsReceived.poll(4, TimeUnit.SECONDS);
    }

    /** The next text a client sent, or null when none arrives within `milliseconds`. */
    String nextTextReceivedWithin(long milliseconds) throws InterruptedException {
        return textsReceived.poll(milliseconds, TimeUnit.MILLISECONDS);
    }

    /** Hangs up on the newest client without a closing frame. */
    void dropClient() throws IOException, InterruptedException {
        connections.poll(4, TimeUnit.SECONDS).close();
    }

    void sendText(String text) throws IOException, InterruptedException {
        writeFrame(newestConnection(), 0x1, text.getBytes(UTF_8));
    }

    void sendPing(String payload) throws IOException, InterruptedException {
        writeFrame(newestConnection(), 0x9, payload.getBytes(UTF_8));
    }

    void stop() throws IOException {
        listening.close();
    }

    private Socket newestConnection() throws InterruptedException {
        Socket connection = connections.poll(4, TimeUnit.SECONDS);
        connections.add(connection);
        return connection;
    }

    private void acceptConnections() {
        try {
            while (true) {
                final Socket connection = listening.accept();
                Thread clientThread = new Thread(new Runnable() {
                    @Override
                    public void run() {
                        serve(connection);
                    }
                });
                clientThread.setDaemon(true);
                clientThread.start();
            }
        } catch (IOException listeningClosed) {
            // The test is over.
        }
    }

    private void serve(Socket connection) {
        try {
            DataInputStream input = new DataInputStream(connection.getInputStream());
            String key = readHandshakeKey(input);
            String accepted = Base64.getEncoder().encodeToString(
                    MessageDigest.getInstance("SHA-1").digest((key + HANDSHAKE_GUID).getBytes(UTF_8)));
            connection.getOutputStream().write((
                    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                            + "Sec-WebSocket-Accept: " + accepted + "\r\n\r\n").getBytes(UTF_8));
            connections.add(connection);
            while (true) {
                readClientFrame(input);
            }
        } catch (Exception clientGone) {
            // The client hung up, or this server was stopped.
        }
    }

    private String readHandshakeKey(DataInputStream input) throws IOException {
        String key = null;
        String line;
        while (!(line = readLine(input)).isEmpty()) {
            if (line.toLowerCase().startsWith("sec-websocket-key:")) {
                key = line.substring(line.indexOf(':') + 1).trim();
            }
        }
        return key;
    }

    private String readLine(DataInputStream input) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int next;
        while ((next = input.read()) != '\n') {
            if (next < 0) {
                throw new IOException("closed");
            }
            if (next != '\r') {
                line.write(next);
            }
        }
        return new String(line.toByteArray(), UTF_8);
    }

    /** A client frame is masked; text frames land in textsReceived, a pong as "pong:payload". */
    private void readClientFrame(DataInputStream input) throws IOException {
        int opcode = input.readUnsignedByte() & 0x0f;
        int length = input.readUnsignedByte() & 0x7f;
        if (length == 126) {
            length = input.readUnsignedShort();
        } else if (length == 127) {
            length = (int) input.readLong();
        }
        byte[] mask = new byte[4];
        input.readFully(mask);
        byte[] payload = new byte[length];
        input.readFully(payload);
        for (int index = 0; index < length; index++) {
            payload[index] = (byte) (payload[index] ^ mask[index & 3]);
        }
        String text = new String(payload, UTF_8);
        if (opcode == 0x1) {
            textsReceived.add(text);
        } else if (opcode == 0xA) {
            textsReceived.add("pong:" + text);
        }
    }

    /** A server frame is final and never masked. */
    private void writeFrame(Socket connection, int opcode, byte[] payload) throws IOException {
        OutputStream output = connection.getOutputStream();
        output.write(0x80 | opcode);
        output.write(payload.length);
        output.write(payload);
        output.flush();
    }
}
