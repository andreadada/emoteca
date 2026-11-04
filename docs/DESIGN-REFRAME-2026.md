# Emoteca / Reframe 01 — design system and UX contract

**Status:** implementation brief for branch `feat/cinematheque-ux-redesign` (November 2026). Not a claim that the deployed site was visually verified.

## What was wrong

The previous version looked like a template: giant variable serif headlines, hard-to-read 10–11px labels, black-on-black panels with gold borders, too many navigation items and 35+ theme chips occupying multiple rows before a person saw films. Repeated labels ("library" even after lists launched), competing add buttons and a giant detail header slowed the useful jobs. Movie art was visually valuable but had to compete with chrome.

## Reference products — transferable patterns, not clones

- Letterboxd: watched/liked/watchlist actions near the poster and simple, comprehensible film diary.
- MUBI: imagery is the product; confident grids and restrained editorial prose.
- Trakt: distinct states for future viewing, viewed media and collections.
- The Criterion Collection: the feeling of a curated cinema programme rather than a catalog admin panel.
- External open-source guidance inspected: Leonxlnx/taste-skill (app screen rules, art direction and screenshot critique); pbakaus/impeccable (distill, typeset, accessible responsive audit); emilkowalski/skills animate (motion only for feedback, interruption, orientation, reduced-motion).

## User jobs & one dominant action per screen

| Screen | Question answered first | Primary action | Secondary |
| --- | --- | --- | --- |
| Discover | What should I watch next? | Open an unseen recommendation | Browse all films / view watchlist |
| Global catalog | Can I find this exact film? | Search by original or localized title | Movie/TV/Anime filter and optional genres |
| My lists | Which films did I save together? | Switch/create a list | Filter it or remove membership |
| Watched / To Watch / Favorites | What is my current viewing status? | Open an entry | Switch status on detail |
| Film detail | What is it, and what do I want to do with it? | Mark watched or add to a list | Rating, private note, streaming search |

## Identity

**Art direction:** A personal film archive with the calm confidence of a printed cinema programme. Movie posters carry all the chroma. The app itself is light warm paper with deep evergreen text and one vermilion accent for important actions. Flat paper surfaces, crisp separation, quiet labels. Typography combines the legible Public Sans UI face with restrained editorial Newsreader for a few film titles. No full-screen cover art, giant empty black regions, fake hero stats, ornament icons in colored boxes, glassmorphism or infinite scroll surprises.

**Layout:** max content 1400px; large functional search field; 5 poster columns at full desktop, 3 on tablet, 2 on phone; film cards show actual name and year with ample tap target; hero movie poster never exceeds a constrained width; detail page prioritizes title/description/action rather than a giant title block.

**Navigation:** names are verbs/objects, not marketing copy: Scopri, Catalogo, Le mie liste, Da guardare, Visti, Preferiti. The remaining utilities are visibly secondary. All views and old URL routes continue to work.

**Filters:** selected state visible by shape/border and aria-pressed. There may be dozens of local custom themes: show them in ONE horizontally scrolling row, not four lines blocking the film grid. Preserve multi-select and the clear-X for all filters. Search stays above filters on catalog page.

**Motion budget:** on initial Discover reveal only a small content fade/translate; poster pointer hover increases clarity, not scale theatrics. Modal opening is short. Tab switches and keyboard controls are immediate. Motion uses transform/opacity only and honors prefers-reduced-motion; hover only under fine pointer media queries. No GSAP/Framer dependency: interaction requirements do not warrant that cost.

**User trust:** no change to TMDB API semantics; no change to IndexedDB schemas, initial records, votes, notes, list IDs, or backups. Search should never pretend to know all films, or claim an unavailable poster exists.

## Production integration and data-safety hotfix

On 4 November 2026 the user reported that the production domain still showed the old dark design and warned that personal lists were unreadable, despite displaying 35 existing films. The redesign had not merged into `main`, so unchanged production styling was expected. Production CSS must be present in `Dockerfile` and respond 200 after Coolify deployment. Do not blame browser caching until this is checked.

A pre-existing validation mismatch could cause the list warning: film IDs accept 90 chars; membership validation accepted only 64. It now uses dedicated patterns. If a list still cannot be validated, the UI reports the underlying error and enters a safe, read-only mode for memberships. Film-diary saves must not rewrite invalid raw memberships. Exported backups carry stored raw list data when readable, not an in-memory synthetic default list. A regression test checks both long film IDs and invalid persisted list preservation.

## Acceptance tests

1. Original seed film list survives reload, independent of visual redesign.
2. Desktop at 1440×900: primary navigation, search, first real film artwork visible without an entire screen of genre tags.
3. Mobile at 390×844: no horizontal viewport overflow; both search fields, navigation, lists and film detail actions remain reachable.
4. Poster cards constrained to a 2:3 slot, with graceful fallbacks and no cover injected into a CTA.
5. Core flows: global search, selection of anime/genres, open remote detail, save to custom list, rate viewed film, export backup.
6. Clear focus state, true buttons/labels, status feedback and reduced-motion rules.
7. Do not merge unless smoke/API/Chromium checks pass; production deploy is a separate step.
