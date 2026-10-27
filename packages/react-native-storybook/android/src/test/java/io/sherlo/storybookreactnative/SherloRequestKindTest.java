package io.sherlo.storybookreactnative;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.net.Uri;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.Collections;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class SherloRequestKindTest {

    private static final String PICTURE = "https://pictures.example/cat.png";
    private static final Uri BUNDLER = Uri.parse("http://localhost:8082");
    private static final boolean LET_THROUGH = true;
    private static final boolean NOT_LET_THROUGH = false;

    /** One rule that matches exactly one address. */
    private static List<SherloRequestKind.Matching> ruleFor(final String address) {
        return Collections.<SherloRequestKind.Matching>singletonList((method, url) -> url.equals(address));
    }

    private static SherloRequestKind.Kind kindOf(List<SherloRequestKind.Matching> rules, String url) {
        return SherloRequestKind.of(rules, BUNDLER, "GET", url);
    }

    @Test
    public void anUnmatchedRequestLetThroughIsToldOnce() {
        SherloRequestKind.Kind kind = kindOf(ruleFor("https://api.example/a"), PICTURE);
        assertEquals(SherloRequestKind.Kind.UNANSWERED, kind);
        assertTrue(SherloRequestKind.isToldWhenLetThrough(kind, LET_THROUGH, true));
        assertFalse("native code does not take it, so only the let-through road tells", SherloRequestKind.isTaken(kind, LET_THROUGH));
    }

    @Test
    public void aMatchedRequestIsAnsweredAndNeverTold() {
        SherloRequestKind.Kind kind = kindOf(ruleFor(PICTURE), PICTURE);
        assertEquals(SherloRequestKind.Kind.ANSWERED, kind);
        assertTrue(SherloRequestKind.isTaken(kind, LET_THROUGH));
        assertFalse(SherloRequestKind.isToldWhenLetThrough(kind, LET_THROUGH, true));
    }

    @Test
    public void aRequestNativeCodeRefusesIsTakenAndLeftToTheRefusalToTell() {
        SherloRequestKind.Kind kind = kindOf(ruleFor("https://api.example/a"), PICTURE);
        assertTrue(SherloRequestKind.isTaken(kind, NOT_LET_THROUGH));
        assertFalse("the refusing road tells it, not the let-through road", SherloRequestKind.isToldWhenLetThrough(kind, NOT_LET_THROUGH, true));
    }

    @Test
    public void nothingIsToldBeforeRulesAreHandedOver() {
        SherloRequestKind.Kind kind = kindOf(Collections.<SherloRequestKind.Matching>emptyList(), PICTURE);
        assertFalse(SherloRequestKind.isToldWhenLetThrough(kind, LET_THROUGH, false));
    }

    @Test
    public void theBundlerAndNonHttpAddressesAreNotCoveredSoNeverTold() {
        List<SherloRequestKind.Matching> none = Collections.emptyList();
        assertEquals(SherloRequestKind.Kind.NOT_COVERED, kindOf(none, "http://127.0.0.1:8082/index.bundle"));
        assertEquals(SherloRequestKind.Kind.NOT_COVERED, kindOf(none, "file:///data/cat.png"));
        assertEquals(SherloRequestKind.Kind.NOT_COVERED, kindOf(none, null));
        assertFalse(SherloRequestKind.isToldWhenLetThrough(SherloRequestKind.Kind.NOT_COVERED, LET_THROUGH, true));
    }
}
