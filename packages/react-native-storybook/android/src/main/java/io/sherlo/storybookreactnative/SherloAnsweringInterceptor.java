package io.sherlo.storybookreactnative;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Connection;
import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Answers a request the rules take (SherloRequestAnswers), at the end of the client's own
 * interceptors.
 *
 * It goes on the shared client first, and a library that extends that client adds its own
 * interceptors after it - react-native-blob-util's saves the answer to a file. Answering on the
 * spot would skip those, so a request the rules take runs through the interceptors after this one
 * first, and is answered where they would have reached the network.
 */
final class SherloAnsweringInterceptor implements Interceptor {
    private static final long HELD_CHECK_MS = 100;

    @NonNull
    @Override
    public Response intercept(@NonNull Chain chain) throws IOException {
        Request request = chain.request();
        if (!SherloRequestAnswers.takes(request.method().toUpperCase(), request.url().toString())) {
            SherloRequestAnswers.tellIfLetThrough(
                    request.method().toUpperCase(), request.url().toString(), request.header("Content-Type"));
            return chain.proceed(request);
        }
        return new LastLink(chain, interceptorsAfterThis(chain), 0, request).proceed(request);
    }

    /**
     * The interceptors the client runs after this one. OkHttp names no call's client in its public
     * interface, so it is read from the call by name; a call that does not say leaves none, and the
     * request is answered on the spot.
     */
    private List<Interceptor> interceptorsAfterThis(Chain chain) {
        try {
            Call call = chain.call();
            Object client = call.getClass().getMethod("getClient").invoke(call);
            List<Interceptor> all = ((OkHttpClient) client).interceptors();
            int ours = all.indexOf(this);
            if (ours >= 0) return all.subList(ours + 1, all.size());
        } catch (ReflectiveOperationException | ClassCastException unreadable) {
            return Collections.emptyList();
        }
        return Collections.emptyList();
    }

    /** What reaches the end of the interceptors: the rule's answer, a hold, or a refusal. */
    private static Response answerAtTheEnd(Chain original, Request request) throws IOException {
        String method = request.method().toUpperCase();
        String url = request.url().toString();
        SherloRequestAnswers.Rule rule = SherloRequestAnswers.ruleFor(method, url);
        if (rule != null) return answerOf(request, rule);

        SherloRequestAnswers.Unmatched unmatched = SherloRequestAnswers.unmatched();
        if (unmatched != SherloRequestAnswers.Unmatched.PASSTHROUGH) {
            SherloRequestAnswers.tellUnanswered(method, url, request.header("Content-Type"));
        }
        switch (unmatched) {
            case HELD:
                holdUntilCanceled(original.call());
                throw new IOException("Canceled");
            case REFUSAL:
                throw SherloRequestAnswers.refusalOf(method, url);
            default:
                // The rules changed since this request was taken, and now let it through: on to the
                // network, past the interceptors after this one a second time.
                return original.proceed(request);
        }
    }

    /** A request held never gets an answer, as fetch's does not in a discover launch. */
    private static void holdUntilCanceled(Call call) throws IOException {
        try {
            while (!call.isCanceled()) Thread.sleep(HELD_CHECK_MS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("Canceled", interrupted);
        }
    }

    private static Response answerOf(Request request, SherloRequestAnswers.Rule rule) {
        MediaType mediaType = rule.contentType != null ? MediaType.parse(rule.contentType) : null;
        Response.Builder response = new Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(rule.status)
                .message("Sherlo")
                .body(ResponseBody.create(mediaType, rule.body));
        for (String[] header : rule.headers) response.addHeader(header[0], header[1]);
        response.header("Content-Length", String.valueOf(rule.body.length));
        return response.build();
    }

    /** The chain past this interceptor: the ones after it, then the answer in place of the network. */
    private static final class LastLink implements Chain {
        private final Chain original;
        private final List<Interceptor> rest;
        private final int index;
        private final Request request;

        LastLink(Chain original, List<Interceptor> rest, int index, Request request) {
            this.original = original;
            this.rest = rest;
            this.index = index;
            this.request = request;
        }

        @NonNull
        @Override
        public Response proceed(@NonNull Request next) throws IOException {
            if (index >= rest.size()) return answerAtTheEnd(original, next);
            return rest.get(index).intercept(new LastLink(original, rest, index + 1, next));
        }

        @NonNull
        @Override
        public Request request() {
            return request;
        }

        @Nullable
        @Override
        public Connection connection() {
            return null;
        }

        @NonNull
        @Override
        public Call call() {
            return original.call();
        }

        @Override
        public int connectTimeoutMillis() {
            return original.connectTimeoutMillis();
        }

        @NonNull
        @Override
        public Chain withConnectTimeout(int timeout, @NonNull TimeUnit unit) {
            return new LastLink(original.withConnectTimeout(timeout, unit), rest, index, request);
        }

        @Override
        public int readTimeoutMillis() {
            return original.readTimeoutMillis();
        }

        @NonNull
        @Override
        public Chain withReadTimeout(int timeout, @NonNull TimeUnit unit) {
            return new LastLink(original.withReadTimeout(timeout, unit), rest, index, request);
        }

        @Override
        public int writeTimeoutMillis() {
            return original.writeTimeoutMillis();
        }

        @NonNull
        @Override
        public Chain withWriteTimeout(int timeout, @NonNull TimeUnit unit) {
            return new LastLink(original.withWriteTimeout(timeout, unit), rest, index, request);
        }
    }
}
