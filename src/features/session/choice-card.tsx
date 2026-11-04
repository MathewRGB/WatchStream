import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ChoiceCardProps {
  /** The radio group's name; the radio's test id is `<name>-<value>`. */
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
  badge?: string;
}

/** One choice among several, as a bordered card with a radio button. */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  label,
  description,
  badge,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 has-[:focus-visible]:ring-2',
        checked && 'border-primary bg-primary/5',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1"
        data-testid={`${name}-${value}`}
      />
      <span className="flex flex-col">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

interface OptionGroupProps<Id extends string> {
  /** Names the group: the radios' `name`, and `<name>-options` as the fieldset's test id. */
  name: string;
  /** Read by screen readers only; the settings section already shows the title. */
  legend: string;
  /** What the choice is about, above the cards. */
  intro: string;
  options: readonly { id: Id; label: string; description: string }[];
  value: Id;
  onChange: (id: Id) => void;
}

/** A fieldset of `ChoiceCard`s for a choice among a few named options. */
export function OptionGroup<Id extends string>({
  name,
  legend,
  intro,
  options,
  value,
  onChange,
}: OptionGroupProps<Id>) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid={`${name}-options`}>
      <legend className="sr-only">{legend}</legend>
      <p className="text-xs text-muted-foreground">{intro}</p>
      {options.map((option) => (
        <ChoiceCard
          key={option.id}
          name={name}
          value={option.id}
          checked={option.id === value}
          onSelect={() => onChange(option.id)}
          label={option.label}
          description={option.description}
        />
      ))}
    </fieldset>
  );
}
