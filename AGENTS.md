# Board Game Catalog

A local web app for browsing and choosing board games from your personal collection.

## Architecture

- **server.py** - Python HTTP server (stdlib + PyYAML). Serves static files, images, and REST API.
- **static/** - Vanilla HTML/CSS/JS frontend. No build step, no framework.
- **config/games.yaml** - Game catalog data (gitignored, personal data).
- **config/defaults.yaml** - Filter options and theme definitions (tracked).
- **images/{slug}/** - Per-game image folders. `cover.*` is the hero image (gitignored).
- **.env** - Local config: port, theme, paths (gitignored).

## Running

```bash
pip install pyyaml
cp .env.example .env
cp config/games.example.yaml config/games.yaml
python3 server.py
```

Server opens at http://localhost:18294 by default.

## Code Style

- Python: 2 spaces for indentation.
- JavaScript: vanilla ES6, no framework.
- All persistent state in YAML on disk, never localStorage.

## Privacy

Personal data is gitignored: `images/`, `config/games.yaml`, `.env`.
Only code and templates are tracked.

## Key Patterns

- **Filter pills**: OR within a category, AND across categories.
- **Image convention**: `images/{slug}/cover.jpg` is the hero. Other images are gallery.
- **API**: REST endpoints at `/api/games`, mutations save to YAML atomically.
- **Themes**: CSS custom properties, switchable via `THEME` in `.env`. Options: `dark-blue-teal`, `dark-purple`, `light`.
