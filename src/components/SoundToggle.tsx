/**
 * SoundToggle Component
 *
 * Simple mute/unmute toggle button for sound effects.
 */

import { SoundOnIcon, SoundOffIcon } from './icons';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function SoundToggle({ enabled, onToggle }: SoundToggleProps) {
  return (
    <button
      className="sound-toggle"
      onClick={() => onToggle(!enabled)}
      title={enabled ? 'Mute sounds' : 'Unmute sounds'}
      aria-label={enabled ? 'Mute sounds' : 'Unmute sounds'}
    >
      {enabled ? <SoundOnIcon size={24} /> : <SoundOffIcon size={24} />}
    </button>
  );
}

export default SoundToggle;
