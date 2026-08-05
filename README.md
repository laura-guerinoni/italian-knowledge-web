# Italian Knowledge Web

One shared engine, one shared content file, two student pages:

- `nick/` — English explanations (Nick's page)
- `alina/` — Spanish explanations (Alina's page)

## How it works

- **`engine.js`** and **`style.css`** are the shared app. Every student's page loads the exact same copy.
- **`data/topics.json`** is the single source of truth for content. Each topic looks like:

  ```json
  "essere": {
    "icon": "⚡",
    "title": "Essere",
    "category": "core-verbs",
    "en": { "subtitle": "...", "sections": [...] },
    "es": { "subtitle": "...", "sections": [...] }
  }
  ```

  `title` is the Italian headword — shared by every student. `en` / `es` hold the
  explanation text in that language. A topic only shows up for a student if it has
  a block in *their* language.

- **`data/edges.json`** — shared graph connections between topics (by key).
- **`data/categories.json`** — shared category → color map.
- **`data/ui-strings.json`** — chrome text (header, search placeholder, hints,
  category names, flashcard labels) per language.
- **`data/students/<id>.json`** — one file per student:

  ```json
  { "lang": "en", "displayName": "Nick", "topics": ["essere", "avere", "..."] }
  ```

  `topics` is the explicit allow-list of topic keys that student can currently see.
  This is how Nick and Alina stay at different stages from the same content file —
  you control what each of them has "unlocked" by editing their `topics` array.

## Adding a new topic

1. Add the topic to `data/topics.json` with an `en` block (and `es` once you've
   translated it — no rush, it just won't show for Alina until then).
2. Add its key to `data/students/nick.json` (and/or `alina.json`) to unlock it.
3. Commit and push. Both pages pick up the change automatically — no build step.

## Adding Alina's Spanish content

Only `pronunciation`, `essere`, and `avere` have `es` blocks so far (seeded as a
starting example — worth a read-through since it's a first draft, not
teacher-reviewed). Everything else Nick has is sitting in `en` waiting for a
Spanish translation before it can be added to Alina's allow-list.
