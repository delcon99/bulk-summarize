# YouTube Research Assistant

A skill for setting up and running `bulk-summarize` - a tool to scan YouTube channels/playlists and create AI summaries of videos.

## When to Use

Trigger when user wants to:
- Research a topic using YouTube videos or podcasts
- Find YouTube channels or playlists on a subject
- Set up a video summarization project
- Create digests from conference talks, tutorials, or podcasts
- Bulk process YouTube content for notes

## Tool Location

```bash
# Run with bun
bun run /path/to/bulk-summarize.ts [command]

# Or with alias
alias bulk-summarize="bun run /path/to/bulk-summarize.ts"
```

## Quick Commands

```bash
bulk-summarize init              # Create starter config
bulk-summarize scan              # Find matching videos
bulk-summarize summarize         # Process pending videos
bulk-summarize summarize -n 10   # Process 10 videos
bulk-summarize status            # Check progress
bulk-summarize combine           # Merge all summaries
```

## Finding YouTube Content

### Search for Channels

```bash
# General topic search
yt-dlp "ytsearch10:TOPIC podcast" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u

# Examples
yt-dlp "ytsearch10:rust programming tutorial" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u

yt-dlp "ytsearch10:portugal expat living" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u

yt-dlp "ytsearch10:machine learning explained" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u
```

### Verify Channel URL

```bash
yt-dlp --flat-playlist --print "%(playlist_uploader)s" \
  --playlist-end 1 "https://www.youtube.com/@ChannelName/videos"
```

### Find Playlists on Channel

```bash
yt-dlp --flat-playlist --print "%(title)s: %(url)s" \
  "https://www.youtube.com/@ChannelName/playlists"
```

### Search Video Titles

```bash
yt-dlp --flat-playlist --print "%(title)s" \
  "https://www.youtube.com/@ChannelName/videos" | grep -i "keyword"
```

## Config Templates

### Podcast Research

```json
{
  "name": "Podcast Research",
  "keywords": ["KEYWORD1", "KEYWORD2"],
  "sources": [
    {
      "id": "podcast-id",
      "name": "Podcast Name",
      "url": "https://www.youtube.com/@PodcastChannel"
    }
  ],
  "settings": {
    "maxVideosPerSource": 50,
    "summaryLength": "xxl",
    "summaryPrompt": "Create detailed notes. Extract: key insights, notable quotes, resources mentioned, actionable advice. Ignore: sponsors, ads, promotional content.\n\nTitle: {title}",
    "outputDir": "podcast-notes"
  }
}
```

### Conference Talks

```json
{
  "name": "Conference Digest",
  "keywords": [],
  "sources": [
    {
      "id": "conf-name",
      "name": "Conference Name",
      "url": "https://www.youtube.com/playlist?list=PLxxxxxx",
      "type": "playlist"
    }
  ],
  "settings": {
    "maxVideosPerSource": 100,
    "summaryLength": "long",
    "summaryPrompt": "Summarize this conference talk. Include: main thesis, key takeaways, new APIs or features, code patterns shown.\n\nTitle: {title}",
    "outputDir": "conf-notes"
  }
}
```

### Tutorial/Learning

```json
{
  "name": "Learning TOPIC",
  "keywords": ["concept1", "concept2"],
  "sources": [
    {
      "id": "tutorial-channel",
      "name": "Channel Name",
      "url": "https://www.youtube.com/@TutorialChannel"
    }
  ],
  "settings": {
    "summaryLength": "xl",
    "summaryPrompt": "Create study notes. Include: concepts explained, code examples, common pitfalls, practice suggestions.\n\nTitle: {title}",
    "outputDir": "study-notes"
  }
}
```

### Travel/Location Research

```json
{
  "name": "LOCATION Research",
  "keywords": ["city", "neighborhood", "cost of living", "expat"],
  "sources": [
    {
      "id": "expat-channel",
      "name": "Expat Channel",
      "url": "https://www.youtube.com/@ExpatChannel"
    }
  ],
  "settings": {
    "summaryLength": "xl",
    "summaryPrompt": "Extract practical information: neighborhood recommendations, cost estimates, cultural tips, activities, accommodation advice, transportation, food recommendations. Ignore: ads, sponsors, dated news.\n\nTitle: {title}",
    "outputDir": "travel-research"
  }
}
```

### Product/Tool Reviews

```json
{
  "name": "Tool Research",
  "keywords": ["review", "comparison", "vs", "best"],
  "sources": [
    {
      "id": "tech-channel",
      "name": "Tech Review Channel",
      "url": "https://www.youtube.com/@TechChannel"
    }
  ],
  "settings": {
    "summaryLength": "long",
    "summaryPrompt": "Extract: products compared, pros/cons of each, pricing, use cases, recommendations. Focus on factual comparisons.\n\nTitle: {title}",
    "outputDir": "tool-reviews"
  }
}
```

## Workflow Patterns

### New Research Project

```bash
# 1. Search for relevant channels
yt-dlp "ytsearch20:TOPIC" --flat-playlist \
  --print "%(channel_url)s %(channel)s" 2>/dev/null | sort -u

# 2. Create config
bulk-summarize init my-research.json
# Edit to add sources and keywords

# 3. Scan and process
bulk-summarize -c my-research.json scan
bulk-summarize -c my-research.json summarize
bulk-summarize -c my-research.json combine --output research.md
```

### Incremental Processing

```bash
# First batch
bulk-summarize summarize -n 10
# Review quality...

# Continue
bulk-summarize summarize
```

### Multi-Project

```bash
bulk-summarize -c podcasts.json scan
bulk-summarize -c tutorials.json scan
bulk-summarize -c podcasts.json summarize
```

### Single Source Focus

```bash
bulk-summarize scan -s source-id
bulk-summarize summarize -s source-id
```

## Output Structure

```
summaries/
  source-id/
    .checkpoint.json    # Progress tracking
    videoId1.md         # Individual summaries
    videoId2.md
  another-source/
    .checkpoint.json
    videoId3.md
```

## Prompt Tips

### Long-form Content (2+ hours)
```
Comprehensive summary organized by topic. Include: key insights, notable quotes, resources mentioned. Be thorough.
```

### Short-form (< 15 min)
```
Concise summary of main point and key details.
```

### Technical Content
```
Extract: concepts taught, code patterns, prerequisites, common mistakes. Format as study notes.
```

### News/Analysis
```
Summarize developments discussed. Note: may contain time-sensitive information.
```

## Dependencies

- **bun**: `curl -fsSL https://bun.sh/install | bash`
- **yt-dlp**: `brew install yt-dlp` or `pip install yt-dlp`
- **summarize**: See https://summarize.sh ([GitHub](https://github.com/steipete/summarize))

## Troubleshooting

### Channel Not Found
```bash
# Search for correct URL
yt-dlp "ytsearch3:channel name" --flat-playlist \
  --print "%(channel_url)s %(channel)s"
```

### No Keyword Matches
- Broaden keywords
- Use empty `[]` to get all videos, filter later

### Summarization Fails
- Some videos lack transcripts (live streams, music)
- Check `summarize --help` for API config
