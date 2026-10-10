import { HOW_IT_WORKS } from "@wkc/shared";
import { Section, Steps } from "@wkc/ui";

export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="From your kitchen. Back to your kitchen."
      subtitle="Three simple steps. A local helping hand."
    >
      <Steps steps={HOW_IT_WORKS} />
      <div class="process-film" id="process-film">
        <div class="process-film-copy">
          <p class="eyebrow">Watch the story · 22 seconds</p>
          <h3 id="process-film-title">Less struggle. More chopping.</h3>
          <p>
            See the difference a sharp edge makes, and how your knives go from your door to
            sharpening and back home again.
          </p>
          <p class="muted process-film-note">Press play for a little kitchen inspiration.</p>
          <details class="process-description">
            <summary>Read the video description</summary>
            <p>
              An animated dull knife struggles to cut a tomato. A sharp knife slices it in one clean
              motion. A bag of knives is picked up at a front door, an edge is sharpened, and the
              bag returns home. The closing screen invites you to book with Westfield Knife Care.
            </p>
          </details>
        </div>
        <figure class="process-film-frame">
          <video
            controls
            playsInline
            preload="none"
            width="960"
            height="540"
            poster="/images/process-poster.webp"
            aria-labelledby="process-film-title"
            aria-describedby="process-film-caption"
          >
            <source src="/videos/knife-care-process.mp4" type="video/mp4" />
            Your browser cannot play this video.{" "}
            <a href="/videos/knife-care-process.mp4">Watch the knife care film.</a>
          </video>
          <figcaption id="process-film-caption">
            A little care. A fresh start for dinner.
          </figcaption>
          <a class="process-film-link" href="/videos/knife-care-process.mp4">
            Open the video on its own
          </a>
        </figure>
      </div>
    </Section>
  );
}
