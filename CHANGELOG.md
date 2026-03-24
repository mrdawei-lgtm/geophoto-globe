# Changelog

All notable changes to `GeoPhoto Globe` are recorded here.

## 0.1.8 - 2026-03-24

### Added

- Added shared-location Chinese narrative support with persisted `description_source` tracking for `none`, `auto`, and `manual`
- Added a pluggable OpenAI-compatible location narrative service plus `NARRATIVE_API_BASE_URL`, `NARRATIVE_API_KEY`, and `NARRATIVE_MODEL` configuration
- Added a `narrative:backfill` script to normalize or generate shared intros for existing GPS-tagged coordinate groups

### Changed

- Changed photo import so images with GPS now immediately reuse or generate a shared Chinese intro for their exact coordinate group
- Changed single-photo GPS edits and batch GPS writes so moving photos to a coordinate group now resolves the shared intro for that destination instead of carrying the old description across
- Changed admin photo detail editing so manual description edits on GPS-tagged photos synchronize to all photos at the same exact coordinates
- Changed admin photo update requests to patch only dirty fields, allowing GPS changes and manual description edits to follow separate backend semantics safely
- Changed backend config loading so local `.env` values are read automatically by the server and narrative backfill scripts

## 0.1.7 - 2026-03-24

### Added

- Added persisted English geo summary fields in SQLite for country, region, locality, formatted summary, and last resolution time
- Added a rate-limited backend geo summary service that reverse geocodes GPS coordinates in English and caches the result at write time
- Added a `geo:backfill` script to refresh English geo summaries for existing GPS-tagged photos

### Changed

- Changed public geo summary generation so the lightbox first line now reads from cached database values instead of doing per-request reverse geocoding
- Changed English geo summary formatting toward `city, province, country`, with municipality-specific fallback such as `Beijing, China`
- Changed public lightbox layout to keep the image area dominant, move text beneath the image, and replace the fit/fill text control with a circular line-icon button
- Changed public lightbox navigation to show only `current / total` paging text while keeping previous/next controls anchored in the image area
- Changed public globe thumbnail/cluster switching distance from `4.7` to `4.0`
- Changed public globe behavior so opening the lightbox pauses globe motion at the current rotation and zoom, then resumes auto-rotation after close
- Changed public thumbnail mode to return all deduplicated GPS points instead of truncating to a small global cap
- Changed admin photo list ordering so photos with identical exact GPS coordinates stay grouped together instead of being split apart by unrelated items

### Improved

- Improved geo summary robustness by filtering out postcode-like segments, preferring English display-name fallbacks, and avoiding non-English output in the generated first-line summary
- Improved lightbox image controls with a fixed image viewport, more stable fit/fill behavior, and centered fit-mode alignment

### Fixed

- Fixed public geo summary fallback so missing English summaries now show `Location unavailable` instead of silently falling back to `locationLabel`
- Fixed municipality and postcode-related geo summary issues that previously produced results such as district names plus postal codes instead of cleaner city/country output

## 0.1.6 - 2026-03-22

### Added

- Added an `MIT` license file for the project

### Changed

- Changed `README.md` into a bilingual Chinese/English format with refreshed setup, development, and deployment guidance
- Changed repository ignore rules so local runtime files and the project-local Node runtime are no longer tracked in git

## 0.1.5 - 2026-03-22

### Changed

- Changed the admin list toolbar so the `GPS`, `visibility`, and `states` filters now sit in the same search control group as the keyword search

### Fixed

- Fixed the admin batch uploader so starting a new batch after a previous batch no longer misassigns import job items to the wrong queued files
- Fixed upload panel reset behavior so selecting files for a fresh batch clears the previous batch job state more predictably when no queued items remain

## 0.1.4 - 2026-03-21

### Added

- Added permanent purge support for soft-deleted photos through a new admin batch endpoint

### Changed

- Changed admin photo management so deleted items can now be permanently removed from both SQLite and local storage files
- Changed the admin list toolbar to include a destructive `Purge` action with confirmation before execution

### Improved

- Improved cleanup behavior by tolerating already-missing files during permanent purge while continuing to remove remaining assets and records

## 0.1.3 - 2026-03-21

### Added

- Added SQLite-backed backend bootstrap with a local `db:bootstrap` command
- Added backend `db`, `repositories`, `services`, and `routes` layers to separate routing from storage and business logic
- Added SQLite-backed import job and import job item persistence for upload tracking
- Added new admin import job endpoints for creating a batch job, uploading one file at a time, and querying job status
- Added a proper batch upload panel in the admin CMS with selected file review, per-file status rows, overall batch progress, and final summary
- Added frontend queued upload execution with concurrency `2`

### Changed

- Changed photo metadata storage from direct JSON access in routes to SQLite as the primary source of truth
- Changed admin multi-photo import from one fragile all-files request to a job-based one-file-per-request sequence
- Changed import processing so progress, successes, failures, and per-file errors are recorded formally in the backend
- Changed import handling to keep processing remaining files even when one file fails
- Changed backend startup to recover interrupted import items by marking in-flight files as failed after restart
- Changed README to document SQLite initialization, legacy JSON import, import job lifecycle, and the new upload flow

### Improved

- Improved backend reuse by extracting photo repository and photo service layers suitable for future shared admin backends
- Improved upload reliability with per-request file size limits, image-type filtering, and clearer upload error responses
- Improved import debuggability by isolating file failures, keeping counters in sync from persisted job items, and cleaning temporary upload files
- Improved partial-failure tolerance so one failed file no longer aborts the whole batch

### Fixed

- Fixed import opacity by exposing stable batch/job state instead of only a best-effort bulk import response
- Fixed a previous gap where import progress and error details were not persisted in a structured way
- Fixed duplicate-start risk in the admin uploader by disabling repeated batch starts while a queue is active

## 0.1.2 - 2026-03-21

### Added

- Added a temporary public globe debug panel showing zoom factor, camera distance, earth pixel diameter, and viewport size
- Added live globe metric reporting from the Three.js scene back to the public page for debugging
- Added a project roadmap document in `roadmap.md` for the planned WeChat mini-program admin flow

### Changed

- Changed public thumbnail rendering so photos with exactly identical GPS coordinates now collapse to a single representative thumbnail on the globe
- Changed the public globe thumbnail/cluster switch distance from `3.2` to `4.7`
- Changed the initial public globe camera distance to `4.7`
- Changed the maximum public globe camera distance from `5.4` to `9`
- Changed public globe zoom interaction to a softer damped feel by increasing camera damping and reducing zoom speed
- Changed public fog tuning to `near = 6.5` and `far = 11` so the globe keeps visible texture at farther zoom levels

## 0.1.1 - 2026-03-19

### Added

- Added grouped public lightbox navigation for same-coordinate photos with previous/next controls and direct page dots
- Added screen-space thumbnail spreading to reduce overlap between nearby photo markers
- Added thin connector lines from exact globe anchor points to displaced public thumbnails
- Added country border lines to the globe texture for clearer map reading
- Added a local `verify` workflow and project-local Node launcher for easier environment validation

### Changed

- Changed cluster count labels so they stay bound to the globe and always face the viewer
- Changed globe thumbnail mode to appear earlier during zoom-in
- Changed globe thumbnail cards to render smaller on the sphere
- Changed camera behavior to allow deeper zoom and wider polar tilt
- Changed globe auto-rotation speed to scale linearly with zoom and slow down much more at maximum zoom-in
- Changed the public globe styling toward a lighter `Observable`-inspired map look with softer oceans, lighter land, finer coastlines, and clearer globe edge lighting
- Changed globe texture generation from fitted land projection to canonical equirectangular projection so geographic points align with the rendered map
- Changed public thumbnails from globe-attached 3D cards to a managed screen-space overlay layer
- Changed the homepage info panel into a right-aligned top-bar control with a collapsible translucent panel

### Improved

- Improved local compatibility by normalizing legacy absolute image paths in stored metadata
- Improved globe marker readability by placing count text in front of orange markers and reducing city label outline weight
- Improved public viewing flow with smoother focus rotation toward the selected photo location
- Improved front/back hemisphere visibility handling for public thumbnails
- Improved globe rendering balance by using lighter-weight world outline data while preserving visible coastlines and borders

### Fixed

- Fixed grouped photo browsing so same-location images can be paged within the public lightbox
- Fixed map/marker misalignment caused by texture projection fitting instead of strict equirectangular mapping
- Fixed public thumbnail scaling so thumbnails no longer grow proportionally with globe zoom
- Fixed right-side info panel behavior so collapsed state no longer shows a persistent background window

## 0.1.0 - 2026-03-18

### Added

- Initialized a full-stack project using `React`, `Vite`, `React Router`, `Express`, and `Three.js`
- Added a public 3D globe browsing experience
- Added an admin CMS with login, image list, and image detail editing
- Added photo import flow with EXIF parsing
- Added generated thumbnail and display image pipeline
- Added local JSON-based metadata storage
- Added EXIF GPS write-back for managed image copies
- Added address-to-coordinate lookup using `Nominatim`
- Added batch operations:
  - visibility toggle
  - soft delete
  - restore
  - GPS assignment
- Added lightbox viewer for public photo browsing
- Added mobile vs desktop interaction strategy
- Added initial project documentation in `README.md`
- Added task tracking in `TASKS.md`
- Added sample import images for:
  - Beijing
  - Tokyo
  - New York
  - Paris
  - Rome

### Changed

- Changed the homepage layout from split-screen text + globe to full-screen globe
- Changed the left-side large text area into a compact floating glass panel
- Reduced the site title size in the top bar
- Removed the public `CMS` link from the homepage header
- Changed photo thumbnails to always face the viewer
- Changed photo markers and cluster markers to rotate together with the globe
- Changed globe auto-rotation so it spins around the north-south axis
- Changed camera interaction so horizontal rotation stays available while polar tilt is limited
- Changed the globe styling to a blue-gray ocean and lighter blue-gray land palette

### Improved

- Improved globe continent rendering from rough placeholder blobs to more detailed outlines
- Improved globe rendering again by switching from hand-drawn continent shapes to real world land outline data via `world-atlas`
- Improved zoom behavior with city labels appearing at closer zoom levels
- Improved local demo quality by importing geographically placed test images
- Improved EXIF GPS write behavior to avoid incorrect longitude direction handling
- Improved CMS batch GPS flow by replacing prompt input with a dedicated modal form
- Improved CMS photo management with built-in filters for missing GPS, hidden items, and deleted items

### Fixed

- Fixed incorrect EXIF longitude handling for western hemisphere coordinates such as New York
- Fixed sample photo metadata so imported demo photos have correct labels and coordinates
- Fixed homepage layout so the globe fills the viewport in both width and height
- Fixed photo markers so they no longer rotate visually away from the viewer

### Known Limitations

- The globe still uses simplified runtime-generated styling rather than a high-quality raster earth texture
- Terrain height is still approximate and not based on real DEM data
- The frontend bundle is currently large and should be code-split in a later iteration
