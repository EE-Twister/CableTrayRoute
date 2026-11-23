import { openModal, showAlertModal } from '../components/modal.js';
import { MOTOR_DESIGN_CURRENT_REFERENCE_URL, prepareMotorDesignCurrentReference } from '../../analysis/motorDesignCurrentReference.mjs';

export async function openMotorDesignCurrentPicker({ readSelectedIds, readRows, commitRows }) {
  const selectedIds = readSelectedIds();
  if (!selectedIds.length) {
    await showAlertModal('No Rows Selected', 'Select the motor equipment rows to review.');
    return;
  }
  const preview = prepareMotorDesignCurrentReference(readRows(), selectedIds);
  const result = await openModal({
    title: 'Review Motor Design Current',
    description: 'Review these preliminary design-current values before applying them.',
    primaryText: 'Apply Reviewed Currents',
    secondaryText: 'Cancel',
    render(body) {
      const note = document.createElement('p');
      note.textContent = 'For the supported 10 and 40 hp motors, the proposed current is the larger of the 2017 historical table value and the entered nameplate current. This screening rule does not establish code compliance or account for every special motor or installation. Confirm the applicable edition and suitability with a qualified engineer.';
      const link = document.createElement('a');
      link.href = MOTOR_DESIGN_CURRENT_REFERENCE_URL;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Review the historical 2017 motor table';
      const list = document.createElement('ul');
      for (const item of preview.preview) {
        const line = document.createElement('li');
        line.textContent = `${item.tag}: ${item.hp} hp, nameplate ${item.nameplateA} A, table ${item.tableA} A, proposed ${item.selectedA} A.`;
        list.appendChild(line);
      }
      const issues = document.createElement('p');
      issues.setAttribute('role', 'alert');
      issues.dataset.motorCurrentIssues = '';
      issues.textContent = preview.issues.join(' ');
      body.append(note, link, list, issues);
    },
    onSubmit(controller) {
      const current = prepareMotorDesignCurrentReference(readRows(), selectedIds);
      const message = controller.body.querySelector('[data-motor-current-issues]');
      if (!current.ok || JSON.stringify(current.preview) !== JSON.stringify(preview.preview)) {
        message.textContent = current.issues.join(' ') || 'Equipment changed since review. Close and review the current values again.';
        return false;
      }
      return current.rows;
    }
  });
  if (result) commitRows(result);
}
