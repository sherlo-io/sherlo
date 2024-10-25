const DATA = {
  topLights: require("../../../../assets/Images/TopLights.png"),
  airPurifier: require("../../../../assets/Images/AirPurifier.png"),
  vacuumCleaner: require("../../../../assets/Images/VacuumCleaner.png"),
  bedsideLamp: require("../../../../assets/Images/BedsideLamp.png"),
  speaker: require("../../../../assets/Images/Speaker.png"),
  heating: require("../../../../assets/Images/Heating.png"),
  livingRoom: require("../../../../assets/Images/LivingRoom.png"),
  bedroom: require("../../../../assets/Images/Bedroom.png"),
  office: require("../../../../assets/Images/Office.png"),
  bathroom: require("../../../../assets/Images/Bathroom.png"),
};

export type ImageKeys = keyof typeof DATA;

export const getImageSource = (imageKey: ImageKeys) => {
  return DATA[imageKey];
};
