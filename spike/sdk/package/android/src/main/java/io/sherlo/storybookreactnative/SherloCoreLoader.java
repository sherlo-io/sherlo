package io.sherlo.storybookreactnative;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * Spike: picks which sealed core the app runs and hands its source to JS.
 *
 * Order: a core in the app's storage folder (files/sherlo/sherlo-core.js) wins, but only when its
 * signature (sherlo-core.js.sig) verifies against Sherlo's public key and its seam is one this SDK
 * speaks. Otherwise the core shipped inside the SDK (assets/sherlo-core.js) runs.
 */
public class SherloCoreLoader {
    private static final String TAG = "SherloModule:CoreLoader";

    // The seam numbers this SDK speaks. A core whose header names another seam is never run.
    private static final int SUPPORTED_SEAM = 1;

    // Spike test key (X.509 SubjectPublicKeyInfo DER, base64). The real one is Sherlo's release key.
    private static final String SHERLO_CORE_PUBLIC_KEY =
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxwuNK/v8HC6O+kHl+0fZqKZfcsW1h+FzVjcMprkWI2J9P+Z4yezALy/lRiqIXz3eDoe31SmkUacYRninMOli0iRpuUAAf3RV21CQoX8Knfl4u4yFsNNB/j8dkJOxGm1QoqV3XOu78sJyO54KHnPWM33yknkyifv/QxC5fwdtuv11Z/ssmiXAVStZV7t9Cow2nFDMaPFdfA4N1hdWg6bbIUeazT4w2fLaCKYdyts1CXZiXjyUJp30c5+wyMXOVHnTbY3Ye1Ap8VsNFfwvrurZYaG3TxHWTbnasWOX4Xwns4SITw+Nq7QA1hQTTlpbrXd+vEMaUfulA1dr8yk79MdzDwIDAQAB";

    /** JSON: { source, origin: "override" | "shipped" | "none", version, reason, nativeMs }. */
    public static String loadCoreJson(Context context) {
        long start = System.nanoTime();
        JSONObject result = new JSONObject();
        try {
            String[] refusal = new String[1];
            byte[] override = readOverride(context, refusal);
            String source = null;
            if (override != null) {
                result.put("origin", "override");
                source = new String(override, StandardCharsets.UTF_8);
            } else {
                byte[] shipped = readShipped(context);
                if (shipped != null) {
                    result.put("origin", "shipped");
                    source = new String(shipped, StandardCharsets.UTF_8);
                } else {
                    result.put("origin", "none");
                    if (refusal[0] == null) refusal[0] = "no shipped core in the SDK";
                }
            }
            JSONObject header = source != null ? headerOf(source) : null;
            result.put("source", source != null ? source : JSONObject.NULL);
            result.put("version", header != null ? header.optString("version") : JSONObject.NULL);
            result.put("reason", refusal[0] != null ? refusal[0] : JSONObject.NULL);
            double nativeMs = (System.nanoTime() - start) / 1_000_000.0;
            result.put("nativeMs", nativeMs);
            Log.i(TAG, "[sherlo-core] native picked " + result.getString("origin") + " "
                + (header != null ? header.optString("version") : "-")
                + (refusal[0] != null ? " (" + refusal[0] + ")" : "")
                + " in " + String.format("%.2f", nativeMs) + " ms");
        } catch (Exception e) {
            Log.e(TAG, "[sherlo-core] loader failed", e);
        }
        return result.toString();
    }

    /** The override core's bytes, or null with the reason it was refused (null reason: there was none). */
    private static byte[] readOverride(Context context, String[] refusal) {
        File directory = new File(context.getFilesDir(), "sherlo");
        File coreFile = new File(directory, "sherlo-core.js");
        if (!coreFile.exists()) return null;
        try {
            byte[] core = readAll(new FileInputStream(coreFile));
            File signatureFile = new File(directory, "sherlo-core.js.sig");
            if (!signatureFile.exists()) {
                refusal[0] = "override has no signature";
                return null;
            }
            byte[] signature = Base64.decode(new String(readAll(new FileInputStream(signatureFile)), StandardCharsets.UTF_8).trim(), Base64.DEFAULT);
            if (!isSignedBySherlo(core, signature)) {
                refusal[0] = "override signature is not Sherlo's";
                return null;
            }
            JSONObject header = headerOf(new String(core, StandardCharsets.UTF_8));
            int seam = header != null ? header.optInt("seam", -1) : -1;
            if (seam != SUPPORTED_SEAM) {
                refusal[0] = "override speaks seam " + seam + ", this SDK speaks " + SUPPORTED_SEAM;
                return null;
            }
            return core;
        } catch (Exception e) {
            refusal[0] = "override unreadable: " + e.getMessage();
            return null;
        }
    }

    private static byte[] readShipped(Context context) {
        try {
            return readAll(context.getAssets().open("sherlo-core.js"));
        } catch (Exception e) {
            return null;
        }
    }

    private static boolean isSignedBySherlo(byte[] data, byte[] signature) {
        try {
            byte[] keyBytes = Base64.decode(SHERLO_CORE_PUBLIC_KEY, Base64.DEFAULT);
            PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(keyBytes));
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(key);
            verifier.update(data);
            return verifier.verify(signature);
        } catch (Exception e) {
            return false;
        }
    }

    /** The JSON on the core's first line: `// sherlo-core {"version":"2.0.3","seam":1}`. */
    private static JSONObject headerOf(String source) {
        String prefix = "// sherlo-core ";
        int lineEnd = source.indexOf('\n');
        if (!source.startsWith(prefix) || lineEnd < 0) return null;
        try {
            return new JSONObject(source.substring(prefix.length(), lineEnd));
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream stream) throws java.io.IOException {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toByteArray();
        }
    }
}
