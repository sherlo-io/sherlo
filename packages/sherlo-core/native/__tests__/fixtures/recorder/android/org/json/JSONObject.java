package org.json;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The recorder's org.json, written as Android's own (AOSP libcore/json) behaves, because the JVM
 * has none and json.org's differs: names keep the order they were put in; a double that is not
 * finite is refused; a number whose double is a whole long is written as that long, -0 as "-0",
 * and any other with its own toString; a string escapes '"', '\\' and '/' with a backslash, the
 * five short control escapes, and every other character below 0x20 as \\u00xx.
 */
public class JSONObject {
    private static final Double NEGATIVE_ZERO = -0d;

    private final Map<String, Object> nameValuePairs = new LinkedHashMap<>();

    public JSONObject put(String name, boolean value) throws JSONException {
        nameValuePairs.put(name, value);
        return this;
    }

    public JSONObject put(String name, double value) throws JSONException {
        nameValuePairs.put(name, checkDouble(value));
        return this;
    }

    public JSONObject put(String name, int value) throws JSONException {
        nameValuePairs.put(name, value);
        return this;
    }

    public JSONObject put(String name, long value) throws JSONException {
        nameValuePairs.put(name, value);
        return this;
    }

    public JSONObject put(String name, Object value) throws JSONException {
        if (value == null) {
            nameValuePairs.remove(name);
            return this;
        }
        if (value instanceof Number) checkDouble(((Number) value).doubleValue());
        nameValuePairs.put(name, value);
        return this;
    }

    static double checkDouble(double value) throws JSONException {
        if (Double.isInfinite(value) || Double.isNaN(value)) {
            throw new JSONException("Forbidden numeric value: " + value);
        }
        return value;
    }

    public static String numberToString(Number number) throws JSONException {
        double doubleValue = number.doubleValue();
        checkDouble(doubleValue);
        if (number.equals(NEGATIVE_ZERO)) return "-0";
        long longValue = number.longValue();
        if (doubleValue == (double) longValue) return Long.toString(longValue);
        return number.toString();
    }

    static void writeValue(StringBuilder out, Object value) throws JSONException {
        if (value instanceof JSONObject) {
            ((JSONObject) value).writeTo(out);
        } else if (value instanceof JSONArray) {
            ((JSONArray) value).writeTo(out);
        } else if (value instanceof Boolean) {
            out.append(value);
        } else if (value instanceof Number) {
            out.append(numberToString((Number) value));
        } else {
            writeString(out, value.toString());
        }
    }

    static void writeString(StringBuilder out, String value) {
        out.append('"');
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            switch (c) {
                case '"':
                case '\\':
                case '/':
                    out.append('\\').append(c);
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                case '\b':
                    out.append("\\b");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\f':
                    out.append("\\f");
                    break;
                default:
                    if (c <= 0x1F) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                    break;
            }
        }
        out.append('"');
    }

    void writeTo(StringBuilder out) throws JSONException {
        out.append('{');
        boolean first = true;
        for (Map.Entry<String, Object> entry : nameValuePairs.entrySet()) {
            if (!first) out.append(',');
            first = false;
            writeString(out, entry.getKey());
            out.append(':');
            writeValue(out, entry.getValue());
        }
        out.append('}');
    }

    @Override
    public String toString() {
        try {
            StringBuilder out = new StringBuilder();
            writeTo(out);
            return out.toString();
        } catch (JSONException e) {
            return null;
        }
    }
}
