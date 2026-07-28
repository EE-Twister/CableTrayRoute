# Dissimilar Metals Compatibility Screen

The Dissimilar Metals page is a planning-level galvanic compatibility and relative-risk screen. It helps identify the likely anodic member, check representative potential separation, compare exposure assumptions, and evaluate isolation strategies before detailed corrosion engineering.

## Engineering basis

Representative material potentials follow the compatible-couple EMF groups in NASA-STD-6012A, Table 1. Those groups are intended for seawater compatibility screening and do not represent universal open-circuit potentials or measurements against a specified reference electrode.

The page applies the NASA screening criterion that a galvanic-couple potential difference should not exceed 0.25 V unless qualified testing demonstrates a couple current density of 1 µA/cm² or less without corrosion pits.

Primary references:

- [NASA-STD-6012A, Corrosion Protection for Space Flight Hardware](https://standards.nasa.gov/sites/default/files/standards/NASA/A/2022-01-11-NASA-STD-6012A-Approved.pdf)
- [MIL-STD-889D, Galvanic Compatibility of Electrically Conductive Materials](https://quicksearch.dla.mil/qsDocDetails.aspx?ident_number=36032)
- ASTM G71, Standard Guide for Conducting and Evaluating Galvanic Corrosion Tests in Electrolytes
- ASTM G82, Standard Guide for Development and Use of a Galvanic Series for Predicting Galvanic Corrosion Performance

## Calculation sequence

1. The material with the more negative representative group potential is assigned as the anodic member.
2. Materials in the same representative group are not assigned distinct anodic and cathodic roles.
3. Driving potential is calculated as:

   `E(cathodic group) - E(anodic group)`

4. The driving potential is compared with the 0.25 V compatibility screen.
5. A heuristic screening rate is calculated from potential separation, environment factors, electrolyte duty, cathode-to-anode area ratio, temperature, and isolation quality.
6. The screening interval divides the entered corrosion allowance by the full-precision heuristic rate.

Full internal precision is retained for severity, timeline, mitigation comparison, and screening-interval calculations. Rounding is applied only to displayed rate values.

## Interpretation limits

The heuristic rate and screening interval are relative planning outputs. They are not measured corrosion rates, qualified penetration rates, or replacement intervals. The model does not calculate galvanic current density, polarization behavior, Tafel slopes, electrolyte resistance, alloy equivalent weight, coating breakdown, crevice chemistry, or pitting depth.

For quantitative design, use measured or qualified galvanic current-density or weight-loss data for the actual alloys, surface conditions, area ratio, temperature, and electrolyte. Escalate incompatible couples and chloride-rich or continuously wet assemblies for corrosion-engineering review.

