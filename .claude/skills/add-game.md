---
name: Add Board Game
description: Add a new board game to the catalog from a photo of the box
---

# Add Board Game from Photo

When the user provides a photo of a board game box, follow these steps:

## Step 1: Analyze the Photo

Read the photo and identify:
- **Game name** (from the box title)
- **Player count** (look for player count info on the box, e.g., "2-4 players")
- **Play time** (look for time estimate, e.g., "60 min")
- **Age range** (look for age recommendation, e.g., "10+")

## Step 2: Present Findings and Ask for Confirmation

Show the user what you identified and ask them to confirm or correct. Then ask for the subjective fields:

- **Style**: free for all, co-op, or 1 vs rest (can be multiple)
- **Type**: card, board, dice, or tiles (can be multiple)
- **Tags**: any relevant tags (e.g., strategy, family, group, kids, party)
- **Notes**: any personal notes about the game

## Step 3: Save the Photo

1. Generate a slug from the game name (lowercase, hyphens, no special chars)
2. Create the image directory: `images/{slug}/`
3. Copy/save the photo as `images/{slug}/cover.jpg` (or appropriate extension)

## Step 4: Add to Catalog

Read the current `config/games.yaml` file, append a new game entry, and write it back.

The entry format:
```yaml
- name: "Game Name"
  slug: "game-name"
  players: [2, 3, 4]
  time: "60-90 min"
  age: "10+"
  style: ["free for all"]
  type: ["board"]
  tags: ["strategy", "family"]
  notes: "User provided notes"
  links: []
  favorite: false
  date_added: "YYYY-MM-DD"
```

### Player count mapping
Convert "2-4 players" to `[2, 3, 4]`. For "6+" use `[6, 7, 8, "8+"]`.

### Time mapping
Map to the closest bracket:
- Under 30 min → "<30 min"
- 30-60 min → "30-60 min"
- 60-90 min → "60-90 min"
- 90-120 min → "90-120 min"
- 2-3 hours → "2-3 hours"
- 4+ hours → "4+ hours"

### Age mapping
Map to the closest bracket: "3+", "5+", "8+", "10+", "12+", "14+", "18+"

## Step 5: Confirm

Tell the user the game has been added and they can refresh the catalog page to see it.
