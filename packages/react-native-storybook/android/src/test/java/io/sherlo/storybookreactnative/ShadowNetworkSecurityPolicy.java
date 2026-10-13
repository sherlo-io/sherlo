package io.sherlo.storybookreactnative;

import android.security.NetworkSecurityPolicy;

import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;

/** An app that refuses cleartext traffic, as every release build built by React Native's Gradle plugin does. */
@Implements(NetworkSecurityPolicy.class)
public class ShadowNetworkSecurityPolicy {

    @Implementation
    public boolean isCleartextTrafficPermitted() {
        return false;
    }

    @Implementation
    public boolean isCleartextTrafficPermitted(String host) {
        return false;
    }
}
