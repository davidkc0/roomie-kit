# Hex Arena Sound Effects

This directory contains sound effects for the Hex Arena game.

## Required Files

Place the following audio files (MP3 format) in this directory:

- **Pop1.mp3** - Hex tile pop sound (variant 1)
- **Pop2.mp3** - Hex tile pop sound (variant 2)
- **Pop3.mp3** - Hex tile pop sound (variant 3)
- **Pop4.mp3** - Hex tile pop sound (variant 4)
- **Pop5.mp3** - Hex tile pop sound (variant 5)
- **Dead.mp3** - Player elimination/death sound
- **Kids Cheering.mp3** - Victory celebration sound
- **bg.mp3** - Background music (looping)

## Sources

You can:
1. Copy from the reference game: `references/wawa-guys-final/public/audios/`
2. Create your own sounds
3. Use royalty-free sound effects from sites like:
   - freesound.org
   - zapsplat.com
   - mixkit.co

## Usage

These sounds are loaded by the `useHexAudioManager` hook and played at:
- **Pop sounds**: When hexagons are stepped on (random variant)
- **Dead sound**: When player falls off the arena
- **Kids Cheering**: When a player wins
- **Background music**: Loops during gameplay
