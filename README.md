# Board Game Catalog

A self-hosted web catalog for browsing your board game collection. Filter by player count, play time, age range, game style, type, and tags to find the perfect game for game night.

## Features

- **Filter pills** - Narrow down games by players, time, age, style, type, and custom tags
- **Sort** - By recently added, name, player count, or play time
- **Random picker** - "Pick for me" button selects a random game from filtered results
- **Image gallery** - Multiple photos per game with cover image and gallery cycling
- **Detail modal** - Click any game to view and edit all metadata inline
- **Favorites** - Star your favorite games and filter to show only favorites
- **Notes & links** - Personal notes and reference links per game
- **Themes** - Dark blue/teal (default), dark purple, or light theme
- **All data on disk** - Everything stored in YAML files, nothing in the browser

## Quick Start

```bash
# Install the only dependency
pip install pyyaml

# Set up config files
cp .env.example .env
cp config/games.example.yaml config/games.yaml

# Start the server
python3 server.py
```

Opens automatically at [http://localhost:18294](http://localhost:18294).

## Adding Games

### With Claude Code

Use the `/add-game` skill: provide a photo of the game box and Claude will identify the game, auto-fill metadata, and add it to your catalog.

### Manually

1. Add an entry to `config/games.yaml` (see `config/games.example.yaml` for the format)
2. Create an image folder: `images/{game-slug}/`
3. Add a cover image: `images/{game-slug}/cover.jpg`
4. Refresh the browser

## Configuration

Edit `.env` to configure:

| Variable    | Default           | Description                          |
|------------|-------------------|--------------------------------------|
| PORT       | 18294              | Server port                          |
| THEME      | dark-blue-teal    | Theme: dark-blue-teal, dark-purple, light |
| GAMES_FILE | config/games.yaml | Path to games data file              |
| IMAGES_DIR | images            | Path to images directory             |

## Project Structure

```
├── server.py              # Python HTTP server + REST API
├── static/
│   ├── index.html         # Main page
│   ├── styles.css         # Themed styles
│   └── app.js             # Frontend logic
├── config/
│   ├── defaults.yaml      # Filter options & theme definitions
│   ├── games.yaml         # Your game collection (gitignored)
│   └── games.example.yaml # Example data template
├── images/                # Game images (gitignored)
│   └── {game-slug}/
│       ├── cover.jpg      # Hero image
│       └── *.jpg/png      # Gallery images
├── .env                   # Local config (gitignored)
├── .env.example           # Config template
└── AGENTS.md              # Agent instructions
```

## Privacy

This repo is open source. Personal data (your game collection, photos, and local config) is gitignored and never committed. Only the code and templates are tracked.

## License

CC0 1.0 Universal - See [LICENSE](LICENSE) for details.
