# Sherlo reads CatalystInstanceImpl.mJSExceptionHandler via reflection at runtime
# (SherloInitProvider.wrapCatalystJsExceptionHandler) to intercept fatal JS exceptions
# with the original JS error message before React Native's JNI layer replaces it with a
# generic "Could not get BatchedBridge" exception. Without this rule, R8 minification in
# a customer's release build (minifyEnabled true) can rename this private field, silently
# breaking the reflection lookup - the app then crashes with no JS_ERROR ever written to
# protocol.sherlo, since the field name is looked up by the literal string
# "mJSExceptionHandler" at runtime and renaming makes that lookup return null.
-keepclassmembers class com.facebook.react.bridge.CatalystInstanceImpl {
    *** mJSExceptionHandler;
}
