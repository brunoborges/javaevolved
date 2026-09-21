# java.evolved

**Java has evolved. Your code can too.**

A collection of side-by-side code comparisons showing old Java patterns next to their clean, modern replacements — from Java 8 all the way to Java 25.

🔗 **[javaevolved.dev](https://javaevolved.dev)**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-brightgreen)](https://javaevolved.github.io)
[![Snippets](https://img.shields.io/badge/snippets-112-blue)](#categories)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-orange)](#contributing)

> **Note:** Update the snippet count badge above when adding new patterns.

---

## What is this?

Every snippet shows two panels:

- **✕ Old** — the traditional way (Java 7/8 era)
- **✓ Modern** — the clean, idiomatic replacement (Java 9–25)

Each comparison includes an explanation of *why* the modern approach is better, which JDK version introduced it, and links to related patterns.

## Categories

| Category | Examples |
|---|---|
| **Language** | Records, sealed classes, pattern matching, switch expressions, var, unnamed variables |
| **Collections** | Immutable factories, sequenced collections, unmodifiable collectors |
| **Strings** | Text blocks, `isBlank()`, `strip()`, `repeat()`, `formatted()`, `indent()` |
| **Streams** | `toList()`, `mapMulti()`, `takeWhile()`/`dropWhile()`, gatherers |
| **Concurrency** | Virtual threads, structured concurrency, scoped values, `ExecutorService` as `AutoCloseable` |
| **I/O** | `Files.readString()`, `writeString()`, `Path.of()`, `transferTo()`, HTTP Client |
| **Errors** | `requireNonNullElse()`, record-based errors, deserialization filters |
| **Date/Time** | `java.time` basics, `Duration`/`Period`, `DateTimeFormatter`, instant precision |
| **Security** | TLS defaults, `SecureRandom`, PEM encoding, key derivation functions |
| **Tooling** | JShell, single-file execution, JFR profiling, compact source files, AOT |
| **Enterprise** | EJB → CDI, JDBC → JPA/Jakarta Data, JNDI → injection, MDB → reactive messaging, REST |

## Architecture

This site uses a **JSON/YAML-first** build pipeline:

- **Source of truth**: Individual `content/category/slug.json` files (112 patterns across 11 category folders)
- **Templates**: `templates/` — shared HTML templates with `{{placeholder}}` tokens for content and UI strings
- **Generator**: `html-generators/generate.java` — JBang script that produces all HTML pages, localized variants, and `data/snippets.json`
- **Translations**: `translations/strings/{locale}.yaml` for UI strings, `translations/content/{locale}/` for pattern content (YAML)
- **Deploy**: GitHub Actions runs the generator and deploys to GitHub Pages

### Agent plugin

[`agent-plugins/modern-java-development`](agent-plugins/modern-java-development/)
is a portable Agent Plugins 1.0 package for version-aware Java development. Its
skill detects a project's effective compilation target, then limits guidance to
final language features and APIs available in that Java release.

Generated files (`site/category/*.html`, `site/{locale}/`, and `site/data/snippets.json`) are in `.gitignore` — never edit them directly.

### Internationalization

The site supports 11 languages: English, Deutsch, Español, Português (Brasil), 中文 (简体), العربية, Français, 日本語, 한국어, Italian and Polski. See [`specs/i18n/i18n-spec.md`](specs/i18n/i18n-spec.md) for the full specification.

## Build & run locally

### Prerequisites

- **Java 25+** (e.g. [Temurin](https://adoptium.net/))
- **JBang** ([Jbang](https://www.jbang.dev/))

### Generate and serve

```bash
# Generate all HTML pages and data/snippets.json into site/
jbang html-generators/generate.java

# Serve locally need to replace path with absolute path to site folder 
jwebserver -b 0.0.0.0 -d path/to/site -p 8090
# Open http://localhost:8090
```

The fat JAR is a self-contained ~2.2 MB file with all dependencies bundled. [JBang](https://jbang.dev) is needed to run the generator.

For development on the generator itself, see [html-generators/README.md](html-generators/README.md).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details on adding patterns and translating the site.

## Tech stack

- Plain HTML, CSS, and JavaScript — no frontend frameworks
- [JBang](https://jbang.dev) + [Jackson](https://github.com/FasterXML/jackson) for build-time generation
- Hosted on GitHub Pages via GitHub Actions

## Author

**Bruno Borges**

- GitHub: [@brunoborges](https://github.com/brunoborges)
- X/Twitter: [@brunoborges](https://x.com/brunoborges)
- LinkedIn: [brunocborges](https://www.linkedin.com/in/brunocborges)

## License

This project is licensed under the [MIT License](LICENSE).
