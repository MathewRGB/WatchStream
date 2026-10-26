import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_NAME_LENGTH } from '@/core/handshake/handshake-code';

interface StartViewProps {
  initialName: string;
  onHost: (name: string) => void;
  onJoin: (name: string) => void;
}

export function StartView({ initialName, onHost, onJoin }: StartViewProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const start = (action: (name: string) => void) => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Please enter a name the others will see.');
      return;
    }
    action(trimmed);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    start(onHost);
  };

  return (
    <Card data-testid="start-view">
      <CardHeader>
        <CardTitle className="text-2xl">WatchStream</CardTitle>
        <CardDescription>Watch together, browser to browser.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
              data-testid="name-input"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => start(onHost)} data-testid="host-button">
              Host a session
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => start(onJoin)}
              data-testid="join-button"
            >
              Join a session
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive" data-testid="start-status">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
