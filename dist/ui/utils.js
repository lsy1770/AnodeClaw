/**
 * UI Utilities
 *
 * Helper functions for UI operations
 */
/**
 * Escape XML special characters
 */
export function escapeXml(str) {
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
export function formatTimestamp(timestamp) {
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
export function generateViewId() {
    return `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Get emoji icon for media type
 */
function getMediaIcon(type) {
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
export function createMediaCard(attachment) {
    const icon = getMediaIcon(attachment.type);
    const displayName = escapeXml(attachment.filename || attachment.localPath.split('/').pop() || 'file');
    const displayPath = escapeXml(attachment.localPath);
    return `
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:background="#E8EAF6"
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
                android:textColor="#1A237E"
                android:textStyle="bold"
                android:maxLines="1"
                android:ellipsize="middle"/>

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="${displayPath}"
                android:textSize="11sp"
                android:textColor="#5C6BC0"
                android:maxLines="1"
                android:ellipsize="middle"/>
        </LinearLayout>
    </LinearLayout>`;
}
/**
 * Create message bubble XML
 */
export function createMessageBubble(message, messageId, attachments) {
    const isUser = message.role === 'user';
    const backgroundColor = isUser ? '#E3F2FD' : '#F5F5F5';
    const alignment = isUser ? 'end' : 'start';
    const textColor = '#000000';
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
export function createThinkingIndicator(indicatorId) {
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
        android:textColor="#666666"
        android:padding="12dp"
        android:background="#F5F5F5"
        android:layout_gravity="start"/>
</LinearLayout>`;
}
/**
 * Create session list item XML
 */
export function createSessionListItem(session) {
    const timeStr = formatTimestamp(session.lastUpdated);
    const preview = session.lastMessage ? escapeXml(session.lastMessage.substring(0, 50)) : '暂无消息';
    return `
<LinearLayout
    android:id="@+id/session_${session.sessionId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:padding="16dp"
    android:background="?attr/selectableItemBackground"
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
            android:textColor="#000000"
            android:textStyle="bold"/>

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${timeStr}"
            android:textSize="12sp"
            android:textColor="#666666"/>
    </LinearLayout>

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="${preview}"
        android:textSize="14sp"
        android:textColor="#666666"
        android:layout_marginTop="4dp"
        android:maxLines="2"
        android:ellipsize="end"/>
</LinearLayout>`;
}
