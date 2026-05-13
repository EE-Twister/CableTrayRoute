# MCC Lineups

The MCC Lineups tool (`mcclineup.html`) builds motor control center lineup layouts for early coordination and package drafting.

## What it supports

- Multiple named MCC lineups per project.
- Section-by-section elevation rendering with configurable section width, depth, height, horizontal/vertical bus ratings, usable bucket height, vertical wireway width, top/bottom horizontal wireway height, and bucket position letters such as `A-C`.
- Bucket sizing in both MCC units and inches. The default is 1 unit = 6 inches.
- Newly added sections are prepopulated with 12-inch space buckets across the available bucket stack.
- Profile defaults can be applied to the active lineup for common low-voltage, heavy-duty, and compact MCC sizing/specification assumptions.
- Bucket metadata for type, main device selection, status, equipment tag, equipment description, horsepower, breaker rating, starter size, cable tag, and notes.
- Bucket rows can be reordered by dragging the row handle onto another bucket row, by clicking **Drag** and then the target row's **Place** handle, or with the Up/Down buttons.
- Buckets can also be dragged directly in the elevation view. Drop a bucket on another bucket to place it at that position, including in another section.
- Bucket nameplates use the equipment tag and equipment description; legacy load tags are migrated into the equipment tag field.
- Main buckets can be marked as MLO or Main Breaker; breaker-rated mains should include a breaker amp rating.
- Per-lineup specification requirements in an Additional Information dropdown, including bus material, bus plating from a drop-down with an Other value, SCCR, space heater requirement, communication protocol, control voltage, enclosure rating, finish, and notes.
- Bucket selection from the elevation view, with the same bucket highlighted in the one-line preview and bucket list.
- Layout validation for missing sections, section overflow, unit/inch mismatches, and active buckets without equipment tags.
- Wireway validation for top/bottom horizontal wireway stack height and vertical wireway width versus section width.
- A generated simple one-line diagram below the lineup elevation.
- SVG sheet export for the current lineup.
- PDF report export with the current lineup summary, elevation view, simple one-line, and bucket schedule.
- Optional Equipment List sync for MCC summary fields such as width, depth, height, voltage, arrangement, and lineup tag.
- Direct placement on Equipment Arrangements as a one-off MCC lineup without creating an Equipment List row first.

## Equipment List sync

Use **Sync Equipment List** after editing a lineup only when the lineup should maintain an Equipment List row. The sync matches the MCC row by `equipmentTag`, `tag`, `ref`, or `id`, then updates MCC-owned summary fields while preserving unrelated Equipment List data.

Leave **Equipment Tag** blank for a standalone one-off lineup. Standalone lineups stay in MCC Lineups storage and are skipped by Equipment List sync. If an Equipment Tag is provided and no matching row exists, the tool creates an Equipment List row for the MCC.

Specification requirements are saved with the MCC lineup. Equipment List sync includes a compact spec summary in new MCC notes while still preserving unrelated fields on existing Equipment List rows.

## Reports

Use **Export PDF Report** to create a PDF package for the active lineup. The report includes the lineup characteristics, section elevation, generated simple one-line, and a bucket schedule with bucket positions, equipment tags, equipment descriptions, sizing, breaker/main information, cables, and notes.

The **PDF Title Block** dropdown stores project name, client, drawing number, revision, prepared-by, checked-by, and report date fields with the lineup and uses them in the PDF title block.

## Equipment Arrangement preview

On `equipmentarrangements.html`, use **Source > MCC Lineup** to place a saved lineup directly on the room canvas. Select the placed MCC to show the detailed MCC elevation and simple one-line below the normal room elevation view.

Equipment List rows can still drive the same preview when a placed MCC matches a lineup by Equipment Tag or Lineup.

The preview is read-only; use **Edit MCC Lineup** on the arrangement preview to open the selected lineup back on `mcclineup.html`.
