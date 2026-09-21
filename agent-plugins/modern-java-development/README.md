# Modern Java Development agent plugin

A portable [Agent Plugins 1.0](https://agent-plugins.org/specification) package
for version-aware Java development.

The plugin contributes the `modern-java` skill. The skill detects the project's
effective Java compilation target before recommending language features, APIs,
tooling, or modernization changes. Guidance is cumulative and grouped by the
Java release in which each capability became final.

## Package layout

```text
modern-java-development/
├── plugin.json
└── skills/
    └── modern-java/
        ├── SKILL.md
        ├── references/
        │   ├── core-practices.md
        │   ├── enterprise-practices.md
        │   └── release-practices.md
        └── scripts/
            ├── DetectJavaVersion.java
            ├── PluginValidationTest.java
            ├── detect-java-version.cmd
            ├── detect-java-version.jar
            └── detect-java-version.sh
```

## Install

Versioned `.tar.gz` packages and SHA-256 checksums are available from the
[GitHub Releases](https://github.com/brunoborges/javaevolved/releases).
Each archive contains the `modern-java-development` package directory.

### GitHub Copilot CLI

GitHub Copilot CLI supports the Agent Plugins specification. Add the
java.evolved marketplace once:

```bash
copilot plugin marketplace add brunoborges/javaevolved
```

Then install the plugin:

```bash
copilot plugin install modern-java-development@javaevolved
```

See the
[GitHub Copilot CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
for marketplace management and plugin updates.

### Claude Code

Claude Code supports the Agent Skills format used by the `modern-java` skill.
Clone this repository and copy the skill to your personal skills directory:

```bash
git clone --depth 1 https://github.com/brunoborges/javaevolved.git
mkdir -p ~/.claude/skills
cp -R javaevolved/agent-plugins/modern-java-development/skills/modern-java \
  ~/.claude/skills/
```

For a project-only installation, copy the skill to
`.claude/skills/modern-java` in that project instead. See the
[Claude Code skills documentation](https://code.claude.com/docs/en/skills).

### OpenAI Codex CLI

Codex CLI also supports Agent Skills. Clone this repository and copy the skill
to your personal skills directory:

```bash
git clone --depth 1 https://github.com/brunoborges/javaevolved.git
mkdir -p ~/.agents/skills
cp -R javaevolved/agent-plugins/modern-java-development/skills/modern-java \
  ~/.agents/skills/
```

For a project-only installation, copy the skill to
`.agents/skills/modern-java` in that project instead. See the
[Codex skills documentation](https://developers.openai.com/codex/skills/).

Claude Code and Codex CLI use their own product-specific plugin manifests, so
the instructions above install the portable skill rather than the root
Agent Plugins manifest.

## Use

When the skill is active, the agent runs the detector from the Java project root:

```console
# macOS and Linux
skills/modern-java/scripts/detect-java-version.sh .

# Windows
skills\modern-java\scripts\detect-java-version.cmd .
```

Pass an explicit target when build metadata is unavailable:

```console
# macOS and Linux
skills/modern-java/scripts/detect-java-version.sh . --java-version 21

# Windows
skills\modern-java\scripts\detect-java-version.cmd . --java-version 21
```

The detector emits JSON so an agent can distinguish the selected target from
lower-confidence runtime evidence and report conflicting build configuration.

## Validate

```bash
set -e
classes=$(mktemp -d)
trap 'rm -rf "$classes"' EXIT
jarfile="$PWD/skills/modern-java/scripts/detect-java-version.jar"
mkdir "$classes/source" "$classes/shipped" "$classes/tests"
javac -source 8 -target 8 -Xlint:-options \
  -d "$classes/source" skills/modern-java/scripts/DetectJavaVersion.java
(
  cd "$classes/shipped"
  jar xf "$jarfile"
)
rm -rf "$classes/shipped/META-INF"
diff -r "$classes/source" "$classes/shipped"
javac -source 8 -target 8 -Xlint:-options \
  -cp "$jarfile" \
  -d "$classes/tests" skills/modern-java/scripts/PluginValidationTest.java
java -cp "$classes/tests:$jarfile" \
  PluginValidationTest ../..
```

## Release

Run the **Release agent plugin** workflow from the `main` branch. The first run
publishes the manifest's initial `1.0.0` version. Later runs use a patch release
by default (`1.0.0` to `1.0.1`); select **Feature release** for a minor bump or
**Major release** for a major bump. The two release options are mutually
exclusive.
