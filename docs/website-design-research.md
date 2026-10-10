# Westfield website design research

Reviewed October 10, 2026. This is a design recommendation for the existing
Preact site, informed by current references and the owner's brief: bright colour,
medium oak, Scandinavian simplicity, and a comfortable home kitchen.

## References and decisions

| Reference                                                                                        | Relevant observation                                                                                                    | Application to Westfield                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Webflow: web design trends for 2026](https://webflow.com/blog/web-design-trends-2026)           | Distinct visual systems, concise copy, scannable overviews, and coordinated colour feature in its current trend review. | Keep the kitchen image, editorial headings, and oak frames. Use a small shared palette throughout the page. Bring the offer price into the introduction and shorten the copy.          |
| [HAY: embracing colour](https://www.hay.com/news/hay-in-the-world-2022/embracing-colour)         | The Danish brand describes colour as a core part of its design approach.                                                | Combine butter yellow, coral, sky blue, and leafy green with oak and deep green text. This is a Scandinavian reference, not a current UI trend report.                                 |
| [Material](https://materialkitchen.com/)                                                         | Its homepage pairs kitchen products and imagery with short descriptions and editorial content.                          | Let the home kitchen image establish the mood, while keeping the service and next action easy to find.                                                                                 |
| [Great Jones](https://greatjonesgoods.com/)                                                      | Its cookware presentation uses playful colour names and clear product prices.                                           | Give everyday cooking a friendly personality and show the actual experiment price, without adding unsupported service claims.                                                          |
| [W3C: target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | WCAG 2.2 AA specifies 24-by-24 CSS pixel targets, with defined exceptions.                                              | Use a more generous 44px minimum height for key navigation links and controls. Add a skip link and keep section links visible on mobile. This is not a claim of full WCAG conformance. |
| [web.dev: video performance](https://web.dev/learn/performance/video-performance)                | A poster with `preload="none"` can avoid downloading the video by default.                                              | Keep the supplied 22-second film click-to-play, with native controls, a poster, and a readable visual description.                                                                     |

## Implemented refinement

- One visually prominent booking action in the introduction, with the pilot as a
  quieter text action. Existing experiment CTA labels and tracking are retained.
- Experiment-driven bundle price and knife count above the booking action. The
  shared price definitions remain unchanged: `/a` is $39 for four knives and `/b`
  is $49 for five.
- A direct link from the introduction to the process film.
- Brighter shared colour tokens, balanced headings, and a larger share of the
  desktop introduction allocated to the kitchen image.
- Mobile section navigation, a keyboard skip link, visible focus treatments,
  and anchor spacing for the sticky header.

The selections above are design judgments, not measured conversion improvements.
No new framework, animation dependency, remote font, tracking service, or backend
change is needed. Publishing and production configuration remain outside this
work.

## Validation

Run workspace lint, typecheck, tests, and build. Use local browser checks for both
experiment routes at desktop and narrow mobile widths: verify the displayed
prices, keyboard navigation, section links, booking and pilot dialogs, horizontal
overflow, reduced-motion behavior, and video playback without an initial video
download. These checks are bounded and do not exercise live customer endpoints.

## Blend with booking UX v2 (PR #26)

PR #26 ("Workshop paper" redesign and two-step booking) and this refresh
were built in parallel. The owner chose to blend them:

- **From this refresh:** the butter, coral, sky and leaf palette with oak
  frames and offset oak edges; the section colour rhythm (butter hero, sky
  How it works, oak pricing, cream FAQ, green footer); the headline "Good
  food starts with a sharp knife." and the warmer introduction; the "Chop
  chop. Let's cook!" badge; the kitchen photo (now in the pricing section,
  lazy-loaded); section links kept visible on phones; the skip link to
  `#main-content`; the film layout with a readable description.
- **From PR #26:** the two-step booking sheet with a pinned total, the
  thank-you booking pass and calendar file, the draft kept across a
  cancelled checkout, the price ticket and next-pickup stamp in the hero,
  the inked fruit-slicing board, Instrument Serif headings, stamps and
  tickets, a designed dark mode, and lazy-loaded forms.
- **Film replaced.** The supplied process film ended on "Never cook with a
  dull knife again.", offer-001's headline, for every visitor, so arm B
  visitors saw arm A's pitch. It was replaced by the claim-safe launch film
  (`marketing/launch-video`, v3: no headline, no timing promise, the same
  for both arms) in the same layout.
- **Contrast:** the pricing background uses a lighter oak (`#f0dabd`) than
  the refresh's `#e5c29b`, which put muted text below 4.5:1.
