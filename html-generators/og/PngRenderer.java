package og;

import og.ContentLoader.Snippet;
import og.SyntaxHighlighter.Token;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.font.FontRenderContext;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import javax.imageio.ImageIO;

import static og.Layout.*;
import static og.Palette.*;

/**
 * Renders OG card PNGs directly with Graphics2D — no SVG intermediary,
 * no Batik dependency. Produces 2× resolution (2400×1260) images.
 */
public final class PngRenderer {

    static final int SCALE = 2;

    // Reuse a single BufferedImage across all cards to avoid 12MB humongous allocations per card
    static final BufferedImage SHARED_IMG = new BufferedImage(W * SCALE, H * SCALE, BufferedImage.TYPE_INT_RGB);

    public static void generate(Snippet s, Path outputPath) throws IOException {
        var g = SHARED_IMG.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_LCD_HRGB);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.scale(SCALE, SCALE);

        // White fill (clears previous card)
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, W, H);

        drawCard(g, s);
        g.dispose();
        ImageIO.write(SHARED_IMG, "PNG", outputPath.toFile());
    }

    static void drawCard(Graphics2D g, Snippet s) {
        // Background with rounded corners
        var bg = new RoundRectangle2D.Double(0, 0, W, H, 16, 16);
        g.setColor(Palette.color(BG));
        g.fill(bg);
        g.setColor(Palette.color(BORDER));
        g.setStroke(new BasicStroke(1f));
        g.draw(new RoundRectangle2D.Double(0.5, 0.5, W - 1, H - 1, 16, 16));

        drawHeader(g, s);

        // Compute font size and fit lines
        var rawOldLines = s.oldCode().lines().toList();
        var rawModernLines = s.modernCode().lines().toList();
        int fontSize = bestFontSize(rawOldLines, rawModernLines);
        int lineH = (int) (fontSize * LINE_HEIGHT_RATIO);
        var oldLines = fitLines(rawOldLines, fontSize);
        var modernLines = fitLines(rawModernLines, fontSize);

        int leftX  = PAD;
        int rightX = PAD + COL_W + 20;

        drawCodePanel(g, oldLines, leftX, OLD_BG, OLD_ACCENT,
            "\u2717  " + s.oldLabel(), fontSize, lineH);
        drawCodePanel(g, modernLines, rightX, MODERN_BG, GREEN,
            "\u2713  " + s.modernLabel(), fontSize, lineH);

        drawFooter(g, s);
    }

    static void drawHeader(Graphics2D g, Snippet s) {
        var catText = s.catDisplay();
        var categoryFont = FontManager.getFont("Inter-SemiBold.ttf", 13f);
        var titleFont = FontManager.getFont("Inter-Bold.ttf", 24f);

        // Category badge
        var fm = g.getFontMetrics(categoryFont);
        int badgeW = fm.stringWidth(catText) + 16;
        g.setColor(Palette.color(BADGE_BG));
        g.fill(new RoundRectangle2D.Double(PAD, 28, badgeW, 22, 6, 6));
        g.setFont(categoryFont);
        g.setColor(Palette.color(TEXT_MUTED));
        g.drawString(catText, PAD + 8, 43);

        // Title
        g.setFont(titleFont);
        g.setColor(Palette.color(TEXT));
        g.drawString(s.title(), PAD, 76);
    }

    static void drawCodePanel(Graphics2D g, List<String> lines, int panelX,
            String bgHex, String labelColorHex, String labelText,
            int fontSize, int lineH) {

        // Panel background
        var panelRect = new RoundRectangle2D.Double(panelX, CODE_TOP, COL_W, CODE_H, 8, 8);
        g.setColor(Palette.color(bgHex));
        g.fill(panelRect);
        g.setColor(Palette.color(BORDER));
        g.setStroke(new BasicStroke(0.5f));
        g.draw(panelRect);

        // Label
        var labelFont = FontManager.getFont("Inter-SemiBold.ttf", 11f);
        g.setFont(labelFont);
        g.setColor(Palette.color(labelColorHex));
        g.drawString(labelText.toUpperCase(), panelX + 14, CODE_TOP + 26);

        // Code lines (clipped to panel)
        Shape oldClip = g.getClip();
        g.setClip(panelRect);
        var codeFont = FontManager.getFont("JetBrainsMono-Regular.ttf", (float) fontSize);
        g.setFont(codeFont);
        var frc = g.getFontRenderContext();
        int codeY = CODE_TOP + 52;

        for (int i = 0; i < lines.size(); i++) {
            var tokens = SyntaxHighlighter.tokenize(lines.get(i));
            drawTokens(g, tokens, panelX + 14, codeY + i * lineH, codeFont, frc);
        }
        g.setClip(oldClip);
    }

    static void drawTokens(Graphics2D g, List<Token> tokens, int x, int y,
            Font codeFont, FontRenderContext frc) {
        float curX = x;
        for (var token : tokens) {
            g.setColor(token.color() != null
                ? Palette.color(token.color())
                : Palette.color(SYN_DEFAULT));
            g.drawString(token.text(), curX, y);
            curX += (float) codeFont.getStringBounds(token.text(), frc).getWidth();
        }
    }

    static void drawFooter(Graphics2D g, Snippet s) {
        var footerFont = FontManager.getFont("Inter-Medium.ttf", 13f);
        var brandFont = FontManager.getFont("Inter-Bold.ttf", 14f);

        // JDK version
        g.setFont(footerFont);
        g.setColor(Palette.color(TEXT_MUTED));
        g.drawString("JDK %s+".formatted(s.jdkVersion()), PAD, H - 22);

        // Brand (right-aligned)
        g.setFont(brandFont);
        g.setColor(Palette.color(ACCENT));
        var brand = "javaevolved.dev";
        var fm = g.getFontMetrics(brandFont);
        g.drawString(brand, W - PAD - fm.stringWidth(brand), H - 22);
    }

    private PngRenderer() {}
}
