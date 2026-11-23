import { openModal, showAlertModal } from '../components/modal.js';
import { applyMotorReferenceProfile, MOTOR_REFERENCE_PROFILES } from '../../analysis/motorReferenceProfiles.mjs';

/** Review and apply a manufacturer reference to explicitly selected rows. */
export async function openMotorReferencePicker({ readSelectedIds, readRows, commitRows }) {
  const selectedIds = readSelectedIds();
  if (!selectedIds.length) {
    await showAlertModal('No Rows Selected', 'Select the motor equipment rows that should use a manufacturer reference.');
    return;
  }
  const result = await openModal({
    title: 'Use Motor Reference Data',
    description: `${selectedIds.length} selected equipment row(s). Choose the exact model to consider for these loads.`,
    primaryText: 'Apply Reference Data',
    secondaryText: 'Cancel',
    render(body, controller) {
      const form = document.createElement('form');
      form.className = 'modal-form';
      const label = document.createElement('label');
      label.textContent = 'Manufacturer motor model';
      const select = document.createElement('select');
      select.name = 'profile';
      for (const profile of MOTOR_REFERENCE_PROFILES) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = `ABB Baldor ${profile.model} — ${profile.horsepower} hp, 460 V, 60 Hz`;
        select.appendChild(option);
      }
      label.appendChild(select);
      const note = document.createElement('p');
      note.className = 'modal-form-field--full';
      note.textContent = 'Nameplate and typical starting data are copied as a preliminary model choice. Typical data are not guaranteed, and this does not establish an installed motor. Design FLC and reference, rotor type, source, and installation must be supplied separately. Operating kW and power factor remain unchanged unless the full-load option is selected. Existing conflicting fields block the entire update.';
      const operatingLabel = document.createElement('label');
      const operating = document.createElement('input');
      operating.type = 'checkbox';
      operating.name = 'useTypicalFullLoad';
      operatingLabel.append(operating, document.createTextNode(' Use typical 100%-rated-load operating kW and power factor'));
      const operatingPreview = document.createElement('p');
      operatingPreview.className = 'modal-form-field--full';
      const updatePreview = () => {
        const profile = MOTOR_REFERENCE_PROFILES.find(item => item.id === select.value);
        operatingPreview.textContent = profile ? `${profile.model}: ${profile.horsepower} hp, ${(profile.fullLoad.efficiency * 100).toFixed(1)}% typical efficiency, ${(profile.fullLoad.powerFactor * 100).toFixed(0)}% typical power factor, ${(profile.horsepower * 0.7457 / profile.fullLoad.efficiency).toFixed(3)} kW input at 460 V and rated load. Continuous operation and constant input power on a 480 V circuit are screening assumptions; verify the actual load.` : '';
      };
      select.addEventListener('change', updatePreview);
      updatePreview();
      const message = document.createElement('p');
      message.className = 'modal-form-field--full';
      message.setAttribute('role', 'alert');
      message.dataset.motorReferenceIssues = '';
      form.append(label, note, operatingLabel, operatingPreview, message);
      body.appendChild(form);
      controller.registerForm(form);
      return select;
    },
    onSubmit(controller) {
      const profileId = controller.body.querySelector('[name="profile"]').value;
      const updated = applyMotorReferenceProfile(readRows(), selectedIds, profileId, { useTypicalFullLoad: controller.body.querySelector('[name="useTypicalFullLoad"]').checked });
      if (!updated.ok) {
        controller.body.querySelector('[data-motor-reference-issues]').textContent = updated.issues.join(' ');
        return false;
      }
      return updated.rows;
    }
  });
  if (result) commitRows(result);
}
