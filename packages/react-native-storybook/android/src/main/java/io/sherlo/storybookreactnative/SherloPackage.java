package io.sherlo.storybookreactnative;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

/**
 * Package definition for Sherlo React Native integration.
 * Implements ReactPackage to register the SherloModule with React Native.
 */
public class SherloPackage implements ReactPackage {
  
  /**
   * Creates and returns the native modules provided by this package.
   * In this case, only the SherloModule is provided.
   * 
   * @param reactContext The React Native application context
   * @return A list containing the SherloModule
   */
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    return Arrays.<NativeModule>asList(new SherloModule(reactContext));
  }

  /**
   * Creates and returns the view managers provided by this package.
   * Since Sherlo doesn't provide any custom views, this returns an empty list.
   * 
   * @param reactContext The React Native application context
   * @return An empty list, as no view managers are provided
   */
  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
