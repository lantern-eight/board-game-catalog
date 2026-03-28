#!/usr/bin/env python3
"""
Board Game Catalog Server
Serves the catalog web UI and provides API endpoints for managing games.

Usage:
    python3 server.py
"""

import os
import re
import sys
import json
import mimetypes
import threading
import tempfile
import http.server
import socketserver
import webbrowser
import urllib.parse
from pathlib import Path

try:
  import yaml
  HAS_YAML = True
except ImportError:
  HAS_YAML = False

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG = {}
DEFAULTS = {}
GAMES = []
GAMES_LOCK = threading.Lock()

# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def load_env():
  """Parse .env file into CONFIG dict. Falls back to .env.example values."""
  config = {
    "PORT": "18294",
    "THEME": "dark-blue-teal",
    "GAMES_FILE": "config/games.yaml",
    "IMAGES_DIR": "images",
  }
  env_path = os.path.join(BASE_DIR, ".env")
  if not os.path.isfile(env_path):
    env_path = os.path.join(BASE_DIR, ".env.example")
  if os.path.isfile(env_path):
    with open(env_path, "r") as f:
      for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
          continue
        if "=" in line:
          key, _, val = line.partition("=")
          config[key.strip()] = val.strip()
  return config


def load_defaults():
  """Load config/defaults.yaml."""
  path = os.path.join(BASE_DIR, "config", "defaults.yaml")
  if os.path.isfile(path):
    with open(path, "r") as f:
      return yaml.safe_load(f) or {}
  return {}


def load_games():
  """Load games list from YAML file."""
  path = os.path.join(BASE_DIR, CONFIG.get("GAMES_FILE", "config/games.yaml"))
  if os.path.isfile(path):
    with open(path, "r") as f:
      data = yaml.safe_load(f) or {}
      return data.get("games", [])
  return []


def save_games():
  """Atomically write games list to YAML file."""
  path = os.path.join(BASE_DIR, CONFIG.get("GAMES_FILE", "config/games.yaml"))
  os.makedirs(os.path.dirname(path), exist_ok=True)
  data = {"games": GAMES}
  fd, tmp_path = tempfile.mkstemp(
    dir=os.path.dirname(path), suffix=".tmp"
  )
  try:
    with os.fdopen(fd, "w") as f:
      yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
    os.replace(tmp_path, path)
  except Exception:
    try:
      os.unlink(tmp_path)
    except OSError:
      pass
    raise


# ---------------------------------------------------------------------------
# Slug utilities
# ---------------------------------------------------------------------------

def slugify(name):
  """Convert a game name to a filesystem-safe slug."""
  s = name.lower().strip()
  s = re.sub(r"[^\w\s-]", "", s)
  s = re.sub(r"[\s_]+", "-", s)
  s = re.sub(r"-+", "-", s).strip("-")
  return s or "unnamed"


def find_game(slug):
  """Find a game by slug. Returns (index, game) or (None, None)."""
  for i, g in enumerate(GAMES):
    if g.get("slug") == slug:
      return i, g
  return None, None


# ---------------------------------------------------------------------------
# Image utilities
# ---------------------------------------------------------------------------

def images_dir():
  return os.path.join(BASE_DIR, CONFIG.get("IMAGES_DIR", "images"))


def list_game_images(slug):
  """Return {cover: path_or_none, gallery: [paths]} for a game."""
  game_dir = os.path.join(images_dir(), slug)
  cover = None
  gallery = []
  if not os.path.isdir(game_dir):
    return {"cover": None, "gallery": []}
  img_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
  for fname in sorted(os.listdir(game_dir)):
    ext = os.path.splitext(fname)[1].lower()
    if ext not in img_exts:
      continue
    base = os.path.splitext(fname)[0].lower()
    url = f"/images/{slug}/{fname}"
    if base == "cover":
      cover = url
    else:
      gallery.append(url)
  return {"cover": cover, "gallery": gallery}


def safe_path(candidate, root):
  """Ensure a resolved path stays within the root directory."""
  real = os.path.realpath(candidate)
  real_root = os.path.realpath(root)
  if not real.startswith(real_root + os.sep) and real != real_root:
    return None
  return real


# ---------------------------------------------------------------------------
# Time ordering helper
# ---------------------------------------------------------------------------

def get_time_order_map():
  """Map time label -> sort index from filters.time in defaults (list order)."""
  times = DEFAULTS.get("filters", {}).get("time") or []
  return {label: i for i, label in enumerate(times)}


def game_to_api(game, time_order_map=None):
  """Enrich a game dict with computed fields for the API response."""
  slug = game.get("slug", "")
  imgs = list_game_images(slug)
  tom = time_order_map if time_order_map is not None else get_time_order_map()
  return {
    **game,
    "images": imgs,
    "time_order": tom.get(game.get("time", ""), 99),
    "players_min": min(
      (p for p in game.get("players", []) if isinstance(p, int)),
      default=99,
    ),
  }


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

class CatalogHandler(http.server.BaseHTTPRequestHandler):
  """Serves static files and handles API routes."""

  def _send_json(self, code, obj):
    body = json.dumps(obj, default=str).encode("utf-8")
    self.send_response(code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Access-Control-Allow-Origin", "*")
    self.end_headers()
    self.wfile.write(body)

  def _send_file(self, filepath, content_type=None):
    if not os.path.isfile(filepath):
      self.send_error(404)
      return
    if not content_type:
      content_type, _ = mimetypes.guess_type(filepath)
      content_type = content_type or "application/octet-stream"
    size = os.path.getsize(filepath)
    self.send_response(200)
    self.send_header("Content-Type", content_type)
    self.send_header("Content-Length", str(size))
    self.send_header("Cache-Control", "no-cache")
    self.end_headers()
    with open(filepath, "rb") as f:
      self.wfile.write(f.read())

  def _read_body(self):
    length = int(self.headers.get("Content-Length", "0"))
    if length <= 0:
      return {}
    raw = self.rfile.read(length)
    return json.loads(raw)

  def _route(self, path):
    """Parse path and return (route_key, params)."""
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
      return ("index", {})
    if parts[0] == "static":
      return ("static", {"path": "/".join(parts[1:])})
    if parts[0] == "images":
      return ("image", {"path": "/".join(parts[1:])})
    if parts[0] == "api":
      if len(parts) == 2 and parts[1] == "games":
        return ("api_games", {})
      if len(parts) == 2 and parts[1] == "config":
        return ("api_config", {})
      if len(parts) == 3 and parts[1] == "games":
        return ("api_game", {"slug": parts[2]})
      if len(parts) == 4 and parts[1] == "games" and parts[3] == "favorite":
        return ("api_game_favorite", {"slug": parts[2]})
      if len(parts) == 4 and parts[1] == "games" and parts[3] == "images":
        return ("api_game_images", {"slug": parts[2]})
    return ("not_found", {})

  # -- GET -----------------------------------------------------------------

  def do_GET(self):
    parsed = urllib.parse.urlparse(self.path)
    route, params = self._route(parsed.path)

    if route == "index":
      self._send_file(os.path.join(BASE_DIR, "static", "index.html"), "text/html")

    elif route == "static":
      filepath = os.path.join(BASE_DIR, "static", params["path"])
      if not safe_path(filepath, os.path.join(BASE_DIR, "static")):
        self.send_error(403)
        return
      self._send_file(filepath)

    elif route == "image":
      filepath = os.path.join(images_dir(), params["path"])
      if not safe_path(filepath, images_dir()):
        self.send_error(403)
        return
      self._send_file(filepath)

    elif route == "api_config":
      themes = DEFAULTS.get("themes", {})
      self._send_json(200, {
        "theme": CONFIG.get("THEME", "dark-blue-teal"),
        "filters": DEFAULTS.get("filters", {}),
        "sort_options": DEFAULTS.get("sort_options", []),
        "themes": list(themes.keys()),
      })

    elif route == "api_games":
      tom = get_time_order_map()
      with GAMES_LOCK:
        result = [game_to_api(g, tom) for g in GAMES]
      self._send_json(200, {"games": result})

    elif route == "api_game":
      with GAMES_LOCK:
        _, game = find_game(params["slug"])
      if game is None:
        self.send_error(404)
        return
      self._send_json(200, game_to_api(game))

    elif route == "api_game_images":
      with GAMES_LOCK:
        _, game = find_game(params["slug"])
      if game is None:
        self.send_error(404)
        return
      self._send_json(200, list_game_images(params["slug"]))

    else:
      self.send_error(404)

  # -- PUT -----------------------------------------------------------------

  def do_PUT(self):
    parsed = urllib.parse.urlparse(self.path)
    route, params = self._route(parsed.path)

    if route == "api_game_favorite":
      data = self._read_body()
      with GAMES_LOCK:
        idx, game = find_game(params["slug"])
        if game is None:
          self.send_error(404)
          return
        game["favorite"] = bool(data.get("favorite", False))
        GAMES[idx] = game
        save_games()
      self._send_json(200, {"favorite": game["favorite"]})

    elif route == "api_game":
      data = self._read_body()
      with GAMES_LOCK:
        idx, game = find_game(params["slug"])
        if game is None:
          self.send_error(404)
          return
        allowed = [
          "name", "players", "time", "age", "style", "type",
          "tags", "notes", "links", "favorite",
        ]
        old_slug = game["slug"]
        for key in allowed:
          if key in data:
            game[key] = data[key]
        if "name" in data:
          new_slug = slugify(data["name"])
          if new_slug != old_slug:
            # Rename image directory if it exists
            old_dir = os.path.join(images_dir(), old_slug)
            new_dir = os.path.join(images_dir(), new_slug)
            if os.path.isdir(old_dir) and not os.path.isdir(new_dir):
              os.rename(old_dir, new_dir)
            game["slug"] = new_slug
        GAMES[idx] = game
        save_games()
      self._send_json(200, game_to_api(game))

    else:
      self.send_error(404)

  # -- POST ----------------------------------------------------------------

  def do_POST(self):
    parsed = urllib.parse.urlparse(self.path)
    route, params = self._route(parsed.path)

    if route == "api_games":
      data = self._read_body()
      name = data.get("name", "").strip()
      if not name:
        self._send_json(400, {"error": "name is required"})
        return
      slug = slugify(name)
      with GAMES_LOCK:
        # Check for duplicate slug
        _, existing = find_game(slug)
        if existing:
          self._send_json(409, {"error": f"Game '{name}' already exists"})
          return
        game = {
          "name": name,
          "slug": slug,
          "players": data.get("players", []),
          "time": data.get("time", ""),
          "age": data.get("age", ""),
          "style": data.get("style", []),
          "type": data.get("type", []),
          "tags": data.get("tags", []),
          "notes": data.get("notes", ""),
          "links": data.get("links", []),
          "favorite": data.get("favorite", False),
          "date_added": data.get("date_added", ""),
        }
        if not game["date_added"]:
          from datetime import date
          game["date_added"] = date.today().isoformat()
        # Create images directory
        game_img_dir = os.path.join(images_dir(), slug)
        os.makedirs(game_img_dir, exist_ok=True)
        GAMES.append(game)
        save_games()
      self._send_json(201, game_to_api(game))

    elif route == "api_game_images":
      # Image upload via multipart or raw body
      slug = params["slug"]
      with GAMES_LOCK:
        _, game = find_game(slug)
      if game is None:
        self.send_error(404)
        return

      content_type = self.headers.get("Content-Type", "")
      length = int(self.headers.get("Content-Length", "0"))
      max_bytes = 20 * 1024 * 1024
      if length <= 0 or length > max_bytes:
        self._send_json(400, {"error": "file too large or empty"})
        return

      # Get filename from query param
      qs = urllib.parse.parse_qs(parsed.query)
      filename = (qs.get("filename") or ["upload.jpg"])[0]
      safe_name = re.sub(r"[^\w.\-]", "_", filename)

      game_img_dir = os.path.join(images_dir(), slug)
      os.makedirs(game_img_dir, exist_ok=True)

      body = self.rfile.read(length)
      dest = os.path.join(game_img_dir, safe_name)
      # Avoid overwriting unless it's cover
      if os.path.exists(dest) and not safe_name.lower().startswith("cover"):
        base, ext = os.path.splitext(safe_name)
        counter = 1
        while os.path.exists(dest):
          dest = os.path.join(game_img_dir, f"{base}_{counter}{ext}")
          counter += 1

      with open(dest, "wb") as f:
        f.write(body)

      saved_name = os.path.basename(dest)
      self._send_json(201, {"path": f"/images/{slug}/{saved_name}"})

    else:
      self.send_error(404)

  # -- DELETE --------------------------------------------------------------

  def do_DELETE(self):
    parsed = urllib.parse.urlparse(self.path)
    route, params = self._route(parsed.path)

    if route == "api_game":
      with GAMES_LOCK:
        idx, game = find_game(params["slug"])
        if game is None:
          self.send_error(404)
          return
        GAMES.pop(idx)
        save_games()
      self._send_json(200, {"deleted": params["slug"]})

    else:
      self.send_error(404)

  # -- OPTIONS (CORS) ------------------------------------------------------

  def do_OPTIONS(self):
    self.send_response(204)
    self.send_header("Access-Control-Allow-Origin", "*")
    self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Content-Type")
    self.end_headers()

  def log_message(self, format, *args):
    pass  # Suppress noisy request logging


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

class ReusableTCPServer(socketserver.TCPServer):
  """TCPServer that releases the port immediately on restart."""
  allow_reuse_address = True


def main():
  global CONFIG, DEFAULTS, GAMES

  if not HAS_YAML:
    print("Error: PyYAML is required.")
    print("Install with: pip install pyyaml")
    sys.exit(1)

  CONFIG = load_env()
  DEFAULTS = load_defaults()
  GAMES = load_games()

  port = int(CONFIG.get("PORT", 18294))
  print(f"Board Game Catalog")
  print(f"  Games loaded: {len(GAMES)}")
  print(f"  Theme: {CONFIG.get('THEME', 'dark-blue-teal')}")

  with ReusableTCPServer(("", port), CatalogHandler) as httpd:
    url = f"http://localhost:{port}"
    print(f"  Serving at: {url}")
    print(f"  Press Ctrl+C to stop\n")
    webbrowser.open(url)
    try:
      httpd.serve_forever()
    except KeyboardInterrupt:
      print("\nServer stopped.")


if __name__ == "__main__":
  main()
