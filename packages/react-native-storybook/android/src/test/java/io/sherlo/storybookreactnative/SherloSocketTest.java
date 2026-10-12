package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.security.NetworkSecurityPolicy;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, shadows = ShadowNetworkSecurityPolicy.class)
public class SherloSocketTest {

    private LoopbackWebSocketServer server;
    private SherloSocket socket;
    private final BlockingQueue<String> textsFromServer = new LinkedBlockingQueue<>();

    @Before
    public void startServer() throws Exception {
        server = new LoopbackWebSocketServer();
        socket = new SherloSocket(
                server.address(),
                new SherloSocket.HelloVersions() {
                    @Override
                    public String nativeVersion() {
                        return "3.0.0-test";
                    }

                    @Override
                    public String jsVersion() {
                        return null;
                    }
                },
                new SherloSocket.MessageListener() {
                    @Override
                    public void onMessage(String messageText) {
                        textsFromServer.add(messageText);
                    }
                },
                20);
    }

    @After
    public void stopEverything() throws Exception {
        socket.stop();
        server.stop();
    }

    @Test
    public void speaks_websocket_to_a_loopback_server_with_cleartext_traffic_refused() throws Exception {
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted());

        socket.start();

        JSONObject hello = new JSONObject(server.nextTextReceived());
        assertEquals("hello", hello.getString("action"));
        assertEquals(SherloSocket.SHERLO_PROTOCOL_VERSION, hello.getInt("protocolVersion"));
        assertEquals("3.0.0-test", hello.getString("nativeVersion"));
        assertTrue(hello.isNull("jsVersion"));

        socket.send("{\"action\":\"story\"}");
        assertEquals("{\"action\":\"story\"}", server.nextTextReceived());

        server.sendText("{\"action\":\"config\"}");
        assertEquals("{\"action\":\"config\"}", textsFromServer.poll(4, TimeUnit.SECONDS));

        server.sendPing("are-you-there");
        assertEquals("pong:are-you-there", server.nextTextReceived());
    }

    @Test
    public void redials_the_same_address_after_the_connection_drops_and_says_hello_again() throws Exception {
        socket.start();
        assertEquals("hello", new JSONObject(server.nextTextReceived()).getString("action"));

        server.dropClient();
        socket.send("{\"action\":\"waited\",\"number\":1}");
        socket.send("{\"action\":\"waited\",\"number\":2}");

        assertEquals("hello", new JSONObject(server.nextTextReceived()).getString("action"));
        assertEquals("{\"action\":\"waited\",\"number\":1}", server.nextTextReceived());
        assertEquals("{\"action\":\"waited\",\"number\":2}", server.nextTextReceived());
    }

    @Test
    public void ignores_a_host_that_is_not_loopback() {
        assertFalse(SherloSocket.isLoopbackAddress("ws://192.168.1.20:8081/sherlo/line"));
        assertFalse(SherloSocket.isLoopbackAddress("ws://example.com/sherlo/line"));
        assertFalse(SherloSocket.isLoopbackAddress("http://127.0.0.1:8081/sherlo/line"));
        assertTrue(SherloSocket.isLoopbackAddress("ws://127.0.0.1:8081/sherlo/line"));
        assertTrue(SherloSocket.isLoopbackAddress("ws://localhost:8081/sherlo/line"));
        assertTrue(SherloSocket.isLoopbackAddress("ws://[::1]:8081/sherlo/line"));
    }

    @Test
    public void drops_log_lines_past_a_thousand_waiting_but_keeps_other_messages() throws Exception {
        for (int number = 0; number < SherloSocket.MAX_WAITING_LOG_LINES + 5; number++) {
            socket.sendLogLine("{\"action\":\"log\",\"number\":" + number + "}");
        }
        socket.send("{\"action\":\"story\"}");

        socket.start();

        assertEquals("hello", new JSONObject(server.nextTextReceived()).getString("action"));
        int logLinesReceived = 0;
        String text;
        while (!"{\"action\":\"story\"}".equals(text = server.nextTextReceived())) {
            logLinesReceived++;
            assertEquals("{\"action\":\"log\",\"number\":" + (logLinesReceived - 1) + "}", text);
        }
        assertEquals(SherloSocket.MAX_WAITING_LOG_LINES, logLinesReceived);
        assertNull(textsFromServer.poll());
    }
}
