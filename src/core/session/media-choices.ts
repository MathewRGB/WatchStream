import {
  changeCustomQuality,
  customFromPreset,
  DEFAULT_QUALITY,
  resolveLimits,
  type CustomQuality,
  type MediaLimits,
  type QualityChoice,
} from '../media/quality';
import { DEFAULT_WEAK_LINK, type WeakLinkMode } from '../media/weak-link';
import { DEFAULT_CODEC, type CodecId } from '../peer/video-codecs';

/**
 * What the host chose for the picture that goes out: the quality, the codec and what the sender
 * gives up on a weak connection. Only the choices and what follows from them; telling the links
 * and the listeners is the session's job.
 */
export class MediaChoices {
  private currentQuality: QualityChoice = DEFAULT_QUALITY;
  private currentCustom: CustomQuality = customFromPreset(DEFAULT_QUALITY);
  /** Whether the host has set a custom value; until then `custom` starts from the step in use. */
  private customTouched = false;
  private currentCodec: CodecId = DEFAULT_CODEC;
  /** What `auto` comes to on this computer, once the browser has said; `auto` until then. */
  private autoCodec: CodecId = 'auto';
  private currentWeakLink: WeakLinkMode = DEFAULT_WEAK_LINK;

  /** What the host chose: a step, or `custom`. */
  get quality(): QualityChoice {
    return this.currentQuality;
  }

  /** The values of the custom choice; they count only while `quality` is `custom`. */
  get customQuality(): CustomQuality {
    return this.currentCustom;
  }

  /** What is sent: the limits the choice comes to. */
  get limits(): MediaLimits {
    return resolveLimits(this.currentQuality, this.currentCustom);
  }

  /** The video codec the host chose; it is offered first, with the others behind it. */
  get codec(): CodecId {
    return this.currentCodec;
  }

  /** The codec to offer first: the choice, or for `auto` what this computer encodes best. */
  get offeredCodec(): CodecId {
    return this.currentCodec === 'auto' ? this.autoCodec : this.currentCodec;
  }

  /** What the sender gives up when the connection to a viewer is too weak for the picture. */
  get weakLink(): WeakLinkMode {
    return this.currentWeakLink;
  }

  /**
   * Chooses a quality. Choosing `custom` for the first time starts from the step that was in use,
   * so fine-tuning begins where the host was.
   */
  setQuality(choice: QualityChoice): void {
    if (choice === 'custom' && !this.customTouched && this.currentQuality !== 'custom') {
      this.currentCustom = customFromPreset(this.currentQuality);
    }
    this.currentQuality = choice;
  }

  /**
   * Sets values of the custom choice and chooses it. Each value is put on the list it belongs to
   * (see `changeCustomQuality`).
   */
  setCustomQuality(changes: Partial<CustomQuality>): void {
    if (!this.customTouched && this.currentQuality !== 'custom') {
      this.currentCustom = customFromPreset(this.currentQuality);
    }
    this.customTouched = true;
    this.currentCustom = changeCustomQuality(this.currentCustom, changes);
    this.currentQuality = 'custom';
  }

  /** Returns whether the choice changed. */
  setCodec(id: CodecId): boolean {
    if (id === this.currentCodec) return false;
    this.currentCodec = id;
    return true;
  }

  /** Returns whether the choice changed. */
  setWeakLink(mode: WeakLinkMode): boolean {
    if (mode === this.currentWeakLink) return false;
    this.currentWeakLink = mode;
    return true;
  }

  /**
   * The browser said what `auto` comes to (`null` where it cannot say). Returns whether that is
   * new, so that the session offers the codec again.
   */
  noteAutoCodec(codec: 'h264' | 'vp9' | null): boolean {
    if (!codec || codec === this.autoCodec) return false;
    this.autoCodec = codec;
    return true;
  }
}
