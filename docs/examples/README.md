# Configuration Examples

This directory contains example configuration files for the DDP CLI tool.

## Files

### ddprc.example.json

Example configuration file for the DDP CLI. Copy this to your project root as `.ddprc.json` to customize CLI behavior.

**Usage:**
```bash
# Copy to your project
cp docs/examples/ddprc.example.json .ddprc.json

# Edit to match your project structure
# Then run DDP CLI
ddp-analyze
```

**Key Configuration Options:**
- **maxFiles**: Maximum number of files to analyze (default: 1000)
- **excludeTests**: Exclude test files from analysis (default: true)
- **coverage**: LCOV and JaCoCo file patterns
- **cc**: Cyclomatic complexity tool paths (ESLint, Radon, PMD)
- **rank**: PageRank algorithm parameters
- **fileRollup**: How to aggregate symbol risks to file level (max/sum/avg)
- **churn**: Git churn analysis configuration

### ddprc.schema.json

JSON Schema for `.ddprc.json` configuration files. This enables:
- **IDE autocomplete** when editing `.ddprc.json`
- **Validation** to catch configuration errors
- **Documentation** via schema descriptions

**Using the Schema:**

Most IDEs with JSON support will automatically use the schema if your `.ddprc.json` includes:
```json
{
  "$schema": "./docs/examples/ddprc.schema.json",
  ...
}
```

Or configure your IDE to associate `*.ddprc.json` files with this schema.

## Related Documentation

- **[CLI Implementation Guide](../guides/IMPLEMENTATION_GUIDE_CLI.md)** — Detailed CLI implementation
- **[Architecture Summary](../architecture/ARCHITECTURE_SUMMARY.md)** — CLI architecture and design
- **[Main README](../../README.md)** — VS Code extension usage and configuration
