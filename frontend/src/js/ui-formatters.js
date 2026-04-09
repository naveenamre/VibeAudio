export function getTimeStamp(value) {
    const stamp = Date.parse(value || 0);
    return Number.isFinite(stamp) ? stamp : 0;
}

export function formatRelativeTime(value) {
    const stamp = getTimeStamp(value);
    if (!stamp) return 'recently';

    const deltaMs = Date.now() - stamp;
    if (deltaMs < 60 * 1000) return 'just now';

    const minutes = Math.floor(deltaMs / (60 * 1000));
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
