# Changelog

All notable changes to `GeoPhoto Globe` are recorded here.

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
