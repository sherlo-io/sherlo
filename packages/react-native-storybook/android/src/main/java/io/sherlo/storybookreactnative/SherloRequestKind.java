package io.sherlo.storybookreactnative;

import android.net.Uri;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * What the rules in effect make of one request, and whether JavaScript is told of it
 * (SherloRequestAnswers keeps the rules; this is the decision alone, so a test can pin it).
 */
final class SherloRequestKind {
    private static final List<String> LOOPBACK_HOSTS = Arrays.asList("localhost", "127.0.0.1", "::1", "[::1]", "10.0.2.2");

    /** A rule, as far as this decision needs it. */
    interface Matching {
        boolean matches(String method, String url);
    }

    /** What a request is to the rules. */
    enum Kind {
        /** Not a request the rules cover: not http(s), or the bundler's own address. */
        NOT_COVERED,
        /** A rule matches it. */
        ANSWERED,
        /** The rules cover it and none matches. */
        UNANSWERED
    }

    private SherloRequestKind() {}

    static Kind of(List<? extends Matching> rules, Uri bundlerOrigin, String method, String url) {
        if (url == null) return Kind.NOT_COVERED;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return Kind.NOT_COVERED;
        if (isBundlerUrl(uri, bundlerOrigin)) return Kind.NOT_COVERED;
        for (Matching rule : rules) {
            if (rule.matches(method, url)) return Kind.ANSWERED;
        }
        return Kind.UNANSWERED;
    }

    /**
     * Whether native code answers, holds or refuses a request of this kind, rather than letting it
     * through: one a rule matches, or one none matches where unmatched requests are not let through.
     */
    static boolean isTaken(Kind kind, boolean unmatchedLetThrough) {
        return kind == Kind.ANSWERED || (kind == Kind.UNANSWERED && !unmatchedLetThrough);
    }

    /**
     * Whether JavaScript is told of a request met on the let-through road (one native code did not
     * take): only an unanswered one, and only once rules were handed over.
     */
    static boolean isToldWhenLetThrough(Kind kind, boolean unmatchedLetThrough, boolean rulesHanded) {
        return rulesHanded && kind == Kind.UNANSWERED && unmatchedLetThrough;
    }

    /** The bundler's own address: its host and port, or its port on another spelling of this machine. */
    private static boolean isBundlerUrl(Uri url, Uri bundler) {
        if (bundler == null || url.getHost() == null || bundler.getHost() == null) return false;
        if (url.getPort() != bundler.getPort()) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        String bundlerHost = bundler.getHost().toLowerCase(Locale.ROOT);
        return host.equals(bundlerHost) || (LOOPBACK_HOSTS.contains(host) && LOOPBACK_HOSTS.contains(bundlerHost));
    }
}
