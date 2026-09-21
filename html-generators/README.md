# HTML Generators

This folder contains the build scripts that generate all HTML detail pages and `site/data/snippets.json` from the JSON source files in `content/`.

## Files

| File            | Description                                   |
|-----------------|-----------------------------------------------|
| `generate.java` | JBang script (Java 25) — primary generator    |
| `generate.jar`  | Pre-built fat JAR (no JBang/JDK setup needed) |
| `build-cds.sh`  | Script to build a platform-specific AOT cache |

## Running

### Option 1: Fat JAR (fastest, no setup)

```bash
java -jar html-generators/generate.jar
```

Requires only a Java 25+ runtime — no JBang installation needed.

### Option 2: Fat JAR with AOT cache (fastest possible)

```bash
# One-time: build the AOT cache (~21 MB, platform-specific)
./html-generators/build-cds.sh

# Subsequent runs use the cache
java -XX:AOTCache=html-generators/generate.aot -jar html-generators/generate.jar
```

The AOT cache (Java 25, JEP 514/515) pre-loads classes from a training run, reducing startup time by ~30%. The cache is platform-specific and is not committed to git — regenerate it after changing the JAR or JDK version.

### Option 3: JBang (for development)

```bash
jbang html-generators/generate.java
```

Requires [JBang](https://jbang.dev) and Java 25+.

## Rebuilding the fat JAR

After modifying `generate.java`, rebuild the fat JAR:

```bash
jbang export fatjar --output html-generators/generate.jar html-generators/generate.java
```

This produces a self-contained ~2.2 MB JAR with all dependencies (Jackson) bundled. The `build-generator.yml` GitHub Action does this automatically when `generate.java` changes.

## CI/CD Workflows

Two GitHub Actions workflows automate the build and deploy pipeline:

1. **`build-generator.yml`** — Triggered when generator sources change on `main`, including `generate.java`, `generateog.java`, and `og/**`. Uses JBang to rebuild the fat JARs and saves them with their AOT caches in GitHub Actions caches. The OG cache key includes the renderer sources so branding and rendering changes invalidate stale builds.

2. **`deploy.yml`** — Triggered when content, templates, site assets, or OG sources change on `main`, or after a successful generator build. Restores matching JARs and AOT caches, falling back to JBang on a cache miss, to regenerate the HTML, `snippets.json`, and OG cards. It then deploys the `site/` folder to GitHub Pages at `https://javaevolved.dev/`.

Both workflows use matching source-based cache keys, keeping deployed output in sync with the generator sources.
