package io.sherlo.storybookreactnative;

import android.app.Activity;
import android.app.Application;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.appcompat.app.AppCompatActivity;

import android.graphics.Color; // Import for Color
import android.view.View; // Import for View

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.Promise;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

public class StorybookSplashActivity extends AppCompatActivity {

    private static final String TAG = "StorybookSplashActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        String mode = getIntent().getStringExtra("mode");
        Class<?> activityClass = (Class<?>) getIntent().getSerializableExtra("activityClass");

        

        // Set the background color directly
        View view = new View(this);
        view.setBackgroundColor(Color.parseColor("#FF5733")); // Set your desired color here
        setContentView(view);

        Application application = (Application) getApplication();
        application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                Log.i(TAG, "onActivityCreated, activity: " + activity);
            }

            @Override
            public void onActivityStarted(Activity activity) {
                Log.i(TAG, "onActivityStarted, activity: " + activity);
            }
            
            @Override
            public void onActivityResumed(Activity activity) {
                Log.i(TAG, "onActivityResumed, activity: " + activity);
            }

            @Override
            public void onActivityPaused(Activity activity) {
                Log.i(TAG, "onActivityPaused, activity: " + activity);
            }

            @Override
            public void onActivityStopped(Activity activity) {
                Log.i(TAG, "onActivityStopped, activity: " + activity);
            }

            @Override
            public void onActivitySaveInstanceState(Activity activity, Bundle outState) {
                Log.i(TAG, "onActivitySaveInstanceState, activity: " + activity);
            }

            @Override
            public void onActivityDestroyed(Activity activity) {
                Log.i(TAG, "onActivityDestroyed, activity: " + activity);
                if(activity.getClass() != StorybookSplashActivity.class && activity.getClass() != activityClass) {
                    if("testing".equals(mode)) {
                        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                StorybookSplashActivity.this.recreateReactContext();
                            }
                        }, 1000);
                    } else {
                        StorybookSplashActivity.this.recreateReactContext();
                    }
                }
            }
        });

        Log.i(TAG, "Splash screen displayed, React context recreation will start in 2 seconds");
    }

    private void recreateReactContext() {
        Class<?> activityClass = (Class<?>) getIntent().getSerializableExtra("activityClass");


        // Get the ReactInstanceManager
        ReactInstanceManager manager = ((ReactApplication) getApplication()).getReactNativeHost().getReactInstanceManager();
        if (manager == null) {
            Log.e(TAG, "No ReactInstanceManager found");
            return;
        }

        Log.i(TAG, "Recreating React context in background");

        // Add a listener to know when the React context has been fully recreated
        manager.addReactInstanceEventListener(new ReactInstanceManager.ReactInstanceEventListener() {
            @Override
            public void onReactContextInitialized(ReactContext context) {
                // React context is fully reloaded
                Log.i(TAG, "React context reloaded");

                // Navigate to SherloStorybookActivity
                Intent intent = new Intent(StorybookSplashActivity.this, activityClass);
                // intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);

                Log.i(TAG, "Navigated to SherloStorybookActivity");

                // Remove listener to avoid memory leaks
                manager.removeReactInstanceEventListener(this);

                Application application = (Application) getApplication();
                application.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
                    @Override
                    public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                        Log.i(TAG, "onActivityCreated, activity: " + activity);
                    }

                    @Override
                    public void onActivityStarted(Activity activity) {
                        Log.i(TAG, "onActivityStarted, activity: " + activity);
                    }
                    
                    @Override
                    public void onActivityResumed(Activity activity) {
                        Log.i(TAG, "onActivityResumed, activity: " + activity);
                        StorybookSplashActivity.this.finish(); // Finish the current StorybookSplashActivity
                    }

                    @Override
                    public void onActivityPaused(Activity activity) {
                        Log.i(TAG, "onActivityPaused, activity: " + activity);
                    }

                    @Override
                    public void onActivityStopped(Activity activity) {
                        Log.i(TAG, "onActivityStopped, activity: " + activity);
                    }

                    @Override
                    public void onActivitySaveInstanceState(Activity activity, Bundle outState) {
                        Log.i(TAG, "onActivitySaveInstanceState, activity: " + activity);
                    }

                    @Override
                    public void onActivityDestroyed(Activity activity) {
                        Log.i(TAG, "onActivityDestroyed, activity: " + activity);
                    }
                });

                Log.i(TAG, "Listener removed");
            }
        });

        // Recreate the React context
        manager.recreateReactContextInBackground();

        Log.i(TAG, "React context recreation started");
    }
}
