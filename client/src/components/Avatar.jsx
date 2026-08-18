/**
 * RHEO — Animal Avatar Engine
 * Cute animal face stickers as user identity tokens with index-based network sync.
 */
import { useMemo } from 'react';

export const AVATAR_PRESETS = [
  { index: 0,  id: 'fox',     emoji: '🦊', name: 'Fox',     bg: 'from-orange-400 to-amber-500' },
  { index: 1,  id: 'panda',   emoji: '🐼', name: 'Panda',   bg: 'from-slate-700 to-slate-900' },
  { index: 2,  id: 'cat',     emoji: '🐱', name: 'Cat',     bg: 'from-amber-300 to-yellow-400' },
  { index: 3,  id: 'dog',     emoji: '🐶', name: 'Dog',     bg: 'from-amber-600 to-orange-700' },
  { index: 4,  id: 'rabbit',  emoji: '🐰', name: 'Rabbit',  bg: 'from-pink-300 to-rose-400' },
  { index: 5,  id: 'bear',    emoji: '🐻', name: 'Bear',    bg: 'from-amber-700 to-stone-700' },
  { index: 6,  id: 'koala',   emoji: '🐨', name: 'Koala',   bg: 'from-slate-400 to-stone-500' },
  { index: 7,  id: 'penguin', emoji: '🐧', name: 'Penguin', bg: 'from-slate-800 to-teal-900' },
  { index: 8,  id: 'frog',    emoji: '🐸', name: 'Frog',    bg: 'from-green-400 to-emerald-600' },
  { index: 9,  id: 'hamster', emoji: '🐹', name: 'Hamster', bg: 'from-pink-400 to-amber-400' },
  { index: 10, id: 'wolf',    emoji: '🐺', name: 'Wolf',    bg: 'from-slate-500 to-indigo-700' },
  { index: 11, id: 'duck',    emoji: '🦆', name: 'Duck',    bg: 'from-yellow-400 to-amber-500' },
  { index: 12, id: 'pig',     emoji: '🐷', name: 'Pig',     bg: 'from-pink-400 to-rose-500' },
  { index: 13, id: 'tiger',   emoji: '🐯', name: 'Tiger',   bg: 'from-orange-500 to-amber-700' },
  { index: 14, id: 'lion',    emoji: '🦁', name: 'Lion',    bg: 'from-yellow-500 to-orange-600' },
  { index: 15, id: 'monkey',  emoji: '🐵', name: 'Monkey',  bg: 'from-amber-500 to-orange-800' },
];

const SIZES = {
  xs:    { box: 'w-6 h-6',     emoji: 'text-base' },
  sm:    { box: 'w-8 h-8',     emoji: 'text-xl' },
  md:    { box: 'w-10 h-10',   emoji: 'text-2xl' },
  lg:    { box: 'w-12 h-12',   emoji: 'text-3xl' },
  xl:    { box: 'w-16 h-16',   emoji: 'text-4xl' },
  '2xl': { box: 'w-20 h-20',   emoji: 'text-5xl' },
};

/**
 * Get a deterministic avatar by preset ID, integer index, or username string hash.
 */
export function getDefaultAvatar(nameOrIndex = '') {
  if (typeof nameOrIndex === 'number') {
    return AVATAR_PRESETS[Math.abs(nameOrIndex) % AVATAR_PRESETS.length].id;
  }
  const byId = AVATAR_PRESETS.find(p => p.id === nameOrIndex);
  if (byId) return byId.id;

  const str = String(nameOrIndex || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return AVATAR_PRESETS[hash % AVATAR_PRESETS.length].id;
}

export default function Avatar({
  avatarId,
  name = 'User',
  size = 'md',
  showRing = false,
  className = '',
}) {
  const preset = useMemo(() => {
    if (typeof avatarId === 'number') {
      return AVATAR_PRESETS[Math.abs(avatarId) % AVATAR_PRESETS.length];
    }
    const id = avatarId || getDefaultAvatar(name);
    return AVATAR_PRESETS.find(p => p.id === id) || AVATAR_PRESETS[0];
  }, [avatarId, name]);

  const { box, emoji } = SIZES[size] || SIZES.md;

  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-gradient-to-br ${preset.bg} shadow-sm select-none flex-shrink-0 ${box} ${
        showRing ? 'ring-2 ring-teal-500/50 ring-offset-2 ring-offset-white' : ''
      } ${className}`}
      title={preset.name}
    >
      <span className={`leading-none ${emoji}`} role="img" aria-label={preset.name}>
        {preset.emoji}
      </span>
    </div>
  );
}
