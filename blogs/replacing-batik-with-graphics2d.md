# Replacing Apache Batik with Graphics2D: How We Made Our Java OG Card Generator Faster Than Python

*March 2026 · [javaevolved.dev](https://javaevolved.dev)*

---

[Java Evolved](https://javaevolved.dev) is a static site showcasing 112 modern Java patterns across 11 categories — each with a side-by-side "old vs modern" code comparison. For every pattern, we generate an Open Graph card: a 1200×630 PNG image used when links are shared on social media.

This is the story of how we replaced Apache Batik with plain `Graphics2D`, split a monolithic script into modules using JBang, and tuned the JVM to squeeze out every last bit of performance — ending up faster than Python.

## The starting point: Batik

Our OG card generator was a single 400-line Java file (`generateog.java`) run via [JBang](https://www.jbang.dev). It built an SVG string for each card, then used Apache Batik's `PNGTranscoder` to rasterize it to PNG:

```java
//DEPS org.apache.xmlgraphics:batik-transcoder:1.18
//DEPS org.apache.xmlgraphics:batik-codec:1.18

static void svgToPng(String svgContent, Path pngPath) throws Exception {
    var input = new TranscoderInput(new StringReader(svgContent));
    try (var out = new BufferedOutputStream(Files.newOutputStream(pngPath))) {
        var transcoder = new PNGTranscoder();
        transcoder.addTranscodingHint(PNGTranscoder.KEY_WIDTH, (float) W * 2);
        transcoder.addTranscodingHint(PNGTranscoder.KEY_HEIGHT, (float) H * 2);
        transcoder.transcode(input, new TranscoderOutput(out));
    }
}
```

This worked, but Batik is a heavyweight library. It brings in the full AWT/Swing graphics pipeline, XML parsers, and codec libraries. The fat JAR was over 10 MB. And it was **slower than our equivalent Python script using cairosvg** — a thin wrapper around the native Cairo C library.

We had an irony on our hands: a site about modern Java patterns had a Java tool that couldn't outperform Python.

## The insight: we don't need SVG→PNG

Our OG cards are simple layouts — rounded rectangles, text, solid fills. We were building an SVG string by hand, then asking Batik to parse it back into a graphics model and rasterize it. That's a round trip through XML parsing for geometry we already knew.

Java's `Graphics2D` API can draw all of this directly to a `BufferedImage`:

```java
var img = new BufferedImage(W * SCALE, H * SCALE, BufferedImage.TYPE_INT_RGB);
var g = img.createGraphics();
g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB);
g.scale(SCALE, SCALE);

// Draw directly — no SVG intermediary
drawCard(g, snippet);

g.dispose();
ImageIO.write(img, "PNG", outputPath.toFile());
```

No SVG parsing. No Batik. No external dependencies for PNG output — just the JDK.

We still generate SVG files (for the web), but PNG rendering is now pure `Graphics2D`.

## The refactoring: JBang multi-source

The original 400-line monolith mixed colors, dimensions, content loading, syntax highlighting, SVG generation, PNG conversion, and font management all in one implicit class. We split it into 7 focused source files using JBang's `//SOURCES` directive:

```java
///usr/bin/env jbang "$0" "$@" ; exit $?
//JAVA 25
//DEPS com.fasterxml.jackson.core:jackson-databind:2.18.3
//DEPS com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.18.3
//SOURCES og/Palette.java
//SOURCES og/Layout.java
//SOURCES og/ContentLoader.java
//SOURCES og/SyntaxHighlighter.java
//SOURCES og/SvgRenderer.java
//SOURCES og/PngRenderer.java
//SOURCES og/FontManager.java
```

Each file lives in the `og` package under `html-generators/og/`:

| File | Responsibility |
|------|---------------|
| `Palette.java` | Color constants (hex strings + `Color.decode()` helper) |
| `Layout.java` | Dimensions, font sizing, line fitting |
| `ContentLoader.java` | JSON/YAML parsing, `Snippet` record |
| `SyntaxHighlighter.java` | Java tokenizer → `List<Token>` (shared by SVG + PNG) |
| `SvgRenderer.java` | SVG string generation |
| `PngRenderer.java` | Direct `Graphics2D` PNG rendering |
| `FontManager.java` | Font downloading and registration |

The `SyntaxHighlighter` is the key shared abstraction. Instead of producing SVG `<tspan>` fragments directly, it returns a `List<Token>` where each token has text and an optional color:

```java
public record Token(String text, String color) {}
```

The SVG renderer converts tokens to `<tspan>` elements. The PNG renderer draws them with `Graphics2D`:

```java
static void drawTokens(Graphics2D g, List<Token> tokens, int x, int y,
        Font codeFont, FontRenderContext frc) {
    float curX = x;
    for (var token : tokens) {
        g.setColor(token.color() != null
            ? Palette.color(token.color())
            : Palette.color(Palette.SYN_DEFAULT));
        g.drawString(token.text(), curX, y);
        curX += (float) codeFont.getStringBounds(token.text(), frc).getWidth();
    }
}
```

## Font loading: a subtle gotcha

Our first `Graphics2D` attempt rendered text with the wrong fonts. The labels showed □ rectangles instead of ✗ and ✓ symbols.

The problem: Java's `Font.createFont()` registers all physical fonts with `style=0` (PLAIN), regardless of their actual weight. When you write `new Font("Inter", Font.BOLD, 24)`, Java looks for a font in the "Inter" family with `BOLD` style — but the registered "Inter Bold" has `style=0`. Java falls back to algorithmic bolding of the Regular weight, or worse, to a system font that lacks the Unicode characters you need.

The fix: load fonts directly from the `.ttf` files:

```java
public static Font getFont(String filename, float size) {
    var path = FONT_CACHE.resolve(filename);
    return Font.createFont(Font.TRUETYPE_FONT, path.toFile()).deriveFont(size);
}
```

Then use exact physical fonts:

```java
var titleFont = FontManager.getFont("Inter-Bold.ttf", 24f);
var labelFont = FontManager.getFont("Inter-SemiBold.ttf", 11f);
var codeFont  = FontManager.getFont("JetBrainsMono-Regular.ttf", (float) fontSize);
```

## GC profiling: humongous allocations

Running with `-Xlog:gc:stderr` revealed the OG generator triggered **34 GC events** with repeated "G1 Humongous Allocation" warnings:

```
GC(5) Pause Young (Concurrent Start) (G1 Humongous Allocation) 238M->138M(516M)
GC(7) Pause Young (Concurrent Start) (G1 Humongous Allocation) 234M->90M(516M)
```

Each `BufferedImage` at 2× resolution is 2400×1260×4 bytes ≈ **12 MB** — larger than half the default G1 region size. G1 treats these as "humongous" objects requiring special allocation paths.

The fix was trivially simple: **reuse a single `BufferedImage`** across all 112 cards.

```java
// Allocated once, reused for every card
static final BufferedImage SHARED_IMG =
    new BufferedImage(W * SCALE, H * SCALE, BufferedImage.TYPE_INT_RGB);
```

Each card clears the image with a white fill before drawing. Result: **34 GCs → 1 GC**.

## JIT tuning: lowering the C2 threshold

With only 112 iterations, the JVM's C2 compiler (which normally triggers after ~10,000 invocations) never kicks in. The hot methods — tokenization, font metrics, `drawString` — run in C1-compiled (or interpreted) code.

Lowering the C2 threshold to 100 invocations lets the optimizing compiler engage early:

```
-XX:Tier4CompileThreshold=100
```

| Threshold | Time (112 cards) | Delta |
|-----------|-----------------|-------|
| Default (~10K) | 10.02s | baseline |
| **100** | **9.32s** | **−7%** |
| 1 | 9.78s | −2% |

Threshold=100 is the sweet spot: C2 compiles the hot loop just in time for the bulk of the work. Threshold=1 wastes time compiling methods before they're warm.

We added this flag to all `java -jar` execution calls in our CI workflows. It doesn't affect AOT training runs (which need default JIT behavior for proper class profiling).

## The results

### Local benchmarks (Apple M1 Max, 112 patterns)

**OG Card Generator — Steady-State (avg of 5 runs):**

| Method | Time |
|--------|------|
| **Fat JAR (Graphics2D)** | **10.82s** |
| Fat JAR + AOT | 11.04s |
| JBang (from source) | 11.62s |
| Python (cairosvg) | 14.10s |

**HTML Generator — Steady-State (avg of 5 runs):**

| Method | Time |
|--------|------|
| **Fat JAR** | **7.47s** |
| Fat JAR + AOT | 8.00s |
| JBang | 11.63s |
| Python | 31.52s |

### What we shipped

| Before | After |
|--------|-------|
| Batik transcoder + codec deps | Zero rendering deps (pure JDK) |
| 10+ MB fat JAR | 2.6 MB fat JAR |
| 1 monolithic file (400 lines) | 7 modular source files |
| 34 GC events per run | 1 GC event per run |
| Slower than Python | **24% faster than Python** |

### Why AOT cache doesn't help here

You might notice the AOT cache (`-XX:AOTCache`) shows no improvement over plain JAR execution. That's expected: JEP 483 AOT cache pre-loads classes from a training run, eliminating class-loading overhead on subsequent runs. But for our generator, class loading is already fast (~0.5s). The bottleneck is `ImageIO.write()` — pure CPU-bound PNG compression — which no amount of class pre-loading can speed up.

## What we learned

1. **Don't SVG-to-PNG when you can draw directly.** If you control the layout, `Graphics2D` + `ImageIO` is simpler, faster, and dependency-free.

2. **Java's `Font.createFont()` registers everything as style=0.** Load fonts from files with `deriveFont()` instead of relying on `new Font(name, style, size)`.

3. **Reuse large objects.** A 12 MB `BufferedImage` per card is a humongous allocation in G1. One shared buffer, cleared each iteration, drops GC events from 34 to 1.

4. **Lower `-XX:Tier4CompileThreshold` for short-lived CLI apps.** With only ~100 iterations, the C2 compiler needs a nudge to engage before the work is done.

5. **Profile before tuning.** We tested Epsilon GC, Shenandoah, ZGC, Serial GC, various heap sizes, and G1 region sizes. None moved the needle. The bottleneck was always PNG compression — a CPU-bound operation that no GC or heap configuration can improve.

6. **JBang `//SOURCES` makes multi-file Java scripts practical.** No build tool, no `pom.xml` — just list your source files and run.

## Try it yourself

```bash
# Generate all 112 OG cards
jbang html-generators/generateog.java

# Generate a single card
jbang html-generators/generateog.java language/type-inference-with-var

# Build JAR + AOT for fastest execution
jbang export fatjar --force --output html-generators/generateog.jar html-generators/generateog.java
java -XX:AOTCacheOutput=html-generators/generateog.aot -jar html-generators/generateog.jar
java -XX:Tier4CompileThreshold=100 -XX:AOTCache=html-generators/generateog.aot -jar html-generators/generateog.jar
```

The full source is at [github.com/brunoborges/javaevolved](https://github.com/brunoborges/javaevolved) under `html-generators/`.

CI benchmark results: [Actions run #22563953466](https://github.com/brunoborges/javaevolved/actions/runs/22563953466).
