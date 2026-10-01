import android.graphics.Bitmap;
import io.sherlo.storybookreactnative.Pixelmatch;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * The Android half of the parity recorder (record.js runs it): the original Pixelmatch.java
 * answers each pixel compare, and the stillness loop of StabilityHelper.checkIfStable (its lines
 * 292-384, transcribed below) decides each scripted timeline.
 *
 * Usage: java Record <pixel-compare.txt> <stillness.txt>. Prints one answer line per pixel
 * compare, a line "---", then one line of verdicts per stillness timeline.
 */
public class Record {
    public static void main(String[] args) throws IOException {
        recordPixelCompares(args[0]);
        System.out.println("---");
        recordStillnessLoops(args[1]);
    }

    private static byte[] bytesFromHex(String hex) {
        byte[] bytes = new byte[hex.length() / 2];
        for (int index = 0; index < bytes.length; index++) {
            bytes[index] = (byte) Integer.parseInt(hex.substring(index * 2, index * 2 + 2), 16);
        }
        return bytes;
    }

    private static Bitmap solid(int width, int height, int grey) {
        byte[] bytes = new byte[width * height * 4];
        for (int index = 0; index < width * height; index++) {
            bytes[index * 4] = (byte) grey;
            bytes[index * 4 + 1] = (byte) grey;
            bytes[index * 4 + 2] = (byte) grey;
            bytes[index * 4 + 3] = (byte) 255;
        }
        return new Bitmap(width, height, bytes);
    }

    private static void recordPixelCompares(String file) throws IOException {
        for (String line : Files.readAllLines(Paths.get(file))) {
            if (line.isBlank()) continue;
            String[] words = line.trim().split(" ");
            Bitmap a = new Bitmap(Integer.parseInt(words[0]), Integer.parseInt(words[1]), bytesFromHex(words[6]));
            Bitmap b = new Bitmap(Integer.parseInt(words[2]), Integer.parseInt(words[3]), bytesFromHex(words[7]));
            double threshold = Double.parseDouble(words[4]);
            boolean includeAA = words[5].equals("1");
            try {
                System.out.println(Pixelmatch.pixelmatch(a, b, threshold, includeAA));
            } catch (IllegalArgumentException e) {
                System.out.println(e.getMessage().contains("sizes do not match") ? "size-mismatch" : "threw");
            }
        }
    }

    /**
     * One scripted timeline through checkIfStable. The capture thread, the screenshots, the focus
     * clearing and the clock are the script's; every decision line is the original's.
     */
    private static void recordStillnessLoops(String file) throws IOException {
        Bitmap white = solid(2, 2, 255);
        Bitmap black = solid(2, 2, 0);
        Bitmap wider = solid(3, 2, 255);

        for (String line : Files.readAllLines(Paths.get(file))) {
            if (line.isBlank()) continue;
            String[] words = line.trim().split(" ");
            int requiredMatches = Integer.parseInt(words[0]);
            int minScreenshotsCount = Integer.parseInt(words[1]);
            int timeoutMs = Integer.parseInt(words[2]);
            double threshold = Double.parseDouble(words[3]);
            boolean includeAA = words[4].equals("1");
            long loopStartMs = Long.parseLong(words[5]);
            int tickCount = Integer.parseInt(words[7]);

            List<String> verdicts = new ArrayList<>();

            // The clock starts when stabilize is called, before the first screenshot.
            long startTime = loopStartMs;
            int consecutiveMatches = 0;
            int screenshotCounter = 0;
            screenshotCounter++; // the first screenshot: screenshotCounter.getAndIncrement()

            for (int tickIndex = 0; tickIndex < tickCount; tickIndex++) {
                int at = 8 + tickIndex * 5;
                long capturedMs = Long.parseLong(words[at + 1]);
                long focusClearedMs = Long.parseLong(words[at + 2]);
                String pair = words[at + 3];
                boolean foundFocus = words[at + 4].equals("1");

                Bitmap lastScreenshot = white;
                Bitmap current = pair.equals("differs") ? black : pair.equals("size") ? wider : white;
                screenshotCounter++; // screenshotCounter.incrementAndGet()
                long elapsedTime = capturedMs - startTime;

                try {
                    int differentPixels = Pixelmatch.pixelmatch(current, lastScreenshot, threshold, includeAA);
                    boolean imagesMatch = (differentPixels == 0);

                    if (imagesMatch) {
                        consecutiveMatches++;
                    } else {
                        consecutiveMatches = 0;
                    }
                } catch (IllegalArgumentException e) {
                    consecutiveMatches = 0;
                }

                if (foundFocus) {
                    startTime = focusClearedMs;
                    consecutiveMatches = 0;
                }

                if (consecutiveMatches >= requiredMatches) {
                    verdicts.add("stable");
                    break;
                }

                if (elapsedTime >= timeoutMs && consecutiveMatches == 0
                        && screenshotCounter >= minScreenshotsCount) {
                    verdicts.add("unstable");
                    break;
                }

                verdicts.add("continue");
            }
            System.out.println(String.join(" ", verdicts));
        }
    }
}
