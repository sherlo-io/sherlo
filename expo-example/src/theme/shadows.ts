import { colors } from "./colors";

const black = {
  shadowColor: colors.shadow,
  shadowOffset: {
    width: 0,
    height: 8,
  },
  shadowOpacity: 0.35,
  shadowRadius: 13.5,
};
const white = {
  shadowColor: colors.shadowWhite,
  shadowOffset: {
    width: 0,
    height: -9,
  },
  shadowOpacity: 0.05,
  shadowRadius: 15.2,
};

export const shadows = { black, white };
