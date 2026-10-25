import { useI18n } from 'vue-i18n';
import { useDialog, useMessage } from 'naive-ui';
import { useAppStore } from '../stores/app';
import { formatDate } from '../i18n';

/** Deleting a single result: always confirmed; the desktop app backs up first. */
export function useResultActions() {
  const { t } = useI18n();
  const dialog = useDialog();
  const message = useMessage();
  const app = useAppStore();

  function confirmDelete(result: { id: string; createdAt: string }, onDone: () => void | Promise<void>) {
    const desktop = app.p().kind === 'desktop';
    const date = formatDate(result.createdAt, true);
    dialog.warning({
      title: t('detail.deleteResult'),
      content: desktop ? t('detail.deleteResultConfirmDesktop', { date }) : t('detail.deleteResultConfirm', { date }),
      positiveText: t('common.delete'),
      negativeText: t('common.cancel'),
      onPositiveClick: async () => {
        try {
          if (desktop) await app.p().storage.backup('before-delete-result');
          await app.r().results.remove(result.id);
          app.p().log('info', 'result deleted');
          message.success(t('common.deleted'));
          await onDone();
        } catch (err) {
          message.error(t('common.failed', { msg: err instanceof Error ? err.message : String(err) }));
        }
      },
    });
  }

  return { confirmDelete };
}
