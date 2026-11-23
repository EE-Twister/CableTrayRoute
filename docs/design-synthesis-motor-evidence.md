# Manufacturer evidence for motor design

Overall review class: **Screening only**. The motor-containing equipment-to-design
journey remains incomplete. Source identification and component timing do not
establish complete protection or enable canonical Apply.

Overload-candidate diagnostics are reported against the corresponding input
equipment row. When multiple motors have the same problem, each row retains its
own diagnostic; the overall unresolved motor-protection issue still blocks the
proposal. The existing project-wide limits and protection checks are unchanged.

## Archived sources checked on October 24, 2026

These are Siemens-authored PDFs hosted by distributors. Their dates are those
printed in the retrieved documents; they are separate from the newer Siemens
web-index revisions cited in earlier research. Archive hashes identify the
retrieved bytes, not manufacturer authentication or engineering approval.

| Exact component or document | Retrieved edition and checked pages | Supported evidence |
| --- | --- | --- |
| [3RT2027-1BB40 datasheet](https://docs.rs-online.com/7bde/0900766b814bb79a.pdf) | September 21, 2024; page 4 of 8; local archived copy `output/design-synthesis-motor-protection-evidence-2026-10-24/sources/Siemens-3RT2027-1BB40-RS.pdf` | Exact contactor for the separate inverse-time branch-breaker topology: 24 V DC coil; operating factor 0.8–1.1; opening delay 15–18 ms; arcing time 10–10 ms; UL/CSA three-phase motor FLA 27 A at 480 V. These component fields do not include relay operation or the complete control path. |
| [3RT2025-1BB40 datasheet](https://docs.rs-online.com/176d/0900766b814bb77e.pdf) | September 23, 2024; page 4 of 8 | Separate manual motor-controller topology evidence only: 24 V DC coil; operating factor 0.8–1.1; opening delay 15–18 ms; arcing time 10–10 ms. Do not transfer this part number into the separate inverse-time breaker branch topology. These fields do not include relay operation or the complete control path. |
| [3RU2126-4AB0 datasheet](https://docs.rs-online.com/6cd2/0900766b814bb837.pdf) | September 24, 2024; pages 1 and 4 of 5 | Exact S0, Class 10 relay; 11–16 A range; operating ambient −40 to +70 °C and compensation −40 to +60 °C. Page 4 links to characteristics, without embedding a trip band. |
| [SIRIUS overload equipment manual](https://mm.digikey.com/Volume0/opasdata/d220001/medias/docus/6255/Thermal%20Overload%20Relay%20Manual%20Technical%20Guide.pdf) | May 2023; A5E03656507420A/RS-AE/006; pages 50–52 and 119 | Class 10 cold symmetrical three-pole test: 4 < trip time ≤ 10 s at 7.2 times setting. Figure 6-1 is schematic: its lines distinguish three-pole and two-pole loading, not tolerance boundaries. The hot-state quarter-time statement is approximate. Thermal-relay recovery depends on trip history; the electronic-relay three-minute reset statement must not be transferred to 3RU21. |

At the proposed 12.8 A relay setting, the class-test current is 92.16 A.
That single test point cannot populate the complete 80–110 A comparison interval.
Nor may the contactor fields alone be labeled maximum total circuit clearing.

The inverse-time branch-breaker topology evaluated in
`analysis/designSynthesisMotorBranchBreakers.mjs` is the separate combination
of 3VA51 breaker, **3RT2027-1BB40** contactor and 3RU2126-4A overload relay.
The application's separate manual-controller candidate uses
**3RT2025-1BB40 + 3RU2126-4AB0 + 3RV2021-4AA10**. Do not substitute that
candidate's part identity or evidence into the selected inverse-time
arrangement. Siemens' certificate contains multiple table scopes; check any
combination rating against the exact contactor, overload, branch protection,
settings, and conditions stated for that row. The exact 3RT2027 datasheet is
archived separately from the earlier 3RT2025 sheet. Its timing values do not
establish relay/control delay, total circuit clearing, combination
qualification, or installation approval.

## Data still needed

The selected motor needs mutually consistent current, torque and power-factor
data versus speed, a defined inertia basis, and hot/cold withstand conditions.
Its overload relay needs applicable minimum-trip and maximum-operation bounds,
including thermal initial state and the meaning of each curve boundary. The
contactor/control path needs applicable interruption and delay bounds. The
selected branch breaker needs its exact setting-dependent trip/clearing bands.
Assembly SCCR, fault duty and coordination remain separate checks.

The WEG 12070752 investigation also found different current values in a
2024 distributor-hosted WEG document index and the live WEG comparison page.
The original 2024 PDF was not retrieved in that investigation. Do not merge
those revisions or relabel a load-performance graph as a speed curve.

No researched values replace the synthetic acceleration or timing examples.
The [supplied-bound comparison](design-synthesis-motor-protection-timing.md)
continues to reject missing or inapplicable evidence.

A separate [TECO-Westinghouse NP0104C submittal](https://buy.tecowestinghouse.com/EcommerceFiles/submittals/SUB_NP0104C.pdf)
was also archived and inspected. Its performance page is drawing 31057NP0104,
revision 6, August 15, 2023. It supplies equivalent-Wye parameters, but does not
define enough model applicability to replace a speed curve. A conventional
single-cage T circuit at 460 V line-to-line gives 59.09 A at locked rotor and
8.24 A at 1765 rpm, versus its listed 81 A and 12.30 A. Root and Luna obtained
the same results independently. This is an unresolved model-basis discrepancy,
not proof that the motor or datasheet is defective. No curve was fitted to force
agreement and no WEG values were transferred to this separate motor.

Local source PDFs, rendered pages, SHA-256 hashes, independent source review and
research notes are retained under
`output/design-synthesis-motor-protection-evidence-2026-10-24/`.
The folder includes unsent Siemens and motor-manufacturer request drafts.
