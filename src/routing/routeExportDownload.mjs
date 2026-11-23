/**
 * Trigger a browser download for a workbook serialized by the caller's
 * SheetJS runtime. Keeping the Blob/anchor lifecycle here avoids placing UI
 * download mechanics in the routing controller.
 */
export function downloadRouteWorkbook(workbook, writeWorkbook, filename = 'route_data.xlsx') {
    const bytes = writeWorkbook(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
