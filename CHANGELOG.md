# Changelog

All notable changes to `GeoPhoto Globe` are recorded here.

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
