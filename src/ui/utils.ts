/**
 * UI Utilities
 *
 * Helper functions for UI operations
 */

/**
 * Escape XML special characters
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format timestamp to display string
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
         date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Generate unique view ID
 */
export function generateViewId(): string {
  return `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get emoji icon for media type
 */
function getMediaIcon(type: string): string {
  switch (type) {
    case 'image': return '🖼';
    case 'video': return '🎬';
    case 'audio': return '🎵';
    default: return '📎';
  }
}

/**
 * Create media card XML for an attachment
 */
export function createMediaCard(attachment: {
  type: string;
  localPath: string;
  filename?: string;
}): string {
  const icon = getMediaIcon(attachment.type);
  const displayName = escapeXml(attachment.filename || attachment.localPath.split('/').pop() || 'file');
  const displayPath = escapeXml(attachment.localPath);

  return `
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:background="#CC3E3E3E"
        android:padding="8dp"
        android:layout_marginTop="4dp"
        android:gravity="center_vertical">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${icon}"
            android:textSize="18sp"
            android:layout_marginEnd="8dp"/>

        <LinearLayout
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:orientation="vertical">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="${displayName}"
                android:textSize="13sp"
                android:textColor="#EAEAEA"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="middle"/>

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="${displayPath}"
                android:textSize="11sp"
                android:textColor="#AAAAAA"
                android:maxLines="1"
                android:ellipsize="middle"/>
        </LinearLayout>
    </LinearLayout>`;
}

/**
 * Create message bubble XML
 */
export function createMessageBubble(
  message: { role: 'user' | 'assistant'; content: string },
  messageId: string,
  attachments?: Array<{ type: string; localPath: string; filename?: string }>
): string {
  const isUser = message.role === 'user';
  const backgroundColor = isUser ? '#CC37474F' : '#CC2E2E2E';
  const alignment = isUser ? 'end' : 'start';
  const textColor = '#EAEAEA';

  let mediaCards = '';
  if (attachments && attachments.length > 0) {
    mediaCards = attachments.map(att => createMediaCard(att)).join('');
  }

  return `
<LinearLayout
    android:id="@+id/${messageId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:gravity="${alignment}"
    android:layout_marginBottom="8dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="${escapeXml(message.content)}"
        android:textSize="14sp"
        android:textColor="${textColor}"
        android:padding="12dp"
        android:background="${backgroundColor}"
        android:maxWidth="500dp"
        android:layout_gravity="${alignment}"/>${mediaCards}
</LinearLayout>`;
}

/**
 * Create thinking indicator XML
 */
export function createThinkingIndicator(indicatorId: string): string {
  return `
<LinearLayout
    android:id="@+id/${indicatorId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="start"
    android:layout_marginBottom="8dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="AI 正在思考..."
        android:textSize="14sp"
        android:textColor="#999999"
        android:padding="12dp"
        android:background="#CC2E2E2E"
        android:layout_gravity="start"/>
</LinearLayout>`;
}

/**
 * Create session list item XML
 */
export function createSessionListItem(session: {
  sessionId: string;
  title: string;
  lastMessage?: string;
  lastUpdated: number;
}): string {
  const timeStr = formatTimestamp(session.lastUpdated);
  const preview = session.lastMessage ? escapeXml(session.lastMessage.substring(0, 50)) : '暂无消息';

  return `
<LinearLayout
    android:id="@+id/session_${session.sessionId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:padding="16dp"
    android:clickable="true">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="${escapeXml(session.title)}"
            android:textSize="16sp"
            android:textColor="#EAEAEA"
            android:textStyle="bold"/>

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${timeStr}"
            android:textSize="12sp"
            android:textColor="#AAAAAA"/>
    </LinearLayout>

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="${preview}"
        android:textSize="14sp"
        android:textColor="#AAAAAA"
        android:layout_marginTop="4dp"
        android:maxLines="2"
        android:ellipsize="end"/>

    <View
        android:layout_width="match_parent"
        android:layout_height="1dp"
        android:background="#444444"
        android:layout_marginTop="16dp"/>
</LinearLayout>`;
}
