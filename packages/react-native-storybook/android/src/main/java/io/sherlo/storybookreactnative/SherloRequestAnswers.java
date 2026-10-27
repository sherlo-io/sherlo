package io.sherlo.storybookreactnative;

import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.modules.network.OkHttpClientProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * A story's request rules, answered in native code (src/mocking/networkNative tells which).
 *
 * An interceptor goes on every client React Native's OkHttpClientProvider makes - the networking
 * module's and the shared one, which libraries that download natively take and extend
 * (SherloAnsweringInterceptor). Glide, which an image view may drive with a client of its own, is
 * answered by a loader put first in its registry (SherloGlideAnswers). With no rules in effect and
 * requests let through, nothing is taken.
 */
public final class SherloRequestAnswers {
    private static final String TAG = "SherloRequestAnswers";
    private static final List<String> LOOPBACK_HOSTS = Arrays.asList("localhost", "127.0.0.1", "::1", "[::1]", "10.0.2.2");

    /** What a request no rule matches gets. */
    enum Unmatched { PASSTHROUGH, HELD, REFUSAL }

    /** One rule, as src/mocking/networkNative hands it over. */
    static final class Rule {
        String method;
        String urlKind;
        String urlValue;
        Pattern urlPattern;
        int status;
        final List<String[]> headers = new ArrayList<>();
        byte[] body;
        String contentType;

        boolean matches(String requestMethod, String url) {
            if (method != null && !method.equals(requestMethod)) return false;
            if (urlKind == null) return true;
            switch (urlKind) {
                case "exact": return url.equals(urlValue);
                case "prefix": return url.startsWith(urlValue);
                case "regex": return urlPattern != null && urlPattern.matcher(url).find();
                default: return false;
            }
        }
    }

    /** Everything in effect, replaced whole and never changed. */
    private static final class InEffect {
        final List<Rule> rules;
        final Unmatched unmatched;
        final Uri bundlerOrigin;

        InEffect(List<Rule> rules, Unmatched unmatched, Uri bundlerOrigin) {
            this.rules = rules;
            this.unmatched = unmatched;
            this.bundlerOrigin = bundlerOrigin;
        }
    }

    private static volatile InEffect inEffect = new InEffect(Collections.<Rule>emptyList(), Unmatched.PASSTHROUGH, null);
    private static boolean glideHeld = false;
    private static boolean clientsAnswered = false;

    private SherloRequestAnswers() {}

    /**
     * Put the answering interceptor on React Native's clients where a Sherlo run can follow
     * (SherloAnswersGate): before Application.onCreate in a debug build, and as the first activity
     * is made when the launch carried the runner's address - both before React Native makes its
     * clients. A release app launched with neither keeps React Native's own clients until
     * JavaScript hands rules over (never, in default mode), so only clients made after that meet them.
     */
    public static void installWhereARunCanFollow(Context context, String addressHandedAtLaunch) {
        boolean defaultMode = SherloModuleCore.MODE_DEFAULT.equals(SherloModuleCore.getCurrentMode());
        if (SherloAnswersGate.runCanFollow(context, defaultMode, addressHandedAtLaunch)) installOnSharedClient(context);
    }

    /**
     * Put the answering interceptor on every client OkHttpClientProvider makes from now on, once.
     * Built from the context, so the client keeps React Native's own HTTP cache.
     */
    private static synchronized void installOnSharedClient(Context context) {
        if (clientsAnswered || context == null) return;
        clientsAnswered = true;
        Context appContext = context.getApplicationContext();
        OkHttpClientProvider.setOkHttpClientFactory(() ->
                OkHttpClientProvider.createClientBuilder(appContext).addInterceptor(new SherloAnsweringInterceptor()).build());
    }

    /** Put the rules in effect: the JSON src/mocking/networkNative hands over. */
    public static boolean setRulesJson(Context context, String rulesJson) {
        installOnSharedClient(context);
        try {
            JSONObject handed = new JSONObject(rulesJson);
            List<Rule> rules = new ArrayList<>();
            JSONArray list = handed.optJSONArray("rules");
            for (int i = 0; list != null && i < list.length(); i++) rules.add(ruleOf(list.getJSONObject(i)));
            String origin = handed.optString("bundlerOrigin", "");
            inEffect = new InEffect(
                    Collections.unmodifiableList(rules),
                    unmatchedOf(handed.optString("unmatched", "passthrough")),
                    origin.isEmpty() || handed.isNull("bundlerOrigin") ? null : Uri.parse(origin));
        } catch (Exception unreadable) {
            Log.w(TAG, "rules unreadable, none put in effect", unreadable);
            return false;
        }
        if (inEffect.unmatched != Unmatched.PASSTHROUGH || !inEffect.rules.isEmpty()) holdGlide(context);
        return true;
    }

    /** Whether native code answers, holds or refuses this request, rather than letting it through. */
    static boolean takes(String method, String url) {
        InEffect current = inEffect;
        if (current.unmatched == Unmatched.PASSTHROUGH && current.rules.isEmpty()) return false;
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) return false;
        if (isBundlerUrl(uri, current.bundlerOrigin)) return false;
        return current.unmatched != Unmatched.PASSTHROUGH || ruleFor(method, url) != null;
    }

    /** The rule that answers a request, or null. */
    static Rule ruleFor(String method, String url) {
        if (url == null) return null;
        for (Rule rule : inEffect.rules) {
            if (rule.matches(method, url)) return rule;
        }
        return null;
    }

    /** What a request no rule matches gets now. */
    static Unmatched unmatched() {
        return inEffect.unmatched;
    }

    /** The refusal a request no rule matches gets, worded as fetch's is. */
    static IOException refusalOf(String method, String url) {
        return new IOException("no mock rule matches " + method + " " + url);
    }

    /** The bundler's own address: its host and port, or its port on another spelling of this machine. */
    private static boolean isBundlerUrl(Uri url, Uri bundler) {
        if (bundler == null || url.getHost() == null || bundler.getHost() == null) return false;
        if (url.getPort() != bundler.getPort()) return false;
        String host = url.getHost().toLowerCase(Locale.ROOT);
        String bundlerHost = bundler.getHost().toLowerCase(Locale.ROOT);
        return host.equals(bundlerHost) || (LOOPBACK_HOSTS.contains(host) && LOOPBACK_HOSTS.contains(bundlerHost));
    }

    private static synchronized void holdGlide(Context context) {
        if (glideHeld || context == null) return;
        try {
            Class.forName("com.bumptech.glide.Glide");
        } catch (ClassNotFoundException noGlide) {
            // The app has no Glide, so no picture is loaded through it.
            return;
        }
        try {
            SherloGlideAnswers.install(context.getApplicationContext());
            glideHeld = true;
        } catch (Throwable failed) {
            Log.w(TAG, "Glide not held", failed);
        }
    }

    private static Unmatched unmatchedOf(String word) {
        if ("held".equals(word)) return Unmatched.HELD;
        if ("refusal".equals(word)) return Unmatched.REFUSAL;
        return Unmatched.PASSTHROUGH;
    }

    private static Rule ruleOf(JSONObject json) throws Exception {
        Rule rule = new Rule();
        rule.method = json.has("method") ? json.getString("method") : null;
        JSONObject url = json.optJSONObject("url");
        if (url != null) {
            rule.urlKind = url.getString("kind");
            rule.urlValue = url.getString("value");
            if ("regex".equals(rule.urlKind)) {
                rule.urlPattern = Pattern.compile(rule.urlValue, url.optBoolean("ignoreCase") ? Pattern.CASE_INSENSITIVE : 0);
            }
        }
        rule.status = json.optInt("status", 200);
        JSONObject headers = json.optJSONObject("headers");
        if (headers != null) {
            Iterator<String> names = headers.keys();
            while (names.hasNext()) {
                String name = names.next();
                String value = headers.getString(name);
                rule.headers.add(new String[] {name, value});
                if (name.equalsIgnoreCase("content-type")) rule.contentType = value;
            }
        }
        rule.body = Base64.decode(json.optString("bodyBase64", ""), Base64.DEFAULT);
        return rule;
    }
}
