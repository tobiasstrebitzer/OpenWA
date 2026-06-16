import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from './Toast';

interface CopyableUrlProps {
  url: string;
}

/** A read-only URL shown in a code box with a copy-to-clipboard button. */
export function CopyableUrl({ url }: CopyableUrlProps) {
  const { t } = useTranslation();
  const toast = useToast();

  return (
    <div className="plugin-url-row">
      <code className="plugin-url" title={url}>
        {url}
      </code>
      <button
        className="btn-action"
        title={t('plugins.copyUrl')}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          toast.success(t('plugins.copied'), url);
        }}
      >
        <Copy size={14} />
      </button>
    </div>
  );
}
