import {
  RoomsAirPurifierItemProps,
  RoomsHeatingItemProps,
} from "../components/partials/DeviceControl/components/RoomsTabs";

export const ROOMS_HEATING_DATA: RoomsHeatingItemProps[] = [
  {
    id: 0,
    roomName: "Living room",
    airHumidity: 50,
    actualTemperature: 22,
    setTemperature: 22,
  },
  {
    id: 1,
    roomName: "Kitchen",
    airHumidity: 20,
    actualTemperature: 28,
    setTemperature: 22,
  },
  {
    id: 2,
    roomName: "Office",
    airHumidity: 40,
    actualTemperature: 24,
    setTemperature: 22,
  },
  {
    id: 3,
    roomName: "Bedroom",
    airHumidity: 60,
    actualTemperature: 18,
    setTemperature: 16,
  },

  {
    id: 4,
    roomName: "Bathroom",
    airHumidity: 80,
    actualTemperature: 16,
    setTemperature: 22,
  },
];
export const ROOMS_AIR_PURIFIER_DATA: RoomsAirPurifierItemProps[] = [
  {
    id: 0,
    roomName: "Living room",
    airQuality: 74,
    pm: 9,
    dust: 16,
  },
  {
    id: 1,
    roomName: "Kitchen",
    airQuality: 27,
    pm: 4,
    dust: 3,
  },
  {
    id: 2,
    roomName: "Office",
    airQuality: 61,
    pm: 7,
    dust: 9,
  },
];
