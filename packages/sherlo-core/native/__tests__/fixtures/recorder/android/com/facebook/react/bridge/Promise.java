package com.facebook.react.bridge;

/** The recorder's Promise: the calls InspectorHelper.java makes on React Native's. */
public interface Promise {
    void resolve(Object value);

    void reject(String code, String message);

    void reject(String code, String message, Throwable error);
}
