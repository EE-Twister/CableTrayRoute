# Project settings and browser storage

Project imports and shared project links restore project data and ordinary custom settings. They cannot replace application state such as saved-project collections, authentication, collaboration opt-in, or another scenario's storage entries.

Settings names beginning with `CTR_` or `ctr`, containing `:`, or belonging to application authentication, tour, token, or JavaScript prototype fields are reserved. Reserved entries are excluded when importing or loading a project and are omitted from scenario exports. Existing project documents with such entries can still load; ordinary settings and schedule data remain available. This also applies when history or another browser tab restores a project.

The existing project APIs still support collection aliases such as `cableSchedule`, `cableTypicals`, and `ctrSession`. Inside a document, use the authoritative top-level collections and `settings.session` instead of putting these aliases in `settings`. Application-only preferences must use the application storage APIs. Custom ordinary settings continue to support persistence, scenario isolation, session-only values, and undo/redo.

## Failed save rollback

Atomic project workflows capture tracked settings in addition to the main
project and scenario records. This includes the unprefixed legacy settings
mirrors used by existing pages. Rollback restores each local/session backend's
original bytes independently and removes newly introduced settings.

After a transient rejected save, storage health returns to its captured state
only when every required write or removal verifies successfully; the user can
retry without reloading. If any backend cannot be restored, the transaction
returns failure and keeps further persistence blocked. Design Synthesis reports
an incomplete rollback instead of claiming that all saved values were restored.
This does not change the project schema, storage quota or undo-history limits.
