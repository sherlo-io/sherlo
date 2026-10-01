package android.graphics;

/**
 * The recorder's Bitmap: what Pixelmatch.java reads from one - its size, and getPixels.
 *
 * It holds the premultiplied RGBA bytes an ARGB_8888 Bitmap keeps in memory. getPixels hands
 * back un-premultiplied ARGB colours, the way Android's Skia converts them: in float, each channel
 * times the reciprocal of alpha, stored rounded to the nearest (ties to even, as ARM's NEON and
 * x86's SSE conversions round).
 */
public class Bitmap {
    private final int width;
    private final int height;
    private final byte[] premultipliedRgba;

    public Bitmap(int width, int height, byte[] premultipliedRgba) {
        this.width = width;
        this.height = height;
        this.premultipliedRgba = premultipliedRgba;
    }

    public int getWidth() {
        return width;
    }

    public int getHeight() {
        return height;
    }

    public void getPixels(int[] pixels, int offset, int stride, int x, int y, int width, int height) {
        for (int row = 0; row < height; row++) {
            for (int column = 0; column < width; column++) {
                int source = ((y + row) * this.width + (x + column)) * 4;
                int red = premultipliedRgba[source] & 0xFF;
                int green = premultipliedRgba[source + 1] & 0xFF;
                int blue = premultipliedRgba[source + 2] & 0xFF;
                int alpha = premultipliedRgba[source + 3] & 0xFF;
                float alphaUnit = alpha * (1 / 255.0f);
                float scale = alphaUnit == 0 ? 0 : 1.0f / alphaUnit;
                pixels[offset + row * stride + column] = (alpha << 24)
                        | (unpremultiplied(red, scale) << 16)
                        | (unpremultiplied(green, scale) << 8)
                        | unpremultiplied(blue, scale);
            }
        }
    }

    private static int unpremultiplied(int channel, float scale) {
        float straight = channel * (1 / 255.0f) * scale;
        float clamped = Math.min(Math.max(straight, 0.0f), 1.0f);
        return (int) Math.rint(clamped * 255.0f);
    }
}
