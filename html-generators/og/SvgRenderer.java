package og;

import og.ContentLoader.Snippet;

import java.util.List;

import static og.ContentLoader.xmlEscape;
import static og.Layout.*;
import static og.Palette.*;

/** Generates SVG card markup for a snippet. */
public final class SvgRenderer {

    static String renderCodeBlock(List<String> lines, int x, int y, int lineH) {
        var sb = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            var tokens = SyntaxHighlighter.tokenize(lines.get(i));
            sb.append("    <text x=\"%d\" y=\"%d\" class=\"code\" xml:space=\"preserve\">%s</text>\n"
                .formatted(x, y + i * lineH, SyntaxHighlighter.tokensToSvg(tokens)));
        }
        return sb.toString();
    }

    public static String generate(Snippet s) {
        int leftX  = PAD;
        int rightX = PAD + COL_W + 20;
        int labelY = CODE_TOP + 26;
        int codeY  = CODE_TOP + 52;

        var rawOldLines = s.oldCode().lines().toList();
        var rawModernLines = s.modernCode().lines().toList();
        int fontSize = bestFontSize(rawOldLines, rawModernLines);
        int lineH = (int) (fontSize * LINE_HEIGHT_RATIO);
        var oldLines = fitLines(rawOldLines, fontSize);
        var modernLines = fitLines(rawModernLines, fontSize);

        return """
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
  <defs>
    <style>
      .title    { font: 700 24px/1 'Inter', sans-serif; fill: %s; }
      .category { font: 600 13px/1 'Inter', sans-serif; fill: %s; }
      .label    { font: 600 11px/1 'Inter', sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
      .code     { font: 400 %dpx/1 'JetBrains Mono', monospace; fill: %s; }
      .footer   { font: 500 13px/1 'Inter', sans-serif; fill: %s; }
      .brand    { font: 700 14px/1 'Inter', sans-serif; fill: %s; }
    </style>
    <clipPath id="clip-left">
      <rect x="%d" y="%d" width="%d" height="%d" rx="8"/>
    </clipPath>
    <clipPath id="clip-right">
      <rect x="%d" y="%d" width="%d" height="%d" rx="8"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="%d" height="%d" rx="16" fill="%s"/>
  <rect x="0.5" y="0.5" width="%d" height="%d" rx="16" fill="none" stroke="%s" stroke-width="1"/>

  <!-- Header: category badge + title -->
  <rect x="%d" y="%d" width="%d" height="22" rx="6" fill="%s"/>
  <text x="%d" y="%d" class="category">%s</text>
  <text x="%d" y="%d" class="title">%s</text>

  <!-- Left panel: Old code -->
  <rect x="%d" y="%d" width="%d" height="%d" rx="8" fill="%s"/>
  <rect x="%d" y="%d" width="%d" height="%d" rx="8" fill="none" stroke="%s" stroke-width="0.5"/>
  <text x="%d" y="%d" class="label" fill="%s">✗  %s</text>
  <g clip-path="url(#clip-left)">
%s  </g>

  <!-- Right panel: Modern code -->
  <rect x="%d" y="%d" width="%d" height="%d" rx="8" fill="%s"/>
  <rect x="%d" y="%d" width="%d" height="%d" rx="8" fill="none" stroke="%s" stroke-width="0.5"/>
  <text x="%d" y="%d" class="label" fill="%s">✓  %s</text>
  <g clip-path="url(#clip-right)">
%s  </g>

  <!-- Footer -->
  <text x="%d" y="%d" class="footer">JDK %s+</text>
  <text x="%d" y="%d" class="brand" text-anchor="end">javaevolved.dev</text>
</svg>
""".formatted(
            // viewBox
            W, H, W, H,
            // style fills
            TEXT, TEXT_MUTED, fontSize, TEXT, TEXT_MUTED, ACCENT,
            // clip-left
            leftX, CODE_TOP, COL_W, CODE_H,
            // clip-right
            rightX, CODE_TOP, COL_W, CODE_H,
            // background
            W, H, BG, W - 1, H - 1, BORDER,
            // header badge
            PAD, 28, xmlEscape(s.catDisplay()).length() * 8 + 16, BADGE_BG,
            PAD + 8, 43, xmlEscape(s.catDisplay()),
            // title
            PAD, 76, xmlEscape(s.title()),
            // left panel bg + border
            leftX, CODE_TOP, COL_W, CODE_H, OLD_BG,
            leftX, CODE_TOP, COL_W, CODE_H, BORDER,
            // left label
            leftX + 14, labelY, OLD_ACCENT, xmlEscape(s.oldLabel()),
            // left code
            renderCodeBlock(oldLines, leftX + 14, codeY, lineH),
            // right panel bg + border
            rightX, CODE_TOP, COL_W, CODE_H, MODERN_BG,
            rightX, CODE_TOP, COL_W, CODE_H, BORDER,
            // right label
            rightX + 14, labelY, GREEN, xmlEscape(s.modernLabel()),
            // right code
            renderCodeBlock(modernLines, rightX + 14, codeY, lineH),
            // footer
            PAD, H - 22, s.jdkVersion(),
            W - PAD, H - 22
        );
    }

    private SvgRenderer() {}
}
