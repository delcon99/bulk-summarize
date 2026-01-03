# bulk-summarize

Bulk YouTube video summarizer for research. Scans channels and playlists for videos matching keywords, then uses AI to create detailed summaries.

Perfect for:
- Podcast research and episode digests
- Conference talk compilations
- Tutorial series notes
- Any YouTube-based research project

## Features

- **Keyword filtering** - Only summarize videos matching your search terms
- **Per-source checkpoints** - Each source tracks its own progress in its folder
- **Organized output** - Summaries grouped by source in separate directories
- **Configurable prompts** - Customize what the AI extracts from each video
- **Combined output** - Merge all summaries into a single searchable document

## Installation

### Prerequisites

1. **[Bun](https://bun.sh)** - JavaScript runtime
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - YouTube metadata downloader
   ```bash
   # macOS
   brew install yt-dlp

   # or pip
   pip install yt-dlp
   ```

3. **[summarize](https://summarize.sh)** - AI summarization CLI ([GitHub](https://github.com/steipete/summarize))
   ```bash
   # See https://summarize.sh for installation
   # Requires API key (OpenAI, Anthropic, etc.)
   ```

### Install bulk-summarize

```bash
# Clone or download
git clone https://github.com/youruser/bulk-summarize.git
cd bulk-summarize

# Run directly
bun run bulk-summarize.ts --help
```

Add an alias:
```bash
alias bulk-summarize="bun run /path/to/bulk-summarize.ts"
```

## Quick Start

```bash
# 1. Initialize project
bulk-summarize init

# 2. Edit bulk-summarize.json (add sources, keywords)

# 3. Scan for matching videos
bulk-summarize scan

# 4. Summarize pending videos
bulk-summarize summarize

# 5. Combine into one document
bulk-summarize combine
```

## Usage

```
bulk-summarize [options] <command> [args]

Commands:
  init [name]        Create starter config file
  scan               Scan sources for videos matching keywords
  summarize          Summarize pending videos
  combine            Combine all summaries into one document
  status             Show progress for all sources
  list               List configured sources
  reset [source]     Reset checkpoint (all or specific source)
  help               Show help

Options:
  -c, --config <file>      Config file (default: bulk-summarize.json)
  -o, --output-dir <dir>   Output directory (overrides config)
  -s, --source <id>        Target specific source
  -n, --limit <n>          Limit videos to process
  -d, --delay <ms>         Delay between videos (default: 1000ms)
  -p, --parallel <n>       Concurrent summarizations (default: 1)
  --output <file>          Output file for combine
```

## Output Structure

Each source gets its own folder with checkpoint and summaries:

```
summaries/
  podcast-name/
    .checkpoint.json     # Tracks pending/done/errors
    abc123.md            # Video summaries
    def456.md
  another-channel/
    .checkpoint.json
    ghi789.md
```

## Configuration

```json
{
  "name": "My Research",
  "keywords": ["topic1", "topic2"],
  "sources": [
    {
      "id": "channel-id",
      "name": "Channel Name",
      "url": "https://www.youtube.com/@ChannelHandle",
      "enabled": true
    }
  ],
  "settings": {
    "maxVideosPerSource": 50,
    "summaryLength": "xl",
    "summaryPrompt": "Extract key insights. Ignore ads.\n\nTitle: {title}",
    "outputDir": "summaries"
  }
}
```

### Settings

| Field | Description |
|-------|-------------|
| `keywords` | Videos matching ANY keyword included. Empty = all videos |
| `summaryLength` | `short`, `medium`, `long`, `xl`, `xxl` |
| `summaryPrompt` | AI instructions. `{title}` and `{source}` are replaced |
| `maxVideosPerSource` | Limit per source |

## Finding YouTube Channels

```bash
# Search for channels
yt-dlp "ytsearch10:topic podcast" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u

# Verify channel works
yt-dlp --flat-playlist --print "%(playlist_uploader)s" \
  --playlist-end 1 "https://www.youtube.com/@ChannelName/videos"

# List channel playlists
yt-dlp --flat-playlist --print "%(title)s: %(url)s" \
  "https://www.youtube.com/@ChannelName/playlists"
```

## Examples

### Podcasts

```json
{
  "name": "AI Podcasts",
  "keywords": ["AI", "GPT", "machine learning"],
  "sources": [
    { "id": "lex", "name": "Lex Fridman", "url": "https://www.youtube.com/@lexfridman" }
  ],
  "settings": {
    "summaryLength": "xxl",
    "summaryPrompt": "Extract insights, quotes, resources. Ignore sponsors.",
    "outputDir": "podcast-notes"
  }
}
```

### Conference Talks

```json
{
  "name": "React Conf 2024",
  "keywords": [],
  "sources": [
    {
      "id": "react-conf",
      "name": "React Conf 2024",
      "url": "https://www.youtube.com/playlist?list=PLxxxxxx",
      "type": "playlist"
    }
  ],
  "settings": {
    "summaryLength": "long",
    "summaryPrompt": "Summarize: thesis, takeaways, new APIs.",
    "outputDir": "conf-notes"
  }
}
```

### Travel Research

```json
{
  "name": "Portugal Research",
  "keywords": ["Porto", "Lisbon", "expat", "cost of living"],
  "sources": [
    { "id": "expats", "name": "ExpatsEverywhere", "url": "https://www.youtube.com/@ExpatsEverywhere" }
  ],
  "settings": {
    "summaryPrompt": "Extract: neighborhood tips, costs, cultural insights, family activities. Ignore ads.",
    "outputDir": "travel-research"
  }
}
```

## Workflow Tips

```bash
# Process in batches
bulk-summarize summarize -n 10

# Parallel processing (3 concurrent, 500ms delay)
bulk-summarize summarize -p 3 -d 500

# Faster processing (no delay)
bulk-summarize summarize -d 0

# Multiple projects
bulk-summarize -c podcasts.json scan
bulk-summarize -c tutorials.json scan

# Target one source
bulk-summarize scan -s lex-fridman
bulk-summarize summarize -s lex-fridman

# Resume (checkpoints auto-saved)
bulk-summarize summarize
```

## Costs

Approximate costs using Claude Haiku:
- 5-10 min video: ~$0.02
- 20-30 min video: ~$0.03-0.05
- 1+ hour video: ~$0.05-0.10

50-video backlog: ~$1-3

## License

MIT

## Dependencies

- [Bun](https://bun.sh)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [summarize](https://summarize.sh) ([GitHub](https://github.com/steipete/summarize))
