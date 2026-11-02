import { tr, useT } from '../../app/i18n';
import { Modal } from '../../components/modal';
import { useStore } from '../../stores/store';
import { closeModal } from '../../stores/ui-store';
import { inputKey, textStore } from './text-store';
import { TextPanel } from './TextPanel';
import { TextStage } from './TextStage';

/**
 * Khmer text to foam outlines: the six steps beside a live stage that shows the shaped text,
 * then the traced curves. The typed text is kept as a draft, so closing loses nothing but accepted outlines.
 */
export function TextModal() {
  const { t } = useT();
  const busy = useStore(textStore, s => s.busy);
  // Outlines that were accepted but never added are the one thing closing would lose.
  const unsent = () => { const s = textStore.get(), key = inputKey(s); return s.acceptedKey === key && s.addedKey !== key; };
  return (
    <Modal size="workspace" title={t('nav.section.text')} subtitle={t('sec.text.sub')} icon="text" testId="text-modal"
      onClose={closeModal} busy={busy ? tr('textm.busy') : null} dirty={unsent}>
      <div className="modal-split text-split">
        <section className="modal-side" aria-label={t('text.steps')}><TextPanel /></section>
        <div className="modal-main stage-host"><TextStage /></div>
      </div>
    </Modal>
  );
}
