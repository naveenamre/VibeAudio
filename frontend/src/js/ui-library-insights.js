export function renderLibraryInsightsPanel({
    currentSearchQuery,
    currentCategory,
    allBooks,
    visibleBooks,
    userHistory,
    isBookFinishedProgress
}) {
    const subtitle = document.getElementById('library-subtitle');
    const insights = document.getElementById('library-insights');

    if (subtitle) {
        if (String(currentSearchQuery || '').trim()) {
            subtitle.textContent = `${visibleBooks.length} matching stories for "${String(currentSearchQuery).trim()}"`;
        } else if (currentCategory !== 'All') {
            subtitle.textContent = `${visibleBooks.length} stories inside ${currentCategory}`;
        } else {
            subtitle.textContent = `${allBooks.length} stories arranged for stronger discovery and faster returns.`;
        }
    }

    if (!insights) return;

    const totalCategories = new Set(
        allBooks.flatMap((book) => [book.genre, ...(Array.isArray(book.moods) ? book.moods : [])]).filter(Boolean)
    ).size;
    const activeResumes = userHistory.filter((entry) => !isBookFinishedProgress(entry)).length;

    insights.innerHTML = `
        <article class="insight-card">
            <strong>${visibleBooks.length}</strong>
            <span>Stories in view</span>
        </article>
        <article class="insight-card">
            <strong>${activeResumes}</strong>
            <span>Ready to resume</span>
        </article>
        <article class="insight-card">
            <strong>${totalCategories}</strong>
            <span>Moods and genres</span>
        </article>
    `;
}
