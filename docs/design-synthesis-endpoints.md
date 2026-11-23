# Endpoint conduit proposals and installation coverage

Overall review class: **Screening only**. The generator can propose dedicated
EMT conduits for the positive-length connections between corridor nodes and
equipment. This closes the gap in raceway fill coverage for field-only and
mixed tray/field routes. It does not verify a finished physical installation.

## Project criteria

```json
{
  "endpointInstallation": {
    "method": "dedicated-emt",
    "minimumTradeSize": "1/2",
    "maximumTradeSize": "4"
  }
}
```

Place this object inside `criteria`. The sample explicitly requests this
method. Each endpoint leg receives its own conduit containing one complete
MC cable. The generator selects the smallest supported trade size within the
bounds that passes the single-cable fill screen. It does not combine separate
circuits into one conduit or assume additional parallel cable sets fit.

Missing installation assumptions leave positive-length endpoint legs
unevaluated and block Apply. Unsupported methods, invalid size bounds, and
insufficient allowed conduit capacity produce specific issues. A co-located
circuit with zero physical length needs no endpoint conduit. Existing
permitted-corridor and endpoint-distance constraints still apply.

## Public engineering evidence

Southwire's [SPEC45301](https://cabletechsupport.southwire.com/en/tile/1/spec/45301/?country=US)
identifies conduit use for the selected three-conductor copper MC construction.
Its overall cable diameter includes the jacket and armor. The fill calculation
uses that overall diameter, not bare conductor diameter or the sum of three
phase-conductor areas.

The [Wheatland EMT and Conduit brochure](https://www.wheatland.com/wp-content/uploads/2018/03/EMT-and-Conduit-Brochure.pdf),
WEL-041825, PDF page 4, lists EMT dimensions. Those nominal inside diameters
corroborate the application's existing rounded EMT internal-area table. For
example, 1¼-inch EMT has a stated 1.380-inch inside diameter, corresponding to
approximately 1.496 square inches. The brochure identifies its inside-diameter
figures as informational, so this screen is not a manufacturing-tolerance check.

[Service Wire's conduit-fill guidance](https://www.servicewire.com/ServiceWire/Resources/Customer-QA/Conduit-Fill.htm)
explains that a multiconductor assembly counts as one cable, using its overall
diameter, with a 53% single-cable limit. The application reuses its shared
conduit-fill calculation rather than introducing another fill formula. These
manufacturer references were inspected September 18, 2026; they do not replace
review against the project's adopted code and actual installation.

## Independent arithmetic

Cable area is `pi * OD² / 4`. Fill percentage is `100 * cable area / conduit
internal area`. The independent acceptance cases check both the selected trade
size and failure of the immediately smaller size:

| MC cable OD, inches | Selected EMT trade size | Internal area, square inches |
| --- | --- | --- |
| 0.833 (#8 AWG) | 1¼ | 1.496 |
| 1.012 (#4 AWG) | 1½ | 2.036 |
| 2.665 (600 kcmil) | 3½ | 11.545 |
| 2.942 (750 kcmil) | 4 | 14.753 |

Trade sizes must be ordered by physical size; JavaScript object-key order
places integer keys before fractional names and is unsuitable for selection.

## Outputs and boundaries

Proposals include endpoint conduits, cable assignments, and installation
coverage for each route. Tray segments retain their tray capacity checks;
endpoint segments carry their conduit fill evidence. Missing coverage cannot
be represented by an overall raceway pass. The workspace and text report
include endpoint conduit screening, and Apply retains generated conduits
through canonical project storage, undo/redo, and regeneration ownership.

The conduit axes follow the permitted straight endpoint connections. Supports,
offsets, bends, pull boxes, pulling tension, terminations, physical clearances,
and hazardous-location suitability remain unevaluated. EMT proposals must not
be interpreted as flexible connections for vibrating equipment. No engineering
approval or construction-ready status is created.

Independent Node acceptance checks cover the four arithmetic cases above,
all 28 positive endpoint legs in the 30-load sample, mixed and field-only
routes, a design requiring conduits but no trays, and co-located equipment.
They also cover missing assumptions, undersized bounds, blocked routes,
manual conduit edits, tray/conduit identity conflicts, undo/redo, regeneration,
saved-project import, and the 50-load storage budget. Final run results are
recorded in the [acceptance contract](design-synthesis-acceptance.md).
