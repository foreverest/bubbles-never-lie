import { navigateTo, showToast } from '@devvit/web/client';
import { useEffect, useId, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export const FEEDBACK_GITHUB_ISSUES_URL =
  'https://github.com/foreverest/bubbles-never-lie/issues';
export const FEEDBACK_EMAIL_ADDRESS = 'bubbles-never-lie@dima.codes';
export const FEEDBACK_REDDIT_DM_URL =
  'https://www.reddit.com/message/compose/?to=d10o';

type FeedbackDialogProps = {
  onClose: () => void;
};

type FeedbackAction = {
  label: string;
  primary: boolean;
} & (
  | {
      kind: 'navigate';
      url: string;
    }
  | {
      kind: 'copy-email';
    }
);

const FEEDBACK_ACTIONS: readonly FeedbackAction[] = [
  {
    label: 'Create GitHub issue',
    kind: 'navigate',
    url: FEEDBACK_GITHUB_ISSUES_URL,
    primary: true,
  },
  { label: 'Copy email', kind: 'copy-email', primary: false },
  {
    label: 'DM u/d10o',
    kind: 'navigate',
    url: FEEDBACK_REDDIT_DM_URL,
    primary: false,
  },
];

export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement;

    dialogRef.current?.focus();

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);

      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [onClose]);

  const handleBackdropPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleFeedbackAction = async (action: FeedbackAction) => {
    if (action.kind === 'copy-email') {
      try {
        await navigator.clipboard.writeText(FEEDBACK_EMAIL_ADDRESS);
        showToast('Email address copied');
      } catch {
        showToast(FEEDBACK_EMAIL_ADDRESS);
      }

      return;
    }

    navigateTo(action.url);
    onClose();
  };

  return (
    <div
      className="feedback-dialog__backdrop"
      onPointerDown={handleBackdropPointerDown}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="feedback-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="feedback-dialog__header">
          <div>
            <p className="eyebrow" id={titleId}>
              Feedback
            </p>
          </div>
          <button
            aria-label="Close feedback"
            className="feedback-dialog__close"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <p className="feedback-dialog__copy" id={descriptionId}>
          Found a bug or have an idea?
        </p>

        <div className="feedback-dialog__actions">
          {FEEDBACK_ACTIONS.map((action) => (
            <button
              className={
                action.primary
                  ? 'feedback-dialog__action feedback-dialog__action--primary'
                  : 'feedback-dialog__action'
              }
              key={action.label}
              onClick={() => void handleFeedbackAction(action)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
