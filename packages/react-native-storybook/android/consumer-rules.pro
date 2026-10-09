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

# The C core (libsherlocore.so) binds its JNI entry points by name:
# Java_io_sherlo_storybookreactnative_CompiledCore_native*. R8 must keep the class and its native
# methods named as they are, or the core's calls fail to link in a minified release build.
-keepclasseswithmembernames class io.sherlo.storybookreactnative.CompiledCore {
    native <methods>;
}

# The generated package list finds Sherlo's package by its class name (react-native.config.js), so
# R8 must keep the class and its constructor named as they are, or a shrunk release build that
# links Sherlo would fall back to the empty package.
-keep class io.sherlo.storybookreactnative.SherloModulePackage {
    <init>();
}
