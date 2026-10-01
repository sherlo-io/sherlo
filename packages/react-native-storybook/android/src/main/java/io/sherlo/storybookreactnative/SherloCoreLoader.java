package io.sherlo.storybookreactnative;

import android.content.Context;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;

/**
 * Picks which sealed JS core the app runs, and hands its source to JavaScript.
 *
 * A core in the app's storage folder (files/sherlo/sherlo-core.js) wins, but only when its
 * signature (sherlo-core.js.sig) verifies against Sherlo's public key and its header names the
 * seam this SDK speaks. Otherwise the core shipped inside the SDK (assets/sherlo-core.js) runs. A
 * refused core is logged, never thrown.
 */
public class SherloCoreLoader {
    private static final String TAG = "SherloModule:CoreLoader";

    private static final String CORE_FILE = "sherlo-core.js";
    private static final String SIGNATURE_FILE = "sherlo-core.js.sig";
    private static final String HEADER_PREFIX = "// sherlo-core ";

    // The seam this SDK speaks (SEAM_THIS_SDK_SPEAKS in src/sealedCore/loadSealedCore.ts). A core in
    // the storage folder whose header names another seam is never run.
    private static final int SUPPORTED_SEAM = 1;

    // THE TEST PUBLIC KEY: X.509 SubjectPublicKeyInfo DER, base64. Its private half is not kept
    // anywhere, so no override core can be signed for it yet, and every core in the storage folder is
    // refused. Signing override cores with Sherlo's own key is not set up yet.
    private static final String SHERLO_CORE_TEST_PUBLIC_KEY =
        "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxwuNK/v8HC6O+kHl+0fZqKZfcsW1h+FzVjcMprkWI2J9P+Z4yezALy/lRiqIXz3eDoe31SmkUacYRninMOli0iRpuUAAf3RV21CQoX8Knfl4u4yFsNNB/j8dkJOxGm1QoqV3XOu78sJyO54KHnPWM33yknkyifv/QxC5fwdtuv11Z/ssmiXAVStZV7t9Cow2nFDMaPFdfA4N1hdWg6bbIUeazT4w2fLaCKYdyts1CXZiXjyUJp30c5+wyMXOVHnTbY3Ye1Ap8VsNFfwvrurZYaG3TxHWTbnasWOX4Xwns4SITw+Nq7QA1hQTTlpbrXd+vEMaUfulA1dr8yk79MdzDwIDAQAB";

    /** JSON: { source, origin: "override" | "shipped" | "none", version, reason }. */
    public static String loadCoreJson(Context context) {
        JSONObject answer = new JSONObject();
        try {
            String[] refusal = new String[1];
            String origin = "override";
            String source = readOverrideOrRefusal(context, refusal);

            if (source == null) {
                origin = "shipped";
                source = readShipped(context);
            }
            if (source == null) {
                origin = "none";
                if (refusal[0] == null) refusal[0] = "no shipped core in the SDK";
            }

            if (refusal[0] != null) Log.w(TAG, origin + " core runs: " + refusal[0]);

            JSONObject header = source != null ? headerOf(source) : null;
            answer.put("source", source != null ? source : JSONObject.NULL);
            answer.put("origin", origin);
            answer.put("version", header != null && header.has("version") ? header.optString("version") : JSONObject.NULL);
            answer.put("reason", refusal[0] != null ? refusal[0] : JSONObject.NULL);
        } catch (Exception e) {
            Log.e(TAG, "the core loader failed", e);
        }
        return answer.toString();
    }

    /** The override core's source, or null, with why it was refused (no reason: there was none). */
    private static String readOverrideOrRefusal(Context context, String[] refusal) {
        FileSystemHelper fileSystemHelper = new FileSystemHelper(context);
        File coreFile = fileSystemHelper.getFile(CORE_FILE);
        if (!coreFile.exists()) return null;

        try {
            byte[] core = readAll(new FileInputStream(coreFile));

            File signatureFile = fileSystemHelper.getFile(SIGNATURE_FILE);
            if (!signatureFile.exists()) {
                refusal[0] = "the core in the storage folder has no signature";
                return null;
            }
            String signatureText = new String(readAll(new FileInputStream(signatureFile)), StandardCharsets.UTF_8).trim();
            byte[] signature = Base64.decode(signatureText, Base64.DEFAULT);
            if (!isSignedBySherlo(core, signature)) {
                refusal[0] = "the core in the storage folder is not signed by Sherlo";
                return null;
            }

            String source = new String(core, StandardCharsets.UTF_8);
            JSONObject header = headerOf(source);
            int seam = header != null ? header.optInt("seam", -1) : -1;
            if (seam != SUPPORTED_SEAM) {
                refusal[0] = "the core in the storage folder speaks seam " + seam + ", this SDK speaks " + SUPPORTED_SEAM;
                return null;
            }
            return source;
        } catch (Exception e) {
            refusal[0] = "the core in the storage folder could not be read: " + e.getMessage();
            return null;
        }
    }

    /** The core shipped inside the SDK, in the module's assets, or null when the pack left it out. */
    private static String readShipped(Context context) {
        try {
            return new String(readAll(context.getAssets().open(CORE_FILE)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    /** Whether `signature` is a base64-decoded RSA-SHA256 signature of `data` by the key above. */
    private static boolean isSignedBySherlo(byte[] data, byte[] signature) {
        if (SHERLO_CORE_TEST_PUBLIC_KEY.isEmpty()) return false;
        try {
            byte[] keyBytes = Base64.decode(SHERLO_CORE_TEST_PUBLIC_KEY, Base64.DEFAULT);
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
        int lineEnd = source.indexOf('\n');
        if (!source.startsWith(HEADER_PREFIX) || lineEnd < 0) return null;
        try {
            return new JSONObject(source.substring(HEADER_PREFIX.length(), lineEnd));
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream stream) throws IOException {
        try (InputStream input = stream) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toByteArray();
        }
    }
}
