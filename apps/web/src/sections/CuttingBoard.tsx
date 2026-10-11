import { useEffect, useMemo, useRef } from "preact/hooks";
import {
  BOARD,
  BOARD_TOP,
  FRUITS,
  INK,
  KNIFE_STRIP,
  SCENE,
  fruitMarkup,
  type FruitId,
} from "../art/fruit.ts";

const SLOTS: readonly { x: number; fruit: FruitId }[] = [
  { x: 150, fruit: "tomato" },
  { x: 300, fruit: "lemon" },
  { x: 450, fruit: "apple" },
];

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The middle fruit already cut in two, flat sides down: the still life for reduced motion. */
function stillLife(): string {
  const half = (x: number) =>
    `<g transform="translate(${x} ${BOARD_TOP - 1})"><g clip-path="url(#still-half)">${FRUITS.lemon.face}</g></g>`;
  return `
    <defs>
      <clipPath id="still-half"><rect x="-300" y="-300" width="600" height="300"/></clipPath>
    </defs>
    ${fruitMarkup("tomato", 150, BOARD_TOP - FRUITS.tomato.bottom)}
    ${half(272)}${half(334)}
    ${fruitMarkup("apple", 455, BOARD_TOP - FRUITS.apple.bottom)}`;
}

/**
 * The hero's cutting board. It renders as static art (so it paints with the
 * page), then the slicing toy attaches when the browser is idle. Decorative
 * only: hidden from assistive tech, never in the tab order, and left as a
 * still life when the visitor prefers reduced motion.
 */
export function CuttingBoard() {
  const svgRef = useRef<SVGSVGElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const fruit = useMemo(
    () =>
      reduced
        ? stillLife()
        : SLOTS.map((s) => fruitMarkup(s.fruit, s.x, BOARD_TOP - FRUITS[s.fruit].bottom)).join(""),
    [reduced],
  );

  useEffect(() => {
    if (reduced) return;
    let destroy: (() => void) | undefined;
    let cancelled = false;
    const start = () =>
      import("../toy/slice-board.ts").then(({ mountSliceBoard }) => {
        if (cancelled || !svgRef.current) return;
        destroy = mountSliceBoard(svgRef.current, {
          slots: SLOTS,
          onSlice: () => hintRef.current?.classList.add("is-done"),
        });
      });
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(start, { timeout: 1500 })
        : window.setTimeout(start, 400);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      clearTimeout(idle);
      destroy?.();
    };
  }, [reduced]);

  return (
    <div class="board-card">
      <svg
        ref={svgRef}
        class="slice-board"
        viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
        aria-hidden="true"
        focusable="false"
      >
        <g class="sb-wall" dangerouslySetInnerHTML={{ __html: KNIFE_STRIP }} />
        <g class="sb-board" dangerouslySetInnerHTML={{ __html: BOARD }} />
        <g class="sb-fruit" dangerouslySetInnerHTML={{ __html: fruit }} />
      </svg>
      {!reduced && (
        <p class="board-hint" ref={hintRef} aria-hidden="true">
          <svg viewBox="0 0 64 28" class="board-hint-arrow">
            <path
              d="M3 22 C 18 6, 38 4, 58 12"
              fill="none"
              stroke={INK}
              stroke-width="2.2"
              stroke-linecap="round"
            />
            <path
              d="M50 6 L59 12 L50 17"
              fill="none"
              stroke={INK}
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Swipe to test the edge
        </p>
      )}
    </div>
  );
}
