package io.sherlo.storybookreactnative;

import android.graphics.Bitmap;

/**
 * Based on https://github.com/mapbox/pixelmatch v7.1.0
 * Created based on the ISC license. Copyright (c) 2025, Mapbox.
 */
public class Pixelmatch {
    /**
     * Compare two equally sized images pixel by pixel and return the number of mismatched pixels.
     *
     * @param img1      First image (Bitmap).
     * @param img2      Second image (Bitmap).
     * @param threshold Matching threshold (0.0 to 1.0); smaller values are more sensitive.
     * @param includeAA If false, ignore anti-aliased pixels when counting differences.
     * @return The number of pixels that differ beyond the threshold.
     * @throws IllegalArgumentException if images are null or have different dimensions.
     */
    public static int pixelmatch(Bitmap img1, Bitmap img2, double threshold, boolean includeAA) {
        if (img1 == null || img2 == null) {
            throw new IllegalArgumentException("Image data must not be null.");
        }
        int width = img1.getWidth();
        int height = img1.getHeight();
        if (width != img2.getWidth() || height != img2.getHeight()) {
            throw new IllegalArgumentException("Image sizes do not match. " +
                    "Image1: " + width + "x" + height + 
                    ", Image2: " + img2.getWidth() + "x" + img2.getHeight());
        }

        int totalPixels = width * height;
        int[] pixels1 = new int[totalPixels];
        int[] pixels2 = new int[totalPixels];
        img1.getPixels(pixels1, 0, width, 0, 0, width, height);
        img2.getPixels(pixels2, 0, width, 0, 0, width, height);

        // Quick check for identical images
        boolean identical = true;
        for (int i = 0; i < totalPixels; i++) {
            if (pixels1[i] != pixels2[i]) {
                identical = false;
                break;
            }
        }
        if (identical) {
            return 0;
        }

        double maxDelta = 35215 * threshold * threshold;
        int diffCount = 0;

        // Traverse each pixel to find differences
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int index = y * width + x;
                if (pixels1[index] == pixels2[index]) {
                    continue; // pixels are exactly the same
                }
                // Compute color difference in YIQ color space
                double delta = colorDelta(pixels1[index], pixels2[index], false, index);
                if (Math.abs(delta) > maxDelta) {
                    // Difference exceeds threshold – count it unless it's anti-aliased
                    boolean counted = true;
                    if (!includeAA) {
                        if (isAntiAliased(pixels1, x, y, width, height, pixels2) ||
                            isAntiAliased(pixels2, x, y, width, height, pixels1)) {
                            counted = false; // skip this pixel if it's anti-aliasing
                        }
                    }
                    if (counted) {
                        diffCount++;
                    }
                }
            }
        }
        return diffCount;
    }

    // Calculate the color difference between two pixels (in ARGB format) using YIQ color space.
    // If yOnly is true, return only the luminance (Y) difference. Otherwise, return the full difference.
    // index1 is the pixel index of the first image (used for consistent background blending with transparency).
    private static double colorDelta(int pixel1, int pixel2, boolean yOnly, int index1) {
        // Extract ARGB components from the 32-bit pixel values
        int a1 = (pixel1 >>> 24) & 0xFF;
        int r1 = (pixel1 >> 16) & 0xFF;
        int g1 = (pixel1 >> 8) & 0xFF;
        int b1 = pixel1 & 0xFF;
        int a2 = (pixel2 >>> 24) & 0xFF;
        int r2 = (pixel2 >> 16) & 0xFF;
        int g2 = (pixel2 >> 8) & 0xFF;
        int b2 = pixel2 & 0xFF;

        if (a1 == a2 && r1 == r2 && g1 == g2 && b1 == b2) {
            return 0.0;
        }

        // Initial color differences
        double dr = r1 - r2;
        double dg = g1 - g2;
        double db = b1 - b2;
        double da = a1 - a2;

        // If either pixel is not fully opaque, blend colors over a background for comparison
        if (a1 < 255 || a2 < 255) {
            int k = index1 * 4;
            double rb = 48 + 159 * (k % 2);
            double gb = 48 + 159 * (((int)Math.floor(k / 1.618033988749895)) % 2);
            double bb = 48 + 159 * (((int)Math.floor(k / 2.618033988749895)) % 2);
            // Composite the two pixels onto the background
            dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
            dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
            db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
        }

        // Compute luminance (Y) difference
        double y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
        if (yOnly) {
            return y;
        }
        // Compute chrominance (I and Q) differences
        double i = dr * 0.59597799 - dg * 0.27417610 - db * 0.32180189;
        double q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
        // Perceptual color difference (squared distance in YIQ space)
        double delta = 0.5053 * y * y + 0.2990 * i * i + 0.1957 * q * q;
        // Return signed delta (sign indicates which image is brighter, for potential diff coloring)
        return (y > 0) ? -delta : delta;
    }

    // Determine if the pixel at (x, y) in the main image is part of an anti-aliased edge.
    // Uses the main image's neighbors and the other image for comparison.
    private static boolean isAntiAliased(int[] mainPixels, int x, int y, int width, int height, int[] otherPixels) {
        int index = y * width + x;
        int centerPixel = mainPixels[index];

        // Define the neighbor bounds (3x3 region centered on (x, y))
        int x0 = (x > 0) ? x - 1 : x;
        int y0 = (y > 0) ? y - 1 : y;
        int x2 = (x < width - 1) ? x + 1 : x;
        int y2 = (y < height - 1) ? y + 1 : y;

        int identicalCount = 0;
        if (x == x0 || x == x2 || y == y0 || y == y2) {
            // On the border of the image, treat one missing neighbor as identical
            identicalCount = 1;
        }

        double minY = 0.0, maxY = 0.0;
        int minX = x, minYIdx = y;
        int maxX = x, maxYIdx = y;

        // Examine neighboring pixels in the main image
        for (int ny = y0; ny <= y2; ny++) {
            for (int nx = x0; nx <= x2; nx++) {
                if (nx == x && ny == y) continue;
                int neighborIndex = ny * width + nx;
                // Compute luminance difference between center pixel and neighbor
                double yDelta = colorDelta(centerPixel, mainPixels[neighborIndex], true, index);
                if (yDelta == 0) {
                    // Neighbor color matches exactly
                    if (++identicalCount > 2) {
                        return false; // more than two identical neighbors -> not an anti-aliased pixel
                    }
                } else if (yDelta < minY) {
                    minY = yDelta;
                    minX = nx;
                    minYIdx = ny;
                } else if (yDelta > maxY) {
                    maxY = yDelta;
                    maxX = nx;
                    maxYIdx = ny;
                }
            }
        }

        if (minY == 0.0 || maxY == 0.0) {
            // Pixel has no range of color variation among neighbors
            return false;
        }

        // Check if the most similar and most different neighbor pixels are part of uniform areas in both images
        if (hasManySiblings(mainPixels, minX, minYIdx, width, height) &&
            hasManySiblings(otherPixels, minX, minYIdx, width, height)) {
            return true;
        }
        if (hasManySiblings(mainPixels, maxX, maxYIdx, width, height) &&
            hasManySiblings(otherPixels, maxX, maxYIdx, width, height)) {
            return true;
        }
        return false;
    }

    // Helper to determine if a given pixel in the image has more than two neighbors of the same color.
    private static boolean hasManySiblings(int[] pixels, int x, int y, int width, int height) {
        int center = pixels[y * width + x];
        int x0 = (x > 0) ? x - 1 : x;
        int y0 = (y > 0) ? y - 1 : y;
        int x2 = (x < width - 1) ? x + 1 : x;
        int y2 = (y < height - 1) ? y + 1 : y;

        int count = 0;
        if (x == x0 || x == x2 || y == y0 || y == y2) {
            count = 1;
        }
        for (int ny = y0; ny <= y2; ny++) {
            for (int nx = x0; nx <= x2; nx++) {
                if (nx == x && ny == y) continue;
                if (pixels[ny * width + nx] == center) {
                    if (++count > 2) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
