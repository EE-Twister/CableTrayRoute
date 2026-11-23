export function getRouteGraphTheme(dark = false) {
    return {
        surface: dark ? '#0f172a' : '#f4f7fb',
        text: dark ? '#e5e7eb' : '#334155',
        grid: dark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(100, 116, 139, 0.2)',
        axis: dark ? '#64748b' : '#94a3b8',
        hover: dark ? '#0f172a' : '#ffffff',
        floor: dark ? '#1e293b' : '#dbeafe'
    };
}
