package io.sherlo.storybookreactnative;

import android.content.Context;

import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.load.model.ModelLoaderFactory;
import com.bumptech.glide.load.model.MultiModelLoaderFactory;
import com.bumptech.glide.signature.ObjectKey;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

/**
 * Glide answered by the rules (SherloRequestAnswers), whatever HTTP client it was given.
 *
 * An image library may hand Glide an OkHttp client of its own, which no interceptor on React
 * Native's shared client reaches. A loader put first in Glide's registry, for every model, sees
 * each picture's address before any client does, and takes the ones the rules take: answered with
 * the rule's bytes, held, or refused. Only loaded when the app has Glide.
 */
final class SherloGlideAnswers {
    private SherloGlideAnswers() {}

    static void install(Context context) {
        Glide.get(context).getRegistry().prepend(Object.class, InputStream.class, new Factory());
    }

    /** The address a Glide model stands for: a GlideUrl's, or the model told as text. */
    private static String urlOf(Object model) {
        if (model instanceof GlideUrl) return ((GlideUrl) model).toStringUrl();
        return String.valueOf(model);
    }

    private static final class Factory implements ModelLoaderFactory<Object, InputStream> {
        @NonNull
        @Override
        public ModelLoader<Object, InputStream> build(@NonNull MultiModelLoaderFactory multiFactory) {
            return new Loader();
        }

        @Override
        public void teardown() {
            // The loader holds nothing to let go of.
        }
    }

    private static final class Loader implements ModelLoader<Object, InputStream> {
        @Override
        public boolean handles(@NonNull Object model) {
            return SherloRequestAnswers.takes("GET", urlOf(model));
        }

        @Override
        public LoadData<InputStream> buildLoadData(@NonNull Object model, int width, int height, @NonNull Options options) {
            String url = urlOf(model);
            SherloRequestAnswers.Rule rule = SherloRequestAnswers.ruleFor("GET", url);
            // The rule is part of the key, so a picture answered by one story's rule is never the
            // next story's from Glide's cache.
            Object answer = rule != null ? rule : SherloRequestAnswers.unmatched();
            return new LoadData<>(new ObjectKey("sherlo-answer:" + url + ":" + System.identityHashCode(answer)), new Fetcher(url, rule));
        }
    }

    private static final class Fetcher implements DataFetcher<InputStream> {
        private final String url;
        private final SherloRequestAnswers.Rule rule;

        Fetcher(String url, SherloRequestAnswers.Rule rule) {
            this.url = url;
            this.rule = rule;
        }

        @Override
        public void loadData(@NonNull Priority priority, @NonNull DataCallback<? super InputStream> callback) {
            if (rule != null) {
                callback.onDataReady(new ByteArrayInputStream(rule.body));
                return;
            }
            SherloRequestAnswers.tellUnanswered("GET", url, null);
            // A held picture never arrives, as a held fetch is never answered; a refused one fails.
            if (SherloRequestAnswers.unmatched() == SherloRequestAnswers.Unmatched.HELD) return;
            callback.onLoadFailed(SherloRequestAnswers.refusalOf("GET", url));
        }

        @Override
        public void cleanup() {
            // The bytes are in memory; nothing was opened.
        }

        @Override
        public void cancel() {
            // Every answer is given at once in loadData, so there is nothing in flight to stop.
        }

        @NonNull
        @Override
        public Class<InputStream> getDataClass() {
            return InputStream.class;
        }

        @NonNull
        @Override
        public DataSource getDataSource() {
            return DataSource.LOCAL;
        }
    }
}
