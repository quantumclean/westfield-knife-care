# Launch film storyboard

23 seconds, 30 fps. Two formats from one composition: **16:9** (1920×1080)
for desktop and **1:1** (1080×1080) for phones, where most flyer scans
land. Every harmony change and sound effect is placed from `cues.json`, so hits
land on cuts by construction.

## Direction

Stripped down, in the site's "Workshop paper" look: a paper stage, ink type, one soft pool of light, one object, one or two
words. The product is the contrast between the first two beats; the next
two are the service; then the name. No explanatory copy, no feature list,
no brochure. Illustration rather than stock photography, so every frame is
on-brand and nothing is generic.

## Rules the film follows

- **Same for every visitor.** The homepage A/B tests price and offer copy
  (`packages/shared/src/experiments.ts`). The film shows no price, no
  headline and no turnaround time, so both arms see the same thing. (An
  earlier version promised "Back tomorrow." / "Back within 48 hours." per
  arm; those are the speed claims the owner ruled out on 2026-10-09.)
- **Only true claims.** Pickup at the door and return to the doorstep, as `HOW_IT_WORKS` says.
  No testimonials, ratings or statistics; there aren't any yet.
- **Readable on a phone.** At most two short lines on screen, very large.

## Shots

| Time        | Beat            | Picture                                                                                                                                                                              | Sound                                             |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 0–4.35s     | **Dull.**       | Gray, slightly soft "Dull." rises letter by letter. A dull, notched knife lands on a tomato and drags twice; the tomato squashes and leaks. Muted colors.                            | Low detuned drone, muffled piano, thud, wet drags |
| 4.35–4.5s   | (blank)         | Hard cut to bare paper.                                                                                                                                                              | Silence                                           |
| 4.5–8.75s   | **Sharp.**      | "Sharp." snaps up, a glint crosses the word and a light streak draws under it. The knife glints, falls through the tomato in one stroke, and five clean slices fan across the board. | Hit + clean piano chord, ting, slice, five taps   |
| 8.75–13.3s  | **Picked up …** | A front door at night, lamp on; a canvas bag of knives on the mat is lifted and carried out of frame.                                                                                | Warm pad, sparse piano, cloth lift                |
| 13.3–17.95s | **Back …**      | Morning light comes up on the same door; the bag swings back onto the mat and three sparks flash off the handles.                                                                    | Birds, whoosh, soft landing, sparkle              |
| 18–23s      | logo + CTA      | Logo tile with a sheen, "Westfield Knife Care", "Sharpen My Knives" and sharp.usabiology.com. Fades to black to loop.                                                                | Resolved chord, bloom, shimmer                    |
