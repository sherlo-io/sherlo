import type { Meta } from '@storybook/react';
import { StyleSheet, View } from 'react-native';

export default {
  component: View,
  parameters: {
    noSafeArea: true,
  },
} as Meta<typeof View>;

const storyOfColor = (hexColor: string) => ({
  args: {
    style: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: hexColor,
    },
  },
});

// Original colors
export const Red = storyOfColor('#FF0000');
export const Blue = storyOfColor('#0000FF');
export const Green = storyOfColor('#00FF00');
export const Yellow = storyOfColor('#FFFF00');
export const Purple = storyOfColor('#800080');
export const Orange = storyOfColor('#FFA500');
export const Pink = storyOfColor('#FFC0CB');
export const Brown = storyOfColor('#A52A2A');
export const Gray = storyOfColor('#808080');
export const Cyan = storyOfColor('#00FFFF');
export const Magenta = storyOfColor('#FF00FF');
export const Lime = storyOfColor('#32CD32');
export const Teal = storyOfColor('#008080');
export const Indigo = storyOfColor('#4B0082');
export const Violet = storyOfColor('#EE82EE');
export const Maroon = storyOfColor('#800000');
export const Navy = storyOfColor('#000080');
export const Olive = storyOfColor('#808000');
export const Turquoise = storyOfColor('#40E0D0');
export const Coral = storyOfColor('#FF7F50');
export const Crimson = storyOfColor('#DC143C');
export const Gold = storyOfColor('#FFD700');
export const Silver = storyOfColor('#C0C0C0');
export const Plum = storyOfColor('#DDA0DD');
export const Salmon = storyOfColor('#FA8072');
export const Sienna = storyOfColor('#A0522D');
export const Tan = storyOfColor('#D2B48C');
export const Thistle = storyOfColor('#D8BFD8');
export const Tomato = storyOfColor('#FF6347');
export const Wheat = storyOfColor('#F5DEB3');
export const Azure = storyOfColor('#F0FFFF');
export const Beige = storyOfColor('#F5F5DC');
export const Chocolate = storyOfColor('#D2691E');
export const Khaki = storyOfColor('#F0E68C');
export const Lavender = storyOfColor('#E6E6FA');
export const Orchid = storyOfColor('#DA70D6');
export const Peru = storyOfColor('#CD853F');
export const Ruby = storyOfColor('#E0115F');
export const Slate = storyOfColor('#708090');
export const Wine = storyOfColor('#722F37');
export const Mauve = storyOfColor('#E0B0FF');
export const Cerulean = storyOfColor('#007BA7');
export const Vermilion = storyOfColor('#E34234');
export const Chartreuse = storyOfColor('#7FFF00');
export const Fuchsia = storyOfColor('#FF00FF');
export const Periwinkle = storyOfColor('#CCCCFF');
export const Burgundy = storyOfColor('#800020');
export const Aquamarine = storyOfColor('#7FFFD4');
export const Scarlet = storyOfColor('#FF2400');
export const Sage = storyOfColor('#BCB88A');
export const Cobalt = storyOfColor('#0047AB');
export const Ivory = storyOfColor('#FFFFF0');
export const Mustard = storyOfColor('#FFDB58');
export const Rust = storyOfColor('#B7410E');
export const Emerald = storyOfColor('#50C878');
export const Taupe = storyOfColor('#483C32');
export const Amber = storyOfColor('#FFBF00');
export const Byzantium = storyOfColor('#702963');
export const Celadon = storyOfColor('#ACE1AF');
export const Sepia = storyOfColor('#704214');
export const Carmine = storyOfColor('#960018');
export const Malachite = storyOfColor('#0BDA51');
export const Puce = storyOfColor('#CC8899');
export const Gamboge = storyOfColor('#E49B0F');
export const Alabaster = storyOfColor('#EDEAE0');
export const Jasmine = storyOfColor('#F8DE7E');
export const Ebony = storyOfColor('#555D50');
export const Amethyst = storyOfColor('#9966CC');
export const Jade = storyOfColor('#00A86B');
export const Ochre = storyOfColor('#CC7722');
export const Zaffre = storyOfColor('#0014A8');
export const Verdigris = storyOfColor('#43B3AE');
export const Cinnabar = storyOfColor('#E34234');
export const Viridian = storyOfColor('#40826D');
export const Amaranth = storyOfColor('#E52B50');
export const Ultramarine = storyOfColor('#120A8F');
export const Saffron = storyOfColor('#F4C430');
export const Wenge = storyOfColor('#645452');
export const Xanadu = storyOfColor('#738678');
export const Razzmatazz = storyOfColor('#E3256B');
export const Feldgrau = storyOfColor('#4D5D53');
export const Glaucous = storyOfColor('#6082B6');
export const Mikado = storyOfColor('#FFC40C');
