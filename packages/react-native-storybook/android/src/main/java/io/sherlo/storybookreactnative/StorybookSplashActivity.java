package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.appcompat.app.AppCompatActivity;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.Promise;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * This class is used to show a splash screen when the user wants to switch between the user's app and the Storybook.
 * It listens to the activity lifecycle events and recreates the React Context when the original activity is destroyed.
 * 
 * When the React Context is initialized, it navigates to the final activity passed in the intent, and
 * finishes the splash activity when the final activity is fully initialized.
 */
public class StorybookSplashActivity extends AppCompatActivity {

    private static final String TAG = "StorybookSplashActivity";

    private static String mode;
    private static Class<?> activityClassToTransition;  
    private static Class<?> closingActivityClass;  

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        StorybookSplashActivity.this.mode = getIntent().getStringExtra("mode");
        StorybookSplashActivity.this.activityClassToTransition = (Class<?>) getIntent().getSerializableExtra("activityClassToTransition");
        StorybookSplashActivity.this.closingActivityClass = (Class<?>) getIntent().getSerializableExtra("closingActivityClass");

        getApplication().registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            // we are required to implement all the methods of the interface
            @Override public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                Log.d(TAG, "Activity created: " + activity.getClass().getName());
            }
            @Override public void onActivityStarted(Activity activity) {
                Log.d(TAG, "Activity started: " + activity.getClass().getName());
            }
            @Override public void onActivityPaused(Activity activity) {
                Log.d(TAG, "Activity paused: " + activity.getClass().getName());
            }
            @Override public void onActivityStopped(Activity activity) {
                Log.d(TAG, "Activity stopped: " + activity.getClass().getName());
            }
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle savedInstanceState) {}

            @Override
            public void onActivityResumed(Activity activity) {
                Log.d(TAG, "Activity resumed: " + activity.getClass().getName());
                // If final activity is reached, finish the splash activity
                if(activity.getClass().getName().equals(StorybookSplashActivity.this.activityClassToTransition.getName())) {
                    Log.d(TAG, "Finishing StorybookSplashActivity");
                    StorybookSplashActivity.this.finish();
                }
            }

            @Override
            public void onActivityDestroyed(Activity activity) {
                Log.d(TAG, "Activity destroyed: " + activity.getClass().getName());
                // If original activity (user's app) is destroyed, recreate the React Context
                if(activity.getClass().getName().equals(StorybookSplashActivity.this.closingActivityClass.getName())) {
                    if("testing".equals(StorybookSplashActivity.this.mode)) {
                        // We add delay when testing with Sherlo to make sure the app is fully initialized before recreating the React Context
                        Log.d(TAG, "Recreating React Context with delay");
                        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                StorybookSplashActivity.this.recreateReactContext();
                            }
                        }, 1000);
                    } else {
                        // we don't need to add delay as user is launching this manually when app is initialized
                        Log.d(TAG, "Recreating React Context");
                        StorybookSplashActivity.this.recreateReactContext();
                    }
                }
            }
        });
    }

    // Recreate React Context and navigate to the final activity when the React Context is initialized
    private void recreateReactContext() {
        ReactApplication application = (ReactApplication) getApplication();
        ReactInstanceManager manager = application.getReactNativeHost().getReactInstanceManager();
        if (manager == null) {
            Log.e(TAG, "No ReactInstanceManager found");
            return;
        }

        manager.addReactInstanceEventListener(new ReactInstanceManager.ReactInstanceEventListener() {
            @Override
            public void onReactContextInitialized(ReactContext context) {
                Log.d(TAG, "React Context initialized");
                Intent intent = new Intent(StorybookSplashActivity.this, StorybookSplashActivity.this.activityClassToTransition);
                startActivity(intent);

                manager.removeReactInstanceEventListener(this);
            }
        });

        Log.d(TAG, "Recreating React Context in background");
        manager.recreateReactContextInBackground();
    }
}
