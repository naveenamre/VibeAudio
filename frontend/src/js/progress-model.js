const CHAPTER_COMPLETE_RATIO = 0.98;

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function getProgressPercent(progress) {
    if (!progress) return 0;

    const currentTime = Math.max(0, toSafeNumber(progress.currentTime, 0));
    const totalDuration = Math.max(0, toSafeNumber(progress.totalDuration, 0));

    if (totalDuration <= 0) {
        return currentTime > 0 ? 1 : 0;
    }

    return Math.max(0, Math.min(100, Math.round((currentTime / totalDuration) * 100)));
}

export function getProgressTimestampValue(progress) {
    const rawValue = progress?.lastInteractionAt || progress?.updatedAt || progress?.lastUpdated || 0;
    const stamp = Date.parse(rawValue);
    return Number.isFinite(stamp) ? stamp : 0;
}

export function getProgressTimestamp(progress) {
    return progress?.lastInteractionAt || progress?.updatedAt || progress?.lastUpdated || null;
}

export function isChapterFinishedProgress(progress) {
    const currentTime = Math.max(0, toSafeNumber(progress?.currentTime, 0));
    const totalDuration = Math.max(0, toSafeNumber(progress?.totalDuration, 0));

    if (totalDuration <= 0) return false;
    return currentTime >= totalDuration * CHAPTER_COMPLETE_RATIO;
}

export function isBookFinishedProgress(progress) {
    if (!progress) return false;
    if (typeof progress.bookFinished === 'boolean') return progress.bookFinished;
    if (typeof progress.isFinished === 'boolean') return progress.isFinished;
    return false;
}

export function compareProgressFreshness(left, right) {
    const stampDiff = getProgressTimestampValue(left) - getProgressTimestampValue(right);
    if (stampDiff) return stampDiff;

    const chapterDiff = toSafeNumber(left?.chapterIndex, 0) - toSafeNumber(right?.chapterIndex, 0);
    if (chapterDiff) return chapterDiff;

    return toSafeNumber(left?.currentTime, 0) - toSafeNumber(right?.currentTime, 0);
}

export function compareProgressByRecency(left, right) {
    return compareProgressFreshness(right, left);
}

export function normalizeProgressEntry(entry, fallback = {}) {
    const source = fallback.source || entry?.source || 'unknown';
    const bookId = String(entry?.bookId ?? fallback.bookId ?? '').trim();
    if (!bookId) return null;

    const chapterIndex = Math.max(0, Math.floor(toSafeNumber(entry?.chapterIndex ?? fallback.chapterIndex, 0)));
    const currentTime = Math.max(0, toSafeNumber(entry?.currentTime ?? fallback.currentTime, 0));
    const totalDuration = Math.max(0, toSafeNumber(entry?.totalDuration ?? fallback.totalDuration, 0));
    const totalChaptersValue = toSafeNumber(entry?.totalChapters ?? fallback.totalChapters, 0);
    const totalChapters = totalChaptersValue > 0 ? Math.floor(totalChaptersValue) : undefined;
    const lastInteractionAt = String(
        entry?.lastInteractionAt
        || entry?.updatedAt
        || entry?.lastUpdated
        || fallback.lastInteractionAt
        || new Date().toISOString()
    );

    const currentChapterFinished = typeof entry?.currentChapterFinished === 'boolean'
        ? entry.currentChapterFinished
        : isChapterFinishedProgress({ currentTime, totalDuration });

    const explicitBookFinished = entry?.bookFinished ?? entry?.isFinished ?? fallback.bookFinished;
    const inferredBookFinished = Boolean(totalChapters && chapterIndex >= totalChapters - 1 && currentChapterFinished);

    return {
        ...entry,
        bookId,
        chapterIndex,
        currentTime,
        totalDuration,
        totalChapters,
        lastInteractionAt,
        currentChapterFinished,
        bookFinished: typeof explicitBookFinished === 'boolean' ? explicitBookFinished : inferredBookFinished,
        source
    };
}

export function buildProgressStorageKey(bookId, userId = '') {
    const normalizedUserId = String(userId || '').trim();
    return normalizedUserId
        ? `vibe_progress_${normalizedUserId}_${String(bookId)}`
        : `vibe_progress_${String(bookId)}`;
}
