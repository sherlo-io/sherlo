/**
 * SherloJsiReader.cpp
 *
 * JNI helper that reads `globalThis.__sherloLastJsError` from the JSI Runtime
 * and returns a compact JSON string with { name, message, stack }.
 *
 * Called from SherloJsiReader.java ONLY from within
 * SherloJSExceptionCapture.handleException(), which runs on the mqt_js thread
 * just after a JS exception has propagated to native.  The runtime pointer is
 * still valid at that point; the global property was written by the polyfill
 * before it attempted the (failing) bridge call.
 *
 * ── JSI linkage note ─────────────────────────────────────────────────────────
 * We include <jsi/jsi.h> (which pulls in <jsi/jsi-inl.h>) but do NOT link
 * against a separate JSI library.  This is intentional:
 *
 *   • All JSI instance methods we call are either pure-virtual (dispatched
 *     through the runtime vtable already loaded in libhermes.so / libjsc.so)
 *     or inline helpers in jsi.h / jsi-inl.h that themselves only call virtual
 *     methods.
 *   • Specifically: Runtime::global(), Runtime::getProperty(),
 *     Runtime::cloneString(), Runtime::cloneObject(), Runtime::utf8(),
 *     Runtime::createStringFromAscii() - all pure virtual.
 *     Object::getProperty(), Value::getString(), Value::getObject(),
 *     Value::isObject(), Value::isString(), String::utf8() - all inline.
 *   • On Android, libsherlo.so is allowed to have undefined symbols; they are
 *     resolved at runtime from the already-loaded JS engine library.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Safety contract:
 *   - Called on the JS thread (same thread that owns the runtime).
 *   - All JSI calls are wrapped in try/catch; any failure returns nullptr.
 *   - Never allocates JS objects; only reads existing properties.
 */

#include <jni.h>
#include <jsi/jsi.h>
#include <string>

using namespace facebook::jsi;

namespace {

// Minimal JSON-string escaper: handles the characters that appear in JS error
// messages and stacks without pulling in a full JSON library.
static std::string escapeJsonString(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (unsigned char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    // Skip other control characters to keep JSON valid.
                } else {
                    out += static_cast<char>(c);
                }
                break;
        }
    }
    return out;
}

// Safely reads a string property from a JSI object.
// Uses getString() (inline in jsi.h) instead of asString() (defined in jsi.cpp)
// so this translation unit has no external JSI symbol dependencies.
static std::string safeGetStringProp(Runtime& rt, const Object& obj,
                                     const char* key, const char* fallback) {
    try {
        Value v = obj.getProperty(rt, key);
        if (v.isString()) {
            return v.getString(rt).utf8(rt);
        }
    } catch (...) {}
    return fallback;
}

} // anonymous namespace

extern "C" {

/**
 * Reads global.__sherloLastJsError from the JSI Runtime pointed to by
 * |runtimePtr| and returns a JSON-encoded string, or nullptr if the global
 * is absent, not an object, or if any JSI call throws.
 *
 * Signature must match the Java native declaration in SherloJsiReader.java:
 *   private static native String nativeReadLastJsError(long runtimePtr);
 */
JNIEXPORT jstring JNICALL
Java_io_sherlo_storybookreactnative_SherloJsiReader_nativeReadLastJsError(
        JNIEnv* env, jclass /*clazz*/, jlong runtimePtr) {

    if (runtimePtr == 0L) {
        return nullptr;
    }

    try {
        Runtime* runtime = reinterpret_cast<Runtime*>(runtimePtr);

        // Read the global property set by the polyfill.
        Value prop = runtime->global().getProperty(*runtime, "__sherloLastJsError");
        if (!prop.isObject()) {
            return nullptr;
        }

        Object obj = prop.getObject(*runtime);

        std::string name    = safeGetStringProp(*runtime, obj, "name",    "Error");
        std::string message = safeGetStringProp(*runtime, obj, "message", "");
        std::string stack   = safeGetStringProp(*runtime, obj, "stack",   "");

        // Build a compact JSON string.
        std::string json =
            "{\"name\":\""    + escapeJsonString(name)    + "\","
             "\"message\":\"" + escapeJsonString(message) + "\","
             "\"stack\":\""   + escapeJsonString(stack)   + "\"}";

        return env->NewStringUTF(json.c_str());

    } catch (...) {
        // Any JSI exception → return nullptr so the Java side falls back
        // to the exception message.
        return nullptr;
    }
}

} // extern "C"
