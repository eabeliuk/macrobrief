import type { Story } from "@/lib/domain/brief";

/** The brief's sections, as rendered in the app and on a shared page. */
export function BriefBody({ sections }: { sections: { id: string; heading: string; stories: unknown }[] }) {
  return (
    <>
      {sections.map((section) => {
        const stories = section.stories as Story[];
        return (
          <section key={section.id}>
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {!stories.length ? <p className="mt-2 text-sm text-ink-3">Nothing new this period.</p> : null}
            <ul className="mt-3 space-y-4">
              {stories.map((story) => (
                <li key={story.link}>
                  <a href={story.link} target="_blank" rel="noreferrer" className="font-medium hover:underline">{story.headline}</a>
                  {story.publisher ? <span className="text-sm text-ink-3"> — {story.publisher}</span> : null}
                  <p className="mt-1 text-sm text-ink-2">{story.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
