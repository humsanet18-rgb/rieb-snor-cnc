import { useT } from '../../app/i18n';
import { Modal } from '../../components/modal';
import { closeModal } from '../../stores/ui-store';
import { ExportPanel } from './ExportPanel';

/** Output name, the safety confirmation and every download, in one place. */
export function ExportModal() {
  const { t } = useT();
  return (
    <Modal size="center" wide title={t('nav.section.export')} subtitle={t('sec.export.sub')} icon="download" testId="export-modal" onClose={closeModal}>
      <div className="export-body"><ExportPanel /></div>
    </Modal>
  );
}
