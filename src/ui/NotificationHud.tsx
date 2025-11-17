import React from 'react';
import { createPortal } from 'react-dom';

interface NotificationHudProps {
  container?: HTMLElement | null;
  visible: boolean;
  text?: string;
  small?: boolean;
  style?: React.CSSProperties;
  description?: string;
  status?: 'loading' | 'error' | 'info';
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}

export const NotificationHud: React.FC<NotificationHudProps> = ({
  container,
  visible,
  text = 'Building…',
  small = false,
  style,
  description,
  status = 'loading',
  actionLabel,
  onAction,
  actionDisabled = false,
}) => {
  if (!visible) return null;

  const isInContainer = !!container;

  const baseStyle: React.CSSProperties = {
    position: isInContainer ? 'absolute' : 'fixed',
    right: 12,
    bottom: 12,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'rgba(28,28,30,0.9)',
    color: '#fff',
    padding: small ? '6px 8px' : '8px 10px',
    borderRadius: 8,
    boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
    fontSize: small ? 12 : 13,
    pointerEvents: 'auto',
    ...style,
  };

  const indicatorSize = small ? 12 : 14;
  const indicator = (() => {
    if (status === 'error') {
      return (
        <div
          style={{
            width: indicatorSize,
            height: indicatorSize,
            borderRadius: '50%',
            background: '#f97316',
            color: '#1b1b1f',
            fontSize: small ? 9 : 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          !
        </div>
      );
    }
    if (status === 'info') {
      return (
        <div
          style={{
            width: indicatorSize,
            height: indicatorSize,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: small ? 9 : 11,
          }}
        >
          i
        </div>
      );
    }
    return (
      <div
        style={{
          width: indicatorSize,
          height: indicatorSize,
          border: '2px solid rgba(255,255,255,0.18)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'vivlio-spin 1s linear infinite',
        }}
      />
    );
  })();

  const actionButton = actionLabel && onAction ? (
    <button
      type="button"
      onClick={onAction}
      disabled={actionDisabled}
      style={{
        marginLeft: 8,
        padding: small ? '3px 6px' : '4px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.3)',
        background: 'transparent',
        color: '#fff',
        fontSize: small ? 11 : 12,
        cursor: actionDisabled ? 'not-allowed' : 'pointer',
        opacity: actionDisabled ? 0.5 : 1,
      }}
    >
      {actionLabel}
    </button>
  ) : null;

  const hud = (
    <div style={baseStyle} data-vivlio-hud>
      {indicator}
      <div style={{ display: 'flex', flexDirection: 'column', gap: description ? 2 : 0 }}>
        <div>{text}</div>
        {description ? <div style={{ fontSize: small ? 10 : 12, opacity: 0.85 }}>{description}</div> : null}
      </div>
      {actionButton}
      <style>{`@keyframes vivlio-spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );

  if (container) return createPortal(hud, container);
  return hud;
};

export default NotificationHud;
