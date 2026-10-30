import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TabSoundControls } from '@/hooks/use-tab-sound';

/**
 * Firefox only: the sound of a tab's video, which the browser's own sharing leaves out. The title
 * is the settings section's.
 */
export function TabSoundSection({ sound }: { sound: TabSoundControls }) {
  return (
    <div className="flex flex-col gap-3" data-testid="tab-sound">
      <p className="text-sm text-muted-foreground">
        Firefox shares the picture of a tab, but not its sound. WatchStream normally finds the tab
        that is playing when you start sharing. If that did not work, choose the tab with the video
        here and WatchStream takes the sound from it and adds it to what you share. You still hear
        it yourself. It works with players on web pages, not with protected streams, and the sound
        can be a fraction of a second behind the picture.
      </p>
      {sound.activeTitle ? (
        <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span className="flex min-w-0 items-center gap-2" data-testid="tab-sound-active">
            <Volume2 className="size-4 shrink-0" />
            <span className="truncate">{sound.activeTitle}</span>
          </span>
          <Button variant="outline" size="sm" onClick={sound.stop} data-testid="tab-sound-stop">
            <VolumeX /> Stop
          </Button>
        </div>
      ) : sound.choices ? (
        <div className="flex flex-col gap-2" data-testid="tab-sound-choices">
          {sound.choices.length === 0 && (
            <p className="text-sm text-muted-foreground">No web page is open in this browser.</p>
          )}
          {sound.choices.map((tab) => (
            <Button
              key={tab.id}
              variant="outline"
              className="h-auto justify-start gap-2 py-2 text-left"
              disabled={sound.starting}
              onClick={() => void sound.choose(tab)}
              data-testid="tab-sound-choice"
            >
              {tab.audible && <Volume2 className="size-4 shrink-0" />}
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{tab.title}</span>
                <span className="truncate text-xs text-muted-foreground">{tab.origin}</span>
              </span>
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={sound.closeChooser}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => void sound.openChooser()}
          data-testid="tab-sound-open"
        >
          <Volume2 /> Choose a tab
        </Button>
      )}
      {sound.error && (
        <p className="text-sm text-destructive" role="alert" data-testid="tab-sound-error">
          {sound.error}
        </p>
      )}
    </div>
  );
}
