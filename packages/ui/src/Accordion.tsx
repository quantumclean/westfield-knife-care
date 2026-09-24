export interface AccordionItem {
  id: string;
  question: string;
  answer: string;
}

export interface AccordionProps {
  items: readonly AccordionItem[];
  onOpen?: (id: string) => void;
}

/** Native <details> accordion: accessible, no JS needed to read. */
export function Accordion({ items, onOpen }: AccordionProps) {
  return (
    <div class="accordion">
      {items.map((item) => (
        <details
          class="accordion-item"
          key={item.id}
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) onOpen?.(item.id);
          }}
        >
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
