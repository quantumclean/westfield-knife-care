# Images

`og.jpg` (1200 x 630) is the social share card used by `og:image` in
`index.html`. It is rendered from the same inked art as the hero
(`src/art/fruit.ts`), so if the art or headline changes, re-render it at the
same size and keep it under about 100 KB.

The hero itself has no image file: the cutting board and fruit are inline
SVG drawn in code, so they are crisp at any size and cost no extra request.
