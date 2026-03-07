export const MESSAGES_UNREAD_CHANGED_EVENT = "ff:messages-unread-changed";
export const NOTIFICATIONS_UNREAD_CHANGED_EVENT = "ff:notifications-unread-changed";

export function emitMessagesUnreadChanged(count: number): void {
  window.dispatchEvent(
    new CustomEvent(MESSAGES_UNREAD_CHANGED_EVENT, {
      detail: { count: Math.max(0, Math.floor(count)) },
    }),
  );
}

export function emitNotificationsUnreadChanged(count: number): void {
  window.dispatchEvent(
    new CustomEvent(NOTIFICATIONS_UNREAD_CHANGED_EVENT, {
      detail: { count: Math.max(0, Math.floor(count)) },
    }),
  );
}

