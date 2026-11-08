import { GRID_COLUMNS, PAGE_SIZE_PX, ROW_HEIGHT_PX, type Orientation, type Page } from '@/lib/meta/layout'
import type { WidgetData } from '@/lib/meta/report-data'
import { ReportWidget } from './widgets'

/** One fixed-size A4 page with widgets placed from their grid coordinates. Same markup on screen and in print. */
export function PageCanvas({
  orientation,
  page,
  data,
}: {
  orientation: Orientation
  page: Page
  data: Record<string, WidgetData | undefined>
}) {
  const { width, height } = PAGE_SIZE_PX[orientation]
  const colWidth = width / GRID_COLUMNS

  return (
    <div className="relative bg-white text-slate-900" style={{ width, height }}>
      {page.map((widget) => (
        <div
          key={widget.id}
          className="absolute"
          style={{
            left: widget.x * colWidth,
            top: widget.y * ROW_HEIGHT_PX,
            width: widget.w * colWidth,
            height: widget.h * ROW_HEIGHT_PX,
          }}
        >
          <ReportWidget widget={widget} data={data[widget.id]} />
        </div>
      ))}
    </div>
  )
}
