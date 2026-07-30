# Procurement Schedule

The Procurement Schedule converts successful Optimal Route results into
ordered-length cable line items and a project-persisted commercial register.

## Product grouping

The schedule uses a versioned canonical key rather than grouping only by cable
type and conductor size. The following Cable Schedule fields distinguish
purchasable cable products:

- cable type, conductor count, conductor size, and conductor material;
- cable voltage rating, insulation type, and insulation temperature rating;
- shielding/jacket and equipment-grounding-conductor construction; and
- manufacturer and model/catalog identity.

Common `Cu`/`Copper` and `Al`/`Aluminum` spellings normalize to the same key.
Legacy records without `conductor_material` may still use an aluminum suffix in
the size text, but the Data Coverage section flags that fallback for
confirmation. Missing material is never silently assumed to be copper.

`parallel_count` controls quantity rather than product identity. A cable with
three parallel runs produces three physical cuts of the same product
specification.

## Data coverage

Generation reports how many routed cables:

- match a Cable Schedule record;
- contain the core construction and rating fields needed for commercial
  grouping; and
- require confirmation of inferred or missing information.

Required-data issues prevent the schedule from being labelled ready for
commercial review. Missing manufacturer/model information is an advisory
warning because a specification-only RFQ may still be valid.

## Procurement register

Each active line item has saved project fields for:

- vendor, quote number, and quote date;
- need-by date and lead time;
- purchase-order number and date;
- status;
- promised and actual delivery dates;
- ordered and received footage, plus received date; and
- procurement notes.

Regenerating the schedule preserves these fields by canonical specification key.
One legacy `type::size` record can migrate to its matching canonical line.
Unmatched historical records remain saved as inactive rather than being
discarded.

The CSV export includes both engineering quantities and the commercial register
fields. As with all generated quantities, confirm available reel lengths,
minimum order quantities, shipping constraints, and maximum permissible pulling
lengths with the selected manufacturer before purchase.
