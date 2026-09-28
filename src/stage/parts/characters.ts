/**
 * The six gallery visitors, read off the original film (33/38/44/47/52 s; `.superpowers/img2threejs`).
 * Generic people in the same kind of outfit, pose and hair — not likenesses of the people in the film.
 */
export type CharacterId = 'ponytail' | 'dress' | 'blazer' | 'whitetop' | 'tshirt' | 'passer';

export const CHARACTER_IDS: readonly CharacterId[] = ['ponytail', 'dress', 'blazer', 'whitetop', 'tshirt', 'passer'];

export type Pose = 'crossed' | 'down' | 'handToFace';
export type HairStyle = 'ponytail' | 'bun' | 'short' | 'shoulder' | 'long';
export type Top = 'shirt' | 'dress' | 'blazer' | 'fitted';

export interface Character {
  name: string;
  /** Standing height in metres, crown to floor (a bun adds a little). */
  height: number;
  build: 'male' | 'female';
  pose: Pose;
  hair: HairStyle;
  top: Top;
  /** Skinny jeans (narrower legs). */
  skinny?: boolean;
  heels?: boolean;
  bareLegs?: boolean;
  colors: { skin: number; top: number; bottom: number; shoes: number; hair: number; belt?: number };
}

export const CHARACTERS: Record<CharacterId, Character> = {
  // A: loose white long-sleeve shirt over a dark belt, light grey jeans, low ponytail, arms crossed (33 s).
  ponytail: {
    name: '白襯衫馬尾男', height: 1.82, build: 'male', pose: 'crossed', hair: 'ponytail', top: 'shirt',
    colors: { skin: 0xc4a38c, top: 0xe6e5e1, bottom: 0x8d95a2, shoes: 0x2a2826, hair: 0x2b231e, belt: 0x2a2320 },
  },
  // B: pale grey-lavender knee-length dress with a gathered waist, high bun, bare calves, brown heels (38 s).
  dress: {
    name: '灰紫洋裝女', height: 1.66, build: 'female', pose: 'down', hair: 'bun', top: 'dress', heels: true, bareLegs: true,
    colors: { skin: 0xd0b09b, top: 0xa4a4b8, bottom: 0xa4a4b8, shoes: 0x6b4a36, hair: 0x4a3627, belt: 0x8f8fa3 },
  },
  // C: grey blazer to the upper thigh, mid-blue jeans, short brown hair, arms folded (44 s).
  blazer: {
    name: '灰西裝外套男', height: 1.8, build: 'male', pose: 'crossed', hair: 'short', top: 'blazer',
    colors: { skin: 0xc4a38c, top: 0x8a8a88, bottom: 0x6c798e, shoes: 0x2a2826, hair: 0x4a3627 },
  },
  // D: fitted off-white long-sleeve top, light-blue skinny jeans, shoulder-length hair, dark red shoes (44–52 s).
  whitetop: {
    name: '白上衣淺藍牛仔褲女', height: 1.64, build: 'female', pose: 'handToFace', hair: 'shoulder', top: 'fitted', skinny: true,
    colors: { skin: 0xd0b09b, top: 0xd4d2ce, bottom: 0x9aa8bb, shoes: 0x5a1f1f, hair: 0x5a4030 },
  },
  // E: dark grey long-sleeve top, light grey jeans, short dark hair, arms at the sides (52 s).
  tshirt: {
    name: '深灰長袖男', height: 1.78, build: 'male', pose: 'down', hair: 'short', top: 'fitted',
    colors: { skin: 0xc4a38c, top: 0x4a4b50, bottom: 0x9ea2a8, shoes: 0x2a2826, hair: 0x231c18 },
  },
  // F: long dark hair, dark top — passes right in front of the lens, out of focus (47 s).
  passer: {
    name: '長黑髮女（貼近鏡頭）', height: 1.68, build: 'female', pose: 'down', hair: 'long', top: 'fitted',
    colors: { skin: 0xd0b09b, top: 0x2c2c30, bottom: 0x4f5a6b, shoes: 0x1c1c1c, hair: 0x17120f },
  },
};
