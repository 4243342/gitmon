import { QUALITIES, highestQualityKey } from './cardQuality.js'
import { cardFoil } from './cardTraits.js'
import mimo from './assets/pack-avatars/mimo.webp'
import deepseek from './assets/pack-avatars/deepseek.webp'
import grok from './assets/pack-avatars/grok.webp'
import gemini from './assets/pack-avatars/gemini.webp'
import gpt from './assets/pack-avatars/gpt.webp'
import claudeCode from './assets/pack-avatars/claude-code.webp'

// A single print specification feeds the box, flat wrappers and tearable pack.
// Artwork attribution and source references live in docs/PACK-ART.md.
const appearances = {
  N: { art: mimo, color: '#df7439', accent: '#fff0d6', ink: '#fff9ef', finish: 'matte', mark: '○' },
  R: { art: deepseek, color: '#24457e', accent: '#a5ddff', ink: '#edf8ff', finish: 'satin', mark: '◇' },
  SR: { art: grok, color: '#332436', accent: '#e0bc79', ink: '#fff0d5', finish: 'holo', mark: '✧' },
  UR: { art: gemini, color: '#5d4c9e', accent: '#ffda87', ink: '#fff4da', finish: 'gold', mark: '✦' },
  SE: { art: gpt, color: '#70819a', accent: '#e4f7ff', ink: '#f5fcff', finish: 'silver', mark: '❖' },
  PSE: { art: claudeCode, color: '#9f4c39', accent: '#ffd6ad', ink: '#fff4e6', finish: 'prismatic', mark: '✺' },
}

export const PACK_DESIGNS = Object.freeze(Object.fromEntries(Object.entries(appearances).map(([key, appearance]) => [
  key, Object.freeze({ ...QUALITIES[key], ...appearance }),
])))

export function packDesign(pets = []) {
  const foils = pets.map(cardFoil)
  const confirmed = foils.filter((foil) => foil.key !== 'pending')
  const key = highestQualityKey(confirmed.map((foil) => foil.key))
  return {
    ...PACK_DESIGNS[key],
    pending: confirmed.length < foils.length,
    unrated: foils.length > 0 && confirmed.length === 0,
  }
}

export function packCss(design) {
  return {
    '--hp-pack': design.color,
    '--hp-accent': design.accent,
    '--hp-ink': design.ink,
    '--q-color': QUALITIES[design.key].color,
    '--q-glow': QUALITIES[design.key].glow,
  }
}
