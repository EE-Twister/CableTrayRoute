import { openModal } from '../components/modal.js';
import { deriveStartingSourceBasis, prepareStartingSourceBasis, startingCaseFromFaultStudy } from '../../analysis/designSynthesisStartingSourceBasis.mjs';

export async function openStartingSourcePicker({ readSource, readFaultStudy, commitSource }) {
  const initialSource = readSource();
  const initialSignature = JSON.stringify(initialSource);
  const prior = initialSource?.motorStartingImpedanceBasis;
  const result = await openModal({
    title: 'Review starting source impedance',
    description: 'Convert one explicitly identified source-only starting case into positive-sequence phase ohms.',
    primaryText: 'Use reviewed impedance',
    secondaryText: 'Cancel',
    render(body, controller) {
      const form = document.createElement('form');
      form.className = 'modal-form';
      form.innerHTML = `<p class="modal-form-field--full">Enter the symmetrical three-phase source-only current and X/R for the same starting case at the stated source voltage. The available-fault upper bound is not automatically used as a starting case. This is a 1.0 pu source equivalent, not a complete fault-duty study.</p><label>Starting-case source fault current (kA)<input name="faultCurrentKA" type="number" min="0" step="any"></label><label>Starting-case source X/R<input name="xOverR" type="number" min="0" step="any"></label><label class="modal-form-field--full">Source-case and X/R reference<input name="reference" type="text"></label><label class="modal-form-field--full"><input name="confirm" type="checkbox"> These values describe the same source-only starting case at the stated source voltage.</label><p class="modal-form-field--full" data-source-preview></p><p class="modal-form-field--full" role="alert" data-source-issues></p>`;
      const fault = form.querySelector('[name="faultCurrentKA"]');
      const xr = form.querySelector('[name="xOverR"]');
      const reference = form.querySelector('[name="reference"]');
      let copiedReference = false;
      for (const field of [fault, xr]) field.addEventListener('input', () => {
        if (copiedReference) { reference.value = ''; copiedReference = false; }
        form.querySelector('[name="confirm"]').checked = false;
      });
      reference.addEventListener('input', () => {
        copiedReference = false;
        form.querySelector('[name="confirm"]').checked = false;
      });
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn modal-form-field--full';
      copy.textContent = 'Copy supply equivalent from fault study';
      form.insertBefore(copy, form.querySelector('[data-source-preview]'));
      const note = document.createElement('p');
      note.className = 'modal-form-field--full';
      note.textContent = 'Copying takes an independent snapshot; later fault-study edits do not update this starting case. Confirm separately that the source case applies to starting.';
      form.insertBefore(note, copy);
      copy.addEventListener('click', () => {
        let copied;
        try { copied = startingCaseFromFaultStudy(readSource(), readFaultStudy?.()); }
        catch { copied = { ok: false, issues: ['Correct the draft before copying the fault-study source.'] }; }
        form.querySelector('[data-source-issues]').textContent = copied.ok ? '' : copied.issues.join(' ');
        if (!copied.ok) return;
        fault.value = String(copied.requested.faultCurrentKA);
        xr.value = String(copied.requested.xOverR);
        reference.value = copied.requested.reference;
        copiedReference = true;
        form.querySelector('[name="confirm"]').checked = false;
        preview();
      });
      if (prior && typeof prior === 'object') {
        if (typeof prior.faultCurrentKA === 'number') fault.value = String(prior.faultCurrentKA);
        if (typeof prior.xOverR === 'number') xr.value = String(prior.xOverR);
        if (typeof prior.reference === 'string') reference.value = prior.reference;
      }
      const readValues = () => ({ faultCurrentKA: fault.value.trim() ? Number(fault.value) : null, xOverR: xr.value.trim() ? Number(xr.value) : null, reference: reference.value, confirmedSourceOnlyStartingCase: form.querySelector('[name="confirm"]').checked });
      const preview = () => {
        const derived = deriveStartingSourceBasis(initialSource, readValues());
        form.querySelector('[data-source-preview]').textContent = derived.ok ? `Review: R = ${derived.impedance.rOhm} Ω/phase; X = ${derived.impedance.xOhm} Ω/phase. The source-only upper bound remains ${initialSource.availableFaultCurrentKA} kA.` : 'Complete and confirm the starting-case inputs to preview R and X.';
      };
      form.addEventListener('input', preview);
      form.addEventListener('change', preview);
      preview();
      form.readStartingValues = readValues;
      body.appendChild(form);
      controller.registerForm(form);
      return fault;
    },
    onSubmit(controller) {
      const form = controller.body.querySelector('form');
      let current;
      try { current = readSource(); } catch { form.querySelector('[data-source-issues]').textContent = 'Correct the source draft before using this conversion.'; return false; }
      if (JSON.stringify(current) !== initialSignature) { form.querySelector('[data-source-issues]').textContent = 'The source changed during review; close and reopen this dialog.'; return false; }
      const prepared = prepareStartingSourceBasis(current, form.readStartingValues());
      if (!prepared.ok) { form.querySelector('[data-source-issues]').textContent = prepared.issues.join(' '); return false; }
      return prepared.source;
    }
  });
  if (result) commitSource(result);
}
