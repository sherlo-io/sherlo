package org.json;

import java.util.ArrayList;
import java.util.List;

/** The recorder's org.json array, written as Android's own behaves (see JSONObject). */
public class JSONArray {
    private final List<Object> values = new ArrayList<>();

    public JSONArray put(Object value) {
        values.add(value);
        return this;
    }

    void writeTo(StringBuilder out) throws JSONException {
        out.append('[');
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) out.append(',');
            JSONObject.writeValue(out, values.get(index));
        }
        out.append(']');
    }
}
