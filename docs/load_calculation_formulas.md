# Load Calculation Formulas

This project evaluates balanced, steady-state electrical load using RMS voltage
and current. Unless otherwise stated, three-phase voltage is line-to-line.

- **Single-phase real power**: \( P = V I \cos\phi \)
- **Three-phase real power**: \( P = \sqrt{3}\,V_{LL} I \cos\phi \)
- **Single-phase apparent power**: \( S = V I \)
- **Three-phase apparent power**: \( S = \sqrt{3}\,V_{LL} I \)
- **Reactive power**: \( Q = S\sin\phi \), equivalently \(Q = P\tan\phi\)
- **Demand load**: \( P_{\text{demand}} = \sum_i P_i f_{\text{demand},i} \)

Here \(\cos\phi\) is power factor. Voltages are in volts, current in amperes,
real power in watts, reactive power in vars, and apparent power in volt-amperes.
For motor or other mechanical-output loads, electrical input power also includes
efficiency: \(P_{in}=P_{out}/\eta\).
