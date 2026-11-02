import { useEffect } from 'react';
import type { Problem } from '../components/modal';
import { beginTransaction, commitTransaction, rollbackTransaction, transactionDirty } from '../stores/project-store';
import { closeModal, toast } from '../stores/ui-store';
import { tr } from './i18n';

/**
 * Edits made while a settings modal is open show live on the canvas and in the previews,
 * but stay provisional: Cancel restores the project as it was, Apply keeps them as one undo step.
 */
export function useEditSession() {
  useEffect(() => {
    beginTransaction();
    // Closing by any route other than Apply leaves the project as it was.
    return () => rollbackTransaction();
  }, []);
  return { dirty: transactionDirty, discard: rollbackTransaction };
}

/** Commits the session unless an error stands in the way; warnings are shown but do not block. */
export function applySession(problems: Problem[]): boolean {
  if (problems.some(p => p.level === 'error')) return false;
  const changed = transactionDirty();
  commitTransaction();
  closeModal();
  if (changed) toast(tr('modal.applied'));
  return true;
}
