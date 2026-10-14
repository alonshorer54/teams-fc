import { useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { MAX_ZOOM, MIN_ZOOM, clampCrop, cropSide, drawCrop, type Crop } from '../lib/photo';

const VIEW = 220;

/**
 * בחירת החלק של התמונה שנכנס לעיגול: מגדילים עם הסרגל (או גלגלת העכבר
 * במחשב), וגוררים כדי להזיז. לצד זה רואים את העיגול הקטן בדיוק בגודל שיופיע
 * בכרטיסי הקבוצות — כך רואים מיד אם הפנים ברורות.
 */
export function PhotoCropper({
  source,
  crop,
  onChange,
}: {
  source: HTMLCanvasElement;
  crop: Crop;
  onChange: (next: Crop) => void;
}) {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const smallRef = useRef<HTMLCanvasElement>(null);
  /** אצבע אחת בלבד גוררת: אצבע שנייה (צביטה בטלפון) הייתה מקפיצה את התמונה בין השתיים */
  const drag = useRef<{ id: number; x: number; y: number; crop: Crop } | null>(null);
  const latest = useRef({ crop, onChange });
  latest.current = { crop, onChange };

  // גלגלת דרך מאזין ידני: המאזין של React פסיבי, והעמוד היה נגלל יחד עם ההגדלה
  useEffect(() => {
    const canvas = viewRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { crop: c, onChange: change } = latest.current;
      change(clampCrop(source, { ...c, zoom: c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1) }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [source]);

  useEffect(() => {
    const ratio = window.devicePixelRatio || 1;
    for (const [canvas, size] of [
      [viewRef.current, VIEW],
      [smallRef.current, 32],
    ] as const) {
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) continue;
      // שינוי width מקצה מחדש את הקנבס — בגרירה זה קורה עשרות פעמים בשנייה
      const px = Math.round(size * ratio);
      if (canvas.width !== px) canvas.width = canvas.height = px;
      drawCrop(ctx, source, crop, canvas.width);
    }
  }, [source, crop]);

  const setZoom = (zoom: number) => onChange(clampCrop(source, { ...crop, zoom }));

  return (
    <div className="flex flex-col items-center gap-2">
      {/* overflow-hidden: ההחשכה סביב העיגול היא צל ענק, ובלי זה הוא היה מכסה את כל החלון */}
      <div className="relative overflow-hidden rounded-2xl" style={{ width: VIEW, height: VIEW }}>
        <canvas
          ref={viewRef}
          style={{ width: VIEW, height: VIEW, touchAction: 'none' }}
          className="cursor-grab rounded-2xl active:cursor-grabbing"
          onPointerDown={(e) => {
            if (drag.current) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, crop };
          }}
          onPointerMove={(e) => {
            const start = drag.current;
            if (!start || start.id !== e.pointerId) return;
            // פיקסל על המסך = כמה פיקסלים במקור, בהגדלה הנוכחית
            const k = cropSide(source, start.crop.zoom) / VIEW;
            onChange(
              clampCrop(source, {
                ...start.crop,
                cx: start.crop.cx - (e.clientX - start.x) * k,
                cy: start.crop.cy - (e.clientY - start.y) * k,
              }),
            );
          }}
          onPointerUp={(e) => {
            if (drag.current?.id === e.pointerId) drag.current = null;
          }}
          onPointerCancel={(e) => {
            if (drag.current?.id === e.pointerId) drag.current = null;
          }}
        />
        {/* מה שמחוץ לעיגול מוחשך — זה מה שייחתך */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.6)' }}
        />
        <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/70" />
      </div>

      {/* משמאל לימין בכוונה: בעברית האייקונים מתהפכים אבל הסרגל עצמו לא,
          והזכוכית "הקטנה" נחתה ליד הצד שמגדיל */}
      <div dir="ltr" className="flex w-full max-w-[260px] items-center gap-2">
        <ZoomOut size={14} className="shrink-0 text-slate-400" />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-500"
          aria-label="הגדלה"
        />
        <ZoomIn size={14} className="shrink-0 text-slate-400" />
        <canvas
          ref={smallRef}
          style={{ width: 32, height: 32 }}
          className="shrink-0 rounded-full ring-1 ring-white/20"
          title="ככה זה ייראה בכרטיס הקבוצה"
        />
      </div>
      {/* בלי הגדלה כמעט כל התמונה כבר בעיגול ואין לאן לגרור — לכן הסרגל קודם */}
      <p className="text-[11px] text-slate-500">מגדילים עם הסרגל, ואז גוררים את הפנים לאמצע</p>
    </div>
  );
}
