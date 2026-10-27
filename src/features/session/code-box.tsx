import { useId, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const CODE_CLASSES = 'min-h-24 font-mono text-xs break-all';

interface CodeBoxProps {
  label: string;
  code: string;
  testId: string;
  /** The code is already on the clipboard (copied automatically). */
  initiallyCopied?: boolean;
  /** Make the copy button stand out, e.g. when automatic copying did not work. */
  emphasizeCopy?: boolean;
}

type CopyState = 'idle' | 'copied' | 'failed';

/** A read-only code with a copy button. */
export function CodeBox({
  label,
  code,
  testId,
  initiallyCopied = false,
  emphasizeCopy = false,
}: CodeBoxProps) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [copyState, setCopyState] = useState<CopyState>(initiallyCopied ? 'copied' : 'idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
    } catch {
      textarea.current?.select();
      setCopyState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        ref={textarea}
        readOnly
        spellCheck={false}
        value={code}
        className={CODE_CLASSES}
        data-testid={testId}
      />
      <Button
        type="button"
        variant={emphasizeCopy && copyState !== 'copied' ? 'default' : 'secondary'}
        size="sm"
        className="self-start"
        onClick={() => void copy()}
        data-testid={`${testId}-copy`}
      >
        {copyState === 'copied' ? <Check /> : <Copy />}
        {copyState === 'copied' && 'Copied'}
        {copyState === 'failed' && 'Select and copy manually'}
        {copyState === 'idle' && 'Copy'}
      </Button>
    </div>
  );
}

interface CodeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  disabled?: boolean;
}

/** An input for pasting a code. */
export function CodeInput({ label, value, onChange, testId, disabled }: CodeInputProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={CODE_CLASSES}
        data-testid={testId}
      />
    </div>
  );
}
